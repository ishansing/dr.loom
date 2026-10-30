# P2 — Conditional managed-containerd PID-file locator

Researched **2026-10-30**, source only. **Outcome:** one locator exists for the
supervised-child branch, but source defaults cannot select its actual view/path.
Next owner must supply/approve **one exact trusted filesystem view + absolute
PID-file path**, then separately approve its bounded read and candidate checks.
No runtime/PID-file/proc/cgroup/worker inspection or lifecycle occurred here.

## Baseline and evidence boundary

[Research25](25-p2-daemon-containerd-association.md) and
[research26](26-p2-daemon-containerd-retry.md) stopped at64/256 daemon tasks,
before child discovery. Neither failure is waived; do not try another larger walk.
All source citations below pin Moby29.9.2 commit
`0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c` (**M**), not current main.
Actual paths, flags, environment and configuration were **not** read.
[Research24](24-p2-static-bundle-member-verification.md) establishes current official
archive/member continuity to the2026-10-29 artifact snapshot, not reproducible exact
source/build identity. Source formulas therefore remain conditional.

## Verified conditional call/path/writer contract

Let **E** be effective daemon `Config.ExecRoot`, **R** effective `Config.Root`,
and **X** the daemon's nonempty `XDG_RUNTIME_DIR` when the rootless defaults apply.

| Branch / function | Exact source consequence |
| --- | --- |
| Actual entry | `cmd/dockerd/main.go` calls `command.NewDaemonRunner`; relevant implementation is now `daemon/command`, **not** `cmd/dockerd/daemon.go`. [S1] |
| `daemonCLI.initContainerd` | `Features["embedded-containerd"]` wins first, even over an explicit containerd address. Otherwise nonempty `ContainerdAddr` selects external mode; no supervised-child locator follows. Missing executable (`exec.ErrNotFound`) from initialization falls back to embedded mode. [S2, S3] |
| `initializeContainerd` | First `systemContainerdRunning(honorXDG)` checks address existence with `os.Lstat`; success selects external address, not a managed child. With honorXDG, address=`Join(X,"containerd","containerd.sock")`; otherwise containerd's default address. This is an existence test, not process authentication. [S4] |
| Managed caller | Only the remaining branch calls `supervisor.New(rootDir, Join(E,"containerd"), supervisorOpts(...))`, then `Start(ctx)` and assigns `ContainerdAddr=r.Address()`. [S4] |
| `supervisor.New` | State base **S**=`Join(E,"containerd")`; **PID file=`Join(S,"containerd.pid")`**; generated config=`Join(S,"containerd.toml")`; containerd runtime state=`Join(S,"daemon")`; Linux gRPC address=`Join(S,"containerd.sock")`. The PID file is **not** inside the `daemon` subdirectory. [S5, S6] |
| Persistent root | `containerdRootDir` defaults to `Join(R,"containerd","daemon")`; nonempty absolute `DOCKER_CONTAINERD_ROOT` overrides this persistent root, not S/PID-file construction. [S4] |
| Linux defaults | `config.setPlatformDefaults`: `rootless.RunningWithRootlessKit()` selects E=`Join(X,"docker")`, R=`Join(dataHome,"docker")`, dockerd PID file=`Join(X,"docker.pid")`. Otherwise E=`/var/run/docker`, R=`/var/lib/docker`, dockerd PID file=`/var/run/docker.pid`. `GetRuntimeDir` returns nonempty XDG_RUNTIME_DIR or errors; it does **not** synthesize `/run/user/<uid>`. [S7, S8] |
| Conditional default locator | RootlessKit-default supervised branch: `Join(X,"docker","containerd","containerd.pid")`; ordinary-default supervised branch: `/var/run/docker/containerd/containerd.pid`. Neither is a selected deployment path. `--exec-root` changes E; `--data-root` changes R; `--pidfile` is dockerd's own PID file, not this locator. `--containerd` selects an address; namespace flags are separate. `--rootless` alone does not establish RootlessKit-derived defaults. [S7–S10] |
| Writer and timing | **Dockerd's supervisor**, not containerd, executes `containerd --config <generated-config>`, obtains `cmd.Process.Pid` after `cmd.Start`, then calls Moby `pidfile.Write`. Write failure invokes process kill and returns error. Publication precedes successful health-check readiness. No containerd-base writer delegation needs substituting from v2.4.2/base b7a25261e029d68978bbf290df0a62fc819b3c51. [S5] |
| Format / permissions | `pidfile.Write` rejects nonpositive PID, reads any old file and refuses an old live PID; then `os.WriteFile(..., []byte(strconv.Itoa(pid)), 0644)`: decimal, no newline, **not atomic rename**. Existing file permissions are not established by the creation mode. Supervisor makes S with0700; daemon makes E with0700; existing directory ownership/modes are not thereby repaired. Actual owner/modes/ACLs/view must be checked. [S4, S5, S11] |
| Stale / recovery | `startContainerd` first calls `pidfile.Read`: positive live PID is accepted as already running without spawning or rewriting. `Read` trims whitespace, parses an integer, then uses `process.Alive`; malformed/dead returns0, other read errors block except missing file. This is neither executable/parent/starttime validation nor proof of original writer. A surviving/reparented process or reused PID can differ from a fresh direct child. [S5, S11] |
| Cleanup / restart | Monitor health-check/restart logic can replace the process/number; deferred shutdown stops its recorded daemon then removes PID file and Linux socket. Abrupt termination, publication failure or stale live-number reuse can differ. File absence is not proof of no runtime; file presence is not readiness or cleanup proof. These are upstream behaviors, **not permission to signal/remove/restart anything**. [S5, S6] |

