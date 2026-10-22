# P0 — Pi release and contract revalidation

Inspected **2026-10-22** using read-only official registry/GitHub requests and
release-addressed published declarations/JS. Supplements [10](10-pi-1.3.0-api-review.md),
[11](11-pi-1.3.0-execution-coverage.md), [12](12-pi-durable-adoption.md) and
[13](13-pi-durable-recovery-boundaries.md); their historical test results are not
fresh execution evidence. No installation, runtime execution, upgrade or adoption
was performed by this investigation.

## Revision and publication evidence

| Candidate / observation | Evidence and consequence |
| --- | --- |
| Comparison baseline: both packages `1.3.0` | Official tag API resolves `v1.3.0` directly to commit `71023aec1546d6d677a65669c5665c0927ce0dd0` ([tag][tag13]). Keep this release for the shared comparison; this is not a Loom dependency promotion. |
| SDK publication | Registry records `@earendil-works/pi-coding-agent@1.3.0` at `2026-10-15T19:13:30.662Z`, Node `>=22.19.0`, exact `1.3.0` internal Pi dependencies ([registry][sdk-registry]). |
| Durable publication | Registry records `@earendil-works/pi-durable@1.3.0` at `2026-10-15T19:13:35.556Z`, Node `>=22.19.0`, exact Chord/ai/codemode `1.3.0`, no coding-agent dependency ([registry][durable-registry]). Separate harnesses, not stacked agent loops. |
| Published `latest`, now | **Both are `1.4.0`**, not the `1.3.0` observed on October 20. SDK published `2026-10-21T22:48:58.431Z`; Durable `2026-10-21T22:44:09.320Z` ([registries][sdk-registry], [Durable][durable-registry]). Tag `v1.4.0` resolves to `4a080252f06caf63a525d7873c5d94d3c23887e0` ([tag][tag14]). |
| Current main, separately | GitHub returned `7c22a93d0ed02092142fa63823e63d76aa4e2406`, committer date `2026-10-22T07:02:01Z` ([API][main-api]). This is not either release and supersedes the older `fdce48e…` main snapshot only as a research observation. |

Registry `dist.integrity` for `1.3.0` still matches the earlier research:

- SDK: `sha512-V/WoCjA2hQSe3QLWIUB24cTRdtEdeLiIzkDqU5RMXV6VWuD+KGZnzVBMhglwdnQTySkehZsjt8a3g6Jd2g4nnw==`.
- Durable: `sha512-2aD0xead1LH0BBwUBxex28in/PpUJEwyaEiW/nLoTFUcZ/lDYEl6LHX6mGZKJG8tUHzERwJyysDgy0ruidt84w==`.

This rechecked metadata, **not tarball bytes, signatures or provenance**. The
queried version records did not supply `gitHead`; source-tag identity comes from
GitHub, not an inferred registry commit field. Published declaration/JS reads
below corroborate specific contracts, not whole-artifact equivalence.

## Contracts for the shared synthetic fixture (`1.3.0`)

| Surface | Verified contract / fixture implication |
| --- | --- |
| SDK custom tool | `execute(toolCallId, params, signal, onUpdate, ctx)` returns `AgentToolResult`: required `content` array and `details`; optional `structuredContent`, `isError`, `usage`, `terminate`. Use `outputSchema` for structured results. `content` is model-facing; `structuredContent` is program-facing. Do not return Durable's `output` field ([shipped definition][sdk-definition], [shipped result][sdk-result]). |
| SDK persisted session | `SessionManager.create(cwd, sessionDir)` and `SessionManager.open(path, sessionDir?, cwdOverride?)`; session format version 3. Supply an explicit synthetic directory and pass the manager to `createAgentSession`. Initial persistence waits for conversation content; do not assume allocating a manager created a file. After a completed exchange, obtain the session file and reopen it, then assert transcript/tool-result identity rather than merely successful construction ([release manager][sdk-manager], [SDK][sdk]). |
| Durable tool | `execute(args, api, context)` returns `ToolExecutionResult`: `output` array for the model, `structuredOutput` for programs, `details` for UI. A successful tool declaring `structuredOutputSchema` must provide matching `structuredOutput`; without that schema it must not supply structured output. Nested callers read `structuredOutput`, not model-facing `output` ([release types][durable-types], [shipped declarations][durable-shipped-types]). |
| Durable reopen | `openNodeSqliteStorage(path, options?)` returns storage; `Harness.open(storage, options, context)` requires a registry containing built-in tasks (`createRegistry()`). Persist the conversation ID, await close, reopen fresh storage at the same path and retrieve `harness.conversation(id, context)`; use `resume()` when exercising pending work. This is not the SDK's JSONL/session API ([storage][durable-storage], [Harness][durable-harness]). |
| Storage limit | Release SQLite adapter uses `node:sqlite`, WAL and `synchronous=NORMAL`; clean close checkpoints then closes. Reopening a completed synthetic conversation establishes persistence only, not hard-crash, power-loss, competing-writer or exactly-once-effect safety ([storage implementation][durable-storage]). |
| Recovery bypass | Ordinary Durable `call` prepares/validates, invokes `beforeTool`, validates again, then commits final arguments/replay policy. Recovery from saved `execute` resolves the current tool and reruns saved arguments only if **both** stored/current policies are `safe`, directly calling `run` without preparation, schema validation or `beforeTool`. Otherwise it records interrupted/possibly partial execution. Default replay is unsafe ([release source][durable-tool], [shipped JS][durable-shipped-tool]). |

