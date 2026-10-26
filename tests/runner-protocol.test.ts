import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	encodeRunnerCommand,
	type RunnerFrame,
	RunnerOutput,
} from "../src/runner-protocol.ts";

const ready = { version: 1, type: "ready", seq: 1 } satisfies RunnerFrame;
const candidate = {
	version: 1,
	type: "candidate-proposed",
	seq: 2,
	path: "candidate.txt",
	sha256: "a".repeat(64),
} satisfies RunnerFrame;
const line = (value: unknown) => Buffer.from(JSON.stringify(value) + "\n");
function header(length: number, stream = 1): Buffer {
	const bytes = Buffer.alloc(8);
	bytes[0] = stream;
	bytes.writeUInt32BE(length, 4);
	return bytes;
}
function wire(payload: Uint8Array, stream = 1): Buffer {
	return Buffer.concat([header(payload.length, stream), payload]);
}
const complete = Buffer.concat([wire(line(ready)), wire(line(candidate))]);

test("Docker output decodes identically at every byte split and byte-at-a-time", () => {
	for (let split = 0; split <= complete.length; split++) {
		const parser = new RunnerOutput();
		expect([
			...parser.push(complete.subarray(0, split)),
			...parser.push(complete.subarray(split)),
		]).toEqual([ready, candidate]);
		expect(() => parser.finish()).not.toThrow();
	}
	const parser = new RunnerOutput();
	const frames = [...complete].flatMap((byte) =>
		parser.push(new Uint8Array([byte])),
	);
	expect(frames).toEqual([ready, candidate]);
	parser.finish();
});

test("one Docker payload may contain both frames and JSON lines may cross Docker payloads", () => {
	for (const bytes of [
		wire(Buffer.concat([line(ready), line(candidate)])),
		Buffer.concat([
			wire(line(ready).subarray(0, 5)),
			wire(line(ready).subarray(5)),
			wire(line(candidate)),
		]),
	]) {
		const parser = new RunnerOutput();
		expect(parser.push(bytes)).toEqual([ready, candidate]);
		parser.finish();
	}
});

test("newline is included in the exact 4 KiB JSON frame limit", () => {
	const padded = Buffer.from(
		JSON.stringify(ready) +
			" ".repeat(4095 - JSON.stringify(ready).length) +
			"\n",
	);
	expect(padded.length).toBe(4096);
	const parser = new RunnerOutput();
	expect(parser.push(wire(padded))).toEqual([ready]);
	expect(parser.push(wire(line(candidate)))).toEqual([candidate]);
	parser.finish();
	for (const payload of [
		Buffer.concat([Buffer.from(" "), padded]),
		Buffer.alloc(4096, 0x20),
	]) {
		expect(() => new RunnerOutput().push(wire(payload))).toThrow(
			"runner-output:invalid",
		);
	}
});

test("rejects malformed headers, foreign streams, stderr and oversized announced payloads", () => {
	const reserved = header(1);
	reserved[1] = 1;
	for (const bytes of [
		reserved,
		header(0),
		header(1, 0),
		header(1, 3),
		header(1, 255),
		wire(Buffer.from("PRIVATE-SENTINEL"), 2),
		header(65537),
		header(0xffffffff),
	]) {
		expect(() => new RunnerOutput().push(bytes)).toThrow(
			"runner-output:invalid",
		);
	}
	const parser = new RunnerOutput();
	expect(parser.push(header(65536))).toEqual([]);
	expect(() => parser.finish()).toThrow("runner-output:invalid");
});

test("aggregate output budget includes previous Docker payloads before accepting a new header", () => {
	const parser = new RunnerOutput();
	parser.push(wire(line(ready)));
	expect(() => parser.push(header(65536 - line(ready).length + 1))).toThrow(
		"runner-output:invalid",
	);
	const exact = new RunnerOutput();
	exact.push(wire(line(ready)));
	expect(exact.push(header(65536 - line(ready).length))).toEqual([]);
	expect(() => exact.finish()).toThrow("runner-output:invalid");
});

