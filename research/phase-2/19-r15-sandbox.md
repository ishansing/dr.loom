# R-15 — Sandbox Orchestration

Status: design. No `src/` changes (implementation rides later
milestone build authorization).
Grounding: isolation precedents (gVisor userspace kernel, Firecracker
microVMs, seccomp/capability dropping — 01 §2.5); agent sandbox
shapes (OpenAI manifest+clients, Claude Seatbelt/bubblewrap, Codex
OS-enforced modes, Deep Agents backends — 02); R-07 (OpenCode has no
isolation primitive; approval is not a sandbox); R-13 threads; R-17
teardown deferral landing here; R-18 boundary invariant.

## Rule

The sandbox is the walls, not the judge. Authorization (R-18) decides
what may run; the sandbox confines what running can touch. Either
layer failing alone must still leave the other standing — that
independence is the whole point of defense in depth.

## Backend ladder (deploy picks one, harness abstracts all)

- **OS sandbox** (Seatbelt / bubblewrap / namespaces + seccomp):
  cheapest, per-process syscall and filesystem confinement. Default
  for single-tenant dev and CI agents.
- **Containers** (Docker/OCI, rootless, no `--privileged` ever):
  the portable unit — same image local and remote, explicit mount
  list, default seccomp profile tightened. Default for shared
  runners and staging deploys.
- **MicroVMs** (Firecracker + `jailer`, cgroup/namespace barrier):
  hardware-virtualization isolation at container speed for
  untrusted/multi-tenant workloads (third-party skills, public
  runbooks, prod-adjacent agents).

The harness defines one backend interface — `spawn(spec)`,
`exec(handle, cmd)`, `snapshot(handle)`, `destroy(handle)` — and the
deployment chooses the rung. Runs never select their own rung
(a run that can choose weaker confinement will).

## Invariants (every backend, no exceptions)

- Workspace-root confinement (R-18): mounts limited to the run
  workspace + explicit read-only inputs; `..`/symlink escape denied
  by resolution, verified per backend at deploy time.
- No network by default; egress only via proxy allowlist recorded in
  the run (pairs with R-18 network-ask and R-03 egress tier).
- No privilege: drop `ALL` capabilities, add back the documented
  minimum (never `SYS_ADMIN`); no root, no container-escape paths
  (docker socket, host mounts) mounted, ever.
- Secrets via env injection only; resource limits (CPU/mem/disk +
  pids) set on every spawn, paired with R-16 time budgets.
- Dev-only unsandboxed local backend exists (mirrors Deep Agents'
  `LocalShellBackend`) behind an explicit flag, loudly labeled in
  every audit row it touches. Never the default; CI refuses it.

## Per-run vs per-thread sandboxes

- Default: **one sandbox per run**. Threads share the run workspace
  (consistent with the workspace-wide lease — one holder, one
  filesystem view); isolation between cooperating threads is the
  lease's job, not the kernel's.
- Option: **one sandbox per thread** when threads are mutually
  untrusted (runbook-declared, e.g. third-party subagents). Sharing
  then happens only through recorded handoffs (R-13), and shared
  paths are mounted read-only into children except the handoff
  directory. Cost noted honestly: per-thread sandboxes multiply
  spawn time and disk — the runbook pays it knowingly.

## Snapshots (evidence, not just revert)

- Pre-effect snapshots for high-risk+ actions where the backend
  supports it cheaply (container layers, microVM mempins); the
  snapshot id becomes R-11 evidence on the action row.
- OpenCode's lesson reused properly: snapshots are audit material
  first, revert aids second.

## Kill integration (R-17 deferral lands)

- Kill in scope → **freeze + snapshot**, not destroy: execution
  halted, filesystem preserved, snapshot id recorded on the kill row.
  Forensics needs the crime scene; destroy comes later by explicit
  human action (audited), never automatically.
- New spawns refused while kill is engaged (gate check in `spawn`).
  Thaw/resume is not a primitive — a killed run's work continues only
  as a new run over a fresh sandbox (R-12 phases-never-reopen,
  extended to sandboxes).
