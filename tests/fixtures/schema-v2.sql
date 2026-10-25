-- Independent DDL snapshot from 39cb915, not imported from current application DDL.
CREATE TABLE IF NOT EXISTS transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  resume_point TEXT NOT NULL,
  evidence_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_transitions_run ON transitions (run_id, id);
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
INSERT INTO schema_migrations VALUES (2, '2026-10-23T00:00:00Z');
PRAGMA user_version = 2;
