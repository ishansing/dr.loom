# Loom — Product and Engineering Roadmap

- **Planning baseline:** 2026-10-20
- **Status:** proposed delivery plan; no implementation or deployment authorization implied
- **Capacity:** one full-time developer with AI assistance
- **Initial product:** self-hosted, single-tenant, operator-controlled Idea → Production harness
- **Release policy:** evidence/readiness gates, not a fixed launch deadline

## 1. Executive plan

Loom turns a software idea into an evidence-backed sequence of planning,
implementation, verification and authorized delivery. It executes the pinned
I2P framework rather than reimplementing its skills. The product differentiator
is **controlled, recoverable execution**, not another model chat interface.

Build one useful end-to-end path, make its boundaries real, then broaden it.
The critical path is:

```text
Product/support contract + runtime selection
  → authoritative core and effect admission
  → whole-runtime isolation + supervised worker
  → I2P workflow + independent verification
  → staging/deployment/restore gates
  → operational hardening + read-only operator UI
  → private beta and release qualification
  → first production release
  → second-runtime conformance and completion of the wider planned scope
```

### Forecast, not a delivery promise

- **Baseline work plan:** 32 active development weeks to the first production
  release, plus **four unallocated contingency weeks**. A working forecast is
  therefore approximately week 36, not an automatic release date.
- **Initial planning envelope:** **32–46 active weeks** for that release
  (roughly 8–11 months before holidays, part-time availability or external
  blocking). This is an engineering estimate, not a statistically calibrated
  confidence interval. Reforecast after the first two phases.
- **Wider currently planned scope:** a further **6–10 active weeks after GA**
  for the second runtime and its operational qualification. Do not call the
  existing SPEC milestone 4 complete until that work is done.
- **Conditional research features** such as System One adoption or fine-tuning
  have decision gates, not invented completion dates.

`W1` begins only when the owner approves implementation and reserves capacity.
Calendar dates are derived from that start, not from the date of this document.
The contingency is part of the planning envelope, not an additional feature
phase. If gates pass early, release early; do not wait merely to fill a calendar.

### Source-of-truth order

1. [SPEC.md](SPEC.md) owns required behavior and safety boundaries.
2. This roadmap owns proposed product sequencing, scope and release gates.
3. [T-01–T-19 mapping](research/pi/07-loom-v01-mapping.md) owns technical
   work-package traceability; [core breakdown](research/pi/09-milestone-1-implementation.md)
   supplies the existing first-milestone detail.
4. [Research backlog](research/03-research-backlog.md) records evidence and
   unresolved investigations, not implemented features.

The roadmap divides existing milestones into release slices; it does not
waive SPEC requirements. In particular, moving a later feature out of the
first release never permits enabling its execution channel without controls.

## 2. Product outcomes and release scope

### Primary users and jobs

| User | Job the product must support |
| --- | --- |
| Developer/operator | Start from an idea or an existing repository; understand the plan, approve consequential decisions and inspect candidate changes. |
| Returning operator | Recover the last committed state, outstanding approvals and uncertain actions without relying on conversation memory. |
| Reviewer/release approver | Inspect fresh evidence for an exact artifact and approve only the intended environment/action. |
| Deployment maintainer | Install, configure, update, back up, stop, restore and diagnose a self-hosted Loom deployment. |

These are responsibilities in one trusted deployment, not a hosted multi-tenant
identity system. One human may hold several responsibilities, but a model
cannot manufacture human approval or grant itself more authority.

### First production release: required outcome

A supported project can move through the pinned I2P lifecycle—from intake and
planning through bounded implementation, review/verification, staging and
human-authorized production delivery—with recoverable state and attributable
evidence. It can stop safely, report uncertainty honestly and restore a known
supported release. An unsupported task exits with an actionable handoff.

**Included in first production scope:**

- Self-hosted, single-tenant control plane; CLI-first operation and a read-only
  dashboard; local/private access by default, not a public service endpoint.
- Bun/strict TypeScript control plane and a separately isolated upstream Pi
  execution runtime. Choose the coding-agent SDK or Pi Durable; do not run two
  competing agent schedulers just for optionality.
- One supported host OS profile, one initial sandbox backend, one primary
  provider/model profile and one initial deployment target, selected in P0.
  Additional configurations need their own conformance evidence.
- Authoritative ledger, fenced mutations, lifecycle audit, governed effects,
  approvals, kill/reset, budgets and all-enabled-channel usage accounting.
- Project/task dependencies, per-thread resume, role-scoped workers, context
  retrieval/provenance and independent task verification.
- Governed memory boundaries: thread/run state, explicit human-controlled
  shared-memory promotion, quarantine and no ungoverned cross-run writes.
- Framework compatibility/drift checks; real deployment confirmation and a
  rehearsed recovery path; documented installation/upgrade/backup operations.

**Planned continuation after first production:** OpenCode as the second runtime
with the same enforcement corpus and documented compatibility matrix (T-19).
This preserves the existing commitment without making two runtimes a prerequisite
to learning from the first production deployment.

