# R-11 — Audit Vocabularies, Evidence Refs, Retention

Status: schema v2 design. No `src/` changes (R-01 gate still closed).
Grounding: SPEC acceptance triple ("requested, allowed/denied,
completed/failed; a partial action cannot appear successful"), R-03 tiers,
R-02 trigger enforcement, R-07 pause-token shape, A2A terminal states.

## Decision set (final)

`pending | allowed | denied | escalated | expired`

- `pending` — requested, no verdict yet. The pause-token state.
- `allowed | denied` — the verdict. (`denied` is terminal; see outcomes.)
- `escalated` — not decided here, moved up one tier (R-03 stall
  auto-escalation). Must resolve to allowed/denied in a follow-up row —
  an `escalated` row may never be the last row of an action.
- `expired` — approval window lapsed with no verdict. Terminal like
  denied (fail-closed: no verdict ⇒ no execution).

## Outcome set (final)

`pending | completed | failed | interrupted | timeout | not-executed`

- `pending` — not finished (or never started).
- `completed | failed` — executed to a verdict of its own.
- `interrupted` — externally aborted after start (kill switch, human
  cancel, crash). The "partial action" state: queryably not success.
- `timeout` — budget exceeded (separate from interrupted so R-16 budget
  tuning can count it; A2A folds both into failed/canceled — we split).
- `not-executed` — terminal outcome for denied/expired decisions. The
  action never ran; this value (not `pending` forever, not `interrupted`)
  says so honestly.

## Lifecycle invariants (enforced at write time, checked by view)

1. `outcome = completed` ⇒ `decision = allowed`. Only allowed actions
   complete. (Escalated must resolve first.)
2. `decision IN (denied, expired)` ⇒ `outcome = not-executed`, and no
   further rows for that action.
3. `outcome IN (completed, failed, interrupted, timeout)` ⇒ the action
   started ⇒ a prior row showed `decision = allowed`.
4. Last row per action is terminal (`completed | failed | interrupted |
   timeout | not-executed`) or the action is still open — crash triage
   is "all actions with non-terminal last row."

## Lifecycle-as-inserts (works with append-only triggers)

No UPDATEs ever (R-02 triggers forbid them). Each action gets a
client-generated `action_id` (UUID); every lifecycle event is a new row:

- request → `(pending, pending)` with tier + actor + evidence of request
- verdict → `(allowed|denied|escalated|expired, pending|not-executed)`
- finish → `(allowed, completed|failed|interrupted|timeout)`

Current state = latest row per `action_id` (a `latest_audit` view).
Id `AUTOINCREMENT` gives global order; `(action_id, id)` gives per-action
order. Crash between request and finish leaves a non-terminal last row —
exactly the "interrupted distinguishable from successful" requirement,
with no recovery-time inference needed.

## Schema v2 columns (delta vs scaffold)

ADD (all `NOT NULL`): `action_id TEXT`, `actor TEXT` (`agent:<id>` |
`human:<id>` — R-03; no runtime supplies it, so Loom records it),
`tier TEXT` (`standard | high-risk | critical`). KEEP: `run_id`,
`action`, `decision`, `outcome`, `evidence_ref`, `created_at`.
`evidence_ref` stays nullable only for the request row (evidence may not
exist yet); verdict/finish rows SHOULD carry one (enforced by app, not
by trigger — triggers can't see across rows).

## Evidence-ref format: `kind:locator`

Pointers, never blobs. `kind` ∈ `cmd | file | session | url | trace |
approval | archive`. Locator carries a content pin where possible:

- `cmd:bun test` + run context (command text; output hash optional)
- `file:docs/work/verification.md@sha256:<hex>` (hash mandatory for
  verify-phase evidence — stale-file substitution is the failure mode)
- `session:opencode:<session-id>` (transcript pointer, R-07 read path)
- `approval:<action_id>` (verdict row pointing at its own action chain)
- `trace:otlp:<trace-id>`, `url:https://…` (retrieved sources)

Format-checked by regex at write time (cheap, catches typos); content
hashes verified only on demand (verify phase, drift check) — continuous
re-hashing would cost more than it buys.

## Retention: the ledger is immutable; retirement is an action

- No app path deletes audit rows, ever (R-02 triggers make this
  mechanical, not conventional).
- Size control = archival, not pruning: monthly export of sealed ranges
  to `audit-YYYY-MM.jsonl` + sha256 manifest referenced as
  `archive:<manifest-hash>` evidence; the live DB keeps a hot window
  (proposed: trailing 90 days, tunable).
- Moving rows out of the live DB is itself a **critical-tier audited
  action** (propose + verify + archive-hash evidence), executed as:
  export → verify manifest → audited range-retire → checkpoint. Silent
  DELETE stays impossible — the trigger guarantees any bypass attempt
  fails loudly rather than corrupting quietly.
- Derived stores (dashboards, indexes, exports) may prune freely; they
  are caches, and re-hydration from ledger + archives is the recovery
  path.
