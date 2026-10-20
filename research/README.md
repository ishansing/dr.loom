# Loom Research Index

Product delivery sequence and release gates: [ROADMAP.md](../ROADMAP.md).

Tracking list: [03-research-backlog.md](03-research-backlog.md). Review
routine: [watch-schedule.md](watch-schedule.md). Planned build:
[pi/07-loom-v01-mapping.md](pi/07-loom-v01-mapping.md) (T-01–T-19).

## Foundations

- [01-harness-engineering.md](foundations/01-harness-engineering.md) — what "harness" means; agent-harness convergence 2024–26; enforcement precedents (R-01–R-09 evidence, leases, audit, sandbox, kill switches).
- [02-agent-harness-subsystems.md](foundations/02-agent-harness-subsystems.md) — model interface, context engineering, tool system, agent loop, multi-agent orchestration.

## Phase 0 — gate evidence and first designs (R-01–R-09)

- [04-phase0-findings.md](phase-0/04-phase0-findings.md) — §25 reassessment; trigger/authorizer experiments; taxonomy, write-path, contention, outbox, interception, pin/drift, lease-precedent designs.

## Phase 1 — recovery and operator design (R-10–R-14)

- [05-r10-crash-recovery.md](phase-1/05-r10-crash-recovery.md) — kill -9 recovery; expiry/succession fencing proof.
- [06-r11-audit-vocabularies.md](phase-1/06-r11-audit-vocabularies.md) — decision/outcome sets; lifecycle-as-inserts; evidence refs; retention.
- [07-r12-pause-vs-turn.md](phase-1/07-r12-pause-vs-turn.md) — pauses mint no rows; crash-during-pause triage.
- [08-r13-threads.md](phase-1/08-r13-threads.md) — per-thread resume; spawn/handoff; depth ≤ 3.
- [09-r14-cli-ux.md](phase-1/09-r14-cli-ux.md) — init/record/status surface for HUMAN-RUNS.md families.

## Phase 2 — later-system designs (R-15–R-26)

- [10-r17-kill-switch.md](phase-2/10-r17-kill-switch.md) — latched global/per-run kill; epoch-bump revocation.
- [11-r16-budgets.md](phase-2/11-r16-budgets.md) — time/retry/cost/fan-out budgets; breach handling.
- [12-r18-scopes.md](phase-2/12-r18-scopes.md) — ACL policy + capability grants; `authorize()`.
- [13-r19-deploy.md](phase-2/13-r19-deploy.md) — five-gate deploy procedure; rollback as restore.
- [14-r20-risk.md](phase-2/14-r20-risk.md) — additive risk scoring; escalate/block thresholds.
- [15-r21-dashboard.md](phase-2/15-r21-dashboard.md) — read-only projection; cursor refresh.
- [16-r24-memory.md](phase-2/16-r24-memory.md) — three-scope memory governance; quarantine.
- [17-r25-metering.md](phase-2/17-r25-metering.md) — per-turn usage rows; versioned price tables.
- [18-r26-eval.md](phase-2/18-r26-eval.md) — enforcement fixtures; calibration loop.
- [19-r15-sandbox.md](phase-2/19-r15-sandbox.md) — backend ladder; kill freeze+snapshot.
- [20-r22-wire.md](phase-2/20-r22-wire.md) — handoff envelope; A2A deferred.
- [21-r23-mcp-pin.md](phase-2/21-r23-mcp-pin.md) — MCP `2025-11-25` pin; client-only posture.

## Runtimes

- [22-r30-pi-agent.md](runtimes/22-r30-pi-agent.md) — Pi interception points; lease/audit absence.
- [23-opencode-vs-pi.md](runtimes/23-opencode-vs-pi.md) — Pi adapter first, OpenCode second, core once.

## Pi as base runtime (`pi/`)

- [pi/00-index.md](pi/00-index.md) — 41-item coverage matrix for the Pi checklist.
- [pi/01-runtime-and-models.md](pi/01-runtime-and-models.md) — SDK surface; per-role routing; config precedence.
- [pi/02-state-memory-context.md](pi/02-state-memory-context.md) — SessionManager, compaction, context hooks, task ownership.
- [pi/03-agents-tasks-lifecycle.md](pi/03-agents-tasks-lifecycle.md) — sessions, roles, structured outputs, stages.
- [pi/04-verification-gateway.md](pi/04-verification-gateway.md) — settle boundary; `tool_call` gateway; skills.
- [pi/05-security.md](pi/05-security.md) — no OS boundary; trust≠sandbox; worktrees harness-owned.
- [pi/06-control-observability-durability.md](pi/06-control-observability-durability.md) — retries, budgets, evals, pi-durable.
- [pi/07-loom-v01-mapping.md](pi/07-loom-v01-mapping.md) — milestone-1 × v0.1 mapping; build tickets T-01–T-19.
- [pi/08-cross-harness-comparison.md](pi/08-cross-harness-comparison.md) — borrowing from six harnesses.
- [pi/09-milestone-1-implementation.md](pi/09-milestone-1-implementation.md) — ordered core implementation parts, tests and practices.
- [pi/10-pi-1.3.0-api-review.md](pi/10-pi-1.3.0-api-review.md) — release-pinned SDK/classifier checks and reproducible offline probe.
- [pi/11-pi-1.3.0-execution-coverage.md](pi/11-pi-1.3.0-execution-coverage.md) — execution-path evidence and adopted upstream-Pi/external-enforcement decisions.
- [pi/12-pi-durable-adoption.md](pi/12-pi-durable-adoption.md) — separate durable-runtime candidate, Node/Bun proof, Loom fit and adoption gates.
- [pi/13-pi-durable-recovery-boundaries.md](pi/13-pi-durable-recovery-boundaries.md) — recovery, replay, cancellation, storage and authority limits.

## System One decision models (`system-one/`)

- [system-one/09-system-one-decision-models.md](system-one/09-system-one-decision-models.md) — Jev/Clef/open options; probability semantics; shadow-eval protocol (R-34/R-35).
- [system-one/10-system-one-internal-integration.md](system-one/10-system-one-internal-integration.md) — Pi call path; non-authoritative contract (R-36).
- [system-one/11-foss-decision-models.md](system-one/11-foss-decision-models.md) — open-weight comparison; conditional shortlist (R-37).
- [system-one/12-qlora-harness-classifier.md](system-one/12-qlora-harness-classifier.md) — fine-tuned 1.5B verdict vs Jev API (R-38).

## Drift reviews

- [2026-10-16 R-29](watches/2026-10-16-r29.md) — I2P, Pi, MCP and Jev upstream drift.
- [2026-10-19 Pi follow-up](watches/2026-10-19-r29-pi.md) — Pi 1.3.0 verification and adopted isolation/enforcement decisions; conformance pending.
- [2026-10-20 Pi Durable](watches/2026-10-20-r29-pi-durable.md) — published 1.3.0 versus unreleased main; runtime evaluation recommended, no adoption.
