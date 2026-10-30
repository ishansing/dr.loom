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

**G1 closure and merge preparation — 2026-10-25:** owner requested “Close G1 if
it satisfies the spec and prep for merge”. Reviewed SPEC first-milestone criteria
and ROADMAP G1 against recorded evidence; conditions met within synthetic/core
scope, so G1 is CLOSED. Evidence was committed first as `7f85871`; Ishan's
approval of `555586b` is owner-relayed and human drill remains bound to
`ffed35e`. No fabricated same-SHA human rerun or new AI advisory. Fresh ordered
gates and full coverage in an empty-`/tmp` namespace pass143 tests/2,082 assertions,
100% functions/98.11% lines; audit14 packages/no advisories.

Prepare local merge draft for the complete P1 stack into API-verified default
`master` at `2be0e4fe7a593887ce690062e68a8dfaeaf170a7` (behind0); local ancestry
and merge-tree check pass without conflict. Cached origin/master is stale and
not used as the merge target. No upstream branch mutation, PR publication or
merge authorized. Framework2.1.0 pin unchanged, actual mismatched installation
remains blocked; P2/untrusted execution/providers/production need separate work
authorization and qualification. Closing synthetic G1 does not close those gates.

## [ADR-020] - 2026-10-25 (P2 kickoff and contention fixture boundary)

**Status:** Discovery under owner continuation authority; first runner implementation
contract/setup/promotion approval pending. Baseline fixture correction in progress.

**Context:** PR #5 merged at `ffbfd47`; owner stated “Merged, continue”. P0
selected SDK1.4.0/rootless Docker, not unrestricted execution or a package pin.
Read-only discovery confirms rootless Docker29.9.2 and an absent capped workspace
mount. Exact SDK archive integrity matches prior evidence; no runtime installed.
Fresh merged coverage exposed an existing relay test failing before child ready.
Isolated test fails3/30; minimized bootstrap captures SQLite busy/recovery in
`openDb`/`schemaKind` before busy-timeout configuration in2/60 process pairs.

**Options:** change public DB-open wait/retry behavior; retry/skip the flaky test;
or initialize child connections to readiness sequentially and then race dispatch.

**Decision:** use the third, already established by the phase-writer fixture.
It preserves two live competing relay processes and one-attempt/one-effect proof
while isolating the intended race from unrelated WAL startup contention. No
automatic retries, sleeps, weakened assertions or public store changes.

**Consequences:** verify100 isolated repetitions plus full gates/empty-`/tmp`
coverage, record the initial red and do not manufacture a clean baseline by
rerunning alone. Keep P2 runtime implementation gated by its exact contract;
propose one offline T-09/T-15 container slice before SDK promotion. Existing
security/material choices remain accepted, not reinvented; rootless image,
mount/log/transport/cleanup integration still needs approval/evidence. No provider,
credential inspection, additional spend, framework re-pin or host setup inferred.

**Verification:** corrected fixture passes100 independent targeted runs; fresh
lint/strict check,143 tests/2,082 assertions with unchanged100% functions/98.11%
lines, empty-`/tmp` full suite, automated drill and14-package audit pass. No
application, package, lock, workflow or prior-review change. Official tag API and
registry archive revalidate selected SDK1.4.0, without installation/execution.

## [ADR-021] - 2026-10-25 (DeltaDB-inspired research boundary)

**Status:** Research completed; architecture/build/integration decision pending.

**Context:** Before continuing P2, owner requests extensive research on DeltaDB
(`https://delta.dev`) and an independently implemented analogue in a separate
repository, including Loom compatibility, pros/cons and a recommendation. This
is not direct product adoption or permission to replace the accepted authority DB.

**Decision boundary:** pause P2 implementation for cited primary-source research.
Distinguish DeltaDB's documented version-control/provenance product from generic
database-engine guarantees and from proposed independent design. Evaluate content/
conversation history as a separate evidence subsystem as well as more ambitious
storage replacement; preserve ADR-008 local WAL/FULL durability, one owner per
fact, external trusted verification and live effect admission. Neither history,
CRDT convergence nor a content hash establishes authorization or task success.

**Consequences:** research files only; no direct Delta account/service use,
proprietary source copying, new repository, dependency installation, schema change,
provider access or paid effects. First-party/public-source evidence and unknowns
must be explicit. Any future independent build/integration or authority/storage
change needs its own approved spec/ADR, failure corpus and recovery plan. Findings
are recommendations, not automatically accepted architecture or P2 advancement.

**Research findings:** three reports under `research/deltadb/` distinguish
documented CRDT/causal/fragment-tree design and hosted storage from undisclosed
core formats/durability, source-observed AGPL plugin contracts, and our independent
proposal. Parent cross-checked material product/security/storage/legal claims and
representative storage/CRDT foundations. Public early-access terms restrict
product-use research; no account/product session was used and no legal/clean-room
clearance is claimed. Recommend a bounded independent revision/provenance engine
using mature persistence, optional Loom shadow evidence integration first, and
no generic authority DB replacement or new replicated leases/kill/completion.
CRDT convergence, source rewind and content hashes do not replace semantic
verification, effect reconciliation or trusted identity. Estimates remain
assumption-based, not measured. Owner disposition/build approval remains pending.

**Commit and sequencing reminder — 2026-10-25:** owner requests “commit this
research and fit this (seperate sandalone build) into the timeline after the
isolated-runner seam (as a reminder)”. Record a separate-repository history/
provenance build revisit after verified T-09/T-15 supervisor/identity-bound IPC/
rootless cleanup, before P3 scope review. This is an accepted reminder, not
allocation of the researched effort inside existing P2 week forecasts, a G2/P3
prerequisite or an implementation/storage-replacement approval. An actual build
needs scoped product/retention/license/recovery approval and an explicit schedule
reforecast if it uses the same developer. Initial Loom integration stays optional
shadow evidence after independent qualification; existing SQLite authority stays.
Commit these research/governance files only; no push, new repository, runtime
effects, live provider use or resumed P2 implementation authorized by this task.

## [ADR-022] - 2026-10-25 (Offline isolated-runner contract proposal)

**Status:** Owner-approved scope/direction after “commit and Approved”; exact
schema, implementation and lab qualification remain pending.

**Context:** owner requested research PR and P2 continuation. PR #6 opened against
master at `8e148ed`, including the previously verified fixture startup repair;
push and PR CI pass. New `feat/p2-isolated-runner` branches from that pending PR
head without merging. Existing rootless Docker29.9.2 is available;2 GiB workspace
image exists but is unmounted. Registry-only inspection resolves Bun1.4.4-slim
Linux/amd64 digest; image has empty default user, so worker identity/mount mapping
must be explicit rather than assumed from rootless daemon identity.

**Options:** prototype an in-memory launcher and defer crash ownership; invent a
separate authority journal; or extend the existing store owner with an approved
durable domain inventory plus narrow rootless supervisor. Recommend the third
before a supported launch; schema6 is a proposal, not silently implemented SQL.
Current synthetic outbox is not permission for real Docker effects.

**Proposed contract:** one offline synthetic domain, exact image/config identity,
nonzero worker UID, capped ext4 workspace and bounded temp/resources, no network/
host authority mounts, strict bounded private IPC and no raw output exposure,
late-start/daemon-loss reconciliation and proven quiescence before reuse. See
`docs/p2-offline-runner-contract.md` for exact proposed defaults and acceptance.

**Consequences:** owner approves material storage direction and precise lab
image/mount provisioning scope before implementation/effects; preserve existing
data and do not fall back to UID0/rootful/world-writable or unbounded storage.
No SDK/model/framework execution, separate history-engine build, commit/push,
new PR for P2, merge or G2 qualification inferred from preparation.

**Owner approval event:** owner stated “commit and Approved” in response to the
two requested decisions. Approves additive schema6 domain-inventory direction
and scoped offline immutable-image pull, restoration of the existing capped
workspace mount and narrow nonroot run-directory provisioning. Also authorizes
this contract/governance commit. Exact SQL/types/migration and acceptance reds
precede implementation; approved scope is not executed SQL or containment proof.
Keep the existing image/data intact; no reformat/deletion, broad recursive chown,
daemon/rootful changes, UID0/world-writable/unbounded fallback, SDK/provider/live
use or extra spend. No Ishan approval, PR merge/push or G2 closure inferred.
This task commits records only; lab operations remain unexecuted by this commit.

## [ADR-023] - 2026-10-26 (P2 durable domain inventory)

**Title:** Keep admission and lifecycle uncertainty in the existing store owner.

**Status:** Accepted within ADR-022's owner-approved offline scope; implementation
is uncommitted and not a G2/containment qualification or human review.

**Context & Problem Statement:** Restart/kill must preserve admitted-launch
uncertainty without treating admission as execution or cleanup as task success.
Distinct logical workspace names must not bypass writable-root reuse fencing.

