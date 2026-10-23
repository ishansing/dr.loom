import { Database } from "bun:sqlite";

export type TransitionStatus =
	| "pending"
	| "running"
	| "committed"
	| "failed"
	| "interrupted";

export interface Transition {
	id: number;
	runId: string;
	phase: string;
	status: TransitionStatus;
	resumePoint: string;
	evidenceRef: string | null;
	createdAt: string;
}

export interface Lease {
	workspace: string;
	owner: string;
	epoch: number;
	acquiredAt: string;
	expiresAt: number;
}

export interface AuditEntry {
	id: number;
	runId: string;
	action: string;
	decision: "allowed" | "denied";
	outcome: "completed" | "failed" | "interrupted" | "pending";
	evidenceRef: string | null;
	createdAt: string;
}

export function openDb(path: string = ":memory:"): Database {
	const db = new Database(path, { create: true });
	try {
		prepareDb(db);
		return db;
	} catch (error) {
		db.close();
		throw error;
	}
}

const legacySql = `
    CREATE TABLE IF NOT EXISTS transitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      status TEXT NOT NULL,
      resume_point TEXT NOT NULL,
      evidence_ref TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_transitions_run
      ON transitions (run_id, id);
    CREATE TABLE IF NOT EXISTS leases (
      workspace TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      epoch INTEGER NOT NULL,
      acquired_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      action TEXT NOT NULL,
      decision TEXT NOT NULL,
      outcome TEXT NOT NULL,
      evidence_ref TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `;

const migrationSql = `
      ALTER TABLE transitions ADD COLUMN thread_id TEXT;
      ALTER TABLE audit ADD COLUMN thread_id TEXT;
      ALTER TABLE audit ADD COLUMN action_id TEXT;
      ALTER TABLE audit ADD COLUMN actor TEXT;
      ALTER TABLE audit ADD COLUMN tier TEXT;
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE kills (
        scope TEXT PRIMARY KEY NOT NULL CHECK (length(trim(scope)) > 0),
        engaged_at TEXT NOT NULL,
        actor TEXT NOT NULL CHECK (length(trim(actor)) > 0),
        reason TEXT NOT NULL
      );
      CREATE TABLE budgets (
        run_id TEXT NOT NULL CHECK (length(trim(run_id)) > 0),
        kind TEXT NOT NULL CHECK (kind IN ('time-ms','retries','cost-tokens','cost-minor-units','threads','tool-calls')),
        used INTEGER NOT NULL CHECK (typeof(used) = 'integer' AND used BETWEEN 0 AND 9007199254740991),
        "limit" INTEGER CHECK ("limit" IS NULL OR (typeof("limit") = 'integer' AND "limit" BETWEEN 0 AND 9007199254740991)),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (run_id, kind)
      );
      CREATE TABLE usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL CHECK (length(trim(run_id)) > 0),
        thread_id TEXT NOT NULL CHECK (length(trim(thread_id)) > 0),
        kind TEXT NOT NULL CHECK (kind IN ('time-ms','retries','cost-tokens','cost-minor-units','threads','tool-calls')),
        amount INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount BETWEEN 0 AND 9007199254740991),
        evidence_ref TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE TABLE grants (
        grant_id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(grant_id)) > 0),
        run_id TEXT NOT NULL CHECK (length(trim(run_id)) > 0),
        thread_id TEXT NOT NULL CHECK (length(trim(thread_id)) > 0),
        tool TEXT NOT NULL CHECK (length(trim(tool)) > 0),
        pattern TEXT NOT NULL CHECK (length(trim(pattern)) > 0),
        expires_at INTEGER NOT NULL CHECK (typeof(expires_at) = 'integer' AND expires_at BETWEEN 0 AND 9007199254740991)
      );
      CREATE INDEX idx_transitions_thread ON transitions (run_id, thread_id, id);
      CREATE INDEX idx_audit_action ON audit (run_id, thread_id, action_id, id);
      CREATE INDEX idx_usage_thread ON usage (run_id, thread_id, id);
      CREATE VIEW latest_transition AS
        SELECT t.* FROM transitions t
        WHERE length(trim(t.thread_id)) > 0 AND t.id = (
          SELECT max(id) FROM transitions
          WHERE run_id = t.run_id AND thread_id = t.thread_id
        );
      CREATE VIEW latest_audit AS
        SELECT a.* FROM audit a
        WHERE length(trim(a.thread_id)) > 0 AND length(trim(a.action_id)) > 0
          AND length(trim(a.actor)) > 0 AND a.tier IN ('standard','high-risk','critical')
          AND a.id = (
            SELECT max(id) FROM audit
            WHERE run_id = a.run_id AND thread_id = a.thread_id AND action_id = a.action_id
          );
      CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN
        SELECT RAISE(ABORT, 'audit is append-only');
      END;
      CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN
        SELECT RAISE(ABORT, 'audit is append-only');
      END;
      CREATE TRIGGER audit_no_replace BEFORE INSERT ON audit
      WHEN NEW.id != -1 AND EXISTS (SELECT 1 FROM audit WHERE id = NEW.id) BEGIN
        SELECT RAISE(ABORT, 'audit is append-only');
      END;
      CREATE TRIGGER usage_no_update BEFORE UPDATE ON usage BEGIN
        SELECT RAISE(ABORT, 'usage is append-only');
      END;
      CREATE TRIGGER usage_no_delete BEFORE DELETE ON usage BEGIN
        SELECT RAISE(ABORT, 'usage is append-only');
      END;
      CREATE TRIGGER usage_no_replace BEFORE INSERT ON usage
      WHEN NEW.id != -1 AND EXISTS (SELECT 1 FROM usage WHERE id = NEW.id) BEGIN
        SELECT RAISE(ABORT, 'usage is append-only');
      END;
`;

