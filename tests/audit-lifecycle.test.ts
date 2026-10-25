import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as store from "../src/index.ts";

test("opening an action records an attributed pending request, not completion", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		const row = store.openAction(db, {
			runId: "r1",
			threadId: "main",
			actionId: "00000000-0000-4000-8000-000000000001",
			action: "edit",
			actor: "agent:worker",
			tier: "standard",
		});
		expect(row).toEqual(
			expect.objectContaining({
				id: 1,
				runId: "r1",
				threadId: "main",
				actionId: "00000000-0000-4000-8000-000000000001",
				action: "edit",
				actor: "agent:worker",
				tier: "standard",
				decision: "pending",
				outcome: "pending",
				evidenceRef: null,
			}),
		);
	} finally {
		db.close();
	}
});

const key = {
	runId: "r1",
	threadId: "main",
	actionId: "00000000-0000-4000-8000-000000000001",
};
const request = {
	...key,
	action: "edit",
	actor: "agent:worker",
	tier: "standard",
} satisfies Parameters<typeof store.openAction>[1];

test("queries preserve request scope and duplicate action IDs cannot rebind a thread", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		const row = store.openAction(db, request);
		expect(store.getAction(db, key)).toEqual(row);
		expect(store.listOpenActions(db, { runId: "r1" })).toEqual([row]);
		expect(() => store.getAction(db, { ...key, threadId: "child" })).toThrow(
			"thread",
		);
		expect(() => store.openAction(db, request)).toThrow("already exists");
		expect(() =>
			store.openAction(db, { ...request, threadId: "child" }),
		).toThrow("already exists");
		const other = store.openAction(db, { ...request, runId: "r2" });
		expect(store.listOpenActions(db, { runId: "r2" })).toEqual([other]);
		expect(
			store.getAction(db, {
				...key,
				actionId: "00000000-0000-4000-8000-000000000002",
			}),
		).toBeNull();
		expect(db.query("SELECT count(*) AS n FROM audit").get()).toEqual({ n: 2 });
	} finally {
		db.close();
	}
});

test("request, allowed verdict and observed finish remain separate immutable facts", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		store.openAction(db, request);
		const allowed = store.recordVerdict(db, {
			...key,
			actor: "human:reviewer",
			decision: "allowed",
			evidenceRef: "approval:decision-1",
		});
		expect(allowed).toEqual(
			expect.objectContaining({
				id: 2,
				decision: "allowed",
				outcome: "pending",
				actor: "human:reviewer",
				tier: "standard",
			}),
		);
		expect(store.listOpenActions(db, { runId: "r1" })).toEqual([allowed]);
		const done = store.recordFinish(db, {
			...key,
			actor: "system:observer",
			outcome: "completed",
			evidenceRef: "cmd:synthetic-test",
		});
		expect(done).toEqual(
			expect.objectContaining({
				id: 3,
				decision: "allowed",
				outcome: "completed",
				actor: "system:observer",
				action: "edit",
			}),
		);
		expect(store.getAction(db, key)).toEqual(done);
		expect(store.listOpenActions(db, { runId: "r1" })).toEqual([]);
		expect(
			db.query("SELECT decision, outcome FROM audit ORDER BY id").all(),
		).toEqual([
			{ decision: "pending", outcome: "pending" },
			{ decision: "allowed", outcome: "pending" },
			{ decision: "allowed", outcome: "completed" },
		]);
	} finally {
		db.close();
	}
});

