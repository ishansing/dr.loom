# R-33 — Borrowing the Best of Other Harnesses for Loom on Pi

Research snapshot: **2026-10-02 UTC**. This is a comparison of *mechanisms*, not a
benchmark or a decision to adopt other runtimes. Pi remains Loom's base agent loop,
model interface, tool plumbing, and conversation store; Loom owns I2P execution
policy, project/task state, leases, durable decisions, approval, audit, and verified
completion. See [Pi research](00-index.md), [Pi/OpenCode comparison](../23-opencode-vs-pi.md),
and [build mapping](07-loom-v01-mapping.md). No change to `FRAMEWORK_REF` or build authorization.

Source snapshot for moving repositories: [Pi `9fba660`](https://github.com/earendil-works/pi/commit/9fba660cf1caca0ade5bea72269352416e595a19),
[OMP `0e2411c`](https://github.com/can1357/oh-my-pi/commit/0e2411c0df59fce8c56dc03a5f1c9afffcb0d746),
[Hermes `1a4508e`](https://github.com/NousResearch/hermes-agent/commit/1a4508e2aff2db5f50409893a2115be777bd5643),
[DeepSeek `639ed01`](https://github.com/deepseek-ai/deepseek-harness/commit/639ed015397290b3745d163aafe02ffee4aa3f84),
and [Codex `f88a6ef`](https://github.com/openai/codex/commit/f88a6efe437eec1329d8e8810c788c90ac547888).
The linked first-party documentation was fetched on the research date; it is
unversioned unless its URL includes a revision.

## Scope and evidence

| Target | First-party evidence examined | Relevant seam and maturity |
| --- | --- | --- |
| [Pi](https://pi.dev/docs/latest/extensions) | Extension lifecycle, [SDK](https://pi.dev/docs/latest/sdk), [security](https://pi.dev/docs/latest/security), [sessions](https://pi.dev/docs/latest/session-format) | Base runtime; pre-tool `tool_call`, `agent_before_settle`, `appendEntry`; no OS sandbox or built-in approvals. |
| [Claude Code](https://code.claude.com/docs/en/permissions) | [Hooks](https://code.claude.com/docs/en/hooks), [subagents](https://code.claude.com/docs/en/sub-agents), [agent teams](https://code.claude.com/docs/en/agent-teams) | Deny → ask → allow; hooks; skills; teams **experimental**, with known resume/coordination limitations. |
| [OpenCode](https://opencode.ai/docs/agents/) | [Plugins](https://opencode.ai/docs/plugins/), [permissions](https://opencode.ai/docs/permissions/), [agents](https://opencode.ai/docs/agents/) | Plugin hooks, configured agents, per-agent rules; baseline R-07 found `--pure` and audit blind spots. |
| [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi) | [Agent definitions and spawn policy](https://github.com/can1357/oh-my-pi/blob/main/docs/task-agent-discovery.md), [Agent Hub](https://github.com/can1357/oh-my-pi/blob/main/docs/agent-hub.md), [advisor](https://github.com/can1357/oh-my-pi/blob/main/docs/advisor-watchdog.md) | Pi fork with integrated multi-agent, typed output, model roles, live roster; do **not** swap Pi for the fork just to copy its UX. |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | [Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory), [sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions), [security](https://hermes-agent.nousresearch.com/docs/user-guide/security) | Capped curated memory and on-demand FTS history; staged memory/skill approval; headless deny defaults and sandbox backends. |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md) | [Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md), [tools](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md), [teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md), [safety](https://github.com/deepseek-ai/deepseek-harness/blob/master/SAFETY.md) | Cordis plugin-composition reference; durable mailbox/task CAS and monotonic guards are good *patterns*. **0.2.0-rc.2 developer preview; unaudited, breaking changes expected.** |
| [Codex CLI](https://github.com/openai/codex) | [Sandbox and approvals](https://developers.openai.com/codex/agent-approvals-security), [subagents](https://developers.openai.com/codex/agent-configuration/subagents) | OS-enforced sandbox separate from approval policy; per-agent model/effort and concurrency controls. |

The first-party documents above were read on the snapshot date. Fast-moving docs and
the [DeepSeek developer preview](https://github.com/deepseek-ai/deepseek-harness/blob/master/SAFETY.md)
can change; the links identify examined contracts, not an assertion that any
competitor's marketing or security guarantees have been independently tested.

## Comparative lessons by responsibility

| Responsibility | Strong example, with evidence | Pi joint / Loom owner | Takeaway |
| --- | --- | --- | --- |
| Pre-execution decisions | Claude [rules](https://code.claude.com/docs/en/permissions) deny before ask before allow; DeepSeek [tool guards](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md) can deny but cannot force-allow after a denial. | Pi [`tool_call`](https://pi.dev/docs/latest/extensions) veto; Loom `authorize()` and lease/kill state (R-04/R-17/R-18). | Centralize one monotonic allow/ask/deny result; never let a later plugin silently undo a deny. Test the *whole* mutation family, not only `edit`. |
| Isolation | Codex [sandbox mode vs approval policy](https://developers.openai.com/codex/agent-approvals-security); Claude [permission docs](https://code.claude.com/docs/en/permissions) warn Bash patterns are not an OS boundary. | Loom's external sandbox (R-15), with Pi inside the restricted environment or controlled tools; Pi's hook is a policy/UX point. | Default no-network, limited mounts and credentials. An extension alone cannot contain arbitrary child processes or other in-process extensions. |
| Durable session and effect evidence | DeepSeek [session-log invariant](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md): model-visible inputs logged; failed attempts retained without entering model history. | Pi [session JSONL](https://pi.dev/docs/latest/session-format) remains conversation truth; Loom SQLite stores task decisions, attempts, audit and references (R-11/R-12). | Keep *attempted* vs *committed* distinct; capture receipt before claiming success; don't write Pi's transcript out of band. |
| Context and memory | Hermes [small frozen memory snapshot + on-demand session search](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory); Pi [context/compaction hooks](https://pi.dev/docs/latest/extensions). | Loom context manager (T-13) retrieves pinned project facts, references and skill contracts; Loom's R-24 approves promotion to shared memory. | Keep current task small; store decisions before compaction. A summary is not authoritative state. Do not silently learn instructions from untrusted tool output. |
| Verified completion | Claude [`TaskCompleted`/`TeammateIdle` hooks](https://code.claude.com/docs/en/agent-teams); Pi [`agent_before_settle`](https://pi.dev/docs/latest/extensions). | Loom verifier (T-14), fresh evidence from `itp-verify`; result schema via Pi terminate-on-tool (T-11). | Treat a model's “done” as a claim. Gate *state transition* on observed checks and audit the verdict; avoid an unbounded model-only continuation loop. |
| Multi-agent roles | OMP [agent definitions](https://github.com/can1357/oh-my-pi/blob/main/docs/task-agent-discovery.md) resolve model/tool/output with spawn/depth preflight; Codex [subagent config](https://developers.openai.com/codex/agent-configuration/subagents) separates per-agent settings. | Loom run/thread identity and narrowed grants (R-13/R-18); Pi per-session prompt/tools/model. | Begin with read-only research/review children, one workspace writer. Model and role instructions are not permission grants. |
| Coordination | DeepSeek [teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md) use task revisions for CAS, sender/message IDs for mailbox dedup, but `writeScopes` are advisory; Claude [teams](https://code.claude.com/docs/en/agent-teams) use task locks yet warn same-file edits conflict. | Loom task DAG + workspace-wide **fenced** mutation lease (R-04/R-09/R-13); typed handoff envelope (R-22). | A task claim is not a workspace write lease. Treat peer messages as untrusted data, never proof of human approval. |
| Operator view | OMP [Agent Hub](https://github.com/can1357/oh-my-pi/blob/main/docs/agent-hub.md) shows per-child identity, status, usage and transcripts, with steer/kill. | Loom `status`/read-only projection (R-14/R-21); Pi SDK/JSONL event stream. | Rehydrate from owned records; show unknown usage as unknown. Add controls only with authenticated, audited action paths. |

### What each target actually contributes

* **Claude Code:** permission precedence, distinguish instructions from enforced rules,
  pre/post/stop hooks, and a practical split between short-lived subagents and
  costly peer teams. Teams' documentation explicitly notes **no in-process
  teammate resume**, lagging task status and shared-file conflicts — do not
  treat its team UI as a recovery design. [Permissions](https://code.claude.com/docs/en/permissions),
  [hooks](https://code.claude.com/docs/en/hooks), [teams](https://code.claude.com/docs/en/agent-teams).
* **OpenCode:** native Plan/Build and child sessions offer a useful role UX;
  plugin `tool.execute.before`/`after` and session events show an adapter
  pattern. R-07 established that plugin-disable and bus-only permission events
  preclude using its session DB as Loom's audit source. [Agents](https://opencode.ai/docs/agents/),
  [plugins](https://opencode.ai/docs/plugins/), [R-07](../04-phase0-findings.md).
* **OMP:** integrate typed agent output and a visible subagent roster rather
  than adopting 31 tools or its Rust core. Its docs specify `task.maxRecursionDepth`
  default 2, spawn-policy checks, and schema precedence; [Agent Hub](https://github.com/can1357/oh-my-pi/blob/main/docs/agent-hub.md)
  is the later UI reference. Its [advisor](https://github.com/can1357/oh-my-pi/blob/main/docs/advisor-watchdog.md)
  can provide concerns/blockers but explicitly does **not** authorize
  effects: review is evidence, not policy.
* **Hermes:** compact memory and `session_search` demonstrate *small always-on,
  large on-demand* context. `memory.write_approval` stages writes in headless
  contexts, and its security guide defaults unattended dangerous commands to
  deny. Reuse the patterns for R-24, not the files or self-editing skill loop
  as a source of policy. [Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory),
  [security](https://hermes-agent.nousresearch.com/docs/user-guide/security).
* **DeepSeek Harness:** the strongest design reference for a *durable*
  model-visible event log and a tool pipeline with immutable call identity,
  checked outputs, cancellation and monotonic final guards. Its experimental
  team mailbox commits messages before delivery and deduplicates by ID;
  tasks use revisions and an acyclic dependency graph. These are patterns to
  implement in Loom's much smaller SQLite ownership boundary, not reasons to
  introduce Cordis, hot-reloaded composition, or DSH's own agent loop.
  [Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md),
  [tools](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md),
  [teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md).
* **Codex:** independent OS sandbox and approval controls, inherited per-child
  sandbox policy, fail-closed noninteractive approval, and optional per-agent
  model/effort. These belong in Loom's launcher, policy and spawn validation,
  not Pi prompt text. [Security](https://developers.openai.com/codex/agent-approvals-security),
  [subagents](https://developers.openai.com/codex/agent-configuration/subagents).

## Adoption queue against the existing build plan

The ordering below *refines* [T-01–T-19](07-loom-v01-mapping.md), it does not
add six new subsystems to milestone 1.

| Rank | Borrow / implementation seam | Existing ticket | Proof required before calling it adopted |
| --- | --- | --- | --- |
| **P0** | Monotonic deny + durable attempt/verdict/outcome per mutation. Pi pre-tool hook asks Loom; checks kill/owner+epoch in the same DB transaction before Loom-owned commits. | T-01–T-03, T-05, T-08 | Denied, killed, expired and stale owners cannot finalize; `tool_call` throws or times out → fail closed; crash leaves an inspectable attempt, never a false success. |
| **P0** | OS isolation separate from approvals; run Pi and third-party extensions with least filesystem/network/credential access. | T-08, T-15 | A child process and an extension attempting an out-of-workspace or disallowed network effect both fail, not just a direct Pi `write` call. |
| **P0** | Fresh verification as a state gate, typed result via Pi tool schema. | T-11, T-14 | A prose “done” with missing/old `itp-verify` evidence does not complete a task; malformed result is rejected. |
| **P1** | Small hash-pinned context references + retrieval on demand; approvals for shared-memory promotion. | T-09, T-13 | Compaction/resume retain a critical decision from Loom state; injected hostile text does not update policy or shared KB. |
| **P1** | Multi-agent DAG and typed handoffs, CAS task claims, fenced workspace writes; start with read-only children. | T-12 | Two children cannot both claim the same revision or finalize competing writes; abort/restart yields a correct resume point and no orphan owner. |
| **P2** | Read-only agent roster + usage/trace drill-down; optional reviewer/advisor experiment. | T-17, T-16 | Restart rebuilds child status/usage without guesswork; reviewer never approves a tool or wakes an interrupted run unexpectedly. |
| **P2** | Specialized IDE/LSP/debugger, OMP-style hash-anchored edits or heuristic advisor; evaluate before adopting. | After T-14 and R-26 baseline | Fixed tasks show a meaningful benefit, no policy bypass through alternative write paths. |

### Non-adoption decisions

Do not fork Pi, import OMP's Rust tooling, replace the Pi loop with
DeepSeek/Cordis, or run two authoritative session/task databases. No default
always-on reviewer, auto-generated shared skills, web dashboard or agent
teams in v0.1: each adds cost, concurrency or another mutation path without
solving the first fenced workspace write. Pi already implements conversation
branches, tool calls and compaction; Loom reuses them and stores only its
own execution facts. [Pi extension storage guidance](https://pi.dev/docs/latest/extensions#state-management),
[mapping](07-loom-v01-mapping.md).

### Unknowns to resolve with a Pi integration spike (before security claims)

1. Pi `tool_call` and `user_bash` hook ordering and timeout behavior under
   exception, crash, nested `ctx.executeTool`, parallel sibling calls, and
   live reload. The [extension docs](https://pi.dev/docs/latest/extensions)
   guarantee hook-level blocking; they do **not** guarantee OS containment.
2. Whether every side-effect channel used by Loom (including extensions'
   own filesystem/process access, MCP child processes and out-of-band shell)
   is inside the chosen OS sandbox. Direct Pi invocation outside Loom is a
   separate process and cannot be made safe by a Pi extension alone.
3. How a killed Pi process maps its final tool result/usage and session
   transcript to Loom's pending action without inventing completion. Use
   unique action IDs and reconcile at boot; do not infer success from a
   model's last message or an absent post-hook.

Recheck competitor mechanics under R-29 if they become implementation
dependencies; this comparison recommends *principles and testable seams*,
not copying unverified performance claims or unstable experimental APIs.
