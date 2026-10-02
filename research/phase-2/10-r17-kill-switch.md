# R-17 — Kill-Switch Semantics

Status: design. No `src/` changes (implementation rides milestone-1
build authorization with the other enforcement pieces).
Grounding: SPEC milestone bullet 4 (fail-closed manual stop minimum);
01 §2.6 (LaunchDarkly permanent-flag; no vendor global-kill precedent);
R-04 epoch fencing (mechanism, already experiment-proven in R-10);
R-11 audit tiers; R-12 pause-vs-kill distinction.

## What the kill switch is and is not

- It stops **future effects**. Effects already committed stay committed
  (the ledger is immutable; undo is rollback design, R-19, not kill).
  Anyone promising retroactive stop is selling something.
- It is **global or per-run, latched**. Pause (R-12 approval) is
  per-action and reversible by verdict; kill is a state change to the
  harness itself that persists until a human explicitly resets it
  (LaunchDarkly permanent-flag semantics).
- Minimum viable (milestone 1): human-engaged, fail-closed manual stop.
  Richer triggers (automatic on risk score, budget breach) come with
  R-16/R-20 and may only *engage*, never reset.

## Scopes (v1: two, not three)

- `global` — all runs, all threads, all relays. The big red button.
- `run:<run_id>` — one run and its threads. Scoped stop for a runaway
  without halting unrelated work.
- No per-thread kill: threads die with their run. A thread-level stop is
  just lease-transfer denial (R-13 handoff refused), not a kill state.

## Actuation (mechanical, in order, all in one txn where local)

Engaging kill does all of the following; a kill that does only some is
a bug, so the local half is one `BEGIN IMMEDIATE … COMMIT`:

1. **Revoke leases.** Bump every live lease epoch (`global`) or the
   run's threads' epochs (`run:`) without granting a successor. Every
   in-flight owner becomes stale instantly — the R-04 write gate then
   rejects their next mutation with the same path R-10 proved. No
   cooperation from the killed agent required.
2. **Set the kill flag.** `kills(scope, engaged_at, actor, reason)` row;
   latest row per scope is the state (same latest-row pattern as R-11).
   The write gate checks kill state *first* (cheapest check, fails
   fastest), lease second.
3. **Freeze pending approvals.** All non-terminal audit actions in scope
   get a terminal verdict row: `denied` + `not-executed`, actor = the
   killing human, evidence = the kill row. Nothing stays "awaiting
   human" under a kill — silence would be ambiguous, denial is explicit.
4. **Halt the outbox relay** (R-06): relay stops relaying in-scope rows;
   unrelayed rows keep their unapplied state for post-reset triage.
   Relay halt is a flag read per batch, not per row.
5. **Signal runtimes best-effort** (OpenCode `abort`, session cancel
   where an API exists). Best-effort and *outside* the guarantees:
   even if the model keeps talking, no effect can land — the write
   gate and frozen approvals already ensure that. Never treat a
   runtime ACK as the kill; the local state is the kill.

## Authority and audit

- Engage and reset are **critical-tier, human-only** actions (R-03/R-11):
  full audit rows with actor identity and reason evidence. No agent,
  no automation, no API token may engage or reset in v1.
- Reset is a separate audited action, never automatic, never bundled
  with engage. Reset re-verifies: operator reviews unrelayed outbox
  rows and non-terminal audit rows in scope (the R-12 triage queries)
  *before* clearing the flag. Reset does not re-grant leases —
  agents re-acquire normally (fresh epochs, clean fencing).
- Kill-state is visible in `loom status` first line (R-14 bundle gains
  one field). A status that doesn't show kill state is incomplete.

## Latency and honesty bounds

- Kill latency = one local txn + broadcast. Effects committed before
  the txn stay committed; effects in-flight during it either land
  before the epoch bump (then they're pre-kill history) or fail the
  gate after it. There is no middle state, but there is a race window
  measured in milliseconds — document it, don't deny it.
- Crashed-between-engage-steps recovery: engage is one txn for steps
  1–4; step 5 (runtime signals) is recorded as its own audit rows and
  retried on next status/boot. A kill half-signaled is still a full
  kill locally.

## What stays open (explicitly not v1)

- Automatic engagement (risk-score or budget triggers) — R-16/R-20.
- Sandbox destroy/freeze integration — R-15 (v1 refuses new spawns and
  records; teardown rides the sandbox design).
- Cross-harness propagation (two Loom DBs, federated runs) — no
  multi-harness story exists yet; kill is per-DB truthful and silent
  elsewhere, which must be documented at deploy time, not discovered.
