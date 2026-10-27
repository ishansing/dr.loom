# P2 — Kernel-observer readiness (research only)

Researched **2026-10-27** under SPEC's kernel-observer discovery scope and
[ADR-027](../../decisions.md#adr-027---2026-10-26-explicit-owned-domain-stop-recovery).
No probe, container dispatch, process inspection/signaling, cgroup write, package
install or daemon change ran. This note does not authorize implementation or G2.

## Findings

1. **Installed Python stdlib is a plausible test-only observer, not qualified
   worker evidence.** `os.pidfd_open(pid, 0)` plus `select.poll()` can observe a
   correctly identified process; an opened cgroup-v2 directory and `cgroup.events`
   can independently observe that particular subtree. Neither facility proves
   Docker ownership or supplies a missing PID-namespace translation. [S1–S5]
2. **The discovered `child_pid` is a RootlessKit namespace keeper, not dockerd or
   container init.** Its readable handles establish only keeper accessibility.
   They cannot stand in for cross-UID worker handles or domain cleanup evidence.
3. **Process termination and subtree emptiness are different facts.** A default
   pidfd reports thread-group exit, not all descendants; `populated 0` means no
   live processes currently in that cgroup and its descendants, not no escaped
   writers, no future repopulation, or successful external-effect reconciliation.
   Even both observations must leave Loom inventory unknown/fenced. [S2–S4]
4. **Removal is not a successful empty read.** Holding directory/events FDs
   anchors objects rather than path names, but does not keep the cgroup online.
   Kernfs source predicts invalidation/error paths; installed worker removal
   behavior has not been tested. Missing/stale handles must remain inconclusive.
   [S3, S6]

## Evidence boundary and selected revisions

**Supplied prior read-only observations, not repeated here:** Linux
`7.2.8-9-omarchy`, Python `3.15.2`, Bun `1.4.4`, rootless Docker `29.9.2`, API
`1.56`; controller UID1000, container UID65532 mapping to host165531.
`/run/user/<uid>/dockerd-rootless/child_pid` identifies a process with comm `exe`,
executable basename `rootlesskit`, controller UID and controller PID namespace.
Its pidfd opened/nonterminal; its cgroup directory/events were readable and
`populated 1`. **No worker cross-UID readability, namespace FD access, terminal
transition or cgroup deletion semantics were established by these observations.**

Primary-source review selected Linux stable **v7.2.8**, commit
`9a66fdc0d7fd55f54235524a73435af99051e46f`, and CPython **v3.15.2**, commit
`5e58eaad7c58df58dfa8ea549c87996e01dd1077` (GitHub tag objects resolved). These
are upstream references, not a byte-match to the installed distribution builds;
Omarchy patches/configuration and Python build options remain unreviewed. Linux
v7.2 mainline was consulted first, then the relevant stable files rechecked.

Moby `v29.9.2` tag/tree and attempted inspect-source URLs returned404. The official
API1.56 reference was accessible, but no release-pinned daemon PID-provenance
implementation was established. Moby **master snapshot only**, commit
`9cad7b0b9f45c27bf6a961006392acff63817931`, copies `ctr.State.Pid` into inspect;
its rootless launcher accepts extra RootlessKit flags. This does **not** establish
the installed daemon's PID namespace, translated host PID, or keeper semantics.
No runtime upgrade, source substitution or new upstream bug is proposed. [S7–S8]

## Identity acquisition: required before polling

**Proposed safeguards, not an implemented atomic identity protocol:**

- Start from exactly one unresolved, inventory-bound full native container ID.
  Freshly prove selected backend/image and exact ID/name/labels/config through
  existing ownership checks; never adopt a matching name, caller PID, worker PID
  text, PID1 alone, or a guessed Docker cgroup path. Inspect only that exact ID.
- Treat inspect `State.Pid` as a number in an **unproven runtime namespace** until
  daemon/runtime provenance and its relation to the controller's procfs view are
  established. Same PID namespace permits direct lookup only after that proof.
  If different, require a trusted mapping to the host-visible PID, verified by
  namespace identity and the correct `NSpid` level, not equal numbers at arbitrary
  levels. `NSpid` starts at the procfs mount's PID namespace; it is not a global
  lookup key. No PID arithmetic, broad host-process scan, `nsenter`/`setns`, or
  privileged helper fallback belongs in the smallest proposal. If a bounded
  trusted mapping is unavailable, stop at **blocked identity bridge**. [S2, S9]
- Open the exact proc directory, read starttime (stat field22), TGID/status,
  accessible namespace identities and v2 membership relative to that FD; acquire
  `os.pidfd_open(host_pid, 0)` and revalidate the same anchored process data,
  pidfd fdinfo and exact-ID inspect snapshot. Reject exit, changed starttime,
  changed inspect lifecycle/PID/restart facts, inaccessible namespace identity,
  ambiguous translation, or membership drift during acquisition. Parse stat's
  parenthesized comm correctly; whitespace splitting the whole line is unsafe.
  Starttime is boot-relative clock ticks, not a globally unique identifier or
  inspect `StartedAt`. Rechecks narrow races; they do not make daemon/proc/cgroup
  reads one transaction or exclude every ABA restart. No barrier equivalent to
  the old Bubblewrap experiment has been established here. [S2, S9–S10]
- Require a trusted cgroup-v2 mount/view matching the proc membership namespace;
  namespace-relative `/` is not the host hierarchy root. Resolve components
  beneath that mount without symlink/parent escapes. Open the exact non-root
  domain directory and `cgroup.events` relative to it, retaining both; compare
  filesystem/device/inode identity and membership before/after acquisition.
  Reject a shared keeper/daemon/ancestor group, threaded/unexpected topology,
  mount/view mismatch or replacement. Do not derive ownership from inode numbers
  or path suffixes alone. A pidfd pins a process identity, not cgroup membership;
  the cgroup FD pins an object, not its occupants. [S2–S3, S9]

**Permission blocker:** `pidfd_open` itself is not `pidfd_getfd` and the reviewed
syscall path does not impose a blanket same-UID/ptrace test. Nevertheless procfs
visibility, namespace-link ptrace checks, DAC/LSM/seccomp and cgroup traversal
are separate constraints. UID1000 opening its own keeper does not establish
access to UID165531 worker namespace handles. Report permission failure, never
repair permissions or elevate privileges to complete the test. [S2, S9]

## Polling and lifetime semantics

| Handle | Source-established behavior | Safe test interpretation |
| --- | --- | --- |
| Default pidfd (`flags=0`) | Stable Linux `pidfd_poll`: `POLLIN`/read-normal when exited and group-leader delay is over; additionally `POLLHUP` when the task is gone. CPython exposes returned masks. | Register `POLLIN`; examine all returned bits including HUP/ERR/NVAL. No need to await HUP after IN; no read or `waitpid` claim for this non-child. Terminal applies to this thread group, not its process tree. |
| `cgroup.events` | Kernfs normally includes ordinary readable/writable readiness; notification adds `POLLPRI | POLLERR`. Deactivation can return the same added bits. | Register `POLLPRI | POLLERR`, not default/POLLIN readiness. A wakeup is only a reason to reread, not proof of emptiness or necessarily a fatal error. |
| Held directory/events | Removal deactivates/unlinks kernfs nodes despite held references; fresh seq reads/seek can fail `ENODEV`. | Retain original FDs; never silently reopen a replacement path. EOF, seek/read failure, malformed data or disappearance is inconclusive, not `populated 0`. |

For events, perform an initial bounded read from offset0, then on notification
seek to0 and reread the **same** FD, parsing exactly one valid populated value
while tolerating other documented keys. This refreshes the seq-file snapshot and
notification baseline. Avoid buffered stale reads. Bound iterations and wall time:
Python poll timeout units are milliseconds, returns `(fd, mask)` pairs, retries
EINTR with recalculated timeout, and negative/None waits indefinitely. An outer
monotonic deadline is still needed for repeated wakeups. `POLLERR` on events can
be a normal notification; `POLLNVAL` is never success. [S1, S3–S6]

`populated 0` includes the subtree and excludes zombies; it can result from
process migration as well as exit. A still-live group can repopulate. Kernel
notifications are rate-limited/coalesced, not a transition ledger: polling can
miss a transient0→1 interval. An actually deleted/dying cgroup cannot revive,
but the same path can later name a different cgroup. Holding its old directory
does not certify that all original descendants stayed inside it. Neither held
FD nor repeated empty samples establishes permanent absence of writers or
settles remote effects. No deletion test or escaped-process qualification ran.
[S3–S6]

The [P0 crash research](16-p0-crash-recovery.md) used an explicit Bubblewrap
startup barrier, host init pidfd and observed-process signals. Those historical
permissions/results do not transfer to Docker, cross-UID access or this observer;
its reuse procedure is not a new Loom cleanup-authority contract.

## Smallest owner-approval proposal and checks (NOT executed)

**Recommend conditional approval of one development-only observer seam**, first
proving the identity bridge and worker-handle accessibility. Use installed Python
stdlib only, one inventory-bound owned container supplied by an independently
approved existing fixture, at most one worker pidfd plus its anchored proc/cgroup
handles, a10-second monotonic observation deadline and100ms maximum poll slices.
No new SDK/provider integration, runtime API, persistent service or DB writer.
If identity/access cannot be proved, end blocked before making a cleanup claim;
do not expand discovery to host scans or privileged helpers.

Exact proposed acceptance checks, to specify before any future implementation:

1. **Acquisition:** fresh ownership checks → proven inspect-PID bridge → anchored
   starttime/namespace/membership checks → pidfd and directory/events opens →
   identical post-acquisition identity checks. Require nonterminal pidfd and
   parsed `populated 1` for a fixture independently known active. Keeper-only
   success must explicitly fail the worker acceptance condition.
2. **Bounded observation:** after the existing separately authorized owned-stop
   path (observer sends no signal/stop), capture pidfd masks and fresh events
   values separately within10 seconds. Classify terminal/empty only for their
   exact handles; if the runtime removes the cgroup before a fresh zero is read,
   return stale/unavailable, not an invented empty observation. No passing
   requirement should force deletion semantics that have not been demonstrated.
3. **Deterministic negative fixtures:** unbound/foreign/exact-ID mismatch;
   inspect PID0/stopped; wrong namespace level; keeper substituted for worker;
   changed starttime/restart/membership; EACCES/ESRCH/ENOENT/ENODEV; replaced
   directory; malformed/duplicate/missing populated; ERR|PRI with successful
   reread versus failed reread; IN/HUP on pidfd; NVAL; timeout; terminal pidfd
   while populated1; populated0 while pidfd live; simulated repopulation and
   coalesced notifications. These are scripted input/FD-adapter cases, not
   permission to induce host PID reuse, migration or cgroup deletion.
4. **Authority invariants:** unchanged bound ID, inventory unknown, native action
   pending, budget/fence/reset/reuse decisions unchanged for every result. No
   create/start/adoption/delete/completion or quiescence recording by observer;
   stop remains exclusively the independently approved existing owner path.
5. **Rollback:** unregister/close only observer-owned FDs on every exit; remove
   test integration if rejected, preserving all container/state/evidence objects.
   Observer failure cannot block existing proven-owned cleanup or weaken fences.

Before code, owner must approve this seam and the exact one-container lifecycle
that supplies it; then update SPEC's seven sections and define the actual focused
command plus existing ordered gates. No executable probe command exists yet, so
none is invented or claimed run. This note's scope requires document review and
`git diff --check`, not application/E2E execution or fresh coverage/audit claims.

## Primary sources accessed

- **S1 — CPython v3.15.2:** [pidfd wrapper](https://github.com/python/cpython/blob/5e58eaad7c58df58dfa8ea549c87996e01dd1077/Modules/posixmodule.c#L10847), [poll implementation](https://github.com/python/cpython/blob/5e58eaad7c58df58dfa8ea549c87996e01dd1077/Modules/selectmodule.c). Tag-addressed raw files read; commit resolved through GitHub API.
- **S2 — Linux v7.2.8:** [pidfd_open syscall](https://github.com/gregkh/linux/blob/9a66fdc0d7fd55f54235524a73435af99051e46f/kernel/pid.c#L697), [pidfd fdinfo/poll](https://github.com/gregkh/linux/blob/9a66fdc0d7fd55f54235524a73435af99051e46f/fs/pidfs.c#L238).
- **S3 — Linux v7.2.8:** [cgroup-v2 documentation](https://github.com/gregkh/linux/blob/9a66fdc0d7fd55f54235524a73435af99051e46f/Documentation/admin-guide/cgroup-v2.rst): organizing processes, populated notification, delegation, namespace views, dying groups.
- **S4 — Linux v7.2.8:** [cgroup event snapshot/notification](https://github.com/gregkh/linux/blob/9a66fdc0d7fd55f54235524a73435af99051e46f/kernel/cgroup/cgroup.c#L3814), including `cgroup_file_notify` at4712.
- **S5 — Linux man-pages:** [pidfd_open(2)](https://man7.org/linux/man-pages/man2/pidfd_open.2.html), supplementary current documentation, not an installed-kernel test.
- **S6 — Linux v7.2.8:** [kernfs file operations](https://github.com/gregkh/linux/blob/9a66fdc0d7fd55f54235524a73435af99051e46f/fs/kernfs/file.c#L156), especially seq refresh and poll at848; [node removal](https://github.com/gregkh/linux/blob/9a66fdc0d7fd55f54235524a73435af99051e46f/fs/kernfs/dir.c), `__kernfs_remove`.
- **S7 — Docker:** [official Engine API1.56 reference](https://docs.docker.com/reference/api/engine/version/v1.56/). API reference availability does not resolve rootless namespace bridging.
- **S8 — Moby master snapshot, NOT installed29.9.2 proof:** [inspect](https://github.com/moby/moby/blob/9cad7b0b9f45c27bf6a961006392acff63817931/daemon/inspect.go), [rootless launcher](https://github.com/moby/moby/blob/9cad7b0b9f45c27bf6a961006392acff63817931/contrib/dockerd-rootless.sh#L211). Release source lookup failed as noted above.
- **S9 — Linux man-pages:** [proc_pid_status(5)](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html), [namespaces(7)](https://man7.org/linux/man-pages/man7/namespaces.7.html): NSpid ordering, namespace identity and ptrace-gated links.
- **S10 — Linux man-pages:** [proc_pid_stat(5)](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html): comm and starttime representation.

**Next owner: project owner.** Approve/reject the bounded test seam and its
separately controlled one-container lifecycle. Worker namespace/handle access,
installed daemon source provenance, atomic restart binding and actual post-stop
FD behavior remain unresolved; research does not close any of those gates.
