import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as s from "../src/index.ts";

const ctx = {
	runId: "domain-run",
	threadId: "main",
	workspace: "/fixture/project",
	owner: "supervisor",
	epoch: 1,
	nowMs: 1000,
};
const input = {
	domainId: "00000000-0000-4000-8000-000000000041",
	endpoint: "unix:///fixture/docker.sock",
	config: {
		inputRoot: "/fixture/input",
		workspaceRoot: "/fixture/work",
		workerSha256: "a".repeat(64),
	},
	deadlineMs: 10000,
	authority: { kind: "root" as const },
};
const policy: s.PolicyConfig = {
	defaultEffect: "deny",
	rules: [
		{ scope: "global", tool: "runner.launch", pattern: "*", effect: "allow" },
	],
};

function ready(path?: string) {
	const db = s.openDb(path);
	s.initSchema(db);
	s.acquireWorkspaceLease(db, {
		runId: ctx.runId,
		workspace: ctx.workspace,
		owner: ctx.owner,
		ttlMs: 60000,
		nowMs: 1000,
	});
	s.initRun(
		db,
		{
			runId: ctx.runId,
			runbook: "fixture",
			goal: "Synthetic domain inventory",
			scale: "small",
			frameworkCommit: "a".repeat(40),
			frameworkVersion: "2.1.0",
			frameworkLockSha256: "b".repeat(64),
		},
		ctx,
	);
	s.setBudgetLimit(db, { runId: ctx.runId, kind: "tool-calls", limit: 10 });
	return db;
}

test("fixed v5 migrates atomically to v6 preserving registered run and immutable evidence", () => {
	const db = new Database(":memory:");
	try {
		for (const version of [2, 3, 4, 5])
			db.exec(
				readFileSync(
					new URL(`./fixtures/schema-v${version}.sql`, import.meta.url),
					"utf8",
				),
			);
		db.exec(
			`INSERT INTO runs VALUES ('old','fixture','preserve','small','${"a".repeat(40)}','2.1.0','${"b".repeat(64)}','2026-10-25T00:00:00Z')`,
		);
		const before = db.query("SELECT * FROM runs").all();
		s.initSchema(db);
		expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 6 });
		expect(db.query("SELECT * FROM runs").all()).toEqual(before);
		expect(db.query("SELECT count(*) AS n FROM domains").get()).toEqual({
			n: 0,
		});
		s.initSchema(db);
		expect(
			db.query("SELECT version FROM schema_migrations ORDER BY version").all(),
		).toEqual([2, 3, 4, 5, 6].map((version) => ({ version })));
		expect(() => db.exec("DELETE FROM runs")).toThrow("append-only");
	} finally {
		db.close();
	}
});

test("domain admission binds final profile and identity, audits once and is not a replayable permit", () => {
	const db = ready();
	try {
		const admitted = s.admitDomain(db, ctx, input, policy);
		expect(admitted.decision.decision).toBe("allow");
		expect(admitted.domain?.events.map((event) => event.kind)).toEqual([
			"admitted",
		]);
		expect(admitted.domain?.unresolved).toBe(true);
		expect(admitted.domain?.configHash).toMatch(/^[a-f0-9]{64}$/);
		expect(s.getBudget(db, ctx.runId, "tool-calls")?.used).toBe(1);
		expect(
			s.getAction(db, {
				runId: ctx.runId,
				threadId: ctx.threadId,
				actionId: input.domainId,
			})?.outcome,
		).toBe("pending");
		expect(() => s.admitDomain(db, ctx, input, policy)).toThrow("already");
		expect(s.getBudget(db, ctx.runId, "tool-calls")?.used).toBe(1);
		expect(s.getRunStatus(db, ctx.runId).domains).toHaveLength(1);
	} finally {
		db.close();
	}
});

