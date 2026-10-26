import { expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import {
	chmodSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createServer, request } from "node:http";
import type { Socket } from "node:net";
import { join } from "node:path";
import * as s from "../../src/index.ts";
import { dockerJson } from "../../src/runner.ts";
import {
	assertDomainOwner,
	runSyntheticDomain,
	type SyntheticLaunchInput,
} from "../../src/runner-launch.ts";

const policy: s.PolicyConfig = {
	defaultEffect: "deny",
	rules: [
		{ scope: "global", tool: "runner.launch", pattern: "*", effect: "allow" },
	],
};

async function backend(
	f: ReturnType<typeof prepare>,
	fault:
		| "none"
		| "create"
		| "start"
		| "config"
		| "ownership"
		| "info"
		| "warning"
		| "state"
		| "identity"
		| "attach-stall"
		| "attach-response"
		| "disconnect"
		| "delay-start"
		| "attach",
	onStarted?: () => void,
	onCreated?: () => void,
) {
	const socketPath = f.input.endpoint.slice(7),
		proxy = join(f.root, "backend.sock");
	const calls: string[] = [],
		observedIds: string[] = [],
		sockets = new Set<Socket>();
	let disconnectClient: (() => void) | undefined;
	const server = createServer((incoming, outgoing) => {
		const path = incoming.url!;
		calls.push(`${incoming.method} ${path}`);
		if (fault === "create" && path.startsWith("/v1.56/containers/create?")) {
			incoming.resume();
			outgoing.writeHead(500).end("PRIVATE-SENTINEL");
			return;
		}
		const upstream = request(
			{ socketPath, path, method: incoming.method, headers: incoming.headers },
			(response) => {
				if (
					path.startsWith("/v1.56/containers/create?") &&
					response.statusCode === 201
				)
					onCreated?.();
				if (
					/\/containers\/[a-f0-9]+\/start$/.test(path) &&
					response.statusCode === 204
				) {
					onStarted?.();
					if (fault === "delay-start") {
						response.resume();
						setTimeout(() => {
							if (!outgoing.destroyed) outgoing.writeHead(204).end();
						}, 4000);
						return;
					}
					if (fault === "disconnect")
						setTimeout(() => disconnectClient?.(), 250);
					if (fault === "start") {
						response.resume();
						outgoing.writeHead(500).end("PRIVATE-SENTINEL");
						return;
					}
				}
				if (
					((fault === "warning" || fault === "identity") &&
						path.startsWith("/v1.56/containers/create?")) ||
					((fault === "config" || fault === "ownership" || fault === "state") &&
						/\/containers\/[a-f0-9]+\/json$/.test(path)) ||
					(fault === "info" && path === "/v1.56/info")
				) {
					const chunks: Buffer[] = [];
					let bytes = 0;
					response.on("data", (chunk: Buffer) => {
						bytes += chunk.length;
						if (bytes > 1048576) response.destroy();
						else chunks.push(chunk);
					});
					response.on("end", () => {
						try {
							const value = JSON.parse(Buffer.concat(chunks).toString());
							if (fault === "config") value.HostConfig.Privileged = true;
							if (fault === "ownership")
								value.Config.Labels["loom.config"] = "foreign";
							if (fault === "info") value.SecurityOptions = [];
							if (fault === "warning") value.Warnings = ["PRIVATE-SENTINEL"];
							if (fault === "identity") {
								observedIds.push(value.Id);
								value.Id = "invalid-synthetic-id";
							}
							if (fault === "state") value.State.Status = "running";
							outgoing
								.writeHead(response.statusCode!)
								.end(JSON.stringify(value));
						} catch {
							outgoing.destroy();
						}
					});
					response.on("error", disconnected);
				} else {
					outgoing.writeHead(response.statusCode!, response.headers);
					response.pipe(outgoing);
				}
			},
		);
		const disconnected = () => {
			upstream.destroy();
			outgoing.destroy();
		};
		upstream.on("error", disconnected);
		incoming.on("error", disconnected);
		outgoing.once("close", disconnected);
		incoming.pipe(upstream);
	});
	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
	});
	server.on("upgrade", (incoming, client, head) => {
		calls.push(`${incoming.method} ${incoming.url}`);
		if (fault === "attach") {
			client.end("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n");
			return;
		}
		if (fault === "attach-stall") return;
		if (fault === "disconnect") {
			const ready = Buffer.from('{"version":1,"type":"ready","seq":1}\n');
			const header = Buffer.alloc(8);
			header[0] = 1;
			header.writeUInt32BE(ready.length, 4);
			client.write(
				Buffer.concat([
					Buffer.from(
						"HTTP/1.1 101 UPGRADED\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n",
					),
					header,
					ready,
				]),
			);
			client.pause();
			disconnectClient = () => client.destroy();
			return;
		}
		const upstream = request({
			socketPath,
			path:
				fault === "attach-response"
					? "/v1.56/__synthetic_missing_attach"
					: incoming.url,
			method: "POST",
			headers: incoming.headers,
		});
		upstream.once("upgrade", (_response, peer, first) => {
			sockets.add(peer);
			peer.once("close", () => sockets.delete(peer));
			client.write(
				"HTTP/1.1 101 UPGRADED\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n",
			);
			if (first.length) client.write(first);
			if (head.length) peer.write(head);
			client.pipe(peer);
			peer.pipe(client);
			const disconnected = () => {
				client.destroy();
				peer.destroy();
			};
			client.once("close", disconnected);
			peer.once("error", disconnected);
			client.once("error", disconnected);
		});
		upstream.once("response", (response) => {
			response.destroy();
			client.destroy();
		});
		upstream.once("error", client.destroy.bind(client, undefined));
		upstream.end();
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(proxy, resolve);
	});
	chmodSync(proxy, 0o600);
	f.input.endpoint = `unix://${proxy}`;
	return {
		calls,
		observedIds,
		socketPath,
		close: async () => {
			for (const socket of sockets) socket.destroy();
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
		},
	};
}