test("strict JSON schema, UTF-8, sequence, identity and proposal fields fail closed", () => {
	for (const value of [
		null,
		[],
		{},
		{ ...ready, seq: 1.5 },
		{ ...ready, seq: "1" },
		{ ...ready, version: 2 },
		{ ...ready, type: "complete" },
		{ ...ready, runId: "forged" },
		{ type: "ready", seq: 1 },
	]) {
		expect(() => new RunnerOutput().push(wire(line(value)))).toThrow(
			"runner-output:invalid",
		);
	}
	for (const payload of [
		Buffer.from([0xff, 0x0a]),
		Buffer.from("PRIVATE-SENTINEL\n"),
		Buffer.from("\n"),
	])
		expect(() => new RunnerOutput().push(wire(payload))).toThrow(
			"runner-output:invalid",
		);
	for (const value of [
		ready,
		{ ...candidate, sha256: "A".repeat(64) },
		{ ...candidate, sha256: 123 },
		{ ...candidate, path: "../host" },
		{ ...candidate, seq: 3 },
		{ ...candidate, verified: true },
		{ version: 1, type: "candidate-proposed", seq: 2, path: "candidate.txt" },
	]) {
		const parser = new RunnerOutput();
		parser.push(wire(line(ready)));
		expect(() => parser.push(wire(line(value)))).toThrow(
			"runner-output:invalid",
		);
	}
	expect(() => new RunnerOutput().push(wire(line(candidate)))).toThrow(
		"runner-output:invalid",
	);
});

test("partial headers, payloads, JSON and missing terminal proposals cannot finish", () => {
	for (const bytes of [
		Buffer.alloc(0),
		complete.subarray(0, 3),
		header(10),
		Buffer.concat([header(10), Buffer.from("abc")]),
		wire(Buffer.from('{"version":')),
		wire(line(ready)),
		complete.subarray(0, complete.length - 1),
	]) {
		const parser = new RunnerOutput();
		parser.push(bytes);
		expect(() => parser.finish()).toThrow("runner-output:invalid");
	}
});

test("terminal output and failed/finished parsers never accept more bytes", () => {
	for (const extra of [
		new Uint8Array([1]),
		header(1),
		wire(line(ready)),
		wire(line(candidate)),
	]) {
		const parser = new RunnerOutput();
		parser.push(complete);
		expect(() => parser.push(extra)).toThrow("runner-output:invalid");
		expect(() => parser.push(complete)).toThrow("runner-output:invalid");
		expect(() => parser.finish()).toThrow("runner-output:invalid");
	}
	const parser = new RunnerOutput();
	parser.push(complete);
	parser.finish();
	expect(() => parser.push(new Uint8Array())).toThrow("runner-output:invalid");
	expect(() => parser.finish()).toThrow("runner-output:invalid");
	expect(() =>
		new RunnerOutput().push(Buffer.concat([complete, wire(line(ready))])),
	).toThrow("runner-output:invalid");
});

test("untrusted diagnostic fields never escape parser errors or validated frames", () => {
	const parser = new RunnerOutput();
	try {
		parser.push(wire(line({ ...ready, token: "PRIVATE-SENTINEL" })));
		throw new Error("Parser accepted invalid data");
	} catch (error) {
		expect(error).toBeInstanceOf(Error);
		expect(String(error)).toBe("Error: runner-output:invalid");
	}
	expect(() => parser.push(complete)).toThrow("runner-output:invalid");
});

test("UTF-8 BOMs are not silently stripped into valid JSON frames", () => {
	expect(() =>
		new RunnerOutput().push(
			wire(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), line(ready)])),
		),
	).toThrow("runner-output:invalid");
});