test("policy deny and ask persist audit without inventory or budget draw", () => {
	for (const effect of ["deny", "ask"] as const) {
		const db = ready();
		try {
			const result = s.admitDomain(db, ctx, input, {
				defaultEffect: effect,
				rules: [],
			});
			expect(result.decision.decision).toBe(effect);
			expect(result.domain).toBeNull();
			expect(s.listDomains(db)).toEqual([]);
			expect(s.getBudget(db, ctx.runId, "tool-calls")?.used).toBe(0);
			expect(
				s.getAction(db, {
					runId: ctx.runId,
					threadId: ctx.threadId,
					actionId: result.decision.auditActionId,
				})?.decision,
			).toBe(effect === "ask" ? "escalated" : "denied");
		} finally {
			db.close();
		}
	}
});

test("late domain facts survive kill and expiry without false non-execution or automatic reset", () => {
	const db = ready();
	try {
		s.admitDomain(db, ctx, input, policy);
		s.engageKill(db, {
			scope: `run:${ctx.runId}`,
			actor: "human:fixture",
			reason: "Synthetic stop",
			evidenceRef: "approval:fixture",
			synthetic: true,
		});
		expect(
			s.getAction(db, {
				runId: ctx.runId,
				threadId: ctx.threadId,
				actionId: input.domainId,
			})?.decision,
		).toBe("allowed");
		s.recordDomainObservation(db, input.domainId, {
			kind: "created",
			containerId: "c".repeat(64),
			evidenceRef: "trace:created-late",
		});
		s.recordDomainObservation(db, input.domainId, {
			kind: "started",
			evidenceRef: "trace:started-late",
		});
		s.recordFinish(db, {
			runId: ctx.runId,
			threadId: ctx.threadId,
			actionId: input.domainId,
			actor: "system:supervisor",
			outcome: "interrupted",
			evidenceRef: "trace:interrupted",
		});
		expect(s.prepareKillReset(db, { scope: `run:${ctx.runId}` }).blocked).toBe(
			true,
		);
		s.recordDomainObservation(db, input.domainId, {
			kind: "quiescent",
			evidenceRef: "trace:cleanup-proof",
		});
		const plan = s.prepareKillReset(db, { scope: `run:${ctx.runId}` });
		expect(plan.blocked).toBe(false);
		s.recordDomainObservation(db, input.domainId, {
			kind: "unknown",
			evidenceRef: "trace:contradiction",
		});
		expect(() =>
			s.resetKill(db, {
				scope: plan.scope,
				actor: "human:fixture",
				reason: "Synthetic reset",
				evidenceRef: "approval:reset",
				cleanupEvidenceRef: "trace:cleanup",
				snapshotHash: plan.snapshotHash,
				synthetic: true,
			}),
		).toThrow("stale");
		expect(s.prepareKillReset(db, { scope: plan.scope }).blocked).toBe(true);
		expect(() =>
			s.recordTransition(
				db,
				{
					runId: ctx.runId,
					phase: "next",
					status: "running",
					resumePoint: "none",
				},
				ctx,
			),
		).toThrow("killed");
	} finally {
		db.close();
	}
});

test("unresolved domains fence workspace reuse even after a new lease epoch", () => {
	const db = ready();
	try {
		s.admitDomain(db, ctx, input, policy);
		const lease = s.acquireWorkspaceLease(db, {
			runId: ctx.runId,
			workspace: ctx.workspace,
			owner: "successor",
			ttlMs: 60000,
			nowMs: 62000,
		});
		expect(lease.ok).toBe(true);
		if (!lease.ok) throw new Error("Fixture lease acquisition failed");
		expect(() =>
			s.admitDomain(
				db,
				{ ...ctx, owner: "successor", epoch: lease.epoch, nowMs: 62000 },
				{ ...input, domainId: randomUUID(), deadlineMs: 65000 },
				policy,
			),
		).toThrow("unresolved");
		s.recordDomainObservation(db, input.domainId, {
			kind: "not-created",
			evidenceRef: "trace:definite-create-failure",
		});
		expect(
			s.admitDomain(
				db,
				{ ...ctx, owner: "successor", epoch: lease.epoch, nowMs: 62000 },
				{ ...input, domainId: randomUUID(), deadlineMs: 65000 },
				policy,
			).domain,
		).not.toBeNull();
	} finally {
		db.close();
	}
});