function prepare(
	source = readFileSync(
		join(import.meta.dir, "../fixtures/runner-worker.ts"),
		"utf8",
	),
) {
	const endpoint = process.env.LOOM_LAB_ENDPOINT,
		mount = process.env.LOOM_LAB_MOUNT,
		image = process.env.LOOM_LAB_IMAGE,
		state = process.env.LOOM_LAB_STATE;
	if (
		!endpoint ||
		!mount ||
		!image ||
		!state ||
		realpathSync(state) !== state ||
		!lstatSync(state).isDirectory() ||
		statSync(state).uid !== process.getuid!() ||
		statSync(state).mode & 0o077
	)
		throw new Error("Explicit private offline lab state/paths required");
	const pid = readFileSync(
		`/run/user/${process.getuid!()}/dockerd-rootless/child_pid`,
		"utf8",
	).trim();
	if (!/^\d+$/.test(pid))
		throw new Error("Invalid rootless namespace identity");
	for (const map of ["uid_map", "gid_map"]) {
		const rows = readFileSync(`/proc/${pid}/${map}`, "utf8")
			.trim()
			.split("\n")
			.map((row) => row.trim().split(/\s+/).map(Number));
		expect(rows).toEqual([
			[0, process.getuid!(), 1],
			[1, 100000, 65536],
		]);
	}
	const root = mkdtempSync(join(state, "domain-"));
	const inputRoot = join(root, "input");
	mkdirSync(inputRoot, { mode: 0o700 });
	const workspaceRoot = mkdtempSync(join(mount, "domain-"));
	const worker = join(inputRoot, "worker.ts");
	writeFileSync(worker, source, { mode: 0o600 });
	for (const args of [
		["--set", "u::rwx,u:165531:r-x,g::---,m::r-x,o::---", inputRoot],
		["--set", "u::rw-,u:165531:r--,g::---,m::r--,o::---", worker],
		["--set", "u::rwx,u:165531:rwx,g::---,m::rwx,o::---", workspaceRoot],
		[
			"--default",
			"--set",
			`u::rwx,u:${process.getuid!()}:rwx,g::---,m::rwx,o::---`,
			workspaceRoot,
		],
	]) {
		const child = Bun.spawnSync(["/usr/bin/setfacl", ...args], {
			env: {},
			stdout: "pipe",
			stderr: "pipe",
		});
		if (child.exitCode !== 0)
			throw new Error("Scoped lab ACL provisioning failed");
	}
	const runId = `lab-${randomUUID()}`;
	const ctx = {
		runId,
		threadId: "main",
		workspace: workspaceRoot,
		owner: "supervisor",
		epoch: 1,
	};
	const db = s.openDb(join(root, "store.sqlite"));
	s.initSchema(db);
	const lease = s.acquireWorkspaceLease(db, {
		runId,
		workspace: workspaceRoot,
		owner: ctx.owner,
		ttlMs: 60000,
	});
	if (!lease.ok) throw new Error("Lab lease unavailable");
	s.initRun(
		db,
		{
			runId,
			runbook: "offline-lab",
			goal: "Synthetic owned container",
			scale: "small",
			frameworkCommit: "a".repeat(40),
			frameworkVersion: "2.1.0",
			frameworkLockSha256: "b".repeat(64),
		},
		ctx,
	);
	s.setBudgetLimit(db, { runId, kind: "tool-calls", limit: 10 });
	const input: SyntheticLaunchInput = {
		domainId: randomUUID(),
		endpoint,
		config: {
			inputRoot,
			workspaceRoot,
			workerSha256: createHash("sha256").update(source).digest("hex"),
		},
		deadlineMs: Date.now() + 15000,
		authority: { kind: "root" },
	};
	return {
		db,
		ctx,
		input,
		workspace: { workspaceMount: mount, workspaceImage: image },
		root,
	};
}