The number is expressed in **dockerd's process PID view**; path accesses occur in
its filesystem/credential view. No new-PID-namespace argument is shown in the
supervisor call itself; its containerdSysProcAttr helper and deployment/wrappers
are not independently qualified by that call-site observation. Do not infer
actual child namespace flags from it.
Prior diagnostic context says controller/daemon PID namespace agrees and cgroupns
agrees, while mount/user namespaces differ; those are historical inputs, not fresh
rechecks here. Controller path versus anchored daemon-root path is not interchangeable.
UID ownership requires the approved user-namespace mapping, not equal-looking IDs.
Actual containerd namespace and daemon client selection remain unproved. [S5, S10]

## Smallest later approval — proposal only

1. Owner supplies trusted effective layout knowledge and selects **one** absolute
   path **and** view (controller root or identity-anchored daemon root). Do not
   infer X from UID, socket location or source defaults. No raw args/env/config
   workaround, guessed-path sequence, broad search, task/thread/children enumeration,
   or locator-supplied commands. If the view/path is unavailable, stop for that input.
2. Explicit separate approval must cover reanchoring the selected daemon and one
   PID-file candidate/read, not just approving this plan. Resolve from retained
   approved root/directory FDs with no-symlink checks on every component, reject
   traversal/magic-link surprises and replacement; an anchored proc-root capability
   is not permission for general proc traversal. Canonicalize any `/var/run` alias
   through trusted owner input, not implicit symlink following.
3. Before content, require trusted mapped owner, regular file, safe size/link count,
   and no untrusted directory/file write authority (including ACLs). Use a finite
   deadline and at most32 bytes plus1 overflow sentinel; accept only a positive
   bounded ASCII decimal PID (optionally one final newline), reject all other text.
   Retain FD and compare inode/device/owner/mode/size/mtime/ctime before/after;
   fail closed on ambiguity/change/missing/oversize. This reader is deliberately
   stricter than upstream's permissive `pidfile.Read`; do not copy its trust model.
4. Treat that number as **one candidate**, not identity. Reuse the private diagnostic
   contract's guarded comm/UID/PPID/starttime/executable-FD/expected ELF size+SHA,
   pidfd/liveness and namespace checks, with daemon/candidate rechecks around hashing.
   Expected containerd snapshot:39,473,314 bytes, SHA256
   `5e970f05f9feef7b89e6f38965ea1e91224644864e60bd6f5f3242d84e094228`.
   A mismatched/reparented candidate blocks; recovery semantics do not waive PPID.
   No second PID/path or process walk on failure. Recheck the same file publication
   under that bounded attempt; reject changed contents rather than chasing its PID.

