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

### 1. Phase Objective & Scope

**Current continuation — synthetic observer core:** owner “commit and continue”
commits the test contract as `75347b1` and approves its synthetic-only first slice.
Implement strict identity frames, kernel-snapshot consistency checks and independent
pidfd/cgroup observation classification in the research probe, with in-memory
stdlib self-tests. No native handler, process/cgroup access, real polling loop,
Docker dispatch or permission/authority change. Previous design/acquisition records
remain historical; unresolved provenance still prevents native qualification.

**Current continuation — observer test-contract design:** corrected acquisition
evidence committed as `53b2c93` under owner “commit and continue”. Prepare
`docs/p2-kernel-observer-test-contract.md` only; historical acquisition allowances
below are consumed. Define read-only worker identity/cgroup binding and retained-
handle observations without granting quiescence, new execution or runtime authority.
No implementation, container dispatch, process/cgroup inspection or phase change
is performed by this design slice.

**Current continuation — approved bounded observer:** after research commit
`bd17c45`, owner answered “continue” to the explicit one-owned-container/test-only
Python observer proposal. Approval covers existing synthetic launch/stop paths and
at most10 seconds of observation, not runtime authority changes. First establish
the identity/access prerequisite without dispatch: connect only the selected lab
Unix endpoint, inspect kernel peer credentials and that exact peer's proc namespace
handles. If acquisition is blocked, stop before spending the one lifecycle or
writing speculative polling/integration code. Earlier records remain historical.

**2026-10-28 continuation after `e48f31b`:** owner requested “continue” after the
explicit corrected-acquisition/additional-lifecycle proposal. Authorize at most
one additional existing synthetic lifecycle, not retries or authority changes.
At sync, `/tmp/opencode` is empty and the old private harness/logs are unavailable;
prior durable observer state and approved image exist, but the workspace is
unmounted. Reconstruct a new harness revision and independently validate it;
never present reconstruction as recovery of original bytes or old checks as fresh.
Existing approval permits remounting the same image; no formatting/permission
repair or ordinary-directory fallback. Stop on any unresolved prerequisite.

Owner requested “commit and continue”; IPC/owned worker committed as `3ed86ee`
on clean `feat/p2-isolated-runner`. Implement the first governed synthetic Docker
create→attach→start→proposal→stop path over existing inventory/preflight/protocol.
Qualify actual nonroot write/supervisor read and denied root/input writes on the
approved rootless lab. No SDK/provider, general execution service, CLI, package,
push, automatic action/task completion or G2 closure. Stopped-container metadata
alone will NOT record quiescence: leave inventory unresolved until independent
cleanup qualification/reconciliation is implemented.

**Continuation after `20442be`:** owner requested “commit and continue”. Extend
the existing owned access probe to qualify actual64 MiB tmpfs ENOSPC enforcement
on `/tmp` and `/dev/shm` under unchanged profile1. Test-only continuation within
offline P2, not a new runtime API/phase. No persistent-workspace fill, process
pressure, host-memory OOM, resource-profile change or cleanup-state transition.

**PID-cap continuation after `d68d832`:** owner again requested “commit and
continue”. Within unchanged offline profile1, qualify actual cgroup PID denial
using the existing owned access fixture. This continuation adds bounded in-domain
child processes only; prior tmpfs slice's no-process-pressure scope is historical.
No host process spawning by the probe, fork bomb, resource-limit increase,
persistent-disk fill, host OOM, SDK/provider or cleanup-state transition.

**Descendant-stop continuation after `b80b675`:** owner requested “commit and
continue”. Add one actual-domain regression for a trusted detached, SIGTERM-
ignoring descendant and bounded host-observed heartbeat shutdown. Test fixtures
only; no cleanup/reconciliation API, quiescence recording, reuse/reset permission,
SDK/provider, resource-profile or production change. This tests one known actor,
not absence of all escaped processes or full G2 qualification.

**Supervisor-crash continuation after `9f0849c`:** owner requested “commit and
continue”. Add one actual post-start supervisor-SIGKILL/reopen regression using
the existing bounded descendant fixture. Prove an active worker can outlive its
controller, inventory/action uncertainty survives reopen, and successor admission
remains fenced. Test-owned recovery cleanup independently proves identity before
stop and records unknown only. No supported recovery API/service, lease revival,
quiescence/reset/reuse/task completion, daemon restart, SDK/provider or G2 change.

**Approved stop-only recovery continuation:** owner explicitly approved the
proposed contract through the recovery-authority question. Implement one explicit
trusted-supervisor stop operation as the existing nonroot user; root means Loom
authority, never UID0. It may clean up unresolved already-bound domains after
kill/lease loss or missing launch files, without create/start/adoption/deletion,
extra budget, automatic startup work, quiescence/completion or reuse permission.

**Active-worker refusal continuation after `5b67c49`:** owner requested “commit
and continue”. Add actual active-worker coverage for temporary backend refusal
and foreign inspect replies through the existing private Unix fault proxy, then
explicit caller retry after restoring that same proxy. Test-only; no Docker daemon
restart/reconfiguration, alternate backend, retry scheduler, authority expansion,
new execution/adoption, budget draw, quiescence/reuse or production/provider change.

**Lost-stop-reply continuation after `0a37304`:** owner requested “commit and
continue”. Test an owned stop that executes on the actual backend but whose
successful acknowledgement is discarded by the private proxy. Recovery must
report uncertainty, not not-executed/successful task completion. Later explicit
inspection of the same bound ID may observe stopped without sending another
stop/create/start or drawing budget. Test-only; no daemon restart or authority,
profile/schema, automatic retry/reuse/quiescence or provider change.

### 2. Environment & Upstream State

Use installed Python3.15.2 stdlib (`json`, `datetime`, `select`, `unittest`), no
dependency install. Existing pinned kernel/Python semantics in research18 define
the synthetic poll-mask cases; this slice does not revalidate a live worker or
claim coverage of OS calls. Existing Bun1.4.4 portable baseline201 tests/2,957
assertions at95.88% functions/91.73% lines; compare freshly executed portable gates.

Contract baseline is the2026-10-28 recorded candidate-access success, not freshly
rerun native evidence. Installed Docker release inspect-PID provenance and exact
runtime cgroup binding remain open prerequisites; prior pinned kernel/Python
research describes handle semantics, not a completed worker identity protocol.
Reuse full `assertDomainContainer` (including restart/private namespace settings)
for future native snapshots rather than duplicating or weakening its checks.

Research baseline: recorded Linux7.2.8-9-omarchy, Python3.15.2, Bun1.4.4 and
rootless Docker29.9.2/API1.56. Prior readable handles belong to the RootlessKit
namespace keeper only, not a container init. Separate versioned source guarantees
from untested worker permissions, identity bridging and cgroup removal behavior.
Fresh read-only versions still match. Linux unix(7) SO_PEERCRED documents the
credentials at connect/listen/socketpair time, not proof that the peer is the
daemon or that inspect PID numbers share the controller namespace. Revalidate
the executable and namespace identity or fail blocked; never substitute keeper.
Fresh2026-10-28 versions remain unchanged. Revalidate native mount/backend/image;
temporary scanner is also absent and must be restored at its previously pinned
8.30.1 release/hashes outside Loom before document security gates can pass.

Baseline portable193 tests/2,880 assertions,99.47% functions/96.69% lines; full
plus mandatory physical preflight194 tests/2,901 assertions,100%/98.48%. Existing
ext42 GiB workspace is currently mounted rw/nosuid/nodev, rootless Docker29.9.2/
API1.56 and pinned Bun image remain selected. Namespace UID/GID65532 maps to
host165531 in the observed namespace; recheck actual maps before scoped ACL
provisioning. Official Engine1.56 create/attach/start/stop/inspect schemas rechecked:
nonrecursive bind options, memory+swap semantics, private cgroup namespace and
204/304 stop results. No runtime/package upgrade or ambient Docker client config.
Continuation baseline: native216 tests/3,276 assertions,100% functions/98.61%
lines; portable199/2,943,96.40%/91.76%; approved split gate passed at `20442be`.
Use installed Bun1.4.4/Node-compatible `statfsSync`, fixed1 MiB write chunks and
Linux tmpfs capacity/ENOSPC behavior; no dependency/API promotion.
PID continuation baseline: native216 tests/3,277 assertions,100%/98.61%; portable
199/2,943,96.40%/91.76%. Recheck selected image's fixed `/bin/sleep` via real owned
execution and Linux cgroup-v2 `pids.events`/EAGAIN behavior before claiming proof.
Descendant baseline: native216 tests/3,279 assertions,100%/98.61%; portable199/
2,943,96.40%/91.76%. Installed Bun subprocess type documents `detached:true` as
setsid/new session/process-group leader. Verify real session IDs in the fixed
image; Linux pid_namespaces(7) describes namespace-init termination killing its
remaining processes. No binary, dependency or kernel/daemon changes.
Crash baseline: native217 tests/3,300 assertions,100%/98.60%; portable199/2,943,
96.40%/91.76%. Reuse installed Bun subprocess owned-handle SIGKILL/exited semantics,
existing SQLite reopen getters/unknown observation and native Engine inspect/stop.
Revalidate ownership through generic physical preflight/image ID and existing
`assertDomainOwner`, not caller PID or worker text. No new dependency assumptions.
Recovery implementation baseline is `e112478`: native218 tests/3,319 assertions,
100% functions/98.59% lines; portable199/2,943 at96.40%/91.76%. Reuse pinned
Docker29.9.2/API1.56/image and installed native HTTP/store semantics. Revalidate
selected endpoint/engine/image independently of launch-only filesystem readiness.
Continuation baseline: native221 tests/3,454 assertions at100%/98.61%; portable201/
2,957 at95.88%/91.73%; approved empty-/tmp portable/preflight202/2,978. Same installed
Engine/Bun/image and existing HTTP503/ownership validation semantics, no dependency
or upstream API change. Transport refusal is not a real daemon-crash experiment.
Lost-reply baseline: native221/3,528 at100% functions/98.59% lines; portable201/
2,957 and empty-/tmp portable/preflight202/2,978. Existing selected Engine stop
204/304 and HTTP transport error semantics are exercised, not upgraded. Proxy
closes only its response connection after an actual successful stop acknowledgement.

### 3. Architecture & File Manifest

Add `research/pi/probes/p2-observer.py` with pure validation/classification helpers
and its own `--self-test` entry point, matching existing research-probe placement.
No-argument/other invocations return a safe native-unqualified classification and
exit2 without reading stdin or opening handles. Update this scope, the test-contract
status and ADR-028 staged-implementation evidence. No app/test-fixture/config/
export/schema/package/CI change; no general filesystem or native observer adapter.

This slice changes this active scope and adds one proposed test contract; append
the significant staged-verification decision to existing ADR-028. Proposed future
implementation belongs with existing research probes, not `src/`, SQLite, CLI,
package scripts or public exports. Native fixture transport remains host-only;
the module never receives DB write/stop authority or worker-selected cgroup paths.

Current acquisition slice touches `research/pi/18-p2-kernel-observer-readiness.md`,
`decisions.md` and this scope/evidence record. The temporary assert-based Python
prerequisite script/evidence stays private under `/tmp/opencode`; no application,
fixture/config/export/dependency change. Implement a persistent observer only
after prerequisite identity/access proof, within the approved one-container bound.
This continuation uses new private key `loom-observer-repeat-34scy6go` and durable
lab evidence key `observer-tools-2rju6xlt`. Keep new scripts/check manifests/results
in that new0700 durable evidence directory as well as temporary execution storage.
No new application/test/fixture/config/export/dependency integration is planned
before acquisition proof. Prior missing temporary artifacts remain unavailable.

`src/runner.ts` remains preflight/native HTTP owner; extend its bounded JSON
transport for fixed internal POSTs/empty204/304 replies, preserving GET behavior.
`src/runner-launch.ts` owns fixed create payload, inspect ownership/config checks,
and `runSyntheticDomain(db, context, launchInput, workspacePaths, policy)`.
Snapshot all caller inputs. Real effects use fresh Date.now gates, never a supplied
fixture clock. Preflight before admission; existing `admitDomain` atomically
applies policy/budget/audit/inventory. Deny/ask executes no POST. Duplicate domain
IDs reject, never resume/replay a start. Recheck deadline/live write gate directly
before create/start and the host start command; no network await inside SQLite.
Enforce the approved one-worker ceiling per authoritative store: atomically fence
all unresolved domains, including disjoint roots, before executable admission.
The generic metadata admission API remains unchanged; only the executable profile
has this stricter ceiling. Native overlapping launch attempts may admit only one.
The synthetic executable profile also requires an empty dedicated workspace both
before admission and immediately before start. Preserve/reject existing files;
never delete them to pass. This prevents ambient cwd config/preload input from
escaping the sealed-worker startup contract. General physical preflight remains
usable for inspecting nonempty evidence; only executable admission is stricter.
The initial executable profile accepts trusted root supervisor authority only;
reject grant authority before effects. Delegated launch needs a shared per-dispatch
grant/policy revalidation contract without a second budget draw, not duplicated
authorization logic in the launcher. Existing grant-aware metadata admission is
unchanged and is not permission to bypass this executable-profile restriction.

Create by stable `loom-<domainId>` name and labels binding domain/run/config hash.
Profile1: exact digest,65532:65532, explicit `/usr/local/bin/bun --no-env-file
/input/worker.ts`, `/workspace` cwd, explicit synthetic-only environment (no host
environment), read-only rootfs/input, nonrecursive private bind mounts and no extra
volumes/devices/privilege/ports. Network none, all capabilities dropped,
no-new-privileges, private PID/IPC/cgroup namespace,2 CPUs,4 GiB memory with no
swap,256 PIDs,64 MiB `/tmp` and `/dev/shm`, no Docker logs/restart/auto-removal.
No ambient daemon runtime selection: explicitly bind the installed selected `runc`
runtime (current default confirmed through native `/info`) and inspect it.
Persist exact64-hex created ID before start. Inspect exact ID/name/image/labels and
critical config before start. Foreign/corrupt ownership forbids stop; mismatched
security config blocks start but permits stopping only independently owned IDs.

Attach before start through native HTTP upgrade, no Docker CLI/config. Register
bounded parser before resuming output. Ready10 seconds from start dispatch (not
from a potentially delayed acknowledgment), absolute wall deadline,
100ms live kill/lease/deadline checks. Ready permits only the fixed host start
command after a fresh gate; candidate is proposal metadata only. A valid proposal
gets the cooperative IPC stop command and2-second grace. Failed/poisoned sessions
close immediately and use independently owned Docker SIGTERM/2-second/KILL cleanup;
5-second bounded inspect. Malformed/late/stderr output is withheld, fails safely
and requests cleanup. EOF requires parser.finish for a normal proposal; worker
failure/nonzero exit must not become success. Return only safe classified failure,
validated candidate metadata and stopped observation, never task completion.

Late create/start/stop/unknown facts remain recordable after kill. Transport/create
uncertainty, foreign collisions, daemon loss and unqualified cleanup remain unknown;
never invent not-created/not-executed or retry. Even normal observed stop appends
unknown/unqualified-cleanup, retaining workspace/reset fences and pending native
action. No automated audit finish, lease renewal or reset. Cleanup never deletes
containers/workspaces/evidence. Abrupt supervisor exit remains a recovery blocker
until a later owned reconciliation implementation is qualified.

`tests/runner-launch.test.ts`: fixed-payload/ownership/config and native Unix HTTP
negative checks. `tests/evals/runner-domain.ts`: explicitly selected actual lab
corpus, with durable synthetic DB/input evidence under an explicit operator-owned
`LOOM_LAB_STATE` directory and new dedicated run directories on the capped mount.
Only these new directories/files get named-user ACLs: mapped65532 gets read/execute
input and rwx workspace; ordinary group/other get none. Default workspace ACL gives
the supervisor read access; candidate mode must preserve that ACL's read mask.
No chown, root helper, UID0 or world-writable fallback. Existing image/data untouched.
An actual65532 candidate-write red reproduced supervisor EACCES:0600 zeroed the
named-user ACL's effective read mask. Synthetic candidate mode0640 preserves the
supervisor read mask while default ordinary-group/other ACL entries remain none;
no existing file ACL is widened or repaired and no recursive change is performed.
`tests/fixtures/runner-access-worker.ts` is an owned container-only access probe,
refusing any runtime UID/GID other than65532 before filesystem probes; emits only
the existing ready/proposal grammar and bounded synthetic candidate report.
Existing worker mode/fixtures updated only if a failing real access test requires it.
For the continuation, extend only `tests/fixtures/runner-access-worker.ts` and its
existing actual-domain assertion in `tests/evals/runner-domain.ts`. After current
identity/capability/cgroup checks and host start, validate each temp root is tmpfs
with64 MiB capacity; exclusively create one synthetic file there. At most65
one-MiB writes per mount using a single fixed buffer; require ENOSPC before any
successful write above64 MiB and record bounded capacity/written/denied facts in the existing
hash-bound candidate. No general probe API, arbitrary paths, raw exceptions,
extra IPC frames or host-side execution of absolute-path writes.
For PID continuation, reuse these same two fixture/assertion files. After existing
identity/cgroup/tmpfs checks and host start, read local `pids.events max`, attempt
at most256 fixed `/bin/sleep 30` children with no stdin/stdout/stderr pipes or
inherited environment, and require EAGAIN plus an increased local max event count.
Always SIGKILL only recorded owned child handles and await all their exit promises
before candidate output. Report bounded limit/started/denied/events-increased/
all-reaped facts; do not assume a fixed child count because threads count too.
The supervisor's existing deadline/owned-stop remains the failure backstop.
Capture each child's exit promise immediately after spawn, before saturation;
deferred exit observation reproduced failure before reaping at the PID ceiling.
Do not mask that failure with arbitrary sleeps, extra task headroom or a relaxed
profile. Exact Bun internal cause remains a hypothesis, not an upstream finding.
Add `tests/fixtures/runner-descendant-worker.ts`, a sealed self-contained trusted
fixture executed only as65532 real/effective UID/GID. Parent uses existing fixed
IPC grammar; after host start, spawns exactly one same-file child with detached
session, fixed args/env and ignored stdio. Both register SIGTERM handlers and
30-second timers. The child's live event loop bounds heartbeat lifetime; the
parent timer does not bound a blocked synchronous IPC read (host supervision
still owns that bound, and supervisor-crash recovery remains unqualified).
Child appends at most1,500 single-byte heartbeat ticks and
records numeric PID/parent/group/session facts. Parent verifies child readiness,
binds the reported PID to its own child handle, sends that handle one SIGTERM;
child appends a `T` marker and continues dot ticks, proving handler delivery and
continued work. Child installs that handler before publishing readiness. Parent
emits only a fixed candidate proposal, then ignores cooperative stop while alive.
No worker-supplied PID is used for host signals/authority. Startup failure is
owned-domain failure, not a reason to weaken the supervisor or adopt foreign state.

`tests/evals/runner-domain.ts` adds the real test using existing prepare/launch:
concurrently observe positive heartbeat growth before result, require forced-stop
failure with stopped=true/withheld candidate, verify detached numeric session
facts, then require unchanged heartbeat size over five100ms samples after stop.
Persist only bounded synthetic observation/hash facts privately if needed. All
domain inventory/action completion/reuse fences remain unchanged.
Add `tests/fixtures/runner-supervisor.ts`, a test-only native controller driver
reading one private synthetic launch envelope and opening the existing prepared
store, then invoking existing `runSyntheticDomain`; ignore stdio, no ambient env
or providers. `tests/evals/runner-domain.ts` writes that envelope mode0600, closes
its initial DB handle, launches the driver by owned process handle, observes real
heartbeat growth, SIGKILLs the driver, awaits its exit and reopens the same store.
Reuse the existing heartbeat observer as a shared two-caller test helper without
changing its bounded timeout/error behavior. Assert live growth continues after
the crash, exact durable container ID/pending action/budget1/unresolved fence.

Test-owned cleanup is a narrow local helper, not exported production recovery:
read durable domain, generic preflight selected image/mount/worker, exact native
inspect ownership check, append stop-requested, stop only that owned ID, inspect
again and append unknown/unqualified cleanup. No uncertain create/start retry,
foreign adoption, kill/reset or deletes. A finally path kills/awaits the test
controller and attempts this cleanup once if not already attempted; failed or
unprovable cleanup remains a named test failure, never silent best effort/reuse.

For approved implementation, `src/runner.ts` exposes module-internal
`preflightDomainBackend(endpoint)` returning validated imageId; full launch
preflight still validates all prior input/workspace requirements and errors.
`src/runner-launch.ts` adds `stopSyntheticDomain(db, {domainId, authority:{kind:
"root"}})` returning existing domain/stopped/failure result fields. Clone/strictly
validate input and reject delegated/extra authority before any effects; validate
durable inventory, reject resolved/missing/corrupt records. Unbound records remain
unknown with failure=unbound and no backend adoption/dispatch. Bound records get
fresh backend/image proof and share private owned-stop implementation with live
cleanup. Stop-requested persistence failure does not prevent proven-owned cleanup;
inventory failure is never success. Every normal result retains unknown inventory
and pending native action; failed final inventory writes throw a safe inventory
error after effects. No caller-supplied endpoint/container ID/config/clock.

Affected callers/tests: replace crash test's manual stop implementation with the
new stop interface (keep finally cleanup); keep existing launch fault corpus and
unit payload/ownership checks. `tests/runner.test.ts` covers backend validation
without launch paths, `tests/runner-launch.test.ts` authority/input/missing-record
rejection, and selected native eval covers intact/missing-path/kill/lease-loss,
foreign/unbound/backend-fault/idempotent-stop/inventory-write failures. No schema,
SDK/provider, dependency, public index or CLI export changes.
This continuation modifies only `tests/evals/runner-domain.ts` and documentation.
Extend the existing private backend fixture with a phase-local `setFault` and
an unavailable mode returning503 without forwarding requests. Existing ownership
mode changes only synthetic inspect response labels, never actual container config.
Extend the current crash/recovery scenario loop with backend-outage and foreign-
inspect cases after controller death. Real actor must keep advancing heartbeat
after refused recovery; failed result preserves original bound ID, unknown state,
pending action and successor fence. Assert no additional POST, raw sentinel body
exposure, start or budget draw. Explicitly restore the same proxy, then use the
existing recovery interface to stop the original domain; no new production helper.
For lost reply, add one phase-local stop-disconnect proxy mode and one scenario
to the same crash/recovery loop in `tests/evals/runner-domain.ts`; application and
actor fixtures stay unchanged. Forward the one owned native stop, consume204/304
then destroy the controller response instead of forwarding success. Require one
stop POST and cleanup failure/stopped=false/unknown inventory, while independent
read-only native state and five100ms heartbeat samples show this actor stopped.
Keep the response-loss mode armed across the later explicit recovery call: only
fresh GET inspection should be needed, no second stop/create/start. Persist bounded
uncertain-stop/post-delta/native-observation facts in existing private result data.

### 4. Test Plan & Coverage Matrix

Before implementation, deliberately inert classifier must fail a deterministic
synthetic acceptance check by inventing terminal/empty observations. Then test
strict UTF8/JSON/duplicate fields, exact identity fields/types/time/order/limits/
EOF/confirmation changes; proc identity/namespace/membership/restart consistency;
duplicate/missing/malformed populated data; pidfd IN/HUP versus ERR/NVAL; PRI|ERR
with fresh data versus missing/stale/error; independent terminal+populated/live+
empty facts. Native provenance, pipe deadlines, actual FD lifecycle and full OS
acquisition remain explicitly deferred, not synthetic-test passes.

Design-only checks: review contract against existing caller/config/cleanup code
and research, validate local links/anchors and seven active sections/unique ADRs,
scan changed documents with pinned Gitleaks and run `git diff --check`. Future
acceptance commands/cases in the contract are explicitly unexecuted. No new
application/coverage/physical test pass or implicit lifecycle authorization.

2026-10-28 reconstruction: first assert a deliberately wrong `FileSink.end(chunk)`
sender fails an echo check without containers; then prove corrected write/end
round-trip, Python candidate/peer/parser self-checks and strict harness typecheck.
Run daemon prerequisite fresh before spending the single additional lifecycle.
An input/permission/identity failure remains blocked, not passed. No automatic
retry, worker-pidfd/cgroup polling or application coverage claim from access-only.

Acquisition validation: deterministic synthetic peer-credential and identity-reject
assertions before the read-only native prerequisite; record the exact command and
classified failure if blocked. Document links, scope/protected-file, whitespace and
secret checks remain mandatory. No application/E2E/coverage claim from a blocked
prerequisite; previous221-test native results are historical. If prerequisites pass,
specify failing observer acceptance tests and exact ordered physical gates before
application/test integration, bounded to the approved existing-fixture lifecycle.

