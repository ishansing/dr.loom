# Milestone 1 Implementation — Parts and Practices

Status: implementation plan (gate met; start on explicit build
authorization). Expands Phase A (T-01–T-07) of
[07-loom-v01-mapping.md](07-loom-v01-mapping.md) into ordered,
reviewable parts. Each part lists scope, files, tests, and done
criteria. Research references point at the design docs; nothing here
re-decides them.

Product schedule: [ROADMAP.md](../../ROADMAP.md), P1 / G1. Week allocations
are forecasts; this document's test/done criteria still gate completion.

**2026-10-20 boundary update:** follow the [SPEC runtime decisions](../../SPEC.md#runtime-architecture-and-security-boundary-2026-10-20-decision)
and [Pi execution findings](11-pi-1.3.0-execution-coverage.md). These parts
prove core DB/admission invariants only. They do not certify Pi cancellation,
process containment or remote rollback; isolated adapter execution is a
separate required gate before untrusted work or production authority.

## Working practices (non-negotiable for every part)

1. **TDD with `bun:test`.** Failing test first, then the minimum code
   (repo precedent: `tests/smoke.test.ts`). No production code without
   a covering fixture — this is also R-26 conformance by construction.
2. **Strict TypeScript stays strict.** `exactOptionalPropertyTypes`,
   `noUncheckedIndexedAccess`, no `any`, no new lint suppressions.
   `tsc --noEmit` and `biome check .` clean before every commit.
3. **DB discipline.** Every mutation in an explicit transaction
   (`BEGIN IMMEDIATE` for writers); parameterized queries only, never
   string-interpolated SQL; `initSchema` idempotent plus a
   `schema_migrations` table — no ad-hoc DDL after T-01.
4. **Small reviewable commits.** One part (or sub-step) per commit,
   existing message style (`Implement: …`, `Research: …`). Verify
   `bun test` + `tsc` + `biome` before committing, as in prior turns.
5. **No new dependencies.** `bun:sqlite` + stdlib only; no ORM, no
   query builder. A dependency is a design decision, proposed
   separately.
6. **No secrets in code or tests.** Throwaway DBs (`:memory:` or
   `/tmp` with cleanup, never repo files); no real tokens, keys, or
   proprietary data in fixtures.
7. **Adversarial fixtures.** Every gate-owning part ships
   near-miss/negative cases (stale epoch, forged owner, kill
   mid-flight, malformed classifier-shaped input), not just happy
   paths.
8. **Docs move with behavior.** SPEC/research links updated in the
   same commit as the behavior change; backlog ticks reference the
   commit.

## Part T-01 — Schema v2 + migrations (first; everything builds on it)

- **Scope:** `thread_id` on transitions + audit; `action_id/actor/
  tier` on audit; `kills(scope, engaged_at, actor, reason)` table;
  `budgets(run, kind, used, limit)` + `usage` rows; `grants` table;
  `latest_transition` / `latest_audit` views; append-only triggers on
  audit; `schema_migrations(version, applied_at)` with v1→v2 path.
- **Files:** `src/store.ts` (extend `initSchema`; keep one schema
  owner — R-10 lesson), `tests/schema-v2.test.ts`.
- **Tests:** fresh DB has all tables/columns/views; v1 DB migrates
  with rows intact and re-runs idempotently; UPDATE/DELETE on audit
  fail by trigger; views return latest-per-key rows.
- **Done:** `bun test`, `tsc`, `biome` green; v1 data survives
  migration byte-for-byte (minus new nullable columns).

## Part T-02 — Write gate, lease + kill checks (needs T-01)

- **Scope:** `writeGate(db, ctx)` as an **ordered checklist** —
  kill-scope check, then lease owner+epoch+expiry check — run inside
  the mutating transaction before any write. Deadline/grant/policy
  slots are appended by T-06 (the order is specified, not speculative).
  Stale/expired/killed writers fail closed with reasons; same-owner
  renewal path unchanged.
- **Files:** `src/store.ts` (`writeGate` + gated `recordTransition`
  variant; keep ungated function for tests/migrations only, marked),
  `tests/write-gate.test.ts`.
- **Tests:** R-10 fencing fixtures promoted in-repo (stale release,
  wrong-epoch release, post-expiry succession, killed workspace);
  renewal keeps epoch; contention re-run (multi-process race).
- **Done:** no mutation path bypasses the gate except the marked
  test/migration helper; R-10 scripts retired in favor of fixtures.

## Part T-03 — Audit lifecycle (needs T-01)

- **Scope:** `openAction` (request row), `recordVerdict`,
  `recordFinish`; R-11 vocabularies enforced at write time
  (denied/expired ⇒ `not-executed`; `escalated` never terminal;
  `completed` ⇒ prior `allowed`); `latest_audit(action_id)` view
  consumers; archival retirement procedure (export → verify manifest
  → audited range-retire).
- **Files:** `src/store.ts`, `tests/audit-lifecycle.test.ts`.
- **Tests:** full lifecycle happy path; each invariant violation
  rejected; crash-between-rows leaves a triageable non-terminal row
  (R-12 query shapes covered as assertions).
- **Done:** SPEC audit criterion holds by test, including trigger
  rejection of UPDATE/DELETE.

## Part T-04 — Outbox relay (needs T-01, T-02)

- **Scope:** `outbox(id, run_id, kind, payload, applied_at)` table;
  `enqueueOutbox` in the same txn as the business write; `relayBatch`
  with monotonic cursor; `markApplied`; startup `replayUnapplied`
  with effect-side idempotency keyed by outbox id or explicit reconciliation.
  Recheck kill/authorization/epoch at each dispatch, not once per batch;
  track dispatched-but-unconfirmed work without holding a DB write lock
  across network I/O. Cursor position alone cannot prove an effect happened.
- **Files:** `src/store.ts` (table + relay functions),
  `tests/outbox.test.ts` (effect spy counts invocations).
- **Tests:** kill between batch items prevents later admission; late
  completion remains attributable to the dispatched action. Crash between
  effect and marker deduplicates at an idempotent test target; an uncertain
  non-idempotent effect blocks replay until target-state reconciliation.
  Cursor survives restart; WAL reader-bound documented in test comment.
- **Done:** SPEC resumability holds for side effects, not just rows.

## Part T-05 — Kill engage/reset (needs T-01–T-04)

- **Scope:** `engageKill({scope, actor, reason})` — epoch-bump
  revocation + kill row + undispatched approval freeze (`denied/not-executed`
  rows) + relay-halt flag, one txn; preserve in-flight action history and
  unresolved outcome evidence. `resetKill` requires human actor
  and returns the re-verification checklist (outbox + non-terminal
  triage + dispatched-action reconciliation), never re-grants leases;
  `isKilled(scope)` first in gate
  order; status-line data for R-14 bundle.
- **Files:** `src/store.ts`, `tests/kill.test.ts` (kill drill:
  no new gated write/dispatch after kill, frozen undispatched approvals,
  late/unknown outcomes never relabeled `not-executed`, reset rules).
- **Done:** core SPEC kill criteria hold. Runtime abort/containment belongs
  to the isolated adapter; no Pi code or fake containment guarantee in core.

## Part T-06 — Policy engine (needs T-01–T-03; extends T-02 gate)

- **Scope:** `authorize(thread, tool, target)` — deny-wins ACL
  (global→run→thread), grant-exists check, R-20 additive risk
  scoring with escalate-40/block-75, R-16 budget draws
  (deadline inheritance, retry bucket, fan-out caps; cost meter-only
  until caps set). Appends deadline/grant/policy checks to T-02's
  ordered gate; risk/budget crossings write audit rows.
- **Files:** `src/policy.ts` (new; single decision point),
  `tests/policy-corpus.test.ts` (decision table incl. adversarial
  near-misses: `..` escapes, compound shell, approval-claim relay,
  unscoped tool).
- **Done:** corpus green; every ask/deny audited; allows for
  mutation tiers logged per R-18 economy.

## Part T-07 — CLI v1 + conformance close-out (needs T-01–T-06)

- **Scope:** harden `src/cli.ts` per R-14 (`init` with runbook +
  pin check + re-init rejection; `record` with phase/status/evidence/
  thread/owner-epoch flags; `status` resume bundle incl. kill line;
  `--json` machine output; failure contract stderr + nonzero exit).
  Extend `check-framework` with `skills.lock.json` content-hash drift
  check (R-08). Assemble the R-26 deterministic fixture set in CI
  (all parts' tests + a throwaway-DB human-flow drill script).
- **Files:** `src/cli.ts`, `src/framework.ts` (hash check),
  `tests/cli.test.ts` (arg parsing, failure exits, JSON shape),
  `.github/workflows/ci.yml` (unchanged unless fixtures need it).
- **Tests:** init→record→status round-trip on tmp DB; double-open
  phase rejected; unknown run actionable error; hash drift fails
  closed with fixture skills dir.
- **Done:** SPEC acceptance criteria all hold by test; human-run
  flow drill passes end to end; milestone-1 demo script recorded.

## Explicitly out of milestone 1

Pi extension/SDK work (T-08–T-11), mandatory adapter isolation (T-15,
before untrusted execution), orchestrator slice (T-12–T-14), dashboard/deploy/calibration/OpenCode
(T-16–T-19), System One adoption (R-35-gated), federated/A2A/MCP-server
roles. If a part tempts scope creep toward these, split the commit,
don't widen the part.
