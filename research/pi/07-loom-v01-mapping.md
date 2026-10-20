# Loom Milestone-1 × Pi v0.1 — Mapping + Build Plan

Status: planning (gate met, build authorization still required to
start Phase A). Reconciles SPEC milestone 1 (ledger, leases, audit,
kill switch) with the Pi-track v0.1 slice (runtime interface, tasks,
state, context, verification, sandbox).

Product timing/release gates: [ROADMAP.md](../../ROADMAP.md). Keep T-01–T-19
IDs stable; its P0–P6/H1 phases schedule these packages without renumbering
them. Runtime selection precedes adapter implementation; T-15 precedes
untrusted execution; T-19 remains planned after the first production release.

## The layering (read once, then the tables)

```text
Trusted Loom control plane       tasks/state, ledger, policy, leases, audit,
                                 privileged operations, verification, supervisor
                       narrow identity-bound request/result channel
----------------------- OS/container/VM boundary -----------------------
Isolated Pi execution domain     SDK runner + owned extension hooks + Pi runtime
                                 restricted workspace; no Loom DB/prod credentials
```

**2026-10-20 decision:** build over upstream Pi with external enforcement,
not a fork or a hooks-only safety boundary. Normative requirements:
[SPEC runtime architecture](../../SPEC.md#runtime-architecture-and-security-boundary-2026-10-20-decision).
This is a design decision, not implemented protection. See
[Pi 1.3.0 API compatibility](10-pi-1.3.0-api-review.md) and
[execution coverage / no-fork conditions](11-pi-1.3.0-execution-coverage.md).
The research baseline remains `0.99.2`; reviewing `1.3.0` does not silently
promote it. Untrusted code must not share Loom's control-plane authority.

Rule running through everything below: **no fact has two writers**.
`tasks.json` owns the task graph; the ledger owns execution evidence
and references task ids. State files own project truth; audit rows
reference their hashes. The moment ledger and files both claim to
*own* the same fact, reconciliation bugs follow — reference, don't
duplicate.

## Mapping (Pi v0.1 need → Loom answer → Pi joint)

| Pi v0.1 need | Loom answer (doc) | Pi joint used |
|---|---|---|
| Runtime interface | Pi adapter wrapping `createAgentSession` in the harness `AgentRuntime` mapping (create/prompt/abort/state) | SDK `sdk.ts`, `AgentSessionRuntime` |
| Tasks + dependencies | Orchestrator `tasks.json`; Loom mirrors task lifecycle as transitions (phase per task, task id as evidence) | `todo.ts` pattern (branch-sensitive details) for display only |
| Project state (`project/state/decisions.json`, `artifacts/`) | Orchestrator files (primary) + audit hash-refs; decisions optionally mirrored as `custom` entries | `appendEntry()`, compaction `details` |
| Context manager | Retrieval + injection via Pi hooks; R-24 provenance/classification rules | `context`/`context_with_system`, `session_before_compact`, skills on-demand |
| Roles (planner/dev/reviewer) | Loom threads + grants + per-thread budgets; role = prompt+tools+model | subagent example, `setActiveTools`, virtual-model routing, per-session prompt overrides |
| Structured outputs | Terminate-on-tool schema (`status/artifacts/filesChanged/decisions/problems/nextTasks/verification`) | `defineTool({terminate:true})` + `outputSchema` (Pi's own eval pattern) |
| Verification | Outer Loom gate on fresh evidence/exact candidate hash and reconciled privileged work; hook exceptions never certify completion | `turn_end`/`agent_before_settle` for optional corrective continuation only |
| Tool gateway | Early extension veto plus owned privileged operations validating final input and live authorization at execution | `tool_call`, owned tool/operations implementations; exposure/loadout is not authorization |
| Sandbox | Whole Pi SDK runner/process tree isolated from host authority before untrusted execution; selected R-15 backend proves cleanup | OS/container/VM boundary, credential/egress mediation; a Bash hook alone is insufficient |
| Kill / budgets / policy / leases / audit | Loom owns admission/dispatch gates, outstanding-action reconciliation and containment supervision | `abort` + `abortBash` are cooperative inputs, not containment proof |
| Memory governance | R-24 scopes + classification + quarantine | `custom` vs `custom_message` entries, consolidation as audited runs |
| Metering | R-25 ingestion with one charge owner per call, including non-turn channels | Stats + message/tool/compaction/dedicated usage; model channels disabled until governed |

## Build tickets (ordered; each lists scope + done-criteria)

### Phase A — Loom core (no Pi needed; gate met, needs build auth)

Detailed part-by-part implementation plan (files, tests, practices):
[09-milestone-1-implementation.md](09-milestone-1-implementation.md).

- **T-01 Schema v2.** `thread_id` on ledger+audit; `action_id/actor/
  tier`; kill table; `budgets` counters + usage rows; `grants`;
  `latest-row` views; append-only triggers; migration from v1.
  Done: fresh + migrated DBs pass `initSchema` idempotently; triggers
  reject UPDATE/DELETE in test.
- **T-02 Write gate.** Kill → deadline → grant → policy → lease check
  order inside `BEGIN IMMEDIATE`; owner+epoch gating on mutation
  (R-04). Done: R-10 fencing fixtures green + stale/expired/killed
  rejections covered.
- **T-03 Audit lifecycle.** Request→verdict→finish rows, R-11
  vocabularies + invariants as write-time checks + `latest_audit`
  view; archival retirement procedure. Done: lifecycle fixtures
  (incl. denied→not-executed, escalated-must-resolve).
- **T-04 Outbox relay.** Table + cursor relay + startup replay with
  effect-side idempotency or reconciliation (R-06); live gate per dispatch.
  Done: kill between batch items blocks later dispatches; crash after
  dispatch preserves uncertainty and never blindly repeats a non-idempotent effect.
- **T-05 Kill.** Engage/reset paths, epoch-bump revocation, approval
  freeze, relay halt, status line (R-17). Done: kill drill fixture
  (no new gated dispatch/write after kill; already-dispatched outcomes
  reconciled, never falsely `not-executed`; containment tested in Phase B).
- **T-06 Policy engine.** `authorize()` (R-18) + risk scoring (R-20)
  + budget draws (R-16) wired to the gate; decision corpus fixtures.
  Done: corpus (incl. adversarial near-misses) green.
- **T-07 CLI v1 + conformance.** `init/record/status/
  check-framework` per R-14; R-26 deterministic fixture set in CI.
  Done: human-run flow drill on throwaway DB end to end.

### Phase B — isolated Pi adapter (needs A green; baseline `0.99.2`, version selection pending)

Before this phase: deliberately select/promote a runtime version, then run
the release-specific API and execution corpus. For `1.3.0`, account for
custom-start events, retained MCP callability and cache-warming usage;
validate mandatory-hook readiness, fail-closed completion outside Pi,
and effect-time kill/lease checks. No claim of zero post-kill effects may
rest solely on a pre-tool hook or cooperative `abort()`.

- **T-08 `loom-pi` extension.** `tool_call` veto (owned callable inventory +
  grant check + headless default-deny), final-payload validation at owned
  tool/operations boundaries, audit feed (request/verdict/finish).
  Redact secrets before exposure/persistence through a fail-closed owned
  path; a throwing `tool_result` handler alone leaks the original result.
  No untrusted executable resources; startup policy precedes discovery.
- **T-09 External supervisor + sandboxed SDK runner.** Narrow
  identity-bound requests/results; no Pi embedding beside host authority.
  Session lifecycle, per-role sessions,
  usage ingestion (R-25), compaction decision-injection,
  `abort/abortBash/dispose` wiring plus external execution-domain cleanup,
  virtual-model role routing. Disable codemode model calls/cache warming
  initially or separately mediate and meter them; ingest dedicated usage
  entries as well as message usage.
- **T-10 Session reader.** JSONL + `get_entries{since}` cursor →
  ledger evidence refs; read-only (never write Pi's DB/files).
- **T-11 Structured results.** Terminate-on-tool result schema +
  task↔transition mirroring (no dual truth). Done: agent prose
  never parsed for state; outer Loom verification fails closed even when
  a Pi settlement hook throws. Neither settlement nor a nested terminating
  tool result proves that all external work has stopped.
- **T-15 Isolation prerequisite (moved before untrusted execution).**
  Select one R-15 backend and confine startup, Pi/SDK/extensions, tools and
  descendants; separate Loom DB/credentials/protected host paths and mediate
  egress. Prove local-domain cleanup, no successor workspace reuse while old
  writers survive, and no direct privileged effects from raw shell. Retain
  filesystem evidence on kill; failures leave the run blocked/unresolved.
  T-08–T-11 may first use trusted synthetic fixtures, but Phase B cannot pass
  without this boundary and its end-to-end tests. Full gates: [SPEC adapter
  acceptance](../../SPEC.md#adapter-acceptance-criteria-before-untrusted-execution--production-authority).

### Phase C — Orchestrator slice (needs B)

- **T-12 Tasks/state.** `tasks.json` + dependencies + state files +
  CLI run mapping (R-14 runbooks); spawn depth ≤ 3 + fan-out caps
  live (R-13/R-16).
- **T-13 Context manager.** Retrieval + hook injection + R-24
  governance (scopes, classification, quarantine path).
- **T-14 Task verification gates.** Fresh-evidence rule per task +
  first R-26 human goldens recorded.

T-15 is now a Phase B prerequisite, not a post-orchestration hardening step.

### Phase D — Hardening (after C works end to end)

- **T-16 Calibration loop** starts (R-16/R-20 tuning from eval
  history, audited, narrow-only). **T-17 Dashboard** read-only
  (R-21). **T-18 Deploy procedure live** (R-19 five gates, staging
  vs prod). **T-19 OpenCode adapter** (second runtime; shared
  conformance suite must stay green on both).

## Explicit deferrals (unchanged)

Federated leases, A2A adoption, agent discovery, cross-harness kill,
adaptive budgets, MCP server role, `pi-durable` dependency — all
parked until a use case demands them (R-22/R-23/R-16/R-17 notes).

**Pi Durable review (2026-10-20):** [R-39 assessment](12-pi-durable-adoption.md)
recommends comparing it as the isolated execution runtime before freezing
T-08, because it can replace some planned runtime scheduling/recovery work.
Adoption remains deferred, not prohibited: choosing it would require a
reviewed remap of T-08–T-13 APIs, one owner per fact, release-pinned
conformance and the same external Loom authority/isolation. Do not stack
Durable and the coding-agent loop or silently substitute its store for
the protected ledger.