test("migration fault rolls back all v6 DDL and history before a clean retry", () => {
	const db = new Database(":memory:");
	try {
		for (const version of [2, 3, 4, 5])
			db.exec(
				readFileSync(
					new URL(`./fixtures/schema-v${version}.sql`, import.meta.url),
					"utf8",
				),
			);
		const before = db.query("SELECT * FROM sqlite_schema ORDER BY name").all();
		const pages = db
			.query<{ page_count: number }, []>("PRAGMA page_count")
			.get()!.page_count;
		db.exec(`PRAGMA max_page_count=${pages}`);
		expect(() => s.initSchema(db)).toThrow();
		expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 5 });
		expect(db.query("SELECT * FROM sqlite_schema ORDER BY name").all()).toEqual(
			before,
		);
		db.exec("PRAGMA max_page_count=10000");
		s.initSchema(db);
		expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 6 });
	} finally {
		db.close();
	}
});

test("domain and observation guard updates, deletes and replacement without losing original facts", () => {
	const db = ready();
	try {
		s.admitDomain(db, ctx, input, policy);
		for (const table of ["domains", "domain_events"]) {
			const before = db.query(`SELECT * FROM ${table}`).all();
			for (const sql of [
				`UPDATE ${table} SET created_at='changed'`,
				`DELETE FROM ${table}`,
				`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table}`,
			])
				expect(() => db.exec(sql)).toThrow("append-only");
			expect(db.query(`SELECT * FROM ${table}`).all()).toEqual(before);
		}
		expect(Object.isFrozen(s.OFFLINE_DOMAIN_PROFILE)).toBe(true);
	} finally {
		db.close();
	}
});

test("every admission write and outer rollback retain atomic audit, budget and inventory", () => {
	for (const table of ["domains", "domain_events"]) {
		const db = ready();
		try {
			const audit = db.query("SELECT * FROM audit").all();
			db.exec(
				`CREATE TRIGGER ignore_domain BEFORE INSERT ON ${table} BEGIN SELECT RAISE(IGNORE); END;`,
			);
			expect(() => s.admitDomain(db, ctx, input, policy)).toThrow("persist");
			expect(db.query("SELECT * FROM audit").all()).toEqual(audit);
			expect(s.getBudget(db, ctx.runId, "tool-calls")?.used).toBe(0);
			expect(s.listDomains(db)).toEqual([]);
		} finally {
			db.close();
		}
	}
	const db = ready();
	try {
		expect(() =>
			db
				.transaction(() => {
					s.admitDomain(db, ctx, input, policy);
					throw new Error("outer abort");
				})
				.immediate(),
		).toThrow("outer abort");
		expect(s.listDomains(db)).toEqual([]);
		expect(s.getBudget(db, ctx.runId, "tool-calls")?.used).toBe(0);
	} finally {
		db.close();
	}
});

test("invalid metadata fails safely without authority draws or store writes", () => {
	const db = ready();
	try {
		expect(s.getDomain(db, input.domainId)).toBeNull();
		for (const bad of [
			{ ...input, unexpected: "private-sentinel" },
			{ ...input, domainId: "bad" },
			{ ...input, endpoint: "tcp://private-sentinel" },
			{ ...input, endpoint: "unix:///fixture/../socket" },
			{ ...input, endpoint: "unix:///" },
			{ ...input, config: null },
			{ ...input, config: { ...input.config, uid: 0 } },
			{
				...input,
				config: { ...input.config, inputRoot: input.config.workspaceRoot },
			},
			{ ...input, config: { ...input.config, inputRoot: "/" } },
			{
				...input,
				config: { ...input.config, inputRoot: "../private-sentinel" },
			},
			{
				...input,
				config: { ...input.config, workspaceRoot: "/fixture/../work" },
			},
			{ ...input, config: { ...input.config, workerSha256: "bad" } },
			{ ...input, deadlineMs: -1 },
		])
			expect(() =>
				Reflect.apply(s.admitDomain, null, [db, ctx, bad, policy]),
			).toThrow();
		expect(() => s.listDomains(db, { runId: " " })).toThrow();
		expect(() => s.listDomains(db, { workspace: "" })).toThrow();
		expect(() =>
			Reflect.apply(s.listDomains, null, [db, { extra: true }]),
		).toThrow();
		expect(
			s.listDomains(db, { runId: ctx.runId, workspace: ctx.workspace }),
		).toEqual([]);
		expect(s.getBudget(db, ctx.runId, "tool-calls")?.used).toBe(0);
	} finally {
		db.close();
	}
});