test("public lifecycle functions reject unrecognized fields instead of silently accepting overrides", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		expect(() =>
			Reflect.apply(store.openAction, undefined, [
				db,
				{ ...request, decision: "allowed" },
			]),
		).toThrow("Unknown action field");
		store.openAction(db, request);
		expect(() =>
			Reflect.apply(store.recordVerdict, undefined, [
				db,
				{
					...key,
					actor: "human:reviewer",
					decision: "allowed",
					evidenceRef: "approval:test",
					tier: "critical",
				},
			]),
		).toThrow("Unknown action field");
		expect(() =>
			Reflect.apply(store.recordFinish, undefined, [
				db,
				{
					...key,
					actor: "system:test",
					outcome: "completed",
					evidenceRef: "cmd:test",
					action: "deploy",
				},
			]),
		).toThrow("Unknown action field");
		expect(() =>
			Reflect.apply(store.getAction, undefined, [
				db,
				{ ...key, actor: "human:fake" },
			]),
		).toThrow("Unknown action field");
		expect(() =>
			Reflect.apply(store.listOpenActions, undefined, [
				db,
				{ runId: "r1", outcome: "completed" },
			]),
		).toThrow("Unknown action field");
		expect(db.query("SELECT count(*) AS n FROM audit").get()).toEqual({ n: 1 });
	} finally {
		db.close();
	}
});

test("denial and expiry are terminal not-executed; escalation stays unresolved until a verdict", () => {
	for (const decision of ["denied", "expired", "escalated"] as const) {
		const db = store.openDb();
		try {
			store.initSchema(db);
			store.openAction(db, request);
			const row = store.recordVerdict(db, {
				...key,
				actor: "human:reviewer",
				decision,
				evidenceRef: "approval:synthetic",
			});
			expect(row.outcome).toBe(
				decision === "escalated" ? "pending" : "not-executed",
			);
			if (decision === "escalated") {
				expect(store.listOpenActions(db, { runId: "r1" })).toEqual([row]);
				store.recordVerdict(db, {
					...key,
					actor: "human:principal",
					decision: "allowed",
					evidenceRef: "approval:second-review",
				});
				const finished = store.recordFinish(db, {
					...key,
					actor: "system:observer",
					outcome: "interrupted",
					evidenceRef: "trace:unknown-effect",
				});
				expect(finished.outcome).toBe("interrupted");
			} else {
				expect(store.listOpenActions(db, { runId: "r1" })).toEqual([]);
				expect(() =>
					store.recordVerdict(db, {
						...key,
						actor: "human:reviewer",
						decision: "allowed",
						evidenceRef: "approval:late",
					}),
				).toThrow("transition");
				expect(() =>
					store.recordFinish(db, {
						...key,
						actor: "system:observer",
						outcome: "completed",
						evidenceRef: "cmd:synthetic",
					}),
				).toThrow("transition");
				expect(db.query("SELECT count(*) AS n FROM audit").get()).toEqual({
					n: 2,
				});
			}
		} finally {
			db.close();
		}
	}
});

test("outcomes require prior allowance and neither duplicate verdict nor terminal reopening adds a row", () => {
	for (const outcome of [
		"completed",
		"failed",
		"interrupted",
		"timeout",
	] as const) {
		const db = store.openDb();
		try {
			store.initSchema(db);
			expect(() =>
				store.recordVerdict(db, {
					...key,
					actor: "human:reviewer",
					decision: "allowed",
					evidenceRef: "approval:test",
				}),
			).toThrow("not found");
			expect(() =>
				store.recordFinish(db, {
					...key,
					actor: "system:observer",
					outcome,
					evidenceRef: "cmd:test",
				}),
			).toThrow("not found");
			store.openAction(db, request);
			expect(() =>
				store.recordFinish(db, {
					...key,
					actor: "system:observer",
					outcome,
					evidenceRef: "cmd:test",
				}),
			).toThrow("transition");
			store.recordVerdict(db, {
				...key,
				actor: "human:reviewer",
				decision: "allowed",
				evidenceRef: "approval:test",
			});
			expect(() =>
				store.recordVerdict(db, {
					...key,
					actor: "human:reviewer",
					decision: "allowed",
					evidenceRef: "approval:duplicate",
				}),
			).toThrow("transition");
			const end = store.recordFinish(db, {
				...key,
				actor: "system:observer",
				outcome,
				evidenceRef: "cmd:test",
			});
			expect(store.getAction(db, key)).toEqual(end);
			expect(() =>
				store.recordFinish(db, {
					...key,
					actor: "system:observer",
					outcome,
					evidenceRef: "cmd:duplicate",
				}),
			).toThrow("transition");
			expect(() => store.openAction(db, request)).toThrow("already exists");
			expect(db.query("SELECT count(*) AS n FROM audit").get()).toEqual({
				n: 3,
			});
		} finally {
			db.close();
		}
	}
});

