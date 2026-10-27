import type { Database } from "bun:sqlite";
import { readdirSync } from "node:fs";
import { request } from "node:http";
import type { Socket } from "node:net";
import type { PolicyConfig } from "./policy.ts";
import {
	type DomainPreflightInput,
	dockerJson,
	preflightDomain,
	preflightDomainBackend,
} from "./runner.ts";
import {
	encodeRunnerCommand,
	type RunnerFrame,
	RunnerOutput,
} from "./runner-protocol.ts";
import {
	admitDomain,
	type DomainLaunchInput,
	type DomainRecord,
	type EffectDecision,
	getDomain,
	listDomains,
	OFFLINE_DOMAIN_PROFILE as profile,
	recordDomainObservation,
	type WriteContext,
	writeGate,
} from "./store.ts";

export type SyntheticLaunchInput = Omit<DomainLaunchInput, "authority"> & {
	authority: { kind: "root" };
};
export interface SyntheticLaunchResult {
	decision: EffectDecision;
	domain: DomainRecord | null;
	candidate: Extract<RunnerFrame, { type: "candidate-proposed" }> | null;
	stopped: boolean;
	failure: string | null;
}

/** Explicit trusted-supervisor cleanup only; observed stop never clears reuse fences. */
export async function stopSyntheticDomain(
	db: Database,
	input: Pick<SyntheticLaunchInput, "domainId" | "authority">,
): Promise<Pick<SyntheticLaunchResult, "domain" | "stopped" | "failure">> {
	try {
		input = structuredClone(input);
	} catch {
		throw new LaunchError("input");
	}
	if (!input || typeof input !== "object" || Array.isArray(input))
		throw new LaunchError("input");
	if (
		!input.authority ||
		typeof input.authority !== "object" ||
		Array.isArray(input.authority) ||
		input.authority.kind !== "root"
	)
		throw new LaunchError("authority");
	if (
		Object.keys(input).length !== 2 ||
		!Object.hasOwn(input, "domainId") ||
		Object.keys(input.authority).length !== 1
	)
		throw new LaunchError("input");
	let domain;
	try {
		domain = getDomain(db, input.domainId);
		if (!domain) throw new Error();
	} catch {
		throw new LaunchError("inventory");
	}
	if (!domain.unresolved) throw new LaunchError("resolved");
	if (!domain.containerId)
		return {
			domain: recordUnqualified(db, domain.domainId, false),
			stopped: false,
			failure: "unbound",
		};
	let result: { stopped: boolean; failure: string | null };
	try {
		const checked = await preflightDomainBackend(domain.endpoint);
		const cleanup = await stopOwnedDomain(
			db,
			domain,
			domain.containerId,
			checked.imageId,
		);
		result = { stopped: cleanup.stopped, failure: cleanup.failure };
	} catch {
		result = { stopped: false, failure: "backend" };
	}
	return {
		domain: recordUnqualified(db, domain.domainId, result.stopped),
		...result,
	};
}

