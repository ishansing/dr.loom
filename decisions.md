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
