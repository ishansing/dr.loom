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
		const t = recordTransition(db, {
			runId: arg("--run", "run-1"),
			phase: arg("--phase", "init"),
			status: "committed",
			resumePoint: arg("--resume", "init"),
			evidenceRef: arg("--evidence") || undefined,
		});
		console.log(JSON.stringify(t));
	} finally {
		db.close();
	}
} else if (cmd === "status") {
	const dbPath = arg("--db", ".loom.db");
	const db = openDb(dbPath);
	try {
		initSchema(db);
		const t = getLastTransition(db, arg("--run", "run-1"));
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
	process.exit(cmd === "help" ? 0 : 1);
}