Acceptance reds precede application/effect logic. Unit/native: exact fixed payload,
foreign identity/config drift, bounded native POST/empty-response failures and safe
errors. Actual selected lab: normal native worker, UID/GID/candidate owner and
supervisor-read proof, denied root/input writes, stale/killed/deny/ask/budget paths,
duplicate non-replay, malformed/stderr/no-ready worker cleanup, absolute deadline,
kill/lease change and foreign name collision. Assert unresolved inventory/pending
audit after every unqualified stop, no successor reuse or reset. Preserve evidence
on failure. No actual over-limit/resource or escaped-descendant qualification claim
from inspect metadata or a successful smoke run; missing required lab is blocked.
Continuation acceptance: update the existing physical access test first and run
it red on missing tmpfs enforcement facts before changing the worker. Green must
show actual writes and ENOSPC on both fixed roots, matching candidate hash and
preserved unknown/pending inventory. Native UID/access/cgroup and protocol/fault
regressions remain mandatory. This adds temp-filesystem enforcement evidence only;
CPU/PID/memory/disk over-limit and descendant/crash proof remain open.
PID acceptance: add expected PID facts to the real access test first and reproduce
missing-facts red. Require positive started count below256, actual EAGAIN and
local cgroup max-event increase, all child exits awaited, existing candidate hash,
temp enforcement, unresolved inventory and pending native action intact. CPU/
memory/persistent-disk over-limit and independent descendants/crash proof stay open.
Descendant acceptance red first uses a deliberately inert same-path fixture:
real launch executes, but no advancing heartbeat is observed. After implementation,
assert detached session leader != parent session, initial heartbeat actually
advances, forced stop ends observed daemon process, heartbeat stays unchanged,
heartbeat contains `T.` (SIGTERM observed followed by continued writing),
native action pending and inventory unresolved. Host observation is independent
of worker stop ACK but supports only this known fixture, not general quiescence.
Crash acceptance red starts an inert driver first: missing live heartbeat must
fail before claiming a crash trajectory. Green requires driver signal exit137,
reopened durable identity, continued actor activity with running daemon state,
rejected successor admission and no extra budget draw, owned stop, five unchanged
100ms heartbeat samples, pending native action and unresolved inventory. Repeat
the physical crash case three times after full native coverage. No test passes
by driver natural completion, worker30-second timeout or marking quiescence.
Approved stop seam reds precede implementation. Exercise authority rejection first,
then actual crash recovery through `stopSyntheticDomain` with the existing manual
stop as temporary failure fallback until the interface works. Test path loss by
renaming only this new synthetic run's input/workspace directories to retained
names, not deleting data; cleanup must not require launch-file repair. Assert
fresh backend/image/foreign ownership failures never stop/adopt/create/start,
same stopped-domain reconciliation never draws budget or completes native action,
ignored stop/unknown event writes fail safely, and killed/stale leases still allow
only explicit cleanup. Repeat actual recovery corpus three times, no skipped gates.
Test-only tracer red: unavailable mode initially inert so the new active-refusal
assertion detects an incorrectly successful stop. Then implement503 rejection in
the fixture, not application code. Existing owned-stop behavior should require no
changes. Verify both refusal modes, live-after-failure proof, unchanged original ID,
no POST/budget/start on refusal, fenced successor/pending action, restored explicit
stop, idempotent repeat and bounded post-stop heartbeat. Repeat current corpus
three times; retain all earlier authority/admission/protocol/PID/temp/crash tests.
Lost-reply tracer red uses the new scenario before injecting disconnection, so an
unexpected successful recovery must fail. Green requires actual effect plus lost
reply, safe cleanup error, unchanged ID/action/budget/fence, no raw error exposure,
read-only later confirmation and unchanged post-stop heartbeat. Other live refusal
scenarios still require activity after failure; do not conflate missing reply with
an operation that never executed. Repeat the same recovery corpus three times.

### 5. Security, Observability & Edge Cases

Validation failures contain fixed safe codes only; no raw JSON/proc/exception text.
All results keep `quiescenceQualified:false`; no stopped/success/reuse authority.
Require explicit native-disabled default, tested without containers. Python bool
is not an integer identity; revalidation compares original timestamp text and all
identity fields, not truncated timestamp conversions. Kernel consistency checks
are not ownership/provenance proofs. No temp files, signals or runtime state needed.

Proposed experiment must keep identity admission separate from polling. Unknown
source provenance, changed/restarted identity, incorrect cgroup view or lost
handle means blocked/inconclusive. Model worker pidfd exit and fresh cgroup
populated observations independently, never as a cleanup/reuse permit. All waits,
including controller confirmation/pipe reads, require the same monotonic bound.

Reconstructed access script may read only the selected socket peer and one exact
ownership-checked PID candidate, bounded by2-second child timeout. Numeric PID
candidate access is not identity proof. No signals, namespace entry, proc scans,
permission changes or cgroup writes. Copy only newly generated synthetic scripts/
logs/manifests into new private durable evidence; no credentials/cache inspection.

Research has no runtime mutation authority. Proposal must fail inconclusively on
unbound/ambiguous identities, inaccessible handles, missing/stale cgroups or raced
observations. No observed-process signals, cgroup writes, credential inspection,
dependency installs, quiescence records, pending-action completion or fence release.
Native prerequisite may inspect kernel socket UID/PID credentials, not provider
credentials. Bound socket wait to2 seconds and host command to10 seconds; no HTTP
request is needed for peer acquisition. No host process scan, permission repair,
privilege escalation, daemon restart, PID guess or raw proc/exception persistence.

Never persist/forward raw attach/stderr/daemon body; no credentials or ambient
client context. Bound requests and output, validate final immutable config and
fresh authority, independently prove ownership before cleanup. Cancellation is not
remote rollback; unknown create/start stays fenced. Trusted host fixture/state
paths are canonical, operator-owned and private; ACL grants only the measured
mapped ID on newly created exact paths, never parent trees. Retain failures and
stopped containers; classify limitations honestly, especially no independent
quiescence proof, image vulnerability scan or provider/production support.
Temp probe attempt cap is130 MiB combined data plus one1 MiB reusable buffer;
successful expected writes are at most128 MiB across both fixed tmpfs mounts.
never allocate unbounded chunks, touch existing names, fill persistent data or
unlink old evidence. Wrong filesystem/capacity fails before any probe write.
PID attempts are capped at256 independently of enforcement; children only sleep
for30 seconds and never fork/write/read host inputs. Use fixed absolute executable
and empty environment. EAGAIN without this domain's counter increase is failure,
not proof (e.g. an ancestor/host limit). Never kill a numeric/worker-supplied PID.
Descendant probe spawns exactly one child inside the existing domain, no host
subprocess. Child30-second timer and1,500-byte heartbeat ceiling bound
failures; new dedicated workspace files only, exclusive creation/mode0640 for
inherited supervisor ACL. No symlink traversal, host path/credential inspection,
raw diagnostics, broad stop, removal or post-stop quiescence claims.
Crash driver receives only one private synthetic JSON file and selected fixed
module path; empty/minimal explicitly constructed environment, no credential/cache
inspection. SIGKILL targets only the owned driver handle. Container cleanup always
uses independent inspect ownership, never domain name alone or worker PID. Keep
failed evidence and unknown lifecycle facts; do not start a replacement worker.
Approved authority exception is cleanup-only: no live write gate/grant/policy
budget draw is required to stop an already-owned admitted domain after kill/expiry.
Selected rootless backend/image plus native ID/name/labels/image proof are still
mandatory before any stop. Missing launch paths cannot block that proof; unavailable
backend or unbound/foreign identity cannot be converted to not-executed/quiescent.
Preserve bounded safe errors and requests; never forward raw diagnostics.
Unavailable proxy mode withholds all native dispatch; restoring it in test finally
is scoped fixture repair, not daemon/network fallback. Restore before owned cleanup
even when assertions fail, so a synthetic fault cannot strand the test worker.
Never stop based on a refused/foreign reply. Existing actor lifetime/heartbeat caps,
private state/ACLs, no raw secrets and unknown/reset/reuse fences remain unchanged.
Lost-reply fault fires only after native204/304 for that known stop; never drop a
create/start reply or invent a stopped state. No untrusted PID signaling, name
adoption, alternate endpoint or native daemon action beyond existing owned stop.
Finally restores only private proxy mode before existing owned cleanup on failure.

### 6. Blast Radius & Rollback Plan

Synthetic module is research-only, not imported by application code. Rollback
removes only this new code/docs diff; preserve committed history and all private
lab evidence/containers unchanged. No native test or image/mount action authorized
or needed in this slice. No commit/push or phase closure inferred beyond the
already requested contract commit.

Design rollback is document-only. Preserve all committed/native/private evidence;
do not close/reopen prior handles, repeat lifecycles, alter runtime/test fixtures,
repair permissions or touch production/store/dependency/CI files. No push inferred.

2026-10-28: same approved image/mount restoration only. Preserve old evidence and
both prior stopped containers; never restart them. New lifecycle uses fresh state/
workspace and existing owned cleanup; retain its stopped container and uncertainty.
No additional lifecycle after this one, even on failure, without owner direction.

Acquisition rollback closes only observer-owned socket/FDs; preserve runtime/store/
schema/dependencies, lab evidence and historical reviews byte-for-byte. A blocked
prerequisite creates no container; no deployment, push, phase advancement, automatic
cleanup, permission or host/container state change. Retain the private probe/log.

Extend runner transport; add selected-backend supervisor/tests/owned access probe.
No migration, core authority rewrite, dependency or public CLI/facade change.
Lab effects are approved offline fixed-profile containers and narrow new directory
ACLs only. Keep created containers stopped and all synthetic state/evidence; no
automatic rm, broad cleanup, formatting or old-data ownership changes. On failure,
stop only proven-owned domains where possible, retain uncertain facts and block
reuse. Leave code uncommitted unless separately requested; no push/phase closure.
Continuation rollback is fixture/assertion-only; production supervisor/store/
profile/pins remain byte-identical to `20442be`. Retain dedicated input/workspace
evidence and stopped containers; temp files belong only to the container tmpfs.
PID continuation remains fixture/assertion-only over `d68d832`; no supervisor/
store/schema/profile changes. Ordinary child reaping is not independent runtime
quiescence qualification or permission to clear inventory fences/reuse state.
Descendant slice adds only fixture/physical assertions plus governance/contract
evidence over `b80b675`. Keep production code/profile/store/pins unchanged; rollback
is test-only. Preserve all stopped/created containers and old/new state/evidence.
Crash slice changes test driver/evaluation helper/assertions and documentation
only over `9f0849c`; production supervisor/store/schema/profile remain unchanged.
It documents the absence of automatic crash cleanup, not its implementation.
Approved implementation changes only responsible runner modules and their existing
tests/callers/docs. Rollback restores code, not inventory history; all domains stay
unknown/fenced until independent quiescence is qualified. No startup scheduler,
lease recovery, daemon change or automatic state repair. Preserve renamed synthetic
paths, private evidence and stopped/created containers; no broad cleanup.
Refusal continuation leaves every production module/profile/schema/dependency byte
identical to `5b67c49`; rollback is test/doc-only. Retain synthetic containers and
all fault/recovery inputs/results; no filesystem/data repair or deletion.
Lost-reply rollback is likewise test/doc-only against `0a37304`; preserve all
effects and evidence. Even confirmed stopped remains unknown/unqualified and all
reuse/reset/native-action fences survive; no production recovery code changes.

### 7. Definition of Done (DoD)

Synthetic red first, then ordered final checks: `bun run lint` → `bun run check` →
Python syntax compilation via `compile(..., 'exec')` without pycache →
`python3 -I -B research/pi/probes/p2-observer.py --self-test` → explicit native-
disabled CLI checks → `bun test --coverage` (portable only) → `bun run drill` →
`bun audit` → pinned scoped Gitleaks/document/protected-file checks and
`git diff --check`. Python style/source review and syntax/self-tests are separate
from Bun lint/typechecking; no Python static typechecker is installed/claimed.
Native full corpus and worker OS coverage are N/A by synthetic scope and remain
qualification blockers, not skipped passes. Retain command/exit logs durably.

Current design DoD: inspect full document diff; Python assertions for local
Markdown links/anchors, seven active sections/unique ADRs and protected-file
identity; pinned `gitleaks stdin --no-banner --redact --log-level error` per changed
document; `git diff --check`. Record actual results below. Future observer commands
are proposed only and cannot satisfy this slice's or any later code/physical gates.

For the reconstructed revision run, in order: private sender red → corrected
sender/Python self-checks → strict harness typecheck matching repository options →
`python3 -I -B <new-private-root>/peer.py` → with explicit selected lab paths and
fresh0700 state/TMPDIR, `bun run <new-private-root>/lifecycle.ts` once → exact-ID
ownership-checked stopped-state GET → scoped document/secret/protected-file checks.
Retain actual commands/exits/hashes and logs durably. Document-only repository
changes require no new full application/physical corpus, coverage or package audit;
native acquisition itself must still be recorded honestly as failed/blocked if so.

Current prerequisite DoD: `python3 <private-probe> --self-test` then
`python3 <private-probe>` under the host10-second tool timeout. Record each exit and
safe categorical facts, retaining any blocked gate as blocked rather than pass.
Validate local Markdown links/seven active sections/protected files with Python
assertions; pinned `gitleaks stdin --no-banner --redact --log-level error` on changed
documents; `git diff --check`. If blocked, report next owner and do not implement
speculative polling or claim application/physical qualification.

**One-lifecycle acquisition command:** after the daemon prerequisite passes, run
`bun run /tmp/opencode/loom-observer-prerequisite-TPvFnrtG/lifecycle.ts` with fresh
private `LOOM_LAB_STATE`/`TMPDIR` and the selected existing endpoint/mount/image.
The private harness loads a byte-sliced snapshot of the existing `prepare` and
heartbeat helpers (asserting exact boundaries, no test registrations), passes the
existing descendant worker explicitly and calls existing `runSyntheticDomain`.
After positive heartbeat and durable ID, fresh backend image/`assertDomainOwner`
checks precede passing one strict ID/PID envelope to the private Python access
probe. No daemon-wide listing/host PID scan. Candidate proc namespace access is
only a prerequisite, not yet a trusted worker identity or a cleanup observation.
On access failure stop acquisition; await existing launcher's owned cleanup even
when probe/assertions fail, with explicit owned-stop recovery if launch fails.
Assert pending action/budget1/unresolved successor/reset fences and retain result.
The observer does not signal anything, and the one lifecycle is not repeated.
No persistent observer code or mandatory application gates are claimed when this
temporary native acquisition experiment is blocked before integration.

Fresh baseline and deterministic reds first. Ordered final gates: `bun run lint`
→ `bun run check` → `bun test --coverage` → with explicit approved lab paths and
`LOOM_LAB_STATE`, `bun test --coverage tests ./tests/evals/runner-preflight.ts
./tests/evals/runner-domain.ts` using fresh private native state/TMPDIR → focused
launcher corpus three times → initially empty `/tmp` portable/read-only preflight
coverage under Bubblewrap → `bun run drill` → `bun audit` → verified
scoped Gitleaks/document/protected-file/DDL/historical checks and `git diff --check`.
Compare both coverage baselines, preserving all mandatory tests. Record every
unavailable/failing check, actual effect/ACL command, retained evidence and limits.
No synthetic/native mock counts as actual container/access/cleanup proof.
For tmpfs continuation, run the focused actual-access red first, then use the same
ordered commands below with fresh roots. Compare against the continuation baseline
and keep all existing assertions. Finish scoped secret/document/protected-file
checks and record the added temp-write effects; no further commit implied.
PID continuation uses the same focused actual-access red/green then full ordered
split-gate commands, with fresh private roots and the above baseline. Preserve all
existing tests/coverage; record bounded child effects and native labeled-container
snapshot. This instruction does not authorize committing the subsequent slice.
For this PID continuation, additionally run `bun test ./tests/evals/runner-domain.ts
-t 'actual nonroot access probe'` three times immediately after native full coverage
to exercise instrumentation-free saturation/reaping repeatedly.
For descendant continuation, focused red/green is `bun test ./tests/evals/runner-domain.ts
-t 'detached descendant'`. Run it three times after the native full corpus in
addition to the declared ordered split gates; PID/transport regressions remain
in full coverage. Record initial heartbeat growth and bounded post-stop samples,
fresh roots/coverage delta, security checks and labeled-container snapshot.
For crash continuation, red/green is `bun test ./tests/evals/runner-domain.ts
-t 'supervisor crash'`; repeat that command three times after full native coverage
then continue existing transport/empty-/tmp/drill/audit/security gates. Compare
217-test baseline and unchanged production coverage; record all retained effects
and exact private command/exit evidence. No subsequent commit/push inferred.
For approved recovery implementation use the existing exact ordered split-gate
commands with fresh private roots, comparing against218 native baseline. Add three
`bun test ./tests/evals/runner-domain.ts -t 'explicit stop-only recovery|supervisor crash'`
repetitions after native full coverage. Unit/backend/authority reds first; restart
lint→strict check→portable/native coverage after corrections, then focused launcher
three times→empty-/tmp portable/preflight→drill→audit→pinned secrets/docs/protected
DDL/history/whitespace checks and native labeled snapshot. Record all limitations;
no code commit/push or G2 closure inferred from approval.
For active-refusal continuation run the current actual recovery test red/green,
then the same exact ordered split gates with fresh private roots and three
`'explicit stop-only recovery|supervisor crash'` repetitions. Compare221-test
baseline and unchanged production coverage; record refused-call POST counts,
continued heartbeat, final labeled state and all scoped security/doc checks.
For lost reply use the same focused `'supervisor crash'` red/green followed by the
same exact ordered split gates/recovery repetitions with fresh roots; compare the
221-test/3,528-assertion baseline and unchanged production coverage. Record actual
stop POST versus lost acknowledgement distinctly. No further commit/push inferred.

**Owner-approved split gate (2026-10-26):** owner explicitly approved replacing
the combined Bubblewrap physical-domain gate after reviewing its lost UID mapping
and the reduced claim. Keep the historical failed run below; it did not pass.
Native physical tests preserve host IDs and use fresh private state/TMPDIR, not
an isolated controller filesystem or literal empty host `/tmp`. No runtime identity
check is weakened. This test-strategy approval is not G2/production approval.
Exact commands, in order (fresh roots created only for this invocation):

```bash
export LOOM_LAB_ENDPOINT="unix:///run/user/$UID/docker.sock"
export LOOM_LAB_MOUNT="/run/media/$USER/loom-workspace"
export LOOM_LAB_IMAGE="$HOME/.local/share/loom-lab/workspace-2g.img"
export LOOM_LAB_STATE="$(mktemp -d "$HOME/.local/share/loom-lab/gate-XXXXXX")"
export TMPDIR="$(mktemp -d /tmp/opencode/loom-gate-XXXXXX)"
bun run lint
bun run check
bun test --coverage
bun test --coverage tests ./tests/evals/runner-preflight.ts ./tests/evals/runner-domain.ts
bun test tests/runner-launch.test.ts tests/runner.test.ts
bun test tests/runner-launch.test.ts tests/runner.test.ts
bun test tests/runner-launch.test.ts tests/runner.test.ts
env -u TMPDIR bwrap --ro-bind / / --bind "$LOOM_LAB_MOUNT" "$LOOM_LAB_MOUNT" --tmpfs /tmp --dev-bind /dev /dev --proc /proc bun test --coverage tests ./tests/evals/runner-preflight.ts
bun run drill
bun audit
```

Verify both fresh roots are operator-owned mode0700, canonical and initially empty
before starting; retain state and failed evidence. Then pinned scoped Gitleaks,
document/protected-file/history/DDL checks, labeled native container-state snapshot
and `git diff --check`. No mount/image/old evidence mutation or broad cleanup.

#### Bootstrap verification record — 2026-10-26 (closure blocked)

Latest ordered lint37 files/strict typecheck passed. Portable coverage passed199
tests/2,943 assertions,96.40% functions/91.76% lines; this excludes actual launch
execution and is not the physical-phase coverage pass. Mandatory native full+lab
coverage passed216 tests/3,276 assertions,100% functions/98.61% lines against
100%/98.48% baseline; launcher100%/99.38%, with only defensive non101-upgrade
handling uncovered. Existing core module coverage is unchanged. Focused
`bun test tests/runner-launch.test.ts tests/runner.test.ts` passed14 tests/131
assertions three times. Bubblewrap initially-empty `/tmp` portable+read-only
preflight coverage passed200 tests/2,964 assertions,97.16%/93.76%.

**Required combined namespace gate FAILED, not waived:** `bwrap --ro-bind / /
--bind "$LOOM_LAB_MOUNT" "$LOOM_LAB_MOUNT" --bind "$LOOM_LAB_STATE"
"$LOOM_LAB_STATE" --tmpfs /tmp --dev-bind /dev /dev --proc /proc bun test
--coverage tests ./tests/evals/runner-preflight.ts ./tests/evals/runner-domain.ts`
exited1:200 pass/16 fail/2,980 assertions. Bubblewrap maps only controller1000;
the rootless daemon subordinate mapping reads `1 4294967295 65536` instead of
native `1 100000 65536`. Actual-domain setup correctly refuses the mismatched
identity before ACL provisioning or dispatch. Raw failure evidence is retained
privately outside the repository. Linux user_namespaces(7) documents reader-relative
maps/unmapped IDs; this is confirmed namespace semantics, not a new upstream bug.
No identity relaxation, privileged/helper fallback or dependency installation.

Native-host fresh private evidence-root/TMPDIR execution may provide supporting
evidence only; it cannot replace the failed isolation gate without reviewed
test-strategy disposition. Implementing developer owns remaining checks/evidence;
owner disposition is required before replacing this required gate. No phase
closure, commit, independent approval or G2 qualification follows from smoke tests.

Remaining local checks completed without changing application/test code:
`bun run drill` exit0 (`automated-fixture-only`, `verifiedTaskCompletion:false`);
`bun audit` exit0,14 packages/no reported vulnerabilities, no auto-fix. Verified
Gitleaks8.30.1 release/checksums SHA256 and executable byte-match against its
archive; all11 changed/new task files pass redacted stdin scans. Document check
passes31 local links/anchors across the three changed documents, seven active
sections, unique ADRs and canonical casing. Protected store (including all v1–v6
DDL), protocol, exports, dependency/lock files, CI and roadmap are unchanged.
Historical T-07 review SHA256 remains
`ceca07bed47c1e39bb80b01c064a508387acbbd713517bf7ca36d54a92d532fa`.
`git diff --check` passes. Full application diff inspected; no new dependency,
schema, public export/CLI, provider or completion behavior introduced.

Read-only native `GET /v1.56/containers/json?all=true&filters=...` restricted to
label `loom.domain` found132 retained containers:87 exited,45 created,0 running.
This is a labeled daemon snapshot, not proof about unlabeled processes/descendants
or independent cleanup. No container/files/image/mount/evidence deletion or
permission repair performed. Private lab DB/input/fault evidence remains under
the approved lab evidence root and run directories on the capped workspace.

Fresh native-host TMPDIR/evidence-root support run was not performed: it cannot
resolve the required namespace blocker and is not an approved replacement.
Image security scan, actual over-limit/escaped-descendant and supervisor-crash/
daemon-loss reconciliation proof, remote CI and independent human review remain
unqualified. Bootstrap diff remains uncommitted on `feat/p2-isolated-runner` over
`3ed86ee`; no push, production effect, SDK install or G2 advancement. Next owner
action: disposition a UID-preserving replacement for the failed namespace gate
before affected verification closure; do not weaken runtime identity assertions.

**Commit authorization:** owner subsequently requested “commit”. Commit this
bootstrap/evidence slice with the failed required namespace gate explicitly open;
the earlier uncommitted status describes the pre-authorization artifact. Commit
does not waive that gate, establish release readiness, authorize push or close G2.

#### Post-commit namespace investigation — 2026-10-26

Owner requested continuation after bootstrap commit `8befd5a`; clean branch
confirmed. Read-only investigation only, no application/test or phase change.
Minimal deterministic probe reads the current rootless child PID from its selected
runtime file and compares native `/proc/<pid>/uid_map` against the same read under
`bwrap --ro-bind / / --proc /proc cat /proc/<pid>/uid_map`: native subordinate row
`1 100000 65536`, Bubblewrap `1 4294967295 65536`; assertion fails as intended.

Installed Bubblewrap0.13.1 is non-setuid and has no file capabilities. Matching
upstream tag source `bubblewrap.c` lines2971–2973 automatically enables a user
namespace for nonroot callers without `--userns`; lines3099–3105 attempt `setns`
for an explicit namespace. A temporary read-only host namespace FD passed through
`bwrap --userns <fd> --ro-bind / / --proc /proc cat /proc/self/uid_map` exits1:
joining the specified user namespace failed. `unshare --mount -- true` exits1,
Operation not permitted. No daemon namespace entry, root execution, UID/GID map
write, helper install, service/daemon change or container dispatch attempted.
Upstream source: https://github.com/containers/bubblewrap/blob/v0.13.1/bubblewrap.c.
Targeted upstream issue search returned no results; deduplication is incomplete,
and these documented privilege semantics are not asserted to be an upstream bug.

**Proposed disposition, NOT approved:** retain the passing portable/read-only
preflight empty-/tmp check; pair it with the full physical corpus on the native
host using fresh private state/TMPDIR. This preserves physical UID/access checks
but does not prove controller filesystem isolation or literal empty host `/tmp`.
Adoption requires explicit owner approval of that reduced verification claim and
updated exact DoD commands before execution as a replacement. Otherwise keep the
combined namespace gate blocked pending an approved UID-preserving lab setup.
No supporting physical rerun is needed to establish the namespace limitation.

**Disposition:** owner subsequently replied “Approved” to the split replacement
gate and its explicit missing controller-isolation claim. The DoD above supersedes
the proposed/unapproved status for future verification only; historical failures
and the reduced evidence scope remain recorded. Execute the revised checks before
claiming this bootstrap's local verification gate is satisfied.

