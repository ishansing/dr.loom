# P2 — Pinned Moby PID and cgroup trace (source only)

Researched **2026-10-29** under SPEC's source-only continuation and ADR-028.
**Outcome:** release-source PID/state and OCI cgroup joins resolve; selected-build
and kernel admission remain blocked. No local runtime/socket/proc/cgroup/config/
cache inspection, fetched-source execution, build, installation or lifecycle occurred.
Source researcher wrote only this report; parent owns contract/governance and final gates.

## Revisions and evidence boundary

- **M:** Moby `docker-v29.9.2`, full commit
  `0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c`, resolved in [research20](20-p2-distribution-build-provenance.md).
  All Moby links below address that commit, never current main.
- M's `go.mod` **and vendored modules ledger** declare containerd/v2 **v2.4.2**
  and containerd/api **v1.12.0**. Actual vendored client files are inspected at M,
  not inferred from the live server's version. [M0, V0, V1, V2]
- **C:** separately reported server v2.4.2/base commit
  `b7a25261e029d68978bbf290df0a62fc819b3c51`; source below describes that base.
  Version equality does not prove selected server, shim or client bytes. Local
  `v2.4.2+dirty`/`vcs.modified=true` remains unexplained exhaustively: Arch recipe
  `813bc2edfa15d4677616b162ab60254786452bfc` edits tracked `containerd.service`,
  but actual build delta/toolchain were not reproduced. [research19](19-p2-backend-pid-provenance.md), research20.
- **R:** runc1.5.2 release `29dd3dc2b13b4123162e5fe132504bb4b15569f1`;
  **K:** RootlessKit3.3.0 release `888c3189e9cdf34dcdb19011e1c7c34eb94b5393`.
  R/K are release-only semantics, not selected-binary/source equivalence.
- Prior parent facts, not recollected: selected API Engine29.9.2/GitCommit0367cbe;
  diagnostic peer executable-FD SHA256 `3a6132d4d99c1437e3422599f802207a3def9ba4de00ec1004a8e40d2740b9b0`
  differs from packaged dockerd `32023e4076bc3f3ca84fcab975687bda3c2983a48bfae1c7009feda208022608`.
  `atomicPeerBindingProven=false`. Arch Docker recipe
  `73f823426870d8b4b6a98016b4e296f695583737` selects M's tag, not proof for those different peer bytes.
  Older wrong-tag/short-ref404/422 failures are historical, not permanent source blockers.

## PID call-path and state derivation