function schemaSignature(db: Database): string {
	return JSON.stringify(
		db
			.query<{ type: string; name: string; tbl_name: string; sql: string }, []>(
				"SELECT type, name, tbl_name, sql FROM main.sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY type, name",
			)
			.all()
			.map((row) => ({
				...row,
				sql: row.sql
					.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\s+/g, (part) =>
						/^\s/.test(part) ? " " : part,
					)
					.trim(),
			})),
	);
}

const supportedSchemas = (() => {
	const db = new Database(":memory:");
	try {
		const empty = schemaSignature(db);
		db.exec(legacySql);
		const legacy = schemaSignature(db);
		db.exec(migrationSql);
		return { empty, legacy, current: schemaSignature(db) };
	} finally {
		db.close();
	}
})();

function schemaKind(db: Database): "empty" | "legacy" | "current" {
	const version = db
		.query<{ user_version: number }, []>("PRAGMA user_version")
		.get()?.user_version;
	const signature = schemaSignature(db);
	if (version === 0 && signature === supportedSchemas.empty) return "empty";
	if (version === 0 && signature === supportedSchemas.legacy) return "legacy";
	if (version === 2 && signature === supportedSchemas.current) {
		const rows = db
			.query<{ version: number; applied_at: string }, []>(
				"SELECT version, applied_at FROM schema_migrations",
			)
			.all();
		if (
			rows.length === 1 &&
			rows[0]?.version === 2 &&
			typeof rows[0].applied_at === "string" &&
			rows[0].applied_at.trim()
		)
			return "current";
	}
	throw new Error("Unsupported Loom schema; database left unchanged");
}

