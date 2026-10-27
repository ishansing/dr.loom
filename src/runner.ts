import { createHash } from "node:crypto";
import {
	closeSync,
	constants,
	fstatSync,
	lstatSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	realpathSync,
	statfsSync,
	statSync,
} from "node:fs";
import { request } from "node:http";
import { isAbsolute, join, normalize } from "node:path";
import {
	type DomainConfig,
	OFFLINE_DOMAIN_PROFILE,
	validateDomainConfig,
	validateDomainEndpoint,
} from "./store.ts";

export interface DomainPreflightInput {
	endpoint: string;
	config: DomainConfig;
	workspaceMount: string;
	workspaceImage: string;
}
export interface DomainPreflight {
	imageId: string;
	workerSha256: string;
	workspaceDevice: string;
}

class PreflightError extends Error {
	constructor(
		code: "input" | "endpoint" | "transport" | "engine" | "image" | "workspace",
	) {
		super(`runner-preflight:${code}`);
	}
}

function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new PreflightError("transport");
	return value as Record<string, unknown>;
}

/** Internal native transport; never loads Docker configuration or forwards diagnostics. */
export function dockerJson(
	socketPath: string,
	path: string,
	failure: "engine" | "image",
	post?: { method: "POST"; statuses: readonly number[]; body?: object },
): Promise<Record<string, unknown>> {
	const body = post?.body === undefined ? null : JSON.stringify(post.body);
	return new Promise((resolve, reject) => {
		const req = request(
			{
				socketPath,
				path: `/v1.56${path}`,
				method: post?.method ?? "GET",
				...(body === null
					? {}
					: {
							headers: {
								"Content-Type": "application/json",
								"Content-Length": Buffer.byteLength(body),
							},
						}),
				signal: AbortSignal.timeout(5000),
			},
			(response) => {
				if (!(post?.statuses ?? [200]).includes(response.statusCode ?? 0)) {
					response.destroy();
					reject(new PreflightError(failure));
					return;
				}
				const chunks: Buffer[] = [];
				let bytes = 0;
				response.on("data", (chunk: Buffer) => {
					bytes += chunk.length;
					if (bytes > 1048576) {
						req.destroy();
						reject(new PreflightError("transport"));
						return;
					}
					chunks.push(chunk);
				});
				response.on("error", () => reject(new PreflightError("transport")));
				response.on("end", () => {
					try {
						if (
							!bytes &&
							post &&
							(response.statusCode === 204 || response.statusCode === 304)
						) {
							resolve({});
							return;
						}
						resolve(
							object(
								JSON.parse(
									new TextDecoder("utf-8", { fatal: true }).decode(
										Buffer.concat(chunks),
									),
								),
							),
						);
					} catch {
						reject(new PreflightError("transport"));
					}
				});
			},
		);
		req.on("error", () => reject(new PreflightError("transport")));
		req.end(body ?? undefined);
	});
}

function canonical(path: string): void {
	if (
		typeof path !== "string" ||
		!isAbsolute(path) ||
		normalize(path) !== path ||
		path.endsWith("/") ||
		realpathSync(path) !== path
	)
		throw new PreflightError("input");
}

function inspectInput(config: DomainConfig): void {
	validateDomainConfig(config);
	canonical(config.inputRoot);
	canonical(config.workspaceRoot);
	const root = lstatSync(config.inputRoot);
	if (
		!root.isDirectory() ||
		root.uid !== process.geteuid!() ||
		root.mode & 0o022 ||
		!lstatSync(config.workspaceRoot).isDirectory()
	)
		throw new PreflightError("input");
	const entries = readdirSync(config.inputRoot);
	if (entries.length !== 1 || entries[0] !== "worker.ts")
		throw new PreflightError("input");
	const fd = openSync(
		join(config.inputRoot, "worker.ts"),
		constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	);
	try {
		const file = fstatSync(fd);
		if (
			!file.isFile() ||
			file.nlink !== 1 ||
			file.uid !== process.geteuid!() ||
			file.mode & 0o022 ||
			file.size > 65536
		)
			throw new PreflightError("input");
		const buffer = Buffer.alloc(65537);
		let length = 0;
		while (length < buffer.length) {
			const read = readSync(fd, buffer, length, buffer.length - length, null);
			if (!read) break;
			length += read;
		}
		const bytes = buffer.subarray(0, length);
		if (
			bytes.length > 65536 ||
			createHash("sha256").update(bytes).digest("hex") !== config.workerSha256
		)
			throw new PreflightError("input");
	} finally {
		closeSync(fd);
	}
}