test("actual synthetic domain creates, proposes and stops nonroot without claiming quiescence or completing a task", async () => {
	const f = prepare();
	try {
		const result = await runSyntheticDomain(
			f.db,
			f.ctx,
			f.input,
			f.workspace,
			policy,
		);
		expect(result.failure).toBeNull();
		expect(result.stopped).toBe(true);
		if (!result.candidate)
			throw new Error("Access probe did not propose a candidate");
		expect(result.candidate?.path).toBe("candidate.txt");
		const candidate = join(f.input.config.workspaceRoot, "candidate.txt");
		expect(statSync(candidate).uid).toBe(165531);
		expect(statSync(candidate).gid).toBe(165531);
		expect(readFileSync(candidate, "utf8")).toBe("loom synthetic candidate\n");
		expect(result.domain?.unresolved).toBe(true);
		expect(
			s.getAction(f.db, {
				runId: f.ctx.runId,
				threadId: f.ctx.threadId,
				actionId: f.input.domainId,
			})?.outcome,
		).toBe("pending");
		expect(s.getBudget(f.db, f.ctx.runId, "tool-calls")?.used).toBe(1);
		expect(() =>
			s.admitDomain(
				f.db,
				f.ctx,
				{ ...f.input, domainId: randomUUID() },
				policy,
			),
		).toThrow("unresolved");
		await expect(
			runSyntheticDomain(f.db, f.ctx, f.input, f.workspace, policy),
		).rejects.toThrow("runner-launch:");
		writeFileSync(
			join(f.root, "result.json"),
			JSON.stringify({
				mode: "synthetic-container-bootstrap",
				taskCompleted: false,
				quiescenceQualified: false,
				containerId: result.domain?.containerId,
				stopped: result.stopped,
				failure: result.failure,
			}) + "\n",
			{ mode: 0o600 },
		);
	} finally {
		f.db.close();
	}
}, 30000);

