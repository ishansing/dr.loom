# Loom Research Backlog — Checklist

Status: tracking list, not a design decision. Source: synthesis of
`foundations/01-harness-engineering.md` §5, `foundations/02-agent-harness-subsystems.md` gaps,
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
  `phase-0/04-phase0-findings.md` R-02 (scripts in `/tmp/opencode/loom-exp/`).
- [x] **R-03 High-risk action taxonomy.** Three-tier draft (standard /
  high-risk / critical) with gates and audit rules. See
  `phase-0/04-phase0-findings.md` R-03.
- [x] **R-04 Lease enforcement at the write path.** Design: owner+epoch
  gate inside `BEGIN IMMEDIATE` txn; touched-path set as evidence, lease
  as enforcement. No code (gate closed). See `phase-0/04-phase0-findings.md`
  R-04.
- [x] **R-05 Contention experiments.** 8-process race → exactly 1 winner
  (epoch 1); second `BEGIN IMMEDIATE` → `SQLITE_BUSY`; readers proceed
  (WAL). See `phase-0/04-phase0-findings.md` R-05.
- [x] **R-06 Outbox/relay design.** Same-txn business+outbox write, cursor
  relay, idempotent effects, startup replay; WAL checkpoint bound. See
  `phase-0/04-phase0-findings.md` R-06.
- [x] **R-07 OpenCode interception point.** Veto =
  `tool.execute.before` throw; ask-veto = permission-reply API; ledger =
  `--format json` + SQLite reads + SSE ask capture; no lease primitive
  exists; bypasses named. See `phase-0/04-phase0-findings.md` R-07.
- [x] **R-08 Pin + drift policy.** Startup per-skill content-hash check vs
  `skills.lock.json`; reuse `check-contracts.mjs`; monthly hash-drift
  check, human-driven re-pin. See `phase-0/04-phase0-findings.md` R-08.
- [x] **R-09 Lease-semantics precedent pass.** Chubby/etcd/GFS/PG-MySQL/ZK
  borrow-vs-reject; nothing contradicts the scaffold. See
  `phase-0/04-phase0-findings.md` R-09.

## Phase 1 — During milestone 1 (design alongside code)

- [x] **R-10 Crash-recovery tests.** `kill -9` mid-txn → committed kept,
  uncommitted gone, resume intact (RECOVER-OK); expiry→epoch+1 succession
  with stale-reject gate prototype (FENCE-OK, `/tmp`-only). Incidental:
  single schema owner required. See `phase-1/05-r10-crash-recovery.md`.
- [x] **R-11 Audit vocabularies.** Decision
  (`pending|allowed|denied|escalated|expired`) + outcome
  (`pending|completed|failed|interrupted|timeout|not-executed`) sets with
  lifecycle invariants; lifecycle-as-inserts (`action_id`, latest-row
  view); `kind:locator` evidence refs with file hashes; immutable ledger
  + audited archival retirement. Schema v2 delta documented, no code.
  See `phase-1/06-r11-audit-vocabularies.md`.
- [x] **R-12 Pause-vs-turn accounting.** Pauses mint no rows; one open
  `running` per (run, thread); close-once; crash-during-pause triage as
  queries; no heartbeats, no resume-point rewrites. See
  `phase-1/07-r12-pause-vs-turn.md`.
- [x] **R-13 Per-thread resume semantics.** `thread_id` on ledger+audit,
  resume per (run, thread); spawn/handoff as audit actions; handoff =
  release+acquire with epoch trail; holder named `<agent>:<thread>`;
  spawn depth ≤ 3. See `phase-1/08-r13-threads.md`.
- [x] **R-14 CLI UX for human runs.** Four-command surface (init /
  record / status / check-framework) mapped to all 7 HUMAN-RUNS.md
  families; resume bundle = per-thread last-committed + open phases +
  open approvals + lease; failure contract; no interactive prompting, no
  human lease commands, orientation read-only. Design only — lands with
  R-11 schema v2 + R-13 threads at build. See `phase-1/09-r14-cli-ux.md`.

## Phase 2 — Later milestones (do not start early)

