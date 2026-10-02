# R-12 — Pause-vs-Turn Accounting

Status: design. No `src/` changes (R-01 gate still closed).
Grounding: OpenAI "approvals are paused runs, not new turns" (02 Part
4.2); LangGraph interrupt/resume; scaffold `transitions` + R-11 audit
lifecycle.

## Rule

An approval pause mints **no transition**. Only committed effects do.
The pause is recorded entirely in audit rows (R-11 `action_id`
lifecycle: request `(pending,pending)` → verdict → finish); the open
phase transition is untouched.

## Transition lifecycle (write-time rules)

- One phase opens at most one `running` transition per
  `(run_id, thread_id)` (R-13 for threads). Opening a second `running`
  row for the same phase while one is open is a writer bug → reject.
- The open row closes exactly once, to `committed | failed |
  interrupted`. Close rows are terminal; phases never reopen (a retry is
  a new phase or a new run — recorded as such, never rewritten).
- Pause/resume cycles insert zero rows. Resume continues the same open
  `running` row. A phase interrupted by crash keeps its `running` row
  open; triage joins it with the audit pause record (see below).

## Why this shape (precedent)

- OpenAI keeps turn counts, history, and continuation IDs consistent by
  treating approvals as the *same* run paused. Loom mirrors it:
  `transitions` counts effects, not wall-clock stalls. Any metric built
  on transitions (progress, mean-retries-per-task) then measures work,
  not waiting.
- LangGraph restarts the interrupted node from the top on resume — the
  ledger analogue is "the open row is still the truth," no compensating
  row needed.

## Crash-during-pause triage (the query, not inference)

- Open `running` transition + audit action with non-terminal last row
  (pending verdict) → **awaiting verdict**: re-present to the authorizer,
  resume on allow.
- Open `running` transition + audit action terminal-allowed but no
  finish row → **interrupted mid-effect**: re-verify the effect (did it
  land?) before replay — effects must be idempotent (R-06).
- Open `running` + no audit row at all → **died before requesting**:
  safe to resume the phase from its resume point.

## What this forbids

- "Heartbeat" transitions (periodic running-row updates while waiting).
  Waiting is not work; liveness belongs in the lease's `expires_at`,
  not the ledger.
- Rewriting `resume_point` on an open row (no UPDATEs, same discipline
  as audit). If the resume point genuinely advances mid-phase, close
  and open — phases are cheap, history is the product.
