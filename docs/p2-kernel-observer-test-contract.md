# P2 — Proposed worker-handle observation test contract

Status: **synthetic-only core locally verified; no native handler, physical
qualification or G2 approval**. Contract committed as `75347b1`; owner subsequently
requested “commit and continue” for its synthetic first slice.
Based on [acquisition evidence](../research/pi/18-p2-kernel-observer-readiness.md)
and [ADR-028](../decisions.md#adr-028---2026-10-27-test-only-kernel-observer-acquisition).
The latest lifecycle proved candidate namespace access, not complete worker
identity, worker pidfd access or cgroup lifetime. Both prior lifecycle allowances
are consumed. This document authorizes no additional dispatch.

## 1. Objective and responsible files

Observe one independently selected, inventory-bound synthetic worker's thread
group and exact cgroup subtree through retained kernel handles. Report only those
observations; never record quiescence, complete an action, release a fence or stop
anything. Keep production modules, SQLite schema, dependencies, public exports,
profile1 and CLI unchanged.

Proposed implementation: `research/pi/probes/p2-observer.py`, installed Python
stdlib only, with deterministic `--self-test` cases in that same module. A private
host harness reuses existing prepare/launch/cleanup functions as in the acquisition
experiment; no worker/observer mount or generic execution interface is introduced.
The module implements identity-frame parsing, synthetic kernel-snapshot consistency,
independent observation classification and a separately tested control-pipe reader.
`IdentityFrames.read_from(fd, deadline)` borrows a stable nonblocking FIFO descriptor;
its caller keeps it open/unchanged for the call. It never opens, duplicates, closes
or changes the descriptor's flags. Blocking/invalid/nonpipe input is refused.
Default/non-self-test invocations still return blocked/native-not-implemented
without reading stdin or opening handles. Native acquisition, worker FD ownership,
cgroup/pidfd polling and complete observer orchestration remain unimplemented.

## 2. Admission prerequisites — unresolved until evidenced

The trusted host controller, not worker output, selects an unresolved durable
domain/full native ID and performs fresh backend/image checks. Use existing
`assertDomainContainer` for complete native config/ownership validation, including
restart disabled, private namespaces and auto-removal disabled. Repeat after
handle acquisition. Do not replace it with partial hand-written checks.
Existing backend preflight requires systemd/cgroup-v2; profile1 sets `Init:false`
and private cgroup/PID namespaces but does not set `CgroupParent`. Neither those
config checks nor private namespace creation establishes the original domain's
kernel cgroup root or the controller's mount/view. That remains a separate join.

Before opening worker handles, establish these relationships:

- Selected socket peer is the actual daemon; its executable, live pidfd and PID
  namespace agree with the controller's procfs view. Keeper identity is insufficient.
- **Release-specific inspect-PID provenance:** establish that the selected native
  `State.Pid` denotes the init thread-group leader in that procfs view. Installed
  Moby's release reference now resolves to
  `0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c` (see
  [distribution/source evidence](../research/pi/20-p2-distribution-build-provenance.md)).
  Release semantics and applicability to the different selected peer artifact
  must still be checked separately; master source and matching PID numbers are
  not substitutes. A caller-supplied `verified: true` is not evidence.
  [Pinned source trace](../research/pi/21-p2-moby-pid-cgroup-trace.md) confirms
  inspect copies cached `State.Pid`; `RestoreTask` attaches without synchronizing
  that state. Repeated inspect/full ID/StartedAt/RestartCount agreement is not
  fresh init identity after daemon recovery. StartedAt is container-start bookkeeping
  captured by the daemon, not kernel birth time; establish current init identity
  independently before selecting a proc entry or handle. This is not a claim that recovery always
  changes the PID or that the selected build has been exercised.
- The candidate's anchored proc directory has the expected mapped UID/TGID,
  correctly parsed starttime, expected namespace relationships and NSpid levels.
  Select no process by worker text, PID arithmetic, name search or broad proc scan.
- **Exact cgroup binding:** establish the selected runtime's mapping from that
  native ID to the proc membership and controller-visible cgroup-v2 mount/view.
  A Docker-looking suffix, namespace-relative `/`, or shared daemon/ancestor group
  is insufficient. This mapping/topology still needs selected-revision evidence.
  At the traced release, rootless conversion can clear OCI CgroupsPath/resources
  for an empty controller list after preliminary path construction. Systemd/v2
  and configured HostConfig limits alone do not attest the final effective OCI
  path, required delegation or enforcement. Check original assignment/final
  runtime input and controller mount/view separately; no guessed fallback path.

If either provenance relationship is unavailable, stop **blocked before polling**.
Candidate namespace accessibility does not waive either prerequisite.

## 3. Small interface and acquisition ordering

One host-only child per observation, with two bounded newline-delimited JSON input
frames: initial controller-validated identity tuple, then confirmation after handles
are acquired. Tuple fields are full `containerId`, positive integer `pid`, native
`startedAt`, nonnegative integer `restartCount` and measured integer `mappedUid`;
frame `type` is `acquire` then `confirm`. Full config validation stays in the host;
do not forward environment, commands, mounts or raw inspect bodies. Strictly
validate fields/types/state/order, reject unknown fields and stop after those two
frames. No arbitrary command, signal, endpoint, filesystem root or worker-selected
cgroup path is accepted.

The implementation derives membership through the anchored proc view and opens
each cgroup path component beneath the verified mount with no symlink/parent
escape. Hold the original directory and events FDs; require an ordinary domain
cgroup, not an unexpected/threaded topology. Open exactly one worker pidfd with
flags0; compare its fdinfo identity with the anchored proc identity.

Require nonterminal pidfd and a fresh parsed `populated 1` before the acquired
response. Recheck proc/starttime/namespaces/membership, native full ID/PID/
StartedAt/restart count/config and cgroup identity across acquisition and controller
confirmation. Changed identity, exit, missing data or denial is blocked. Rechecks
narrow races but are not an atomic daemon/kernel snapshot or a general ABA proof.

Maximum two input frames of8192 bytes each and two output frames of4096 bytes each.
Use bounded `os.read` after polling pipe readiness, not a buffered read waiting for
EOF or an entire size. The10-second monotonic bound covers acquisition, confirmation
and observation together; maximum poll slice100ms. Parent also enforces a host
deadline and may terminate only its own observer child. Neither observer nor its
failure handling may delay or bypass existing independently owned cleanup.

The input reader binds both reads to the same finite absolute deadline, refusing
extensions or more than10 seconds initially. Acquire returns at its newline without
waiting for EOF; confirm returns only after EOF, rejecting trailing bytes. The host
must write then end its input after confirm, not leave the pipe open. Reading one
byte at a time avoids consuming confirmation before the acquisition handshake;
the control protocol is capped at two8KiB frames. Missing/late input, EOF, errors
or oversize poison the decoder. This input-only primitive does not establish the
missing native acquisition/observation lifetime bound; future orchestration must
share the same deadline. Tests use real self-owned pipes and scripted OS/time only.

## 4. Separate facts, no cleanup verdict

After confirmation, observe only the retained handles while the existing launcher
or explicit owned-stop path performs cleanup. Observer sends no stop or signal.

| Observation | Interpretation |
| --- | --- |
| pidfd IN/HUP | This thread group terminated; not its whole process tree. |
| events PRI/ERR | Notification/deactivation: seek0 and bounded reread of the same FD. ERR alone is not a fatal verdict or emptiness. |
| Fresh `populated 0` | That subtree has no live tasks at this observation; migration/repopulation/escape are not excluded. |
| EOF, ENODEV, disappeared/replaced group, invalid mask/data, timeout | Unavailable/inconclusive; never synthesize empty or reopen a replacement path. |

Parse exactly one valid populated value, tolerate other documented keys and reject
duplicates/malformed values. Keep thread-group status and cgroup status independent:
terminal+populated and live+empty are valid distinct observations, not quiescence.
Record repopulation if seen; notifications can coalesce and are not a transition log.

Output is bounded observations or a safe blocked classification, always with
`quiescenceQualified: false`. No `stopped`, task-success or reuse-permit field.
Exit0 means the observation protocol completed, not worker/task completion;
blocked/unavailable acquisition or an incomplete observation exits2. Close only
observer-owned FDs on every exit; preserve all runtime objects and private evidence.

## 5. Test-first matrix and staged commands

Synthetic acceptance red deliberately invented terminal/empty observations and
failed2 tests for missing data and terminal+populated. The first implementation
had15 stdlib self-tests covering frame fragmentation/schema/duplicates/limits/
EOF/poisoning, timestamp precision, confirmation drift, synthetic kernel tuple/
namespace/cgroup consistency, populated parsing and independent mask/result cases.
These are synthetic values, not actual FD/read/deadline/lifecycle qualification.
The next control-input red catches an inert reader returning no frame. Current
28 self-tests add real self-owned-pipe acquire/confirm/EOF, missing/truncated/extra
input, borrowed-FD preservation, blocking/nonpipe refusal, shared/expired/extended
deadlines, EAGAIN/EINTR, late data/readiness, poll/read errors and repeated wakeups.
Clock/OS scripting stays private to tests; no decoder mocks or worker handles.
Fresh control-input ordered local gates pass, with portable201 tests/2,957 assertions and unchanged
95.88% function/91.73% line coverage. That Bun coverage does not measure this Python
module. Python syntax/self-tests and three native-disabled CLI cases pass separately.
Exact commands, red/green and limitations are recorded in SPEC; the full matrix
below remains the target, not a claim that every native case is implemented.

First a no-container red catches an inert implementation that invents terminal/
empty. Then stdlib self-tests cover both the real parsing/protocol interface and
scripted OS results; keep fake FD/syscall behavior private to those tests.

Required cases: strict frames/order/bounds/EOF; FileSink write/end round-trip;
unbound/foreign/config mismatch; keeper or wrong namespace/NSpid; PID0/stopped;
changed starttime/restart/membership; wrong mount/root/shared/replaced cgroup;
EACCES/ESRCH/ENOENT/ENODEV; duplicate/missing/invalid populated; PRI|ERR with good
versus failing reread; pidfd IN/HUP versus ERR/NVAL; live+empty and terminal+populated;
repopulation/coalescing; timeout during confirmation and repeated notifications;
FD closure after partial acquisition. Do not induce real host PID reuse, migration
or cgroup deletion to manufacture negatives.
Admission negatives must also include recovered persisted PID despite unchanged
inspect lifecycle fields, treating StartedAt as kernel birth time, and rootless
conversion clearing an otherwise configured cgroup path/resources. These are
source-derived future cases, not tests executed by the synthetic-only core.

Proposed implementation gates: repository `bun run lint` and `bun run check`;
syntax compilation without pycache output; `python3 -I -B
research/pi/probes/p2-observer.py --self-test`; scoped trusted secret scan and
document/protected-file checks. Existing Bun lint/typecheck do not verify Python;
Python syntax/self-tests must be reported separately, not as equivalent coverage.

Only after provenance/admission tests pass and an owner approves the precise
lifecycle allowance: `bun --no-env-file run <private-host-harness>/lifecycle.ts`
with fresh private lab state/TMPDIR and the selected existing image/mount/endpoint.
The native check requires initial live/populated evidence and retained-handle
results after existing owned cleanup. Actual cgroup removal before a fresh zero
is an honest inconclusive result, not grounds to weaken the test or permissions.
Assert unchanged ID, pending action, budget1, unknown inventory and reuse/reset
restrictions. Keep native code qualification blocked on absent required checks.

## 6. Effects, rollback and next decision

Pure tests may use new private synthetic files only. Any native lifecycle remains
separately bounded/approved; no startup automation, daemon changes, create/start
replay, stopped-domain restart, delete, cgroup writes or privilege fallback.
Keep scripts/hashes/command manifests/sanitized facts in new0700 durable lab
evidence, not only ephemeral `/tmp`; never overwrite prior failures.

Rollback closes the observer child/FDs or removes its test-only integration, never
reverts inventory history or deletes evidence. Production quiescence/reconciliation
is explicitly outside this contract. Next decision: approve this synthetic-test
implementation beyond the synthetic core; resolve release-specific PID/cgroup
provenance before requesting a bounded physical gate. Synthetic completion is
not native implementation or qualification proof.
