import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as store from "../src/index.ts";
import { relayPolicy } from "./fixtures/relay-policy.ts";

test("intact v2 migrates atomically to current schema without rewriting existing facts or guards", () => {
	const db = new Database(":memory:");
	try {
		db.exec(
			readFileSync(
				new URL("./fixtures/schema-v2.sql", import.meta.url),
				"utf8",
			),
		);
		db.exec(
			"INSERT INTO audit (run_id,action,decision,outcome) VALUES ('legacy','claim','allowed','interrupted')",
		);
		const before = db.query("SELECT * FROM audit").all();
		store.initSchema(db);
		expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 6 });
		expect(db.query("SELECT * FROM audit").all()).toEqual(before);
		expect(
			db.query("SELECT version FROM schema_migrations ORDER BY version").all(),
		).toEqual([2, 3, 4, 5, 6].map((version) => ({ version })));
		store.initSchema(db);
		expect(() => db.exec("DELETE FROM audit")).toThrow("append-only");
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
const actionId = "00000000-0000-4000-8000-000000000001";
const intent = {
	intentId: "00000000-0000-4000-8000-000000000002",
	actionId,
	kind: "fixture:counter",
	target: "fixture:counter",
	payload: '{"value":1}',
	replay: "idempotent",
} satisfies store.OutboxIntent;
const transition = {
	runId: "r1",
	phase: "slice",
	status: "running",
	resumePoint: "dispatch",
} satisfies Parameters<typeof store.recordTransition>[1];

function ready(path = ":memory:") {
	const db = store.openDb(path);
	store.initSchema(db);
	store.acquireWorkspaceLease(db, {
		runId: "r1",
		workspace: "ws",
		owner: "worker",
		ttlMs: 60_000,
	});
	store.openAction(db, {
		runId: "r1",
		threadId: "main",
		actionId,
		action: "synthetic-effect",
		actor: "agent:test",
		tier: "standard",
	});
	store.recordVerdict(db, {
		runId: "r1",
		threadId: "main",
		actionId,
		actor: "human:test",
		decision: "allowed",
		evidenceRef: "approval:fixture",
	});
	return db;
}

test("enqueue shares business rollback, requires live action/gate, and binds immutable exact intent bytes", () => {
	const db = ready();
	try {
		expect(() => store.enqueueOutbox(db, ctx, intent)).toThrow("transaction");
		expect(() =>
			db
				.transaction(() => {
					store.recordTransition(db, transition, ctx);
					store.enqueueOutbox(db, ctx, intent);
					throw new Error("abort business");
				})
				.immediate(),
		).toThrow("abort business");
		expect(store.getLastTransition(db, "r1", "main")).toBeNull();
		expect(db.query("SELECT count(*) AS n FROM outbox").get()).toEqual({
			n: 0,
		});
		const row = db
			.transaction(() => {
				store.recordTransition(db, transition, ctx);
				return store.enqueueOutbox(db, ctx, intent);
			})
			.immediate();
		expect(row).toEqual(
			expect.objectContaining({
				...intent,
				...{ runId: "r1", threadId: "main", workspace: "ws" },
				state: "pending",
				attempts: [],
			}),
		);
		expect(
			db.transaction(() => store.enqueueOutbox(db, ctx, intent)).immediate(),
		).toEqual(row);
		expect(() =>
			db
				.transaction(() =>
					store.enqueueOutbox(db, ctx, { ...intent, payload: '{ "value":1}' }),
				)
				.immediate(),
		).toThrow("bound");
	} finally {
		db.close();
	}
});

test("relay admits exact fixture intent outside a DB lock and cursor does not imply applied state", async () => {
	const db = ready();
	try {
		db.transaction(() => store.enqueueOutbox(db, ctx, intent)).immediate();
		const seen: string[] = [];
		const adapter: store.SyntheticOutboxAdapter = {
			synthetic: true,
			kind: intent.kind,
			target: intent.target,
			replay: intent.replay,
			execute: async (row: store.OutboxRecord, attemptId: string) => {
				expect(db.inTransaction).toBe(false);
				expect(row.intentId).toBe(intent.intentId);
				expect(row.payload).toBe(intent.payload);
				expect(store.getOutbox(db, row.intentId)?.state).toBe("dispatched");
				expect(attemptId).toMatch(/^[0-9a-f-]{36}$/);
				seen.push(row.intentId);
				return { outcome: "applied", evidenceRef: "trace:fixture-target" };
			},
		};
		const result = await store.relayBatch(db, ctx, relayPolicy(db), adapter);
		expect(result).toEqual(expect.objectContaining({ cursor: 1 }));
		expect(store.getOutbox(db, intent.intentId)?.state).toBe("applied");
		await store.relayBatch(db, ctx, relayPolicy(db), adapter);
		expect(seen).toEqual([intent.intentId]);
	} finally {
		db.close();
	}
});

test("uncertain non-idempotent work refuses replay until explicit evidence-backed reconciliation", async () => {
	const db = ready();
	try {
		db.transaction(() =>
			store.enqueueOutbox(db, ctx, { ...intent, replay: "reconcile" }),
		).immediate();
		let effects = 0;
		const adapter: store.SyntheticOutboxAdapter = {
			synthetic: true,
			kind: intent.kind,
			target: intent.target,
			replay: "reconcile",
			execute: async () => {
				effects++;
				throw new Error("synthetic failure after effect");
			},
		};
		await store.relayBatch(db, ctx, relayPolicy(db), adapter);
		expect(store.getOutbox(db, intent.intentId)?.state).toBe("unknown");
		await expect(
			store.relayBatch(db, ctx, relayPolicy(db), adapter),
		).rejects.toThrow("reconciliation");
		expect(effects).toBe(1);
		const attemptId = store.getOutbox(db, intent.intentId)?.attempts[0]
			?.attemptId;
		if (!attemptId) throw new Error("Missing admitted attempt");
		const resolved = store.reconcileOutbox(db, {
			intentId: intent.intentId,
			attemptId,
			actor: "human:operator",
			outcome: "applied",
			evidenceRef: "trace:fixture-target-confirmed",
		});
		expect(resolved).toEqual(expect.objectContaining({ state: "applied" }));
		await store.relayBatch(db, ctx, relayPolicy(db), adapter);
		expect(effects).toBe(1);
	} finally {
		db.close();
	}
});

const action2 = "00000000-0000-4000-8000-000000000003";
const intent2 = {
	...intent,
	actionId: action2,
	intentId: "00000000-0000-4000-8000-000000000004",
};

function enqueue(
	db: Database,
	args: store.OutboxIntent = intent,
): store.OutboxRecord {
	return db.transaction(() => store.enqueueOutbox(db, ctx, args)).immediate();
}

function addSecond(db: Database, args: store.OutboxIntent = intent2): void {
	store.openAction(db, {
		runId: "r1",
		threadId: "main",
		actionId: action2,
		action: "synthetic-effect",
		actor: "agent:test",
		tier: "standard",
	});
	store.recordVerdict(db, {
		runId: "r1",
		threadId: "main",
		actionId: action2,
		actor: "human:test",
		decision: "allowed",
		evidenceRef: "approval:fixture",
	});
	enqueue(db, args);
}

test("policy denial/ask persists its audit without dispatch or cursor advancement", async () => {
	for (const effect of ["deny", "ask"] as const) {
		const db = ready();
		try {
			enqueue(db);
			const configured = {
				...relayPolicy(db),
				rules: [{ scope: "global", tool: "*", pattern: "*", effect }],
			} satisfies store.RelayPolicy;
			let calls = 0;
			await expect(
				store.relayBatch(db, ctx, configured, {
					synthetic: true,
					kind: intent.kind,
					target: intent.target,
					replay: intent.replay,
					execute: async () => {
						calls++;
						return { outcome: "applied", evidenceRef: "trace:test" };
					},
				}),
			).rejects.toThrow("Effect gate");
			expect(calls).toBe(0);
			expect(store.getOutbox(db, intent.intentId)?.attempts).toEqual([]);
			expect(db.query("SELECT count(*) AS n FROM relay_cursors").get()).toEqual(
				{ n: 0 },
			);
			expect(
				db
					.query(
						"SELECT count(*) AS n FROM audit WHERE action LIKE 'policy:%' AND decision=?",
					)
					.get(effect === "ask" ? "escalated" : "denied"),
			).toEqual({ n: 1 });
		} finally {
			db.close();
		}
	}
});

test("every dispatch recomputes policy, deadline, grant and remaining call budget", async () => {
	for (const stop of ["policy", "deadline", "grant", "budget"] as const) {
		const db = ready();
		try {
			enqueue(db);
			addSecond(db);
			const configured = relayPolicy(db);
			if (stop === "budget")
				store.setBudgetLimit(db, { runId: "r1", kind: "tool-calls", limit: 1 });
			let calls = 0;
			await expect(
				store.relayBatch(db, ctx, configured, {
					synthetic: true,
					kind: intent.kind,
					target: intent.target,
					replay: intent.replay,
					execute: async () => {
						calls++;
						if (stop === "policy")
							configured.rules = [
								{ scope: "global", tool: "*", pattern: "*", effect: "deny" },
							];
						if (stop === "deadline") configured.deadlineMs = Date.now() - 1;
						if (stop === "grant")
							configured.authority = { kind: "grant", grantId: "missing" };
						return { outcome: "applied", evidenceRef: "trace:test" };
					},
				}),
			).rejects.toThrow(stop);
			expect(calls).toBe(1);
			expect(store.getOutbox(db, intent.intentId)?.state).toBe("applied");
			expect(store.getOutbox(db, intent2.intentId)?.state).toBe("pending");
			expect(store.getBudget(db, "r1", "tool-calls")?.used).toBe(1);
		} finally {
			db.close();
		}
	}
});

test("relay applies deadline before lease when both reject the dispatch", async () => {
	const db = ready();
	try {
		enqueue(db);
		const configured = { ...relayPolicy(db), deadlineMs: 1 };
		store.releaseWorkspaceLease(db, {
			workspace: ctx.workspace,
			owner: ctx.owner,
			epoch: ctx.epoch,
		});
		await expect(
			store.relayBatch(db, ctx, configured, {
				synthetic: true,
				kind: intent.kind,
				target: intent.target,
				replay: intent.replay,
				execute: async () => ({
					outcome: "applied",
					evidenceRef: "trace:test",
				}),
			}),
		).rejects.toThrow("deadline");
		expect(store.getOutbox(db, intent.intentId)?.attempts).toEqual([]);
	} finally {
		db.close();
	}
});

test("each batch item rechecks kill/epoch while late applied facts retain the original admitted attempt", async () => {
	for (const stop of ["kill", "succession"]) {
		const db = ready();
		try {
			enqueue(db);
			addSecond(db);
			const seen: string[] = [];
			const adapter: store.SyntheticOutboxAdapter = {
				synthetic: true,
				kind: intent.kind,
				target: intent.target,
				replay: intent.replay,
				execute: async (row) => {
					seen.push(row.intentId);
					if (stop === "kill")
						db.query(
							"INSERT INTO kills (scope, engaged_at, actor, reason) VALUES ('run:r1','fixture','human:test','stop')",
						).run();
					else {
						store.releaseWorkspaceLease(db, {
							workspace: "ws",
							owner: "worker",
							epoch: 1,
						});
						store.acquireWorkspaceLease(db, {
							runId: "r1",
							workspace: "ws",
							owner: "successor",
							ttlMs: 60_000,
						});
					}
					return {
						outcome: "applied",
						evidenceRef: "trace:late-observed-effect",
					};
				},
			};
			await expect(
				store.relayBatch(db, ctx, relayPolicy(db), adapter),
			).rejects.toThrow(stop === "kill" ? "killed" : "lease");
			expect(seen).toEqual([intent.intentId]);
			expect(store.getOutbox(db, intent.intentId)).toEqual(
				expect.objectContaining({
					state: "applied",
					attempts: [
						expect.objectContaining({
							owner: "worker",
							epoch: 1,
							state: "applied",
							evidenceRef: "trace:late-observed-effect",
						}),
					],
				}),
			);
			expect(store.getOutbox(db, intent2.intentId)?.state).toBe("pending");
			expect(
				store
					.listUnresolvedOutbox(db, { runId: "r1" })
					.map((row) => row.intentId),
			).toEqual([intent2.intentId]);
			expect(
				store.getAction(db, { runId: "r1", threadId: "main", actionId })
					?.outcome,
			).toBe("pending");
		} finally {
			db.close();
		}
	}
});

test("cursor high-water does not skip older uncertainty and not-applied proof permits a new non-idempotent attempt", async () => {
	const db = ready();
	try {
		enqueue(db, { ...intent, replay: "reconcile" });
		const uncertain: store.SyntheticOutboxAdapter = {
			synthetic: true,
			kind: intent.kind,
			target: intent.target,
			replay: "reconcile",
			execute: async () => ({
				outcome: "unknown",
				evidenceRef: "trace:no-ack",
			}),
		};
		await store.relayBatch(db, ctx, relayPolicy(db), uncertain);
		addSecond(db, { ...intent2, target: "fixture:second" });
		const second = await store.relayBatch(db, ctx, relayPolicy(db), {
			synthetic: true,
			kind: intent.kind,
			target: "fixture:second",
			replay: "idempotent",
			execute: async () => ({
				outcome: "applied",
				evidenceRef: "trace:second-applied",
			}),
		});
		expect(second.cursor).toBe(2);
		await expect(
			store.relayBatch(db, ctx, relayPolicy(db), uncertain),
		).rejects.toThrow("reconciliation");
		const attemptId = store.getOutbox(db, intent.intentId)?.attempts[0]
			?.attemptId;
		if (!attemptId) throw new Error("Missing attempt");
		const args = {
			intentId: intent.intentId,
			attemptId,
			actor: "human:operator",
			outcome: "not-applied",
			evidenceRef: "trace:target-state-verified-absent",
		} satisfies Parameters<typeof store.reconcileOutbox>[1];
		expect(() =>
			Reflect.apply(store.reconcileOutbox, undefined, [
				db,
				{ ...args, outcome: "completed" },
			]),
		).toThrow("observation");
		expect(() =>
			store.reconcileOutbox(db, { ...args, actor: "agent:fake" }),
		).toThrow("human");
		expect(() =>
			store.reconcileOutbox(db, { ...args, evidenceRef: "" }),
		).toThrow("evidence");
		expect(store.reconcileOutbox(db, args).state).toBe("pending");
		expect(() =>
			store.reconcileOutbox(db, { ...args, outcome: "applied" }),
		).toThrow("Conflicting");
		const finished = await store.relayBatch(db, ctx, relayPolicy(db), {
			...uncertain,
			execute: async () => ({
				outcome: "applied",
				evidenceRef: "trace:new-attempt-applied",
			}),
		});
		expect(finished.cursor).toBe(2);
		expect(
			store.getOutbox(db, intent.intentId)?.attempts.map((a) => a.state),
		).toEqual(["not-applied", "applied"]);
	} finally {
		db.close();
	}
});

test("a crash after independent target commit replays with the same dedup key, not a second application", async () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-outbox-recovery-");
	const path = join(dir, "loom.sqlite");
	const targetPath = join(dir, "target.sqlite");
	try {
		const initial = ready(path);
		enqueue(initial);
		const admissionPolicy = relayPolicy(initial);
		initial.close();
		const target = new Database(targetPath);
		target.exec(
			"CREATE TABLE effects (intent_id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
		);
		target.close();
		const child = Bun.spawnSync(
			[
				process.execPath,
				"--eval",
				`
			import { Database } from 'bun:sqlite';
			import * as s from ${JSON.stringify(import.meta.dir + "/../src/index.ts")};
			const db=s.openDb(${JSON.stringify(path)}); s.initSchema(db);
			const target=new Database(${JSON.stringify(targetPath)});
			await s.relayBatch(db, ${JSON.stringify(ctx)}, ${JSON.stringify(admissionPolicy)}, {synthetic:true,kind:'fixture:counter',target:'fixture:counter',replay:'idempotent',execute:async(row) => {
				target.query('INSERT INTO effects VALUES (?, ?)').run(row.intentId,row.payload);
				process.exit(23);
			}});
		`,
			],
			{ env: {}, stdout: "pipe", stderr: "pipe" },
		);
		expect(child.exitCode).toBe(23);
		expect(child.stderr.toString()).toBe("");
		const db = store.openDb(path);
		const effectTarget = new Database(targetPath);
		try {
			store.initSchema(db);
			expect(store.getOutbox(db, intent.intentId)?.state).toBe("dispatched");
			const result = await store.relayBatch(db, ctx, relayPolicy(db), {
				synthetic: true,
				kind: intent.kind,
				target: intent.target,
				replay: "idempotent",
				execute: async (row) => {
					// The target's own unique key and exact-payload check provide deduplication, not Loom's cursor.
					effectTarget
						.transaction(() => {
							const previous = effectTarget
								.query<{ payload: string }, [string]>(
									"SELECT payload FROM effects WHERE intent_id = ?",
								)
								.get(row.intentId);
							if (previous && previous.payload !== row.payload)
								throw new Error("Target binding conflict");
							effectTarget
								.query(
									"INSERT INTO effects VALUES (?, ?) ON CONFLICT(intent_id) DO NOTHING",
								)
								.run(row.intentId, row.payload);
						})
						.immediate();
					return {
						outcome: "applied",
						evidenceRef: "trace:target-dedup-confirmed",
					};
				},
			});
			expect(result.cursor).toBe(1);
			expect(
				effectTarget.query("SELECT count(*) AS n FROM effects").get(),
			).toEqual({ n: 1 });
			expect(store.getOutbox(db, intent.intentId)?.attempts).toHaveLength(2);
			expect(store.listUnresolvedOutbox(db, { runId: "r1" })).toEqual([]);
		} finally {
			db.close();
			effectTarget.close();
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("overlapping batches deduplicate replay and skip candidates another relay already applied", async () => {
	const db = ready();
	const target = new Database(":memory:");
	target.exec(
		"CREATE TABLE effects (intent_id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
	);
	try {
		enqueue(db);
		addSecond(db);
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
			kind: intent.kind,
			target: intent.target,
			replay: "idempotent",
			execute: async (row) => {
				calls++;
				target
					.query(
						"INSERT INTO effects VALUES (?, ?) ON CONFLICT(intent_id) DO NOTHING",
					)
					.run(row.intentId, row.payload);
				if (calls === 1) {
					entered();
					await hold;
				}
				return { outcome: "applied", evidenceRef: "trace:deduplicated-target" };
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
		expect(calls).toBe(3);
		expect(target.query("SELECT count(*) AS n FROM effects").get()).toEqual({
			n: 2,
		});
		expect(
			store.getOutbox(db, intent.intentId)?.attempts.map((a) => a.state),
		).toEqual(["applied", "applied"]);
		expect(store.getOutbox(db, intent2.intentId)?.attempts).toHaveLength(1);
	} finally {
		db.close();
		target.close();
	}
});

test("outbox intent and event guards reject mutation, and malformed histories cannot hide uncertainty", () => {
	for (const setup of ["orphan", "rebound", "duplicate", "timestamp"]) {
		const db = ready();
		try {
			enqueue(db);
			const append = db.query(
				"INSERT INTO outbox_events (intent_id, attempt_id, state, owner, epoch, actor, evidence_ref, created_at) VALUES (?, ?, ?, 'worker', ?, 'system:outbox', 'trace:fixture', ?)",
			);
			const attemptId = "00000000-0000-4000-8000-000000000005";
			if (setup !== "orphan")
				append.run(
					intent.intentId,
					attemptId,
					"dispatched",
					1,
					"2026-10-24T00:00:00Z",
				);
			append.run(
				intent.intentId,
				attemptId,
				setup === "duplicate" ? "dispatched" : "applied",
				setup === "rebound" ? 2 : 1,
				setup === "timestamp" ? "bad-date" : "2026-10-24T00:00:00Z",
			);
			expect(() => store.getOutbox(db, intent.intentId)).toThrow();
			expect(() => store.listUnresolvedOutbox(db, { runId: "r1" })).toThrow();
			for (const sql of [
				"UPDATE outbox SET payload='null'",
				"DELETE FROM outbox",
				"UPDATE outbox_events SET state='unknown'",
				"DELETE FROM outbox_events",
				"INSERT OR REPLACE INTO outbox SELECT * FROM outbox WHERE id=1",
				"INSERT OR REPLACE INTO outbox_events SELECT * FROM outbox_events WHERE id=1",
			])
				expect(() => db.exec(sql)).toThrow("append-only");
		} finally {
			db.close();
		}
	}
	const db = ready();
	try {
		db.query(
			"INSERT INTO outbox (intent_id,action_id,run_id,thread_id,workspace,kind,target,payload,payload_hash,replay) VALUES (?,?,'r1','main','ws','fixture:counter','fixture:counter','null','incorrect','idempotent')",
		).run(intent.intentId, actionId);
		expect(() => store.getOutbox(db, intent.intentId)).toThrow("history");
	} finally {
		db.close();
	}
});

test("validation refuses unsafe adapters, invalid intent shapes and unknown reconciliation without dispatch", async () => {
	const db = ready();
	try {
		for (const patch of [
			{ intentId: "invalid" },
			{ payload: "{" },
			{ payload: '"' + "x".repeat(65_536) + '"' },
			{ target: "https://example.invalid" },
			{ replay: "blind" },
			{ extra: true },
		]) {
			expect(() =>
				db
					.transaction(() =>
						Reflect.apply(store.enqueueOutbox, undefined, [
							db,
							ctx,
							{ ...intent, ...patch },
						]),
					)
					.immediate(),
			).toThrow();
		}
		expect(() => enqueue(db, { ...intent, actionId: action2 })).toThrow(
			"allowed",
		);
		enqueue(db);
		expect(() =>
			enqueue(db, { ...intent, intentId: intent2.intentId }),
		).toThrow();
		const adapter: store.SyntheticOutboxAdapter = {
			synthetic: true,
			kind: intent.kind,
			target: intent.target,
			replay: "idempotent",
			execute: async () => ({
				outcome: "applied",
				evidenceRef: "trace:fixture",
			}),
		};
		for (const patch of [
			{ synthetic: false },
			{ target: "file:/production" },
			{ replay: "blind" },
			{ execute: null },
			{ extra: true },
		]) {
			await expect(
				Reflect.apply(store.relayBatch, undefined, [
					db,
					ctx,
					relayPolicy(db),
					{ ...adapter, ...patch },
				]),
			).rejects.toThrow();
		}
		for (const limit of [0, 101, 0.5])
			await expect(
				store.relayBatch(db, ctx, relayPolicy(db), adapter, limit),
			).rejects.toThrow("limit");
		let nested: ReturnType<typeof store.relayBatch> | undefined;
		db.transaction(() => {
			nested = store.relayBatch(db, ctx, relayPolicy(db), adapter);
		}).immediate();
		if (!nested) throw new Error("Missing rejected relay");
		await expect(nested).rejects.toThrow("outside");
		await expect(
			store.relayBatch(db, ctx, relayPolicy(db), {
				...adapter,
				replay: "reconcile",
			}),
		).rejects.toThrow("mismatch");
		expect(store.getOutbox(db, intent2.intentId)).toBeNull();
		expect(
			store.listUnresolvedOutbox(db, {
				runId: "r1",
				threadId: "other",
				workspace: "ws",
			}),
		).toEqual([]);
		expect(() =>
			store.listUnresolvedOutbox(db, { runId: "bad run" }),
		).toThrow();
		const args = {
			intentId: intent2.intentId,
			attemptId: action2,
			actor: "human:test",
			outcome: "applied",
			evidenceRef: "trace:fixture",
		} satisfies Parameters<typeof store.reconcileOutbox>[1];
		expect(() => store.reconcileOutbox(db, args)).toThrow("not found");
		expect(() =>
			store.reconcileOutbox(db, { ...args, intentId: intent.intentId }),
		).toThrow("not found");
		await store.relayBatch(db, ctx, relayPolicy(db), adapter);
		const applied = store.getOutbox(db, intent.intentId);
		const attemptId = applied?.attempts[0]?.attemptId;
		if (!attemptId) throw new Error("Missing attempt");
		expect(
			store.reconcileOutbox(db, {
				...args,
				intentId: intent.intentId,
				attemptId,
			}),
		).toEqual(applied);
	} finally {
		db.close();
	}
});

test("malformed target output is unknown and cannot mark an intent applied", async () => {
	const db = ready();
	try {
		enqueue(db);
		const result = await Reflect.apply(store.relayBatch, undefined, [
			db,
			ctx,
			relayPolicy(db),
			{
				synthetic: true,
				kind: intent.kind,
				target: intent.target,
				replay: "idempotent",
				execute: async () => ({
					outcome: "applied",
					evidenceRef: "bad",
					secret: "synthetic-only",
				}),
			},
		]);
		expect(result).toEqual(expect.objectContaining({ cursor: 1 }));
		expect(store.getOutbox(db, intent.intentId)?.state).toBe("unknown");
		expect(store.getOutbox(db, intent.intentId)?.attempts[0]?.evidenceRef).toBe(
			"trace:synthetic-adapter-unconfirmed",
		);
		await Reflect.apply(store.relayBatch, undefined, [
			db,
			ctx,
			relayPolicy(db),
			{
				synthetic: true,
				kind: intent.kind,
				target: intent.target,
				replay: "idempotent",
				execute: async () => ({
					outcome: "completed",
					evidenceRef: "trace:bad-state",
				}),
			},
		]);
		expect(store.getOutbox(db, intent.intentId)?.state).toBe("unknown");
	} finally {
		db.close();
	}
});

test("malformed persisted relay cursor with pending work fails before any dispatch or overwrite", async () => {
	const db = ready();
	try {
		enqueue(db);
		db.query(
			"INSERT INTO outbox (id,intent_id,action_id,run_id,thread_id,workspace,kind,target,payload,payload_hash,replay) VALUES (-1,?,?,'other','main','other','fixture:counter','fixture:counter','null','malformed','idempotent')",
		).run(intent2.intentId, action2);
		db.query("INSERT INTO relay_cursors VALUES ('r1','main','ws',-1)").run();
		let calls = 0;
		await expect(
			store.relayBatch(db, ctx, relayPolicy(db), {
				synthetic: true,
				kind: intent.kind,
				target: intent.target,
				replay: "idempotent",
				execute: async () => {
					calls++;
					return { outcome: "applied", evidenceRef: "trace:fixture" };
				},
			}),
		).rejects.toThrow("cursor");
		expect(calls).toBe(0);
		expect(store.getOutbox(db, intent.intentId)?.state).toBe("pending");
		expect(db.query("SELECT last_id FROM relay_cursors").get()).toEqual({
			last_id: -1,
		});
	} finally {
		db.close();
	}
});

test("malformed persisted relay cursor fails explicitly instead of implying progress", async () => {
	const db = ready();
	try {
		// A deliberately malformed unrelated row supplies a foreign-key target without disabling guards.
		db.query(
			"INSERT INTO outbox (id,intent_id,action_id,run_id,thread_id,workspace,kind,target,payload,payload_hash,replay) VALUES (-1,?,?,'other','main','other','fixture:counter','fixture:counter','null','malformed','idempotent')",
		).run(intent.intentId, actionId);
		db.query("INSERT INTO relay_cursors VALUES ('r1','main','ws',-1)").run();
		await expect(
			store.relayBatch(db, ctx, relayPolicy(db), {
				synthetic: true,
				kind: intent.kind,
				target: intent.target,
				replay: "idempotent",
				execute: async () => ({
					outcome: "applied",
					evidenceRef: "trace:fixture",
				}),
			}),
		).rejects.toThrow("cursor");
	} finally {
		db.close();
	}
});

test("v2 writer contention leaves migration intact and a clean retry reaches current schema", () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-outbox-migration-");
	const path = join(dir, "store.sqlite");
	const db = new Database(path);
	try {
		db.exec(
			readFileSync(
				new URL("./fixtures/schema-v2.sql", import.meta.url),
				"utf8",
			),
		);
		const contender = store.openDb(path);
		try {
			db.transaction(() => {
				expect(() => store.initSchema(contender)).toThrow();
				expect(contender.query("PRAGMA user_version").get()).toEqual({
					user_version: 2,
				});
				expect(
					contender
						.query("SELECT name FROM sqlite_schema WHERE name='outbox'")
						.get(),
				).toBeNull();
			}).immediate();
			store.initSchema(contender);
			expect(contender.query("PRAGMA user_version").get()).toEqual({
				user_version: 6,
			});
		} finally {
			contender.close();
		}
	} finally {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

test("real competing non-idempotent relay processes admit only one unconfirmed attempt", async () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-outbox-race-");
	const path = join(dir, "loom.sqlite");
	const targetPath = join(dir, "target.sqlite");
	try {
		const initial = ready(path);
		enqueue(initial, { ...intent, replay: "reconcile" });
		const admissionPolicy = relayPolicy(initial);
		initial.close();
		const target = new Database(targetPath);
		target.exec("CREATE TABLE effects (value INTEGER NOT NULL)");
		target.close();
		const script = `
			import { Database } from 'bun:sqlite';
			import * as s from ${JSON.stringify(import.meta.dir + "/../src/index.ts")};
			const db=s.openDb(${JSON.stringify(path)}); db.exec('PRAGMA busy_timeout=5000');
			const target=new Database(${JSON.stringify(targetPath)}); target.exec('PRAGMA busy_timeout=5000');
			console.log('ready'); await Bun.stdin.text();
			try { await s.relayBatch(db, ${JSON.stringify(ctx)}, ${JSON.stringify(admissionPolicy)}, {synthetic:true,kind:'fixture:counter',target:'fixture:counter',replay:'reconcile',execute:async() => {
				target.query('INSERT INTO effects VALUES (1)').run();
				return {outcome:'unknown',evidenceRef:'trace:unconfirmed'};
			}}); } catch { process.exit(24); }
			db.close(); target.close();
		`;
		const children = [];
		try {
			// Open connections before racing dispatch, not SQLite WAL recovery.
			for (let i = 0; i < 2; i++) {
				const child = Bun.spawn([process.execPath, "--eval", script], {
					env: {},
					stdin: "pipe",
					stdout: "pipe",
					stderr: "pipe",
				});
				children.push(child);
				const reader = child.stdout.getReader();
				const readyMessage = await reader.read();
				reader.releaseLock();
				expect(new TextDecoder().decode(readyMessage.value).trim()).toBe(
					"ready",
				);
			}
			for (const child of children) child.stdin.end();
			const results = await Promise.all(children.map((child) => child.exited));
			expect(
				results.filter((code) => code === 0).length,
			).toBeGreaterThanOrEqual(1);
			expect(results.every((code) => code === 0 || code === 24)).toBe(true);
			for (const child of children)
				expect(await new Response(child.stderr).text()).toBe("");
		} finally {
			for (const child of children) {
				child.stdin.end();
				if (child.exitCode === null) child.kill();
			}
			await Promise.all(children.map((child) => child.exited));
		}
		const db = store.openDb(path);
		const effects = new Database(targetPath);
		try {
			expect(effects.query("SELECT count(*) AS n FROM effects").get()).toEqual({
				n: 1,
			});
			expect(store.getOutbox(db, intent.intentId)?.attempts).toHaveLength(1);
		} finally {
			db.close();
			effects.close();
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
