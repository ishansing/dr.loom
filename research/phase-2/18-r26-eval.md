# R-26 — Loom's Own Eval Harness

Status: design. No `src/` changes (fixtures land with milestone
builds; the discipline starts now).
Grounding: I2P's validation culture (goldens, campaigns, rubrics,
repeat discipline — SKILL-FRAMEWORK §§25, HUMAN-RUNS.md); LangSmith
three granularities (final-response / single-step / trajectory —
02 Part 5.7); R-16/R-20 calibration debt (both wait on history);
R-05/R-10 throwaway-DB experiments as fixture prototypes.

## Rule

The harness that enforces evidence discipline on agents holds itself
to the same bar: no enforcement change merges without a fixture that
would have caught its absence, and no tuning change merges without
the history that justifies it.

## What Loom evals (enforcement, not skills)

Framework goldens validate skills; Loom evals validate the gates
around them:

- Leases: contention races (exactly-one-winner), expiry succession,
  stale-release/write rejection, handoff epoch trails.
- Recovery: kill-mid-txn resume, relay replay idempotency, cursor
  recomputation after crash.
- Audit: every high-risk effect has its triple; denied/expired never
  pair with completed; quarantine and breach rows present where due.
- Kill/budgets/permissions: kill latency bound, breach engages,
  authorize() verdicts match policy on a decision corpus.
- Schema: migrations preserve readers (the R-10 drift lesson as a
  standing fixture — old-DB-opens-new-code and reverse).

## Three granularities (LangSmith-shaped)

- **Final-state:** did the ledger/audit end correct? (row counts,
  terminal states, balances). Deterministic assertions, CI-gated.
- **Single-step:** did each gate decide correctly *with its reason*?
  (verdict + evidence on a fixed decision corpus: allow/ask/deny
  cases incl. adversarial near-misses.) Deterministic, CI-gated.
- **Trajectory:** did the sequence match? (request→verdict→finish
  ordering per action; no skipped gates; pause-before-effect where
  required.) Exact-sequence for fixtures; rubric-scored for human
  runs. LLM-as-judge permitted **only** for quality dimensions
  (evidence completeness, reason clarity) — never for safety
  properties. A probabilistic judge cannot certify "exactly one
  winner"; determinism does.

## Fixtures as code + goldens as records

- Deterministic scenarios are scripts against throwaway DBs
  (R-05/R-10 pattern), checked into `tests/`, run in CI on every push.
  New enforcement behavior ships with its fixture in the same commit
  (the §25.7 TDD loop, applied to the harness itself).
- Human golden runs (R-14 CLI flows: contention drills, kill drills,
  incident replays) record `--json` bundles into `tests/evals/` with
  date + operator + framework pin. Repeats compare on fixed
  dimensions (the golden-runbook discipline: variance noted, not just
  pass/fail).
- Flaky fixtures are bugs in the fixture or the code — quarantined
  with an incident row, never `@skip`ped into invisibility.

## Calibration loop (closes R-16/R-20 debt)

- Eval history is the tuning dataset R-20 said accumulates for free:
  risk weights/thresholds, budget caps, retry parameters are tuned
  against fixture + golden outcomes, on a schedule (monthly, with the
  R-29 drift review), not on vibes.
- Tuning changes are themselves audited policy changes (old value,
  new value, justifying evidence) — policy has provenance too.
- Guardrail: tuning may only narrow enforcement within a quarter
  unless an incident row justifies widening. The harness must not
  learn its way out of safety between reviews.
