# Loom — Architecture and Critical Decision Log

This is an append-only record of significant decisions, not a task diary.
Consult it with [SPEC.md](SPEC.md) before implementing a relevant change.
Accepted records are design choices, not claims that code or production gates
have passed. Existing architecture/research decisions remain in their linked
sources; this log does not retroactively change their dates or approval state.

## Recording rules and ADR format

Append when choosing/changing a dependency, data/authority boundary, meaningful
workaround, verification strategy or upstream escalation. Record the choice
when made, before the implementation obscures its alternatives. Use the next
unused sequential ID. Append supersession/status events with dates and links;
preserve earlier rationale instead of silently rewriting history.

Each record uses:

- **ID & Timestamp:** `[ADR-XXX] - YYYY-MM-DD (Phase X)` and a short title.
- **Status:** `Proposed | Accepted | Deprecated | Superseded by ADR-YYY`.
- **Context & Problem Statement:** the triggering constraint or requirement.
- **Options Evaluated:** at least two real viable paths and their tradeoffs.
  If a hard constraint leaves only one viable path, state that constraint and
  the eliminated alternatives; do not invent a viable unsafe option.
- **Decision & Rationale:** chosen path and the evidence/authority for choosing it.
- **Consequences & Tech Debt:** operational/performance impact, limits, owner and
  follow-up. Use “not measured” where no experiment establishes a benefit.

## [ADR-001] - 2026-10-21 (Governance bootstrap)

**Title:** Reuse the canonical SPEC for dynamic phase governance.

**Status:** Accepted.

**Context & Problem Statement:** The requested playbook calls for root
`spec.md` and `decisions.md`. Loom already has a normative `SPEC.md` with many
links, plus a product roadmap. Two tracked files differing only by letter case
would collide on common case-insensitive filesystems and confuse ownership.

**Options Evaluated:**

1. Keep `SPEC.md`; add one replaceable active-phase section with the seven
   required headings, preserving the architecture requirements above it.
2. Keep `SPEC.md` for architecture and use a separate `phase-spec.md` for phase
   execution. This separates concerns but introduces another mandatory document
   and diverges further from the requested name.
3. Rename the existing contract to `ARCHITECTURE.md` and introduce lowercase
   `spec.md`. This is portable but requires broad link/path churn for no current
   behavioral benefit.

**Decision & Rationale:** Choose option 1 as the smallest complete adaptation
of the user's governance request. `AGENTS.md` defines the workflow, `SPEC.md`
owns architecture plus clearly scoped active-phase requirements, `ROADMAP.md`
owns sequencing and `decisions.md` owns critical rationale. Avoid a case-only
duplicate and do not replace the architecture contract with a task scratchpad.

**Consequences & Tech Debt:** No runtime/schema/API or measured performance
change. Before a new authorized phase, update only the active-phase block;
completed phase evidence remains in Git history. If multiple simultaneous
phase specifications become necessary, revisit option 2 explicitly. Owner:
implementing developer; follow-up at the next phase kickoff.

## [ADR-002] - 2026-10-21 (Governance bootstrap)

**Title:** Use reviewed local governance and scope-aware, evidence-based gates.

**Status:** Accepted.

**Context & Problem Statement:** Automatic pulls of unspecified upstream rules
can merge unrelated changes or admit unreviewed instructions. The requested
SOP supplies no upstream rules URL/ref. Loom has three smoke tests, no dedicated
E2E runner/coverage threshold and no installed secret-scanner command; calling
all production checks green would misrepresent the current evidence.

**Options Evaluated:**

1. Version the user's adapted SOP locally and use its reviewed Git revision;
   configure external provenance only when an owner supplies/approves it.
2. Maintain a separate approved SOP repository with a pinned revision, fetch
   updates read-only, and review/promote them as governed changes. This is viable
   once the source, trust owner and compatibility policy are known.

**Decision & Rationale:** Use option 1 now; leave external synchronization
explicitly unconfigured rather than invent a source. Preserve the requested
lint → typecheck → test/coverage → security order. Required missing checks block
the affected code/release phase; justified docs-only N/A is not a code waiver.
Commits need an explicit request or approved phase commit policy; uploads,
pushes, deployments and phase advancement retain separate authorization.

**Consequences & Tech Debt:** No automatic pull, dependency update, upstream
issue publication or production action. A dependency audit/manual diff review
is not a complete secret scan or production certification. The next application
phase must establish appropriate integration/regression coverage, a comparable
coverage baseline and a trusted scanner as required by its risk. Owner:
implementing developer; review/approval remains with the project owner/operator.
No productivity or performance gain has been measured.

## [ADR-003] - 2026-10-22 (P0 runtime comparison)

**Title:** Compare the researched release with trusted offline fixtures outside Loom.

**Status:** Accepted for the bounded experiment, not runtime/backend adoption.

**Context & Problem Statement:** The owner approved offline-only P0 evaluation.
Previous temporary installations are gone. Existing probes exercise different
workloads and cannot establish comparative effort or hard-crash safety. Docker
does not report rootless mode on this host; an empty bubblewrap domain works.

**Options Evaluated:**

1. Reproduce the researched `1.3.0` release with one shared synthetic contract,
   verified dependencies outside Loom, and an experimental bubblewrap launcher.
2. Rebase experiments to the newest release immediately; this may resolve known
   issues but invalidates prior assumptions and requires a larger source audit.
3. Wait for a rootless container installation before any runtime experiments;
   this delays even reviewed synthetic offline comparisons.

**Decision & Rationale:** Choose option 1 for this first evidence package.
Revalidate primary-source release facts separately. Run only trusted synthetic
code, with clear environment, no network, minimal read-only runtime/dependency
mounts and a disposable writable fixture. Test boundary failures before runtime
execution. This launcher is research-only, not a production containment backend;
no host settings, daemon privileges, Loom dependency or support pin changes.

**Consequences & Tech Debt:** Shared assertions can compare adapter seams, not
model quality or production enforcement. Clean reopen must not be labeled
hard-crash/replay proof; missing cases remain open. Whole-domain quotas, seccomp,
provider mediation and supported host selection still need qualification before
untrusted execution. Developer owns evidence and recommendation; owner approves
any runtime/backend promotion. No measured performance benefit is claimed.

## [ADR-004] - 2026-10-22 (P0 recovery experiments)

**Title:** Measure actual process crashes and restore from quiesced copies.

**Status:** Accepted for synthetic research only; no runtime promotion.

**Context & Problem Statement:** Clean reopen passed but does not establish
saved-task replay authorization, uncertain-effect handling or storage leadership.
Durable `1.4.0` introduces a schema migration that older code cannot reopen.

**Options Evaluated:**

1. Externally SIGKILL isolated runners at observable checkpoints; keep the
   synthetic authority/effect target outside; test migration only on copies.
2. Use cooperative close and in-process interruption; simpler but cannot prove
   process-crash recovery and may exercise different runtime paths.
3. Test migration on the only fixture database and attempt code downgrade;
   viable only with a separately verified backup, but adds avoidable evidence risk.

