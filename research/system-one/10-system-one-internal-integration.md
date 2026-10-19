# R-36 — Decision models inside Loom: integration contracts and boundaries

**Release follow-up (2026-10-19):** [Pi 1.3.0 API verification](../pi/10-pi-1.3.0-api-review.md)
reproduces the parser/alias/timeout limitations with offline fixtures. Its
published offline catalogue has only `jev-latest` and a zero input price;
do not assume versioned Jev lookup or use that price as billing evidence.
This does not close R-35 or promote a runtime/model pin.

Research snapshot: **2026-10-03**; Pi source reviewed at
[`earendil-works/pi@9fba660`](https://github.com/earendil-works/pi/commit/9fba660cf1caca0ade5bea72269352416e595a19).
Research only; no classifier service was installed, benchmarked or put into
Loom's execution path. [R-34](09-system-one-decision-models.md) covers the
model landscape and calibration; this document follows the concrete Pi call
path and proposes a **non-authoritative decision service** inside Loom.
Loom currently contains a Bun/SQLite scaffold with transitions, leases and
audit inserts, but no Pi adapter or enforcement middleware yet:
[`src/store.ts`](../../src/store.ts), [`src/framework.ts`](../../src/framework.ts),
[T-01–T-19 plan](../pi/07-loom-v01-mapping.md).

## Executive finding

Use a System One model for *advisory semantic judgments* at named points
(`suggest skill`, `prioritize review`, possibly `route model`), not a
second autonomous agent and not a permission oracle. Keep the model call
out of SQLite transactions and the fenced mutation path. The first
experiment should use Pi's already-available classifier API in **shadow
mode**; if a decision ever handles sensitive state or becomes a required
availability dependency, move it to a Loom-controlled sidecar with its
own credentials and test the isolation. A typed API alone is not a
validated probability or an approval.

## 1. Source-level map: what Pi actually does

The entry points are not `session.prompt()` or a chat-model selection.
The paths below are verified from Pi's source, not inferred from the UI.

1. [`pi-ai/providers/all.ts`](https://github.com/earendil-works/pi/blob/9fba660/packages/ai/src/providers/all.ts)
   registers provider catalogues and exposes `getBuiltinClassifierModel`;
   [`providers/typesafe.ts`](https://github.com/earendil-works/pi/blob/9fba660/packages/ai/src/providers/typesafe.ts)
   registers `typesafe-system-one` with `TYPESAFE_API_KEY`, while
   [`providers/cloudflare-workers-ai.ts`](https://github.com/earendil-works/pi/blob/9fba660/packages/ai/src/providers/cloudflare-workers-ai.ts)
   registers a distinct Cloudflare classifier transport and account auth.
   A classifier entry is a separate model type, not a chat model; Pi's
   [models guide](https://pi.dev/docs/latest/models#use-classifier-models)
   says these do not show in `/model`.
2. [`coding-agent/src/core/model-registry.ts`](https://github.com/earendil-works/pi/blob/9fba660/packages/coding-agent/src/core/model-registry.ts)
   is an extension-facing compatibility facade. `findOfType("classifier",
   provider, id)` locates a model; `classify(model, context, options)`
   delegates to `ModelRuntime.classify`. The same facade offers
   `getAvailableOfType` if credential availability must be checked.
   `findOfType` alone finds a catalogue entry, not proof auth will work.
3. [`coding-agent/src/core/model-runtime.ts`](https://github.com/earendil-works/pi/blob/9fba660/packages/coding-agent/src/core/model-runtime.ts)
   asserts the model type, resolves provider credentials and request
   headers at call time, invokes the provider classifier and catches
   errors into `{stopReason:"error"|"aborted", answers:{}, errorMessage}`;
   **it does not reliably reject with an exception on failure**.
   Runtime options include caller `signal`; use a bounded timeout too.
4. [`ai/src/api/typesafe-system-one.ts`](https://github.com/earendil-works/pi/blob/9fba660/packages/ai/src/api/typesafe-system-one.ts)
   uses the shared System One transport; the
   [Cloudflare transport](https://github.com/earendil-works/pi/blob/9fba660/packages/ai/src/api/cloudflare-workers-ai-system-one.ts)
   additionally unwraps either native Clef or third-party run
   envelopes and checks completion state. Both converge in
   [`system-one-shared.ts`](https://github.com/earendil-works/pi/blob/9fba660/packages/ai/src/api/system-one-shared.ts):
   map Pi `bool` → provider `noul`, `fetch` POST with AbortSignal,
   provider retry, parse answers, price `usage` from the catalogue.
5. Pi's [`jev-router.ts` example](https://github.com/earendil-works/pi/blob/9fba660/packages/coding-agent/examples/extensions/jev-router.ts)
   classifies the latest user prompt once to pick a planning model and
   uses branch-local virtual-model state to switch after a first edit.
   It falls back to a default planning model on absent/failed Jev. This
   illustrates *routing*, not an enforcement path; the example's
   `result.usage` is not added to any Loom ledger. A
   [virtual model's `route()`](https://pi.dev/docs/latest/virtual-models#route-requests)
   runs before **each** model request, including continuations, retries
   and direct maintenance calls; indiscriminate classification here
   would multiply latency and cost.

### Four integration surprises that change the design

* **Pi parses only part of the numeric contract.** Its
  [shared parser](https://github.com/earendil-works/pi/blob/9fba660/packages/ai/src/api/system-one-shared.ts)
  checks required answers, types and that numeric fields are finite.
  It does **not** check each probability is within `[0,1]`, that keys
  exactly equal the supplied Choice options, that they sum to 1, or
  that `choice` is the argmax. It does not validate `confidence` against
  the distribution. Loom must validate any classifier output it uses;
  `stopReason:"stop"` alone is insufficient.
* **Score detail is lost on the normalized Pi path.** The same parser
  returns only `{type:"score", score, confidence}`, dropping the
  provider's level `probabilities` and `legend`. A Loom workflow
  requiring score tail mass (for example `P(critical)`) must use a
  different transport, or change Pi upstream with tests; never
  reconstruct a full distribution from its expected value. For
  routing prototypes prefer Choice or `bool`, which preserve their
  useful probabilities (subject to Loom validation).
* **The returned version may be masked by an alias.** The shared
  [adapter](https://github.com/earendil-works/pi/blob/9fba660/packages/ai/src/api/system-one-shared.ts)
  initializes `output.model = model.id`; it does not read the versioned
  server `model` field. A call made as `jev-latest` can thus be logged
  under that moving alias. Pin `jev-1.13.0` for a calibrated experiment
  **if the tested Pi catalogue can resolve it**; otherwise explicitly
  register the versioned model or use a direct provider client that
  records the server's resolved ID. Confirm availability rather than
  relying on `findOfType` for an ID not present in Pi's catalogue
  ([model aliases](https://docs.typesafe.ai/models),
  [Pi registry](https://github.com/earendil-works/pi/blob/9fba660/packages/coding-agent/src/core/model-registry.ts)).
* **Usage is not automatically an audited Loom cost.** Pi's parser
  omits usage if missing; malformed token values become zero, and
  [`calculateCost`](https://github.com/earendil-works/pi/blob/9fba660/packages/ai/src/api/system-one-shared.ts)
  uses a catalogue price. A malformed answer can still include billed
  usage (the adapter parses usage *before* answers). A classifier
  invoked from a virtual-model router, extension or out-of-band
  sidecar requires one Loom-owned per-call metering record including
  failures. Do not count it a second time if a codemode tool has already
  folded nested model usage into its parent result
  ([Pi codemode](https://pi.dev/docs/latest/codemode#models), [R-25](../phase-2/17-r25-metering.md)).

The [shared transport](https://github.com/earendil-works/pi/blob/9fba660/packages/ai/src/api/system-one-shared.ts)
defaults to **two retries** (three total attempts) and applies a
request timeout only if `timeoutMs` is supplied. Its
[retry policy](https://github.com/earendil-works/pi/blob/9fba660/packages/ai/src/utils/provider-retry.ts)
retries certain network/status failures and honors retry headers.
Therefore a “100 ms model” is not a 100 ms *worst-case gate*; Loom must
choose a deadline and retry budget per use case (R-16), including
queueing, transit and backoff. A locally timed-out call still needs an
`aborted`/`unavailable` decision record, not a fabricated probability.

## 2. Three deployment locations; choose by trust, not convenience

| Location | Call path and advantage | Failure/security boundary | Good use |
| --- | --- | --- | --- |
| **Inside Pi extension / SDK supervisor** | `ctx.modelRegistry.classify` or `ModelRuntime.classify`; built-in catalog, auth, abort, no extra provider code. [Source](https://github.com/earendil-works/pi/blob/9fba660/packages/coding-agent/src/core/model-registry.ts) | Extension shares Pi process, credential store and FS permissions. It can fail or reload; Pi response parsing has the above gaps; no Loom audit is automatic. [Pi security](https://pi.dev/docs/latest/security), [extensions](https://pi.dev/docs/latest/extensions) | Cheapest read-only shadow route; discretionary hints visible to Pi. |
| **Loom-owned Bun decision service in the trusted control plane** | Pi/Loom orchestrator sends only a validated, minimized, source-labeled state over a narrow request/response channel; service uses pinned TypeSafe [JS SDK](https://docs.typesafe.ai/sdk/javascript) or Pi's isolated model runtime. Separate key, timeout, logging, version pin. | Service outage and IPC need explicit `unavailable`; if hosted, sending private excerpts requires an approved data boundary. Never give the service a path, arbitrary tool, token, DB write handle or direct policy mutation API. | Preferred if classification affects operational triage or handles secrets-adjacent material. |
| **Local classifier sidecar** | Compatible `/v1/systemone` on an isolated process (for example [decider](https://github.com/Mapika/decider)); minimize outbound data. | CPU/GPU cost and hosting become Loom's responsibility; same validation and local calibration required; “compatible” is a wire claim, not a quality claim. | Optional offline/privacy experiment if held-out quality and p95 meet the bar. |

Important distinction: a Bun process calling Pi's SDK **in process** is
not a sidecar, and Pi extensions can read its environment. A distinct
process only isolates credentials if the provider key exists solely in
the control-plane process and the Pi sandbox cannot access its env/files,
network endpoint or arbitrary RPC methods. Conversely, an extension
may use Pi's built-in provider without a new package, but should never
claim to keep that provider credential from Pi's other loaded extensions.
[Pi security](https://pi.dev/docs/latest/security),
[Loom sandbox scope](../phase-2/19-r15-sandbox.md).

## 3. Where inference fits in the control flow

### A. Request/skill suggestion (first candidate)

1. Trusted I2P [registry](../../../I2P/dependency.md) resolves legal
   child-skill IDs, invocation classes, required skills, conditions and
   `needs-human` exits **before** any model ranking. A model never
   installs, selects an unapproved skill, bypasses a required child,
   or recursively invokes a user-entry skill.
2. Loom collects the user's relevant task excerpt plus descriptions
   of *optional eligible* skills; it labels untrusted content as data.
   Ask one Choice with the candidates **and `none`**, optionally
   separate `bool` checks for shortlist fits. Record the stable
   question revision and candidate list/order.
3. Validate the entire returned answer; map unknown/invalid/aborted/
   below-reviewed threshold to `no suggestion`, then run the
   framework's existing routing. Suggestions may **prioritize**
   examination but do not skip evaluating a required skill or a
   positive trigger. Log whether the model's suggestion was used.
4. Before any mandatory child dispatch, recheck the pinned registry,
   and use the framework's defined missing-dependency handoff.

Why this separation matters: the vendor's
[skill-suggestion experiment](https://docs.typesafe.ai/cookbooks/skill_suggestion)
improved aggregate first-load behavior but also broke previously
correct choices and suggested a near-match for a missing skill.
“Most likely” is not “approved” or “present.” This is the R-34 result
applied to Pi's [extension-classifier seam](https://pi.dev/docs/latest/models#use-classifier-models).

### B. Per-turn model routing (optional; separate experiment)

Pi virtual models invoke `route(request, ctx)` on `user`, `continuation`,
`retry` and `direct` reasons. A cheap classifier can classify one new
user task and store a branch-local `{decisionId, selectedModel}`;
return the same physical model for continuations and retries unless
an explicit provider failure policy says otherwise. Keep direct
summaries on a specified default. The published Pi example switches
once *after* an edit, which demonstrates mechanics, not an optimal
Loom route. Repeated switching wastes cache, so measure full-run cost
and quality rather than classification time alone.
Sources: [Pi virtual-model contract](https://pi.dev/docs/latest/virtual-models),
[example](https://github.com/earendil-works/pi/blob/9fba660/packages/coding-agent/examples/extensions/jev-router.ts).

### C. Review queue and memory relevance (after T-13/T-14)

An optional Score/Choice can order review candidates; the risk floor
remains R-20's deterministic rules, and `itp-verify` still executes
fresh checks. A `bool` can rank retrieved passages, but cannot turn
a repository file into a trusted instruction or approve a shared-memory
write. For potential prompt injection, a **positive signal** may
escalate to human review; a low probability never disables OS
isolation or a hard policy rule. Sources: [R-20](../phase-2/14-r20-risk.md),
[R-24](../phase-2/16-r24-memory.md), [Jev adversarial limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

### D. Pre-tool interception is the *wrong first pilot*

In Pi [`tool_call`](https://pi.dev/docs/latest/extensions) runs
before a tool and can block, while `agent_before_settle` can prevent
an unsupported completion claim. Both are load-bearing boundaries;
adding a remote semantic classifier there before measuring it would
create timeout/retry contention and false-deny/false-allow pathways.
Start with offline shadow inference at request intake. If a future
classifier becomes an additional pre-tool *restrictive* signal,
evaluate **before** acquiring the DB write lock, record its decision,
then atomically recheck Loom's kill/lease/approval facts before the
commit. No network wait inside `BEGIN IMMEDIATE` and no classifier
response can substitute for a live epoch check ([R-04](../phase-0/04-phase0-findings.md)).

## 4. A minimal internal contract (proposal, not implemented)

```text
DecisionRequest:
  requestId, runId, threadId, purpose, stateRef/hash,
  sourceLabels, candidateSet + order, questionSchemaVersion,
  modelProvider + pinnedModelId, deadline, policyRevision

DecisionResult (one of):
  usable:   returnedModel, typedAnswers, validatedProbabilities,
            latencyMs, usage?, evidenceRef
  noResult: reason = unavailable | timeout | aborted | malformed |
            unsupported | staleInput; latencyMs, usage?

RoutingEffect (separate, owned by Loom):
  suggestionId, finalEligibleChoice | none, reason, policyRevision,
  trustedRegistryRef; NEVER an allow/approval/verification verdict
```

The request ID deduplicates retries; `stateRef/hash` and policy revision
bind the result to the exact input and allowed candidate set. Raw inputs
may contain secrets, tool logs or user data: filter and budget their
size **before** calling a provider; if the state is redacted, evaluate
whether redaction changes label quality. Only the trusted boundary may
map the result to Loom routing. The proposal uses existing [R-11 audit
evidence refs](../phase-1/06-r11-audit-vocabularies.md) and
[R-25 metering](../phase-2/17-r25-metering.md); it does not add another task
database or rewrite Pi's JSONL. On a killed run, mark the decision
`aborted`/stale and recheck run state before applying an arriving
late response ([R-17](../phase-2/10-r17-kill-switch.md)).

### Validation belongs in Loom

* Ensure expected question IDs and types only; required Choice option
  IDs exactly match `criteria`, including `none` if present; selected
  label is legal and corresponds to the highest probability, subject
  to an explicit tie policy. Values finite and in `[0,1]`, sums near
  1 with a documented rounding tolerance; **reject** rather than
  silently renormalize an invalid distribution. `bool` is a scalar
  yes-probability, not a clearance signal.
* The returned *versioned* model and input/question/policy revisions
  must match those of the decision attempt. Pi's adapter does not
  expose the server's resolved alias version: use a pinned model ID
  and still store the returned ID; if this needs stronger attestation,
  use the provider SDK/sidecar and verify its raw versioned response.
* If a Score's full level distribution is needed, **do not** use
  normalized Pi's `score` alone. A separate provider path must
  preserve `probabilities` and `legend` for validation and audit.
* `usage?` is optional, never proof of free inference; an otherwise
  usable classification remains usable for optional routing when
  metering is missing, but records `unknown`/`unpriced` and may be
  disallowed by a separate spend policy. Reconcile billed calls
  later rather than silently adding a zero-priced decision. Meter
  attempts even on malformed answers.

These are consequences of Pi's
[actual System One parser](https://github.com/earendil-works/pi/blob/9fba660/packages/ai/src/api/system-one-shared.ts),
not guarantees provided by it.

## 5. Time, concurrency, audit and restart behavior

* **Bounded calls.** The classifier is outside the database transaction;
  deadline covers queuing, transport and optional retries. Pi's native
  default is two retries and no timeout unless specified. For a shadow
  test use a named short timeout and, for stable latency measurement,
  explicit retry policy; record both. Cancellation is advisory until
  the provider request settles, so apply only if the run and input
  still match. [Pi adapter](https://github.com/earendil-works/pi/blob/9fba660/packages/ai/src/api/system-one-shared.ts),
  [R-16 budgets](../phase-2/11-r16-budgets.md).
* **No holding a workspace lock.** Snapshot state, call classifier,
  validate returned result, then re-read the run/registry/kill/policy
  state and acquire or check the write lease before any mutation.
  A result from an earlier epoch cannot release, finalize or affect
  a successor's workspace; kill outranks late suggestions.
* **Audit by intent, not by model prose.** Record attempt ID, purpose,
  model/question versions, sanitized state hash, choice/distribution
  or `noResult`, duration and metering; then a separate row for what
  Loom actually did. An unavailable suggestion and a negative result
  are different states. Avoid storing raw credentials or entire
  transcripts in audit rows; use governed artifact pointers.
* **Do not confuse telemetry.** A classifier call from `codemode` is
  reported via its tool result's nested `usage`; the same call from
  an extension router or a sidecar is not automatically an audited
  Loom action. Define one charge owner per call ID to prevent both
  unmetered calls and double-counting. Pi's
  [codemode docs](https://pi.dev/docs/latest/codemode#models),
  [R-25](../phase-2/17-r25-metering.md).
* **Replay without double effects.** Shadow evaluations may rerun from
  the same immutable input hash; routing decisions that were applied
  must persist their outcome with request ID and policy version. On
  restart, check the committed result and actual task/phase state;
  never reroute a task merely because Pi's latest JSONL message or a
  classifier response exists. [R-06 outbox](../phase-0/04-phase0-findings.md),
  [R-12 pause accounting](../phase-1/07-r12-pause-vs-turn.md).

## 6. Evaluation ladder for an internal implementation

This research is not the [R-35 shadow validation](../03-research-backlog.md).
No model traffic or secrets are required until there is a purpose-specific
dataset and build authorization.

1. **Protocol fixtures (offline):** mocked TypeSafe/Clef/invalid JSON;
   missing `answers`, extra options, `choice` not in `criteria`, NaN,
   negative/greater-than-one probability, wrong sum, invalid score,
   missing usage, alias mismatch, 429/529, abort and late response.
   Test Pi normalizer's gaps and Loom's stricter adapter independently.
2. **Shadow fixture set:** labeled I2P ambiguous routing examples,
   required-child and human-handoff cases, adversarial diffs and
   prompts, changed candidate order, `none` cases. Record baseline
   deterministic router behavior and model suggestion separately;
   measure wrong-load and missed-required-child **separately**.
3. **Held-out evaluation:** validate probability calibration, per-class
   errors, selective risk/coverage, abstain share and confidence
   intervals; then measure end-to-end p50/p95/p99 and provider cost
   (including failures and retries) under real concurrency. Use
   [R-34 evaluation plan](09-system-one-decision-models.md#6-evaluation-plan-before-any-adoption)
   and [R-26 fixture discipline](../phase-2/18-r26-eval.md), not a vendor
   benchmark's aggregate score.
4. **One reversible pilot:** *suggest* an optional eligible skill in
   operator-visible logs; do not change dispatch until reviewers show
   the suggestion helps. Promotion is a separate decision requiring
   demonstrated benefit and no weakening of deterministic gates.
5. **Operational conformance:** kill mid-call, crash/restart after a
   response but before commit, duplicate request ID, removed Pi
   extension, model alias drift and classifier outage. Each ends with
   unambiguous audited state, unchanged permissions and no false
   completion claim.

## Recommendation and unresolved design choices

The minimal research-backed integration is **an optional suggestion
port owned by Loom, implemented first against Pi's classifier API**
in shadow mode. It must not be bolted onto `recordTransition()` or
`acquireWorkspaceLease()` in today's scaffold; neither enforces the
planned authorization boundary yet. Once T-01–T-14 exist, a Pi-facing
adapter can pass sanitized classification results to the trusted
orchestrator. If isolation is required, the same logical contract
can move behind a separate Bun process and its own provider SDK;
Loom's policy remains the only authority.

Before implementing, decide (a) one measured use case and labels,
(b) whether raw state may leave the sandbox, (c) pin/credential owner,
(d) fallback on each `noResult` for that use case, and (e) the metric
and error budget required for promotion. Re-check the Pi source and
provider's API/price against the pinned release at build time under
[R-29 drift review](../watch-schedule.md); `main` URLs are not an
installed-version guarantee.
