# R-14 — CLI UX for Human Runs

Status: design. No `src/` changes (implementation awaits build
authorization with the rest of milestone 1).
Grounding: `../I2P/tests/skills/HUMAN-RUNS.md` (7 runbook families),
SPEC acceptance ("next operator locates last transition, evidence, and
resume point without conversation history"), R-12/R-13 accounting rules.

## Boundary

Loom does not conduct runbooks — framework skills do (interviews,
wizard steps, grading). The CLI is the **recording + orientation
surface**: open a run, record phase transitions with evidence, show the
resume bundle. Every runbook family maps to the same four commands.

## Commands (v1 surface — no additions beyond these)

- `loom init --db PATH --run ID --runbook NAME --goal TEXT
  [--scale small|standard|greenfield|e2e]`
  Opens the run: framework pin check first (fail-closed), then the
  opening `init/committed` transition carrying goal + runbook. Re-init
  of an existing run id is rejected (runs never reopen; retries are new
  runs or new phases — R-12).
- `loom record --db PATH --run ID --phase NAME --status
  running|committed|failed|interrupted --resume POINT
  [--evidence REF …] [--thread ID] [--owner O --epoch N]`
  Appends a transition. `--status running` opens a phase (R-12:
  at most one open per run+thread); terminal statuses close it.
  `--evidence` repeatable, R-11 `kind:locator` format, file refs with
  hashes. `--owner/--epoch` reserved for the R-04 write gate (accepted
  and recorded now, enforced when the gate code lands).
- `loom status --db PATH --run ID [--json]`
  The resume bundle for a fresh operator: run identity + runbook, last
  committed transition per thread (R-13), open `running` phases, open
  audit actions (pending verdicts = "awaiting human"), current lease
  holder + expiry. Human-readable by default (orientation protocol:
  progress first, like `claude-progress.txt`); `--json` for machine
  capture into `tests/skills/results/`.
- `loom check-framework [--commit C --version V]`
  Unchanged (exists). Every runbook opens with it; its pass/fail is the
  first evidence ref of the run.

Deliberately absent in v1: interactive prompting (skills interview, not
Loom), `lease acquire/release` as human commands (leases are
agent-held; human-driven contention tests go through R-10-style
scripts, not the CLI), and any `resume --write` (orientation is
read-only; state changes only via `record`).

## Runbook mapping

- **Repeat goldens (standard/greenfield/small):** `init --runbook
  golden-<scale>`; `record` per phase with metrics as evidence
  (`file:…@sha256` for artifact snapshots). Variance vs recorded runs
  is a human judgment captured as a final `record --status committed`
  with the comparison note as evidence — Loom stores the claim + its
  basis, never the verdict alone.
- **Grilling cases (ISO-02/COMP-01/COMP-02):** `init --runbook
  grilling-<case>`; questions asked recorded as evidence file refs;
  "no invented answers" checked by the human against the cited research
  artifact, whose hash is recorded at `init` (R-11 file pin).
- **Full-matrix e2e:** `init --runbook e2e-matrix`; one `record` per
  lifecycle stage; rubric scores as evidence refs. Merge-conflict
  injection and wizard steps are framework-side events; Loom records
  their outcomes, not their conduct.
- **FAIL-07:** `init --runbook fail-07`; negative path (missing
  capability named, no faked test) and positive path (real headless
  flow) recorded as separate `record` rows with distinct evidence —
  never one row covering both (a partial action cannot appear
  successful — SPEC).

## Output and failure contract

- Default output is a short human summary (run, phase, status, resume
  point, open approvals count); `--json` emits the full rows.
- Every failure is stderr + nonzero exit + actionable reason: unknown
  run ("no such run; `init` first"), second open phase ("phase X still
  running; close it first"), pin mismatch (check-framework text),
  closed-run write ("run finished with <status>; start a new run").
  No stack traces to humans; `--json` includes the machine reason.
- `status` on an empty/missing DB reports "no runs" (exit 0, empty
  bundle) — absence of evidence is information, not an error.

## Implementation notes (for build authorization)

- `status` = `getLastTransition` per thread + open-phase scan + open
  audit scan + lease read: four read queries, one command. Threads and
  audit-query helpers don't exist yet (R-11 schema v2, R-13
  `thread_id`) — CLI lands with or after those.
- Golden-run metric comparison (scale/phases/skills/artifacts vs
  recorded runs) stays human-side; the CLI's job is making the recorded
  side complete and hash-pinned, not diffing.
