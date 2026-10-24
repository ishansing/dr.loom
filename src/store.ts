import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";

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

export interface WriteContext {
	runId: string;
	threadId: string;
	workspace: string;
	owner: string;
	epoch: number;
	nowMs?: number;
}

function checkScope(value: string): void {
	if (/\s/.test(checkedText(value, "scope key")))
		throw new Error("Invalid scope key");
}

function checkedTime(value: number): number {
	if (
		!Number.isSafeInteger(value) ||
		value < 0 ||
		value > 8_640_000_000_000_000
	)
		throw new Error("Invalid lease time");
	return value;
}

function checkEpoch(value: number): void {
	if (!Number.isSafeInteger(value) || value <= 0)
		throw new Error("Invalid lease epoch");
}

function readLease(db: Database, workspace: string): Lease | null {
	const row = db
		.query<
			Lease,
			[string]
		>(`SELECT workspace, owner, epoch, acquired_at AS acquiredAt,
    expires_at AS expiresAt FROM leases WHERE workspace = ?`)
		.get(workspace);
	if (row) {
		checkScope(row.owner);
		checkEpoch(row.epoch);
		checkedTime(row.expiresAt);
		if (
			typeof row.acquiredAt !== "string" ||
			!Number.isFinite(Date.parse(row.acquiredAt))
		)
			throw new Error("Invalid lease history");
	}
	return row;
}

function isKilled(db: Database, runId: string): boolean {
	return (
		db
			.query<{ scope: string }, [string]>(
				"SELECT scope FROM kills WHERE scope = 'global' OR scope = ? LIMIT 1",
			)
			.get(`run:${runId}`) !== null
	);
}

/** Trusted synchronous transaction check, not a transferable execution grant. */
export function writeGate(db: Database, ctx: WriteContext): void {
	if (!db.inTransaction)
		throw new Error("Write gate requires an active transaction");
	checkFields(ctx, [
		"runId",
		"threadId",
		"workspace",
		"owner",
		"epoch",
		"nowMs",
	]);
	checkScope(ctx.runId);
	checkScope(ctx.threadId);
	checkScope(ctx.owner);
	checkedText(ctx.workspace, "workspace", 4096);
	checkEpoch(ctx.epoch);
	const now = checkedTime(ctx.nowMs === undefined ? Date.now() : ctx.nowMs);
	if (isKilled(db, ctx.runId)) throw new Error("Write gate denied: killed");
	const lease = readLease(db, ctx.workspace);
	if (
		!lease ||
		lease.owner !== ctx.owner ||
		lease.epoch !== ctx.epoch ||
		lease.expiresAt <= now
	)
		throw new Error("Write gate denied: invalid or expired lease");
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

const outboxSql = `
  CREATE TABLE outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    intent_id TEXT NOT NULL UNIQUE,
    run_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    workspace TEXT NOT NULL,
    action_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    target TEXT NOT NULL,
    payload TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    replay TEXT NOT NULL CHECK (replay IN ('idempotent','reconcile')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (run_id, action_id)
  );
  CREATE TABLE outbox_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    intent_id TEXT NOT NULL REFERENCES outbox(intent_id),
    attempt_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('dispatched','applied','unknown','not-applied')),
    owner TEXT NOT NULL,
    epoch INTEGER NOT NULL,
    actor TEXT NOT NULL,
    evidence_ref TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_outbox_scope ON outbox(run_id, thread_id, workspace, id);
  CREATE INDEX idx_outbox_events ON outbox_events(intent_id, id);
  CREATE TABLE relay_cursors (
    run_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    workspace TEXT NOT NULL,
    last_id INTEGER NOT NULL REFERENCES outbox(id),
    PRIMARY KEY (run_id, thread_id, workspace)
  );
  ${["outbox", "outbox_events"]
		.map(
			(table) => `
    CREATE TRIGGER ${table}_no_update BEFORE UPDATE ON ${table} BEGIN
      SELECT RAISE(ABORT, 'outbox is append-only');
    END;
    CREATE TRIGGER ${table}_no_delete BEFORE DELETE ON ${table} BEGIN
      SELECT RAISE(ABORT, 'outbox is append-only');
    END;
    CREATE TRIGGER ${table}_no_replace BEFORE INSERT ON ${table}
    WHEN NEW.id != -1 AND EXISTS (SELECT 1 FROM ${table} WHERE id = NEW.id) BEGIN
      SELECT RAISE(ABORT, 'outbox is append-only');
    END;
  `,
		)
		.join("")}
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
		const v2 = schemaSignature(db);
		db.exec(outboxSql);
		return { empty, legacy, v2, current: schemaSignature(db) };
	} finally {
		db.close();
	}
})();

function schemaKind(db: Database): "empty" | "legacy" | "v2" | "current" {
	const version = db
		.query<{ user_version: number }, []>("PRAGMA user_version")
		.get()?.user_version;
	const signature = schemaSignature(db);
	if (version === 0 && signature === supportedSchemas.empty) return "empty";
	if (version === 0 && signature === supportedSchemas.legacy) return "legacy";
	if (
		(version === 2 && signature === supportedSchemas.v2) ||
		(version === 3 && signature === supportedSchemas.current)
	) {
		const rows = db
			.query<{ version: number; applied_at: string }, []>(
				"SELECT version, applied_at FROM schema_migrations ORDER BY version",
			)
			.all();
		if (
			rows.length === version - 1 &&
			rows.every(
				(row, index) =>
					row.version === index + 2 &&
					typeof row.applied_at === "string" &&
					row.applied_at.trim(),
			)
		)
			return version === 2 ? "v2" : "current";
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
		if (kind !== "v2") {
			db.exec(migrationSql);
			db.exec(`INSERT INTO schema_migrations (version, applied_at)
        VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ','now'));`);
		}
		db.exec(outboxSql);
		db.exec(`
      INSERT INTO schema_migrations (version, applied_at)
      VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
      PRAGMA user_version = 3;
    `);
	}).immediate();
}

