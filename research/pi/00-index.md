# Pi-as-Base-Runtime Research — Index

Status: verified-against-latest synthesis (2026-10-01). Assumes
`earendil-works/pi`, NOT the PyPI namesake / `pi-go` / `oh-my-pi`.

For the separate 2026-10-02 study of features to borrow from Claude Code,
OpenCode, OMP, Hermes, DeepSeek Harness, and Codex **while retaining Pi as the
base**, see [R-33 cross-harness comparison](08-cross-harness-comparison.md).
For typed fast decision models, probability semantics, and a measured
integration path, see [R-34 System One research](09-system-one-decision-models.md).
For Pi's classifier adapter call path and Loom-side validation, isolation,
metering, failure and recovery contracts, see
[R-36 internal integration research](10-system-one-internal-integration.md).
For open-weight alternatives, benchmark standings and the conditional
shortlist, see [R-37 FOSS comparison](11-foss-decision-models.md).
For the fine-tuned Qwen2.5-1.5B verdict versus the Jev API, see
[R-38 QLoRA verdict](12-qlora-harness-classifier.md).

## Source pins (what "latest" meant)

- Repo `main`: `6f1072cc` (then `395315f` minutes later — main moves
  fast; re-pin at build). npm `latest`: `0.99.2` for
  `pi-coding-agent`, `pi-agent-core`, `pi-ai`, `pi-durable`
  (registry `2026-09-30`). Docs: unversioned `pi.dev/docs/latest`
  generated from `packages/coding-agent/docs/*.md`.
- Any `github.com/pi-packages/earendil-works-pi` link found in
  third-party writeups is a **0-star fork, not canonical** — use
  `github.com/earendil-works/pi`. Any `docs/sdk.md` root path is
  wrong — actual path `packages/coding-agent/docs/sdk.md`.

## Coverage matrix (41 checklist items)

| # | Topic | Verdict | Doc |
|---|---|---|---|
| 1 | Runtime abstraction | CONFIRMED (names corrected) | 01 |
| 2 | Project state ownership | CONFIRMED | 02 |
| 3 | Persistent memory | CONFIRMED (nothing in core) | 02 |
| 4 | Working vs long-term memory | CONFIRMED (no distinction in core) | 02 |
| 5 | Context manager | CONFIRMED (hook points mapped) | 02 |
| 6 | Pi compaction | CONFIRMED (lossy default; hook it) | 02 |
| 7 | Session strategy | CONFIRMED (primitives mapped) | 03 |
| 8 | Agent boundaries | CONFIRMED (roles = prompt+tools+model) | 03 |
| 9 | Structured outputs | CORRECTED (no agent-level schema; terminate-on-tool pattern) | 03 |
| 10 | Task graph | CONFIRMED (harness owns; durable experimental only) | 02 |
| 11 | Lifecycle machine | CONFIRMED (no stage primitive) | 03 |
| 12 | Acceptance criteria | CONFIRMED (dev-time evals only) | 03 |
| 13 | Verification layer | CONFIRMED (`agent_before_settle` boundary) | 04 |
| 14 | Tool gateway | CONFIRMED (single `tool_call` point) | 04 |
| 15 | Sandboxing | CONFIRMED (no OS boundary) | 05 |
| 16 | Permission ≠ boundary | CONFIRMED (docs say so verbatim) | 05 |
| 17 | Credential isolation | CONFIRMED (+proxy stories) | 05 |
| 18 | Prompt injection | CONFIRMED (out-of-scope upstream) | 05 |
| 19 | Project trust | CONFIRMED (trust≠sandbox; sessionDir hole open) | 05 |
| 20 | Human approvals | CORRECTED (no core primitive; extension-built) | 05/06 |
| 21 | Filesystem boundaries | CONFIRMED (cwd≠confinement verbatim) | 05 |
| 22 | Git integration | CORRECTED (session-tree only; git is extensions) | 05 |
| 23 | Parallel conflicts | NOT-FOUND in core (harness-owned) | 05 |
| 24 | Subagent limits | CORRECTED (extension-built; example caps 8/4) | 06 |
| 25 | Model abstraction | CORRECTED (no per-role models; virtual models) | 01 |
| 26 | Capability tools | CONFIRMED (no semantic ops; exposure modes) | 04 |
| 27 | Extensions vs harness | CONFIRMED (coupling traps listed) | 04 |
| 28 | Skills | CONFIRMED (no top-k router — description matching) | 04 |
| 29 | Config precedence | CONFIRMED (invisible-config risk real) | 01 |
| 30 | Retry taxonomy | CORRECTED (transient-only auto-retry) | 06 |
| 31 | Idempotency | CORRECTED (none in ops; durable has requestId) | 06 |
| 32 | Cancel/timeouts | CONFIRMED primitives; CORRECTED (no per-tool timeout, no loop guard) | 06 |
| 33 | Budgets | CORRECTED (observability only, no caps) | 06 |
| 34 | Observability | CORRECTED (events+stats, no run ledger) | 06 |
| 35 | Event system | CONFIRMED Pi-level; harness-level NOT-FOUND | 01 |
| 36 | Artifact tracking | NOT-FOUND (harness owns) | 02 |
| 37 | Decision log | NOT-FOUND (harness owns) | 02 |
| 38 | Eval suite | CORRECTED (docs-lift + smoke, not gates) | 06 |
| 39 | Version pinning | CONFIRMED (mechanics enable it) | 06 |
| 40 | Durability / pi-durable | CONFIRMED exists; CORRECTED experimental | 06 |
| 41 | Keep Pi replaceable | CONFIRMED (traps listed) | 01 |

## v0.1 focus assessment (the pasted diagram)

The recommended v0.1 (runtime interface + tasks + state + context +
verification + sandbox) survives verification: every one of those six
is a confirmed Pi gap the harness must fill, and none is contradicted
by new core features. Two adjustments: (a) structured outputs need the
terminate-on-tool pattern (item 9 correction) since agent-level schema
doesn't exist; (b) `pi-durable` experimental may cover durability later
but must not be depended on at v0.1 (item 40 correction).
`.harness/{project,tasks,decisions}.json + state.json + artifacts/`
remains the right shape — Pi has none of these files.