test("native input validation rejects malformed runtime identities, enums and evidence without partial writes", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		for (const patch of [
			{ runId: "" },
			{ threadId: "child space" },
			{ actionId: "not-uuid" },
			{ actionId: "00000000-0000-4000-8000-00000000000A" },
			{ runId: "x".repeat(257) },
			{ actor: "human:" },
			{ actor: 7 },
			{ tier: "unknown" },
			{ action: "edit\n" },
			{ evidenceRef: "file:" },
			{ evidenceRef: null },
			{ evidenceRef: "unknown:locator" },
			{ evidenceRef: "cmd:" + "x".repeat(4096) },
		])
			expect(() =>
				Reflect.apply(store.openAction, undefined, [
					db,
					{ ...request, ...patch },
				]),
			).toThrow();
		expect(() =>
			Reflect.apply(store.openAction, undefined, [db, null]),
		).toThrow();
		store.openAction(db, request);
		for (const decision of ["pending", "unknown", null])
			expect(() =>
				Reflect.apply(store.recordVerdict, undefined, [
					db,
					{
						...key,
						actor: "human:reviewer",
						decision,
						evidenceRef: "approval:test",
					},
				]),
			).toThrow("verdict");
		for (const outcome of ["pending", "not-executed", "unknown", null])
			expect(() =>
				Reflect.apply(store.recordFinish, undefined, [
					db,
					{
						...key,
						actor: "system:observer",
						outcome,
						evidenceRef: "cmd:test",
					},
				]),
			).toThrow("outcome");
		expect(() =>
			Reflect.apply(store.recordVerdict, undefined, [
				db,
				{ ...key, actor: "human:reviewer", decision: "allowed" },
			]),
		).toThrow("evidence");
		expect(() =>
			Reflect.apply(store.recordFinish, undefined, [
				db,
				{ ...key, actor: "system:observer", outcome: "completed" },
			]),
		).toThrow("evidence");
		expect(db.query("SELECT count(*) AS n FROM audit").get()).toEqual({ n: 1 });
	} finally {
		db.close();
	}
});

test("an incomplete newest row cannot hide unresolved history or expose an earlier success", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		store.openAction(db, request);
		store.recordVerdict(db, {
			...key,
			actor: "human:reviewer",
			decision: "allowed",
			evidenceRef: "approval:test",
		});
		store.recordFinish(db, {
			...key,
			actor: "system:observer",
			outcome: "completed",
			evidenceRef: "cmd:test",
		});
		db.query(
			"INSERT INTO audit (run_id, thread_id, action_id, action, actor, tier, decision, outcome, evidence_ref) VALUES (?, ?, ?, 'edit', NULL, 'standard', 'allowed', 'pending', 'trace:partial')",
		).run(key.runId, key.threadId, key.actionId);
		expect(db.query("SELECT * FROM latest_audit").all()).toEqual([]);
		expect(() => store.getAction(db, key)).toThrow();
		expect(() => store.listOpenActions(db, { runId: "r1" })).toThrow();
		expect(() =>
			store.listOpenActions(db, { runId: "r1", threadId: "other" }),
		).toThrow();
		expect(() =>
			store.openAction(db, {
				...request,
				actionId: "00000000-0000-4000-8000-000000000002",
			}),
		).toThrow();
		expect(db.query("SELECT count(*) AS n FROM audit").get()).toEqual({ n: 4 });
	} finally {
		db.close();
	}
});