**Decision & Rationale:** Choose option 1. Compare Durable's saved-task recovery
with an explicitly supervised new SDK prompt, not a fictional shared replay API.
Unknown unsafe effects get reconciliation, not blind retry. Demonstrate native
storage ownership limits separately from a standard-library external file-lock
fixture. Back up only after whole-domain exit and verified SQLite checkpoint;
migrate clones and restore a separate copy with the older version.

**Consequences & Tech Debt:** These are process-failure and local filesystem
tests, not host/power-loss or distributed leadership proof. The file lock is a
fixture, not production fencing; unsafe concurrent opens are deliberate negative
tests on throwaway stores only. `1.4.0` stays in a separate external installation.
Owner: developer supplies evidence; project owner reviews revision selection,
durability assumptions and promotion. No effect or model quality promise follows.

**2026-10-22 implementation finding:** Killing only the outer bubblewrap process
immediately after native startup info could leave its namespace init alive; an
after-runtime-ACK heartbeat test did not cover that window. The research launcher
now gates COMMAND startup on a parent handshake, captures the namespace-init
pidfd and sends SIGKILL through that identity, then waits for namespace exit
before any workspace reuse. This uses native Linux identity/lifecycle primitives,
not PID-number guessing or a runtime ACK. A deterministic immediate-stop self-test
and detached-writer test cover both windows; production quotas/seccomp and host
failure behavior remain outside this experiment's certification.

## [ADR-005] - 2026-10-22 (P0 runtime recommendation)

**Title:** Prefer upstream Pi coding-agent SDK `1.4.0` for the first isolated adapter.

**Status:** Accepted — owner approved 2026-10-22; not a dependency pin or G0 closure.

**Context & Problem Statement:** The bounded comparison now has shared offline
workload, process-crash/owned-effect, storage ownership/restore and pinned I2P
skill/contract evidence. One runtime is needed before adapter implementation;
maintaining two execution loops would add unsupported scope. Both runtimes still
require Loom-owned authority, output handling, isolation and independent completion.

**Options Evaluated:**

1. Coding-agent SDK `1.4.0` at source tag commit
   `4a080252f06caf63a525d7873c5d94d3c23887e0`: native Agent Skills discovery,
   command expansion, session/tool APIs and the existing T-08–T-11 adapter shape.
   Loom must explicitly own interrupted-work retry/reconciliation.
2. Durable `1.4.0`: native saved-task/submission recovery and checkpointing, but
   explicit owned skill-context integration, changed adapter/session-reader APIs
   and a schema-2 upgrade/restore lifecycle. Its tasks need not duplicate Loom
   state, but that separation must be designed and tested.
3. Keep the tested SDK `1.3.0` baseline: less revision change now, but omits the
   shipped resume/tool-activation fixes. Exact `1.4.0` shared/skill/crash checks
   now provide direct evidence instead of assuming compatibility from changelogs.

**Decision & Rationale:** Choose option 1 for the first supported adapter,
following the owner's approval of the recommendation.
Native skill handling reduces the initial integration surface and preserves the
planned SDK/session-reader architecture. SDK `1.4.0` passes the selected synthetic
contract and failure corpus on Node/Bun. This is architectural fit, not a measured
model-quality, latency, security-superiority or engineering-hours claim. Durable's
recovery advantages remain real; neither runtime eliminates the owned effect or
external supervisor requirements. Use only one execution loop.

**Consequences & Tech Debt:** Keep `FRAMEWORK_REF`, Loom manifest/lock and normative
authority boundary unchanged until approved promotion work. Native SDK skill
expansion passes unknown/missing skills through as text; Loom must validate
revision, hashes, exact skill selection and required children before invocation.
The snapshot's externally installed specialist children are not bundled/verified
by this experiment; full workflows requiring them remain unsupported until
provisioned against locks. SDK resume needs truthful committed-state recovery,
no automatic replay of uncertain non-idempotent effects, and exact-hash trusted
verification. Production backend/provider/MCP/output/usage qualification, secret
scanning and independent review remain open. Owner: developer scopes dependency
promotion and the adapter backlog for separate implementation approval.
See the [comparison and proposed manifest](research/pi/17-p0-runtime-recommendation.md).

**Status event — 2026-10-22:** Proposed → Accepted after the user explicitly
approved the elaborated recommendation. The selected runtime is upstream
`@earendil-works/pi-coding-agent@1.4.0` at source tag commit
`4a080252f06caf63a525d7873c5d94d3c23887e0`. This accepts the design direction
only: no Loom dependency installation, framework re-pin, paid call, deployment,
commit/publication or G0/P1 advancement is authorized by this approval.

## [ADR-006] - 2026-10-22 (P0 support profile)

**Title:** Target rootless Docker for the first Linux/local execution profile.

**Status:** Accepted as a design target — owner selected it explicitly; setup
and qualification are not approved or completed by this decision.

**Context & Problem Statement:** The first profile needs one whole-runtime
isolation backend. The owner initially approved Linux/local evaluation and now
selected rootless Docker, plus a disposable Loom checkout as the real reference
repository. The observed Docker daemon does not report rootless mode; passing
bubblewrap research probes does not certify either production backend.

**Options Evaluated:**

1. Rootless Docker: OCI packaging and native container lifecycle/resource
   controls, with explicit rootless host setup and qualification still required.
2. Bubblewrap: already useful for local synthetic experiments, but production
   resource limits/seccomp/lifecycle packaging would need additional owned work.

**Decision & Rationale:** Target option 1 for the first Linux x86_64/local profile;
reuse platform container controls instead of promoting the research launcher as
a production service. Use a disposable Loom checkout with synthetic fault
injection as the first representative Bun/TypeScript workload. Never expose the
live Loom checkout, protected ledger or credentials to that worker.

**Consequences & Tech Debt:** This does not configure the current daemon, install
packages, provision resources, start containers or enable untrusted execution.
The trusted supervisor controls Docker; the runner receives no Docker socket or
host credential mounts. Rootless identity, cgroup/resource support, pinned image,
network/provider mediation, mount policy and whole-domain cleanup need evidence
before the selected profile can be called supported. No privileged/rootful or
unsandboxed fallback. Bubblewrap remains a research fixture only. Owner:
developer proposes the exact host/backend version profile; operator approves
setup and supplies qualification access separately. No safety/performance
advantage has been measured by this selection.

**Profile event — 2026-10-22:** Owner selected the current Linux x86_64/Omarchy
reference snapshot for initial lab qualification, with one worker, 2 CPUs,
4 GiB RAM, 256 PIDs, 2 GiB enforced persistent writable data and a 20-minute
deadline. These are accepted qualification targets, not measured capacity or
production support. Rootless setup, disk-quota mechanism and production-host
qualification remain separate gates; no system changes were authorized.

