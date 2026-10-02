# R-16 — Budgets (Time, Retry, Cost, Fan-out)

Status: policy design. No `src/` changes (implementation rides
milestone build authorization; kill-switch integration points are
marked for R-17's engage path).
Grounding: gRPC deadlines, Go context, Finagle/Envoy retry budgets,
`max_turns`/`max_budget_usd`, Vercel `stopWhen` (01 §2.4–2.6, 02);
R-11 `timeout` outcome; R-13 per-thread roll-up; R-17 automatic
engagement (engage yes, reset never).

## Principle

Budgets bound **blast radius**, not correctness. A budget never decides
an action was wrong — it decides the run has spent enough. Breach
consequence is therefore always the same shape: stop spending, record
why, leave the books balanced. The only question per budget kind is
*what* stops and *who* may resume.

## The four budgets

### 1. Time (deadlines)

- Every action carries an absolute deadline (unix ms, monotonic clock —
  single-host SQLite, no skew problem). Passed down on spawn: child
  deadline ≤ parent remaining (gRPC propagation, 01 §2.4).
- Expiry ⇒ in-flight actions close as R-11 `timeout`; pending approvals
  in scope freeze as `denied/not-executed` (same shape as R-17 freeze,
  smaller scope).
- Defaults (tunable, stated not derived): action 600s (matches the
  Claude hook ceiling — the only timeout constant with production
  mileage in our sources), phase 1h, run 8h. All three settable per
  run at `init`; runbook defaults live with the runbook, not the code.

### 2. Retry (token bucket, Finagle-shaped)

- One bucket per run: capacity = max(10, 20% of tool calls so far),
  deposits expire after 60s. Only *safe* retries draw: transient
  infra/tool errors. Never drawn by: approval denials, validation
  failures, fatal model errors, or kill-gate rejections (those are
  verdicts, not bad luck — retrying them is the doom loop R-12's
  detector watches for).
- Empty bucket ⇒ the retry is refused and the action closes as
  `failed` with evidence `budget:retry-exhausted` (not `timeout` —
  honest cause). Bucket state is a counters row (below), so exhaustion
  is queryable, not inferred.

### 3. Cost (usage metering, caps)

- Meter from provider `usage` objects per turn (input + output +
  reasoning + cache splits — 02 Part 1.4), recorded per `thread_id`,
  rolled up to `run_id` (R-13). Never estimated from visible text
  (reasoning tokens are invisible and billable).
- Caps per thread AND per run, set explicitly per deploy. **Unset cap
  = meter-only mode** (record everything, enforce nothing), stated in
  `status` output so "no cap" is a visible choice, not a silent gap.
- Breach ⇒ automatic **run-scoped kill engagement** (R-17 path,
  actor=`system:budget`, evidence=counter row). The one automatic
  engager besides risk-score. Reset stays human-only, always.

### 4. Fan-out (spawn and call caps)

- `max_live_threads` per run (default 8: main + 7 — depth ≤ 3 from
  R-13 bounds the tree, this bounds its width), `max_tool_calls` per
  run (default 500, runbook-tunable). Spawn beyond either is denied at
  spawn-audit time (fail-closed, evidence `budget:fan-out`).
- Rationale: cost caps catch spend after the fact; fan-out caps prevent
  the shape of spend (a 50-thread fan-out is wrong at thread 9, not at
  invoice time).

## Counters (storage sketch, schema v2 alongside R-11)

- `budgets(run_id, kind, used, limit, updated_at)` — one row per
  (run, kind) with kinds `time-ms | retries | cost-tokens |
  cost-minor-units | threads | tool-calls`. Check-and-increment inside
  the same txn as the metered event (atomic draw, no TOCTOU).
- Usage ingestion is itself an audited append (thread usage rows), so
  the meter and the books can never disagree: counters are a view over
  usage rows plus limits, recomputable after any crash.
- Breach rows are audit actions (`action=budget-breach`,
  actor=`system:budget`, tier high-risk) — budgets spend accountability
  like everything else.

## Enforcement points (where each budget bites)

- Spawn: depth (R-13) + fan-out caps + deadline inheritance.
- Tool call: retry-bucket draw + call-cap increment + per-action
  deadline stamp.
- Write gate (R-04): kill check, then deadline check, then lease check —
  in that order (cheapest, most-final first).
- Turn close: usage ingestion → counter update → cap comparison →
  breach action.

## Explicitly deferred

- Adaptive budgets (learning limits from history) — needs the eval
  harness (R-26) to exist first; static caps until then.
- Cross-run/global spend caps — no multi-run accounting story yet
  (same gap as cross-harness kill, R-17); per-run truth only.
