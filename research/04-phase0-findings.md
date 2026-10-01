# Phase-0 Research Findings

Status: findings, not implementation. Enforcement-code gate (R-01) is still
closed — Designs R-03/R-04/R-06/R-08 are build-ready specifications, no code
written under them. Framework baseline: I2P `1d66588` (v2.1.0), HEAD
verified unchanged.

## R-01 — §25 gate: MET 2026-10-01 (updated; reassessment below is history)

- Closure verified in-repo: I2P `4fe0869` "Close gate 25", judgment
  `tests/skills/results/2026-10-01-readiness-gate-closed.md` — **GATE
  MET**, all four conditions met by run, none waived.
- Delta over the `1d66588` pin is evidence-only (README status, FAIL-07
  result line, five result files; no contract/registry/lockfile changes;
  `VERSION` still `2.1.0`). Loom re-pinned to `4fe0869`.
- Scope change from the grilling outcome: the global kill switch joins
  the first milestone (SPEC updated). Enforcement code is permitted as of
  this closure; R-04/R-06/R-11 designs are now build-ready.

Original 2026-09-30 reassessment (gate still closed at the time):

- HEAD is still `1d6658833713fd8de4852b2c85d8be65db98796f`, `VERSION`
  still `2.1.0` — `FRAMEWORK_REF` matches. No framework drift.
- One new result file since the gate: `2026-09-28-upgrades-validation.md`
  (ECC upgrades U1–U9 validation: fail-closed inputs, untrusted diffs,
  finding dedup, slice rubric, pin checks). It validates *adjacent*
  upgrades — it does **not** close any of the four gate conditions.
- The four outstanding items are unchanged: (1) repeat standard golden,
  (2) repeat greenfield golden, (3) one full human-run grilling
  interview, (4) browser FAIL-07 (run in Playwright env or record
  permanently blocked). Three of the four require human execution; none
  can be closed from inside this session and none is fabricated here.
- Consequence: SPEC's "do not begin enforcement code" still holds. All
  Phase-0 output below is design + experiments on throwaway DBs only.

## R-02 — bun:sqlite hardening surface (experiments, `/tmp/opencode/loom-exp/`)

- **Triggers work.** `BEFORE UPDATE/DELETE … SELECT RAISE(ABORT, …)` on
  an `audit` table: UPDATE and DELETE blocked with the custom message,
  INSERT and SELECT unaffected. Verdict: trigger-backed append-only is
  viable — first schema upgrade.
- **No authorizer.** `Database.prototype` =
  `clearQueryCache, close, exec, fileControl, handle, inTransaction,
  loadExtension, prepare, query, run, serialize, transaction` — no
  `sqlite3_set_authorizer` equivalent. The GRANT-style denial path from
  01 §2.4 is confirmed unavailable; triggers are the *only* in-SQL
  enforcement.
- **Readonly handles work.** `new Database(path, { readonly: true })`
  reads fine, writes fail with `attempt to write a readonly database`.
  Layering: writers open read-write (leases, transitions, audit INSERTs);
  auditors/dashboards open readonly; triggers guard even the writer.
- **Caution:** `loadExtension` exists on the prototype — never enable
  extension loading on any handle touching untrusted input.

## R-03 — High-risk action taxonomy (draft for schema freeze)

Three tiers, derived from vendor permission keys (OpenCode
`edit/bash/external_directory/doom_loop`, Claude `allow/ask/deny`) and
the poisoning evidence (02 Parts 2–3):

| Tier | Examples | Gate | Audit |
|---|---|---|---|
| Standard | read, glob/grep, plan-mode exploration, status queries | lease held | logged (requested/completed) |
| High-risk | file edit/write/delete, shell exec, network egress with data, `external_directory` access, MCP tool calls to untrusted servers | human approval + lease held | requested / allowed-or-denied / completed-or-failed + evidence ref |
| Critical | secret access/rotation, deployment/publish, persist to shared memory/KB (poisoning vector), permission/lease/governance changes, out-of-band DB writes | human approval + valid lease + dual evidence (propose + verify phases) | full triple + actor identity + before/after refs |

Rules: authors are `agent:<id>` or `human:<id>` — every row carries actor
identity (no runtime supplies it end-to-end, 02 Part 5.6). Tool
descriptions are untrusted input, never policy (MCP spec trust rules).
`doom_loop`-class stall signals auto-escalate one tier. Memory/KB writes
are high-risk minimum (tainted entry re-infects all future sessions).

## R-04 — Lease enforcement at the write path (design)

Precedent consensus (R-09): Chubby checks the sequencer on the mutation
RPC, etcd gates writes with revision-in-txn, ZooKeeper uses
version-gated writes. Loom's SQLite analogue:

- `recordTransition` (and any mutating op) takes required
  `{ owner, epoch }` and runs inside one `BEGIN IMMEDIATE` txn that
  first checks `leases WHERE workspace=? AND owner=? AND epoch=? AND
  expires_at > now` — mismatch aborts fail-closed, no row written.
- Renewal = same owner extends `expires_at`, epoch unchanged (heartbeat
  without fencing bump). Successor acquire after expiry: `epoch = prev +
  1` (already scaffolded). Release requires owner+epoch match (already
  scaffolded; R-05 confirms stale release fails).
- Reconciliation with ECC's touched-path revalidation: workspace-wide
  lease stays the coarse gate (user decision); the final touched-path
  set is recorded on the transition row and re-checked against the
  lease's declared scope before commit — path discipline as *evidence*,
  workspace lease as *enforcement*. Path-scoped leases remain deferred
  (ponytail: add when contention demands it).
- GFS borrow: heartbeat renewal piggybacked on activity (60s-style
  timeout, extensions on the cheap path); safe post-expiry re-grant with
  monotonic bump — exactly the scaffold's shape.