/** Trusted legacy fixtures/migrations only; never use for native admission. */
export function recordTransitionForMigration(
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

export function recordTransition(
	db: Database,
	t: Parameters<typeof recordTransitionForMigration>[1],
	ctx: WriteContext,
): Transition & { threadId: string } {
	checkFields(t, ["runId", "phase", "status", "resumePoint", "evidenceRef"]);
	checkScope(t.runId);
	checkedText(t.phase, "phase");
	checkedText(t.resumePoint, "resume point", 4096);
	if (
		!["pending", "running", "committed", "failed", "interrupted"].includes(
			t.status,
		)
	)
		throw new Error("Invalid transition status");
	const evidenceRef = checkedEvidence(t.evidenceRef, true);
	return db
		.transaction(() => {
			writeGate(db, ctx);
			if (t.runId !== ctx.runId)
				throw new Error("Transition run does not match gate context");
			const row = db
				.query<
					Transition & { threadId: string },
					[string, string, string, string, string, string | null]
				>(
					`INSERT INTO transitions (run_id, thread_id, phase, status, resume_point, evidence_ref)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id, run_id AS runId, thread_id AS threadId, phase,
       status, resume_point AS resumePoint, evidence_ref AS evidenceRef, created_at AS createdAt`,
				)
				.get(
					t.runId,
					ctx.threadId,
					t.phase,
					t.status,
					t.resumePoint,
					evidenceRef,
				);
			if (!row) throw new Error("Failed to record transition");
			return row;
		})
		.immediate();
}

export function getLastTransition(
	db: Database,
	runId: string,
	threadId?: string,
): Transition | null {
	if (threadId !== undefined) {
		checkScope(runId);
		checkScope(threadId);
		return (
			db
				.query<Transition, [string, string]>(
					`SELECT id, run_id AS runId, phase, status, resume_point AS resumePoint,
       evidence_ref AS evidenceRef, created_at AS createdAt FROM transitions
       WHERE run_id = ? AND thread_id = ? ORDER BY id DESC LIMIT 1`,
				)
				.get(runId, threadId) ?? null
		);
	}
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
 * shortcut: workspace-wide identity; add path-level leases only if measured contention requires it.
 */
export function acquireWorkspaceLease(
	db: Database,
	args: {
		runId: string;
		workspace: string;
		owner: string;
		ttlMs: number;
		nowMs?: number;
	},
): { ok: true; epoch: number } | { ok: false; reason: string } {
	return db
		.transaction(() => {
			let nowMs: number;
			try {
				checkFields(args, ["runId", "workspace", "owner", "ttlMs", "nowMs"]);
				checkScope(args.runId);
				checkScope(args.owner);
				checkedText(args.workspace, "workspace", 4096);
				nowMs = checkedTime(args.nowMs === undefined ? Date.now() : args.nowMs);
				if (!Number.isSafeInteger(args.ttlMs) || args.ttlMs <= 0)
					throw new Error("Invalid TTL");
				checkedTime(nowMs + args.ttlMs);
			} catch {
				return { ok: false as const, reason: "Invalid lease input" };
			}
			const { workspace, owner, ttlMs } = args;
			if (isKilled(db, args.runId))
				return { ok: false as const, reason: "Lease denied: killed" };
			const cur = readLease(db, workspace);
			if (!cur || cur.expiresAt <= nowMs) {
				const epoch = (cur?.epoch ?? 0) + 1;
				checkEpoch(epoch);
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
				).run(
					Math.max(cur.expiresAt, nowMs + ttlMs),
					new Date(nowMs).toISOString(),
					workspace,
				);
				return { ok: true as const, epoch: cur.epoch };
			}
			return {
				ok: false as const,
				reason: "Workspace lease held",
			};
		})
		.immediate();
}

export function releaseWorkspaceLease(
	db: Database,
	args: { workspace: string; owner: string; epoch: number; nowMs?: number },
): boolean {
	return db
		.transaction(() => {
			checkFields(args, ["workspace", "owner", "epoch", "nowMs"]);
			checkedText(args.workspace, "workspace", 4096);
			checkScope(args.owner);
			checkEpoch(args.epoch);
			const now = checkedTime(
				args.nowMs === undefined ? Date.now() : args.nowMs,
			);
			readLease(db, args.workspace);
			const res = db
				.query(
					`UPDATE leases SET expires_at = 0 WHERE workspace = ? AND owner = ? AND epoch = ? AND expires_at > ?`,
				)
				.run(args.workspace, args.owner, args.epoch, now);
			return res.changes > 0;
		})
		.immediate();
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

export type AuditDecision =
	| "pending"
	| "allowed"
	| "denied"
	| "escalated"
	| "expired";
export type AuditOutcome =
	| "pending"
	| "completed"
	| "failed"
	| "interrupted"
	| "timeout"
	| "not-executed";
export type AuditTier = "standard" | "high-risk" | "critical";

export interface ActionKey {
	runId: string;
	threadId: string;
	actionId: string;
}

export interface ActionAuditEntry extends ActionKey {
	id: number;
	action: string;
	actor: string;
	tier: AuditTier;
	decision: AuditDecision;
	outcome: AuditOutcome;
	evidenceRef: string | null;
	createdAt: string;
}

function checkedText(value: unknown, label: string, max = 256): string {
	if (
		typeof value !== "string" ||
		!value ||
		value.length > max ||
		value !== value.trim() ||
		/[\u0000-\u001f\u007f]/.test(value)
	) {
		throw new Error(`Invalid ${label}`);
	}
	return value;
}

function checkFields(value: object, allowed: readonly string[]): void {
	if (!value || typeof value !== "object")
		throw new Error("Invalid action input");
	if (Object.keys(value).some((field) => !allowed.includes(field)))
		throw new Error("Unknown action field");
}

function checkKey(key: ActionKey): void {
	if (!key || typeof key !== "object") throw new Error("Invalid action key");
	for (const value of [key.runId, key.threadId, key.actionId]) {
		if (/\s/.test(checkedText(value, "action key")))
			throw new Error("Invalid action key");
	}
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
			key.actionId,
		)
	) {
		throw new Error("Invalid action ID");
	}
}