function prepareDb(db: Database): void {
	if (db.inTransaction)
		throw new Error("Initialize Loom outside a transaction");
	schemaKind(db);
	const main = db
		.query<{ name: string; file: string }, []>("PRAGMA database_list")
		.all()
		.find((row) => row.name === "main");
	db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA recursive_triggers = ON;
  `);
	if (
		db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()
			?.journal_mode !== (main?.file ? "wal" : "memory") ||
		db.query<{ synchronous: number }, []>("PRAGMA synchronous").get()
			?.synchronous !== 2 ||
		db.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get()
			?.foreign_keys !== 1 ||
		db
			.query<{ recursive_triggers: number }, []>("PRAGMA recursive_triggers")
			.get()?.recursive_triggers !== 1
	) {
		throw new Error("SQLite durability requirements not met");
	}
}

export function initSchema(db: Database): void {
	prepareDb(db);
	db.transaction(() => {
		const kind = schemaKind(db);
		if (kind === "current") return;
		if (kind === "empty") db.exec(legacySql);
		db.exec(migrationSql);
		db.exec(`
      INSERT INTO schema_migrations (version, applied_at)
      VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
      PRAGMA user_version = 2;
    `);
	}).immediate();
}

export function recordTransition(
	db: Database,
	t: {
		runId: string;
		phase: string;
		status: TransitionStatus;
		resumePoint: string;
		evidenceRef?: string | undefined;
	},
): Transition {
	if (!t.runId || !t.phase || !t.status || !t.resumePoint) {
		throw new Error("runId/phase/status/resumePoint are required");
	}
	const row = db
		.query<Transition, [string, string, string, string, string | null]>(
			`INSERT INTO transitions (run_id, phase, status, resume_point, evidence_ref)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id, run_id AS runId, phase, status, resume_point AS resumePoint,
                 evidence_ref AS evidenceRef, created_at AS createdAt`,
		)
		.get(t.runId, t.phase, t.status, t.resumePoint, t.evidenceRef ?? null);
	if (!row) throw new Error("failed to record transition");
	return row;
}

export function getLastTransition(
	db: Database,
	runId: string,
): Transition | null {
	return (
		db
			.query<Transition, [string]>(
				`SELECT id, run_id AS runId, phase, status, resume_point AS resumePoint,
                evidence_ref AS evidenceRef, created_at AS createdAt
         FROM transitions WHERE run_id = ? ORDER BY id DESC LIMIT 1`,
			)
			.get(runId) ?? null
	);
}

/**
 * Workspace-wide lease: at most one valid owner per workspace.
 * Same owner may renew (keeps epoch); a new owner may acquire only
 * after expiry and gets epoch = prev + 1 (fencing token).
 * ponytail: single-workspace row, no per-path leases until contention demands it.
 */
export function acquireWorkspaceLease(
	db: Database,
	args: { workspace: string; owner: string; ttlMs: number; nowMs?: number },
): { ok: true; epoch: number } | { ok: false; reason: string } {
	if (!args.workspace || !args.owner) {
		return { ok: false, reason: "workspace and owner are required" };
	}
	if (!Number.isFinite(args.ttlMs) || args.ttlMs <= 0) {
		return { ok: false, reason: "ttlMs must be > 0" };
	}
	const now = args.nowMs ?? Date.now();
	const acquire = db.transaction(
		(workspace: string, owner: string, ttlMs: number, nowMs: number) => {
			const cur =
				db
					.query<Lease, [string]>(
						`SELECT workspace, owner, epoch, acquired_at AS acquiredAt,
                    expires_at AS expiresAt FROM leases WHERE workspace = ?`,
					)
					.get(workspace) ?? null;
			if (!cur || cur.expiresAt <= nowMs) {
				const epoch = (cur?.epoch ?? 0) + 1;
				db.query(
					`INSERT INTO leases (workspace, owner, epoch, acquired_at, expires_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (workspace) DO UPDATE SET
             owner = excluded.owner, epoch = excluded.epoch,
             acquired_at = excluded.acquired_at, expires_at = excluded.expires_at`,
				).run(
					workspace,
					owner,
					epoch,
					new Date(nowMs).toISOString(),
					nowMs + ttlMs,
				);
				return { ok: true as const, epoch };
			}
			if (cur.owner === owner) {
				db.query(
					`UPDATE leases SET expires_at = ?, acquired_at = ? WHERE workspace = ?`,
				).run(nowMs + ttlMs, new Date(nowMs).toISOString(), workspace);
				return { ok: true as const, epoch: cur.epoch };
			}
			return {
				ok: false as const,
				reason: `workspace held by ${cur.owner} until ${cur.expiresAt}`,
			};
		},
	);
	return acquire(args.workspace, args.owner, args.ttlMs, now);
}

export function releaseWorkspaceLease(
	db: Database,
	args: { workspace: string; owner: string; epoch: number },
): boolean {
	const res = db
		.query(`DELETE FROM leases WHERE workspace = ? AND owner = ? AND epoch = ?`)
		.run(args.workspace, args.owner, args.epoch);
	return res.changes > 0;
}

export function appendAudit(
	db: Database,
	e: {
		runId: string;
		action: string;
		decision: "allowed" | "denied";
		outcome: "completed" | "failed" | "interrupted" | "pending";
		evidenceRef?: string | undefined;
	},
): AuditEntry {
	if (!e.runId || !e.action) throw new Error("runId and action are required");
	const row = db
		.query<AuditEntry, [string, string, string, string, string | null]>(
			`INSERT INTO audit (run_id, action, decision, outcome, evidence_ref)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id, run_id AS runId, action, decision, outcome,
                 evidence_ref AS evidenceRef, created_at AS createdAt`,
		)
		.get(e.runId, e.action, e.decision, e.outcome, e.evidenceRef ?? null);
	if (!row) throw new Error("failed to append audit entry");
	return row;
}
