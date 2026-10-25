import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as store from "../src/index.ts";
import { recordTransitionForMigration } from "../src/store.ts";

test("release retains epoch history so same-owner reacquisition cannot revive a stale token", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		const args = {
			runId: "r1",
			workspace: "ws",
			owner: "worker",
			ttlMs: 60_000,
		};
		expect(store.acquireWorkspaceLease(db, args)).toEqual({
			ok: true,
			epoch: 1,
		});
		expect(
			store.releaseWorkspaceLease(db, {
				workspace: "ws",
				owner: "worker",
				epoch: 1,
			}),
		).toBe(true);
		expect(
			store.releaseWorkspaceLease(db, {
				workspace: "ws",
				owner: "worker",
				epoch: 1,
			}),
		).toBe(false);
		expect(store.acquireWorkspaceLease(db, args)).toEqual({
			ok: true,
			epoch: 2,
		});
		expect(
			store.releaseWorkspaceLease(db, {
				workspace: "ws",
				owner: "worker",
				epoch: 1,
			}),
		).toBe(false);
	} finally {
		db.close();
	}
});

test("renewal never shortens expiry, and expired owners cannot release or finalize", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		const args = {
			runId: "r1",
			workspace: "ws",
			owner: "worker",
			ttlMs: 100,
			nowMs: 1000,
		};
		store.acquireWorkspaceLease(db, args);
		expect(
			store.acquireWorkspaceLease(db, { ...args, ttlMs: 1, nowMs: 1001 }),
		).toEqual({ ok: true, epoch: 1 });
		expect(() =>
			store.recordTransition(db, transition, { ...ctx, nowMs: 1099 }),
		).not.toThrow();
		expect(
			store.releaseWorkspaceLease(db, {
				workspace: "ws",
				owner: "worker",
				epoch: 1,
				nowMs: 1100,
			}),
		).toBe(false);
		expect(() =>
			store.recordTransition(db, transition, { ...ctx, nowMs: 1100 }),
		).toThrow("lease");
		expect(store.acquireWorkspaceLease(db, { ...args, nowMs: 1100 })).toEqual({
			ok: true,
			epoch: 2,
		});
		expect(() =>
			store.recordTransition(db, transition, { ...ctx, nowMs: 1101 }),
		).toThrow("lease");
		expect(() =>
			store.recordTransition(db, transition, { ...ctx, epoch: 2, nowMs: 1101 }),
		).not.toThrow();
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
	nowMs: 1000,
};

test("writeGate checks live lease inside a transaction, not a reusable preflight", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		expect(() => store.writeGate(db, ctx)).toThrow("transaction");
		expect(() =>
			db.transaction(() => store.writeGate(db, ctx)).immediate(),
		).toThrow("lease");
		expect(
			store.acquireWorkspaceLease(db, {
				runId: "r1",
				workspace: "ws",
				owner: "worker",
				nowMs: 1000,
				ttlMs: 100,
			}),
		).toEqual({ ok: true, epoch: 1 });
		expect(() =>
			db.transaction(() => store.writeGate(db, ctx)).immediate(),
		).not.toThrow();
		for (const patch of [{ owner: "other" }, { epoch: 2 }, { nowMs: 1100 }]) {
			expect(() =>
				db
					.transaction(() => store.writeGate(db, { ...ctx, ...patch }))
					.immediate(),
			).toThrow("lease");
		}
	} finally {
		db.close();
	}
});

const transition = {
	runId: "r1",
	phase: "slice",
	status: "committed",
	resumePoint: "next",
} satisfies Parameters<typeof store.recordTransition>[1];

