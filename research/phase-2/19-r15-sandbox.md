# R-15 — Sandbox Orchestration

Status: design. No `src/` changes (implementation rides later
milestone build authorization).
Grounding: isolation precedents (gVisor userspace kernel, Firecracker
microVMs, seccomp/capability dropping — 01 §2.5); agent sandbox
shapes (OpenAI manifest+clients, Claude Seatbelt/bubblewrap, Codex
OS-enforced modes, Deep Agents backends — 02); R-07 (OpenCode has no
isolation primitive; approval is not a sandbox); R-13 threads; R-17
teardown deferral landing here; R-18 boundary invariant.

**2026-10-20 decision:** [Pi execution findings](../pi/11-pi-1.3.0-execution-coverage.md)
make whole-runtime isolation a prerequisite of the Pi adapter, not optional
later hardening. See [SPEC](../../SPEC.md#runtime-architecture-and-security-boundary-2026-10-20-decision)
and [T-15's revised order](../pi/07-loom-v01-mapping.md). No backend has yet
been implemented or certified by this research.

## Rule

The sandbox is the walls, not the judge. Authorization (R-18) decides
what may run; the sandbox confines what running can touch. Either
layer failing alone must still leave the other standing — that
independence is the whole point of defense in depth.

Confine the **whole Pi SDK runner/process tree**, including startup imports,
extensions, MCP helpers and provider/model callbacks, not merely Bash/tool
backends. The trusted Loom supervisor, ledger, policy, verification and
privileged operations stay outside; communication is narrow and bound to
supervisor-established identity. In-process SDK embedding beside host
authority does not satisfy this boundary.

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
- Production/provider credentials and the Loom DB stay outside the domain;
  provider/privileged access is narrowly mediated with controlled egress.
  Do not inherit host secrets or mount host auth stores. Resource limits
  (CPU/mem/disk + pids) apply to the whole domain, paired with R-16 budgets.
- Dev-only unsandboxed local backend exists (mirrors Deep Agents'
  `LocalShellBackend`) behind an explicit flag, loudly labeled in
  every audit row it touches. Trusted synthetic development only: no
  untrusted repository/tool execution or production authority. Never the
  default; CI refuses it.
- Raw shell writes only disposable candidate workspace state, not protected
  host/project state. Promotion, merge and deployment pass through owned
  Loom operations with final-input/live authorization checks. No successor
  reuses a writable workspace until old writers are confirmed stopped.

## Per-run vs per-thread sandboxes

- Default: **one sandbox per run**. Threads share the run workspace
  (consistent with the workspace-wide lease — one holder, one
  filesystem view); the lease coordinates cooperating threads, not hostile
  writers. Raw shell/process access cannot be fenced by a SQLite epoch alone;
  require quiescence before ownership reuse and gate protected promotion.
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

- Kill in scope → external **freeze/stop + preserve evidence**, not blind
  destroy: verify the whole local domain is quiescent, preserve filesystem
  state, and record snapshot/evidence refs where supported. Failure remains
  visible and blocks reuse; a Pi abort ACK alone does not establish this.
  Forensics needs the crime scene; destroy comes later by explicit
  human action (audited), never automatically.
- New spawns refused while kill is engaged (gate check in `spawn`).
  Thaw/resume is not a primitive — a killed run's work continues only
  as a new run over a fresh sandbox (R-12 phases-never-reopen,
  extended to sandboxes).
- Already-dispatched remote actions may still complete after the domain
  stops. Reconcile them under R-17/R-19; neither snapshot nor process cleanup
  proves remote rollback. Test escaped process groups and delayed effects
  with the selected backend before enabling untrusted execution.
