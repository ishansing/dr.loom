# R-34 — System One decision models for Loom on Pi

Research snapshot: **2026-10-03**. Status: research and proposed evaluation,
**not** a model-selection decision or authorization to add a provider. Pi remains
the coding-agent runtime; a decision model, if adopted, would be a bounded
*classifier called by Loom*, not a replacement for Pi's model/agent loop.
This builds on [Pi's existing classifier integration](https://pi.dev/docs/latest/models#use-classifier-models),
[R-20 risk scoring](../14-r20-risk.md), [R-18 permissions](../12-r18-scopes.md),
[R-26 evals](../18-r26-eval.md), and the [Pi build plan](07-loom-v01-mapping.md).

## 1. What the name means

“System One” is TypeSafe AI's name for a class of **fast, typed decisions**:
input is a text or structured state and a closed set of questions; output is
an answer and numeric probabilities, not generated prose. It borrows the
fast/slow metaphor from Kahneman, **not** a claim that these models are
literally a human cognitive system. TypeSafe's [definition](https://docs.typesafe.ai/concepts/system-one)
and [API](https://docs.typesafe.ai/api) say its Jev model is trained for this
interface; Cloudflare's [Clef](https://developers.cloudflare.com/workers-ai/models/clef/)
and [Clef Flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/)
expose similar question/answer primitives. The term describes a workload
and model interface, not a universal architecture, calibration guarantee, or
permission system.

The distinction from a chat model with JSON output is **how the answer is
obtained and used**. For a typed decision, the candidate set is declared
before inference and the engine supplies a distribution over that set; an
ordinary chat model asked to *write* `{"probability": 0.9}` has merely
generated a number. Jev's training is described as “reinforcement learning
for calibrated decisions” (RLCD); its exact architecture/training claims
and speedups remain vendor claims unless independently reproduced.
Sources: [TypeSafe introduction](https://docs.typesafe.ai/introduction),
[AI primer](https://docs.typesafe.ai/introduction/machine-learning-primer),
[vendor launch and its explicit caveats](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

### The three question primitives

| Primitive | Input and output | Appropriate Loom interpretation |
| --- | --- | --- |
| **Choice** | Named options with contrastive descriptions → selected option, one probability per option, distribution-derived `confidence`. Up to 255 options in Jev's API. | “Which *already permitted* skill or reviewer should examine this request?” Include `none`; do not treat the answer as permission to execute. [Choice](https://docs.typesafe.ai/primitives/choice) |
| **Score** | Ordered descriptive levels (2–10 for Jev) → distribution, expectation `Σ i·pᵢ` and concentration summary. | Severity/urgency *triage* on a written rubric, not a measured incident loss or precise dollar amount. [Score](https://docs.typesafe.ai/primitives/score) |
| **Noul** | One yes/no proposition → `P(yes)`; no separate confidence field. Pi calls the analogous question `bool` and returns `probability`. | “Does the *text* mention a potential deployment?” — a signal for review, not proof that an approval exists. [Noul](https://docs.typesafe.ai/primitives/noul), [Pi's wire shape](https://pi.dev/docs/latest/codemode#classify) |

One request can contain independent questions over the same state. The model
is asked about **atomic dimensions**, with aggregation, dependencies, risk
tolerance and side effects remaining in code. More questions consume extra
input tokens and a huge irrelevant state still degrades judgment; batching
is not free or a substitute for selecting evidence. Sources:
[TypeSafe workflow guide](https://docs.typesafe.ai/concepts/how-to-build-with-system-one),
[Jev jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13),
[Pi classifier contract](https://pi.dev/docs/latest/codemode#classify).

## 2. What the numbers mean (and do not mean)

For Choice, probabilities are *relative* over supplied options, and sum
to one. If no option fits and `none` is omitted, the model still picks one.
For Score, the returned scalar is a probability-weighted **position on the
declared levels**. Two very different distributions can have the same
expectation; keep the full distribution. For Noul, `0.8` means the model
assigns 80% to “yes” *for that question on that input*, not that the action
is safe 80% of the time. Source: [Choice](https://docs.typesafe.ai/primitives/choice),
[Score](https://docs.typesafe.ai/primitives/score), [Noul](https://docs.typesafe.ai/primitives/noul).

**Confidence is not correctness.** TypeSafe's Choice confidence is
`(p_max − 1/n)/(1 − 1/n)` for `n` options. With `n=3` and `p_max=0.6`,
it is `0.4`, not `0.6`; the formula depends on option count. Score
confidence compares expected distance from the modal level with the
uniform distribution's mean distance. Noul provides no confidence,
although `|2p−1|` can be derived as a concentration measure.
All of these describe **the shape of the model's output**; even a peak
at 1 can be wrong. Source: [TypeSafe confidence formulas](https://docs.typesafe.ai/confidence).

**Calibration is a population property.** If a yes/no model assigns ~0.8
to many comparable cases and ~80% of those cases are actually positive,
that group is calibrated. It does not guarantee any particular prediction.
Calibration must be checked on Loom's own labels, for each question,
model revision and relevant traffic slice. Temperature scaling may
improve in-distribution neural-network calibration but is not an
authorization guarantee; post-hoc calibration can fail under dataset
shift. Sources: [TypeSafe's explanation](https://docs.typesafe.ai/concepts/system-one),
[Guo et al., ICML 2017](https://arxiv.org/abs/1706.04599),
[Ovadia et al., NeurIPS 2019](https://arxiv.org/abs/1906.02530).

**Question form matters.** Jev's published limitations include inaccurate
counting/date arithmetic, multi-hop indirection, irrelevant long state,
adversarial steering, and English-first quality. Two separately asked
questions need not obey identities such as `P(A)+P(not A)=1`. The model
does not replace parsers or deterministic comparisons. Source:
[Jev 1.13 failure modes](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

## 3. Model and access landscape at the snapshot

| Option | What was verified from primary sources | Implication for Loom |
| --- | --- | --- |
| **TypeSafe Jev `jev-1.13.0`** | Text/JSON state; Choice, Score, Noul; versioned model + moving `jev-latest` alias. Published tariff **$0.042 / million input tokens**, output tokens uncharged; 64k combined / 32k state-plus-longest-question limit; rate limits currently adjustable. [Models](https://docs.typesafe.ai/models) | Best direct fit to Pi's classifier API; pin the version, not `jev-latest`, for any measured threshold. No conclusion yet about Loom accuracy or p95 latency. |
| **Cloudflare Clef / Clef Flash** | Workers AI models advertise multimodal state (including images), typed question API, 65,536-token context. Published input prices: **$0.24/M** (27B Clef), **$0.09/M** (9B Flash). [Clef](https://developers.cloudflare.com/workers-ai/models/clef/), [Flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/) | Alternate provider for comparative tests, especially if visual state matters. Pi's generic classifier state is JSON; verify any image-specific call path separately. |
| **Open reproduction (Mapika `decider`)** | Apache-2.0 code + open model cards, `system_one`-compatible endpoint, one-pass option-logit/softmax readout and fitted temperatures. Author explicitly disclaims TypeSafe affiliation and lists calibration failures and task regressions. [Repo](https://github.com/Mapika/decider) | Candidate for a local/offline experiment, not a drop-in Jev-equivalent quality claim; check weight licenses, runtime requirements and task-specific calibration. |
| **Chat-model baseline** | Pi chat model + constrained tool output can also return a typed label. JevBench explicitly distinguishes a model's native distribution from an LLM's *verbalized* probabilities. [JevBench method](https://github.com/fstandhartinger/jevbench) | Include a cheap deterministic and chat-model baseline; do not mistake JSON validity or a verbalized `0.9` for calibrated probability. |

Pi already catalogs these classifier routes (TypeSafe, OpenRouter,
Cloudflare, Vercel and OpenCode) without making them chat models;
classifiers do **not** appear in `/model`. In codemode use
`models.getAvailableOfType("classifier")` then `models.classify(...)`;
from a Pi extension use `ctx.modelRegistry.classify(...)`. Both
report `stopReason: stop|error|aborted`; callers must check it before
using `answers`. Pi tracks classifier usage for session cost where
the provider supplies usage and a catalog price; missing price is
not evidence of zero cost. Sources: [Pi models](https://pi.dev/docs/latest/models#use-classifier-models),
[codemode contract](https://pi.dev/docs/latest/codemode#classify).

Integration options are not hypothetical: Pi ships a
[Jev virtual-model routing example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/jev-router.ts)
that calls the classifier to pick a planning model, then switches after
the first successful file edit. Its fallback on classifier absence is a
default planning model; it is **not** a template for a safety decision.
Pi's [virtual-model contract](https://pi.dev/docs/latest/virtual-models)
records selected and physical models separately and allows a router to
retain branch-local state; switching models can lose prompt-cache hits.

## 4. Evidence for performance — and its limits

The vendor claims ~70–500 ms end-to-end Jev responses and large
cost/speed gains on four workflows; it explicitly describes those
workflows as team-created and uses the mean of large LLM outputs as
reference probabilities, **not independent ground-truth labels**.
Those numbers are neither a promise for Loom's network/queue nor a
measurement that Jev is correct on I2P routing. Cite them only as
vendor measurements. Source: [TypeSafe launch: evidence and caveats](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

An independent [JevBench](https://github.com/fstandhartinger/jevbench)
evaluates accuracy, Brier/ECE calibration, paraphrase consistency,
caller-observed latency and price. Its score/ranking **changes by
edition and composite formula**, some cost figures are estimated,
and latency is location/deployment-sensitive. The separately maintained
[Decision Index](https://github.com/apolinario/decision-index)
rebuilds a broad typed-decision suite with coverage-adjusted scoring.
Neither substitutes for a small held-out Loom set: an industry
ranking need not predict false negatives on “must load itp-verify”.

A vendor [skill-suggestion experiment](https://docs.typesafe.ai/cookbooks/skill_suggestion)
is especially relevant to I2P: on 488 synthetic requests against a
182-skill Hermes roster, wrong first skill loads fell from 16.8% to
7.3%, unnecessary loads from 9.8% to 4.0% with a two-stage suggestion.
**Seven previously correct requests became wrong**; its own worked
example suggests an X-posting skill for Mastodon. The experiment used
`jev-1.12`, a specific agent and synthetic labels, not Loom's pinned
`dependency.md`. A suggestion can improve average routing while making
an individual critical miss more likely. In I2P, registry resolution,
required skill loads and `itp-verify` completion remain enforced by
rules, not suggested by Jev.

The vendor's [self-consistency experiment](https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook)
repeated one 14-question case 15 times: Jev probabilities moved less
than sampled LLM verbalizations, but one question crossed the 0.5
decision boundary. Stability is not accuracy; the experiment also
varied an irrelevant `uid`, so it does not isolate identical-input
determinism. An uncertainty/review band helps, but has boundaries
of its own. Its [guardrail cookbook](https://docs.typesafe.ai/cookbooks/llm_guardrails)
demonstrates pass/review/block routing on **15 examples** and uses
an earlier Jev revision; it does **not** establish a safe false-negative
rate against adversarial prompt injection.

## 5. Where a decision model could fit Loom

```
Pi events / I2P request / retrieved evidence (untrusted)
   -> Loom collects a small, source-labeled state
   -> optional decision-model classifier (typed answers + distribution)
   -> Loom's deterministic policy (registry, grant, lease, kill, approvals)
   -> accepted action or human/reasoning-model review
   -> Loom audit/usage records and outcome labels
```

In the proposed **isolated sidecar**, the decision model receives no grants,
Pi credentials, or effect API. A classifier invoked from a Pi extension is
*not* isolated: extensions share Pi's process privileges. In either design,
a returned probability is advisory evidence; it cannot mint a
human approval, clear a kill flag, mark verification pass, extend a
lease, or silently select an unapproved skill. Pi's own
[security guidance](https://pi.dev/docs/latest/security) says extension
logic is not an OS sandbox. I2P's [registry](../../../I2P/dependency.md)
and Loom's [R-18](../12-r18-scopes.md) define the permitted set.

| Candidate use | Example typed question(s) | Decision owner / fallback | Priority |
| --- | --- | --- | --- |
| **Optional skill suggestion** | Choice among *approved* eligible skill IDs + `none`; one Noul per top candidate asking if it really fits. | Framework-required children bypass the suggestion entirely. Uncertain/error → ordinary deterministic I2P routing or ask human. Validate on I2P goldens incl. missing skill, ambiguous trigger and user-entry recursion. | Best first experiment; potentially later than milestone 1. |
| **Context relevance** | Noul “Does this evidence discuss task X?” over each bounded retrieved chunk. | Loom's source registry and provenance filter first; threshold selects which *data* to show Pi. Never promote retrieved instructions to policy. Compare with lexical filtering + Pi's normal search. | P1, only after context manager T-13. |
| **Review queue prioritization** | Score on clear severity levels, Noul per independent semantic concern. | Loom R-20 fixed high-risk floor always applies; model may *raise* scrutiny or order reviewers, not reduce a critical tier or grant a bypass. Unavailable → current fixed scoring. | P1/P2, after labeled risk corpus. |
| **Cheap role/model routing** | Choice `simple|complex|unclear` on a concise task description. | Pi virtual model may select cheaper/better model; no change to tool permissions or task owner. Unavailable → stable pinned default, not a model with broader authority. | Optional cost optimization after baseline; measure net latency including model-switch cache misses. |
| **Guardrail anomaly flag** | Noul “Does this tool output contain a command aimed at changing the assistant's rules?” | Can add review/deny, never certify “safe”; independent OS sandbox and hard policy continue. False negatives explicitly measured on adversarial fixtures. | Later experiment, **not** the first line of defense. |

### Why the permission boundary stays deterministic

A classifier may identify a *semantic property of text*; it cannot
authoritatively establish a legal/operational fact such as “this
principal has approved deployment” or “this epoch is the latest”.
Those facts are verified against Loom's trusted records. If a classifier
is unavailable on a discretionary routing call, the existing route
can continue unchanged; if it is used as an additional restrictive
guard and the call fails, the action must take the predefined safer
route. Never turn classifier failure into `allow` just because the
request is time-sensitive. Sources: [Jev adversarial limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13),
[Pi classifier error contract](https://pi.dev/docs/latest/codemode#classify),
[Loom write-gate design](../04-phase0-findings.md).

## 6. Evaluation plan before any adoption

This is **new research work**, not accomplished by this document. Start
with a *read-only offline replay* (no model in Pi's pre-tool critical
path). Define tasks using real or human-written I2P examples plus
adversarial cases; keep separate tuning and held-out sets. Labels
should reflect the user's intent and I2P contract, not just an LLM
teacher or the model's own answers. Log disagreements and ambiguities;
do not call missing ground truth “wrong” by default. Use the
[framework's runbooks](../../../I2P/tests/skills/HUMAN-RUNS.md)
and [R-26 fixture design](../18-r26-eval.md) as starting sources.

For each candidate task and model, record:

1. **Contract and provenance:** immutable question/schema version,
   candidate-set/order, state-construction version and hash, source
   labels, pinned model ID and returned model ID. Never log raw secrets
   or untrusted credential material; retain allowed inputs securely
   or store a reference/hash with sufficient retention for review.
2. **Validity:** correct answer IDs/types, finite `[0,1]`
   probabilities, complete set, sum approximately 1 (allow documented
   rounding tolerance only), bounded state size, and explicit
   error/timeout/aborted status. Never invent missing probabilities.
3. **Quality:** accuracy vs deterministic and majority baselines,
   confusion matrix by skill/risk type, abstain rate, critical false
   negatives, Brier score or log loss for probabilities, reliability
   table/ECE *with counts*, and risk-vs-coverage at each proposed
   threshold. ECE alone hides rare severe errors; report per-class
   error and sample sizes. These metrics mirror the
   [JevBench measurements](https://github.com/fstandhartinger/jevbench)
   but must be recomputed on Loom's labels.
4. **Robustness:** option reorder, paraphrased questions, irrelevant
   context, long/distracting diffs, forged tool-result approval,
   unsupported language, missing required skill, unseen skill and
   none-of-the-above. Jev itself documents literalness, indirection
   and adversarial state weaknesses ([jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13));
   measure rather than assume invariance.
5. **Operations:** end-to-end p50/p95/p99 including queue, network and
   state construction; timeouts/429/529; input tokens and billed cost
   per *decision*, not just per token; extra prompt-cache miss if a
   Pi virtual model switches physical models. Compare against
   deterministic rules and a small Pi chat-model baseline, on the
   *same* fixed cases and hardware/network path where possible.

**Promotion rule:** pick an error budget per use case *before* tuning
thresholds. On an independent held-out set, require the relevant
false-negative upper confidence bound, review workload and cost/latency
to improve or stay acceptable versus the baseline. For critical
conditions the safest target is no permission-reducing automation at
all; a classifier only prioritizes and escalates. If data is too sparse
to bound rare errors, keep it in shadow mode or human review. After
promotion, sample audited outcomes and re-evaluate by question/model
revision, distribution slice and upstream drift (R-29), rolling back
to deterministic routing when measurements degrade.

## 7. Pi/Bun integration shape (illustrative, not implementation)

Pi already exposes a classifier API to **extensions**, so a small
shadow-mode spike can call `ctx.modelRegistry.classify()` and return
an advisory recommendation to Loom's orchestrator; this does **not**
isolate the classifier credential or its input from Pi's process. For
independent credential and failure boundaries an out-of-process Bun service
may use TypeSafe's [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)
(`systemOne`) or direct HTTP if inference and credentials must be
isolated from Pi's extension process. Use exactly one model/version
and one question-schema revision per experiment. Do not put a remote
classifier call inside SQLite's write transaction.

```ts
// Sketch of an optional *advisory* classifier result, not a permission grant.
type Suggestion = {
  questionVersion: string;
  model: string; // returned versioned ID
  choice: string;
  probabilities: Record<string, number>;
  inputRef: string; // hash/reference to sanitized state
};

// Loom then intersects suggestion.choice with I2P's approved candidates.
// A missing/invalid result is "no suggestion"; authorize() remains the gate.
```

Do **not** invoke classification on every token/turn just because it is
cheap per input token. Only ask when Loom faces a genuinely ambiguous,
bounded judgment with a meaningful alternative action. Budget calls,
cache/rate limits and include classifier usage in R-25 metering; keep
inference keys out of Pi tool arguments/session JSONL. Pin Jev
`jev-1.13.0` (or another tested version), not `jev-latest`, when
calibrating thresholds ([TypeSafe models](https://docs.typesafe.ai/models)).

## Conclusion and open questions

**Recommendation:** explore a read-only skill-suggestion or review-queue
triage prototype *after* the milestone-1 deterministic ledger, audit,
lease, kill and verification gates are working. Pi already has the
needed classifier joint. The value hypothesis is fewer expensive or
incorrect *routing* calls, not replacing policy with probabilities.

Unanswered until a measured spike: Does the classifier improve
I2P-specific goldens and held-out ambiguous cases? Is its output
calibrated under our question wording and untrusted artifacts? What
are actual latency/cost and abstain rates in the deployment region?
Can a local model meet the same bar without sending private state to a
provider? Is an extra optional dependency worth its operations and
privacy cost? Nothing in public benchmarks resolves these for Loom.