**Setup event — 2026-10-22:** Owner separately authorized the lab setup. Installed
the official static Docker/rootless-extras `29.9.2` (download SHA-256 recorded in
the G0 pack) under `$HOME/bin`, with upstream static `slirp4netns 1.3.6` and
bundled `rootlesskit 3.3.0`; created and started a user `docker.service`; kept the
prior rootful `default` context current and added a separate `rootless` context.
Daemon reports `rootless`, `overlayfs` and cgroup driver `systemd`. Controlled
tests observed a `100000 100000` CPU quota with 20/21 periods throttled, a 512 MiB
memory limit with a 32 MiB over-limit process OOM-killed (exit 137), and a 64-PID
limit with fork denied at 16. A `--pids-limit=64` container whose PID 1 and child
ignored `SIGTERM` was stopped with `docker stop -t 1`: exit 137, no surviving host
process and no heartbeat write after stop. A `--storage-opt size=64m` probe wrote
128 MiB successfully, so that option is **not enforced** on this rootless
overlayfs/btrfs host. The owner chose a provisioned hard cap instead: a fixed-size
2 GiB ext4 workspace image (`$HOME/.local/share/loom-lab/workspace-2g.img`,
`mkfs.ext4 -m 0 -N 200000 -L loom-workspace -E root_owner=$UID:$GID`, user-level
udisks loop mount under `/run/media/$USER/loom-workspace`) is the only persistent
writable run volume. With a read-only rootfs and 64 MiB tmpfs `/tmp` and
`/dev/shm`, a 2.3 GiB fill hit ENOSPC at 1.9 GiB (`dd` exit 1) and a 100 MiB
`/tmp` fill hit ENOSPC at 64 MiB. Docker's image/metadata store remains
supervisor-owned and uncapped, so runner log caps and a mount preflight are
required; boot persistence and loop cleanup authorization are unqualified. The
logged `restoring thread network namespace failed` line matches known detach-netns
noise reported by a Moby maintainer on working setups; port publishing itself
remains untested. `--skip-iptables` was needed because `nf_tables` was not loaded.
Not qualified: runner integration of the workspace cap and log limits,
linger/boot start, final digest-pinned runtime image, provider-broker integration,
port publishing and production-host support. The existing rootful daemon was not
modified. Rollback is the rootless setuptool uninstall plus removal of only the
user-level unit/binaries/context and the workspace image/loop mount; never touch
the rootful daemon.

## [ADR-007] - 2026-10-22 (P0 framework baseline proposal)

**Title:** Retain and revalidate the existing framework pin for the first small fix.

**Status:** Accepted — owner chose retain/revalidate on 2026-10-22.

**Context & Problem Statement:** The SDK decision is accepted, but the sibling
framework has advanced from pinned `2.1.0` to `4.0.0`. The read-only
[baseline review](research/phase-0/07-framework-baseline-review.md) found eight
changed contract/registry/lock files, unchanged artifact/result/ledger reference
bytes, and no fresh complete Loom/Pi workflow qualification for either baseline.

**Options Evaluated:**

1. Retain `4fe0869ae41b0d81cbe3c6bc643f10ff2049ceed` / `2.1.0`, provision
   its exact required children and qualify the bounded conflict-free workflow.
2. Re-pin to reviewed `bd0cacc5a0a81d41311782d2b20f778ee7b40392` / `4.0.0`,
   including changed child hashes/routing and their new qualification matrix.

**Decision & Rationale:** Choose option 1 for the first small TS-fix profile;
the selected workflow needs neither newer optional close-out workflows nor the
changed conflict/security routes. Preserve the actual pin unchanged.

**Consequences & Tech Debt:** This is not a claim of current production readiness
or an indefinite freeze. Exact `tdd`/`code-review` and triggered diagnosis content
must be provisioned/hashed before use; model-driven whole-workflow evidence is
still future work. Unqualified conflicts/security/data changes hand off. Owner:
developer supplies scoped revalidation and a later drift
review. No sibling edits, skill installation or framework re-pin occur here.

**Status event — 2026-10-22:** Proposed → Accepted after the owner explicitly
selected “Retain 2.1.0”. This closes the baseline design choice, not full workflow
qualification or permission to install external skills.

## [ADR-008] - 2026-10-22 (P0 durability proposal)

**Title:** Make authoritative SQLite durability explicit and restore from verified backups.

**Status:** Accepted as design — owner approved contract/targets on 2026-10-22;
backup destination/protection and implementation evidence remain open.

**Context & Problem Statement:** `src/store.ts` enables WAL but does not set or
verify synchronous durability. Session reopen/crash probes do not prove host-loss
durability. Effect certainty cannot depend on a runtime transcript or a missing
response. Storage/restore assumptions affect the first schema and outbox design.

**Options Evaluated:**

1. Explicit WAL + `synchronous=FULL` for Loom authority on supported local storage;
   transactional state/audit/outbox, verified consistent backups and clone restore.
2. WAL + `NORMAL` with an explicitly accepted acknowledged-tail loss window on
   host/power failure; potentially less sync overhead, but weaker durability.

**Decision & Rationale:** Choose option 1 for the low-concurrency first profile.
Read back required PRAGMAs and fail startup/admission if they cannot be met.
Do not hold write transactions across network calls, blindly retry uncertain
effects, copy a live DB without its WAL state, or claim code downgrade restores
data. Schema rollback may use a reviewed backup restore rather than an unsafe
fabricated down-migration; the approved recovery/loss window must be explicit.

**Consequences & Tech Debt:** Sync cost is unmeasured; SQLite/OS/device guarantees
remain conditional on the qualified storage stack. Accepted backup targets:
daily plus pre-upgrade/migration consistent snapshots, seven daily/four weekly
copies in an operator-managed separate failure domain, 24-hour host-loss RPO and
one-hour restore target. These are acceptance targets, not achieved SLOs. Primary
audit history is not deleted by backup rotation. Actual destination, protection,
reconciliation and restore drills still need approval/evidence. Owner: operator
supplies the backup destination/protection plan; developer implements/tests only
after G0/P1 authorization.

**Status event — 2026-10-22:** Proposed → Accepted after the owner approved the
design including WAL/FULL, daily/pre-change backups, seven daily/four weekly
copies, 24-hour host-loss RPO and one-hour restore target. Targets are not
achieved SLOs; no backup job, data deletion, setup or restore operation is authorized.

## [ADR-009] - 2026-10-22 (P0 operator/transport proposal)

**Title:** Complete local operator controls through separate trusted and runner channels.

**Status:** Accepted as design — owner approved the local operator/runner
authority contract on 2026-10-22; commands/protocol remain unimplemented.

**Context & Problem Statement:** Historical R-14 describes four recording/orientation
commands; it does not provide the approval/kill/reset and supervised start/resume
surface required by current SPEC/ROADMAP. Actor strings, a TTY or model prose do
not by themselves prove human authorization.

**Options Evaluated:**

1. A local trusted operator CLI outside the sandbox, with OS-established identity,
   explicit critical-action confirmation and action/payload/environment-bound
   decisions; a separate narrow per-runner request/result channel.
2. Add a writable authenticated web/API control surface now; feasible but adds
   remote authentication/session/CSRF and lifecycle scope to the first profile.

**Decision & Rationale:** Choose option 1. Keep the dashboard read-only and
the first deployment private/local. Accepted command-family design and protocol
invariants are in the [G0 pack](research/phase-0/06-g0-decision-pack.md). The runner
can propose operations but cannot approve, reset kill or supply authoritative
identity/epoch. Live authorization remains in the final owned operation.

