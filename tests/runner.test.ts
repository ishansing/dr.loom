import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	chmodSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	truncateSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import {
	dockerJson,
	preflightDomain,
	preflightDomainBackend,
} from "../src/runner.ts";
import { OFFLINE_DOMAIN_PROFILE } from "../src/store.ts";

const worker = "// trusted synthetic preflight fixture\n";
const version = {
	Version: "29.9.2",
	ApiVersion: "1.56",
	MinAPIVersion: "1.40",
	Os: "linux",
	Arch: "amd64",
};
const info = {
	SecurityOptions: [
		"name=rootless",
		"name=seccomp,profile=builtin",
		"name=cgroupns",
	],
	CgroupDriver: "systemd",
	CgroupVersion: "2",
	Driver: "overlayfs",
	OSType: "linux",
	Architecture: "x86_64",
};
const image = {
	Id: `sha256:${"a".repeat(64)}`,
	RepoDigests: [`docker.io/${OFFLINE_DOMAIN_PROFILE.image}`],
	Os: "linux",
	Architecture: "amd64",
	Config: { Volumes: null },
};

async function fixture() {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-preflight-");
	const inputRoot = join(dir, "input");
	const workspaceRoot = join(dir, "mount", "run");
	mkdirSync(inputRoot, { mode: 0o700 });
	mkdirSync(workspaceRoot, { recursive: true, mode: 0o700 });
	writeFileSync(join(inputRoot, "worker.ts"), worker, { mode: 0o600 });
	writeFileSync(join(dir, "image.img"), "", { mode: 0o600 });
	truncateSync(join(dir, "image.img"), 2147483648);
	const socket = join(dir, "docker.sock");
	const requests: string[] = [];
	const responses = new Map<
		string,
		{
			status?: number;
			body: unknown;
			close?: "headers" | "body";
			hang?: boolean;
			raw?: Uint8Array;
		}
	>([
		["/v1.56/version", { body: version }],
		["/v1.56/info", { body: info }],
		[
			`/v1.56/images/${encodeURIComponent(OFFLINE_DOMAIN_PROFILE.image)}/json`,
			{ body: image },
		],
	]);
	const server = createServer((req, res) => {
		requests.push(`${req.method} ${req.url}`);
		const response = responses.get(req.url!);
		if (response?.hang) return;
		if (response?.close === "headers") {
			req.socket.destroy();
			return;
		}
		res.writeHead(response?.status ?? 200);
		if (response?.close === "body") {
			res.write('{"partial":');
			setImmediate(() => res.destroy());
			return;
		}
		if (response?.raw) {
			res.end(response.raw);
			return;
		}
		res.end(
			typeof response?.body === "string"
				? response.body
				: JSON.stringify(response?.body),
		);
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(socket, resolve);
	});
	chmodSync(socket, 0o600);
	const options = {
		endpoint: `unix://${socket}`,
		config: {
			inputRoot,
			workspaceRoot,
			workerSha256: createHash("sha256").update(worker).digest("hex"),
		},
		workspaceMount: join(dir, "mount"),
		workspaceImage: join(dir, "image.img"),
	};
	return {
		dir,
		options,
		requests,
		responses,
		close: async () => {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
			rmSync(dir, { recursive: true, force: true });
		},
	};
}

test("preflight rejects ordinary directories after bounded read-only engine/image checks", async () => {
	const f = await fixture();
	try {
		await expect(preflightDomain(f.options)).rejects.toThrow("workspace");
		expect(f.requests).toHaveLength(3);
		expect(
			f.requests.every((request) => request.startsWith("GET /v1.56/")),
		).toBe(true);
	} finally {
		await f.close();
	}
});

test("backend proof does not require launch paths but full launch validation still does", async () => {
	const f = await fixture();
	try {
		f.options.config.inputRoot = join(f.dir, "missing-input");
		f.options.config.workspaceRoot = join(f.dir, "missing-workspace");
		await expect(preflightDomain(f.options)).rejects.toThrow(
			"runner-preflight:input",
		);
		expect(f.requests).toEqual([]);
		await expect(preflightDomainBackend(f.options.endpoint)).resolves.toEqual({
			imageId: `sha256:${"a".repeat(64)}`,
		});
		expect(f.requests).toHaveLength(3);
		expect(f.requests.every((call) => call.startsWith("GET "))).toBe(true);
		f.responses.set("/v1.56/info", { body: { ...info, SecurityOptions: [] } });
		await expect(preflightDomainBackend(f.options.endpoint)).rejects.toThrow(
			"runner-preflight:engine",
		);
	} finally {
		await f.close();
	}
});

