# R-38 — QLoRA Harness Classifier (Qwen2.5-1.5B) vs Jev API: Verdict

Research snapshot: **2026-10-03**. Status: verdict + buildable recipe,
**not** a training run or adoption decision. No weights trained, no
model installed, nothing in Loom's execution path. Builds on
[R-34](09-system-one-decision-models.md) (semantics, shadow protocol),
[R-36](10-system-one-internal-integration.md) (validation contract),
[R-37](11-foss-decision-models.md) (open-model shortlist).

## 0. Corrections to the proposal before the verdict

- **"Qwen-1.5B" = Qwen2.5-1.5B.** Qwen3 has no 1.5B size (0.6/1.7/4/8…);
  the 1.54B model is [Qwen2.5-1.5B](https://huggingface.co/Qwen/Qwen2.5-1.5B):
  Apache-2.0, 28 layers, GQA 12Q/2KV, 32,768 context, 1.31B
  non-embedding params. Pin `Qwen/Qwen2.5-1.5B` (base, not instruct —
  see below).
- **The proposed JSON format yields a label, not a probability.** An
  instruction-tuned model writing `"output": "TRUE"` is a *verbalized*
  verdict: no distribution, no calibration, no abstain band. JevBench
  explicitly separates native distributions from verbalized numbers;
  R-34 §2 says the same. If Loom needs probabilities (it does — R-20
  thresholds, R-35 risk-vs-coverage), the readout must be
  **letter/token logits + fitted temperature**, i.e. the
  decider/SemIf/Cygnet recipe, not free-text TRUE/FALSE.
- **Rank-16 on q_proj+v_proj is sound and tiny.** 28 layers × 2
  matrices × 2×16×1536 ≈ **2.75M trainable ≈ 0.18%** of params.
  Unsloth guidance (1–3 epochs, loss ~0.5–1.0 healthy, 0 = overfit)
  applies directly; 10–15 min on a single GPU is plausible for a few
  thousand short classification pairs. Sources:
  [Unsloth fine-tuning guide](https://unsloth.ai/docs/get-started/fine-tuning-llms-guide),
  [Qwen2.5-1.5B card](https://huggingface.co/Qwen/Qwen2.5-1.5B).
- **~20 ms is per-decision plausible, per-token meaningless here.** A
  single-token TRUE/FALSE or letter readout on a 1.5B GGUF is a short
  prefill + 1–2 decode steps; tens of ms on a modern CPU matches
  published small-model CPU behavior (decider-2b GGUF: 0.12–0.31 s for
  40–120-token *generative* requests — a 1-token readout is far
  cheaper). Measure, don't assert; record p50/p95 per R-34 §6.5.
- **GGUF Q4_K_M ≈ ~1 GB** for 1.5B (cf. decider-2b Q4_K_M 1.3 GB at
  1.9B). Unsloth documents GGUF export for llama.cpp/Ollama and warns
  that heavy 1-bit quants break tool-calling/agentic behavior —
  irrelevant for a 1-token classifier, but stay at Q4+ and verify
  against bf16 on the eval set (their KL framing applies to our
  probability outputs directly). Sources:
  [Unsloth GGUF docs](https://unsloth.ai/docs/basics/dynamic-3.0-ggufs).

## 1. Recommended recipe (as corrected)

1. **Base:** `Qwen/Qwen2.5-1.5B` (base, Apache-2.0, pinned revision).
   Prefer base over instruct for a logit readout: no chat template to
   fight, and the readout head defines the output contract.
2. **Data:** instruction-classification pairs in the proposal's shape
   (stuck-loop from turn diffs, AST-regression signals, repair-loop
   states → TRUE/FALSE), **plus** hard negatives (near-miss loops that
   recovered, large-but-healthy diffs) and a held-out split by *time
   and repo* (not random shuffle — leakage understates shift error).
   Labels from Loom's own runs + human review, never the candidate
   model's own outputs.
3. **Train:** QLoRA r=16 on `q_proj`+`v_proj` (extend to all-attention
   only if underfit), 1–3 epochs, Unsloth or PEFT. Keep the adapter
   separate from the base (publish adapter + base pin, not just merged
   weights — provenance per R-37 §4).
4. **Readout (the important change):** constrained single-token
   readout (`TRUE`/`FALSE` or `A`/`B` letter tokens) → logits →
   softmax at **fitted temperature** (`decider.calibrate`-style NLL
   fit on held-out Loom labels) → ECE + reliability table *with
   counts* before any threshold is trusted.
5. **Export:** merge → 16-bit → GGUF Q4_K_M
   (`qwen-1.5b-harness-classifier.gguf`); verify GGUF-vs-bf16
   agreement on the eval set; serve via llama.cpp (CPU) with a named
   timeout; log per-decision usage/latency (R-25).

## 2. Verdict: can it outperform Jev API? — conditional yes, decomposed

| Dimension | Fine-tuned 1.5B readout | Jev `jev-1.13.0` API | Winner for Loom |
| --- | --- | --- | --- |
| Narrow-task accuracy (trained distribution) | Learns Loom's exact patterns (loop diffs, AST signals); small encoders already do routing work (Laya) | Broad training; knowledge gap cuts the other way (decider-35B −0.18 vs Jev on knowledge) | **1.5B plausibly wins on-distribution** — must be measured, not assumed |
| Accuracy under shift (reworded prompts, new repos, new languages) | Brittle: narrow fine-tunes degrade off-distribution; needs retrain loop | Broad pretraining + RLCD generalize further | **Jev**, clearly |
| Calibration out of box | None — operator fits temperature, reports ECE | RLCD + published ECE (0.074 Decision Index) with vendor caveats | **Jev today**; 1.5B only after Loom-label fitting |
| Latency / cost / offline | ~tens of ms CPU, $0 marginal, air-gapped, no vendor dependency | 70–500 ms vendor claims + network/queue; $0.042/M input; needs key + egress | **1.5B decisively** |
| Startup (no Loom labels yet) | Useless until the dataset exists | Works day one | **Jev** |
| Maintenance | Retrain on drift; adapter versioning is Loom's job (kev-finetune is the template) | Vendor maintains; alias drift is the risk (pin `jev-1.13.0`) | Depends on Loom's data velocity |
| Safety role | Advisory signal only — same as any classifier (R-34 §5) | Same | **Tie: neither authorizes** |

**Overall:** for Loom's narrow, stable, well-labeled judgments —
stuck-loop detection, repair-loop classification, AST-regression
triage — a QLoRA Qwen2.5-1.5B with letter-logit readout + fitted
temperature can plausibly **outperform the Jev API on accuracy,
latency, cost and offline operation simultaneously**, because the
task rewards fit-to-Loom's-distribution over breadth. It cannot
outperform Jev on generality, zero-data startup, or out-of-box
calibration — and the proposal's free-text TRUE/FALSE form would
forfeit the probability requirement entirely, making even the
comparison invalid.

## 3. What would prove or kill it (R-35 arm, not a new protocol)

Add the fine-tuned readout as a **third arm** beside deterministic
rules and Jev API in R-35 shadow eval, same frozen Loom labels,
same metrics (accuracy, per-class errors, critical false negatives,
Brier/ECE with counts, abstain share, p50/p95/p99, $/decision):
- **Promote** iff it beats both baselines on the false-negative
  bound that matters *and* holds ECE on held-out + shift slices.
- **Kill** iff it wins accuracy but can't calibrate (ECE stays high
  after temperature fit), degrades on reworded/repo-shifted cases,
  or its maintenance (retrain cadence) exceeds the ops budget.
- Either way the deterministic gates stay authoritative; the winner
  only ever *suggests, prioritizes, or escalates*.

Do not train until R-35 labels exist — training without the eval set
is how you get a model that aces its own homework and fails Loom's.