function mountId(path: string): string {
	const fd = openSync(
		path,
		constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
	);
	try {
		return /^mnt_id:\s*(\d+)$/m.exec(
			readFileSync(`/proc/self/fdinfo/${fd}`, "utf8"),
		)![1]!;
	} finally {
		closeSync(fd);
	}
}

function inspectWorkspace(input: DomainPreflightInput): string {
	canonical(input.workspaceMount);
	canonical(input.workspaceImage);
	if (!input.config.workspaceRoot.startsWith(`${input.workspaceMount}/`))
		throw new PreflightError("workspace");
	const image = lstatSync(input.workspaceImage);
	if (
		!image.isFile() ||
		image.uid !== process.geteuid!() ||
		image.mode & 0o022 ||
		image.size !== 2147483648
	)
		throw new PreflightError("workspace");
	const mounts = readFileSync("/proc/self/mountinfo", "utf8")
		.trim()
		.split("\n")
		.map((line) => {
			const [left, right] = line.split(" - ");
			return { fields: left!.split(" "), filesystem: right?.split(" ") };
		});
	const unescape = (path: string) =>
		path
			.replaceAll("\\040", " ")
			.replaceAll("\\011", "\t")
			.replaceAll("\\012", "\n")
			.replaceAll("\\134", "\\");
	const visible = mountId(input.workspaceMount);
	const mount = mounts.find(
		(row) =>
			row.fields[0] === visible &&
			unescape(row.fields[4]!) === input.workspaceMount,
	);
	if (
		!mount ||
		mount.fields[3] !== "/" ||
		mount.filesystem?.[0] !== "ext4" ||
		!/^7:\d+$/.test(mount.fields[2]!)
	)
		throw new PreflightError("workspace");
	const options = mount.fields[5]!.split(",");
	if (
		!["rw", "nosuid", "nodev"].every((option) => options.includes(option)) ||
		!/^\/dev\/loop\d+$/.test(mount.filesystem[1]!)
	)
		throw new PreflightError("workspace");
	const device = lstatSync(mount.filesystem[1]!);
	const root = statSync(input.workspaceMount);
	const workspace = statSync(input.config.workspaceRoot);
	if (
		!device.isBlockDevice() ||
		device.rdev !== root.dev ||
		workspace.dev !== root.dev ||
		statSync(input.config.inputRoot).dev === root.dev ||
		mountId(input.config.workspaceRoot) !== visible ||
		workspace.mode & 0o002
	)
		throw new PreflightError("workspace");
	const sys = `/sys/dev/block/${mount.fields[2]}`;
	const backing = statSync(
		readFileSync(`${sys}/loop/backing_file`, "utf8").trim(),
	);
	if (
		backing.dev !== image.dev ||
		backing.ino !== image.ino ||
		readFileSync(`${sys}/loop/offset`, "utf8").trim() !== "0" ||
		readFileSync(`${sys}/loop/sizelimit`, "utf8").trim() !== "0" ||
		readFileSync(`${sys}/size`, "utf8").trim() !== "4194304"
	)
		throw new PreflightError("workspace");
	const fs = statfsSync(input.workspaceMount, { bigint: true });
	if (
		fs.type !== 0xef53n ||
		fs.bsize * fs.blocks <= 0n ||
		fs.bsize * fs.blocks > 2147483648n
	)
		throw new PreflightError("workspace");
	return mount.fields[2]!;
}

