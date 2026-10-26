import { createHash } from "node:crypto";
import {
	openSync,
	readFileSync,
	readSync,
	writeFileSync,
	writeSync,
} from "node:fs";

// Container-only fixture; never spawn or write under the native controller UID.
if (
	process.getuid!() !== 65532 ||
	process.getgid!() !== 65532 ||
	process.geteuid!() !== 65532 ||
	process.getegid!() !== 65532
)
	process.exit(64);
try {
	const identity = () => {
		const stat = readFileSync("/proc/self/stat", "utf8");
		const fields = stat
			.slice(stat.lastIndexOf(")") + 2)
			.trim()
			.split(/\s+/);
		const actor = {
			pid: process.pid,
			parentPid: Number(fields[1]),
			pgrp: Number(fields[2]),
			session: Number(fields[3]),
		};
		if (
			!Object.values(actor).every(
				(value) => Number.isSafeInteger(value) && value >= 0,
			)
		)
			throw new Error();
		return actor;
	};
	// Exercise forced domain stop, not cooperative or process-group termination.
	process.on("SIGTERM", () => {});
	setTimeout(() => process.exit(64), 30000);
	if (process.argv[2] === "child") {
		const actor = identity();
		if (
			actor.pid <= 1 ||
			actor.pgrp !== actor.pid ||
			actor.session !== actor.pid
		)
			throw new Error();
		const heartbeat = openSync("heartbeat.txt", "wx", 0o640);
		writeSync(heartbeat, ".");
		let ticks = 1;
		const beat = (value: "." | "T") => {
			if (++ticks > 1500) process.exit(64);
			writeSync(heartbeat, value);
		};
		process.on("SIGTERM", () => beat("T"));
		setInterval(() => beat("."), 20);
		writeFileSync("descendant.json", JSON.stringify(actor) + "\n", {
			flag: "wx",
			mode: 0o640,
		});
	} else {
		const command = (type: "start" | "stop") => {
			const expected = Buffer.from(JSON.stringify({ version: 1, type }) + "\n");
			const byte = Buffer.alloc(1);
			for (const value of expected)
				if (readSync(0, byte, 0, 1, null) !== 1 || byte[0] !== value)
					throw new Error();
		};
		writeSync(1, '{"version":1,"type":"ready","seq":1}\n');
		command("start");
		const parent = identity();
		if (parent.pid !== 1) throw new Error();
		const child = Bun.spawn(
			["/usr/local/bin/bun", "--no-env-file", "/input/worker.ts", "child"],
			{
				detached: true,
				env: {
					BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
					HOME: "/tmp",
					TMPDIR: "/tmp",
				},
				stdin: "ignore",
				stdout: "ignore",
				stderr: "ignore",
			},
		);
		let actor;
		for (let attempt = 0; attempt < 100; attempt++) {
			try {
				actor = JSON.parse(readFileSync("descendant.json", "utf8"));
				break;
			} catch (error) {
				if (
					!(error instanceof SyntaxError) &&
					(!(error instanceof Error) ||
						!("code" in error) ||
						error.code !== "ENOENT")
				)
					throw error;
			}
			await Bun.sleep(20);
		}
		if (
			!actor ||
			actor.pid !== child.pid ||
			actor.parentPid !== parent.pid ||
			actor.pgrp !== actor.pid ||
			actor.session !== actor.pid ||
			actor.session === parent.session
		)
			throw new Error();
		child.kill("SIGTERM");
		const content =
			JSON.stringify({ ...actor, parentSession: parent.session }) + "\n";
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
		setInterval(() => {}, 1000);
	}
} catch {
	process.exit(64);
}