| Entry / layer | Verified path and exact numeric-PID consequence |
| --- | --- |
| Docker start / metadata create | `containerStart` holds container lock; `createSpec` → `getLibcontainerdCreateOptions` → `ReplaceContainer` → remote `NewContainer` → containerd `WithSpec`/`WithRuntime`. This creates metadata, not yet Docker's running PID. Conflict replacement can delete a stale task/container and recreate **the same ID**. [M1, M2, M3] |
| Task create | remote `container.NewTask` → vendored `container.NewTask` → Tasks.Create(`ContainerID`, optional checkpoint/options). Response.Pid is cached as `task.pid`. C tasks `local.Create` → v2 TaskManager.Create → shimTask.Create → shim service.Create → runc.NewContainer/newInit → process.Init.Create. [M3, V1, C1–C4] |
| Ordinary OCI PID origin | `Init.Create` supplies `--pid-file` through go-runc, calls runtime.Create, reads pid file, assigns `p.pid`; `Init.Pid()` returns it, `Container.Pid()` returns main process's PID. R's `runner.run` → `createPidFile` → libcontainer Process.Pid; `containerProcess.pid()` returns final `cmd.Process.Pid`. nsexec stage1 clones stage2, forwards clone-return PID via stage0 JSON; Go `getChildPid`/`waitForChildExit` adopts that process. This is the **outer runc process's PID view**, not the worker's own PID1 value. [C4, C5, R1–R3] |
| Start / Docker running state | `tsk.Start` → vendored task.Start sends ContainerID with empty ExecID; C local.Start calls init Start then State; response.Pid overwrites client cache. M calls `State.SetRunning(ctr, tsk, startupTime)` **after** Start succeeds; `setRunning` copies `int(tsk.Pid())`, sets Running=true/Restarting=false and StartedAt. `startupTime` was captured before NewTask, not a kernel birth timestamp. [M1, M4, V2, C1, C3] |
| Checkpoint restore, not daemon recovery | Init.Create with checkpoint stages `createdCheckpointState` instead of ordinary runtime.Create. `createdCheckpointState.Start` calls runtime.Restore with pid file, reads it and sets `p.pid`; Start response refreshes client cache before M SetRunning. Do not assume Create's PID is final/nonzero on this branch. Loom's ordinary fixed launch is not checkpoint restore. [C5, C6, V2, M1] |
| Daemon restore / reattach | `Container.FromDisk` decodes persisted State (including Pid); `RestoreTask` only LoadContainer/AttachTask and **explicitly does not sync State**. AttachTask → vendored loadTask → Tasks.Get(empty ExecID), caches response.Process.Pid in task handle. `Daemon.restore` checks task status/deletes dead tasks/shuts down live tasks if live-restore disabled; surviving running/paused branches do **not** copy task.Pid into State.Pid. Stopped reconciliation uses SetStopped. Thus inspect after recovery is not automatically a fresh task PID read. [M5, M6, V1, C1] |
| containerd recovery | `LoadExistingShims` → loadShims/loadShim → loadShimTask reconnects existing shim, checks connectivity/Pids and registers it; TaskManager.Get builds shimTask from registered shim; State RPC supplies PID. Failed/dead-shim cleanup may synthesize TaskExit. Reconnecting a surviving shim is not recreating a worker or proving its kernel identity. [C2, C7, C8] |
| Task events / init versus exec | Remote stream filters containerd namespace and `/tasks/`; create/start map ProcessID=ContainerID, exit maps ProcessID=TaskExit.ID, exec maps ProcessID=ExecID. Per-container event queue invokes Daemon.ProcessEvent. EventCreate/ExecAdded/ExecStarted fall through (no State.Pid write). EventStart only if !State.Running loads task and calls SetRunningExternal: PID comes from loaded task, **not directly event.Pid**; StartedAt is not refreshed. Exit with ProcessID==ContainerID handles init; otherwise updates separate exec state. TaskDelete is logged only. [M3, M4, M7] |
| Exit / restart / pause | handleContainerExit serializes cleanup/state under lock; SetStopped clears Running/Paused/Restarting/Pid; SetRestarting leaves Running=true but sets Restarting=true and Pid=0; policy restart increments RestartCount and later runs normal start. Pause/resume event handling changes Paused, not PID. Duplicate exit guard ignores exited/removing/dead or a task freshly reported Running; timestamps are explicitly unsuitable due to CLOCK_REALTIME jumps. These are lifecycle defenses, not PID ABA proof. [M4, M7] |
| Inspect output | ContainerInspect → containerInspect (container lock) → getInspectData copies **ctr.State.Pid** to API State.Pid, alongside StartedAt and RestartCount; no task RPC, proc lookup or pidfd acquisition. ExecInspect separately uses exec Process.Pid. The lock makes this a daemon-state snapshot, not an atomic daemon/kernel snapshot. [M8] |

Conflict replacement semantics above are specifically in `ReplaceContainer`. [M12]
Shim `preStart`/`handleStarted` buffer exits during create/start and reconcile
early-exiting PIDs under lifecycleMu. This closes an event-bookkeeping race, not
Loom's later identity race. M's event-stream restart resubscribes after service
readiness; it supplies no atomic kernel snapshot or observer identity token. [C3, M3]
The init/task distinction is structural: C `Container.Process("")` selects the
main `process.Init`; nonempty ExecID selects exec. TaskExit.ID equals container ID
for init. `Connect` separately returns **ShimPid=os.Getpid()** and **TaskPid=container.Pid()**:
neither shim nor RootlessKit keeper PID is the inspected init. [C3, C4]
`HostConfig.Init` means an **optional injected executable**, not that structural
init identity. In private PID mode, true (or nil with daemon Init=true) prepends
`/sbin/docker-init -- <command>` and bind-mounts the chosen init binary; explicit
false suppresses it even if daemon default is true. With Loom **Init=false**,
State.Pid denotes the configured command's initial process (subject to exec), not
docker-init or an exec child. With Init=true it denotes docker-init, not its child. [M9]

## Actual OCI cgroup derivation (conditional, not observed paths)

