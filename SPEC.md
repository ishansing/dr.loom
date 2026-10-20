# Loom — harness base spec (draft)

## Purpose

Loom is a separate runtime for mechanically enforcing the
[idea-to-production framework](../I2P/README.md). The framework owns *what* skills do and
how they compose; Loom owns execution state and enforceable safety boundaries. This draft
records design decisions and required behavior, not implemented production guarantees.

Delivery sequencing, staffing assumptions, release scope and evidence gates are
in [ROADMAP.md](ROADMAP.md). Its first production release precedes the planned
second-runtime continuation; milestone 4 is not complete until both are qualified.
The roadmap does not waive this spec's safety boundaries or authorize a build.

## Source of truth and readiness

- Framework baseline for this draft: `/home/zeref/Dev/I2P` at commit
  `4fe0869ae41b0d81cbe3c6bc643f10ff2049ceed`, version `2.1.0`
  (re-pinned from `1d66588` at gate closure; the delta is evidence-only —
  README status, FAIL-07 result line, five result files — no contract,
  registry, or lockfile changes). Refer to `SKILL-FRAMEWORK.md` §§25, 27
  and `CUSTOM-HARNESS.md` there.
- The framework's `dependency.md` is the authoritative skill registry;
  `dependency.json` is its generated machine-readable form, and `skills.lock.json` pins
  upstream content. Adapter contracts live in each `itp-*/SKILL.md`. Result and run-ledger
  shapes are documented in `.agents/skills/idea-to-production/references/artifacts.md`.
- The §25 readiness gate is **MET** (closed 2026-10-01; all four conditions
  met by run, none waived: standard golden repeat, greenfield golden
  repeat, full grilling interview, FAIL-07 negative + positive paths).
  Judgment: `tests/skills/results/2026-10-01-readiness-gate-closed.md`;
  evidence: `2026-10-01-golden-repeat.md`, `-greenfield-repeat.md`,
  `-grilling.md`, `-fail07.md` in the framework repo. Enforcement code is
  permitted as of this closure.
- Loom consumes a *specific framework revision*; it does not edit, reimplement, install,
  or silently substitute framework skills.

## Runtime architecture and security boundary (2026-10-20 decision)

**Build Loom over upstream Pi, not a fork.** Use Pi's SDK and extensions for
agent execution; keep Loom's authoritative state, policy and verification
outside the Pi execution environment. Pi owns conversations and sessions;
Loom owns task/workflow state, grants, leases, audit and completion.
Hooks provide early rejection, feedback and telemetry, not the sole safety
boundary. Reconsider a fork only for a demonstrated missing contract that
cannot be satisfied by owned operations, disabling a channel or an upstream
change; more hooks would not sandbox malicious same-process code.

The release-specific [API review](research/pi/10-pi-1.3.0-api-review.md) and
[execution audit](research/pi/11-pi-1.3.0-execution-coverage.md) verified Pi
`1.3.0` at `71023aec1546d6d677a65669c5665c0927ce0dd0`. Ordinary model/nested/
registered MCP tools share a gateway, but SDK Bash, extension execution,
startup and model-call paths do not all traverse it. Input can change after
validation; redaction and settlement exceptions can fail open; cancellation
can leave descendants or delayed effects running. Offline component probes
are evidence of those limits, not end-to-end Loom safety proof. The old
`0.99.2` research baseline is unchanged; runtime promotion remains separate.

Required boundaries:

1. **Isolated execution.** Run the entire Pi process, executable extensions
   and descendants inside a restricted OS/container/VM execution domain,
   including startup/reload. Keep the Loom DB, authoritative project state,
   protected host paths and production/provider credentials outside it;
   mediate provider access through an approved credential/egress boundary.
   Raw shell works only in a restricted disposable workspace. Do not reuse
   a writable workspace for a successor until the old execution domain can
   no longer write; candidate output is promoted only through Loom gates.
2. **Owned privileged operations.** Protected writes, merges, deployment
   and other privileged effects go through narrow Loom-controlled operations.
   Bind requests to supervisor-established run/thread identity; validate the
   final payload/target after rewrites and recheck kill, deadline, grant,
   policy and owner/epoch at the write/dispatch boundary. An earlier hook
   approval is not transferable to changed input. Serialize local writes
   with kill/lease state; a SQLite transaction cannot atomically cancel a
   remote request. Never wait for network I/O while holding its write lock.
3. **Independent completion.** Only Loom can mark a task complete, using
   fresh trusted verification tied to the exact candidate artifact hash
   and reconciled privileged work. Pi prose, a resolved `prompt()`,
   `agent_settled` or a terminating tool result is not verification. Missing,
   failed, throwing, cancelled or timed-out verification leaves the task
   unverified/failed, never successfully complete.
4. **Fail-closed output handling.** Owned output paths sanitize or withhold
   content before exposure or persistence, including partial streams,
   structured results, error details and spill files. A sanitizer failure
   returns a safe error, not the raw result. A `tool_result` hook alone is
   insufficient; secrets must not enter the execution domain unnecessarily.