test("actual nonroot access probe denies root/input/outside writes and exposes only bounded synthetic control facts", async () => {
	const f = prepare(
		readFileSync(
			join(import.meta.dir, "../fixtures/runner-access-worker.ts"),
			"utf8",
		),
	);
	try {
		const result = await runSyntheticDomain(
			f.db,
			f.ctx,
			f.input,
			f.workspace,
			policy,
		);
		expect(result.failure).toBeNull();
		expect(result.stopped).toBe(true);
		if (!result.candidate)
			throw new Error("Access probe did not propose a candidate");
		const content = readFileSync(
			join(f.input.config.workspaceRoot, "candidate.txt"),
		);
		expect(createHash("sha256").update(content).digest("hex")).toBe(
			result.candidate.sha256,
		);
		expect(JSON.parse(content.toString())).toEqual({
			uid: 65532,
			gid: 65532,
			euid: 65532,
			egid: 65532,
			bun: "1.4.4",
			rootDenied: true,
			inputDenied: true,
			outsideDenied: true,
			noNewPrivileges: true,
			capabilities: "none",
			cpu: 2,
			memoryMiB: 4096,
			pids: 256,
			swap: false,
			tmpfs: {
				tmp: { capacityBytes: 67108864, writtenBytes: 67108864, denied: true },
				shm: { capacityBytes: 67108864, writtenBytes: 67108864, denied: true },
			},
		});
		expect(result.domain?.unresolved).toBe(true);
		expect(
			s.getAction(f.db, {
				runId: f.ctx.runId,
				threadId: f.ctx.threadId,
				actionId: f.input.domainId,
			})?.outcome,
		).toBe("pending");
	} finally {
		f.db.close();
	}
}, 30000);

test("denied, asked, stale, killed and exhausted real admissions never dispatch a Docker POST", async () => {
	for (const scenario of [
		"deny",
		"ask",
		"stale",
		"killed",
		"budget",
	] as const) {
		const f = prepare();
		const proxy = await backend(f, "none");
		try {
			const ctx = { ...f.ctx, nowMs: 0 };
			let selected = policy;
			if (scenario === "deny" || scenario === "ask")
				selected = { defaultEffect: scenario, rules: [] };
			if (scenario === "stale") ctx.epoch++;
			if (scenario === "killed")
				s.engageKill(f.db, {
					scope: `run:${ctx.runId}`,
					actor: "human:lab",
					reason: "Synthetic launch denial",
					evidenceRef: "approval:offline-lab",
					synthetic: true,
				});
			if (scenario === "budget")
				s.setBudgetLimit(f.db, {
					runId: ctx.runId,
					kind: "tool-calls",
					limit: 0,
				});
			const result = await runSyntheticDomain(
				f.db,
				ctx,
				f.input,
				f.workspace,
				selected,
			);
			expect(result.decision.decision).not.toBe("allow");
			expect(result.domain).toBeNull();
			expect(result.stopped).toBe(false);
			expect(proxy.calls.every((call) => call.startsWith("GET "))).toBe(true);
			expect(s.listDomains(f.db)).toEqual([]);
			expect(s.getBudget(f.db, ctx.runId, "tool-calls")?.used).toBe(0);
		} finally {
			await proxy.close();
			f.db.close();
		}
	}
}, 30000);