function checkActor(actor: string): void {
	if (!/^(agent|human|system):\S+$/.test(checkedText(actor, "actor")))
		throw new Error("Invalid actor");
}

function checkTier(tier: AuditTier): void {
	if (!["standard", "high-risk", "critical"].includes(tier))
		throw new Error("Invalid tier");
}

function checkedEvidence(value: unknown, optional = false): string | null {
	if (value === undefined && optional) return null;
	const evidence = checkedText(value, "evidence reference", 4096);
	if (!/^(cmd|file|session|url|trace|approval|archive):\S/.test(evidence))
		throw new Error("Invalid evidence reference");
	return evidence;
}

const actionColumns = `id, run_id AS runId, thread_id AS threadId, action_id AS actionId,
  action, actor, tier, decision, outcome, evidence_ref AS evidenceRef, created_at AS createdAt`;

function checkActionStep(
	previous: ActionAuditEntry | undefined,
	event: Omit<ActionAuditEntry, "id" | "createdAt">,
): void {
	checkKey(event);
	checkActor(event.actor);
	checkTier(event.tier);
	checkedText(event.action, "action");
	if (previous || event.evidenceRef !== null)
		checkedEvidence(event.evidenceRef);
	if (!previous) {
		if (event.decision !== "pending" || event.outcome !== "pending")
			throw new Error("Action history must begin with a request");
		return;
	}
	if (
		event.runId !== previous.runId ||
		event.threadId !== previous.threadId ||
		event.actionId !== previous.actionId ||
		event.action !== previous.action ||
		event.tier !== previous.tier
	) {
		throw new Error("Action identity changed");
	}
	const verdict =
		previous.outcome === "pending" &&
		["pending", "escalated"].includes(previous.decision) &&
		["allowed", "denied", "escalated", "expired"].includes(event.decision) &&
		event.outcome ===
			(["denied", "expired"].includes(event.decision)
				? "not-executed"
				: "pending");
	const finish =
		previous.decision === "allowed" &&
		previous.outcome === "pending" &&
		event.decision === "allowed" &&
		["completed", "failed", "interrupted", "timeout"].includes(event.outcome);
	if (!verdict && !finish) throw new Error("Invalid action transition");
}