test("runtime non-byte arguments poison the parser and callers cannot mutate parser state through returned frames", () => {
	for (const value of [null, "PRIVATE-SENTINEL", [1, 2], {}]) {
		const parser = new RunnerOutput();
		expect(() => Reflect.apply(parser.push, parser, [value])).toThrow(
			"runner-output:invalid",
		);
		expect(() => parser.push(complete)).toThrow("runner-output:invalid");
	}
	const parser = new RunnerOutput();
	const frames = parser.push(wire(line(ready)));
	Reflect.set(frames[0]!, "seq", 999);
	expect(parser.push(wire(line(candidate)))).toEqual([candidate]);
	parser.finish();
});

test("supervisor commands have one deterministic minimal encoding and no foreign command vocabulary", () => {
	expect(Buffer.from(encodeRunnerCommand("start")).toString()).toBe(
		'{"version":1,"type":"start"}\n',
	);
	expect(Buffer.from(encodeRunnerCommand("stop")).toString()).toBe(
		'{"version":1,"type":"stop"}\n',
	);
	for (const value of [
		"login",
		"execute",
		"grant",
		"reset",
		"PRIVATE-SENTINEL",
		null,
		{},
	])
		expect(() => Reflect.apply(encodeRunnerCommand, null, [value])).toThrow(
			"runner-command:invalid",
		);
});