test("queries exclude legacy claims and filter threads after selecting latest open states in ID order", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		store.appendAudit(db, {
			runId: "r1",
			action: "legacy",
			decision: "allowed",
			outcome: "completed",
		});
		store.openAction(db, { ...request, evidenceRef: "file:request" });
		const child = store.openAction(db, {
			...request,
			threadId: "child",
			actionId: "00000000-0000-4000-8000-000000000002",
			tier: "critical",
		});
		const allowed = store.recordVerdict(db, {
			...key,
			actor: "human:reviewer",
			decision: "allowed",
			evidenceRef: "approval:test",
		});
		expect(store.listOpenActions(db, { runId: "r1" })).toEqual([
			child,
			allowed,
		]);
		expect(
			store.listOpenActions(db, { runId: "r1", threadId: "child" }),
		).toEqual([child]);
		expect(
			store.listOpenActions(db, { runId: "r1", threadId: "absent" }),
		).toEqual([]);
		expect(store.listOpenActions(db, { runId: "absent" })).toEqual([]);
		for (const args of [
			{ runId: "bad run" },
			{ runId: "r1", threadId: "bad thread" },
		]) {
			expect(() => store.listOpenActions(db, args)).toThrow();
		}
	} finally {
		db.close();
	}
});

test("malformed or rebound native histories fail closed even outside the selected thread", () => {
	for (const patch of [
		{ threadId: "child" },
		{ action: "deploy" },
		{ tier: "critical" },
		{ actor: "invalid" },
		{ evidenceRef: null },
		{ decision: "pending" },
		{ createdAt: "not-a-date" },
		{ decision: "allowed", outcome: "completed" },
	]) {
		const db = store.openDb();
		try {
			store.initSchema(db);
			store.openAction(db, request);
			const event = {
				...request,
				decision: "allowed",
				outcome: "pending",
				evidenceRef: "approval:test",
				createdAt: "2026-10-23T00:00:00.000Z",
				...patch,
			};
			db.query(
				"INSERT INTO audit (run_id, thread_id, action_id, action, actor, tier, decision, outcome, evidence_ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			).run(
				event.runId,
				event.threadId,
				event.actionId,
				event.action,
				event.actor,
				event.tier,
				event.decision,
				event.outcome,
				event.evidenceRef,
				event.createdAt,
			);
			expect(() => store.getAction(db, key)).toThrow();
			expect(() =>
				store.listOpenActions(db, { runId: "r1", threadId: "other" }),
			).toThrow();
			expect(() =>
				store.recordVerdict(db, {
					...key,
					actor: "human:test",
					decision: "denied",
					evidenceRef: "approval:test",
				}),
			).toThrow();
			expect(db.query("SELECT count(*) AS n FROM audit").get()).toEqual({
				n: 2,
			});
		} finally {
			db.close();
		}
	}
	const db = store.openDb();
	try {
		store.initSchema(db);
		db.query(
			"INSERT INTO audit (run_id, action, decision, outcome, actor) VALUES ('r1', 'edit', 'allowed', 'completed', 'agent:test')",
		).run();
		expect(() => store.listOpenActions(db, { runId: "r1" })).toThrow();
	} finally {
		db.close();
	}
});

test("an attributed verdict without a request cannot masquerade as native completion", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		db.query(
			"INSERT INTO audit (run_id, thread_id, action_id, action, actor, tier, decision, outcome, evidence_ref) VALUES (?, ?, ?, 'edit', 'human:test', 'standard', 'allowed', 'completed', 'cmd:test')",
		).run(key.runId, key.threadId, key.actionId);
		expect(() => store.getAction(db, key)).toThrow("begin with a request");
		expect(() => store.listOpenActions(db, { runId: "r1" })).toThrow(
			"begin with a request",
		);
	} finally {
		db.close();
	}
});