**Consequences & Tech Debt:** These commands/protocol are not shipped. The trusted
operator account is a stated threat-model assumption, not proof against host-account
compromise. A separate approved host channel establishes actor/confirmation; the
runner never receives that socket/credential. No generic public control API,
agent `--actor human` escape hatch or automatic reset. Owner: project owner
reviews remaining concrete details; developer specifies schemas and tests before
implementation. Previous research remains historical, not implementation evidence.

**Status event — 2026-10-22:** Proposed → Accepted after the owner's explicit
approval of G0 pack sections 4–5 and ADR-008/009. This selects local CLI versus
writable web/API control and the stated authority boundaries. Exact message schemas,
limits, authentication implementation and end-to-end proofs still require the
applicable phase specification/review; no additional command is shipped here.

## [ADR-010] - 2026-10-22 (P0 subscription-provider review)

**Title:** Evaluate SIWC direct for requested Codex subscription; exclude consumer
Antigravity from Loom's provider path under its current terms.

**Status:** Accepted disabled qualification direction after owner clarification;
SIWC direct remains unqualified. No account eligibility, implementation or live
use approved. Original proposal and research below are retained.

**Context & Problem Statement:** Owner requested Codex subscription access and
asked to consider Antigravity subscription. Loom keeps one isolated upstream Pi
SDK loop and provider credentials outside the worker. An OAuth implementation
is not permission to use a hosted service.

**Options Evaluated:**

1. Documented Sign in with ChatGPT direct subscription inference, own app identity,
   public Responses endpoint and narrow local user-controlled Loom broker.
2. Legacy Codex private backend or consumer Antigravity OAuth/CLI wrapper.
3. Separately authorized paid API access; not selected or a silent fallback.

**Decision & Rationale:** Recommend qualifying option 1, not enabling it. Official
SIWC docs permit eligible local/custom apps and expressly authorized automation;
Pi `1.4.0` has a relevant `openai` OAuth seam. Reject option 2 for this review:
legacy backend does not meet the documented SIWC direct route and Antigravity
consumer terms explicitly prohibit third-party access. See the
[source and static-code review](research/phase-0/08-subscription-provider-review.md).

**Consequences & Tech Debt:** Owner supplies plan/workspace, exact model and data
requirements. Developer qualifies own registration/identity, local token storage,
request/stream/tool compatibility, quota accounting, cancellation and redacted
errors before live use. No token sharing, generic proxy, account rotation or
automatic fallback. Login, background automation and allowance consumption need
separate express consent; additional-spend cap stays zero. Account-specific policy
fit, independent review and G0 remain open. No dependency/runtime change made.

**Owner clarification — 2026-10-22:** Personal OpenAI account, GPT-6.1 Sol initial
candidate (`gpt-6.1-sol`), confirmed available by the owner on that account
(attestation, not an API check), private source allowed, required
training/improvement opt-out (owner-applied; confirmation pending) and no
additional owner-imposed retention/residency restrictions for now. This
specifies the initial qualification profile only: Loom's authority, workflow and
verification remain provider/model-independent. Subscription tier,
integration proof and independent review stay open. Vendor/legal duties and secret
hygiene remain; unrelated personal/customer data is not authorized. No login,
background automation, live allowance use, fallback or extra spending approved.

**Closure clarification — 2026-10-22:** owner approved “Defer live qualification”
for disabled SIWC with synthetic/offline, provider-independent P1 only. Tier
preference was stated as “Plus tier + Free tier subject to availibility”; this
is not independent billing/account evidence or permission for automatic fallback,
rotation or switching on quota exhaustion. Training opt-out was confirmed earlier;
owner now explicitly confirms account-level **Include environments: Off**.
These are owner attestations, not CLI/API checks. No live use, login or allowance
consumption is authorized. See ADR-012 for the gate boundary and pending slice.

## [ADR-011] - 2026-10-22 (Ishan review assistant)

**Title:** Persistent project reviewer with human-owned approval.

**Status:** Accepted tooling scope at owner request; activation and first review
require fresh evidence. Not acceptance of G0 or independent human sign-off.

**Context & Problem Statement:** Owner requested a persistent subagent that
prepares professional review reports for Ishan Singh to read and approve.

**Options Evaluated:** reusable project OpenCode profile; an always-on reviewer
service; ad hoc prompts only.

**Decision & Rationale:** use `.opencode/agents/ishan-reviewer.md` with
deny-by-default permissions and local read/discovery only. Inherit the invoking
model, pin each review artifact, return a structured report, and let the parent
persist it. Ishan supplies his own disposition. Reports retain findings,
limitations and follow-up status rather than silently changing after approval.

**Consequences & Tech Debt:** profile and reports persist in the repository;
child-session continuity is optional, not guaranteed eternal process memory.
No scheduler, background daemon, vendor integration, automatic fixes, commits,
release authority or human impersonation. The assistant is a second-pass AI
review, not independent human verification. Actual discovery/dispatch must be
validated; unavailable tools/checks stay explicit limitations.

**Validation event — 2026-10-22:** installed OpenCode `2.1.1` discovers the
profile. Actual child session exposes read/glob/grep and parallel calls only;
local package read succeeded, shell was unavailable (no command executed and no
runtime denial response claimed). First advisory report reviews `fc0e05e`, with
one Low restore-target documentation finding. Parent checked that finding;
Ishan disposition and G0 remain pending. Report:
[G0-fc0e05e](research/reviews/2026-10-22-g0-fc0e05e.md).

**Disposition event — 2026-10-22:** owner stated “review approved” and, when
asked whether this was Ishan's approval of the `fc0e05e` report, replied
“yes Its Ishans”. Record report approval attributed to Ishan via the owner,
not a direct signature or independently authenticated communication. The
original report body is retained; R-001 stays open, no finding waiver or
specific provider disposition was supplied, and G0/P1/live-use authorization
remains separate. This event does not approve the uncommitted reviewer tooling.

## [ADR-012] - 2026-10-22 (G0 closure boundary)

**Title:** Separate provider-independent core readiness from live integration qualification.

**Status:** Accepted scope boundary, owner-approved T-01 scope and owner-accepted
G0 package (2026-10-23). P1 implementation not started or authorized by this record.

**Context & Problem Statement:** the G0 review found a restore-target mismatch
and asked whether unresolved provider eligibility changes core ownership. The
core ledger/admission/recovery design is provider-independent; the owner approved
deferring live qualification with SIWC disabled rather than doing live tests now.

**Options Evaluated:** block core readiness on live qualification; prepare the
synthetic-only core with an explicitly disabled, separately gated integration.

**Decision & Rationale:** use the latter. Keep ADR-005–009's ownership, isolation,
operator and durability boundaries unchanged. Correct R-001 to ADR-008's accepted
one-hour restore target; the roadmap's 30-minute proposal is superseded, not a
different hidden SLO. Prepare T-01 first; do not promote Pi or implement the broker
as part of closing planning. The closure packet assigns later proof obligations.

**Consequences & Tech Debt:** eligibility/own app identity, data handling, explicit
run-scoped tier/model selection, quota/cost accounting, broker and live access
must pass qualification/approval before any real inference or private-data use.
Plus and Free are candidates subject to availability, never implicit substitutes.
Backup destination/protection, final host/image/mount/log/egress/startup/cleanup,
locked framework children and production restore remain their implementation-gate
obligations with named owners. No safety test or scanner gate is waived. The first
core package must have an approved exact migration contract and fresh baseline
before code; this planning decision neither implements it nor approves release.