test("unregistered, stale, killed, expired, ungranted and exhausted admission never creates a domain", () => {
	for (const scenario of [
		"unregistered",
		"stale",
		"killed",
		"deadline",
		"grant",
		"budget",
		"too-long",
	]) {
		const db = ready();
		try {
			let context = ctx;
			let request: s.DomainLaunchInput = input;
			if (scenario === "unregistered") context = { ...ctx, runId: "missing" };
			if (scenario === "stale") context = { ...ctx, epoch: 99 };
			if (scenario === "killed")
				s.engageKill(db, {
					scope: "global",
					actor: "human:fixture",
					reason: "Synthetic stop",
					evidenceRef: "approval:stop",
					synthetic: true,
				});
			if (scenario === "deadline") request = { ...input, deadlineMs: 1000 };
			if (scenario === "grant")
				request = {
					...input,
					authority: { kind: "grant", grantId: "missing" },
				};
			if (scenario === "budget")
				s.setBudgetLimit(db, {
					runId: ctx.runId,
					kind: "tool-calls",
					limit: 0,
				});
			if (scenario === "too-long")
				request = {
					...input,
					deadlineMs: ctx.nowMs + s.OFFLINE_DOMAIN_PROFILE.maxWallMs + 1,
				};
			if (scenario === "unregistered")
				expect(() => s.admitDomain(db, context, request, policy)).toThrow(
					"registered",
				);
			else
				expect(s.admitDomain(db, context, request, policy).domain).toBeNull();
			expect(s.listDomains(db)).toEqual([]);
		} finally {
			db.close();
		}
	}
});

test("observation validation, binding and idempotency cannot fabricate quiescence or task completion", () => {
	const db = ready();
	try {
		expect(() =>
			s.recordDomainObservation(db, input.domainId, {
				kind: "unknown",
				evidenceRef: "trace:missing",
			}),
		).toThrow("No such");
		s.admitDomain(db, ctx, input, policy);
		for (const bad of [
			{ kind: "admitted", evidenceRef: "trace:forged" },
			{ kind: "created", containerId: "bad", evidenceRef: "trace:bad" },
			{ kind: "quiescent", evidenceRef: "trace:no-container" },
			{ kind: "started", evidenceRef: "trace:no-container" },
			{
				kind: "unknown",
				containerId: "d".repeat(64),
				evidenceRef: "trace:extra",
			},
			{ kind: "unknown", evidenceRef: "bad" },
		])
			expect(() =>
				Reflect.apply(s.recordDomainObservation, null, [
					db,
					input.domainId,
					bad,
				]),
			).toThrow();
		const created = {
			kind: "created",
			containerId: "c".repeat(64),
			evidenceRef: "trace:created",
		} as const;
		s.recordDomainObservation(db, input.domainId, created);
		expect(
			s.recordDomainObservation(db, input.domainId, created).events,
		).toHaveLength(2);
		expect(() =>
			s.recordDomainObservation(db, input.domainId, {
				...created,
				containerId: "d".repeat(64),
			}),
		).toThrow("identity");
		expect(() =>
			s.recordDomainObservation(db, input.domainId, {
				...created,
				evidenceRef: "trace:rebind",
			}),
		).toThrow("binding");
		expect(() =>
			s.recordDomainObservation(db, input.domainId, {
				kind: "not-created",
				evidenceRef: "trace:contradiction",
			}),
		).toThrow("order");
		s.recordDomainObservation(db, input.domainId, {
			kind: "stop-requested",
			evidenceRef: "trace:stop",
		});
		s.recordDomainObservation(db, input.domainId, {
			kind: "quiescent",
			evidenceRef: "trace:cleanup",
		});
		expect(() =>
			s.recordDomainObservation(db, input.domainId, {
				kind: "stop-requested",
				evidenceRef: "trace:after-stop",
			}),
		).toThrow("quiescent");
		expect(
			s.recordDomainObservation(db, input.domainId, {
				kind: "started",
				evidenceRef: "trace:late-start",
			}).unresolved,
		).toBe(true);
		expect(
			s.getAction(db, {
				runId: ctx.runId,
				threadId: ctx.threadId,
				actionId: input.domainId,
			})?.outcome,
		).toBe("pending");
		expect(s.listDomains(db, { runId: "unrelated" })).toEqual([]);
	} finally {
		db.close();
	}
});