#### Approved split-gate execution — 2026-10-26 (local verification passed)

Executed the revised DoD against unchanged bootstrap code at `8befd5a`, with only
SPEC/ADR/contract documentation modified. Fresh state root key `gate-8rr2dzn7`
under the existing private lab parent and TMPDIR key `loom-gate-a8yt0phe` under
`/tmp/opencode` were canonical, operator-owned0700 and empty before the run.
Private step logs and a command/exit manifest remain in that TMPDIR; durable
synthetic input/SQLite/fault evidence remains in the state root. No old evidence
or existing image/mount was deleted, reformatted or re-permissioned.

All execution commands exited0, in declared order:

- `bun run lint`:37 files, no fixes; `bun run check`: strict typecheck pass.
- `bun test --coverage`:199 tests/2,943 assertions,96.40% functions/91.76% lines.
  Portable aggregate is unchanged, not a physical execution coverage claim.
- Native full+preflight+domain coverage with fresh state/TMPDIR:216 tests/3,276
  assertions,100% functions/98.61% lines; launcher100%/99.38%. Matches the last
  native run and exceeds pre-bootstrap aggregate100%/98.48%; existing module
  coverage unchanged. Defensive non101-upgrade handling remains uncovered.
- Focused launcher/transport corpus:14 tests/131 assertions on each of three runs.
- Bubblewrap portable/read-only preflight with initially-empty `/tmp`:200 tests/
  2,964 assertions,97.16% functions/93.76% lines. No actual-domain test runs inside
  this controller-only user namespace; physical checks run natively above.
- `bun run drill`: automated synthetic fixture only, task completion false.
- `bun audit`:14 packages, no reported vulnerabilities; no auto-fix/upgrade.

Final scoped security/document checks pass: pinned Gitleaks8.30.1 archive and
checksums SHA256 plus executable byte-match verified; all11 bootstrap task files
scanned at current bytes. Three changed documents pass31 local links/anchors,
seven active sections, unique ADR/canonical casing and `git diff --check`.
Code/tests, store/all DDL, protocol/exports, dependencies/lock, CI, roadmap and
historical T-07 review identity are unchanged from the committed bootstrap.

Post-run read-only `loom.domain`-label-filtered daemon snapshot:160 retained
containers,105 exited/55 created/0 running. The additional28 synthetic containers
and their new run directories/evidence are retained. This is not independent
descendant quiescence; all inventory cleanup uncertainty/reuse fences stay intact.

Owner-approved replacement resolves the bootstrap test-strategy blocker only.
Historical combined namespace failure remains failed evidence. No controller
filesystem-isolation/literal empty host `/tmp`, image vulnerability, over-limit,
escaped-descendant, crash/reconciliation, remote CI or human-review qualification
is claimed. G2 remains open; no SDK/provider, production, push, phase advancement
or new commit authorized by this test-strategy approval.

**Subsequent owner instruction:** “commit and continue” explicitly authorizes
committing the split-gate disposition/evidence documentation. Continue bounded
offline P2 work only; no push, G2 closure or additional production authority.

#### Bounded tmpfs continuation evidence — 2026-10-26

Split-gate documentation committed as `20442be`; subsequent changes are the
access fixture, its existing physical assertion and governance/contract docs only.
Acceptance red: focused actual access command failed on missing `tmpfs` facts
with the original worker, not setup/import. After the fixture change, focused
actual access passes1 test/8 assertions: both roots accept64 MiB then ENOSPC;
candidate SHA256 matches and action remains pending/inventory unresolved.

Fresh ordered DoD run uses private initially-empty0700 state key `gate-wbw0js50`
and log/TMPDIR key `loom-gate-pa0qhgu0`; command/exit manifest retained privately.
Lint37 files and strict typecheck exit0. Portable199 tests/2,943 assertions,
96.40% functions/91.76% lines; native216 tests/3,277 assertions,100%/98.61%,
launcher100%/99.38%; unchanged coverage against `20442be` across existing modules.
Focused14 tests/131 assertions pass three times; empty-/tmp portable/read-only
preflight200 tests/2,964 assertions,97.16%/93.76%. Drill remains automated synthetic
with task completion false; audit14 packages/no reported vulnerabilities. All
execution commands exit0; no test skipped, profile or supervisor logic changed.

Effects: red/green plus full native run add30 retained synthetic containers.
Labeled read-only snapshot190 total,125 exited/65 created/0 running. Successful
probe runs write128 MiB total to container-only tmpfs, never fill the persistent
workspace; bounded candidate/evidence remains there normally. Keep all prior
state/files/containers and scoped new-directory ACLs; no cleanup/reuse assertion.
Memory/CPU/PID/persistent-disk enforcement, independent descendant cleanup,
supervisor-crash/daemon-loss reconciliation, image security, remote CI/human review
and G2 remain open. New test/fixture slice is uncommitted; no push/SDK/provider or
production effect enabled.

Final five-file pinned Gitleaks8.30.1 scan passes after archive/checksum/executable
identity verification. Document checks pass31 local links/anchors, seven active
sections, unique ADRs/canonical casing and `git diff --check`. Production source,
store/all DDL/profile, dependencies/lock/CI/roadmap and historical review hash are
unchanged. Full task diff inspected; no unintended logging, cleanup or exports.

**Subsequent owner instruction:** “commit and continue” authorizes committing
the verified bounded tmpfs fixture/assertion/evidence slice, then continuing
offline P2 qualification. No push, G2 closure or production/provider authority.

#### Bounded PID-cap continuation evidence — 2026-10-26

Tmpfs slice committed as `d68d832`; production code/profile remain unchanged.
Focused actual-access red first reproduced absent PID facts. Initial new fixture
then exposed failure at saturation before deferred child-exit waiting completed:
protocol/unresolved-cleanup, with only synthetic stage diagnostics retained in
new private evidence. Capturing each child's exit promise at spawn instead of
first accessing it after saturation resolves the tested trajectory without
arbitrary waits or extra task headroom. Exact Bun internal cause remains a
hypothesis; matching source URLs returned404 and issue search had no result
(incomplete upstream deduplication). No new upstream bug is asserted. All tagged
debug instrumentation removed from task code; failed evidence remains preserved.

Three instrumentation-free focused physical repetitions passed before final
gates. Ordered final run uses canonical initially-empty0700 state key
`gate-4y69hyyn` and log/TMPDIR key `loom-gate-h_8hgsh3`, with private command/exit
manifest retained. All13 execution commands exit0: lint37 files; strict check;
portable199 tests/2,943 assertions at96.40%/91.76%; native216 tests/3,279 assertions
at100%/98.61%, launcher100%/99.38%; three additional actual-access repetitions
1 test/10 assertions each; three focused launcher/transport runs14/131 each;
empty-/tmp portable/preflight200/2,964 at97.16%/93.76%; automated synthetic drill
with task completion false; audit14 packages/no reported vulnerabilities.
Coverage across existing modules is unchanged against `d68d832`. Candidate hash,
actual tmpfs ENOSPC, nonroot/access/cgroup facts, pending action and unresolved
inventory all remain asserted; no skipped tests or relaxed PID/config guards.

Native labeled snapshot229 containers,154 exited/75 created/0 running:39 new
synthetic containers since the prior190-container snapshot, all retained. Probe
spawns at most256 sleeping children per run; on success observed EAGAIN and
increased own max-event counter, killed recorded handles and awaited exits before
candidate output. This is not independent domain quiescence or a general runtime
exhaustion-resilience guarantee. Preserve prior failed/created/exited state and
new workspace/input/DB evidence; no image/mount/old data deletion or permission
repair. CPU/memory/persistent-disk enforcement, escaped descendants/crash recovery,
image security/remote CI/human review and G2 remain open. Subsequent five-file
fixture/assertion/governance slice stays uncommitted; no push/SDK/provider effects.

Final security/document/protected-file checks exit0: pinned scanner archive and
checksums hashes/executable byte-match verified, five task files pass Gitleaks;
31 local links/anchors, seven active sections, unique ADR/canonical casing and
`git diff --check` pass. Production source/store/all DDL/profile/dependencies/CI/
roadmap and prior review identity unchanged; full task diff inspected and debug
markers absent from fixture/test code. No new logs/exports or safety-test removal.

**Subsequent owner instruction:** “commit and continue” authorizes committing
the verified bounded PID-cap fixture/assertion/evidence slice and continuing
offline P2 qualification only. No push, G2 closure or production/provider authority.

#### Detached-descendant continuation evidence — 2026-10-26

PID-cap slice committed as `b80b675`. New fixture/physical assertion changes only;
production supervisor, protocol, profile, store and dependencies unchanged.
Acceptance red with the inert same-path fixture executed the actual domain and
failed on absent advancing heartbeat (1 test/3 assertions), not an import/setup
error. Implemented fixture green first passed20 assertions, then strengthened
with actual child-handle SIGTERM delivery/`T.` evidence to21 assertions. Real
child PID/group/session identity binds detached behavior, and child readiness is
published only after its marker handler is registered. No raw diagnostic capture,
host PID guessing, weakened timeout/config checks or quiescence record introduced.

Fresh final state key `gate-piz5rt0w` and log/TMPDIR key `loom-gate-ve13019k`
were canonical/private0700 and initially empty. Private command/exit manifest and
step logs retained. All13 execution commands exited0: lint38 files, strict check;
portable199 tests/2,943 assertions at96.40% functions/91.76% lines; native217
tests/3,300 assertions at100%/98.60%, launcher100%/99.38%; descendant1 test/21
assertions three further runs; launcher/transport14/131 three runs; empty-/tmp
portable/read-only preflight200/2,964 at97.16%/93.76%; automated synthetic drill
with task completion false;14-package audit/no reported vulnerabilities.

Coverage comparison is scoped, not an aggregate non-regression claim: native
aggregate lines98.60% versus98.61% baseline, functions unchanged100%. Production
module coverage is byte-for-byte unchanged in the reports; the new physical-test
observer adds two uncovered harness lines: unexpected non-ENOENT filesystem error
rethrow and no-growth timeout return (the latter exercised by the acceptance red,
not the final green run). No runtime/safety coverage removed or guards weakened.
Do not manufacture error injection or exclude the test file just to raise its
test-harness aggregate. Unexpected host-filesystem error injection is not claimed.

Read-only labeled snapshot264 containers,179 exited/85 created/0 running:35 new
synthetic containers since229, all preserved along with new private DB/input/run
evidence and bounded `descendant-result.json` host observations. Successful cases
show initial heartbeat growth, delivered SIGTERM followed by more work, forced
daemon stop and five unchanged100ms samples. That supports this actor only, not
general absence of writers, independent domain quiescence, successor reuse or
task completion. Parent blocking IPC still requires supervision; crash/daemon-loss
reconciliation, CPU/memory/persistent-disk enforcement, image security, remote CI,
human review and G2 remain open. This five-file continuation remains uncommitted;
no push, SDK/provider/production effects or history-engine work started.

Final pinned Gitleaks8.30.1 checks pass all five task files after release archive/
checksums/executable identity verification. Document validation passes31 local
links/anchors, seven active sections, unique ADRs/canonical casing and whitespace.
Production/store/all DDL/profile/access fixture/dependencies/CI/roadmap and prior
review identity remain unchanged; full fixture/assertion/governance diff inspected.
No accidental logs, temporary debug code, exports or test exclusions introduced.

**Subsequent owner instruction:** “commit and continue” authorizes committing
the verified detached-descendant fixture/assertion/evidence slice, then bounded
offline P2 continuation. No push, G2 closure or new production/provider authority.

#### Supervisor-crash continuation evidence — 2026-10-26

Detached-stop slice committed as `9f0849c`. Test-only native driver, shared bounded
heartbeat observer and actual crash/reopen/owned-stop assertions added; production
runtime/store/profile and prior actor fixtures unchanged. Acceptance red ran an
inert driver and failed on absent live heartbeat (1 test/3 assertions), not an
import/setup failure. Real driver green passes1 test/19 assertions: controller
exit137, durable started/container identity after reopen, pending action/budget1,
rejected successor, continued actor writes/running daemon state after crash, then
owned stop and five unchanged100ms host samples without clearing uncertainty.

Fresh final state key `gate-zu04w91z` and log/TMPDIR key `loom-gate-jgol4zfi` were
canonical/private0700 and initially empty; private command/exit manifest and all
step logs retained. All13 execution commands exit0: lint39 files; strict check;
portable199 tests/2,943 assertions,96.40% functions/91.76% lines; native218 tests/
3,319 assertions,100%/98.59%, launcher100%/99.38%; crash1/19 three further runs;
launcher/transport14/131 three runs; empty-/tmp portable/read-only preflight200/
2,964 at97.16%/93.76%; automated synthetic drill/task completion false; audit14
packages/no reported vulnerabilities. No test skipped or safety guard relaxed.

Coverage comparison: production-module coverage unchanged against `9f0849c`;
native aggregate98.59% versus98.60%, functions100% unchanged. Added observer/
cleanup harness error/missing-identity/unresolved branches are not all exercised
in the final success run; initial red exercised no-heartbeat/no-domain handling.
This is not an aggregate non-regression or complete harness-fault coverage claim.
No coverage exclusion or removed defensive check hides the difference.

Labeled daemon snapshot298 containers,203 exited/95 created/0 running,34 new
synthetic containers since264. Five owned controller handles were SIGKILLed and
awaited across initial green/full/repeats; inert red driver exited without launch.
All container/input/workspace/SQLite/private crash-result evidence retained; no
daemon restart, image/mount/old data deletion or permission repair. Existing and
new unknown inventory/action fences remain in place; no replacement dispatched.

**Confirmed operational limitation:** controller crash can leave this worker
running. The successful test-owned stop is explicit independent cleanup, not a
production reconciliation implementation or supported automatic recovery. Crash
windows before ID persistence, daemon loss, arbitrary descendant quiescence,
CPU/memory/persistent-disk enforcement, image security, remote CI/human review
and G2 remain open. Current five-file continuation stays uncommitted; no push,
SDK/provider/production authority or separate history-engine work enabled.

Final five-file Gitleaks8.30.1 scan passes after pinned archive/checksums/executable
verification. Document checks pass31 local links/anchors, seven active sections,
unique ADRs/canonical casing and `git diff --check`. Production source/store/all
DDL/profile/prior actor fixtures/dependencies/CI/roadmap and historical review
identity unchanged. Full task diff inspected: bounded synthetic envelope/results,
ignored driver stdio, no accidental raw logging/exports or safety-test exclusions.

**Subsequent owner instruction:** “commit and continue” authorizes committing
the verified supervisor-crash fixture/assertion/evidence slice and investigating
the next bounded offline P2 recovery seam. No push, G2 closure, automatic cleanup
authority or production/provider effects inferred from the evidence commit.

#### Next recovery seam proposal — approval pending

Crash/reopen slice committed as `e112478`; clean branch confirmed before this
read-only design continuation. Existing `preflightDomain` combines worker/path/
workspace launch prerequisites with endpoint/engine/image checks. Requiring that
whole launch check to stop an admitted owned domain would block cleanup when old
launch files or mounts are unavailable. `recordDomainObservation` already permits
trusted late facts after kill/lease loss; it does not itself authorize a Docker
dispatch. Research `research/pi/16-p0-crash-recovery.md` distinguishes controller
death, identity-bound cleanup and qualified reuse; its old Bubblewrap/pidfd probes
do not certify this Docker implementation. No dependency or runtime change follows.

**Proposed material contract, not implemented:** explicit trusted-supervisor
`authority.kind=root` stop-only recovery under the existing nonroot operator UID
(never Linux UID0/sudo). Permit cleanup after kill/lease loss without another
budget draw. Accept only a validated unresolved domain with durable native ID;
unbound/foreign/corrupt/unsupported identities stay unresolved with no adoption
or name-based search/start. Independently validate selected Unix backend, pinned
image and exact native ID/name/labels/image before stop, even if old worker files/
workspace mounts are missing. Stop/inspect then record unknown only; pending
action and all workspace/reset/reuse fences remain. No create/start/replay, delete,
lease revival, quiescence/completion or daemon/startup automation/CLI promotion.

Proposed implementation locality: split reusable backend/image validation from
launch-only filesystem checks in `src/runner.ts`; share independently owned stop
implementation in `src/runner-launch.ts` across normal cleanup and explicit
recovery. Replace crash-test manual cleanup with that same narrow module interface,
not a second supervisor or separate journal. No schema/dependency/public index
export needed. Existing launch validation and failure classifications must remain.
Before code, obtain owner disposition and update all seven active sections with
the exact interface, root/late-cleanup security rule, negative/race test matrix and
fresh ordered split-gate DoD. Baseline218 native tests/3,319 assertions,100%/
98.59%; portable199/2,943,96.40%/91.76%; no fresh application runs for this docs-
only proposal. Required reds include delegated/revoked-grant authority, absent durable ID,
foreign identity, backend loss, missing launch paths, kill/lease loss, ignored
inventory writes and no create/start/budget/reuse side effects.

Until approved, retain the existing tested manual-cleanup limitation and G2 open;
no recovery implementation, new container/effect, install, push or commit performed
by this proposal. Owner decides whether to grant this narrowly scoped cleanup
dispatch authority; it is not implied by permission to append observations.

**Owner disposition:** approved the explicit stop-only recovery contract. The
pending/proposed text above records the pre-approval design, not current refusal.
No automatic cleanup service or CLI/public-index interface authorized.

Proposal-only checks pass: verified pinned Gitleaks8.30.1 scans on the two changed
governance documents;29 local links/anchors, seven active sections, unique ADRs/
canonical casing and `git diff --check`. All non-governance files and historical
review identity unchanged. Application/typecheck/coverage/drill/audit reruns are
N/A for this read-only proposal; prior artifact evidence is not a new execution.

#### Approved explicit stop-only recovery evidence — 2026-10-27

Owner explicitly approved ADR-027's narrow recovery contract. Implemented
`stopSyntheticDomain` and shared owned-stop/unqualified-record code in the existing
launcher module; separated backend/image proof from launch-only filesystem checks
in the existing preflight module. Tests use this same stop interface, not a second
manual cleanup implementation. Store/schema/pins/protocol/public index/CLI and
actor fixtures remain unchanged. Root means trusted supervisor authority under
the existing nonroot operator, never UID0 or worker-granted authority.

Reds were observed before implementation: unit authority check rejected the
unimplemented stop stub; actual crash recovery rejected its no-stop result while
the then-existing test fallback safely stopped the owned fixture. Greens include
intact recovery and kill/released-lease recovery after renaming only new synthetic
input/workspace roots to retained names. Both stop safely without launch-file
repair, new execution, budget draw, lease revival or state completion. Repeated
observed stop adds no POST or inventory event. Foreign/unbound/resolved/backend
and ignored-observation failures remain fenced; invalid/delegated/extra/uncloneable
inputs reject before effects. Existing nonzero-exit/protocol/kill/lease/admission
and ignored-write safety regressions remain in the mandatory actual corpus.

Intermediate failures are retained, not relabeled passes: extracted platform
checking initially needed a TypeScript narrowing correction (TS2722); the runtime
platform/nonroot check remains intact. Focused actual tests then failed before
dispatch when the approved mount was absent; scoped existing-image restoration
and exact UDisks results are in ADR-027. First ordered run stopped at formatting
exit1 and was corrected. Review of a subsequent exit-zero run found aggregate
function coverage99.88% because the crash-test cleanup wrapper was only a fallback;
normal and finally cleanup now share that same wrapper, removing duplicate stop
call setup. All applicable gates were restarted after these corrections; no guard,
test, coverage file or threshold excluded to manufacture a pass.
Final shape review also reproduced array envelopes/authority reaching lookup;
strict object-shape rejection and two new authority/input regressions close that
gap before lookup. No worker gained host-interface access. All gates below were
restarted again against those final guards, not reused from the earlier artifact.

Final ordered execution uses canonical operator-owned0700 initially-empty state
key `gate-ft_0a_0x` and log/TMPDIR key `loom-gate-o84wj_s7`. All13 command/exit
records and private logs are retained. Every final command exited0:

- Lint39 files/no fixes and strict typecheck.
- Portable201 tests/2,957 assertions,95.88% functions/91.73% lines. This suite does
  not execute physical recovery; its aggregate falls from96.40%/91.76% as selected-
  backend implementation grows and is not the mandatory physical coverage pass.
- Native full+preflight+domain221 tests/3,454 assertions,100% functions/98.61%
  lines versus baseline218/3,319 at100%/98.59%. Launcher100%/99.46% versus99.38%;
  preflight100%/98.99% versus98.95%. Unmodified core-module coverage unchanged.
- Recovery corpus2 tests/85 assertions on each of three runs; unit/transport
  focused16/145 on each of three runs.
- Approved split's empty-/tmp portable/read-only preflight202/2,978 at96.65%/
  93.68%; no controller filesystem-isolation or physical empty-host-/tmp claim.
- Automated synthetic drill/task completion false; audit14 packages/no reported
  vulnerabilities, no auto-fix/upgrade.

Read-only labeled snapshot431 containers,298 exited/133 created/0 running;133
additional synthetic containers since the298 snapshot, including intermediate
diagnostic/final runs, all retained. New run/input/DB/proxy/crash-result evidence
and renamed `.retained` paths stay preserved. Existing image/data was mounted,
never reformatted/deleted/re-permissioned; no ordinary-directory or rootful fallback.

Explicit stop-only recovery is locally verified, not automatic startup recovery
or independent quiescence. Unbound uncertain create, unavailable/foreign/corrupt
backends, all-descendant proof, controller filesystem isolation, CPU/memory/
persistent-disk over-limit, image security scan, remote CI/independent human review,
SDK/provider qualification and G2 remain open. Unknown inventory, pending native
actions and kill/reset/reuse fences stay intact. Eight-file recovery implementation/
test/governance diff remains uncommitted over `e112478`; no push or phase advancement.

Final security/document checks pass: initial scanner verification was blocked by
expired external temporary files, not waived. Restored the same Gitleaks8.30.1
official release outside Loom; archive/checksums SHA256 and executable byte identity
match the recorded pins. All eight task files pass redacted stdin scans.31 local
links/anchors, seven active sections, unique ADRs/canonical casing and
`git diff --check` pass. Store/all v1–v6 DDL, protocol, public exports, actor
fixtures, dependency/lock files, CI, roadmap/playbook and prior review hash remain
byte-identical. Full task diff inspected; no raw diagnostics, temporary debug code,
accidental logs, extra public surface or safety-test exclusions introduced.

**Subsequent owner instruction:** “commit and continue” authorizes committing the
verified explicit stop-only recovery implementation/tests/evidence and continuing
bounded offline P2 qualification. No push, startup automation, G2 closure or new
production/provider authority inferred.

#### Active-worker recovery refusals evidence — 2026-10-27

Explicit recovery committed as `5b67c49`; this continuation changes only the
selected actual-domain test and governance/contract docs. Private proxy gains
phase-local fault selection and503 refusal without native forwarding. Existing
ownership mode changes response labels only. Production code, actor fixtures,
profile/schema/dependencies and endpoint selection are unchanged.

Acceptance red used an inert unavailable mode and failed because recovery wrongly
succeeded for the supposed outage (1 test/66 assertions). The controller/worker
was still cleaned safely in finally. Actual proxy refusal implementation then
passes1 test/128 assertions across intact, killed/missing-path, backend-outage
and foreign-inspect scenarios. Refused calls retain the original durable ID,
unknown/pending state, blocked successor and budget1; no extra POST or sentinel
exposure. Heartbeat continues before explicit same-proxy restoration. Successful
recovery then stops that same domain, and its repeat adds no POST/budget/event.
Bounded refusal/post-delta/live-after-failure facts are retained in crash-result
evidence. Finally restores only the private proxy mode before owned cleanup;
no real daemon restart, transport fallback or production retry automation.

Fresh final roots: canonical operator-owned0700 initially-empty state key
`gate-o73yznbs`, log/TMPDIR key `loom-gate-m88grf03`; private manifest/step logs
retained. All13 ordered execution commands exit0: lint39 files and strict check;
portable201 tests/2,957 assertions at95.88% functions/91.73% lines; native221/
3,528 at100%/98.59%; recovery corpus2/159 three runs; focused unit/transport16/
145 three runs; empty-/tmp portable/preflight202/2,978 at96.65%/93.68%; automated
synthetic drill/task completion false;14-package audit/no reported vulnerabilities.
No tests skipped or runtime controls relaxed.

Coverage is scoped honestly: native aggregate98.59% versus98.61% at `5b67c49`,
functions100% unchanged. All production-module coverage is unchanged (launcher
99.46%, preflight98.99% lines); new test-only upgrade-refusal guard lines158–161
are not exercised by the stop operation's ordinary HTTP requests. This is not a
complete proxy-protocol coverage or aggregate non-regression claim. Keep that
defensive guard; do not exclude it or remove checks to manufacture a pass.

Read-only labeled snapshot483 containers,340 exited/143 created/0 running:52 new
synthetic containers since431, including red/green/final runs, all retained. Prior
image/mount/data and new private DB/input/fault/crash-result evidence unchanged or
retained as created; no repair/delete/re-permissioning or daemon changes. This
qualifies active transport/identity refusal and explicit retry through a restored
same proxy, NOT actual daemon crash/restart/loss, general quiescence, automatic
startup cleanup, resource-over-limit/image/human/remote-CI qualification or G2.
Four-file test/doc diff remains uncommitted; no push, provider/SDK or standalone
history-engine work enabled.

