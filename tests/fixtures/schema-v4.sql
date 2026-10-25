-- Fixed T-05/T-06 v4 delta (9f3241a); apply after schema-v2.sql and schema-v3.sql.
CREATE TABLE kill_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tier TEXT NOT NULL DEFAULT 'critical' CHECK (tier = 'critical'),
  operation_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('engage','reset')),
  stage TEXT NOT NULL CHECK (stage IN ('requested','allowed','completed')),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  cleanup_ref TEXT,
  previous_latch TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (operation_id, stage)
);
ALTER TABLE leases ADD COLUMN run_id TEXT;
ALTER TABLE kills ADD COLUMN event_id INTEGER REFERENCES kill_events(id);
CREATE TABLE kill_denials (
  audit_id INTEGER PRIMARY KEY REFERENCES audit(id),
  kill_event_id INTEGER NOT NULL REFERENCES kill_events(id)
);
CREATE TRIGGER kill_events_no_update BEFORE UPDATE ON kill_events BEGIN
  SELECT RAISE(ABORT, 'kill history is append-only');
END;
CREATE TRIGGER kill_events_no_delete BEFORE DELETE ON kill_events BEGIN
  SELECT RAISE(ABORT, 'kill history is append-only');
END;
CREATE TRIGGER kill_denials_no_update BEFORE UPDATE ON kill_denials BEGIN
  SELECT RAISE(ABORT, 'kill history is append-only');
END;
CREATE TRIGGER kill_denials_no_delete BEFORE DELETE ON kill_denials BEGIN
  SELECT RAISE(ABORT, 'kill history is append-only');
END;
CREATE TRIGGER kill_events_no_replace BEFORE INSERT ON kill_events
WHEN NEW.id != -1 AND EXISTS (SELECT 1 FROM kill_events WHERE id = NEW.id) BEGIN
  SELECT RAISE(ABORT, 'kill history is append-only');
END;
CREATE TRIGGER kill_denials_no_replace BEFORE INSERT ON kill_denials
WHEN EXISTS (SELECT 1 FROM kill_denials WHERE audit_id = NEW.audit_id) BEGIN
  SELECT RAISE(ABORT, 'kill history is append-only');
END;
INSERT INTO schema_migrations (version, applied_at) VALUES (4, '2026-10-24T00:00:00Z');
PRAGMA user_version = 4;