**Not implied by “complete project”:** hosted SaaS, tenant billing, public remote
control APIs, a marketplace, a Pi fork, every sandbox/cloud/model provider,
federated leases, agent discovery, A2A, MCP server mode, adaptive enforcement
or a trained decision model. These require an approved problem and scope.

### First usable slice

Before the full lifecycle, ship a constrained internal alpha:

> Operator starts a pinned run → isolated worker inspects a disposable checkout
> → proposes a small change → trusted verification checks the candidate hash
> → operator sees evidence and an honest status → interruption is recoverable.

No production credentials, automatic protected merge or live deploy are needed
to prove this slice. Once containment is established, raw shell remains confined
to candidate workspaces; privileged host/production effects use Loom-owned paths.

## 3. Starting position and capacity model

### What exists today

| Area | Actual status | Planning consequence |
| --- | --- | --- |
| Bun/TypeScript scaffold | Library/CLI, SQLite transition/lease/audit skeleton, lint/typecheck/CI; three existing smoke tests | Reuse and harden; do not restart from a blank repository. |
| Framework readiness | Gate closure recorded; Loom still pins I2P `4fe0869` / `2.1.0` | Validate the intended baseline; later I2P drift requires a reviewed decision, not an automatic re-pin. |
| Enforcement core | Mostly design/experiments; full write gates, migrations, outbox, kill and policy are not implemented | Research completion is not milestone completion. |
| Runtime feasibility | Pi 1.3.0 API/hook research and offline probes; Durable API/recovery assessment | Useful evidence, not a production adapter or isolation certificate. |
| Product workflow/deploy/UI | Planned, not delivered | Full lifecycle and operations need explicit implementation capacity. |
| Production evidence | No certified runner, live deployment/restore qualification or production SLO history | No “production-ready” label before the relevant gates. |

### Planning assumptions

- Plan approximately **25 focused engineering hours per week**, with remaining
  full-time capacity for review, integration, testing, documentation, operator
  feedback and maintenance. AI assistance is already included, not an additional
  developer or a promised speed multiplier.
- One primary implementation package in progress at a time; at most one small,
  independently bounded experiment alongside it. AI-generated work still needs
  review and fresh tests. Do not schedule simultaneous solo workstreams as if
  they were separate people.
- Security/operations reviewers are not assumed to be available full time.
  Book independent review in P0; if unavailable, the relevant release gate
  remains blocked rather than marked self-certified.
- A week is an active-capacity unit. Leave, procurement, cloud account access,
  hardware availability and external-review queues shift elapsed dates.
- The chosen deployment target, model/provider, data policy and operating
  hardware are bounded in P0. No production resources are provisioned by this plan.

The 32-week baseline represents about **800 focused engineering hours**; the
four-week reserve adds about 100. H1 adds roughly 150–250 focused hours.
These are capacity calculations, not a price quote or measured productivity.
P0 separately budgets provider calls, test infrastructure, artifact retention
and independent review. Approve spending caps before live experiments; forecasts
must include failed/retried calls and rehearsal environments, not just happy runs.

## 4. Milestone timeline and authority ladder

Version labels below are proposed release labels, not existing published APIs.
All windows are baseline sequencing for one developer; the gate determines exit.

| Phase | Baseline window | Product increment | Release/authority ceiling | Exit gate |
| --- | --- | --- | --- | --- |
| P0 — scope and decisions | W1–W2 | Supported profile, runtime choice, threat/failure model, acceptance corpus | Research/synthetic fixtures only | G0: build-ready baseline |
| P1 — authoritative core | W3–W8 | Durable records, gated effects, policy, operator control and recovery | Synthetic effects; no untrusted worker | G1: core conformance |
| P2 — isolated execution | W9–W14 | One supervised runtime, real isolation, candidate changes and evidence | Internal `0.1` alpha; no production authority | G2: isolated-runner conformance |
| P3 — I2P workflow | W15–W20 | Idea-to-verified-candidate workflow, dependencies, bounded workers and context | Internal `0.2` workflow alpha | G3: repeatable supported workflow |
| P4 — controlled delivery | W21–W24 | One staging/prod deployment target, confirmation and restore | `0.3` feature-complete beta candidate; staging first | G4: deployment/recovery qualification |
| P5 — operator product/hardening | W25–W28 | Read-only dashboard, packaging, documentation and operational controls | Private beta; production only after explicit G4 authorization | G5: pilot-ready operations |
| P6 — field qualification and GA | W29–W32 | Real pilot evidence, defect closure, independent review and release package | First single-runtime production `1.0` if G6 passes | G6: GA readiness |
| Risk reserve | Up to W33–W36 in working forecast | Fix failures, integration uncertainty and review findings | No extra features funded by unused reserve | Same gates; reforecast if exhausted |
| H1 — planned expansion | GA +6–10 active weeks | Second runtime and shared conformance; complete wider SPEC milestone 4 | Next production increment after its own qualification | G7: equivalent safety across runtimes |

P0/P1 planning detail is high confidence **in sequence**, not duration.
P2–P4 estimates are medium/low confidence until runtime, sandbox and target
choices are exercised. P5/H1 dates are forecasts, not commitments.

### Gate rules applying to every phase

- A successful demonstration is necessary, not sufficient: negative/race/failure
  cases and stored evidence must pass too.
