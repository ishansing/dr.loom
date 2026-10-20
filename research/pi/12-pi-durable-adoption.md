# Pi Durable — Loom adoption assessment

Research date: **2026-10-20**. Recovery/security detail:
[13-pi-durable-recovery-boundaries.md](13-pi-durable-recovery-boundaries.md).
This is an assessment, not adoption authorization, a pin change or a replacement
of Loom's [accepted authority/isolation boundary](../../SPEC.md#runtime-architecture-and-security-boundary-2026-10-20-decision).

## Verdict

**Yes, Pi Durable is a credible execution-runtime candidate for Loom. Evaluate
it before committing to the coding-agent SDK adapter; do not replace Loom's
enforcement core or adopt it in production yet.**

The important correction to our October 1 research is not that Durable has
become stable: it still explicitly warns that APIs change without notice.
It is that the published runtime now supplies useful machinery we otherwise
planned to assemble: durable conversations, model/tool tasks, checkpointed
custom tasks, nested calls, document state, compaction and client views.
Its own [launch post][launch] describes it as a separate harness, **not a
replacement or plugin for Pi the coding agent**. Its public API and dependency
manifest confirm the separate runtime. [Public API][api], [manifest][manifest].

Using Durable would remain a no-fork, upstream-Pi approach, but it would be an
**alternative implementation of Loom's isolated runner**, not another scheduler
stacked on top of `createAgentSession`. Some existing T-08–T-11 details would
need remapping before implementation. There is no reason to run two agent
loops or two authoritative project task graphs.

## What was checked

| Baseline | Exact source / status |
| --- | --- |
| Official identity | Earendil's [Pi Durable launch][launch], 2026-10-01; package `@earendil-works/pi-durable` in `earendil-works/pi/packages/durable` |
| Published npm `latest` | `1.3.0` when queried 2026-10-20; [registry metadata][npm] points at the official monorepo |
| Release source | `v1.3.0`, commit `71023aec1546d6d677a65669c5665c0927ce0dd0` |
| Current source | `main` snapshot `fdce48eb404ec014adaf2ac10a3a53bc6b1740c2`; **unreleased changes**, not the code exercised by the published-package probe |
| License / runtime | Package declares MIT, Node `>=22.19.0`; not a complete transitive-license or supply-chain audit. [Manifest][manifest] |
| Dependencies | Exact `1.3.0` dependencies on Chord, pi-ai and pi-codemode; no dependency on pi-coding-agent. Other direct dependencies include Photon, diff and TypeBox. [Manifest][manifest] |
| Artifact | Downloaded npm tarball verified against registry SHA-512: `sha512-2aD0xead1LH0BBwUBxex28in/PpUJEwyaEiW/nLoTFUcZ/lDYEl6LHX6mGZKJG8tUHzERwJyysDgy0ruidt84w==` |

Dependencies used for checks were installed only under
`/tmp/opencode/loom-pi-durable-review/probes`, with lifecycle scripts disabled.
No package was added to Loom and no real provider credentials were used.

## What Loom could reuse

The following are published APIs/source capabilities, not a claim that Loom's
security or I2P semantics come built in. The ordinary API paths were exercised
below; crash/replay qualifications are in the companion investigation.

| Capability | Benefit / limit for Loom |
| --- | --- |
| `Harness.open`, `root`, `submit`, `resume` | Runtime conversation admission and resumable work; reduces custom session recovery plumbing. Not Loom authorization or a run lease. [README][readme] |
| Durable generation/tool/custom tasks | Reuse internal task checkpoints and ownership, rather than building a second runtime scheduler. Durable tasks are units of execution, not automatically I2P phases or the authoritative project dependency graph. [API][api], [task example][task-example] |
| Nested tools with keyed reattachment | Each nested call has its own task, replay policy and result. Useful for supervised worker orchestration; external effects still require real idempotency/reconciliation. [Nested calls][nested] |
| Codemode with journaled replay | Promising for long tool workflows; unlike coding-agent 1.3.0, its built-in codemode classifier/image requests use internal nested tools. This is improved coverage, not universal containment: trusted code can still use other capabilities. [Codemode][codemode] |
| Typed documents + atomic transcript commits | Good for runtime-private state and reconnecting UI views. Do not put authoritative Loom policy/project state in the sandbox's documents or maintain competing copies. [Concepts][readme] |
| Compaction / reset / history / forks | Saves conversation-context plumbing and keeps old transcript entries. Does not replace provenance, memory governance or fresh-evidence verification. [README][readme] |
| Per-conversation agent configuration | Explicit models, instructions, extensions and callable/model-visible tool sets suit role-specific workers. These are configuration controls, not an OS boundary. [Configuration][configuration] |
| `ExecutionEnv` / `NodeExecutionEnv` | File/shell capability seam is useful for restricted or remote tools. A local environment's `cwd` or a per-conversation directory is not a sandbox; even the upstream sandbox example labels its directory as an example, not confinement. [Environment types][env], [example][sandbox-example] |
| Watches / views / usage / task graph | Useful runtime evidence and operator display; Loom still owns durable audit records, spend policy and completion. [README][readme], [API][api] |
| Memory / SQLite / JSONL backends | Runtime persistence without inventing a storage engine. Keep its store separate from Loom's protected DB; single-writer/version/migration limits are in the companion note. [Storage APIs][sqlite-api] |

