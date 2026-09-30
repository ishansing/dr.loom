# Loom Research Backlog — Checklist

Status: tracking list, not a design decision. Source: synthesis of
`01-harness-engineering.md` §5, `02-agent-harness-subsystems.md` gaps,
`SPEC.md` open decisions, and the §25 gate. Check items off as evidence
lands; link the evidence (doc section, experiment output, or I2P result
file) next to the box.

Legend: `[ ]` open · `[~]` in progress · `[x]` done (with evidence link).

## Phase 0 — Blocks milestone-1 code (research first, in order)

- [~] **R-01 §25 gate evidence.** Repeat standard + greenfield goldens, run
  one full grilling interview, run browser FAIL-07 or record permanently
  blocked. (Per SPEC, no enforcement code until closed. Evidence:
  `../I2P/tests/skills/results/`.)
  Reassessed 2026-09-30: HEAD still `1d66588`, only new file is
  `2026-09-28-upgrades-validation.md` (adjacent upgrades, closes none of
  the four). Same 4 items open, 3 need a human. See `04-phase0-findings.md`
  R-01. Enforcement code stays gated.
- [x] **R-02 `bun:sqlite` trigger/authorizer support.** Triggers
  (`RAISE(ABORT)`) verified working; no authorizer on
  `Database.prototype`; readonly handles verified. See
  `04-phase0-findings.md` R-02 (scripts in `/tmp/opencode/loom-exp/`).
- [x] **R-03 High-risk action taxonomy.** Three-tier draft (standard /
  high-risk / critical) with gates and audit rules. See
  `04-phase0-findings.md` R-03.
- [x] **R-04 Lease enforcement at the write path.** Design: owner+epoch
  gate inside `BEGIN IMMEDIATE` txn; touched-path set as evidence, lease
  as enforcement. No code (gate closed). See `04-phase0-findings.md`
  R-04.
- [x] **R-05 Contention experiments.** 8-process race → exactly 1 winner
  (epoch 1); second `BEGIN IMMEDIATE` → `SQLITE_BUSY`; readers proceed
  (WAL). See `04-phase0-findings.md` R-05.
- [x] **R-06 Outbox/relay design.** Same-txn business+outbox write, cursor
  relay, idempotent effects, startup replay; WAL checkpoint bound. See
  `04-phase0-findings.md` R-06.
- [x] **R-07 OpenCode interception point.** Veto =
  `tool.execute.before` throw; ask-veto = permission-reply API; ledger =
  `--format json` + SQLite reads + SSE ask capture; no lease primitive
  exists; bypasses named. See `04-phase0-findings.md` R-07.
- [x] **R-08 Pin + drift policy.** Startup per-skill content-hash check vs
  `skills.lock.json`; reuse `check-contracts.mjs`; monthly hash-drift
  check, human-driven re-pin. See `04-phase0-findings.md` R-08.
- [x] **R-09 Lease-semantics precedent pass.** Chubby/etcd/GFS/PG-MySQL/ZK
  borrow-vs-reject; nothing contradicts the scaffold. See
  `04-phase0-findings.md` R-09.

## Phase 1 — During milestone 1 (design alongside code)

- [x] **R-10 Crash-recovery tests.** `kill -9` mid-txn → committed kept,
  uncommitted gone, resume intact (RECOVER-OK); expiry→epoch+1 succession
  with stale-reject gate prototype (FENCE-OK, `/tmp`-only). Incidental:
  single schema owner required. See `05-r10-crash-recovery.md`.
- [x] **R-11 Audit vocabularies.** Decision
  (`pending|allowed|denied|escalated|expired`) + outcome
  (`pending|completed|failed|interrupted|timeout|not-executed`) sets with
  lifecycle invariants; lifecycle-as-inserts (`action_id`, latest-row
  view); `kind:locator` evidence refs with file hashes; immutable ledger
  + audited archival retirement. Schema v2 delta documented, no code.
  See `06-r11-audit-vocabularies.md`.
- [x] **R-12 Pause-vs-turn accounting.** Pauses mint no rows; one open
  `running` per (run, thread); close-once; crash-during-pause triage as
  queries; no heartbeats, no resume-point rewrites. See
  `07-r12-pause-vs-turn.md`.
- [x] **R-13 Per-thread resume semantics.** `thread_id` on ledger+audit,
  resume per (run, thread); spawn/handoff as audit actions; handoff =
  release+acquire with epoch trail; holder named `<agent>:<thread>`;
  spawn depth ≤ 3. See `08-r13-threads.md`.
- [ ] **R-14 CLI UX for human runs.** `init/record/status` flows covering
  `HUMAN-RUNS.md` runbooks.

## Phase 2 — Later milestones (do not start early)

- [ ] **R-15 Sandbox orchestration.** gVisor vs Firecracker vs Docker;
  per-agent isolation boundary.
- [ ] **R-16 Budgets.** Timeout/retry/cost counters, per-agent caps,
  fan-out limiters. (No turnkey precedent — pure policy design.)
- [ ] **R-17 Kill-switch semantics.** Global + per-run; revocation
  propagation to leases and sandboxes.
- [ ] **R-18 Scoped permissions model.** Capability vs ACL; per-session
  scopes.
- [ ] **R-19 Deployment authorization + rollback.** Harness-level
  procedure, not per-run improvisation.
- [ ] **R-20 Risk scoring.** Primitives attached to sessions;
  escalate/block thresholds.
- [ ] **R-21 Dashboard hydration.** Startup + post-recovery store
  hydration design.
- [ ] **R-22 Multi-agent wire choice.** A2A vs simple handoff envelope —
  only if Loom leaves single-workspace scope.
- [ ] **R-23 MCP spec pin.** Observed stable `2025-11-25`, moving target —
  pin before any MCP-facing surface.
- [ ] **R-24 Memory-write governance.** Shared-KB persists as
  approval-gated high-risk action (poisoning, 02 Part 2.5).
- [ ] **R-25 Cost metering.** Usage objects incl. invisible reasoning
  tokens; per-run accounting hooks.
- [ ] **R-26 Loom's own eval harness.** Golden runs + trajectory scoring
  for the harness itself.

## Standing — continuous

- [ ] **R-27 Preprint watch.** Re-verify 2026 preprints (monitor
  context-rot, premature termination) once peer-reviewed.
- [ ] **R-28 Primary-source confirmation.** Confirm secondary-only items
  from 01/02 against primaries before citing elsewhere.
- [ ] **R-29 Upstream drift.** Framework pins, MCP spec, runtime APIs —
  monthly check.