**Options Evaluated:** Extend the existing store transaction with immutable
domain/event tables; or build an independent launch journal and reconcile two
authorities. The latter adds crash/atomicity problems without an approved need.
An in-memory launch map cannot satisfy the required crash-recovery boundary.

**Decision & Rationale:** Schema6 binds the frozen offline profile, canonical
roots, worker hash, run/thread/owner/epoch, endpoint and deadline. Domain UUID is
the native action ID; `policy_action_id` binds preceding successful policy audit.
Admission atomically draws existing budget and persists requested/allowed audit
plus inventory, returning no replayable permit. Trusted late observations remain
recordable after kill/expiry; kill cannot invent not-executed for admitted domains.
Reset hashes full domain facts and blocks unresolved cleanup. Input/writable roots
are disjoint; unresolved logical workspaces or overlapping canonical writable
roots block admission. Trailing separators reject rather than bypass overlap.

**Consequences & Tech Debt:** Read snapshots validate complete histories, run
references and config/policy evidence. Native process races/crash recovery and
ignored/extra-write trigger injection test atomicity; corruption tests first
reproduced missing run/evidence checks. Full-history reads are intentionally
unoptimized; performance is not measured. Physical aliases/mounts and actual
Docker create/start/cleanup remain the next approved slice, owned by the
implementing developer; no SDK/provider activity, dependency changes, automatic
completion or lease resurrection. Older binaries reject schema6: rollback needs
verified backup/restore and reconciliation, not deleting inventory history.

**Commit event — 2026-10-26:** owner requested “commit and continue”; verified
inventory committed as `264c0b2`. No push, remote CI or phase approval inferred.

## [ADR-024] - 2026-10-26 (P2 physical preflight)

**Title:** Inspect the explicit native backend and visible capped mount before launch.

**Status:** Accepted within the approved offline scope; code/lab evidence remains
subject to final local gates. No launcher or containment qualification claimed.

**Context & Problem Statement:** Durable metadata cannot establish physical
filesystem identity, an available exact image or rootless resource prerequisites.
The old approved workspace image was unmounted and the selected Bun image absent.

**Options Evaluated:** Invoke Docker CLI using operator client configuration; or
use bounded native HTTP GETs over the explicitly supplied local Unix socket.
Choose native reads to avoid ambient contexts, credential helpers, CLI environment
and diagnostic forwarding. A generic backend/transport abstraction adds no value
for the single selected backend.

**Decision & Rationale:** Require engine29.9.2/API1.56 and approved security/
platform/resource metadata, exact digest image with no declared volumes, strict
owned single-file input and worker hash, and the actual capped ext4 mount/backing
inode. Resolve visible mounts through fdinfo `mnt_id`, not first mountinfo target:
a native overmount red reproduced the hidden-record error. Native alias tests
then reproduced input bind aliases; reject input on the writable filesystem and
workspace nested mount IDs. Caller mutation and hardlink reds require an owned
metadata snapshot and single-link worker file. A timed subprocess reproduced FIFO
open blocking; nonblocking/nofollow open rejects it before daemon access.

**Consequences & Tech Debt:** Existing approved image/data preserved. Udisks loop
setup succeeded and the expected filesystem was already mounted; explicit mount returned
AlreadyMounted, not a fabricated exit-zero result. Exact approved image pull used
an empty temporary client config and no login. Only new tiny synthetic preflight
directories/evidence are retained; no ownership changes or workers were executed.
Native Unix metadata fixtures are not containment proof: a separate explicit
physical lab corpus is mandatory for applicable phase coverage. If that lab is
unavailable, the physical phase remains blocked, not skipped. Metadata checks are
point-in-time and return no execution permit. Workload UID mapping, actual limits,
launch/kill/crash/cleanup races and future launcher revalidation remain owned by
the implementing developer; no SDK/provider/dependency promotion or G2 closure.

**Local execution event:** portable174 tests pass but portable-only coverage is
96.28%, below the98.12% baseline; this alone is not the physical-phase coverage
pass. Mandatory full+actual-lab coverage passes175 tests/2,338 assertions at100%
functions/98.31% lines, also with initially empty `/tmp`. Existing module coverage
is unchanged. Lint/strict check, three focused repetitions, automated drill and
14-package dependency audit pass. See SPEC for exact commands and remaining gates.

**Commit event — 2026-10-26:** owner requested “commit”; verified physical
preflight committed as `e40acc3`, then owner requested continuation. No push or
launcher/containment qualification inferred.

## [ADR-025] - 2026-10-26 (P2 private IPC and owned worker)

**Title:** Bound and validate the private stream before connecting Docker effects.

**Status:** Accepted within approved ADR-022 offline scope; new transport/worker
cut is uncommitted and subject to fresh local gates, not G2 or human sign-off.

**Context & Problem Statement:** The supervisor must not trust process stdout or
worker proposals as identity, arbitrary host instructions or task completion.
Validated preflight alone cannot safely consume future Docker attach output.
The capped mount disappeared between sessions; re-establish approved storage for
mandatory physical regression gates, never fall back to an ordinary directory.

**Options Evaluated:** Adopt a generic RPC/framing library; buffer full attach
output and validate after exit; or implement the fixed two-frame private grammar
with bounded incremental state. A generic library/protocol adds unused public
surface; whole-output buffering cannot meet fail-closed streaming limits.

**Decision & Rationale:** One owned parser accepts exactly ready then a fixed-path
candidate SHA256 proposal; it handles non-TTY Docker multiplexing, strict UTF-8/
JSON/sequence/schema and early payload limits with8-byte/4 KiB buffers. Errors
erase internal buffers and permanently poison the instance, exposing only a fixed
safe code. Preserve UTF-8 BOM bytes so JSON parsing rejects them: a deterministic
red reproduced TextDecoder's default BOM stripping. Supervisor vocabulary is only
start/stop. A self-contained synthetic worker has bounded strict input, exclusive
fixed-file creation, no imported Loom authority and no raw error diagnostics.
Native process assertions cover lifecycle/bytes/file preservation; they do not
establish container containment or subprocess line coverage.

**Consequences & Tech Debt:** No package/authority/store migration or public run
CLI. Stop-before-start is harmless; candidate-plus-EOF or duplicate-start still
fails, demonstrating that even valid proposal bytes are not process success.
Kernel UID/GID mapping currently maps65532 to host165531; access/ACL provisioning
and actual runtime proof remain later, with no ownership or permission fallback.
Future launcher must pin final config, mediate admission/start/stop, call parser
finish on normal EOF, reconcile kill/crash/daemon loss and independently establish
domain quiescence before reuse. No SDK/provider/live use or standalone-history
build is enabled. Owner: implementing developer; no performance claim measured.

**Commit event — 2026-10-26:** owner requested “commit and continue”; verified
IPC/worker committed as `3ed86ee`. Continue the approved offline supervisor cut;
no push, independent approval or containment/G2 closure inferred.

## [ADR-026] - 2026-10-26 (P2 governed synthetic bootstrap)

**Title:** Start only bound owned domains; retain uncertainty after observed stop.

**Status:** Accepted within ADR-022's offline scope; implementation/lab gates in
progress, no untrusted-workload or production qualification.

**Context & Problem Statement:** Inventory/preflight/framing cannot execute or
stop a worker. A real bootstrap needs fresh authority, immutable Docker identity,
bounded private attachment and honest late/unknown lifecycle facts. Metadata-only
stopped status does not independently establish descendant quiescence.

**Options Evaluated:** Reuse the operator Docker CLI/context; add a generic sandbox
driver; or extend the existing native Unix HTTP owner with a selected-backend
supervisor. Choose the latter, preserving bounded diagnostics and avoiding client
credential/config loading. Automatically marking stopped as quiescent is excluded
by SPEC; independently qualified cleanup/reconciliation is a subsequent gate.

**Decision & Rationale:** Fixed profile/name/labels bind admission config to created
ID and inspected image/security/mounts before start. Root trusted-supervisor
authority only initially: delegated launch requires shared per-dispatch revalidation
without repeated budget draws, not launcher-side duplication of authorization.
Fresh kill/lease/deadline gates precede create/start/start-command;100ms active
watch closes interrupted sessions. Stop only independently proven owned IDs,
including after kill; do not retry uncertain create/start, stop foreign names,
remove evidence or automatically finish actions. All stops remain unknown/fenced
until independent quiescence qualification; valid candidate bytes are not success.

**Consequences & Tech Debt:** New selected-backend API is module-local, no public
CLI/facade/dependency/schema change. New dedicated lab input/workspace paths use
measured UID mapping and named-user ACLs only; no parent-tree changes, chown, root
helper or permissive fallback. Actual access probe, transport races, inspect/config
drift and cleanup behavior need fresh proof before support. Durable synthetic
inventory/input evidence and stopped containers are retained; future reconciliation
must handle supervisor crash/daemon loss before reuse. Actual resource over-limit,
escaped-descendant, image vulnerability and G2/provider qualification remain open.

