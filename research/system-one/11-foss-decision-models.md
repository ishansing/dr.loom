# R-37 — FOSS Decision Models: Comparison and Loom Recommendation

Research snapshot: **2026-10-03**. Status: comparison + conditional
recommendation, **not** a model selection or install authorization. No
weights downloaded, no provider added, nothing in Loom's execution path.
Builds on [R-34](09-system-one-decision-models.md) (vendor landscape,
probability semantics, shadow-eval protocol) and
[R-36](10-system-one-internal-integration.md) (Pi call path, validation
gaps, sidecar shape). "FOSS" here means weights + code under permissive
licenses (MIT/Apache-2.0); each entry states both licenses separately
because they routinely differ.

## 1. Candidate table (primary sources; [UNVERIFIED] where flagged)

| Model | Weights / code license | Base / params / context | Runtime + hardware | Calibration workflow | Maintainer | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Mapika decider-2b/4b (+GGUF) | Apache-2.0 / Apache-2.0 | Qwen3.5-2B/4B-Base; 1.9B/4.2B; 32k | torch+CUDA graphs (2B ~4GB, 4B 8.4GB); GGUF Q4_K_M 1.3/2.7GB via llama.cpp, 0.12–0.7s on 8 CPU threads; `decider.serve` = TypeSafe-compatible `/v1/systemone` | `decider_config.json` per-type temps + `python -m decider.calibrate` on own labels; card warns to verify on own data | Mapika (independent, versioned tags, CHANGELOG/RESULTS) | Most deployment-mature open option; shortlist |
| Mapika decider-35b-a3b | Apache-2.0 / Apache-2.0 | Qwen3.5-35B-A3B-Base; 34.7B/3B active | 65GB bf16 or 19.6GB NVFP4 (vLLM); community GGUF exists | Same calibrate tooling | Same | Quality ceiling, wrong hardware class for Loom; exclude unless GPU appears |
| Laya (+multilingual, typed-decisions) | Apache-2.0 / Apache-2.0 | ModernBERT-large 421M (mmBERT 322M); 512/1024 ctx (encoder to 8k) | `pip laya`, `laya-serve` = local `/v1/systemone`; T4 ~33–72ms; CPU 193–464ms; ONNX/MLX ports | Per-(type, option-count) temps; Kaggle fine-tune notebook; ECE 0.466→0.081 reported after refit | Convai Innovations (org, Honest Limits, issue tracker) | Best CPU routing/triage ≤20 options; shortlist |
| kev-0.8b (family to 27b) | Apache-2.0 / Apache-2.0 | Qwen3.5-0.8B-Base; 4GB GPU or any Apple Silicon Mac | `kev.serve` (TypeSafe-compatible); 0.8B/L4 ~23ms; Modal one-command; MLX Mac | `kev-finetune` skill (labels→train→compare→calibrate), per-checkpoint temp, out-of-fold estimate | Jared Palmer (individual, frozen suites, checksummed releases) | Best train-your-own loop; shortlist 0.8B for small-GPU/Mac |
| GLiNER2.5-Decide family | Apache-2.0 / Apache-2.0 | DeBERTa-v3/mDeBERTa 74M–1B | `pip install gliner2`, CPU-first, air-gap OK, local fine-tune | **None located** — only `cls_threshold`; treat scores as uncalibrated similarities | Fastino AI (org, paper, 2.3k★) | CPU specialist for intent/routing/moderation, NOT full Choice/Score/Noul semantics; conditional |
| JevK5 v0.3 | Apache-2.0 / Apache-2.0 | Qwen3.5-4B + merged LoRA r16; ≤16 options/pass, ≤16k tokens | `jevk5-serve` (~13ms H100, ~9GB bf16; CPU flag pending fix) | Not located; inherits Qwen temps approach [UNVERIFIED for operator refit] | allebee (individual, v0.3 2026-10-02) | Cleanest open wire-shape on GPU; option cap fits skill shortlists; backup candidate |
| reflex (+27b config) | Adapter license unverified / research code | Qwen3.5-4B LoRA; 27b = serving config on Qwen3.8-27B | `reflex-serve`, SGLang; 27b needs H100 80GB | Proper-scoring-rule training; source tarball + lock published | kshetrajna12 (hobbyist) | Research-grade; adapter-only means own calibration/serving; watch, don't adopt yet |
| Imajev-4B | Apache-2.0 / Apache-2.0 | Qwen3.5-4B + LoRA r64; 32KB state cap; abstain signal | Torch/CUDA or MLX Mac; p50 96ms H100 | Not located [UNVERIFIED] | Mohit Garg (individual) | Photos + abstain niche; state cap + English-only limit general use |
| Cygnet | Recipe MIT; **base Gemma-4 under Google Prohibited-Use Policy — flag** | Frozen Gemma-4-12B-it; ≤26 options, ≤16k tokens | Stock vLLM, ~40ms, needs ~48GB GPU | None (frozen weights + single temp) | blockbrain | Strongest no-training option but license + hardware exclude it for Loom |
| Winnow-12B | Apache-2.0 **with Gemma-4 derivative terms — flag** | Gemma-4-12B-it merged LoRA; 65k positions; chat+vision same server | llama.cpp Q8 on 16GB consumer GPU | None fitted (entropy confidence) | EldanRing (hobbyist) | Good local all-rounder; license flag + fit-own-calibration required |
| Plumb-4B | Apache-2.0 / Apache-2.0 | Qwen3.5-4B via JevK5 + further LoRA | Inherits JevK5 runtime | Inherits JevK5 | crh225 (hobbyist) | Leaderboard-tuned derivative; pin + re-evaluate, may be obsoleted by JevK5 v0.3 |
| SemIf / open-alternative-jev | MIT / Apache-2.0 code; **NO trained weights** (BYO open LLM) | Frozen Qwen/MiniCPM + letter-logit readout | Torch/MPS/GGUF/WebGPU; per-workload temp calibration | Operator-owned by construction | TheoLeeCJ / ikermoel | Best "own-model, own-network" path if Loom brings its own base + labels; not a drop-in model |
| AgentJev-0.6B | Apache-2.0 / Apache-2.0 | Qwen3-0.6B; 64 candidates/forward, ~50–68ms | Tiny service, tool-gate shaped | Not located [UNVERIFIED] | malevrigns (hobbyist, mirrored weights) | Niche fast gate; not a general substitute |
| djev | Apache-2.0 code; **no trained weights** (DiffusionGemma base) | 26B-A4B; hosted probs experimental/uncalibrated | vLLM + hosted preview (currently paused) | None | Davipar/Maisa | Visual-speed prototype; don't threshold on it |
| Hopper | **Research/demo-only terms — NOT production** | Qwen3.5-4B LoRA | Standard torch serve | Not located | HopitAI | Eval-only until terms change; excluded |
| Certo | MIT claimed (verify card); ~0.4B encoder | 64-token state, no question field; synthetic training | CPU-friendly Python | None | AltSlate Labs | Structured micro-tasks only; not NL triage |
| smalljev | License/artifact unlocated [UNVERIFIED] | MiniCPM5-2B + LoRA; near-zero current score | Unknown | None located | Hobbyist, no repo/card found | Excluded until pinnable artifact appears |
| Zefan Open-Jev 2B/9B/27B | Apache-2.0 adapters (fetch pinned Qwen bases separately) | Qwen3.5-2B/9B (+27B); 4k internal, 16k bench protocol | CUDA/H100 serial; Transformers+PEFT | Hash/manifest audit trail; refit path via adapters | Zefan Cai (individual) | Most audit-heavy; adapter+friction, good regulated-pilot candidate, poor plug-and-play |
| Needle 3 / ProgramAsWeights | Apache-2.0 weights but engine source-available (flag) / SDKs; **not Jev-typed** | 25–121M custom / per-program LoRA | Tiny-device CPU/WASM | N/A (no calibrated Choice/Score/Noul) | Cactus / PAW (commercial) | Complementary tiny-device tooling, not decision-model substitutes |

