# Harness Engineering — Research

Status: research synthesis, not a design decision. Precedes and informs Loom's
milestone-1 design (session ledger, mutation leases, append-only audit).
Framework baseline: I2P `1d66588` (v2.1.0); see `FRAMEWORK_REF`.

Method: claims traced to primary sources (official docs, repos, specs, papers).
`[UNVERIFIED]` marks claims no primary source was found for in this pass —
treat as synthesis, not fact. URLs verified at time of writing (2026-09).

## 1. What "harness" means

### 1.1 Test harness (origin of the term)

- ISTQB Glossary (current): a test harness is "a collection of drivers and
  test doubles needed to execute a test suite."
  (https://glossary.istqb.org/en_US/term/test-harness)
- Older ISTQB wording called it "a test environment comprised of stubs and
  drivers"; v3.5 release notes record removing "a test environment" because "a
  test harness is just a part thereof."
  (https://api.glossary.istqb.org/storage/help/PuJiem2U5UnGT3cnkXeWy3BpyvWiQwtC3pKRkXFr.pdf)
- ISTQB distinguishes the larger tool: a test automation framework "usually
  includes a test harness and test libraries" — the harness is a *part* of a
  framework, not a synonym.
  (https://istqb-glossary.page/test-automation-framework)
- xUnit history: Kent Beck built the first unit-test framework in Smalltalk
  for rapid edit-test cycles; each team rebuilt it in hours ("seedwork").
  JUnit (Beck + Gamma, 1997, written en route to OOPSLA) spread the pattern;
  JUnit self-defines as "a simple framework to write repeatable tests."
  (https://martinfowler.com/bliki/Xunit.html; https://junit.org/junit4)
- JUnit separates the *runner* (executes tests, notifies listeners; custom
  runners via `@RunWith`, console via JUnitCore) from the assertion
  framework.
  (https://junit.org/junit4/javadoc/4.13/org/junit/runner/Runner.html;
  https://github.com/junit-team/junit4/wiki/test-runners)
- NUnit documents three layers: Test Runner (console/GUI/IDE) / Test Engine
  (core API to locate, load, run tests) / Framework (asserts, attributes
  referenced by user tests). The Engine is "the foundation of any test
  runner."
  (https://docs.nunit.org/articles/nunit/technical-notes/nunit-internals/Architectural-Overview.html;
  https://docs.nunit.org/articles/nunit-engine/Index.html)
- Clearest harness-vs-framework contrast (Oracle JavaTest docs): "JUnit is a
  simple framework… few facilities for GUI interaction or reporting," while
  the JavaTest *harness* "provides a robust GUI interface, many reporting
  options, and… configuration system." Framework = writing/running tests
  simply; harness = the controlled execution and reporting environment.
  (https://docs.oracle.com/javacomponents/javatest-4-6/architect-guide/html/junit.htm)

Working distinction (synthesis): framework = rules for *writing* tests;
runner = executes once and reports; harness = scaffolding that executes
*under controlled conditions* (engine + runners + stubs/drivers + data +
reporting). `[UNVERIFIED]` as a single canonical quote — no primary prints
that exact sentence.

### 1.2 Agent harness (2024–2026 convergence)

- Anthropic (Dec 2024, "Building effective agents") does **not** use the word
  "harness." It defines workflows ("LLMs and tools orchestrated through
  predefined code paths") vs agents ("LLMs dynamically direct their own
  processes and tool usage"), catalogs five workflow patterns (prompt
  chaining, routing, parallelization, orchestrator-workers,
  evaluator-optimizer), and prescribes simplicity, transparency, and careful
  agent-computer-interface design. This essay is the pre-harness pattern
  catalog.
  (https://www.anthropic.com/engineering/building-effective-agents)
- Anthropic (Nov 2025, "Effective harnesses for long-running agents") *does*
  define the term: the Claude Agent SDK is "a general-purpose agent harness";
  the documented solution pairs an initializer agent (writes init.sh,
  requirements JSON, progress file, initial commit) with a coding agent (one
  feature at a time, commit + progress update, browser verification) to fix
  one-shotting, premature "done," and undocumented half-implemented state.
  (https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Claude Agent SDK loop: prompt + system prompt + tool defs + history →
  model responds with text/tool calls → SDK executes tools → results feed
  back; loop ends when output has no tool calls. Client SDK = you own the
  loop; Agent SDK = Claude drives tools autonomously (permissions, sessions,
  hooks, subagents, MCP).
  (https://code.claude.com/docs/en/agent-sdk/agent-loop;
  https://docs.claude.com/en/agent-sdk/overview)
- OpenAI's crispest definition: "The harness is the control plane around the
  model: it owns the agent loop, model calls, tool routing, handoffs,
  approvals, tracing, recovery, and run state. Compute is the sandbox
  execution plane." Sensitive control-plane work stays in trusted infra.
  (https://platform.openai.com/docs/guides/agents/sandboxes)
- OpenAI Agents SDK: `Runner` owns turns, tool execution, guardrails,
  handoffs, sessions; "If you want to own that loop yourself, use Responses
  API directly." `Runner.run()` loop: final output → stop; handoff → switch
  agent; tool calls → execute + rerun; `max_turns` → `MaxTurnsExceeded`.
  (https://openai.github.io/openai-agents-python/;
  https://openai.github.io/openai-agents-python/running_agents/)
- OpenAI Codex: "the open-source Codex harness… manages conversation state,
  stream execution, use tools, enforce configured sandbox and approval
  policies, and carry work across turns." Harness improvements (retained
  reasoning + compaction) moved an ARC-AGI-3 score 13.3% → 38.3% at 6×
  fewer tokens.
  (https://developers.openai.com/blog/codex-as-a-platform)
- LangChain's formula: "An agent is a model calling tools in a loop… A
  harness is everything around that loop: the prompt, the tools, and any
  middleware… Agent = Model + Harness. The job of a harness: get the model
  the right context at the right time." Middleware (before/after model,
  before/after tool, startup/teardown) is the customization primitive;
  "policies don't belong in a prompt."
  (https://docs.langchain.com/oss/python/langchain/agents;
  https://www.langchain.com/blog/how-to-build-a-custom-agent-harness)
- LangChain product taxonomy: Runtime (durable execution, streaming, HITL,
  persistence — LangGraph/Temporal/Inngest) vs Framework (abstractions,
  integrations) vs Harness (predefined tools, prompts, subagents — Deep
  Agents, Claude Agent SDK, Manus).
  (https://docs.langchain.com/oss/python/concepts/products)
- Microsoft Agent Framework: "An agent harness… is the runtime scaffolding
  that turns a language model into an agent… drives model and tool calls,
  manages conversation state and context, applies approval policies." Offers
  an opinionated `HarnessAgent` (planning/todos, compaction, file memory,
  approvals, observability) as successor to AutoGen (maintenance mode).
  (https://learn.microsoft.com/en-us/agent-framework/concepts/harness;
  https://learn.microsoft.com/en-us/agent-framework/overview)

Converged definition: a harness is the control plane / "everything around
the loop" / "runtime scaffolding" that turns a bare model + tool loop into a
working long-running agent. Four vendors, same shape.

### 1.3 Harness vs framework vs runtime vs orchestrator

| Layer        | Owns                                              | Example                                      |
|--------------|---------------------------------------------------|----------------------------------------------|
| Framework    | Abstractions for *writing* agents/skills          | LangChain, JUnit, I2P skill contracts        |
| Runner       | Executes once, reports                            | JUnitCore, OpenAI `Runner` turn loop         |
| Runtime      | Durable execution, persistence, resume, scaling   | LangGraph + checkpointer, Temporal           |
| Harness      | Context, tools, memory, approvals, recovery       | Claude Agent SDK, OpenAI sandbox harness     |
| Orchestrator | What runs where/when across actors                | Anthropic orchestrator-workers, K8s control  |

Mnemonic: framework helps you *write* it, runner *executes* it once,
runtime *keeps* execution alive, harness *surrounds* the loop, orchestrator
*coordinates* many actors. (Synthesis; instances sourced above.)

Loom's position: an **enforcement harness** — it does not write skills
(framework's job) and does not run the model loop (runtime's job); it
mechanically enforces contracts (leases, audit, sandbox, kill switches) that
today exist only as prose. The phrase "enforcement harness" itself is
`[UNVERIFIED]` — no fetched primary uses it; it is Loom's proposed category.

## 2. Enforcement precedents (primary sources)

### 2.1 Reconciliation loops (Borg/Omega/Kubernetes)

- Burns et al.: the shared pattern is the reconciliation controller loop —
  compare desired vs observed state and act to converge; robust to restarts
  because action is observation-based.
  (http://queue.acm.org/detail.cfm?id=2898444)
- Kubernetes "picks a middle ground… while enforcing system-wide invariants,
  policies, and data transformations… by forcing all store accesses through
  a centralized API server that hides store details and provides validation,
  defaulting, and versioning."
  (http://queue.acm.org/detail.cfm?id=2898444)
- `ValidatingAdmissionPolicy` (GA v1.30): declarative in-process admission
  using CEL, accept-or-reject without mutation, `failurePolicy: Ignore|Fail`.
  (https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/)
- OPA pattern: *decouple decision from enforcement* — service queries OPA
  with JSON input, OPA returns allow/deny, the service enforces. Applies to
  microservices, K8s admission, CI/CD, gateways. Deployed as a K8s admission
  controller it enforces policy "without recompiling or reconfiguring the
  API server."
  (https://www.openpolicyagent.org/docs;
  https://www.openpolicyagent.org/docs/kubernetes)

Loom parallel: SPEC's fail-closed rules (deny on missing skill, pin, input,
approval) are admission-policy semantics; the framework/harness split
(decision in skills, enforcement in Loom) mirrors OPA's split.

### 2.2 Leases and fencing

- Fencing token = monotonically increasing number issued per lock
  acquisition; the resource must reject writes with older tokens — safe only
  if the lock service guarantees monotonicity. Stale-holder hazard (GC
  pause → lease expires → second holder) is the motivating failure.
  (https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)
- Enforcement belongs at the *resource* (atomic compare-token-and-write,
  e.g. ZooKeeper zxid), not at the lock. Redlock has no fencing facility.
  For efficiency-only locks, single-node conditional set-if-not-exists +
  atomic delete-if-value-matches, documented "not for correctness."
  (https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)
- Chubby model: coarse advisory locks + metadata store, Paxos-elected
  master with second-scale leases; locks need sequencers (fencing
  equivalent) to protect external resources.
  (https://www.usenix.org/event/osdi06/tech/full_papers/burrows/burrows_html/index.html)
- No fetched primary ties "leases" to an agent/test harness — every agent
  runtime surveyed stores sessions, none names a lease primitive.
  `[UNVERIFIED]` as industry-standard harness terminology; Loom must define
  it. Closest code found: OpenCode's per-file `TxReentrantLock`
  (`packages/opencode/src/storage/storage.ts`) and OpenAI's per-file
  `threading.RLock` (`src/agents/memory/sqlite_session.py`) — concurrency
  locks, not leases.

Loom implication (already scaffolded): workspace-wide row, epoch increments
on post-expiry acquire, same-owner renewal keeps epoch, stale owner+epoch
cannot release. Matches Kleppmann's fencing shape with SQLite as the lock
service.

### 2.3 SQLite as the lock/state service

- `BEGIN IMMEDIATE` acquires the RESERVED lock at BEGIN; a second writer
  gets `SQLITE_BUSY`; readers proceed. Default `BEGIN DEFERRED` takes no
  lock until first access — writers must use IMMEDIATE to avoid deadlocks.
  (https://sqlite.org/lang_transaction.html)
- Compare-and-swap acquire = one atomic `INSERT … ON CONFLICT DO
  NOTHING/UPDATE` on a UNIQUE/PRIMARY KEY; UPSERT fires only on uniqueness
  violations, needs SQLite ≥ 3.24.
  (https://sqlite.org/lang_upsert.html)
- WAL mode: writers append to `-wal` without blocking readers; single
  writer; checkpoint moves frames back. `PRAGMA journal_mode=WAL;` persists
  across opens; all processes must share the host (no NFS).
  (https://sqlite.org/wal.html)
- Atomic outbox = business row + outbox INSERT in one `BEGIN IMMEDIATE …
  COMMIT`; a relay tails the table. No sqlite.org "outbox" page — the
  pattern composes transactions + triggers + WAL. Precedent discipline
  (Debezium): outbox tables are INSERT-only, updates disallowed.
  (https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html)
- Bun surface used by Loom: `new Database(path|:memory:)`,
  `db.query()` (prepare + cache), `.get()/.all()/.run()`,
  `db.transaction(fn)` (BEGIN on entry, COMMIT on return, ROLLBACK on
  throw; nesting = SAVEPOINTs).
  (https://bun.sh/docs/runtime/sqlite)

### 2.4 Append-only audit

- Rekor: immutable tamper-resistant ledger; entries cannot be modified once
  added; tree head periodically signed; consistency monitoring verifies the
  log stays append-only.
  (https://github.com/sigstore/rekor;
  https://docs.sigstore.dev/logging/overview/)
- Certificate Transparency: a single ever-growing append-only Merkle tree;
  consistency proofs show the new version is a superset without auditing
  the whole tree; misbehavior (unmerged entries, split views) is publicly
  detectable. (https://datatracker.ietf.org/doc/html/rfc6962.html)
- SQLite enforcement options: `BEFORE UPDATE/DELETE … RAISE(ABORT)` trigger
  per row (`RAISE(IGNORE)` abandons the statement); no GRANT-based
  `REVOKE UPDATE/DELETE` exists — denial needs `sqlite3_set_authorizer()`
  (per-connection, prepare-time `SQLITE_DENY`) or triggers + file controls.
  No native WORM table flag — "no UPDATE/DELETE" is emulated.
  (https://www.sqlite.org/lang_createtrigger.html;
  https://sqlite.org/c3ref/set_authorizer.html;
  https://www.sqlite.org/draft/security.html)
- "Append-only audit log" as a named harness primitive is `[UNVERIFIED]` —
  OPA "generates comprehensive audit trails" and agent runtimes emit traces
  (LangSmith/OpenTelemetry), but no standard names the ledger requirement.
  Anthropic's Compliance API (session transcripts, 6-year retention) is the
  closest managed precedent.
  (https://platform.claude.com/docs/en/manage-claude/compliance-sessions)
- Counter-example to avoid: Anthropic's long-running harness enforces test
  discipline via "strongly-worded instructions" and JSON `passes` flags —
  obedience, not a gate. Loom's audit must be mechanical (trigger-backed
  append-only + recorded decision/outcome), not prompt-based.
  (https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

### 2.5 Crash recovery and resume

- WAL gives atomic commit via appended frames with commit markers; readers
  see a stable snapshot ("end mark"); checkpoints transfer frames back but
  cannot pass an active reader — long readers cause WAL growth. Resume =
  WAL durability + checkpoint + replay from last applied index.
  (https://www.sqlite.org/wal.html)
- Stripe idempotency precedent: client sends `Idempotency-Key` (UUID, ≤255
  chars); server replays the first status+body on retry, errors on param
  mismatch, prunes keys after ≥24h; 4xx generally means mint a fresh key.
  (https://docs.stripe.com/api/idempotent_requests)
- Agent-runtime resume shapes: OpenAI `RunState` (model items, approvals,
  agent position) with freshness ordering live session > `RunState` >
  explicit state > fresh manifest; LangGraph thread-scoped checkpoints +
  `interrupt()` payloads (node re-runs on resume — side effects must be
  idempotent); OpenCode SQLite tables (`session/message/session_message/
  permission`) + blob JSON + file snapshots.
  (https://developers.openai.com/api/docs/guides/agents/sandboxes;
  https://docs.langchain.com/oss/python/langgraph/persistence;
  https://github.com/sst/opencode/blob/47f33329/packages/opencode/src/session/session.sql.ts)

Loom parallel: `transitions` table with monotonic `id` per `run_id` is the
LangGraph-checkpoint analogue; `recordTransition` + `getLastTransition`
already implement "locate the last committed transition without
conversation history."

### 2.6 Budgets, sandboxing, kill switches, scoping

- Deadlines: gRPC clients should always set them; servers enforce
  `DEADLINE_EXCEEDED`/`CANCELLED`; propagation avoids per-hop plumbing but
  absolute timestamps risk clock skew. Go `context`: parent cancel kills
  children; `CancelFunc` must be called or the child leaks.
  (https://grpc.io/blog/deadlines; https://grpc.io/docs/guides/deadlines/;
  https://pkg.go.dev/context)
- Retry budgets (Finagle): token-bucket cap on retries (~20% + ≥10/s
  reserve, 10s TTL deposits) to prevent retry storms; only safe failures
  retry; everything inside the overall timeout. Envoy: prefer retry budgets
  over static max-retries; exponential backoff.
  (https://finagle.github.io/blog/2016/02/08/retry-budgets;
  https://twitter.github.io/finagle/guide/Clients.html;
  https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/http/http_routing)
- Cost (token/$$) budgets have no RPC-framework primary source — Loom
  policy (counters + kill switch), not standards-derived. `[UNVERIFIED]`.
- Sandboxing: gVisor = userspace kernel intercepting syscalls (not a
  seccomp wrapper, not a VM); Firecracker = KVM microVMs (<125ms boot)
  with seccomp filters + `jailer`; Docker default seccomp denies ~44/300+
  syscalls; best practice drops `ALL` capabilities then adds back the
  minimum.
  (https://gvisor.dev/docs/;
  https://github.com/firecracker-microvm/firecracker/blob/main/README.md;
  https://docs.docker.com/engine/security/seccomp.md)
- Agent sandbox shapes: OpenAI manifest + pluggable clients
  (UnixLocal/Docker/E2B/Modal/…); Claude Code built-in Bash sandbox +
  `@anthropic-ai/sandbox-runtime`; Codex OS-enforced `workspace-write` +
  orthogonal approval policy; OpenCode's snapshot dir is a revert aid, not
  isolation. Note: OpenAI warns SDK approval is not a sandbox — isolation
  must be enforced, not assumed.
  (https://developers.openai.com/api/docs/guides/agents/sandboxes;
  https://code.claude.com/docs/en/sandboxing;
  https://learn.chatgpt.com/docs/agent-approvals-security.md)
- Kill switch: LaunchDarkly's = permanent boolean operational flag serving
  the off-variation without redeploy. No agent runtime surveyed exposes a
  single global kill API — closest are `max_turns`/`MaxTurnsExceeded`,
  cancellation tokens, approval pauses, admission deny. `[UNVERIFIED]` as a
  standard harness contract.
  (https://launchdarkly.com/docs/home/flags/killswitch;
  https://openai.github.io/openai-agents-python/running_agents/)
- Scoped permissions: capability model (unforgeable designation+permission
  tokens, least authority by passing only needed references) vs ACL
  identity checks. Managed precedents: Claude Code deny/ask rules enforced
  by the harness (prompts can't grant capability); Microsoft session-scoped
  file access failing closed to provider folders; OpenCode per-tool
  allow/deny/ask rulesets with `doom_loop` forcing `ask` after 3 identical
  calls.
  (https://pdos.csail.mit.edu/6.828/2004/readings/miller03paradigm.pdf;
  https://code.claude.com/docs/en/permissions;
  https://learn.microsoft.com/en-us/agent-framework/concepts/harness)

### 2.7 Approvals / human-in-the-loop (mechanical shapes)

- OpenAI SDK: `needs_approval` on tools/MCP; pause surfaces
  `ToolApprovalItem`; resume via `state.approve()/reject()` + `Runner.run`;
  sticky approvals survive serialization.
  (https://openai.github.io/openai-agents-python/human_in_the_loop/)
- LangGraph: `interrupt(value)` + resume `Command(resume=…)` on a thread;
  needs a checkpointer; static breakpoints not recommended for HITL.
  (https://docs.langchain.com/oss/python/langgraph/interrupts)
- AutoGen: `DefaultInterventionHandler.on_send` intercepting
  `FunctionCall`; AgentChat `UserProxyAgent` blocking (no mid-run save);
  `CodeExecutorAgent(approval_func=…)`.
  (https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/cookbook/tool-use-with-intervention.html)
- CrewAI: task `human_input=True` → `Pending Human Input` + webhook →
  `POST /resume`; Flows `@human_feedback` with async pending state and
  optional lesson-learning.
  (https://docs.crewai.com/en/learn/human-in-the-loop)

Common shape: pause with a durable token → external decision → resume with
the decision recorded. Loom's audit row (requested / allowed-or-denied /
completed-or-failed) is exactly this token.

## 3. The framework Loom enforces (I2P evidence)

All paths relative to `/home/zeref/Dev/I2P` at `1d66588`.

### 3.1 Readiness gate (§25) and harness division (§27)

`SKILL-FRAMEWORK.md` §§25–27 (ll.1479–1538):

- "Do not move to the custom harness merely because the skills can run."
  Ready only when all hold: §25.1 root routes common tasks; §25.2 adapters
  work in isolation; §25.3 child-skill selection is consistent; §25.4
  specialist triggers understandable; §25.5 user-entry skills never invoked
  recursively; §25.6 missing dependencies produce clear handoffs; §25.7
  debug/TDD loops terminate; §25.8 review failures route back cleanly;
  §25.9 verification blocks unsupported completion claims; §25.10 golden
  tasks repeatable; §25.11 artifacts resume a fresh session; §25.12 no
  unexplained dependency cycles; §25.13 skill IDs/contracts stable enough
  to encode.
- "At that point, CUSTOM-HARNESS.md becomes an enforcement and scaling
  layer instead of an experiment."
- §27: the framework "deliberately does not define how any of it gets
  mechanically enforced"; "only once §25's readiness gate is met should
  work begin on the harness." Mapping: skill choice → resolve installed
  skill; stop rule → state/approval rule; recursion bound → depth/cycle
  breaker; pin intent → hash/lockfile check; artifact handoff → persistent
  store; human handoff → approval workflow; verification requirement →
  hard completion gate.

### 3.2 Candidate mechanisms (`CUSTOM-HARNESS.md`, inputs only)

Header: "Status: inputs only. The build order… is NOT started… Nothing
below is a commitment." Mined from `affaan-m/ECC@e482e57` (2026-09-24).

- Leases: TCAS-style `{session, branch, touched_paths, heartbeat, owner,
  epoch}` with transactional acquire/renew/release + overlap enforcement;
  bounded expiry with heartbeat-loss recovery; queue serialization for
  contenders; mutation needs an atomically acquired workspace-wide lease
  with final touched-path revalidation.
- State: SQLite as cross-process source of truth (session/output/risk);
  readers sync on a monotonic cursor; atomic transaction/outbox with
  reconciliation.
- Observability/risk: dashboard hydration at startup/recovery;
  worktree-aware scaffolding; multi-session output tracking; risk scoring
  with escalate/block.
- Budgets: hard timeout + retry budgets per run; `mean-retries-per-task`
  tracked with success rate.
- Audit: append-only log mandatory for high-risk actions; immutable
  deployment artifacts.
- Credentials/change: least-privilege, env-level secret injection (never in
  artifacts); harness-level rollout/rollback.
- Open (checklist only): per-session scoped permissions; global kill
  switch. Gaps with no ECC input: deployment authorization, sandbox
  orchestration, skill-contract enforcement mechanics (intended source:
  `dependency.md` + `skills.lock.json`, per `UPGRADES.md` U7).

### 3.3 Skill registry and artifacts

- `dependency.md` is the authoritative registry: 18 capabilities → approved
  skills; 23 upstream skills (`model` invocation; 21 `installed-global`,
  2 `vendored-pinned`); 11 conditional triggers (positive conditions only;
  ambiguity → `considered-not-triggered`); 14 user-entry skills never loaded
  recursively; bounds `depth 5 / repeat 2 / children 6`; missing child →
  `needs-human`; no runtime install/upgrade/substitution.
- `dependency.json` (`"generated_from": "dependency.md"`) is the machine
  projection; `skills.lock.json` pins each skill
  `{id, repo, commit, path, contentSha256}` (23 entries) — "the only place
  pinned commits are recorded."
- `skill_result`: `{skill, status: completed|changes-requested|pass|fail|
  blocked|needs-human, summary, artifacts[], evidence[] (commands + observed
  results), findings[] {severity, source, detail}, open_questions[],
  recommended_next[], handoff{}}`.
- `.itp/run.md`: `{run: {goal, scale, checkpoints, next_phase, completed[],
  artifacts{…}, loaded_skills[], open_questions[]}}`; `next_phase` is the
  fresh-session resume point. "The ledger is a coordination aid, not a
  production state database."
- Readiness verdict (`tests/skills/results/2026-09-27-readiness-gate.md`):
  **READY (conditional)** — ten bullets met, three bounded partials.
  Outstanding: repeat standard golden, repeat greenfield golden, one full
  grilling interview, and browser FAIL-07 (run in Playwright env or record
  permanently blocked).
- Adapter example (`itp-verify`): consumes diff + validation evidence +
  review verdict + acceptance criteria; missing input → `fail`, never
  `pass`. "Fresh evidence" = run the checks *now*, capture commands with
  observed output; pass only when every criterion has it.

## 4. Design implications for Loom milestone 1

Decided (scaffolded): Bun + strict TS; library + CLI; SQLite via
`bun:sqlite` (WAL); workspace-wide leases with epoch fencing; `bun:test` +
Biome + CI; `FRAMEWORK_REF` pin with fail-closed check.

Traceable to research:

1. Workspace-wide lease row + epoch = Kleppmann fencing with SQLite as the
   lock service (§2.2–2.3). Open question the research settles structurally:
   enforcement (epoch comparison) must live at the *resource write path*
   (`recordTransition` gated on lease), not just in `acquire`.
2. `transitions(run_id, id)` monotonic history = LangGraph-checkpoint
   analogue and the mechanical replacement for `.itp/run.md` as resume source,
   while the Markdown ledger stays the portable handoff (§2.5, §3.3).
3. Audit row `{action, decision, outcome}` = the pause-token shape every
   surveyed HITL system uses; append-only needs a `BEFORE UPDATE/DELETE …
   RAISE(ABORT)` trigger to be mechanical rather than conventional (§2.4,
   §2.7). Not yet scaffolded — first schema upgrade.
4. `BEGIN IMMEDIATE` + UPSERT acquire is the correct SQLite pattern for
   contention; `db.transaction()` gives BEGIN/COMMIT/ROLLBACK with
   SAVEPOINT nesting (§2.3).
5. Fail-closed pin check = admission-policy semantics (K8s/OPA, §2.1);
   `skills.lock.json` content hashes are the natural next check after the
   commit/version pin (§3.3).

Open (need design before coding): path-scoped vs workspace leases (ECC
wants touched-path revalidation; scaffold chose workspace-wide per user
decision); high-risk action taxonomy + authorizers; trigger-backed
append-only; outbox/relay for unapplied side effects; budgets; sandbox
orchestration; kill-switch semantics; deployment authorization. Each has a
precedent in §2 but no turnkey standard — Loom defines the contract, then
enforces it mechanically.

## 5. Gaps and further research

- "Enforcement harness," "mutation lease," "append-only audit," and "kill
  switch" as harness primitives: no industry-standard definitions found;
  Loom's definitions will be original. Do not cite the precedents above as
  if they standardize these terms.
- Chubby/etcd-session and GFS-lease sources not yet mined for lease-API
  precedent; worth one pass before finalizing lease semantics.
- `bun:sqlite` authorizer/trigger support surface unverified — confirm
  `sqlite3_set_authorizer` accessibility and trigger behavior under Bun
  before relying on them for append-only.
- Monthly `upstream-check` re-pin/drift paths never fired live (readiness
  report) — the pin-check design should cover drift detection, not just
  startup comparison.
- Secondary-only items (harness etymology, BSTQB wording, 2023
  BabyAGI/AutoGPT loop details, OpenCode sandbox absence) need primary
  confirmation before being cited elsewhere.