**Access red and correction:** first actual bootstrap created/started/proposed/
stopped with candidate UID/GID165531, but supervisor read failed EACCES. Exact
numeric ACL showed named supervisor entry masked to none because worker0600
creation zeroed the ACL mask. Use0640 for the synthetic candidate to retain named
supervisor read access; ordinary group/other entries remain none. Preserve that
failed file/evidence unchanged; no chmod/chown repair, recursive ACL change or
world-writable fallback. Native fixture mode assertion guards this contract.

**Failure-stop refinement:** a valid proposal receives the private cooperative
stop command with2-second grace. Poisoned/failed channels are closed immediately,
not reused for potentially compromised IPC; independently owned Docker stop gives
SIGTERM/2-second/KILL cleanup. Neither path records quiescence from metadata.

**Executable concurrency boundary:** retain generic disjoint-root metadata
admission, but the selected one-worker runtime profile atomically rejects any
unresolved inventory in the same authoritative store before admitting execution.
Use the existing transaction owner, not an in-memory flag or a second scheduler.
Separate explicit lab databases are independent synthetic deployments; lab workers
still run sequentially on the selected backend. Unknown cleanup is never a reason
to bypass the single-worker ceiling.

**Fresh workspace boundary:** executable bootstrap requires an empty dedicated
workspace before admission and again after create/before start, preserving and
rejecting all existing data/config files. Native reds reproduced acceptance of a
nonempty root and startup after staged ambient bunfig input. This closes the
sealed synthetic startup contract without changing profile1 payload/CLI flags,
deleting data or restricting general read-only physical evidence inspection.

**Ready-budget correction:** a real controlled4-second delayed start acknowledgment
reproduced a16.9-second silent-start path, renewing the10-second ready budget after
dispatch. Measure the ready budget from monotonic host start dispatch instead;
acknowledgment delay consumes it, never renews it. The wall timer also clamps to
the fixed maximum rather than extending a session after a backwards wall-clock
adjustment. Unknown/late external effects still require independent reconciliation.

**Runtime binding:** native `/info` confirms the selected installed default is
`runc`. Explicitly bind/inspect `HostConfig.Runtime=runc` rather than allowing an
ambient future daemon default to change startup semantics. The payload regression
failed before this correction; no runtime install, upgrade or daemon change.

**Verification blocker — combined empty-/tmp namespace gate:** deterministic
Bubblewrap run exits1 with200 pass/16 fail before actual-domain provisioning:
its controller-only user namespace makes the daemon subordinate IDs unmapped
(`1 4294967295 65536`, versus native `1 100000 65536`). Linux
user_namespaces(7), https://man7.org/linux/man-pages/man7/user_namespaces.7.html,
documents reader-relative mapping and unmapped-ID semantics; no upstream defect
or new issue is asserted. Native full+lab216 tests pass at100% functions/98.61%
lines, but do not satisfy this failed required namespace gate. Preserve identity
guards and failed evidence; no privileged fallback, map changes or dependency
installation. Fresh native-host state/TMPDIR is supporting proof only, not an
approved replacement. Implementing developer records remaining evidence; owner
must disposition any test-strategy replacement before affected verification closes.

**Local sign-off boundary:** drill/audit, pinned scoped secret scan and changed-doc/
protected-file checks pass (exact scope in SPEC). Labeled native daemon query
observes132 retained containers,87 exited/45 created/0 running; no mutation or
independent descendant-quiescence inference. Leave bootstrap uncommitted and
G2 open pending the required namespace-gate disposition; no further smoke run,
remote CI, image security scan or human approval is claimed.

**Commit authorization:** owner subsequently requested “commit”; recording the
bootstrap with its failed required namespace gate retained, not waived. This
supersedes the leave-uncommitted instruction only; no push or G2 closure authorized.

**Post-commit investigation (`8befd5a`):** installed non-setuid/capability-free
Bubblewrap0.13.1 matches its tag's automatic nonroot user-namespace behavior
(`bubblewrap.c`2971–2973). Minimal mapping assertion reproduces subordinate-ID
loss; explicit current-host namespace reuse and mount-only unshare each fail
unprivileged. Read-only probes only, no root/daemon-namespace fallback or host
configuration change. Source: https://github.com/containers/bubblewrap/blob/v0.13.1/bubblewrap.c.
Targeted issue search found no result (incomplete deduplication); not claimed as
an upstream defect. Recommend owner disposition of a split gate: existing portable
empty-/tmp proof plus native physical corpus with fresh private state/TMPDIR,
explicitly without controller filesystem-isolation/literal empty-host-/tmp proof.
This is a proposal, not an approved replacement or waiver; required gate remains
failed and no application code or G2 status changes.

**Owner disposition — split gate APPROVED:** owner replied “Approved” to the
explicit split-gate proposal. Revise SPEC DoD before execution: full physical
corpus runs natively with fresh private evidence/TMPDIR and unchanged UID guards;
portable/read-only preflight retains Bubblewrap initially-empty `/tmp` proof.
This replaces the combined namespace gate for bootstrap verification only, not
controller filesystem isolation/literal empty host `/tmp` proof. Preserve its
historical failure; no G2 closure, production authority, push or commit inferred.

**Approved split-gate evidence:** unchanged bootstrap `8befd5a` passes the revised
ordered checks with new private0700 state/TMPDIR: portable199 tests, native216
tests/3,276 assertions at100% functions/98.61% lines, focused14 tests three times,
Bubblewrap portable/read-only preflight200 tests, drill and14-package audit.
Exact commands, retained root/log keys and coverage comparison are in SPEC.
Labeled daemon snapshot160 containers (105 exited/55 created/0 running), all
preserved. Local bootstrap verification now passes under the approved reduced
claim; original combined namespace run still failed. Independent cleanup/recovery,
controller filesystem isolation and G2 remain unqualified; no runtime code,
identity guard, schema, provider or production authority changed.

**Bounded temp-filesystem continuation after `20442be`:** owner requested “commit
and continue”; split-gate disposition/evidence committed, then extend the existing
owned access probe only. Acceptance red observed missing tmpfs facts from the
real container before changing the fixture. Updated probe verifies both roots are
64 MiB Linux tmpfs before writes, uses one1 MiB buffer and at most65 write attempts
per root, and requires64 MiB written followed by ENOSPC. Linux tmpfs(5) documents
the size upper limit: https://man7.org/linux/man-pages/man5/tmpfs.5.html.
Focused real-access green passes with candidate-hash and pending-action assertions.
No persistent-workspace fill, host OOM/process stress, changed profile, supervisor/
store/schema change or new dependency. This is actual temp-cap evidence, not CPU/
PID/memory/disk enforcement or independent cleanup proof; final gates still pending.

**Temp-cap final execution evidence:** ordered approved split gates pass: native216
tests/3,277 assertions at100% functions/98.61% lines (coverage unchanged), portable
199 tests, focused14 tests three times, empty-/tmp portable/preflight200 tests,
drill and14-package audit. Actual fixture confirms64 MiB then ENOSPC on each
temp mount;128 MiB expected successful writes, bounded130 MiB attempt ceiling.
Labeled snapshot190 containers,125 exited/65 created/0 running, all preserved.
No runtime/store/profile change or independent cleanup inference; broader resource/
recovery/image/human/CI qualification and G2 stay open. Exact red/green evidence,
private retained-root keys and remaining scope are in SPEC.

**Bounded PID-cap continuation after `d68d832`:** owner requested “commit and
continue”; tmpfs slice committed. Extend only the same owned access fixture and
physical assertion: at most256 `/bin/sleep 30` spawn attempts, empty env/no stdio
pipes, require EAGAIN plus own cgroup `pids.events max` increase, then kill recorded
child handles and await their exits before proposing. Threads count against the
limit, so assert positive child count below256, not a fixed number. Installed Bun
subprocess declarations confirm handle kill/exited semantics; Linux cgroup-v2 docs
confirm fork/clone EAGAIN at pids.max and max-event semantics:
https://docs.kernel.org/admin-guide/cgroup-v2.html. Host kernel7.2.8-9-omarchy;
profile1/Bun1.4.4/rootless Docker29.9.2 and dependencies unchanged.

**PID exhaustion diagnosis/workaround:** acceptance red first reproduced missing
PID facts. Initial fixture also failed before reap completion at the full256-task
ceiling (252 children in instrumented evidence), with protocol or unresolved-cleanup
results. Narrow synthetic stage diagnostics identified `before-reap`; per-spawn
diagnostic delay hid the failure. Capturing each child's exit promise immediately
after spawn, before saturation, then awaiting those existing promises after kill,
passes three instrumentation-free physical repetitions without changed limits or
arbitrary sleeps. Exact Bun watcher/thread cause is unconfirmed; version-tag
source URLs returned404 and targeted issue search returned no result, so upstream
deduplication is incomplete and no new bug/report is asserted. Temporary debug
code removed; failed synthetic evidence retained privately, not repaired/deleted.
No independent quiescence or general Bun PID-exhaustion resilience claim; final
ordered gates still pending for this fixture/assertion-only slice.