test("native backend faults retain uncertainty, withhold diagnostics and never start or stop a foreign identity", async () => {
	for (const fault of [
		"create",
		"start",
		"config",
		"ownership",
		"attach",
		"info",
		"warning",
		"identity",
		"state",
		"attach-stall",
		"attach-response",
		"disconnect",
	] as const) {
		const f = prepare();
		const proxy = await backend(f, fault);
		try {
			if (fault === "info") {
				await expect(
					runSyntheticDomain(f.db, f.ctx, f.input, f.workspace, policy),
				).rejects.toThrow("runner-launch:preflight");
				expect(s.listDomains(f.db)).toEqual([]);
				expect(proxy.calls.every((call) => call.startsWith("GET "))).toBe(true);
				continue;
			}
			const result = await runSyntheticDomain(
				f.db,
				f.ctx,
				f.input,
				f.workspace,
				policy,
			);
			const expected = {
				create: "backend",
				start: "backend",
				config: "config",
				ownership: "cleanup",
				attach: "attach",
				warning: "config",
				identity: "create",
				state: "config",
				"attach-stall": "attach",
				"attach-response": "attach",
				disconnect: "protocol",
			};
			expect(result.failure).toBe(expected[fault]);
			expect(result.candidate).toBeNull();
			expect(result.domain?.unresolved).toBe(true);
			expect(JSON.stringify(result)).not.toContain("PRIVATE-SENTINEL");
			expect(
				proxy.calls.filter((call) =>
					call.startsWith("POST /v1.56/containers/create?"),
				).length,
			).toBe(1);
			expect(
				proxy.calls.filter((call) => /POST .*\/start$/.test(call)).length,
			).toBe(fault === "start" || fault === "disconnect" ? 1 : 0);
			if (fault === "ownership" || fault === "create" || fault === "identity")
				expect(proxy.calls.some((call) => /POST .*\/stop\?/.test(call))).toBe(
					false,
				);
			expect(result.stopped).toBe(
				fault !== "ownership" && fault !== "create" && fault !== "identity",
			);
			if (fault === "identity") {
				expect(proxy.observedIds).toHaveLength(1);
				const actual = await dockerJson(
					proxy.socketPath,
					`/containers/${proxy.observedIds[0]}/json`,
					"engine",
				);
				expect(actual).toMatchObject({
					Name: `/loom-${f.input.domainId}`,
					State: { Running: false, Pid: 0 },
				});
			}
			expect(s.getBudget(f.db, f.ctx.runId, "tool-calls")?.used).toBe(1);
			writeFileSync(
				join(f.root, "fault-result.json"),
				JSON.stringify({
					fault,
					failure: result.failure,
					stopped: result.stopped,
					containerId: result.domain?.containerId,
					calls: proxy.calls,
					observedIds: proxy.observedIds,
				}) + "\n",
				{ mode: 0o600 },
			);
		} finally {
			await proxy.close();
			f.db.close();
		}
	}
}, 60000);

test("actual foreign name collision is not adopted, restarted or stopped", async () => {
	const first = prepare(),
		second = prepare();
	try {
		const original = await runSyntheticDomain(
			first.db,
			first.ctx,
			first.input,
			first.workspace,
			policy,
		);
		expect(original.stopped).toBe(true);
		if (!original.domain?.containerId)
			throw new Error("Missing owned fixture identity");
		second.input.domainId = first.input.domainId;
		const proxy = await backend(second, "none");
		try {
			const result = await runSyntheticDomain(
				second.db,
				second.ctx,
				second.input,
				second.workspace,
				policy,
			);
			expect(result.failure).toBe("backend");
			expect(result.domain?.containerId).toBeNull();
			expect(result.domain?.unresolved).toBe(true);
			expect(
				proxy.calls.filter((call) => call.startsWith("POST ")),
			).toHaveLength(1);
			const actual = await dockerJson(
				first.input.endpoint.slice(7),
				`/containers/${original.domain.containerId}/json`,
				"engine",
			);
			assertDomainOwner(
				actual,
				original.domain,
				original.domain.containerId,
				String(actual.Image),
			);
			expect(actual.State).toMatchObject({ Running: false, Pid: 0 });
		} finally {
			await proxy.close();
		}
	} finally {
		first.db.close();
		second.db.close();
	}
}, 30000);

test("malformed/stderr/trailing output and nonzero worker exit cannot produce a successful candidate", async () => {
	const original = readFileSync(
		join(import.meta.dir, "../fixtures/runner-worker.ts"),
		"utf8",
	);
	for (const source of [
		'import {writeSync} from "node:fs";writeSync(1,"PRIVATE-SENTINEL\\n");',
		'import {writeSync} from "node:fs";writeSync(2,"PRIVATE-SENTINEL\\n");',
		`import {writeSync,readSync} from "node:fs";writeSync(1,'{"version":1,"type":"ready","seq":1}\\n');readSync(0,Buffer.alloc(64));writeSync(1,'${JSON.stringify({ version: 1, type: "candidate-proposed", seq: 2, path: "candidate.txt", sha256: "a".repeat(64) })}\\nPRIVATE-SENTINEL\\n');`,
		original.replace("process.exit(0)", "process.exit(64)"),
	]) {
		const f = prepare(source);
		try {
			const result = await runSyntheticDomain(
				f.db,
				f.ctx,
				f.input,
				f.workspace,
				policy,
			);
			expect(result.failure === "protocol" || result.failure === "worker").toBe(
				true,
			);
			expect(result.candidate).toBeNull();
			expect(result.stopped).toBe(true);
			expect(result.domain?.unresolved).toBe(true);
			expect(JSON.stringify(result)).not.toContain("PRIVATE-SENTINEL");
		} finally {
			f.db.close();
		}
	}
}, 30000);

