# R-20 — Risk Scoring

Status: primitives design. No `src/` changes (implementation rides
milestone build authorization).
Grounding: CUSTOM-HARNESS (risk primitives, escalate/block on
crossing); R-03 tiers + escalation path; R-11 audit evidence; R-16
budgets (spend) vs this (authorization shaping); R-21 dashboard
consumer; the obedience-vs-gate lesson (a model's self-assessed "low
risk" is not evidence).

## Rule

Risk is computed from **recorded observables**, never from model
self-report. The score explains itself: every point traces to a
ledger/audit row. A score nobody can audit is a vibe — and vibes don't
gate mutations.

## Features (all already recorded, nothing new to instrument)

- Tier weight (R-03): standard 0 / high-risk 20 / critical 40.
- Target sensitivity: outside workspace +25, secrets-adjacent
  (`*.env`, keys, Loom DB) +30, prod env (R-19) +30, network egress
  with data +15.
- Blast radius: fan-out width and target count (delete of 200 files
  ≠ delete of 1): +2 per additional target, capped +20.
- Novelty: first-time tool/target in this run +10 (novelty is where
  prompt-injection payloads hide — 02 Part 2.5).
- Velocity: actions/min above runbook baseline +10; active
  doom-loop signal +15 (R-12 detector output is an input here).
- History: prior deny in this run +10; prior failed confirm (R-19)
  +15. The run that keeps failing is telling you something.
- Irreversibility: delete/publish/egress +10 (reversible edits don't
  pay this).

Starting weights, runbook-tunable, recorded at `init`. Deliberately
additive and dumb — no ML, no hidden state. When the weights are
wrong, the breakdown shows exactly which term lied, and tuning is
arithmetic.

## Scores and thresholds

- Action score 0–100, computed at request time from current rows
  (recomputable after any crash — same discipline as R-16 counters).
- Session score = max action score with 1h half-life decay (recent
  danger counts more than old danger); feeds dashboard (R-21) and
  kill-switch context (a human reading `status` sees it).
- **Escalate threshold (default 40):** action tier moves up one
  (standard→high-risk→critical) via the R-03 escalation path —
  an `escalated` audit row, approval now required. Cheap (asks a
  human), so the threshold sits low.
- **Block threshold (default 75):** action denied outright
  (`denied` + `not-executed`, evidence = score breakdown). Expensive
  (stops work), so the threshold sits high.
- Separation from budgets/kill, stated once: risk **escalates tiers
  and denies actions**; it never kills runs (kill is budgets/human,
  R-16/R-17). A blocked action is appealable (human override =
  audited critical action); a killed run is not resumable by appeal.

## Calibration and audit

- Thresholds + weights ship as runbook defaults, recorded in the run's
  opening transition. Tuning needs history (R-26 eval) — until then,
  static values and wide logging: every request row carries
  `score + breakdown` evidence (R-11), so the first tuning dataset
  accumulates for free.
- False-positive asymmetry is the design: escalate liberally (a
  needless ask costs seconds), block conservatively (a needless deny
  costs trust in the gate itself). A gate humans learn to distrust
  gets bypassed — the most dangerous outcome this design must avoid.
- Threshold crossings are audit actions (`action=risk-escalation|
  risk-block`, actor=`system:risk`, tier high-risk) — risk spends
  accountability like budgets do.
