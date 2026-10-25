# G1 closeout evidence — pending

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
review with no confirmed findings; Ishan's disposition remains PENDING.
T-01–T-06 approval was relayed by the owner; it does not transfer to T-07.

## Requirement / evidence / next owner

| Requirement | Existing evidence at the implementation artifact | Remaining evidence / owner |
| --- | --- | --- |
| Safe migrations, immutable audit, supported restore | `tests/schema-v2.test.ts`: migration rollback on disk exhaustion, guards and separate backup-clone recovery; `tests/runs.test.ts`: fixed v4→v5 preservation | Existing restore fixture starts from legacy schema, not a separately qualified production v4 restore. Gate reviewer evaluates bounded synthetic proof; no production restore claim. |
| Single effective writer; wrong/stale/expired owners rejected | `tests/write-gate.test.ts`: eight real contenders, stale epochs and abrupt exits; `tests/runs.test.ts`: competing phase writers | Local native-process proof exists; owner supplies CI result for this exact commit. |
| Kill blocks later dispatch; reset requires fresh evidence | `tests/kill.test.ts`, `tests/outbox.test.ts`, `tests/cli.test.ts`: batch kill, stale/blocked plans, no lease resurrection | Human operator demonstration remains pending. |
| Idempotent replay; uncertain non-idempotent effects never blindly replayed | `tests/outbox.test.ts`: crash after independent target commit, deduplication and evidence-backed reconciliation | Synthetic targets only; no remote rollback or real adapter qualification. |
| Truthful crash/restart/resume and evidence | `tests/audit-lifecycle.test.ts`, `tests/write-gate.test.ts`, `tests/runs.test.ts`; CLI status/drill | Owner records a personally executed/reviewed demonstration, not agent automation. |
| Framework drift fails closed | `tests/framework.test.ts`, `tests/cli.test.ts`: actual Git/version/tree/lock/content checks, drift and replacement-ref rejection | Actual configured checkout mismatches the selected pin. Owner supplies a matching explicit installation/skill root if actual-installation qualification is required; no silent re-pin/install. |
| Deterministic corpus in CI and separate process/filesystem fixtures | Local gates: 143 tests/2,082 assertions, 100% functions/98.11% lines; focused 31/144; drill/audit pass. Tests use real subprocesses and temporary filesystem state. Pinned workflow in `.github/workflows/ci.yml`. | Owner publishes T-07 and provides successful workflow URL tied to the exact commit; local success/configuration is not remote CI. |
| Fresh operator locates committed/pending/interrupted work, kills and resumes safely | `bun run drill`; [operator contract](cli.md#offline-operator-drill) | Human operator runs/reviews output and records actor/date/commit/result. Output deliberately remains `automated-fixture-only`; do not relabel it as human evidence. |
| Human review and gate disposition | Advisory `T07-20261025-01-AI-01`; durable frozen manifest retained in report | Ishan supplies attributable T-07 disposition; authorized owner explicitly decides G1 after required evidence. |

## Exact-artifact handoff

**CI investigation/correction (2026-10-25):** remote
[run40173273410](https://github.com/ishansing/dr.loom/actions/runs/40173273410)
at `ffed35e299726c9868b3fecfbe725f67edd4dc29` failed134 pass/9 fail: missing
`/tmp/opencode` before fixture allocation. Lint/typecheck passed; drill/audit
were skipped. Seven test setup sites now create the parent explicitly; local
empty-`/tmp` independent file runs, standalone drill and143-test coverage pass.
Owner authorized correction commit; not yet published. Successful replacement CI remains
required. Application code/workflow/dependencies are unchanged.

1. Owner publishes `feat/p1-cli-conformance` when ready; this task did not push it.
   Owner reports T-06 published, but agent SSH authentication still prevents
   independent remote verification. No further credential inspection is needed.
2. Attach the CI workflow URL and resolved full SHA; verify it is the commit above,
   not merely a green branch name or an earlier T-06 workflow.
3. From that checkout, a human runs `bun run drill` and reviews its committed work,
   pending/interrupted state, kill, reset and stale-lease assertions. Record
   sanitized output/result and attributable actor/date/commit separately.
4. Obtain Ishan's disposition against the frozen T-07 artifact and record any
   conditions. Neither this document nor the implementation commit approves it.
5. Owner resolves whether the matching actual framework installation is a G1
   qualification condition or a later integration prerequisite. Synthetic drift
   proof is present; actual installation qualification is not. Do not waive a
   declared requirement or install/re-pin implicitly.

## Exclusions and decision

G1 remains **OPEN**. No T-08/P2 implementation, live provider usage, credentials,
real effects, deployment, framework installation or production authority was
authorized or exercised. Process containment, authenticated IPC, real runtime
and provider qualification belong to later gates; database/fixture success
cannot establish them. A committed phase remains bookkeeping, not independently
verified task completion.
