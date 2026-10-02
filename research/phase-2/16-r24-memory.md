# R-24 — Memory-Write Governance

Status: design. No `src/` changes (implementation rides later
milestone build authorization).
Grounding: memory-poisoning evidence (tainted entry re-infects every
future session; log the causing prompt; org policies read-only +
code-populated — 02 Part 2.5); Deep Agents/Letta/Mem0 memory safety
shapes; R-03 (shared persists = high-risk minimum); R-11 audit;
R-13 threads; R-18 scopes.

## Rule

Persisting across a trust boundary is the action, not the content.
Same sentence written to your own thread scratch vs the org KB are
different risk universes — governed by scope, with content
classification setting the scrutiny inside each scope.

## Three scopes (the R-18 ladder, applied to memory)

- **Thread scratch** (`thread:<id>`): the agent's own working notes.
  Standard tier, logged. No approval — friction here kills the
  note-taking pattern that makes long runs work (02 Part 2.1).
- **Run-shared** (`run:<id>`): visible to sibling threads. High-risk:
  approval required (holder thread or human per runbook), because a
  lie here misleads every thread that reads it.
- **Org/shared KB** (`org:`): visible across runs. Critical: human
  approval + provenance review, always. Populated by code paths
  (consolidation jobs, curation) wherever possible; agent-direct
  writes are the exception and audited as such.

Reads stay free except org-KB reads, which log request rows
(standard tier) — the consumption trail incident response needs to
answer "which sessions ate the tainted entry." Thread/run reads at
debug retention (R-18 audit economy holds).

## Content classification (heuristic + human, no ML)

At every cross-boundary write, classify:

- **Instruction-bearing** (procedures, "always do X", tool
  directives, anything shaped like a prompt): highest scrutiny —
  this is the poisoning vector. Flagged permanently on the entry;
  only a human de-flags (consolidation may never de-flag, only
  narrow/merge).
- **Fact** (observations, results, hashes, links): lighter review,
  still approval-gated by scope.
- **Secret-shaped** (keys, tokens, credential patterns): denied at
  write + alert. Never persist secrets is a CUSTOM-HARNESS rule;
  the scanner makes it mechanical, not aspirational. Denial rows
  name the pattern matched, never the matched text.

Heuristics stay dumb and visible (imperative-verb lists, tool-name
mentions, "ignore/override/always" markers); the human approver is
the classifier of last resort.

## Provenance (mandatory, structural)

Every shared entry carries: causing prompt/action (`link:<action_id>`,
R-11), author thread, timestamp, scope, classification. Entries
without provenance are rejected at write — an unsourced "fact" in a
shared KB is indistinguishable from planted, so the store treats it
as planted.

## Poisoning response (quarantine, never silent delete)

- Suspect entry → quarantine flag (new audited row superseding, never
  UPDATE/DELETE — ledger discipline). Quarantined entries are
  invisible to readers but present for forensics.
- Blast-radius review: consumption trail (org-KB read receipts) lists
  exposed sessions; each gets a flagged review task. The trail is why
  org reads are logged — incident response without it is guessing.
- Promotion back (false alarm) is a human audited action with reason;
  the quarantine row stays in history either way.

## Consolidation (sleep-time compute, governed)

Background consolidation runs are audited actions with their own actor
(`agent:consolidator`), scoped to explicit source ranges. Rules:
merge and narrow only; classification flags propagate (instruction
stays instruction); no scope elevation (thread notes never auto-promote
to org — promotion is a fresh cross-boundary write with its own
approval); concurrent same-file writes stay last-write-wins at the
store layer, so consolidation shards per-topic (Deep Agents lesson,
02 Part 2.2).
