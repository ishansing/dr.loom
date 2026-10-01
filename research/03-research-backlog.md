# Loom Research Backlog — Checklist

Status: tracking list, not a design decision. Source: synthesis of
`01-harness-engineering.md` §5, `02-agent-harness-subsystems.md` gaps,
`SPEC.md` open decisions, and the §25 gate. Check items off as evidence
lands; link the evidence (doc section, experiment output, or I2P result
file) next to the box.

Legend: `[ ]` open · `[~]` in progress · `[x]` done (with evidence link).

## Phase 0 — Blocks milestone-1 code (research first, in order)

- [x] **R-01 §25 gate evidence.** GATE MET 2026-10-01 — all four
  conditions met by run, none waived (`2026-10-01-golden-repeat.md`,
  `-greenfield-repeat.md`, `-grilling.md`, `-fail07.md`; judgment
  `2026-10-01-readiness-gate-closed.md`). I2P HEAD `4fe0869`
  (evidence-only delta over `1d66588`); Loom re-pinned, kill switch joins
  milestone 1 per grilling outcome. Enforcement code permitted.
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
- [x] **R-14 CLI UX for human runs.** Four-command surface (init /
  record / status / check-framework) mapped to all 7 HUMAN-RUNS.md
  families; resume bundle = per-thread last-committed + open phases +
  open approvals + lease; failure contract; no interactive prompting, no
  human lease commands, orientation read-only. Design only — lands with
  R-11 schema v2 + R-13 threads at build. See `09-r14-cli-ux.md`.

## Phase 2 — Later milestones (do not start early)

- [x] **R-15 Sandbox orchestration.** Walls-not-judge separation; backend
  ladder (OS sandbox → containers → microVMs, deploy picks, runs don't);
  invariants on every backend (root confinement, no-net-default,
  no-privilege, env-secrets, resource limits); per-run default with
  per-thread option for untrusted threads; snapshots as evidence;
  kill → freeze+snapshot, destroy human-only, no thaw primitive. See
  `19-r15-sandbox.md`.
- [x] **R-16 Budgets.** Time (absolute deadlines, inherited on spawn) /
  retry (Finagle-shaped token bucket, safe-retries-only) / cost (usage
  objects per thread, explicit caps, unset = meter-only) / fan-out
  (live-thread + call caps). Breach ⇒ run-scoped kill (cost) or honest
  terminal outcomes; counters as recomputable rows; enforcement points
  ordered. See `11-r16-budgets.md`.
- [x] **R-17 Kill-switch semantics.** Global + per-run scopes, latched;
  engage = epoch-bump revocation + kill flag + freeze approvals + halt
  relay (one txn) + best-effort runtime signals; human-only engage/reset,
  reset re-verifies before clearing; kill check first in write gate.
  Mechanism reuses R-10-proven fencing. See `10-r17-kill-switch.md`.
- [x] **R-18 Scoped permissions model.** ACL policy (deny-wins,
  global→run→thread, managed baseline un-narrowable) + capability
  grants (delegation narrows only, expire, audited); single
  `authorize()` decision point; workspace `..`-escape as mechanical
  invariant; shipped defaults with ask-floors; secrets never in policy.
  See `12-r18-scopes.md`.
- [x] **R-19 Deployment authorization + rollback.** Same five gates
  for every deploy (propose → verify on exact hash → human authorize →
  lease-held relayed execute → confirm); immutable hash-addressed
  artifacts, mutable tags never inputs; promotion = new chain;
  staging high-risk vs prod critical; rollback = restore via gates
  (kill stops, rollback restores), failed confirm auto-opens rollback,
  double-failed restore → human incident. See `13-r19-deploy.md`.
- [x] **R-20 Risk scoring.** Additive transparent score from recorded
  observables only (tier, sensitivity, blast radius, novelty, velocity,
  history, irreversibility); action + decaying session scores;
  escalate-40 (tier up, cheap) / block-75 (deny, conservative);
  risk never kills (budgets/human do); crossings audited;
  false-positive asymmetry explicit. See `14-r20-risk.md`.
- [x] **R-21 Dashboard hydration.** Read-only projection, zero owned
  state; readonly-handle hydration before any resume action; one
  recomputable view set serving dashboard + CLI + triage; monotonic
  cursor refresh with data-as-of shown; no control buttons in v1
  (drill-down hands off to CLI); status chips derived, never stored.
  See `15-r21-dashboard.md`.
- [ ] **R-22 Multi-agent wire choice.** A2A vs simple handoff envelope —
  only if Loom leaves single-workspace scope.
- [ ] **R-23 MCP spec pin.** Observed stable `2025-11-25`, moving target —
  pin before any MCP-facing surface.
- [x] **R-24 Memory-write governance.** Three scopes (thread scratch
  standard / run-shared high-risk / org-KB critical-human); org-KB
  reads logged as consumption trail; heuristic content classes
  (instruction/fact/secret-shaped→deny); mandatory provenance, unsourced
  writes rejected; quarantine-not-delete poisoning response with
  blast-radius review; governed consolidation (narrow-only, no
  auto-promotion). See `16-r24-memory.md`.
- [x] **R-25 Cost metering.** One normalized usage row per turn
  (provider quirks at ingestion edge, raw payload as evidence);
  creation/read splits used as billed, no allocation models;
  versioned human-entered price tables pinned per run; unpriced =
  NULL cost shown distinctly, never zero; idempotent late arrivals;
  books primary, provider dashboard backstop with monthly drift
  review; never interpolate. See `17-r25-metering.md`.
- [x] **R-26 Loom's own eval harness.** Enforcement fixtures as code
  (leases, recovery, audit triples, kill/budget/permission corpora,
  schema migrations) in CI; three granularities with LLM-judge
  restricted to quality dimensions; human goldens as dated records;
  flaky fixtures quarantined not skipped; monthly calibration loop
  feeding R-16/R-20 with audited tuning changes (narrow-only guardrail).
  See `18-r26-eval.md`.

## Standing — continuous

- [ ] **R-27 Preprint watch.** Re-verify 2026 preprints (monitor
  context-rot, premature termination) once peer-reviewed.
- [ ] **R-28 Primary-source confirmation.** Confirm secondary-only items
  from 01/02 against primaries before citing elsewhere.
- [ ] **R-29 Upstream drift.** Framework pins, MCP spec, runtime APIs —
  monthly check.