test("ignored observation writes cannot manufacture a recorded cleanup", () => {
	const db = ready();
	try {
		s.admitDomain(db, ctx, input, policy);
		db.exec(
			"CREATE TRIGGER ignore_observation BEFORE INSERT ON domain_events BEGIN SELECT RAISE(IGNORE); END;",
		);
		expect(() =>
			s.recordDomainObservation(db, input.domainId, {
				kind: "unknown",
				evidenceRef: "trace:unknown",
			}),
		).toThrow("persist");
		expect(s.getDomain(db, input.domainId)?.events).toHaveLength(1);
	} finally {
		db.close();
	}
});

test("corrupt domain metadata and missing or forged event history fail closed", () => {
	for (const sql of [
		"UPDATE domains SET config='broken'",
		"UPDATE domains SET config_hash=replace(config_hash,'a','b') || 'x'",
		"UPDATE domains SET created_at='broken'",
		"UPDATE domains SET owner='someone-else'",
		"UPDATE domains SET policy_action_id='bad'",
		"UPDATE domains SET policy_action_id='00000000-0000-4000-8000-000000000099'",
		"UPDATE domains SET profile_version=2",
		"UPDATE domains SET endpoint='tcp://bad'",
		"UPDATE domain_events SET kind='unknown'",
		"UPDATE domain_events SET created_at='broken'",
		"UPDATE domain_events SET id=-1",
		`UPDATE domain_events SET container_id='${"c".repeat(64)}'`,
		"DELETE FROM domain_events",
	]) {
		const db = ready();
		try {
			s.admitDomain(db, ctx, input, policy);
			db.exec(
				"DROP TRIGGER domains_no_update; DROP TRIGGER domain_events_no_update; DROP TRIGGER domain_events_no_delete; PRAGMA ignore_check_constraints=ON;",
			);
			db.exec(sql);
			expect(() => s.getDomain(db, input.domainId)).toThrow();
			expect(() => s.listDomains(db)).toThrow();
		} finally {
			db.close();
		}
	}
});

test("later non-created events cannot carry a forged container binding", () => {
	const db = ready();
	try {
		s.admitDomain(db, ctx, input, policy);
		s.recordDomainObservation(db, input.domainId, {
			kind: "unknown",
			evidenceRef: "trace:unknown",
		});
		db.exec(
			"DROP TRIGGER domain_events_no_update; PRAGMA ignore_check_constraints=ON;",
		);
		db.query(
			"UPDATE domain_events SET container_id=? WHERE kind='unknown'",
		).run("c".repeat(64));
		expect(() => s.getDomain(db, input.domainId)).toThrow("container binding");
	} finally {
		db.close();
	}
});

test("extra observation writes fail read-back and roll back the complete transaction", () => {
	const db = ready();
	try {
		s.admitDomain(db, ctx, input, policy);
		const before = s.getDomain(db, input.domainId);
		db.exec(`CREATE TRIGGER extra_observation AFTER INSERT ON domain_events
      WHEN NEW.evidence_ref='trace:requested' BEGIN
        INSERT INTO domain_events(domain_id,kind,evidence_ref) VALUES (NEW.domain_id,'unknown','trace:injected');
      END;`);
		expect(() =>
			s.recordDomainObservation(db, input.domainId, {
				kind: "unknown",
				evidenceRef: "trace:requested",
			}),
		).toThrow("persist domain observation");
		expect(s.getDomain(db, input.domainId)).toEqual(before);
	} finally {
		db.close();
	}
});

test("orphaned registered-run references fail closed on inventory reads", () => {
	const db = ready();
	try {
		s.admitDomain(db, ctx, input, policy);
		db.exec(
			"PRAGMA foreign_keys=OFF; DROP TRIGGER runs_no_delete; DELETE FROM runs;",
		);
		expect(() => s.getDomain(db, input.domainId)).toThrow("registered run");
		expect(() => s.listDomains(db)).toThrow("registered run");
	} finally {
		db.close();
	}
});

