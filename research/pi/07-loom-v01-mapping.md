# Loom Milestone-1 × Pi v0.1 — Mapping + Build Plan

Status: planning (gate met, build authorization still required to
start Phase A). Reconciles SPEC milestone 1 (ledger, leases, audit,
kill switch) with the Pi-track v0.1 slice (runtime interface, tasks,
state, context, verification, sandbox).

## The layering (read once, then the tables)

```text
Orchestrator slice (Pi v0.1)      tasks.json, state, context, verify
Loom core (milestone 1)           ledger, leases, audit, kill, budgets, policy
Pi adapter                        extension veto + SDK supervisor + session reader
Pi runtime                        sessions, tools, models (unchanged upstream)
```

**2026-10-19 verification:** layering over upstream Pi remains the proposed
approach, not proof that hooks enforce every effect. See
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
| Verification | Task gates shaped like R-19 gates 2+5 (fresh evidence, confirm); `agent_before_settle` as the last harness hook | `turn_end`/`agent_before_settle` + one guarded `continue` |
| Tool gateway | Loom `authorize()` (R-18) enforced at the extension veto; semantic tools as custom tools | `tool_call` block/mutate, `BashSpawnHook`, exposure modes, `prepareLoadout()` |
| Sandbox | R-15 ladder (deploy picks rung); kill → freeze+snapshot | Container docs, Gondolin (not a cred boundary), Docker Sandbox cred proxy |
| Kill / budgets / policy / leases / audit | Pure Loom, no Pi counterpart (all confirmed absent) | Extension veto + SDK `abort` + session reads as inputs |
| Memory governance | R-24 scopes + classification + quarantine | `custom` vs `custom_message` entries, consolidation as audited runs |
| Metering | R-25 usage rows from turn-close deltas | `get_session_stats`, message `usage`, compaction usage |

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
  idempotent effects (R-06). Done: kill-mid-relay replays without
  double-effect in test.
- **T-05 Kill.** Engage/reset paths, epoch-bump revocation, approval
  freeze, relay halt, status line (R-17). Done: kill drill fixture
  (engage mid-run → zero further effects, forensics snapshot noted).
- **T-06 Policy engine.** `authorize()` (R-18) + risk scoring (R-20)
  + budget draws (R-16) wired to the gate; decision corpus fixtures.
  Done: corpus (incl. adversarial near-misses) green.
- **T-07 CLI v1 + conformance.** `init/record/status/
  check-framework` per R-14; R-26 deterministic fixture set in CI.
  Done: human-run flow drill on throwaway DB end to end.

### Phase B — Pi adapter (needs A green; Pi pinned `0.99.2`)

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
- **T-09 SDK supervisor.** Session lifecycle, per-role sessions,
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

### Phase C — Orchestrator slice (needs B)

- **T-12 Tasks/state.** `tasks.json` + dependencies + state files +
  CLI run mapping (R-14 runbooks); spawn depth ≤ 3 + fan-out caps
  live (R-13/R-16).
- **T-13 Context manager.** Retrieval + hook injection + R-24
  governance (scopes, classification, quarantine path).
- **T-14 Task verification gates.** Fresh-evidence rule per task +
  first R-26 human goldens recorded.
- **T-15 Sandbox rung.** Deploy picks ladder rung; kill
  freeze+snapshot wired; dev-only unsandboxed flag with audit
  labeling.

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