function insertActionRow(
	db: Database,
	event: Omit<ActionAuditEntry, "id" | "createdAt">,
	previous?: ActionAuditEntry,
): ActionAuditEntry {
	checkActionStep(previous, event);
	const row = db
		.query<
			ActionAuditEntry,
			[
				string,
				string,
				string,
				string,
				string,
				AuditTier,
				AuditDecision,
				AuditOutcome,
				string | null,
			]
		>(
			`INSERT INTO audit (run_id, thread_id, action_id, action, actor, tier, decision, outcome, evidence_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${actionColumns}`,
		)
		.get(
			event.runId,
			event.threadId,
			event.actionId,
			event.action,
			event.actor,
			event.tier,
			event.decision,
			event.outcome,
			event.evidenceRef,
		);
	if (!row || !Number.isSafeInteger(row.id) || row.id <= 0)
		throw new Error("Failed to record action");
	return row;
}

// shortcut: validate full run history; use a verified indexed projection if measured run sizes make this costly.
function readActions(
	db: Database,
	runId: string,
): Map<string, ActionAuditEntry> {
	if (/\s/.test(checkedText(runId, "run ID")))
		throw new Error("Invalid run ID");
	const rows = db
		.query<ActionAuditEntry, [string]>(
			`SELECT ${actionColumns} FROM audit WHERE run_id = ? AND
     (thread_id IS NOT NULL OR action_id IS NOT NULL OR actor IS NOT NULL OR tier IS NOT NULL)
     ORDER BY id`,
		)
		.all(runId);
	const actions = new Map<string, ActionAuditEntry>();
	for (const row of rows) {
		checkedText(row.createdAt, "action timestamp");
		if (
			!Number.isSafeInteger(row.id) ||
			row.id <= 0 ||
			!Number.isFinite(Date.parse(row.createdAt))
		)
			throw new Error("Invalid action history");
		checkActionStep(actions.get(row.actionId), row);
		actions.set(row.actionId, row);
	}
	return actions;
}

export function getAction(
	db: Database,
	key: ActionKey,
): ActionAuditEntry | null {
	checkFields(key, ["runId", "threadId", "actionId"]);
	checkKey(key);
	const row = readActions(db, key.runId).get(key.actionId) ?? null;
	if (row && row.threadId !== key.threadId)
		throw new Error("Action belongs to another thread");
	return row;
}

export function listOpenActions(
	db: Database,
	args: { runId: string; threadId?: string },
): ActionAuditEntry[] {
	checkFields(args, ["runId", "threadId"]);
	if (
		args.threadId !== undefined &&
		/\s/.test(checkedText(args.threadId, "thread ID"))
	)
		throw new Error("Invalid thread ID");
	return [...readActions(db, args.runId).values()]
		.filter(
			(row) =>
				row.outcome === "pending" &&
				(args.threadId === undefined || row.threadId === args.threadId),
		)
		.sort((a, b) => a.id - b.id);
}