Final four-file Gitleaks8.30.1 scans pass after pinned archive/checksums/executable
identity verification.31 local links/anchors, seven active sections, unique ADRs/
canonical casing and `git diff --check` pass. All production source/store/all DDL/
profile/actor fixtures/dependencies/CI/roadmap/playbook and historical review hash
are byte-identical to `5b67c49`. Full test/doc diff inspected: no raw diagnostic
exposure, accidental debug/log calls, authority changes or safety-test exclusions.

**Subsequent owner instruction:** “commit and continue” authorizes committing
the verified active-worker refusal test/evidence slice and continuing bounded
offline P2 work. No push, real daemon restart, G2 closure or provider authority.

#### Lost-stop acknowledgement evidence — 2026-10-27

Active-refusal slice committed as `0a37304`; new work is test/doc-only. Tracer red
failed on unexpected successful recovery before the private stop-disconnect fault
was implemented (1 test/140 assertions). Green forwards the actual owned stop,
receives204/304, then destroys only the controller response. Recovery returns
cleanup failure/stopped=false, preserves bound ID/unknown/pending state, budget1
and blocked successor. Separate GET state plus five100ms heartbeat samples show
the known actor really stopped: failure is not evidence of non-execution.

The response-loss fault remains armed through subsequent explicit recovery and
its repeat. Both confirm stopped through GET inspection without another stop POST,
create/start, event or budget draw. Common finally restoration affects only the
private proxy; no daemon restart or native fallback. Bounded uncertainStop evidence
records reported failure/stopped, exactly one POST and separate native observation.
Focused green passes1 test/170 assertions across five crash/recovery scenarios.

Fresh canonical/private0700 initially-empty state key `gate-mrp6w5mv` and log/
TMPDIR key `loom-gate-nta55l6h` retain the command/exit manifest and step logs.
All13 ordered execution commands exit0: lint39 files; strict check; portable201/
2,957 at95.88% functions/91.73% lines; native221/3,570 at100%/98.59%; recovery2/
201 three runs; focused unit/transport16/145 three runs; empty-/tmp portable/read-
only preflight202/2,978 at96.65%/93.68%; automated synthetic drill/task completion
false;14-package audit/no reported vulnerabilities. Reported coverage matches
`0a37304`; all production-module coverage and code remain unchanged. No skipped
checks, guard removal, coverage exclusions, package or runtime changes.

Read-only labeled snapshot542 containers,389 exited/153 created/0 running:59 new
synthetic containers since483, including red/green/final runs, all preserved with
input/workspace/DB/proxy/crash-result evidence. No image/mount/old data deletion,
permission repair or real daemon restart. This proves the known lost-acknowledgement
trajectory only, not daemon crash/loss, all-descendant quiescence, startup automation,
resource-over-limit/image security/human/remote-CI qualification or G2. Unknown
inventory, pending actions and reset/reuse fences remain. Four-file test/doc diff
is uncommitted; no push, SDK/provider or standalone history-engine work enabled.

Final pinned Gitleaks8.30.1 scans pass all four task files after archive/checksums/
executable identity verification.31 local links/anchors, seven active sections,
unique ADRs/canonical casing and `git diff --check` pass. All production source,
store/all DDL/profile/actor fixtures/dependencies/CI/roadmap/playbook and prior
review identity remain byte-identical to `0a37304`. Full test/doc diff inspected;
no raw diagnostics, accidental logs/debug code, authority changes or exclusions.

**Subsequent owner instruction:** “commit and continue” authorizes committing
the verified lost-stop-acknowledgement test/evidence slice and investigating the
next bounded offline cleanup proof. No push, quiescence/reuse authority, daemon
restart, G2 closure or production/provider effect inferred.

**Kernel-observer discovery after `7698e97`:** read-only investigation and primary-
source notes only. Assess an isolated development probe using installed Python
pidfd/cgroup facilities around one known owned container; this is a proposed new
test seam requiring owner confirmation before implementation. No quiescence
recording, fence release, application integration, signals to observed processes,
cgroup writes, dependency install, daemon change or additional container dispatch
authorized by these notes. Findings belong in
`research/pi/18-p2-kernel-observer-readiness.md`; do not treat old research or
namespace-keeper observations as container/descendant cleanup proof.

**Research return — 2026-10-27:** findings saved in
`research/pi/18-p2-kernel-observer-readiness.md`. Parent review corrected the keeper
comm to `exe` (executable basename remains `rootlesskit`) and independently fetched
the cited revision's Linux pidfd poll, cgroup-v2 documentation, kernfs poll/seek and
CPython pidfd wrapper. These support distinct thread-group/subtree observations,
normal events ERR|PRI notifications and stale-handle failure rather than invented
emptiness. Source review is not installed-worker qualification. Selected Docker
release source lookup failed; cited Moby master is explicitly non-release evidence.
Worker PID provenance/namespace bridge, cross-UID access and post-stop FD behavior
remain blocked/unproven. Recommend owner approval of a development-only observer
with one separately bounded existing-fixture lifecycle, no observer signals or
state writes, at most10 seconds of observation and fail-inconclusive acquisition.
No code, new container dispatch, cleanup authority or G2 change performed.

Research document gates exit0: pinned Gitleaks8.30.1 identity and two-document
scans;25 local links/anchors; seven active sections; historical review hash;
tracked changes restricted to SPEC with only the expected new research file;
`git diff --check`. Runtime/tests/dependencies and retained lab state untouched.
Application/physical gates and coverage are N/A for this research-only slice;
no prior test count is presented as freshly executed. Findings/scope remain
uncommitted pending owner disposition; observer seam and lifecycle approval pending.

**Owner disposition:** “commit” authorizes committing these research/scope
documents only. Observer implementation and one-container lifecycle remain
approval-gated; no continuation, push or runtime effect inferred.

#### Approved observer acquisition evidence — 2026-10-27

Owner subsequently answered “continue” to the bounded test-only observer/one-owned-
container question. This is the approval event for ADR-028, not production cleanup
authority. Versions remain Linux7.2.8-9-omarchy/Python3.15.2/Bun1.4.4; approved mount
independently confirmed ext4/rw/nosuid/nodev before dispatch. No restoration needed.

Private evidence key `loom-observer-prerequisite-TPvFnrtG`, fresh0700 state key
`observer-4n1e93q2` and private child TMPDIR retain scripts/failed snapshot/manifest/
logs and all new input/workspace/SQLite/result data. Exact acquisition commands:

- `python3 /tmp/opencode/loom-observer-prerequisite-TPvFnrtG/peer.py --self-test`:
  initial9 cases exit0; final `python3 -I -B .../peer.py --self-test`:14 cases exit0.
- `python3 /tmp/opencode/loom-observer-prerequisite-TPvFnrtG/peer.py`: exit0;
  kernel-selected socket peer verified `dockerd`, pidfd nonterminal and same PID
  namespace. No HTTP dispatch. Peer only; worker proof does not follow.
- `bun run /tmp/opencode/loom-observer-prerequisite-TPvFnrtG/lifecycle.ts
  --self-test`: exit0 snapshot helper-load check before dispatch. The private
  harness reused the existing prepared fixture/launch/heartbeat/native-owner code.
- `bun run /tmp/opencode/loom-observer-prerequisite-TPvFnrtG/lifecycle.ts` with
  the selected endpoint/mount/image and fresh state/TMPDIR: exit2, exactly one
  lifecycle. Heartbeat and durable identity/owner checks pass; Python returns
  candidate-envelope/invalid-input before worker proc access. Launcher cleanup
  observed stopped; pending action, budget1, unknown inventory and successor fence
  remain intact. Reset planning rejects absent kill; no kill/reset was performed.
- `bun run /tmp/opencode/loom-observer-prerequisite-TPvFnrtG/stdin-red.ts`: exit1,
  expected18 bytes/received0. Confirmed own temporary harness API misuse:
  `FileSink.end(payload)` does not write payload. Installed type declares
  `end(error?: Error)`, not Node Writable end. No upstream Bun bug claimed.
- Corrected shared sender writes then ends; `bun run .../lifecycle.ts --self-test`
  now exercises synthetic Python JSON round-trip and passes exit0, no container.
  Final Python self-tests also pass14 cases. Both original failed snapshot and
  corrected scripts retained. No native repeat performed.

Corrected private harness strict check exits0 using `bunx --no-install tsc
--noEmit --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess
--noFallthroughCasesInSwitch --noUnusedLocals --noUnusedParameters
--forceConsistentCasingInFileNames --verbatimModuleSyntax --erasableSyntaxOnly
--lib ESNext --target ESNext --module ESNext --moduleResolution Bundler
--allowImportingTsExtensions --skipLibCheck --types bun
--typeRoots <repository>/node_modules/@types <private-root>/lifecycle.ts`.
Earlier ad-hoc flags omitted exact-optional semantics and failed on store typing
plus unknown native state. Matched repository options and explicit private-harness
state narrowing resolve that check; no production source change or waiver.

Exact-ID read-only native reinspection confirms the single experiment's container
owned/not-running/not-restarting/PID0; its inventory remains unresolved. No global
container cleanup/listing, restart, permissions repair, cgroup writes, observed-
process signals, dependency/SDK/provider use or authority transition occurred.
Only existing launch/owned-stop effects and narrow new-run ACL provisioning ran.
All prior/new data and the one stopped container retained.

**Blocked, not qualified:** the one authorized lifecycle is consumed. Worker
cross-UID namespace/handle access has NOT been tested; failure was input transport,
not EACCES. Independent cgroup/pidfd polling, removed-cgroup semantics, quiescence,
reuse/reset and G2 remain unqualified. No persistent observer/test integration was
written; full application/coverage/physical corpus reruns are N/A for this temporary
acquisition attempt and document-only repository diff. The native exit2 remains
failed evidence. Next owner is project owner: approve at most one additional
synthetic lifecycle for corrected acquisition, or stop here. No further dispatch,
commit/push or phase advancement inferred.

Final scoped document/security gates exit0: pinned Gitleaks8.30.1 archive/checksum/
executable identity plus seven scans (three changed documents and four private
script artifacts),31 local links/anchors, seven active sections, unique ADRs,
canonical casing, protected historical review hash and `git diff --check`.
Tracked diff is only SPEC/decisions/research; no untracked repository artifacts,
application/tests/fixtures/schema/config/dependency/CI/roadmap/playbook changes.
Private evidence root remains0700. No dependency audit or fresh application
coverage implied by these checks. Three-document evidence diff remains uncommitted.

**Owner disposition:** subsequent “commit” authorizes this three-document
acquisition/failure evidence commit only. An additional synthetic lifecycle,
continued observer implementation, push and G2 closure remain unauthorized.

#### Corrected observer acquisition repeat — 2026-10-28

Owner now requested “continue” after `e48f31b` and the explicit one-additional-
lifecycle proposal. One additional bounded existing-fixture lifecycle authorized
and consumed; no automatic/native retry or production authority expansion.
Sync starts clean at `e48f31b` on `feat/p2-isolated-runner`; an upstream tracking
association is present, but this task performs no push, PR or publication.

Fresh read-only environment Linux7.2.8-9-omarchy/Python3.15.2/Bun1.4.4 unchanged.
`/tmp/opencode` has no entries: old temporary scripts/logs cannot be reverified or
claimed retained now. Prior durable observer state and operator-owned regular2GiB
image still exist; mount absent and `losetup -j <approved-image>` finds no mapping.
Previously approved `udisksctl loop-setup --file <approved-image>
--no-user-interaction` exits0, maps `/dev/loop0` and automounts it. `findmnt --json
--target <approved-mount> --output TARGET,SOURCE,FSTYPE,OPTIONS` independently
confirms same target, ext4/rw/nosuid/nodev. No format/delete/permission repair,
ordinary-directory fallback or daemon change.

New reconstructed temporary key `loom-observer-repeat-34scy6go`, durable lab
evidence key `observer-tools-2rju6xlt`, fresh0700 initially-empty state key
`observer-repeat-ljmjpqbg` and private child TMPDIR retain the new revision.
Before execution, copy newly written scripts and SHA256s to durable0700 storage;
retain full command/exit/log manifests there as well as under the temporary root.
Original missing artifacts are not reconstructed byte-identical evidence.
Existing runner/source/fixture helper bytes checked against HEAD before dispatch.

Exact commands at `/tmp/opencode/loom-observer-repeat-34scy6go/`:

1. `bun --no-env-file run <root>/stdin-red.ts`: exit1 as intended, expected18/
   received0 bytes from deliberately wrong FileSink end(chunk).
2. `bun --no-env-file run <root>/lifecycle.ts --self-test`: exit0; snapshot helpers
   load without registration/dispatch; corrected shared write/end JSON round-trip.
3. `python3 -I -B <root>/peer.py --self-test`: exit0,14 identity/parser cases.
4. `bunx --no-install tsc` with the strict repository-matching flags recorded in
   the prior acquisition section and new `<root>/lifecycle.ts`: exit0. Full exact
   argv retained in durable `checks.json`, no install/flag relaxation.
5. `python3 -I -B <root>/peer.py`: exit0; selected socket peer executable dockerd,
   nonterminal pidfd, same controller PID namespace, no HTTP dispatch.
6. With explicit selected lab endpoint/mount/image, fresh private state/TMPDIR and
   minimal environment: `bun --no-env-file run <root>/lifecycle.ts`: **exit0**,
   exactly one lifecycle. Candidate envelope accepted; mappedUID165531 matches,
   anchored candidate stat/starttime readable/rechecked, PID namespace accessible
   and distinct from controller. Actual result is `candidate-access-only`.
7. Existing launcher owned cleanup observes stopped; five100ms unchanged heartbeat
   samples, pending native action, budget1, unknown inventory, successor fenced.
   Reset planning rejects absent kill; no kill/reset operation is performed.
8. `bun --no-env-file run <root>/verify-stopped.ts`: exit0, read-only fresh backend/
   image/exact-ID ownership proof and native not-running/not-restarting/PID0;
   unchanged inventory/action/budget. Command/script hash/log retained durably.

Native result is a genuine improvement over the prior input failure, not full
observer qualification. Only daemon-peer pidfd acquired; no worker pidfd/cgroup
directory/events acquisition or poll. Worker PID provenance/race-resistant binding,
handle lifetime/removal semantics and all-descendant quiescence remain open. No
inventory/reuse/reset/task-completion/lease authority transition, runtime service,
persistent observer integration, SDK/provider/dependency change, host scan,
observed-process signal or cgroup write. Prior and new data/stopped containers
are preserved; at most the existing owned fixture launch/stop and new-run ACL
provisioning occurred. No further lifecycle inferred; next work needs the exact
worker identity/cgroup-binding and handle-lifetime test contract.

Temporary scanner was absent too; restore the same external Gitleaks8.30.1 release
after verifying the previously pinned archive/checksums SHA256s, then compare the
executable bytes to its archive member. No runtime/package upgrade or missing-
scanner pass. Final strict check of both reconstructed lifecycle and read-only
verification harnesses also exits0; exact argv/log retained in durable
`final-strict.json`/log. Final scoped checks exit0: pinned scanner identity, seven
secret scans (three changed docs/four private scripts),31 local links/anchors,
seven active sections, unique ADRs/canonical casing/historical review hash, exact
durable script-copy equality and0700-root/0600-file modes, document-only tracked
diff/no untracked or staged repository changes, and `git diff --check`.
Durable `document-gates.json` records these results. Full application/coverage/
physical corpus and dependency audit are N/A for this temporary acquisition
experiment and document-only repository diff, not claimed freshly passed.
Three-document evidence diff remains uncommitted; no further lifecycle, push,
observer authority or G2 closure inferred.

**Owner continuation:** “commit and continue” authorizes committing the corrected
acquisition evidence and preparing the next worker-identity/cgroup/handle-lifetime
test contract. No additional lifecycle, production observer authority, push or
phase advancement inferred from this design continuation.

#### Worker-handle test-contract design evidence — 2026-10-28

Prepared `docs/p2-kernel-observer-test-contract.md` after `53b2c93`. Reviewed
existing full `assertDomainContainer`, owned-stop/unqualified inventory handling,
research handle semantics and CI commands. Future module belongs in existing
research probes with stdlib self-tests, not production/store/public exports.
Contract defines strict host-only identity frames, full-config validation reuse,
held-handle revalidation, one monotonic deadline including pipe reads, separate
thread-group/cgroup facts and blocked stale/missing/provenance outcomes. No claimed
atomic binding, cgroup-name heuristic, new authority or guessed PID translation.

Installed-release inspect-PID provenance and exact runtime/cgroup-view mapping
remain prerequisites before native polling. Candidate access success does not
waive them. Future test cases/commands are specified but not run; no implementation
or additional lifecycle performed. Observer implementation-contract approval and
separate bounded physical qualification remain pending; G2 unchanged.

Actual document gates exit0: pinned Gitleaks8.30.1 archive/checksum/executable
identity and three changed-document scans;31 local links/anchors; seven active
sections/unique ADRs/canonical casing; protected review hash; application/tests/
fixtures/dependencies/CI/roadmap/playbook/prior research unchanged; expected two
tracked document changes/one new contract only; `git diff --check`. Full document
diff inspected. Application/E2E/coverage/dependency gates are N/A for design only,
not prior evidence relabeled as fresh. Contract/SPEC/ADR notes remain uncommitted.

**Owner continuation:** subsequent “commit and continue” authorizes committing
this test contract and implementing its deterministic synthetic-only first slice.
No additional lifecycle or native acquisition/polling, provenance waiver, runtime
authority, push or phase advancement inferred.

#### Synthetic observer core evidence — 2026-10-28

Test contract committed as `75347b1`; new first-slice implementation is only
`research/pi/probes/p2-observer.py` plus scope/ADR/contract updates. The module
validates bounded strict identity frames, poisons its decoder after malformed/
extra/changed input, preserves timestamp precision and compares synthetic kernel
identity/namespace/membership tuples. Shared validation avoids duplicate guards
or JSON reserialization. Populated parsing and pidfd/event-mask classification
keep terminal/populated, live/empty and unavailable results independent; all
results keep quiescenceQualified=false and expose no stopped/reuse verdict.

No native handler exists: default/non-self-test invocations return exit2 with
blocked/native-not-implemented, without stdin/OS handle access. Synthetic snapshot
consistency is NOT ownership, native provenance or atomic/ABA-resistant binding.
No worker FD acquisition, raw proc parser, timed pipe I/O, real polling loop,
cgroup lifecycle, Docker dispatch or runtime/store/authority integration is claimed.
These remain prerequisites for a separate native implementation/qualification.

Acceptance red deliberately returned terminal/empty for every input and failed
2 deterministic tests on missing events and terminal+populated. Original red
source/log/command/hash retained under durable0700 key
`observer-synthetic-mvnh683t`. First green and final revision snapshots/logs are
preserved separately, not overwritten. Final evidence is under its `final/`
directory, with fresh private TMPDIR key `loom-observer-synthetic-cxvzhtc8`.

All eight ordered final command groups exit0, exact argv/exits/log names/source
SHA256 retained in durable `final/gates.json`:

1. `bun --no-env-file run lint`:39 files, no fixes. Biome does not check Python;
   its source/style review and syntax/self-tests are separately scoped.
2. `bun --no-env-file run check`: strict existing application/test typecheck.
   No Python static typechecker installed or claimed.
3. `python3 -I -B -c <compile-source-without-pycache>`: Python syntax passes.
4. `python3 -I -B research/pi/probes/p2-observer.py --self-test`:15 tests pass,
   including fragmented/two-max-frame input, unknown/duplicate/type/EOF errors,
   timestamp precision, poisoned decoder, identity drift, kernel tuple/namespace/
   membership consistency, malformed populated, poll-mask errors and repopulation.
   Scripted values only; no actual FD/syscall/lifecycle qualification.
5. Private no-native entry assertions: empty args, `--native`, and extra args
   all exit2 with the same bounded safe classification, no input exposure. Group
   exits0; individual exit2 is required refusal, not a native success.
6. `bun --no-env-file test --coverage`:201 tests/2,957 assertions,0 failures;
   95.88% functions/91.73% lines equals recorded portable baseline. Production
   source and test coverage unchanged; Bun coverage does not measure Python.
7. `bun --no-env-file run drill`: synthetic automated fixture only, verified task
   completion false; no human demonstration or approval substituted.
8. `bun --no-env-file audit`:14 packages, no reported vulnerabilities. No upgrade,
   new dependency, complete security/license claim or provider/SDK use.

No pre-existing/native-lab data or containers touched; no image/mount operation,
process signals, cgroup writes, host scan or additional lifecycle. Existing app/
tests/fixtures/schema/profile/config/CI/roadmap/playbook/review are unchanged.
Native corpus and independent quiescence/G2 remain blocked by the declared scope
and unresolved provenance, not counted as skipped passes. Final scoped checks
exit0: pinned Gitleaks8.30.1 archive/checksums/executable identity and four task-file
scans,31 local links/anchors, seven active sections/unique ADRs/canonical casing,
protected review hash, expected three-document/new-probe-only diff and
`git diff --check`. AST/source review confirms only stdlib imports (select used
for constants), no native handle/I/O code, pycache, accidental debug output or
test exclusions; the sole intentional CLI print is bounded safe refusal JSON.
Final source exactly matches the durable tested/hash-recorded copy. Full task
diff inspected; no authority/state/dependency expansion. New Python code and
three-document update remain uncommitted. No push or phase advancement authorized.

**Owner continuation:** “commit and continue” authorizes committing this verified
synthetic core and investigating the selected backend's installed version/build
provenance read-only. No native observer implementation, worker-handle acquisition,
additional lifecycle, runtime upgrade, push or phase advancement inferred.

## P2 private IPC execution record (historical)

### 1. Phase Objective & Scope

Owner committed physical preflight as `e40acc3` and requested “continue”. On the
clean `feat/p2-isolated-runner` branch, implement the private bounded output
protocol and owned synthetic worker before wiring Docker create/start/stop.
This is the transport/worker cut of ADR-022's approved offline launch path, not
an executable general-purpose runner or G2 qualification. No SDK/provider,
production effect, dependency, push or automatic task-completion change.

### 2. Environment & Upstream State

Bun1.4.4, existing schema6. Last complete selected-lab baseline:175 tests/2,338
assertions,100% functions/98.31% lines; portable174 tests/2,317 assertions,
99.40%/96.28%. Recheck both. Rootless Docker29.9.2 still reports expected security
and cgroup metadata; current namespace UID/GID maps are `0→operator` and
`1..65536→100000..165535`, so container65532 maps to host165531 for both.
That is read-only mapping evidence, not workload access proof. The capped mount
is absent again and no loop binds the approved existing2 GiB image. Restore it
with the previously approved noninteractive udisks commands for required
preflight regression gates; preserve data, no format/ownership/daemon changes.

### 3. Architecture & File Manifest

`src/runner-protocol.ts`: one incremental `RunnerOutput` parser for Docker's
non-TTY multiplexed attach bytes. `push(Uint8Array)` returns validated frames;
`finish()` requires a complete terminal proposal and no partial header/payload/
line. Any malformed input poisons the parser permanently; no later push/finish
recovers or exposes bytes. Exactly8-byte Docker headers: stdout1/stderr2,
reserved bytes zero, unsigned BE payload length. Reject zero-length frames,
unknown streams and payloads exceeding the remaining64 KiB aggregate output
budget before allocation. Stderr is always withheld/rejected, not logged.

Stdout is strict UTF-8 NDJSON, at most4096 encoded bytes per frame including
newline; max65536 combined payload bytes. Buffer only the8-byte header and fixed
4096-byte line storage, not a whole incoming chunk. Reject invalid UTF-8/JSON,
unknown/missing fields, arrays/null, partial EOF, out-of-order/duplicate frames,
noninteger/wrong sequences and all bytes after the terminal frame. v1 schemas:
`{version:1,type:"ready",seq:1}` then
`{version:1,type:"candidate-proposed",seq:2,path:"candidate.txt",sha256:HEX64}`.
No identity, arbitrary path/body/prose, approval/grant/reset/provider command or
completion field is accepted. Return only fresh objects containing validated
fields. Parser errors have one fixed safe code without raw diagnostics.

`encodeRunnerCommand("start"|"stop")` returns the exact UTF-8 bytes for
`{"version":1,"type":"start"}\n` or `{"version":1,"type":"stop"}\n`; runtime
invalid commands reject. This is the only supervisor command vocabulary.
`tests/fixtures/runner-worker.ts` is the self-contained trusted Bun worker input:
emit ready, wait for bounded strict commands, exclusive-create only fixed relative
`candidate.txt` with the exact synthetic content `loom synthetic candidate\n`,
emit its SHA256 proposal, then wait for stop. Stop before start exits cleanly with
no candidate. Stop after proposal exits cleanly. Duplicate start, unknown fields,
invalid/oversized/partial input or EOF without stop exits64 with no diagnostic
body. The worker never loads Loom, SDK/settings/credentials or network clients.
No heartbeat/descendant fixture until the launcher can own its cleanup.

