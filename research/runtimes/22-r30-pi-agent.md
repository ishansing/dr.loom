# R-30 — Pi Agent Interception Study

Status: findings. Assumes `earendil-works/pi` (pi.dev, v0.99.2 observed
locally via mise) — not the PyPI namesake, `pi-go`, or `oh-my-pi`.
No `src/` changes. Complements the R-07 OpenCode study; same ranking
method.

## Identity (one line)

Pi is a *minimal agent harness by design*: four tools (`read, bash,
edit, write`), four modes (interactive, print/JSON, RPC, SDK), and
everything else — permission gates, path protection, plan mode,
subagents, sandboxing — built as TypeScript extensions or installed
packages. `earendil-works/pi`, MIT, `packages/{agent,ai,coding-agent,
tui,telemetry,chord,codemode}`.

## The load-bearing fact: no safety in core

Pi core has **no permission gate, no path confinement, no approval
flow** (pi.dev: "No permission popups. Run in a container, or build
your own confirmation flow"). `cwd` does not prevent other-path
access; project trust gates resource *loading*, not tool *reach*.
Consequence cuts both ways: Loom supplies everything (nothing to
align with or fight), through first-class joints (below) — not
against a rival policy engine.

## Modes (supervisor visibility)

- **print** (`-p`): final text only, observe-nothing. Weakest hook.
- **JSON** (`--mode json`): stdout JSONL event stream
  (`tool_execution_start/end`, `message_end`, `agent_settled`,
  usage) — observe-only, no veto, kill = SIGKILL.
- **RPC** (`--mode rpc`): stdin JSONL commands
  (`prompt/steer/abort/clear_queue/get_state/get_entries/get_tree/
  get_session_stats/compact/fork/…`), stdout events + responses,
  `agent_settled` as completion signal. Best *isolated* control:
  refuse `prompt`, issue `abort`, steer mid-run. IPC latency;
  prompt-accept ≠ completion (track settle).
- **SDK** (`createAgentSession`, Node/Bun in-process): everything —
  resource loader, session/tool/model managers, `setActiveTools`,
  `abort/dispose`, `appendEntry` ledger writes. Strongest control,
  no process boundary. OpenClaw embeds this way (tool-list filtering
  + custom replacements + prompt sections, all in-process).

## Extension veto point (the R-07 `tool.execute.before` analogue)

`tool_call` handlers see `{toolName, args, toolCallId,
parentToolCallId}` pre-execution and may return `{block: true,
reason}` or mutate input; a throw also blocks (fail-safe). Nested
`ctx.executeTool()` calls re-enter handlers. `tool_result` composes
across handlers; `message_end` can replace finalized text;
`session_before_switch/fork` support `{cancel: true}`;
`before_agent_start` edits prompt/tools. Proven patterns exist
in-repo: `permission-gate.ts` (bash regex → select-or-block),
`protected-paths.ts` (`.env/.git/node_modules` substring → block).
Headless rule: default-deny where `ctx.hasUI` is false (no dialog to
show); RPC forwards approvals via `extension_ui_request/response`.

## Sessions (ledger-readable)

JSONL v3 at `~/.pi/agent/sessions/--<path>--/<ts>_<uuid>.jsonl`
(overridable `--session-dir`), tree via `id/parentId` (fork/clone/
branch retained on disk, abandoned branches excluded from model
context). RPC `get_entries{since}` is a durable poll cursor;
`get_session_stats` gives tokens/cost; shell tools inject
`PI_SESSION_ID/PI_SESSION_FILE/...`. No locking, no checksums, no
redaction — exports may contain creds. Loom reads post-hoc
transcripts here (ledger *input*), never writes (same corruption
rule as R-07's OpenCode finding).

## Packages, telemetry, sandboxes (one line each)

- Packages (`npm:|git:|https:|ssh:|./local`): execute extension TS
  **in-process** with full prompt/file/cred/session access — review
  source before install/trust. Loom's own distribution story, and
  its supply-chain warning.
- Telemetry (`pi-telemetry`): explicit span contracts + in-memory
  context, **no exporter, no persistence, no tool-arg capture by
  default** — observability pipe (write an adapter), not audit.
  Loom's trigger-locked ledger remains the audit of record.
- Sandboxing: plain Docker (whole-pi container), Docker Sandboxes
  (provider-cred proxy — only story keeping real keys off Pi),
  OpenShell (FS/process/net/credential policies), Gondolin
  (host Pi + micro-VM `/workspace`; host env incl. keys inherited —
  not a cred boundary as-shipped).

## Ranked interception (Loom duties)

- **Veto mutations:** (a) extension `tool_call` gate — sees all tool
  calls incl. nested, sync in-process, blocks/mutates. Needs the
  headless default-deny + full mutation-family coverage (edit vs
  write vs bash-heredoc, same lesson as R-07's shadowing note).
  Escapes: extension's own `fs/child_process`, MCP stdio servers,
  second Pi processes, host shell outside Pi.
- **Leases:** nothing exists (no lease/lock API in extensions, RPC,
  CLI, or session format — closest natives are `tool_call.block`,
  `session_before_switch.cancel`, `abort*`, all policy/kill, none
  ownership). Loom builds the store; Pi's `appendEntry custom` can
  carry lease *references* per branch, never authority.
- **Ledger/audit:** (d) SDK event subscription or (c) RPC stream +
  (e) session-JSONL reads + `get_session_stats` usage. Loom-side
  hash-chaining as with OpenCode (no tamper-evidence in Pi).
- Residual bypasses (name, don't ignore): direct `pi` invocation
  outside Loom's wrapper/extension, MCP server side-effects, text
  exfiltration via model output rather than tools, untrusted Pi
  packages with in-process access.

## Pi vs OpenCode, for Loom's strategy

OpenCode: rich built-ins (permissions, Doom-loop, snapshots) to align
with and route around, plus `--pure`/bus-only gaps. Pi: almost
nothing built in — cleaner joints (extension veto, SDK ownership,
RPC isolation, OpenClaw precedent) at the price of supplying the
entire policy layer. Loom-as-Pi-extension (+ optional SDK/RPC
supervisor) is the natural construction; Loom-as-OpenCode-plugin
fights more existing machinery. Both need the same Loom-owned lease
store, trigger-locked audit, and named bypasses.

Full evidence (commands, outputs, URLs, file paths): delegate report
R-30, session 2026-10-01. `[UNVERIFIED]` items carried there.
