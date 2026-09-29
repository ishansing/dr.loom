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
	db.exec("PRAGMA journal_mode = WAL;");
	db.exec("PRAGMA foreign_keys = ON;");
	return db;
}

export function initSchema(db: Database): void {
	db.exec(`
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
  `);
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