export function openAction(
	db: Database,
	args: ActionKey & {
		action: string;
		actor: string;
		tier: AuditTier;
		evidenceRef?: string;
	},
): ActionAuditEntry {
	checkFields(args, [
		"runId",
		"threadId",
		"actionId",
		"action",
		"actor",
		"tier",
		"evidenceRef",
	]);
	checkKey(args);
	checkedText(args.action, "action");
	checkActor(args.actor);
	checkTier(args.tier);
	const evidenceRef = checkedEvidence(args.evidenceRef, true);
	return db
		.transaction(() => {
			if (readActions(db, args.runId).has(args.actionId))
				throw new Error("Action already exists");
			return insertActionRow(db, {
				runId: args.runId,
				threadId: args.threadId,
				actionId: args.actionId,
				action: args.action,
				actor: args.actor,
				tier: args.tier,
				decision: "pending",
				outcome: "pending",
				evidenceRef,
			});
		})
		.immediate();
}

export function recordVerdict(
	db: Database,
	args: ActionKey & {
		actor: string;
		decision: Exclude<AuditDecision, "pending">;
		evidenceRef: string;
	},
): ActionAuditEntry {
	checkFields(args, [
		"runId",
		"threadId",
		"actionId",
		"actor",
		"decision",
		"evidenceRef",
	]);
	checkKey(args);
	checkActor(args.actor);
	if (!["allowed", "denied", "escalated", "expired"].includes(args.decision))
		throw new Error("Invalid verdict");
	const evidenceRef = checkedEvidence(args.evidenceRef);
	return db
		.transaction(() => {
			const previous = getAction(db, {
				runId: args.runId,
				threadId: args.threadId,
				actionId: args.actionId,
			});
			if (!previous) throw new Error("Action not found");
			return insertActionRow(
				db,
				{
					...previous,
					actor: args.actor,
					decision: args.decision,
					outcome: ["denied", "expired"].includes(args.decision)
						? "not-executed"
						: "pending",
					evidenceRef,
				},
				previous,
			);
		})
		.immediate();
}

export function recordFinish(
	db: Database,
	args: ActionKey & {
		actor: string;
		outcome: Exclude<AuditOutcome, "pending" | "not-executed">;
		evidenceRef: string;
	},
): ActionAuditEntry {
	checkFields(args, [
		"runId",
		"threadId",
		"actionId",
		"actor",
		"outcome",
		"evidenceRef",
	]);
	checkKey(args);
	checkActor(args.actor);
	if (!["completed", "failed", "interrupted", "timeout"].includes(args.outcome))
		throw new Error("Invalid finish outcome");
	const evidenceRef = checkedEvidence(args.evidenceRef);
	return db
		.transaction(() => {
			const previous = getAction(db, {
				runId: args.runId,
				threadId: args.threadId,
				actionId: args.actionId,
			});
			if (!previous) throw new Error("Action not found");
			return insertActionRow(
				db,
				{
					...previous,
					actor: args.actor,
					decision: "allowed",
					outcome: args.outcome,
					evidenceRef,
				},
				previous,
			);
		})
		.immediate();
}

export type OutboxReplay = "idempotent" | "reconcile";
export type OutboxObservation = "applied" | "unknown" | "not-applied";
export interface OutboxIntent {
	intentId: string;
	actionId: string;
	kind: string;
	target: string;
	payload: string;
	replay: OutboxReplay;
}
export interface OutboxAttempt {
	attemptId: string;
	owner: string;
	epoch: number;
	state: "dispatched" | OutboxObservation;
	evidenceRef: string;
}
export interface OutboxRecord extends OutboxIntent {
	id: number;
	runId: string;
	threadId: string;
	workspace: string;
	payloadHash: string;
	createdAt: string;
	state: "pending" | "dispatched" | "unknown" | "applied";
	attempts: OutboxAttempt[];
}
type OutboxRow = Omit<OutboxRecord, "state" | "attempts">;
type OutboxEvent = OutboxAttempt & {
	id: number;
	actor: string;
	createdAt: string;
};

function checkFixture(value: string): void {
	if (
		typeof value !== "string" ||
		!/^fixture:[a-zA-Z0-9._:-]{1,200}$/.test(value)
	)
		throw new Error("Invalid synthetic target identity");
}

