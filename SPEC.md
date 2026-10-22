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

- **Work package:** P0 G0 closure preparation and review remediation, 2026-10-22.
- **Authority:** user authorized starting P0 after PR #1 merged; confirmed existing
  TS repository, Linux/local evaluation and offline-only experiments.
- **Branch:** `chore/p0-subscription-provider-review`, from G0 pack `558610f`.
- **Status:** User specified Codex subscription access and asked to consider
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
  by the owner on 2026-10-22; the corrected package requires its own disposition.
  G0 remains open pending final package/first-slice approval. No login, live model
  calls or executable application changes. Prior docs commits include `67a94fc`,
  `98a6975`, `7caac84` and `22fbd43`; this workspace-cap delta is covered by the
  owner's commit request.
- **Next gate:** owner approval of the complete G0 evidence before P1. No paid
  calls, deployment, dependency promotion or phase advancement authorized here.

### 1. Phase Objective & Scope

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
active = pathlib.Path('SPEC.md').read_text().split('## Active phase specification\n', 1)[1]
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