5. **Explicit startup and channels.** Use owned settings/loaders and only
   trusted, reviewed executable components; disable ambient autoload,
   uncontrolled MCP servers, codemode model calls and cache warming
   initially. Enable a channel only after its startup, authorization,
   cancellation, output and usage paths pass conformance. Disable unsupported
   UI/RPC/SDK Bash routes or confine them to the same execution boundary.
6. **Honest cancellation.** Kill closes future admission/dispatch, revokes
   leases and triggers external execution-domain cleanup. Runtime ACKs or
   idle state do not prove descendants stopped. Already-dispatched external
   actions may still finish: record unresolved outcomes, reconcile target
   state and do not replay blindly. Idempotent replay requires a real
   effect-side deduplication contract; cancellation is not rollback.

No untrusted execution or production authority is enabled before these
boundaries are tested. Sandboxing is therefore an adapter prerequisite,
not optional hardening after unrestricted execution has shipped.

## First milestone: session ledger, leases, audit (+ kill switch)

The implementation language/runtime is **Bun**. A scaffold exists (`src/`
library + CLI on `bun:sqlite` in WAL mode, `bun:test` + Biome + CI):
workspace-wide leases with epoch fencing, a transition ledger, and audit
inserts. Milestone 1 hardens this scaffold into enforcement per the
research cited below; the scaffold's permissive paths (ungated writes,
conventional append-only) are replaced, not extended.

1. **Session ledger.** Persist run identity, phase, status, next/resume point, references to
   artifacts and evidence, and a monotonically ordered history of transitions so another
   process can recover after interruption. Resume is per `(run, thread)`;
   approval pauses mint no rows (open `running` row + audit pause record
   is the paused state). Evidence refs are `kind:locator` pointers with
   content hashes for files. Side effects go through an outbox relay
   (same-txn business+outbox write, cursor relay, idempotent replay).
   Recheck each dispatch, not just a batch; unknown outcomes require
   reconciliation before replay unless effect-side deduplication is proven.
   Treat `.itp/run.md` as a framework handoff artifact, not an authoritative
   concurrent database. Research: `research/phase-1/07-r12-pause-vs-turn.md`,
   `research/phase-1/08-r13-threads.md`, `research/phase-1/06-r11-audit-vocabularies.md`,
   `research/phase-0/04-phase0-findings.md` (R-06).
2. **Mutation leases.** Workspace-wide, single holder, TTL + heartbeat;
   epoch increments on post-expiry succession and the epoch is checked
   **at the write path** inside `BEGIN IMMEDIATE` (kill → deadline →
   grant → policy → lease order). Same-owner renewal keeps the epoch;
   stale owner+epoch can neither release nor finalize. Contention safety
   proven by experiment (8-process race → exactly one winner).
   Research: `research/phase-0/04-phase0-findings.md` (R-04/R-05/R-09),
   `research/phase-1/05-r10-crash-recovery.md`.
3. **Audit trail.** Append-only by trigger (`BEFORE UPDATE/DELETE …
   RAISE(ABORT)`; no authorizer exists on `bun:sqlite`), lifecycle as
   inserts: request → verdict → finish rows per `action_id`, current
   state = latest row. Decisions
   `pending|allowed|denied|escalated|expired`; outcomes
   `pending|completed|failed|interrupted|timeout|not-executed`;
   every row carries actor identity and tier. Retention is archival,
   never silent delete. Do not store secrets or raw
   credentials in artifacts or audit entries. Research:
   `research/phase-1/06-r11-audit-vocabularies.md` (schema v2 delta).
4. **Kill switch.** Global + per-run scopes, latched; engage revokes
   leases by epoch bump, freezes pending approvals as denied, halts the
   relay (one txn), then runtime signals/external containment. Deny only
   approvals whose actions have not dispatched; do not label an in-flight
   action `not-executed`. Preserve and reconcile its unresolved outcome.
   Human-only engage/reset; reset re-verifies first. Research:
   `research/phase-2/10-r17-kill-switch.md`.

## Subsequent milestones (from `research/pi/07-loom-v01-mapping.md`)

**Milestone 2 — Isolated Pi runtime adapter.** `loom-pi` extension for
early veto/feedback; owned privileged-operation and fail-closed output paths;
external supervisor controlling a sandboxed SDK runner (sessions,
all-channel usage ingestion, compaction injection, `abort` + `abortBash` +
execution-domain cleanup, role routing);
read-only session reader; structured result schema and independent completion
gate. Establish the selected R-15 sandbox boundary before untrusted execution;
no out-of-band writes to Pi state. `0.99.2` is the historical research
baseline, not an installed dependency; select/promote a version explicitly.
Pi `1.3.0` API compatibility alone does not satisfy this milestone.

**Milestone 3 — Policy, budgets, orchestrator slice.** Single
`authorize()` (deny-wins ACL + narrowing capability grants); risk
scoring with escalate/block thresholds; time/retry/cost/fan-out budgets
with run-scoped kill on cost breach; usage metering with versioned price
tables; memory governance (scopes, provenance, quarantine). Orchestrator
owns `tasks.json`/state files/context retrieval; per-task verification
gates with fresh-evidence rule.