function payloadHash(payload: string): string {
	if (typeof payload !== "string" || Buffer.byteLength(payload) > 65_536)
		throw new Error("Invalid outbox payload");
	try {
		JSON.parse(payload);
	} catch {
		throw new Error("Invalid outbox payload");
	}
	return createHash("sha256").update(payload).digest("hex");
}

function checkIntent(
	intent: OutboxIntent,
	scope: { runId: string; threadId: string },
): string {
	checkKey({ ...scope, actionId: intent.intentId });
	checkKey({ ...scope, actionId: intent.actionId });
	checkFixture(intent.kind);
	checkFixture(intent.target);
	if (intent.replay !== "idempotent" && intent.replay !== "reconcile")
		throw new Error("Invalid replay contract");
	return payloadHash(intent.payload);
}

const outboxColumns = `id, intent_id AS intentId, action_id AS actionId, run_id AS runId,
  thread_id AS threadId, workspace, kind, target, payload, payload_hash AS payloadHash,
  replay, created_at AS createdAt`;

export function getOutbox(db: Database, intentId: string): OutboxRecord | null {
	checkKey({ runId: "outbox", threadId: "query", actionId: intentId });
	const row = db
		.query<OutboxRow, [string]>(
			`SELECT ${outboxColumns} FROM outbox WHERE intent_id = ?`,
		)
		.get(intentId);
	if (!row) return null;
	if (
		checkIntent(row, row) !== row.payloadHash ||
		!Number.isSafeInteger(row.id) ||
		row.id <= 0 ||
		!Number.isFinite(Date.parse(row.createdAt))
	)
		throw new Error("Invalid outbox history");
	checkedText(row.workspace, "workspace", 4096);
	const attempts = new Map<string, OutboxAttempt>();
	const events = db
		.query<
			OutboxEvent,
			[string]
		>(`SELECT id, attempt_id AS attemptId, owner, epoch, state,
    actor, evidence_ref AS evidenceRef, created_at AS createdAt FROM outbox_events WHERE intent_id = ? ORDER BY id`)
		.all(intentId);
	for (const event of events) {
		checkKey({
			runId: row.runId,
			threadId: row.threadId,
			actionId: event.attemptId,
		});
		checkScope(event.owner);
		checkEpoch(event.epoch);
		checkActor(event.actor);
		checkedEvidence(event.evidenceRef);
		if (
			!Number.isSafeInteger(event.id) ||
			event.id <= 0 ||
			!Number.isFinite(Date.parse(event.createdAt))
		)
			throw new Error("Invalid outbox event");
		const previous = attempts.get(event.attemptId);
		if (event.state === "dispatched") {
			if (
				previous ||
				[...attempts.values()].some(
					(a) =>
						a.state === "applied" ||
						(row.replay === "reconcile" && a.state !== "not-applied"),
				)
			)
				throw new Error("Invalid outbox dispatch history");
		} else if (
			!previous ||
			previous.owner !== event.owner ||
			previous.epoch !== event.epoch ||
			!["dispatched", "unknown"].includes(previous.state) ||
			!["applied", "unknown", "not-applied"].includes(event.state)
		) {
			throw new Error("Invalid outbox observation history");
		}
		attempts.set(event.attemptId, {
			attemptId: event.attemptId,
			owner: event.owner,
			epoch: event.epoch,
			state: event.state,
			evidenceRef: event.evidenceRef,
		});
	}
	const values = [...attempts.values()];
	const state = values.some((a) => a.state === "applied")
		? "applied"
		: values.some((a) => a.state === "unknown")
			? "unknown"
			: values.some((a) => a.state === "dispatched")
				? "dispatched"
				: "pending";
	return { ...row, state, attempts: values };
}

function requireOutbox(db: Database, intentId: string): OutboxRecord {
	const record = getOutbox(db, intentId);
	if (!record) throw new Error("Outbox intent not found");
	return record;
}

function checkOutboxAction(
	db: Database,
	ctx: WriteContext,
	actionId: string,
): void {
	const action = getAction(db, {
		runId: ctx.runId,
		threadId: ctx.threadId,
		actionId,
	});
	if (!action || action.decision !== "allowed" || action.outcome !== "pending")
		throw new Error("Outbox requires an allowed unresolved action");
}

