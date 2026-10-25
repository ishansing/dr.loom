# Local PR draft — P1 deterministic control plane

Title: `feat(core): complete P1 deterministic control plane and G1 conformance`

Base: `master`; head: `feat/p1-cli-conformance`. Includes all T-01–T-07 ancestors,
not merely the CLI change. No PR has been published and no merge is authorized.

## Summary

```text
trusted host
  → schema5 / immutable run, audit and evidence records
  → live kill / lease / policy / budget admission
  → synthetic outbox dispatch and explicit uncertainty reconciliation
  → CLI orientation / framework integrity / operator drill
```

Close synthetic/core G1 under owner authorization with recorded human evidence
and owner-relayed Ishan approval. No provider, real adapter, untrusted runner,
deployment or actual framework qualification is enabled.

## Evidence

- **Before:** fresh-runner CI40173273410 failed9 tests because fixture parents
  were absent; empty-`/tmp` reproduction exposed12 order-dependent failures.
  **After:** seven allocation sites explicitly create parents; accepted artifact
  `555586b8d00e5d3350bd671054b5a97140ecfbdb` passes
  [CI40178607723](https://github.com/ishansing/dr.loom/actions/runs/40178607723).
- Fresh lint/strict check/full coverage/focused tests/drill/audit pass at
  pre-closure HEAD `7f85871`:143 tests/2,082 assertions,100% functions/98.11% lines;
  same full coverage passes in an empty-`/tmp` child mount namespace.
- Human drill attested by owner at `ffed35e`; Ishan approval explicitly covers
  `555586b`, as relayed by owner. Application/drill script unchanged by the
  correction; corrected fixture also passes CI. [G1 evidence](g1-closeout.md)
  preserves exact identities, output and provenance limitations.
- API-verified target `master` at `2be0e4fe7a593887ce690062e68a8dfaeaf170a7`
  is an ancestor of this stack; local merge-tree check has no conflicts.
  Recheck after final publication: current green CI does not cover unpublished
  evidence/closure documents. Required PR checks/reviews must still pass.

## Merge Danger

**Door:** one-way for schema upgrades; source rollback alone cannot downgrade
stores. Use a verified pre-upgrade backup/restore plus reconciliation; never
delete newer run/audit/evidence history. No production migration is authorized.

**Blast Radius:** core

Includes all P1 store, admission, policy, CLI and conformance work. CLI machine
callers must use explicit `--json`; init/record require a host-prepared store and
live lease. Selected framework2.1.0 remains pinned; the last-inspected4.0.0
installation is unqualified and affected execution must remain blocked.

Preserve the reviewed commit history when merging the stacked branch. Do not
merge each older P1 branch again. Merge does not authorize P2 or live effects.
