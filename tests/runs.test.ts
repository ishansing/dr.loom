import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as s from "../src/index.ts";

test("current schema includes immutable run metadata and evidence links without inventing runs", () => {
	const db = s.openDb();
	try {
		s.initSchema(db);
		expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 5 });
		expect(db.query("SELECT count(*) AS n FROM runs").get()).toEqual({ n: 0 });
		expect(
			db.query("SELECT count(*) AS n FROM transition_evidence").get(),
		).toEqual({ n: 0 });
	} finally {
		db.close();
	}
});

test("fixed v4 migrates to v5 without inventing run identities or rewriting prior audit", () => {
	const db = new Database(":memory:");
	try {
		for (const name of ["schema-v2.sql", "schema-v3.sql", "schema-v4.sql"])
			db.exec(
				readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
			);
		s.appendAudit(db, {
			runId: "historical",
			action: "old",
			decision: "allowed",
			outcome: "completed",
		});
		const before = db.query("SELECT * FROM audit").all();
		s.initSchema(db);
		expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 5 });
		expect(db.query("SELECT * FROM audit").all()).toEqual(before);
		expect(db.query("SELECT * FROM runs").all()).toEqual([]);
		expect(db.query("SELECT * FROM transition_evidence").all()).toEqual([]);
		expect(
			db.query("SELECT version FROM schema_migrations ORDER BY version").all(),
		).toEqual([{ version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }]);
	} finally {
		db.close();
	}
});

const context = {
	runId: "fixture-run",
	threadId: "main",
	workspace: "fixture:workspace",
	owner: "operator",
	epoch: 1,
	nowMs: 1000,
};
const metadata = {
	runId: context.runId,
	runbook: "fixture-golden",
	goal: "Synthetic operator bookkeeping",
	scale: "small",
	frameworkCommit: "1".repeat(40),
	frameworkVersion: "2.1.0",
	frameworkLockSha256: "2".repeat(64),
} satisfies s.RunInput;

test("run initialization persists metadata and opening evidence under the existing live gate", () => {
	const db = s.openDb();
	try {
		s.initSchema(db);
		s.acquireWorkspaceLease(db, {
			runId: context.runId,
			workspace: context.workspace,
			owner: context.owner,
			ttlMs: 10000,
			nowMs: 1000,
		});
		const run = s.initRun(db, metadata, context);
		expect(run.runbook).toBe("fixture-golden");
		expect(s.getRun(db, context.runId)).toEqual(run);
		expect(s.getLastTransition(db, context.runId, "main")?.phase).toBe("init");
		expect(() => s.initRun(db, metadata, context)).toThrow("already");
	} finally {
		db.close();
	}
});

test("registered run records one open phase per thread and closes only that phase with all evidence", () => {
	const db = s.openDb();
	try {
		s.initSchema(db);
		s.acquireWorkspaceLease(db, {
			runId: context.runId,
			workspace: context.workspace,
			owner: context.owner,
			ttlMs: 10000,
			nowMs: 1000,
		});
		s.initRun(db, metadata, context);
		s.recordRunTransition(
			db,
			{ phase: "implement", status: "running", resumePoint: "work" },
			context,
		);
		expect(() =>
			s.recordRunTransition(
				db,
				{ phase: "review", status: "running", resumePoint: "review" },
				context,
			),
		).toThrow("still running");
		expect(() =>
			s.recordRunTransition(
				db,
				{ phase: "review", status: "committed", resumePoint: "next" },
				context,
			),
		).toThrow("matching running");
		const closed = s.recordRunTransition(
			db,
			{
				phase: "implement",
				status: "committed",
				resumePoint: "review",
				evidenceRefs: ["cmd:bun test", "trace:fixture"],
			},
			context,
		);
		expect(closed.evidenceRefs).toEqual(["cmd:bun test", "trace:fixture"]);
		expect(() =>
			s.recordRunTransition(
				db,
				{ phase: "implement", status: "committed", resumePoint: "review" },
				context,
			),
		).toThrow("matching running");
	} finally {
		db.close();
	}
});