## R-05 — Contention experiments (8 real processes, throwaway DBs)

- **Race:** 8 concurrent `bun` processes, one workspace, conditional
  UPSERT acquire (`… WHERE leases.expires_at <= now`) + confirm-read →
  exactly **1 winner, epoch 1**, 7 losers (`held by` / `lost race`).
  No double-ownership observed.
- **Exclusion:** holder in `BEGIN IMMEDIATE` write txn → second
  `BEGIN IMMEDIATE` fails fast with `database is locked` (SQLITE_BUSY,
  `busy_timeout=0`). Readers proceed during the write txn (WAL).
- Implication: the scaffold's acquire path is contention-safe as
  designed; callers must treat `SQLITE_BUSY` as retry-with-backoff, not
  error — the retry budget for that backoff belongs to milestone budgets
  (R-16), not to the lease primitive.

## R-06 — Outbox/relay (design)

- Pattern: mutating op writes its business rows **plus** one outbox row
  in the same `BEGIN IMMEDIATE … COMMIT`. A relay tails the outbox on a
  monotonic `id` cursor (the CUSTOM-HARNESS "readers sync on cursor"
  shape) and performs the side effect (notify, deploy step, index
  update), then marks the row applied.
- Discipline (Debezium precedent): outbox rows are INSERT-only from
  writers; the relay's applied-marker is the only permitted UPDATE, and
  the outbox table is *not* the audit log (audit stays trigger-locked).
- Startup reconciliation: on boot, relay replays all unapplied rows in
  id order; side effects must be idempotent (Stripe-key precedent, 01
  §2.5) because a crash between effect and marker replays the row.
- WAL implication (R-05): relay holds a long-lived read txn → blocks
  WAL reset; bound it with periodic checkpoint + cursor persistence, or
  the WAL grows without bound (SQLite WAL §2.2).

## R-07 — OpenCode interception (delegate evidence, verified locally)

Full evidence in the delegate report; load-bearing conclusions:

- **Veto:** plugin `tool.execute.before` throw (runs *before* permission
  evaluation; veto surfaces as model-visible tool error). Order:
  hooks → `deny` → `ask` → callback; hook-`allow` never skips deny/ask.
- **Ask-gated veto:** server API `POST /session/:id/permissions/:id`
  with SSE `permission.asked` observation — but only `ask`-evaluated
  calls surface; `allow` (the default) is invisible, `--auto`
  auto-approves.
- **Ledger/audit:** `opencode run --format json` stream + out-of-band
  SQLite reads (`message/part` incl. diffs, tokens, cost) + `export
  --sanitize`; join with SSE `permission.asked` capture (asks are
  bus-only, not persisted — verified: no `permission.asked` rows in a
  127-session DB).
- **No lease primitive exists** (in-process `TxReentrantLock`,
  per-session `BusyError`, per-file semaphores only) — Loom builds the
  lease store itself. SQLite writes out-of-band are forbidden (race
  drizzle → corruption); reads are safe (WAL).
- **Residual bypasses** Loom must name, not ignore: `--pure` disables
  plugins; second processes; ACP/IDE ingress; model exfiltration via
  text rather than tools. `permission.ask` hook is legacy/dead —
  observe the bus instead.

## R-08 — Pin + drift policy (design)

- Keep: `FRAMEWORK_REF` commit/version startup check (fail-closed).
- Add: per-skill content-hash verification against `skills.lock.json`
  (`contentSha256`) at startup — motivated by the 2026-09-28 finding
  that the skill tool served a *stale global* `itp-review` under the
  harness's nose. Hash the installed skill content, compare to the
  lockfile, fail closed on mismatch.
- Add: `dependency.json` ↔ `dependency.md` sync check (the framework's
  `check-contracts.mjs` already asserts this — reuse it, don't
  reimplement; Loom invokes and records the result as evidence).
- Monthly `upstream-check`: compare installed content hashes vs lockfile
  (drift = local mutation, fail closed) — never compare-against-latest
  (framework rule: `never use latest`). Re-pin is a human-driven,
  recorded event, not an automatic update.

## R-09 — Lease precedent pass (delegate evidence, primary sources)

Borrow/reject per system (full bullets in delegate report):

- **Chubby:** borrow sequencer-as-fencing (name+mode+generation checked
  on mutation) + bounded lock-delay for dumb consumers; reject Paxos
  cell weight. Loom's row+epoch already covers it.
- **etcd:** borrow lease-attached bulk expiry + revision-in-txn fencing;
  reject streaming-keepalive/session-multiplexing weight. Loom's
  explicit renew + epoch-gated release suffices for one workspace row.
- **GFS:** borrow primary-authorizes-mutations + 60s timeout with
  heartbeat renewal + safe post-expiry re-grant with monotonic bump
  (exactly the scaffold); reject single-master machinery.
- **PG/MySQL advisory locks:** borrow session-vs-xact scope split +
  `pg_locks`-style inspectability; reject as-is — neither has
  TTL/heartbeat nor fencing, which is why Loom keeps both.
- **ZooKeeper:** borrow ephemeral-sequential ordering + predecessor
  watch + version-gated writes (Loom's `WHERE owner+epoch` is the
  SQLite analogue); reject ensemble model.

Net: no precedent contradicts the scaffold's shape (single-writer row,
TTL+heartbeat, epoch fencing, owner+epoch-gated release); R-04's
write-path gating is the one piece the scaffold still lacks by design.

## What stays blocked

- Nothing on research grounds — the gate is met and enforcement designs
  (R-04 gating, trigger migration, outbox tables, R-11 schema v2) are
  build-ready pending the user's build authorization.
- Non-code follow-ups: R-14 CLI UX; standing watches R-27–R-29.
