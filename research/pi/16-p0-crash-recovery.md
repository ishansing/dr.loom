# P0 — Process crash, ownership and rollback evidence

Executed **2026-10-22**, following first comparison commit `af998f2`.
This increment advances [A02/A03/A05/A08/A09](../phase-0/05-p0-support-profile.md#named-acceptance-matrix)
with trusted synthetic experiments. It does not close G0, select a runtime or
certify a production sandbox. No paid calls, host configuration, Loom dependency
change, supervisor crash or host/power-loss test occurred.

## Findings

1. **Both runtimes can preserve the tested conversation state across real runner
   SIGKILL.** Durable resumes saved tasks; the SDK needs explicitly supervised
   new prompts for retry. These are different APIs, not identical native replay.
2. **Durable recovery bypasses the new denying `beforeTool` hook and stricter
   schema after SIGKILL**, reproducing the earlier cooperative-close/source
   finding. The external gate denies the revoked operation despite the replay.
3. **Neither native store open fences another process.** Deliberately opening
   the same idle synthetic store from a second domain succeeds. An external
   file-lock fixture rejects a contender before launch and releases ownership
   only after namespace exit; this is not implemented Loom leadership/fencing.
4. **Durable `1.4.0` upgrades the copied SQLite store; `1.3.0` rejects it.**
   Restoring a separate pre-upgrade backup works on `1.3.0`; replacing code
   alone is not database rollback.
5. **Outer-process death is insufficient startup cleanup evidence.** The
   research launcher now captures PID-namespace init identity before COMMAND
   starts and confirms its exit before workspace reuse.

## Shared scenarios and observed results

Each scenario runs in a fresh synthetic workspace. The fixed approved intent is
`{actionId: "fixture-action", value: 7}`. The target, scripted policy and immutable
intent binding remain outside the runtime's mounts. There are five scenarios ×
two runtimes × two engines = **20 successful crash/recovery assertions**.

| Scenario | External kill point | Required and observed outcome on Node and Bun |
| --- | --- | --- |
| `before-effect` | Tool entered after persisted intent; no target dispatch yet | Revoke policy before recovery; next external request denied, zero mutations. Durable saved args lack the newly required schema field and its recovery hook does not run. |
| `uncertain-safe` | Target mutated, no reply sent to the waiting tool | Stable intent reaches an idempotent synthetic target again, returns deduplicated; exactly one observed target mutation. |
| `uncertain-unsafe` | Same lost-result window, without replay-safe policy | No second effect request; parent retains unresolved status until target inspection. Durable records interrupted/possibly-partial tool output; SDK explicitly makes no retry and asks only for status. |
| `payload-change` | After first target mutation, before runtime result | New tool implementation changes final value to 9; external immutable-intent check rejects it as payload mismatch. Target remains 7, one mutation. |
| `committed` | Tool result and terminal conversation/submission committed; process parked without closing | Same committed tool outcomes survive reopen; no second dispatch or model/tool generation required. |

The controller waits for a native namespace-exit signal before starting recovery
on that workspace. Both initial and resumed runtime run inside the same
experimental boundary, in distinct domains. No cooperative abort/close occurs
at the crash checkpoint; normal close happens only after recovery inspection.

### Important differences, not hidden behind a common result

- SDK JSONL preserves committed messages. For replay-safe cases this fixture
  opens the saved session and issues a **new, parent-controlled prompt** with
  the same fixed intent. It neither implements a real SDK recovery scheduler
  nor gives an agent permission to decide whether an uncertain effect is safe.
- Durable reacquires the committed submission by ID and waits, activating its
  saved-task recovery. With `replay: "safe"`, it re-enters tool execution directly.
  With `unsafe`, it emits an interrupted diagnostic without another target call.
- Only Durable has the tested `beforeTool`/saved-checkpoint contract. The SDK
  cases do not claim to exercise an equivalent recovery hook.
- The target is local and the controller stays alive. Its mutation count and
  unresolved state are synthetic, not a crash-safe outbox or production effect
  ledger. Reconciliation reads the independently held target after runner exit;
  no real remote RPC, timeout ambiguity, supervisor crash or global exactly-once
  guarantee is established.
- `done` and model prose still do not certify Loom task completion. This fixture
  does not implement grants, epochs, kill, budgets or completion authority.

## Startup/domain cleanup: reproduced red → green

Initial reproduction: launch the installed bubblewrap `0.13.1` with
`--unshare-all --die-with-parent`, read `--info-fd`, capture its namespace-init
pidfd, kill only the outer `Popen`, and wait five seconds. **Before a runtime
ready signal, the init pidfd did not become readable.** After a runtime ready
signal, the corresponding probe did observe exit. The earlier post-startup
detached-writer observation therefore missed the startup window. The recorded
synthetic leftover namespace was identified and stopped through a pidfd; no
unrelated processes were signaled.

The updated shared research launcher uses installed `bwrap --help` contracts:

```text
spawn with --info-fd + --block-fd
  → parent captures host identity of namespace PID 1 via pidfd_open
  → parent validates NSpid and releases the native startup barrier
  → reviewed COMMAND may run
stop / error / external crash checkpoint
  → SIGKILL namespace init via pidfd_send_signal
  → poll pidfd until terminal; wait outer process
  → only then permit workspace reuse / lock release
```

Self-checks now cover immediate post-handshake stop as well as a running detached
writer. They also retain protected-path/symlink denial, read-only mounts,
environment clearing and host-loopback denial. Native status info and barrier
descriptors are launcher setup channels, not runner authority pipes. Identity
polling avoids PID-reuse guesses; failure blocks the affected launch/reuse.

This fixes the research driver's cleanup assumption, not a claim of a new
bubblewrap bug or production containment. Deduplication of upstream bubblewrap
issues was not performed; no report was published. Host failure, nested namespace
attacks, quotas, seccomp, provider mediation and the final supported backend
remain unqualified.

## Storage ownership and copy-only upgrade

- Four ownership cases pass (SDK/Durable × Node/Bun). Each holds an external
  `fcntl.flock` on a protected path; a distinct Python process gets contention
  before any guarded second runtime launches. After confirmed domain exit the
  next owner can acquire it.
- In a separate deliberate counterexample within each case, bypassing that
  fixture guard permits a second native open over the idle synthetic store.
  This proves an external owner is necessary, not that concurrent use is safe.
  No concurrent effect workload or supported multi-writer semantics are claimed.
- Two upgrade/restore cases pass (Node and Bun). After completed recovery and
  full domain exit, Python's SQLite backup API copies the quiesced `1.3.0`
  store. A separate clone is opened by `1.4.0`, then rejected by `1.3.0`.
- Every row in all eight non-migration tables is compared: metadata/counters,
  global record IDs, conversations, entries, tasks, submissions, documents and
  document revisions. SQLite integrity checks pass before/after. Rejection by
  the old version leaves the tested records intact.
- A separate backup copy reopens under `1.3.0` with the same logical rows.
  The original store's SHA-256 and rows stay unchanged. No in-place downgrade,
  production backup policy or `1.4.0` runtime adoption is implied.

Installed `1.4.0` source `dist/storage/sqlite/migrations.js` lines 84–119 matches
the [release-addressed source](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/storage/sqlite/migrations.ts):
schema 2 rebuilds tasks to admit `sleeping`. See also the
[prior revision review](15-p0-release-revalidation.md). This increment tests
the storage upgrade only, not full `1.4.0` tool/skill/API conformance.

## Reproduction and artifacts

Checked-in [controller](probes/p0-recovery.py), [runtime fixture](probes/p0-runtime-recovery.mjs)
and [shared launcher](probes/p0-sandbox.py) use explicit assertions. Python
optimization is refused so those checks cannot silently disappear. The launcher
requires Linux pidfds and the tested bubblewrap setup; there is no host fallback.

Reuse the [external `1.3.0` installation procedure](14-p0-runtime-comparison.md#reproduction-and-dependency-evidence).
Create a separate external npm project at `/tmp/opencode/loom-p0-durable-140`
with only exact `@earendil-works/pi-durable: "1.4.0"`; use distinct empty npm
configs, a cleared installation environment and `--ignore-scripts --no-audit
--no-fund` as before. Network downloads occur outside the runner, not provider calls.
Direct `1.4.0` tarball SHA-512 matched registry metadata and its external lock:

```text
sha512-EtIyXH1MBSXdJSkodmy+CYXuwfve3gPrD4GNCZ0XmuRWLPupwRlNQ7fdaXjRcLoKb6SWkT/yEzK+sMmrqvYK+Q==
```

The separate install added 91 packages, again warning about deprecated
`node-domexception@1.0.0`. External lock SHA-256:
`67b125b67e443f938bda545d647a3a4c6775c1dc0bfd327193d62aeb8c7bf9fb`.
Transitive lockfiles remain external; fresh installs must revalidate/audit them.

```bash
python3 research/pi/probes/p0-sandbox.py --self-test
python3 research/pi/probes/p0-recovery.py \
  --experiment /tmp/opencode/loom-p0-comparison \
  --upgrade-experiment /tmp/opencode/loom-p0-durable-140
```

Optional `--engine node|bun` and `--runtime sdk|durable` narrow a diagnostic run.
Synthetic workspace/target artifacts are retained under `/tmp/opencode` for
inspection, not committed. The controller withholds raw runtime stderr.

Fixture failures corrected before the full rerun: Durable requires
`hooks: [hook(ToolTask, handlers)]`, not a bare handler object; recovered Durable
work needs only the next model answer, unlike the SDK's explicitly regenerated
tool call. Assertions caught missing/extra execution before either was counted
as evidence. These were probe errors, not new upstream bugs.

## Verification (2026-10-22)

Ordered configured lint (12 files), strict TypeScript baseline, Node syntax and
Python in-memory compilation checks pass. Existing tests remain 3 pass/0 fail,
100% functions / 90.99% instrumented framework/store lines, unchanged. Four
ordinary Node/Bun × SDK/Durable regressions pass with the revised launcher;
20 crash cases, four ownership cases and two migration/restore cases pass.
The boundary self-test passes, including immediate startup stop and detached
writer cleanup. Optimized Python execution is rejected rather than disabling
mandatory assertions. No research assertions are counted as application coverage.

Read-only audits exit 0 with zero advisories: 14 Loom packages, the unchanged
121-package `1.3.0` experiment tree and the separate 91-package `1.4.0` tree.
External lock hashes match the recorded baselines. No auto-fix or live provider
request ran. Automated secret scanning remains unavailable; manual/syntax/audit
checks are not substitutes or production security certification. Full source,
transitive-license and provenance/signature review were not performed.

## Decision and remaining gate

No tested hard failure eliminates either runtime under Loom-owned enforcement.
Durable supplies more native resumable execution; SDK retry/reconciliation must
be owned externally. That is a concrete API/ownership tradeoff, not a measured
adapter-effort or performance result. Active hours were not reliably measured;
the five-development-day comparison is not declared complete by this increment.

**Next owner: developer.** Finish a minimal pinned-I2P skill/contract compatibility
comparison, review the intended shipped revision (including `1.4.0` API deltas)
and present one runtime/revision recommendation with the adapter manifest.
**Owner approval** still closes support/deployment/provider/data/failure
assumptions and independent-review booking before G0/P1. No production sandbox,
runtime promotion, automatic phase advancement or new publication is authorized.