function checkEnginePlatform(): void {
	if (
		process.platform !== "linux" ||
		process.arch !== "x64" ||
		!process.geteuid?.()
	)
		throw new PreflightError("engine");
}

/** Selected backend/image proof is also usable when old launch paths are missing. */
export async function preflightDomainBackend(
	endpoint: string,
): Promise<Pick<DomainPreflight, "imageId">> {
	try {
		checkEnginePlatform();
		validateDomainEndpoint(endpoint);
		const socketPath = endpoint.slice(7);
		canonical(socketPath);
		const socket = lstatSync(socketPath);
		if (
			!socket.isSocket() ||
			socket.uid !== process.geteuid!() ||
			socket.mode & 0o007
		)
			throw new PreflightError("endpoint");
		const version = await dockerJson(socketPath, "/version", "engine");
		if (
			version.Version !== "29.9.2" ||
			version.Os !== "linux" ||
			version.Arch !== "amd64" ||
			version.ApiVersion !== "1.56" ||
			typeof version.MinAPIVersion !== "string" ||
			!/^1\.\d+$/.test(version.MinAPIVersion) ||
			Number(version.MinAPIVersion.slice(2)) > 56
		)
			throw new PreflightError("engine");
		const info = await dockerJson(socketPath, "/info", "engine");
		const security = info.SecurityOptions;
		if (
			!Array.isArray(security) ||
			!["name=rootless", "name=seccomp,profile=builtin", "name=cgroupns"].every(
				(option) => security.includes(option),
			) ||
			info.CgroupDriver !== "systemd" ||
			info.CgroupVersion !== "2" ||
			info.Driver !== "overlayfs" ||
			info.OSType !== "linux" ||
			info.Architecture !== "x86_64"
		)
			throw new PreflightError("engine");
		const image = await dockerJson(
			socketPath,
			`/images/${encodeURIComponent(OFFLINE_DOMAIN_PROFILE.image)}/json`,
			"image",
		);
		const config = object(image.Config);
		if (
			typeof image.Id !== "string" ||
			!/^sha256:[a-f0-9]{64}$/.test(image.Id) ||
			!Array.isArray(image.RepoDigests) ||
			!image.RepoDigests.some(
				(digest) =>
					digest === OFFLINE_DOMAIN_PROFILE.image ||
					digest === `docker.io/${OFFLINE_DOMAIN_PROFILE.image}`,
			) ||
			image.Os !== "linux" ||
			image.Architecture !== "amd64" ||
			(config.Volumes != null && Object.keys(object(config.Volumes)).length)
		)
			throw new PreflightError("image");
		return { imageId: image.Id };
	} catch (error) {
		if (error instanceof PreflightError) throw error;
		throw new PreflightError("input");
	}
}

/** Point-in-time host checks only: no launch, execution permit or containment certification. */
export async function preflightDomain(
	input: DomainPreflightInput,
): Promise<DomainPreflight> {
	try {
		input = structuredClone(input);
		checkEnginePlatform();
		if (
			Object.keys(input).some(
				(key) =>
					!["endpoint", "config", "workspaceMount", "workspaceImage"].includes(
						key,
					),
			)
		)
			throw new PreflightError("input");
		inspectInput(input.config);
		const backend = await preflightDomainBackend(input.endpoint);
		let workspaceDevice: string;
		try {
			workspaceDevice = inspectWorkspace(input);
		} catch {
			throw new PreflightError("workspace");
		}
		return {
			imageId: backend.imageId,
			workerSha256: input.config.workerSha256,
			workspaceDevice,
		};
	} catch (error) {
		if (error instanceof PreflightError) throw error;
		throw new PreflightError("input");
	}
}
