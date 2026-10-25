-- Fixed T-07 v5 delta (555586b); apply after schema-v2.sql through schema-v4.sql.
CREATE TABLE runs (
  run_id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(run_id)) > 0),
  runbook TEXT NOT NULL CHECK (length(trim(runbook)) > 0),
  goal TEXT NOT NULL CHECK (length(trim(goal)) > 0),
  scale TEXT NOT NULL CHECK (scale IN ('small','standard','greenfield','e2e')),
  framework_commit TEXT NOT NULL CHECK (length(framework_commit) = 40),
  framework_version TEXT NOT NULL CHECK (length(trim(framework_version)) > 0),
  framework_lock_sha256 TEXT NOT NULL CHECK (length(framework_lock_sha256) = 64),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE transition_evidence (
  transition_id INTEGER NOT NULL REFERENCES transitions(id),
  position INTEGER NOT NULL CHECK (position >= 0),
  evidence_ref TEXT NOT NULL CHECK (length(trim(evidence_ref)) > 0),
  PRIMARY KEY (transition_id, position),
  UNIQUE (transition_id, evidence_ref)
);
CREATE TRIGGER runs_no_update BEFORE UPDATE ON runs BEGIN
  SELECT RAISE(ABORT, 'run history is append-only');
END;
CREATE TRIGGER runs_no_delete BEFORE DELETE ON runs BEGIN
  SELECT RAISE(ABORT, 'run history is append-only');
END;
CREATE TRIGGER transition_evidence_no_update BEFORE UPDATE ON transition_evidence BEGIN
  SELECT RAISE(ABORT, 'run history is append-only');
END;
CREATE TRIGGER transition_evidence_no_delete BEFORE DELETE ON transition_evidence BEGIN
  SELECT RAISE(ABORT, 'run history is append-only');
END;
CREATE TRIGGER runs_no_replace BEFORE INSERT ON runs
WHEN EXISTS (SELECT 1 FROM runs WHERE run_id = NEW.run_id) BEGIN
  SELECT RAISE(ABORT, 'run history is append-only');
END;
CREATE TRIGGER transition_evidence_no_replace BEFORE INSERT ON transition_evidence
WHEN EXISTS (SELECT 1 FROM transition_evidence WHERE transition_id = NEW.transition_id
  AND (position = NEW.position OR evidence_ref = NEW.evidence_ref)) BEGIN
  SELECT RAISE(ABORT, 'run history is append-only');
END;
INSERT INTO schema_migrations VALUES (5, '2026-10-25T00:00:00Z');
PRAGMA user_version = 5;