test("nested lifecycle writes respect outer rollback and retain an earlier unresolved request", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		expect(() =>
			db
				.transaction(() => {
					store.openAction(db, request);
					throw new Error("abort request");
				})
				.immediate(),
		).toThrow("abort request");
		expect(store.getAction(db, key)).toBeNull();
		const pending = store.openAction(db, request);
		expect(() =>
			db
				.transaction(() => {
					store.recordVerdict(db, {
						...key,
						actor: "human:test",
						decision: "allowed",
						evidenceRef: "approval:test",
					});
					store.recordFinish(db, {
						...key,
						actor: "system:test",
						outcome: "completed",
						evidenceRef: "cmd:test",
					});
					throw new Error("abort finish");
				})
				.immediate(),
		).toThrow("abort finish");
		expect(store.listOpenActions(db, { runId: "r1" })).toEqual([pending]);
		expect(db.query("SELECT count(*) AS n FROM audit").get()).toEqual({ n: 1 });
	} finally {
		db.close();
	}
});

test("abrupt process exit preserves committed unresolved work but rolls back an unfinished transaction", () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-audit-recovery-");
	const path = join(dir, "store.sqlite");
	try {
		for (const stage of ["request", "allowed", "uncommitted-finish"]) {
			const child = Bun.spawnSync(
				[
					process.execPath,
					"--eval",
					`
				import * as store from ${JSON.stringify(import.meta.dir + "/../src/index.ts")};
				const db = store.openDb(${JSON.stringify(path)}); store.initSchema(db);
				const key = ${JSON.stringify(key)};
				if (${JSON.stringify(stage)} === "request") store.openAction(db, ${JSON.stringify(request)});
				if (${JSON.stringify(stage)} === "allowed") store.recordVerdict(db, {...key, actor:"human:test", decision:"allowed", evidenceRef:"approval:test"});
				if (${JSON.stringify(stage)} === "uncommitted-finish") db.transaction(() => {
					store.recordFinish(db, {...key, actor:"system:test", outcome:"completed", evidenceRef:"cmd:test"});
					process.exit(23);
				}).immediate();
				process.exit(23);
			`,
				],
				{ env: {}, stdout: "pipe", stderr: "pipe" },
			);
			expect(child.exitCode).toBe(23);
			expect(child.stderr.toString()).toBe("");
			const db = store.openDb(path);
			try {
				store.initSchema(db);
				expect(store.getAction(db, key)?.decision).toBe(
					stage === "request" ? "pending" : "allowed",
				);
				const latest = store.getAction(db, key);
				if (!latest) throw new Error("Lost committed action");
				expect(store.listOpenActions(db, { runId: "r1" })).toEqual([latest]);
			} finally {
				db.close();
			}
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("competing process writers commit one verdict and lock failure adds no row", async () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-audit-writers-");
	const path = join(dir, "store.sqlite");
	const db = store.openDb(path);
	try {
		store.initSchema(db);
		store.openAction(db, request);
		const script = `
			import * as store from ${JSON.stringify(import.meta.dir + "/../src/index.ts")};
			const db = store.openDb(${JSON.stringify(path)});
			db.exec("PRAGMA busy_timeout=2000");
			try { store.recordVerdict(db, {...${JSON.stringify(key)}, actor:"human:test", decision:"allowed", evidenceRef:"approval:test"}); }
			catch { process.exit(24); }
			db.close();
		`;
		db.transaction(() => {
			const blocked = Bun.spawnSync(
				[
					process.execPath,
					"--eval",
					script.replace("busy_timeout=2000", "busy_timeout=0"),
				],
				{ env: {}, stdout: "pipe", stderr: "pipe" },
			);
			expect(blocked.exitCode).toBe(24);
			expect(blocked.stderr.toString()).toBe("");
		}).immediate();
		expect(store.getAction(db, key)?.decision).toBe("pending");
		const children = [0, 1].map(() =>
			Bun.spawn([process.execPath, "--eval", script], {
				env: {},
				stdout: "ignore",
				stderr: "pipe",
			}),
		);
		expect(
			(await Promise.all(children.map((child) => child.exited))).sort(
				(a, b) => a - b,
			),
		).toEqual([0, 24]);
		for (const child of children)
			expect(await new Response(child.stderr).text()).toBe("");
		expect(store.getAction(db, key)?.decision).toBe("allowed");
		expect(db.query("SELECT count(*) AS n FROM audit").get()).toEqual({ n: 2 });
	} finally {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
});