test("absolute deadline and active kill/lease loss stop the owned domain despite a caller-supplied fixture clock", async () => {
	const idle =
		'import {writeSync} from "node:fs";writeSync(1,\'{"version":1,"type":"ready","seq":1}\\n\');process.stdin.resume();setInterval(()=>{},1000);';
	for (const scenario of ["deadline", "kill", "lease"] as const) {
		const f = prepare(idle);
		let timer: ReturnType<typeof setTimeout> | undefined;
		let changed = false;
		const proxy = await backend(f, "none", () => {
			if (scenario !== "deadline")
				timer = setTimeout(() => {
					if (scenario === "kill") {
						s.engageKill(f.db, {
							scope: `run:${f.ctx.runId}`,
							actor: "human:lab",
							reason: "Synthetic active interruption",
							evidenceRef: "approval:offline-lab",
							synthetic: true,
						});
						changed = true;
					} else
						changed = s.releaseWorkspaceLease(f.db, {
							workspace: f.ctx.workspace,
							owner: f.ctx.owner,
							epoch: f.ctx.epoch,
						});
				}, 150);
		});
		try {
			if (scenario === "deadline") f.input.deadlineMs = Date.now() + 1200;
			const result = await runSyntheticDomain(
				f.db,
				{ ...f.ctx, nowMs: 0 },
				f.input,
				f.workspace,
				policy,
			);
			expect(result.failure).toBe(
				scenario === "deadline" ? "deadline" : "interrupted",
			);
			expect(result.stopped).toBe(true);
			expect(result.candidate).toBeNull();
			expect(result.domain?.unresolved).toBe(true);
			if (scenario !== "deadline") expect(changed).toBe(true);
			expect(
				s.getAction(f.db, {
					runId: f.ctx.runId,
					threadId: f.ctx.threadId,
					actionId: f.input.domainId,
				})?.decision,
			).toBe("allowed");
			if (scenario === "kill")
				expect(
					s.prepareKillReset(f.db, { scope: `run:${f.ctx.runId}` }).blocked,
				).toBe(true);
		} finally {
			clearTimeout(timer);
			await proxy.close();
			f.db.close();
		}
	}
}, 60000);

test("a late create acknowledged after kill is recorded but never started or labeled not-executed", async () => {
	const f = prepare();
	const proxy = await backend(f, "none", undefined, () =>
		s.engageKill(f.db, {
			scope: `run:${f.ctx.runId}`,
			actor: "human:lab",
			reason: "Synthetic in-flight creation kill",
			evidenceRef: "approval:offline-lab",
			synthetic: true,
		}),
	);
	try {
		const result = await runSyntheticDomain(
			f.db,
			f.ctx,
			f.input,
			f.workspace,
			policy,
		);
		expect(result.failure).toBe("interrupted");
		expect(result.stopped).toBe(true);
		expect(result.candidate).toBeNull();
		expect(
			result.domain?.events.some((event) => event.kind === "created"),
		).toBe(true);
		expect(
			result.domain?.events.some((event) => event.kind === "started"),
		).toBe(false);
		expect(proxy.calls.some((call) => /POST .*\/start$/.test(call))).toBe(
			false,
		);
		expect(
			s.getAction(f.db, {
				runId: f.ctx.runId,
				threadId: f.ctx.threadId,
				actionId: f.input.domainId,
			})?.decision,
		).toBe("allowed");
	} finally {
		await proxy.close();
		f.db.close();
	}
}, 30000);

