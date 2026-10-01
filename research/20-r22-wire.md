# R-22 — Multi-Agent Wire Choice

Status: conditional decision (only matters if Loom leaves the single
workspace). No `src/` changes.
Grounding: A2A data model + transports, MCP-complementary framing
(02 Part 5.4); OpenAI handoff mechanics; R-13 handoff-as-audit-action;
context-by-reference (02 Parts 2, 4.6).

## Decision: envelope now, A2A only on interop need

While agents share one workspace and one DB, handoff needs no wire
protocol — R-13's release+acquire with epoch trail plus the audit row
*is* the handoff. A wire is owed only when agents stop sharing the
store (federated runs, remote specialists, cross-harness work).

So define the **handoff envelope** now (fixed payload, transport
agnostic), and adopt A2A if and when Loom must interoperate with
external A2A agents:

- `{handoff_id, from_thread, to_agent, task, context_refs, grants,
  deadline, budget_slice}` — context by **reference** (run/thread
  ids + resume points + evidence hashes), never full-history paste
  (token cost + lost-in-the-middle + poisoning surface, 02 Parts 2,
  4.6). The recipient rehydrates from ledgers it can see and declares
  what it cannot — a handoff that needs invisible context fails
  closed instead of guessing.
- `grants` and `deadline`/`budget_slice` carry R-18/R-16 authority
  with the delegation (narrowed copies, never the parent's full
  rights or full budget).
- A2A mapping (recorded for later, not implemented): envelope →
  A2A Message; task outcome → Artifact (never messages-for-output,
  per spec); agent identity → AgentCard discovery only if Loom ever
  publishes agents. Nothing in the envelope contradicts the A2A
  model, so adoption stays a transport change, not a redesign.

## Explicit non-goals

- No federated lease protocol (cross-DB mutual exclusion is
  unsolved here by design — multi-harness runs inherit the R-17
  per-DB-truth limitation until a dedicated pass says otherwise).
- No agent directory/discovery protocol (AgentCard or otherwise)
  before the first remote-handoff use case exists.
