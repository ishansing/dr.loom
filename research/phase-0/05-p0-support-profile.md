# P0 — Support profile and acceptance matrix

Started **2026-10-22** with owner authorization. This is an evaluation contract,
not a certified support matrix. Scope: [ROADMAP P0](../../ROADMAP.md#p0--product-contract-and-irreversible-decisions).
Execution requirements: [active phase](../../SPEC.md#active-phase-specification).

## Owner-confirmed evaluation scope

| Dimension | Initial scope | Approval/evidence still needed |
| --- | --- | --- |
| User/journey | Single trusted developer/operator; small fix in an existing Bun/strict TypeScript repository | Representative real repository and I2P runbook families |
| First fixture | Disposable Loom checkout with synthetic fault injection and deterministic Bun/TypeScript tests; owner selected | Synthetic red/green proof complete; full reference-workflow qualification remains |
| Host | Current Linux x86_64/Omarchy snapshot selected for lab qualification; local/private CLI | Rootless setup/resource proof and production-host support remain separate gates |
| Isolation target | Rootless Docker selected in accepted ADR-006 | Separate setup approval and rootless identity/resource/mount/egress/cleanup qualification; no rootful fallback |
| Deployment candidate | Local disposable staging destination | Concrete target/restore contract; no production deployment approval |
| Provider/model | Personal OpenAI account; owner preference “Plus tier + Free tier subject to availibility”; GPT-6.1 Sol candidate (`gpt-6.1-sol`), owner-confirmed available. SIWC is disabled pending qualification; Antigravity consumer route excluded | Owner approved deferred live qualification for synthetic-only P1. Tier/model eligibility, own app identity and broker proof required before live use; no auto-fallback/rotation, no live quota use, paid budget zero; [review](08-subscription-provider-review.md) |
| Provider data policy | Private source permitted as a data class; training opt-out confirmed and account-level **Include environments: off**, both owner-attested; no additional retention/residency restrictions | Not independently verified; no zero-retention claim. Local CLI flag is unrelated; no credentials/customer data/live submission authorized; opt-out covers new tasks only; vendor/legal duties remain |
| Runtime | Coding-agent SDK `1.4.0` selected; owner accepted ADR-005 on 2026-10-22 | Scoped dependency-promotion/adapter implementation approval; no dependency added to Loom |
| Framework | Retain/revalidate current `2.1.0` pin, accepted ADR-007 | Required children and fresh full-workflow qualification; no re-pin or compatibility claim by historical readiness |

No real credentials, customer repositories or production data belong in fixtures.
The owner has approved evaluation scope and the SDK runtime direction, not
dependency installation or production support.

**Current decision pack:** [06-g0-decision-pack.md](06-g0-decision-pack.md), with
[framework baseline review](07-framework-baseline-review.md). Owner selected the
disposable Loom reference, rootless Docker target and current Linux qualification
envelope. Framework retention, operator/transport and durability design were
accepted in ADR-007–009. The owner subsequently requested Codex subscription and
consideration of Antigravity; [subscription review](08-subscription-provider-review.md)
records conditional SIWC feasibility and the consumer Antigravity restriction.
Personal account, initial model candidate, Plus/Free qualification preference,
private-code permission, confirmed training opt-out and explicit Include
environments off are recorded as owner attestations. Actual account/model
qualification remains open but is deferred with SIWC disabled. Loom's
authority/workflow/verification stay provider/model-independent; this is only the
first qualification profile. No live allowance consumption is authorized, paid
budget stays zero. Owner relayed Ishan Singh's approval of the `fc0e05e` review
report on 2026-10-22; no direct signature claimed. R-001 is corrected in the new
document candidate; follow-up disposition and first-slice approval are separate.
G0 remains open; [closure preparation](09-g0-closure-readiness.md) is not P1 execution.

## Observed starting point

- Clean merged baseline `f10ebb9`, new branch `chore/p0-support-profile`; no
  starting diff. No source/test changes for this kickoff.
- Development host: Linux x86_64/Omarchy, kernel `7.2.8-9-omarchy`, 16 logical
  CPUs, approximately 15 GiB RAM. No capacity or compatibility claim follows.
- Bun `1.4.3`, Node `26.7.0`; existing lockfile and SQLite scaffold unchanged.
- Docker and bubblewrap executables found; Podman absent. Daemon access,
  rootless configuration and containment have not been tested. No host changes.
- Actual CLI: `init`, `record`, `status`, `check-framework`. Approval, kill,
  reset, resume and verification commands are not implemented. `record` is a
  scaffold, not a safe privileged write path.
- Prior [SDK boundary audit](../pi/11-pi-1.3.0-execution-coverage.md) and
  [Durable assessment](../pi/12-pi-durable-adoption.md) are inputs, not current
  adapter or isolation evidence. Existing hook/recovery counterexamples must
  become permanent tests where relevant; do not assume temporary artifacts exist.

## Named acceptance matrix

All cases below are **planned, not executed by this kickoff**. A P0 experiment
can establish seam feasibility; production gates require permanent integration
tests against implemented controls. A fake owner gate is not Loom enforcement.

| ID | Scenario | Required observable evidence | Qualification gate |
| --- | --- | --- | --- |
| P0-A01 | Bounded TS change | Both runtime candidates consume the same fixture/task/scripted replies; patch and deterministic test output identify the exact candidate hash | P0 comparison; G2 actual runner |
| P0-A02 | Runtime restart | Separate process terminates after a known checkpoint; reopen shows committed state and truthful pending/interrupted work | P0 feasibility; G1/G2 permanent recovery |
| P0-A03 | Denied then resumed effect | Owned synthetic target sees zero calls while denied; replay after changed policy rechecks final payload, identity and live authority | P0 seam; G1/G2 enforcement |
| P0-A04 | Kill and stale owner | Kill between dispatches prevents the next effect; surviving writer cannot publish after succession | G1 write gate; G2 process domain |
| P0-A05 | Uncertain external outcome | Crash after target mutation but before result commit yields unresolved status; no blind retry of non-idempotent work | P0 seam; G1/G2 integration |
| P0-A06 | Output sanitizer failure | Partial/final/structured/error/spill sentinel withheld from owned sinks when filtering throws | P0 seam; G2 all enabled output paths |
| P0-A07 | Independent completion | Model success without fresh exact-hash verification never becomes completed; candidate changed after verification is rejected | P0 contract; G2/G3 integration |
| P0-A08 | Runtime storage ownership/upgrade | Exclusive owner enforced by supervisor; second owner rejected; backup/restore and version-incompatible reopen handled without mutating the original | P0 comparison; G2/G5 recovery |
| P0-A09 | Whole-runner containment | Startup, extension, shell and descendants cannot access protected synthetic DB/credential paths; external cleanup removes writers before workspace reuse | P0 feasibility; G2 containment |
| P0-A10 | Framework mismatch | Revision/contract/skill hash mismatch exits with actionable handoff, with no execution or silent pin replacement | P0 baseline review; G1/G3 integration |
| P0-A11 | Operator decisions | Approval binds identity/action/payload/target/expiry; human-only kill/reset requires reconciliation and re-verification, no implicit lease regrant | P0 UX contract; G1/G2 integration |
| P0-A12 | Unsupported workload | Unsupported stack, channel or deployment gets an explicit handoff rather than fallback execution or a false complete result | P0 scope; G3/G4 integration |

## Shared runtime comparison — evidence and decision

**2026-10-22 progress:** [first shared offline evidence](../pi/14-p0-runtime-comparison.md)
now passes on both runtimes under Node and Bun, with synthetic namespace/mount/
cleanup feasibility checks. [Release revalidation](../pi/15-p0-release-revalidation.md)
records published `1.4.0` separately from tested `1.3.0`. No runtime was selected
at that first increment; the subsequent accepted decision is recorded below.
Hard-crash/replay, storage ownership and upgrade/rollback cases remain open;
the acceptance rows above still describe required qualification, not passed gates.

**Recovery increment:** [process-crash/ownership/restore evidence](../pi/16-p0-crash-recovery.md)
now covers external SIGKILL, live denial and final-payload checks, unsafe-effect
reconciliation, native dual-open counterexamples and copy-only `1.3.0` → `1.4.0`
SQLite upgrade/old-backup restore. The research launcher now confirms namespace
init exit through pidfds before reuse, including the startup window. These are
synthetic process-failure results, not power-loss or production qualification.

**Recommendation increment:** [pinned-skill and `1.4.0` evidence](../pi/17-p0-runtime-recommendation.md)
supports **coding-agent SDK `1.4.0`**, accepted by the owner on 2026-10-22 in
[ADR-005](../../decisions.md#adr-005---2026-10-22-p0-runtime-recommendation).
Native loading discovers 12 tracked roots; actual adapter/child/result text
persists in both runtime fixtures. Required non-vendored children still block
full workflows. The comparison has reached an accepted runtime decision; next
is the remaining G0 decision pack, not more open-ended runtime feature research.
No dependency promotion, framework re-pin or P1 advancement is implied.

Budget: **five active development days total**, per roadmap, not calendar elapsed
time. The runtime direction is accepted; remaining G0 owner decisions are pending.
No active-hour result was measured; no claim of five days worked or G0 closure.
The protocol below records how to compare, not a request to repeat completed work.

1. Inventory existing public API probes and recoverable temporary evidence.
   Revalidate the selected published source/artifact before executing it; keep
   experiment dependencies out of Loom and use synthetic state under `/tmp/opencode`.
2. Specify the same input/tool/result contract and fixture for both candidates.
   Use scripted provider replies; keep runtime-private journals separate from
   the synthetic Loom-authority/effect target. The entire Pi process remains
   outside authority; disabling hooks must not bypass the owned effect gate.
3. Cover A01–A03, A05–A08 with exact commands, runtime revisions, expected failure,
   actual result, stored evidence and limitations. Record hard-kill versus
   cooperative-close proof separately. No untrusted runtime execution until
   an approved isolation boundary is established; defer cases that require it.
4. Record adapter effort, tool/skill compatibility, Bun behavior, storage and
   upgrade burden. Pass/fail safety constraints outrank convenience. Synthetic
   replies establish no model quality, latency, cost or real-provider claim.
5. End with an explicit recommendation or blocker within the timebox. Do not
   promote a package pin, add a second scheduler or call G0 passed automatically.

## Authority and failure model to preserve

```text
human operator → trusted Loom supervisor / protected ledger / verification
                       ↓ identity-bound narrow requests, live checks
                isolated Pi runtime + private journal + disposable workspace
                       ↓ candidate evidence only
                trusted exact-hash verification → human delivery approval
```

The runner never owns grants, leases, policy, task completion or production/provider
credentials. Keep provider mediation outside the runner. Treat output as untrusted
before persistence/exposure. Distinguish process death from host/power loss and
local cleanup from remote reconciliation. Neither runtime settlement nor a tool
return is evidence of completion. See the [normative boundaries](../../SPEC.md#runtime-architecture-and-security-boundary-2026-10-20-decision).

## Open G0 register and next owners

| Item | Next owner/action | Closure evidence |
| --- | --- | --- |
| Representative repo/runbook families | Disposable Loom checkout selected; developer specifies the bounded first golden and required framework inputs | Approved small TS-fix matrix and task acceptance test; no full workflow proof yet |
| Runtime/revision | Design choice closed by accepted ADR-005; developer scopes later dependency promotion | SDK `1.4.0` direction accepted; implementation/support qualification remains gated |
| Sandbox/host/deployment | Rootless Docker target accepted and separate rootless lab installed/tested; rootful default preserved | Mount/log/startup/egress/production qualification assigned to later gates; not a setup blocker for synthetic core planning |
| Provider/model/data/spending | Disabled SIWC with Plus/Free candidates and data-control attestations recorded; owner approved deferred live qualification | ADR-012 boundary accepted; actual eligibility and separate live-use approval still required |
| Framework drift | Retain/revalidate design closed in ADR-007; developer scopes required-child/full-workflow qualification | Current pin unchanged; source delta reviewed, no real-workflow certificate |
| Operator controls/transport | Local CLI/runner design accepted in ADR-009; concrete schemas/auth details and proof remain phase work | Approval/kill/reset/recovery walkthrough; no invented shipped commands |
| Durability/capacity/recovery | WAL/FULL, backup/restore targets and lab envelope accepted; operator supplies setup/storage/backup particulars | Process/host/power-loss distinction, enforced limits and restore drill; no achieved SLO claim |
| Independent review | Ishan Singh, Principal Developer; owner-stated availability “always available”; owner relayed report approval on 2026-10-22 | Approval applies to the `fc0e05e` report; no direct signature claimed; R-001 and G0/P1 decisions remain open; not self-certified |
| Next implementation package | T-01 proposed first, T-03 next; scope, caller trace, tests and estimates in closure packet | Final owner approval of that specific slice and G0 package remains required before P1 |

The initial kickoff introduced no architecture selection; runtime selection was
subsequently accepted in ADR-005. Significant boundary and storage decisions belong in
[decisions.md](../../decisions.md) when made. No commit/push/PR or paid evaluation
is implied by starting P0.