export function enqueueOutbox(
	db: Database,
	ctx: WriteContext,
	args: OutboxIntent,
): OutboxRecord {
	if (!db.inTransaction)
		throw new Error("Enqueue requires the business transaction");
	writeGate(db, ctx);
	checkFields(args, [
		"intentId",
		"actionId",
		"kind",
		"target",
		"payload",
		"replay",
	]);
	const hash = checkIntent(args, ctx);
	checkOutboxAction(db, ctx, args.actionId);
	const previous = getOutbox(db, args.intentId);
	if (previous) {
		if (
			previous.runId !== ctx.runId ||
			previous.threadId !== ctx.threadId ||
			previous.workspace !== ctx.workspace ||
			previous.actionId !== args.actionId ||
			previous.kind !== args.kind ||
			previous.target !== args.target ||
			previous.payload !== args.payload ||
			previous.replay !== args.replay
		)
			throw new Error("Intent already bound to different content");
		return previous;
	}
	db.query(`INSERT INTO outbox (intent_id, action_id, run_id, thread_id, workspace, kind, target, payload, payload_hash, replay)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
		args.intentId,
		args.actionId,
		ctx.runId,
		ctx.threadId,
		ctx.workspace,
		args.kind,
		args.target,
		args.payload,
		hash,
		args.replay,
	);
	return requireOutbox(db, args.intentId);
}

export function listUnresolvedOutbox(
	db: Database,
	args: { runId: string; threadId?: string; workspace?: string },
): OutboxRecord[] {
	checkFields(args, ["runId", "threadId", "workspace"]);
	checkScope(args.runId);
	if (args.threadId !== undefined) checkScope(args.threadId);
	if (args.workspace !== undefined)
		checkedText(args.workspace, "workspace", 4096);
	// shortcut: validate scoped intent histories; add a verified projection only when measured backlog requires it.
	return db
		.query<
			{ intentId: string },
			[string, string | null, string | null, string | null, string | null]
		>(
			`SELECT intent_id AS intentId FROM outbox WHERE run_id = ? AND (? IS NULL OR thread_id = ?)
     AND (? IS NULL OR workspace = ?) ORDER BY id`,
		)
		.all(
			args.runId,
			args.threadId ?? null,
			args.threadId ?? null,
			args.workspace ?? null,
			args.workspace ?? null,
		)
		.map((row) => requireOutbox(db, row.intentId))
		.filter((row) => row.state !== "applied");
}

function insertOutboxEvent(
	db: Database,
	intentId: string,
	attempt: OutboxAttempt,
	actor: string,
): void {
	db.query(`INSERT INTO outbox_events (intent_id, attempt_id, state, owner, epoch, actor, evidence_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
		intentId,
		attempt.attemptId,
		attempt.state,
		attempt.owner,
		attempt.epoch,
		actor,
		attempt.evidenceRef,
	);
}

function observeOutbox(
	db: Database,
	args: {
		intentId: string;
		attemptId: string;
		outcome: OutboxObservation;
		actor: string;
		evidenceRef: string;
	},
): OutboxRecord {
	if (!["applied", "unknown", "not-applied"].includes(args.outcome))
		throw new Error("Invalid outbox observation");
	checkActor(args.actor);
	checkedEvidence(args.evidenceRef);
	return db
		.transaction(() => {
			const row = requireOutbox(db, args.intentId);
			const attempt = row.attempts.find((a) => a.attemptId === args.attemptId);
			if (!attempt) throw new Error("Dispatch attempt not found");
			if (["applied", "not-applied"].includes(attempt.state)) {
				if (attempt.state !== args.outcome)
					throw new Error("Conflicting terminal observation");
				return row;
			}
			insertOutboxEvent(
				db,
				row.intentId,
				{ ...attempt, state: args.outcome, evidenceRef: args.evidenceRef },
				args.actor,
			);
			return requireOutbox(db, row.intentId);
		})
		.immediate();
}

export function reconcileOutbox(
	db: Database,
	args: {
		intentId: string;
		attemptId: string;
		outcome: OutboxObservation;
		actor: string;
		evidenceRef: string;
	},
): OutboxRecord {
	checkFields(args, [
		"intentId",
		"attemptId",
		"outcome",
		"actor",
		"evidenceRef",
	]);
	checkActor(args.actor);
	if (!args.actor.startsWith("human:"))
		throw new Error("Trusted human reconciliation required");
	checkKey({
		runId: "outbox",
		threadId: "reconcile",
		actionId: args.attemptId,
	});
	return observeOutbox(db, args);
}

export interface SyntheticOutboxAdapter {
	synthetic: true;
	kind: string;
	target: string;
	replay: OutboxReplay;
	execute: (
		intent: OutboxRecord,
		attemptId: string,
	) => Promise<{ outcome: "applied" | "unknown"; evidenceRef: string }>;
}

function relayCursor(db: Database, ctx: WriteContext): number {
	const id =
		db
			.query<{ lastId: number }, [string, string, string]>(
				"SELECT last_id AS lastId FROM relay_cursors WHERE run_id = ? AND thread_id = ? AND workspace = ?",
			)
			.get(ctx.runId, ctx.threadId, ctx.workspace)?.lastId ?? 0;
	if (!Number.isSafeInteger(id) || id < 0)
		throw new Error("Invalid relay cursor");
	return id;
}

export async function relayBatch(
	db: Database,
	context: WriteContext,
	adapter: SyntheticOutboxAdapter,
	limit = 10,
): Promise<{ cursor: number; results: OutboxRecord[] }> {
	if (db.inTransaction) throw new Error("Relay must run outside a transaction");
	if (!Number.isInteger(limit) || limit < 1 || limit > 100)
		throw new Error("Invalid relay limit");
	checkFields(adapter, ["synthetic", "kind", "target", "replay", "execute"]);
	if (
		adapter.synthetic !== true ||
		typeof adapter.execute !== "function" ||
		!["idempotent", "reconcile"].includes(adapter.replay)
	)
		throw new Error("Synthetic adapter required");
	checkFixture(adapter.kind);
	checkFixture(adapter.target);
	const { kind, target, replay, execute } = adapter;
	const ctx = { ...context };
	db.transaction(() => writeGate(db, ctx)).immediate();
	const pending = listUnresolvedOutbox(db, {
		runId: ctx.runId,
		threadId: ctx.threadId,
		workspace: ctx.workspace,
	})
		.filter((row) => row.kind === kind && row.target === target)
		.slice(0, limit);
	const results: OutboxRecord[] = [];
	for (const candidate of pending) {
		const intentId = candidate.intentId;
		const admission = db
			.transaction(() => {
				writeGate(db, ctx);
				relayCursor(db, ctx);
				const current = requireOutbox(db, intentId);
				if (current.state === "applied") return null;
				if (current.replay !== replay)
					throw new Error("Replay contract mismatch");
				if (
					replay === "reconcile" &&
					current.attempts.some((a) => a.state !== "not-applied")
				)
					throw new Error("Target reconciliation required before replay");
				checkOutboxAction(db, ctx, current.actionId);
				const attempt: OutboxAttempt = {
					attemptId: randomUUID(),
					owner: ctx.owner,
					epoch: ctx.epoch,
					state: "dispatched",
					evidenceRef: "trace:synthetic-dispatch-admitted",
				};
				insertOutboxEvent(db, intentId, attempt, "system:outbox");
				db.query(`INSERT INTO relay_cursors (run_id, thread_id, workspace, last_id) VALUES (?, ?, ?, ?)
        ON CONFLICT(run_id,thread_id,workspace) DO UPDATE SET last_id = max(last_id, excluded.last_id)`).run(
					ctx.runId,
					ctx.threadId,
					ctx.workspace,
					current.id,
				);
				return {
					row: requireOutbox(db, intentId),
					attemptId: attempt.attemptId,
				};
			})
			.immediate();
		if (!admission) continue;
		let observation: { outcome: "applied" | "unknown"; evidenceRef: string };
		try {
			observation = await execute(
				Object.freeze(admission.row),
				admission.attemptId,
			);
			checkFields(observation, ["outcome", "evidenceRef"]);
			if (
				observation.outcome !== "applied" &&
				observation.outcome !== "unknown"
			)
				throw new Error("Invalid target result");
			checkedEvidence(observation.evidenceRef);
		} catch {
			observation = {
				outcome: "unknown",
				evidenceRef: "trace:synthetic-adapter-unconfirmed",
			};
		}
		results.push(
			observeOutbox(db, {
				intentId,
				attemptId: admission.attemptId,
				outcome: observation.outcome,
				evidenceRef: observation.evidenceRef,
				actor: "system:outbox",
			}),
		);
		if (observation.outcome === "unknown") break;
	}
	return { cursor: relayCursor(db, ctx), results };
}
