-- Independent additive v3 snapshot from d0a02dd; apply after schema-v2.sql.
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
CREATE TRIGGER outbox_no_update BEFORE UPDATE ON outbox BEGIN
  SELECT RAISE(ABORT, 'outbox is append-only');
END;
CREATE TRIGGER outbox_no_delete BEFORE DELETE ON outbox BEGIN
  SELECT RAISE(ABORT, 'outbox is append-only');
END;
CREATE TRIGGER outbox_no_replace BEFORE INSERT ON outbox
WHEN NEW.id != -1 AND EXISTS (SELECT 1 FROM outbox WHERE id = NEW.id) BEGIN
  SELECT RAISE(ABORT, 'outbox is append-only');
END;
CREATE TRIGGER outbox_events_no_update BEFORE UPDATE ON outbox_events BEGIN
  SELECT RAISE(ABORT, 'outbox is append-only');
END;
CREATE TRIGGER outbox_events_no_delete BEFORE DELETE ON outbox_events BEGIN
  SELECT RAISE(ABORT, 'outbox is append-only');
END;
CREATE TRIGGER outbox_events_no_replace BEFORE INSERT ON outbox_events
WHEN NEW.id != -1 AND EXISTS (SELECT 1 FROM outbox_events WHERE id = NEW.id) BEGIN
  SELECT RAISE(ABORT, 'outbox is append-only');
END;
INSERT INTO schema_migrations VALUES (3, '2026-10-24T00:00:00Z');
PRAGMA user_version = 3;