test("preflight fails closed on unsupported or rootful engine metadata", async () => {
	for (const patch of [
		{ Version: "29.9.1" },
		{ Os: "windows" },
		{ Arch: "arm64" },
		{ ApiVersion: "1.55" },
		{ MinAPIVersion: "1.57" },
	]) {
		const f = await fixture();
		try {
			f.responses.set("/v1.56/version", { body: { ...version, ...patch } });
			await expect(preflightDomain(f.options)).rejects.toThrow("engine");
		} finally {
			await f.close();
		}
	}
	for (const patch of [
		{ SecurityOptions: [] },
		{ SecurityOptions: ["name=rootless"] },
		{ CgroupDriver: "none" },
		{ CgroupVersion: "1" },
		{ Driver: "vfs" },
		{ OSType: "windows" },
		{ Architecture: "aarch64" },
	]) {
		const f = await fixture();
		try {
			f.responses.set("/v1.56/info", { body: { ...info, ...patch } });
			await expect(preflightDomain(f.options)).rejects.toThrow("engine");
		} finally {
			await f.close();
		}
	}
});

test("preflight rejects missing, unpinned, wrong-platform or volume-bearing images", async () => {
	for (const response of [
		{ status: 404, body: "private-daemon-sentinel" },
		...[
			{ RepoDigests: [] },
			{ Os: "windows" },
			{ Architecture: "arm64" },
			{ Id: "unbound" },
			{ Config: { Volumes: { "/writable": {} } } },
		].map((patch) => ({ body: { ...image, ...patch } })),
	]) {
		const f = await fixture();
		try {
			f.responses.set(
				`/v1.56/images/${encodeURIComponent(OFFLINE_DOMAIN_PROFILE.image)}/json`,
				response,
			);
			await expect(preflightDomain(f.options)).rejects.toThrow("image");
		} finally {
			await f.close();
		}
	}
});

test("untrusted daemon responses are bounded and never exposed", async () => {
	for (const body of [
		"private-daemon-sentinel",
		"x".repeat(1024 * 1024 + 1),
		"[]",
		"null",
	]) {
		const f = await fixture();
		try {
			f.responses.set("/v1.56/version", { body });
			let error: unknown;
			try {
				await preflightDomain(f.options);
			} catch (caught) {
				error = caught;
			}
			expect(error).toBeInstanceOf(Error);
			expect(String(error)).not.toContain("private-daemon-sentinel");
			expect(String(error).length).toBeLessThan(100);
		} finally {
			await f.close();
		}
	}
});

test("preflight validates physical input, worker bytes and endpoint before trusting metadata", async () => {
	for (const scenario of [
		"symlink",
		"hardlink",
		"hash",
		"writable",
		"directory-writable",
		"extra",
		"oversize",
		"endpoint",
		"socket",
		"socket-permissions",
		"overlap",
		"relative",
		"trailing",
	] as const) {
		const f = await fixture();
		try {
			const options = structuredClone(f.options);
			if (scenario === "symlink") {
				symlinkSync(options.config.inputRoot, join(f.dir, "alias"));
				options.config.inputRoot = join(f.dir, "alias");
			}
			if (scenario === "hardlink")
				linkSync(
					join(options.config.inputRoot, "worker.ts"),
					join(f.dir, "worker-alias"),
				);
			if (scenario === "hash") options.config.workerSha256 = "b".repeat(64);
			if (scenario === "writable")
				chmodSync(join(options.config.inputRoot, "worker.ts"), 0o666);
			if (scenario === "directory-writable")
				chmodSync(options.config.inputRoot, 0o720);
			if (scenario === "socket-permissions")
				chmodSync(options.endpoint.slice(7), 0o666);
			if (scenario === "extra")
				writeFileSync(
					join(options.config.inputRoot, "extra"),
					"private-sentinel",
				);
			if (scenario === "oversize")
				writeFileSync(
					join(options.config.inputRoot, "worker.ts"),
					"x".repeat(65537),
				);
			if (scenario === "endpoint") options.endpoint = "tcp://private-sentinel";
			if (scenario === "socket")
				options.endpoint = `unix://${join(f.dir, "missing.sock")}`;
			if (scenario === "overlap")
				options.config.workspaceRoot = options.config.inputRoot;
			if (scenario === "relative")
				options.config.inputRoot = "../private-sentinel";
			if (scenario === "trailing") options.config.inputRoot += "/";
			await expect(preflightDomain(options)).rejects.toThrow(
				"runner-preflight:",
			);
			expect(f.requests).toEqual([]);
		} finally {
			await f.close();
		}
	}
});