`tests/runner-protocol.test.ts`: deterministic raw wire/JSON fixtures, every byte
split, frame and total budget edges, poisoning, no raw-error leakage, and native
worker subprocess tests under a minimal empty environment/disposable cwd with
`--no-env-file`. No public CLI, root facade export or generic transport abstraction
yet; the future supervisor is the responsible caller. Existing preflight/store
contracts remain unchanged. Contract/decisions record exact schemas and proof.

### 4. Test Plan & Coverage Matrix

Failing acceptance tests precede parser/worker implementation. Unit tests cover
framing, payload/frame limits, strict decode/schema/order/EOF, command bytes,
poisoning and proposed hash/path safety. Native process tests cover start→proposal
→stop, stop-before-start, denied duplicate/foreign commands, UTF-8/oversize/partial
stdin, missing stop and existing-candidate preservation. Existing safety corpus
plus mandatory actual-lab preflight remains required. Native worker tests are not
container, access-control or cleanup proof; subprocess worker line coverage is
not inferred from control-plane coverage.

### 5. Security, Observability & Edge Cases

Never emit/persist unvalidated output or daemon/worker diagnostics; use synthetic
sentinels only. No worker-controlled host identity or arbitrary host path. Return
proposal metadata, never verified completion. No UID0/world-writable fallback,
recursive ownership or ad-hoc ACL provisioning. Current mapping suggests a narrow
named-user ACL scheme for a later launch cut, but no permissions are changed here.
Actual65532 write/supervisor-read/outside-write-denial must precede support claims.
Docker stream EOF/worker exit alone cannot establish descendant quiescence.

### 6. Blast Radius & Rollback Plan

Add protocol owner, owned test worker and tests/docs only. No schema, existing
preflight/API, dependencies or authority behavior change. Tests write only their
new disposable directory, preserve an existing candidate within that fixture,
and clean only their own temporary state. Restored approved mount stays mounted;
no broad cleanup/unmount. Leave new code uncommitted unless separately requested.
Historical execution records and approvals remain byte-preserved.

### 7. Definition of Done (DoD)

Fresh baseline first, then reds. Final ordered gates: `bun run lint` →
`bun run check` → `bun test --coverage` → with explicit existing
`LOOM_LAB_ENDPOINT`, `LOOM_LAB_MOUNT`, `LOOM_LAB_IMAGE`,
`bun test --coverage tests ./tests/evals/runner-preflight.ts` →
`bun test tests/runner-protocol.test.ts` three times → initially-empty `/tmp`
portable and full+lab coverage using the documented bubblewrap commands →
`bun run drill` → `bun audit` → verified scoped Gitleaks, document/protected-file/
DDL/historical-record checks and `git diff --check`. Compare portable and mandatory
combined coverage separately; no exclusions/skips or invented Docker claims.
Missing required lab gates remain blocked, not a pass. Record exact counts and
limits before sign-off; no commit/push, launcher effects or G2 closure inferred.

**Execution evidence — 2026-10-26:** fresh baseline reproduced portable174 tests/
2,317 assertions at99.40% functions/96.28% lines and mandatory full+physical-lab175
tests/2,338 assertions at100%/98.31%, with lint30 and strict check passing.
Approved loop setup succeeded; explicit mount returned AlreadyMounted (not an
exit-zero mount claim), then ext4/rw/nosuid/nodev/device checks passed. Existing
image/data retained; no permission/ownership, daemon or image changes this cut.

