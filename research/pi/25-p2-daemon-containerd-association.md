# P2 — Daemon/containerd association preflight

Checked **2026-10-30** after explicit owner selection of **Check containerd**.
**Outcome: blocked at the approved64-thread bound.** The collector did not read
any thread's child-ID list, select a runtime candidate or open a containerd pidfd.
Daemon→containerd association remains unproved. No bound was raised or retry run.

## Approved scope

Reanchor the selected rootless Unix socket peer; inspect only daemon thread/
direct-child identity metadata, maximum64 daemon task directories and16 child IDs.
Only a same-owner, parent-rechecked containerd-role candidate with verified archive
size/SHA may receive a retained runtime identity handle. Comm is a filter, not
authority. Skip other children; no arguments, environment, memory, worker handles,
shim/runc inspection, signals/configuration or container lifecycle.

Expected dockerd/containerd bytes come from the owner-approved
[archive/member verification](24-p2-static-bundle-member-verification.md):

- dockerd:102,937,400 bytes,
  `3a6132d4d99c1437e3422599f802207a3def9ba4de00ec1004a8e40d2740b9b0`.
- containerd:39,473,314 bytes,
  `5e970f05f9feef7b89e6f38965ea1e91224644864e60bd6f5f3242d84e094228`.

These are expected values. No containerd executable was measured in this run.
Earlier artifact/process records in [research22](22-p2-selected-runtime-artifacts.md)
are historical, not a substitute for this missing process association.

## Guard and parser proof

Private stdlib collector reuses reviewed bounded proc-stat/pidfd/hash readers.
Initial inert identity parser fails the intended known comm/PPID/starttime
assertion (exit1, no runtime access). Implementation then passes isolated compile
and assert-based groups for credentials/proc-stat/pidfd/hash bounds, tricky comm
parentheses, strict ASCII PID lists, malformed/duplicate/oversize child IDs,
owner/parent/containerd-role filtering and bounded task/child/symlink/deadline cases.
Secret preflight passes before live collection.

The task enumerator first collects bounded daemon thread IDs. It rejects the next
directory entry once64 have been admitted, **before opening any individual thread directory
or children file**. Only after complete bounded enumeration would it read child
IDs. Synthetic overflow tests confirm this fail-closed branch. No partial list is
used to infer absence of children or choose a candidate.

## Actual command and result

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

Exactly one zero-HTTP socket connection. Control flow reached task enumeration
after endpoint ownership/type, controller self-proc PID agreement, daemon
credentials/proc/pidfd/PID-view checks and the expected dockerd executable size/
hash precondition. Those preliminary checks are not a completed association or
independently emitted final daemon revalidation; the blocked path never reached
the planned final recheck stage. Raw PIDs, comm values, paths and namespace IDs
are not persisted in the result or this report.

No exact daemon thread count is recorded: enumeration stopped on encountering
another entry after64 validated task entries. No thread children files, child
proc directories, containerd executable/pidfd/namespaces or workload objects were
opened. Collector-owned daemon/self handles are closed on exit; no process signal
or runtime mutation is sent.

## Disposition and next decision

The required diagnostic check **failed its bound**, not passed or waived. This
does not show an external containerd, missing runtime, malicious process count,
source incompatibility or permission defect. The process association remains
unknown; full client selection, PID/proc/pidfd atomicity and worker admission were
already outside the proof this diagnostic could supply.

Next owner decision: explicitly approve one further read-only attempt with a
larger finite daemon-task bound (for example256), retaining16 child IDs and all
other exclusions, or pause inspection. Do not silently raise a limit, inspect
unbounded proc state, recursively walk descendants or use raw arguments/environment
as a workaround. Any shim/runc/worker or lifecycle work remains separately gated.
Native observer stays disabled; no quiescence, reuse/reset, task completion or G2
authority. Preserve unresolved inventory/actions/fences.

Private0700 evidence key `daemon-containerd-association-ncyh2vum` retains source,
input snapshot, intended red, self-tests, exact commands/exits and result hashes
as0600 files. Original archive evidence is unchanged; no new download or Go/tool
telemetry execution. Application/native/coverage/drill/audit gates are N/A for
this private read-only collector/document slice. Final scoped checks pass: four
document/12 private-text secret scans,39 local links/anchors, governance/protected
sources/review hash, red/source/result/input identities, private modes and whitespace.
The live exit2 remains blocked, not converted into a pass. Full task diff reviewed.
