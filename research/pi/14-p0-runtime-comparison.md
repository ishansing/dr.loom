# P0 — Shared offline runtime comparison, first evidence

Executed **2026-10-22**, from kickoff `13613df`. This is one bounded experiment
increment, not completion of five development days or G0. No reliable active-hour
measurement was captured; do not derive effort/speed estimates from this run.
Scope: [P0 support profile](../phase-0/05-p0-support-profile.md).
Revision facts: [release revalidation](15-p0-release-revalidation.md).

## Result and decision ceiling

**Both published `1.3.0` runtimes pass the same trusted synthetic workload on
Node `26.7.0` and Bun `1.4.3`. Neither is selected yet.** Ordinary tool/owned-effect
integration is feasible in both. This workload does not discriminate their
hard-crash recovery, storage ownership or upgrade safety. Do those next before
recommending a runtime; do not extrapolate model quality, speed or production fit.

Official `latest` is now `1.4.0`. This increment deliberately reproduces the
researched baseline rather than silently upgrading. Durable `1.4.0`'s SQLite
migration needs a separate upgrade/rollback experiment if that revision is
considered. See [ADR-003](../../decisions.md#adr-003---2026-10-22-p0-runtime-comparison).

## Shared contract and fixture

```text
trusted Python experiment controller (outside runner)
  owns scripted grant, synthetic effect target, dedup state and verification
  ↕ bounded JSON-line request/result pipe (fixed fixture operations only)
bubblewrap domain: full Node/Bun process + Pi runtime + private journal
  faux provider → fixture tool → denied / applied / deduplicated
  fixture tool → bounded TS patch
  throwing controller output filter → safe-output-error only
  clean close/reopen → candidate-ready-not-verified
controller waits for process exit → independent Bun test + exact candidate hash
```

- Both paths receive identical prompt text, tool schema and scripted tool calls.
  No built-in shell/tools, ambient skills, extensions or MCP servers are loaded.
- The single TS file initially computes `a - b`; a trusted test expects
  `sum(2, 3) === 5`. Each run first asserts a genuine failing test, then the
  runtime writes `a + b`. The verifier test is outside the writable workspace
  and is mounted only for verification, after the runner has exited.
- The parent—not a runtime hook—denies the first effect, scripts a grant,
  applies the second request, then returns a deduplicated third result.
  The protected synthetic target is outside the runner's mounts.
- The filter exception contains a synthetic sentinel. The controller returns
  only `safe-output-error`; scanning runtime workspace/journal and stderr finds
  no sentinel. This is one controlled output path, **not** all streaming,
  structured, error and spill channels or real-secret scanner certification.
- Verification records the exact candidate hash, runs the trusted test and
  checks the hash again. Deliberately changing the candidate invalidates that
  evidence. No Loom completion state machine is implemented by this fixture.
- SDK uses an explicit custom-tool allowlist, JSONL session v3 and serialized
  transcript equality on reopen. Durable uses only its fixture registry and
  SQLite storage; the same conversation and assistant answer survive reopen.

This pipe is a fixture, not an approved supervisor protocol: operations/target
are fixed, policy is scripted, and it does not implement real grants, identity,
epoch fencing, audit, kill, concurrent dispatch or crash-safe deduplication.

## Isolation feasibility evidence

The self-check runs before every comparison; failure blocks launch. Bubblewrap
`0.13.1` unshares namespaces, drops capabilities, clears environment, uses a new
PID domain/session, and mounts only:

- `/usr` and the selected executable read-only; minimal `/proc` and `/dev`;
- external `node_modules` and the reviewed probe file read-only;
- one synthetic workspace writable, with private `/tmp` and no host home,
  Docker socket, Loom database or host credentials;
- the trusted test read-only only during separate verification.

Assertions passed for protected-file/symlink denial, read-only runtime/system
mounts, writable fixture access, planted synthetic environment-secret removal,
and inability to connect to a live host loopback listener. A detached child
writes heartbeat bytes; killing its outer sandbox stops observed writes before
the test destroys its throwaway workspace.

The finite post-kill observation is feasibility evidence, not a general cleanup
certificate. No seccomp profile, whole-domain CPU/memory/disk/PID quotas, hostile
kernel attack, provider proxy, host-loss cleanup or rootless OCI qualification
was tested. **Trusted synthetic execution only.** Docker's reported security
options do not include rootless; no daemon-backed execution, privileged mount,
host configuration change or fallback to unsandboxed execution was used.

## Fresh results and acceptance coverage

| Execution | Ordinary workload / clean reopen | Protected effects | Trusted verification |
| --- | --- | --- | --- |
| Node / coding-agent SDK | PASS | denied → applied → deduplicated; one mutation | red → green; stale candidate hash rejected |
| Node / Durable | PASS | same | same |
| Bun / coding-agent SDK | PASS | same | same |
| Bun / Durable | PASS | same | same |

All four produced candidate SHA-256:
`a686943887ba51feaeb1304f8f6411d7ef6b70712f84dfa8acc8828999231786`.

| Acceptance cases | Evidence level / remaining work |
| --- | --- |
| A01 | Shared bounded patch demonstrated; no real-model or real-repo quality claim. |
| A03 | Ordinary denial/resubmission demonstrated; **not saved-task recovery authorization** or changed-payload/epoch tests. |
| A06/A07 | One owned output-failure seam and external hash/test proof; full output inventory/completion enforcement remain open. |
| A09 | Synthetic namespace/mount/cleanup feasibility; production backend not selected. |
| A02/A05/A08 | Clean reopen only; hard-kill checkpoints, unknown-effect reconciliation, competing owners and version upgrade/rollback **not tested**. |
| A04/A10–A12 | No new evidence for Loom kill/fencing, framework mismatch, operator UX or unsupported-workload handling. |

## Reproduction and dependency evidence

Checked-in assertions:
[controller/self-test](probes/p0-sandbox.py), [shared runtime probe](probes/p0-runtime-comparison.mjs).
Only Python's standard library is used by the controller. Node, Bun and
bubblewrap must be installed and resolvable on PATH. Preserve `/tmp/opencode`
experiment state when investigating failures; this is not a Loom package script.

Create an **external** npm project with `type: module`, empty separate user and
global npm config files, and exact direct dependencies:

```json
{
  "private": true,
  "type": "module",
  "dependencies": {
    "@earendil-works/pi-coding-agent": "1.3.0",
    "@earendil-works/pi-durable": "1.3.0"
  }
}
```

Install with lifecycle scripts disabled and no inherited credentials/config:

```bash
EXPERIMENT=/tmp/opencode/loom-p0-comparison
env -i PATH="$PATH" HOME="$EXPERIMENT" npm_config_cache="$EXPERIMENT/cache" \
  npm install --prefix "$EXPERIMENT" --ignore-scripts --no-fund --no-audit \
  --userconfig="$EXPERIMENT/user.npmrc" --globalconfig="$EXPERIMENT/global.npmrc"
python3 research/pi/probes/p0-sandbox.py --self-test
python3 research/pi/probes/p0-sandbox.py --experiment "$EXPERIMENT" --engine node --runtime sdk
python3 research/pi/probes/p0-sandbox.py --experiment "$EXPERIMENT" --engine node --runtime durable
python3 research/pi/probes/p0-sandbox.py --experiment "$EXPERIMENT" --engine bun --runtime sdk
python3 research/pi/probes/p0-sandbox.py --experiment "$EXPERIMENT" --engine bun --runtime durable
```

Network is used for package/source retrieval outside the runner, never provider
calls. Do not execute new dependencies before source/integrity review. This run
downloaded both direct tarballs, calculated SHA-512 over their bytes, and matched
official registry `dist.integrity` plus npm's lock entries. Values match the
[revalidation note](15-p0-release-revalidation.md#revision-and-publication-evidence).
This checks integrity, not provenance/signatures or all transitive source code.

External installation added 121 packages; npm reported deprecated
`node-domexception@1.0.0` (not an advisory). Its local lock SHA-256 is
`ba149881d1446ef118b21e4ecf863c19ad1ec4b7ba1f3d6c9bc30ada6ec32d11`.
The external lock/tree is not committed; future fresh installs may resolve
different transitive ranges and must repeat validation/audit. Loom's manifest
and lockfile are unchanged. No latest/auto-fix invocation was used.

### Reproduced setup failures

- npm rejected using `/dev/null` for **both** `--userconfig` and `--globalconfig`
  with `double-loading config`. Distinct empty files fixed installation without
  reading host auth/config.
- The SDK fixture initially used `tools: []`; its explicit allowlist therefore
  exposed no custom tool. The assertion expected `["fixture"]` and failed before
  execution. Installed `dist/core/sdk.js` lines 145–160 confirmed the behavior;
  specifying `tools: ["fixture"]` fixed the owned probe, not upstream code.
- Direct in-memory/deep transcript comparison failed on `usage: undefined`
  omitted from JSONL. Comparing the serialized representation retains every
  persisted field without mistaking normal JSON serialization for lost data.

The four full command paths were rerun successfully after these fixture fixes.
Raw runtime stderr is withheld by default; diagnostic runs used synthetic inputs
and scoped output only. These are not new upstream bug reports.

## Gates and next bounded experiment

Fresh ordered lint/typecheck/baseline tests passed: 3 tests, 100% functions and
90.99% instrumented framework/store lines, unchanged. The separate probe asserts
do not inflate application coverage. `bun audit` found no advisories across 14
Loom packages; read-only external `npm audit --json` exited 0 with zero advisories
for its 121-package tree. Trusted secret scanner remains unavailable. No broad
security, transitive-license or production certification follows.

**Next:** add explicit hard-kill checkpoints around tool/effect/result commits;
exercise changed live policy on saved-task recovery, unknown non-idempotent
outcomes, exclusive storage ownership and backup/upgrade/rollback. Record a
runtime recommendation only after those cases, skill integration and the chosen
revision are reviewed. G0 also still needs concrete provider/deployment/failure
assumptions and independent review. No P1, runtime promotion, commit or push.