- [x] **R-15 Sandbox orchestration.** Walls-not-judge separation; backend
  ladder (OS sandbox → containers → microVMs, deploy picks, runs don't);
  invariants on every backend (root confinement, no-net-default,
  no-privilege, env-secrets, resource limits); per-run default with
  per-thread option for untrusted threads; snapshots as evidence;
  kill → freeze+snapshot, destroy human-only, no thaw primitive. See
  `phase-2/19-r15-sandbox.md`.
- [x] **R-16 Budgets.** Time (absolute deadlines, inherited on spawn) /
  retry (Finagle-shaped token bucket, safe-retries-only) / cost (usage
  objects per thread, explicit caps, unset = meter-only) / fan-out
  (live-thread + call caps). Breach ⇒ run-scoped kill (cost) or honest
  terminal outcomes; counters as recomputable rows; enforcement points
  ordered. See `phase-2/11-r16-budgets.md`.
- [x] **R-17 Kill-switch semantics.** Global + per-run scopes, latched;
  engage = epoch-bump revocation + kill flag + freeze approvals + halt
  relay (one txn) + best-effort runtime signals; human-only engage/reset,
  reset re-verifies before clearing; kill check first in write gate.
  Mechanism reuses R-10-proven fencing. See `phase-2/10-r17-kill-switch.md`.
- [x] **R-18 Scoped permissions model.** ACL policy (deny-wins,
  global→run→thread, managed baseline un-narrowable) + capability
  grants (delegation narrows only, expire, audited); single
  `authorize()` decision point; workspace `..`-escape as mechanical
  invariant; shipped defaults with ask-floors; secrets never in policy.
  See `phase-2/12-r18-scopes.md`.
- [x] **R-19 Deployment authorization + rollback.** Same five gates
  for every deploy (propose → verify on exact hash → human authorize →
  lease-held relayed execute → confirm); immutable hash-addressed
  artifacts, mutable tags never inputs; promotion = new chain;
  staging high-risk vs prod critical; rollback = restore via gates
  (kill stops, rollback restores), failed confirm auto-opens rollback,
  double-failed restore → human incident. See `phase-2/13-r19-deploy.md`.
- [x] **R-20 Risk scoring.** Additive transparent score from recorded
  observables only (tier, sensitivity, blast radius, novelty, velocity,
  history, irreversibility); action + decaying session scores;
  escalate-40 (tier up, cheap) / block-75 (deny, conservative);
  risk never kills (budgets/human do); crossings audited;
  false-positive asymmetry explicit. See `phase-2/14-r20-risk.md`.
- [x] **R-21 Dashboard hydration.** Read-only projection, zero owned
  state; readonly-handle hydration before any resume action; one
  recomputable view set serving dashboard + CLI + triage; monotonic
  cursor refresh with data-as-of shown; no control buttons in v1
  (drill-down hands off to CLI); status chips derived, never stored.
  See `phase-2/15-r21-dashboard.md`.
- [x] **R-22 Multi-agent wire choice.** Envelope now (fixed payload:
  ids + refs + grants + deadline + budget slice, context by reference),
  A2A only on interop need (mapping recorded, transport-only change);
  no federated leases, no discovery protocol before first use case.
  See `phase-2/20-r22-wire.md`.
- [x] **R-23 MCP spec pin.** Pinned `2025-11-25` (stdio + Streamable
  HTTP); Loom is client/host only, serves nothing in v1; untrusted
  descriptions never policy/context; explicit approval for
  sampling/elicitation; roots denied at connect. Re-pin via R-29
  watch only. See `phase-2/21-r23-mcp-pin.md`.
- [x] **R-24 Memory-write governance.** Three scopes (thread scratch
  standard / run-shared high-risk / org-KB critical-human); org-KB
  reads logged as consumption trail; heuristic content classes
  (instruction/fact/secret-shaped→deny); mandatory provenance, unsourced
  writes rejected; quarantine-not-delete poisoning response with
  blast-radius review; governed consolidation (narrow-only, no
  auto-promotion). See `phase-2/16-r24-memory.md`.
- [x] **R-25 Cost metering.** One normalized usage row per turn
  (provider quirks at ingestion edge, raw payload as evidence);
  creation/read splits used as billed, no allocation models;
  versioned human-entered price tables pinned per run; unpriced =
  NULL cost shown distinctly, never zero; idempotent late arrivals;
  books primary, provider dashboard backstop with monthly drift
  review; never interpolate. See `phase-2/17-r25-metering.md`.
- [x] **R-26 Loom's own eval harness.** Enforcement fixtures as code
  (leases, recovery, audit triples, kill/budget/permission corpora,
  schema migrations) in CI; three granularities with LLM-judge
  restricted to quality dimensions; human goldens as dated records;
  flaky fixtures quarantined not skipped; monthly calibration loop
  feeding R-16/R-20 with audited tuning changes (narrow-only guardrail).
  See `phase-2/18-r26-eval.md`.

## Watches and one-time cleanup

Timing, triggers, and a record template: [watch-schedule.md](watch-schedule.md).

- [ ] **R-27 Preprint watch.** Re-verify 2026 preprints (monitor
  context-rot, premature termination) once peer-reviewed, or before
  relying on them for a Loom decision.
- [ ] **R-28 Primary-source confirmation.** Confirm secondary-only items
  from 01/02 against primaries before citing elsewhere. One-time cleanup;
  mark done when every claim is sourced, labeled inference, or removed.
- [ ] **R-29 Upstream drift.** Framework pins, MCP spec, runtime APIs —
  first working day monthly plus pre-upgrade/adapter/contract checks.
  Includes Pi releases (`@earendil-works/*`); record each actual review.

## New scope (post-backlog)

- [x] **R-30 Pi agent interception.** `earendil-works/pi` v0.99.2 verified
  locally; no safety in core (gates all extension-built); veto via
  extension `tool_call` block/throw; control via SDK embedding or RPC;
  ledger via event stream + session JSONL + usage stats; telemetry is
  observability not audit; no lease primitive; bypasses named. Loom as
  Pi extension (+SDK/RPC supervisor) is the natural construction.
  See `runtimes/22-r30-pi-agent.md`.
- [x] **R-31 OpenCode vs Pi for Loom.** Verdict: Pi adapter first,
  OpenCode second, Loom core once (runtime-agnostic) + two thin
  adapters; flexibility / reliability / multi-agent compared with
  Pi's poverty-as-feature stated honestly; shared conformance suite
  across both. See `runtimes/23-opencode-vs-pi.md`.
- [x] **R-32 Pi-as-base-runtime research.** `research/pi/` folder: index
  with 41-item coverage matrix + 6 track docs, all verified against
  Pi `main` + `pi.dev/docs/latest` (npm `0.99.2`, 2026-10-01).
  Material corrections to the source checklist: fork-URL + sdk-path
  fixes, no per-role models (virtual models), no skill top-k router,
  no agent-level output schema (terminate-on-tool), no core
  approvals/tasks/stages/budgets/locks, sessionDir trust hole still
  open, pi-durable exists but experimental. v0.1 focus upheld with
  two adjustments. See `pi/00-index.md`.
- [x] **R-33 Cross-harness feature study.** Compare Claude Code,
  OpenCode, OMP, Hermes, DeepSeek Harness, and Codex against Pi as
  Loom's base; cite first-party mechanisms and maturity, map each
  useful idea to a Pi integration seam and existing T-01–T-19 ticket,
  identify what not to copy, and define proof for adoption.
  See `pi/08-cross-harness-comparison.md` (2026-10-02).
- [x] **R-34 System One decision models.** Jev/TypeSafe, Cloudflare
  Clef and open alternatives; Choice/Score/Noul probabilities versus
  confidence and calibration; vendor/independent evidence, Pi's
  classifier joint, Loom-appropriate use cases and non-authoritative
  routing, plus a task-specific shadow evaluation plan. Research done;
  provider adoption requires new Loom-labeled evidence.
  See `system-one/09-system-one-decision-models.md` (2026-10-03).
- [ ] **R-35 Conditional System One validation.** Only when Loom's
  deterministic milestone-1 gates and Pi adapter exist: replay labeled
  I2P routing/triage cases in shadow mode, compare deterministic/chat
  baselines, calibrate on separate tuning/held-out sets, test prompt
  injection and distribution shift, and measure p95/p99 and cost.
  Decide on adoption from recorded evidence; until then no classifier
  is in the authorization or completion path. Protocol: R-34 §6.
- [x] **R-36 System One internal integration.** Trace Pi's classifier
  catalogue → registry → runtime/auth → System One HTTP/answer/usage
  parser and virtual-model example; compare same-process, trusted
  sidecar and local deployment; define non-authoritative request/result
  contract, numeric validation, metering ownership and kill/restart
  behavior. Findings include Pi's missing range/sum/option validation,
  lost Score distribution, alias-version masking and default retry/
  timeout semantics. R-35 remains pending. See
  `system-one/10-system-one-internal-integration.md`.
- [x] **R-37 FOSS decision-model comparison.** Shortlist decider-2b/4b
  GGUF, Laya and kev-0.8b for R-35 shadow eval on Loom labels;
  GLiNER2 as CPU pre-filter only; explicit exclusions with reasons
  (terms, licenses, missing artifacts, uncalibrated hosts). Staged
  adoption gates; no model installed. See
  `system-one/11-foss-decision-models.md` (2026-10-03).
- [x] **R-38 QLoRA harness classifier verdict.** Qwen2.5-1.5B base
  verified (Apache-2.0, 1.54B, 32k); r=16 q/v ≈ 2.75M trainable;
  Unsloth SFT + GGUF export path confirmed. Corrections: proposal's
  free-text TRUE/FALSE yields no probabilities — use letter-logit
  readout + fitted temperature; "Qwen-1.5B" = Qwen2.5-1.5B; ~20 ms
  is per-decision. Verdict: conditional yes on narrow stable tasks
  (accuracy/latency/cost/offline), no on breadth/startup/out-of-box
  calibration; third R-35 arm, train only after labels exist. See
  `system-one/12-qlora-harness-classifier.md` (2026-10-03).