test("admission evidence must bind the domain config and successful policy action", () => {
	for (const sql of [
		"DROP TRIGGER domain_events_no_update; UPDATE domain_events SET evidence_ref='trace:unrelated' WHERE kind='admitted'",
		"DROP TRIGGER audit_no_update; UPDATE audit SET evidence_ref='trace:unrelated' WHERE action LIKE 'runner.launch:%' AND decision='pending'",
		"DROP TRIGGER audit_no_update; UPDATE audit SET evidence_ref='trace:unrelated' WHERE action LIKE 'runner.launch:%' AND decision='allowed'",
	]) {
		const db = ready();
		try {
			s.admitDomain(db, ctx, input, policy);
			db.exec(sql);
			expect(() => s.getDomain(db, input.domainId)).toThrow("admission");
		} finally {
			db.close();
		}
	}
});

test("distinct logical leases cannot admit overlapping writable domain roots", () => {
	const db = ready();
	try {
		s.admitDomain(db, ctx, input, policy);
		const other = { ...ctx, workspace: "/fixture/other" };
		s.acquireWorkspaceLease(db, {
			runId: other.runId,
			workspace: other.workspace,
			owner: other.owner,
			ttlMs: 60000,
			nowMs: 1000,
		});
		expect(() =>
			s.admitDomain(
				db,
				other,
				{
					...input,
					domainId: randomUUID(),
					config: {
						...input.config,
						workspaceRoot: input.config.workspaceRoot + "/child",
					},
				},
				policy,
			),
		).toThrow("unresolved");
	} finally {
		db.close();
	}
});

test("trailing separators cannot bypass canonical root overlap fencing", () => {
	const db = ready();
	try {
		expect(() =>
			s.admitDomain(
				db,
				ctx,
				{
					...input,
					config: { ...input.config, workspaceRoot: "/fixture/work/" },
				},
				policy,
			),
		).toThrow("domain path");
	} finally {
		db.close();
	}
});

test("distinct leases and disjoint writable roots may admit independent domains", () => {
	const db = ready();
	try {
		s.admitDomain(db, ctx, input, policy);
		const other = { ...ctx, workspace: "/fixture/other" };
		expect(
			s.acquireWorkspaceLease(db, {
				runId: other.runId,
				workspace: other.workspace,
				owner: other.owner,
				nowMs: other.nowMs,
				ttlMs: 60000,
			}).ok,
		).toBe(true);
		expect(
			s.admitDomain(
				db,
				other,
				{
					...input,
					domainId: randomUUID(),
					config: { ...input.config, workspaceRoot: "/fixture/work-other" },
				},
				policy,
			).domain?.unresolved,
		).toBe(true);
		expect(s.listDomains(db)).toHaveLength(2);
	} finally {
		db.close();
	}
});