**T-01 scope approval — 2026-10-22:** owner stated “T-01 approved” after the
package/slice explanation. Approves schema and safe-migration scope in the
closure packet, not G0 package acceptance, phase advancement, a specific SQL
migration or release. Prepare the detailed P1 contract before code; keep live
providers disabled. This is post-review approval metadata; approved review
reports and their original candidate identity remain unchanged.

**G0 acceptance — 2026-10-23:** owner stated “G0 accepted” after the final
scope/failure-assumption summary and design-readiness assessment. G0 is closed
as a build-ready design/feasibility gate, not production certification. T-01's
schema/safe-migration scope remains approved; its detailed migration contract,
active P1 specification and fresh baseline precede code. Deferred containment,
backup/restore, scanner, framework and provider obligations retain their later
gates. No live calls, login, allowance consumption, additional spend, dependency
promotion, deployment, commit/push or P1 implementation is authorized by this
acceptance alone. Approved reports remain unchanged; this is a later owner
gate disposition, not an expansion of Ishan's artifact-specific approval.

## [ADR-013] - 2026-10-23 (T-01 schema and legacy claims)

**Title:** Recognize exact store schemas and preserve unknown legacy identities.

**Status:** Accepted scoped design after owner approved store/SQL/CLI test seams
and “Preserve unknowns as NULL”; implementation and fresh gates required.

**Context & Problem Statement:** owner authorized P1 after PR #4 merged. The old
R-11/R-13 research proposes non-null identities/main-thread defaults, but current
G0 requires preserving legacy claims without fabricated authority. The scaffold
has no schema registry, durability read-back or immutable audit enforcement.

**Options Evaluated:** backfill guessed identities; move legacy records to new
archive APIs; preserve old fields and add nullable unknown identities with scoped
views excluding unattributed claims. Owner selected the latter.

**Decision & Rationale:** extend `src/store.ts` only; recognize empty/known
unversioned scaffold/intact v2, refuse all other layouts. Migration and registry
commit under BEGIN IMMEDIATE, with WAL/FULL/foreign-key/recursive-trigger read-back
on file-backed connections. Preserve helper signatures/JSON; legacy helpers write
claims, not authority. Native lifecycle identity enforcement belongs to T-03.
Use deterministic shipped-DDL schema references to detect drift rather than trust
table names or a version marker. New authority structures start empty.

**Consequences & Tech Debt:** nullable metadata is an explicit owner-approved
legacy exception to older proposals, not permission to certify an unknown actor.
Migration compatibility is intentionally limited to known declarations. Trigger
guards protect supported writes including replacement collisions; raw same-process
SQL/DDL authority is outside this protection, so worker isolation remains required.
No real DB migration or model use authorized. Restore uses verified clones, not
automatic downgrade. Tests use confirmed public seams and native SQLite faults.

**Tooling/environment event:** already-installed Bun is 1.4.4; fresh 3-test
baseline is 100% functions/89.73% lines, versus historical 90.99% on 1.4.3 with
unchanged source. No runtime upgrade performed. Owner authorized temporary
Gitleaks 8.30.1 download/checksum verification/local scan under `/tmp/opencode`;
no project dependency or global installation. Its scan result is still required.

**Review closeout — 2026-10-23:** implementation is committed at `e9f4a3d`;
report meta-review at `056b374`. Fresh ordered gates passed, including verified
Gitleaks source/report scans. Both reviews found no confirmed blockers. Owner
stated “Approved by Ishan and merge the meta-review and the previous agent
review”; record Ishan's approval via that relay and consolidate the two reports
without rewriting either source. No direct signature or independent identity
verification claimed; source report hashes and candidate identity are preserved
in `research/reviews/2026-10-23-p1-t01-consolidated.md`. New rendering is a
parent-authored synthesis, not an additional Ishan-signed report. G1, later-slice
authorization, Git merge/push, production migration and live use stay separate.

## [ADR-014] - 2026-10-23 (T-03 audit lifecycle)

**Title:** Native insert-only audit lifecycle and conservative recovery queries.

**Status:** Accepted; implemented and verified for T-03. Owner confirmed five
public lifecycle/query seams, explicitly kept retirement disabled, then relayed
Ishan's approval and authorized the T-03 commit on 2026-10-23. G1 remains open.

**Context & Problem Statement:** after approving T-01 reviews, owner requested
“commit and continue”. Existing legacy helper cannot represent native lifecycle.
The T-01 view can suppress incomplete newest rows; treating absence as no pending
work would hide uncertainty. Old archival retirement notes conflict with immutable
history and missing authorization/backup controls; owner selected no deletion.

**Options Evaluated:** trust projected latest rows alone; validate native history
at the store before transition/read; create new tables/materialized state now.

**Decision & Rationale:** extend the existing store/exports with openAction,
recordVerdict, recordFinish, getAction and listOpenActions. Reuse v2 data/guards;
no migration. Strict native identity/state/evidence validation, atomic read/insert
under immediate transactions, no terminal reopening. Validate all native history
within run before exposing scoped results; partial rows fail closed rather than
fall back to prior success. Legacy all-NULL identity claims remain untouched.

**Consequences & Tech Debt:** full-run validation has linear read cost; no cache
or schema shortcut until measurement warrants a separately verified design.
Raw host SQL remains trusted; actor syntax is not physical-human authentication,
verdicts do not dispatch and outcome facts do not certify task completion. Actual
gate/operator/outbox work remains later slices. Export/verify/separately approved
retirement is documented only, with no trigger bypass/deletion path. Existing
CLI/legacy APIs and approved reports stay intact; tests use confirmed public seams.

## [ADR-015] - 2026-10-23 (T-02 gate and fencing)

**Title:** Require live gate context for native ledger writes and retain lease epochs.

**Status:** Owner-approved scoped design after “continue” from `aa3287b`; owner
confirmed gated normal writes/CLI, retained lease rows and public test seams.

**Context & Problem Statement:** T-03 provides audit facts, not effect authority.
Normal recordTransition/CLI currently bypass leases. Deleting a released lease
also deletes its epoch counter, permitting same-owner stale-token reuse after
reacquisition. Missing lease validation permits malformed time/epoch state.

**Options Evaluated:** add an opt-in gate while preserving normal bypasses;
require gate context and explicitly isolate migration/bookkeeping exceptions;
introduce a new authority service/schema. Owner selected the second, with retained
expired lease rows rather than a schema migration for fencing counters.

**Decision & Rationale:** required trusted run/thread/workspace/owner/epoch context
for recordTransition and CLI record; gate checks global/run kill before live
lease in the same immediate transaction. Rename ungated historical writer for
fixture/migration use only and omit from package index/CLI. Acquire checks kill
as bootstrap, release is cleanup; keep expired row so fresh acquisition increments
previous epoch. Audit outcomes/reconciliation remain recordable under kill and
never authorize dispatch. T-05/T-06 still own full kill and policy controls.