**PID-cap final execution evidence:** approved split gates pass unchanged production
code/profile: native216 tests/3,279 assertions at100% functions/98.61% lines,
portable199 tests, actual-access1/10 three final repetitions, launcher/transport
14/131 three times, empty-/tmp portable/preflight200 tests, drill and14-package
audit. Existing module coverage unchanged. No debug code remains. Snapshot229
labeled containers,154 exited/75 created/0 running, all preserved. Exact commands,
retained-root keys, diagnosed limitation and bounded child effects in SPEC; no
general runtime exhaustion resilience, independent cleanup/reuse or G2 closure.

**Detached-descendant continuation after `b80b675`:** owner requested “commit and
continue”; PID-cap slice committed. Add one sealed65532-only same-file parent/
child fixture and actual-domain test, no production/profile/store change. Installed
Bun declarations document detached spawn as setsid; real `/proc/self/stat` facts
must show the child as its own session/process-group leader. Parent binds metadata
to its owned child handle, sends one SIGTERM; child records `T` then dot ticks,
proving receipt and continued work. Both actors ignore SIGTERM and register30-
second timers; parent synchronous IPC still needs host supervision, not a timer-
based crash-safety claim. Child heartbeat is capped at1,500 bytes. Parent ignores cooperative
stop, forcing the existing owned Docker stop path. Linux namespace-init teardown
semantics: https://man7.org/linux/man-pages/man7/pid_namespaces.7.html.
Acceptance red first observed no advancing heartbeat with an inert fixture; green
observes activity, detached identity and `T.` then five100ms unchanged host samples
after stopped=true, with pending/unresolved inventory. This establishes only the
known fixture's shutdown trajectory; it cannot clear quiescence/reuse fences,
qualify arbitrary escaped actors or replace crash/daemon-loss reconciliation.
Final ordered split gates remain pending; no provider/SDK or new commit inferred.

**Detached-descendant final execution evidence:** final ordered split gates exit0:
native217 tests/3,300 assertions,100% functions/98.60% lines; three additional
physical1/21 descendant runs; portable199, focused14/131 three times, empty-/tmp
portable/preflight200 tests, drill and14-package audit. Production-module coverage
unchanged; aggregate98.60 versus98.61 is from two new observer-harness error/timeout
lines, not lost runtime coverage (timeout covered in acceptance red). No guards
removed/exclusions added to mask that difference. Snapshot264 labeled containers,
179 exited/85 created/0 running; all retained. Known actor's heartbeat ceased over
the bounded window after forced stop; no quiescence/reuse/task-completion or crash-
recovery qualification inferred. Exact evidence/limitations/root keys in SPEC.

**Supervisor-crash continuation after `9f0849c`:** owner requested “commit and
continue”; detached-stop slice committed. Add a test-only native controller driver
and post-start SIGKILL/reopen regression using the same bounded descendant fixture.
Driver receives one private synthetic envelope with explicitly constructed minimal
env/no stdio, invokes existing run API and owns no new recovery authority. Parent
test observes heartbeat growth, kills only its driver handle, reopens SQLite and
requires persisted ID/pending action/budget1/unresolved admission fence plus worker
activity after controller death. Cleanup reuses generic preflight and exact native
`assertDomainOwner` before one test-owned stop/inspect/unknown-observation attempt;
no adoption, replay/start, lease revival, delete or quiescence/reuse permission.
Engine1.56 docs confirm StdinOnce closes stdin on attach disconnect, not a cleanup
guarantee; stop204/304 statuses unchanged. Acceptance red used an inert driver and
failed on missing live heartbeat; actual driver green passes1 test/19 assertions.
This is crash-persistence and manual owned-stop evidence, not supported automatic
reconciliation, daemon-loss recovery, general quiescence or G2 qualification.
Final ordered split gates still pending; production source/profile/deps unchanged.

**Supervisor-crash final execution evidence:** ordered split gates exit0 with
native218 tests/3,319 assertions,100% functions/98.59% lines; three further1/19
crash repetitions; portable199, transport14/131 three times, empty-/tmp portable/
preflight200 tests, drill and14-package audit. Production coverage unchanged;
aggregate98.59 versus98.60 reflects new test cleanup/error guards, not lost runtime
coverage; not all harness faults are injected. Snapshot298 labeled containers,
203 exited/95 created/0 running, all preserved. Driver death demonstrably leaves
a live worker, so supported automatic crash cleanup remains absent. Reopened
inventory fences reuse; explicit test-owned identity-checked stop leaves unknown/
pending state. No production recovery/quiescence/G2 qualification follows. Exact
commands, fresh-root keys, retained effects and remaining gaps are in SPEC.

## [ADR-027] - 2026-10-26 (Explicit owned-domain stop recovery)

**Title:** Separate recovery stop authority from new execution and launch-file readiness.

**Status:** Accepted, implemented and locally verified within explicitly approved
offline scope; independent review and G2 remain open.

**Context & Problem Statement:** Crash tests at `e112478` show workers can survive
their supervisor while durable inventory correctly fences reuse. Current cleanup
is tied to the live launcher or a test-only manual helper. Full launch preflight
depends on intact worker/workspace paths, which can obstruct recovery of an
otherwise independently provable owned domain. Late-observation permission is
not by itself permission for a new native stop request.

**Options Evaluated:** Keep manual test cleanup only; reuse full launch preflight
for recovery and require repaired paths; or provide one explicit trusted-supervisor
stop operation sharing backend/image/ownership checks and the live launcher's stop
implementation. Recommend the third, with launch filesystem checks still mandatory
for create/start and unknown cleanup still blocking all reuse/reset.

**Decision & Rationale:** Existing nonroot controller with trusted
`authority.kind=root` (not host UID0) may stop only a validated inventory-bound
native ID for an unresolved domain after independent backend/image/ID/name/label proof, including after
kill/lease expiry or missing launch paths. No extra budget draw, new execution,
adoption by name, foreign stop, delete, lease revival or completion/quiescence.
Missing ID, corrupt ownership or unavailable backend remains unresolved. Explicit
call only; no daemon/startup automation, public CLI or untrusted caller access.

**Consequences & Tech Debt:** Under the accepted scope, factor current backend
validation and owned stop at their existing responsible modules; test the real
recovery interface instead of keeping manual cleanup as a parallel implementation.
No schema/pin/dependency change. Fresh negative/actual crash/kill/expiry/missing-
path/foreign/transport/inventory-write gates required before support. Independent
domain quiescence/reuse, uncertain-create reconciliation, daemon-loss recovery,
SDK/provider/production use and G2 remain separate unqualified work.

**Owner approval event:** selected “Approve stop-only recovery (Recommended)”.
Implement explicit trusted-root supervisor cleanup under the existing nonroot UID,
including kill/lease loss and missing launch paths, with independent backend/image/
identity proof. No create/start/adoption/deletion, extra budget, startup automation,
quiescence/reuse or completion. Exact module interface and seven-section test/gate
contract updated in active SPEC before tests/application changes. No public CLI,
schema/dependency or provider/production authority added by this approval.

**Implementation event — 2026-10-27:** `stopSyntheticDomain` strictly accepts only
trusted root authority/domain ID, validates immutable inventory and fresh backend/
image/native ownership, and shares owned stop plus unqualified-observation code
with the live launcher. Launch filesystem checks remain mandatory for execution,
not cleanup. Nonzero worker exit still blocks launch success; explicit cleanup
only reports observed stop and does not treat exit137 as task success. Unit red
first rejected the stub's lack of authority validation; actual crash red rejected
its lack of stop behavior. Both are green; repeated stop adds no POST/budget/event
and cannot clear unknown/action/reset/reuse fences. Kill/released lease plus
renamed retained launch directories succeeds without repairing them. Foreign,
unbound/resolved, backend and ignored-inventory-write cases remain fail-closed.
Final ordered gates pending; no startup reconciliation/CLI or schema/deps change.

**Lab restoration — 2026-10-27:** initial focused actual corpus failed before
dispatch because the approved mount was absent. Read-only checks found no loop
mapping and the same regular owner-held2 GiB image. Under existing restoration
approval, `udisksctl loop-setup --file <approved-image> --no-user-interaction`
exited0 and automounted it as returned `/dev/loop0`; explicit mount exited1/
AlreadyMounted. `findmnt` independently confirms ext4/rw/nosuid/nodev at the
approved target. No ordinary-directory fallback, format/delete, daemon change,
rootful fallback or permission repair; failed partial synthetic evidence retained.

