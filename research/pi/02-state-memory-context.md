# Pi Track 2 — State, Memory, Context, Tasks, Artifacts

Covers checklist items 2, 3, 4, 5, 6, 10, 36, 37.

## SessionManager authority (items 2–3: CONFIRMED)

- Owns model conversation context: `buildSessionProjection()` /
  `buildSessionContext()` / `buildContextEntries()` resolve the
  active branch into LLM messages; the agent loop consumes the
  projection before every request
  (`session-manager.ts`, `agent-session.ts`).
- Store: JSONL v3 (`session` header + typed entries), at
  `~/.pi/agent/sessions/--<cwd>--/<ts>_<id>.jsonl` (overridable
  `--session-dir` / env / setting; `--no-session` ephemeral).
  Append-only write API (`appendMessage/appendCompaction/
  appendCustomEntry/appendContextEdit/…`, all return entry IDs) +
  traversal (`getBranch/getTree/getEntry/getLeafId/…`).
- **Correction:** Pi OWNS branching (`/tree` move-in-file, `/fork`
  new session, `/clone` copy, `branch/resetLeaf/
  branchWithSummary/forkFrom`). The harness must observe/drive Pi's
  tree, not re-implement branches as separate state.

## Compaction (item 6: CONFIRMED, lossy default)

- Trigger: `contextTokens > contextWindow − reserveTokens`
  (defaults `reserveTokens 16384`, `keepRecentTokens 20000`;
  per-project/per-model overrides). Cut-point walks back from newest
  to the keep budget; everything before is summarized.
- Survives: `CompactionEntry{summary, firstKeptEntryId (required),
  tokensBefore, systemMessage checkpoint, usage, details{readFiles,
  modifiedFiles}}`. Raw pre-cut entries stay on disk, leave context.
- Hooks exist: `session_before_compact` (cancel or supply summary;
  reasons manual/threshold/overflow) + `session_compact`,
  `custom-compaction.ts` example. **But default = lossy LLM summary
  with no schema guarantee for decisions.** Safe design = harness
  owns decisions externally AND/OR injects them via the hook.
  Unhooked critical decisions 150 messages back are not guaranteed
  to survive — the checklist claim stands.

## Context construction (item 5: hook-vs-accept mapped)

- Pipeline: active branch → system prompt + tools + skills →
  provider stream → record → tools → next turn. Leaf→root walk
  honoring latest compaction; latest `context_edit` per target wins
  (`null` omits); system prompt is a patched transcript (sections +
  `toolsAdded/toolsRemoved` deltas replayed).
- CAN hook: `context` (transform messages), `context_with_system`
  (own full transcript, keep system at index 0),
  `before_agent_start` (patch sections/tools — prefer over replacing
  `systemPrompt`), `before_provider_request` (replace payload),
  `message_end/tool_call/tool_result` transforms,
  `turn_end/agent_before_settle` (append custom/context_edit/
  compaction + one `continue:true` — guard it, unconditional loops).
- MUST accept: tree shape, compaction checkpoint replay,
  `firstKeptEntryId` windowing, system-section patch protocol.

## Working vs long-term memory (item 4: no distinction in core)

- Core has NO working/long-term types, stores, or lifecycle; NO
  `.pi/memory`, `MEMORY.md`, archival/search memory; NO memory tool
  (built-ins are exactly read/bash/powershell/edit/write/grep/find/
  ls + inactive codemode/tool_search/MCP/llama).
- "Memory-ish" reality = context files (`AGENTS.md/CLAUDE.md`,
  `SYSTEM.md` replace / `APPEND_SYSTEM.md` append, no trust
  required) + skills as **metaphor-only** procedural memory
  (on-demand instruction bundles, name+description+path advertised,
  body loaded on match — zero per-project recall state).
- Harness memory slot: extension state entries — `custom` (durable,
  excluded from context) vs `custom_message` (injected, display
  controlled) vs tool-result `details` (branch-sensitive — the
  `todo.ts` example stores todos there so branching rewinds state).
  Reconstruct from `getBranch()` on `session_start`. Virtual-model
  router state already lives in `custom` entries (precedent).

## Task graph (item 10: harness owns; durable experimental only)

- Default loop: NO task/dependency primitive (no todos, no plan
  mode, no goal-mode; `steeringMode/followUpMode` are message
  delivery, not tracked work). `todo.ts` is example-only.
- `TaskGraph`/`defineTask()`/`Harness`/`LiveDoc` exist ONLY in
  experimental `@earendil-works/pi-durable`
  (`packages/durable/src/harness/task-graph.ts`), consumed under
  `src/experimental/` (SQLite sessions, `/tasks` panel, subagent
  tool). Explicitly experimental — harness owns `tasks.json` +
  dependencies for the standard CLI; may mirror into tool-result
  `details`/`custom` entries per the `todo.ts` pattern.

## Artifacts/decisions (items 36–37: NOT-FOUND, harness owns)

- No `artifacts/`, no `decisions.json`, no decision log (repo-wide
  search negative). `/export` is a transcript renderer (HTML/JSONL),
  `/share` + `/bug` are sharing channels (with secrets warning).
- Harness slot: `custom`/`custom_message`/`context_edit`/compaction
  entries via `appendEntry()`/`sendMessage()`, chained at
  `turn_end`/`agent_before_settle`, rendered with
  `registerEntryRenderer` — optionally carrying an external artifact
  index (`CompactionEntry.details` docstring even cites
  "e.g., ArtifactIndex"). Session naming/labels are bookmarks, not
  logs. **Harness owns `artifacts/` + `decisions.json` itself.**

Primary URLs: `packages/coding-agent/{src/core/{session-manager,
agent-session,slash-commands,messages,system-prompt,session-export,
resource-loader,skills},docs/{sessions,session-format,compaction,
configuration,skills,settings},examples/extensions/{todo,
custom-compaction,entry-renderer,handoff,git-checkpoint}.ts}` +
`packages/durable/src/harness/task-graph.ts`.