## What it would and would not replace

| Existing plan | Durable impact if selected |
| --- | --- |
| T-01–T-07: core schema, write gate, audit, outbox, kill, policy, CLI | **Keep.** Runtime checkpoints/immutable transcript entries are not authoritative approvals, append-only security audit, fenced effects, run budgets or I2P validation. |
| T-08: coding-agent `tool_call` extension | Remap to Durable extension/tool wrappers and `ToolTask` hooks. API names and failure semantics are not interchangeable. Retain owned final-payload/output boundaries. |
| T-09: SDK runner/supervisor | Durable could own internal execution scheduling/recovery. Loom still owns the external supervisor, identity-bound channel and protected-effect operations. |
| T-10: Pi JSONL session reader | Replace its coding-agent JSONL assumptions with Durable's committed entries/watch API; its JSONL backend is a different storage contract, not a compatible session file. |
| T-11: structured results/completion | Durable offers `output`, `structuredOutputSchema` and `structuredOutput`; port the result contract. Outer Loom verification remains mandatory. |
| T-12/T-13: tasks/state/context | Reuse runtime task orchestration and compaction where appropriate. Preserve one writer for project tasks/state and the Loom provenance/trust model; Durable docs cannot also own those facts. |
| T-14/T-15: verification/isolation | **Keep.** Persisted `done`/task `completed` is not verified task success; tool-environment injection does not sandbox the entire process. |

The interface differences are concrete: Durable exports `Harness`,
`createRegistry`, `defineExtension`, `ToolTask`, Chord `Context` and its own
documents/events. It does not export the coding-agent `AgentSession`/
`SessionManager` adapter surface. Coding-agent extensions/skills/configuration
must not be assumed to load unchanged. Its shipped coding-tool bundle is
`read/write/edit/bash`, with PowerShell as a separate factory, not the
coding-agent's full tool inventory. [Public exports][api], [tools][tools].

## Important limits verified in the recovery review

The [companion investigation](13-pi-durable-recovery-boundaries.md) ran nine
credential-free assertions on published `1.3.0`; they also passed on parent
rerun. These are component and cooperative-close tests, not hard-crash tests.

- **Recovery can skip an indispensable hook.** Normal calls validate again
  after `beforeTool` (better than coding-agent 1.3.0), but recovery from a
  saved `execute` checkpoint reruns a safe tool **without `beforeTool`,
  argument preparation or schema validation**. It uses the current tool and
  environment. The probe changed cwd, schema and a hook to deny, then saw
  the old arguments execute a second time in the new cwd. Both stored and
  current replay policies must be safe; otherwise it reports interrupted/
  possibly partial execution without rerunning. Put live policy and final
  validation in the owned operation, not solely in a hook. [Tool phases][tool-phases].
- **`requestId` is not content binding.** Same-type submissions with the
  same key in one conversation return the original submission even if the
  payload changed; another conversation has a separate key scope. Loom must
  bind operation IDs to identity and immutable intent itself. [Admission][admission].
- **The hook-only safety problems remain.** Throwing `afterTool` preserves
  raw output; throwing `onYield` can still settle an input `done`. Default
  abort/idle ignores background work, and close can wait indefinitely for
  tracked code that ignores cancellation. Independent verification/output
  handling and external process containment remain necessary. See the
  companion source map and reproduced cases.
- **Storage is single-owner, not fenced leadership.** There is no supported
  concurrent multi-process ownership. SQLite's default `synchronous=NORMAL`
  has a different guarantee for process crashes than power/host loss. Default
  runtime storage is not a substitute for protected audit/effect certainty.
  [Storage contract][storage-contract].

## Maturity: released 1.3.0 is not current main

- **Still experimental:** the release and current README both explicitly say
  the API changes without notice. “1.x” is not a stability promise here.
  [Release README][readme], [current README][current-readme].
- Recent releases contain real breaking changes: 1.1 changes storage scan
  contracts; 1.2 changes tool task input/result unions, `content` to `output`,
  nested/structured results and storage-error behavior. Budget for ongoing
  adapter/conformance maintenance. [Release changelog][changes].
- The checked main has new **durable sleeps**, wake/hibernate support,
  crash-loop parking, richer telemetry and dynamic host model/settings input.
  Do not claim these were tested or shipped in npm 1.3.0. The release's
  in-phase sleep API is not the same as main's checkpointed `sleepUntil`.
  [Unreleased changelog][current-changes].