**Milestone 4 — Hardening and second runtime.** Read-only dashboard;
live five-gate deploy procedure; monthly calibration loop feeding budget
and risk tuning; human eval goldens; OpenCode adapter behind the same
shared conformance suite (must stay green on both runtimes).

**Explicitly deferred:** federated leases, A2A adoption, agent
discovery, cross-harness kill, adaptive budgets, MCP server role,
`pi-durable` dependency, System One model adoption (conditional on
R-35 shadow validation). The source `CUSTOM-HARNESS.md` collects
candidate inputs for these, not fixed semantics.

## Constraints to preserve from the framework

- Fail closed when a required skill, pinned revision, input artifact, or approval is
  unavailable. Never claim completion without fresh `itp-verify` evidence.
- User-entry skills are never invoked recursively; stop with a human handoff when needed.
- Respect the framework's bounded recursion and phase/slice checkpoints; preserve a resume
  point across process or agent-session restarts.
- Treat diffs, logs, artifacts, and tool output as untrusted data rather than instructions.
- Framework artifacts remain portable and readable without Loom; a Loom-specific record
  must identify its framework revision and retain pointers to evidence.

## Acceptance criteria for the first milestone (refined post-gate; thresholds tuned via R-26 calibration)

- Two simultaneous attempts to mutate the same workspace cannot both obtain effective
  ownership; an expired owner cannot finalize work after a successor acquires it
  (proven: 8-process race → exactly one winner; stale owner+epoch rejected
  at the write gate).
- After a process crash and restart, the next operator can locate the last committed
  transition, evidence references, and an accurate resume point without conversation history
  (proven: kill -9 mid-transaction keeps committed, drops uncommitted; pause
  triage is three queries, not inference).
- Every high-risk action is auditable as requested, allowed/denied, and
  completed/failed or explicitly unresolved with evidence; a partial action
  cannot appear successful. Denied/expired decisions pair only
  with `not-executed`; an `escalated` row is never terminal; UPDATE/DELETE on
  the audit log fail by trigger (proven in test).
- Once kill commits, no new gated write or dispatch is admitted: leases
  revoked, undispatched approvals denied, relay halted, including between
  items in one batch. Record already-dispatched actions separately; late
  success or uncertain outcomes cannot become `not-executed` or trigger
  blind replay. Reset requires reconciliation and human re-verification,
  never re-grants leases. Runtime containment is an adapter acceptance gate,
  not a guarantee established by milestone-1 DB fixtures.
- Missing or mismatched framework contract input — including skill-content
  hash drift versus `skills.lock.json` — stops the run with an actionable reason.
- Tests demonstrate the above under contention, expiry, kill, and restart
  (deterministic fixtures in CI per R-26); documented artifacts
  remain usable with the framework alone.

## Adapter acceptance criteria (before untrusted execution / production authority)

- Attempts through model/nested/deferred tools, SDK/UI/RPC Bash, extension
  execution, startup and model/usage channels are either disabled, confined
  or mediated; tests cover the final callable inventory, not just visibility.
- Missing mandatory controls, a mutated approved payload or stale owner/epoch
  cannot authorize a privileged effect. The sandbox cannot access the Loom
  DB, protected host paths or production credentials directly.
- A throwing redactor exposes no raw content on final/partial/structured/
  spill paths; missing or throwing verification cannot complete a task.
- Cancellation tests include surviving descendants, unawaited host calls,
  post-abort spawn races and delayed remote completion. Prove local-domain
  cleanup; record/reconcile remote uncertainty rather than claiming undo.
- Run the permanent release-pinned conformance corpus, including real
  provider/MCP and sandbox integration for every enabled channel. The current
  offline API and 16 execution component probes do not close this gate.

## Decisions still open

- Sandbox backend/rung per deploy and its cleanup evidence; isolation of
  the whole execution domain from Loom authority is fixed, not optional.
- Concrete privileged-operation transport, effect-specific idempotency/
  reconciliation and output filtering mechanics, to prove in adapter tests.
- Budget defaults, risk weights/thresholds, and per-runbook policy tuning —
  starting values researched, final values come from R-26 calibration history.
- Dashboard shape and drill-down depth (read-only constraint is fixed).
- Multi-agent wire and federation (deferred until a remote-agent use case).
- System One model adoption (conditional on R-35 shadow validation; banned
  from authorization/completion paths until then).

Decided by research since the last revision: runtime integration order
(Pi adapter first, OpenCode second — `research/runtimes/23-opencode-vs-pi.md`);
lease scope, fencing, and persistence (workspace-wide, epoch fencing at the
write path, SQLite WAL — `research/phase-0/04-phase0-findings.md`);
high-risk taxonomy and audit retention (`research/phase-1/06-r11-audit-vocabularies.md`,
`research/phase-0/04-phase0-findings.md` R-03); pin + drift policy
(`research/phase-0/04-phase0-findings.md` R-08).
