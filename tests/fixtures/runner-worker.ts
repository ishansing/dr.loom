import { createHash } from "node:crypto";
import { readSync, writeFileSync, writeSync } from "node:fs";

// Owned offline fixture only; a candidate proposal is never verified completion.
try {
	writeSync(1, '{"version":1,"type":"ready","seq":1}\n');
	const chunk = Buffer.alloc(4096);
	const line = Buffer.alloc(4096);
	let used = 0;
	let total = 0;
	let started = false;
	while (true) {
		const size = readSync(0, chunk, 0, chunk.length, null);
		if (!size || (total += size) > 8192) throw new Error();
		for (let index = 0; index < size; index++) {
			const byte = chunk[index]!;
			line[used++] = byte;
			if (byte !== 10) {
				if (used === line.length) throw new Error();
				continue;
			}
			const command: unknown = JSON.parse(
				new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
					line.subarray(0, used - 1),
				),
			);
			used = 0;
			if (!command || typeof command !== "object" || Array.isArray(command))
				throw new Error();
			const value = command as Record<string, unknown>;
			if (
				Object.keys(value).length !== 2 ||
				value.version !== 1 ||
				(value.type !== "start" && value.type !== "stop")
			)
				throw new Error();
			if (value.type === "stop") {
				if (index !== size - 1) throw new Error();
				process.exit(0);
			}
			if (started) throw new Error();
			started = true;
			const content = "loom synthetic candidate\n";
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
		}
	}
} catch {
	process.exit(64);
}
