# P0 — Support profile and acceptance matrix

Started **2026-10-22** with owner authorization. This is an evaluation contract,
not a certified support matrix. Scope: [ROADMAP P0](../../ROADMAP.md#p0--product-contract-and-irreversible-decisions).
Execution requirements: [active phase](../../SPEC.md#active-phase-specification).

## Owner-confirmed evaluation scope

| Dimension | Initial scope | Approval/evidence still needed |
| --- | --- | --- |
| User/journey | Single trusted developer/operator; small fix in an existing Bun/strict TypeScript repository | Representative real repository and I2P runbook families |
| First fixture | Disposable synthetic TS repository with one deterministic failing test, a bounded patch and a passing test | Fixture/test implementation in the next specified package |
| Host | Linux x86_64; local/private CLI | Supported distribution/kernel and minimum hardware, not just current workstation |
| Isolation candidate | Evaluate rootless containers; no backend selected | Privilege, mount, egress and whole-domain cleanup proof; fallback decision if incompatible |
| Deployment candidate | Local disposable staging destination | Concrete target/restore contract; no production deployment approval |
| Provider/model | Offline synthetic responses only; zero paid-call budget | Exact provider/model, data policy and cap before live calls; G0 remains open |
| Runtime | Compare upstream Pi coding-agent SDK and Durable; one winner | Release revalidation, same-workload evidence and explicit adoption decision |
| Framework | Retain current `FRAMEWORK_REF` unchanged during kickoff | Retain/revalidate versus re-pin review; previous readiness is not current compatibility proof |

No real credentials, customer repositories or production data belong in fixtures.
The owner has approved evaluation scope, not runtime adoption or production support.

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

## Shared runtime comparison — next bounded package

**2026-10-22 progress:** [first shared offline evidence](../pi/14-p0-runtime-comparison.md)
now passes on both runtimes under Node and Bun, with synthetic namespace/mount/
cleanup feasibility checks. [Release revalidation](../pi/15-p0-release-revalidation.md)
records published `1.4.0` separately from tested `1.3.0`. No runtime selected.
Hard-crash/replay, storage ownership and upgrade/rollback cases remain open;
the acceptance rows above still describe required qualification, not passed gates.

Budget: **five active development days total**, per roadmap; log actual effort,
not calendar elapsed time. First increment executed; no active-hour/effort result
was measured, and the five-day comparison is not declared complete.

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
| Representative repo/runbook families | Owner nominates one sanitized repo/task; developer maps pinned I2P entry points | Approved support matrix and task acceptance test |
| Runtime/revision | Developer executes bounded comparison | Same-workload evidence and reviewed ADR choosing one runtime |
| Sandbox/host/deployment | Developer tests approved candidate; owner approves concrete profile | Mount/egress/cleanup and restore evidence; no implicit Docker privilege escalation |
| Provider/model/data/spending | Owner specifies exact profile before any live call | Explicit approval; synthetic comparison alone cannot close this |
| Framework drift | Developer reviews selected revision, contracts, registry/locks and readiness | Retain/revalidate or approved re-pin ADR; current pin unchanged meanwhile |
| Operator controls/transport | Developer proposes CLI and identity-bound supervisor protocol; owner reviews | Approval/kill/reset/recovery walkthrough; no invented shipped commands |
| Durability/capacity/recovery | Owner states acceptable loss/restore and retention; developer tests assumptions | Process/host/power-loss distinction, backup/restore criteria and bounded capacities |
| Independent review | Owner identifies reviewer/availability | Booking and named scope; not booked by this document or self-certified |
| Next implementation package | Developer scopes T-01/T-03 after remaining decisions | Updated estimates and owner-approved P1 backlog only after G0 passes |

Kickoff introduces no new architecture selection: the confirmed evaluation scope
stays here; significant runtime, boundary and storage decisions belong in
[decisions.md](../../decisions.md) when made. No commit/push/PR or paid evaluation
is implied by starting P0.