**Final execution evidence — 2026-10-27:** approved explicit recovery passes the
restarted ordered split gates: native221 tests/3,454 assertions at100% functions/
98.61% lines (baseline100%/98.59%), launcher99.46% lines and preflight98.99%; core
module coverage unchanged. Portable201 tests, recovery2/85 three times, unit/
transport16/145 three times, empty-/tmp portable/preflight202 tests, drill and
14-package audit pass. Missing-path/killed-lease recovery stops only the bound
owned ID; repeated stop adds no POST, budget or event and leaves unknown/pending/
reuse/reset fences intact. Review consolidated normal/finally test cleanup through
the same stop wrapper after an intermediate99.88%-function report; final native
coverage100%, with no exclusions/guard removal. Exact attempts/roots in SPEC.
Final input review reproduced array-role/envelope shape acceptance before lookup;
strict rejection and red→green regressions added, then every ordered gate rerun.
Labeled snapshot431 containers,298 exited/133 created/0 running, all preserved.
No startup scheduler, adoption/create/start, automatic state repair, quiescence/
completion, public CLI, dependency/schema change, push, G2 or provider authority.

Pinned eight-file secret scans and scoped document/protected-file checks pass;
expired temporary scanner restored at the same verified8.30.1 release/hash outside
Loom, not upgraded or counted as an unavailable pass. Exact results in SPEC; new
implementation remains uncommitted pending a separate owner commit instruction.

**Commit/continuation — 2026-10-27:** owner requested “commit and continue”;
verified stop-only recovery committed as `5b67c49`. Continue with test-only live
backend-refusal/foreign-inspect proof, not new recovery authority or daemon changes.

**Active-worker refusal test strategy:** extend the existing private Unix proxy
with phase-local fault selection,503 refusal (including no upgrade forwarding)
and its existing synthetic ownership-label disagreement. After supervisor death,
actual heartbeat must keep advancing through refused recovery; original ID,
unknown/pending/fenced state and budget1 must survive, with zero added POSTs and
no raw sentinel exposure. Explicitly restore the same proxy, then stop the same
domain through the existing interface. Restore fixture mode before finally cleanup
even on failed assertions. Red observed an incorrectly successful stop with inert
unavailable mode; green passes1 test/128 assertions over four crash/recovery
scenarios. No production module, daemon, profile, state schema or dependency change;
this is transport/metadata refusal proof, not real daemon crash/restart conformance.
Final ordered gates pending; no code commit/push or G2 closure inferred.

**Active-refusal final execution — 2026-10-27:** ordered split gates pass: native
221 tests/3,528 assertions at100% functions/98.59% lines, recovery2/159 three times,
portable201, focused16/145 three times, empty-/tmp portable/preflight202, drill
and14-package audit. Production code/coverage unchanged;0.02-point aggregate line
change from the proxy's new defensive upgrade-refusal guard not exercised by
ordinary stop HTTP. No exclusion or guard removal. Refusal leaves actor live,
ID/unknown/pending/fences intact and adds no POST/budget; explicit same-proxy
restoration permits owned stop only. Snapshot483 labeled containers,340 exited/
143 created/0 running; all retained. This is not real daemon-loss/restart or
quiescence qualification. Exact roots, red/green and scoped evidence in SPEC.

**Commit/continuation — 2026-10-27:** owner requested “commit and continue”;
active-refusal tests/evidence committed as `0a37304`. Continue test-only with lost
stop acknowledgement, not daemon restart or new recovery authority.

**Lost-stop-reply strategy:** private proxy forwards the one owned stop, receives
native204/304, then closes the controller response connection instead of forwarding
success. Actual stop may have executed despite caller cleanup failure. Require
unknown/pending/fenced inventory and budget1, exactly one added stop POST, separate
native stopped-state/heartbeat observation, then a new explicit recovery call that
uses GET inspection only. Keep the response-loss fault armed through that call
and its repeat to detect blind stop replay; finally restores fixture mode before
owned cleanup. Red observed an unexpected successful result before fault injection;
green passes1 test/170 assertions across five crash/recovery scenarios. No production
code/actor/profile/schema/dependency change or actual daemon outage. Independent
quiescence/task completion and G2 remain open; final ordered gates pending.

**Lost-stop-reply final execution — 2026-10-27:** native221 tests/3,570 assertions
at100% functions/98.59% lines, recovery2/201 three times, portable201, focused16/
145 three times, empty-/tmp portable/preflight202, drill and14-package audit pass.
Production code/coverage unchanged. One actual stop executes but reply loss leaves
unknown/pending state; separate native/heartbeat observation and explicit GET-only
recovery establish observed stopped without replay while the fault stays armed.
Snapshot542 labeled containers,389 exited/153 created/0 running; all retained.
Exact red/green/roots/results in SPEC; no real daemon restart, general quiescence,
automatic retry/reuse/completion, push or G2 closure inferred.

## [ADR-028] - 2026-10-27 (Test-only kernel observer acquisition)

**Title:** Prove observer identity/access before implementing cleanup polling.

**Status:** Owner approved bounded development-only experiment; acquisition and
independent cleanup qualification pending. No production authority change.

**Context & Problem Statement:** Research at `bd17c45` separates pidfd termination,
cgroup emptiness and general quiescence. Keeper handles do not prove worker access.
Owner answered “continue” to the explicit test-only Python observer/one-owned-
container proposal with10-second bound and unchanged inventory/reuse authority.

**Options Evaluated:** Implement speculative polling first; guess inspect PID
provenance or elevate on access failure; or test native identity/access prerequisites
before any persistent integration. Select the last; no new dependency or API.

**Decision & Rationale:** Installed Python stdlib may connect only the selected
lab Unix socket, use kernel SO_PEERCRED to identify the exact peer, and compare
that peer's executable/PID namespace with the controller. This is not proof of
worker identity or pinned inspect-PID semantics. If this passes, one existing
synthetic lifecycle may provide a durably bound ownership-checked PID candidate
for read-only proc namespace access. Any ambiguity/access failure blocks further
acquisition. Scripts/logs remain private; no speculative persistent observer,
signals, permission repair, daemon change, host scan or authority/state write.

**Consequences & Tech Debt:** Stop early if blocked; preserve failure/evidence,
existing owned cleanup and unknown/pending/budget/reuse/reset invariants. Runtime
integration, independent quiescence and G2 remain unqualified. Scope/commands and
actual classified results belong in SPEC; do not convert blocked acquisition to
physical qualification or infer permission to run additional lifecycles.

**Acquisition execution:** socket-peer prerequisite passes for actual `dockerd`
(same controller PID namespace, readable nonterminal pidfd). One approved existing
fixture lifecycle then fails candidate acquisition before proc access because the
temporary Bun harness used `FileSink.end(payload)` instead of write then end.
Deterministic synthetic echo red reproduces0/18 bytes; corrected shared-sender
round-trip green and14 Python self-checks pass without another container. Corrected
private harness strict check passes matching repository flags. Original failed
script/log/manifest retained. Existing owned cleanup observes stopped, exact-ID
GET confirms not running/PID0, inventory/action/fences stay unknown/pending and
budget1. No kernel permission failure established. One lifecycle consumed, no
repeat: project owner must authorize another bounded lifecycle to test corrected
acquisition. No persistent code/polling or quiescence/G2 qualification follows.

**Corrected continuation — 2026-10-28:** owner requested “continue” after
`e48f31b` and the additional-lifecycle proposal. At sync old temporary scripts/
logs are unavailable; prior durable observer state/image still exist, mount absent.
Under existing approval, same-image loop setup succeeds and automount is
independently verified ext4/rw/nosuid/nodev. Reconstructed scripts are a new revision,
not recovered original evidence; retain copies/hashes/check manifests durably under
new private lab storage as well as temporary execution storage.

Fresh sender red/green,14 Python checks, matching strict typecheck and daemon-peer
prerequisite pass. Exactly one additional lifecycle returns candidate-access-only:
envelope accepted, mapped candidate UID/stat checks and distinct PID-namespace link
access succeed. Existing owned cleanup observes stopped, heartbeat stays unchanged;
pending action, budget1, unresolved inventory/successor/reset restrictions remain.
Fresh exact-ID ownership-checked GET confirms not running/not restarting/PID0.
No worker pidfd or cgroup acquisition/polling ran; full worker identity/provenance,
handle lifetime, independent quiescence and G2 remain unqualified. Do not repeat
this lifecycle or expand authority; next work must specify identity/cgroup binding
and handle-lifetime tests. Exact roots/commands/results are recorded in SPEC.

**Test-contract continuation — 2026-10-28:** owner requested “commit and continue”;
corrected candidate-access evidence committed as `53b2c93`. Prepare the proposed
`docs/p2-kernel-observer-test-contract.md` without another lifecycle or implementation.
Use full existing `assertDomainContainer` for future snapshots, not a parallel
partial owner/config validator. Proposed research-only Python module has one
bounded host-confirmed acquisition/observation interface, distinct pidfd/cgroup
facts, no DB/stop authority and a deadline covering pipe waits as well as polling.
Release-specific inspect-PID provenance and exact cgroup mapping remain admission
blockers; synthetic tests may not waive them. No master-source substitution, empty
on-stale inference or claimed atomic identity/ABA guarantee. Owner approval of the
test contract and a separately bounded physical gate remain pending; no code/G2
qualification follows from this design. This avoids speculative runtime integration
while giving the next slice concrete cases and honest failure behavior.

