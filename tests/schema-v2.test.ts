import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { join } from "node:path";
import {
	acquireWorkspaceLease,
	appendAudit,
	getLastTransition,
	initSchema,
	openDb,
	releaseWorkspaceLease,
} from "../src/index.ts";
import { recordTransitionForMigration } from "../src/store.ts";
import { fixtureEnv, frameworkFixture } from "./fixtures/framework.ts";

// Independent snapshot of the merged scaffold's on-disk schema, not production DDL.
const legacySql = `
  CREATE TABLE transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    status TEXT NOT NULL,
    resume_point TEXT NOT NULL,
    evidence_ref TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_transitions_run ON transitions (run_id, id);
  CREATE TABLE leases (
    workspace TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    epoch INTEGER NOT NULL,
    acquired_at TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    action TEXT NOT NULL,
    decision TEXT NOT NULL,
    outcome TEXT NOT NULL,
    evidence_ref TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
`;

function withStoreFile(run: (path: string) => void): void {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-schema-");
	try {
		run(join(dir, "store.sqlite"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("fresh initialization records schema v2 through v6 exactly once", () => {
	const db = openDb();
	try {
		initSchema(db);
		expect(
			db
				.query(
					"SELECT name FROM sqlite_schema WHERE name = 'schema_migrations'",
				)
				.get(),
		).toEqual({ name: "schema_migrations" });
		expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 6 });
		initSchema(db);
		expect(db.query("SELECT version FROM schema_migrations").all()).toEqual([
			{ version: 2 },
			{ version: 3 },
			{ version: 4 },
			{ version: 5 },
			{ version: 6 },
		]);
	} finally {
		db.close();
	}
});

test("legacy migration preserves claims and leaves identities and authority unknown", () => {
	const db = new Database(":memory:");
	try {
		db.exec(legacySql);
		db.exec(`
      INSERT INTO transitions VALUES (7, 'r1', 'slice', 'committed', 'next', 'file:old', 'old-time');
      INSERT INTO audit VALUES (9, 'r1', 'deploy', 'allowed', 'completed', 'file:claim', 'old-time');
      INSERT INTO leases VALUES ('ws', 'old-owner', 4, 'old-time', 123);
    `);
		initSchema(db);
		expect(db.query("SELECT * FROM transitions").get()).toEqual({
			id: 7,
			run_id: "r1",
			phase: "slice",
			status: "committed",
			resume_point: "next",
			evidence_ref: "file:old",
			created_at: "old-time",
			thread_id: null,
		});
		expect(db.query("SELECT * FROM audit").get()).toEqual({
			id: 9,
			run_id: "r1",
			action: "deploy",
			decision: "allowed",
			outcome: "completed",
			evidence_ref: "file:claim",
			created_at: "old-time",
			thread_id: null,
			action_id: null,
			actor: null,
			tier: null,
		});
		expect(db.query("SELECT * FROM leases").get()).toEqual({
			workspace: "ws",
			owner: "old-owner",
			epoch: 4,
			acquired_at: "old-time",
			expires_at: 123,
			run_id: null,
		});
		for (const table of ["kills", "budgets", "usage", "grants"]) {
			expect(db.query(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({
				n: 0,
			});
		}
		expect(db.query("SELECT * FROM latest_transition").all()).toEqual([]);
		expect(db.query("SELECT * FROM latest_audit").all()).toEqual([]);
		initSchema(db);
		expect(
			db.query("SELECT count(*) AS n FROM schema_migrations").get(),
		).toEqual({ n: 5 });
	} finally {
		db.close();
	}
});

test("unknown, future, partial and drifted stores are refused without mutation", () => {
	for (const setup of [
		(db: Database) =>
			db.exec(
				"CREATE TABLE unrelated (secret TEXT); INSERT INTO unrelated VALUES ('synthetic');",
			),
		(db: Database) => db.exec(`${legacySql} PRAGMA user_version = 99;`),
		(db: Database) =>
			db.exec("CREATE TABLE transitions (id INTEGER PRIMARY KEY);"),
		(db: Database) => {
			db.exec(legacySql);
			db.exec("ALTER TABLE audit ADD COLUMN unexpected TEXT;");
		},
		(db: Database) =>
			db.exec(`${legacySql} CREATE TABLE sqlitexrogue (value TEXT);`),
		(db: Database) => {
			initSchema(db);
			db.exec("DROP VIEW latest_audit;");
		},
		(db: Database) => {
			initSchema(db);
			db.exec("DROP TRIGGER audit_no_replace;");
		},
		(db: Database) => {
			initSchema(db);
			db.exec("UPDATE schema_migrations SET version = 99 WHERE version = 4;");
		},
		(db: Database) => {
			initSchema(db);
			db.exec("UPDATE schema_migrations SET applied_at = '   ';");
		},
		(db: Database) => db.exec("PRAGMA user_version = 99"),
	]) {
		const db = new Database(":memory:");
		try {
			setup(db);
			const before = db.serialize();
			expect(() => initSchema(db)).toThrow("Unsupported Loom schema");
			expect(db.serialize()).toEqual(before);
		} finally {
			db.close();
		}
	}
});

test("audit and usage are immutable including replacement and conflict updates", () => {
	const db = openDb();
	try {
		initSchema(db);
		appendAudit(db, {
			runId: "r",
			action: "claim",
			decision: "allowed",
			outcome: "pending",
		});
		db.exec(
			"INSERT INTO usage (id, run_id, thread_id, kind, amount) VALUES (1, 'r', 't', 'cost-tokens', 3)",
		);
		for (const sql of [
			"UPDATE audit SET outcome = 'completed'",
			"DELETE FROM audit",
			"INSERT OR REPLACE INTO audit (id, run_id, action, decision, outcome) VALUES (1, 'other', 'claim', 'allowed', 'completed')",
			"INSERT INTO audit (id, run_id, action, decision, outcome) VALUES (1, 'r', 'claim', 'allowed', 'completed') ON CONFLICT(id) DO UPDATE SET outcome = 'completed'",
			"UPDATE usage SET amount = 99",
			"DELETE FROM usage",
			"INSERT OR REPLACE INTO usage (id, run_id, thread_id, kind, amount) VALUES (1, 'r', 't', 'cost-tokens', 99)",
		]) {
			expect(() => db.exec(sql)).toThrow("append-only");
		}
		expect(db.query("SELECT outcome FROM audit").get()).toEqual({
			outcome: "pending",
		});
		expect(db.query("SELECT amount FROM usage").get()).toEqual({ amount: 3 });
		appendAudit(db, {
			runId: "r",
			action: "claim",
			decision: "allowed",
			outcome: "pending",
		});
		expect(db.query("SELECT count(*) AS n FROM audit").get()).toEqual({ n: 2 });
	} finally {
		db.close();
	}
});

test("file-backed initialization enforces and reads back durability on every call", () => {
	withStoreFile((path) => {
		const db = openDb(path);
		try {
			initSchema(db);
			db.exec(
				"PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = OFF; PRAGMA recursive_triggers = OFF;",
			);
			initSchema(db);
			expect(db.query("PRAGMA journal_mode").get()).toEqual({
				journal_mode: "wal",
			});
			expect(db.query("PRAGMA synchronous").get()).toEqual({ synchronous: 2 });
			expect(db.query("PRAGMA foreign_keys").get()).toEqual({
				foreign_keys: 1,
			});
			expect(db.query("PRAGMA recursive_triggers").get()).toEqual({
				recursive_triggers: 1,
			});
		} finally {
			db.close();
		}
		const reopened = openDb(path);
		try {
			initSchema(reopened);
			expect(reopened.query("PRAGMA integrity_check").get()).toEqual({
				integrity_check: "ok",
			});
		} finally {
			reopened.close();
		}
	});
});

test("initialization refuses nested transactions and unsupported files before journal changes", () => {
	const db = openDb();
	try {
		initSchema(db);
		db.exec("BEGIN");
		expect(() => initSchema(db)).toThrow("outside a transaction");
		expect(db.inTransaction).toBe(true);
		db.exec("ROLLBACK");
	} finally {
		db.close();
	}
	withStoreFile((path) => {
		const unknown = new Database(path);
		unknown.exec(
			"CREATE TABLE unrelated (value TEXT); INSERT INTO unrelated VALUES ('synthetic');",
		);
		unknown.close();
		const before = readFileSync(path);
		expect(() => openDb(path)).toThrow("Unsupported Loom schema");
		expect(readFileSync(path)).toEqual(before);
	});
});

test("disk exhaustion rolls back a partially applied migration and permits a clean retry", () => {
	withStoreFile((path) => {
		const db = new Database(path);
		try {
			db.exec(legacySql);
			db.exec(
				"INSERT INTO audit VALUES (9, 'r', 'claim', 'allowed', 'pending', NULL, 'old-time')",
			);
			db.exec("PRAGMA journal_mode = WAL");
			const pages = db
				.query<{ page_count: number }, []>("PRAGMA page_count")
				.get();
			if (!pages) throw new Error("missing page count");
			db.exec(`PRAGMA max_page_count = ${pages.page_count + 1}`);
			const before = db.serialize();
			expect(() => initSchema(db)).toThrow("full");
			expect(db.inTransaction).toBe(false);
			expect(db.serialize()).toEqual(before);
			db.exec("PRAGMA max_page_count = 10000");
			initSchema(db);
			expect(db.query("SELECT id, action_id FROM audit").get()).toEqual({
				id: 9,
				action_id: null,
			});
		} finally {
			db.close();
		}
		const reopened = openDb(path);
		try {
			initSchema(reopened);
			expect(reopened.query("PRAGMA integrity_check").get()).toEqual({
				integrity_check: "ok",
			});
		} finally {
			reopened.close();
		}
	});
});

test("latest views keep run, thread and action identities separate from legacy claims", () => {
	const db = openDb();
	try {
		initSchema(db);
		const transition = db.query(
			"INSERT INTO transitions (run_id, phase, status, resume_point, thread_id) VALUES (?, 'slice', 'running', ?, ?)",
		);
		transition.run("r1", "old", "main");
		transition.run("r1", "new", "main");
		transition.run("r1", "child", "child");
		transition.run("r2", "other", "main");
		transition.run("r1", "legacy", null);
		expect(
			db
				.query(
					"SELECT run_id, thread_id, resume_point FROM latest_transition ORDER BY run_id, thread_id",
				)
				.all(),
		).toEqual([
			{ run_id: "r1", thread_id: "child", resume_point: "child" },
			{ run_id: "r1", thread_id: "main", resume_point: "new" },
			{ run_id: "r2", thread_id: "main", resume_point: "other" },
		]);
		const audit = db.query(
			"INSERT INTO audit (run_id, action, decision, outcome, thread_id, action_id, actor, tier) VALUES (?, 'synthetic', 'pending', ?, ?, ?, ?, ?)",
		);
		audit.run("r1", "pending", "main", "a1", "human:test", "standard");
		audit.run("r1", "interrupted", "main", "a1", "human:test", "standard");
		audit.run("r1", "pending", "child", "a1", "human:test", "standard");
		audit.run("r2", "pending", "main", "a1", "human:test", "standard");
		audit.run("r1", "completed", "main", "legacy", null, null);
		expect(
			db
				.query(
					"SELECT run_id, thread_id, action_id, outcome FROM latest_audit ORDER BY run_id, thread_id",
				)
				.all(),
		).toEqual([
			{ run_id: "r1", thread_id: "child", action_id: "a1", outcome: "pending" },
			{
				run_id: "r1",
				thread_id: "main",
				action_id: "a1",
				outcome: "interrupted",
			},
			{ run_id: "r2", thread_id: "main", action_id: "a1", outcome: "pending" },
		]);
	} finally {
		db.close();
	}
});

test("a consistent legacy backup can restore into a separate verified migration clone", () => {
	withStoreFile((path) => {
		const backup = `${path}.backup`;
		const restored = `${path}.restored`;
		const source = new Database(path);
		try {
			source.exec(legacySql);
			source.exec(
				"INSERT INTO audit VALUES (50, 'r', 'claim', 'allowed', 'pending', NULL, 'old-time'); DELETE FROM audit; INSERT INTO audit VALUES (9, 'r', 'claim', 'allowed', 'pending', NULL, 'old-time');",
			);
			source.exec("PRAGMA journal_mode = WAL");
			source.query("VACUUM INTO ?").run(backup);
			const originalBackup = readFileSync(backup);
			initSchema(source);
			expect(
				appendAudit(source, {
					runId: "r",
					action: "new",
					decision: "allowed",
					outcome: "pending",
				}).id,
			).toBe(51);
			copyFileSync(backup, restored);
			const clone = openDb(restored);
			try {
				initSchema(clone);
				expect(clone.query("PRAGMA integrity_check").get()).toEqual({
					integrity_check: "ok",
				});
				expect(
					clone.query("SELECT id, action_id, created_at FROM audit").all(),
				).toEqual([{ id: 9, action_id: null, created_at: "old-time" }]);
				expect(
					appendAudit(clone, {
						runId: "r",
						action: "new",
						decision: "allowed",
						outcome: "pending",
					}).id,
				).toBe(51);
			} finally {
				clone.close();
			}
			expect(readFileSync(backup)).toEqual(originalBackup);
			const readonly = new Database(backup, { readonly: true });
			try {
				expect(() => initSchema(readonly)).toThrow();
				expect(readonly.query("PRAGMA user_version").get()).toEqual({
					user_version: 0,
				});
			} finally {
				readonly.close();
			}
		} finally {
			source.close();
		}
	});
});

test("new storage constraints accept explicit facts but reject invalid counters and grants", () => {
	const db = openDb();
	try {
		initSchema(db);
		db.exec(`
      INSERT INTO kills (scope, engaged_at, actor, reason) VALUES ('global', 'now', 'human:test', 'synthetic');
      INSERT INTO budgets VALUES ('r', 'cost-tokens', 0, NULL, 'now');
      INSERT INTO usage (run_id, thread_id, kind, amount) VALUES ('r', 'main', 'cost-tokens', 0);
      INSERT INTO grants VALUES ('g1', 'r', 'main', 'read', 'docs/*', 123);
    `);
		expect(db.query('SELECT used, "limit" FROM budgets').get()).toEqual({
			used: 0,
			limit: null,
		});
		for (const sql of [
			"INSERT INTO budgets VALUES ('r2', 'cost-tokens', -1, NULL, 'now')",
			"INSERT INTO budgets VALUES ('r2', 'cost-tokens', 0, -1, 'now')",
			"INSERT INTO budgets VALUES ('r2', 'cost-tokens', 1.5, NULL, 'now')",
			"INSERT INTO budgets VALUES ('r2', 'unknown', 0, NULL, 'now')",
			"INSERT INTO usage (run_id, thread_id, kind, amount) VALUES ('r', '', 'cost-tokens', 1)",
			"INSERT INTO usage (run_id, thread_id, kind, amount) VALUES ('r', 't', 'cost-tokens', 9007199254740992)",
			"INSERT INTO grants VALUES ('g2', 'r', 'main', 'read', 'docs/*', -1)",
			"INSERT INTO grants VALUES ('g2', 'r', 'main', '', 'docs/*', 1)",
		])
			expect(() => db.exec(sql)).toThrow();
		// SQLite's generated NEW.id is -1; explicit negative legacy IDs must not block appends.
		db.exec(
			"INSERT INTO audit (id, run_id, action, decision, outcome) VALUES (-1, 'r', 'legacy', 'allowed', 'pending')",
		);
		appendAudit(db, {
			runId: "r",
			action: "claim",
			decision: "allowed",
			outcome: "pending",
		});
		expect(() =>
			db.exec(
				"INSERT OR REPLACE INTO audit (id, run_id, action, decision, outcome) VALUES (-1, 'other', 'bad', 'allowed', 'completed')",
			),
		).toThrow("append-only");
	} finally {
		db.close();
	}
});

test("legacy migration helper retains shapes and lease callers use explicit run context", () => {
	const db = openDb();
	try {
		initSchema(db);
		expect(getLastTransition(db, "missing")).toBeNull();
		const t = recordTransitionForMigration(db, {
			runId: "r",
			phase: "slice",
			status: "running",
			resumePoint: "next",
		});
		expect(Object.keys(t).sort()).toEqual([
			"createdAt",
			"evidenceRef",
			"id",
			"phase",
			"resumePoint",
			"runId",
			"status",
		]);
		expect(getLastTransition(db, "r")).toEqual(t);
		expect(() =>
			recordTransitionForMigration(db, {
				runId: "",
				phase: "slice",
				status: "running",
				resumePoint: "next",
			}),
		).toThrow("required");
		expect(() =>
			appendAudit(db, {
				runId: "",
				action: "claim",
				decision: "allowed",
				outcome: "pending",
			}),
		).toThrow("required");
		expect(
			acquireWorkspaceLease(db, {
				runId: "r",
				workspace: "",
				owner: "a",
				ttlMs: 10,
			}).ok,
		).toBe(false);
		expect(
			acquireWorkspaceLease(db, {
				runId: "r",
				workspace: "ws",
				owner: "a",
				ttlMs: -1,
			}).ok,
		).toBe(false);
		expect(
			acquireWorkspaceLease(db, {
				runId: "r",
				workspace: "ws",
				owner: "a",
				ttlMs: 10,
				nowMs: 0,
			}),
		).toEqual({ ok: true, epoch: 1 });
		expect(
			acquireWorkspaceLease(db, {
				runId: "r",
				workspace: "ws",
				owner: "a",
				ttlMs: 20,
				nowMs: 1,
			}),
		).toEqual({ ok: true, epoch: 1 });
		expect(
			releaseWorkspaceLease(db, {
				workspace: "ws",
				owner: "a",
				epoch: 1,
				nowMs: 1,
			}),
		).toBe(true);
	} finally {
		db.close();
	}
});

test("CLI init, gated record and status refuse an unknown schema", () => {
	withStoreFile((path) => {
		const framework = frameworkFixture();
		try {
			const fixture = openDb(path);
			try {
				initSchema(fixture);
				acquireWorkspaceLease(fixture, {
					runId: "r",
					workspace: "ws",
					owner: "a",
					ttlMs: 60_000,
				});
			} finally {
				fixture.close();
			}
			const context = [
				"--run",
				"r",
				"--thread",
				"main",
				"--workspace",
				"ws",
				"--owner",
				"a",
				"--epoch",
				"1",
			];
			const commands = [
				[
					"init",
					...context,
					"--runbook",
					"fixture",
					"--goal",
					"Synthetic schema fixture",
					"--skills-root",
					framework.skillsRoot,
				],
				[
					"record",
					...context,
					"--phase",
					"slice",
					"--resume",
					"next",
					"--status",
					"running",
				],
				[
					"record",
					...context,
					"--phase",
					"slice",
					"--resume",
					"next",
					"--status",
					"committed",
				],
				["status", "--run", "r"],
			];
			function invoke(args: string[]) {
				return Bun.spawnSync(
					[
						process.execPath,
						import.meta.dir + "/../src/cli.ts",
						...args,
						"--db",
						path,
						"--json",
					],
					{
						cwd: framework.dir,
						env: fixtureEnv,
						stdout: "pipe",
						stderr: "pipe",
					},
				);
			}
			for (const args of commands) {
				const result = invoke(args);
				expect(result.exitCode).toBe(0);
				const output = JSON.parse(result.stdout.toString());
				if (args[0] === "status")
					expect(output.threads[0].lastCommitted).toEqual(
						expect.objectContaining({
							runId: "r",
							phase: "slice",
							status: "committed",
							resumePoint: "next",
						}),
					);
				else if (args[0] === "record")
					expect(output).toEqual(
						expect.objectContaining({
							runId: "r",
							phase: "slice",
							status: args.includes("running") ? "running" : "committed",
							resumePoint: "next",
						}),
					);
				else
					expect(output).toEqual(
						expect.objectContaining({ runId: "r", runbook: "fixture" }),
					);
			}
			const db = openDb(path);
			db.exec("PRAGMA user_version = 99");
			db.close();
			const before = readFileSync(path);
			for (const args of [commands[0], commands[2], commands[3]]) {
				if (!args) throw new Error("Missing schema fixture command");
				const result = invoke(args);
				expect(result.exitCode).not.toBe(0);
				expect(result.stderr.toString()).toContain("Unsupported Loom schema");
			}
			expect(readFileSync(path)).toEqual(before);
		} finally {
			framework.close();
		}
	});
});

test("a competing writer prevents migration without leaving partial schema changes", () => {
	withStoreFile((path) => {
		const owner = new Database(path);
		owner.exec(legacySql);
		owner.exec("PRAGMA journal_mode = WAL");
		const contender = new Database(path);
		try {
			owner.exec("BEGIN IMMEDIATE");
			expect(() => initSchema(contender)).toThrow("locked");
			expect(contender.query("PRAGMA user_version").get()).toEqual({
				user_version: 0,
			});
			expect(
				contender
					.query(
						"SELECT name FROM sqlite_schema WHERE name = 'schema_migrations'",
					)
					.get(),
			).toBeNull();
			owner.exec("ROLLBACK");
			initSchema(contender);
			expect(contender.query("PRAGMA user_version").get()).toEqual({
				user_version: 6,
			});
		} finally {
			if (owner.inTransaction) owner.exec("ROLLBACK");
			contender.close();
			owner.close();
		}
	});
});