test("normal transition writes require gate context and persist its thread without an ungated overload", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		expect(() =>
			Reflect.apply(store.recordTransition, undefined, [db, transition]),
		).toThrow();
		expect(() => store.recordTransition(db, transition, ctx)).toThrow("lease");
		store.acquireWorkspaceLease(db, {
			runId: "r1",
			workspace: "ws",
			owner: "worker",
			ttlMs: 100,
			nowMs: 1000,
		});
		const row = store.recordTransition(db, transition, ctx);
		expect(row).toEqual(
			expect.objectContaining({
				...transition,
				threadId: "main",
				id: 1,
				evidenceRef: null,
			}),
		);
		expect(() =>
			store.recordTransition(db, { ...transition, runId: "r2" }, ctx),
		).toThrow("run");
		expect(db.query("SELECT count(*) AS n FROM transitions").get()).toEqual({
			n: 1,
		});
	} finally {
		db.close();
	}
});

test("kill scope wins over missing lease and prevents acquisition/renewal but not safe cleanup", () => {
	for (const scope of ["global", "run:r1"]) {
		const db = store.openDb();
		try {
			store.initSchema(db);
			db.query(
				"INSERT INTO kills (scope, engaged_at, actor, reason) VALUES (?, '2026-10-23T00:00:00Z', 'human:test', 'fixture')",
			).run(scope);
			expect(() =>
				db.transaction(() => store.writeGate(db, ctx)).immediate(),
			).toThrow("killed");
			expect(() => store.recordTransition(db, transition, ctx)).toThrow(
				"killed",
			);
			expect(
				store.acquireWorkspaceLease(db, {
					runId: "r1",
					workspace: "ws",
					owner: "worker",
					ttlMs: 100,
					nowMs: 1000,
				}),
			).toEqual({ ok: false, reason: "Lease denied: killed" });
			if (scope === "run:r1") {
				expect(
					store.acquireWorkspaceLease(db, {
						runId: "r2",
						workspace: "ws",
						owner: "worker",
						ttlMs: 100,
						nowMs: 1000,
					}),
				).toEqual({ ok: true, epoch: 1 });
				expect(
					store.acquireWorkspaceLease(db, {
						runId: "r1",
						workspace: "ws",
						owner: "worker",
						ttlMs: 100,
						nowMs: 1001,
					}),
				).toEqual({ ok: false, reason: "Lease denied: killed" });
				expect(
					store.releaseWorkspaceLease(db, {
						workspace: "ws",
						owner: "worker",
						epoch: 1,
						nowMs: 1001,
					}),
				).toBe(true);
			}
			expect(db.query("SELECT count(*) AS n FROM transitions").get()).toEqual({
				n: 0,
			});
		} finally {
			db.close();
		}
	}
});

test("invalid lease time, identity and TTL never create or renew a lease", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		const args = {
			runId: "r1",
			workspace: "ws",
			owner: "worker",
			ttlMs: 100,
			nowMs: 1000,
		};
		for (const patch of [
			{ ttlMs: 0.5 },
			{ ttlMs: Number.MAX_SAFE_INTEGER },
			{ nowMs: NaN },
			{ nowMs: Infinity },
			{ nowMs: -1 },
			{ nowMs: 1.5 },
			{ nowMs: 8_640_000_000_000_000 },
			{ owner: "bad owner" },
			{ runId: "" },
			{ workspace: " ws " },
		])
			expect(store.acquireWorkspaceLease(db, { ...args, ...patch }).ok).toBe(
				false,
			);
		expect(db.query("SELECT count(*) AS n FROM leases").get()).toEqual({
			n: 0,
		});
		store.acquireWorkspaceLease(db, args);
		for (const patch of [
			{ epoch: 0 },
			{ epoch: 1.5 },
			{ owner: "" },
			{ workspace: "" },
			{ nowMs: NaN },
		]) {
			expect(() =>
				Reflect.apply(store.releaseWorkspaceLease, undefined, [
					db,
					{ workspace: "ws", owner: "worker", epoch: 1, nowMs: 1001, ...patch },
				]),
			).toThrow();
		}
		expect(() => store.recordTransition(db, transition, ctx)).not.toThrow();
	} finally {
		db.close();
	}
});

