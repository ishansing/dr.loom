# R-21 — Dashboard Hydration

Status: design. No `src/` changes (implementation rides later
milestone build authorization — dashboard is observability, not
milestone-1 enforcement).
Grounding: CUSTOM-HARNESS (store hydrated into dashboard at startup
+ after recovery); R-12 triage queries; R-13 threads; R-14 status
bundle (the dashboard's CLI twin); R-20 session scores; the 2.2 GB
OpenCode DB lesson (never full-scan — cursor, don't crawl).

## Rule

The dashboard owns **no state**. It is a read-only projection rebuilt
from the ledger on every hydration — startup, post-recovery, refresh.
There is no second store to sync, drift, or reconcile. If the ledger
can't answer a dashboard question, the ledger schema is what's
missing (fix it there, per R-11/R-13 discipline).

## Hydration protocol

- Open a **readonly handle** (R-02 verified) — hydration physically
  cannot disturb the store, even mid-recovery.
- Run the hydration query set (below) and render. No writes, no
  migrations, no "repair" prompts. A dashboard that writes is a
  second writer wearing a costume.
- After crash recovery, hydration runs *before* any resume action:
  the operator reads the world before touching it (R-12 triage order).

## The hydration query set (views, all recomputable)

1. `runs` — run identity + runbook + terminal/open state.
2. `latest_transition(run, thread)` — resume points (R-13; also the
   R-14 bundle core).
3. `open_phases` — non-terminal transitions (work in flight).
4. `open_approvals` — non-terminal audit actions (awaiting human).
5. `lease_state` — holder + epoch + expiry per workspace.
6. `kill_state` — latest kill row per scope (first line of every view).
7. `budget_state` — counters vs limits per run (R-16).
8. `session_risk` — decaying scores per run (R-20).

These are also the crash-triage and `status` queries — one query set,
three consumers (dashboard, CLI, triage). New consumer, same views.

## Freshness (cursor, staleness shown)

- Readers track a monotonic cursor: max seen row id per table; each
  refresh fetches only newer rows (the CUSTOM-HARNESS cursor shape).
  Poll interval + on-demand refresh; no live tail in v1 (WAL-tail
  complexity without a demonstrated need).
- Every view shows **data-as-of + rows-behind**. A dashboard that
  can't display its own staleness lies by omission — during an
  incident, "3 min old" vs "live" changes every decision.

## Read-only in v1 (deliberate)

- No kill buttons, no approve buttons, no lease controls. Control
  actions happen in the CLI/API where full audit context (reason,
  evidence, actor) is mandatory input — buttons compress context
  until approval becomes reflex, which is how gates get bypassed
  (R-20's core warning).
- Drill-down is unlimited (run → thread → action chain → evidence
  refs); the drill path that ends at "engage kill" hands off to the
  CLI command with scope pre-filled, and the CLI still demands the
  human's reason.

## Multi-session layout

- Run list with status chips: `running | paused (n approvals) |
  killed | done | failed` — chip derived from the views, never
  stored.
- Per-run: threads with resume points, open work, spend vs budget,
  risk score. The operator's first glance answers "what needs me":
  open approvals and killed scopes sort above quiet running work.
