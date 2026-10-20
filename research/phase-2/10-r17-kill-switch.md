# R-17 — Kill-Switch Semantics

Status: design. No `src/` changes (implementation rides milestone-1
build authorization with the other enforcement pieces).
Grounding: SPEC milestone bullet 4 (fail-closed manual stop minimum);
01 §2.6 (LaunchDarkly permanent-flag; no vendor global-kill precedent);
R-04 epoch fencing (mechanism, already experiment-proven in R-10);
R-11 audit tiers; R-12 pause-vs-kill distinction.

**2026-10-20 refinement:** [Pi execution probes](../pi/11-pi-1.3.0-execution-coverage.md)
disproved hook-only cancellation/containment assumptions. The normative
[SPEC boundary](../../SPEC.md#runtime-architecture-and-security-boundary-2026-10-20-decision)
requires external containment and reconciliation of already-dispatched
effects. This design is not implemented by the current scaffold.

## What the kill switch is and is not

- It stops **new admissions/dispatches through Loom's effect gate**.
  Already-dispatched remote actions may commit after kill, even after a
  cancellation ACK. Record and reconcile their actual outcomes; cancellation
  is not rollback (R-19). Local execution requires external containment;
  neither hook denial nor epoch fencing alone stops an arbitrary process.
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
   The write gate checks kill state *first* (cheapest check, fails fastest),
   then deadline/grant/policy/lease in the SPEC order at the write boundary.
3. **Freeze pending approvals.** Undispatched actions awaiting approval get
   terminal `denied` + `not-executed` rows, actor = the killing human,
   evidence = the kill row. Do not rewrite the history of an already-dispatched
   action as a denial/non-execution. Keep it tracked until observed or
   reconciled; interrupted/timeout evidence is not proof of no effect.
4. **Halt the outbox relay** (R-06): relay stops relaying in-scope rows;
   unrelayed rows keep their unapplied state for post-reset triage.
   Recheck the live gate at each dispatch, not merely once per batch.
5. **Cancel and contain execution.** Request Pi `abort` + `abortBash` (or
   equivalent runtime APIs), then have the external supervisor freeze/stop
   the whole local execution domain and preserve evidence (R-15). Record
   cleanup failures as unresolved; an ACK or idle state is not containment.
   No new privileged dispatch is admitted, but already-dispatched remote
   work may still finish. Never treat a runtime ACK as the kill.

## Authority and audit

- Engage and reset are **critical-tier, human-only** actions (R-03/R-11):
  full audit rows with actor identity and reason evidence. No agent,
  no automation, no API token may engage or reset in v1.
- Reset is a separate audited action, never automatic, never bundled
  with engage. Reset re-verifies: operator reviews unrelayed outbox
   rows, non-terminal audit rows and already-dispatched uncertain actions
   in scope (R-12 triage plus target-state reconciliation), and verifies
   local execution-domain cleanup *before* clearing the flag. Reset does not re-grant leases —
  agents re-acquire normally (fresh epochs, clean fencing).
- Kill-state is visible in `loom status` first line (R-14 bundle gains
  one field). A status that doesn't show kill state is incomplete.

## Latency and honesty bounds

- Local kill admission changes at the kill transaction's commit. Gated
  local DB mutations serialize with that transaction; external dispatch and
  remote commit are not a single SQLite transaction. Record dispatch identity
  and gate outcome, then track a dispatched action even if its remote commit
  occurs later. Do not hold the DB write lock across network I/O or claim a
  universal millisecond cancellation bound. Backend cleanup latency and
  effect-specific cancellation/idempotency must be measured separately.
- Crashed-between-engage-steps recovery: engage is one txn for steps
  1–4; step 5 (signals/containment) is recorded separately and retried on
  next status/boot. Admission remains closed if cleanup is incomplete;
  status must distinguish that state from confirmed local quiescence.

## What stays open (explicitly not v1)

- Automatic engagement (risk-score or budget triggers) — R-16/R-20.
- Sandbox freeze/stop integration — R-15 is required before untrusted
  adapter execution. Milestone-1 DB tests prove admission closure, not
  process-tree containment; production authority waits for both.
- Cross-harness propagation (two Loom DBs, federated runs) — no
  multi-harness story exists yet; kill is per-DB truthful and silent
  elsewhere, which must be documented at deploy time, not discovered.