Parser/command acceptance reds failed on explicit not-implemented behavior;
native worker lifecycle reds reproduced exit64/no candidate from the stub.
A separate red reproduced default TextDecoder BOM stripping before preserving
BOM bytes for strict JSON rejection. Docker framing was checked against the
official [Engine1.56 API specification](https://docs.docker.com/reference/api/engine/version/v1.56.yaml),
not inferred from a mock or current-main source.

Final ordered commands above all exit0:

- `bun run lint`:33 files/no fixes; `bun run check`: strict typecheck pass.
- `bun test --coverage`:193 pass/0 fail,2,880 assertions,99.47% functions/96.69%
  lines versus portable99.40%/96.28% baseline. New protocol100% functions/lines;
  all prior module coverage unchanged. Portable-only coverage is not the required
  physical-phase coverage result.
- Mandatory `bun test --coverage tests ./tests/evals/runner-preflight.ts`, with
  `LOOM_LAB_ENDPOINT=unix:///run/user/$UID/docker.sock`,
  `LOOM_LAB_MOUNT=/run/media/$USER/loom-workspace`,
  `LOOM_LAB_IMAGE=$HOME/.local/share/loom-lab/workspace-2g.img`:
  194 pass/0 fail,2,901 assertions,100% functions/98.48% lines versus100%/98.31%
  baseline. This actual lab corpus is read-only preflight, not a container run.
- `bun test tests/runner-protocol.test.ts` three times:19 pass/0 fail,563
  assertions each. Covers every wire split, poisoned state, frame/budget boundaries,
  safe errors and native interactive worker readiness/start/proposal/stop.
- `bwrap --ro-bind / / --tmpfs /tmp --dev-bind /dev /dev --proc /proc bun test --coverage`:
  same193-test/2,880-assertion portable results and coverage with initially empty
  `/tmp`. With the explicit lab environment above,
  `bwrap --ro-bind / / --bind "$LOOM_LAB_MOUNT" "$LOOM_LAB_MOUNT" --tmpfs /tmp
  --dev-bind /dev /dev --proc /proc bun test --coverage tests ./tests/evals/runner-preflight.ts`
  reproduces194 tests/2,901 assertions/100% functions/98.48% lines. No required
  lab skip or coverage exclusion was added.
- `bun run drill`: synthetic automated fixture pass, not human attestation;
  `bun audit`:14 packages/no known vulnerabilities, no auto-fix.
- Document/protected-file checks:63 local links/anchors, seven active sections,
  unique ADRs/canonical casing, preserved previous ADR bytes and historical SPEC/
  review identity, untouched source/preflight/store/DDL v1–v6/dependencies/pins.
  `git diff --check` passes. The temporary scanner was absent; official pinned
  Gitleaks8.30.1 archive/checksums were restored outside Loom, release SHA256 and
  archive/executable identity verified. Scoped stdin scans of all6 complete task
  files pass with an empty scanner environment.

Coverage above measures imported control-plane modules; native subprocess tests
exercise the owned worker but do not produce worker line coverage. Worker source
was strict-typechecked and linted, not given an invented coverage percentage.
No Docker workload, UID65532 access test, ACL provisioning, resource/cleanup proof,
SDK/provider call or standalone-history build occurred. New code stays uncommitted;
no remote CI, fixed-artifact human review, push or G2 closure claimed. Next is the
supervised Docker create/start/stop path and actual least-privilege access proof,
with its own exact contract and acceptance reds before effects.

## P2 physical preflight execution record (historical)

### 1. Phase Objective & Scope

Owner requested “commit and continue”; verified inventory is committed as
`264c0b2` on `feat/p2-isolated-runner`. Continue ADR-022's approved offline scope
with the physical preflight cut before Docker launch. Implement read-only engine,
image, input and capped-workspace checks; restore the existing approved mount
where noninteractive operator permissions permit. No launcher/create/start,
SDK/provider activity, dependency change, push or G2 closure in this cut.
The previously approved exact-digest image pull may populate the rootless lab
image store using an empty temporary Docker client config, never account login.

### 2. Environment & Upstream State

Baseline: Bun1.4.4, schema6,166 tests/2,248 assertions,100% functions/98.12%
lines; store99.74%, runs96.30%. Docker client/server29.9.2/API1.56 at the explicit
rootless Unix endpoint still reports rootless/seccomp/cgroupns/systemd/cgroup2/
overlayfs. At discovery the existing operator-owned regular workspace image was
exactly2 GiB, with no loop binding and expected mount absent. Installed
util-linux2.42.4/udisksctl are available. Official Engine1.56 API and rootless
resource-limit docs were rechecked; flags alone do not prove controller enforcement.

### 3. Architecture & File Manifest

`src/runner.ts` owns `preflightDomain` and its input/result types.
`src/store.ts` shares its existing config/endpoint validators via module-level
exports (not new package-facade APIs), avoiding divergent metadata checks.
Use direct native Unix-socket HTTP GETs only, no Docker CLI/config/credential
loading, ambient endpoint fallback or generic backend interface. Exact API1.56 `/version`, `/info`
and digest-addressed image inspection are bounded to5 seconds/request and1 MiB
response. Require selected engine version/Linux/amd64/rootless/seccomp/cgroupns/
systemd/cgroup2/overlayfs, supported API range, exact image RepoDigest and Linux/
amd64 platform, no declared image volumes. No pull/build/create/start calls.

Host paths must be absolute canonical nonsymlink paths, with disjoint input and
writable roots. Input directory contains only `worker.ts`, operator-owned regular
bounded single-link file, hash matching DomainConfig, not group/world writable.
Open worker input nonblocking/nofollow and hash at most64 KiB plus one overflow
byte, rejecting FIFOs/devices without hanging. Snapshot caller metadata before
asynchronous checks; later mutation cannot change results. Workspace is a dedicated directory strictly under the
exact approved mount. Read Linux fdinfo's actual `mnt_id`, mountinfo, statfs and
loop-device sysfs: select the visible mount (not a hidden overmounted record),
exact ext4 mount root, writable/nosuid/nodev, matching device, exact2 GiB
operator-owned regular backing image, no loop
offset/size-limit and filesystem size no greater than that backing image. Reject
ordinary directories, symlinks, wrong mounts/backing files and unbounded storage.
Input must live outside the writable filesystem; workspace directory must share
the exact visible mount ID, rejecting nested bind-mount aliases as well as devices.
Preflight never creates/provisions/mutates paths and returns no execution permit;
future launcher must recheck live authority and physical facts at its boundary.

`tests/runner.test.ts` uses real temporary files and a local Unix HTTP fixture for
negative metadata/transport checks, explicitly not containment proof.
`tests/evals/runner-preflight.ts` is a separate required native lab corpus using
explicit operator-supplied endpoint/mount/image paths, never auto-discovered Docker
credentials. It performs no container operations and retains its small workspace
evidence. Run it explicitly alongside the complete default corpus for applicable
phase coverage; unavailable physical lab blocks this phase, not a passing skip.
No production dependency or store schema change. SPEC/contract/decisions record
actual lab commands/results. Actual UID mapping, workload access/resource/security enforcement
and cleanup qualification remain subsequent launch gates; preflight must not claim
that read-only engine metadata proves them. Preserve historical inventory evidence.

### 4. Test Plan & Coverage Matrix

Acceptance reds precede implementation. Cover missing/rootful/wrong engine,
missing/wrong image, HTTP failure/malformed/oversized response, absent/wrong mount,
symlink/noncanonical/overlapping paths, wrong worker hash/permissions/extra input.
Use native Unix fixtures, not an injectable production transport. Positive
metadata validation plus physical-mount checks require actual selected lab facts;
unavailable lab is a recorded blocker, never a silently skipped passing test.
Keep all166 existing safety tests; require aggregate/per-module non-regression.

### 5. Security, Observability & Edge Cases

Only safe fixed error codes cross the preflight boundary; no raw daemon body,
path, worker bytes or exception forwarded. Reject excessive bodies before decode;
use strict UTF-8/JSON decoding. Trusted local endpoint still requires operator
identity and actual rootless metadata. Mount restoration may use only existing
image with noninteractive udisks, no formatting/deletion/recursive ownership,
privileged fallback/daemon change or authentication improvisation. No new run
directory ownership changes until mapping is established. Point-in-time checks
are not race-proof filesystem handles or a substitute for launcher revalidation.

### 6. Blast Radius & Rollback Plan

New read-only runner module/tests and phase documentation only; no changes to
inventory, authority, CLI or dependencies. If mount restoration succeeds, retain
it and document ownership/identity; no automatic unmount/loop deletion or broad
cleanup. Preserve existing workspace data. Uncommitted code can be removed by a
reviewed revert; committed inventory remains intact. External prerequisites block
affected launcher work without weakening checks.

### 7. Definition of Done (DoD)

Run `bun run lint` → `bun run check` → `bun test --coverage` →
`bun test --coverage tests ./tests/evals/runner-preflight.ts` with explicit
`LOOM_LAB_ENDPOINT`, `LOOM_LAB_MOUNT`, `LOOM_LAB_IMAGE` paths →
`bun test tests/runner.test.ts` three times →
`bwrap --ro-bind / / --tmpfs /tmp --dev-bind /dev /dev --proc /proc bun test --coverage`
→ `bun run drill` → `bun audit` → verified scoped Gitleaks/document/protected-file
checks and `git diff --check`. Record baseline/deltas and all unavailable gates;
no mocked containment claim. New implementation stays uncommitted unless separately
authorized. Mount restoration command, if allowed: `udisksctl loop-setup --file
<existing-approved-image> --no-user-interaction --no-partition-scan`, followed by
`udisksctl mount --block-device <returned-owned-loop> --no-user-interaction`.
No credentials, broader storage changes, image execution or qualification inferred.

**Execution evidence — 2026-10-26:** inventory commit `264c0b2` left a clean
tree before this cut. Initial acceptance red used an explicit not-implemented
function after resolving the intentionally missing module; it failed on the
required workspace-check behavior, not fixture/import breakage. Subsequent reds
reproduced mutable caller metadata, worker hardlinks, hidden/visible overmount
selection, input bind aliases and FIFO-open blocking before their fixes.

- Approved `udisksctl loop-setup` succeeded. The expected ext4 filesystem was
  already mounted when `udisksctl mount` ran; that command exited1/AlreadyMounted.
  Exact mount/device/backing metadata then verified rw/nosuid/nodev,2 GiB image,
  zero offset/size-limit and bounded filesystem. No reformat or old-data deletion.
- Approved exact-digest Bun image pull succeeded using a disposable empty Docker
  client config, explicit rootless endpoint and empty subprocess environment.
  No credential helper/login, workload or container operation occurred.
- `bun run lint`:30 files/no fixes; `bun run check`: pass. Portable
  `bun test --coverage`:174 pass/0 fail,2,317 assertions,99.40% functions/96.28%
  lines. **This portable-only aggregate is below baseline**, since it intentionally
  cannot exercise physical lab reads; it is not the physical phase's coverage pass.
  All pre-existing modules retain their recorded coverage.
- Mandatory combined `bun test --coverage tests ./tests/evals/runner-preflight.ts`
  with explicit `LOOM_LAB_ENDPOINT=unix:///run/user/$UID/docker.sock`,
  `LOOM_LAB_MOUNT=/run/media/$USER/loom-workspace`,
  `LOOM_LAB_IMAGE=$HOME/.local/share/loom-lab/workspace-2g.img`:175 pass/0 fail,
  2,338 assertions;100% functions/98.31% lines versus100%/98.12% baseline.
  New runner100% functions/98.89% lines. Lab verifies actual rootless image/mount,
  wrong backing inode, caller snapshot, read-only/overmounted filesystem and
  input/nested-workspace bind aliases. It does not execute a worker.
- Focused `bun test tests/runner.test.ts` three times:8 pass/0 fail,69 assertions
  each, including bounded stalled/malformed/oversized/invalid-UTF8 responses.
- Initially empty `/tmp` portable command above passes with the same portable
  counts/coverage. The additional combined lab command also passes with identical
  175-test/2,338-assertion/100%/98.31% results under
  `bwrap --ro-bind / / --bind "$LOOM_LAB_MOUNT" "$LOOM_LAB_MOUNT" --tmpfs /tmp
  --dev-bind /dev /dev --proc /proc bun test --coverage tests ./tests/evals/runner-preflight.ts`.
  Explicitly preserve only the approved lab mount writable in that namespace.
- `bun run drill`: synthetic automated fixture pass, not human attestation;
  `bun audit`:14 packages/no known vulnerabilities, no auto-fix.
- Final protected-file/DDL/document checks pass: v1–v6 DDL unchanged, historical
  SPEC execution record and T-07 review hash intact, prior ADR bytes preserved,
  63 local links/anchors, seven active sections, unique ADRs/canonical casing and
  `git diff --check`. Verified Gitleaks8.30.1 archive/executable identity matches
  the recorded release; all7 complete task files pass scoped stdin scans.

Only tiny new synthetic preflight directories/evidence remain on the restored
mount. Negative permission fixtures were confined to a new empty directory,
restored to0700, never used for a worker or a permissive launch fallback. Container
UID65532 mapping/access, image security scan, actual resource/containment controls,
launcher admission/kill/crash/cleanup and G2 remain unqualified. New preflight
implementation is uncommitted; no push/PR/remote CI or independent review claimed.

## P2 durable inventory execution record (historical)

- **Work package:** P2-A / offline isolated-runner durable inventory.
- **Current implementation cut:** schema6 inventory/admission/observations only,
  under the subsequent owner “continue”. No Docker launcher/lab operation in this
  cut; approved lab permission is retained for the next verified slice.
- **Authority:** owner requested opening the research PR and continuing P2.
  [PR #6](https://github.com/ishansing/dr.loom/pull/6) was opened against master;
  push CI40216694468 and PR CI40216985307 pass at `8e148ed`.
  Owner subsequently stated “commit and Approved”, authorizing this contract
  commit, the additive schema6 domain-inventory direction and scoped offline
  lab image/mount/nonroot-directory work described below.
- **Baseline/branch:** implementation starts at `72fb6d3` on
  `feat/p2-isolated-runner`; PR #6 subsequently verified merged at `bd397e7`.
  No local reset/rebase/merge. G1 closed; G2 open. Standalone history-engine
  reminder remains after the verified isolated-runner seam, not current work.

### 1. Phase Objective & Scope

Resume P2 by specifying a single rootless-Docker supervisor/runner seam with
trusted synthetic work only. Prepare image, mount, identity, IPC, resource,
output, lifecycle/recovery and admission contracts before implementation. This
preparation commit was documents/read-only evidence only. The current cut
implements durable inventory, atomic admission and trusted observations without
Docker/lab effects. Exact schema/types/migration and failing tests precede code;
SDK/provider/framework execution and dependency promotion remain excluded.

### 2. Environment & Upstream State

Bun1.4.4, Docker client/server29.9.2; explicit rootless context reports rootless,
seccomp, cgroupns, overlayfs and systemd/cgroup2. The known existing workspace
image is regular/non-symlink, operator-owned, exactly2,147,483,648 bytes; its
expected mount is absent. Registry metadata for proposed `oven/bun:1.4.4-slim`
was fetched anonymously, digest-verified, without downloading layers/installing
or executing the image. Exact candidate digest/default-user findings are in
[offline contract](docs/p2-offline-runner-contract.md). This is not image security
or resource/containment qualification. SDK1.4.0 remains selected but uninstalled.

### 3. Architecture & File Manifest

**Exact schema6 cut (2026-10-25, before code):** `domains` stores immutable
`domain_id` UUID PK (also the native audit action ID), registered `run_id` FK,
`thread_id`, workspace/owner/epoch binding, local Unix Docker endpoint, canonical
launch config JSON/hash, absolute deadline and created timestamp. `domain_events`
stores autoincrement ID, domain FK, kind, optional64-hex container ID, evidence
and timestamp. Kinds: admitted/created/started/stop-requested/quiescent/unknown/
not-created. Exactly one created binding per domain and one domain per container
ID in this ledger, append-only UPDATE/DELETE/REPLACE guards on both tables.
Apply only after recognized v5; record migration6 atomically, preserve v1–v5 DDL/
data, reject drift/future versions and keep old binaries rejecting v6.

Public host APIs in `src/store.ts`/`src/index.ts`: `admitDomain(db, context,
input, policy)` returns existing effect decision plus nullable domain; duplicates
reject rather than returning a reusable permit. Input has domainId, endpoint,
config, deadlineMs and root/grant authority. Config has only absolute canonical
inputRoot/workspaceRoot (no trailing separators) and workerSha256; frozen profile1 binds approved image,
UID/GID65532, resources/isolation/output/time bounds. Hash canonical profile,
config, identity, endpoint and deadline together. This validates metadata shape,
not actual mount identity or containment. Native Docker operations remain absent.

Admission inside BEGIN IMMEDIATE calls existing live `authorize` for high-risk
`runner.launch` against the exact config hash; deny/ask audits persist with no
domain. Allow atomically records native requested/allowed action and admitted
domain/event; every write/read-back failure rolls back usage/audit/inventory.
Registered run required; any non-quiescent domain on the same workspace blocks
another admission, including a successor epoch. Admission is an observed boundary
fact; a failing regression also requires non-overlapping canonical writable roots
even under distinct logical leases, and disjoint input/writable roots. These are
metadata-level checks, not a substitute for physical mount/symlink preflight.
It is never permission to replay/start after kill or a promise Docker started.

`getDomain`/`listDomains` validate full metadata/event/action history in one read
snapshot. Reads also reject orphaned registered-run references and require the native
request/verdict evidence and initial admitted event to bind the exact config and
successful preceding policy action; terminal action evidence may differ.
Trusted `recordDomainObservation` permits late facts after kill/expiry;
it never executes, approves, renews or claims task success. created binds one
container ID; started/quiescent require that binding; not-created requires none.
Repeated identical observations are idempotent; changed binding rejects. Unknown/
late started/late created can refute a prior terminal observation and block reuse
again; terminal observations are not silent history rewrites or proof from an
unavailable daemon. Evidence is required but supplied by the trusted host, not
independently verified by the inventory API.

Extend kill's admitted-effect exclusion to domains (no false not-executed for an
admitted launch); include full domain facts in reset hash and block reset while
any domain remains unresolved. Include domains in read-only run status and its
unresolved-count human summary. No automatic audit finish on quiescence/task
completion; actual action finish remains an explicit trusted observation.

Files: store/index/runs/CLI; `tests/domains.test.ts`, independent historical
`tests/fixtures/schema-v5.sql`, affected schema assertions and CLI guide. Public
API/native-process regressions precede application edits; SQL only for fixtures,
history/DDL assertions and deliberate rollback/corruption fault injection.

- `docs/p2-offline-runner-contract.md`: proposed bounded offline launch profile,
  private versioned transport, fail-closed handling and durable ownership/recovery.
- SPEC/ROADMAP/ADR-022: resume authority, owner-approved scope and remaining gates.
- Next implementation proposal (not files created here): responsible
  `src/runner.ts`, one native-process regression corpus `tests/runner.test.ts`,
  explicit rootless lab drill `tests/evals/runner-domain.ts`, and additive store
  migration only after an approved exact launch-inventory schema contract.
- No generic backend interface, real provider broker, public run CLI, SQLite
  replacement, standalone-history repository or dependency install in this slice.

### 4. Test Plan & Coverage Matrix

Inventory tests cover v5 migration preservation/rollback, immutable guards,
atomic audit/budget/admission, deny/ask/stale/kill/grant/budget paths, full-history
corruption, late observations, reuse fencing, reset staleness, native competing
admissions and abrupt process exit. Trigger fault injection checks ignored/extra
writes roll back. Coverage must not regress. Future launcher first reds
must cover rootful/missing daemon, absent/wrong mount, wrong image/user/limits,
malformed/oversized IPC, stale/killed admission, foreign container collision,
daemon/pipe loss, late creation after kill, supervisor crash and non-quiescent
descendants. Keep the existing143-test safety corpus; actual rootless integration
is an explicit required lab gate, never silently skipped or claimed by mocks.

### 5. Security, Observability & Edge Cases

Use only explicit trusted rootless endpoint and digest; image default user is
empty and must be overridden to nonzero container UID. Rootless daemon alone
does not establish nonroot workload identity or writable-volume mapping. Preserve
the existing image/data; no reformat, recursive ownership change, rootful fallback,
host socket/home/DB/credentials mount or inherited environment. Bounded private
stdout protocol; no raw stderr/partial/unvalidated output persisted/exposed.
Late facts remain observations, not new grants or verified task completion.

### 6. Blast Radius & Rollback Plan

Additive schema6 changes the store format, exported host API and status/reset
JSON shape. Older binaries reject it; use a verified pre-upgrade backup/restore
and reconcile inventory, never delete newer facts or downgrade a live store.
Tests migrate throwaway stores only. No containers/services/volumes were created
or stopped. Mount provisioning remains unexecuted/unqualified. Research reports,
historical v1–v5 DDL and existing safety tests stay intact; no dependency changes.

### 7. Definition of Done (DoD)

For this implementation cut: fresh baseline lint26/strict check/143 tests2,082
assertions/100% functions98.11% lines, drill/audit14 packages all pass. After reds,
run lint → strict check → full coverage → focused domains/schema/runs/kill tests
three times → automated drill → audit → verified task-file secret/doc/protected
DDL checks. Native competing admissions, abrupt exit/reopen, v5 data preservation,
rollback, late observations, reset-staleness, no lease resurrection and unknown/
tampered history are mandatory. Compare aggregate/per-module coverage; no skip,
new exclusion or invented Docker/E2E claim. Record gaps, not manufactured passes.
PR #6 is now independently verified MERGED at `bd397e7`; existing branch retains
its contract commit, with no resetting/rebasing/discarding work.

**Inventory execution evidence — 2026-10-26:** initial migration/API reds and the
distinct-lease overlapping-root red preceded their implementations. Final review
reproduced orphaned run references, unrelated admission evidence and accepted
trailing-separator roots before fixes. Two defensive observation guards are now
covered by corrupt-later-event and extra-write/rollback trigger tests.

Ordered local commands/results (all exit0):

1. `bun run lint`:27 files, no fixes; `bun run check`: strict typecheck passes.
2. `bun test --coverage`:166 pass/0 fail,2,248 assertions;100% functions,
   98.12% lines versus98.11% baseline. Store99.74% versus99.68%; runs96.30%
   versus96.27%; all other modules unchanged. No new uncovered store lines.
3. `bun test tests/domains.test.ts tests/schema-v2.test.ts tests/runs.test.ts tests/kill.test.ts`
   three times:77 pass/0 fail,502 assertions each.
4. `bwrap --ro-bind / / --tmpfs /tmp --dev-bind /dev /dev --proc /proc bun test --coverage`:
   same166 tests/assertions/coverage with initially empty `/tmp`.
5. `bun run drill`: synthetic automated fixture passes; no new human attestation.
6. `bun audit`:14 packages, no known vulnerabilities; no dependency auto-fix.
7. Python document/protected-file checks:63 local links/anchors across SPEC,
   ROADMAP, decisions, AGENTS, CLI guide and offline contract; seven active
   sections, unique ADRs and canonical casing pass. v1–v5 DDL is byte-identical
   to `72fb6d3`; dependency/lock/pin/framework/policy/research/governance protection
   checks pass. `git diff --check` passes.
8. Gitleaks8.30.1 archive SHA256 matches the previously verified release hash;
   executable bytes match the archive. `gitleaks stdin --no-banner --redact
   --exit-code 1` scans each complete changed/untracked task file:14 files clean.

Only throwaway test stores migrate. Docker launcher, physical mount/alias/user
qualification and containment E2E remain unimplemented/unqualified. No image pull,
mount, container, SDK installation or live-provider operation occurred. No remote
CI/fixed-artifact review for this uncommitted patch; no commit/push/PR/merge or G2
closure claimed. Next approved work is the physical preflight/launcher slice,
with its exact acceptance contract and reds before implementation.

**Historical contract-preparation DoD/evidence (not current code gates):**
Persist exact proposed launch contract and pending permissions; validate canonical
documents, scoped verified Gitleaks scans, `git diff --check`, and
`git diff --exit-code 8e148ed -- src tests package.json bun.lock .github FRAMEWORK_REF AGENTS.md .opencode research`.
Application lint/typecheck/tests/coverage/audit N/A to this docs-only delta;
record passed remote baseline without calling it a new implementation result.
Owner confirms offline lab image/mount scope and durable domain inventory
direction; refine exact schema/acceptance contract test-first. Commit explicitly
authorized; no push/merge or P2/G2 qualification inferred.

Preparation evidence: PR #6 remains OPEN/MERGEABLE at `8e148ed`; both check runs
succeed. No auto-merge enabled. Four task documents pass verified Gitleaks8.30.1
scans; canonical validator passes313 local links and extended check including
the new contract passes315, seven active sections/unique ADRs/casing/whitespace.
`git diff --check` and unchanged code/tests/config/pins/research checks exit0.
An initial manual anchor check corrected the new contract's G0 reference before
the extended validator passed. Application tests not rerun for this docs-only
preparation. Registry metadata/source observations are not runtime qualification;
image pull/mount/schema scope approval was subsequently supplied below.

**Owner approval and commit authority:** “commit and Approved” covers the two
requested decisions: additive schema6 durable domain records, and the exact
digest-pinned offline lab image plus restoring the existing capped workspace
mount and narrowly scoped nonroot run-directory provisioning. Preserve existing
image/data; no formatting/deletion, broad ownership changes, daemon/rootful
changes, UID0/world-writable fallback, SDK install, live inference or extra spend.
This is owner scope approval, not Ishan review, implemented SQL, containment proof
or G2 closure. This task commits the contract only; subsequent implementation and
lab execution retain test-first, preflight, safety and qualification gates.

## DeltaDB research execution record (historical)

- **Work package:** DeltaDB-inspired independent software research; P2 paused.
- **Authority:** owner requests extensive research on `https://delta.dev`, building
  similar software in a separate repository (not direct product adoption), Loom
  compatibility, pros/cons and recommendation before continuing. Owner subsequently
  authorizes committing the research and a post-isolated-runner-seam timeline
  reminder for the separate standalone build.
- **Baseline/branch:** clean `754a9d5`, `chore/deltadb-research`; G1 remains
  closed in its recorded scope, G2 open. Research is not an approved storage
  migration, architecture replacement, integration, implementation or release.

### 1. Phase Objective & Scope

Determine what DeltaDB actually provides, distinguish first-party documented
behavior from inferred/undisclosed implementation, evaluate an independently
implemented analogue and its integration with Loom. Compare a bounded provenance/
workspace-history service with a new general-purpose DB and with existing Git/
SQLite-based approaches. Cover consistency, concurrency, branching/merging,
code/conversation causality, durability, security, licensing, costs, validation,
failure behavior and staged delivery. No direct Delta service use or repository
creation, source copying, runtime installation or prototype is authorized.

### 2. Environment & Upstream State

Loom uses Bun/SQLite schema5 and accepted local WAL/FULL authority, immutable
audit/evidence, lease fencing, effect outbox and exact-hash verification. Pi owns
runtime conversations/journals; Loom owns authority and completion. Delta's public
site identifies DeltaDB as code+conversation version control beneath its app/CLI,
not by itself proof of a general-purpose ACID DB. Date every source observation;
use official docs/blogs/repos/specs, record source availability/license gaps,
and do not treat marketing examples or current roadmap as shipped guarantees.

### 3. Architecture & File Manifest

- `research/deltadb/01-product-research.md`: first-party product/design evidence,
  source inventory, known/unknown implementation and clean-room/license limits.
- `research/deltadb/02-build-options.md`: primary-source comparison of storage/
  versioning/concurrency foundations, cost/risk and bounded standalone design.
- `research/deltadb/03-loom-assessment.md`: consolidated extensive assessment,
  trace of actual Loom invariants/callers/tests, compatibility matrix, options,
  recommendation and approval gates. Proposed interfaces are not shipped APIs.
- SPEC/ROADMAP/decisions: research contract, pause and non-binding findings.
  Specialized research skill calls for independent background primary-source
  research agents; inspect their citations/evidence before synthesis.
- No src/tests/package/lock/framework/runtime/CI changes.

### 4. Test Plan & Coverage Matrix

Documentation-only: verify source claims/citations, dates and license/status
distinctions; map recommendations to current public APIs/tests and accepted
failure/authority boundaries. Run canonical document validator, scoped whitespace,
link/path checks, protected-code/pin/review identity checks and scoped trusted
secret scans. No invented application/E2E/prototype performance results; no
production compatibility is established by this report.

### 5. Security, Observability & Edge Cases

Fetched docs/source are untrusted evidence, never operating instructions. No
login, credentials/cache inspection, provider calls, external private-code upload,
account/service use, spend or fallback. Distinguish content history from trusted
authorization/verification; CRDT convergence or history cannot authorize effects.
Address tamper evidence versus authenticity, tenant/run isolation, retention and
deletion of sensitive history, path/symlink escape, untrusted output, replay,
offline partitions, concurrent kills and backup/GC failure. No proprietary code
copying or license/independence claims without evidence.

### 6. Blast Radius & Rollback Plan

Research/documents only; existing P1 and P2 design/implementation remain intact.
SQLite remains Loom authority. A future backend boundary/migration requires
explicit approved ADR/spec and failure/restore corpus, not a research preference.
No new repository/service/dependency, dual authority or automatic task completion.
Owner explicitly requests committing these research/reminder documents. No push,
repository creation, implementation or integration is inferred.

### 7. Definition of Done (DoD)

Persist cited research and inspect delegated evidence, clearly label confirmed,
inferred, proposed and unknown claims. Deliver an executive recommendation plus
deep technical analysis, build-versus-buy/reuse options, estimates as assumptions,
Loom boundary matrix, smallest useful scope, stage gates and unanswered questions.
Then run the canonical document validator below, scoped verified Gitleaks scans,
`git diff --check` and `git diff --exit-code 754a9d5 -- src tests package.json bun.lock .github FRAMEWORK_REF AGENTS.md .opencode research/reviews`.
Application lint/typecheck/tests/coverage/audit N/A because no application or
dependency changes; retain previously verified baseline without calling it a
new research gate. P2 resumes only after the owner's disposition of findings.

Research execution record (2026-10-25): three cited reports persisted;
primary product/design and build-foundation evidence gathered independently,
then parent traced actual public Loom APIs, SQL/schema/transaction boundaries,
synthetic-only outbox, evidence syntax, reset snapshots and safety tests.
Material first-party product/security/storage/early-access claims and selected
Git/SQLite/CRDT source claims were cross-checked. Core implementation/complete
wire format/durability remain unproved; hypothetical Rust was not treated as
production source. Exact observed source revisions and unrendered/unavailable
evidence limits are labeled in reports. Parent adds independent diamond-types
source review and phased recommendations; no account/service execution,
dependency installation, application edit or benchmark. Main assessment:
[03-loom-assessment.md](research/deltadb/03-loom-assessment.md). Recommendation
awaits owner disposition, not a storage/authority migration decision.
Research gates: canonical document validator exit0 (310 local links/seven active
sections/unique ADRs/casing/whitespace); all six task files pass verified
Gitleaks8.30.1 scans; `git diff --check` exit0; protected code/tests/config/pins/
prior reviews unchanged against `754a9d5`. Report-local whitespace and illustrative
capacity arithmetic checked. Reports total1,325 lines; source pages/revisions are
cited, not claimed as independently exercised product behavior. Application
checks N/A to this docs-only research; no implementation/benchmark/legal review
was performed. Owner subsequently requests committing research and fitting the
separate standalone build into the timeline after the isolated-runner seam as a
reminder. ROADMAP records this as a milestone-relative revisit after tested
T-09/T-15 supervisor/IPC/rootless cleanup and before P3 scope review, not allocated
work inside existing week forecasts or a new G2/P3 prerequisite. Separate build
scope, retention/license/recovery and explicit reforecast remain required; no
SQLite replacement, new repository, package/service or P2 implementation starts.
Research files remain unchanged; validate the updated governance and all six
task files before the authorized commit. P2 remains paused by this task.
Final commit preparation: document validator exit0 (311 local links/seven active
sections/unique ADRs/casing/whitespace); six verified task-file secret scans and
`git diff --check` pass; three research report hashes unchanged and protected
code/config/pins/prior reviews unchanged. Application checks remain N/A to this
documentation-only commit. No push or separate-project build is authorized.

## P2 kickoff execution record (historical)

- **Work package:** P2 kickoff / T-09–T-15 discovery and baseline fixture repair.
- **Authority:** owner stated “Merged, continue”; PR #5 merge independently
  verified at `ffbfd47e042214f543593c8e5481fe1f155ab2a5`, current remote master.
- **Baseline/branch:** clean merged tree identical to `803e5f6`;
  `feat/p2-runner-contract`. G1 remains closed for its recorded synthetic scope;
  G2 remains open. A newly reproduced fixture startup race blocks a clean P2
  baseline; no runtime/dependency promotion or real execution is inferred.

### 1. Phase Objective & Scope

Prepare the first isolated-runner work package using accepted SDK1.4.0 and
rootless Docker direction. Repair only the existing outbox fixture's startup
barrier so it tests concurrent relay admission rather than simultaneous DB-open
recovery. No SDK installation, container launch, mount/system change, framework
installation/re-pin, provider/broker/live use or application implementation.

### 2. Environment & Upstream State

Fresh Bun1.4.4, Node26.7.0, rootless Docker client/server29.9.2; daemon reports
rootless, overlayfs, systemd/cgroup2. The previously capped workspace mount is
absent (`findmnt --mountpoint` exit1); do not recreate/mount it without scoped
operator authorization. Pi is not a Loom dependency and prior external
comparison installation has expired. Read-only registry SDK1.4.0 tarball matches
ADR-005's SHA512; declarations, implementation and shipped changelog re-read,
not executed. Source details and pending qualification are recorded in
[P2 kickoff](docs/p2-runner-kickoff.md). Selected framework2.1.0 remains unchanged.

Merged baseline lint26 files/strict check pass. Full coverage exits1 (142 pass,
1 outbox fixture failure,2,076 assertions;100% functions/98.11% lines). Ordered
drill/audit did not run after failure. Isolated relay race test fails3/30 runs;
minimal two-child DB-open probe fails2/60 pairs with SQLITE_BUSY/RECOVERY in
`schemaKind` before child readiness/busy-timeout setup. This is a fixture setup
race, not evidence of duplicate dispatch or a reproduced upstream defect.

### 3. Architecture & File Manifest

- `tests/outbox.test.ts`: reuse `tests/runs.test.ts`'s sequential connection-ready
  barrier, then release both real child processes together. Keep independent
  target DB and all one-effect/one-admission/history/exit/stderr assertions.
- `docs/p2-runner-kickoff.md`: remap T-08–T-11/T-15 to accepted runtime, planned
  ownership, staged implementation scope and material setup/promotion approvals.
- `SPEC.md`, `ROADMAP.md`, `decisions.md`: active seven-section contract,
  verified merge, baseline issue, evidence and explicit disabled boundaries.
- No src/exports/package/lock/CI/schema changes; no second runtime loop.

### 4. Test Plan & Coverage Matrix

Before correction, `bun test tests/outbox.test.ts -t 'real competing non-idempotent'`
reproduces missing-ready failure. A diagnostic two-process bootstrap captures
SQLite busy before relay; no instrumentation belongs in application code.
After correction, repeat the exact test100 times, then full ordered gates and
empty-`/tmp` full coverage. Children must both reach readiness before release;
relay work still competes and only one unconfirmed admission/effect is retained.
Compare coverage with100% functions/98.11% lines; no skipped tests or added retries.

### 5. Security, Observability & Edge Cases

Live providers, credentials/caches, extra spend and automatic fallback remain
disabled. SDK default model/auth/resource discovery is not safe startup policy;
explicit isolated runtime resources are needed before promotion. Docker context
name alone is not trust proof; absent capped mount/digest image/log limit blocks
runner launch. Bubblewrap remains a research/test fixture, never a backend
fallback. Baseline diagnostics use synthetic DBs; preserve child cleanup and
truthful failures. SQLite busy remains explicit; do not alter public store
semantics to make a contention fixture green. No actual host resources removed.

### 6. Blast Radius & Rollback Plan

Only fixture startup scheduling changes; actual relay race is retained.
Rollback is reverting the new fixture scheduling, no data migration or runtime
cleanup. Preserve the complete P1 review/approval/evidence history. P2 discovery
does not qualify containment or reopen G1 silently; this baseline failure and
repair remain visible. Leave changes uncommitted absent commit authorization.

### 7. Definition of Done (DoD)

Run `bun run lint` → `bun run check` → `bun test --coverage`, then100 independent
invocations of `bun test tests/outbox.test.ts -t 'real competing non-idempotent'`,
then `bwrap --ro-bind / / --tmpfs /tmp --dev-bind /dev /dev --proc /proc bun test --coverage`,
`bun run drill`, `bun audit`; all required exits0, no reduced coverage. Then
verified scoped Gitleaks scans, canonical document validator, `git diff --check`
and unchanged application/pin/dependency/review checks. Record actual results,
not yet passed claims. Owner approves next package's precise dependency/image/
mount work before runtime integration or lab effects; no push/commit inferred.

Execution evidence (2026-10-25): fixture setup corrected using the existing
phase-writer readiness pattern, then all declared checks exit0: lint26 files,
strict check,143 tests/2,082 assertions,100% functions/98.11% lines (unchanged
per-module coverage),100 independent targeted runs, empty-`/tmp` full143/2,082,
automated drill and14-package audit/no advisories. No assertions deleted or
test retries introduced. Public store/relay logic unchanged. Official tag API
freshly confirms SDK1.4.0 source commit
`4a080252f06caf63a525d7873c5d94d3c23887e0`; registry/source inspection is not
dependency installation or containment proof. Exact image/mount/IPC/log contract
and setup authorization remain next, not a new supported runtime claim.
Final scoped checks exit0: canonical document validator291 local links/seven
active sections/unique ADRs/casing/whitespace; five verified Gitleaks8.30.1
task-file scans; `git diff --check`; protected application/config/pin/prior-review
diff empty against the verified merge. No new fixed-artifact advisory or owner
approval claimed for the fixture patch. Owner subsequently authorized committing
the verified fixture repair and kickoff records; publication remains separate.
no remote CI evidence exists for this patch and G2 remains open.

## T-07 completed execution record (historical)

- **Work package:** P1 / T-07 CLI v1 and offline conformance, started 2026-10-24.
- **Authority:** owner requested “push and continue” after approved T-06 commit
  `9f3241a`; confirmed additive v5 run/evidence storage, lease-gated init/record,
  human default/explicit JSON, synthetic kill controls and pinned offline scope.
- **Baseline/branch:** clean `9f3241a`, `feat/p1-cli-conformance`.
- **Status:** implementation, ordered offline gates and fixed-artifact advisory
  verified with no confirmed findings; corrected T-07 `555586b` has verified
  green remote CI and Ishan approval relayed by the owner. Personal drill
  execution attested at `ffed35e`; exact provenance/limits recorded in
  [G1 evidence](docs/g1-closeout.md). G1 CLOSED on 2026-10-25 under the owner's
  conditional closure authorization after acceptance evidence was checked;
  actual framework qualification blocks affected execution, not synthetic G1.

**G1 closure / merge preparation (2026-10-25):** owner requested “Close G1 if
it satisfies the spec and prep for merge”. The SPEC first-milestone criteria
and ROADMAP P1/G1 exit are satisfied in their synthetic/core scope: immutable
audit, migration/restore fixtures, native contention/recovery, final admission/
kill/replay safety, framework drift rejection, recorded operator demonstration,
Ishan approval relayed for `555586b`, and verified exact-artifact CI. Evidence
was committed first as `7f85871`. Human demonstration remains attributed to
`ffed35e`; the correction changes fixture parent setup only and reruns the drill
in CI, not a new human demonstration. The owner authorizes closure with these
recorded limits; no containment/provider/actual-installation qualification follows.

Scope/files: documentation-only closure in SPEC, ROADMAP, ADR-019 and G1 evidence;
local [P1 PR draft](docs/p1-merge.md), no published PR or merge. Remote default
target is `master` at `2be0e4fe7a593887ce690062e68a8dfaeaf170a7`, ancestor of the
whole P1 stack. GitHub compare reports behind0; local `git merge-tree --write-tree`
against that exact target exits0 without conflict. Local origin/master is stale;
use the API-verified target rather than claiming its cached ref is current.
This is a point-in-time merge check, not a branch-protection/mergeability promise.

Fresh closure gates at `7f85871`: lint26 files, strict check, full143 tests/
2,082 assertions (100% functions/98.11% lines), focused31/144, automated drill
and audit14 packages/no advisories all exit0. Full coverage also exits0 in a
separate Bubblewrap empty-`/tmp` namespace, with identical totals/coverage.
No application/test/workflow/dependency changes. Preserve prior advisory bytes;
document/secret/whitespace gates apply to the closure record. Rollback/merge
cautions remain schema5 backup/restore plus reconciliation and explicit JSON
caller migration; never delete newer history or bypass safety tests. G1 closure
does not authorize push, PR publication, merge, P2 implementation or deployment.
Closure document gates: canonical validator exit0 (289 local links/seven active
sections/unique ADRs/casing/whitespace),43 P1 merge-scope verified Gitleaks8.30.1
scans exit0, `git diff --check` exit0. Previous advisory/report hash unchanged;
implementation/tests/workflow/pins match accepted `555586b`. Closure/PR draft
documents are authorized for commit by the owner's subsequent “commit” instruction;
publication remains separate. Final published PR head CI and branch
requirements must pass before merge; no remote check is claimed for local docs.

**Pre-closure evidence recording (2026-10-25):** owner states “Approved 555586b
by Ishan, Record the closure evidence and commit before G1 closure”. Scope is
documentation only: this active phase, ROADMAP, ADR-019, G1 evidence and an
append-only parent record in the original advisory. Preserve the frozen AI
report/manifest and distinguish its original pending template from later
owner-relayed approval; no new AI review or independently authenticated human
signature claimed. Verify remote run40178607723 at full SHA
`555586b8d00e5d3350bd671054b5a97140ecfbdb`: all required steps success,143 tests/
2,082 assertions,100% functions/98.11% lines, drill/audit pass. Human evidence is
the supplied drill output and owner personal-execution statement at
`ffed35e299726c9868b3fecfbe725f67edd4dc29`, not a claim of a human rerun on the
corrected SHA. No application/drill-script changes in the correction. Retain
selected framework pin; fixture conformance satisfies G1 drift proof, actual
installation checks still gate affected framework execution (ROADMAP G1 exit/
risk register; T-07 fixture test contract). No installation/re-pin, closure,
merge, push or P2 authorization. Validate docs/whitespace, append-only report
identity, unchanged implementation and verified task-file secret scans before
committing. Application gates N/A to this documentation-only update; cite the
verified accepted-artifact CI instead of manufacturing a new application result.

Pre-closure documentation gates exit0: canonical validator286 local links/seven
active sections/unique ADRs/casing/whitespace; five task-file verified
Gitleaks8.30.1 scans; `git diff --check`. Original report bytes are an unchanged
prefix and embedded manifest hash matches; no application/test/workflow/pin
diff. Appended report SHA256:
`ceca07bed47c1e39bb80b01c064a508387acbbd713517bf7ca36d54a92d532fa`.
Application tests were not rerun for this docs-only record; remote CI above
provides the exact accepted-implementation evidence. G1 remains open.

**CI correction work package (2026-10-25, owner requested “Fix it”):**

1. **Objective/scope:** remove fresh-runner/test-order dependence on an existing
   `/tmp/opencode`; test infrastructure only, no production behavior or workflow
   changes. Prior approval applies to the prior artifact, not this correction.
2. **Environment/upstream:** failed remote run40173273410 at
   `ffed35e299726c9868b3fecfbe725f67edd4dc29`, Bun1.4.4. Lint/typecheck pass;
   coverage reports134 pass/9 fail from ENOENT; drill/audit skipped. Local
   Bubblewrap with an empty tmpfs `/tmp` reproduces12 failures in44 focused tests
   (including three run tests otherwise masked by earlier fixture setup).
   No runtime/dependency change or upstream API issue is implicated.
3. **Architecture/files:** `tests/fixtures/framework.ts` creates its parent
   before allocating a unique directory, covering framework/CLI/drill callers.
   `tests/policy-corpus.test.ts` and `tests/runs.test.ts` do the same at their
   three independent allocation sites each, following existing test patterns.
4. **Regression matrix:** existing public/native-process assertions run in an
   empty `/tmp` namespace, each affected test file independently and standalone
   drill, plus full coverage corpus. No assertions or coverage exclusions removed.
5. **Security/edges:** no removal/rename of host `/tmp/opencode`; Bubblewrap
   overlays only the child mount namespace. Recursive mkdir remains idempotent,
   unique child cleanup unchanged; no credentials/provider/real effect access.
6. **Blast radius/rollback:** fixture setup only; revert these additions to
   restore the earlier behavior, without changing store/schema/pins or evidence.
   Owner's reported human drill and Ishan approval remain attributable to the
   previous artifact; neither approves this patch or closes G1.
7. **DoD:** ordered commands below, followed by three independent invocations of
   `bwrap --ro-bind / / --tmpfs /tmp --dev-bind /dev /dev --proc /proc bun test FILE`
   for `tests/framework.test.ts`, `tests/policy-corpus.test.ts`, `tests/runs.test.ts`;
   same prefix with `bun run drill` and `bun test --coverage`; then verified
   task-file secret scans, canonical document validator and `git diff --check`.
   Remote rerun requires publishing a corrected artifact; no push/merge inferred.

**CI correction evidence:** pre-fix empty-`/tmp` focused command above exits1
(32 pass/12 ENOENT failures). After seven parent-directory setup additions,
ordered lint (26 files), strict check, full coverage (143 pass/2,082 assertions,
100% functions/98.11% lines), focused31/144, automated drill and audit (14 packages,
no advisories) exit0. Initial lint caught import formatting; corrected before
restarting the full ordered gates. Independent empty-`/tmp` runs exit0:
framework6/17 assertions, policy23/1,184, runs15/67, standalone drill and full
coverage143/2,082 with unchanged coverage. Bubblewrap overlays a fresh tmpfs
per invocation; no host temporary directory was removed. No runtime/schema/
workflow/dependency changes. Owner authorized correction commit; unpublished. Failed remote
run remains failed, no corrected remote CI or new review approval claimed.
Final correction checks: six task files pass verified Gitleaks8.30.1 scans;
canonical document validator exit0 (283 links/seven sections/unique ADR IDs/
casing/whitespace); `git diff --check` exit0. Protected application/workflow/
dependency/pin/prior-review diff is empty. No new fixed-artifact advisory has
been requested or obtained for this correction; earlier approval is not reused.

### 1. Phase Objective & Scope

Make CLI orientation and recording complete without becoming a runbook executor.
Persist runbook/goal/scale/framework proof, reject re-init and concurrent open
phases, preserve repeatable evidence and expose a read-only resume bundle.
Require existing host-prepared DB/live lease for init/record; no automatic lease
acquisition or successful-task-completion inference from a committed phase.
Add synthetic kill status/engage/plan-reset/reset through approved controls;
fresh reset snapshot, human attribution and evidence remain mandatory. Verify
actual installed framework revision/content and explicit installed skill roots,
not default/supplied revision claims. Assemble deterministic CLI/process/drill
fixtures and pin CI to qualified Bun1.4.4 with ordered gates. No providers,
network model calls, real adapters/effects, credential inspection, framework
installation/re-pin, sibling edits, production containment or automatic G1 closure.

### 2. Environment & Upstream State

Fresh baseline: lint20 files, strict check,112 tests/1935 assertions,100%
functions/97.04% lines (store99.68%, policy98.00%), dependency audit14 packages/
no advisories. Bun1.4.4/SQLite3.53.4 and existing locks remain unchanged.
Configured `I2P_PATH=../I2P` has HEAD `bd0cacc5a0a81d41311782d2b20f778ee7b40392`
(4.0.0), not selected `4fe0869ae41b0d81cbe3c6bc643f10ff2049ceed` (2.1.0).
Read selected revision's lock/hash script through Git objects; do not adopt the
sibling's current26-entry lock in place of pinned23 entries. Official pinned
hash method sorts relative paths with `localeCompare`, hashes each path+NUL+
bytes+NUL; use Bun/stdlib, no upstream installer or network version checker.
Synthetic fixtures may supply their own explicit framework ref in isolated cwd;
Loom's committed FRAMEWORK_REF must remain unchanged. Real configured checkout
must fail until the owner supplies a matching installation.

### 3. Architecture & File Manifest

| File | Responsibility |
| --- | --- |
| `src/store.ts` | Additive exact-signature v5 migration, immutable run/evidence tables, existing-store opening without creation, preserve gates/control invariants |
| `src/runs.ts` | Atomic run registration/phase lifecycle, multiple evidence links and coherent read-only resume bundle |
| `src/framework.ts` | Actual Git revision/version/clean-tree/lock validation and installed skill-directory hashing, fail closed without execution/network |
| `src/cli.ts`, `src/index.ts` | Strict flags/required inputs, safe errors, human/JSON output, explicit synthetic controls and public exports |
| `tests/cli.test.ts`, `tests/framework.test.ts`, `tests/runs.test.ts` | CLI subprocess contracts, framework drift and run/evidence/lifecycle regressions |
| `tests/fixtures/framework.ts`, `tests/fixtures/schema-v4.sql` | Synthetic local Git/skill fixture and fixed independent historical v4 migration input |
| `tests/evals/human-flow.ts`, `docs/cli.md` | Throwaway synthetic operator drill and public command/limitation documentation |
| Existing schema/gate/kill/outbox tests | Advance current schema assertions; adapt changed CLI JSON flags without deleting safety checks |
| `.github/workflows/ci.yml`, `package.json` | Ordered pinned offline checks and drill command; no dependency changes |
| `SPEC.md`, `ROADMAP.md`, `decisions.md`, review report | Contract, evidence, decisions and separate human disposition |

V5 adds immutable `runs` metadata and ordered `transition_evidence` references;
no invented metadata or evidence links for historical rows. Init inserts metadata
and opening transition atomically under the live bookkeeping gate; existing run
or historical run identity cannot be adopted by re-init. New run APIs enforce
one running phase per run/thread and terminal closure of the matching phase.
Existing low-level ledger APIs remain trusted bookkeeping, not task completion.
Status reports the most recent committed row, running phases, open/interrupted
actions, unresolved outbox, leases, kills and explicit budget modes in one read
snapshot. Missing DB returns an empty bundle without creating/migrating it;
unknown run in an existing store fails actionably. CLI operations require current
schema; host explicitly prepares/migrates with public store APIs.

Framework check uses cwd FRAMEWORK_REF as trusted expected config, checks actual
Git HEAD/VERSION and dirty-tree state, validates the selected lock, then hashes
every lock entry from an explicit `<skills-root>/<id>` directory. Missing content,
malformed locks and symlinked skill entries fail closed. No ambient global lookup
or fetching/installing to make checks pass. Init stores the resulting revision/
lock digest; it never accepts a caller's self-asserted `--commit` as proof.

### 4. Test Plan & Coverage Matrix

- Migration: exact v4→v5 and prior versions, data/guards retained, no synthesized
  run identity/evidence, rollback on fault, unknown/tampered schema rejected.
- Runs: atomic init and evidence rollback, existing/historical identity reject,
  one open phase per run/thread, matching terminal close, repeat evidence/file
  hash syntax, unknown run, live kill/owner/epoch/expiry gates, snapshot status.
- Framework: synthetic local Git expected ref; correct hash, one-byte drift,
  missing files/lock, duplicate/traversing IDs, symlink entries, changed tracked
  files, revision/version mismatch and no automatic installation. Near-miss
  results must be machine-readable without raw source/error leakage.
- CLI: strict options/duplicate/missing values, status default human/--json,
  init→running→committed→status, repeat evidence, re-init/double-open/unknown-run
  failures, stderr/nonzero and no stacks; absent status does not create DB.
- Critical CLI: explicit synthetic flag/human actor/evidence, scoped/global
  kill status, no post-kill write, stale/blocked reset reject, no lease revival.
- Process/regression: real CLI subprocesses and conflicting phase writers;
  all approved T-01–T-06 contention/recovery/policy/outbox/control tests retained.
- Drill: automated throwaway fixture traces init/record/status/approval pause/
  interruption/kill/reset; no live provider or production target. Agent execution
  is not a human-run attestation; human execution remains an explicit handoff.

SQL only builds fixtures/asserts history; behavior uses public APIs/real processes.
Record aggregate and per-module coverage versus baseline, never skip tests or
exclude guards to manufacture non-regression.

### 5. Security, Observability & Edge Cases

Trusted host identity/context/clock/SQL remains a boundary, not authentication.
CLI is not an untrusted-agent IPC endpoint; `human:` syntax proves no identity.
Require explicit `--synthetic` for critical changes, no automated kill/reset,
and reuse current state-bound reset rather than inventing upload/approval tokens.
Do not await under DB writer locks. Read-only commands never create/migrate
stores. Validate final flags, kinds, integer epochs, bounded text and evidence;
file evidence requires a SHA256 locator, not raw file contents. Safe actionable
errors exclude stack traces, source bytes and credentials. Missing/changed
framework input is a failure, never fallback to installed latest or pin claims.
No process/provider/conformance result implies verified task completion.

### 6. Blast Radius & Rollback Plan

CLI JSON default changes only with approved explicit `--json` migration in
callers/tests. Public run APIs are additive; existing ledger/audit/kill APIs and
history remain compatible at v5. Old binaries reject v5 rather than downgrading.
Rollback uses a pre-upgrade copy/restore with reconciliation; never destructive
down-migration of new run/evidence history. Tests use temporary files under
`/tmp/opencode` and synthetic Git config, never actual sibling/credentials.
Push remains blocked; no remote publication or CI execution is claimed.
Actual framework installation is mismatched/unqualified; fixture conformance is
not real runtime qualification. Human drill/review and broader G1 obligations
remain separate; do not advance phase automatically.

### 7. Definition of Done (DoD)

Run and record exact scope/results in order:

```bash
bun run lint
bun run check
bun test --coverage
bun test tests/cli.test.ts tests/framework.test.ts tests/runs.test.ts
bun run drill
bun audit
```

Then trusted task-file secret scans, document/whitespace/protected-pin checks,
fixed-artifact `ishan-reviewer` advisory and persisted report. Restart affected
gates after corrections; maintain baseline100% functions/97.04% aggregate lines
or resolve a documented coverage gap before closure. Required missing checks
block affected completion. Record the actual framework mismatch, SSH push
blocker, unrun remote CI/human drill and next owner honestly. No commit/push or
G1 closure is inferred from this work package; retain explicit owner boundaries.

Execution evidence (2026-10-24–25):

- Post-commit continuation: authorized T-07 commit is
  `f888e6823c7ca67d8fb8a778d56c9b87b45d5a2b` (22 verified files); working tree
  clean immediately afterward. Subsequent [G1 evidence matrix](docs/g1-closeout.md)
  maps existing synthetic/native-process proof to exact-artifact CI, human drill,
  Ishan disposition and actual-installation handoffs. This is documentation-only
  discovery within T-07, not a new implementation phase or G1 approval. Closeout
  documentation commit was separately authorized by the owner; no G1 approval
  or push authority is inferred.
- Follow-up documentation validation: canonical document validator exit0
  (283 links/seven active sections/unique ADRs/casing/whitespace), three changed
  documents pass verified Gitleaks8.30.1 scans, `git diff --check` exit0.
  Persisted review hash and non-governance manifest identities remain unchanged.
  Application/typecheck/coverage/drill/audit were not rerun for this docs-only
  follow-up; fresh pre-commit results above still describe unchanged code.

- Acceptance reds reproduced the installed-revision/default-claim mismatch,
  one-byte skill drift, changed lock, duplicate ref keys, missing-status DB
  creation, absent run APIs/v5 schema, absent synthetic kill CLI and missing
  public drill command. Gates were built through the confirmed CLI/public API
  seams after those failures, not by executing framework runbooks.
- Additional native regressions reproduced stale reset planning after v5
  evidence append, inconsistent prior phase history being followed by a write,
  raw malformed VERSION content in failure diagnostics, local Git replacement
  refs substituting another tree under the selected commit, and an empty file
  evidence locator being accepted. These now reject at their shared owner.
- Fresh ordered gates (2026-10-25): `bun run lint` exit0 (26 files),
  `bun run check` exit0, `bun test --coverage` exit0 (142 tests/2079 assertions;
  functions100%, lines98.11%; framework92.78%, runs96.27%, store99.68%,
  policy98.00%, index100%). Baseline100% functions/97.04% aggregate lines is
  exceeded; store coverage remains99.68%. Fixture coverage is included in Bun's
  aggregate. CLI subprocess execution is not instrumented in that parent-library
  coverage summary; CLI behavior has direct real-process assertions.
- Declared focused command passes three consecutive runs:30 tests/141
  assertions each. Real competing phase writers produce exactly one open phase;
  existing contention/recovery/control/policy corpus remains in the full suite.
- `bun run drill` exit0: real subprocess trajectory covers framework→init→phase
  commit→awaiting-human→interruption→kill→denied write→plan/reset→stale-lease
  rejection. Output explicitly says `automated-fixture-only` and
  `verifiedTaskCompletion:false`, not human acceptance or task verification.
- `bun audit` exit0:14 packages/no advisories, no auto-fix. Runtime probes:
  Bun1.4.4, SQLite3.53.4, Git2.56.0. CI is configured for the same Bun and ordered
  offline checks; remote execution has not occurred because push is blocked.
- Subsequent legacy-output regression found a forged kill-status line embedded
  in a historical phase name. Human labels now neutralize controls before line
  assembly; JSON preserves escaped historical facts. Restarted ordered gates
  exit0:143 tests/2082 assertions,100% functions/98.11% lines; focused31 tests/
  144 assertions pass three runs; drill and audit pass. Source/test code is the
  fixed candidate for review; no unsafe output or history rewriting waived.
- Human execution/review of the drill, actual selected framework installation,
  SSH publication/remote CI, independent human review and G1 disposition remain
  explicit handoffs. No installation/re-pin, credentials, provider calls or real
  effects were used to manufacture qualification. Secret/document/protected-pin
  checks and fixed-artifact advisory are the remaining local closeout checks.
- Pre-review security/document checks (2026-10-25):21 scoped task files pass
  verified Gitleaks8.30.1 scans; archive digest/executable match the approved
  pin. Temporary scanner storage had expired and was recovered at that same
  digest, not upgraded. Document validator passes279 links/seven active sections/
  unique ADRs/casing/whitespace; CLI guide whitespace and protected-pin checks
  pass. Existing v1–v4 DDL and dependency versions remain byte/value-identical;
  prior review reports and sibling worktree remain unchanged. Explicit actual
  `check-framework` probe exits1 with selected-vs-installed commit mismatch,
  empty stdout and safe JSON reason; no installed skills/provider access is
  attempted after that mismatch. Advisory and final report scanning remain.
- [T-07 advisory](research/reviews/2026-10-25-p1-t07.md), review
  `T07-20261025-01-AI-01`, recommends READY FOR HUMAN REVIEW with no confirmed
  current-scope findings. Reviewed base `9f3241aa2186b1ac975f60eb09f7b367cee1fc68`
  plus immutable overlay `T07-20261025-01`, manifest SHA256
  `f27b710ed73deef65c2d3263f72adbccd9c3873774f8b0f27c76364c153e5c8c`.
  Pre-commit-authorization report (including parent custody/manifest)
  SHA256 `22e412a2336213b5208c66737c42d0b445774fe14d837512e9b8ce9eef4804f7`.
  Original advisory bytes are unchanged; durable embedded manifest matches the
  frozen payload and current source/test/fixture/CI/guide hashes. Workspace
  review copy removed after archive byte-match; no snapshot copies belong in
  the task diff. Human disposition, commit, T-08/G1 and actual qualification
  remain pending; neither T-06 approval nor AI advice transfers authority.
- Authorized T-06 push was retried on2026-10-25 and again failed exit128 with
  SSH public-key authentication denial. No successful publication, remote CI,
  changed remote or credential inspection claimed. Owner still owns access
  restoration, matching installed framework and attributable human drill.
- Final local closeout (2026-10-25): post-review lint/strict check,143-test
  coverage (2082 assertions;100% functions/98.11% lines), focused31/144,
  automated drill and dependency audit pass again. All22 task files, including
  the persisted advisory/custody manifest, pass verified Gitleaks scans; document
  validator passes281 links/seven active sections/unique ADRs/casing/whitespace.
  Report and embedded manifest hashes match; all reviewed non-governance files
  remain byte-identical. Protected pin/dependency/prior-review checks and
  `git diff --check` pass; no workspace review copies remain. This completes
  local implementation evidence only: uncommitted, human disposition and
  qualification handoffs pending, no T-08/G1/production advancement.
- **Commit/continuation authority (2026-10-25):** owner stated “pushed, commit
  T-07 and continue”. T-06 publication is owner-reported, not independently
  verified: `git ls-remote origin refs/heads/feat/p1-policy` still fails SSH
  authentication for this agent. No remote CI result is inferred. Owner
  explicitly authorizes T-07 commit; this does not supply Ishan disposition,
  human drill evidence or T-07 push authority. Fresh declared ordered gates pass
  with143 tests/2082 assertions, focused31/144, automated drill and clean audit;
  reviewed code/test/CI hashes remain unchanged. Continue G1 closeout evidence
  and discovery, not automatically into T-08/P2 implementation or live effects.
  Authorization-appended report SHA256:
  `3a87e11556e47c4c818ba9eaa45c58a7dd2c0a29d7c9c8b27112481bfcb850f0`.

## T-06 completed execution record (historical)

- **Work package:** P1 / T-06 policy, grants and budgets, started 2026-10-24.
- **Authority:** owner requested “commit and continue” after T-05 approval and
  confirmed the additive effect gate, root/grant boundary, deny/ask budget
  breach, no schema v5, risk subset and public test seams.
- **Baseline/branch:** clean `aa4872b`, `feat/p1-policy`; T-01–T-05 approved as
  relayed by the owner. No push/production/provider/real-effect authority.
- **Status:** implementation, ordered code gates and corrected fixed-artifact
  advisory verified with no open confirmed findings; approved by Ishan as relayed
  by the owner, who explicitly authorized the T-06 commit. G0 closed, G1 open.

### 1. Phase Objective & Scope

Add one additive synthetic effect-admission point, `authorize(db, request,
policy)`, that evaluates kill → deadline → grant → policy/risk/budget → lease,
then draws the tool-call budget and writes attributable audit rows. Keep the
approved T-02 `writeGate` as the ledger/bookkeeping gate; it is not effect
authorization. Root/supervisor requests are policy-only; delegated requests need
a live narrowing grant. Deny-wins ACL rules are global→run→thread; grants can
only narrow policy. Every relay dispatch is authorized again; no reusable allow
token. Budget caps fail closed with deny/ask plus an audited breach; automatic
kill is deferred. Add grant mint/query, budget limit/read/draw, usage metering
and retry-bucket primitives on the existing v4 tables. No schema v5, live
provider, real adapter, CLI critical command, automatic kill, production
containment or G1 closure. T-07 owns CLI harden/conformance; P2/P3 own real
workers, live usage and spawn/live-thread integration.

### 2. Environment & Upstream State

Baseline is clean `aa4872b`: Bun 1.4.4, SQLite 3.53.4, lint/typecheck pass,
86 tests/719 assertions, 100% functions/95.78% lines, audit clean (14 packages).
No runtime/dependency upgrade. Reuse the existing synchronous immediate/
savepoint behavior and v4 DDL; never await under a DB writer lock. Policy config
is trusted host input; stored observables are audit/usage/lease/grant rows.
Gitleaks 8.30.1 remains a temporary verified download, not a committed tool.
Installed `bun-types/sqlite.d.ts` transaction declarations and official
`bun-v1.4.4/src/js/bun/sqlite.ts` deferred/immediate/savepoint wrappers were
rechecked; fresh runtime probes confirm Bun 1.4.4 and SQLite 3.53.4. Temporary
Gitleaks was re-downloaded after session temporary storage was cleared; official
8.30.1 checksum again matches the pinned Linux x64 archive digest
`551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`.

### 3. Architecture & File Manifest

| File | Responsibility |
| --- | --- |
| `src/policy.ts` | Pure deny-wins rule matching, workspace-relative path invariant, risk scoring defaults, exported policy types/config |
| `src/store.ts` | `authorize` orchestration, lease check reuse, grants, budgets/usage/retry draws, policy/budget audit rows, per-dispatch relay gate |
| `src/index.ts` | Export new policy/budget/grant/effect-gate types and seams |
| `tests/policy-corpus.test.ts` | Policy decision table, path/compound-shell adversarial cases, risk terms, grants, deadlines, budgets, audits |
| `tests/fixtures/relay-policy.ts` | Explicit synthetic ACL, root/deadline and meter-only call-budget fixture shared by relay regressions |
| `tests/outbox.test.ts` | Explicit policy for relay; per-dispatch denial/cap regressions |
| `tests/write-gate.test.ts`, `tests/kill.test.ts` | Preserve T-02/T-05 behavior; prove bookkeeping gate remains separate |
| `SPEC.md`, `ROADMAP.md`, `decisions.md` | Authority, contract, evidence |
| `research/reviews/2026-10-24-p1-t06*.md` | Access record, preserved initial advisory and corrected-artifact re-review; human disposition separate |

Callers traced: `writeGate` serves transition/lease admission; `relayBatch`
is the only native dispatch loop and currently calls `writeGate` per item;
`openAction`/`recordVerdict`/`recordFinish` own action-history transitions.
`authorize` uses the existing audit lifecycle via its private row inserter so a
kill denial can still be recorded as a terminal policy event. Existing v4
budgets/usage/grants tables are unexercised by earlier native APIs; no migration.

`EffectRequest` carries a required `context`, tool, 1–100 targets, target type
(path/command/domain/opaque), absolute deadline and optional parent deadline,
root-or-grant authority, tier, action class and trusted production/data-egress
flags. These are host classifications, not model claims or authentication.
`RelayPolicy` extends ACL config with deadline/parent deadline/authority;
`relayBatch(db, context, policy, adapter, limit?)` is the exact new signature.
The fixed synthetic adapter identity still cannot name a production target.

`setBudgetLimit` explicitly configures a run/kind (`null` means meter-only);
missing tool-call/draw configuration is an error, never a permissive default.
`getBudget` reads counter+usage in one short snapshot and checks agreement.
`drawBudget` atomically reserves without recording denied spend; `recordUsage`
always records actual spend, including after kill/overage. Once present, token/
minor-unit caps at or above the limit block subsequent effect admission. Cost
budgets are optional until explicitly configured; no cost measurement or pricing
is inferred from a synthetic call. `threads` draws are cumulative reservations,
not a live-thread count. `drawRetry` requires safe transient classification and
configured call/retry rows: capacity=max(10,floor(total calls/5)), consumed draws
expire after 60 seconds. Static explicit retry caps also apply.

Policy decisions have their own UUID audit action, separate from effect history.
A completed `policy:<target-digest>` action means the decision was recorded,
never that the effect executed. Every synthetic allow is logged (including reads)
to support recorded novelty. Only prior allowed decisions remove novelty; an ask
cannot silently downgrade itself on retry. Pending asks need separate human
disposition and do not create reusable approval tokens. Network egress has an
unoverridable ask/high-risk floor. Risk weights/thresholds are fixed R-20 defaults
in this slice; session decay/calibration and CLI configuration are later work.

### 4. Test Plan & Coverage Matrix

- Unit/policy table: exact/wildcard anchored matching; global/run/thread
  specificity; deny-wins; defaults ask/deny; compound shell allow suppression;
  `..`/absolute escape and secret-adjacent denial; default policy.
- Risk table: tier, outside/secrets/prod/egress/fan-out/novelty/prior-deny/
  irreversibility terms; 0–100 cap; escalate-40/block-75 decisions.
- `authorize`: allow, ask, deny, kill, expired/inherited deadline, missing/
  expired/mismatched grant, valid narrowing grant, invalid/expired lease, budget
  cap, meter-only, audit sequence and no raw target in evidence.
- Budgets/grants: limit upsert/read, atomic draw, over-cap denial, post-spend
  usage recording, retry bucket capacity/expiry, grant creation audit, malformed
  input and rollback.
- Relay: explicit policy required; allow dispatches once; deny/ask/budget breach
  prevents adapter call; per-item recomputation; kill mid-batch; existing
  outbox replay/cursor/unknown contracts retained.
- Process: two real subprocesses race one capped draw against a file DB; exactly
  one succeeds, usage/counter agree, no overdraw; failure output sanitized.
- Regression: T-02 writeGate still kill→lease; T-05 kill/reset/CLI status
  unchanged; outbox tests updated only for the explicit policy argument.

SQL is used only in fixtures/history assertions; behavior goes through public
APIs. Required coverage must not fall below the 100% functions/95.78% lines
baseline; focused policy/outbox/kill tests must pass repeatedly.

### 5. Security, Observability & Edge Cases

- Mechanical path invariant: normalize workspace-relative paths; deny `..` or
  absolute escape before policy; deny `.env`/key/DB-like secrets; symlink
  physical resolution remains supervisor/adapter-owned and is documented.
- Commands: exact/wildcard target patterns; any shell control operator removes
  allow eligibility, so `git *` cannot authorize `git status && rm`.
- Grants are scoped run/thread/tool/pattern, expire, never widen policy, and are
  minted with an audit row. Direct host SQL remains trusted; API inserts only.
- Deadlines are absolute and child ≤ parent; expired requests deny. Lease checks
  use the existing owner/epoch/run/expiry rules. Kill remains first and human-
  attributed; no automatic budget kill.
- Every ask/deny writes request+verdict audit rows; synthetic allows write
  decision completion too. Evidence carries score/breakdown/reason, never raw
  targets or secrets. Budget crossings write `budget-breach` audit actions
  with kind/counter evidence.
- Fail closed on malformed context/config, absent cap row (meter-only only when
  explicitly unset), malformed stored counters/grants, duplicate grants, invalid
  budget arithmetic and adapter outcomes. No fallback allow, provider login,
  network call or real effect.

### 6. Blast Radius & Rollback Plan

Additive API and one explicit relay signature change (`policy` required before
`adapter` and `limit`). Existing callers/tests must pass policy; no default permissive policy
is injected. No schema or migration change; budgets/usage/grants are existing v4
tables. Synthetic tests use throwaway file/`:memory:` DBs and `/tmp/opencode`;
no repo DB, credentials, provider state or production path. Rollback is reverting
the T-06 source/test/export/docs diff; v4 data remains compatible and idle.
Residual risk: trusted host SQL/clock/context/evidence, lexical-only symlink
handling, in-flight actions after kill, unresolved ask rows blocking reset until
resolved, cumulative `threads` draw (live release deferred), and no production
containment/identity/restore qualification.

### 7. Definition of Done (DoD)

Run in order and record exact results:

```bash
bun run lint
bun run check
bun test --coverage
bun test tests/policy-corpus.test.ts tests/outbox.test.ts tests/write-gate.test.ts tests/kill.test.ts
bun audit
```

Also run the fixed-artifact `ishan-reviewer` on the final candidate, persist the
report under `research/reviews/`, run trusted Gitleaks scans on task files, the
SPEC document validator, `git diff --check` and a protected-file review. Required
checks must pass; unavailable checks block. Human disposition remains separate.
No commit/push is implied by this contract; commit only on explicit instruction.

Execution evidence (2026-10-24):

- Initial public acceptance red: `bun test tests/policy-corpus.test.ts` exit1,
  six failures because the new public APIs were absent (not an import failure).
  The inherited draft pure evaluator existed before acceptance tests; no claim
  that those draft lines were written test-first. New gate/budget behavior was
  added after the public acceptance red.
- Focused regression reds reproduced novelty ask→allow, stale pre-lock clock,
  split-snapshot budget status, over-cap continued admission, relay lease before
  deadline, wildcard compound shell/secret near-misses, grant binding corruption
  and retry timestamp-zero exhaustion. Each now passes via the public seams.
- Final ordered checks: `bun run lint` exit0 (20 files), `bun run check` exit0,
  `bun test --coverage` exit0 (108 tests/1895 assertions; functions100%,
  lines97.06%; store99.78%, policy98.00%, framework87.50%, index100%). Aggregate
  lines exceed the95.78% baseline and functions remain100%; store's99.85%
  baseline versus99.78% now reflects added guards, not removed safety tests.
  Fixture coverage is reported separately by Bun and included in its aggregate.
- Exact declared focused command passes three consecutive runs:78 tests/
  1618 assertions each. Includes real process draw contention, deadline lock
  wait, concurrent snapshot status and prior crash/recovery regressions.
- `bun audit` exit0:14 packages, no advisories; not a full security/license
  assessment. Ten scoped task files pass verified Gitleaks8.30.1 scans (exit0,
  no findings); the document validator passes277 links/seven active sections/
  unique ADR IDs/casing/whitespace. Schema/migration source and protected
  dependency/config/CLI/framework files match `aa4872b`; `git diff --check`
  exits0. Advisory persistence and final report scanning remain closeout checks,
  not implied by passing application tests.
- A strict-typecheck failure from an overly broad subprocess test handle and a
  recursive fault-trigger fixture were corrected in tests. Gates restarted
  from lint; earlier failed runs are not relabelled as passing evidence.
- Initial fixed-artifact advisory `T06-20261024-01-AI-02` requests R-001
  (literal-star wildcard deny bypass), R-002 (SQLite sidecars not classified as
  DB secrets) and R-003 (call-cap check follows lease). Reports preserved under
  `research/reviews/2026-10-24-p1-t06-initial.md` and the separate access-only
  record. Remediation requires public failing regressions, ordered gates and a
  new fixed candidate/re-review; existing passing gates do not waive findings.
- Corrected candidate: `bun test tests/policy-corpus.test.ts -t 'R-00'` first
  failed four intended regressions; a separate R-001 public admission red
  returned allow under a wildcard deny. Shared matcher now treats `*` before
  literal equality; DB classifier denies SQLite `-wal`/`-shm`/`-journal`
  companions; shared budget-state precheck runs before lease without consuming
  usage, while the atomic draw remains after lease. All four regressions now
  pass (40 assertions). No waiver or scope change.
- Corrected ordered gates exit0: lint20 files; strict check;112 tests/1935
  assertions,100% functions/97.04% lines (store99.68%, policy98.00%); declared
  focused82 tests/1658 assertions pass three consecutive runs; audit14 packages/
  no advisories. Baseline100% functions/95.78% lines remains exceeded overall;
  new defensive rejection branches are reported uncovered, not omitted.
- Workspace review copies interfere with repository-wide formatter discovery.
  A lint attempt failed on copied manifest indentation; owned copy was removed
  only after byte-matching its preserved archive, then gates restarted. No lint
  exclusion/config change, source rewrite or skipped safety test was used.
- [Corrected T-06 advisory](research/reviews/2026-10-24-p1-t06.md), review
  `T06-20261024-02-AI-01`, marks R-001–R-003 resolved, no new/open confirmed
  finding, READY FOR HUMAN REVIEW. Base `aa4872b5acbcd92b93ef1c62c13a774d4f0915d9`
  plus immutable overlay `T06-20261024-02`, manifest SHA256
  `546f9f058458c648bd40190279a2eb98a8ba3c56a48e71e0c358e924ff8916df`;
  pre-approval report SHA256
  `40ad3bbcafd10677e257234b37103327df796606e6bd643d10e202e12367aad1`.
  Reviewed source/test/fixture hashes match current files; read-only workspace
  copy removed after byte-match to preserved temporary archive. Initial
  substantive report remains unchanged. Human disposition/commit/push and
  any later-slice/provider/production authority remain pending, not inferred.
- Final post-persistence checks: declared ordered gates pass again (112 tests/
  1935 assertions; focused82/1658; audit clean). All13 task files, including
  three review records, pass verified Gitleaks8.30.1 scans; document validator
  passes279 local links/seven active sections/unique ADRs/casing/whitespace.
  Report/source/test/fixture hashes match the corrected artifact; no review
  copies remain in the task diff. Schema/protected-file and `git diff --check`
  comparisons pass. These are parent-executed hygiene/correctness checks, not
  independent human sign-off or production qualification. No commit/push or
  T-07 advancement performed; await Ishan disposition and owner instruction.
- **Approval record (2026-10-24):** owner stated “Approved by Ishan, commit”
  after the corrected T-06 handoff. Approval applies to overlay
  `T06-20261024-02` and its recorded manifest; R-001–R-003 remain resolved.
  This is owner-relayed approval, not a direct signature or independently
  verified identity. Fresh pre-commit lint/strict check,112 tests/1935 assertions
  (100% functions/97.04% lines), focused82/1658 and dependency audit pass;
  reviewed source/test/fixture hashes remain unchanged. Appended report approval
  and governance records are the only post-review disposition changes.
  Approval-appended report SHA256:
  `5bdc73fa0da1dba40c2e5e77a9800b8f43f16d4de52daff31637a06612ff7e71`.
  Commit authorized for T-06 only; no T-07 continuation, push, G1 closure,
  production/provider use or real effects.
- Approval-closeout checks:13 verified Gitleaks scans pass, including the
  appended approval records;279-link document/structure validator and protected
  files/whitespace checks pass. Pre-approval advisory bytes are unchanged;
  only the attributed approval appendix was added to the final report.
- **Owner continuation (2026-10-24):** T-06 committed as `9f3241a`; owner
  subsequently requested “push and continue”. Push of `feat/p1-policy` to
  configured `origin` failed (exit128): `Permission denied (publickey)`;
  the SSH askpass executable was also unavailable. No successful publication
  is claimed. Remote/credentials were not changed or inspected. Next owner:
  repository owner restores authorized SSH access before a push retry.
  Local T-07 discovery began on clean `feat/p1-cli-conformance` from `9f3241a`;
  public/security seams require confirmation before its active contract and
  application/test changes. No provider/real effect or G1 closure authorized.
- T-07 discovery: current init/re-init both exit0, missing-DB status creates
  a database, and check-framework exits0 despite the configured framework
  sibling being at4.0.0 rather than pinned2.1.0. All reproduction state was
  throwaway. Pinned Git-object sources, not sibling working files, define the
  expected skill-lock/hash contract; no sibling edits, install or re-pin.
  Fresh baseline lint/strict check/112-test coverage and dependency audit pass
  (1935 assertions;100% functions/97.04% lines;14 packages/no advisories).

## T-05 completed execution record (historical)

- **Work package:** P1 / T-05 synthetic kill engage/reset, started 2026-10-24.
- **Authority:** owner requested “commit and continue”; confirmed scoped v4
  binding/history migration, guarded synthetic reset and public test seams.
- **Baseline/branch:** clean `08292d9`, `feat/p1-kill-switch`; T-02/T-04 approved
  as relayed by owner. No push/production/provider/next-slice authority.
- **Status:** implementation, ordered code gates and fixed-artifact re-review
  verified; T-05 approved by Ishan as relayed by the owner and committed in
  `f955622`. T-06 contract/discovery authorized by “commit and continue”.
  G0 closed, G1 open.

### 1. Phase Objective & Scope

Atomic global/per-run admission stop: revoke scoped leases, latch kill, deny only
undispatched native approvals/actions, cancel linked undispatched intents and halt
relay through its existing live gate. Keep admitted effects unresolved/observable.
Separate fresh-plan synthetic reset, never automatic re-grants/resurrection.
Add kill state to CLI status, but no CLI engage/reset command (T-07). Production
identity/transport, execution cleanup, providers, full policy and G1 closure remain
unqualified. This is trusted-host synthetic control, not runtime containment.

### 2. Environment & Upstream State

Fresh clean baseline: lint exit0 (16 files), strict check exit0, full coverage
exit0 (60 tests/555 assertions; functions100%, lines95.76%, store99.78%, framework
87.50%, index100%), audit exit0 (14 packages/no advisories). Bun1.4.4/SQLite3.53.4;
no runtime/dependency upgrade. Reuse verified synchronous immediate/savepoint and
WAL/FULL behavior; never await under a DB writer lock. R-17 is design context,
not proof of implemented containment. Gitleaks8.30.1 remains temporary, pinned
archive digest/executable must be verified before scans.
Installed Bun transaction declarations and official `bun-v1.4.4/src/js/bun/sqlite.ts`
controller/wrapper source rechecked against the unchanged runtime; fresh
`SELECT sqlite_version()` confirms3.53.4. Default read snapshots, immediate writers
and rollback/savepoint behavior are exercised by the current corpus, not assumed
from current upstream main.

### 3. Architecture & File Manifest

| File | Responsibility |
| --- | --- |
| `src/store.ts` | Exact v4 migration, persisted lease run binding, immutable control triples/denials, engage/status/reset plan/reset, audit/outbox cancellation integration |
| `src/index.ts` | Export kill types/seams, retain existing normal APIs |
| `src/cli.ts` | Show global/run kill state in status JSON; no critical operator command |
| `tests/kill.test.ts` | Owner-confirmed control/gate/lease/audit/outbox/status and process seams |
| `tests/fixtures/schema-v3.sql` | Independent additive v3 DDL snapshot layered over known-v2 fixture |
| `tests/schema-v2.test.ts`, `tests/write-gate.test.ts`, `tests/outbox.test.ts` | Advance current version; explicit column fixtures/run identities, preserve substantive assertions |
| `SPEC.md`, `ROADMAP.md`, `decisions.md` | Scoped authority/contract/evidence |
| `research/reviews/2026-10-24-p1-t05.md` | Fixed-artifact advisory, human disposition separate |

Callers traced: isKilled serves writeGate/acquisition; no engage/reset exists.
leases omit persisted run; audit forbids second verdict; outbox lacks cancelled
projection. Address those owners once rather than inventing identities, revoking
unrelated runs or treating admitted work as not-executed. Existing v2/v3 DDL,
facts and immutable guards preserved; v4 is additive and versioned atomically.

**Exact interface/invariants:**
- `scope` is exactly global or run:<validated runId>; no thread/prefix matching.
  Kill operations require explicit `synthetic:true`, human: actor, bounded reason
  and evidenceRef. Trusted host must establish actual human authority; syntax and
  fixture flag do not authenticate a human or qualify production operations.
- v4 adds nullable leases.run_id, nullable kills.event_id, immutable kill_events
  and kill_denials. Unknown legacy lease-run/latch identities stay NULL; don't
  fabricate authority. Native acquisition binds run; live same-owner renewal
  must match run. Unknown/cross-run bindings cannot authorize/renew native writes;
  trusted cleanup or expiry then fresh acquisition increments epoch normally.
- Kill events are a dedicated critical control audit: three immutable rows per
  operation (requested → allowed → completed), one operation UUID, matching scope/
  actor/reason/evidence, ordered IDs. Completed means its whole local transaction
  committed, not process containment. Global controls use explicit global scope,
  never fabricated run/thread identities. Legacy latch adoption preserves prior
  latch values in immutable command evidence before establishing native history.
- `engageKill(db,{scope,actor,reason,evidenceRef,synthetic:true})` requires no caller
  transaction and executes one immediate transaction. Idempotent while the native
  latch remains active; repeated engage returns original latch, not changed reason.
  A legacy flag may be re-engaged to establish audited native state, never silently
  reset. Validate scoped histories before committing; any error rolls back the
  complete local operation and must not be reported as successful kill.
- Revoke all scoped bound lease rows (global includes unknown legacy rows): expire
  to0, increment healthy safe epoch. Invalid/exhausted epochs remain ungrantable,
  expired, and reported; never overflow/repair them into valid authority. Run kill
  does not modify unrelated bound leases; unknown run leases already cannot admit.
- Freeze pending/escalated/allowed unresolved native actions only when NO outbox
  dispatch attempt was EVER admitted. Append denied/not-executed with kill actor
  and immutable kill-event evidence. Only private kill-denial path permits this
  allowed→denied exception; ordinary recordVerdict still rejects duplicate verdicts.
  Readers verify the immutable kill link and scope; resetting a latch does not
  invalidate historical proof. Any admitted attempt, even later not-applied,
  remains excluded from this automatic non-execution inference.
- Outbox derives cancelled only from a verified linked kill denial and zero
  attempts; malformed contradictions fail closed. Intent/events stay immutable.
  Cancelled intents remain queryable but not unresolved relay work; resetting
  never resurrects them. New native requests/allow/escalation during kill reject;
  finish and reconciliation remain recordable for already admitted facts.
- `getKillStatus(db,runId?)` reports global/run latch and blocked flag; validates
  native control triple/reference, distinguishes legacy flag without audit. Gate
  continues presence-based fail-closed denial, even malformed descriptive data.
  Both scope reads share one short synchronous SQLite snapshot, never mixed states.
  CLI status includes kill state before transition fields, including no-transition
  response. Host CLI is not a replacement for T-07 trusted critical controls.
- `prepareKillReset(db,{scope})` requires active native latch; returns exact
  triage snapshot/digest: in-scope native action heads, all outbox intents/attempts
  (including unknown attempts behind an applied intent), leases, relevant latch/
  control state. Identify cancelled undispatched work separately from unresolved
  admitted effects. Block reset on non-terminal native actions or unresolved
  admitted attempts. Unknown legacy claims remain visible as unattributed history,
  never invented dispatch proof. No exposure of raw secrets or credential stores.
- `resetKill(db,{scope,actor,reason,evidenceRef,cleanupEvidenceRef,snapshotHash,
  synthetic:true})` refuses caller transactions, non-human syntax, missing evidence,
  stale plan, unresolved native work or legacy/unbound latch. In one immediate
  transaction recompute exact plan, record a separate critical control triple and
  clear ONLY that latch. Cleanup/refreshed verification evidence is trusted host
  attestation for disposable fixtures, not independently proven containment.
  Concurrent observations/changes invalidate old plans; no network verification
  under lock. Fresh preparation after reconciliation required.
- Reset never restores epochs, leases, approvals or intents. Another active kill
  scope still blocks. Lease acquisition/cleanup and late facts remain their explicit
  host-bookkeeping exceptions. Full operator identity, real cleanup and production
  reset qualification stay later gates, not replaced by a Boolean or actor string.

### 4. Test Plan & Coverage Matrix

Confirmed engageKill/prepareKillReset/resetKill/getKillStatus plus gate, lease,
audit/outbox APIs and CLI status. SQL only migration/malformed/kill fixtures and
history assertions; actual processes for restart/contention, no private mocks.

| Scenario | Required proof |
| --- | --- |
| Migration/binding | Known v3 preserved, NULL legacy run stays unknown, current v4 registry/guards exact and atomic |
| Scoped kill | Global/run latch + epoch expiry + undispatched denial/cancel commit together; unrelated run unaffected |
| In-flight honesty | Kill between batch items blocks later dispatch; late results preserved, admitted actions never denied/not-executed |
| History | Immutable critical triples/denial links, duplicate ordinary verdict still rejected, historical links survive reset |
| Admission | Kill denies new requests/allowances/renewal/writes; scoped live run binding enforced; cleanup/late evidence available |
| Reset | Fresh snapshot and host human evidence required; stale/unresolved/legacy plans reject; no re-grants/resurrection |
| Failure/recovery | Throw/lock/corruption leaves atomic state, reopen retains latch and revoked epochs, competing engage/reset serialize |
| CLI/compatibility | Status shows kill even without transitions; old data/guards preserved, fixture adaptations explicit |

Test-first vertical slices, owned disposable state under `/tmp/opencode`; no real
effects/provider calls or invented human/environment verification.

### 5. Security, Observability & Edge Cases

Parameterized SQL, bounded runtime context/evidence, no raw input/row/error dumps.
Only trusted host calls critical functions; executable agents/production channels
remain disabled. Kill is local admission closure, not rollback or proof a process
stopped. Invalid storage/history can fail the whole operation: report explicit
failure/escalate rather than claim partial success. Exhausted/invalid leases are
expired but not repaired/re-granted. No silent reset, trigger bypass, audit deletion,
fabricated legacy identities or universal cleanup/latency guarantee.

### 6. Blast Radius & Rollback Plan

Additive v4: old binaries refuse; migration preserves existing rows/DDL. New binding
invalidates unknown legacy native-write authority intentionally; operator must
release/expire and reacquire. Kill-specific cancellation is terminal; use new
action/intent after reset, never rewrite history. Rollback only via verified backup
restore to separate disposable state with post-migration facts retained for triage;
no downgrade/delete path. No production migration/backup/restore authorized.

### 7. Definition of Done (DoD)

`bun run lint` → `bun run check` → `bun test --coverage` →
`bun test tests/kill.test.ts` → `bun audit` → verified task-file Gitleaks scans,
all exit0. Compare fresh 60-test/95.76% baseline and per-file functions/lines;
preserve all substantive regressions, no skipped/suppressed coverage. Historical
document-validator heredoc, `git diff --check`, protected package/lock/config/pins/
.github/.opencode/prior-review comparisons pass. Review exact fixed candidate with
ishan-reviewer, persist evidence/report, human approval separate. Leave T-05
uncommitted unless requested; no push/live effects/providers/G1 closure/next slice.

**Execution evidence (2026-10-24, Bun1.4.4 / SQLite3.53.4):**
- Observed intended reds before implementation: intact v3 remained3; cross-run
  writer accepted same lease; missing engage/status and prepare/reset exports;
  kill left undispatched approvals pending; CLI omitted kill state. Each seam
  implemented after its acceptance failure, not fixtures/import failures.
- Additional public red: orphan outbox observation did not invalidate historical
  kill non-execution proof. Any outbox event now refutes automatic non-execution,
  including malformed orphan evidence; shared action-history validation owns this
  proof and outbox cancellation reuses it instead of duplicating impossible guards.
- Status stress at public getKillStatus found210 false clears while an atomic
  legacy scope-switch fixture always retained one kill. One short read transaction
  fixes mixed global/run snapshots; the regression runs1000 fixture flips/100000
  reads, with no false clears. An earlier larger native-control stress probe hit
  the default5s fixture timeout; minimized to this bounded direct status fixture,
  removed its owned leftover state, and did not raise timeouts or skip safety tests.
- Crash/reset process fixture initially hit SQLITE_BUSY_RECOVERY during concurrent
  connection setup, before reset. Captured cause, staged participant opens before
  the readiness barrier, then raced real reset calls; no retry loop or new runtime
  assumption added to application code. Ordinary SQLite busy remains caller-owned.
- Final `bun run lint`: exit0 (17 files); `bun run check`: exit0;
  `bun test --coverage`: exit0,82 tests/697 assertions,100% functions,95.78% lines
  (baseline95.76%); store99.85% (99.78%), framework87.50% and index100% unchanged.
  Prior60 tests retained; current-version/column fixtures explicitly updated forv4.
- `bun test tests/kill.test.ts`: exit0,22 tests/142 assertions; three consecutive
  focused runs pass. Covers v3 preservation, binding, global/run scope, immutable
  triples/denials, any-admission exclusion, late facts, cancellation, unresolved
  attempts behind applied intents, stale reset digest, no re-grants/resurrection,
  corrupt history, SQL fault rollback, CLI status, abrupt exit and competing resets.
- `bun audit`: exit0,14 packages/no advisories; no install/upgrade/auto-fix.
- Verified Gitleaks8.30.1 archive digest
  `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`
  and executable bytes before task-file scans. Exact command pattern:
  `env -i PATH=/usr/bin:/bin <verified-gitleaks> dir <file> --no-banner --redact=100 --ignore-gitleaks-allow --gitleaks-ignore-path /tmp/opencode/loom-t01-no-ignore`.
  Task-file scans clean; final review/governance edits require rescan.
- Document-validator/protected-file/whitespace checks pass. No real operator
  authentication, execution-domain containment/cleanup, provider, production
  restore, timeout/power-loss guarantee, full policy or G1 closure claimed.
- Additional revocation reds: a NULL-key legacy lease was skipped by per-key
  equality UPDATE, and an ignored UPDATE still reported success. One scope-wide
  parameterized UPDATE now handles NULL keys without guessing identities; verify
  matched row count or roll back the complete control operation. Final ordered
  gates restarted and pass: lint17 files, strict check,84 tests/702 assertions,
  100% functions/95.78% overall lines/store99.85%; focused24 tests/147 assertions
  pass three consecutive runs; audit14 packages/no advisories. Earlier82-test
  evidence is historical, not substituted for this corrected-candidate proof.
- Initial [T-05 advisory](research/reviews/2026-10-24-p1-t05-initial.md) requested
  R-001: ignored kill-denial link INSERT could commit incomplete history. Its
  adjacent question about ignored legacy-latch adoption was also reproduced.
  Exact red command `bun test tests/kill.test.ts -t "ignored kill-denial|ignored legacy latch"`
  produced2 false-success failures. Both writes now require exactly one changed
  row; engagement also verifies the persisted latch points to its own completed
  control event. Public regressions assert complete rollback of lease/action/
  intent/latch/control history, including dropped-reference fault after upsert.
- Corrected ordered gates pass: lint17 files, strict check,86 tests/719 assertions,
  100% functions/95.78% lines/store99.85%; focused26 tests/164 assertions pass
  three consecutive runs; audit14 packages/no advisories. Original84-test
  advisory snapshot preserved.
- [Corrected T-05 re-review](research/reviews/2026-10-24-p1-t05.md) (report
  SHA-256 `69921687f9c33340b389b0a56178e281592bb7df81f4618c5f8ad04c6263690d`)
  marks R-001 and the adjacent legacy-latch question resolved, with no open
  confirmed finding. Reviewed source/test/fixture hashes matched current files;
  the uncommitted candidate snapshot was removed after its archive matched.
  Report persistence changed only one Markdown hard-break trailing space; the
  appended approval record changes only disposition/authority text.
- **Approval record (2026-10-24):** owner stated “approved by Ishan, commit and
  continue” after the candidate handoff. T-05 implementation/re-review committed
  as `f955622bf1c277bd914b1e738a28a5475164cb9d`; this is owner-relayed approval,
  not a direct signature or independent identity verification. It closes T-05
  only, not G1. The same instruction authorizes T-06 contract/discovery and
  synthetic implementation, subject to confirmed public/security seams. No push,
  production/provider use or real effects authorized.
- T-05 closeout checks: all13 task-file scans with the verified Gitleaks binary
  exit0/clean; historical document validator passes (277 links, seven active
  sections, unique ADRs/casing/whitespace); `git diff --check` and protected-file
  comparison exit0. These establish documentation hygiene only, not production
  identity, containment, restore or provider qualification.

## T-04 completed execution record (historical)

The approved T-04 implementation below is `d0a02dd`, approval closeout `08292d9`;
current T-05 contract above governs the additive kill/binding/cancellation changes.

- **Work package:** P1 / T-04 synthetic outbox, started 2026-10-24.
- **Authority:** “commit and continue”; owner confirmed synthetic v3 migration,
  immutable intent binding, conservative replay and public test seams.
- **Baseline/branch:** clean `39cb915`, `feat/p1-outbox`. T-02 was pending at
  slice start; owner subsequently relayed Ishan's approval, recorded below.
- **Status:** implementation and ordered code gates verified; fixed-artifact AI
  re-review has no open confirmed findings. T-04 approved by Ishan as relayed by
  the owner after commit `d0a02dd`; T-02 also approved through the owner. G0 closed,
  G1 open.
  No live effects/providers.

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

**Approval record (2026-10-24):** following the `d0a02dd` commit handoff, owner
stated “Approved by Ishan”. Attribute this to the corrected T-04 implementation
and re-review in `d0a02ddb4a8b5577d5e7629242e67adab2a5053c`; preserve initial
R-001 report and its resolved history. This is owner-relayed approval, not a direct
signature or independent identity verification. It does not retroactively approve
T-02, close G1, enable real effects/providers or authorize push/another slice.
Approval-record edits remain uncommitted pending instruction. Documentation-only
validation applies; no application behavior changed.
Approval-record checks: historical Python document-validator heredoc exit0
(270 links, seven active sections, unique ADRs/casing/whitespace); verified
Gitleaks 8.30.1 four-file scans exit0/no leaks; `git diff --check` and unchanged
application/tests/config/prior-report comparison exit0. Application tests/typecheck/
dependency audit N/A for this documentation-only approval record, not rerun.

**T-02 approval clarification (2026-10-24):** owner subsequently stated “T-02
also approved by Ishan”. Record approval of the T-02 implementation/advisory in
`39cb91549c7623601d76e43258684ab2027b7856`, preserving its original AI report.
This supersedes T-02 pending-status references above and in historical handoffs;
T-02 and T-04 are both approved as relayed by the owner, without independent
signature/identity verification. No commit, push, next slice, G1 closure or live
effect authority inferred. Approval-record edits remain uncommitted. Documentation
validator, five-file trusted scan and whitespace/protected-code checks pass;
application/typecheck/dependency gates N/A for these document-only changes.

**Owner continuation (2026-10-24):** owner requested “commit and continue” after
both approval records. Commit the T-02/T-04 owner-relayed approval documents, then
begin T-05 contract/discovery on a new feature branch; no push, G1 closure or real
effect/provider use. Document validator, trusted five-file scan and whitespace/
protected-code checks pass; no application/test changes in this approval commit.

## T-02 completed execution record (historical)

Historical T-02 implementation/authority below describes `39cb915`; its then-pending
human review is superseded by the approval record above. Current work is governed
by the active T-04 contract above until the T-05 work package is specified.

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
