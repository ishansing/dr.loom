import { createHash } from "node:crypto";
import {
	closeSync,
	openSync,
	readFileSync,
	readSync,
	statfsSync,
	writeFileSync,
	writeSync,
} from "node:fs";

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
	const roots = ["/tmp", "/dev/shm"] as const;
	for (const root of roots) {
		const fs = statfsSync(root);
		if (fs.type !== 0x01021994 || fs.bsize * fs.blocks !== 67108864)
			throw new Error();
	}
	const chunk = Buffer.alloc(1048576, 97);
	const fill = (root: (typeof roots)[number]) => {
		const fd = openSync(`${root}/loom-synthetic-capacity.bin`, "wx", 0o600);
		let writtenBytes = 0,
			denied = false;
		try {
			for (let attempt = 0; attempt < 65; attempt++) {
				try {
					const bytes = writeSync(fd, chunk);
					writtenBytes += bytes;
					if (bytes !== chunk.length) throw new Error();
				} catch (error) {
					if (
						!(error instanceof Error) ||
						!("code" in error) ||
						error.code !== "ENOSPC"
					)
						throw new Error();
					denied = true;
					break;
				}
			}
		} finally {
			closeSync(fd);
		}
		if (!denied || writtenBytes !== 67108864) throw new Error();
		return { capacityBytes: 67108864, writtenBytes, denied };
	};
	const tmpfs = { tmp: fill(roots[0]), shm: fill(roots[1]) };
	const maxEvents = () => {
		const match = /^max (\d+)$/m.exec(
			readFileSync("/sys/fs/cgroup/pids.events", "utf8"),
		);
		if (!match || !Number.isSafeInteger(Number(match[1]))) throw new Error();
		return Number(match[1]);
	};
	const before = maxEvents();
	const children: Bun.Subprocess<"ignore", "ignore", "ignore">[] = [];
	const exits: Promise<number>[] = [];
	let pidDenied = false;
	try {
		for (let attempt = 0; attempt < 256; attempt++) {
			try {
				children.push(
					Bun.spawn(["/bin/sleep", "30"], {
						env: {},
						stdin: "ignore",
						stdout: "ignore",
						stderr: "ignore",
					}),
				);
				// Register exit observation before saturating the cgroup.
				exits.push(children[children.length - 1]!.exited);
			} catch (error) {
				if (
					!(error instanceof Error) ||
					!("code" in error) ||
					error.code !== "EAGAIN"
				)
					throw new Error();
				pidDenied = true;
				break;
			}
		}
	} finally {
		for (const child of children) child.kill("SIGKILL");
		await Promise.all(exits);
	}
	if (
		!pidDenied ||
		children.length < 1 ||
		children.length >= 256 ||
		maxEvents() <= before
	)
		throw new Error();
	const pidCap = {
		limit: 256,
		started: children.length,
		denied: pidDenied,
		eventsIncreased: true,
		allReaped: true,
	};
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
			tmpfs,
			pidCap,
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