**Synthetic implementation slice — 2026-10-28:** owner requested “commit and
continue”; test contract committed as `75347b1`. Implement only pure identity
frames/kernel-snapshot consistency/populated parsing/poll-result classification
plus self-tests in the research probe. No native syscall/FD/pipe handler, worker
inspection or Docker dispatch; default CLI returns blocked/native-not-implemented
without reading stdin. Native provenance remains unresolved. Deterministic inert
classifier red fails2 tests by inventing terminal/empty; first green15 self-tests
passes on synthetic data only. This deliberately omits speculative native adapters
instead of pretending access-only evidence proves identity or handle lifetimes.
No new dependency or application integration; ordered final gates pending.

**Synthetic final gates:** ordered lint39 files/strict Bun typecheck, separate
Python syntax/15 self-tests/three native-disabled CLI cases, portable201 tests/
2,957 assertions, automated synthetic drill and14-package audit pass. Portable
95.88% function/91.73% line coverage matches baseline; Bun coverage does not
measure the Python module. Source review keeps validation shared rather than
serializing already parsed identities through JSON; only stdlib imports, no handle
access, loose identity flags, cleanup authority, default test exclusions or
package changes. Raw native/source provenance/FD lifecycle/deadline and physical
qualification remain deferred, not passed. Exact final evidence/limits in SPEC.

**Provenance continuation — 2026-10-28:** owner requested “commit and continue”;
synthetic core committed as `226d00f`. One selected read-only API1.56 GET reports
Engine29.9.2/GitCommit0367cbe, containerd2.4.2/full base revision
`b7a25261e029d68978bbf290df0a62fc819b3c51`, runc1.5.2 and RootlessKit3.3.0.
Package records agree on selected version numbers, not socket-serving binary
identity. Local ELF/Go metadata inspection executes no daemon/runtime target and
uses the existing Go tool offline without toolchain downloads. Local containerd
embeds that base plus `v2.4.2+dirty`/vcs.modified=true; no exact local delta or
running-peer byte equivalence is established. Dirty may be packaging/generated
files; it is not by itself an unsafe-change/tampering finding.

Background primary-source report `research/pi/19-p2-backend-pid-provenance.md`
resolves containerd base and runc/RootlessKit release sources, but Moby0367cbe
commit lookup returns422 and tag/raw lookups404. Parent independently rechecks
key source paths/release associations and adds local-build limitations. Base
containerd numeric PID/membership semantics and release RootlessKit namespace
options do not close the missing Moby/runtime/procfs/cgroup-view joins, dirty
dependency delta or atomic identity/FD-lifetime proof. No current-main substitution.

Native acquisition remains blocked. Next owner: selected-build/distribution owner
for authoritative full Moby source/build reference and containerd build inputs/
patchset, then re-trace exact paths/views before requesting physical qualification.
No confirmed runtime/security bug, novel-issue or tampering claim; deduplication
incomplete and no issue published. No native implementation/lifecycle, install,
upgrade, mount/image action, permission change, provider/SDK use or G2 closure.
Sanitized metadata/scripts/command manifests retained in new private durable
evidence; exact results/limits in SPEC. Scoped pinned secret/document/protected-file
gates pass (nine scans/32 local links), not native qualification. Provenance handoff
and G2 remain open; new report/governance evidence uncommitted.

**Selected artifact continuation — 2026-10-28:** owner requested “continue” after
provenance evidence commit `6a7d44a`. Two daemon-only read-only diagnostic socket
connections, no HTTP dispatch, compare a rechecked reported peer's anchored
executable FD with Docker-package-owned `/usr/bin/dockerd`. Peer SHA256
`3a6132d4d99c1437e3422599f802207a3def9ba4de00ec1004a8e40d2740b9b0` differs
from local package SHA256
`32023e4076bc3f3ca84fcab975687bda3c2983a48bfae1c7009feda208022608`, with distinct
file objects in both samples. Credential/proc/starttime/pidfd/executable rechecks
are diagnostic only; no SO_PEERPIDFD transfer or atomic socket/handler binding
claimed, and no guessed option number introduced. Matching package version is
therefore insufficient to assert the selected peer is that package artifact.

Second sample whitelists offline existing-Go build metadata through the same
hash-checked read-only executable FD, passed only to the metadata reader. Module
github.com/moby/moby/v2 is exposed, but no whitelisted full source/VCS/linker
revision or module version; no target execution, raw flags or launch data read.
This narrows the artifact handoff, not ownership, native readiness or source proof.
Do not replace/restart the daemon or substitute package recipes for this artifact.
Packaging source research/review remains in progress in research20; no worker/
cgroup access, lifecycle, credentials/cache, package install, SDK/provider use,
native mode, task-completion/reuse/reset authority or G2 change performed.

**Source-reference correction:** ordinary rechecks now resolve actual exact-version
Arch recipes; no Anubis challenge solved/bypassed. Docker's official packaging tag
is `1-29.9.2-1`, not the invalid colon-bearing Git ref candidate. Pinned packaging
commits are Docker73f823426870d8b4b6a98016b4e296f695583737 and
containerd813bc2edfa15d4677616b162ab60254786452bfc. Docker recipe names Moby's
`docker-v29.9.2` tag, resolving full release commit
`0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c` and matching reported prefix0367cbe.
Earlier422/404/challenge observations remain historical lookup limitations, not
current source nonexistence or permanent unavailability. Parent independently
verifies tag/commit associations and immutable recipe content.

Containerd recipe concretely rewrites paths in tracked containerd.service before
build. This intended edit is compatible with modified-tree metadata, but no
selected build-tree delta or reproducibility proof is obtained. Recipe checksums
are declarations only, not verified source/package artifact digests. Exact Arch
recipes still cannot qualify the different reported peer executable or identify
its actual runtime/shim/dependency binaries. No substitute daemon, downgrade or
upgrade authorized. Research20 records the narrowed next-owner handoff: selected
artifact source/build inputs and actual dependency identities, plus a separate
trace of now-resolved Moby state/PID/cgroup semantics. Native/G2 remain unqualified.

**Follow-up document gates:** pinned scanner identity/seven task/private-artifact
scans,31 local links/anchors, protected identities, seven active sections/unique
ADRs/canonical casing and whitespace checks pass. Original and extended diagnostic
scripts/results/exit manifests retained separately and verified. No fresh app/native
or coverage claim from research. New report/SPEC/ADR evidence remains uncommitted.

**Pinned Moby trace continuation — 2026-10-29:** owner requested “continue” after
`1bf0697`. Source-only research at resolved Moby release
0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c may close release-semantic gaps, not
the different peer's build/runtime or kernel-view joins. No new runtime requests,
proc/worker/cgroup inspection, native implementation or lifecycle. Parent contract
review separates existing systemd/cgroup-v2 preflight and Init=false/private-
namespace config validation from proof of the originally assigned kernel cgroup
root; payload leaves CgroupParent unset. Reuse existing validators, do not turn
them into a parallel pathname guess or source-proof flag. Research21 and final
source/document review pending; all native/reuse/reset/G2 authority unchanged.

**Pinned-source results:** research21 traces the exact Moby release's task PID
cache → SetRunning → inspect copy, daemon restore/events, Init=false distinction,
OCI cgroup parent/driver construction and subsequent rootless mutation. Parent
independently re-fetches critical state/restore/inspect/cgroup/source-version paths.
RestoreTask attaches without synchronizing persisted State.Pid; surviving restore
branches do not refresh it from task.Pid. Repeated inspect lifecycle tuples alone
therefore do not establish fresh init identity. StartedAt is container-start
bookkeeping, not kernel birth time. This is source behavior, not an observed
selected-daemon recovery bug or claim that every recovery changes the PID.

Rootless conversion can clear resources/CgroupsPath for no delegated controllers
after preliminary path creation. Existing systemd/v2/namespace/HostConfig checks
do not attest final OCI assignment or actual controller enforcement. Contract
adds these source-derived future admission negatives without changing frame
schema, code or authority. Vendored client v2.4.2/APIv1.12.0 is verified separately
from reported server/base and selected artifact equivalence. Release-semantic
gaps close only at source level; selected bytes/build inputs, actual runtime/shim
and namespace/mount views, independent init/root identity and FD lifetime remain
open. No fetched-source/daemon/worker execution, lifecycle or native-mode change.
Pinned document/secret/protected-file gates pass (four scans/36 local links);
no app/native/coverage pass implied. Source report/governance/contract uncommitted.

