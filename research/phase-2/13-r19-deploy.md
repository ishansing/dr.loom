# R-19 — Deployment Authorization + Rollback

Status: procedure design. No `src/` changes (implementation rides
milestone build authorization).
Grounding: CUSTOM-HARNESS (rollout/rollback as harness-level concern,
immutable deployment artifacts); R-03 critical tier; R-11 dual
evidence + lifecycle; R-06 outbox steps; R-12 phases never reopen;
R-17 kill (stop) vs rollback (restore) distinction.

## Rule

Deployment is never improvised: every deploy — including rollbacks and
including staging — runs the same five gates. A missing gate fails
closed. Promotion is a new deployment, not a flag flip.

## The five gates (one audit action chain per deploy)

1. **Propose** — what (artifact hash, never a mutable tag), where
   (environment), why. Actor: agent or human. Opens the chain
   (`action=deploy`, R-11 request row).
2. **Verify** — fresh evidence on the *exact artifact hash*: build +
   tests re-run against it (itp-verify shape: no completion claim
   without fresh verification evidence). Evidence refs with hashes
   (R-11 file pins). Stale evidence (different hash) fails the gate.
3. **Authorize** — human approval, scoped to the environment (below).
   The verdict row. No self-authorization at prod, ever.
4. **Execute** — lease-held, stepwise via the R-06 outbox relay so each
   step is a recorded transition. Steps are individually revertible
   where the platform allows (migrations need paired down-steps
   declared at propose time — a migration without its down-step fails
   gate 1).
5. **Confirm** — post-deploy health/smoke evidence on the live
   environment. Closes the chain `completed` only with confirm
   evidence; without it the chain closes `failed` and the rollback
   path opens automatically (a failed confirm *is* the rollback
   trigger, no separate decision needed).

## Immutable artifacts

- Deployable = content-hash-addressed bundle (sha256 manifest over
  every file). Tags like `latest` are pointers for humans, never
  deploy inputs — the gate resolves and pins the hash at propose time
  and every later gate re-checks it.
- "Same code, new tag" is a new deployment (new chain, gates 2–5
  re-run; gate 1 may reference the prior chain as its why).

## Environments and promotion

- `staging` vs `prod` (names configurable, separation mandatory):
  different authorize scopes, different leases, different artifact
  stores. Staging authorize is high-risk (approval required, delegable
  to a named agent policy); prod authorize is critical (human only).
- Promotion staging→prod is a **new five-gate chain** referencing the
  staging chain as evidence — staging success shortens nothing except
  the human's reading time. A staging deploy never implies prod
  authority.

## Rollback (restore, not stop)

- Kill (R-17) stops the bleeding; rollback restores service. Order:
  kill/engage first if the deploy is actively harmful, then rollback
  through the five gates with `reason=rollback` linked to the failed
  chain. Rollback skips no gates — emergency only shortens deliberation,
  never verification (gate 2 re-verifies the *target* hash, which is
  cheap: it's the previously-confirmed artifact).
- Rollback target defaults to the last `completed+confirmed` hash for
  the environment; any other target needs its own why.
- Failed rollback (confirm fails on the restore too) escalates to
  human incident ownership (R-03 critical, `needs-human` semantics) —
  the harness reports, a human commands. Two failed restores never
  auto-retry a third (retry budget, R-16, counts deploys).

## Audit shape

- One `action_id` per deploy chain; gates 1–5 are its lifecycle rows
  (R-11). Promotion/rollback rows carry `link:<prior-action_id>` in
  evidence. Per-environment "current hash" is a derived view (latest
  completed+confirmed chain), recomputable, never a source of truth.
