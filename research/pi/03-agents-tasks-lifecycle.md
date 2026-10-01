# Pi Track 3 — Sessions, Agents, Outputs, Lifecycle, Acceptance

Covers checklist items 7, 8, 9, 11, 12.

## Session strategy (item 7: primitives mapped)

- RPC: `new_session/switch_session/fork/clone` (+ `get_fork_messages`,
  `get_entries{since}`, `get_tree`, `get_state`); interactive
  `/new /resume /tree /fork /clone` (tree nav never deletes abandoned
  branches); CLI `-c/--continue -r/--resume --session --fork
  --session-id --session-dir --no-session -n/--name` (documented
  flag incompatibilities).
- Ephemeral: `--no-session` CLI + SDK `SessionManager.inMemory()`.
  IDs: UUID default or constrained custom. SDK runtime replacement
  via `AgentSessionRuntime` (rebind subscriptions after).
- Recommendation stands: `project → agents → task sessions` over one
  universal session. No documented cost ceiling for many sessions
  (file-per-session + `get_session_stats`) — treat "many cheap
  sessions" as UNVERIFIED for budgeting until measured.

## Agent boundaries (item 8: roles = prompt + tools + model)

- Core has NO Planner/Developer/Reviewer roles (pi.dev: "skips
  sub-agents and plan mode"). Role separation is harness-owned via
  the `subagent/` example shape: role = agent-definition file
  (`name/description/tools/model` + body) + tool allowlist + model
  choice. Sample: scout (Haiku, recon), planner (Sonnet, plans),
  reviewer (Sonnet), worker (Sonnet, general).
- Mechanisms (all confirmed): per-session system-prompt override
  (CLI `--system-prompt/--append-system-prompt`, `SYSTEM.md` /
  `APPEND_SYSTEM.md`, SDK `DefaultResourceLoader` overrides);
  per-session tool selection (CLI `-t/--tools -xt -nbt -nt`,
  `defaultTools` + `+name/-name` deltas, SDK
  `tools/excludeTools/customTools`, runtime
  `getActiveTools/setActiveTools`); example subagents as isolated
  `pi --mode json -p --no-session` subprocesses (50KB output cap,
  max 8 tasks / 4 concurrent, SIGTERM→SIGKILL abort).
- Correction: none of this equals role *enforcement* — no
  identity/permission boundary beyond OS process + optional
  container. Roles are conventions the harness must police (leases,
  grants, audit — Loom's R-13/R-18 layer).

## Structured outputs (item 9: CORRECTED — no agent-level schema)

- `--mode json` is event framing, "not a constraint on the format of
  the model's response." Upstream gap acknowledged (issues #1086,
  #2259: "no supported path to enforce JSON schema output for
  assistant text"; no `--output-schema` on main).
- What IS constrained: tool arguments (TypeBox) + provider-side
  `constrainedSampling` for tools (json_schema strict/grammar,
  OpenAI/Anthropic/Bedrock/Mistral/Gemini-3).
- Idiomatic pattern: **terminate-on-tool** — `defineTool({parameters,
  execute, terminate:true})` + `outputSchema`/`structuredContent`
  (model sees `content`, programmatic callers get structured data);
  evals use it for machine grading (`submit_documentation_audit`
  with `verdict` enum). Maintainer workaround for free-form fields:
  "have the agent call a tool and parse the tool output — or write
  the JSON to a file." Harness `status/artifacts/filesChanged/
  decisions/problems/nextTasks/verification` should be a
  terminate-on-tool (or file-drop), never parsed prose.

## Lifecycle machine (item 11: no stage primitive)

- No IDEA→MAINTENANCE stages, no plan mode, no built-in todos in
  core (plan-mode `todos/[DONE:n]` are example-local). Extension
  lifecycle is event-based, not staged (`before_agent_start`,
  `tool_call/result`, `turn_end/agent_before_settle` with one
  guarded continuation, `agent_end` vs notification-only
  `agent_settled`, session/compaction/tree events).
- Control-flow primitives Pi DOES give: `steer()` (after turn) vs
  `followUp()` (after run), `streamingBehavior` gate, `abort()` +
  `waitForIdle()`, `set_steering_mode/follow_up_mode`
  (`all|one-at-a-time`), `clear_queue`. Stages live entirely in the
  harness; Pi contributes the turn/queue/abort mechanics. (One
  UNVERIFIED: a `packages/agent/docs/{agent-harness,harness}.md`
  spec was referenced by search excerpts but 404s on current main —
  do not cite.)

## Acceptance criteria (item 12: dev-time evals only)

- `packages/evals/` (`@earendil-works/pi-evals`, private,
  vitest-evals): docs-lift suites (paired with/without-docs Docker
  arms reporting lift) + host suites (smoke: "capital of France →
  Paris" + usage assertions). Isolated per-arm containers,
  fresh home/agent/workspace/session per arm.
- NOT-FOUND: machine-checkable done-definitions, goal verification,
  evidence-must-be-read gates at runtime. Compaction tracks
  `{readFiles,modifiedFiles}` cumulatively but enforces nothing;
  stats/events (`get_session_stats`, compaction/retry events) are
  telemetry, not verdicts. The only "audit vs implementation" gate
  (`documentation-audit.eval.ts`) is behavioral dev-time, not a
  shipped assertion library. **Harness defines all pass/fail.**

Primary URLs: `packages/coding-agent/docs/{sessions,cli,
rpc-commands,json,cli-integration,extensions,settings,compaction,
session-format,message-types}` + `examples/{extensions/subagent/,
extensions/plan-mode/,extensions/structured-output.ts,sdk/}` +
`packages/{agent/README,evals/README,ai/README}` + issues
`#1086/#2259`.
