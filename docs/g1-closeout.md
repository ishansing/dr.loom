# G1 closeout evidence — recorded; closure pending

## Artifact and authority

T-07 implementation commit: `f888e6823c7ca67d8fb8a778d56c9b87b45d5a2b`.
Parent: `9f3241aa2186b1ac975f60eb09f7b367cee1fc68` (approved T-06).
Owner authorized the commit and continuation discovery on 2026-10-25.
The working tree was clean immediately after committing the 22 verified files.
This document is subsequent closeout preparation, not part of that reviewed
artifact or permission to advance to P2. Owner separately authorized its commit.

[G1 requirements](../ROADMAP.md#p1--authoritative-core-and-safe-effect-admission) and
[active T-07 contract](../SPEC.md#active-phase-specification) remain authoritative.
The [AI advisory](../research/reviews/2026-10-25-p1-t07.md) recommends human
review with no confirmed findings. The owner subsequently relayed Ishan's T-07
approval and explicitly confirmed “Approved 555586b by Ishan” on 2026-10-25.
This is owner-relayed human approval, not an independently authenticated
signature or a new AI review of the correction. T-01–T-06 approvals remain
separate historical records.

## Recorded acceptance evidence — 2026-10-25

- **Accepted artifact:** `555586b8d00e5d3350bd671054b5a97140ecfbdb`, containing
  T-07 plus the seven-site fixture-parent correction. No application, workflow,
  dependency or pin changes were introduced by that correction.
- **Remote CI:** [run40178607723](https://github.com/ishansing/dr.loom/actions/runs/40178607723),
  independently checked with `gh run view 40178607723 --json headSha,conclusion,url,jobs`
  and `gh run view 40178607723 --log`. Exact accepted SHA; conclusion success.
  Install, lint (26 files), strict check, coverage (143 pass/0 fail/2,082 assertions;
  100% functions/98.11% lines), standalone synthetic drill and audit (14 packages,
  no advisories) all succeeded. The earlier failed run remains historical.
- **Human demonstration:** the owner personally ran `bun run drill` and supplied
  HEAD `ffed35e299726c9868b3fecfbe725f67edd4dc29`, successful output, and the
  statement “i personally runned it”. This is a human execution attestation from
  the owner in this conversation, not an agent execution or independent witness.
  The output was reviewed here; no separate explicit human-review statement or
  individual execution timestamp beyond the conversation date was supplied.
  The drill script/application are unchanged at the accepted artifact; its
  fixture-parent setup changed, and CI reran the drill successfully there.
  The human attestation stays bound to `ffed35e`, not falsely rebased to `555586b`.
- **Ishan disposition:** owner states “Approved 555586b by Ishan”, explicitly
  covering the corrected artifact. No additional conditions were supplied.
- **Authority:** owner requests recording and committing this evidence **before**
  G1 closure. No closure, merge, push or P2 authorization is inferred.

Human-supplied drill output, preserved without changing its attestation semantics:

```json
{"ok":true,"mode":"synthetic","attestation":"automated-fixture-only","events":["framework-verified","run-opened","phase-committed","awaiting-human","interrupted-action","kill-engaged","killed-write-denied","reset-planned","reset-recorded","stale-lease-denied"],"verifiedTaskCompletion":false}
```

## Framework qualification boundary

Actual framework installation qualification is **not a synthetic/core G1 blocker**.
The roadmap's G1 exit requires core CI and separate process/filesystem fixtures;
the [T-07 plan](../research/pi/09-milestone-1-implementation.md#part-t-07--cli-v1--conformance-close-out-needs-t-01t-06)
tests drift with fixture skills. The roadmap risk register makes framework drift
a blocker for **affected framework execution**. This clarifies gate scope; it
does not waive installation checks or qualify the current installation.

Retain selected `2.1.0` at `4fe0869ae41b0d81cbe3c6bc643f10ff2049ceed`.
The last inspected configured checkout was `4.0.0` at
`bd0cacc5a0a81d41311782d2b20f778ee7b40392`, mismatched and unqualified. Before
actual framework execution, supply explicit matching installation/skill roots
and pass Git/version/tree/lock/content checks. No installation or re-pin is
authorized here; this evidence update did not re-probe that installation.

## Requirement / evidence / next owner

| Requirement | Existing evidence at the implementation artifact | Remaining evidence / owner |
| --- | --- | --- |
| Safe migrations, immutable audit, supported restore | `tests/schema-v2.test.ts`: migration rollback on disk exhaustion, guards and separate backup-clone recovery; `tests/runs.test.ts`: fixed v4→v5 preservation | Existing restore fixture starts from legacy schema, not a separately qualified production v4 restore. Gate reviewer evaluates bounded synthetic proof; no production restore claim. |
| Single effective writer; wrong/stale/expired owners rejected | `tests/write-gate.test.ts`: eight real contenders, stale epochs and abrupt exits; `tests/runs.test.ts`: competing phase writers | Local native-process proof and verified exact-artifact CI pass. |
| Kill blocks later dispatch; reset requires fresh evidence | `tests/kill.test.ts`, `tests/outbox.test.ts`, `tests/cli.test.ts`: batch kill, stale/blocked plans, no lease resurrection | Human demonstration output/attestation recorded above; CI repeats on corrected artifact. |
| Idempotent replay; uncertain non-idempotent effects never blindly replayed | `tests/outbox.test.ts`: crash after independent target commit, deduplication and evidence-backed reconciliation | Synthetic targets only; no remote rollback or real adapter qualification. |
| Truthful crash/restart/resume and evidence | `tests/audit-lifecycle.test.ts`, `tests/write-gate.test.ts`, `tests/runs.test.ts`; CLI status/drill | Personal execution attested at `ffed35e`; exact scope/limits recorded above. |
| Framework drift fails closed | `tests/framework.test.ts`, `tests/cli.test.ts`: actual Git/version/tree/lock/content checks, drift and replacement-ref rejection | Fixture proof passes. Actual installation remains blocked for framework execution, not synthetic G1. |
| Deterministic corpus in CI and separate process/filesystem fixtures | Local gates: 143 tests/2,082 assertions, 100% functions/98.11% lines; focused 31/144; drill/audit pass. Tests use real subprocesses and temporary filesystem state. Pinned workflow in `.github/workflows/ci.yml`. | Verified remote run40178607723 passes at full accepted SHA. |
| Fresh operator locates committed/pending/interrupted work, kills and resumes safely | `bun run drill`; [operator contract](cli.md#offline-operator-drill) | Owner personal execution/output recorded above; output's `automated-fixture-only` label is preserved. |
| Human review and gate disposition | Advisory `T07-20261025-01-AI-01`; durable frozen manifest retained in report | Ishan approval of corrected artifact relayed by owner. Explicit G1 closure remains pending. |

## Exact-artifact handoff

**CI investigation/correction (2026-10-25):** remote
[run40173273410](https://github.com/ishansing/dr.loom/actions/runs/40173273410)
at `ffed35e299726c9868b3fecfbe725f67edd4dc29` failed134 pass/9 fail: missing
`/tmp/opencode` before fixture allocation. Lint/typecheck passed; drill/audit
were skipped. Seven test setup sites now create the parent explicitly; local
empty-`/tmp` independent file runs, standalone drill and143-test coverage pass.
Correction committed/published as `555586b`; successful replacement CI verified
above. Application code/workflow/dependencies are unchanged.

1. CI, human demonstration and owner-relayed approval are recorded above with
   their distinct artifact identities and provenance.
2. Owner explicitly decides G1 closure after reviewing this evidence and its
   limitations. The present instruction requires the record commit first.
3. Merge/push and P2 implementation remain separately authorized actions.

## Exclusions and decision

G1 remains **OPEN**. No T-08/P2 implementation, live provider usage, credentials,
real effects, deployment, framework installation or production authority was
authorized or exercised. Process containment, authenticated IPC, real runtime
and provider qualification belong to later gates; database/fixture success
cannot establish them. A committed phase remains bookkeeping, not independently
verified task completion.
