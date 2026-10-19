# Pi Track 4 — Verification, Tool Gateway, Tools, Skills

**2026-10-19 correction:** the `tool_call` gateway is not universal effect
interception or a fail-closed completion gate. See the release-specific
[Pi 1.3.0 execution coverage](11-pi-1.3.0-execution-coverage.md) and
[API review](10-pi-1.3.0-api-review.md) before using the historical claims below.

Covers checklist items 13, 14, 26, 27, 28.

## Verification layer (item 13: `agent_before_settle` boundary)

- Actionable boundaries: `turn_end` + **`agent_before_settle`**
  (final actionable — append `custom/custom_message/context_edit/
  compaction` entries + one `continue:true` continuation; guard it
  or it loops). `agent_settled` is notification-only.
  (`BoundaryState/BoundaryResult` in `extensions/types.ts`.)
- Fail-safe errors: `tool_call` handler failure blocks the tool;
  tool `execute()` throw becomes a model-visible error result;
  `user_bash` handler failure blocks instead of falling through.
- Agent-level retry is transient-only (`retry.enabled`,
  `maxRetries 3`, backoff; provider timeouts/retries) — not a
  done-verifier. Compaction hook is cancellable/customizable
  (`session_before_compact`: cancel/supply, reasons
  manual/threshold/overflow).
- **No built-in run-checks-before-done exists** (events/CLI/settings
  index negative): "never trust done" lives in harness/extension
  code at `turn_end`/`agent_before_settle`. `packages/evals` is
  dev-time behavioral/docs-lift (Docker paired arms, `.eval/`
  protocol artifacts) — not a runtime settle gate.

## Tool gateway (item 14: single `tool_call` point — with limits)

- `tool_call` mutates `input` in place or blocks via
  `{block, reason, terminate?}` (later handlers see mutations, no
  re-validation); `tool_result` composes in order (redact `content`
  without `structuredContent` and it drops).
- Coverage confirmed: **every MCP call passes through the Pi tool
  pipeline** (gates apply); nested `ctx.executeTool()` re-enters
  validation + handlers with `parentToolCallId` (`<parent>/<n>`,
  transcript-silent, bounded 8KiB/call / 32KiB/result / ≤256,
  usage bubbles up); `ctx.tools` + exposure defines callability;
  `tool_search` loads deferred tools for the next call.
- Bash depth: `BashSpawnHook{command,cwd,env}`, pluggable
  `BashOperations.exec`, `commandPrefix`, `shellPath`,
  `exposeSessionEnvironment` (`PI_SESSION_ID/FILE/…`); `user_bash`
  (`!`/`!!`): `undefined` = passthrough, operations/result = stop,
  `createLocalBashOperations()` preserves-while-wrapping.
- Codemode scripts reach outside ONLY via `tools.*` + `models`
  (QuickJS: no Node/fs/network/timers, 256MB, no script-spawned
  scripts). Programmatic results differ from model text (bash →
  `{output≤1MiB, exit_code, wall_time}`; MCP → full CallToolResult).
- Limits: annotations (`readOnlyHint/destructiveHint/…`) are
  unverified author hints — the permission extension decides;
  parallel sibling calls must not assume each other; turn-scoped
  `ctx.signal` discipline required.

## Capability tools (item 26: no semantic ops — compose them)

- Built-ins exactly `read,bash,powershell,edit,write,grep,find,ls`
  (default on: first four); built-in extensions add `codemode`
  (JS calling tools, only script output reaches model) +
  `tool_search` (both off by default). No `runTests/
  readProjectFile/applyPatch/searchCode/createCommit`.
- Custom tools: `registerTool({name,label,description,TypeBox
  parameters,execute})` → `content+details` (throw = failed);
  `withFileMutationQueue()` for read-modify-write; truncate large
  results. Exposure: `direct` (default) / `model-only` / `codemode` /
  `deferred` / `hidden` (re-register to withdraw — no unregister);
  orchestrators reshape the model view via
  `prepareLoadout()`; `getActiveTools/setActiveTools`.
- So semantic ops are harness-built custom tools over raw
  primitives + scripts — the mechanism fully supports it, the
  catalog doesn't exist. Raw shell stays available but wrapped
  (spawn hook + gateway), never the only abstraction.

## Extensions vs harness logic (item 27: coupling traps listed)

- `ResourceLoader` supplies extensions/skills/prompts/themes/
  context files (user dirs + `.pi/` + `AGENTS.md` walk + skills
  ancestors); custom loader = full ownership.
- MUST live in extensions (Pi-specific): tools, `/` commands,
  shortcuts/flags, providers, MCP servers, virtual models,
  terminal rendering, lifecycle hooks, cross-extension bus.
- MUST stay outside (lifecycle/orchestration): builtins are
  replaceable (`replaceable:true`, `-builtin:<name>`, SDK sessions
  don't auto-load them — add `createCodemodeExtension/
  createToolSearchExtension/createMcpExtension` + `bindExtensions()`
  explicitly).
- Traps: in-process full-OS-perms execution (trust sources only);
  no processes/sockets/timers in factories (start at
  `session_start`, idempotent `session_shutdown` cleanup);
  command-only ops deadlock from lifecycle handlers; session
  replacement invalidates old contexts (capture plain data first).

## Skills (item 28: spec-conformant; NO top-k router)

- Agent Skills spec: dir + `SKILL.md` (frontmatter
  name/description/license/compatibility/metadata/
  allowed-tools) + scripts/references/assets. Discovery: recursive
  scan of user + project + ancestor + package + settings dirs.
- Routing: startup advertises **name+description+path only**; full
  body loads on demand by model match; `/skill:name` forces.
  **Correction: no top-k/reranker found** — description match is the
  router, with a documented "model might fail to load relevant
  skill" failure. Harness needing reliable skill use should force
  (`/skill:`) or gate on load, not hope.
- Distinctions: skill = on-demand instructions+files, no new
  executable point (scripts/assets bundled); prompt template =
  reusable message text; extension = tools/commands/events/UI.
  Subagents are extension/package-provided, distinct from skills
  (`pi-code` Subagents with worktree isolation; `@nicknisi/
  pi-codemode` hermetic `spawn` + Runscope ledger).

Primary URLs: `packages/coding-agent/docs/{extensions,cli,
settings,mcp,codemode,skills,configuration}` +
`src/core/{tools/bash.ts,extensions/types.ts}` +
`examples/extensions/` + `packages/pi-code`, `@nicknisi/pi-codemode`
(gallery).