test("resume bundle separates last committed work, running phase and awaiting-human action", () => {
	const db = s.openDb();
	try {
		s.initSchema(db);
		s.acquireWorkspaceLease(db, {
			runId: context.runId,
			workspace: context.workspace,
			owner: context.owner,
			ttlMs: 10000,
			nowMs: 1000,
		});
		s.initRun(db, metadata, context);
		s.recordRunTransition(
			db,
			{ phase: "implement", status: "running", resumePoint: "work" },
			context,
		);
		s.recordRunTransition(
			db,
			{
				phase: "implement",
				status: "committed",
				resumePoint: "review",
				evidenceRefs: ["trace:proof"],
			},
			context,
		);
		s.recordRunTransition(
			db,
			{ phase: "review", status: "running", resumePoint: "inspect" },
			context,
		);
		s.openAction(db, {
			runId: context.runId,
			threadId: "main",
			actionId: "00000000-0000-4000-8000-000000000101",
			action: "fixture:approval",
			actor: "agent:fixture",
			tier: "high-risk",
		});
		const interrupted = {
			runId: context.runId,
			threadId: "main",
			actionId: "00000000-0000-4000-8000-000000000102",
		};
		s.openAction(db, {
			...interrupted,
			action: "fixture:interruption",
			actor: "agent:fixture",
			tier: "standard",
		});
		s.recordVerdict(db, {
			...interrupted,
			actor: "human:fixture",
			decision: "allowed",
			evidenceRef: "approval:fixture",
		});
		s.recordFinish(db, {
			...interrupted,
			actor: "system:fixture",
			outcome: "interrupted",
			evidenceRef: "trace:interrupted",
		});
		s.setBudgetLimit(db, {
			runId: context.runId,
			kind: "cost-tokens",
			limit: null,
		});
		s.recordUsage(db, {
			runId: context.runId,
			threadId: "main",
			kind: "cost-tokens",
			amount: 7,
			evidenceRef: "trace:synthetic",
		});
		const status = s.getRunStatus(db, context.runId);
		expect(status.run?.goal).toBe(metadata.goal);
		expect(status.threads[0]?.lastCommitted?.phase).toBe("implement");
		expect(status.threads[0]?.running?.phase).toBe("review");
		expect(status.openActions).toHaveLength(1);
		expect(status.interruptedActions[0]?.outcome).toBe("interrupted");
		expect(status.budgets[0]?.mode).toBe("meter-only");
		expect(status.threads[0]?.lastCommitted?.evidenceRefs).toEqual([
			"trace:proof",
		]);
	} finally {
		db.close();
	}
});

test("failed init cannot leave metadata, transitions or evidence partially committed", () => {
	for (const table of ["runs", "transition_evidence"]) {
		const db = s.openDb();
		try {
			s.initSchema(db);
			s.acquireWorkspaceLease(db, {
				runId: context.runId,
				workspace: context.workspace,
				owner: context.owner,
				ttlMs: 10000,
				nowMs: 1000,
			});
			db.exec(
				`CREATE TRIGGER ignore_init BEFORE INSERT ON ${table} BEGIN SELECT RAISE(IGNORE); END`,
			);
			expect(() => s.initRun(db, metadata, context)).toThrow("persist");
			for (const name of ["runs", "transitions", "transition_evidence"])
				expect(db.query(`SELECT count(*) AS n FROM ${name}`).get()).toEqual({
					n: 0,
				});
		} finally {
			db.close();
		}
	}
});

test("run/evidence histories reject update, delete and replace operations", () => {
	const db = s.openDb();
	try {
		s.initSchema(db);
		s.acquireWorkspaceLease(db, {
			runId: context.runId,
			workspace: context.workspace,
			owner: context.owner,
			ttlMs: 10000,
			nowMs: 1000,
		});
		s.initRun(db, metadata, context);
		for (const table of ["runs", "transition_evidence"]) {
			expect(() => db.exec(`DELETE FROM ${table}`)).toThrow("append-only");
			expect(() =>
				db.exec(`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table}`),
			).toThrow("append-only");
		}
		expect(() => db.exec("UPDATE runs SET goal='changed'")).toThrow(
			"append-only",
		);
		expect(() =>
			db.exec("UPDATE transition_evidence SET evidence_ref='trace:changed'"),
		).toThrow("append-only");
	} finally {
		db.close();
	}
});

