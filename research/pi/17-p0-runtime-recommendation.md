# P0 — I2P compatibility and runtime recommendation

Date: **2026-10-22**. Accepted decision: [ADR-005](../../decisions.md#adr-005---2026-10-22-p0-runtime-recommendation).
Recovery baseline committed at `f08c7ec`; [first comparison](14-p0-runtime-comparison.md),
[release facts](15-p0-release-revalidation.md) and [crash/restore evidence](16-p0-crash-recovery.md)
remain evidence, not production qualification.

## Recommendation

**The owner approved upstream Pi coding-agent SDK `1.4.0` for the first isolated
adapter on 2026-10-22.** Exact source tag commit:
`4a080252f06caf63a525d7873c5d94d3c23887e0`, freshly confirmed through the
[official tag API](https://api.github.com/repos/earendil-works/pi/git/ref/tags/v1.4.0).
No package pin, framework pin, production authority or milestone changed here.

The deciding factor is **initial integration fit**, not model performance or an
inference that SDK hooks are safe authorization. Native Agent Skills metadata,
explicit `/skill:` expansion and JSONL/session APIs match Loom's planned
T-08–T-11 adapter. Both candidates passed the selected owned-effect/recovery
checks. SDK still needs supervised retry/reconciliation; Durable provides more
checkpointing but adds different session/tool APIs, owned skill-context plumbing
and its SQLite schema/restore lifecycle. Durable tasks need not duplicate Loom
workflow truth; this is a tradeoff, not a reason to run both loops.

`1.4.0` is preferred over historical `1.3.0` because its shipped resume/tool
activation and truncated-call recovery fixes matter to the adapter. The current
probe corpus was rerun against exact `1.4.0`, rather than treating changelogs as
execution evidence. See the [shipped SDK changelog](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/CHANGELOG.md).
This is not full real-provider/MCP/UI/RPC conformance or a moving-`latest` policy.

## Pinned framework: what actually loaded

The [framework fixture](probes/p0-framework.py) reads `FRAMEWORK_REF`, resolves
only Git objects at `4fe0869ae41b0d81cbe3c6bc643f10ff2049ceed` / `2.1.0`, and
exports tracked regular skill data plus registry/lock files to a new temporary
snapshot. It rejects symlink entries and path escapes, verifies Git blob IDs,
and records SHA-256 per file. The snapshot is mounted read-only, never the sibling
working tree or host skill directories. The sibling is on a different revision
with unrelated untracked work; none of it was changed or substituted.

Observed on Node `26.7.0` and Bun `1.4.3`:

- **12 tracked skill roots** load with SDK `loadSkills(...includeDefaults:false)`
  and no diagnostics. `DefaultResourceLoader` receives only that explicit list;
  extension, prompt-template and ambient-context loading remain disabled.
- `/skill:itp-verify` expands the actual pinned adapter text into the SDK session;
  its `adapter_contract` YAML survives persistence/reopen.
- The required `verification-before-completion` child's directory hash matches
  `skills.lock.json` using its documented sorted-path/NUL/content/NUL method.
  The tool reads the exact vendored text; no framework skill procedure executes.
- Durable receives the same pinned adapter text through an owned explicit input
  and reads the same child. It does not depend on the SDK for its loading path.
  No native Durable skill-loader API was found in the inspected shipped public
  declarations; an owned context path is sufficient for this text fixture.
- Both paths preserve a framework-shaped `skill_result` text envelope through
  tool output and runtime persistence. YAML↔object roundtrip preserves its fields.
  A synthetic `pass` with empty evidence is demonstrably not completion evidence;
  no Loom completion gate or semantic verification is implemented by this fixture.
- A required specialist such as `tdd` is not vendored in this snapshot. The owned
  fixture returns `blocked:missing-pinned-child:tdd`, with no global lookup or
  auto-install. Full implementation/review workflows need their locked external
  children provisioned and validated separately before support can be claimed.
- Tampered adapter bytes, a missing vendored child and a symlink substitution
  are rejected in negative snapshot self-checks **before runtime launch**.

These assertions establish discovery/text/contract transport, not real-model
compliance, full workflow execution or fresh framework readiness. The old
framework pin is **retained unchanged for evaluation**, not automatically
revalidated for every current runbook or promoted over the newer sibling revision.

## Native loading is not admission authority

Installed SDK `dist/core/agent-session.js` lines 1727–1750, matching
[release source](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/agent-session.ts),
passes an unknown `/skill:` command through as ordinary text, and returns the
original text after a read failure. Its discovery loader also follows symlinks
and can return an empty result for a missing directory. Therefore:

1. Loom must own exact revision/content-hash and required-child checks **before**
   invocation; native metadata/command handling does not satisfy T-07 alone.
2. Pin roots/allowlists and reject symlink/unsupported resources outside the
   runner. Executable components require their own approved startup boundary.
3. Keep root/user-entry versus adapter/child invocation classes in the owned
   registry; no recursive user-entry workflow or model-authored authority.
4. Model results remain untrusted proposals. Fresh exact-hash verification,
   effect reconciliation and approvals remain outside the runtime.

These are production requirements, not new enforcement implemented in `src/`.
The current `src/framework.ts` still checks only commit/version; its full hash/
registry gate is planned work, not silently completed by this experiment.

## Release artifacts and environment

The separate external `/tmp/opencode/loom-p0-comparison-140` project has exact
SDK/Durable `1.4.0`, installed with lifecycle scripts disabled and empty distinct
npm configs under a cleared installation environment. Both direct tarball bytes
match official registry SHA-512 metadata and the external lock entries:

```text
SDK:     sha512-Z41LpZ3yYHSC/UUps6Mr39UMFPwH8elhJBG9DY1P7kuzsE5qSK/6eMj2EHzO5evJRQWLbKSqUMw+4nCNtIyiQg==
Durable: sha512-EtIyXH1MBSXdJSkodmy+CYXuwfve3gPrD4GNCZ0XmuRWLPupwRlNQ7fdaXjRcLoKb6SWkT/yEzK+sMmrqvYK+Q==
```

External lock SHA-256:
`8afc59c5736a146556dde9cfee56ef047e9a4538f26bad801fbc3fd115fa9e5b`.
Installation added 122 packages and warned about deprecated
`node-domexception@1.0.0`; this is not itself a vulnerability advisory. Source
review covered the shipped SDK skills/resource-loader/expansion and Durable replay
contracts, not every transitive source, signature/provenance or license.
Earlier external installations/locks and Loom's manifest/lock remain unchanged.
External lockfiles are not committed; fresh installs must repeat validation/audit.

## Reproduce the checks

Use the [previous external installation procedure](14-p0-runtime-comparison.md#reproduction-and-dependency-evidence)
with both direct versions set to `1.4.0` in the separate directory. Keep all calls
offline inside the runner; registry/source retrieval alone uses the network.

```bash
python3 research/pi/probes/p0-framework.py --framework ../I2P \
  --experiment /tmp/opencode/loom-p0-comparison-140 --version 1.4.0
python3 research/pi/probes/p0-recovery.py \
  --experiment /tmp/opencode/loom-p0-comparison-140 \
  --upgrade-experiment /tmp/opencode/loom-p0-durable-140 --version 1.4.0
```

The second command uses the same five crash cases and ownership checks; it does
**not** mislabel a schema-2 `1.4.0` source as a `1.3.0` migration. Original
`1.3.0` commands/defaults retain the two copy-only upgrade/restore tests. Ordinary
`p0-sandbox.py` also accepts explicit `--version 1.4.0`; no runtime is inferred
from a directory name or npm dist-tag. Python optimization is refused.

### Fresh ordered verification (2026-10-22)

Configured lint (12 files), strict TypeScript baseline, both probe Node syntax
checks and Python in-memory compilation passed. Existing tests remain **3 pass /
0 fail**, 100% functions / 90.99% instrumented framework/store lines, unchanged.
The following complete case matrix passed after the shared-probe changes:

| Exact runtime version | Ordinary paths | Pinned skill paths | Crash cases | Ownership cases | Upgrade/restore cases |
| --- | --- | --- | --- | --- | --- |
| `1.3.0`, SDK/Durable × Node/Bun | 4 | 4 | 20 | 4 | 2 (`1.3.0` source → `1.4.0` clone → old backup restore) |
| `1.4.0`, SDK/Durable × Node/Bun | 4 | 4 | 20 | 4 | N/A: source already schema 2; migration remains the preceding row's test |

Boundary self-checks and the three tampered/missing/symlink negative snapshot
assertions passed; those assertions do not inflate application coverage. Shared
PID-namespace startup/cleanup safeguards remain in place. No full I2P or real
provider/MCP acceptance claim follows from these scripted replies.

Read-only audits exit 0 with zero advisories: 14 Loom packages and the external
121-, 91- and 122-package trees. All three external lock hashes match their
recorded baselines. No auto-fix ran. Secret scanner tooling remains unavailable;
manual/syntax/advisory checks are not equivalent to secret scanning or a complete
security/provenance/license assessment. No phase/release safety gate is waived.

## Proposed implementation ownership (after approvals, not scaffolding)

Keep P1's T-01–T-07 authoritative core first; no runtime dependency is needed to
start that core once G0 passes. Preserve the existing
[T-08–T-11/T-15 mapping](07-loom-v01-mapping.md#phase-b--isolated-pi-adapter-needs-a-green-baseline-0992-version-selection-pending).
Concrete proposed adapter files, to be finalized in P2's approved phase spec:

| File / connected tests | Owner and invariant |
| --- | --- |
| `src/framework.ts`, `tests/framework.test.ts` | Extend the existing gate for revision/registry/skill-content identity and required inputs; no duplicate authority in a Pi hook. |
| `src/pi/runner.ts`, `tests/pi/runner.test.ts` | Isolated SDK bootstrap; owned loaders/tool inventory, role session, bounded context and all-channel usage; no host authority. |
| `src/pi/supervisor.ts`, `tests/pi/supervisor.test.ts` | Host identity-bound transport, lifecycle and honest resume/reconciliation; protects authoritative state. |
| `src/pi/extension.ts`, `tests/pi/extension.test.ts` | Early veto/feedback/telemetry; privileged dispatch still checked by the owned host operation. |
| `src/pi/session-reader.ts`, `tests/pi/session-reader.test.ts` | Read-only persisted session evidence/cursor mapping; no writes to Pi-owned state. |
| `src/pi/results.ts`, `tests/pi/results.test.ts` | Validate result envelope and withhold unsafe output; no model-authored completion. |
| `src/sandbox.ts`, `tests/sandbox.test.ts` | One selected supported backend with whole-domain cleanup/resource/egress proof; the research launcher is not promoted as-is. |

No files in this proposed manifest are created by this increment. Detailed public
protocol/schema and provider mediation choices still need approval and tests.

## Stop the comparison; close decisions next

The bounded comparison has reached an accepted runtime direction; additional
runtime feature hunting is not the next task. No active-hours/performance claim
was measured. **Project owner:** approve a retained/
revalidated framework baseline or a separately reviewed re-pin. Also close the
provider/model/data/spending, host/backend/deployment, operator approval/kill/reset,
durability/capacity and independent-review inputs in the
[G0 register](../phase-0/05-p0-support-profile.md#open-g0-register-and-next-owners).
Developer then prepares the concrete G0 decision pack and P1 T-01/T-03 backlog.
G0 approval precedes P1; production qualification remains much later.
