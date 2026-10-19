# Pi Track 1 — Runtime Abstraction, Models, Config, Events

Release-specific follow-up: [Pi 1.3.0 API verification](10-pi-1.3.0-api-review.md)
(2026-10-19) supersedes conflicting API/config claims in this historical snapshot.

Covers checklist items 1, 25, 29, 35, 41. Pins: repo `main`
(`6f1072cc`→`395315f`, 2026-10-01), npm `0.99.2`.

## 1. SDK surface (item 1: CONFIRMED, names corrected)

- Factory `createAgentSession(options?) → { session,
  extensionsResult, modelFallbackMessage? }`
  (`packages/coding-agent/src/core/sdk.ts`).
  Minimal: `createAgentSession()` → `session.prompt()` →
  `session.dispose()`; `prompt()` resolves after the run incl. retries.
- `AgentSession` owns one conversation (model, tools, queues,
  compaction, extension runtime). Control: `prompt(text, options?)`
  (streaming requires `streamingBehavior: "steer" | "followUp"`),
  `steer()` / `followUp()` (`"queued" | "handled"`), `abort()` (stops
  + waits idle), `waitForIdle()`, `dispose()`
  (`src/core/agent-session.ts`).
- Reads: `session.subscribe(listener)` (multi-listener, per-listener
  unsubscribe), `session.messages/model/thinkingLevel/systemPrompt`,
  `session.agent.state`, `getActiveToolNames()`,
  `getLastAssistantText()`, `getSessionStats()`.
- Mapping for a harness `AgentRuntime` interface: `createAgentSession`
  ⇔ createSession, `prompt` ⇔ run, `abort` ⇔ cancel, `agent.state` +
  RPC `get_state` ⇔ getState. No such names exist natively — the
  harness defines the interface, Pi fills it.
- Lower layer: `Agent` in `@earendil-works/pi-agent-core`
  (`prompt/steer/followUp/abort/subscribe`, `steeringMode/followUpMode`,
  `activeRun.abortController`). Multi-session owner:
  `AgentSessionRuntime` (`newSession/switchSession/fork/
  importFromJsonl/dispose`) — rebind subscriptions after replacement.
- SessionManager owns the persisted/in-memory entry tree + active
  leaf; `SessionManager.inMemory()` for ephemeral runs.
- Semantic trap: `agent_end` ≠ done (retries/compaction/queued work
  may follow); `agent_settled` = no automatic work remains;
  `message_end` is authoritative; JSON `message_update` is delta-only.
  RPC `prompt` returns `started|queued|handled`, never completion.

## 25. Model abstraction (CORRECTED: no per-role models)

- No `planner/developer/reviewer` roles or per-role model settings in
  `Settings`. What exists: single active model +
  `defaultProvider/defaultModel/defaultThinkingLevel` +
  `modelThinkingLevels` + `enabledModels` + `scopedModels` cycle list;
  `setModel` (validates auth, appends `model_change`) and `cycleModel`.
- Harness per-role routing goes through **virtual models**
  (`registerVirtualModel({provider, id, route})`) — the sanctioned
  extension point, not a hack.
- Providers: ~30+ in `packages/ai/src/providers/` + OAuth/API-key
  auth; credential precedence `--api-key` > `auth.json` >
  `models.json` > env. Local: llama.cpp router + Ollama/LM
  Studio/vLLM via compatible endpoints. Custom wire/auth via
  `registerProvider()`.

## 29. Config precedence (CONFIRMED — invisible-config risk real)

- Two files: `<agentDir>/settings.json` (default `~/.pi/agent`) +
  `.pi/settings.json` (project wins, deep-merge; `defaultTools`
  `+name/-name` deltas). No task-level file; per-run override ladder
  is CLI flags / SDK options > project > global.
- Resource discovery: user dirs, then project dirs, plus
  `.agents/skills/` ancestor walk, plus `AGENTS.md/CLAUDE.md` walk —
  all able to change behavior with no project trace. **A production
  agent must run with injected `SettingsManager` (file-backed or
  in-memory), custom `ResourceLoader`,
  `SessionManager.inMemory()`, and `--no-*` flags** (`docs/sdk.md`
  "Configuring a session") — determinism is opt-in, not default.
- Trust-gating covers project resources, but `sessionDir` is read
  pre-trust and context files load regardless (see track 05).

## 35. Events (Pi-level CONFIRMED; harness-level NOT-FOUND)

- Pi emits: session stream (`agent_start/end/settled`,
  `turn_start/end`, `message_*`, `tool_execution_start/update/end`,
  `queue_update/entry_appended`, `compaction_start/end`, retry
  families) + extension hooks (`tool_call/tool_result`,
  `before_agent_start`, `context/context_with_system`,
  `before_provider_request`, `turn_end/agent_before_settle`,
  session/compaction/tree events, `provider_stream_event`
  read-only).
- No `task.created/completed`, `verification.failed`, approval, or
  stage-gate events anywhere (core, RPC types, JSON stream,
  extension types). The harness emits and owns its event model
  (e.g. via `appendEntry()` custom entries + its own bus).

## 41. Replaceability (CONFIRMED, traps listed)

- `createAgentSession({modelRuntime, settingsManager,
  sessionManager, resourceLoader, tools/...})` lets the harness own
  every boundary; custom `ResourceLoader` = full ownership.
- Traps: extensions run **in-process with full OS permissions**
  (prompts, tool calls, files, creds, history visible); CLI-bundled
  `codemode/tool_search/MCP` do NOT auto-load in SDK (harness must
  add + bind them); command-only ops deadlock from lifecycle
  handlers; session replacement invalidates old contexts.

Primary URLs: `packages/coding-agent/docs/{sdk,settings,cli,
configuration,rpc,rpc-commands,json,models,virtual-models,
custom-provider}.md` + `src/core/{sdk,agent-session,
agent-session-runtime,session-manager,settings-manager,
model-runtime,extensions/types}.ts` + `packages/agent/src/agent.ts`
(all under `github.com/earendil-works/pi/blob/main/…`).