Let **I** be full native container ID; **P** = nonempty HostConfig.CgroupParent,
else nonempty daemon CgroupParent, else the driver default. [M9]

| Choice / step | Exact source derivation and limitation |
| --- | --- |
| Driver selection | `UsingSystemd`: explicit native.cgroupdriver=systemd, else unset option + unified hierarchy + systemd detected (`/run/systemd/system` directory). Otherwise false. `cgroupDriver`: systemd if UsingSystemd, else **none for rootless**, else cgroupfs. Rootless systemd requires v2. A rootless API alone does not select systemd. [M10] |
| Preliminary withCgroups | UsingSystemd: default P=`system.slice` rootful / `user.slice` rootless; `Linux.CgroupsPath=P+":docker:"+I`. Otherwise default P=`/docker`; path=`filepath.Join(P,I)`. Per-container parent overrides daemon parent. Systemd parent validation requires a nontrivial `.slice` suffix. [M9, M10] |
| Final rootless mutation | createSpec applies withCgroups before withRootless. withRootless only gathers v2Controllers when driver is systemd, reading daemon-view `/sys/fs/cgroup/user.slice/user-<ROOTLESSKIT_PARENT_EUID>.slice/cgroup.controllers`. `ToRootless`: **len(v2Controllers)==0 clears Linux.Resources and CgroupsPath**; otherwise preserves path but drops unsupported resource controllers/devices. Rootless non-systemd therefore does not retain preliminary `/docker/I`. Nonempty controller list alone does not prove required pids/memory/cpu delegation. [M9, M11] |
| Runtime options | Stock `runc`/`io.containerd.runc.v2` resolve to runc-v2 shim; `defaultV2ShimConfig` supplies BinaryName=`runc`, runtime state Root, SystemdCgroup=`UsingSystemd`. Configured runtimes may alter binary/wrapper/type/options. remote NewTask clones runc options plus IO UIDs/GIDs; C newInit passes SystemdCgroup to go-runc. OCI path and this boolean must agree. [M2, M3, C4, C5] |
| R manager selection | `shouldUseRootlessCgroupManager`: explicit --rootless overrides auto; auto is true for nonzero EUID, false for real root outside userns; EUID0 inside userns uses systemd DetectUID (error assumes owner0), or true for cgroupfs. Result becomes RootlessCgroups. Cgroup manager.NewWithPaths chooses systemd-v2/fs2 on unified, systemd-legacy/fs on v1; requested systemd without detected systemd errors. [R1, R8, R9] |
| R systemd-v2 interpretation | CreateCgroupConfig parses `slice:prefix:name` to Parent/ScopePrefix/Name. Unit=`docker-I.scope`; `getSliceFull` expands parent slice and, **if runc manager Rootless**, prefixes user manager's actual D-Bus ControlGroup. initPath secure-joins unified mount `/sys/fs/cgroup`, full slice, unit. Apply supplies Slice, Delegate and PIDs to systemd then creates cgroup path. Rootless manager selection is a separate runtime decision, not implied solely by M's Rootless field. No concrete UID/service ancestry is inferred here. [R4, R5, R6] |
| R fs2 interpretation | Non-systemd path is lexically cleaned; fs2 defaultDirPath uses `/sys/fs/cgroup` + absolute inner path, or for a relative path adds parent of runc's own `/proc/self/cgroup`. Empty path takes runtime defaults, not the discarded Moby path. R initProcess.start applies manager before child synchronization; rootless ErrRootless may be tolerated. Successful create is not universal proof of an isolated/enforced cgroup. [R2, R4, R7] |
| Shim discovery ≠ original assignment | C loadProcessCgroup reads `PidGroupPath(initPID)` → shim-view `/proc/<pid>/cgroup`, then cgroup2.Load; failure can leave container.cgroup unset. This is current membership, not an ID-to-original-root attestation and not a portable controller path. [C4, C9] |
| Private cgroup namespace | M WithNamespaces adds CgroupNamespace with empty Path for explicit private mode; it does not replace the OCI path with `/`. Linux virtualizes membership relative to **reader's** cgroup namespace root; a new cgroup2 mount roots there. Root fixed at namespace creation does not move with creator. Worker `0::/` need not be host/controller root. [M9, L1] |