**Consequences & Tech Debt:** deliberate normal-write interface change, every
caller/fixture updated. No schema rewrite or old identity backfill. Host context,
workspace identity/canonicalization, clock and direct DB access remain trusted;
marking a migration helper is not isolation. No effect can use this partial gate
as full production authorization. Native transaction/savepoint semantics and
real-process fencing/recovery require fresh evidence, not old experiment claims.

**Implementation event — 2026-10-23:** 45-test suite and ordered code gates pass;
fixed-artifact T-02 AI advisory has no confirmed findings, Ishan disposition
pending. No schema/audit lifecycle rewrite, effect authority or G1 closure claimed.

**Authority event — 2026-10-24:** owner requested “commit and continue”, authorizing
T-02 commit and the next planned T-04 slice. This is not an attestation of Ishan's
T-02 approval; keep that human disposition pending. No push/live use/G1 closure.

**Approval event — 2026-10-24:** owner subsequently stated “T-02 also approved by
Ishan”. T-02 implementation/advisory in `39cb915` approved through the owner;
earlier pending status superseded, original AI report retained. No independent
signature claimed; no G1 closure, push, commit, real effects or next-slice authority.

## [ADR-016] - 2026-10-24 (T-04 synthetic outbox)

**Title:** Persist immutable effect intent and dispatch observations, not inferred success.

**Status:** Owner-confirmed scoped design after “commit and continue” from T-02;
synthetic migration/replay scope and public seams confirmed before tests/code.

**Context & Problem Statement:** no outbox exists in v2. Business progress alone
cannot establish whether an external effect happened. A crash between target
commit and Loom marker may replay; kill cannot atomically cancel admitted work.

**Options Evaluated:** optimistic applied cursor with blind replay; immutable
intent plus admitted attempts/observations and explicit target reconciliation;
introduce real remote adapters before production policy/containment exists.

**Decision & Rationale:** additive atomic v3 migration with exact v2 recognition.
Bind stable intent UUID to native action, target, exact JSON payload/hash and
replay contract. Require shared business/enqueue transaction and per-item live
gate. Commit attempt before fixture adapter call outside DB lock; admitted
high-water cursor never suppresses unresolved older work. Keep late result facts
even after kill/lease succession. Only proven fixture-target dedup permits
idempotent replay; non-idempotent uncertainty needs explicit human-attributed
evidence-backed reconciliation, never a throw-to-not-executed conversion.

**Consequences & Tech Debt:** schema v3 means old binaries must refuse, not
downgrade. Linear validated history scans initially; optimize only with measured
need and verified projection. Host callbacks/SQL/clock and evidence attribution
remain trusted, not authentication or isolation. No actual production effect or
complete policy/kill claim. Fixed-artifact review and fresh migration/recovery/
contention tests required; T-02 approval remains pending, not manufactured.

**Implementation event — 2026-10-24:** v3 and 59-test suite pass ordered code
gates, including independent target-side crash deduplication and competing
non-idempotent relays. No exactly-once claim from Loom alone. Fixed-candidate
advisory and Ishan disposition pending; no real effect or release authority.

**Review event — 2026-10-24:** initial advisory R-001 identified cursor overwrite
before validation with pending work. Reproduced by public regression, corrected
by admission-transaction validation before events/cursor writes; corrected ordered
60-test gates pass. Preserve initial report and require new-artifact re-review;
no waiver, human approval or authority expansion inferred.

**Re-review event — 2026-10-24:** corrected manifest
`3f6bc846536f79e02064e155bfabadc0887d72d0ffa4915f2938a8024bee1d47`
reviewed; R-001 resolved, no open confirmed findings, ready for human review.
Initial report preserved; final scoped scans/document checks pass. T-04 remains
uncommitted, T-02/T-04 human dispositions pending; no G1 closure/next-slice authority.

**Authority event — 2026-10-24:** owner requested “commit” after corrected T-04
handoff. Commit only this slice and its retained reports after fresh checks;
T-02/T-04 human approval remains pending. No push, next slice or real effects.

**Approval event — 2026-10-24:** owner relayed “Approved by Ishan” after T-04
commit `d0a02dd`. Record corrected T-04 implementation/re-review approval through
the owner, not independent identity verification; preserve initial R-001 report.
T-02 remains pending. No G1 closure, live effects, push or next-slice authority.

## [ADR-017] - 2026-10-24 (T-05 scoped kill and guarded reset)

**Title:** Bind run leases and preserve immutable kill-denial/reset evidence.

**Status:** Owner-confirmed design after “commit and continue” from approval
closeout `08292d9`; scoped migration, synthetic reset and test seams confirmed.

**Context & Problem Statement:** leases don't persist run identity, so scoped
revocation would guess or over-revoke. Ordinary audit state rejects a second
verdict; allowed-but-undispatched cancellation needs distinct durable proof.
Admitted work must not become not-executed, and reset must not revive old authority.

**Options Evaluated:** globally revoke for a run kill; trust transient run mapping/
actor strings; persist scoped binding/control evidence with fresh-plan reset.

**Decision & Rationale:** additive atomic v4 migration, nullable unknown legacy
identities, bound native acquisition/gate, immutable critical kill triples and
audit-denial links. One transaction revokes, latches, denies/cancels only never-
admitted work. Healthy epochs bump; invalid/exhausted epochs expire and remain
ungrantable rather than overflow into authority. Keep in-flight observations.
Reset recomputes exact scoped plan, requires trusted host human attribution and
fresh fixture verification/cleanup evidence, blocks unresolved admitted work,
clears only its latch and never re-grants/resurrects.

**Consequences & Tech Debt:** schema v4/unknown-run fencing changes native-write
eligibility intentionally. Host context/clock/SQL/evidence remain trusted, not
authentication/containment proof. CLI critical controls, real cleanup/identity and
production reset qualification remain later work. Corrupt storage can fail the
atomic operation; never claim a successful partial kill. Existing guards/data,
fixed-artifact review and original safety regressions remain required.

**Implementation investigation — 2026-10-24:** public status stress fixture found
210 false clear readings while one legacy kill scope was continuously active;
separate global/run reads observed different snapshots. A single short read
transaction corrected it; minimized atomic scope-switch fixture passes without
raising test timeouts. Native control/reset process races are tested separately.
After crash, concurrent connection setup also returned SQLITE_BUSY_RECOVERY before
reset: stage connections sequentially, then release reset attempts together. Busy
startup remains a caller retry condition, not a successful control operation.

**Implementation event — 2026-10-24:**82-test ordered code gates pass, focused
22-test corpus passes three consecutive runs. Orphan outbox observations now
invalidate automatic kill non-execution proof; cancellation reuses that shared
history validator. Scope/reset/late-fact/rollback/process proofs remain synthetic;
fixed-artifact advisory and Ishan disposition pending, no production authority.

**Revocation edge-case event — 2026-10-24:** legacy SQLite TEXT PRIMARY KEY can
contain NULL. A public failing fixture showed per-key equality updates skipped
such a row. Revocation now uses one parameterized scope-wide UPDATE, preserves
unknown keys, safely bumps only valid bounded integer epochs and expires all
selected rows. A second failing SQL-ignore fixture added a cardinality check so
incomplete revocation aborts the whole control transaction, never partial success.

