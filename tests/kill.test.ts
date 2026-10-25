import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as store from "../src/index.ts";
import { relayPolicy } from "./fixtures/relay-policy.ts";

test("v3 migration preserves old facts and adds unknown run/latch bindings without inventing authority", () => {
	const db = new Database(":memory:");
	try {
		for (const name of ["schema-v2.sql", "schema-v3.sql"])
			db.exec(
				readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
			);
		db.exec(
			"INSERT INTO leases VALUES ('ws','old-owner',7,'2026-10-24T00:00:00Z',2000)",
		);
		db.exec(
			"INSERT INTO kills VALUES ('run:old','2026-10-24T00:00:00Z','human:old','old reason')",
		);
		db.exec(
			"INSERT INTO transitions (run_id,phase,status,resume_point) VALUES ('old','legacy','committed','legacy-next')",
		);
		const actionId = "00000000-0000-4000-8000-000000000001";
		const intentId = "00000000-0000-4000-8000-000000000011";
		for (const decision of ["pending", "allowed"])
			db.query(
				"INSERT INTO audit (run_id,thread_id,action_id,action,actor,tier,decision,outcome,evidence_ref) VALUES ('old','main',?,'fixture','human:old','standard',?,'pending','trace:v3-fact')",
			).run(actionId, decision);
		db.query(
			"INSERT INTO outbox (intent_id,run_id,thread_id,workspace,action_id,kind,target,payload,payload_hash,replay) VALUES (?,'old','main','ws',?,'fixture:v3','fixture:v3','null',?,'reconcile')",
		).run(
			intentId,
			actionId,
			createHash("sha256").update("null").digest("hex"),
		);
		for (const state of ["dispatched", "unknown"])
			db.query(
				"INSERT INTO outbox_events (intent_id,attempt_id,state,owner,epoch,actor,evidence_ref) VALUES (?,'00000000-0000-4000-8000-000000000021',?,'old-owner',7,'system:outbox','trace:v3-event')",
			).run(intentId, state);
		db.exec("INSERT INTO relay_cursors VALUES ('old','main','ws',1)");
		const before = new Map(
			["audit", "transitions", "outbox", "outbox_events", "relay_cursors"].map(
				(table) => [table, db.query(`SELECT * FROM ${table}`).all()],
			),
		);
		store.initSchema(db);
		expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 5 });
		expect(db.query("SELECT * FROM leases").get()).toEqual({
			workspace: "ws",
			owner: "old-owner",
			epoch: 7,
			acquired_at: "2026-10-24T00:00:00Z",
			expires_at: 2000,
			run_id: null,
		});
		expect(db.query("SELECT event_id FROM kills").get()).toEqual({
			event_id: null,
		});
		for (const [table, rows] of before)
			expect(db.query(`SELECT * FROM ${table}`).all()).toEqual(rows);
		expect(store.getOutbox(db, intentId)?.state).toBe("unknown");
		store.initSchema(db);
		expect(
			db.query("SELECT version FROM schema_migrations ORDER BY version").all(),
		).toEqual([{ version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }]);
		store.engageKill(db, {
			scope: "run:old",
			actor: "human:operator",
			reason: "fixture adopt",
			evidenceRef: "approval:fixture-adopt",
			synthetic: true,
		});
		expect(
			store.prepareKillReset(db, { scope: "run:old" }).legacyTransitionCount,
		).toBe(1);
	} finally {
		db.close();
	}
});

const ctx = {
	runId: "r1",
	threadId: "main",
	workspace: "ws",
	owner: "worker",
	epoch: 1,
};
const transition = {
	runId: "r1",
	phase: "slice",
	status: "running",
	resumePoint: "next",
} satisfies Parameters<typeof store.recordTransition>[1];

test("native lease renewal and writes stay bound to their run without guessing legacy ownership", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		const lease = {
			runId: "r1",
			workspace: "ws",
			owner: "worker",
			ttlMs: 60_000,
		};
		store.acquireWorkspaceLease(db, lease);
		expect(() =>
			store.recordTransition(
				db,
				{ ...transition, runId: "r2" },
				{ ...ctx, runId: "r2" },
			),
		).toThrow("lease");
		expect(store.acquireWorkspaceLease(db, { ...lease, runId: "r2" }).ok).toBe(
			false,
		);
		expect(store.acquireWorkspaceLease(db, lease)).toEqual({
			ok: true,
			epoch: 1,
		});
		db.query(
			"INSERT INTO leases (workspace,owner,epoch,acquired_at,expires_at) VALUES ('legacy','worker',7,'2026-10-24T00:00:00Z',2000)",
		).run();
		expect(() =>
			store.recordTransition(db, transition, {
				...ctx,
				workspace: "legacy",
				epoch: 7,
				nowMs: 1000,
			}),
		).toThrow("lease");
		expect(
			store.acquireWorkspaceLease(db, {
				...lease,
				workspace: "legacy",
				nowMs: 1000,
			}).ok,
		).toBe(false);
		store.releaseWorkspaceLease(db, {
			workspace: "legacy",
			owner: "worker",
			epoch: 7,
			nowMs: 1000,
		});
		expect(
			store.acquireWorkspaceLease(db, {
				...lease,
				workspace: "legacy",
				nowMs: 1001,
			}),
		).toEqual({ ok: true, epoch: 8 });
	} finally {
		db.close();
	}
});

const control = {
	scope: "run:r1",
	actor: "human:operator",
	reason: "fixture stop",
	evidenceRef: "approval:fixture-stop",
	synthetic: true,
} satisfies store.KillInput;