For empty non-systemd OCI path, CreateCgroupConfig sets Name=I and no Path;
path.Inner derives relative I, so fs2's candidate is
`Join("/sys/fs/cgroup", Dir(runc-own-membership), I)`, **in runc's view**.
This fallback is not evidence that a distinct group was successfully created. [R4, R7, R10]

## Remaining joins and smallest later evidence checklist

**Closed at release-source level:** exact Moby lookup, vendored client version and
PID-copy chain, non-refreshing daemon restore behavior, event init/exec distinction,
Init=false behavior, parent/driver selection and final rootless path clearing.
**Not closed:** selected peer/source/build equivalence; selected containerd dirty
delta and actual shim/runc/RootlessKit identities/options; numeric PID/procfs and
cgroup mount-view joins; physical permissions and retained-object lifetime.

Later **owner-approved** experiment must minimally establish, without guessing:
1. Selected artifact/build inputs and actual containerd→shim→runc chain; trusted
   daemon association (retain diagnostic/non-atomic limitation), runtime options,
   effective cgroup manager, final OCI input/delegated controllers and manager root.
2. Controller/daemon/containerd/shim/runtime PID namespace relationships and the
   controller procfs's PID view; worker PID/TGID/starttime/UID maps/NSpid levels.
   C default command launch and shim self-spawn set process group, not NEWPID;
   this does not attest deployment ancestry/wrappers. K CreatePIDNS and
   CreateCgroupNS independently select NEWPID/NEWCGROUP; version cannot select flags. [C10, C11, K1]
3. Full assertDomainContainer before/after; running, nonrestarting, positive PID,
   unchanged full ID/StartedAt/RestartCount; explicitly distinguish daemon-recovered
   persisted PID from a fresh independently verified init identity.
4. Original assigned domain root reconciled with anchored init membership and
   controller cgroup namespace, verified cgroup2 mount device/root/mountpoint and
   directory identity. Reject shared ancestor/keeper/daemon groups, traversal,
   replaced paths and unexpected/threaded topology; path suffix is not ownership.
5. Only then acquire/confirm original proc/pidfd/cgroup directory/events handles,
   require initial live/populated, recheck identity/membership/config, and run the
   bounded retained-handle cases in the [contract](../../docs/p2-kernel-observer-test-contract.md).

These checks narrow races; source semantics and repeated snapshots cannot prove
atomic PID/proc/pidfd/cgroup identity, no migration/repopulation/escaped descendants,
or actual cleanup. PID-file rename publishes a number, not an identity capability.
No new worker handles/lifecycle are authorized; both earlier allowances are spent.
Core `226d00f` remains synthetic-only/default **native-not-implemented**. No quiescence,
reuse/reset, action/task completion or G2 authority follows. Next owner decisions:
resolve selected-build evidence first; separately approve precise physical allowance
and missing native implementation/gates. Keep unknown inventory/pending action/fences.

## Immutable primary-source ledger

HTTP200 text was fetched for these scoped files; no current-main substitution,
new404/network blocker, package download or source execution. Relevant functions
above were checked in fetched text; document/security gates remain parent-owned.

