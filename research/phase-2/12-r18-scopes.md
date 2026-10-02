# R-18 — Scoped Permissions Model

Status: policy design. No `src/` changes (implementation rides
milestone build authorization).
Grounding: Miller ocaps (unforgeable designation+permission) vs ACL
practice (Claude deny→ask→allow, OpenCode per-tool rulesets, Microsoft
session-scoped fail-closed folders, MCP Roots, OpenAI manifest
path rules); R-03 tiers; R-07 decision point; R-13 threads; R-16
budgets bound spend, this bounds reach.

## Hybrid: ACL policy + capability grants

Pure ocaps don't fit a SQLite harness (no object references cross the
tool boundary — only tool names + JSON args), and pure ACLs can't
express delegation ("this child may edit only `docs/`"). So:

- **Policy (ACL side):** static rules answering "may thread T invoke
  tool W on target P?" Deployed as managed config, evaluated in one
  place.
- **Grants (capability side):** dynamic narrow authorities minted at
  delegation, answering "what did the parent hand down?" Stored as
  rows, checked alongside policy, never exceeding it (a grant can only
  narrow, never widen — most-restrictive-wins makes this structural).

## Policy evaluation (single decision point)

One function — `authorize(thread, tool, target)` → `allow | ask |
deny` + reason — consulted by every interception rank (R-07 hooks,
server-API replies, CLI). Rule shape:
`policy(scope, tool, pattern, effect)` with scopes
`global → run → thread` and effects `allow | ask | deny`:

- Evaluation order: **deny anywhere wins** (any scope, any match);
  else most-specific scope's verdict; else default (below).
  Specificity never overrides a deny (Claude rule, R-07).
- `tool` names the harness tool key (`edit`, `bash`, `webfetch`,
  `mcp:<server>:<action>` …); `pattern` matches the target
  (path glob, domain, command prefix) with `*`/`?` wildcards.
- Managed config ships the org baseline; local config may only add
  rules — and since deny-wins, local additions can only narrow. An
  org deny is unoverridable by design, not by convention.

## Defaults (shipped, runbook-overridable only upward-narrow)

- Inside workspace: reads `allow`, mutation family (`edit/write/
  delete/bash/apply_patch`) `ask`, network egress `ask` minimum
  (R-03 high-risk floor).
- Outside workspace: everything `deny` except explicitly listed
  read paths. `*.env`, key material, and the Loom DB itself are
  deny-by-default patterns no runbook may lift (only a managed-config
  change + audit row can).
- `doom_loop`-class stall signals evaluate as `ask` regardless of
  allow rules (R-03 auto-escalation hooks in here).

## Workspace boundary (invariant, not policy)

All filesystem targets resolve workspace-relative **before**
authorization, and `..` escape (plus symlinks resolving outside) is
denied mechanically (OpenAI manifest rule, R-07). This is path
resolution, not a rule line — no policy edit can permit escape, and
policy patterns therefore never need to defend against it.

## Grants (delegation carries authority)

- On spawn/handoff (R-13 audit actions), the parent's grant set for
  the child is recorded: `grants(grant_id, thread, tool, pattern,
  expires_at)`. Default = empty (child may read inside workspace,
  nothing else) unless the spawn specifies more; every addition is an
  audited choice.
- Check order at decision time: kill (R-17) → deadline (R-16) →
  **grant exists?** → policy → lease (R-04). A missing grant denies
  before policy is even consulted — least authority by default.
- Grants expire (default: with the thread's lease or 1h, sooner wins);
  renewal is a new audited row, never an UPDATE.

## Secrets and audit

- Secrets never appear in policy, grants, or audit rows — env-level
  injection only (CUSTOM-HARNESS rule, restated because it will be
  tempted here first).
- Every `ask` and every `deny` writes its R-11 audit rows (request +
  verdict at minimum). `allow` writes request + completion only for
  the mutation family and high-risk+ tiers (R-03); pure reads log at
  debug retention (R-11 archival policy covers volume).