Residuals: PID/file ABA and non-atomic proc→pidfd→executable snapshots remain;
unchanged decimal content cannot prove unchanged writer/process. Socket peer versus
actual handler is non-atomic; a matching child and hash do not establish which
containerd endpoint/client/namespace dockerd uses. Locator success is not source
proof, a cleanup flag, native admission or authority. Workers/shims/runc/lifecycles
remain forbidden; native observer disabled, G2 open, inventory/actions/reset fences
unchanged. Parent independently checks critical sources and owns final gates.

## Immutable primary URLs

- **S1:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/cmd/dockerd/main.go
- **S2:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/command/daemon_unix.go#L132-L149
- **S3:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/command/daemon_embedded_containerd.go
- **S4:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/command/daemon.go
- **S5:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/internal/containerd/server/supervisor/remote_daemon.go
- **S6:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/internal/containerd/server/supervisor/remote_daemon_linux.go
- **S7:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/config/config_linux.go
- **S8:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/pkg/homedir/homedir_linux.go
- **S9:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/command/config_unix.go#L57-L59
- **S10:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/daemon/command/config.go#L28-L33
- **S11:** https://github.com/moby/moby/blob/0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c/pkg/pidfile/pidfile.go

Collection limitation: initial execute-fetch lacked a streaming body API (three
attempts, unusable as bounded evidence); an earlier AbortSignal setup failed before
dispatch. Switched to small-text urllib reads capped at262,145 bytes, rejecting
over262,144, identity encoding, redirects disabled,20-second socket timeout.
There were19 urllib requests (17 HTTP200, two404), plus the three initial attempts:
**22 attempted requests**, exceeding the requested approximate16 budget. No further
requests made. Successful bounded texts range525–41,533 bytes; no archives/binaries,
source execution/build/install, environment/config/cache reads or binary/package/
source-archive artifact downloads.
The initial fetch attempts cannot be certified against the hard streaming cap;
do not characterize collection as fully constraint-conformant. Parent must retain
this limitation and independently validate critical claims; document/security gates
have not been run by this delegate.

## Parent independent review — source only

Original researcher return/hash preserved before parent edits under private0700
key `containerd-locator-plan-u0607joa`. Parent independently retrieves11 exact
commit-addressed source files above: all HTTP200, text/plain/identity encoding,
802–41,533 bytes, all within the256KiB+1 read ceiling, no redirects. Copies/source/
response hashes and exact command/exit manifests are retained as0600 files;
source is never compiled or executed.
The reused metadata reader passes8 boundary checks plus the exact pinned-path
manifest check. These bounded checks do not erase the original22-request/cap
exceptions or claim that original collection met all constraints.

Critical parent review corroborates init external/embedded precedence, effective
ExecRoot→supervisor state/PID-file formula, cmd.Process.Pid publication by dockerd,
0644 non-atomic Write, live-number startup reuse, monitor readiness/removal behavior,
rootless GetRuntimeDir without UID fallback and separate flag/root overrides.
No actual managed/external/embedded branch, ExecRoot/XDG value, file or view is
observed. Existing64/256 failures remain unchanged and no new runtime connection
or larger process walk runs.

Next decision is still trusted owner input for **one exact view + absolute path**
and explicit bounded-read/candidate-check approval. Do not implement or probe a
default-shaped path merely because the source formula is now known. Final scoped
checks pass: four document/24 private-text pinned secret scans,42 local links/
anchors, governance/protected-input/review identities, source/command/result/
original-return hashes, unchanged64/256 failures, private modes, offline reader
self-test and whitespace. Full diff reviewed; final document hashes retained
privately. New notes remain uncommitted; no runtime/app/G2 pass.