test("a silent startup reaches the ready timeout and is stopped without exposed output", async () => {
	const f = prepare("process.stdin.resume();setInterval(()=>{},1000);");
	try {
		f.input.deadlineMs = Date.now() + 20000;
		const result = await runSyntheticDomain(
			f.db,
			f.ctx,
			f.input,
			f.workspace,
			policy,
		);
		expect(result.failure).toBe("ready");
		expect(result.stopped).toBe(true);
		expect(result.candidate).toBeNull();
		expect(result.domain?.unresolved).toBe(true);
	} finally {
		f.db.close();
	}
}, 30000);

test("a worker ignoring cooperative stop reaches bounded owned stop without a successful proposal result", async () => {
	const source = readFileSync(
		join(import.meta.dir, "../fixtures/runner-worker.ts"),
		"utf8",
	).replace("process.exit(0)", "while(true){Bun.sleepSync(1000);}");
	const f = prepare(source);
	try {
		const result = await runSyntheticDomain(
			f.db,
			f.ctx,
			f.input,
			f.workspace,
			policy,
		);
		expect(result.failure).toBe("cleanup");
		expect(result.stopped).toBe(true);
		expect(result.candidate).toBeNull();
		expect(result.domain?.unresolved).toBe(true);
	} finally {
		f.db.close();
	}
}, 30000);

test("an output flood is withheld and cannot exceed the private parser budget", async () => {
	const f = prepare(
		"process.stdout.write(Buffer.alloc(65537,65));process.stdin.resume();setInterval(()=>{},1000);",
	);
	try {
		const result = await runSyntheticDomain(
			f.db,
			f.ctx,
			f.input,
			f.workspace,
			policy,
		);
		expect(result.failure).toBe("protocol");
		expect(result.stopped).toBe(true);
		expect(result.candidate).toBeNull();
		expect(JSON.stringify(result)).not.toContain("AAAA");
	} finally {
		f.db.close();
	}
}, 30000);

test("ignored lifecycle writes cannot manufacture cleanup or erase already executed uncertainty", async () => {
	for (const kind of ["stop-requested", "unknown"] as const) {
		const f = prepare();
		f.db.exec(
			`CREATE TRIGGER lab_ignore_observation BEFORE INSERT ON domain_events WHEN NEW.kind='${kind}' BEGIN SELECT RAISE(IGNORE); END;`,
		);
		try {
			if (kind === "unknown")
				await expect(
					runSyntheticDomain(f.db, f.ctx, f.input, f.workspace, policy),
				).rejects.toThrow("runner-launch:inventory");
			else {
				const result = await runSyntheticDomain(
					f.db,
					f.ctx,
					f.input,
					f.workspace,
					policy,
				);
				expect(result.failure).toBe("inventory");
				expect(result.stopped).toBe(true);
				expect(result.candidate).toBeNull();
			}
			const domain = s.getDomain(f.db, f.input.domainId);
			expect(domain?.unresolved).toBe(true);
			expect(s.getBudget(f.db, f.ctx.runId, "tool-calls")?.used).toBe(1);
			if (!domain?.containerId)
				throw new Error("Missing inventory failure fixture identity");
			const actual = await dockerJson(
				f.input.endpoint.slice(7),
				`/containers/${domain.containerId}/json`,
				"engine",
			);
			expect(actual.State).toMatchObject({ Running: false, Pid: 0 });
		} finally {
			f.db.exec("DROP TRIGGER lab_ignore_observation");
			f.db.close();
		}
	}
}, 30000);