test("run kill atomically latches and revokes only its bound lease with a critical control triple", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		store.acquireWorkspaceLease(db, {
			runId: "r1",
			workspace: "ws",
			owner: "worker",
			ttlMs: 60_000,
		});
		store.acquireWorkspaceLease(db, {
			runId: "r2",
			workspace: "other",
			owner: "other",
			ttlMs: 60_000,
		});
		const result = store.engageKill(db, control);
		expect(result).toEqual(
			expect.objectContaining({ revokedLeases: 1, alreadyEngaged: false }),
		);
		expect(store.getKillStatus(db, "r1")).toEqual(
			expect.objectContaining({ blocked: true }),
		);
		expect(store.getKillStatus(db, "r2")).toEqual(
			expect.objectContaining({ blocked: false }),
		);
		expect(
			db
				.query(
					"SELECT workspace,epoch,expires_at AS expires FROM leases ORDER BY workspace",
				)
				.all(),
		).toEqual([
			expect.objectContaining({ workspace: "other", epoch: 1 }),
			{ workspace: "ws", epoch: 2, expires: 0 },
		]);
		expect(db.query("SELECT stage FROM kill_events ORDER BY id").all()).toEqual(
			[{ stage: "requested" }, { stage: "allowed" }, { stage: "completed" }],
		);
		expect(() => store.recordTransition(db, transition, ctx)).toThrow("killed");
		expect(store.engageKill(db, control)).toEqual(
			expect.objectContaining({ alreadyEngaged: true, revokedLeases: 0 }),
		);
	} finally {
		db.close();
	}
});

function actionKey(suffix: number) {
	return {
		runId: "r1",
		threadId: "main",
		actionId: `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`,
	};
}

function open(db: Database, suffix: number, allowed = false): void {
	store.openAction(db, {
		...actionKey(suffix),
		action: "fixture",
		actor: "agent:worker",
		tier: "standard",
	});
	if (allowed)
		store.recordVerdict(db, {
			...actionKey(suffix),
			actor: "human:operator",
			decision: "allowed",
			evidenceRef: "approval:fixture",
		});
}

test("kill denies only never-admitted work, cancels linked intents and keeps late observations writable", async () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		store.acquireWorkspaceLease(db, {
			runId: "r1",
			workspace: "ws",
			owner: "worker",
			ttlMs: 60_000,
		});
		open(db, 1);
		open(db, 2, true);
		open(db, 3, true);
		const intent = (suffix: number, target: string) =>
			({
				intentId: actionKey(suffix + 10).actionId,
				actionId: actionKey(suffix).actionId,
				kind: "fixture:kill",
				target,
				payload: "null",
				replay: "reconcile",
			}) satisfies store.OutboxIntent;
		db.transaction(() => {
			store.enqueueOutbox(db, ctx, intent(2, "fixture:pending"));
			store.enqueueOutbox(db, ctx, intent(3, "fixture:inflight"));
		}).immediate();
		await store.relayBatch(db, ctx, relayPolicy(db), {
			synthetic: true,
			kind: "fixture:kill",
			target: "fixture:inflight",
			replay: "reconcile",
			execute: async () => ({
				outcome: "unknown",
				evidenceRef: "trace:unconfirmed",
			}),
		});
		expect(() =>
			store.recordVerdict(db, {
				...actionKey(2),
				actor: "human:operator",
				decision: "denied",
				evidenceRef: "approval:not-kill",
			}),
		).toThrow("transition");
		store.engageKill(db, control);
		for (const suffix of [1, 2])
			expect(store.getAction(db, actionKey(suffix))).toEqual(
				expect.objectContaining({
					decision: "denied",
					outcome: "not-executed",
					actor: "human:operator",
				}),
			);
		expect(
			store.getOutbox(db, intent(2, "fixture:pending").intentId)?.state,
		).toBe("cancelled");
		expect(store.getAction(db, actionKey(3))?.outcome).toBe("pending");
		expect(
			store.getOutbox(db, intent(3, "fixture:inflight").intentId)?.state,
		).toBe("unknown");
		expect(() => open(db, 4)).toThrow("killed");
		store.recordFinish(db, {
			...actionKey(3),
			actor: "system:observer",
			outcome: "interrupted",
			evidenceRef: "trace:late-outcome",
		});
		expect(store.getAction(db, actionKey(3))?.outcome).toBe("interrupted");
		expect(
			store
				.listUnresolvedOutbox(db, { runId: "r1" })
				.map((row) => row.actionId),
		).toEqual([actionKey(3).actionId]);
	} finally {
		db.close();
	}
});

test("reset requires a fresh native plan and host cleanup evidence and never re-grants a revoked lease", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		store.acquireWorkspaceLease(db, {
			runId: "r1",
			workspace: "ws",
			owner: "worker",
			ttlMs: 60_000,
		});
		store.engageKill(db, control);
		const plan = store.prepareKillReset(db, { scope: control.scope });
		expect(plan.blocked).toBe(false);
		const args = {
			...control,
			reason: "fixture reset",
			evidenceRef: "approval:reset-verified",
			cleanupEvidenceRef: "trace:fixture-no-execution-domain",
			snapshotHash: plan.snapshotHash,
		};
		expect(() =>
			store.resetKill(db, { ...args, cleanupEvidenceRef: "" }),
		).toThrow("evidence");
		store.resetKill(db, args);
		expect(store.getKillStatus(db, "r1").blocked).toBe(false);
		expect(() => store.recordTransition(db, transition, ctx)).toThrow("lease");
		expect(
			store.acquireWorkspaceLease(db, {
				runId: "r1",
				workspace: "ws",
				owner: "worker",
				ttlMs: 60_000,
			}),
		).toEqual({ ok: true, epoch: 3 });
		expect(
			db.query("SELECT kind,stage FROM kill_events ORDER BY id").all(),
		).toHaveLength(6);
	} finally {
		db.close();
	}
});

