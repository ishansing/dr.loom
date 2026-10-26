import { readFileSync } from "node:fs";
import { openDb } from "../../src/index.ts";
import { runSyntheticDomain } from "../../src/runner-launch.ts";

// Test-only native controller; its private envelope contains synthetic inputs only.
if (process.argv.length !== 3) process.exit(64);
try {
	const input = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
	const db = openDb(input.dbPath);
	try {
		await runSyntheticDomain(
			db,
			input.context,
			input.input,
			input.workspace,
			input.policy,
		);
	} finally {
		db.close();
	}
} catch {
	process.exit(64);
}