test("existing-store opening never creates missing files and readonly connections reject writes", () => {
	const dir = mkdtempSync("/tmp/opencode/loom-existing-store-");
	const path = join(dir, "store.sqlite");
	try {
		expect(() => s.openExistingDb(path, true)).toThrow();
		expect(existsSync(path)).toBe(false);
		const initial = s.openDb(path);
		s.initSchema(initial);
		initial.close();
		const readonly = s.openExistingDb(path, true);
		try {
			expect(() =>
				readonly.exec(
					"INSERT INTO kills (scope,engaged_at,actor,reason) VALUES ('global','fixture','human:fixture','fixture')",
				),
			).toThrow();
		} finally {
			readonly.close();
		}
		const writable = s.openExistingDb(path);
		writable.close();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("real competing phase writers cannot both open a registered thread", async () => {
	const dir = mkdtempSync("/tmp/opencode/loom-run-phase-race-");
	const path = join(dir, "store.sqlite");
	const db = s.openDb(path);
	const children = [];
	try {
		s.initSchema(db);
		s.acquireWorkspaceLease(db, {
			runId: context.runId,
			workspace: context.workspace,
			owner: context.owner,
			ttlMs: 60000,
		});
		const { nowMs: _, ...ctx } = context;
		s.initRun(db, metadata, ctx);
		const script = `import * as s from ${JSON.stringify(import.meta.dir + "/../src/index.ts")}; const db=s.openExistingDb(${JSON.stringify(path)}); db.exec('PRAGMA busy_timeout=5000'); console.log('ready'); await Bun.stdin.text(); try {s.recordRunTransition(db,{phase:'work',status:'running',resumePoint:'fixture'},${JSON.stringify(ctx)});db.close();} catch(error) {db.close();process.exit(error instanceof Error && error.message.includes('still running') ? 24 : 25);}`;
		for (let i = 0; i < 2; i++) {
			const child = Bun.spawn([process.execPath, "--eval", script], {
				env: {},
				stdin: "pipe",
				stdout: "pipe",
				stderr: "pipe",
			});
			children.push(child);
			const reader = child.stdout.getReader();
			expect(new TextDecoder().decode((await reader.read()).value)).toBe(
				"ready\n",
			);
			reader.releaseLock();
		}
		for (const child of children) child.stdin.end();
		expect(
			(await Promise.all(children.map((child) => child.exited))).sort(),
		).toEqual([0, 24]);
		for (const child of children)
			expect(await new Response(child.stderr).text()).toBe("");
		expect(s.getRunStatus(db, context.runId).threads[0]?.running?.phase).toBe(
			"work",
		);
	} finally {
		for (const child of children) {
			child.kill();
			await child.exited;
		}
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

test("file evidence needs a real locator before its SHA256 pin", () => {
	const db = s.openDb();
	try {
		s.initSchema(db);
		s.acquireWorkspaceLease(db, {
			runId: context.runId,
			workspace: context.workspace,
			owner: context.owner,
			ttlMs: 10000,
			nowMs: 1000,
		});
		s.initRun(db, metadata, context);
		s.recordRunTransition(
			db,
			{ phase: "verify", status: "running", resumePoint: "verify" },
			context,
		);
		expect(() =>
			s.recordRunTransition(
				db,
				{
					phase: "verify",
					status: "committed",
					resumePoint: "review",
					evidenceRefs: [`file:@sha256:${"0".repeat(64)}`],
				},
				context,
			),
		).toThrow("file references");
		expect(s.getRunStatus(db, context.runId).threads[0]?.running?.phase).toBe(
			"verify",
		);
	} finally {
		db.close();
	}
});

test("threads have independent phases and failed/interrupted closures are never committed work", () => {
	const db = s.openDb();
	try {
		s.initSchema(db);
		s.acquireWorkspaceLease(db, {
			runId: context.runId,
			workspace: context.workspace,
			owner: context.owner,
			ttlMs: 10000,
			nowMs: 1000,
		});
		s.initRun(db, metadata, context);
		const worker = { ...context, threadId: "worker" };
		s.recordRunTransition(
			db,
			{ phase: "work", status: "running", resumePoint: "work" },
			context,
		);
		s.recordRunTransition(
			db,
			{ phase: "analysis", status: "running", resumePoint: "analysis" },
			worker,
		);
		s.recordRunTransition(
			db,
			{ phase: "work", status: "failed", resumePoint: "diagnose" },
			context,
		);
		s.recordRunTransition(
			db,
			{ phase: "analysis", status: "interrupted", resumePoint: "reconcile" },
			worker,
		);
		const status = s.getRunStatus(db, context.runId);
		expect(status.threads.map((thread) => thread.running)).toEqual([
			null,
			null,
		]);
		expect(status.threads[0]?.lastCommitted?.phase).toBe("init");
		expect(status.threads[1]?.lastCommitted).toBeNull();
		expect(status.threads[1]?.latest.resumePoint).toBe("reconcile");
	} finally {
		db.close();
	}
});

test("metadata validation, unknown runs and historical identities fail without adopting old claims", () => {
	const db = s.openDb();
	try {
		s.initSchema(db);
		s.acquireWorkspaceLease(db, {
			runId: context.runId,
			workspace: context.workspace,
			owner: context.owner,
			ttlMs: 10000,
			nowMs: 1000,
		});
		for (const patch of [
			{ runId: "bad id" },
			{ goal: "" },
			{ scale: "unknown" },
			{ frameworkCommit: "bad" },
			{ extra: true },
		])
			expect(() =>
				Reflect.apply(s.initRun, undefined, [
					db,
					{ ...metadata, ...patch },
					context,
				]),
			).toThrow();
		expect(() => s.getRunStatus(db, context.runId)).toThrow("No such run");
		expect(() =>
			s.recordRunTransition(
				db,
				{ phase: "work", status: "running", resumePoint: "next" },
				context,
			),
		).toThrow("init first");
		s.recordTransition(
			db,
			{
				runId: context.runId,
				phase: "historical",
				status: "committed",
				resumePoint: "old",
			},
			context,
		);
		expect(() => s.initRun(db, metadata, context)).toThrow("already exists");
		expect(s.getRunStatus(db, context.runId).legacy).toBe(true);
		expect(s.getRun(db, context.runId)).toBeNull();
	} finally {
		db.close();
	}
});

test("v4 existing stores require explicit migration rather than readonly status upgrading them", () => {
	const dir = mkdtempSync("/tmp/opencode/loom-v4-readonly-");
	const path = join(dir, "store.sqlite");
	try {
		const db = new Database(path);
		for (const name of ["schema-v2.sql", "schema-v3.sql", "schema-v4.sql"])
			db.exec(
				readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
			);
		db.close();
		const before = readFileSync(path);
		expect(() => s.openExistingDb(path, true)).toThrow(
			"explicit host migration",
		);
		expect(readFileSync(path)).toEqual(before);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("reset snapshot includes v5 evidence facts added after planning", () => {
	const db = s.openDb();
	try {
		s.initSchema(db);
		s.acquireWorkspaceLease(db, {
			runId: context.runId,
			workspace: context.workspace,
			owner: context.owner,
			ttlMs: 10000,
			nowMs: 1000,
		});
		s.initRun(db, metadata, context);
		const control = {
			scope: `run:${context.runId}`,
			actor: "human:fixture",
			reason: "Synthetic fixture",
			evidenceRef: "approval:fixture",
			synthetic: true,
		} satisfies s.KillInput;
		s.engageKill(db, control);
		const plan = s.prepareKillReset(db, { scope: control.scope });
		const transition = s.getLastTransition(db, context.runId, "main");
		if (!transition) throw new Error("Missing fixture init transition");
		db.query(
			"INSERT INTO transition_evidence VALUES (?,1,'trace:late-fixture-fact')",
		).run(transition.id);
		expect(() =>
			s.resetKill(db, {
				...control,
				cleanupEvidenceRef: "trace:cleanup",
				snapshotHash: plan.snapshotHash,
			}),
		).toThrow("stale");
		expect(s.getKillStatus(db, context.runId).blocked).toBe(true);
	} finally {
		db.close();
	}
});

test("registered lifecycle refuses inconsistent low-level bookkeeping history before another write", () => {
	const db = s.openDb();
	try {
		s.initSchema(db);
		s.acquireWorkspaceLease(db, {
			runId: context.runId,
			workspace: context.workspace,
			owner: context.owner,
			ttlMs: 10000,
			nowMs: 1000,
		});
		s.initRun(db, metadata, context);
		s.recordTransition(
			db,
			{
				runId: context.runId,
				phase: "rogue",
				status: "committed",
				resumePoint: "fixture",
			},
			context,
		);
		expect(() =>
			s.recordRunTransition(
				db,
				{ phase: "work", status: "running", resumePoint: "work" },
				context,
			),
		).toThrow("history");
	} finally {
		db.close();
	}
});