test("connection loss, invalid UTF-8 and stalled daemon bodies yield safe transport failures", async () => {
	for (const response of [
		{ body: null, close: "headers" as const },
		{ body: null, close: "body" as const },
		{ body: null, raw: new Uint8Array([0xff]) },
		{ body: null, hang: true },
	]) {
		const f = await fixture();
		try {
			f.responses.set("/v1.56/version", response);
			await expect(preflightDomain(f.options)).rejects.toThrow(
				"runner-preflight:transport",
			);
		} finally {
			await f.close();
		}
	}
}, 10000);

test("unexpected preflight fields reject without contacting a daemon", async () => {
	const f = await fixture();
	try {
		const extra = { ...f.options, unexpected: true };
		await expect(preflightDomain(extra)).rejects.toThrow("input");
		expect(f.requests).toEqual([]);
	} finally {
		await f.close();
	}
});

test("a named-pipe worker cannot block preflight while opening input", async () => {
	const f = await fixture();
	try {
		const path = join(f.options.config.inputRoot, "worker.ts");
		unlinkSync(path);
		expect(
			Bun.spawnSync(["mkfifo", path], {
				env: {},
				stdout: "pipe",
				stderr: "pipe",
			}).exitCode,
		).toBe(0);
		const child = Bun.spawnSync(
			[
				process.execPath,
				"--eval",
				`import {preflightDomain} from ${JSON.stringify(import.meta.dir + "/../src/runner.ts")};try{await preflightDomain(${JSON.stringify(f.options)});process.exit(2);}catch(e){process.exit(e instanceof Error&&e.message==='runner-preflight:input'?0:3);}`,
			],
			{ env: {}, stdout: "pipe", stderr: "pipe", timeout: 1000 },
		);
		expect(child.exitCode).toBe(0);
		expect(child.stdout.toString()).toBe("");
		expect(child.stderr.toString()).toBe("");
	} finally {
		await f.close();
	}
});

test("native internal POST transport accepts only selected status codes and bounded JSON or empty stop replies", async () => {
	const f = await fixture();
	try {
		f.responses.set("/v1.56/empty", { status: 204, body: null });
		await expect(
			dockerJson(f.options.endpoint.slice(7), "/empty", "engine", {
				method: "POST",
				statuses: [204],
				body: { synthetic: true },
			}),
		).resolves.toEqual({});
		expect(f.requests).toEqual(["POST /v1.56/empty"]);
		f.responses.set("/v1.56/empty", { status: 304, body: null });
		await expect(
			dockerJson(f.options.endpoint.slice(7), "/empty", "engine", {
				method: "POST",
				statuses: [204, 304],
			}),
		).resolves.toEqual({});
		f.responses.set("/v1.56/empty", {
			status: 201,
			body: { Id: "a".repeat(64) },
		});
		await expect(
			dockerJson(f.options.endpoint.slice(7), "/empty", "engine", {
				method: "POST",
				statuses: [201],
				body: { synthetic: true },
			}),
		).resolves.toEqual({ Id: "a".repeat(64) });
		for (const response of [
			{ status: 500, body: "PRIVATE-SENTINEL" },
			{ status: 204, body: null },
			{ status: 201, body: "PRIVATE-SENTINEL" },
		]) {
			f.responses.set("/v1.56/empty", response);
			await expect(
				dockerJson(f.options.endpoint.slice(7), "/empty", "engine", {
					method: "POST",
					statuses: [201],
				}),
			).rejects.toThrow("runner-preflight:");
		}
	} finally {
		await f.close();
	}
});
