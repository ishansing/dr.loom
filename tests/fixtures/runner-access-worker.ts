import { createHash } from "node:crypto";
import { readFileSync, readSync, writeFileSync, writeSync } from "node:fs";

// Container-only trusted probe; never touch absolute paths under a native host UID.
if (
	process.getuid!() !== 65532 ||
	process.getgid!() !== 65532 ||
	process.geteuid!() !== 65532 ||
	process.getegid!() !== 65532
)
	process.exit(64);
try {
	const command = (type: "start" | "stop") => {
		const expected = Buffer.from(JSON.stringify({ version: 1, type }) + "\n");
		const byte = Buffer.alloc(1);
		for (const value of expected)
			if (readSync(0, byte, 0, 1, null) !== 1 || byte[0] !== value)
				throw new Error();
	};
	const denied = (path: string) => {
		try {
			writeFileSync(path, "synthetic-denial-probe", {
				flag: "wx",
				mode: 0o600,
			});
			return false;
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				["EROFS", "EACCES", "EPERM"].includes(String(error.code))
			)
				return true;
			throw new Error();
		}
	};
	writeSync(1, '{"version":1,"type":"ready","seq":1}\n');
	command("start");
	const rootDenied = denied("/loom-denied-root"),
		inputDenied = denied("/input/loom-denied-input"),
		outsideDenied = denied("/workspace/../loom-denied-outside");
	if (!rootDenied || !inputDenied || !outsideDenied || Bun.version !== "1.4.4")
		throw new Error();
	const status = readFileSync("/proc/self/status", "utf8");
	if (!/^CapEff:\s*0+$/m.test(status) || !/^NoNewPrivs:\s*1$/m.test(status))
		throw new Error();
	for (const [file, expected] of [
		["memory.max", "4294967296"],
		["memory.swap.max", "0"],
		["pids.max", "256"],
		["cpu.max", "200000 100000"],
	]) {
		if (readFileSync(`/sys/fs/cgroup/${file}`, "utf8").trim() !== expected)
			throw new Error();
	}
	const content =
		JSON.stringify({
			uid: process.getuid!(),
			gid: process.getgid!(),
			euid: process.geteuid!(),
			egid: process.getegid!(),
			bun: Bun.version,
			rootDenied,
			inputDenied,
			outsideDenied,
			noNewPrivileges: true,
			capabilities: "none",
			cpu: 2,
			memoryMiB: 4096,
			pids: 256,
			swap: false,
		}) + "\n";
	// Preserve the inherited named-supervisor ACL read mask.
	writeFileSync("candidate.txt", content, { flag: "wx", mode: 0o640 });
	writeSync(
		1,
		JSON.stringify({
			version: 1,
			type: "candidate-proposed",
			seq: 2,
			path: "candidate.txt",
			sha256: createHash("sha256").update(content).digest("hex"),
		}) + "\n",
	);
	command("stop");
	process.exit(0);
} catch {
	process.exit(64);
}