**Review event — 2026-10-24:** initial T-05 R-001 and adjacent latch-adoption
question reproduced as public false-success failures under ignored SQL writes.
Require one persisted denial link, one latch write and exact completed-event
reference; rollback all state on mismatch. Corrected86-test gates pass; preserve
initial advisory and require new-artifact re-review, not a waiver or human sign-off.

**Re-review event — 2026-10-24:** fixed-artifact review T05-20261024-02 reports
R-001 and the adjacent latch question resolved, no open confirmed finding, for
overlay manifest `f98ab70bd281c8121579e716c054561e2f1065482989b6bd3bbec1457ab61519`.
Report SHA-256 `69921687f9c33340b389b0a56178e281592bb7df81f4618c5f8ad04c6263690d`
after the appended approval record. Reviewed source/test/fixture hashes matched
the current files. This was an AI advisory; the separate approval event below
records the human disposition.

**Approval event — 2026-10-24:** owner stated “approved by Ishan, commit and
continue” after the T-05 candidate handoff. T-05 implementation/re-review
committed as `f955622bf1c277bd914b1e738a28a5475164cb9d` is approved through the
owner; R-001 and the adjacent latch question remain resolved, original advisory
retained. Attribution is owner-relayed, not a direct signature or independent
identity verification. T-05 only: no G1 closure, push, production/provider use or
real effects. The same instruction authorizes T-06 contract/discovery and
synthetic implementation under separately confirmed seams.

## [ADR-018] - 2026-10-24 (T-06 effect gate, grants and budgets)

**Status:** Owner-confirmed synthetic contract; implementation and ordered code
gates and corrected fixed-artifact advisory verified; approved by Ishan as
relayed by the owner. T-06 commit explicitly authorized; no next-slice authority.

**Context:** T-02 gates ledger writes with kill→lease; T-04 relay calls that
gate per item but has no deadline, grant, policy, risk or budget admission.
R-16/R-18/R-20 require one decision point, deny-wins scopes, narrowing grants,
deadline inheritance and atomic budget draws. T-05 kill is human-only, and the
existing v4 schema already carries `budgets`, `usage` and `grants`.

**Decision:** Add `authorize(db, request, policy)` as the effect-admission gate
in the order kill → deadline → grant → policy/risk/budget check → lease → budget
draw → audit. Keep `writeGate` as the approved bookkeeping gate. Root/supervisor
requests are policy-only; delegated requests require a live grant that covers
every target and never widens policy. Deny wins globally/run/thread; no reusable
allow token; `relayBatch` requires an explicit policy and authorizes every
dispatch again. Budget caps fail closed by deny/ask plus audited
`budget-breach` with kind/counter evidence; automatic kill is deferred because it would reopen T-05's
human-only control. Use the existing v4 tables and trusted caller policy config;
no schema v5 and no policy table. Risk uses recorded/declared observables for
tier, workspace escape, secrets/prod/egress, fan-out, novelty, prior deny and
irreversibility; velocity/doom-loop/failed-confirm are deferred until runtime
records them. Paths are normalized workspace-relative; `..`/absolute escape and
secret-adjacent targets deny before policy; compound shell commands cannot
receive an allow through a wildcard.

**Consequences:** T-06 is synthetic policy/budget machinery, not process
containment or a live adapter. `relayBatch` callers/tests must supply policy.
Grants are insert-only through the API; direct host SQL remains trusted in this
boundary. Unresolved asks remain auditable pending actions and may block reset
until resolved. Symlink physical resolution, live-thread release, automatic
budget kill, provider metering and production restore remain later work.

**Implementation investigation — 2026-10-24:** deterministic regressions found
that retrying an audited ask removed novelty and allowed the next request;
novelty now requires a prior allowed decision. A real competing writer showed
an expired deadline being admitted from a pre-lock clock sample; sample the
default host clock only after acquiring the writer lock. A second process
reproduced false counter-corruption errors between independent budget/status
reads; use one short deferred snapshot, including nested savepoints. Actual cost
overage remains recorded and blocks later admission without changing kill.
Relay must not run the bookkeeping lease check ahead of the full effect gate;
a deadline+stale-lease regression preserves the confirmed gate order. These
are implementation corrections, not production containment claims.

**Initial review — 2026-10-24:** overlay T06-20261024-01 (manifest
`1037b0d9a9c1bd9259a5bf4cd77d6dc22dfab88d8fd131386a08d94105d97e19`) has
three advisory findings: wildcard literal-star precedence bypasses deny;
SQLite sidecars miss secret classification; call-budget rejection follows
lease rather than the specified precheck order. Reproduce and fix at the shared
matcher/classifier/gate, then issue a new immutable candidate. Do not waive the
contract or infer human approval. External-directory access was resolved with
a byte-matched read-only workspace copy, not a mutable-file substitution.

**Review correction — 2026-10-24:** R-001/R-002/R-003 reproduced with four
public failing regressions. Matcher precedence now handles pattern stars before
literal equality; DB denial includes SQLite sidecars. Extract one shared budget
draw-state calculation for pre-lease cap validation and post-lease atomic draw;
no usage is consumed on lease denial. Corrected112-test gates pass; retain the
initial advisory and require new-artifact re-review. Human disposition remains
pending. Temporary review copies are removed after archive byte-match before
repository-wide checks; never exclude them by changing project config.

**Re-review — 2026-10-24:** corrected overlay T06-20261024-02, manifest
`546f9f058458c648bd40190279a2eb98a8ba3c56a48e71e0c358e924ff8916df`, receives
READY FOR HUMAN REVIEW with R-001–R-003 resolved and no new/open confirmed
findings. Report `research/reviews/2026-10-24-p1-t06.md` pre-approval SHA256
`40ad3bbcafd10677e257234b37103327df796606e6bd643d10e202e12367aad1`.
Reviewed source/test/fixture hashes match current files; archive retained,
owned review copy removed after byte-match. This is AI advice; Ishan's human
disposition, commit/push and later-slice/provider/effect authority remain pending.

**Approval event — 2026-10-24:** owner stated “Approved by Ishan, commit”
after the corrected T-06 handoff. Approval applies to overlay
T06-20261024-02 and manifest
`546f9f058458c648bd40190279a2eb98a8ba3c56a48e71e0c358e924ff8916df`;
R-001–R-003 resolved, original advisory retained. Attribution is owner-relayed,
not a direct signature or independently verified identity. Fresh ordered gates
and reviewed source/test/fixture hash checks pass. Owner authorizes commit of
T-06 only; no T-07 continuation, push, G1 closure, production/provider use or
real effects.

Approval-appended T-06 report SHA256:
`5bdc73fa0da1dba40c2e5e77a9800b8f43f16d4de52daff31637a06612ff7e71`.

**Continuation / publication blocker — 2026-10-24:** after approved T-06 commit
`9f3241a`, owner requested “push and continue”. `git push --set-upstream origin
feat/p1-policy` failed exit128 with SSH public-key authentication denial; missing
askpass was also observed. No remote/credential change, credential inspection
or successful publication claimed. Repository owner owns restoration of SSH
access. Continue local T-07 discovery on `feat/p1-cli-conformance`; confirm run
metadata/lifecycle, critical CLI control and framework integrity seams before
implementation. Keep pinned2.1.0 despite sibling4.0.0; research is read-only,
not authority to re-pin, install providers or close G1.