**Synthetic control-input continuation — 2026-10-29:** owner requested “commit
and continue”; source trace/contract clarification committed as `a9b35da`. Continue
at the existing host-only identity-protocol seam, not a new native observer.
`IdentityFrames.read_from` borrows a caller-owned stable nonblocking FIFO; it never
opens/closes/duplicates it or changes shared file-description flags. Read bounded
control bytes through standard poll/read, share one finite non-extendable absolute
deadline, return acquire before EOF, require EOF after confirm and poison on error.
Single-byte reads deliberately preserve the acquisition/confirmation handoff with
only two8KiB frames; no buffer/adapter hierarchy or new dependency needed.

Acceptance red uses a real self-owned pipe against an inert reader (16 tests,
one intended None-versus-frame failure), then green. Current28 stdlib self-tests
cover owned-pipe and scripted OS/clock cases including absent EOF, error masks,
EAGAIN/EINTR, late input, bounded repeats, size limits and borrowed-FD preservation.
One self-owned memfd is a rejected nonpipe fixture, not a worker or filesystem
probe. Native CLI still refuses without touching stdin; no backend request,
worker/cgroup handle, new lifecycle, selected-build waiver or state authority.
Full observer orchestration/acquisition/FD lifetime stays unqualified. Fresh
ordered gates pass: lint/TS check, Python syntax/28 self-tests, three native-disabled
CLI refusals with unread input, portable201 tests/2,957 assertions at unchanged
95.88%/91.73% coverage, drill and14-package audit. Python is not covered by Bun's
lint/typecheck/coverage. Final source/hash/command/exit logs are separate from red
under private key `observer-control-final-i803842o`. Owner again requested “commit
and continue”; scoped document/secret checks precede commit. Native authority and
all unresolved-domain fences remain unchanged.

**Post-commit boundary coverage:** reader committed as `665e5ce`. Owner's
continuation stays at the same synthetic read_from seam: two maximum-size frames
over an owned pipe and a handshake that consumes the remaining deadline. Reuse
the implementation; these are qualification tests, not new runtime behavior or
native orchestration. Final ordered rerun passes:30 Python tests, three unread-input
CLI refusals, portable201/2,957 and unchanged95.88%/91.73% coverage, lint/TS check,
Python syntax, drill and audit. Private key `observer-control-boundaries-4ryjmont`
retains fresh source/hash/command/exit logs. Leave continuation uncommitted; native
provenance/identity/root/handle evidence and G2 remain open.

**Synthetic sender transport blocker — 2026-10-29:** owner “commit and continue”
commits boundary coverage as `1162e0d`. Private assert-based FileSink qualification
uses fragmented acquire, write/flush then awaited end() without payload, an empty
child environment and isolated Python driver importing the unchanged reader.
It fails `control-fd` before accepting acquire. Two self-owned-child diagnostics
confirm valid AF_UNIX/SOCK_STREAM stdin, initially blocking and successfully made
nonblocking by its owner; S_ISFIFO is false. FIFO-only admission is the confirmed
local mismatch, not an invalid FD, failed flag change or OS read error.

Do not reinterpret Bun's abstract "pipe" option as S_IFIFO or declare an upstream
bug. Installed FileSink declarations and current official spawn docs describe the
write/flush/end API, not a FIFO guarantee. Limited official issue/PR lookup finds
related socketpair/pipe discussions but no verified selected-release fix for this
contract mismatch. No upgrade, descriptor-whitelist broadening, ownership wrapper
or pipe bridge is authorized by these results. The passing FIFO core is unchanged;
successful sender/confirm/EOF and its negative EOF case remain unqualified.

Private0700 key `observer-sender-w3nxszo3` retains original source/driver/sender
hashes, exact failing command/exit/log and diagnostic revisions/results (0600).
The initial diagnostic incorrectly expected stdin already nonblocking; preserve
its failed assertion separately. Corrected/refined diagnostics pass twice and
show the owner flag change works. No worker/proc/cgroup access, daemon request,
native CLI/implementation, lifecycle, provider/SDK or authority/fence change.
Next owner: choose bounded AF_UNIX/SOCK_STREAM qualification or retain FIFO-only
and explicitly select an inherited-pipe launch strategy. New notes uncommitted;
G2 open. Native provenance/identity/root/handle blockers remain separate.

**Approved narrow Unix stream input — 2026-10-29:** owner chose “do what you
recommend” after comparing direct support with anonymous/named pipes and bridges.
Extend only synthetic read_from admission to connected nonblocking AF_UNIX/
SOCK_STREAM alongside FIFOs. No arbitrary sockets, dialing/listening or native
handler/worker authority. Reuse the byte-bounded decoder/poll/read/deadline/EOF path.

Use socket.socket(fileno=fd) only as an autodetected metadata view and detach in
finally on admission/refusal/errors; never fromfd/dup, close or configure the FD.
Installed Python shim and CPython3.15.2 source at
5e58eaad7c58df58dfa8ea549c87996e01dd1077 confirm the existing-FD branch and detach
behavior. Constructor init can change flags (and close on initialization failure)
when a default timeout is configured. Refuse non-None default timeout before
wrapping; caller must keep descriptor/default configuration stable during the
synchronous call. Do not reset global defaults. This is source/API reasoning plus
local fixture tests, not a build-equivalence or concurrent mutation guarantee.

Real socketpair red:31 tests, one intended control-fd error against unchanged
FIFO-only reader. Narrow guard turns it green; current35 tests add real transport
failure/half-close checks, rejected datagram/seqpacket/AF_INET/unconnected/blocking
sockets, default-timeout refusal and metadata failures with exact borrowed-FD
state preserved. Negative sockets are self-owned, unbound and never dial/listen.
Preserve prior blocker notes and original failed sender; new private key
`observer-unix-stream-5fx3qz_8` retains starting diff, red bytes/hash/log and new
source/unchanged sender-driver copies. Fresh ordered gates pass: lint/strict TS
check, isolated Python syntax/35 self-tests, three CLI refusals with unread input,
unchanged Bun FileSink sender/driver against new source (write/end exit0 and missing
EOF timeout/exit2), portable201 tests/2,957 assertions at unchanged95.88% functions/
91.73% lines, human-flow drill and14-package audit. Python tests are separate from
Bun lint/types/coverage. Scoped secret/document/protected checks pass: four changed
files/19 private artifacts,33 local links, governance/review/source/fixture identities
and whitespace. Native-entry AST unchanged; no prohibited reader effect calls.
No production module/schema/dependency/CLI or provider/runtime effects; changes
uncommitted, native qualification/G2 still open.

**Approved daemon/runtime provenance — 2026-10-29:** Unix stream slice committed
as `aa0a6bb`; owner explicitly approved the proposed read-only daemon/runtime check
without workers or lifecycles. Fresh GET/version still reports selected29.9.2/
API1.56 and prior component versions/revisions. Rechecked peer executable retains
SHA3a6132d4… and differs from system dockerd32023e40…; controller and daemon-root
/usr/bin artifacts match each other. PID/cgroup namespaces match controller while
mount/user namespaces differ. These daemon-only diagnostic joins are non-atomic,
not handler binding, active-runtime or worker identity.

One follow-up zero-HTTP reanchor validates the exact proc-reported executable's
parent via no-symlink traversal and matching file object/hash, then reads only five
known sibling artifact names. Parent is under the controller-home prefix; no
recognized controller package owner recorded. Sibling containerd/shim and runc
have different hashes from /usr/bin; RootlessKit is present only in the peer
directory among these fixed paths. All four candidates report vcs.modified=false
at already resolved release revisions. System containerd/shim v2.4.2+dirty remains a
real system-artifact fact, not evidence that the selected runtime uses dirty code.

Existing ADR-006/G0 setup records owner-authorized official static Docker/extras
under HOME/bin. This explains why system Arch recipes are not the selected peer's
build authority; new location/bytes are consistent, not authenticated archive-member
or source/build equivalence. G0 bundle SHA records were explicitly unauthenticated;
no cache/archive access, package download, upgrade or runtime substitution used.
Actual active dependency chain/options and dockerd build provenance remain open.
Do not equate nearby clean metadata with live dependencies or trusted build inputs.

`research/pi/22-p2-selected-runtime-artifacts.md` records full hashes, observations,
historical versus fresh facts, source references and next-owner requirements.
Private key `selected-runtime-provenance-fmsp4o1d` retains exact collector/source/
command/result manifests; synthetic parser/hash/path checks pass before collection.
Total three daemon connections: two no-HTTP diagnostics and one GET/version, no
worker handles/proc scans/children/arguments/environment/config/caches read. Native
CLI, runtime objects, unknown inventory/actions/fences and G2 unchanged. Final
document/secret/protected-file gates pending; new notes/report uncommitted.

