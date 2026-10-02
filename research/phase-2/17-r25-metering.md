# R-25 — Cost Metering Pipeline

Status: design. No `src/` changes (implementation rides later
milestone build authorization).
Grounding: provider metering hooks (split input/cache/output usage
objects — 02 Part 1.4); R-16 (caps over metered usage, meter-only
mode); R-11 (usage ingestion as audited appends); R-13 thread
roll-up; R-14/R-21 spend display.

## Rule

Tokens are always recorded; cost is computed only when priced. A
turn with no price row shows **unpriced**, never zero — zero cost is
a lie the bookkeeping will be asked to defend later.

## Ingestion (one normalized shape, provider quirks at the edge)

- Capture at turn close from the stream's cumulative usage delta (or
  SDK `onFinish`/result usage where streams aren't used). One row per
  turn: `{thread_id, run_id, turn_seq, model, input_tokens,
  output_tokens, reasoning_tokens, cache_read, cache_write,
  cost_minor_units NULL-able, recorded_at}`.
- Normalization is provider-specific code at the edge (Anthropic
  creation/read splits, OpenAI cached/reasoning splits, Vercel unified
  usage); the row shape never varies. The raw provider payload is kept
  as evidence (hash pointer, R-11) for disputes, not re-parsed later.
- Cache economics need no allocation logic: creation vs read tokens
  arrive as distinct fields — first turn pays the write, readers pay
  reads, exactly as billed. Shared-prefix ambiguity is a billing
  fiction the providers already resolved; Loom records their
  resolution.
- Keyed `(thread_id, turn_seq)` UNIQUE: late/delayed usage arrivals
  fill gaps idempotently (INSERT-or-ignore + audit note), never
  double-count. Ingestion runs in the same txn as the R-16 counter
  update — meter and books agree or neither lands.

## Pricing (versioned tables, pinned per run)

- `prices(model, input_per_mtok, output_per_mtok, reasoning_per_mtok,
  cache_read_per_mtok, cache_write_per_mtok, valid_from)` — sourced
  from provider pricing pages, entered by a human (audited), never
  scraped silently.
- Each run pins its price-table version at `init`. Mid-run price
  changes apply to the next run, not the current one — accounting
  stability beats price freshness inside a run's lifetime.
- Unpriced turns (model missing from the table) accumulate tokens
  normally with `cost_minor_units = NULL`. Caps compare *priced* spend
  only, and `status` shows priced vs unpriced separately — an
  unpriced model silently consuming cap headroom is how budgets get
  blindsided.

## Attribution and display

- Attribute to the turn that incurred; roll thread → run (R-13).
  No cross-thread splitting, no amortization models — the books
  mirror the invoice.
- `status` / dashboard spend line per run and per thread: `priced
  X / cap Y · unpriced Z tokens · meter-only` where applicable.
  Meter-only mode (R-16) still records everything — the pipeline
  doesn't know enforcement is off, which is exactly why turning
  enforcement on later needs no backfill.

## Reliability bounds (stated, not solved)

- Provider dashboard is the backstop, Loom's books are primary for
  enforcement. Monthly drift review (R-29) compares the two; material
  drift opens an incident-row investigation, not a silent adjustment.
- Dropped streams (usage never arrived) surface as turn rows without
  usage children — visible gaps, queryable, rather than interpolated
  estimates. Never interpolate spend.