## [ADR-019] - 2026-10-24 (T-07 run CLI and offline integrity)

**Status:** Owner-confirmed scope; implementation and ordered offline gates
and fixed-artifact advisory verified with no confirmed findings. Human
disposition and qualification handoffs remain pending.

**Context:** Approved T-06 is committed `9f3241a`. Owner requested push and
continuation; push is blocked by SSH authentication. Existing CLI has no run
metadata/lifecycle, re-init succeeds, missing status creates a DB and framework
check can succeed without inspecting the actual mismatched installation.

**Decision:** Owner approved additive schema v5 for immutable run metadata and
transition evidence, atomic lease-gated init/record, phase open/close checks,
human-readable default/explicit JSON and no automatic lease acquisition.
Keep committed phases distinct from independent successful-task verification.
Expose synthetic-only kill engage/status/plan-reset/reset through existing
human-attributed audited controls and fresh snapshot reset, resolving the older
four-command R-14 limit in favor of the explicitly confirmed operator drill.
Inspect actual selected Git revision/version/lock and explicit installed skill
roots with pinned hash semantics; no global lookup, installation, fetch, sibling
edit or automatic re-pin to make readiness pass. CI uses qualified Bun1.4.4 and
ordered offline gates. Old history receives no fabricated metadata/evidence.

**Consequences:** Init/record require a host-prepared current DB and live lease;
status is read-only and missing DB is informational. Existing CLI callers/tests
must opt into JSON and registered-run lifecycle. Actual configured4.0.0 sibling
must fail against selected2.1.0; synthetic fixture success is not actual runtime
qualification. Critical CLI attribution is trusted-host syntax, not authenticated
human identity. Remote CI/push, human-run drill, real effects/providers and G1
closure remain separately blocked/unqualified. Rollback is copy/restore and
reconciliation, never destructive removal of v5 run/evidence history.

**Implementation investigation — 2026-10-24:** new v5 evidence could change
without invalidating an existing reset plan; a failing public reset regression
now binds run metadata and evidence into the snapshot hash. Registered phase
writers validate prior history rather than trusting only the last row. Actual
framework integrity uses Git object hashes without repository filters/scripts;
a native Git replacement-ref fixture showed a different tree accepted beneath
the expected commit, so read-only Git probes explicitly disable replacement
objects. Malformed VERSION contents must not enter errors; reject their format
before constructing mismatch diagnostics. All experiments are synthetic, not
proof of authenticated identity, actual framework qualification or containment.

**Offline gate evidence — 2026-10-25:**142 tests/2079 assertions pass with
100% functions/98.11% aggregate lines versus100%/97.04% baseline; scoped store
coverage99.68% retained. Focused30 tests/141 assertions pass three runs. Offline
operator drill and14-package dependency audit pass; no provider calls or actual
framework installation used. Native Git probes bind the tree to the captured
commit ID and ignore replacement objects. Remote CI, human drill execution,
actual selected installation and G1 remain unqualified; no human sign-off
inferred from automated checks. Reviewed artifact preparation is next.

**Orientation hardening — 2026-10-25:** a legacy phase containing a newline
injected a forged `Kill: clear` line beneath an actual blocked header. Public
CLI regression reproduced it; human status labels now neutralize control
characters before line assembly. Structured JSON keeps escaped historical facts
unchanged. This is output framing, not rewriting legacy evidence or allowing
status text to grant authority.

**Fixed-artifact advisory — 2026-10-25:** review T07-20261025-01-AI-01
recommends READY FOR HUMAN REVIEW, no confirmed current-scope findings, against
base `9f3241aa2186b1ac975f60eb09f7b367cee1fc68` plus T07-20261025-01 manifest
`f27b710ed73deef65c2d3263f72adbccd9c3873774f8b0f27c76364c153e5c8c`.
Report `research/reviews/2026-10-25-p1-t07.md` SHA256
`22e412a2336213b5208c66737c42d0b445774fe14d837512e9b8ce9eef4804f7` preserves
the unchanged advisory plus parent-attributed durable manifest. Code/test/CI
hashes match reviewed files; workspace copy removed after archive byte-match.
No human disposition or phase approval inferred. Authorized T-06 push retry
still fails SSH authentication; owner restores access. Matching actual
framework, remote CI, human drill and G1 remain unqualified, not waived.

**Commit authority / continuation — 2026-10-25:** owner stated “pushed, commit
T-07 and continue”. T-06 branch publication is owner-reported; agent-side
`git ls-remote` still fails SSH authentication, so remote state/CI are not
independently verified. T-07 commit explicitly authorized after fresh ordered
gates and durable-manifest checks; no implementation change. Ishan's T-07
disposition and human drill evidence remain pending, not inferred from commit
authority. Continue with G1 closeout evidence/discovery; no automatic phase
closure, T-08/P2 implementation, T-07 push, framework re-pin/provider/real effect.

Authorization-appended T-07 report SHA256:
`3a87e11556e47c4c818ba9eaa45c58a7dd2c0a29d7c9c8b27112481bfcb850f0`.

**Fresh-runner fixture correction — 2026-10-25:** GitHub run40173273410 at
`ffed35e299726c9868b3fecfbe725f67edd4dc29` exposes nine ENOENT failures because
some fixture allocations assume `/tmp/opencode` already exists. A child mount
namespace with an empty `/tmp` reproduces12 failures, including three run tests
masked by suite order. Follow the existing recursive-mkdir-before-mkdtemp
pattern at all seven missing allocation sites; do not add CI-only setup that
hides standalone test/drill failures or remove the host directory to reproduce.
Independent file runs, standalone drill and full143-test coverage pass in fresh
tmpfs namespaces. Prior frozen advisory/owner-relayed approval remains tied to
its original artifact; this test-only correction still needs publication/CI.

**Evidence and approval before G1 closure — 2026-10-25:** owner relays
“Approved 555586b by Ishan” and authorizes recording/committing evidence before
G1 closure. Corrected artifact `555586b8d00e5d3350bd671054b5a97140ecfbdb`
independently verified green in GitHub run40178607723: lint, strict check,
143 tests/2,082 assertions (100% functions/98.11% lines), standalone drill and
14-package audit pass. Owner attests personal drill execution and supplies
successful output at `ffed35e299726c9868b3fecfbe725f67edd4dc29`; preserve its
synthetic/automated-fixture label and older artifact identity. No individual
signature, new AI review or human rerun on corrected artifact is inferred.

Gate interpretation resolves the earlier over-broad actual-installation handoff:
ROADMAP's G1 exit is synthetic/core CI and process/filesystem fixtures; its
framework risk register blocks affected framework execution, and T-07's plan
tests drift using fixture skills. Actual installed-framework qualification is
therefore not a synthetic G1 blocker, but remains mandatory before affected
framework execution. Retain selected2.1.0; last-inspected4.0.0 remains mismatched/
unqualified. No requirement is waived, installation/re-pin authorized or actual
qualification claimed. G1 remains open pending explicit owner closure after
the evidence commit; merge, push and P2 remain separate actions.