**Security consequence:** a normal denied-then-resubmitted effect is not a test
of recovery authorization. Keep dispatch-time final validation and live policy
checks inside the owned operation; label any clean-reopen fixture accurately.
The same direct recovery branch remains in the inspected [main snapshot][main-tool];
there is no evidence here of an upstream fix for that bypass.

## Volatility and relevant release changes

- Durable remains explicitly experimental in the [release README][durable-readme].
  Its `1.2.0` changelog changed tool `content` to `output`, tagged tool task
  unions and storage failure semantics; do not translate SDK fixtures by name
  alone ([release changelog][durable-changes13]).
- What notes 12/13 called unreleased is now **shipped in `1.4.0`**: durable
  sleeps, task `sleeping`, crash-loop parking, explicit document `checkpointWhen`,
  richer reporting/telemetry and dynamic models/settings. SQLite automatically
  migrates to schema 2, which `1.3.0` cannot reopen; older JSONL readers cannot
  resume sleeping tasks. This is a migration/rollback decision, not a harmless
  comparison dependency refresh ([1.4.0 changelog][durable-changes14]).
- SDK `1.3.0` restored active tools on resume; `1.4.0` further fixes newly
  registered extension tools remaining inactive on resume/tree navigation and
  recovery leaving tool results after omitting a truncated call. These fixes
  matter for eventual real-provider/resume conformance, but do not justify
  silently changing this comparison baseline ([1.3.0][sdk-changes13],
  [1.4.0][sdk-changes14], [PR #11233][pr11233]).

## Official issue/PR check and limitations

GitHub issue search (both open and closed, including PRs) returned relevant
existing reports, inspected on **2026-10-22**:

- [#11043](https://github.com/earendil-works/pi/issues/11043), open: requests
  `afterTool` for unknown/invalid/blocked calls that never execute; result
  filtering cannot assume this hook covers every model-visible diagnostic.
- [#11055](https://github.com/earendil-works/pi/issues/11055), open: reports
  throwing `beforeRequest` does not veto provider dispatch, explicitly discussing
  `1.3.0` and recovery attempts. A request hook alone is not a budget/kill fence.
- [PR #10703](https://github.com/earendil-works/pi/pull/10703), open: proposes
  abort-result annotation; describes existing execution-only `afterTool` and
  restart/abort gaps. A proposal is not a shipped contract or locally verified fix.
- [#9986](https://github.com/earendil-works/pi/issues/9986), open: unanswered
  tool calls after abort, reported against `0.87.1`; not independently reproduced
  against `1.3.0` here. [#11100](https://github.com/earendil-works/pi/issues/11100),
  closed: hook-event report against `1.1.0`; closure alone proves no fix/version.
- [PR #11233][pr11233], closed and listed in the `1.4.0` changelog: recovery
  omits matching results with a truncated call, a distinct issue from Durable's
  safe-replay authorization bypass.

Search used GitHub REST `/search/issues` with repository-qualified phrases
`durable recovery`, `beforeTool`, `afterTool`, `tool_result hook`, and
`durable reopen`; responses were HTTP 200. Only the first 12 relevance-ranked
results per query and selected issue/PR bodies were inspected, not every result,
comment, discussion or linked patch. Deduplication is therefore incomplete;
**no claim that the recovery bypass is new or unreported** is warranted.

Only this document was written. No package/runtime tests, crash drill, provider
calls, dependency audit or automated secret scan ran. Network inspection is not
promotion evidence; G0 and production gates remain open.

[sdk-registry]: https://registry.npmjs.org/@earendil-works/pi-coding-agent
[durable-registry]: https://registry.npmjs.org/@earendil-works/pi-durable
[tag13]: https://api.github.com/repos/earendil-works/pi/git/ref/tags/v1.3.0
[tag14]: https://api.github.com/repos/earendil-works/pi/git/ref/tags/v1.4.0
[main-api]: https://api.github.com/repos/earendil-works/pi/commits/main
[sdk-definition]: https://unpkg.com/@earendil-works/pi-coding-agent@1.3.0/dist/core/extensions/types.d.ts
[sdk-result]: https://unpkg.com/@earendil-works/pi-agent-core@1.3.0/dist/types.d.ts
[sdk-manager]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/coding-agent/src/core/session-manager.ts#L1172-L1185
[sdk]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/coding-agent/src/core/sdk.ts
[durable-types]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/types.ts#L150-L193
[durable-shipped-types]: https://unpkg.com/@earendil-works/pi-durable@1.3.0/dist/harness/types.d.ts
[durable-storage]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/storage/sqlite/node.ts#L165-L215
[durable-harness]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/harness.ts
[durable-tool]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/tool.ts#L129-L192
[durable-shipped-tool]: https://unpkg.com/@earendil-works/pi-durable@1.3.0/dist/harness/tool.js
[main-tool]: https://github.com/earendil-works/pi/blob/7c22a93d0ed02092142fa63823e63d76aa4e2406/packages/durable/src/harness/tool.ts
[durable-readme]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/README.md
[durable-changes13]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/CHANGELOG.md
[durable-changes14]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/CHANGELOG.md
[sdk-changes13]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/coding-agent/CHANGELOG.md
[sdk-changes14]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/CHANGELOG.md
[pr11233]: https://github.com/earendil-works/pi/pull/11233
