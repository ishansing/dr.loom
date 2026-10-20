# Pi Track 5 — Security

**2026-10-20 decision:** the [release audit](11-pi-1.3.0-execution-coverage.md#6-adopted-loom-design-decisions-2026-10-20)
and [SPEC](../../SPEC.md#runtime-architecture-and-security-boundary-2026-10-20-decision)
adopt whole-Pi execution-domain isolation, an external Loom authority and
owned privileged-operation/output/completion gates. The historical evidence
below explains why permissions, hooks and tool-only sandboxes are insufficient.

Covers checklist items 15, 16, 17, 18, 19, 20, 21, 22, 23.
All quotes below are verbatim from current `main` docs (2026-10-01).

## 15. No OS boundary (CONFIRMED — and recently reaffirmed, not new)

- "Pi does not include a built-in permission system for restricting
  filesystem, process, network, or credential access. By default, it
  runs with the permissions of the user and process that launched
  it." (`README.md`)
- "A partial in-process sandbox would be easy to misunderstand as a
  security boundary … Real isolation needs to come from the operating
  system or a virtualization/container boundary." (`security.md`)
- "Local code execution or sandboxing behavior (the Pi coding agent
  intentionally does not have a sandbox)" is Out Of Scope
  (`SECURITY.md`). No boundary change in recent history (last
  `SECURITY.md` touch: typo fix).

## 16. Permission extensions ≠ boundary (CONFIRMED, docs' own framing)

- "An extension runs inside the Pi process with the same
  operating-system permissions. It can inspect prompts, tool calls,
  files, credentials, and session history." (`extensions.md`)
- In-repo examples are UX protection: `permission-gate.ts` (bash
  regex → select-or-block, fail-closed headless), `protected-paths.ts`
  (write/edit only, `.env/.git/node_modules` substring — no
  bash/read coverage, no OS enforcement), `confirm-destructive.ts`
  (session switch/fork only). Package docs: "Approval Guardian
  reduces risk but is not an operating-system sandbox."
- Core added only general mechanisms lately (`exposure`,
  `prepareLoadout`, `ctx.executeTool`) — not a boundary.

## 17. Credential isolation (CONFIRMED + proxy stories)

- "Keep credentials outside the environment where possible, or use
  narrowly scoped, short-lived credentials." Keys live in
  `<agent-dir>/auth.json` (`0600`); resolution `--api-key` >
  `auth.json` > `models.json` > env; `!command` supports secret
  managers. "Mounting `~/.pi/agent` exposes your Pi credentials…"
  (`containerization.md`).
- Docker Sandboxes proxy keeps the real provider key on the host
  (don't `/login` inside). **Gondolin is explicitly NOT a credential
  boundary** (VM inherits host env — documented).

## 18. Prompt injection (CONFIRMED — out of scope upstream)

- "Files, comments, instructions, command output, and model responses
  can steer the model through prompt injection." "Pi relies on users
  installing trustworthy extensions … this cannot be protected
  against." (`security.md`, `SECURITY.md` — both list injection and
  untrusted-repo work as Out Of Scope.)
- No core labeling/sandbox/classifiers-as-firewall. Delimiting lives
  in extensions (`pi-safe-search`: NFKC, zero-width strip, redact
  patterns, random-delimiter wrap — "guidance, not a guarantee";
  `@pithos-kit/web`: `UNTRUSTED` boundaries). **The harness owns the
  data-vs-instructions distinction** (Loom R-03/R-18 treat tool
  output as untrusted input — Pi agrees and provides no alternative).

## 19. Project trust (CONFIRMED — trust≠sandbox, hole still open)

- "Project trust is not a complete startup boundary." / "Project
  trust does not limit what tool calls can access or affect." /
  "Watching the transcript, using project trust, and reviewing
  changes do not create a security boundary." Protected set:
  `.pi/{settings,mcp.json,extensions,skills,prompts,themes,
  SYSTEM.md,APPEND_SYSTEM.md}` + project `.agents/skills` (bare
  `.pi/` dir alone needs no trust).
- Decision order: `--approve/--no-approve` > `project_trust`
  handler > saved `trust.json` > `defaultProjectTrust` (`ask`
  default; headless `ask`/`never` skips, `always` loads).
- **sessionDir hole still present and documented**: read pre-trust,
  declining trust can't undo the lookup; context files
  (`AGENTS.md` etc.) load regardless of trust.

## 20. Human approvals (CORRECTED — no core primitive)

- Only generic `ctx.ui.confirm/select/notify` + `tool_call→{block}`
  + `session_before_*→{cancel}`. All confirm UX is examples/packages
  (`permission-gate`, `pi-ask-user`); discussion #2629 confirms
  absence ("pi does not support built-in ask"); issue #8835 notes a
  missing `tool_approval_requested` event (observability ask, not
  policy). Abort-during-confirm had real bugs (fixed) — approval
  lives outside any atomic core transaction. **Destructive-op gating
  (deploy/migrations/delete/infra/merge/secrets) is entirely
  harness-owned.**

## 21. Filesystem boundaries (CONFIRMED verbatim)

- "The working folder controls resource discovery and the default
  location for tools, but it does not prevent commands from
  accessing other paths available to the Pi process."
- Isolation rungs: plain Docker (whole-pi container) / Docker
  Sandboxes (managed + cred proxy) / OpenShell (FS/process/net/
  credential/inference policies) / Gondolin (tool-routing to
  micro-VM, host creds inherited).

## 22. Git integration (CORRECTED — session-tree only)

- No `git`/worktree/revert tool in core (built-ins: read, bash,
  powershell, edit, write, grep, find, ls). Core branching is
  conversation-tree (`/tree /fork /clone /compact`), not git.
- Only in-repo demo: `git-checkpoint.ts` (ephemeral in-memory
  stash map, cleared on settle). Real worktree/checkpoint/revert
  are third-party extensions (`checkpoint-pi`, `@ian-pascoe/
  pi-git-checkpoints`, `@tylerho/pi-worktree`,
  `pi-worktree-extension`). Session-per-branch NOT-FOUND in core.
  **Branches/worktrees/checkpoints/record-which-task-changed-what
  are harness/extension-owned** — Loom's R-19/R-11 layer, not Pi's.

## 23. Parallel conflicts (NOT-FOUND in core)

- Core documents only same-turn parallelism (siblings may not
  exist; `parallel` vs `sequential` execution; `beforeToolCall/
  afterToolCall`) + in-process `withFileMutationQueue()` for
  read-modify-write. No cross-process ownership, locking, worktree
  allocation, or dependency rules (absence from tools tables +
  extension-ownership evidence; ownership patterns live in
  third-party packages: worktree-per-feature, swarm DAG+mailbox,
  read-only agents). **File/task ownership, locking, and dependency
  rules are harness-owned** — Loom's lease layer (R-04/R-09) fills
  a Pi vacuum, confirmed twice over.

Primary URLs: `packages/coding-agent/docs/{security,
containerization,extensions,cli,usage,configuration}` +
`SECURITY.md` + `README.md` + `examples/extensions/
{permission-gate,protected-paths,confirm-destructive,
git-checkpoint}.ts` + package pages (approval-guardian, checkpoint,
worktree family, swarm) + discussions/issues `#2629/#8835/#4276`.
