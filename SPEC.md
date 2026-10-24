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

Development procedure: [AGENTS.md](AGENTS.md). Critical rationale:
[decisions.md](decisions.md). Before application or test code for a new phase,
feature or refactor, update the [active phase specification](#active-phase-specification)
with all seven sections below. `SPEC.md` is the canonical repository spelling;
do not create a separate case-only `spec.md` file.

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

**Provider/model selection is run-scoped, not an authority dependency.** Loom's
ledger, policy, budgets, recovery, audit and completion rules must not assume a
vendor, model family or subscription. A provider/model pair is an explicitly
selected, qualified integration; account and data-policy eligibility stay
per-integration. No silent fallback, automatic account rotation or model
substitution may turn one provider's failure or limit into another's effect.
Codex/ChatGPT subscription is the first qualification candidate, not Loom's
architecture. See [ADR-010](decisions.md#adr-010---2026-10-22-p0-subscription-provider-review).

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

## Active phase specification

- **Work package:** P1 / T-04 synthetic outbox, started 2026-10-24.
- **Authority:** “commit and continue”; owner confirmed synthetic v3 migration,
  immutable intent binding, conservative replay and public test seams.
- **Baseline/branch:** clean `39cb915`, `feat/p1-outbox`. T-02 human review still
  pending; continuation authority is not an attestation of Ishan's approval.
- **Status:** implementation and ordered code gates verified; fixed-artifact AI
  re-review has no open confirmed findings, Ishan disposition pending. G0 closed,
  G1 open. No live effects/providers.

### 1. Phase Objective & Scope

Durably bind business progress to synthetic effect intent, admit each dispatch
through the live T-02 gate and preserve uncertain outcomes across restart. Add
atomic schema v3 migration; preserve v2 ledger/audit/lease data and guards. Only
disposable fixture adapters/targets; no CLI dispatch, production integration,
provider/network calls, complete policy, kill actuation or later slice. Audit
outcomes and outbox observations remain facts, never proof of task completion.

### 2. Environment & Upstream State

Fresh pre-commit baseline on 2026-10-24: lint 15 files, strict check, 45-test full
coverage (421 assertions), focused gate 15 tests/144 assertions and dependency
audit 14 packages all exit 0. Functions 100%, overall lines 95.71%, store 99.63%,
framework 87.50%, index 100%. Bun 1.4.4/SQLite 3.53.4 unchanged. Installed and
official Bun 1.4.4 immediate/savepoint behavior revalidated in T-02; SQLite cannot
atomically cancel an external effect. R-06/R-17 are design context, not new proof.
No install/upgrade. Trusted temporary Gitleaks remains available; verify before use.

### 3. Architecture & File Manifest

| File | Responsibility |
| --- | --- |
| `src/store.ts` | Exact v2/v3 recognition and atomic migration, immutable intent/event persistence, queries, relay/reconciliation |
| `src/index.ts` | Export new outbox types/functions, preserve gated APIs |
| `tests/outbox.test.ts` | Confirmed public seams, independent fixture targets, recovery/contention and state regressions |
| `tests/fixtures/schema-v2.sql` | Independent known-v2 DDL snapshot for migration regression |
| `tests/schema-v2.test.ts` | Retain original migration/guard checks while advancing expected current version to 3 |
| `SPEC.md`, `ROADMAP.md`, `decisions.md` | Contract, migration/replay decisions and evidence |
| `research/reviews/2026-10-24-p1-t04.md` | Fixed-artifact AI advisory; Ishan disposition separate |

Callers traced: no existing outbox caller/table. Gate and audit functions are
reused as-is; CLI stays without relay/effect commands. v2 schema DDL and previous
records stay intact; v3 adds outbox intents, append-only dispatch/observation events
and scoped monotonic cursor. No event-range retirement or guard bypass.

**Exact contract:**
- `enqueueOutbox(db,ctx,args)` requires an active caller transaction; caller uses
  the same immediate transaction as recordTransition. It rechecks gate and native
  action's allowed/pending state. No arbitrary business-write callback or implicit
  independent commit. Tests prove business/intent rollback together.
- Intent has canonical UUID intentId and native actionId, ctx run/thread/workspace,
  fixture-only kind/target identities, exact bounded JSON payload string and its
  SHA-256, and replay mode idempotent/reconcile. Exact bytes are binding, not a
  lossy JSON normalization. One intent per native action in a run. Same intent
  retries return the original row only if every bound field matches; otherwise
  reject. SQLite row ID orders records, never serves as a global target dedup key.
- Intent and event rows are immutable by triggers. Each dispatch admission mints
  a UUID attemptId and captures owner/epoch in the gate's transaction. Observation
  events refer to that original attempt; late applied/unknown facts remain
  attributable after kill or lease succession, without granting a stale write.
- `getOutbox(db,intentId)` returns validated intent, attempts and derived state;
  NULL only for genuine absence. `listUnresolvedOutbox(db,{runId,threadId?,workspace?})`
  returns pending/dispatched/unknown work in ID order. Malformed payload/hash,
  event/identity/history fails explicitly, never falls back to prior success.
- Projection: no attempts or all proven not-applied ⇒ pending; admission with no
  observation ⇒ dispatched; unknown observation ⇒ unknown; any proven applied
  attempt ⇒ applied and never dispatch again. Applied/not-applied observations
  for an attempt are terminal; unknown may be resolved with evidence. No callback
  exception is evidence of no effect.
- `relayBatch(db,ctx,adapter,limit=10)` refuses caller transactions (no async
  effect inside an outer DB lock), accepts integer limit 1–100, and reads a bounded
  ID-ordered snapshot of unresolved matching fixture work. Adapter explicitly
  identifies synthetic kind/target and replay mode. Scoped histories are validated
  linearly before the bounded dispatch selection; no indexed projection yet.
  No default production adapter,
  path/network resolver, dynamic module loading or CLI dispatcher.
- For EACH item, reacquire an immediate transaction, recheck gate, exact intent/
  action and current outcome, append dispatch attempt and advance scoped cursor;
  commit BEFORE invoking the adapter. No DB lock/long-lived reader across awaits.
  Cursor is a monotonic admitted high-water mark, NOT an applied cursor and NEVER
  excludes older unresolved work from recovery scans. No generic async transaction.
- Dispatch admission is the local linearization point. Kill committed before it
  denies; an admitted operation may reach/finish at the target after kill. Mark
  that uncertainty honestly; SQLite cannot close the external handoff gap. Check
  kill/epoch again for subsequent items, never relabel admitted work not-executed.
- Adapter receives exact stored intent bytes, hash, stable intentId dedup key and
  attemptId; result is applied/unknown plus bounded evidenceRef. Throwing or invalid
  result records unknown with safe synthetic evidence, without logging raw errors.
  Applied evidence is target observation, not independent workflow verification.
- Previously admitted idempotent work may retry only against a matching explicit
  deduplication contract; fixture target must persist stable-key/exact-payload
  deduplication independently from Loom. Concurrent admitted replays can call it
  more than once but may apply only once. No exactly-once guarantee for arbitrary
  targets or from the Loom marker alone.
- Non-idempotent admitted/unknown work is never automatically replayed. Trusted
  `reconcileOutbox(db,{intentId,attemptId,outcome,actor,evidenceRef})` records
  applied/not-applied/unknown observation. Explicit host human attribution and
  evidence required; syntax isn't authentication. A new attempt requires proof
  all previous attempts were not applied. Reconciliation is bookkeeping permitted
  after kill/expiry; it cannot dispatch, clear kill, grant a lease or erase history.
- Relay observations are tied to the admitted attempt, not a current lease; kill
  and expiry cannot suppress a late result. Do not auto-rewrite audit decisions or
  outcomes; the native action and outbox intent remain linked for operator triage.
- v3 migrates intact empty/legacy/v2 stores atomically through the recognized
  versions; migration registry is exactly [2,3] with timestamps. Unknown/drifted/
  partial/future layouts refuse before changes. Preserve existing fields, guards,
  durability read-back and NULL legacy identity. No down-migration/data deletion.

### 4. Test Plan & Coverage Matrix

Owner-confirmed enqueue/get/list/relay/reconcile, gate/audit/transition and initSchema
seams; SQL only migration snapshots, malformed/kill fixtures and history assertions.
Real fixture adapters, target state independent of Loom; no private mocks.

| Scenario | Required proof |
| --- | --- |
| Migration | Known v2 data/guards preserved, registry3 idempotent; unknown/partial/failed migrations unchanged |
| Atomic intent | Gate/action required, shared business rollback, exact duplicate vs rebound rejection |
| Projection | Immutable intent/events, validated payload/hash/history, ordered unresolved reads |
| Relay | Gate per item, no DB transaction while awaiting target, kill/epoch between items blocks later admission |
| Uncertainty | Target exception/malformed result stays unknown; late result after kill/succession attributed to original attempt |
| Replay | Crash between target and marker deduplicates at independent target; non-idempotent refuses until evidence-backed reconciliation |
| Recovery/contention | Cursor survives reopen without skipping old uncertainty; concurrent relays cannot double-apply fixture target |
| Compatibility | Existing gate/audit/CLI tests retained; schema expectations advanced, no dependency/runtime/authority enablement |

Test-first vertical slices, disposable owned state under `/tmp/opencode`, no real
secrets/customer data. Observe intended reds before application changes.

### 5. Security, Observability & Edge Cases

Trusted host caller/adapter, never runner-provided authority. Fixture-only identity
validation cannot sandbox malicious host callbacks; production qualification is
separate and no real adapter is supplied. Bound inputs, parameterize SQL, redact
errors/evidence, never dereference evidence. Audit lifecycle and outbox append-only
guards stay intact. No network waits in writer transactions, long-lived WAL reader,
blind retry, raw error dump or unknown-as-success inference. Deadline/grant/policy
remain required before production effects; no permissive placeholder implements them.

### 6. Blast Radius & Rollback Plan

New opt-in store exports and additive schema v3; old v2 binaries will refuse v3.
Rollback is reviewed code plus verified pre-migration backup restore to a separate
disposable DB, not DROP/DELETE/downgrade. Never erase post-migration intent or
effect observations to manufacture rollback. Tests use known-v2 SQL fixtures;
production migration, backup destination/restore qualification remain unauthorized.

### 7. Definition of Done (DoD)

`bun run lint` → `bun run check` → `bun test --coverage` →
`bun test tests/outbox.test.ts` → `bun audit` → verified trusted changed-file secret
scan, all exit 0. Compare fresh 45-test/95.71% baseline and per-file coverage;
preserve assertions, no skip/exclusion. Historical document-validator heredoc,
`git diff --check`, protected package/lock/config/pin/.github/.opencode and previous
review/gate/audit/smoke comparisons pass. Review fixed candidate with ishan-reviewer
and persist advisory, exact identity/proof/limits; Ishan disposition separate.
Leave T-04 uncommitted unless separately requested. No push, provider, real effect,
G1 closure or advancement beyond this slice.

**Execution evidence (2026-10-24, Bun 1.4.4 / SQLite 3.53.4):**
- Observed intended behavioral reds before implementation: intact v2 stayed at
  version2 instead of3; missing enqueueOutbox, relayBatch and reconcileOutbox.
  Each seam then implemented with its acceptance test; later adversarial/recovery
  tests exercise those paths rather than claiming additional behavioral reds.
- `bun run lint`: exit 0, 16 files; `bun run check`: exit 0.
- `bun test --coverage`: exit 0, 59 tests/551 assertions, 100% functions,
  95.76% lines (baseline 95.71%); store 99.78% (99.63%), framework unchanged
  87.50%, index unchanged 100%. Prior 45 tests retained; only schema-current
  expectations/registry corruption fixture advanced to v3. No exclusions/skips.
- `bun test tests/outbox.test.ts`: exit 0, 14 tests/130 assertions. Independent
  v2 SQL snapshot recognized; migration preserves facts/guards; competing writer
  leaves v2 intact and retry succeeds. Existing disk-full/unknown-layout migration
  regressions remain green. Caller rollback, exact intent binding, append-only
  guards, malformed history/output/cursor and invalid shape/adapter tests pass.
- Gate checked between batch items: kill or lease succession blocks next item,
  while late applied result stays bound to original owner/epoch/attempt. Cursor
  high-water never suppresses older unresolved work. Non-idempotent unknowns
  refuse replay until evidence-backed reconciliation; terminal conflicts reject.
- Separate target SQLite commits before child exits23 without a Loom marker;
  reopen sees dispatched uncertainty, replay uses stable key and exact payload
  with target-side dedup, applies once. Overlapping batches preserve both attempts
  and skip already-applied candidates. Two real non-idempotent relay processes
  synchronize on readiness pipes and admit one unconfirmed attempt/application.
  Process-only proof, not SIGKILL/power-loss/remote exactly-once certification.
- `bun audit`: exit 0, 14 packages/no advisories. No dependency install/upgrade.
- Trusted Gitleaks 8.30.1 archive SHA-256
  `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`
  and executable/archive match verified before task-file scans. Exact pattern:
  `env -i PATH=/usr/bin:/bin <verified-gitleaks> dir <file> --no-banner --redact=100 --ignore-gitleaks-allow --gitleaks-ignore-path /tmp/opencode/loom-t01-no-ignore`.
  No task-file leaks detected; final report/governance rescan after review required.
- Historical document-validator heredoc, protected-file comparison and
  `git diff --check` pass. No CLI effect command, real target/provider/login,
  production restore, complete policy/kill or G1 closure claimed.
- Initial [T-04 advisory](research/reviews/2026-10-24-p1-t04-initial.md) requested
  R-001: a malformed negative cursor could be overwritten by admission when
  pending work existed. Parent reproduced it with a failing public regression
  (relay resolved instead of rejecting), then validated the cursor inside every
  admission transaction before any event/cursor write. Pending-work and empty
  malformed-cursor cases both remain covered; callback count0, pending state and
  unchanged cursor asserted. New fixed-artifact re-review required.
- Corrected candidate ordered gates: lint exit0 (16 files), strict check exit0,
  full coverage exit0 (60 tests/555 assertions, 100% functions/95.76% lines,
  store99.78%, unchanged framework/index), focused exit0 (15 tests/134 assertions),
  audit exit0 (14 packages/no advisories). Temporary in-repo review copy initially
  caused Biome nested-root error; removed only that owned copy after confirming
  its archived manifest, then restarted the ordered gates. No lint config change.
- Corrected [T-04 re-review](research/reviews/2026-10-24-p1-t04.md) recommends
  READY FOR HUMAN REVIEW; R-001 resolved, no open confirmed findings. Baseline
  `39cb91549c7623601d76e43258684ab2027b7856` plus corrected overlay manifest
  `3f6bc846536f79e02064e155bfabadc0887d72d0ffa4915f2938a8024bee1d47`.
  Parent verified unchanged reviewed implementation/test/fixture hashes, removed
  only owned repository snapshot copies, and passed final ten-task-file trusted
  scans and document/protected/whitespace checks. Original review retained unchanged.
  T-02/T-04 human approval remains pending; no commit/push or next slice authorized.

**Commit authorization (2026-10-24):** owner requested “commit” after the corrected
T-04 handoff. Commit this reviewed implementation, fixture and both advisory
reports; do not infer Ishan's approval or permission to push/continue. Pre-commit
ordered checks passed again: lint (16 files), strict typecheck, 60-test coverage
(555 assertions, 100% functions/95.76% lines), focused 15 tests/134 assertions and
dependency audit (14 packages/no advisories). Reviewed source/test/fixture hashes
unchanged; final task-file secret scans and document/protected/whitespace checks
pass. T-02/T-04 human dispositions remain pending; G1 open, synthetic scope only.
The temporary review archives/scanner had been cleaned before this commit task;
full manifest re-verification was therefore unavailable. Source/test/fixture
hashes matched the persisted corrected report. Re-fetched Gitleaks 8.30.1 into
`/tmp/opencode/loom-gitleaks-8.30.1-pjjroa2f`, verified the same pinned archive
digest/executable, then repeated all ten task-file scans successfully. No project
dependency or scanner version changed; ephemeral archive loss is not hidden.

## T-02 completed execution record (historical)

Historical T-02 implementation/authority below describes `39cb915`; its human
review remains pending. Current work is governed by the active T-04 contract above.

- **Work package:** P1 / T-02 write gate and fenced leases, started 2026-10-23.
- **Authority:** owner requested “continue” after approved T-03 commit `aa3287b`;
  confirmed required gate/CLI context, retained lease rows and public test seams.
- **Branch/baseline:** clean `feat/p1-write-gate` from `aa3287b`; no push/merge.
- **Status:** implementation and ordered code gates verified; fixed-candidate AI
  review has no confirmed findings, Ishan disposition pending. G0 closed, G1 open.

### 1. Phase Objective & Scope

Gate native ledger writes with live global/run kill and workspace owner/epoch/
expiry checks inside the same immediate transaction. Harden acquisition/renewal/
release against invalid state, contention and epoch reuse. Owner approved changing
normal transition/CLI write interfaces to require context; no compatibility bypass.
Audit lifecycle remains trusted-host bookkeeping, including post-kill outcome
reconciliation, not execution permission. No protected filesystem/network effect,
task-completion certification, live provider, retirement or later-slice enablement.
T-05 owns kill engage/reset/revocation; T-06 adds deadline/grant/policy between
kill and lease checks. Do not create permissive placeholder checks for them.

### 2. Environment & Upstream State

Fresh baseline: `bun run lint` exit 0 (14 files), `bun run check` exit 0,
`bun test --coverage` exit 0 (30 tests/277 assertions; functions 100%, lines
95.67%, store 99.52%, framework 87.50%, index 100%), `bun audit` exit 0
(14 packages/no advisories). Bun 1.4.4, SQLite 3.53.4; no install/upgrade.
Installed `node_modules/bun-types/sqlite.d.ts` transaction/inTransaction declarations
and official `bun-v1.4.4/src/js/bun/sqlite.ts` inspected: `.immediate()` starts
BEGIN IMMEDIATE, nested transactions use savepoints, synchronous callback returns
commit. Never put async/network work in these transactions. No Pi API change.

### 3. Architecture & File Manifest

| File | Responsibility |
| --- | --- |
| `src/store.ts` | WriteContext, live gate, gated native transition, scoped read, lease validation/retained expiry |
| `src/index.ts` | Normal gated exports/types; no migration-only writer export |
| `src/cli.ts` | Required record context, scoped status and safe write errors; no automatic acquisition |
| `tests/write-gate.test.ts` | Owner-confirmed gate/transition/lease/query/CLI seams, real process contention/recovery |
| `tests/schema-v2.test.ts`, `tests/smoke.test.ts` | Explicit migration-fixture helper and updated lease/CLI inputs; preserve assertions |
| `SPEC.md`, `ROADMAP.md`, `decisions.md` | Contract, decisions and fresh evidence |
| `research/reviews/2026-10-23-p1-t02.md` | Fixed-artifact advisory for Ishan; disposition separate |

Callers traced: CLI and existing schema/smoke tests call recordTransition; leases
have test-only callers. T-03 tests use audit exports, unchanged. DDL/schema version,
legacy rows, lock/config/runtime pins and approved review bodies stay unchanged.

**Interface and invariants:**
- `WriteContext={runId,threadId,workspace,owner,epoch,nowMs?}` is established by
  a trusted host supervisor/operator, never runner self-assertion. Run/thread/owner
  are nonempty trimmed/control-free whitespace-free keys (max 256); workspace is
  an exact trusted host identity (max 4096, trimmed/control-free, internal spaces
  allowed). Physical path alias resolution belongs to the supervisor; no invented
  canonicalization or proof of isolation. Epoch is a positive safe integer.
- Optional `nowMs` is a trusted fixture/host clock only; validate safe nonnegative
  integer in the JS Date range. Default clock sampled inside the transaction.
  CLI exposes no clock override. Wall-clock rollback and trusted caller misuse
  are not solved by TTL fencing; production clock discipline remains required.
- `writeGate(db,ctx)` throws safe value-free errors; requires active transaction,
  validates context then checks `kills` for `global` and `run:<runId>` BEFORE
  checking lease. Presence of either row denies regardless of its descriptive
  fields; no scope parser substring/prefix matching. Then require valid persisted
  lease identity/epoch/time, exact owner/epoch and expiresAt > now. No reusable
  authorization token and no success outside a transaction. This is T-02's
  kill/lease admission only, not complete policy/effect authorization.
- `recordTransition(db,t,ctx)` requires context, matching t.runId, known status,
  valid phase/resume/evidence, rejects unknown fields. Checks live gate and inserts
  `thread_id=ctx.threadId` in one synchronous `.immediate()` transaction. Returns
  native row with threadId. No hidden run/thread defaults or ungated overload.
  Phase state-machine semantics remain a later owning slice; a committed ledger
  fact is not independent task verification. Nested calls preserve outer rollback;
  a deferred outer snapshot may fail on upgrade, never bypass a failed gate.
- Existing legacy writer renamed `recordTransitionForMigration`, marked for
  trusted fixture/migration use only, exported from store but NOT package index or
  CLI. It preserves unattributed NULL thread data and old return shape. Direct
  host DB/module access remains trusted; this marking is not a sandbox.
- `getLastTransition(db,runId,threadId?)` preserves unscoped historical reads;
  optional validated thread restricts results without attributing legacy rows.
- `acquireWorkspaceLease` requires runId as well as workspace/owner/ttlMs, checks
  global/run kill before acquisition or renewal in `.immediate()`. This is a
  bootstrap exception to requiring an already-held lease, not an effect gate.
  Lease row stays workspace-wide, not run-owned; trusted context supplies run.
  Positive integer TTL and nonnegative time must fit Date/safe-integer range;
  malformed persisted lease or exhausted epoch refuses without modifying it.
  Busy errors propagate for bounded caller retry, never implicit success.
- Live same-owner renewal keeps epoch and never shortens expiry. Expired/released
  acquisition, even same owner, increments previous epoch. `releaseWorkspaceLease`
  accepts optional trusted nowMs, returns false for wrong/stale/expired/released
  lease and retains a row with expires_at=0 on valid release. Never delete epoch
  history. Release is safe cleanup, allowed after kill; no reacquisition on reset.
- All bookkeeping/bootstrap exceptions are explicit: schema/migration fixtures,
  lease acquisition/cleanup and audit records do not authorize effects. No claim
  that arbitrary host SQL is gated. Kill fixture INSERTs are tests only; no partial
  engage/reset API, no new tables or trigger exceptions.
- CLI `record` requires --run/--thread/--workspace/--owner/--epoch and existing
  --phase/--resume; no synthetic identity or auto-lease. It fails nonzero safely
  when missing/invalid/denied, writes no transition. `status --thread` scopes reads;
  init/check-framework behavior unchanged. CLI still runs only on trusted host.

### 4. Test Plan & Coverage Matrix

Confirmed seams: writeGate, gated recordTransition, acquire/releaseWorkspaceLease,
transition queries and CLI subprocesses. SQL only for kill/malformed fixtures and
unchanged-history assertions; no private mocks. Test-first vertical slices.

| Scenario | Required evidence |
| --- | --- |
| Gate/transition | Active transaction required; valid context writes attributed row; missing/unknown/mismatched context adds none |
| Ordering/scope | Global/run kill wins over missing/stale lease; unrelated run unaffected; no new ledger writes or renewal under kill |
| Lease fencing | Renewal keeps epoch; expiry/release/reacquire increments; stale/wrong/expired finalization and release fail |
| Validation | Invalid time/TTL/epoch/persisted rows fail without mutations; overflow refuses |
| Transaction/recovery | Outer rollback, busy writer, abrupt process exit, reopen preserve truthful state |
| Contention | Eight real processes compete for one workspace; exactly one effective owner/writer |
| CLI/compatibility | Missing gate flags fail, valid lease writes, scoped status; legacy migration fixture behavior and all T-03 assertions retained |

Fixtures own disposable directories under `/tmp/opencode`, with cleanup; no real
data, credentials, sleeps as synchronization or application coverage exclusions.

### 5. Security, Observability & Edge Cases

Parameterized SQL, bounded runtime validation and safe errors without input/row
dumps. Kill checked in the mutating transaction; release cannot erase fencing
history. Gate doesn't freeze arbitrary processes or atomically cancel remote
requests. No live credentials/cache/env inspection, provider calls, production
DBs or workspace writes. Existing audit records remain writable for reconciliation
even under kill, but grant no dispatch/approval authority. No generic async
transaction callback, policy placeholder or arbitrary effect runner introduced.

### 6. Blast Radius & Rollback Plan

Owner-approved breaking change to normal transition and CLI recording inputs;
update every caller/fixture, retaining legacy data and explicit migration seam.
Lease releases now retain expired records: expected readers must treat TTL, not
row presence, as ownership. Same v2 schema and audit contract; no data migration.
Rollback only authorized code, never delete retained epoch rows or historical
audit. Do not run old delete-release code against an active qualified system.
No production authority exists; G1 stays open pending T-04–T-07 and conformance.

### 7. Definition of Done (DoD)

`bun run lint` → `bun run check` → `bun test --coverage` →
`bun test tests/write-gate.test.ts` → `bun audit` → trusted verified Gitleaks scan
of exact changed files, all exit 0. Compare baseline above; retain all meaningful
regressions without coverage suppression. Run historical document-validator
heredoc, `git diff --check`, and protected-file comparison for package/lock/config,
runtime/framework pins, `.github`, `.opencode`, unchanged audit lifecycle tests and
all approved prior review records. Review fixed candidate with `ishan-reviewer`,
persist report and exact evidence; Ishan approval remains separate. Leave diff
uncommitted unless requested; no push, live use or later slice advancement.

**Execution evidence (2026-10-23, Bun 1.4.4 / SQLite 3.53.4):**
- Observed behavioral reds before fixes: release/reacquire reset epoch to 1;
  missing writeGate export; normal recordTransition ignored missing context;
  acquisition succeeded under kill; renewal shortened expiry; fractional TTL
  accepted; CLI ignored valid gate flags; explicit NULL clocks silently defaulted.
  Recovery/negative-state regressions then exercised the implemented paths.
- `bun run lint`: exit 0, 15 files; `bun run check`: exit 0.
- `bun test --coverage`: exit 0, 45 tests/421 assertions, 100% functions,
  95.71% overall lines (baseline 95.67%); store 99.63% (99.52%), framework
  unchanged 87.50%, index unchanged 100%. No tests removed or skipped; original
  30 retained, schema/smoke fixtures updated explicitly for approved interfaces.
- `bun test tests/write-gate.test.ts`: exit 0, 15 tests/144 assertions. Eight real
  contenders produce exactly one owner and ledger writer. Busy writer cannot
  finalize; stale deferred snapshot cannot write after competing kill commits.
  Outer rollback and abrupt process exit preserve committed facts and kill rows.
  These supersede R-10 prototype proof for in-repo gate/fencing behavior; historical
  external experiments remain evidence, not deleted or treated as application code.
- `bun audit`: exit 0, 14 packages/no advisories. No auto-fix or dependency upgrade.
- Trusted Gitleaks 8.30.1 archive digest
  `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`
  and executable/archive byte match verified. Exact scan pattern:
  `env -i PATH=/usr/bin:/bin <verified-gitleaks> dir <file> --no-banner --redact=100 --ignore-gitleaks-allow --gitleaks-ignore-path /tmp/opencode/loom-t01-no-ignore`.
  Task-file scans clean, final governance/report rescan required after review.
- Historical document-validator heredoc, protected-file comparison and
  `git diff --check` pass. No production clock/power-loss/restore, isolation,
  live provider, full kill actuation or complete policy qualification claimed.
- Fixed-artifact [T-02 advisory](research/reviews/2026-10-23-p1-t02.md): READY FOR
  HUMAN REVIEW, no confirmed findings. Baseline
  `aa3287bb61867d0e772595eb5bd830155279e13d` plus overlay manifest SHA-256
  `d6660a59fe85fd09f31abbfcc03eec9c6832a4662b237e7a090975a8c34ef704`.
  Parent confirmed unchanged reviewed source/test hashes, removed only its owned
  temporary repository snapshot, and completed final ten-file trusted secret scan,
  document/whitespace/protected-file checks. Original schema DDL and T-03 source
  suffix/tests remain unchanged. Report's pending closeout is historical; human
  disposition remains pending. No commit, push, live use or next slice authorized.

**Owner continuation (2026-10-24):** owner requested “commit and continue”. This
authorizes committing the verified T-02 implementation/report and beginning the
next planned T-04 work package, with its detailed contract before code. It does
not attest Ishan's T-02 approval: that disposition remains pending. Pre-commit
ordered gates repeated successfully with unchanged reviewed source/test hashes:
45 tests/421 assertions, 100% functions/95.71% lines, focused 15 tests/144
assertions, dependency audit clean; trusted task-file scans and document/protected
checks pass. No push, G1 closure, live provider or production effects authorized.

## T-03 completed execution record (historical)

The approved T-03 contract/evidence below describes `aa3287b`; the active T-02
specification above governs the authorized gated-write interface changes.

- **Work package:** P1 / T-03 native audit lifecycle, started 2026-10-23.
- **Authority:** owner requested “commit and continue”; confirmed lifecycle
  function test seams and keeping archival retirement/deletion disabled.
- **Baseline/branch:** clean `d8bb016` (approved T-01 plus consolidated record),
  `feat/p1-audit-lifecycle`, stacked locally; no Git merge/push performed.
- **Status:** T-03 implemented and ordered gates verified; artifact-specific AI
  review has no confirmed findings, approved by Ishan as relayed by the owner.
  Owner authorized committing T-03; G0 closed, G1 open. No push/next-slice authority.

### 1. Phase Objective & Scope

Add `openAction`, `recordVerdict`, `recordFinish`, `getAction`, `listOpenActions`
to the existing store/exports. Request → verdict → outcome are immutable inserts.
Reject invalid/rebound/duplicate/terminal transitions atomically; recover truthful
unresolved work. Preserve existing legacy helpers, CLI JSON and schema v2.
No authorization/effect dispatch/task-completion certification, kill/policy,
runner/provider/production integration, retirement path or subsequent slice.
No automatic commit/push. Owner-approved seams are these five public functions;
SQL is only for immutable-history checks and malformed-history fixtures. Native
file/subprocess/transaction fixtures, no private mocks.

### 2. Environment & Upstream State

Fresh ordered baseline: `bun run lint` exit 0 (13 files), `bun run check` exit 0,
`bun test --coverage` exit 0 (16 pass/115 assertions, 100% functions / 95.63%
lines; store 99.40%, framework 87.50%, index 100%), `bun audit` exit 0
(14 packages/no advisories). Bun 1.4.4 / SQLite 3.53.4 unchanged. Installed Bun
synchronous `transaction().immediate` and nested savepoints were checked in T-01.
Verified temporary Gitleaks 8.30.1 remains under `/tmp/opencode`; verify its
executable/archive before final scan. No dependency/runtime upgrade or raw env read.

### 3. Architecture & File Manifest

| File | Responsibility |
| --- | --- |
| `src/store.ts` | Native audit types, lifecycle validation/mutations and truthful recovery queries |
| `src/index.ts` | Re-export new functions/types; preserve old exports |
| `tests/audit-lifecycle.test.ts` | Confirmed public seams; identity/state/evidence, malformed history, atomicity/recovery |
| `SPEC.md`, `decisions.md`, `ROADMAP.md` | Contract, retention boundary, status and fresh verification |
| `research/reviews/2026-10-23-p1-t03.md` | Exact-artifact report for Ishan; human approval separate |

No native callers exist yet. `appendAudit` is an exported legacy claim writer,
used only in fixtures; CLI uses transition helpers. Do not invent caller identity
or migrate existing claims. T-01 DDL/signatures/guards/views/version stay unchanged.

**Exact interface/state contract:**
- `ActionKey={runId,threadId,actionId}`. Keys max 256 chars, trimmed/nonempty,
  no whitespace/control characters. actionId is client-generated canonical
  lowercase UUID (version 1–8, RFC variant), unique within run and immutably bound
  to thread. Cross-thread reuse conflicts; other runs remain isolated.
- `ActionAuditEntry` includes existing row fields plus required threadId,
  actionId, actor and tier. Decisions pending/allowed/denied/escalated/expired;
  outcomes pending/completed/failed/interrupted/timeout/not-executed. Actor is
  agent:/human:/system: plus nonempty identity (max 256), tier is standard/
  high-risk/critical. Syntax records attribution, NOT physical human proof or
  execution authority; future trusted supervisor/operator channels own that.
- `openAction(db,key+{action,actor,tier,evidenceRef?})`: one pending/pending
  request, action label max 256, trimmed/control-free; omitted evidence is NULL.
- `recordVerdict(db,key+{actor,decision,evidenceRef})`: allowed/denied/escalated/
  expired only from pending/pending or escalated/pending. Allowed/escalated stay
  pending; denied/expired become terminal not-executed. Escalation is unresolved,
  never terminal success. No duplicate allow, verdict after allow or terminal row.
- `recordFinish(db,key+{actor,outcome,evidenceRef})`: completed/failed/interrupted/
  timeout only from allowed/pending; preserve allowed. No duplicate finish or
  terminal reopening. An allowed row is not proof of dispatch; a missing finish,
  cancellation or timeout is not proof of no external effect.
- Key, action label and tier stay immutable; later actors identify event authors.
  Evidence is required for verdict/finish: max 4096, trimmed/control-free,
  nonempty `kind:locator`, kind cmd/file/session/url/trace/approval/archive. Never
  dereference evidence or infer content freshness/authorization from syntax.
  Completed is an audit outcome observation, not verified workflow completion.
- Mutations validate inputs and read/validate persisted native history + insert
  in `transaction().immediate`; exceptions add no rows. Nested calls use a trusted
  caller transaction/savepoint; outer rollback removes rows and no independent
  commit is claimed. No network I/O under a DB writer lock.
- Read all native histories in the requested run (any identity metadata filled),
  not just `latest_audit`; all-four-NULL legacy claims remain excluded. Malformed,
  incomplete, rebound or impossible history raises a safe error, never earlier
  success or an empty-open result. Validate histories before thread filtering.
- `getAction(db,key)` returns latest validated row or NULL for genuinely missing
  action, rejects wrong thread. `listOpenActions(db,{runId,threadId?})` returns
  latest pending outcomes (pending/allowed/escalated), ordered by ID. Initial
  full-run history validation is a stated cost; no schema/cache shortcut now.

### 4. Test Plan & Coverage Matrix

| Case | Required proof |
| --- | --- |
| Happy/deny/expire/escalate | Correct inserts, identity/evidence, terminal versus unresolved reads |
| Invalid/repeated transitions | No finish without allow, repeated verdict/finish, duplicate IDs, terminal reopening; no rows added |
| Identity/shape/evidence | Runtime validation, run isolation/thread binding, immutable label/tier; no hidden defaults |
| Malformed/hidden newest row | No fallback to earlier success or false empty-open query; explicit failure |
| Recovery/atomicity | File/subprocess reopen, concurrent writer and outer rollback retain truthful state |
| Compatibility/security | Existing tests/CLI/schema/legacy rows unchanged, guards active, baseline coverage and trusted scan |

Test-first vertical slices, one behavioral red then minimal implementation. Use
owned disposable paths under `/tmp/opencode`; no real data or private mocks.

### 5. Security, Observability & Edge Cases

Validate identity/evidence/state despite TS types; parameterized SQL, no audit
update/delete/retirement exception. Read-side malformed-history validation is not
a SQL firewall: raw host access can fabricate consistent rows or alter DDL.
Do not equate allowed/pending with dispatch, or audit completion with task success.
No input/row/evidence dumps, accidental debug logs, credentials/auth caches/env,
live model or production database access. Retention plan: export → verify manifest
→ separately approved critical retirement after authorization/backup/reconciliation
controls; owner explicitly chose no destructive retirement implementation now.

### 6. Blast Radius & Rollback Plan

Opt-in new store exports only; preserve v2 schema, existing functions/CLI and
approved T-01 reports. Roll back only authorized code changes; never erase audit
history or downgrade schema. T-02/T-04–T-07 still gate G1. Previous approval does
not certify this artifact. No automatic commit or advance beyond T-03.

### 7. Definition of Done (DoD)

Run `bun run lint` → `bun run check` → `bun test --coverage` →
`bun test tests/audit-lifecycle.test.ts` → `bun audit` → verified Gitleaks snapshot
scan, all exit 0. Compare fresh baseline 100% functions/95.63% overall and per-file
coverage without test deletion/suppression. Run `git diff --check`, the document
validator heredoc in historical P0 and
`git diff --exit-code -- package.json bun.lock biome.json tsconfig.json .github FRAMEWORK_REF src/cli.ts tests/schema-v2.test.ts tests/smoke.test.ts .opencode research/reviews/2026-10-23-p1-t01.md research/reviews/2026-10-23-p1-t01-report-review.md research/reviews/2026-10-23-p1-t01-consolidated.md`.
Review exact candidate with `ishan-reviewer`, persist report/proof/limitations;
Ishan disposition separate, G1 open. No live/production qualification claims.

**Execution evidence (2026-10-23, Bun 1.4.4 / SQLite 3.53.4):**
- Initial behavioral reds: missing open/query/verdict/finish exports and silently
  ignored unknown fields. Each was observed before its implementation. Subsequent
  malformed-history/recovery tests exercise existing implementation paths.
- `bun run lint`: exit 0, 14 files; `bun run check`: exit 0. First typecheck caught
  two fixture typing errors (legacy optional evidence and nullable query result);
  fixtures corrected without casts, then ordered gates restarted.
- `bun test --coverage`: exit 0, 30 tests/277 assertions. Functions 100%; lines
  95.67% overall (baseline 95.63%), store 99.52% (99.40%), framework unchanged
  87.50%, index unchanged 100%. Original 16 tests unchanged. An intermediate
  95.52% exposed an untested orphan-history rejection and a redundant input guard;
  added the public regression and removed only the guard already enforced by
  `checkFields`. No exclusions/skips or weakened validation.
- `bun test tests/audit-lifecycle.test.ts`: exit 0, 14 tests/162 assertions.
  Covers every outcome, denial/expiry/escalation, invalid/duplicate transitions,
  run/thread isolation, partial/rebound/orphan history, legacy exclusion, ordered
  unresolved queries, outer rollback, abrupt child exit and writer contention.
  Abrupt exit is process-recovery proof, not host/power-loss qualification.
- `bun audit`: exit 0, no advisories across 14 packages; no auto-fix/upgrade.
- Trusted Gitleaks 8.30.1: archive SHA-256
  `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`
  verified and executable byte-matched to archive. Scoped `env -i PATH=/usr/bin:/bin
  <verified-gitleaks> dir <file> --no-banner --redact=100 --ignore-gitleaks-allow
  --gitleaks-ignore-path /tmp/opencode/loom-t01-no-ignore`: exit 0/no leaks for
  source/exports/new tests and all three changed governance files. Source-only
  scan does not certify Git history, credentials or production state.
- No runtime/provider E2E: no such integration in this slice; store subprocess
  recovery/concurrency regressions are the applicable E2E seam. No production
  host/power-loss or timed restore claim, no provider login/use or audit deletion.
- Artifact-specific [T-03 report](research/reviews/2026-10-23-p1-t03.md): AI
  recommendation READY FOR HUMAN REVIEW, no confirmed findings. Exact baseline
  `d8bb016df9f2083ae6646bea68bfe91c345f12e5` plus fixed overlay manifest SHA-256
  `9f7481b42cc110fa583e3a24fc92cb589cebc87c6eeadd5206f1f9cd1186ff7f`.
  Initial external snapshot read denied; identical in-repo temporary copy made
  readable and reviewed, then removed. No source/test changes after that snapshot;
  parent verified hashes, final documents and all seven task-file secret scans.
  Document validator/protected-file comparison/`git diff --check` exit 0. Linear
  full-run validation, trusted host SQL and process-only recovery limits retained.
  No human approval, commit, push or phase advancement inferred.

**Approval/commit closeout (2026-10-23):** owner stated “approved by Ishan,
commit”, following the T-03 report handoff. Record approval of that reviewed
implementation/report as owner-relayed, not an independently verified signature.
Source/test hashes remain those in the review. Fresh pre-commit rerun of lint →
strict typecheck → full coverage → focused regression → dependency audit and
verified seven-file Gitleaks scan passed (exit 0); full suite 30 tests/277 assertions,
100% functions/95.67% lines, focused 14 tests/162 assertions, no dependency
advisories or detected secrets. Document/whitespace/protected-file checks passed.
Commit only this T-03 slice and approval record; no push, G1 closure, live use,
retirement or subsequent slice authorized.

## T-01 completed execution record (historical)

Historical T-01 contract/evidence below applies to its approved artifact;
current work is governed by the active T-03 specification above.

- **Work package:** P1 / T-01 schema and safe migrations, started 2026-10-23.
- **Authority:** owner stated “merged. start P1”; PR #4 merge verified at
  `2be0e4fe7a593887ce690062e68a8dfaeaf170a7`. G0 closed; T-01 scope approved.
- **Branch:** `feat/p1-schema-migrations`, clean start from that merge.
- **Status:** T-01 implementation and ordered gates verified; implementation
  review and report meta-review approved by Ishan as relayed by the owner.
  Consolidated disposition below preserves both original review snapshots.
  Owner confirmed store/SQL/CLI test seams, legacy NULL identities and a temporary
  verified Gitleaks download. No other P1 slice, live provider or release enabled.

### 1. Phase Objective & Scope

**Review closeout (2026-10-23):** owner stated “Approved by Ishan and merge the
meta-review and the previous agent review”. Consolidate those two reports into
one current review/disposition record; preserve originals, hashes and their
historical pending fields. Approval is attributed through the owner, not a direct
signature or independent identity check. This is report consolidation only, not
Git branch/PR merge, new implementation, push, deployment or another P1 slice.
The consolidated rendering is a parent-authored synthesis of approved sources,
not a third independently reviewed artifact or new human approval.

Implement schema v2 in the existing store: atomic fresh/recognized-scaffold
migration, explicit durability, immutable audit, scoped latest views and empty
kill/budget/usage/grant structures. Preserve existing public helper signatures,
return objects and CLI JSON; old helpers remain unattributed claim writers,
not effect/approval authority. T-03 will own native lifecycle validation.
No Pi/runtime dependency, runner, provider call, policy, outbox relay, kill/reset
implementation, production migration, automatic backup job or new CLI command.
No commit/push/merge without separate request.

Owner-approved seams: public `openDb`/`initSchema` and reopen behavior; SQL
schema/views/immutability on their returned Database; CLI subprocess regressions.
No private-helper mocks. Legacy rows keep their exact existing values and NULL
new identities; no inferred actor, main thread, action ID, grant or approval.

### 2. Environment & Upstream State

Linux x86_64 `7.2.8-9-omarchy`, Bun **1.4.4** (already installed; no upgrade),
SQLite **3.53.4**, Node `26.7.0`, installed TypeScript/Biome and unchanged lock.
Installed Bun declarations confirm synchronous `transaction().immediate`,
`inTransaction`, `serialize` and readonly connections. Official SQLite driver
docs checked at https://bun.com/docs/runtime/sqlite (old bun.sh URL returned 404).
Docs are evidence; ADR-008 requires FULL, not the docs' optional NORMAL tuning.

Fresh ordered baseline: `bun run lint` exit 0 (12 files), `bun run check` exit 0,
`bun test --coverage` exit 0 (3 pass, 100% functions / **89.73% lines**;
store 91.95%, framework 87.50%), `bun audit` exit 0 (14 packages, no advisories).
Historical Bun 1.4.3 coverage was 90.99% lines; source is unchanged and baseline
runtime differs, so use today's fresh baseline rather than claim equivalence.
Gitleaks/TruffleHog absent on PATH. Owner authorized Gitleaks **8.30.1** under
`/tmp/opencode`, verified against published checksums/release digest; no global
installation, telemetry, credential/cache access or Loom dependency.

### 3. Architecture & File Manifest

| File | Responsibility |
| --- | --- |
| `src/store.ts` | Sole schema owner; recognition, PRAGMAs, atomic migration, SQL definitions and compatibility helper preservation |
| `tests/schema-v2.test.ts` | Fresh/legacy/refusal/rollback/immutability/views/durability/clone-restore/public-helper/CLI tests |
| `tests/smoke.test.ts` | Keep three existing cases; move disposable file fixture under `/tmp/opencode` if touched |
| `SPEC.md`, `decisions.md`, `ROADMAP.md` | Exact contract, significant legacy/durability decision, phase status/evidence |
| `research/reviews/2026-10-23-p1-t01.md` | AI-assisted exact-artifact report for Ishan; human disposition separate |
| `research/reviews/2026-10-23-p1-t01-report-review.md` | Immutable source meta-review; historical issuance/provenance retained |
| `research/reviews/2026-10-23-p1-t01-consolidated.md` | Current combined implementation/report assessment and owner-relayed Ishan approval |

`src/cli.ts` opens/initializes in init/record/status; `src/index.ts` re-exports
store functions/types. Test these callers without changing their shapes. Preserve
package/config/lock/framework pin and approved P0 reports. CLI read-only status
hardening is later T-07; do not claim it is implemented by T-01.

**Exact schema/migration contract:**
- Recognize only empty unversioned DB; exact known scaffold (implicit v1,
  `user_version=0`, no migration table); or intact v2 with `user_version=2` and
  one nonempty `schema_migrations(version=2, applied_at)` row. Other metadata,
  extra/missing/changed application schema objects or versions fail closed.
  Compare SQLite's stored schema declarations to references built from shipped
  DDL (including views/triggers/indexes), not table names alone. Ignore SQLite
  internal objects; no arbitrary SQL from the database is executed as migration.
- Reject unsupported DBs before changing persistent journal mode. Reject nested
  initialization transactions rather than silently using savepoints. Close the
  owned connection if open/configuration fails; caller retains directly supplied
  connections on initialization failure.
- File-backed connections require WAL, synchronous=FULL (2), foreign_keys=1,
  recursive_triggers=1 with read-back. In-memory fixtures explicitly use MEMORY
  journal, not file-backed durability proof. Configure outside transactions;
  recheck schema under `BEGIN IMMEDIATE`, migrate/mark version in one transaction.
- Keep original transitions/leases/audit columns and rows, including IDs,
  timestamps/evidence/status strings and AUTOINCREMENT high-water marks.
  Add nullable `thread_id TEXT` to transitions/audit, and nullable
  `action_id TEXT`, `actor TEXT`, `tier TEXT` to audit. No legacy rewriting.
- Add `schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`;
  only version 2 is recorded at actual migration time; do not invent v1 history.
- Add `kills(scope TEXT PRIMARY KEY, engaged_at TEXT NOT NULL, actor TEXT NOT
  NULL, reason TEXT NOT NULL)`; `budgets(run_id TEXT, kind TEXT, used INTEGER,
  "limit" INTEGER NULL, updated_at TEXT)` keyed by run/kind with nonnegative
  integer used/limit; kinds time-ms/retries/cost-tokens/cost-minor-units/threads/
  tool-calls. NULL limit represents unset, not a seeded allowance.
  Stored counter/expiry integers are bounded to JavaScript's safe range
  (0..9007199254740991); no floating-point counter or silent integer rounding.
- Add `usage(id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, thread_id TEXT,
  kind TEXT, amount INTEGER, evidence_ref TEXT NULL, created_at TEXT)` with required
  nonempty IDs/kind and nonnegative integer amount; immutable inserts, no provider
  ingestion/accounting enabled. Add `grants(grant_id TEXT PRIMARY KEY, run_id TEXT,
  thread_id TEXT, tool TEXT, pattern TEXT, expires_at INTEGER)` with nonempty text
  fields and nonnegative integer expiry. All new authority/counter tables empty.
- `latest_transition`: latest id per run/thread for known, nonempty thread IDs.
  `latest_audit`: latest id per run/thread/action with complete nonempty
  identities and tier standard/high-risk/critical. Legacy NULL rows are excluded;
  their original query APIs still read them as claims. Views are observations,
  not authorization. No seeded policies, synthetic identities or effective grants.
- Audit and usage UPDATE/DELETE fail by BEFORE triggers. Recursive triggers
  plus BEFORE INSERT collision guards prevent REPLACE/UPSERT from rewriting
  existing immutable rows. Schema validation rejects removed/altered guards.
- Rollback uses verified consistent backups into a separate path, never schema
  downgrade/reset or deletion of live WAL. Fixtures use SQLite `VACUUM INTO`
  outside transactions; test clone integrity/version/data, not production RTO.

### 4. Test Plan & Coverage Matrix

| Seam/case | Required observation |
| --- | --- |
| Fresh and repeat init | Exact tables/columns/constraints/indexes/views/guards; one migration record; no duplicate facts |
| Recognized legacy | Every original field preserved; NULL new identities, same sequences, no new authority rows or view promotion |
| Unknown/newer/partial/drifted | Refusal with original schema/rows/version/journal unchanged; no reset or repair-by-guessing |
| Mid-migration disk exhaustion | SQLite max_page_count fault; original DDL/data/version intact after failure/reopen, then retry succeeds |
| Immutable records | UPDATE, DELETE, OR REPLACE, UPSERT/ID collision cannot alter audit/usage; normal INSERT still works |
| Scoped views | Latest-per-key; separate run/thread/action; legacy claims excluded |
| File durability/read-only/nesting | Mandatory PRAGMA read-back, rejected unsafe init context, connection/resource cleanup |
| Backup/restore/reopen | Consistent clone and integrity_check; source unchanged; version mismatch rejected |
| Public compatibility/CLI | Existing helpers/JSON preserved; init/record/status subprocesses work, unknown schema exits nonzero |
| Coverage/security | Fresh baseline comparison; no coverage removal/suppression; read-only audit and trusted secret scan |

Vertical test-first slices: one failing behavior, minimal implementation, repeat.
No infrastructure-only test failure relabeled as a behavioral red. All fixture
files synthetic under `/tmp/opencode` and cleaned with exact owned paths.

### 5. Security, Observability & Edge Cases

Unknown DB content is not migration authority. Parameterize values; fixed shipped
DDL only. Owner accepted nullable legacy identity exception to R-11/R-13 proposals;
no unknown claim enters authoritative scoped views. Preserve original schemas
and data on refused migration. Trusted host/operator/DB access remains a boundary
assumption; raw Database handles can drop triggers, so this is not a hostile-
same-process sandbox. Validate guards on initialization, not a claimed SQL firewall.
No live model, credentials, raw .env, network provider or production DB access.
Errors must be explicit without dumping record contents. No accidental debug logs.
Scanner absence/failure blocks T-01 sign-off; do not substitute regex review.

### 6. Blast Radius & Rollback Plan

Affected layer is the local store and schema, plus its existing CLI/library
consumers. Test only disposable DBs; no user database is opened/migrated. Existing
claims remain readable; native identity APIs/lifecycle/authorization wait for
their later slices. SQL schema is a deliberate v2 change; unknown layouts refuse.
For real upgrades require operator-approved consistent backup and restore review;
code rollback is not a downgrade. Revert only authorized task changes, preserving
user work, P0 history and verified backup artifacts. No production support claim.

### 7. Definition of Done (DoD)

Run in order: `bun run lint` → `bun run check` → `bun test --coverage` →
`bun test tests/schema-v2.test.ts` → `bun audit` → verified Gitleaks local scan.
Compare coverage with today's 100% functions/89.73% lines and per-file baseline;
record any denominator/runtime differences. Run `git diff --check` and the
document/structure validator retained below (active-section selection stops at
the next level-two heading). Verify unchanged config/lock/pin with
`git diff --exit-code -- package.json bun.lock biome.json tsconfig.json .github FRAMEWORK_REF`.
Review the exact diff/candidate with `ishan-reviewer`, persist report and pending
Ishan disposition. Record commands/results, red/green proof and limitations here;
G1 stays open. No automatic commit/push or advancement to another slice.

**Implementation proof so far (2026-10-23):** registry, nullable legacy metadata,
strict schema refusal, append-only and durability behaviors each had intended
failing tests before implementation. Disk-full fault and competing writer tests
show atomic rollback/refusal and clean retry without private mocks. A discovered
`LIKE 'sqlite_%'` wildcard mistake was reproduced by an extra `sqlitexrogue`
table and fixed with literal-prefix `GLOB 'sqlite_*'`; its regression passed.
CLI and backup/clone checks are synthetic only. Current verified temporary scanner
binary: `/tmp/opencode/loom-gitleaks-8.30.1.pje2WE/gitleaks`; archive SHA-256
`551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`, matching
published checksum and GitHub release digest; checksum-list digest also matched.
Initial 84-file tracked-source-plus-new-test snapshot scan found no leaks;
final candidate checks and review results must be recorded below or in its report.

| Fresh gate (2026-10-23) | Result | Limitation |
| --- | --- | --- |
| `bun run lint` | Exit 0; 13 files | Configured Biome rules only; initial formatting errors corrected in task files |
| `bun run check` | Exit 0 | Existing strict TS configuration unchanged |
| `bun test --coverage` | Exit 0; 16 pass/115 assertions; 100% functions, 95.63% lines | Fresh baseline 100%/89.73%; store improves 91.95%→99.40%, framework unchanged 87.50%; index now measured at 100%. Durability read-back mismatch guard not fault-injected on a platform honoring those PRAGMAs |
| `bun test tests/schema-v2.test.ts` | Exit 0; 13 pass/103 assertions | Public store/SQL, file-backed/native faults, backup/CLI fixtures; no production migration or runner conformance |
| `bun audit` | Exit 0; no vulnerabilities among 14 packages | No full license/provenance assessment; no auto-fix or dependency changes |
| Trusted secret scan and final artifact review | Initial verified Gitleaks scan passed; final candidate snapshot/result/identity recorded in T-01 report | Current source snapshot only, not credential stores or full Git history; Ishan disposition separate; G1 remains open |
| Review consolidation/approval record (2026-10-23) | Owner relayed Ishan approval of both reports; document validator passed (258 links/seven sections/unique IDs); source-report SHA-256, four-file whitespace/provenance/authority assertions and `git diff --check` passed; application/config/pins/original reports unchanged | Approval metadata and parent synthesis only; no additional application tests required. Original pending fields are historical; current disposition is in the consolidated record. No Git merge, later slice or live use implied |

## P0 completed execution record (historical)

Historical scope/commands/results below describe P0 and are not P1 authorization.
Current work is governed by the active P1 specification above.

- **Work package:** P0 G0 acceptance record, 2026-10-23; prior preparation/evidence dated 2026-10-22.
- **Authority:** user authorized starting P0 after PR #1 merged; confirmed existing
  TS repository, Linux/local evaluation and offline-only experiments.
- **Branch:** `chore/p0-subscription-provider-review`, from G0 pack `558610f`.
- **Status (2026-10-23):** **G0 ACCEPTED / CLOSED.** Owner stated “G0 accepted”
  after reviewing the package and scope/failure assumptions. T-01 scope is
  approved; P1 implementation has not started. Detailed P1 specification and
  baseline precede code. No live/provider/production authority is added.
- **Evidence history:** User specified Codex subscription access and asked to consider
  Google Antigravity subscription. These are provider candidates, not permission
  to log in, consume quotas, add a fallback, replace Pi SDK or claim eligibility.
  Review complete: SIWC direct is a conditional candidate; consumer Antigravity
  third-party access is prohibited by current terms. ADR-010 now records an
  accepted disabled qualification direction, not live-provider adoption.
  Owner clarified personal OpenAI account, GPT-6.1 Sol initial model
  candidate, private-source permission and a required training/improvement
  opt-out with no additional retention/residency requirements for now; owner also
  confirmed `gpt-6.1-sol` is available on that personal account (attestation, not
  an API check). Owner has confirmed the training opt-out and now explicitly
  attests Codex **Include environments** is off; these are attestations, not
  independent account checks. Applying account controls remains an owner action;
  an offline check of installed `codex-cli 0.163.0` found no account data-control
  setting, and its local `include_environment_context=true` default is not proof
  of the account-level **Include environments** state. Public source review of
  official Codex and three third-party Codex-auth/account tools likewise found no
  supported account-control query; they implement OAuth, rotation or usage, not
  training/**Include environments** verification.
  The owner later restated “codex api”; this is recorded as the already-requested
  subscription/SIWC candidate, not the legacy private backend and not a silent
  switch to Platform API-key billing. Provider/model
  independence is now recorded as an architecture invariant; this profile is only
  the first integration candidate. Owner authorized the user-level rootless lab
  setup; Docker `29.9.2` is running rootless with tested CPU, memory, PID and
  whole-container cleanup controls. A fixed 2 GiB ext4 workspace (read-only
  rootfs, 64 MiB tmpfs `/tmp` and `/dev/shm`) was provisioned and ENOSPC-tested;
  mount preflight, log caps and boot persistence remain. Final image pin, broker,
  port publishing and production-host qualification remain open. Subscription
  preference is “Plus tier + Free tier subject to availibility”; eligibility and
  integration/data-policy proof stay gated before live use, not synthetic P1.
  Owner approved deferring live qualification with the integration disabled.
  Independent reviewer Ishan Singh's approval of the `fc0e05e` report is relayed
  by the owner on 2026-10-22; the follow-up report approval is recorded separately.
  Owner accepted the G0 package on 2026-10-23 and previously approved the T-01
  schema/safe-migration scope. No login, live model
  calls or executable application changes. Prior docs commits include `67a94fc`,
  `98a6975`, `7caac84` and `22fbd43`; this workspace-cap delta is covered by the
  owner's commit request.
- **Next gate:** prepare the detailed seven-section P1/T-01 specification and
  exact migration contract before code; P1 start remains a separate action.
  G1 implementation proof is not satisfied by G0 acceptance. No paid/live calls,
  deployment or dependency promotion authorized here.

### 1. Phase Objective & Scope

**Gate acceptance record (2026-10-23):** record the owner's exact “G0 accepted”
decision against the closure package, approved T-01 scope and stated failure
assumptions. Synchronize current gate status in SPEC/ROADMAP/decisions and the
support/decision/closure records; preserve the reviewed reports and their
artifact identities. This is approval metadata only, not P1 implementation,
new qualification, install, commit/push or live-use permission. Earlier pending
G0 language below describes preparation before this explicit acceptance.

**Closure-preparation scope (owner-requested, 2026-10-22):** resolve R-001 using
the accepted one-hour recovery target; synchronize account attestations; record
the owner's disabled-provider/synthetic-only boundary; prepare the first T-01
slice, gate-by-gate evidence ownership and closure checklist in
`research/phase-0/09-g0-closure-readiness.md`; obtain an AI follow-up review for
Ishan. No application/test changes, installs, host changes or P1 execution.
The user approved deferring live qualification and identified Plus plus Free
subject to availability as qualification candidates. Free is not fallback or
account rotation. G0 acceptance and approval of the specific first slice remain
explicit human decisions; do not infer them from this preparation request.
**Subsequent owner decision:** “T-01 approved” approves the schema/safe-migration
slice described in the closure packet. Record scope approval only; G0 package
acceptance and P1 start are not inferred. Exact migration/API/legacy contracts
and the seven-section P1 specification still precede application/test edits.
This approval-record delta does not modify the approved reports or expand their
artifact scope; prior commit/push authorization ended with PR #2's preparation.
The prior commit request ended at `dbbc576`; this delta is not authorized for
commit/push. Preserve the original approved report, append a new follow-up report.

**Reviewer work package (owner-requested, 2026-10-22):** install a project-local
OpenCode reviewer profile and produce an AI-assisted G0 report for Ishan Singh
against `fc0e05e`. Persist the profile and reports, not a daemon or autonomous
schedule. The reviewer recommends; Ishan alone records his human disposition.
Owner has since relayed Ishan's approval of the report for `fc0e05e`; record the
relay and its exact scope without inventing a direct signature, finding waiver
or phase approval. Preserve the original report body and append disposition.
This tooling does not replace independent human review or authorize G0 closure,
P1, Loom provider calls, pushes or production effects. Owner has now explicitly
authorized committing this reviewer setup and report-approval record; no push
or phase advancement is authorized.

Investigate official subscription eligibility, third-party/custom-harness use,
auth/billing/data terms and installed Pi `1.4.0` provider seams. Distinguish a
native provider adapter from vendor permission and working integration. Record
Codex subscription as the requested route and Antigravity as an additional
candidate, not an automatic fallback or a second execution runtime. Identify a
supported host-side credential/egress path or a blocker; preserve the accepted
whole-runner isolation and one-runtime decisions.
Record the owner's initial qualification profile, not a core model dependency:
Loom's authority, workflow and verification remain provider/model-independent;
each enabled integration needs qualification and explicit selection, no silent
fallback. Private-source permission does not waive secret hygiene or authorize
unrelated personal/customer data, OAuth/login or live allowance consumption.
The owner's explicit commit request covers the preceding docs delta only. The
owner separately authorized the user-level rootless lab setup recorded below.
Out of scope: application/test/probe edits, dependency/scanner installation,
live model calls, credentials, host configuration beyond that authorized lab
setup, production qualification, framework re-pin, P1, further commits,
publication or deployment. No auth/cache/keyring
inspection, OAuth login/refresh, private endpoints, quota-consuming requests,
client impersonation, limit circumvention or plugin installation.

### 2. Environment & Upstream State

Closure baseline: clean `dbbc576`. Read-only caller trace: `openDb`/`initSchema`
in `src/store.ts` are called by `src/cli.ts` and `tests/smoke.test.ts` and exported
through `src/index.ts`. No dependency/schema/config change is needed for G0.
R-001 was reproduced with an assertion on ROADMAP's Recovery table row (exit 1,
30-minute roadmap versus accepted one-hour ADR-008). Re-run that assertion after
correction. Earlier runtime/lab experiments remain historical evidence, not reruns.

Reviewer tooling: installed OpenCode `2.1.1`; V2 agents and permissions docs
checked on 2026-10-22. Project profiles live in `.opencode/agents/`; subagents
inherit the invoking model when no model is pinned. No provider integration,
dependency or global configuration is installed. Verify profile discovery with
`opencode debug agents`; report any activation/runtime limitation explicitly.
References: https://opencode.ai/v2/docs/agents and
https://opencode.ai/v2/docs/permissions (mutable docs; installed discovery and
actual dispatch were checked separately).

Observed 2026-10-22: Linux x86_64 (Omarchy), 16 logical CPUs, approximately
15 GiB RAM; Docker and bubblewrap on PATH, Podman absent. This is the development
host, not a qualified deployment or sandbox. Bun `1.4.3`, Node `26.7.0`; existing TypeScript
`5.9.3`, Biome `2.5.14`, existing `bun.lock`. These are observations, not newly
promoted support pins. `.env.example` is absent; no raw environment values read.
Read-only inspection for this package observed embedded SQLite `3.53.4` with
in-memory synchronous default `2`, and Docker endpoint server `29.9.1` reporting
cgroup v2/systemd but no rootless security option. No file-backed authority DB,
daemon config or running container was modified; these are facts, not qualification.
The scaffold's schema is owned by `src/store.ts`; no schema change in this task.
Framework selection stays in `FRAMEWORK_REF`; ADR-005 selects coding-agent SDK
`1.4.0`, with no runtime dependency added to Loom. No separate upstream SOP URL/ref is configured; this
change adapts the user-supplied playbook into reviewed repository governance.
Merged `master` was fetched read-only over HTTPS after verifying PR #1's merge.
Prior `1.3.0`/`1.4.0` comparison evidence is committed at `5ae0737`; no new
runtime experiment or installation is required for this docs-only package.
The G0 decision pack is committed at `558610f`; approved design choices remain
unchanged. Inspect only published static code/declarations in the existing
external Pi `1.4.0` tree, never credential stores or local account configuration.
The sibling framework is at `bd0cacc5` with unrelated untracked work: preserve it
and read the pinned commit through Git, never substitute its working tree.
No raw host skill/config directories are mounted. Bubblewrap
`0.13.1` runs an empty unshared domain on this host. At the initial observation,
Docker reported seccomp and cgroup namespaces but not rootless mode; the separate
lab setup is below.

**Rootless lab setup (owner-authorized, 2026-10-22):** official static Docker
`29.9.2` and rootless extras under `$HOME/bin`, with `rootlesskit 3.3.0` and
`slirp4netns 1.3.6`; user `docker.service` active; separate `rootless` CLI
context, with the prior `default` context restored. The daemon reports
`name=rootless`, storage driver `overlayfs`, cgroup driver `systemd`. Controlled
runs enforced 1 CPU (`100000 100000`, throttled 20/21 periods), 512 MiB memory
(32 MiB over-limit OOM, exit 137) and 64 PIDs (fork denied at 16); a container
whose PID 1 and child ignored `SIGTERM` exited 137 under `docker stop -t 1` with
no surviving process or heartbeat write. A `--storage-opt size=64m` probe wrote
128 MiB, so Docker's storage option is not an enforced disk cap here. The selected
cap is a fixed 2 GiB ext4 workspace image under `$HOME/.local/share/loom-lab`,
mounted by udisks at `/run/media/$USER/loom-workspace`; with a read-only rootfs
and 64 MiB tmpfs `/tmp` and `/dev/shm`, a 2.3 GiB fill stopped at 1.9 GiB with
`ENOSPC` (`dd` exit 1) and a 100 MiB `/tmp` fill stopped at 64 MiB. The image
store remains supervisor-owned and uncapped, so mount preflight and log caps are
required. The rootful daemon was not modified. Final image pin, linger/boot
start, port publishing, broker integration and production host remain unqualified;
`--skip-iptables` was used because `nf_tables` was not loaded. The logged netns
warning matches documented detach-netns noise on working setups, not a proven
failure. Exact hashes and evidence are in the
[G0 pack](research/phase-0/06-g0-decision-pack.md#3-host-sandbox-and-deployment-target).

Neither `gitleaks`
nor `trufflehog` was found on PATH; record scanner coverage honestly.
Biome currently uses `rules.preset: "none"`; its configured checks passing is
not proof of a comprehensive static/security rule set. Tightening it is a
separate scoped implementation decision, not an unrequested edit here.

### 3. Architecture & File Manifest

| File | Operation / responsibility |
| --- | --- |
| `SPEC.md` | Declare subscription review scope, sources and verification. |
| `decisions.md` | Record significant provider/boundary recommendation without inventing final eligibility or approval. |
| `research/phase-0/08-subscription-provider-review.md` | Official eligibility/auth/data evidence plus static pinned Pi integration seams and blockers. |
| `research/phase-0/06-g0-decision-pack.md` | Synchronize provider candidates and remaining approval/qualification inputs. |
| `research/phase-0/05-p0-support-profile.md` | Record the user's requested subscription route and candidate, retaining live-call prohibition. |
| `ROADMAP.md` | Synchronize P0 execution status with the recorded provider profile; no phase advancement. |
| `.opencode/agents/ishan-reviewer.md` | Persistent read-only review profile, evidence workflow and report contract. |
| `AGENTS.md` | Review dispatch and human-approval pointer. |
| `research/reviews/2026-10-22-g0-fc0e05e.md` | AI-assisted baseline review, findings and owner-relayed Ishan report approval. |
| `research/phase-0/09-g0-closure-readiness.md` | Closure checklist, disabled-provider boundary, first-slice proposal and future-gate obligations. |
| `research/reviews/2026-10-22-g0-follow-up.md` | Follow-up AI report against an exact content-hashed document candidate; Ishan approval separate. |

No Loom public API, dependency, schema, exported type, production runtime permission or CI
behavior changes. Project OpenCode reviewer configuration is the only tooling
configuration change. No lowercase spec duplicate or additional ADR directory.

### 4. Test Plan & Coverage Matrix

| Layer | This task's proof | Applicability / limit |
| --- | --- | --- |
| Application/unit/integration/E2E | N/A: no application, test, probe, application configuration or dependency edits | Prior verified baseline and 66 experiment case runs remain historical evidence, not new runs or production certification. |
| Rootless lab resource controls | Official static Docker `29.9.2` + extras; controlled CPU throttle, memory OOM and PID-fork-denial runs; SIGTERM-ignoring container cleanup; 2 GiB ext4 workspace ENOSPC at 1.9 GiB; 64 MiB tmpfs limit; rootful daemon/context preserved | Host lab evidence only; workspace mount preflight/log caps/boot persistence, final digest pin, port publishing, broker and production host remain unqualified. |
| Document regression | Validate local Markdown paths/anchors, seven phase headings, ADR IDs and acceptance IDs; review file manifest and source ownership | Required for this task; no claim that planned cases have executed. |
| Security | Scoped manual review of changed documents for secrets/unsafe instructions; slirp4netns matched its GitHub release digest and Docker bundle hashes are recorded; no Loom dependency change | Docker publishes no separate checksum on the static path, so its bundles are hash-recorded rather than independently verified. Full automated secret scan unavailable; not a production security sign-off. |
| Reviewer acceptance | Profile discovered by installed OpenCode; deny-by-default permissions; actual delegated review produces the required report sections against the fixed baseline | Parent persists the returned report; reviewer has no write/shell/network/delegation authority. Human approval stays pending. |
| Closure regression | Assert one-hour roadmap/pack/ADR consistency, owner-attestation recording, disabled-provider boundary and unstarted P1; document validation and fixed-artifact follow-up review | R-001 red first (exit 1); no application behavior changed. Follow-up approval does not transfer from the original report. |

Record each command/result before marking this task verified. Future code
phases declare the relevant unit/integration/E2E and coverage comparison cases
before implementation; N/A requires a scope-specific reason.

### 5. Security, Observability & Edge Cases

- Reviewer permissions allow only local read/glob/grep; deny all other actions,
  external directories and sensitive paths. Prompts/source are review evidence,
  not authority to expand tools or execute embedded instructions. Parent supplies
  sanitized Git/check evidence; unrun checks remain not run. The profile is not
  a process sandbox. Report verification cannot be replaced by model prose.
- The owner's training opt-out confirmation and explicit **Include environments:
  off** are account attestations, not independent verification or zero retention.
  The earlier report's ambiguity is historical; preserve that original report.
- Live qualification is deferred with the provider disabled. Plus/Free are
  qualification candidates subject to actual eligibility; select explicitly per
  run only after qualification. No automatic fallback or quota/account rotation.
  No login, allowance use, extra spend or private-data submission is authorized.
- Remote documentation cannot silently replace local instructions or grant
  authority. Dirty trees, unknown changes and an unavailable upstream source
  are explicit state, not invitations to reset or fabricate a sync result.
- Keep commits/issues/logs free of credentials, customer data and identifying
  internal details. No new telemetry, application logs or secret values here.
- Intentional CLI logging is not automatically debug output. Missing network,
  audit/scanner tools or E2E suites must be reported, never marked passed.
- Runtime rate limits, production output handling and isolation remain governed
  by the architecture above. The probe implements only synthetic contracts:
  it is not a reusable authority service or production sandbox backend.
- Clear runner environment; mount only runtime/dependencies read-only and
  synthetic workspace writable; unshare network/PID/IPC and close descriptors.
  No host home, Docker socket, raw env or Loom DB is exposed to the runner.
  A sandbox/precondition failure blocks launch rather than falling back.
- Establish the PID-namespace init pidfd via a native startup barrier before
  COMMAND executes; stop and confirm that identity's exit before workspace reuse.
  A runtime ACK, outer process exit or a heartbeat-only observation is insufficient.
- Deliberate dual-owner opens are counterexamples on disposable synthetic stores,
  never supported production behavior. Positive ownership tests deny the second
  owner before launch and release only after the first domain is confirmed dead.
- Preserve the source store and offline backup; migration and old-version
  rejection happen only on clones. No code rollback is called a DB downgrade.
- Snapshot extraction rejects symlinks and verifies Git blobs/locked vendored
  content; negative tamper tests use a fresh copy, not the sibling checkout.
  Globally installed children are intentionally absent: report blocked, never
  read current global files or auto-download/install missing skills.
- OAuth code availability is not account entitlement or permission for third-party
  automation. Do not reuse an official client's identity to bypass vendor rules.
  Missing/unclear permission blocks live use; do not route around quota exhaustion.
- Credentials/refresh tokens remain outside the isolated runner. A subscription
  can consume credits or incur optional charges: zero additional-charge budget
  does not authorize consuming subscription allowance. All live calls stay disabled.
- Private-source permission is data-class authorization for the initial profile,
  not a waiver of vendor terms, secret hygiene or provider validation. Secrets and
  unrelated personal/customer data remain excluded until separately approved.
- The training/improvement opt-out is an owner-applied account control, not a Loom
  runtime guarantee. Record owner confirmation; do not infer zero retention from
  the opt-out, and verify Codex **Include environments** separately.

### 6. Blast Radius & Rollback Plan

Closure remediation changes documents only. Restore the prior wording only if
requested, without rewriting the approved original report. This does not change
accepted storage ownership, runner isolation, broker boundaries or production
permissions. Backups, production hosts and live providers retain their later
phase approval/test gates; do not provision them merely to close planning.

Reviewer additions affect project OpenCode configuration and review documents
only, not Loom execution or global agents. If removal is requested, remove this
specific profile/pointer and reload project configuration; retain review history.
Changing the reviewed artifact invalidates its recommendation for the new artifact.

Changes affect P0 planning/research documents plus an owner-authorized
user-level rootless Docker lab install under `$HOME/bin` with a systemd user
unit, a separate CLI context, and a 2 GiB workspace image at
`$HOME/.local/share/loom-lab/workspace-2g.img` mounted via udisks. The rootful
daemon, its `default` context endpoint and Loom data were not modified. If removal
is authorized, run the rootless setuptool uninstall, stop/disable the user unit,
and remove only the user-level binaries/context and workspace image/loop mount;
loop deletion may require operator authorization. Never touch the rootful daemon
or unrelated user data. Review for accidental authority expansion, case-collision
paths and
references to unsupported tooling. Before merge, revise only this task's
identified files; after commit, revert its specific commit only with
authorization, preserving unrelated work and decision history. No feature
flags/down-migrations are needed for this experiment. Preserve evidence; no
broad temporary-directory deletion.

### 7. Definition of Done (DoD)

Run in this order; each required executable check must exit `0`:

1. Run the read-only document/structure command below — local links/anchors,
   seven active sections, acceptance/ADR IDs, casing and whitespace.
2. `git diff --check` — tracked document whitespace; validate new files too.
3. `git diff --exit-code -- src tests research/pi/probes package.json bun.lock biome.json tsconfig.json .github FRAMEWORK_REF`
   — prove code, experiments, config, dependencies and pin unchanged.
4. Manual status/evidence/secret review: all proposed versus accepted decisions
   are labeled; host setup is recorded as lab evidence, not production support;
   no fabricated reviewer sign-off, host support or G0 closure.
5. Reviewer package: `opencode debug agents` must list `ishan-reviewer`; inspect
   its parsed permission rules against the profile. Dispatch one fixed-baseline
   review, inspect cited evidence and persist its report with human disposition
   pending. Re-run the document validator and `git diff --check` for final files.
   Missing custom-agent activation blocks a claim of deployed runtime validation;
   a fallback review must be labeled with the actual agent used.
6. Closure delta: run `python3` assertions that ROADMAP's Recovery row contains
   `one hour`, the decision pack and ADR-008 retain the same target, and closure
   documents preserve disabled live calls, zero paid budget and pending P1.
   Record a manifest/content hash for the corrected candidate before dispatching
   `ishan-reviewer`; a new report is not approval of a different artifact.
   No application gates are required for these document-only edits. The proposed
   P1 gate commands and baseline/tool limitations belong in the closure packet.

Application lint/typecheck/test/coverage/audits are N/A for this docs-and-lab
delta; their preceding results remain at `5ae0737`. The host change is the
authorized user-level rootless lab, not a Loom application/runtime change.
Required engineering tools and production integration/security gates remain open
for their affected phases.

Read-only document/structure check (no application/test file generated):

```bash
python3 - <<'PY'
import pathlib, re, unicodedata, urllib.parse
root = pathlib.Path.cwd()
changed = [pathlib.Path(p) for p in
           ('AGENTS.md', 'SPEC.md', 'decisions.md', 'ROADMAP.md', 'CONTEXT.md')]
profile = pathlib.Path('research/phase-0/05-p0-support-profile.md').read_text()
assert all(line == line.rstrip() for line in profile.splitlines()), 'profile whitespace'
cases = re.findall(r'^\| (P0-A\d{2}) \|', profile, re.M)
assert len(cases) == 12 and len(set(cases)) == 12, 'missing/duplicate acceptance IDs'
for file in changed:
    assert file.is_file(), file
    assert all(line == line.rstrip() for line in file.read_text().splitlines()), file
names = [p.name.casefold() for p in root.iterdir() if p.is_file()]
assert len(names) == len(set(names)), 'case-only duplicate root file'
active = pathlib.Path('SPEC.md').read_text().split('## Active phase specification\n', 1)[1].split('\n## ', 1)[0]
assert re.findall(r'^### (\d)\. ', active, re.M) == list('1234567')
records = pathlib.Path('decisions.md').read_text()
ids = re.findall(r'^## \[(ADR-\d+)\]', records, re.M)
assert ids and len(ids) == len(set(ids)), 'duplicate/missing ADR IDs'
count = 0
for file in changed + list(pathlib.Path('research').rglob('*.md')):
    text = file.read_text()
    links = re.findall(r'\]\(([^)\s]+)\)', text)
    links += re.findall(r'^\[[^\]\n]+\]:\s*(\S+)', text, re.M)
    for link in links:
        parsed = urllib.parse.urlsplit(link)
        if parsed.scheme:
            continue
        target = ((file.parent / urllib.parse.unquote(parsed.path)).resolve()
                  if parsed.path else file.resolve())
        assert target.exists(), (file, link)
        if parsed.fragment and target.suffix == '.md' and target.is_relative_to(root):
            headings = re.findall(r'^#{1,6}\s+(.+?)\s*#*$', target.read_text(), re.M)
            slugs = []
            for heading in headings:
                heading = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', heading)
                slug = ''.join(c for c in heading.lower()
                               if c in '-_ ' or unicodedata.category(c)[0] in 'LN').replace(' ', '-')
                unique, n = slug, 0
                while unique in slugs:
                    n += 1
                    unique = f'{slug}-{n}'
                slugs.append(unique)
            assert urllib.parse.unquote(parsed.fragment) in slugs, (file, link)
        count += 1
print(f'PASS: {count} local links; seven phase sections; unique ADR IDs; whitespace/casing')
PY
```

Manual sign-off also requires matching file manifest, scope/secret review,
honest scanner/E2E limitations, relevant ADRs and explicit Git status. If a
required audit/check cannot run, record blocked—not successful. This research
experiment's verification does not close G0 or any production gate.

Verification record:

- [x] Documents, phase/ADR structure and links/anchors validated.
- [x] Application/probe/config/pin integrity and document whitespace pass.
- [x] Official account-policy permission distinguished from adapter support;
  no account/credential effects; authorized user-level rootless lab installed;
  no Loom application change, invented reviewer sign-off or false G0 closure.
- [x] Rootless lab CPU/memory/PID limits observed; SIGTERM-ignoring container
  stopped with no surviving process or heartbeat writes; 2 GiB workspace cap
  ENOSPC-tested; tmpfs capped; rootful daemon/default context preserved; rollback
  path recorded.

Baseline from governance (2026-10-21): lint/typecheck passed; 3 tests passed,
100% functions / 90.99% instrumented lines; audit found no advisories across
14 packages. Skill/recovery evidence and accepted runtime were committed at
`5ae0737`; the G0 pack is at `558610f`. Current docs-and-lab verification (2026-10-22):

| Command / review | Result | Limit |
| --- | --- | --- |
| SPEC's document validator, new-report/pack whitespace and `git diff --check` | Exit 0: 247 local links; seven phase sections; 12 unique acceptance IDs; unique ADR IDs; whitespace/casing pass | No full Markdown lint or future external availability claim. |
| Declared `git diff --exit-code` for application/probe/config/pin integrity | Exit 0; no changes | Earlier executable results not relabelled as fresh; application checks N/A for docs-and-lab delta. |
| Six-file scope/source/evidence/authority/secret review | Official report reconciled with static Pi source; critical Google terms, SIWC inference and OpenAI data-control requirements independently fetched; model availability is owner-attested; no credentials or live effects | No independent account verification, opt-out confirmation, legal approval, live integration or automated secret-scan pass claimed. Prior commits `67a94fc`/`98a6975`/`7caac84`/`22fbd43`; this workspace-cap delta included in the authorized commit; G0 open. |
| Rootless lab setup and resource controls | User-level Docker `29.9.2` (rootless, `overlayfs`, cgroup `systemd`); CPU throttle 20/21, memory OOM exit 137, PID fork denial at 16; SIGTERM-ignoring container exited 137 under `stop -t 1` with no heartbeat writes; 2 GiB ext4 workspace hit ENOSPC at 1.9 GiB; 64 MiB tmpfs cap; rootful default preserved | Lab host only; workspace mount preflight/log caps/boot persistence, final image pin, linger, port publishing, broker and production host unqualified. |
| Local Codex data-control check | Installed `codex-cli 0.163.0`; no settings/config command; `features list` lacks `include_environments`; user config has only UI/project/hook keys; local `config/read` reports `include_environment_context=true`; public harness source review found no account-control query | Local CLI and public source only; account training opt-out and Codex **Include environments** remain owner attestations; no login, auth-cache read or prompt call. |
| Secret scanner | Unavailable (`gitleaks`/`trufflehog` not on PATH) | No automated secret-scan pass claimed; code/release phase requirements must be resolved before its closure. |
| Reviewer deployment | `opencode debug agents` discovers `ishan-reviewer`; child session has only read/glob/grep and parallel wrapper; `package.json` read succeeded; shell tool absent and command not executed | Tool-availability smoke, not an observed permission-denial response or OS sandbox test. First G0 report is advisory; Ishan disposition pending. |
| Reviewer package checks (2026-10-22) | Loaded-profile last-match rule assertions: 16 synthetic allow/deny cases passed; inherited model confirmed; document validator: 251 links/seven sections/unique ADR IDs; seven-file whitespace and required report sections/SHA/pending disposition passed | Synthetic policy evaluation plus actual restricted-tool discovery, not adversarial sandbox qualification. No sensitive test inputs read; application/typecheck/coverage/audit N/A to agent/docs-only scope. |
| Human disposition update (2026-10-22) | Owner relayed Ishan's approval of the report for `fc0e05e`; provenance recorded; validator passed (251 links), eight-file whitespace/approval assertions and `git diff --check` passed; application/config/pin integrity unchanged | No direct signature claimed; R-001 open, no finding waiver or G0/P1/live-use approval implied. Earlier pending-disposition entries above describe the initial report run. |
| G0 remediation preparation (2026-10-22) | R-001 assertion first failed (exit 1), then passed after roadmap alignment to one hour; document validator exit 0 (253 links/seven sections/unique IDs); seven-file whitespace and account/disabled-provider/pending-phase assertions passed | Original approved report unchanged. Tier preference/data controls are owner-attested; no live qualification or application/host change. First T-01 slice and later proof ownership are proposed in closure packet; corrected artifact needs follow-up/human disposition. |
| T-01 scope approval record (2026-10-22) | Owner stated “T-01 approved”; document validator passed (254 links/seven sections/unique IDs), six-file whitespace and scope/authority assertions passed; `git diff --check` passed; code/config/pins/reports unchanged | Approval metadata only; earlier candidate/report snapshots preserved. G0 package acceptance and phase start remain separate; no application tests applicable or implementation performed. |
| G0 acceptance record (2026-10-23) | Owner stated “G0 accepted”; document validator exit 0 (254 links/seven sections/unique IDs), six-file whitespace/date/acceptance/authority assertions and `git diff --check` passed; code/config/pins/reports unchanged | G0 closed as design/feasibility gate. Existing linked heading retained after validator caught an anchor break. No application tests applicable, no P1 implementation or live/production qualification performed; later gates remain mandatory. |
