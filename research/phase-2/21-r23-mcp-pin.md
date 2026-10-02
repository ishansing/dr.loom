# R-23 — MCP Spec Pin

Status: pinned. No `src/` changes (no MCP-facing code exists yet;
this binds future work).
Grounding: MCP spec survey (stable `2025-11-25` observed,
`2026-07-28` tree changes transports — 02 Part 3.2); R-07 tool
gateway (rank 4, narrow); R-18 trust rules.

## Pin

- **Spec revision: `2025-11-25`** (`https://modelcontextprotocol.io/
  specification/2025-11-25/`). Transports allowed: stdio +
  Streamable HTTP. Primitives as specced: server Tools/Resources/
  Prompts, client Sampling/Elicitation/Roots.
- Re-pin is a designed event (new finding doc + compat review),
  triggered by the R-29 watch — never silent, never "latest".

## Posture (restated as binding constraints, not advice)

- Loom is an MCP **client/host** (consuming gated servers, R-07
  rank 4). It serves no MCP server in v1 — no new attack surface
  before a use case demands it.
- Tool annotations/descriptions from non-pinned, non-reviewed
  servers are **untrusted input**: never policy (R-18), never
  prompt context without labeling (injection rules, 02 Part 3.5).
- Client-side obligations Loom owns at any MCP call: show inputs
  pre-call where a human is in the loop, validate results, enforce
  timeouts, write the R-11 audit triple. Sampling/elicitation
  requests from servers require explicit approval (spec trust
  rules) — server-driven LLM calls or user prompts never auto-run.
- Roots bound every server to its declared filesystem scope;
  servers requesting wider roots than their capability needs are
  denied at connect time, not at first abuse.