test("competing executable admissions fence disjoint roots in one store without double budget draw", async () => {
	const first = prepare(),
		second = prepare();
	const a = await backend(first, "create"),
		b = await backend(second, "create");
	try {
		const ctx = second.ctx;
		const lease = s.acquireWorkspaceLease(first.db, {
			runId: ctx.runId,
			workspace: ctx.workspace,
			owner: ctx.owner,
			ttlMs: 60000,
		});
		if (!lease.ok) throw new Error("Contending fixture lease unavailable");
		s.initRun(
			first.db,
			{
				runId: ctx.runId,
				runbook: "offline-lab",
				goal: "Synthetic competing admission",
				scale: "small",
				frameworkCommit: "a".repeat(40),
				frameworkVersion: "2.1.0",
				frameworkLockSha256: "b".repeat(64),
			},
			ctx,
		);
		s.setBudgetLimit(first.db, {
			runId: ctx.runId,
			kind: "tool-calls",
			limit: 10,
		});
		const results = await Promise.allSettled([
			runSyntheticDomain(
				first.db,
				first.ctx,
				first.input,
				first.workspace,
				policy,
			),
			runSyntheticDomain(first.db, ctx, second.input, second.workspace, policy),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === "rejected"),
		).toHaveLength(1);
		expect(s.listDomains(first.db)).toHaveLength(1);
		expect(
			(s.getBudget(first.db, first.ctx.runId, "tool-calls")?.used ?? 0) +
				(s.getBudget(first.db, ctx.runId, "tool-calls")?.used ?? 0),
		).toBe(1);
		expect(
			[...a.calls, ...b.calls].filter((call) => call.startsWith("POST ")),
		).toHaveLength(1);
	} finally {
		await a.close();
		await b.close();
		first.db.close();
		second.db.close();
	}
}, 30000);

test("a nonempty synthetic workspace is preserved and rejected before admission", async () => {
	const f = prepare();
	const existing = join(f.input.config.workspaceRoot, "candidate.txt");
	writeFileSync(existing, "preserve-existing-synthetic-data", { mode: 0o600 });
	try {
		let blocked = false;
		try {
			await runSyntheticDomain(f.db, f.ctx, f.input, f.workspace, policy);
		} catch (error) {
			blocked =
				error instanceof Error && error.message === "runner-launch:preflight";
		}
		expect(blocked).toBe(true);
		expect(readFileSync(existing, "utf8")).toBe(
			"preserve-existing-synthetic-data",
		);
		expect(s.listDomains(f.db)).toEqual([]);
		expect(s.getBudget(f.db, f.ctx.runId, "tool-calls")?.used).toBe(0);
	} finally {
		f.db.close();
	}
}, 30000);

test("ambient workspace files introduced after create block start without being deleted", async () => {
	const f = prepare();
	const config = join(f.input.config.workspaceRoot, "bunfig.toml");
	const proxy = await backend(f, "none", undefined, () =>
		writeFileSync(config, "# synthetic ambient config\n", { mode: 0o600 }),
	);
	try {
		const result = await runSyntheticDomain(
			f.db,
			f.ctx,
			f.input,
			f.workspace,
			policy,
		);
		expect(result.failure).toBe("preflight");
		expect(result.stopped).toBe(true);
		expect(result.candidate).toBeNull();
		expect(proxy.calls.some((call) => /POST .*\/start$/.test(call))).toBe(
			false,
		);
		expect(readFileSync(config, "utf8")).toBe("# synthetic ambient config\n");
		expect(result.domain?.unresolved).toBe(true);
	} finally {
		await proxy.close();
		f.db.close();
	}
}, 30000);

test("delayed start acknowledgment does not renew the ready-timeout budget", async () => {
	const f = prepare("process.stdin.resume();setInterval(()=>{},1000);");
	const proxy = await backend(f, "delay-start");
	try {
		f.input.deadlineMs = Date.now() + 25000;
		const began = performance.now();
		const result = await runSyntheticDomain(
			f.db,
			f.ctx,
			f.input,
			f.workspace,
			policy,
		);
		expect(result.failure).toBe("ready");
		expect(result.stopped).toBe(true);
		expect(result.domain?.unresolved).toBe(true);
		expect(performance.now() - began).toBeLessThan(14000);
	} finally {
		await proxy.close();
		f.db.close();
	}
}, 40000);
