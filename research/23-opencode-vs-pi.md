# R-31 — OpenCode vs Pi for Loom

Status: comparison findings. Assumes OpenCode 1.18.x (sst lineage) and
Pi 0.99.x (`earendil-works/pi`) per the R-07/R-30 evidence passes.
No `src/` changes.

## Verdict

Target Pi first, OpenCode second, architect for both. Loom's expensive
half (lease store, trigger-locked audit, kill/budget/policy designs
R-01–R-26) is runtime-agnostic; only the interception adapter differs
per runtime, and both expose the same three joints: a pre-execution
veto, an event stream, and readable session state. Loom core once, two
thin adapters (`loom-pi` extension + `loom-opencode` plugin).

## Flexibility

| | OpenCode | Pi |
|---|---|---|
| Philosophy | Batteries-included: permissions, doom-loop guard, snapshots, SQLite store, server + TUI | Minimal core: 4 tools; gates, path protection, plan mode, subagents all extension-built |
| Extension model | Plugins (hooks, custom tools, bus events); a plugin tool shadowing a built-in replaces it | TS modules + distributable packages (npm/git); `jiti`, no compile step |
| Modes | `run` (JSON events), `serve` + HTTP/SSE, `attach`, `acp` server, TUI | interactive, print, `--mode json`, `--mode rpc`, **SDK** in-process embedding |
| Embedding precedent | `serve` API + SSE; third-party bridges | **OpenClaw embeds the SDK** (tool filtering + replacements + prompt sections) |
| Config story | Layered config + **managed config** (`/etc/opencode/opencode.json`), verifiable via `debug config` | Settings + trust-gated resources + package pins; no managed-config equivalent found |
| Escape hatches | `--pure` disables all external plugins (documented bypass) | No `--pure` — but no gates to disable; bypass = invoking `pi` without Loom's extension |

Pi wins flexibility (smaller core, SDK-first, packaging). OpenCode wins
deployability (managed config as a ship-and-verify channel).

## Reliability (veto trust + ledger completeness)

| | OpenCode | Pi |
|---|---|---|
| Veto point | `tool.execute.before` throw, fires before permission eval; veto = model-visible tool error | `tool_call` `{block, reason}` or throw (fail-safe); nested calls re-enter |
| Hook robustness | **No hook timeouts** (hung hook hangs the call); `permission.ask` hook legacy/dead — observe the bus | Fail-safe throw contract; headless needs explicit default-deny (`ctx.hasUI` false) |
| Built-in guardrails | Real: allow/ask/deny, doom-loop → ask, `*.env` deny default, per-file semaphores | None in core — Loom supplies 100% of policy |
| Session store | SQLite/drizzle (transcript, diffs, tokens/cost); 2.2 GB observed; asks **bus-only, never persisted** (verified, 127 sessions) | Append-only JSONL tree + `get_entries{since}` cursor + usage stats; **no locking, checksums, or redaction** |
| Out-of-band writes | Forbidden (races drizzle) | Same rule (writers race; upstream stale-merge fix exists) |
| Audit export | `export --sanitize` built in | `/export` HTML/JSONL, no sanitize flag confirmed |
| Residual bypasses | `--pure`, second-process DB writes, `serve` shell path (hook coverage unverified), ACP/IDE ingress | Direct invocation, MCP stdio side-effects, text (not tool) exfiltration, in-process packages |

Split verdict, stated honestly: OpenCode gives more to stand on (denies,
managed config, rich store), each with a documented hole Loom must cover
(ask-gap join, `--pure` acceptance, self-implemented hook timeouts). Pi
gives almost nothing — smaller trusted base, no rival policy engine, no
silent gaps — but a Pi deployment without Loom loaded is fully
unguarded, where OpenCode at least has defaults. For an enforcement
harness, Pi's poverty is a feature with a price.

## Multi-agent orchestration

- **OpenCode ahead today**: native subagents (child sessions, *own*
  permissions), per-session single-flight (`BusyError`), `session_input`
  admission scaffolding. Maps onto R-13 threads — Loom still supplies
  leases, per-thread resume, handoff trails (all absent).
- **Pi core behind by design**: no subagents in core (extension-built);
  each subagent system is a new unaudited policy surface per
  installation. OMP fork adds machinery with fork-divergence risk —
  don't build on it.
- **Protocols**: neither speaks A2A natively (OpenCode's `acp` command
  is Agent Client Protocol, not A2A — do not conflate). Both fit R-22's
  envelope. Cross-harness federation stays unsolved for both.
- Consequence: on OpenCode Loom supervises already-structured
  multi-agent work (align + gate); on Pi Loom must additionally define
  the thread discipline (spawn depth, grant defaults) because core
  won't.

## Recommended sequence

1. **Loom core first** (designed, R-01–R-26) — runtime-independent.
2. **Pi adapter first**: `loom-pi` extension (veto + grants + audit
   feed) over SDK embedding where Loom hosts, RPC supervisor where it
   doesn't. Cleanest joints, OpenClaw precedent, no rival machinery.
3. **OpenCode adapter second**: plugin (before-hook veto + bus
   observation) + `--format json`/SQLite ledger reader with SSE
   ask-gap join + managed-config baseline. More machinery, more holes
   to cover — worth it, but second.
4. **Shared conformance suite** (R-26): same contention/kill/recovery
   fixtures against both adapters — veto timing and bypass surface
   differ, ledger invariants must not.

Full evidence: R-07 delegate report (session 2026-10-01) and R-30
report + `22-r30-pi-agent.md`.
