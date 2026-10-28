# P2 — Backend PID provenance (research only)

Researched **2026-10-28** under SPEC's read-only provenance scope and
[ADR-028](../../decisions.md#adr-028---2026-10-27-test-only-kernel-observer-acquisition).
**Outcome: blocked before native acquisition/polling.** Reported containerd base
source resolves; the selected Moby revision does not, and local containerd build
metadata is dirty. No current-main substitution, lifecycle, installation,
permission repair or fetched-source execution occurred. The source researcher fetched
primary sources and wrote only this report; the parent collected read-only
version/build metadata and reviewed/updated the report and governance documents.

## Evidence and revision resolution

Parent-supplied facts, **not independently recollected here**: one selected rootless
Docker API1.56 `GET /version` reports Engine29.9.2, GitCommit`0367cbe`,
GoVersion`go1.26.10`; containerd2.4.2 revision
`b7a25261e029d68978bbf290df0a62fc819b3c51`; runc1.5.2 (commit unavailable),
RootlessKit3.3.0, docker-init0.19.0 revision`de40ad0`; Linux/amd64,
kernel7.2.8-9-omarchy, minimum API1.40. Local package records name
docker1:29.9.2-1, containerd2.4.2-1, runc1.5.2-1; no RootlessKit package found.
The parent subsequently inspected local ELF/Go build metadata read-only, without
executing daemon/runtime targets or fetching toolchains. `/usr/bin/containerd`
embeds the same full revision, module version `v2.4.2+dirty` and `vcs.modified=true`.
This does not identify what changed (packaging/generated files are possible) or
establish unsafe modification; its delta from the upstream base remains unreviewed.
No VCS/linker commit was extracted for local dockerd/runc. Local binary hashes and
sanitized command/result manifests are retained privately under durable evidence
key `backend-provenance-tidh714a`; no raw build flags were retained. Binary byte
equivalence to the running socket peer remains unproven. Package versions cannot
identify which installed/static executable serves a socket.

| Component | Official-source result | What remains unproven |
| --- | --- | --- |
| Moby `0367cbe` /29.9.2 | Commit API422 (also with `?per_page=1`); commit page, short-ref raw inspect file and `v29.9.2` tag API404. Exact full commit **unresolved**. [M] | Selected inspect/state updates, runtime selection, OCI cgroup path and namespace inheritance. |
| containerd2.4.2 | Commit API and annotated release tag resolve to **`b7a25261e029d68978bbf290df0a62fc819b3c51`**. [C0] | Local metadata also names this base but marks the build dirty; delta and running-binary equivalence unproven. |
| runc1.5.2 | Annotated tag resolves to **`29dd3dc2b13b4123162e5fe132504bb4b15569f1`**. [R0] | Release source only: selected server supplied no runc commit. |
| RootlessKit3.3.0 | Annotated tag resolves to **`888c3189e9cdf34dcdb19011e1c7c34eb94b5393`**. [K0] | Actual launcher flags, executable bytes and descendant namespace chain. |

These failures establish lookup gaps, not nonexistence, tampering or a novel
upstream bug. Exact-string web search for `"0367cbe" docker moby` returned no
results; issue/PR deduplication is incomplete. API1.56 documentation is reachable,
but its existence does not resolve an implementation revision. [D]

Prior evidence establishes a nonterminal **daemon peer** pidfd, executable basename
`dockerd`, and matching controller PID namespace. Candidate-access-only evidence
establishes UID165531, rechecked proc starttime and an accessible distinct worker
PID namespace link, not complete native identity. Correct keeper facts are
**comm `exe`, executable basename `rootlesskit`**; it is not the worker or daemon.
No worker pidfd/cgroup handles were polled; both lifecycle allowances are consumed.
See [research18](18-p2-kernel-observer-readiness.md) and the
[test contract](../../docs/p2-kernel-observer-test-contract.md).

## Narrow PID path: established segments and missing joins

1. **Moby join is missing:** cannot verify at `0367cbe` how inspect `State.Pid`
   obtains container state, nor how task create/start/restore/events update it.
   Research18's master-only inspect copy is historical context, not selected-build
   evidence; this investigation did not fetch or promote master.
2. **Reported containerd base, not dirty-build equivalence:** shim `process.Init.Create` supplies a pid-file path to
   `Runtime.Create`, reads that file and stores `p.pid`; `Init.Pid()` returns it.
   `runc.Container.Pid()` returns its main process PID. Shim `Create`, `Start` and
   `State` return that process PID (empty ExecID selects init). The runtime-v2
   `shimTask.State` copies response.Pid; task service Start/Get propagate runtime
   state.Pid; client task Start caches response.Pid and `Pid()` returns the cache.
   This is a numeric PID chain, not a transferred pidfd. [C1–C6]
3. **runc release semantics:** `runner.run` writes `--pid-file` using
   `libcontainer.Process.Pid()`. Libcontainer receives the final child PID,
   replaces `cmd.Process` with that child, and its process `pid()` returns
   `cmd.Process.Pid`. C `nsexec` forwards stage2's clone-return PID through stage0
   to runc; this is the outer runtime's PID view, not the child's own PID1 value.
   PID-file atomic rename is only atomic publication of a number, not atomic
   ownership/starttime/pidfd acquisition by Loom. [R1–R3]
4. **Controller join is still missing:** same controller/daemon PID namespace alone
   does not prove the runtime/shim/runc use that same view or that controller
   procfs was mounted for it. RootlessKit release source adds CLONE_NEWPID only
   when CreatePIDNS is selected; its cgroup namespace option is independent.
   Neither version text nor keeper accessibility establishes selected flags. [K1]
   Require the exact daemon/runtime chain and matching procfs PID view before
   direct lookup; validate TGID/NStgid/NSpid at their correct levels. NSpid begins
   at the namespace of the procfs mounter, not an unconditional global host level.
   If views differ without a trusted bounded bridge, remain blocked. [P]

## Cgroup-v2 directory binding and rootless namespace semantics

Reported containerd base `loadProcessCgroup` uses `cgroup2.PidGroupPath(initPID)` then
`cgroup2.Load(group)`. Its vendored cgroups/v3 v3.1.3 implementation reads
`/proc/<pid>/cgroup`; Load defaults to `/sys/fs/cgroup`. This establishes how the
shim discovers membership in **its own view**, not Docker-ID ownership or a
portable controller path. Inspecting a process's current group alone cannot prove
it is the originally assigned domain root after migration. [C2, C7–C9]

runc release `CreateCgroupConfig` accepts OCI Linux.CgroupsPath; with systemd it
parses `slice:prefix:name`. The vendored systemd-v2 manager resolves rootless slice
paths relative to the user manager's ControlGroup, combines the slice/unit and
unified mount, and submits the PID to the unit. Therefore a guessed
`docker-<id>.scope` suffix or daemon ancestor is insufficient: the selected Moby
OCI input, runtime options, actual manager root and observed membership must agree.
Those selected inputs remain unverified. runc's rootless cgroup error handling
also prevents treating successful container creation as universal cgroup proof.
[R2, R4–R6]

Linux v7.2.8 source reference **`9a66fdc0d7fd55f54235524a73435af99051e46f`**
documents that cgroup namespaces virtualize `/proc/<pid>/cgroup` relative to the
**reader's** cgroup namespace root; a new cgroup2 mount is rooted there. The root
is fixed at namespace creation, not changed when its creator migrates. Private
worker `0::/` is thus compatible with a deeper controller-visible group and is
not the host hierarchy root. PID, mount, user and cgroup namespace relationships
must be established separately. This upstream kernel is not distribution-build
equivalence. [L] Mountinfo identifies filesystem type, device, mount root and
mountpoint; concatenating a membership string with an arbitrary mount is unsafe. [F]

**Conservative acquisition requirements, not new implementation/authorization:**
reuse full `assertDomainContainer` before/after; bind full native ID and lifecycle
tuple to a proven init PID; anchor proc and recheck UID/TGID/starttime/namespaces;
resolve controller-read membership against a verified matching cgroup2 mount/root.
Require evidence for the originally assigned domain root, reject namespace/mount
ambiguity, traversal, shared keeper/daemon/ancestor groups and unexpected/threaded
topology. Open components beneath the trusted mount without symlink escapes;
retain the exact directory/events FDs and worker pidfd, compare object identity and
membership across confirmation, require initial live/populated evidence. Never
silently reopen a replacement path. Until the missing source/view joins resolve,
these remain admission conditions, not reasons to probe additional processes.

## Remaining blockers and next owner

**Parent/operator:** obtain sanitized embedded build identity and the authoritative
full Moby source/release reference for the selected socket-serving build; do not
upgrade, substitute a tag or equate pacman records with that peer. Then re-trace
Moby's inspect/state/event and OCI cgroup construction paths, and establish selected
runtime/shim namespace and controller mount-view joins. runc/RootlessKit release
resolution is not local build proof. Obtain the containerd build/packaging patchset
or reproducible build inputs to explain its dirty delta; do not treat the matching
base commit as an exact artifact proof. If source remains unavailable, keep native
qualification blocked and hand off provenance to the build/distribution owner;
this is not a new upstream bug claim.

**Handoff classification:** native-qualification blocker, not a confirmed runtime
or security defect. Reproduce the missing Moby lookup with the failed immutable
references below; expected is an authoritative full source/build reference, actual
is422/404 plus only a short server revision. Hypothesis: a downstream/unpublished
revision or unavailable source reference; cause is unconfirmed, not evidence of
tampering. Next owner is the selected-build/distribution owner for those references
and dependency build inputs. No issue publication or runtime remediation authorized.

**Exact source resolution can unblock semantic prerequisites only.** It cannot
make daemon/proc/pidfd/cgroup reads atomic, eliminate restart/PID ABA, establish
worker permissions, exclude cgroup migration/repopulation/escaped descendants,
qualify removal/FD lifetime or prove cleanup/workspace reuse. No worker handle
experiment ran here. Any later physical test needs separate owner allowance and
the existing contract; synthetic core `226d00f` still has no native mode. Keep
inventory unknown, action pending and reuse/reset fences intact; no G2 closure.

## Exact primary sources accessed

All links below were fetched as text/metadata, never executed. Raw source URLs
are immutable commit-addressed; tag APIs establish release associations only.

- **M (failed):** [commit API](https://api.github.com/repos/moby/moby/commits/0367cbe), same URL with `?per_page=1`; [commit page](https://github.com/moby/moby/commit/0367cbe); [raw inspect](https://raw.githubusercontent.com/moby/moby/0367cbe/daemon/inspect.go); [tag API](https://api.github.com/repos/moby/moby/git/ref/tags/v29.9.2).
- **D:** [Docker API1.56](https://docs.docker.com/reference/api/engine/version/v1.56/).
- **C0:** [commit API](https://api.github.com/repos/containerd/containerd/commits/b7a25261e029d68978bbf290df0a62fc819b3c51), [tag ref](https://api.github.com/repos/containerd/containerd/git/ref/tags/v2.4.2), [tag object](https://api.github.com/repos/containerd/containerd/git/tags/49c2af6b7b0785ff636bed8b70a86f073ce8bd6e).
- **C1:** [process/init.go](https://raw.githubusercontent.com/containerd/containerd/b7a25261e029d68978bbf290df0a62fc819b3c51/cmd/containerd-shim-runc-v2/process/init.go).
- **C2:** [runc/container.go](https://raw.githubusercontent.com/containerd/containerd/b7a25261e029d68978bbf290df0a62fc819b3c51/cmd/containerd-shim-runc-v2/runc/container.go).
- **C3:** [task/service.go](https://raw.githubusercontent.com/containerd/containerd/b7a25261e029d68978bbf290df0a62fc819b3c51/cmd/containerd-shim-runc-v2/task/service.go).
- **C4:** [runtime/v2/shim.go](https://raw.githubusercontent.com/containerd/containerd/b7a25261e029d68978bbf290df0a62fc819b3c51/core/runtime/v2/shim.go).
- **C5:** [services/tasks/local.go](https://raw.githubusercontent.com/containerd/containerd/b7a25261e029d68978bbf290df0a62fc819b3c51/plugins/services/tasks/local.go).
- **C6:** [client/task.go](https://raw.githubusercontent.com/containerd/containerd/b7a25261e029d68978bbf290df0a62fc819b3c51/client/task.go).
- **C7:** [go.mod](https://raw.githubusercontent.com/containerd/containerd/b7a25261e029d68978bbf290df0a62fc819b3c51/go.mod).
- **C8:** [vendored cgroup2/paths.go](https://raw.githubusercontent.com/containerd/containerd/b7a25261e029d68978bbf290df0a62fc819b3c51/vendor/github.com/containerd/cgroups/v3/cgroup2/paths.go).
- **C9:** [vendored cgroup2/manager.go](https://raw.githubusercontent.com/containerd/containerd/b7a25261e029d68978bbf290df0a62fc819b3c51/vendor/github.com/containerd/cgroups/v3/cgroup2/manager.go).
- Also accessed: [runtime/v2/task_manager.go](https://raw.githubusercontent.com/containerd/containerd/b7a25261e029d68978bbf290df0a62fc819b3c51/core/runtime/v2/task_manager.go).
- **R0:** [runc tag ref](https://api.github.com/repos/opencontainers/runc/git/ref/tags/v1.5.2), [tag object](https://api.github.com/repos/opencontainers/runc/git/tags/b622a5992f0ba88fda05f2fd037d151b4fc5cc88).
- **R1:** [utils_linux.go](https://raw.githubusercontent.com/opencontainers/runc/29dd3dc2b13b4123162e5fe132504bb4b15569f1/utils_linux.go).
- **R2:** [process_linux.go](https://raw.githubusercontent.com/opencontainers/runc/29dd3dc2b13b4123162e5fe132504bb4b15569f1/libcontainer/process_linux.go).
- **R3:** [nsenter/nsexec.c](https://raw.githubusercontent.com/opencontainers/runc/29dd3dc2b13b4123162e5fe132504bb4b15569f1/libcontainer/nsenter/nsexec.c).
- **R4:** [specconv/spec_linux.go](https://raw.githubusercontent.com/opencontainers/runc/29dd3dc2b13b4123162e5fe132504bb4b15569f1/libcontainer/specconv/spec_linux.go).
- **R5:** [go.mod](https://raw.githubusercontent.com/opencontainers/runc/29dd3dc2b13b4123162e5fe132504bb4b15569f1/go.mod).
- **R6:** [vendored systemd/v2.go](https://raw.githubusercontent.com/opencontainers/runc/29dd3dc2b13b4123162e5fe132504bb4b15569f1/vendor/github.com/opencontainers/cgroups/systemd/v2.go).
- Also accessed: [standard_init_linux.go](https://raw.githubusercontent.com/opencontainers/runc/29dd3dc2b13b4123162e5fe132504bb4b15569f1/libcontainer/standard_init_linux.go).
- **K0:** [RootlessKit tag ref](https://api.github.com/repos/rootless-containers/rootlesskit/git/ref/tags/v3.3.0), [tag object](https://api.github.com/repos/rootless-containers/rootlesskit/git/tags/f682327af8970268ec8acbcc58b19a150fb1c6f6).
- **K1:** [parent/parent.go](https://raw.githubusercontent.com/rootless-containers/rootlesskit/888c3189e9cdf34dcdb19011e1c7c34eb94b5393/pkg/parent/parent.go).
- **L:** [Linux stable cgroup-v2.rst](https://raw.githubusercontent.com/gregkh/linux/9a66fdc0d7fd55f54235524a73435af99051e46f/Documentation/admin-guide/cgroup-v2.rst).
- **P:** [proc_pid_status(5)](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html); **F:** [proc_pid_mountinfo(5)](https://man7.org/linux/man-pages/man5/proc_pid_mountinfo.5.html). Current maintainer documentation, not installed-release tests.

Validation: source claims checked against the fetched revisions; application,
coverage and native tests are N/A. No trusted secret scanner was run by this
researcher; parent owns final document/secret gates. No commit or phase advancement.
Parent independently rechecked Moby422, containerd commit/PID-file/membership paths
and runc/RootlessKit release associations/namespace flag code, and added the local
dirty-build limitation above. The original researcher return is retained privately.
Parent scoped secret/document checks pass: nine pinned scans across changed docs/
private collectors/sanitized metadata,32 local links/anchors and protected-file/
whitespace checks. No application/native qualification or phase advancement follows.