- **M0:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/go.mod
- **V0:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/vendor/modules.txt
- **V1:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/vendor/github.com/containerd/containerd/v2/client/container.go
- **V2:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/vendor/github.com/containerd/containerd/v2/client/task.go
- **M1:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/start.go
- **M2:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/runtime_unix.go
- **M3:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/internal/libcontainerd/remote/client.go
- **M4:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/container/state.go
- **M5:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/container/container.go
- **M6:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/daemon.go
- **M7:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/monitor.go
- **M8:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/inspect.go
- **M9:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/oci_linux.go
- **M10:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/daemon_unix.go
- **M11:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/internal/rootless/specconv/specconv_linux.go
- **M12:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/internal/libcontainerd/replace.go
- **C1:** https://github.com/containerd/containerd/blob/b7a25261e029d68978bbf290df0a62fc819b3c51/plugins/services/tasks/local.go
- **C2:** https://github.com/containerd/containerd/blob/b7a25261e029d68978bbf290df0a62fc819b3c51/core/runtime/v2/task_manager.go
- **C3:** https://github.com/containerd/containerd/blob/b7a25261e029d68978bbf290df0a62fc819b3c51/cmd/containerd-shim-runc-v2/task/service.go
- **C4:** https://github.com/containerd/containerd/blob/b7a25261e029d68978bbf290df0a62fc819b3c51/cmd/containerd-shim-runc-v2/runc/container.go
- **C5:** https://github.com/containerd/containerd/blob/b7a25261e029d68978bbf290df0a62fc819b3c51/cmd/containerd-shim-runc-v2/process/init.go
- **C6:** https://github.com/containerd/containerd/blob/b7a25261e029d68978bbf290df0a62fc819b3c51/cmd/containerd-shim-runc-v2/process/init_state.go
- **C7:** https://github.com/containerd/containerd/blob/b7a25261e029d68978bbf290df0a62fc819b3c51/core/runtime/v2/shim_load.go
- **C8:** https://github.com/containerd/containerd/blob/b7a25261e029d68978bbf290df0a62fc819b3c51/core/runtime/v2/shim.go
- **C9:** https://github.com/containerd/containerd/blob/b7a25261e029d68978bbf290df0a62fc819b3c51/vendor/github.com/containerd/cgroups/v3/cgroup2/paths.go
- **C10:** https://github.com/containerd/containerd/blob/b7a25261e029d68978bbf290df0a62fc819b3c51/cmd/containerd-shim-runc-v2/manager/manager_linux.go
- **C11:** https://github.com/containerd/containerd/blob/b7a25261e029d68978bbf290df0a62fc819b3c51/core/runtime/v2/command_unix.go
- **R1:** https://github.com/opencontainers/runc/blob/29dd3dc2b13b4123162e5fe132504bb4b15569f1/utils_linux.go
- **R2:** https://github.com/opencontainers/runc/blob/29dd3dc2b13b4123162e5fe132504bb4b15569f1/libcontainer/process_linux.go
- **R3:** https://github.com/opencontainers/runc/blob/29dd3dc2b13b4123162e5fe132504bb4b15569f1/libcontainer/nsenter/nsexec.c
- **R4:** https://github.com/opencontainers/runc/blob/29dd3dc2b13b4123162e5fe132504bb4b15569f1/libcontainer/specconv/spec_linux.go
- **R5:** https://github.com/opencontainers/runc/blob/29dd3dc2b13b4123162e5fe132504bb4b15569f1/vendor/github.com/opencontainers/cgroups/systemd/v2.go
- **R6:** https://github.com/opencontainers/runc/blob/29dd3dc2b13b4123162e5fe132504bb4b15569f1/vendor/github.com/opencontainers/cgroups/systemd/common.go
- **R7:** https://github.com/opencontainers/runc/blob/29dd3dc2b13b4123162e5fe132504bb4b15569f1/vendor/github.com/opencontainers/cgroups/fs2/defaultpath.go
- **R8:** https://github.com/opencontainers/runc/blob/29dd3dc2b13b4123162e5fe132504bb4b15569f1/rootless_linux.go
- **R9:** https://github.com/opencontainers/runc/blob/29dd3dc2b13b4123162e5fe132504bb4b15569f1/vendor/github.com/opencontainers/cgroups/manager/new.go
- **R10:** https://github.com/opencontainers/runc/blob/29dd3dc2b13b4123162e5fe132504bb4b15569f1/vendor/github.com/opencontainers/cgroups/internal/path/path.go
- **K1:** https://github.com/rootless-containers/rootlesskit/blob/888c3189e9cdf34dcdb19011e1c7c34eb94b5393/pkg/parent/parent.go
- **L1:** https://github.com/gregkh/linux/blob/9a66fdc0d7fd55f54235524a73435af99051e46f/Documentation/admin-guide/cgroup-v2.rst

Parent independently re-fetched exact-commit inspect/state/RestoreTask and daemon
restore branches, start-time capture, Init=false handling, cgroup parent/rootless
ordering/clearing and both client-version ledgers. Contract clarification preserves
config validation while separating fresh init identity, final OCI/delegation and
kernel root/view evidence. Original report/hash and starting context are retained
under private durable key `moby-semantic-trace-h16z0w8z`; no runtime fact was
recollected. Final document/secret/protected-file gates remain parent-owned.
Parent final scoped gates pass: four pinned document scans,36 local links/anchors,
governance/protected-file/durable-return identities and whitespace. This remains
source-only evidence; no application/native/coverage qualification or authority follows.