test("CLI record refuses missing context and accepts only an explicitly held matching lease", () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-gate-cli-");
	const path = join(dir, "store.sqlite");
	try {
		const db = store.openDb(path);
		try {
			store.initSchema(db);
			store.acquireWorkspaceLease(db, {
				runId: "r1",
				workspace: "ws",
				owner: "worker",
				ttlMs: 60_000,
			});
			store.initRun(
				db,
				{
					runId: "r1",
					runbook: "fixture",
					goal: "Synthetic gate fixture",
					scale: "small",
					frameworkCommit: "1".repeat(40),
					frameworkVersion: "2.1.0",
					frameworkLockSha256: "2".repeat(64),
				},
				{
					runId: "r1",
					threadId: "main",
					workspace: "ws",
					owner: "worker",
					epoch: 1,
				},
			);
		} finally {
			db.close();
		}
		const base = [
			process.execPath,
			"src/cli.ts",
			"record",
			"--json",
			"--status",
			"running",
			"--db",
			path,
			"--run",
			"r1",
			"--phase",
			"slice",
			"--resume",
			"next",
		];
		const missing = Bun.spawnSync(base, {
			env: {},
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(missing.exitCode).not.toBe(0);
		const flags = [
			"--thread",
			"main",
			"--workspace",
			"ws",
			"--owner",
			"worker",
			"--epoch",
			"1",
		];
		const opened = Bun.spawnSync([...base, ...flags], {
			env: {},
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(opened.exitCode).toBe(0);
		const closing = [...base];
		closing[closing.indexOf("--status") + 1] = "committed";
		const valid = Bun.spawnSync([...closing, ...flags], {
			env: {},
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(valid.exitCode).toBe(0);
		expect(JSON.parse(valid.stdout.toString())).toEqual(
			expect.objectContaining({ ...transition, threadId: "main" }),
		);
		const denied = Bun.spawnSync([...base, ...flags.slice(0, -1), "2"], {
			env: {},
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(denied.exitCode).not.toBe(0);
		expect(denied.stderr.toString()).toContain("lease");
		const db2 = store.openDb(path);
		try {
			expect(db2.query("SELECT count(*) AS n FROM transitions").get()).toEqual({
				n: 3,
			});
		} finally {
			db2.close();
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("explicit null clocks are invalid rather than silently selecting the host clock", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		const args = {
			runId: "r1",
			workspace: "ws",
			owner: "worker",
			ttlMs: 60_000,
			nowMs: null,
		};
		expect(
			Reflect.apply(store.acquireWorkspaceLease, undefined, [db, args]),
		).toEqual({ ok: false, reason: "Invalid lease input" });
		store.acquireWorkspaceLease(db, {
			runId: "r1",
			workspace: "ws",
			owner: "worker",
			ttlMs: 60_000,
		});
		expect(() =>
			Reflect.apply(store.recordTransition, undefined, [
				db,
				transition,
				{ ...ctx, nowMs: null },
			]),
		).toThrow("time");
		expect(() =>
			Reflect.apply(store.releaseWorkspaceLease, undefined, [
				db,
				{ workspace: "ws", owner: "worker", epoch: 1, nowMs: null },
			]),
		).toThrow("time");
	} finally {
		db.close();
	}
});

test("malformed persisted leases and exhausted fencing counters cannot authorize or mutate state", () => {
	for (const patch of [
		{ epoch: 1.5 },
		{ epoch: 0 },
		{ epoch: Number.MAX_SAFE_INTEGER + 1 },
		{ expiresAt: 1.5 },
		{ expiresAt: -1 },
		{ acquiredAt: "bad-date" },
		{ owner: "bad owner" },
	]) {
		const db = store.openDb();
		try {
			store.initSchema(db);
			const lease = {
				owner: "worker",
				epoch: 1,
				expiresAt: 2000,
				acquiredAt: "2026-10-23T00:00:00Z",
				...patch,
			};
			db.query(
				"INSERT INTO leases (workspace,owner,epoch,acquired_at,expires_at,run_id) VALUES ('ws', ?, ?, ?, ?, 'r1')",
			).run(lease.owner, lease.epoch, lease.acquiredAt, lease.expiresAt);
			const before = db.query("SELECT * FROM leases").all();
			expect(() => store.recordTransition(db, transition, ctx)).toThrow();
			expect(() =>
				store.acquireWorkspaceLease(db, {
					runId: "r1",
					workspace: "ws",
					owner: "worker",
					ttlMs: 100,
					nowMs: 3000,
				}),
			).toThrow();
			expect(() =>
				store.releaseWorkspaceLease(db, {
					workspace: "ws",
					owner: "worker",
					epoch: 1,
					nowMs: 1000,
				}),
			).toThrow();
			expect(db.query("SELECT * FROM leases").all()).toEqual(before);
		} finally {
			db.close();
		}
	}
	const db = store.openDb();
	try {
		store.initSchema(db);
		db.query(
			"INSERT INTO leases (workspace,owner,epoch,acquired_at,expires_at,run_id) VALUES ('ws', 'worker', ?, '2026-10-23T00:00:00Z', 0, 'r1')",
		).run(Number.MAX_SAFE_INTEGER);
		expect(() =>
			store.acquireWorkspaceLease(db, {
				runId: "r1",
				workspace: "ws",
				owner: "worker",
				ttlMs: 100,
				nowMs: 1000,
			}),
		).toThrow("epoch");
		expect(db.query("SELECT epoch FROM leases").get()).toEqual({
			epoch: Number.MAX_SAFE_INTEGER,
		});
	} finally {
		db.close();
	}
});

test("native transitions reject forged shapes and scoped queries exclude legacy claims", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		store.acquireWorkspaceLease(db, {
			runId: "r1",
			workspace: "ws",
			owner: "worker",
			ttlMs: 100,
			nowMs: 1000,
		});
		for (const patch of [
			{ status: "success" },
			{ phase: "" },
			{ resumePoint: "bad\npoint" },
			{ evidenceRef: "unknown:value" },
			{ threadId: "forged" },
		]) {
			expect(() =>
				Reflect.apply(store.recordTransition, undefined, [
					db,
					{ ...transition, ...patch },
					ctx,
				]),
			).toThrow();
		}
		for (const patch of [
			{ epoch: 0 },
			{ owner: "bad owner" },
			{ threadId: "" },
			{ nowMs: NaN },
			{ workspace: " ws " },
			{ allow: true },
		]) {
			expect(() =>
				Reflect.apply(store.recordTransition, undefined, [
					db,
					transition,
					{ ...ctx, ...patch },
				]),
			).toThrow();
		}
		store.recordTransition(
			db,
			{ ...transition, evidenceRef: "file:synthetic" },
			ctx,
		);
		store.recordTransition(
			db,
			{ ...transition, resumePoint: "child-next" },
			{ ...ctx, threadId: "child" },
		);
		expect(store.getLastTransition(db, "r1", "main")).toEqual(
			expect.objectContaining({
				resumePoint: "next",
				evidenceRef: "file:synthetic",
			}),
		);
		expect(store.getLastTransition(db, "r1", "child")?.resumePoint).toBe(
			"child-next",
		);
		recordTransitionForMigration(db, {
			...transition,
			resumePoint: "legacy-next",
		});
		expect(store.getLastTransition(db, "r1")?.resumePoint).toBe("legacy-next");
		expect(store.getLastTransition(db, "r1", "main")?.resumePoint).toBe("next");
		expect(store.getLastTransition(db, "r1", "absent")).toBeNull();
		expect(() => store.getLastTransition(db, "r1", "bad thread")).toThrow();
		expect(Reflect.get(store, "recordTransitionForMigration")).toBeUndefined();
		expect(db.query("SELECT count(*) AS n FROM transitions").get()).toEqual({
			n: 3,
		});
	} finally {
		db.close();
	}
});

test("gate checks current kill state on every write while audit observations remain recordable", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		store.acquireWorkspaceLease(db, {
			runId: "r1",
			workspace: "ws",
			owner: "worker",
			ttlMs: 100,
			nowMs: 1000,
		});
		store.recordTransition(db, transition, ctx);
		db.query(
			"INSERT INTO kills (scope, engaged_at, actor, reason) VALUES ('run:r10', 'fixture', 'human:test', 'unrelated')",
		).run();
		store.recordTransition(db, transition, ctx);
		db.query(
			"INSERT INTO kills (scope, engaged_at, actor, reason) VALUES ('run:r1', 'fixture', 'human:test', 'stop')",
		).run();
		expect(() => store.recordTransition(db, transition, ctx)).toThrow("killed");
		store.appendAudit(db, {
			runId: "r1",
			action: "reconciliation",
			decision: "allowed",
			outcome: "interrupted",
		});
		expect(db.query("SELECT count(*) AS n FROM transitions").get()).toEqual({
			n: 2,
		});
		expect(
			store.releaseWorkspaceLease(db, {
				workspace: "ws",
				owner: "other",
				epoch: 1,
				nowMs: 1001,
			}),
		).toBe(false);
		expect(
			store.releaseWorkspaceLease(db, {
				workspace: "ws",
				owner: "worker",
				epoch: 2,
				nowMs: 1001,
			}),
		).toBe(false);
		expect(
			store.releaseWorkspaceLease(db, {
				workspace: "ws",
				owner: "worker",
				epoch: 1,
				nowMs: 1001,
			}),
		).toBe(true);
	} finally {
		db.close();
	}
});

test("outer transaction rollback removes gated writes and lease changes together", () => {
	const db = store.openDb();
	try {
		store.initSchema(db);
		expect(() =>
			db
				.transaction(() => {
					store.acquireWorkspaceLease(db, {
						runId: "r1",
						workspace: "ws",
						owner: "worker",
						ttlMs: 100,
						nowMs: 1000,
					});
					store.recordTransition(db, transition, ctx);
					store.releaseWorkspaceLease(db, {
						workspace: "ws",
						owner: "worker",
						epoch: 1,
						nowMs: 1001,
					});
					throw new Error("abort outer");
				})
				.immediate(),
		).toThrow("abort outer");
		expect(store.getLastTransition(db, "r1", "main")).toBeNull();
		expect(db.query("SELECT count(*) AS n FROM leases").get()).toEqual({
			n: 0,
		});
	} finally {
		db.close();
	}
});

test("eight process contenders produce exactly one effective owner and a busy writer cannot finalize", async () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-gate-race-");
	const path = join(dir, "store.sqlite");
	const db = store.openDb(path);
	try {
		store.initSchema(db);
		const children = Array.from({ length: 8 }, (_, index) =>
			Bun.spawn(
				[
					process.execPath,
					"--eval",
					`
			import * as s from ${JSON.stringify(import.meta.dir + "/../src/index.ts")};
			const db = s.openDb(${JSON.stringify(path)}); db.exec('PRAGMA busy_timeout=5000');
			const owner = 'worker-${index}';
			const lease = s.acquireWorkspaceLease(db, {runId:'r1',workspace:'ws',owner,ttlMs:60000});
			if (lease.ok) s.recordTransition(db, ${JSON.stringify(transition)}, {runId:'r1',threadId:'main',workspace:'ws',owner,epoch:lease.epoch});
			db.close(); process.exit(lease.ok ? 0 : 24);
		`,
				],
				{ env: {}, stdout: "ignore", stderr: "pipe" },
			),
		);
		const results = await Promise.all(children.map((child) => child.exited));
		expect(results.filter((code) => code === 0)).toHaveLength(1);
		expect(results.filter((code) => code === 24)).toHaveLength(7);
		for (const child of children)
			expect(await new Response(child.stderr).text()).toBe("");
		expect(db.query("SELECT count(*) AS n FROM transitions").get()).toEqual({
			n: 1,
		});
		const winner = db
			.query<{ owner: string }, []>("SELECT owner FROM leases")
			.get();
		if (!winner) throw new Error("Missing race winner");
		db.transaction(() => {
			const blocked = Bun.spawnSync(
				[
					process.execPath,
					"--eval",
					`
				import * as s from ${JSON.stringify(import.meta.dir + "/../src/index.ts")};
				const db=s.openDb(${JSON.stringify(path)}); db.exec('PRAGMA busy_timeout=0');
				try { s.recordTransition(db, ${JSON.stringify(transition)}, {runId:'r1',threadId:'main',workspace:'ws',owner:${JSON.stringify(winner.owner)},epoch:1}); }
				catch { process.exit(25); } process.exit(0);
			`,
				],
				{ env: {}, stdout: "pipe", stderr: "pipe" },
			);
			expect(blocked.exitCode).toBe(25);
			expect(blocked.stderr.toString()).toBe("");
		}).immediate();
		expect(db.query("SELECT count(*) AS n FROM transitions").get()).toEqual({
			n: 1,
		});
	} finally {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a deferred outer snapshot cannot finalize after a competing kill commits", () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-gate-snapshot-");
	const path = join(dir, "store.sqlite");
	const db = store.openDb(path);
	try {
		store.initSchema(db);
		store.acquireWorkspaceLease(db, {
			runId: "r1",
			workspace: "ws",
			owner: "worker",
			ttlMs: 100,
			nowMs: 1000,
		});
		db.transaction(() => {
			expect(store.getLastTransition(db, "r1")).toBeNull();
			const kill = Bun.spawnSync(
				[
					process.execPath,
					"--eval",
					`
				import * as s from ${JSON.stringify(import.meta.dir + "/../src/index.ts")};
				const db=s.openDb(${JSON.stringify(path)});
				db.transaction(() => db.query("INSERT INTO kills (scope, engaged_at, actor, reason) VALUES ('run:r1', 'fixture', 'human:test', 'stop')").run()).immediate();
				db.close();
			`,
				],
				{ env: {}, stdout: "pipe", stderr: "pipe" },
			);
			expect(kill.exitCode).toBe(0);
			expect(kill.stderr.toString()).toBe("");
			expect(() => store.recordTransition(db, transition, ctx)).toThrow();
		})();
		expect(() => store.recordTransition(db, transition, ctx)).toThrow("killed");
		expect(store.getLastTransition(db, "r1")).toBeNull();
	} finally {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

test("abrupt process exit rolls back gated progress and committed kill survives reopen", () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-gate-recovery-");
	const path = join(dir, "store.sqlite");
	try {
		const child = Bun.spawnSync(
			[
				process.execPath,
				"--eval",
				`
			import * as s from ${JSON.stringify(import.meta.dir + "/../src/index.ts")};
			const db=s.openDb(${JSON.stringify(path)}); s.initSchema(db);
			s.acquireWorkspaceLease(db, {runId:'r1',workspace:'ws',owner:'worker',ttlMs:100,nowMs:1000});
			s.recordTransition(db, ${JSON.stringify(transition)}, ${JSON.stringify(ctx)});
			db.query("INSERT INTO kills (scope, engaged_at, actor, reason) VALUES ('run:r2', 'fixture', 'human:test', 'stop')").run();
			db.transaction(() => {
				s.recordTransition(db, {...${JSON.stringify(transition)},resumePoint:'uncommitted'}, ${JSON.stringify(ctx)});
				process.exit(23);
			}).immediate();
		`,
			],
			{ env: {}, stdout: "pipe", stderr: "pipe" },
		);
		expect(child.exitCode).toBe(23);
		expect(child.stderr.toString()).toBe("");
		const db = store.openDb(path);
		try {
			store.initSchema(db);
			expect(store.getLastTransition(db, "r1", "main")?.resumePoint).toBe(
				"next",
			);
			expect(() =>
				store.recordTransition(
					db,
					{ ...transition, runId: "r2" },
					{ ...ctx, runId: "r2" },
				),
			).toThrow("killed");
			expect(
				store.acquireWorkspaceLease(db, {
					runId: "r1",
					workspace: "ws",
					owner: "successor",
					ttlMs: 100,
					nowMs: 1100,
				}),
			).toEqual({ ok: true, epoch: 2 });
			expect(() =>
				store.recordTransition(db, transition, { ...ctx, nowMs: 1101 }),
			).toThrow("lease");
		} finally {
			db.close();
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