- No known bypass, secret-exposure, data-loss or false-completion blocker may
  be accepted merely to hit a week number.
- Missing/expired approvals, unsupported configurations and uncertain external
  outcomes block consequential progression; they are not silently converted
  into success.
- If a gate fails: close admission where needed, preserve evidence, assign an
  owner, remediate and rerun the affected corpus plus connected regression tests.
  Advance the schedule only by an explicit reforecast or reduction in optional scope.

## 5. Phase-by-phase delivery plan

### P0 — Product contract and irreversible decisions

**Execution status (2026-10-23): G0 ACCEPTED / CLOSED** by the owner's explicit
“G0 accepted” decision. P1 implementation has not started. Earlier P0 preparation
started in the [support profile and acceptance matrix](research/phase-0/05-p0-support-profile.md).
Existing Bun/TypeScript workflow, Linux/local evaluation and offline-only calls
confirmed. The owner accepted coding-agent SDK `1.4.0` in
[ADR-005](decisions.md#adr-005---2026-10-22-p0-runtime-recommendation).
No dependency/sandbox promotion or P1 implementation authorization follows from
this acceptance alone. The [G0 decision pack](research/phase-0/06-g0-decision-pack.md) records
the accepted disposable Loom reference/rootless Docker lab target, accepted
framework/operator/recovery design and planned T-01/T-03 backlog. A provider/model
profile is now recorded (personal OpenAI account, `gpt-6.1-sol`, Plus plus Free
subject to availability, training opt-out confirmed and Include environments off,
both owner-attested). Owner approved deferring live qualification while SIWC
remains disabled; no live allowance use or automatic tier/account fallback.
A user-level rootless Docker lab was installed on 2026-10-22 with
tested CPU/memory/PID limits, whole-container cleanup, and a provisioned fixed
2 GiB ext4 workspace that hit `ENOSPC` under a read-only rootfs; `/tmp` and
`/dev/shm` are capped at 64 MiB. Workspace mount preflight, log caps, boot
persistence, final image pin, port publishing and broker qualification remain.
Independent review is assigned to Ishan Singh (Principal Developer;
owner-stated availability “always available”). Owner relayed his approval of the
[AI-assisted G0 report for `fc0e05e`](research/reviews/2026-10-22-g0-fc0e05e.md)
on 2026-10-22. R-001's roadmap target is corrected to accepted ADR-008's one hour;
the original report is retained and follow-up review is separate. The
[closure packet](research/phase-0/09-g0-closure-readiness.md) is now owner-accepted;
T-01's schema/safe-migration scope is approved. Next: detailed P1/T-01 specification,
migration contract and fresh baseline before code. Later qualification remains
mandatory; P1 is not started by this gate-acceptance record.

**Outcome:** the developer can build without guessing the product, support
boundary or runtime. Target duration: two weeks; no open-ended research phase.

**Ordered work:**

1. Record the supported user journeys, reference hardware/OS and representative
   repositories. Define which I2P runbook families are in the initial support
   matrix and the exact evidence needed for each; unsupported cases must hand off.
2. Reconcile framework drift: either retain/revalidate the current pin, or propose
   and approve a new one with contracts, lock hashes, readiness and migration
   evidence. Close R-28 primary-source gaps for claims actually reused in design;
   continuing watches do not block unrelated implementation indefinitely.
3. Timebox a **five-development-day runtime comparison** inside P0. Exercise
   the same conversation/tool/result contract on the coding-agent SDK and
   Durable, including restart, denied/resumed effect, output failure and
   storage ownership/upgrade cases. Reuse existing probes; add only missing proof.
4. Choose one runtime/revision. Pass/fail invariants outrank feature count:
   live effect authorization on replay, independent completion, whole-runner
   isolation compatibility and one authoritative owner per fact. Compare actual
   adapter effort, operational burden, Bun behavior, required tool/skill/MCP
   integration and release volatility. Do not extrapolate quality or speed from
   a faux-provider smoke test. If neither fits, fix the seam before scheduling P2.
5. Choose one sandbox backend and one deployment target for the first support
   profile. Specify host permissions, provider/egress mediation, mounts, writable
   workspace lifecycle and the local process-domain cleanup mechanism.
6. Define the supervisor/runner request-result contract and operator controls.
   The current four-command CLI design does not by itself specify the complete
   approval/kill/reset surface: close that gap before alpha without inventing
   undocumented shipped commands or making the dashboard a write authority.
7. Define failure/durability assumptions, backup retention/recovery requirements,
   capacity limits and the release evidence checklist. Book external review.

**Deliverables:** supported-profile matrix; reviewed runtime/sandbox/framework
decisions; data/authority flow; initial threat model; named acceptance cases;
updated dependency map and implementation estimates.

**G0 exit:** no unresolved choice changes storage ownership, runtime APIs,
credential exposure or the first deployment boundary. The developer/operator
approves scope and failure assumptions. Pin changes, if any, are explicit commits.

### P1 — Authoritative core and safe effect admission

**Outcome:** the control plane can record, authorize, stop and recover a run
without trusting an agent process. Existing SPEC milestone 1; no live model needed.

**Suggested internal sequence:**

| Week | Work package | Required result |
| --- | --- | --- |
| W3 | T-01 schema/migrations | Fresh and existing databases migrate safely; threads/action identity and append-only audit are represented. |
| W4 | T-03 lifecycle/evidence | Request → verdict → outcome invariants, immutable evidence references and resumable interrupted state. |
| W5 | T-02 write gate/leases | All relevant mutations use the live ordered gate; stale owners cannot release, finalize or publish. |
| W6 | T-04 outbox/effect boundary | Per-dispatch admission, stable intent/action IDs, idempotent test target and explicit uncertain-outcome reconciliation. |
| W7 | T-05/T-06 kill, grants and core policy | Latched kill/reset, scoped decisions and atomic budget draws; denial of undispatched work does not falsify in-flight history. |
| W8 | T-07 CLI/framework/conformance | Operator control and resume/status flow, pin/hash failures and an end-to-end synthetic run with CI evidence. |

These are package allocations, not instructions to skip testing until W8.
Policy/budget primitives live here once; P3 integrates them with actual
workers/usage rather than creating a second policy engine.

**Required proof:** migrations preserve fixture data and have a supported
rollback/restore procedure; contention has one effective writer; wrong/stale/
expired epochs fail; audit UPDATE/DELETE fails; kill between batch items blocks
later dispatch; duplicate intent cannot double-apply at an idempotent target;
unknown non-idempotent effects are not blindly replayed; crash/restart preserves
truthful resume/evidence; framework drift fails closed.

**Demonstration:** a fresh operator uses the CLI to locate committed work,
pending decisions and an interrupted action, engages kill, and resumes only
through the documented re-verification path.

**G1 exit:** deterministic core corpus passes in CI and a separate process/
filesystem fixture environment. No claim of process containment or remote
rollback is inferred from database tests. Synthetic effect adapters cannot
accidentally acquire production authority.

### P2 — One real isolated runner and verified candidate delivery

**Outcome:** the first useful alpha executes a bounded task while protecting
the host control plane. T-15 is a prerequisite within this phase, not later polish.

**Ordered work:**

1. Remap T-08–T-11 to the P0 runtime decision. If Durable wins, use its
   committed runtime entries/tasks rather than pretending coding-agent JSONL,
   hook names or extension APIs are interchangeable.
2. Implement the external supervisor and identity-bound IPC. The SDK/Durable
   runner, executable extensions and descendants stay inside the execution
   domain. No writable Loom ledger, protected host project state, host socket
   or production/provider credential store is mounted into it.
3. Establish default-deny egress and approved provider access. Verify the final
   callable inventory and startup configuration; keep ambient autoload,
   uncontrolled MCP, codemode model calls and cache warming disabled initially.
4. Add owned semantic operations for the alpha's needed effects, with final-
   payload/live policy/epoch checks on every dispatch, including resumed work.
   Bind retries to stable intent; do not rely solely on `tool_call`/`beforeTool`.
5. Implement fail-closed output paths for final/partial/structured/error/spill
   content before exposure/persistence. A failed redactor must not pass raw data.
6. Wire session/runtime cancellation, background-work inventory and external
   domain cleanup. No successor reuses a writable workspace while old writers
   remain. Track remote uncertainty separately from local quiescence.
7. Implement candidate artifacts and the minimal outer verifier. Tie evidence
   to exact hashes; a model's `done`/settlement/terminate state cannot approve it.
8. Run the declared provider against an isolated non-sensitive fixture, then a
   disposable representative repository. No live protected merge/deploy yet.

**Required proof:** compromised task input cannot access the host DB/credentials;
startup and non-tool execution cannot escape the selected boundary; changed
payloads/replayed old authority fail at the owned operation; missing controls
fail startup; redactor/verifier exceptions fail closed; escaped process groups,
unawaited host work and post-abort spawn cases cannot outlive the controlled
execution domain in the supported profile. Real-provider usage/cancellation
is tested without claiming a hard billing ceiling for already-in-flight calls.

**G2 exit / internal 0.1:** demonstrate the first usable slice from section 2,
including kill/restart. Safety corpus passes on the actual supported backend.
Until then, only trusted synthetic code runs outside the completed boundary.

### P3 — Complete Idea → verified candidate workflow

**Outcome:** repeatable framework execution, not just a safe standalone worker.
This is the core product-value phase: T-12–T-14 with budgets/context/memory integration.

**Ordered work:**

1. Bind intake/scoping/planning and lifecycle transitions to the selected I2P
   contracts. Preserve required/conditional skill routing and human handoffs;
   do not copy skill logic into Loom. Test missing dependencies and drift.
2. Implement the authoritative project task/dependency graph and state/artifact
   references. Runtime tasks remain execution records; do not dual-write project
   truth into Durable documents and Loom files/rows.
3. Start with one worker; add planner/developer/reviewer roles and bounded
   parallelism only after single-worker recovery and effect admission pass.
   Enforce depth, fan-out, inherited deadlines and task/workspace ownership.
4. Connect time/retry/cost/tool-call controls and per-channel usage accounting.
   Unpriced/missing usage is explicit, never free. Unattended supported profiles
   need configured limits; meter-only mode must not masquerade as capped.
   Record in-flight spend overshoot rather than promising cancellation reverses it.
5. Integrate retrieval, compaction-safe decisions and source/provenance labels.
   Enforce memory scope/approval/quarantine, including rejecting unapproved
   cross-run knowledge writes. Keep critical state outside model summaries.
6. Build trusted fresh verification/review gates for each candidate task and
   aggregate outcome. Changed artifacts invalidate prior evidence. Invalid
   results, failed checks and `needs-human` outcomes cannot silently advance.
7. Rehearse supported small/standard/greenfield and negative runbook cases,
   including abandoned work, approval pauses and operator resume.

**Product demonstration:** idea → plan/tasks → bounded implementation → review
→ trusted verification → reproducible candidate artifact and evidence package.
Repeat after a worker crash and after a fresh operator takes over.

**G3 exit / internal 0.2:** the declared workflow/runbook matrix passes repeated
goldens; safety/negative cases pass independently of model quality. Record cost,
duration, human interventions and failed attempts to establish a real baseline.
Unsupported work reliably hands off. Do not optimize models before measuring this.

### P4 — Controlled staging, production authorization and restore

**Outcome:** the workflow can deliver to one supported target without ad hoc
shell deployment or authority hidden in the runner. T-18 lands here.

**Ordered work:**

1. Implement immutable artifact manifests and the selected target's narrow
   host-side deployment operations. Separate staging/prod scopes, credentials,
   leases and evidence; runner code cannot access deployment credentials directly.
2. Implement [R-19's five gates](research/phase-2/13-r19-deploy.md): propose,
   verify exact hash, authorize, execute, confirm. Production is human-authorized;
   staging success grants no implicit production authority.
3. Reconcile target state for retry/timeout/late completion. A transport timeout
   is not proof that nothing deployed. Keep action IDs/target receipts sufficient
   to prevent blind duplicate non-idempotent execution.
4. Implement supported restore/rollback through the same gates. Rehearse failure
   before/after dispatch and failure of confirmation. Open the recovery path
   automatically where specified, but do not bypass required human authorization.
5. Support migrations only with the approved, rehearsed compatibility and
   rollback/backup-restore strategy. Refuse unsupported irreversible changes;
   never run a destructive down-migration merely to satisfy a button or deadline.
6. Prove first on test targets, then real staging. The owner separately authorizes
   any production-like pilot; roadmap approval alone does not authorize deployment.

**G4 exit:** an exact-hash artifact is staged and confirmed; missing/changed
approval/evidence/epoch rejects execution; a failed deployment and a failed
confirmation produce correct recovery/incident evidence. Restore succeeds on
the chosen target. Double-failed restore escalates to a human instead of looping.

**Release ceiling:** feature-complete beta candidate, not general production
readiness. Non-production dogfooding may continue while operations are hardened.

### P5 — Operator experience and production hardening

**Outcome:** a new operator can install, inspect, recover and upgrade Loom
without depending on its author. T-17 and operational release work land here;
T-16 calibration now has real P3/P4 evidence to use.

**Work packages:**

- Read-only dashboard/CLI projections: task/phase, lease/kill state, approvals,
  fresh/stale evidence, usage/pricing gaps and unresolved effects. Bounded
  pagination/cursors, data-as-of timestamps and no hidden write authority.
- Private/local access, output escaping and safe treatment of untrusted model/
  tool content; keyboard accessibility and usable failure states. Remote public
  hosting/authentication is a separate approved scope, not implied by a web UI.
- Reproducible installation/update/uninstall; exact supported Bun/runtime pins,
  frozen dependency lockfiles, release artifact integrity, dependency/license
  inventory and CI workflow pinning. CI currently using `Bun latest` must be
  reconciled with the supported release matrix before GA.
- Fresh install and upgrade from supported prior schema/runtime fixtures;
  backup/restore on a separate target; failed upgrade recovery. Runtime SQLite
  upgrades that cannot downgrade need a restore-based rollback, explicitly.
- Disk-full/storage-failure/provider-outage/operator-disconnect drills; safe
  admission closure and actionable status. Admission safety must not depend
  on telemetry exporters, dashboard availability or a model classifier.
- Governed audit/artifact retention and archival, secret handling and deletion/
  export documentation consistent with append-only audit obligations. Confirm
  data policy before enabling collection; do not retain raw prompts by accident.
- Installation, recovery, approval/kill/reset, deployment/restore and incident
  runbooks; troubleshooting and support matrix. Record known limitations plainly.
- Monthly drift/calibration procedure, price/policy provenance and reviewed
  tuning. No adaptive model gets authorization or completion authority.

**G5 exit / private beta:** install/upgrade/restore drills pass; the release
evidence package is complete for the support profile; operator tasks are usable;
load measurements meet the agreed profile; independent review is scheduled or
completed with no blocking findings. No known safety or data-loss blocker remains.

### P6 — Private pilot, release candidate and GA

**Outcome:** replace design confidence with evidence from real supported work.
Plan at least four active weeks of observation/remediation; AI coding speed
cannot replace an operational learning period.

**Pilot cohort and evidence:**

- At least three representative repositories/workloads, covering an existing
  project change, a greenfield slice and recovery/deployment behavior. Begin
  with non-sensitive staging targets; production remains separately authorized.
- At least 30 recorded supervised workflow attempts, including failures and
  handoffs, not just successful demos. Record the denominator, workload scope,
  provider/model/policy pins and all exclusions. This is an acceptance sample,
  not statistical proof of rare-event safety.
- At least one operator other than the implementing developer performs install,
  status/resume and restore drills from documentation. If no such reviewer/
  operator is available, that validation remains open.
- Review workflow completion, quality, cost, intervention and recovery metrics
  against P3 baselines. Deterministic safety gates are evaluated separately;
  a model-quality aggregate cannot offset an authorization failure.
- Triage/reproduce findings, fix root causes with regression cases, rehearse
  the supported upgrade path, then cut a release candidate with frozen inputs.

**G6 exit / first production 1.0:**

1. G0–G5 evidence is complete for the explicitly supported matrix.
2. All mandatory deterministic, integration, deployment and I2P golden suites
   pass on the release candidate; known blockers and material unknowns are closed
   or the affected feature is disabled and removed from advertised support.
3. No open critical/high security, data-loss, false-completion or kill/control
   failure; independent boundary review completed. Do not claim formal compliance
   or external certification merely because a checklist was reviewed.
4. Backup/restore, failed-upgrade and incident/kill drills have fresh evidence;
   a human owns unresolved external outcomes and operational response.
5. Release notes, limitations, dependency/support matrix and operator runbooks
   accompany the artifact. Product owner and deployment operator sign off.

Production release is per supported configuration. An untested backend/provider/
deployment target remains unsupported even if its package can be imported.

**Release handling:** promote immutable artifacts through lab → internal alpha
→ private beta → release candidate → GA; never point production at a moving
branch or automatically upgrade to npm `latest`. Review the evidence delta and
supported-state migrations at each promotion. A safety regression, lost audit
attribution or failed recovery blocks promotion and closes affected admission;
preserve evidence and use the approved restore path. After an incident, the
operator owns containment/reconciliation, the developer supplies a regression
fix, and the release owner requires fresh qualification before reopening.

## 6. Measurement and operational readiness

These are **proposed acceptance targets**, not achieved SLOs or contractual
service guarantees. P0 approves the profile; P3/P5 validate or explicitly
rebaseline targets using evidence before GA. Do not weaken safety invariants
to accommodate hardware or model performance.

| Dimension | Acceptance rule / proposed target | Measurement |
| --- | --- | --- |
| Safety | 100% of mandatory deterministic denial, fencing, kill, output and verification cases pass; zero known bypasses | Fixed corpus plus failure/race injection, with artifact/pin references |
| Traceability | Every privileged dispatch maps to identity, immutable intent, live verdict and observed or unresolved outcome | Reconcile host dispatch records with audit/target receipts |
| Completion integrity | Every completed supported task has fresh evidence for its exact candidate; no completion from prose/runtime state alone | Negative stale-hash, missing-verifier and hook-exception cases |
| Workflow usefulness | Record verified end-to-end completion and human intervention rate separately from valid refusal/handoff | P3 baseline and the full P6 attempt set; approve workload-specific target before pilot |
| Operator orientation | Fresh operator locates last committed state, kill/lease and unresolved actions within five minutes on the scripted scenario | Timed runbook, without conversation history |
| Local status performance | Proposed p95 ≤1 s with 100,000 audit records on the declared reference hardware | Recorded dataset, hardware, concurrency and repeat count; not an internet SLA |
| Recovery | No acknowledged local commit loss in tested process-crash cases; restore procedure targets one hour on the reference profile, per accepted ADR-008 | Process-kill/restore drills; state and evidence reconciliation; target, not achieved SLO |
| Host/power failure | State the actual durability configuration and backup loss window; no zero-loss claim without matching fault evidence | P0 failure model, storage configuration, restore and effect reconciliation |
| Cost | Attribute every model attempt/usage arrival to one owner; missing/unpriced usage visible; prevent new admission on configured breach | Provider reconciliation, double-count/late-usage tests and measured in-flight overshoot |
| Operational defects | No open release-blocking security/data-loss/false-completion/control defects | Release defect register and reproducible evidence |

No hosted 24×7 uptime promise is made for a solo-maintained self-hosted release.
The operator owns deployment monitoring and business continuity; the product
must make failure visible and provide tested recovery procedures.

## 7. Ownership, delivery discipline and change control

### Responsibilities

| Responsibility | Accountable party | AI role |
| --- | --- | --- |
| Product scope and priority | Project owner (user) | Draft options, trace requirements, identify tradeoffs |
| Implementation and evidence quality | Solo developer | Produce reviewed code/tests/docs; run bounded experiments |
| Policy/credential/production authorization | Deployment operator/human approver | Prepare immutable proposals; never self-grant authority |
| Independent trust-boundary review | Named independent reviewer (Ishan Singh, Principal Developer), owner-stated availability; review/sign-off pending | Supply evidence/cases, not replace independent sign-off |
| Release decision | Project owner with deployment operator | Assemble readiness packet; no automatic release on model confidence |

### Definition of ready for a work package

- Follow [AGENTS.md](AGENTS.md), update [SPEC's active phase](SPEC.md#active-phase-specification)
  with the seven required sections before application/test code, and consult
  [decisions.md](decisions.md). This preparation does not itself authorize
  implementation, a pin change or production effects.
- User outcome and scope; SPEC/source references; dependencies and owner.
- Which fact/layer owns the state; final effect and trust boundary identified.
- Acceptance cases including error, cancellation, concurrency and migration
  where relevant; data-loss/secret exposure risks and rollback strategy.
- Small enough for a reviewable vertical change; open material decisions resolved.

### Definition of done

- Execute the phase's declared lint → typecheck → test/coverage → security
  gates in order; record unavailable/N/A checks honestly and append significant
  decisions when made. Use the commit/escalation policy in `AGENTS.md`.
- Behavior and failure paths implemented in the responsible layer; callers,
  fixtures, config, exports and documentation updated together.
- Strict types, lint and relevant tests pass; fresh evidence records pins/hash
  and test environment. Non-trivial logic has a regression test.
- No secrets in logs/fixtures; no unreviewed new dependency or authority path;
  migrations and upgrades have the promised recovery evidence.
- Human review complete; known limits recorded; accepted package/phase is marked
  complete only on evidence, not number of commits or generated lines.

### Cadence for a solo developer

- Daily: one implementation goal, red/green proof, review connected paths and
  leave a recoverable handoff. Do not run unbounded AI changes in parallel.
- Weekly: demonstrate one usable increment; review blockers, actual capacity,
  defect escape and remaining estimate; refresh the next two-week commitment.
- Every two weeks: rebaseline the forecast using completed work, not time spent;
  review dependencies and cut optional scope before adding people-shaped fiction.
- At each gate: review the complete evidence packet and authority ceiling.
- Monthly and pre-upgrade: execute [R-29 drift review](research/watch-schedule.md)
  and T-16 calibration with policy/price provenance. These are recurring duties,
  not research items that become permanently “done.”

Schedule changes must identify cause, affected gate, critical-path impact and
revised scope/date range. There is no quiet scope expansion into hosted service,
new providers, another runtime or ML training during core delivery.

## 8. Risk register and decision deadlines

| Risk / dependency | Decision or mitigation | Owner / checkpoint | Release impact |
| --- | --- | --- | --- |
| Durable vs coding-agent selected too late | Same-workload bounded comparison; choose one, remap adapter and storage readers | Developer/owner, G0 | Blocks P2 implementation; do not build both by default |
| Experimental API/storage upgrade breaks resume | Exact pins, pending-state upgrade fixtures, executable/schema drift tests and backup/restore | Developer, P0 then every upgrade | Blocks runtime promotion |
| Framework drift changes skills/contracts | Approved retain/re-pin decision; run actual pin/hash/contract/golden checks | Owner/developer, G0 and T-07 | Blocks affected framework execution |
| Hooks mistaken for final authorization | Live final-payload gate inside owned effects; resumed and rewritten input tests | Developer/reviewer, G1/G2 | Safety blocker |
| Sandbox only confines Bash or misses descendants | Whole-runner startup boundary, protected-path/credential/egress tests and domain cleanup | Developer/reviewer, G2 | No untrusted execution until passed |
| Unknown remote effect replayed | Stable intent IDs, effect-side dedup or target reconciliation; fail closed on uncertainty | Developer/operator, G1/G4 | Blocks replay/production progression |
| Poor model outcomes or excessive spend | Bounded tasks, verification, attempt-level cost metrics and measured workload baselines | Developer/operator, G3/G6 | Narrow supported workloads; no safety trade |
| Untrusted output leaks before a final hook | Sanitize/withhold before partial/final/spill persistence and exposure | Developer/reviewer, G2/G5 | Security blocker |
| Sole developer/reviewer bottleneck | One WIP package, reserved integration time, booked review, four-week reserve | Owner, weekly and G0 | Reforecast, not self-certification |
| Missing credentials/accounts/test target | List required human inputs in P0; use synthetic targets until available | Operator, before G4 | Staging/production gate remains blocked |
| Performance/disk/retention problems emerge late | Reference workload by P0, measure at P3, repeat under scale/disk faults at P5 | Developer, G3/G5 | Supported capacity constrained to proven profile |
| Public endpoint or multi-tenant scope sneaks in | Default private/local; explicit threat model/product approval for expansion | Owner/operator, every release | New security and delivery estimate required |

## 9. Traceability to the existing project

| Existing commitment | Roadmap home | Completion evidence |
| --- | --- | --- |
| SPEC milestone 1 / T-01–T-07 | P1; P0 resolves material inputs | G1 synthetic/core conformance; detailed [core plan](research/pi/09-milestone-1-implementation.md) |
| SPEC milestone 2 / T-08–T-11 | P2, conditional API remap from G0 | G2 actual-runner and independent-boundary evidence |
| T-15 isolation | P0 selection, P2 prerequisite | Actual backend containment/cleanup evidence before untrusted work |
| SPEC milestone 3 / T-12–T-14 | P3; reuse P1 policy primitives | G3 repeatable supported I2P workflow and fresh verification |
| T-18 deployment procedure | P4 | G4 five-gate staging/restore and authorized target evidence |
| T-17 dashboard | P5 | Read-only/accessibility/performance/output-security qualification |
| T-16 calibration / R-25 metering | P1 primitives, P2/P3 ingestion, P5 operations, then recurring | Attempt/usage reconciliation and reviewed tuning history |
| R-24 memory governance | P3, operational review in P5 | Scoped access/promotion/quarantine/provenance negative cases |
| R-23 MCP client | P0 decides necessity; enable only in the relevant tested runtime profile | Version/transport/auth/output/cancel conformance, no ambient servers; otherwise disabled |
| SPEC milestone 4 primary-runtime hardening | P4–P6 | G4–G6; first production scope |
| SPEC milestone 4 / T-19 second runtime | H1, after primary-runtime evidence | G7 same safety corpus on both; M4 remains incomplete until this passes |
| R-27–R-29 | P0 applicable cleanup, event/monthly/pre-change reviews thereafter | Dated watch evidence; no automatic re-pin |
| R-35 System One validation | H2 conditional, not GA critical path | Held-out/shadow benefit, calibration/cost/latency and failure proof before any advisory adoption |

This is the current complete **committed product scope plus conditional
research horizons**, not a claim that every researched idea belongs in GA.

## 10. After first production: finish scope, then earn expansion

### H1 — Second runtime and wider milestone-4 completion

**Planning allocation:** 6–10 active weeks after GA, re-estimated using P2/P6
actuals. Do not spend the primary-runtime risk reserve on this work.

1. Implement the OpenCode adapter against the now-proven Loom effect/result/
   verification contract, not against assumptions copied from Pi hooks.
2. Re-run the same negative, replay, lease, kill, output, verification, usage,
   framework and isolation cases on both runtimes; explicitly report unsupported
   channels instead of advertising false parity.
3. Repeat install/upgrade/recovery and a representative I2P/deployment pilot
   with the second runtime. Keep one authoritative policy/workflow core.
4. Close SPEC milestone 4 only after G7 evidence; publish the two-runtime support
   matrix and migration/limitations guidance.

Useful extra integrations may be prioritized after this, but are not silently
funded inside the estimate for T-19.

### H2 — Decision-model experiment, only when the data exists

R-35 requires deterministic gates, an operating adapter and labeled Loom cases.
Collect labels during P3/P6 with the approved data policy; do not train or
purchase inference capacity merely to satisfy a roadmap date.

First experiment: offline/shadow optional skill suggestion or triage, with
deterministic routing retained. Compare against existing behavior on separate
tuning/held-out sets; measure wrong-load/missed-required-child errors, calibrated
abstention, p95/p99 latency, total attempt cost and unavailable/malformed cases.
Adopt only on a documented benefit and a separate decision. Classifiers remain
advisory and never authorize effects or certify completion.

QLoRA, additional local models, federation/A2A, adaptive budgets and hosted
multi-tenancy each need their own business/technical case, estimate and gate.
No dates or resources are committed for them by this roadmap.

## 11. First ten working days after build authorization

| Day | Focus | Exit artifact / decision |
| --- | --- | --- |
| 1 | Inventory actual scaffold, tests, pins and open findings | Honest baseline and first support-profile proposal; no inherited “research done = code done” assumption |
| 2 | Product journeys, workload fixtures, operator inputs and data/authority boundaries | Candidate acceptance matrix, human-input list and independent-review booking |
| 3–5 | Reuse/extend runtime probes on the same bounded workload | Coding-agent vs Durable comparison, actual integration gaps and observed failure behavior |
| 6–7 | Finish the timeboxed comparison; exercise recovery/owned-effect handoff and selected isolation profile feasibility | Runtime recommendation and evidence; reject unsafe replay/hook-only shortcuts |
| 8 | Resolve framework pin and schema/failure/rollback assumptions | Reviewed retain/re-pin decision; no silent upstream substitution |
| 9 | Confirm sandbox/deployment profile, supervisor channel and approval/kill/reset UX | Decisions needed for T-01/T-08/T-15; concrete support boundaries |
| 10 | Review G0 evidence, map work packages and capacity, approve next slice | Updated two-week backlog/forecast; start P1 only if G0 passes |

Existing primary-source research and offline probes are inputs to these days,
not tasks to redo mechanically. If an input is already verified and unchanged,
reuse it and spend the saved time on missing integration proof.

## 12. Completion and re-planning policy

“Done” means the advertised supported workflows and operational recovery paths
meet the corresponding gate—not that all possible agent features have been
implemented. First production and completion of the second-runtime commitment
are deliberately separate milestones; neither is a declaration that research
or maintenance has ended.

Re-plan immediately if a required boundary cannot be enforced, the chosen
runtime changes its persistence contract, a serious incident exposes a missing
failure class, or actual capacity invalidates the forecast. Preserve the
security/data guarantees; change optional scope, runtime choice or dates.

**Not done by this document:** implementation, runtime/framework re-pinning,
production provisioning, model adoption or formal security certification.