- Main requires explicit document `checkpointWhen`, adds task `sleeping`
  states, and automatically migrates SQLite to schema 2. The changelog
  explicitly says a migrated DB cannot reopen under 1.3.0 or earlier;
  old JSONL readers cannot resume sleeping tasks either. A future upgrade
  needs backup/restore and rollback planning, not just a version bump.
  [Unreleased breaking changes, lines 5–12][current-changes].
- The old experimental coding-agent demos linked by the launch post are
  pinned to `v1.0.0`; their later removal from coding-agent is not removal
  of the separately published Durable package. Read release-matched examples
  and APIs, not a launch demo's current-main path. [Launch][launch],
  [coding-agent removal][removed-demos].

No performance, model-accuracy, scaling or production reliability advantage
was established by this review. Upstream benchmark numbers describe their
specific tests, not Loom workloads or a measured comparison with our scaffold.

## Offline compatibility proof

Checked-in assertion script:
[probes/durable-1.3.0-api.mjs](probes/durable-1.3.0-api.mjs).

Run from the Loom repo root, with packages isolated outside it:

```bash
mkdir -p /tmp/opencode/loom-durable-api-check
npm install --prefix /tmp/opencode/loom-durable-api-check --ignore-scripts --no-audit --no-fund --save-exact @earendil-works/pi-durable@1.3.0
cp research/pi/probes/durable-1.3.0-api.mjs /tmp/opencode/loom-durable-api-check/
node /tmp/opencode/loom-durable-api-check/durable-1.3.0-api.mjs
bun /tmp/opencode/loom-durable-api-check/durable-1.3.0-api.mjs
```

Observed on Node `26.7.0` and Bun `1.4.3`: **three PASS groups per runtime**,
including three consecutive repeat runs on each runtime,
for memory, SQLite and JSONL. Each asserts offline faux-model generation,
built-in file tools in a temporary directory, a nested tool's structured
result, document state and a completed custom task; SQLite/JSONL also assert
state survives **clean close/reopen**. The first JSONL attempt omitted its
required `Context` argument; correcting the probe made both runtimes pass.
That setup error was not a Durable defect.

The shipped `openNodeSqliteStorage` uses `node:sqlite`; that entry point
worked under the tested Bun version too, so a custom `bun:sqlite` adapter
was **not needed for this smoke test**. This is not a promise of full Bun
compatibility: storage/env conformance, subprocess behavior, crash/power-loss
and other Bun/Node versions still need testing. No main-only code was run.
No real network/model calls occur: the fixture installs only a faux provider
and fails unexpected global fetch. It is not a crash-recovery certification.

## Recommended adoption path

1. **Keep the accepted security architecture and Loom core.** Do not share
   the protected ledger/credentials with Durable or let runtime task state
   authorize an effect. `requestId` admission dedup is not external-effect
   exactly-once. The companion note details those distinctions.
2. **Before freezing T-08, compare one isolated Durable runner with the
   coding-agent SDK plan.** Use the same role/task/result contract and I2P
   verification cases. Choose one runtime path; do not maintain both merely
   for optionality. The published-release smoke proof above establishes
   technical feasibility, not a product-quality or maintenance-cost win.
3. **Promote only after conformance:** restart mid-model/mid-tool; safe vs
   unsafe replay; nested-call key stability; background-task kill; stale
   epoch and duplicate privileged request; failed redaction/verification;
   exact-hash evidence; real sandbox/process and provider/MCP integration;
   upgrade/missing-definition/backup/rollback drills. Apply live external
   policy on every resumed effect; a memoized approval is not renewed authority.
4. **Make adoption a separate reviewed change.** Select exact versions and
   a lockfile, commit the appropriate recovery/boundary fixtures, revise the
   adapter plan and state ownership explicitly, and document storage upgrade
   limits. Until then the SPEC's `pi-durable` deferral remains in force.

[launch]: https://earendil.com/posts/pi-durable/
[npm]: https://registry.npmjs.org/@earendil-works/pi-durable/1.3.0
[manifest]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/package.json
[api]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/index.ts#L1-L205
[readme]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/README.md
[task-example]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/test/examples/12-tasks.ts#L10-L64
[nested]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/README.md#calling-tools-from-tools
[codemode]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/README.md#code-mode
[configuration]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/README.md#per-conversation-agent
[env]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/env/index.ts#L208-L277
[sandbox-example]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/test/examples/29-sandbox-per-conversation.ts#L1-L3
[sqlite-api]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/storage/sqlite/database.ts#L18-L38
[tools]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/tools/index.ts#L27-L39
[changes]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/CHANGELOG.md
[current-readme]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/README.md
[current-changes]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/CHANGELOG.md#L3-L40
[removed-demos]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/coding-agent/CHANGELOG.md#L107-L110
[tool-phases]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/tool.ts#L129-L192
[admission]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/src/harness/submissions.ts#L201-L217
[storage-contract]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/README.md#L757-L785