**Metadata-tool telemetry correction:** final evidence check finds Go1.27.3
created local counter directories/files in the freshly isolated tool HOME despite
GOTELEMETRY=off. Do not claim that variable disabled collection or that HOME stayed
empty. Existing user telemetry/config/caches were not read or changed. Installed
cmd/internal/telemetry and vendored telemetry source defaults missing mode to local
(uploads disabled), and returns before counter opening for mode off. No network
capture/upload verification was performed; source-level local-mode behavior is not
an observed egress proof. Preserve generated private tool state, never delete it or
present the failed empty-HOME assertion as passed. Verify explicit mode off in a
separate new private HOME before any further metadata-tool execution. Artifact
hash/revision observations remain diagnostic; native/G2 still blocked.
Explicit mode-off preflight subsequently passes in a separate private HOME with
no new counter/upload state. Only afterward add an off mode file to the original
collector-owned HOME for future reruns; original local counters are preserved.
The original executed sources/results still describe the earlier local-mode runs,
not retrospectively telemetry-off. No additional daemon connections or user-state
changes; final validator must distinguish this from its failed empty-HOME check.
Final scoped checks pass: pinned scanner identity, four document/20 private-artifact
scans,39 local links/anchors, seven active sections/unique ADRs, protected sources/
review hash, exact collection/self-test/result identities and whitespace. Initial
empty-HOME assertion stays failed/preserved; explicit-off future guard is separate.
Full report/governance/contract diff reviewed; leave new changes uncommitted.

**Publisher-metadata continuation — 2026-10-30:** owner “commit and continue”
commits verified research22 as `c57fc78`. Source-only first-party metadata legwork
for the exact static Docker/extras29.9.2 filenames/architecture and G0-recorded
archive hashes, never an archive GET/body or extraction. Research-skill delegate
writes only research23; parent independently reviews critical claims and owns
governance/security gates. No daemon/runtime/process/proc/cgroup/worker access or
Go execution, cache/credential read, install, native allowance or phase change.

Preserve trust layers: publisher HTTP record, advertised SHA256, verified signature,
source/build reproducibility, archive-member/current-file binding and active-runtime
identity are different evidence. A source archive, OCI image attestation, ETag or
matching version cannot stand in for these static bundles. Parent checks G0 and
research22 hashes agree and protected sources/old review remain unchanged; private
key `static-publisher-metadata-hcsusr6a` retains input/HEAD hashes. New source report,
independent metadata review and final scoped gates pending. No archive download,
runtime effects, push/publication or G2 closure authorized; new notes uncommitted.

**Publisher result and independent review:** research23 inspects exact publisher
index/archive HEADs, eight checksum/signature candidates, official install Markdown,
exact Moby release metadata and packaging tag discovery. No checked publisher
record authenticates either historical archive hash. Availability,32-hex ETags,
source/OCI metadata and empty release assets cannot substitute for archive SHA256,
signature/build or current member binding.404 candidates are tested guesses, not a
universal assertion that Docker never publishes checksums elsewhere.

Researcher reports21 requests; oversized rendered documentation was consumed before
its post-read cap rejection. Preserve that collection-limit exception and do not
claim it met the bounded-reader policy. Parent archives original return/hash and
independently performs15 metadata requests with an assert-tested hard body reader
(256KiB+1 ceiling, text/JSON identity encoding, no redirects, archive HEAD only).
Critical availability/HEAD/candidate/release/Markdown results corroborate. Parent
also reads the previously header-blocked tags first page safely (100 records,
no29.9.2 match); this closes that page-read gap, not all tags/source provenance.

No archive bodies or runtime access; mutable source/metadata is fetch-date evidence,
not historical notarization or reproducibility. Next owner remains selected-build/
distribution owner for authenticated exact-file publication and build evidence;
member comparison/download would need separate scope. No custom upload or trust-
policy weakening supplied. Final scoped gates pass: four document/11 private-
artifact scans,37 local links/anchors, seven active sections/unique ADRs, protected
sources/old review hash, returned-report/source/result identities and whitespace.
Collection-limit exception stays explicit; new report/contract/governance notes
uncommitted, native observer and G2 blocked. Full task diff reviewed.

**Approved bounded archive/member comparison — 2026-10-30:** publisher report
committed as `6254b25` under owner “commit and continue”. Owner separately selected
“Verify archives” for exactly two official29.9.2 Docker/extras archives (~94MiB),
recorded SHA/size checks and selected member hashes. No filesystem extraction,
installation/execution, daemon/worker inspection or lifecycle; compare only the
previously anchored2026-10-29 artifact snapshot, not a fresh process/file claim.

Private key `static-member-verification-7mvsdobo` retains copied snapshot/hash,
synthetic red/green and bounded stdlib verifier. Entire compressed SHA/size must
match before parsing; fixed TLS URLs, no redirects/retries,100MiB total bound.
Streaming gzip/tar uses768MiB decoded/256MiB member/64 header bounds and deadlines;
reject special records/unsafe paths before metadata processing, hash only selected
regular ELF members in memory, then drain gzip for completion/CRC. Installed
Python3.15.2 TarInfo dispatch source inspected; a narrow _proc_member subclass
guard is tested through the stream parser, not assumed from older frombuf hooks.
No generic extraction/download service or repository implementation introduced.

Intended red is an empty parser result failing the known synthetic ELF member
hash. Guard self-checks pass for valid data, missing/duplicates, traversal, links/
special metadata, count/size/deadline/decoded bounds, gzip CRC, wrong compressed
digest/size, fixed URLs and no redirect. Collection/real comparison and final
document/secret/protected-file gates pending. No signature/build proof or active
runtime authority follows from a future byte match; all native/G2 fences remain.

**Archive/member result:** exactly two approved GETs complete with no redirects/
retries,98,387,693 compressed bytes total. Both full SHA256 values equal the G0
records before parsing. All five selected regular ELF members equal the recorded
2026-10-29 peer-directory hashes (dockerd/containerd/shim/runc/rootlesskit).
Docker traverses9 entries/235,673,600 decoded bytes; extras4/23,992,320, within
bounds and with gzip completion/CRC checked. Original runtime files not reread.

This upgrades metadata-only evidence to current publisher HTTPS-byte/archive/
recorded-member continuity, not signing, original transport history, source-build
reproducibility or live runtime selection. Research24 records exact digests, bounds,
test-first evidence and remaining joins; prior negative metadata findings remain
historical, not silently rewritten. No filesystem member extraction/install/
execution, process/daemon/worker/mount/container effects, Go or provider/SDK use.
Private archives stay0600 evidence, never repository/commit artifacts. Final scoped
checks pass: four document/11 private-text secret scans,39 local links/anchors,
governance/protected-file/review hashes, red/source/result/snapshot identities,
independent compressed-archive rehash, private modes and whitespace. Binary archives
are not secret-scanned/release-qualified. Changes remain uncommitted and G2 open.

**Approved bounded daemon→containerd association — 2026-10-30:** archive report
committed as `be19fc2`. Owner separately selected “Check containerd” for one
zero-HTTP reanchor and bounded daemon thread/direct-child identity metadata,
maximum64 task directories/16 direct-child IDs. Same-owner/parent/containerd comm
is only a filter; retained executable bytes must match verified archive size/SHA
before a candidate runtime pidfd is opened, then relation/starttime/exe/ns/liveness
are rechecked. Skip other children; no raw arguments/environment/memory, worker
handles, shim/runc inspection, signals/config/lifecycle or process-tree recursion.

New private key `daemon-containerd-association-ncyh2vum` retains member-result
snapshot/hash, copied reviewed peer helpers, intended identity-parser red and
self-checks. Guards cover strict PID tokens, task/child/symlink/deadline bounds,
proc comm/PPID/starttime, owner/parent/role filtering and existing hash/pidfd logic.
No Go or downloaded code executes. Lookup/rechecks are non-atomic and cannot
prove daemon-handler/client selection, absence of PID ABA, full runtime chain or
worker identity; no cleanup/reuse/G2 authority. Live result and final gates pending;
new evidence/report/governance changes remain uncommitted.

**Association attempt blocked:** one zero-HTTP collector run exits2 at
bounded-daemon-children/daemon-thread-bound. After64 validated task entries, the
next entry triggers refusal before any thread-directory/children-file reads.
No child proc/containerd candidate/executable/pidfd/namespace inspection occurred;
no exact thread count or external-runtime inference made. Preliminary daemon
guards were reached, but final identity revalidation/association did not complete.
Do not turn this required failed check into a pass, silently raise the bound or
use the partial thread list. Research25 retains method/result and next owner
choice: explicitly approve a finite larger bound (e.g.256) and one read-only retry,
still16 child IDs/all exclusions, or pause. No new allowance inferred from failure.
Native observer/G2/actions/fences unchanged. Final scoped checks pass: four
document/12 private-text secret scans,39 local links/anchors, governance/protected
sources/review hash, source/red/result/input identities, private modes and whitespace.
Live exit2 remains failed/blocked. Notes uncommitted; full task diff reviewed.
