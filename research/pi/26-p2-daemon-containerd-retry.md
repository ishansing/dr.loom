# P2 — Approved256-thread association retry

Checked **2026-10-30** after owner “commit and continue(Approved)”.
**Result: blocked again at the daemon-thread bound, now256.** No thread children
files, child proc directories or containerd runtime candidate handles were opened.
The single approved retry is consumed; no further retry or limit change ran.

## Authorization and unchanged boundaries

The [original64-bound refusal](25-p2-daemon-containerd-association.md) was committed
as `5cce786`, not discarded or converted into a pass. Owner explicitly approved
one additional read-only attempt with256 daemon task entries, keeping16 unique
direct-child IDs and all identity/owner/parent/byte/namespace/liveness guards.

No recursive/system-wide process walk, arguments/environment/memory/config reads,
worker handles, shim/runc inspection, signals, runtime changes or lifecycle. One
zero-HTTP connection to the same selected endpoint only. Archive-member inputs
remain the [previous verified snapshot](24-p2-static-bundle-member-verification.md);
no downloads, archive payload rereads, Go or telemetry execution.

## Minimal source delta and tests

New private0700 evidence key `daemon-containerd-retry-sim5tg2d` copies the original
collector, pure helpers and verified-member input; original evidence is untouched.
The new65-thread synthetic acceptance first fails against the copied64 guard
(intended red, exit1). Changing the one guard to256 makes it green. Self-tests
also require exact256 acceptance and257 refusal with the16-child guard unchanged.

AST comparison, excluding self-test changes, confirms exactly one non-test
change: the task-count constant64→256. Same20-second internal/35-second outer
timeout, UID/role/parent/hash/pidfd/ns checks, no-HTTP behavior and fixed errors.
Helpers and verified member input are byte-identical to the original. Isolated
compile, all prior peer/proc/pidfd/hash/ID/ownership/boundary self-check groups
and scoped source/input secret preflight pass before the live attempt.

## Actual outcome

`python3 -I -B <evidence>/check.py` exits **2**:

```json
{
  "result": "blocked",
  "stage": "bounded-daemon-children",
  "reason": "daemon-thread-bound",
  "httpRequests": 0,
  "workerShimRuncInspection": false,
  "nativeObserverOrLifecycle": false,
  "atomicHandlerOrProcPidfdBindingProven": false,
  "containerdClientSelectionProven": false,
  "activeFullRuntimeChainProven": false
}
```

The guard encountered another task-directory entry after256 validated entries,
before opening any individual task directory/children file. No exact total thread
count or child-ID list was collected. Preliminary daemon preconditions precede
this stage in the retained source, but the final revalidation/association stage
was not reached; do not report a complete daemon/runtime identity proof.

Collector-owned self/daemon handles close on exit. No candidate executable,
containerd pidfd or namespace was inspected, and no process was signaled.
The result establishes a bounded-discovery blocker, not an external/missing
containerd, source mismatch, malicious thread count or new upstream bug.

## Disposition

Both required live checks remain **failed/blocked** under their separately
approved bounds. The larger-bound test success does not waive the live failure.
No partial list, guessed PID, unbounded scan, command/environment read or recursive
walk is used as a workaround. Names and numeric PIDs would remain filters, never
authority, even if discovery later succeeds.

Pause inspection. The next owner decision must explicitly choose another bounded
discovery plan or approve further limited observation; no additional attempt is
authorized here. A trusted runtime locator, if supplied later, would still require
owner/parent/starttime/executable/ns/liveness checks and would not by itself prove
client selection, atomic proc/pidfd association or the full runtime chain.

Native observer stays disabled. Worker identity, original cgroup/final OCI/
delegation, procfs/mount joins and retained-handle qualification remain open.
No quiescence, task completion, reset/reuse or G2 authority; preserve unresolved
inventory/actions/fences. No installation/provider/SDK, containers/mounts, push or
publication. New notes/report remain uncommitted.

Private source/red/self-test/command/result/input hashes and logs are retained as
0600 files. Application/native/coverage/drill/audit reruns are N/A for this private
diagnostic/document-only slice. Final scoped checks pass: four document/12 private-
text secret scans,40 local links/anchors, governance/protected sources/review hash,
red/source/result/input identities, original64 evidence, limit-only non-test AST
delta, private modes and whitespace. Live exit2 remains blocked; full diff reviewed.
