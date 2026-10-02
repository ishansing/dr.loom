# Agent Harness Subsystems — Deep Research

Status: research synthesis, not a design decision. Companion to
`01-harness-engineering.md`; goes one level deeper into the five subsystems
every agent harness implements. Framework baseline: I2P `1d66588` (v2.1.0).

Method: primary sources only (official API docs, specs, repos, lab essays).
`[UNVERIFIED]` = no primary source found in this pass; treat as synthesis.
URLs verified at time of writing (2026-09).

## Part 1 — Model Interface

The boundary between harness code and foundation-model APIs: message shapes,
tool-calling wire format, structured output, streaming, sampling controls,
metering, and the abstraction layers that normalize them.

### 1.1 Anthropic Messages API

- Roles in `messages[]` are only `user` / `assistant` — there is no `system`
  role; the system prompt goes in top-level `system` (string or block
  array). Consecutive same-role turns merge; a trailing `assistant` message
  acts as prefill constraining the continuation.
  (https://platform.claude.com/docs/en/api/messages)
- Newer models accept mid-conversation `{"role":"system"}` messages after a
  user turn to append instructions without invalidating the cached prefix;
  they cannot be the first entry.
  (https://platform.claude.com/docs/en/build-with-claude/working-with-messages)
- Every non-streaming response carries non-null `stop_reason`; in streaming
  it is null in `message_start`, set thereafter. Values: `end_turn`,
  `max_tokens`, `stop_sequence`, `tool_use`, `pause_turn`, `refusal`,
  `model_context_window_exceeded`.
  (https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons)
- `tool_use` response = run tools and return results. Blocks live in
  assistant `content` as `{type, id, name, input}` (input is an object);
  continuation is a `user` message of `tool_result` blocks, one per use.
  Do not append extra `text` after `tool_result` — it teaches empty-turn
  behavior and causes empty `end_turn` responses.
  (https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview;
  https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons)
- Client tools (user-defined, incl. Anthropic-schema `bash`/`text_editor`)
  execute in your app on `stop_reason: tool_use`. Server tools
  (`web_search`, `web_fetch`, `code_execution`, `tool_search`) run on
  Anthropic infra and return inline — unless mixed with client tools in one
  parallel group.
  (https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- `tool_choice` default `{"type":"auto"}`; `any`/`tool` prefill the
  assistant message (no natural-language preamble) but cost more tokens and
  are rejected (400) by some models/settings — use `auto` + strict or
  structured outputs there. `disable_parallel_tool_use` forces single calls.
  (https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview;
  https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)
- Token counting is `POST /v1/messages/count_tokens` with the same shape
  (`system`, `tools`, images, PDFs) returning `{input_tokens}` — an
  estimate, free but separately rate-limited; `cache_control` is accepted
  but does not exercise caching. Server tools / MCP connector / URL image
  sources are rejected (send base64). Claude 4.7+ tokenizers yield ~30%
  more tokens for the same text — recount per target generation.
  (https://platform.claude.com/docs/en/build-with-claude/token-counting)
- Prompt caching: automatic (single top-level `cache_control` on the last
  cacheable block, moves forward each turn) or explicit (up to 4
  breakpoints). TTL 5-min default, `1h` at 2× write cost. Coverage is the
  full prefix in order `tools → system → messages`. Writes happen only at
  breakpoints (cumulative hash); reads walk back ≤20 blocks — a breakpoint
  on a changing suffix (timestamps) never hits; put it on the last stable
  prefix. Minimum cacheable lengths vary by model (1024/2048/4096 tokens).
  Accounting: `usage: {cache_creation_input_tokens,
  cache_read_input_tokens, input_tokens}` (input = post-breakpoint only).
  Tool-def edits invalidate everything.
  (https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- Streaming is SSE: `message_start → (content_block_start →
  content_block_delta* → content_block_stop)* → message_delta+ →
  message_stop`, plus `ping`/`error`; `usage` in `message_delta` is
  cumulative. Delta types: `text_delta`, `input_json_delta.partial_json`
  (accumulate until `content_block_stop`), `thinking_delta` +
  `signature_delta`.
  (https://platform.claude.com/docs/en/build-with-claude/streaming)

### 1.2 OpenAI: Chat Completions vs Responses

- Responses (`/v1/responses`) is positioned as unifying Chat Completions
  (approachable) + Assistants (powerful), purpose-built for multimodal +
  reasoning; Chat remains supported, Responses is recommended for new
  projects. Cited motives: agentic loop with multiple built-ins in one
  request, reasoning-state preservation across turns, 40–80% better cache
  utilization.
  (https://developers.openai.com/blog/responses-api)
- Data-model shift: Chat input/output = `messages[]` + `choices[n]`;
  Responses input = string or Items + top-level `instructions`, output =
  typed `output[]` with `id` where `message`, `reasoning`,
  `function_call`, `function_call_output` are distinct Items. Responses
  drops `n` (no parallel generations).
  (https://developers.openai.com/api/docs/guides/migrate-to-responses)
- State strategies (four, documented): `result.history`/`to_input_list()`
  (local replay), `session` (app storage + SDK), `conversationId`
  (Conversations API), `previous_response_id` (Responses chaining). Mixing
  local replay with server state can duplicate context — pick one per
  conversation.
  (http://developers.openai.com/api/docs/guides/agents/running-agents)
- Structured Outputs, two forms: (1) function calling with `strict:true`,
  (2) `text.format: {type:"json_schema", strict:true, schema}` for
  model-to-user output. Only Structured Outputs guarantees schema
  adherence (JSON mode guarantees only valid JSON). `strict:true` requires
  `additionalProperties:false` everywhere and all properties in `required`
  (optional = `type:["string","null"]`).
  (https://platform.openai.com/docs/guides/structured-outputs;
  https://developers.openai.com/api/docs/guides/function-calling)
- Function-calling flow (5 steps): send tools → receive `function_call`
  Items (`call_id`, `name`, `arguments` JSON string) → execute locally →
  send `function_call_output` linked by `call_id` → final message (or more
  calls). Reasoning models must also replay `reasoning` Items.
  (https://developers.openai.com/api/docs/guides/function-calling)
- `tool_choice`: `auto` (0..n), `required` (1..n), forced
  `{type:"function", name}`, cache-friendly `allowed_tools` subsetting,
  `none`. Parallel calls are model-side; `parallel_tool_calls:false`
  forces 0-or-1; from GPT-5 functions parallelize even with built-ins
  present, but built-ins cannot join the same batch.
  (https://developers.openai.com/api/docs/guides/function-calling)
- Reasoning config `reasoning: {effort}` (`none/minimal/low/medium/high/
  xhigh/max`, model-dependent); reasoning tokens are invisible, occupy
  context, bill as output; overflow yields `status:incomplete /
  reason:max_output_tokens`, possibly with zero visible text. Continuity
  (`context: auto|current_turn|all_turns`) needs `previous_response_id`,
  conversation attachment, or full replay incl. `encrypted_content`.
  (https://developers.openai.com/api/docs/guides/reasoning)
- Responses streaming is semantic SSE: `response.created/completed/error`,
  `response.output_item.added|done`, `response.output_text.delta|done`,
  `response.function_call_arguments.delta|done`, plus tool-specific
  substates. Function streaming aggregates argument chunks into final
  `arguments` JSON.
  (https://developers.openai.com/api/docs/guides/streaming-responses?api-mode=responses)

### 1.3 Abstraction layers (what they normalize, what leaks)

- LangChain `BaseChatModel`: `invoke()` / `stream()` (`AIMessageChunk`
  summable via `+`) / `batch()` (client-side parallelism); `max_retries`
  default 6 (429/5xx + network, not 401/404); `bind_tools()` converts
  functions/Pydantic/TypedDict to provider schemas; `.tool_calls[]` +
  `ToolMessage.tool_call_id` correlation; `with_structured_output()`
  with `ProviderStrategy` (native) auto-selected from `model.profile`
  (`max_input_tokens`, `tool_calling`, `structured_output`, … sourced
  from models.dev). Leaks: provider kwargs (e.g. `use_responses_api`),
  `tool_choice="any"`, `parallel_tool_calls=False` (OpenAI/Anthropic-class
  only).
  (https://docs.langchain.com/oss/python/langchain/models;
  https://docs.langchain.com/oss/python/langchain/structured-output)
- Vercel AI SDK: `generateText` / `streamText` / `generateObject` over
  `prompt` vs `messages` + `system`, Zod tools, `Output.text()|object()|
  array()|choice()`, `finishReason`, namespaced
  `providerOptions.{openai,anthropic,…}` (`reasoningEffort`,
  `thinking.budgetTokens`, routing/fallbacks) — provider-specific takes
  precedence over portable `reasoning:` levels. `LanguageModelV3` spec =
  `doGenerate`/`doStream` with unified `finishReason{unified,raw}` and
  split `usage{inputTokens{total,noCache,cacheRead,cacheWrite},
  outputTokens{total,text,reasoning}}`.
  (https://vercel-ai.mintlify.app/reference/ai-sdk-core/stream-text;
  https://ai-sdk.dev/docs/foundations/provider-options;
  https://github.com/vercel/ai/blob/main/packages/provider/src/language-model/v3/language-model-v3.ts)
- Microsoft `IChatClient`: deliberately minimal (`GetResponseAsync` /
  `GetStreamingResponseAsync` over `ChatMessage` list); `ChatOptions`
  carries `Instructions`, `ModelId`, sampling, `Tools`, `ToolMode`,
  `AllowMultipleToolCalls`, `ResponseFormat`, `Reasoning`,
  `AdditionalProperties` passthrough. Tool loop lives in the
  `FunctionInvokingChatClient` decorator; structured output errors when
  the model lacks native schema support.
  (https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.ai.chatoptions?view=net-11.0-pp;
  https://github.com/dotnet/extensions/blob/main/src/Libraries/Microsoft.Extensions.AI.Abstractions/ChatCompletion/IChatClient.cs)

### 1.4 Sampling, context declaration, per-model profiles, interop

- `temperature:0` is "almost deterministic"; `seed` is deterministic only
  if the model supports it; prefer `temperature` xor `topP`. Anthropic
  removes sampling control on newest models (non-default
  `temperature/top_p/top_k` on Claude 4.7+ returns 400 — steer via
  prompting). OpenAI: drop `temperature` when `reasoning.effort != none`.
  (https://ai-sdk.dev/docs/ai-sdk-core/settings;
  https://platform.claude.com/docs/en/build-with-claude/working-with-messages;
  https://developers.openai.com/api/docs/guides/latest-model)
- Declared ≠ effective context (Anthropic): 1M default on flagships vs
  200k others; *everything* counts (system, all messages incl. tool
  results/images, tool defs, output incl. thinking); cached tokens still
  occupy the window — caching changes price, not fit. Input overflow →
  `400`; on 4.5+ input+`max_tokens` overflow is accepted then stops with
  `model_context_window_exceeded`.
  (https://platform.claude.com/docs/en/build-with-claude/context-windows)
- Per-model harness profiles (Deep Agents `HarnessProfile`:
  `base_system_prompt`, tool include/exclude, extra middleware,
  auto-resolved per model; reported +10–20 pts on a tau2-bench subset;
  subagents resolve overlays against their own model).
  (https://www.langchain.com/blog/tuning-deep-agents-different-models)
- Interop: OpenAI-compatible `/v1/chat/completions` (+ `/v1/responses`,
  `/v1/embeddings`) is the de-facto harness target — reuse the OpenAI
  client, change `baseURL` + key + model id (Cloudflare Workers AI, LM
  Studio local servers). But "compatible" = shared envelope, not identical
  semantics: streaming `usage` flags, structured-output support,
  per-provider paths, and non-standard parts all leak.
  (https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/;
  https://lmstudio.ai/docs/developer/openai-compat;
  https://ai-sdk.dev/providers/openai-compatible-providers)

Loom implication: Loom sits *above* this layer (it never calls a model),
but two facts constrain its design — (a) every provider bills invisible
reasoning/tool-result tokens, so harness-level cost budgets must count
`usage` objects, not visible text; (b) the pause-token pattern
(`stop_reason` / `interruptions` / `RunState`) is the shape Loom's audit
rows must mirror to stay compatible with any runtime it supervises.

## Part 2 — Context Engineering

"Get the model the right context at the right time" (LangChain) under a
finite attention budget: curate system instructions, tools, MCP, external
data, and history — not just the system prompt (Anthropic).

### 2.1 Anthropic doctrine

- ACI first: tool definitions deserve as much engineering as prompts;
  poka-yoke args (forced absolute paths fixed a SWE-bench agent); keep
  tools near training distribution (no line-counting, no heavy escaping,
  enough "think" tokens).
  (https://www.anthropic.com/engineering/building-effective-agents)
- Just-in-time over upfront stuffing: keep lightweight identifiers (paths,
  queries, links), load via tools. Claude Code hybrid: `CLAUDE.md`
  upfront + `glob`/`grep` just-in-time, bypassing stale indexes.
  (https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Token-efficient tools are mandatory: pagination, ranges, filtering,
  truncation with sane defaults; Claude Code caps tool responses at
  25,000 tokens.
  (https://www.anthropic.com/engineering/writing-tools-for-agents)
- Compaction = summarize + restart: compress history preserving
  decisions/bugs/details, discard redundant tool outputs; lightest safe
  form is tool-result clearing. Tune recall-first on real traces, then
  prune — over-aggressive compaction loses subtle critical context.
  (https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Structured note-taking / agentic memory: agent writes `NOTES.md`/todos
  outside the window and pulls them back; Sonnet 4.5 memory tool =
  file-based store under `/memories`.
  (https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Compaction alone is insufficient: Opus 4.5 + SDK loop + compaction still
  one-shots vague goals, runs out mid-feature, leaves undocumented
  half-state. Fix = initializer/coding split: first window writes
  `init.sh`, `claude-progress.txt`, `feature_list.json` (200+ features,
  all `passes:false`), initial commit; later sessions do one feature,
  verify end-to-end, commit + update progress. Session orientation:
  `pwd` → progress + feature list → `git log` → `./init.sh` → baseline
  test. JSON (not Markdown) for the ledger — less likely to be rewritten.
  (https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Context reset beats compaction under "context anxiety" (Sonnet 4.5
  wrapped up early near the perceived limit); full reset + structured
  handoff costs orchestration/tokens/latency. Fresh-context evaluator +
  default-FAIL gate: builder can't self-grade; a separate subagent (no
  Write/Edit) checks screenshots/diffs; a `PreToolUse` hook denies
  results-file writes unless evidence was Read first.
  (https://www.anthropic.com/engineering/harness-design-long-running-apps;
  https://github.com/anthropics/cwc-long-running-agents/blob/main/README.md)
- Claude Code memory is context, not enforcement: `CLAUDE.md` (you write)
  + auto-`MEMORY.md` (Claude writes) load every session; to *block*
  actions use a `PreToolUse` hook. Budgets are explicit: auto-memory
  first 200 lines / 25KB; `CLAUDE.md` ≤4MiB loads full but <200 lines
  advised. Compaction survival: root `CLAUDE.md`, unscoped rules,
  auto-memory, and the plan re-inject from disk; nested rules, read files
  (>5k tokens → path ref), skills, hook context reload on demand.
  (https://code.claude.com/docs/en/memory;
  https://code.claude.com/docs/en/context-window.md)

### 2.2 LangChain / LangGraph / Deep Agents machinery

- Short-term = checkpointer (per-`thread_id` snapshots: continuity, HITL,
  time-travel, fault tolerance); long-term = Store (cross-thread
  namespaced JSON docs: prefs, facts). Use both.
  (https://docs.langchain.com/oss/python/langgraph/persistence)
- Overflow toolkit: trim first/last N, permanent `RemoveMessage`,
  summarize-to-replacement, checkpoint view/delete, custom filtering;
  `DeltaChannel` keeps append-heavy `messages` checkpoints O(1).
  (https://docs.langchain.com/oss/python/langgraph/add-memory)
- `SummarizationMiddleware`: on token `trigger`, summarizes the older
  span, keeps `keep` recent (default 20 msgs), preserves AI/Tool pairs,
  retries transient failures 3×. `ContextEditingMiddleware` /
  `ClearToolUsesEdit`: clears older `tool_result` bodies, keeps last N
  (`keep:3`), retains the `tool_use` record — lightest-touch reclaim for
  re-fetchable outputs.
  (https://docs.langchain.com/oss/python/langchain/middleware/built-in)
- Deep Agents layers: input context (system/memory/skills) + runtime
  context (per-run, propagates to subagents) + automatic compression +
  isolation + long-term memory. Offload thresholds: tool input/result
  >20k tokens → filesystem (path + 10-line preview); context >85% →
  truncate old file-write args to pointers; summarize only if nothing is
  offload-eligible. Subagents = context isolation: fresh-context child,
  single final report; the parent never sees the dozens of producing
  calls.
  (https://docs.langchain.com/oss/python/deepagents/context-engineering)
- Filesystem-backed long-term memory: `memory=[paths]` +
  `BackendProtocol` (thread-scoped `StateBackend` vs `StoreBackend`
  routing `/memories/` to the Store); agent reads/writes via file tools;
  skills are on-demand procedural memory. Safety: org/shared KB should be
  read-only (populated by code); concurrent same-file writes are
  last-write-wins — shard per-topic or consolidate off-line
  ("sleep-time compute").
  (https://docs.langchain.com/oss/python/deepagents/memory)

### 2.3 OpenAI machinery

- Two contexts, never confused: `RunContextWrapper.context` = local app
  object for tools/hooks (NOT sent to the LLM); the LLM sees only
  conversation history — inject via `instructions`, `input`, function
  tools, retrieval/websearch.
  (https://openai.github.io/openai-agents-python/context/)
- Conversation-state ladder (§1.2): local replay vs `session` vs
  `conversationId` vs `previous_response_id`. Sessions own
  trimming/summarization (`SQLite/Redis/SQLAlchemy/Mongo/Dapr/Encrypted`;
  cookbook `TrimmingSession` keeps last N turns;
  `SummarizingSession(keep_last_n_turns, context_limit)` compresses the
  prefix into a synthetic summary pair).
  (https://developers.openai.com/cookbook/examples/agents_sdk/session_memory)
- Compaction API is server-side + opaque: `POST /responses` with
  `context_management.compact_threshold` auto-compacts mid-stream, or
  explicit `POST /responses/compact` → returns compacted window +
  encrypted `compaction` item (pass through as-is). Wrapper
  `OpenAIResponsesCompactionSession` fires at ≥10 candidates by default.
  (https://developers.openai.com/api/docs/guides/compaction)
- File search = hosted RAG: vector store → upload → poll to `completed` →
  `tools=[{type:file_search, …}]`; output = `file_search_call` + message
  with `file_citation` annotations; `max_num_results`,
  `ranking_options/score_threshold`, metadata filters tune relevance vs
  tokens.
  (https://developers.openai.com/api/docs/guides/tools-file-search)
- Memory split by surface: ChatGPT web = saved memories + inferred
  chat-history (Settings-managed, `Temporary Chat` opts out); local Codex
  = separate `~/.codex/memories/` (off by default, two-phase
  extract→consolidate pipeline, git-baselined diff); sandbox agents use
  progressive disclosure (`memory_summary.md` injected, `MEMORY.md`
  keyword-searched, rollouts opened on need) and must not put secrets in
  serializable `RunContext`.
  (https://help.openai.com/en/articles/8590148-memory-in-chatgpt;
  https://learn.chatgpt.com/docs/customization/memories;
  https://github.com/openai/codex/blob/main/codex-rs/memories/README.md;
  https://openai.github.io/openai-agents-js/guides/sandbox-agents/memory/)

### 2.4 Dedicated memory systems

- Letta (MemGPT lineage): in-context Core Memory blocks (always visible,
  2–5k chars each) over out-of-context Archival Memory (semantic
  insert/search) + conversation search; all state DB-persisted, survives
  eviction. Harness owns persistence/limits/`read_only`; agent owns
  organization via self-edits; full-overwrite `value` is last-write-wins.
  MemFS = git-backed memory FS: `system/*.md` inlines every turn, other
  paths stay out until read (tree visible as signposts); consolidation in
  worktrees.
  (https://docs.letta.com/v1-sdk/concepts/stateful-agents/;
  https://docs.letta.com/v1-sdk/memory/memory-blocks/;
  https://docs.letta.com/concepts/memfs/index.md)
- Mem0 is an `add`/`search` layer; the app owns the prompt: `add`
  extracts/dedups/embeds + entity-temporal metadata; `search` fuses
  semantic + BM25 + entity-graph + temporal scores — never dump all hits.
  Scoping via `user_id/agent_id/app_id/run_id`; layers conversation →
  session/`run_id` → user → org; v3 extraction is ADD-only (temporal
  disambiguation at retrieval, not overwrite).
  (https://github.com/mem0ai/mem0/blob/main/docs/core-concepts/how-it-works.mdx;
  https://github.com/mem0ai/mem0/blob/db15d5c6/docs/core-concepts/memory-types.mdx)

### 2.5 RAG-as-context and failure modes (with receipts)

- Retrieval-tool pattern (Deep Agents): each chunk → `/retrieved/{batch}/
  chunk_N.md` with `# Source:` header, return paths only, fan out
  per-file to analyst subagents, synthesize with inline links; the
  orchestrator never pastes full text.
  (https://docs.langchain.com/oss/python/deepagents/rag)
- Lost-in-the-middle (Liu et al. 2023/2024): U-shaped accuracy — best at
  start/end, worst mid-context; GPT-3.5 mid-context QA fell below
  closed-book (56.1%); reader gains saturate (+1–1.5% going 20→50 docs)
  while retriever recall keeps rising → rerank key docs to edges.
  (https://arxiv.org/abs/2307.03172)
- Context rot (Chroma, 18 models): semantic retrieval, distractor-heavy
  sets, and aggregation degrade well inside advertised windows;
  distractors hurt more than filler; exact-match NIAH overstates usable
  context. (https://www.trychroma.com/research/context-rot)
- 2026 preprints (treat as provisional `[UNVERIFIED]` — not peer-reviewed):
  models give up / answer uncertain-incorrect long before the window fills
  (rate correlates with length; compaction lowers termination at more tool
  calls) (https://arxiv.org/html/2606.29718); frontier monitors miss subtly
  dangerous coding actions 2–30× more after 800k benign tokens
  (https://arxiv.org/html/2605.12366v1).
- Indirect injection is LLM01: RAG poisoning, tool-output forgery,
  cross-session memory persistence; RAG + fine-tuning do *not* fix it.
  Defense: treat ALL ingested content as untrusted (screen with a guardrail
  model before the primary sees it; dual-LLM quarantine pattern);
  deterministic least-privilege + human approval on destructive ops. No
  delimiter fully stops it — Deep Agents' own docs say so.
  (https://genai.owasp.org/llmrisk/llm01-prompt-injection/;
  https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html;
  https://learn.microsoft.com/en-us/security/zero-trust/catalog-ai-attack-techniques/prompt-injection;
  https://docs.langchain.com/oss/python/deepagents/rag)
- Memory poisoning is a privileged-write problem: a tainted entry
  re-infects every future session — log the causing prompt, classify
  instruction-bearing writes, require approval before persisting, keep org
  policies read-only + populated by code.
  (https://docs.langchain.com/oss/python/deepagents/memory)

Loom implication: the strongest directly reusable findings are (a) JSON —
not Markdown — for machine-read ledgers (Anthropic: Markdown gets
rewritten); Loom's SQLite rows already satisfy this; (b) the
progress-file + git-log orientation protocol is the human-readable
analogue of `getLastTransition`; (c) memory writes are high-risk actions
— Loom's audit taxonomy should classify "persist to shared memory/KB" as
approval-gated from day one.

## Part 3 — Tool System

Definition, discovery, execution lifecycle, built-ins, and governance.

### 3.1 Tool definition and ACI

- OpenAI: a function tool = `{type:"function", name, description,
  parameters}` (JSON Schema), `strict`. `parameters` uses full
  JSON-Schema (nested/recursive objects, enums). Output is
  `function_call_output` keyed by `call_id` (string/JSON/image/file);
  no-return functions should return a `"success"`-style string.
  (https://developers.openai.com/api/docs/guides/function-calling)
- Anthropic: user tool = `name` (`^[a-zA-Z0-9_-]{1,128}$`) +
  `description` + `input_schema` (+ optional `input_examples`, which must
  validate or 400) + `cache_control`/`strict`/`defer_loading`/
  `allowed_callers`. Reply shape `tool_use{id,name,input}` →
  `tool_result{tool_use_id,content,is_error?}` in a `user` message, with
  strict ordering invariants (results immediately after their turn;
  `tool_result` blocks FIRST in `content[]`; mixed server-tool turns must
  contain only results or the next call 400s). Error shape:
  `is_error:true` + instructive text ("say what to try next"); invalid
  calls retry 2–3× then apologize; `strict:true` eliminates the class.
  (https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools;
  https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)
- ACI thesis (Anthropic, Building Effective Agents App.2): tools are an
  Agent-Computer Interface deserving HCI-level effort — "invest just as
  much effort in ACI as HCI." Practice: fewer, namespaced, high-signal
  tools (`github_list_prs`, not 3 CRUD tools); stable IDs + only needed
  fields; `response_format` detailed/concise; 3–4+ sentence descriptions
  (what/when/params/caveats); token-efficient (pagination/ranges/filters).
  OpenAI's mirror checklist: explicit purpose/params/output, when-NOT-to-use,
  examples + edge cases, least-surprise signatures with enums, <20
  initially-loaded functions, tool search/namespaces.
  (https://www.anthropic.com/engineering/building-effective-agents;
  https://www.anthropic.com/engineering/writing-tools-for-agents;
  https://developers.openai.com/api/docs/guides/function-calling)

### 3.2 MCP (spec, stable `2025-11-25`)

- Roles: Host (LLM app) / Client (connector inside host) / Server
  (capability provider); JSON-RPC 2.0, capability negotiation at
  `initialize`; inspired by LSP.
  (https://modelcontextprotocol.io/specification/2025-11-25/index)
- Server primitives: **Tools** (model-controlled: `tools/list` →
  `tools/call{name,arguments}` → `{content[], structuredContent?,
  isError}`; `inputSchema` required, `outputSchema`/`annotations`
  optional) / **Resources** (app-driven context by URI + templates +
  subscribe) / **Prompts** (user-controlled templates/slash-commands).
  Client primitives: **Sampling** (server→client LLM request with cost/
  speed/intelligence preferences), **Elicitation** (server→client
  user-input; form = flat primitives only, never secrets; URL mode keeps
  secrets out-of-band), **Roots** (client→server filesystem boundary
  `file://…`, consent + validation required).
  (https://modelcontextprotocol.io/specification/2025-06-18/server/tools;
  https://modelcontextprotocol.io/specification/2025-06-18/server/resources;
  https://modelcontextprotocol.io/specification/2025-06-18/server/prompts;
  https://modelcontextprotocol.io/specification/2025-11-25/client/sampling;
  https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation;
  https://modelcontextprotocol.io/specification/2025-11-25/client/roots)
- Transports: stdio (client-launched subprocess, stdout = messages only)
  + Streamable HTTP (single POST endpoint, JSON or SSE replies). History:
  `2024-11-05` = stdio + HTTP+SSE; `2025-03-26` = Streamable HTTP
  replaces HTTP+SSE; `2026-07-28` = POST-only, no GET streams or
  protocol sessions, Origin validation. Spec version itself is a moving
  target — pin before building on it. `[UNVERIFIED]` which tag is newest
  today.
  (https://modelcontextprotocol.io/specification/2026-07-28/basic/transports;
  https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- Trust rules (spec-level, load-bearing for Loom): hosts must get explicit
  consent before data exposure or tool invocation; tool
  annotations/descriptions are **untrusted** unless from a trusted
  server; servers must validate inputs, rate-limit, sanitize outputs;
  clients should show inputs pre-call, validate results, timeout,
  audit-log. Division: harness = Host+Client (connection, approvals,
  network boundary, tracing); server = capability (implementation,
  validation, limits, sanitization).
  (https://modelcontextprotocol.io/specification/2025-11-25/index;
  https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

### 3.3 Execution lifecycle (two reference implementations)

- Claude Agent SDK hooks: event → collect hooks → `matcher` filter (tool
  name; MCP = `mcp__<server>__<action>`) → callbacks → verdict
  `allow|deny|ask|defer` (+ `updatedInput`, `additionalContext`). Most
  restrictive wins (`deny>defer>ask>allow`). Events: `PreToolUse`
  (block/modify), `PostToolUse`/`PostToolUseFailure`, `PostToolBatch`,
  `PermissionRequest/Denied`, `SubagentStart/Stop`, `PreCompact`,
  `Stop`, `SessionStart/End`. Timeouts defined (600s default, 30s prompt
  events, 10s display, 1.5s session-end); `PreToolUse` timeout = tool not
  run. Permission order: hooks → `deny` rules → `ask` rules →
  `canUseTool` (`dontAsk` skips to deny); hook-`allow` never skips
  deny/ask; bare-name deny removes the tool from context.
  (https://code.claude.com/docs/en/agent-sdk/hooks;
  https://code.claude.com/docs/en/agent-sdk/permissions)
- OpenAI Runner: two concurrency knobs — provider
  `ModelSettings.parallel_tool_calls` (may the model emit N calls?) vs
  SDK `RunConfig.tool_execution.max_function_tool_concurrency` (how many
  local handlers run at once, order preserved). Tool-not-found is opt-in
  recoverable (`return_error_to_model` appends a model-visible error).
  Error formatting hook (`tool_error_formatter`) + per-call
  `state.reject(..., rejection_message=)`. Timeouts per tool
  (`timeout_behavior="error_as_result"` default vs `"raise_exception"`).
  Pre-approval guardrails (`needs_approval=True|callable`, fail-closed on
  malformed args) pause into `result.interruptions`; resume via
  `state.approve/reject` + `Runner.run(agent, state)`.
  (https://openai.github.io/openai-agents-python/running_agents/;
  https://openai.github.io/openai-agents-python/human_in_the_loop/;
  https://openai.github.io/openai-agents-python/tools/)

### 3.4 Built-in toolsets and the built-in/user boundary

- Claude Code built-ins (names double as permission/hook/subagent keys):
  `Bash`, `Edit/Write/NotebookEdit`, `Read/Glob/Grep/LSP`,
  `WebFetch/WebSearch`, `Agent`, `Skill`, `TodoWrite→Task*`, `Monitor`,
  plan-mode and worktree tools. Rationale: built-ins = tuned primitives
  referenced by exact name; custom integrations = MCP servers; reusable
  procedures = skills through the existing `Skill` tool (not new tool
  entries).
  (https://code.claude.com/docs/en/tools-reference)
- OpenAI: hosted (run on OpenAI servers — web/file-search, code
  interpreter, image gen, tool search) vs local-runtime (run in your env
  — `ComputerTool`, `ApplyPatchTool`, `ShellTool` with container or local
  executors) vs function tools (auto-schema'd Python functions; docstring
  = description). Sandbox agents = isolated workspaces separate from
  orchestration, resumable sessions.
  (https://openai.github.io/openai-agents-python/tools/)
- Deep Agents: `ls/read_file/write_file/edit_file/delete/glob/grep/
  execute/task` over a 4-layer execution environment (tools + virtual FS
  with pluggable backends + declarative FS permissions + code execution);
  `LocalShellBackend` = unsandboxed `subprocess.run(shell=True)`,
  dev-only. Hide surface with `excluded_tools` profiles.
  (https://docs.langchain.com/oss/python/deepagents/tools;
  https://docs.langchain.com/oss/python/deepagents/harness;
  https://github.com/langchain-ai/deepagents/blob/main/libs/deepagents/deepagents/backends/local_shell.py)
- Rule of thumb `[UNVERIFIED synthesis, consistent with sources above]`:
  built-ins win for high-frequency, permission-sensitive, model-tuned
  primitives; user/MCP tools win for domain APIs; skills/prompts win for
  reusable procedures.

### 3.5 Governance: permissions, sandbox ≠ approval, audit, injection

- Claude rules `allow|ask|deny`, evaluated deny→ask→allow (specificity
  doesn't override order); modes `default/acceptEdits/plan/auto/dontAsk/
  bypassPermissions` (container-only); deny blocks in every mode.
  OS-level sandbox (Seatbelt/bubblewrap + proxy allowlist, working-dir
  boundary) cut prompts −84% internally.
  (https://code.claude.com/docs/en/permissions;
  https://code.claude.com/docs/en/security;
  https://www.anthropic.com/engineering/claude-code-sandboxing)
- Codex/OpenAI: sandbox = technical boundary (roots, network, modes
  `read-only|workspace-write|danger-full-access`); approval policy = when
  to stop (`untrusted|on-request|never`). And the explicit warning Loom
  must internalize: "Local ShellTool and ApplyPatchTool default to
  `needs_approval=False`… SDK approval does not provide a sandbox" —
  isolation must be enforced, not assumed.
  (https://learn.chatgpt.com/docs/sandboxing;
  https://developers.openai.com/codex/agent-approvals-security;
  https://openai.github.io/openai-agents-python/tools/)
- Audit surfaces: OpenAI tracing on by default (trace → task_span →
  turn_span → agent/generation/function/guardrail/handoff spans;
  `trace_include_sensitive_data` gates I/O; OTel export); Claude
  `PostToolUse` webhooks/audit logging + `SessionStart/End` +
  `PreCompact` transcript archive + settings-edit guards.
  (https://github.com/openai/openai-agents-python/blob/main/docs/tracing.md;
  https://code.claude.com/docs/en/agent-sdk/hooks)
- Injection vendor rules (converged): hierarchy `system > developer >
  user > tool` (OpenAI); tool/web/file content ONLY in `tool_result`,
  never system/plain-user text + source labeling + JSON-encoding
  (Anthropic); never put untrusted variables in developer messages;
  structured outputs to constrain flow; keep approvals on; monitor/
  red-team. (https://openai.com/index/the-instruction-hierarchy/;
  https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks;
  https://code.claude.com/docs/en/security)

### 3.6 Agents-as-tools vs handoffs (OpenAI decision rule)

- Handoffs when a specialist should *take over* (triage lists
  `handoffs=[billing, refund]`; winner's instructions/tools own the next
  response); agents-as-tools when a manager should *stay owner* and call
  specialists as bounded capabilities (`summarizer.as_tool(...)`; manager
  synthesizes). Wire truth: handoffs ARE tools to the LLM
  (`transfer_to_refund_agent`). Start with one agent; split only on
  capability/policy/prompt/trace isolation payoff — premature splits
  multiply prompts, traces, approval surfaces.
  (https://developers.openai.com/api/docs/guides/agents/orchestration;
  https://openai.github.io/openai-agents-js/guides/handoffs)

Loom implication: Loom's high-risk taxonomy should mirror the spec's
trust rules — MCP/hosted tool descriptions are untrusted input (never
policy); the permission decision point is `PreToolUse`-shaped
(block/modify/ask with most-restrictive-wins); and every tool call needs
the audit triple (requested / decision / outcome) that both reference
lifecycles already emit. The lease layer then answers "which agent may
mutate" while the tool layer answers "which effects are allowed."

## Part 4 — Agent Loop

The turn-by-turn execution loop: canonical shapes, termination, planning,
interrupts, streaming/observability, subagents.

### 4.1 Canonical loop shapes

- ReAct (Yao et al. 2022): interleaved Thought/Action/Observation
  trajectories; thoughts induce/track/update plans and handle exceptions,
  actions gather observations. Formalism: action space A → Â = A ∪ L
  (language reasoning traces); dense alternation for knowledge tasks,
  sparse async thoughts for decision tasks. Tested on HotpotQA, FEVER,
  ALFWorld, WebShop. (https://arxiv.org/abs/2210.03629)
- Claude Agent SDK: prompt → Claude evaluates → text and/or 1+ tool calls
  → SDK executes → results back as user message → repeat. One full cycle
  = one "turn" (no yielding to user code mid-turn); loop ends when output
  has no tool calls → final message + ResultMessage (text, usage, cost,
  session ID). Low-level Client SDK form: `while stop_reason ==
  "tool_use"`.
  (https://code.claude.com/docs/en/agent-sdk/agent-loop;
  https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works)
- OpenAI Runner: one SDK run = one application-level turn: call model →
  inspect output → tools? execute+append+reloop → handoff? switch+reloop
  → final answer (text of desired `output_type`, no tool calls) →
  return.
  (https://developers.openai.com/api/docs/guides/agents/running-agents)
- LangGraph Pregel (Bulk Synchronous Parallel): each super-step = Plan
  (select actors subscribed to updated channels) → Execution (run in
  parallel until all complete / one fails / timeout; writes invisible
  until next step) → Update (apply channel writes); repeat until no
  actors selected or max steps. Nodes inactive until messaged; parallel
  nodes = same super-step; checkpoints at super-step boundaries, never
  mid-node.
  (https://docs.langchain.com/oss/python/langgraph/pregel;
  https://docs.langchain.com/oss/python/langgraph/graph-api)
- OpenCode Effect loop: `SessionPrompt.prompt()` admits one input then
  `loop()`: `while(true)` loads the compacted stream, breaks when the
  last assistant message has terminal `finish`; else increments `step`,
  streams via `SessionProcessor.process()` consuming typed events
  (`tool-input-start/delta/end`, `tool-call`, `tool-result`,
  `text-*/reasoning-*/step-*`), persisting message parts + snapshots +
  patches per step.
  (https://github.com/sst/opencode/blob/dev/packages/opencode/src/session/prompt.ts;
  https://raw.githubusercontent.com/sst/opencode/dev/packages/opencode/src/session/processor.ts)

### 4.2 Termination, stall guards, budgets

- Canonical stop: no tool calls / text-only final. Any other
  `stop_reason` (`max_tokens`, `refusal`, `pause_turn`,
  `model_context_window_exceeded`) must be handled by the app, never
  treated as success.
  (https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works)
- Budget knobs: Claude `max_turns` + `max_budget_usd` (either hit →
  ResultMessage `error_max_turns`/`error_max_budget_usd`); OpenAI
  `max_turns` → `MaxTurnsExceeded` (+ `error_handlers` conversion to
  controlled output); Vercel `stopWhen` (default `stepCountIs(20)`;
  custom cost-based `StopCondition`); LangGraph `recursion_limit`
  (default 1000 steps) → `GraphRecursionError`.
  (https://code.claude.com/docs/en/agent-sdk/agent-loop;
  https://openai.github.io/openai-agents-python/running_agents/;
  https://ai-sdk.dev/docs/agents/loop-control.md;
  https://docs.langchain.com/oss/python/langgraph/graph-api)
- Stall guards: OpenCode `DOOM_LOOP_THRESHOLD = 3` — three consecutive
  identical tool calls (same name, non-pending, `JSON.stringify(input)`
  equality) trigger a `doom_loop` permission-ask recovery prompt. Scope
  limit: reasoning-only stalls (no tool calls, no state change) are NOT
  caught in base — a fork PR proposes a near-identical-content detector +
  hard cap on model-only turns. `[UNVERIFIED]` whether upstream merged it.
  Claude: a `Stop` hook blocking 8 consecutive times without progress is
  overridden (cap raisable). OpenAI: `reset_tool_choice=True` default
  avoids forced-tool loops. OpenAI treats approvals as *paused* runs, not
  new turns (counts/IDs stay consistent).
  (https://raw.githubusercontent.com/sst/opencode/dev/packages/opencode/src/session/processor.ts;
  https://github.com/anomalyco/opencode/issues/12716;
  https://code.claude.com/docs/en/hooks-guide;
  https://openai.github.io/openai-agents-python/agents)

### 4.3 Planning inside the loop

- Anthropic doctrine: simplest first; agents trade latency/cost for
  performance; give ground truth (tool/code results) every step so the
  agent can assess progress. Evaluator-optimizer fits clear criteria +
  measurable refinement; orchestrator-workers fits dynamic decomposition;
  parallelization fits parallelizable subtasks or voting.
  (https://www.anthropic.com/engineering/building-effective-agents)
- Plan Mode rationale: per-action approvals cause friction/tune-out on
  long tasks; show the whole plan up front for review/edit/approve, allow
  mid-execution intervention. Loop shape: plan → act → observe → adjust.
  (https://www.anthropic.com/research/trustworthy-agents)
- First-class todos: Claude (`TaskCreate` per item + `TaskUpdate`;
  excluded by default on newest models — internal tracking unless opted
  in); Deep Agents (`TodoListMiddleware` + `write_todos`, at most one
  list-replace per turn, streams to UIs); Microsoft HarnessAgent
  (persistent Todo provider + mode provider + `LoopEvaluator`s like
  `CompletionMarkerLoopEvaluator("DONE")` re-invoking traced runs until
  finished); OpenCode (`question` tool for structured mid-execution
  questions; `Plan` agent read-only vs `Build` full-tools).
  (https://code.claude.com/docs/en/agent-sdk/todo-tracking;
  https://docs.langchain.com/oss/python/deepagents/frontend/todo-list;
  https://learn.microsoft.com/en-us/agent-framework/agents/harness;
  https://opencode.ai/docs/agents)

### 4.4 Interrupts and resumption (the pause-token pattern)

Common shape in all three: pause emits a resumable token/state,
persistence saves progress, a distinct resume call injects human input at
the exact paused point; resuming any other way forks history and breaks
counts/IDs.

- LangGraph: `interrupt(value)` inside a node saves state via checkpointer
  and pauses indefinitely; resume ONLY via `Command(resume=…)` with the
  same `thread_id` (payload becomes `interrupt()`'s return value). Node
  *restarts from the top* on resume — the prefix must be side-effect-free.
  `get_state_history` / time-travel replays from a `checkpoint_id`.
  (https://docs.langchain.com/oss/python/langgraph/interrupts.md;
  https://docs.langchain.com/oss/python/langgraph/checkpointers.md)
- OpenAI: tools declare `needsApproval`; run pauses with
  `result.interruptions: ToolApprovalItem[]` (surfaces even after
  handoffs or nested `as_tool` on the outer run); `state.approve/reject`
  then `Runner.run(agent, state)` continues the SAME run (partial
  decisions re-pause on the remainder). `RunState` serializes
  (`to_json/from_json`) for cross-process resume, keeping
  `conversation_id/previous_response_id`; docs demand version-marked
  agent/SDK definitions, exclusive session access, and reconciling the
  exact pending batch without rerunning tools.
  (https://openai.github.io/openai-agents-python/human_in_the_loop/;
  https://openai.github.io/openai-agents-python/ref/run_state/)
- Claude: `AskUserQuestion` (+ MCP user-interaction) always falls through
  to approval — never auto-approved in any mode incl. `bypassPermissions`
  (denied instead in `dontAsk`); explicit `ask` rules force prompts in
  bypass; `plan` mode routes edits to callbacks. "Ask-suspend" as a named
  API is `[UNVERIFIED]` — the behavior is documented via AskUserQuestion
  + permission modes + `canUseTool`. `/goal` wraps a session Stop hook
  evaluated by a small model (`met/impossible/not-yet`).
  (https://code.claude.com/docs/en/permission-modes;
  https://code.claude.com/docs/en/tools-reference;
  https://code.claude.com/docs/en/goal)

### 4.5 Streaming, observability, per-turn audit

- OpenAI Responses SSE + SDK stream events (3 types:
  `raw_model_stream_event`, `run_item_stream_event`,
  `agent_updated_stream_event`); the run isn't complete at the last token
  (persistence, approval bookkeeping, compaction may finish after) —
  check `result.is_complete`.
  (https://developers.openai.com/api/reference/resources/responses/streaming-events;
  https://openai.github.io/openai-agents-python/streaming/)
- OpenAI Tracing (on by default): trace → task_span → turn_span →
  agent/generation/function/guardrail/handoff spans; `trace_id/group_id/
  metadata`; `trace_include_sensitive_data` gates I/O capture; OTel
  export. Disable under ZDR.
  (https://openai.github.io/openai-agents-python/tracing)
- LangSmith: every unit = *run* (≈ OTel span); runs of one op = *trace*;
  multi-turn = *thread*; flattened message path = *trajectory*.
  Auto-traced; used for latency/cost/quality debugging, eval datasets,
  alerts.
  (https://docs.langchain.com/langsmith/observability)
- LangGraph stream modes: `values` (full state/step), `updates`
  (per-node deltas), `messages` (LLM token tuples), `custom`
  (`get_stream_writer()`), plus `checkpoints/tasks/debug`; resumable via
  last event ID. Per-turn audit = checkpoint per super-step on a
  `thread_id` + `get_state_history` reverse-chronological log + replay via
  `invoke(None, priorCheckpointConfig)` (post-checkpoint nodes re-execute;
  `update_state` forks alternate timelines).
  (https://docs.langchain.com/oss/python/langgraph/streaming;
  https://docs.langchain.com/oss/python/langgraph/checkpointers.md)
- Microsoft: OTel GenAI semconv traces/logs/metrics; trace context
  propagates to MCP servers via `params._meta`. OpenCode: processor
  persists `step-start/finish` (reason, tokens, cost, snapshots),
  `tool` parts (pending→running→completed/error + I/O + timing), `patch`
  parts (diffs + hash); `session.prompt` "durably admits" input before
  scheduling the loop. (Exact OpenCode retention/replay API beyond
  inspection: `[UNVERIFIED]`.)
  (https://learn.microsoft.com/en-us/agent-framework/agents/observability;
  https://raw.githubusercontent.com/sst/opencode/dev/packages/opencode/src/session/processor.ts)

### 4.6 Subagents in the loop

Converged shape: spawn into a FRESH context window; intermediate calls
stay inside; only the final message returns to the parent.

- Claude: via `Agent`/`Task` tool (SDK `agents` param or
  `.claude/agents/*.md` with `name/description/tools/model/
  permissionMode/hooks/isolation`); description drives auto-delegation.
  Subagent sees own system prompt + delegation + project CLAUDE.md + tool
  defs — NOT parent history. `isolation:worktree` isolates the FS too;
  nesting ≤3 by default; fork-mode (experimental) inherits full
  conversation + prompt cache. Cost routing: Haiku explorers,
  Sonnet/Opus orchestrator.
  (https://code.claude.com/docs/en/agent-sdk/subagents;
  https://code.claude.com/docs/en/sub-agents)
- OpenAI: handoffs move conversational ownership (target receives history,
  optionally filtered; `lastAgent` stays in control); agents-as-tools keep
  manager ownership (specialist output returns to the manager).
  (§3.6; https://developers.openai.com/api/docs/guides/agents/orchestration)
- Deep Agents: `task()` tool, declarative `SubAgent{name, description,
  system_prompt, mode, tools, model, middleware, interrupt_on, skills,
  permissions}`; `mode:"isolated"` (only the task description; own Skills
  instance) vs `mode:"fork"` (experimental, inherits conversation);
  completion extracts final `messages[-1]` as parent's `ToolMessage`.
  (https://docs.langchain.com/oss/python/deepagents/subagents)
- OpenCode: `General/Explore` subagents in child sessions with fresh
  context; parent's `subagent` permission gates launching; child uses its
  OWN permissions (not a restricted copy of the parent's).
  (https://opencode.ai/docs/agents)

Loom implication: the loop is the runtime's property — Loom observes and
gates it. Directly reusable: (a) OpenAI's paused-vs-new-turn distinction
should govern Loom's transition model (an approval pause is NOT a new
transition; only committed effects are); (b) the subagent isolation shape
(fresh context + final-report return) means Loom's resume point must be
per-agent-thread, not global; (c) OpenCode's doom-loop detector is the
concrete precedent for a harness-level stall guard Loom could enforce
rather than merely observe.

## Part 5 — Multi-Agent Harness / Agent Orchestrator

Several agents, one goal: delegation patterns, protocols, and the
harness problems unique to multiplicity.

### 5.1 Anthropic patterns (predefined vs dynamic)

- Workflows (predefined code paths) vs agents (LLM-directed): routing,
  parallelization, orchestrator-workers, evaluator-optimizer are
  *workflows*; agents get ground truth each step + stopping conditions
  ("maximum number of iterations").
  (https://www.anthropic.com/engineering/building-effective-agents)
- Orchestrator-workers: "a central LLM dynamically breaks down tasks,
  delegates them to worker LLMs, and synthesizes their results" — fit
  when subtasks can't be predicted (multi-file coding, multi-source
  research). Parallelization variants: sectioning (independent subtasks;
  e.g. guardrail screening while another answers) and voting (same task
  ×N; e.g. parallel vulnerability reviews with vote thresholds).
  Evaluator-optimizer: generator↔evaluator loop; fit = clear criteria +
  demonstrable refinement value (writer–editor). Reference notebooks
  (`FlexibleOrchestrator`: analyze → workers → synthesize; N+1 calls;
  suggested asyncio + retries) in `anthropics/claude-cookbooks/patterns/
  agents`. Discipline: agentic = latency+cost for performance; simplest
  first; route easy→Haiku, hard→Sonnet.
  (https://www.anthropic.com/engineering/building-effective-agents;
  https://github.com/anthropics/claude-cookbooks/tree/main/patterns/agents)

### 5.2 OpenAI: LLM-driven vs code-driven, handoffs, Swarm

- Two modes, mixable: LLM-driven decisions vs code-driven flow
  (determinism in "speed, cost and performance"). Code patterns are
  explicit: structured-output classification → branch; chaining
  (research → outline → draft → critique); evaluator `while` loop;
  parallel via `asyncio.gather`. Triage hands off, specialist calls
  others as tools — the two patterns compose.
  (https://openai.github.io/openai-agents-python/multi_agent/)
- Handoff mechanics: `transfer_to_<agent>` tools; `tool_name_override/
  tool_description_override/on_handoff/input_type/input_filter/
  is_enabled`; receiving agent sees FULL history unless filtered
  (`input_filter`, `nest_handoff_history`, `handoff_history_mapper`).
  Guardrail gotcha: input guardrails run only for the FIRST agent,
  output guardrails only for the FINAL agent; handoffs bypass tool
  guardrails; `as_tool()` exposes no tool-guardrail options.
  (https://openai.github.io/openai-agents-python/handoffs/;
  https://openai.github.io/openai-agents-python/guardrails/)
- Swarm: experimental/educational, superseded by the Agents SDK
  ("production-ready evolution"). Only Agents + handoffs, runs "(almost)
  entirely on the client," stateless between calls.
  (https://github.com/openai/swarm)

### 5.3 Microsoft: five patterns, workflow ≠ agent, Magentic ledgers

- Agent = LLM-driven dynamic steps; workflow = predefined
  sequence/graph of executors + edges with type-safe routing, supersteps,
  checkpointing. Five built-in orchestrations: Sequential (ordered
  pipeline; `chain_only_agent_responses` restricts to prior responses),
  Concurrent (fan-out + aggregator; per-branch streaming), Handoff
  (mesh, no orchestrator; handoff calls filtered from forwarded history;
  interactive by default, autonomous opt-in with turn limits),
  Group Chat (star + manager selects next speaker; synchronized history;
  `MaximumIterationCount`), Magentic (planning manager with Task Ledger +
  Progress Ledger; stall counter → reset/replan; `max_round_count=10,
  max_stall_count=3, max_reset_count=2`; plan-review pause
  `approve()/revise(feedback)`).
  (https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/;
  https://learn.microsoft.com/en-us/agent-framework/workflows/;
  https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/magentic)
- AutoGen presets: `RoundRobinGroupChat`, `SelectorGroupChat`,
  `MagenticOneGroupChat`, `Swarm` (via `HandoffMessage`); termination
  conditions (e.g. `TextMentionTermination("APPROVE")`) or external
  termination; Magentic-One reference team = Orchestrator + WebSurfer +
  FileSurfer + Coder + executor.
  (https://microsoft.github.io/autogen/dev/user-guide/agentchat-user-guide/tutorial/teams.html;
  https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/magentic-one.html)

### 5.4 Google: A2A + ADK, MCP complementary

- A2A data model (normative: `spec/a2a.proto`): Task (stateful work unit:
  server ID + context ID, status, artifacts, history) / Message (one
  turn, `role: user|agent`) / AgentCard (discovery at
  `/.well-known/agent-card.json`: name, endpoint, skills, capabilities,
  `security_schemes`) / Part / Artifact ("Results SHOULD BE returned
  using Artifacts," never messages). Three equal transports (JSON-RPC,
  gRPC, HTTP+JSON), statically declared, no negotiation. Operations:
  `message/send|stream`, `tasks/get|list|cancel|resubscribe`,
  push-notification configs. Terminal states:
  completed/failed/canceled/rejected.
  (https://github.com/a2aproject/A2A/blob/main/docs/specification.md;
  https://a2a-protocol.org/v0.3.0/specification/)
- MCP vs A2A (Google): "MCP connects agents to tools and data. A2A
  connects agents to other agents." Heuristic: "quick deterministic
  resource or action → tool; may end up with a conversation → agent."
  ADK: `McpToolset` for tools, `RemoteA2aAgent` for agents.
  (https://opensource.googleblog.com/2026/04/meet-the-a2family.html;
  https://developers.googleblog.com/en/developers-guide-to-ai-agent-protocols/)
- ADK workflow agents are deterministic (Sequential/Parallel/Loop run
  "without consulting an AI model"); 2.0 adds graph/dynamic/coordinator.
  `ParallelAgent`: independent branches, NO automatic history sharing —
  share via explicit `InvocationContext`/external store ("manage
  concurrent access… carefully (e.g., using locks)"); distinct
  `output_key`s per branch avoid races. `SequentialAgent` passes the same
  context (`temp:` state flows downstream). `LoopAgent` needs
  `max_iterations` and/or escalation. Coordinator = central `LlmAgent`
  with specialists in `sub_agents`.
  (https://adk.dev/agents/workflow-agents/parallel-agents/;
  https://adk.dev/agents/workflow-agents/loop-agents/;
  https://adk.dev/workflows/patterns/)
- ADK state scopes: `app:` (all users/sessions) / `user:` (user's
  sessions) / `temp:` (invocation only) / none (session lifetime).
  `DatabaseSessionService` serializes per-session with a lock;
  `InMemorySessionService` "is not safe for multi-threaded use."
  (https://adk.dev/sessions/state/)

### 5.5 LangGraph / CrewAI: supervisor, hierarchy, flows

- LangGraph `create_supervisor(agents, model, …)`: supervisor LLM
  delegates via handoff tools; knobs `parallel_tool_calls` (default
  False), `output_mode` (`last_message` vs `full_history`),
  `add_handoff_messages`, `handoff_tool_prefix`. Default handoff passes
  FULL supervisor history + success message; `create_forward_message_tool`
  forwards a worker's last message verbatim (saves tokens, avoids
  paraphrase distortion). Hierarchical teams (domain mid-supervisors
  under a top supervisor) handle single-supervisor overload. Maintainers
  now recommend the supervisor pattern via tools directly ("more control
  over context engineering") over the library.
  (https://reference.langchain.com/python/langgraph-supervisor/supervisor/create_supervisor;
  http://www.github.com/langchain-ai/langgraph-supervisor-py)
- CrewAI: Crew = agents + tasks + process (`sequential` default,
  `hierarchical` needs manager), entry `kickoff()/kickoff_for_each()`
  (+ async variants). Flows own state/order (`@start/@listen`/routers;
  crews as steps); `@persist` saves state for crash/human-wait resume
  (`restore_from_state_id` forks). HITL: per-task `human_input=True`
  (console pause) + `@human_feedback` (collapses free text to an outcome,
  routes via `@listen`, async + `learn=True` lesson memory); Enterprise
  adds webhook resume.
  (https://docs.crewai.com/edge/en/concepts/crews;
  https://docs.crewai.com/edge/en/concepts/production-architecture;
  https://docs.crewai.com/v1.14.7/en/learn/human-feedback-in-flows)

### 5.6 Cross-cutting problems (the multi-agent harness agenda)

- Shared vs isolated context differs per vendor: OpenAI handoffs share
  full transcript (filterable); Agent Framework sequential shares full or
  responses-only, group chat broadcasts everything, handoff excludes tool
  calls, concurrent branches independent; ADK sequential shares context,
  parallel branches isolated except `session.state`; LangGraph supervisor
  defaults `last_message` with `full_history` opt-in. No convergence —
  Loom must define its own per-thread resume semantics.
- Shared-state conflict / leases: essentially ABSENT as a primitive. The
  only primary-source hits in the entire survey are ADK's "manage
  concurrent access… (e.g., using locks)" and per-session DB locking.
  `[UNVERIFIED]` as vendor practice — Loom's mutation lease is original
  design, and this absence is its justification: nobody else sells the
  lock, so the enforcement harness must.
- Identity/attribution is partial everywhere: A2A (`role`, `messageId`,
  `taskId`, `contextId`); Agent Framework (`ExecutorId`/`author_name`,
  intermediate vs terminal outputs); OpenAI tracing (named spans per
  agent/turn/tool/handoff). End-to-end audit identity across frameworks:
  `[UNVERIFIED]`. Loom's audit rows must therefore carry owner/agent
  identity themselves rather than inheriting it.
- Cost fan-out acknowledged qualitatively only (Anthropic N+1 calls;
  OpenAI parallel-guardrail token burn; LangSmith per-run stats).
  Per-agent budget caps or fan-out limiters: `[UNVERIFIED]`. Loom's
  budgets (timeout/retry/cost) have no turnkey precedent — policy to
  define.
- Termination bounds exist under different names but no vendor matches
  I2P's depth/repeat/children triple: OpenAI `max_turns`, AutoGen
  `max_turns=20/max_stalls=3`, Agent Framework round/stall/reset counts +
  termination lambdas, ADK `max_iterations` + escalation, LangGraph/
  CrewAI termination conditions. I2P's triple is the strictest found —
  Loom's depth/cycle breaker (§27.3) has a real spec to enforce.
- Evaluation: OpenAI (trace everything, "invest in evals"); LangSmith
  three granularities (final-response / single-step / trajectory with
  exact/partial/LLM-judge scoring + online thread-level judges);
  Anthropic (eval-flavored parallelization, measure-and-iterate).
  (https://openai.github.io/openai-agents-python/tracing/;
  https://docs.langchain.com/langsmith/evaluation-approaches;
  https://docs.langchain.com/langsmith/evaluate-complex-agent)

Loom implication: multi-agent operation is where Loom's milestone-1
primitives compose — one lease per workspace serializes contending
agents (ADK's "use locks" made mechanical), per-thread transitions give
each agent its own resume point (LangGraph-checkpoint analogue per
thread), and audit rows with owner identity supply the attribution no
vendor runtime provides end-to-end. Later milestones (sandbox per agent,
kill switch, deployment authorization) inherit the same per-agent
identity.

## Gaps and further research

- MCP spec is a moving target (stable `2025-11-25` observed; `2026-07-28`
  tree changes transports) — pin the spec revision before building any
  MCP-facing surface, same discipline as `FRAMEWORK_REF`.
- `bun:sqlite` trigger/authorizer support for append-only enforcement
  still unverified — confirm before relying on it (§4.3 of 01).
- A2A viability as Loom's inter-agent wire protocol vs a simpler
  handoff-envelope: unevaluated; needs a dedicated pass if multi-agent
  leaves the single-workspace scope.
- 2026 preprints (context-rot monitors, premature termination) are
  provisional — re-check peer-reviewed status before citing as fact.
- Secondary-only items carried forward from 01 (§5 there) still need
  primary confirmation.
