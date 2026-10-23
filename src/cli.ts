#!/usr/bin/env bun
import { checkFramework, parseFrameworkRef } from "./framework.ts";
import {
	getLastTransition,
	initSchema,
	openDb,
	recordTransition,
} from "./store.ts";

function arg(name: string, fallback = ""): string {
	const i = process.argv.indexOf(name);
	return i >= 0 && i + 1 < process.argv.length
		? (process.argv[i + 1] ?? fallback)
		: fallback;
}

const cmd = process.argv[2] ?? "help";

if (cmd === "init") {
	const dbPath = arg("--db", ".loom.db");
	const db = openDb(dbPath);
	try {
		initSchema(db);
		console.log(JSON.stringify({ ok: true, db: dbPath }));
	} finally {
		db.close();
	}
} else if (cmd === "record") {
	const dbPath = arg("--db", ".loom.db");
	const db = openDb(dbPath);
	try {
		initSchema(db);
		try {
			const epoch = arg("--epoch");
			const t = recordTransition(
				db,
				{
					runId: arg("--run"),
					phase: arg("--phase"),
					status: "committed",
					resumePoint: arg("--resume"),
					evidenceRef: arg("--evidence") || undefined,
				},
				{
					runId: arg("--run"),
					threadId: arg("--thread"),
					workspace: arg("--workspace"),
					owner: arg("--owner"),
					epoch: /^[1-9]\d*$/.test(epoch) ? Number(epoch) : NaN,
				},
			);
			console.log(JSON.stringify(t));
		} catch {
			console.error(
				"record denied: valid --run/--thread/--workspace/--owner/--epoch, --phase/--resume and a live unkilled lease are required",
			);
			process.exitCode = 1;
		}
	} finally {
		db.close();
	}
} else if (cmd === "status") {
	const dbPath = arg("--db", ".loom.db");
	const db = openDb(dbPath);
	try {
		initSchema(db);
		const t = getLastTransition(
			db,
			arg("--run", "run-1"),
			arg("--thread") || undefined,
		);
		console.log(JSON.stringify(t ?? { ok: false, reason: "no transitions" }));
	} finally {
		db.close();
	}
} else if (cmd === "check-framework") {
	const file = Bun.file("FRAMEWORK_REF");
	const text = (await file.exists()) ? await file.text() : "";
	const expected = parseFrameworkRef(text);
	const res = checkFramework(
		{
			commit: arg("--commit", expected.commit),
			version: arg("--version", expected.version),
		},
		expected.commit ? expected : undefined,
	);
	if (!res.ok) {
		console.error(`framework check failed: ${res.reason}`);
		process.exit(1);
	}
	console.log(JSON.stringify({ ok: true, ...expected }));
} else {
	console.log(
		"usage: loom <init|record|status|check-framework> [--db PATH] [--run ID]",
	);
	console.log(
		"record requires --run ID --thread ID --workspace ID --owner ID --epoch N --phase NAME --resume POINT; lease acquisition is host-only",
	);
	process.exit(cmd === "help" ? 0 : 1);
}