function workerFixture(stdin: Uint8Array, existing?: string) {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-worker-protocol-");
	try {
		if (existing !== undefined)
			writeFileSync(join(dir, "candidate.txt"), existing);
		const child = Bun.spawnSync(
			[
				process.execPath,
				"--no-env-file",
				join(import.meta.dir, "fixtures/runner-worker.ts"),
			],
			{
				cwd: dir,
				env: {},
				stdin,
				stdout: "pipe",
				stderr: "pipe",
				timeout: 1000,
			},
		);
		let content: string | null = null;
		try {
			content = readFileSync(join(dir, "candidate.txt"), "utf8");
		} catch (error) {
			if (
				!(error instanceof Error) ||
				!("code" in error) ||
				error.code !== "ENOENT"
			)
				throw error;
		}
		return {
			child,
			content,
			mode:
				content === null
					? null
					: statSync(join(dir, "candidate.txt")).mode & 0o777,
		};
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("owned native worker proposes only its fixed synthetic file then stops without task-completion output", () => {
	const { child, content, mode } = workerFixture(
		Buffer.concat([encodeRunnerCommand("start"), encodeRunnerCommand("stop")]),
	);
	expect(child.exitCode).toBe(0);
	expect(child.stderr.toString()).toBe("");
	expect(content).toBe("loom synthetic candidate\n");
	expect(mode).toBe(0o640);
	const parser = new RunnerOutput();
	expect(parser.push(wire(child.stdout))).toEqual([
		ready,
		{
			...candidate,
			sha256: createHash("sha256").update(content!).digest("hex"),
		},
	]);
	parser.finish();
});

test("native worker accepts stop before start without touching a candidate", () => {
	const { child, content } = workerFixture(encodeRunnerCommand("stop"));
	expect(child.exitCode).toBe(0);
	expect(child.stderr.toString()).toBe("");
	expect(content).toBeNull();
	expect(child.stdout.toString()).toBe(line(ready).toString());
});

test("native worker withholds diagnostics for malformed, foreign, oversized and incomplete commands", () => {
	for (const stdin of [
		Buffer.from("PRIVATE-SENTINEL\n"),
		line(null),
		line([]),
		line({ version: 2, type: "start" }),
		line({ version: 1, type: "start", grant: "PRIVATE-SENTINEL" }),
		line({ version: 1, type: "provider-login" }),
		Buffer.from([0xff, 10]),
		Buffer.alloc(4096, 32),
		Buffer.from('{"version":1'),
		Buffer.alloc(0),
	]) {
		const { child, content } = workerFixture(stdin);
		expect(child.exitCode).toBe(64);
		expect(child.stderr.toString()).toBe("");
		expect(child.stdout.toString()).toBe(line(ready).toString());
		expect(content).toBeNull();
	}
});

test("duplicate start and EOF after proposal fail without additional output or task-success semantics", () => {
	for (const stdin of [
		Buffer.concat([encodeRunnerCommand("start"), encodeRunnerCommand("start")]),
		encodeRunnerCommand("start"),
	]) {
		const { child, content } = workerFixture(stdin);
		expect(child.exitCode).toBe(64);
		expect(child.stderr.toString()).toBe("");
		expect(content).toBe("loom synthetic candidate\n");
		const parser = new RunnerOutput();
		expect(parser.push(wire(child.stdout))).toHaveLength(2);
		parser.finish();
	}
});

test("native worker never overwrites an existing candidate and does not leak file errors", () => {
	const { child, content } = workerFixture(
		Buffer.concat([encodeRunnerCommand("start"), encodeRunnerCommand("stop")]),
		"preserve-existing-sentinel",
	);
	expect(child.exitCode).toBe(64);
	expect(content).toBe("preserve-existing-sentinel");
	expect(child.stdout.toString()).toBe(line(ready).toString());
	expect(child.stderr.toString()).toBe("");
});

test("native worker accepts the exact bounded command sizes and rejects a BOM-prefixed command", () => {
	const padded = (type: "start" | "stop") => {
		const json = JSON.stringify({ version: 1, type });
		return Buffer.from(json + " ".repeat(4095 - json.length) + "\n");
	};
	const exact = workerFixture(Buffer.concat([padded("start"), padded("stop")]));
	expect(exact.child.exitCode).toBe(0);
	expect(exact.content).toBe("loom synthetic candidate\n");
	const bom = workerFixture(
		Buffer.concat([
			Buffer.from([0xef, 0xbb, 0xbf]),
			encodeRunnerCommand("start"),
		]),
	);
	expect(bom.child.exitCode).toBe(64);
	expect(bom.content).toBeNull();
	expect(bom.child.stderr.toString()).toBe("");
});

test("native worker waits for host start, proposes once, and accepts a later cooperative stop", async () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-worker-interactive-");
	const child = Bun.spawn(
		[
			process.execPath,
			"--no-env-file",
			join(import.meta.dir, "fixtures/runner-worker.ts"),
		],
		{ cwd: dir, env: {}, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
	);
	const timer = setTimeout(() => child.kill(), 3000);
	const reader = child.stdout.getReader();
	const parser = new RunnerOutput();
	async function next(): Promise<RunnerFrame[]> {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) throw new Error("Worker closed unexpectedly");
			const frames = parser.push(wire(chunk.value));
			if (frames.length) return frames;
		}
	}
	try {
		expect(await next()).toEqual([ready]);
		expect(existsSync(join(dir, "candidate.txt"))).toBe(false);
		const start = encodeRunnerCommand("start");
		child.stdin.write(start.subarray(0, 5));
		child.stdin.write(start.subarray(5));
		await child.stdin.flush();
		const frames = await next();
		expect(frames).toEqual([
			{
				...candidate,
				sha256: createHash("sha256")
					.update("loom synthetic candidate\n")
					.digest("hex"),
			},
		]);
		expect(readFileSync(join(dir, "candidate.txt"), "utf8")).toBe(
			"loom synthetic candidate\n",
		);
		child.stdin.write(encodeRunnerCommand("stop"));
		child.stdin.end();
		expect((await reader.read()).done).toBe(true);
		expect(await child.exited).toBe(0);
		expect(await new Response(child.stderr).text()).toBe("");
		parser.finish();
	} finally {
		clearTimeout(timer);
		reader.releaseLock();
		if (child.exitCode === null) child.kill();
		await child.exited;
		rmSync(dir, { recursive: true, force: true });
	}
});