## 2. What the boards actually say (and don't)

**JevBench v1.4.2.2** (95 systems / 91 ranked; equal-weight harmonic mean
of Intelligence, Calibration, Speed, Cost; sealed items only as
aggregates): Imajev-4B 67.37, Plumb-4B 65.84, decider-4b v2 64.13, **Jev
1.13.0 63.29**, JevK5 v0.2.0 62.04, Cygnet 61.76, Hopper 59.43, Winnow-12B
Q8 55.58, reflex 4B 53.99, djev 52.23. On Intelligence alone Jev leads
the Jev-class (53.06) with Plumb-4B at 52.98; on Calibration the best
open entry (Imajev-4B 80.35) beats Jev (76.34). Cost figures for open
entries are **estimates from base-model list prices × measured tokens**,
not GPU bills; self-hosted latencies carry an **assumed ×2 +0.15s**
production adjustment. Sealed items are unusually hard for one-pass
models and small gaps are not proven superiority. Sources:
[method](https://raw.githubusercontent.com/fstandhartinger/jevbench/main/docs/METHOD-v1.4.md),
[results artifact](https://raw.githubusercontent.com/fstandhartinger/jevbench/main/results/v1.4.2.2/jevbench-v1.4.2.2-results.json).

**Decision Index 0.2.1** (120k requests, 38 benchmarks, chance-corrected,
coverage-adjusted, unanswered = wrong): Jev 57.91 first overall; closest
open Rune 57.44, decider-chat-Gemma-4-31B 57.33; best top-10 ECE values
belong to open entries (Jebadiah 0.0140, pplx-decider 0.0178, decider-chat
Qwen3.6-27B 0.0209) vs Jev 0.074. Models over 1,000 ms median on the
reference GPU are excluded as no longer Jev-like. Sources:
[repo](https://github.com/apolinario/decision-index),
[index data](https://huggingface.co/spaces/multimodalart/jev-decision-index/resolve/main/data/index-v0.2.1.json).

Neither board substitutes for Loom labels: neither tests skill routing
under I2P's registry, approval triage under Loom policy, or adversarial
tool output. Both say so in their own methods docs — use them to
**shortlist**, then measure on Loom tasks per R-34 §6 / R-35.

## 3. Recommendation for Loom (conditional, staged)

**Shortlist for R-35 shadow eval, in order:**

1. **decider-2b/4b GGUF** — CPU-runnable today (1.3–2.7GB), TypeSafe-wire
   compatible, versioned, operator temperature fitting, honest limit
   docs. Fits Loom's likely hardware (no GPU assumed) and the Pi
   sidecar shape (R-36 §2). Start with 2b Q8_0 (near-bf16 quality).
2. **Laya** — sub-500M CPU encoder family, `POST /v1/systemone`
   locally, org-maintained, refit workflow published. Constraint:
   keep Choice schemas <20 options and state short; verify Score
   weakness on Loom's rubric before any severity use.
3. **kev-0.8b** — only if a small GPU or Apple Silicon Mac is present;
   best documented fine-tune→compare→calibrate loop for Loom's own
   labels. Otherwise defer.

**Conditional specialist:** GLiNER2.5-Decide for high-volume CPU
intent/routing pre-filter *only* — never as the triage scorer until
someone demonstrates a calibration workflow for it.

**Explicitly excluded for now:** Hopper (terms), Cygnet/Winnow (Gemma
derivative flags + hardware), smalljev (no artifact), djev/Certo/
Needle/PAW (not calibrated Jev-typed decisions), SemIf/open-alternative
(useful only when Loom brings its own base + labels — revisit as the
"own-model" endgame), 35B-class (hardware), reflex/Plumb/Imajev/JevK5
(credible backups; re-check at build time since all moved in the last
week).

**Staged adoption (gates, not dates):**
- Stage 0 (now): no model installed. Keep the R-35 protocol and the
  R-36 validation contract as the entry criteria.
- Stage 1: offline shadow replay of shortlisted models on frozen Loom
  labels (skill-routing + triage + adversarial sets). Promote at most
  one per use case on measured false-negative bounds + p95 + cost.
- Stage 2: single reversible pilot (optional skill suggestion), human
  review on abstain, deterministic gates unchanged.
- Stage 3: only with sustained measurements — consider fine-tuned
  kev/Laya on Loom labels, or SemIf-style own-model readout.

## 4. Ops notes that constrain the choice

- **Offline:** decider GGUF/safetensors, Laya checkpoints, kev
  adapter+pinned base, GLiNER2 — all downloadable once and servable
  without keys (verify no telemetry before airgap claims; kev's Modal
  path is training-only).
- **VRAM/CPU:** 2b-GGUF ≈ laptop CPU; Laya ≈ CPU/T4; kev-0.8B ≈ 4GB
  GPU/Mac; 4b-GGUF ≈ 8 threads; 9B+ ≈ 17GB+; 27B+ ≈ 80GB (excluded).
- **Calibration is operator work everywhere:** decider `calibrate`,
  Laya refit notebook, kev skill — all require Loom labels; no board
  number transfers. GLiNER2/smalljev have no located workflow.
- **Failure behavior to test, not assume:** decider 413/503 with no
  silent truncation (good); GGUF batching shifts probs up to 0.16
  (score one row per decode for audit-stable numbers); Laya 422s on
  malformed, `none`-semantics and `act_probability` traps documented;
  kev 422s over 65k tokens. Long-state, reorder, and non-English
  robustness are per-model homework (R-34 §6 item 4).
- **Cost math without invented numbers:** Jev = input-tokens ×
  $0.042/M (worked: 1k calls × 1k tokens = $0.042). Self-hosted =
  (hardware $/h ÷ 3600 ÷ sustained req/s) × 1000 + power/eval
  amortization — plug Loom's measured tokens/decision and req/s;
  log per-decision usage+latency (R-25) so the comparison is computed,
  not asserted.
- **Supply chain:** pin weight SHAs + code revisions (decider tags,
  kev checksums, Zefan manifests set the standard); Gemma-derived
  weights carry use-policy terms; single-maintainer projects need a
  fork-or-mirror plan before they sit in any critical path.