class LaunchError extends Error {
	readonly code: string;
	constructor(code: string) {
		super(`runner-launch:${code}`);
		this.code = code;
	}
}
function object(value: unknown, code: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new LaunchError(code);
	return value as Record<string, unknown>;
}
function equal(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function recordUnqualified(
	db: Database,
	domainId: string,
	stopped: boolean,
): DomainRecord {
	try {
		const recorded = recordDomainObservation(db, domainId, {
			kind: "unknown",
			evidenceRef: stopped
				? "trace:runner-stopped-unqualified"
				: "trace:runner-cleanup-unresolved",
		});
		if (!getDomain(db, domainId)) throw new LaunchError("inventory");
		return recorded;
	} catch {
		throw new LaunchError("inventory");
	}
}

async function stopOwnedDomain(
	db: Database,
	domain: DomainRecord,
	id: string,
	imageId: string,
): Promise<{
	stopped: boolean;
	failure: string | null;
	workerFailed: boolean;
}> {
	let stopped = false,
		failure: string | null = null,
		workerFailed = false;
	try {
		recordDomainObservation(db, domain.domainId, {
			kind: "stop-requested",
			evidenceRef: "trace:runner-owned-stop",
		});
	} catch {
		failure = "inventory";
	}
	try {
		const inspected = await dockerJson(
			domain.endpoint.slice(7),
			`/containers/${id}/json`,
			"engine",
		);
		assertDomainOwner(inspected, domain, id, imageId);
		if (object(inspected.State, "cleanup").Running !== false)
			await dockerJson(
				domain.endpoint.slice(7),
				`/containers/${id}/stop?t=2`,
				"engine",
				{ method: "POST", statuses: [204, 304] },
			);
		const final = await dockerJson(
			domain.endpoint.slice(7),
			`/containers/${id}/json`,
			"engine",
		);
		assertDomainOwner(final, domain, id, imageId);
		const state = object(final.State, "cleanup");
		stopped =
			state.Running === false && state.Restarting === false && state.Pid === 0;
		workerFailed = stopped && state.ExitCode !== 0;
		if (!stopped) failure = "cleanup";
	} catch {
		failure = "cleanup";
	}
	return { stopped, failure, workerFailed };
}

async function preflightSynthetic(input: DomainPreflightInput) {
	try {
		const checked = await preflightDomain(input);
		if (readdirSync(input.config.workspaceRoot).length)
			throw new LaunchError("preflight");
		return checked;
	} catch {
		throw new LaunchError("preflight");
	}
}

function live(db: Database, context: WriteContext, domain: DomainRecord): void {
	if (Date.now() >= domain.deadlineMs) throw new LaunchError("deadline");
	try {
		db.transaction(() =>
			writeGate(db, { ...context, nowMs: Date.now() }),
		).immediate();
	} catch {
		throw new LaunchError("interrupted");
	}
}

function attach(
	socketPath: string,
	id: string,
): Promise<{ socket: Socket; head: Buffer }> {
	return new Promise((resolve, reject) => {
		const req = request({
			socketPath,
			path: `/v1.56/containers/${id}/attach?stream=true&stdin=true&stdout=true&stderr=true`,
			method: "POST",
			headers: { Connection: "Upgrade", Upgrade: "tcp" },
		});
		const timer = setTimeout(() => {
			req.destroy();
			disconnected();
		}, profile.inspectTimeoutMs);
		const disconnected = () => {
			clearTimeout(timer);
			reject(new LaunchError("attach"));
		};
		req.once("upgrade", (response, socket, head) => {
			clearTimeout(timer);
			if (response.statusCode !== 101) {
				socket.destroy();
				disconnected();
				return;
			}
			socket.on("error", disconnected);
			socket.pause();
			resolve({ socket, head });
		});
		req.once("response", (response) => {
			response.destroy();
			disconnected();
		});
		req.once("error", disconnected);
		req.end();
	});
}

function supervise(
	db: Database,
	context: WriteContext,
	domain: DomainRecord,
	socket: Socket,
	head: Buffer,
	startedAt: number,
): Promise<{
	candidate: SyntheticLaunchResult["candidate"];
	failure: string | null;
}> {
	return new Promise((resolve) => {
		const parser = new RunnerOutput();
		let candidate: SyntheticLaunchResult["candidate"] = null;
		let finished = false;
		let stopTimer: ReturnType<typeof setTimeout> | undefined;
		const done = (failure: string | null) => {
			if (finished) return;
			finished = true;
			clearTimeout(readyTimer);
			clearTimeout(wallTimer);
			clearInterval(watch);
			clearTimeout(stopTimer);
			socket.destroy();
			resolve({ candidate: failure ? null : candidate, failure });
		};
		const readyTimer = setTimeout(
			() => done("ready"),
			Math.max(0, profile.readyTimeoutMs - (performance.now() - startedAt)),
		);
		const wallTimer = setTimeout(
			() => done("deadline"),
			Math.max(0, Math.min(profile.maxWallMs, domain.deadlineMs - Date.now())),
		);
		const watch = setInterval(() => {
			try {
				live(db, context, domain);
			} catch (error) {
				done(error instanceof LaunchError ? error.code : "interrupted");
			}
		}, 100);
		const data = (chunk: Buffer) => {
			if (finished) return;
			try {
				for (const frame of parser.push(chunk)) {
					if (frame.type === "ready") {
						clearTimeout(readyTimer);
						live(db, context, domain);
						socket.write(encodeRunnerCommand("start"));
					} else {
						candidate = frame;
						recordDomainObservation(db, domain.domainId, {
							kind: "stop-requested",
							evidenceRef: "trace:runner-cooperative-stop",
						});
						socket.write(encodeRunnerCommand("stop"));
						stopTimer = setTimeout(() => done("cleanup"), profile.stopGraceMs);
					}
				}
			} catch (error) {
				done(error instanceof LaunchError ? error.code : "protocol");
			}
		};
		socket.on("data", data);
		socket.once("end", () => {
			try {
				parser.finish();
				done(candidate ? null : "worker");
			} catch {
				done("protocol");
			}
		});
		const disconnected = () => done("backend");
		socket.once("error", disconnected);
		socket.once("close", disconnected);
		if (head.length) data(head);
		socket.resume();
	});
}

/** Trusted root synthetic profile only; stopped never implies independently proven quiescence. */
export async function runSyntheticDomain(
	db: Database,
	context: WriteContext,
	input: SyntheticLaunchInput,
	workspace: Pick<DomainPreflightInput, "workspaceMount" | "workspaceImage">,
	policy: PolicyConfig,
): Promise<SyntheticLaunchResult> {
	try {
		context = structuredClone(context);
		input = structuredClone(input);
		workspace = structuredClone(workspace);
		policy = structuredClone(policy);
	} catch {
		throw new LaunchError("input");
	}
	if (input?.authority?.kind !== "root") throw new LaunchError("authority");
	const checked = await preflightSynthetic({
		...workspace,
		endpoint: input.endpoint,
		config: input.config,
	});
	let admitted;
	try {
		admitted = db
			.transaction(() => {
				if (listDomains(db).some((domain) => domain.unresolved))
					throw new LaunchError("busy");
				return admitDomain(
					db,
					{ ...context, nowMs: Date.now() },
					input,
					policy,
				);
			})
			.immediate();
	} catch {
		throw new LaunchError("admission");
	}
	if (!admitted.domain)
		return { ...admitted, candidate: null, failure: null, stopped: false };
	const domain = admitted.domain;
	const socketPath = domain.endpoint.slice(7);
	let id: string | null = null;
	let connection: { socket: Socket; head: Buffer } | null = null;
	let candidate: SyntheticLaunchResult["candidate"] = null;
	let failure: string | null = null;
	let stopped = false;
	try {
		live(db, context, domain);
		const created = await dockerJson(
			socketPath,
			`/containers/create?name=loom-${domain.domainId}`,
			"engine",
			{ method: "POST", statuses: [201], body: buildDomainCreate(domain) },
		);
		if (typeof created.Id !== "string" || !/^[a-f0-9]{64}$/.test(created.Id))
			throw new LaunchError("create");
		id = created.Id;
		recordDomainObservation(db, domain.domainId, {
			kind: "created",
			containerId: id,
			evidenceRef: "trace:runner-created",
		});
		if (
			created.Warnings != null &&
			(!Array.isArray(created.Warnings) || created.Warnings.length)
		)
			throw new LaunchError("config");
		const inspected = await dockerJson(
			socketPath,
			`/containers/${id}/json`,
			"engine",
		);
		assertDomainContainer(inspected, domain, id, checked.imageId);
		if (object(inspected.State, "config").Status !== "created")
			throw new LaunchError("config");
		await preflightSynthetic({
			...workspace,
			endpoint: domain.endpoint,
			config: domain.config,
		});
		connection = await attach(socketPath, id);
		if (connection.socket.destroyed) throw new LaunchError("attach");
		live(db, context, domain);
		const startedAt = performance.now();
		await dockerJson(socketPath, `/containers/${id}/start`, "engine", {
			method: "POST",
			statuses: [204],
		});
		recordDomainObservation(db, domain.domainId, {
			kind: "started",
			evidenceRef: "trace:runner-started",
		});
		if (connection.socket.destroyed) throw new LaunchError("attach");
		const result = await supervise(
			db,
			context,
			domain,
			connection.socket,
			connection.head,
			startedAt,
		);
		candidate = result.candidate;
		failure = result.failure;
	} catch (error) {
		failure = error instanceof LaunchError ? error.code : "backend";
	} finally {
		connection?.socket.destroy();
		if (id) {
			const result = await stopOwnedDomain(db, domain, id, checked.imageId);
			stopped = result.stopped;
			if (result.failure) failure = result.failure;
			else if (!failure && result.workerFailed) failure = "worker";
		}
	}
	return {
		decision: admitted.decision,
		domain: recordUnqualified(db, domain.domainId, stopped),
		candidate: failure ? null : candidate,
		failure,
		stopped,
	};
}

export function buildDomainCreate(domain: DomainRecord) {
	return {
		Image: profile.image,
		User: `${profile.uid}:${profile.gid}`,
		Entrypoint: ["/usr/local/bin/bun"],
		Cmd: ["--no-env-file", "/input/worker.ts"],
		WorkingDir: "/workspace",
		Env: [
			"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/bun-node-fallback-bin",
			"BUN_RUNTIME_TRANSPILER_CACHE_PATH=0",
			"BUN_INSTALL_BIN=/usr/local/bin",
			"HOME=/tmp",
			"TMPDIR=/tmp",
			"BUN_INSTALL_CACHE_DIR=/tmp/bun-cache",
		],
		Tty: false,
		OpenStdin: true,
		StdinOnce: true,
		AttachStdin: true,
		AttachStdout: true,
		AttachStderr: true,
		StopSignal: "SIGTERM",
		StopTimeout: 2,
		Labels: {
			"loom.domain": domain.domainId,
			"loom.run": domain.runId,
			"loom.config": domain.configHash,
		},
		HostConfig: {
			Runtime: "runc",
			ReadonlyRootfs: true,
			Privileged: false,
			NetworkMode: "none",
			CapDrop: ["ALL"],
			CapAdd: [],
			SecurityOpt: ["no-new-privileges:true"],
			NanoCpus: profile.cpus * 1000000000,
			Memory: profile.memoryMiB * 1048576,
			MemorySwap: profile.memoryMiB * 1048576,
			PidsLimit: profile.pids,
			IpcMode: "private",
			CgroupnsMode: "private",
			PidMode: "",
			UsernsMode: "",
			AutoRemove: false,
			Init: false,
			RestartPolicy: { Name: "no", MaximumRetryCount: 0 },
			LogConfig: { Type: "none", Config: {} },
			ShmSize: profile.shmMiB * 1048576,
			Tmpfs: { "/tmp": "rw,nosuid,nodev,noexec,size=67108864,mode=1777" },
			PublishAllPorts: false,
			PortBindings: {},
			Mounts: [
				{
					Type: "bind",
					Source: domain.config.inputRoot,
					Target: "/input",
					ReadOnly: true,
					BindOptions: {
						Propagation: "rprivate",
						NonRecursive: true,
						CreateMountpoint: false,
					},
				},
				{
					Type: "bind",
					Source: domain.config.workspaceRoot,
					Target: "/workspace",
					ReadOnly: false,
					BindOptions: {
						Propagation: "rprivate",
						NonRecursive: true,
						CreateMountpoint: false,
					},
				},
			],
		},
	};
}

export function assertDomainOwner(
	actual: unknown,
	domain: DomainRecord,
	id: string,
	imageId: string,
): void {
	const row = object(actual, "ownership");
	const config = object(row.Config, "ownership");
	const labels = object(config.Labels, "ownership");
	if (
		!/^[a-f0-9]{64}$/.test(id) ||
		row.Id !== id ||
		row.Name !== `/loom-${domain.domainId}` ||
		row.Image !== imageId ||
		labels["loom.domain"] !== domain.domainId ||
		labels["loom.run"] !== domain.runId ||
		labels["loom.config"] !== domain.configHash
	)
		throw new LaunchError("ownership");
}

export function assertDomainContainer(
	actual: unknown,
	domain: DomainRecord,
	id: string,
	imageId: string,
): void {
	assertDomainOwner(actual, domain, id, imageId);
	const row = object(actual, "config");
	const config = object(row.Config, "config");
	const host = object(row.HostConfig, "config");
	const expected = buildDomainCreate(domain);
	for (const key of [
		"Image",
		"User",
		"Entrypoint",
		"Cmd",
		"WorkingDir",
		"Tty",
		"OpenStdin",
		"StdinOnce",
		"AttachStdin",
		"AttachStdout",
		"AttachStderr",
		"StopSignal",
		"StopTimeout",
	] as const) {
		if (!equal(config[key], expected[key])) throw new LaunchError("config");
	}
	if (
		!Array.isArray(config.Env) ||
		!equal([...config.Env].sort(), [...expected.Env].sort())
	)
		throw new LaunchError("config");
	for (const key of [
		"ReadonlyRootfs",
		"Runtime",
		"Privileged",
		"NetworkMode",
		"NanoCpus",
		"Memory",
		"MemorySwap",
		"PidsLimit",
		"IpcMode",
		"CgroupnsMode",
		"PidMode",
		"UsernsMode",
		"AutoRemove",
		"Init",
		"RestartPolicy",
		"LogConfig",
		"ShmSize",
		"Tmpfs",
		"PublishAllPorts",
	] as const) {
		if (!equal(host[key], expected.HostConfig[key]))
			throw new LaunchError("config");
	}
	if (
		!equal(host.CapDrop, ["ALL"]) ||
		!equal(host.SecurityOpt, ["no-new-privileges:true"])
	)
		throw new LaunchError("config");
	for (const key of [
		"CapAdd",
		"Binds",
		"Devices",
		"DeviceRequests",
		"VolumesFrom",
	]) {
		if (host[key] != null && (!Array.isArray(host[key]) || host[key].length))
			throw new LaunchError("config");
	}
	if (
		host.PortBindings != null &&
		Object.keys(object(host.PortBindings, "config")).length
	)
		throw new LaunchError("config");
	if (
		!Array.isArray(host.Mounts) ||
		host.Mounts.length !== 2 ||
		!Array.isArray(row.Mounts) ||
		row.Mounts.length !== 2
	)
		throw new LaunchError("config");
	for (const mount of expected.HostConfig.Mounts) {
		const configured = host.Mounts.map((value) => object(value, "config")).find(
			(value) => value.Target === mount.Target,
		);
		const mounted = row.Mounts.map((value) => object(value, "config")).find(
			(value) => value.Destination === mount.Target,
		);
		if (
			!configured ||
			!mounted ||
			configured.Type !== "bind" ||
			configured.Source !== mount.Source ||
			(configured.ReadOnly ?? false) !== mount.ReadOnly ||
			mounted.Type !== "bind" ||
			mounted.Source !== mount.Source ||
			mounted.RW !== !mount.ReadOnly
		)
			throw new LaunchError("config");
		const bind = object(configured.BindOptions, "config");
		if (
			bind.Propagation !== "rprivate" ||
			bind.NonRecursive !== true ||
			bind.CreateMountpoint === true
		)
			throw new LaunchError("config");
	}
}