test("CLI status exposes kill state even when no transition exists", () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-kill-status-");
	const path = join(dir, "store.sqlite");
	try {
		const db = store.openDb(path);
		try {
			store.initSchema(db);
			store.engageKill(db, control);
		} finally {
			db.close();
		}
		const child = Bun.spawnSync(
			[
				process.execPath,
				"src/cli.ts",
				"status",
				"--db",
				path,
				"--run",
				"r1",
				"--json",
			],
			{ env: {}, stdout: "pipe", stderr: "pipe" },
		);
		expect(child.exitCode).toBe(0);
		expect(JSON.parse(child.stdout.toString())).toEqual(
			expect.objectContaining({
				kills: expect.objectContaining({ blocked: true }),
				reason: "no transitions",
			}),
		);
		expect(Object.keys(JSON.parse(child.stdout.toString()))[0]).toBe("kills");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

function ready(path = ":memory:") {
	const db = store.openDb(path);
	store.initSchema(db);
	store.acquireWorkspaceLease(db, {
		runId: "r1",
		workspace: "ws",
		owner: "worker",
		ttlMs: 60_000,
	});
	return db;
}

function resetArgs(plan: store.KillResetPlan) {
	return {
		...control,
		scope: plan.scope,
		reason: "fixture reset",
		evidenceRef: "approval:verified-plan",
		cleanupEvidenceRef: "trace:fixture-no-execution-domain",
		snapshotHash: plan.snapshotHash,
	};
}

test("reset rejects unresolved effects and stale plans; resolved history never resurrects cancelled work", async () => {
	const db = ready();
	try {
		open(db, 1, true);
		open(db, 2, true);
		const intent = (suffix: number, target: string) =>
			({
				intentId: actionKey(suffix + 10).actionId,
				actionId: actionKey(suffix).actionId,
				kind: "fixture:kill",
				target,
				payload: "null",
				replay: "reconcile",
			}) satisfies store.OutboxIntent;
		db.transaction(() => {
			store.enqueueOutbox(db, ctx, intent(1, "fixture:uncertain"));
			store.enqueueOutbox(db, ctx, intent(2, "fixture:pending"));
		}).immediate();
		await store.relayBatch(db, ctx, relayPolicy(db), {
			synthetic: true,
			kind: "fixture:kill",
			target: "fixture:uncertain",
			replay: "reconcile",
			execute: async () => ({
				outcome: "unknown",
				evidenceRef: "trace:uncertain",
			}),
		});
		store.engageKill(db, control);
		const blocked = store.prepareKillReset(db, { scope: control.scope });
		expect(blocked.blocked).toBe(true);
		expect(() => store.resetKill(db, resetArgs(blocked))).toThrow("unresolved");
		const attemptId = store.getOutbox(
			db,
			intent(1, "fixture:uncertain").intentId,
		)?.attempts[0]?.attemptId;
		if (!attemptId) throw new Error("Missing admitted attempt");
		store.reconcileOutbox(db, {
			intentId: intent(1, "fixture:uncertain").intentId,
			attemptId,
			actor: "human:operator",
			outcome: "applied",
			evidenceRef: "trace:target-verified",
		});
		store.recordFinish(db, {
			...actionKey(1),
			actor: "system:observer",
			outcome: "completed",
			evidenceRef: "trace:verified-completion",
		});
		expect(() => store.resetKill(db, resetArgs(blocked))).toThrow("stale");
		const clear = store.prepareKillReset(db, { scope: control.scope });
		expect(clear.blocked).toBe(false);
		store.resetKill(db, resetArgs(clear));
		expect(
			store.getOutbox(db, intent(2, "fixture:pending").intentId)?.state,
		).toBe("cancelled");
		expect(store.getAction(db, actionKey(2))?.outcome).toBe("not-executed");
		expect(store.listUnresolvedOutbox(db, { runId: "r1" })).toEqual([]);
		expect(() =>
			store.recordVerdict(db, {
				...actionKey(2),
				actor: "human:operator",
				decision: "allowed",
				evidenceRef: "approval:cannot-reopen",
			}),
		).toThrow("transition");
		for (const sql of [
			"UPDATE kill_events SET reason='overwrite'",
			"DELETE FROM kill_events",
			"UPDATE kill_denials SET kill_event_id=0",
			"DELETE FROM kill_denials",
			"INSERT OR REPLACE INTO kill_events SELECT * FROM kill_events WHERE id=1",
			"INSERT OR REPLACE INTO kill_denials SELECT * FROM kill_denials",
		])
			expect(() => db.exec(sql)).toThrow("append-only");
	} finally {
		db.close();
	}
});

test("kill inside a batch cancels later undispatched work but preserves the first admitted late result", async () => {
	const db = ready();
	try {
		for (const suffix of [1, 2]) {
			open(db, suffix, true);
			db.transaction(() =>
				store.enqueueOutbox(db, ctx, {
					intentId: actionKey(suffix + 10).actionId,
					actionId: actionKey(suffix).actionId,
					kind: "fixture:batch",
					target: "fixture:batch",
					payload: "null",
					replay: "idempotent",
				}),
			).immediate();
		}
		const seen: string[] = [];
		await expect(
			store.relayBatch(db, ctx, relayPolicy(db), {
				synthetic: true,
				kind: "fixture:batch",
				target: "fixture:batch",
				replay: "idempotent",
				execute: async (row) => {
					seen.push(row.intentId);
					store.engageKill(db, control);
					return { outcome: "applied", evidenceRef: "trace:late-after-kill" };
				},
			}),
		).rejects.toThrow("killed");
		expect(seen).toEqual([actionKey(11).actionId]);
		expect(store.getAction(db, actionKey(1))?.decision).toBe("allowed");
		expect(store.getOutbox(db, actionKey(11).actionId)?.state).toBe("applied");
		expect(store.getOutbox(db, actionKey(12).actionId)?.state).toBe(
			"cancelled",
		);
	} finally {
		db.close();
	}
});

test("global kill expires unknown and exhausted leases without inventing fresh authority", () => {
	const db = ready();
	try {
		open(db, 1);
		store.openAction(db, {
			...actionKey(1),
			runId: "r2",
			action: "fixture",
			actor: "agent:other",
			tier: "standard",
		});
		store.acquireWorkspaceLease(db, {
			runId: "r2",
			workspace: "other",
			owner: "other",
			ttlMs: 60_000,
		});
		db.query(
			"INSERT INTO leases (workspace,owner,epoch,acquired_at,expires_at) VALUES ('legacy','legacy',5,'2026-10-24T00:00:00Z',2000)",
		).run();
		db.query(
			"INSERT INTO leases (workspace,owner,epoch,acquired_at,expires_at,run_id) VALUES ('exhausted','worker',?,'2026-10-24T00:00:00Z',2000,'r1')",
		).run(Number.MAX_SAFE_INTEGER);
		db.query(
			"INSERT INTO leases (workspace,owner,epoch,acquired_at,expires_at,run_id) VALUES ('invalid','worker',1.5,'2026-10-24T00:00:00Z',2000,'r1')",
		).run();
		const result = store.engageKill(db, { ...control, scope: "global" });
		expect(result.revokedLeases).toBe(5);
		expect(result.ungrantableLeases).toBe(2);
		expect(store.getKillStatus(db, "r2").blocked).toBe(true);
		expect(store.getAction(db, actionKey(1))?.outcome).toBe("not-executed");
		expect(store.getAction(db, { ...actionKey(1), runId: "r2" })?.outcome).toBe(
			"not-executed",
		);
		expect(
			db
				.query(
					"SELECT epoch,run_id,expires_at FROM leases WHERE workspace='legacy'",
				)
				.get(),
		).toEqual({ epoch: 6, run_id: null, expires_at: 0 });
		store.resetKill(
			db,
			resetArgs(store.prepareKillReset(db, { scope: "global" })),
		);
		expect(() =>
			store.acquireWorkspaceLease(db, {
				runId: "r1",
				workspace: "exhausted",
				owner: "worker",
				ttlMs: 100,
				nowMs: 1000,
			}),
		).toThrow("epoch");
		expect(() =>
			store.acquireWorkspaceLease(db, {
				runId: "r1",
				workspace: "invalid",
				owner: "worker",
				ttlMs: 100,
				nowMs: 1000,
			}),
		).toThrow("epoch");
		expect(() =>
			store.recordTransition(
				db,
				{ ...transition, runId: "r2" },
				{ ...ctx, runId: "r2", workspace: "other", owner: "other" },
			),
		).toThrow("lease");
	} finally {
		db.close();
	}
});

test("legacy kill adoption preserves old latch evidence and reset clears only its selected scope", () => {
	const db = ready();
	try {
		db.query(
			"INSERT INTO kills (scope,engaged_at,actor,reason) VALUES ('run:r1','legacy-time','human:old','old reason')",
		).run();
		expect(store.getKillStatus(db, "r1").run?.eventId).toBeNull();
		expect(() => store.prepareKillReset(db, { scope: control.scope })).toThrow(
			"legacy",
		);
		store.engageKill(db, control);
		expect(
			db
				.query("SELECT previous_latch FROM kill_events ORDER BY id LIMIT 1")
				.get(),
		).toEqual({
			previous_latch: JSON.stringify({
				scope: "run:r1",
				engagedAt: "legacy-time",
				actor: "human:old",
				reason: "old reason",
				eventId: null,
			}),
		});
		store.engageKill(db, { ...control, scope: "global" });
		store.resetKill(
			db,
			resetArgs(store.prepareKillReset(db, { scope: control.scope })),
		);
		expect(store.getKillStatus(db, "r1").blocked).toBe(true);
		expect(store.getKillStatus(db, "r1").run).toBeNull();
		store.resetKill(
			db,
			resetArgs(store.prepareKillReset(db, { scope: "global" })),
		);
		expect(store.getKillStatus(db, "r1").blocked).toBe(false);
	} finally {
		db.close();
	}
});

test("unrelated run activity does not stale a scoped plan, but in-scope legacy evidence does", () => {
	const db = ready();
	try {
		store.engageKill(db, control);
		const first = store.prepareKillReset(db, { scope: control.scope });
		store.acquireWorkspaceLease(db, {
			runId: "r2",
			workspace: "other",
			owner: "other",
			ttlMs: 60_000,
		});
		expect(
			store.prepareKillReset(db, { scope: control.scope }).snapshotHash,
		).toBe(first.snapshotHash);
		store.appendAudit(db, {
			runId: "r1",
			action: "legacy-observation",
			decision: "allowed",
			outcome: "interrupted",
			evidenceRef: "trace:legacy-fact",
		});
		expect(() => store.resetKill(db, resetArgs(first))).toThrow("stale");
		const current = store.prepareKillReset(db, { scope: control.scope });
		expect(current.legacyAuditCount).toBe(1);
		store.resetKill(db, resetArgs(current));
	} finally {
		db.close();
	}
});

test("failed denial insertion rolls back the whole kill rather than leaving partial revocation", () => {
	const db = ready();
	try {
		open(db, 1);
		// Native SQL fault fixture, not a mock of a private implementation.
		db.exec(
			"CREATE TEMP TRIGGER fail_kill BEFORE INSERT ON main.audit WHEN NEW.outcome='not-executed' BEGIN SELECT RAISE(ABORT,'fixture denial failure'); END",
		);
		expect(() => store.engageKill(db, control)).toThrow(
			"fixture denial failure",
		);
		expect(store.getKillStatus(db, "r1").blocked).toBe(false);
		expect(db.query("SELECT count(*) AS n FROM kill_events").get()).toEqual({
			n: 0,
		});
		expect(
			db.query("SELECT epoch FROM leases WHERE workspace='ws'").get(),
		).toEqual({ epoch: 1 });
		expect(store.getAction(db, actionKey(1))?.decision).toBe("pending");
		expect(() => store.recordTransition(db, transition, ctx)).not.toThrow();
	} finally {
		db.close();
	}
});

test("control input validation and malformed native history fail explicitly without weakening kill admission", () => {
	const db = ready();
	try {
		for (const patch of [
			{ actor: "agent:worker" },
			{ actor: "system:auto" },
			{ synthetic: false },
			{ scope: "thread:main" },
			{ scope: "run:" },
			{ reason: "" },
			{ evidenceRef: "bad" },
			{ extra: true },
		])
			expect(() =>
				Reflect.apply(store.engageKill, undefined, [
					db,
					{ ...control, ...patch },
				]),
			).toThrow();
		expect(() =>
			db.transaction(() => store.engageKill(db, control)).immediate(),
		).toThrow("caller transaction");
		expect(db.query("SELECT count(*) AS n FROM kill_events").get()).toEqual({
			n: 0,
		});
		expect(() => store.prepareKillReset(db, { scope: control.scope })).toThrow(
			"not engaged",
		);
		const malformed = db
			.query<{ id: number }, []>(
				"INSERT INTO kill_events (operation_id,scope,kind,stage,actor,reason,evidence_ref) VALUES ('00000000-0000-4000-8000-000000000099','run:r1','engage','requested','human:test','fixture','trace:fixture') RETURNING id",
			)
			.get();
		if (!malformed) throw new Error("Missing malformed fixture");
		db.query(
			"INSERT INTO kills (scope,engaged_at,actor,reason,event_id) VALUES ('run:r1','fixture','human:test','fixture',?)",
		).run(malformed.id);
		expect(() => store.getKillStatus(db, "r1")).toThrow("triple");
		expect(() => store.prepareKillReset(db, { scope: control.scope })).toThrow(
			"triple",
		);
		expect(() => store.engageKill(db, control)).toThrow("triple");
		expect(() => store.recordTransition(db, transition, ctx)).toThrow("killed");
	} finally {
		db.close();
	}
});

test("an applied intent with another unknown admitted attempt still blocks reset", async () => {
	const db = ready();
	try {
		open(db, 1, true);
		const intentId = actionKey(11).actionId;
		db.transaction(() =>
			store.enqueueOutbox(db, ctx, {
				intentId,
				actionId: actionKey(1).actionId,
				kind: "fixture:overlap",
				target: "fixture:overlap",
				payload: "null",
				replay: "idempotent",
			}),
		).immediate();
		let release: () => void = () => {};
		let entered: () => void = () => {};
		const hold = new Promise<void>((resolve) => {
			release = resolve;
		});
		const firstEntered = new Promise<void>((resolve) => {
			entered = resolve;
		});
		let calls = 0;
		const adapter: store.SyntheticOutboxAdapter = {
			synthetic: true,
			kind: "fixture:overlap",
			target: "fixture:overlap",
			replay: "idempotent",
			execute: async () => {
				calls++;
				if (calls === 1) {
					entered();
					await hold;
					return { outcome: "unknown", evidenceRef: "trace:original-no-ack" };
				}
				return { outcome: "applied", evidenceRef: "trace:dedup-applied" };
			},
		};
		const first = store.relayBatch(db, ctx, relayPolicy(db), adapter);
		await firstEntered;
		try {
			await store.relayBatch(db, ctx, relayPolicy(db), adapter);
		} finally {
			release();
		}
		await first;
		expect(store.getOutbox(db, intentId)?.state).toBe("applied");
		store.engageKill(db, control);
		store.recordFinish(db, {
			...actionKey(1),
			actor: "system:observer",
			outcome: "completed",
			evidenceRef: "trace:target-known-applied",
		});
		const blocked = store.prepareKillReset(db, { scope: control.scope });
		expect(blocked.blocked).toBe(true);
		expect(() => store.resetKill(db, resetArgs(blocked))).toThrow("unresolved");
		const unknown = store
			.getOutbox(db, intentId)
			?.attempts.find((attempt) => attempt.state === "unknown");
		if (!unknown) throw new Error("Missing unknown attempt");
		store.reconcileOutbox(db, {
			intentId,
			attemptId: unknown.attemptId,
			actor: "human:operator",
			outcome: "applied",
			evidenceRef: "trace:dedup-key-verified",
		});
		store.resetKill(
			db,
			resetArgs(store.prepareKillReset(db, { scope: control.scope })),
		);
	} finally {
		db.close();
	}
});

test("any prior admission is excluded from automatic non-execution denial, even if later proven not applied", async () => {
	const db = ready();
	try {
		open(db, 1, true);
		const intentId = actionKey(11).actionId;
		db.transaction(() =>
			store.enqueueOutbox(db, ctx, {
				intentId,
				actionId: actionKey(1).actionId,
				kind: "fixture:known-absent",
				target: "fixture:known-absent",
				payload: "null",
				replay: "reconcile",
			}),
		).immediate();
		const adapter: store.SyntheticOutboxAdapter = {
			synthetic: true,
			kind: "fixture:known-absent",
			target: "fixture:known-absent",
			replay: "reconcile",
			execute: async () => ({
				outcome: "unknown",
				evidenceRef: "trace:unconfirmed",
			}),
		};
		await store.relayBatch(db, ctx, relayPolicy(db), adapter);
		const attempt = store.getOutbox(db, intentId)?.attempts[0];
		if (!attempt) throw new Error("Missing admission");
		store.reconcileOutbox(db, {
			intentId,
			attemptId: attempt.attemptId,
			actor: "human:operator",
			outcome: "not-applied",
			evidenceRef: "trace:verified-absent",
		});
		store.engageKill(db, control);
		expect(store.getAction(db, actionKey(1))?.decision).toBe("allowed");
		expect(store.getOutbox(db, intentId)?.state).toBe("pending");
		store.recordFinish(db, {
			...actionKey(1),
			actor: "system:observer",
			outcome: "interrupted",
			evidenceRef: "trace:closed-after-reconciliation",
		});
		store.resetKill(
			db,
			resetArgs(store.prepareKillReset(db, { scope: control.scope })),
		);
		expect(
			store.acquireWorkspaceLease(db, {
				runId: "r1",
				workspace: "ws",
				owner: "worker",
				ttlMs: 60_000,
			}),
		).toEqual({ ok: true, epoch: 3 });
		await expect(
			store.relayBatch(db, { ...ctx, epoch: 3 }, relayPolicy(db), adapter),
		).rejects.toThrow("allowed unresolved");
	} finally {
		db.close();
	}
});

test("malformed latch and forged denial proof fail closed; guarded reset rejects invalid authority inputs", () => {
	const db = ready();
	try {
		open(db, 1);
		const engaged = store.engageKill(db, control);
		const plan = store.prepareKillReset(db, { scope: control.scope });
		for (const patch of [
			{ actor: "agent:fake" },
			{ synthetic: false },
			{ snapshotHash: "stale" },
			{ cleanupEvidenceRef: null },
			{ extra: true },
		])
			expect(() =>
				Reflect.apply(store.resetKill, undefined, [
					db,
					{ ...resetArgs(plan), ...patch },
				]),
			).toThrow();
		expect(() =>
			db.transaction(() => store.resetKill(db, resetArgs(plan))).immediate(),
		).toThrow("caller transaction");
		const foreign = actionKey(2);
		db.query(
			"INSERT INTO audit (run_id,thread_id,action_id,action,actor,tier,decision,outcome) VALUES ('r2','main',?,'fixture','agent:worker','standard','pending','pending')",
		).run(foreign.actionId);
		const forged = db
			.query<{ id: number }, [string, string]>(
				"INSERT INTO audit (run_id,thread_id,action_id,action,actor,tier,decision,outcome,evidence_ref) VALUES ('r2','main',?,'fixture','human:operator','standard','denied','not-executed',?) RETURNING id",
			)
			.get(foreign.actionId, `trace:kill-event-${engaged.latch.eventId}`);
		if (!forged) throw new Error("Missing forged fixture");
		db.query("INSERT INTO kill_denials VALUES (?, ?)").run(
			forged.id,
			engaged.latch.eventId,
		);
		expect(() => store.getAction(db, { ...foreign, runId: "r2" })).toThrow(
			"proof",
		);
		db.query("UPDATE kills SET reason='mismatched' WHERE scope='run:r1'").run();
		expect(() => store.getKillStatus(db, "r1")).toThrow("mismatch");
		expect(() => store.recordTransition(db, transition, ctx)).toThrow("killed");
	} finally {
		db.close();
	}
});

test("committed kill survives abrupt process exit and competing resets clear the latch only once", async () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-kill-recovery-");
	const path = join(dir, "store.sqlite");
	try {
		const initial = ready(path);
		initial.close();
		const killed = Bun.spawnSync(
			[
				process.execPath,
				"--eval",
				`
			import * as s from ${JSON.stringify(import.meta.dir + "/../src/index.ts")};
			const db=s.openDb(${JSON.stringify(path)}); s.initSchema(db); s.engageKill(db, ${JSON.stringify(control)}); process.exit(23);
		`,
			],
			{ env: {}, stdout: "pipe", stderr: "pipe" },
		);
		expect(killed.exitCode).toBe(23);
		expect(killed.stderr.toString()).toBe("");
		const db = store.openDb(path);
		let args: ReturnType<typeof resetArgs>;
		try {
			expect(store.getKillStatus(db, "r1").blocked).toBe(true);
			expect(() => store.recordTransition(db, transition, ctx)).toThrow(
				"killed",
			);
			args = resetArgs(store.prepareKillReset(db, { scope: control.scope }));
		} finally {
			db.close();
		}
		const script = `
			import * as s from ${JSON.stringify(import.meta.dir + "/../src/index.ts")};
			const db=s.openDb(${JSON.stringify(path)}); db.exec('PRAGMA busy_timeout=5000');
			console.log('ready'); await Bun.stdin.text();
			try { s.resetKill(db, ${JSON.stringify(args)}); } catch { process.exit(24); }
			db.close();
		`;
		const launch = () =>
			Bun.spawn([process.execPath, "--eval", script], {
				env: {},
				stdin: "pipe",
				stdout: "pipe",
				stderr: "pipe",
			});
		const children: ReturnType<typeof launch>[] = [];
		try {
			// Recover/open sequentially; the readiness barrier races reset operations, not WAL recovery.
			for (const _ of [0, 1]) {
				const child = launch();
				children.push(child);
				const reader = child.stdout.getReader();
				const message = await reader.read();
				reader.releaseLock();
				if (message.done)
					expect(await new Response(child.stderr).text()).toBe("");
				expect(new TextDecoder().decode(message.value).trim()).toBe("ready");
			}
			for (const child of children) child.stdin.end();
			expect(
				(await Promise.all(children.map((child) => child.exited))).sort(),
			).toEqual([0, 24]);
			for (const child of children)
				expect(await new Response(child.stderr).text()).toBe("");
		} finally {
			for (const child of children) {
				child.stdin.end();
				if (child.exitCode === null) child.kill();
			}
			await Promise.all(children.map((child) => child.exited));
		}
		const reopened = store.openDb(path);
		try {
			expect(store.getKillStatus(reopened, "r1").blocked).toBe(false);
			expect(
				reopened.query("SELECT count(*) AS n FROM kill_events").get(),
			).toEqual({ n: 6 });
			expect(() => store.recordTransition(reopened, transition, ctx)).toThrow(
				"lease",
			);
		} finally {
			reopened.close();
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a contradictory orphan outbox observation invalidates historical kill non-execution proof", () => {
	const db = ready();
	try {
		open(db, 1, true);
		const intentId = actionKey(11).actionId;
		db.transaction(() =>
			store.enqueueOutbox(db, ctx, {
				intentId,
				actionId: actionKey(1).actionId,
				kind: "fixture:proof",
				target: "fixture:proof",
				payload: "null",
				replay: "idempotent",
			}),
		).immediate();
		store.engageKill(db, control);
		db.query(
			"INSERT INTO outbox_events (intent_id,attempt_id,state,owner,epoch,actor,evidence_ref) VALUES (?,?,'unknown','worker',1,'system:outbox','trace:orphan')",
		).run(intentId, actionKey(21).actionId);
		expect(() => store.getAction(db, actionKey(1))).toThrow("proof");
		expect(() => store.getOutbox(db, intentId)).toThrow();
	} finally {
		db.close();
	}
});

test("raw legacy kill flags block new approval but still permit terminal bookkeeping", () => {
	const db = ready();
	try {
		open(db, 1);
		db.query(
			"INSERT INTO kills (scope,engaged_at,actor,reason) VALUES ('run:r1','fixture','human:operator','legacy flag')",
		).run();
		for (const decision of ["allowed", "escalated"] as const)
			expect(() =>
				store.recordVerdict(db, {
					...actionKey(1),
					actor: "human:operator",
					decision,
					evidenceRef: "approval:too-late",
				}),
			).toThrow("killed");
		store.recordVerdict(db, {
			...actionKey(1),
			actor: "human:operator",
			decision: "denied",
			evidenceRef: "approval:observed-denial",
		});
		expect(store.getAction(db, actionKey(1))?.outcome).toBe("not-executed");
	} finally {
		db.close();
	}
});

test("ignored latch deletion rolls back reset audit and cannot falsely report a cleared kill", () => {
	const db = ready();
	try {
		store.engageKill(db, control);
		const plan = store.prepareKillReset(db, { scope: control.scope });
		db.exec(
			"CREATE TEMP TRIGGER ignore_reset BEFORE DELETE ON main.kills BEGIN SELECT RAISE(IGNORE); END",
		);
		expect(() => store.resetKill(db, resetArgs(plan))).toThrow("latch changed");
		expect(store.getKillStatus(db, "r1").blocked).toBe(true);
		expect(db.query("SELECT count(*) AS n FROM kill_events").get()).toEqual({
			n: 3,
		});
	} finally {
		db.close();
	}
});

test("invalid native control event IDs fail explicitly while presence still blocks admission", () => {
	const db = ready();
	try {
		db.exec(
			"INSERT INTO kill_events (id,operation_id,scope,kind,stage,actor,reason,evidence_ref) VALUES (0,'00000000-0000-4000-8000-000000000099','run:r1','engage','requested','human:operator','fixture','trace:fixture')",
		);
		db.exec(
			"INSERT INTO kills (scope,engaged_at,actor,reason,event_id) VALUES ('run:r1','fixture','human:operator','fixture',0)",
		);
		expect(() => store.getKillStatus(db, "r1")).toThrow("Invalid kill history");
		expect(() => store.recordTransition(db, transition, ctx)).toThrow("killed");
	} finally {
		db.close();
	}
});

test("status reads a consistent snapshot while another process atomically switches legacy kill scopes", async () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-kill-status-race-");
	const path = join(dir, "store.sqlite");
	const db = ready(path);
	try {
		db.query(
			"INSERT INTO kills (scope,engaged_at,actor,reason) VALUES ('run:r1','fixture','human:operator','legacy scope fixture')",
		).run();
		const child = Bun.spawn(
			[
				process.execPath,
				"--eval",
				`
			import * as s from ${JSON.stringify(import.meta.dir + "/../src/index.ts")};
			const db=s.openDb(${JSON.stringify(path)}); db.exec('PRAGMA busy_timeout=5000');
			const flip=db.transaction(() => db.query("UPDATE kills SET scope=CASE scope WHEN 'global' THEN 'run:r1' ELSE 'global' END").run());
			console.log('ready'); await Bun.stdin.text();
			for (let i=0;i<1000;i++) flip.immediate();
			db.close();
		`,
			],
			{ env: {}, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
		);
		try {
			const reader = child.stdout.getReader();
			const message = await reader.read();
			reader.releaseLock();
			expect(new TextDecoder().decode(message.value).trim()).toBe("ready");
			child.stdin.end();
			let falseClears = 0;
			for (let i = 0; i < 100_000; i++)
				if (!store.getKillStatus(db, "r1").blocked) falseClears++;
			expect(await child.exited).toBe(0);
			expect(await new Response(child.stderr).text()).toBe("");
			expect(falseClears).toBe(0);
		} finally {
			child.stdin.end();
			if (child.exitCode === null) child.kill();
			await child.exited;
		}
	} finally {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

test("global revocation expires malformed legacy NULL-key leases without guessing a workspace", () => {
	const db = ready();
	try {
		db.query(
			"INSERT INTO leases (workspace,owner,epoch,acquired_at,expires_at) VALUES (NULL,'legacy',5,'2026-10-24T00:00:00Z',2000)",
		).run();
		store.engageKill(db, { ...control, scope: "global" });
		expect(
			db
				.query("SELECT epoch,expires_at FROM leases WHERE workspace IS NULL")
				.get(),
		).toEqual({ epoch: 6, expires_at: 0 });
	} finally {
		db.close();
	}
});

test("an ignored revocation cannot publish a successful partial kill", () => {
	const db = ready();
	try {
		db.exec(
			"CREATE TEMP TRIGGER ignore_revoke BEFORE UPDATE ON main.leases BEGIN SELECT RAISE(IGNORE); END",
		);
		expect(() => store.engageKill(db, control)).toThrow("revocation");
		expect(store.getKillStatus(db, "r1").blocked).toBe(false);
		expect(db.query("SELECT count(*) AS n FROM kill_events").get()).toEqual({
			n: 0,
		});
		expect(
			db.query("SELECT epoch FROM leases WHERE workspace='ws'").get(),
		).toEqual({ epoch: 1 });
	} finally {
		db.close();
	}
});

test("ignored kill-denial link rolls back latch, revocation, control audit and action cancellation", () => {
	const db = ready();
	try {
		open(db, 1, true);
		const intentId = actionKey(11).actionId;
		db.transaction(() =>
			store.enqueueOutbox(db, ctx, {
				intentId,
				actionId: actionKey(1).actionId,
				kind: "fixture:ignored-link",
				target: "fixture:ignored-link",
				payload: "null",
				replay: "idempotent",
			}),
		).immediate();
		const action = store.getAction(db, actionKey(1));
		const intent = store.getOutbox(db, intentId);
		const lease = db.query("SELECT * FROM leases").get();
		db.exec(
			"CREATE TEMP TRIGGER ignore_kill_denial BEFORE INSERT ON main.kill_denials BEGIN SELECT RAISE(IGNORE); END",
		);
		expect(() => store.engageKill(db, control)).toThrow("denial");
		expect(store.getKillStatus(db, "r1").blocked).toBe(false);
		expect(db.query("SELECT * FROM leases").get()).toEqual(lease);
		expect(store.getAction(db, actionKey(1))).toEqual(action);
		expect(store.getOutbox(db, intentId)).toEqual(intent);
		expect(db.query("SELECT count(*) AS n FROM kill_events").get()).toEqual({
			n: 0,
		});
		expect(db.query("SELECT count(*) AS n FROM kill_denials").get()).toEqual({
			n: 0,
		});
	} finally {
		db.close();
	}
});

test("ignored legacy latch adoption cannot publish a completed native kill", () => {
	for (const fault of ["ignore", "drop-reference"]) {
		const db = ready();
		try {
			open(db, 1, true);
			db.query(
				"INSERT INTO kills (scope,engaged_at,actor,reason) VALUES ('run:r1','legacy','human:old','legacy stop')",
			).run();
			const latch = store.getKillStatus(db, "r1").run;
			const lease = db.query("SELECT * FROM leases").get();
			const action = store.getAction(db, actionKey(1));
			db.exec(
				fault === "ignore"
					? "CREATE TEMP TRIGGER ignore_latch_adoption BEFORE UPDATE ON main.kills BEGIN SELECT RAISE(IGNORE); END"
					: "CREATE TEMP TRIGGER drop_latch_reference AFTER UPDATE OF event_id ON main.kills WHEN NEW.event_id IS NOT NULL BEGIN UPDATE kills SET event_id=NULL WHERE scope=NEW.scope; END",
			);
			expect(() => store.engageKill(db, control)).toThrow("latch");
			expect(store.getKillStatus(db, "r1").run).toEqual(latch);
			expect(db.query("SELECT * FROM leases").get()).toEqual(lease);
			expect(store.getAction(db, actionKey(1))).toEqual(action);
			expect(db.query("SELECT count(*) AS n FROM kill_events").get()).toEqual({
				n: 0,
			});
		} finally {
			db.close();
		}
	}
});
