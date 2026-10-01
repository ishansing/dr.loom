# Pi Track 6 — Control, Observability, Durability

Covers checklist items 20 (approvals cross-ref), 24, 30, 31, 32, 33,
34, 38, 39, 40. Versions: npm `0.99.2` all packages, Node
`>=22.19.0`.

## Subagent limits (item 24: extension-built)

- No core subagent (pi.dev: "No sub-agents — spawn via tmux, or build
  your own"). `Agent`/`AgentTool` types carry no depth/budget
  fields; `runLoop` has no spawn logic (unanimous `terminate:true`
  batch ends it).
- Example implements caps locally: 8 tasks / 4 concurrent / 50KB
  per-task output, subprocess isolation (`--mode json -p
  --no-session`), SIGTERM→SIGKILL abort propagation — **no depth
  counter found**. Third-party multi-agent (`pi-agents-team`)
  is not core. Loom's R-13 depth≤3 + R-16 fan-out caps fill the
  vacuum with real bounds.

## Retries (item 30: transient-only auto-retry, no taxonomy)

- Core: `set_auto_retry/abort_retry` RPC; defaults `enabled,
  maxRetries 3`, exp backoff; classifier =
  RETRYABLE_PATTERN (overloaded/rate-limit/429/500/502/503/504/
  network/timeout/…) MINUS NON_RETRYABLE (quota/billing/limits);
  separate provider-level retry (408/409/429/5xx, retry-after);
  distinct `auto_retry_*` vs `summarization_retry_*` events;
  overflow is a separate compact-and-retry path, not
  retry-everything.
- **No model/tool/test/network/invalid-output taxonomy**: tool
  throw → `isError` result for the model; error/aborted turns
  hard-exit. Harness classifies; Pi retries transport.

## Idempotency (item 31: none in ops)

- No idempotency keys in RPC commands, tools, or session entries
  (ids are tree links + cursors, not dedup). Pi `edit` isn't even
  no-op-safe (identical replacement errors, issue #2564).
  `requestId` dedup exists ONLY in experimental durable
  (`root.submit`, subagent reporters). **Interrupted-may-run-twice
  is the standing assumption** — Loom's R-06 idempotent-effects
  rule is load-bearing here, not belt-and-braces.

## Cancel/timeouts (item 32: primitives yes, guards no)

- Have: `abort()` (+wait idle), `abort_bash` (`cancelled:true`),
  `clear_queue` (queued steering/follow-up), `ctx.shutdown()`
  (idempotent handlers required), abort propagation to
  subprocess subagents.
- Missing: **per-tool timeouts** (only transport-level
  `httpIdleTimeoutMs` etc.), **runaway-loop guard** (`runLoop
  while(true)` exits on finish/no-queues/error/abort/unanimous
  terminate; docs warn continuation "can loop" — guard is
  author-owned). Steering/follow-up queue modes bound injection,
  not iterations. Loom's R-16 deadlines + doom-loop-class
  detection are the missing guards.

## Budgets (item 33: observability only, no caps)

- Have: `get_session_stats` (messages, tool calls/results,
  tokens in/out/cacheRead/cacheWrite/total, cost, contextUsage);
  `thinkingBudgets`, compaction reserves; example-local subagent
  constants; durable tracks-but-doesn't-cap spend.
- Missing: max-cost/tokens/time/tool-calls/subagents —
  **every R-16 budget is harness-owned**. (Goal-mode budget
  feature: NOT-FOUND.)

## Observability (item 34: events+stats, no run ledger)

- Emits: full event stream (turns, delta-only message updates,
  tool start/update/end+isError, queue/entry/info/thinking/
  compaction/retry/bashes/extension errors, settle semantics),
  state inspection RPC (`get_state/messages/entries{since}/
  tree/fork-messages/last-assistant-text/export_html/commands`),
  v3 JSONL on disk (incl. pre-compaction + abandoned branches),
  opt-in OTel-neutral telemetry (explicit spans, NO exporter,
  prompts/args/contents excluded by default).
- Partial/bounded file tracking (compaction `details{readFiles,
  modifiedFiles}`, nested-call records without results, usage
  bubbling). **No per-run joined record** (task+agent+model+
  prompts+calls+results+errors+retries+files+tokens+duration+
  status) — Pi gives deltas + JSONL + totals; the run ledger is
  Loom's (R-11/R-21).

## Eval suite (item 38: docs-lift + smoke, not gates)

- `packages/evals/` (private, vitest-evals): paired
  with/without-docs Docker arms reporting lift + host suites
  (smoke: capital-of-France + usage assertions). Isolated arms,
  fresh everything, `.eval/<ts>_<id>/` artifacts. No
  harness-regression or model-comparison harness; no shipped
  assertion library. Loom's R-26 fixtures are additive, not
  duplicative.

## Version pinning (item 39: mechanics enable, policy is Loom's)

- `pi install npm:@x@ver | git:…@tag|commit` (pinned refs never
  moved by update; `-e` one-shot; `--local`); `pi update`
  (self/extensions/models/all, `--force`); version check +
  install telemetry endpoints (+ `PI_OFFLINE/PI_SKIP_VERSION_CHECK`
  escapes); peerDeps-`*` discipline with duplicate-class warnings;
  supply-chain hardening (exact pins, lockfile ground truth,
  shrinkwrap in published CLI, `--ignore-scripts`, audit).
- So: pin refs + evals + reconcile exist; **promotion policy
  (deliberate upgrade → eval suite → adopt) is harness-owned** —
  Loom's R-08 policy with Pi-flavored mechanics.

## Durability / pi-durable (item 40: EXISTS, experimental)

- `@earendil-works/pi-durable@0.99.2`: durable conversation/task/
  document runtime — immutable commits, `TaskGraph`
  (pending/running/waiting/completing), `defineTask/defineDoc`,
  `requestId` dedup, `replay:safe`, SQLite (`openNodeSqliteStorage`,
  WAL, one process per storage, no cross-process lock) or JSONL,
  `Harness.open/resume/close`, task-owned subagents, usage
  tracking. Design docs (`pico-v5*`), examples, benches.
- Header: **"Experimental. The API changes without notice."**
  HEAD commit itself is a durable vacation-planner demo. Use only
  behind a flag + pinned `0.99.2` + eval gate; never the v0.1
  durability story. Loom's own ledger/audit remains the durability
  of record; durable is a candidate, not a dependency.

Primary URLs: `packages/coding-agent/{docs/{rpc-commands,settings,
json,sdk,extensions,session-format},src/modes/rpc/rpc-types.ts,
src/core/{bash-executor,agent-session},examples/extensions/subagent/}`
+ `packages/{agent/src/{types,agent-loop},ai/src/utils/{retry,
provider-retry,overflow},evals/{README,evals/},durable/README,
telemetry/}` + issues `#2564` + pi.dev packages.
