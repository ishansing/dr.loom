# R-10 — Crash Recovery Findings

Status: experiments on throwaway DBs (`/tmp/opencode/loom-exp/r10_*.ts`),
against committed scaffold code only. No enforcement code added to the repo.

## Kill -9 mid-transaction: RECOVER-OK

- Worker committed a baseline (`slice-3/committed`) via `recordTransition`,
  then held an uncommitted `BEGIN IMMEDIATE` insert (`slice-4/running`).
- Parent confirmed the holding state over the worker's stdout pipe, sent
  signal 9, reopened the DB as a fresh operator would.
- After kill: exactly one row (`slice-3/committed`); `getLastTransition`
  returns it with full shape. Uncommitted row gone, no WAL damage,
  `initSchema` re-run is a safe no-op.
- Conclusion: WAL atomicity gives crash recovery for free at the storage
  layer; the resume contract ("last committed transition + evidence refs,
  no conversation history") survives a hard kill.

## Incidental finding: single schema owner required

- First run failed non-atomically: the worker created its own minimal
  `transitions` table (missing `evidence_ref`), `initSchema`'s
  `CREATE TABLE IF NOT EXISTS` left it in place, and the scaffold reader
  then errored (`no such column: evidence_ref`).
- Nothing was corrupt — but it proves every writer must go through one
  schema owner. Out-of-band writers (the exact class R-07 forbids for
  OpenCode's DB) would break Loom the same way. Record as a constraint:
  Loom owns DDL; all writes go through its functions; version the schema
  with migrations once it changes.

## Expiry + succession + stale-reject: FENCE-OK

- A acquires (epoch 1); B blocked mid-TTL (`held by A until …`); B
  acquires post-expiry with epoch 2; A's stale release fails; B's
  wrong-epoch release fails.
- R-04 gate prototype (kept in `/tmp`, out of `src/` while R-01's gate
  holds): live owner+epoch passes, stale-A rejected, expired-B rejected.
- The full acceptance shape — "an expired owner cannot finalize work
  after a successor acquires it" — holds end to end at the experiment
  level; promoting the gate into `src/` waits on R-01 like the rest of
  enforcement.