test("container binding is unique across domains and terminal cleanup never resurrects a lease", () => {
	const db = ready();
	try {
		s.admitDomain(db, ctx, input, policy);
		s.recordDomainObservation(db, input.domainId, {
			kind: "created",
			containerId: "c".repeat(64),
			evidenceRef: "trace:created",
		});
		s.recordDomainObservation(db, input.domainId, {
			kind: "quiescent",
			evidenceRef: "trace:cleanup",
		});
		const nextId = randomUUID();
		s.admitDomain(db, ctx, { ...input, domainId: nextId }, policy);
		expect(() =>
			s.recordDomainObservation(db, nextId, {
				kind: "created",
				containerId: "c".repeat(64),
				evidenceRef: "trace:collision",
			}),
		).toThrow();
		expect(s.getDomain(db, nextId)?.events).toHaveLength(1);
		s.recordDomainObservation(db, nextId, {
			kind: "not-created",
			evidenceRef: "trace:failure-proof",
		});
		for (const id of [input.domainId, nextId])
			s.recordFinish(db, {
				runId: ctx.runId,
				threadId: ctx.threadId,
				actionId: id,
				actor: "system:supervisor",
				outcome: "failed",
				evidenceRef: "trace:domain-stop",
			});
		s.engageKill(db, {
			scope: `run:${ctx.runId}`,
			actor: "human:fixture",
			reason: "Synthetic stop",
			evidenceRef: "approval:stop",
			synthetic: true,
		});
		const plan = s.prepareKillReset(db, { scope: `run:${ctx.runId}` });
		expect(plan.blocked).toBe(false);
		s.resetKill(db, {
			scope: plan.scope,
			actor: "human:fixture",
			reason: "Synthetic reset",
			evidenceRef: "approval:reset",
			cleanupEvidenceRef: "trace:cleanup",
			snapshotHash: plan.snapshotHash,
			synthetic: true,
		});
		expect(s.getKillStatus(db, ctx.runId).blocked).toBe(false);
		expect(() =>
			s.recordTransition(
				db,
				{
					runId: ctx.runId,
					phase: "after",
					status: "running",
					resumePoint: "none",
				},
				ctx,
			),
		).toThrow("lease");
		expect(
			s.recordDomainObservation(db, nextId, {
				kind: "created",
				containerId: "d".repeat(64),
				evidenceRef: "trace:contradictory-late-create",
			}).unresolved,
		).toBe(true);
	} finally {
		db.close();
	}
});

test("real competing supervisors admit exactly one domain on a workspace", async () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-domain-race-");
	const path = join(dir, "store.sqlite");
	const db = ready(path);
	db.close();
	const children = [];
	try {
		for (let i = 0; i < 2; i++) {
			const script = `import * as s from ${JSON.stringify(import.meta.dir + "/../src/index.ts")};const db=s.openDb(${JSON.stringify(path)});db.exec('PRAGMA busy_timeout=5000');console.log('ready');await Bun.stdin.text();try{s.admitDomain(db,${JSON.stringify(ctx)},${JSON.stringify({ ...input, domainId: randomUUID() })},${JSON.stringify(policy)});db.close();}catch(error){if(error instanceof Error&&error.message.includes('unresolved'))process.exit(24);throw error;}`;
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
		const reopened = s.openDb(path);
		try {
			expect(s.listDomains(reopened)).toHaveLength(1);
			expect(s.getBudget(reopened, ctx.runId, "tool-calls")?.used).toBe(1);
		} finally {
			reopened.close();
		}
	} finally {
		for (const child of children) {
			if (child.exitCode === null) child.kill();
			await child.exited;
		}
		rmSync(dir, { recursive: true, force: true });
	}
});

test("abrupt supervisor exit retains admitted uncertainty and rolls back partial observations", () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-domain-crash-");
	const path = join(dir, "store.sqlite");
	try {
		const db = ready(path);
		db.close();
		const child = Bun.spawnSync(
			[
				process.execPath,
				"--eval",
				`import * as s from ${JSON.stringify(import.meta.dir + "/../src/index.ts")};const db=s.openDb(${JSON.stringify(path)});s.admitDomain(db,${JSON.stringify(ctx)},${JSON.stringify(input)},${JSON.stringify(policy)});db.transaction(()=>{s.recordDomainObservation(db,${JSON.stringify(input.domainId)},{kind:'unknown',evidenceRef:'trace:uncommitted'});process.exit(23);}).immediate();`,
			],
			{ env: {}, stdout: "pipe", stderr: "pipe" },
		);
		expect(child.exitCode).toBe(23);
		expect(child.stderr.toString()).toBe("");
		const reopened = s.openDb(path);
		try {
			const domain = s.getDomain(reopened, input.domainId);
			expect(domain?.events.map((e) => e.kind)).toEqual(["admitted"]);
			expect(domain?.unresolved).toBe(true);
			const status = Bun.spawnSync(
				[
					process.execPath,
					join(import.meta.dir, "../src/cli.ts"),
					"status",
					"--db",
					path,
					"--run",
					ctx.runId,
				],
				{ env: {}, stdout: "pipe", stderr: "pipe" },
			);
			expect(status.exitCode).toBe(0);
			expect(status.stderr.toString()).toBe("");
			expect(status.stdout.toString()).toContain("unresolved domains: 1");
		} finally {
			reopened.close();
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
