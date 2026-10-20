# Loom — harness base spec (draft)

## Purpose

Loom is a separate runtime for mechanically enforcing the
[idea-to-production framework](../I2P/README.md). The framework owns *what* skills do and
how they compose; Loom owns execution state and enforceable safety boundaries. This draft
records design decisions and required behavior, not implemented production guarantees.

Delivery sequencing, staffing assumptions, release scope and evidence gates are
in [ROADMAP.md](ROADMAP.md). Its first production release precedes the planned
second-runtime continuation; milestone 4 is not complete until both are qualified.
The roadmap does not waive this spec's safety boundaries or authorize a build.

Development procedure: [AGENTS.md](AGENTS.md). Critical rationale:
[decisions.md](decisions.md). Before application or test code for a new phase,
feature or refactor, update the [active phase specification](#active-phase-specification)
with all seven sections below. `SPEC.md` is the canonical repository spelling;
do not create a separate case-only `spec.md` file.

## Source of truth and readiness

- Framework baseline for this draft: `/home/zeref/Dev/I2P` at commit
  `4fe0869ae41b0d81cbe3c6bc643f10ff2049ceed`, version `2.1.0`
  (re-pinned from `1d66588` at gate closure; the delta is evidence-only —
  README status, FAIL-07 result line, five result files — no contract,
  registry, or lockfile changes). Refer to `SKILL-FRAMEWORK.md` §§25, 27
  and `CUSTOM-HARNESS.md` there.
- The framework's `dependency.md` is the authoritative skill registry;
  `dependency.json` is its generated machine-readable form, and `skills.lock.json` pins
  upstream content. Adapter contracts live in each `itp-*/SKILL.md`. Result and run-ledger
  shapes are documented in `.agents/skills/idea-to-production/references/artifacts.md`.
- The §25 readiness gate is **MET** (closed 2026-10-01; all four conditions
  met by run, none waived: standard golden repeat, greenfield golden
  repeat, full grilling interview, FAIL-07 negative + positive paths).
  Judgment: `tests/skills/results/2026-10-01-readiness-gate-closed.md`;
  evidence: `2026-10-01-golden-repeat.md`, `-greenfield-repeat.md`,
  `-grilling.md`, `-fail07.md` in the framework repo. Enforcement code is
  permitted as of this closure.
- Loom consumes a *specific framework revision*; it does not edit, reimplement, install,
  or silently substitute framework skills.

## Runtime architecture and security boundary (2026-10-20 decision)

**Build Loom over upstream Pi, not a fork.** Use Pi's SDK and extensions for
agent execution; keep Loom's authoritative state, policy and verification
outside the Pi execution environment. Pi owns conversations and sessions;
Loom owns task/workflow state, grants, leases, audit and completion.
Hooks provide early rejection, feedback and telemetry, not the sole safety
boundary. Reconsider a fork only for a demonstrated missing contract that
cannot be satisfied by owned operations, disabling a channel or an upstream
change; more hooks would not sandbox malicious same-process code.

The release-specific [API review](research/pi/10-pi-1.3.0-api-review.md) and
[execution audit](research/pi/11-pi-1.3.0-execution-coverage.md) verified Pi
`1.3.0` at `71023aec1546d6d677a65669c5665c0927ce0dd0`. Ordinary model/nested/
registered MCP tools share a gateway, but SDK Bash, extension execution,
startup and model-call paths do not all traverse it. Input can change after
validation; redaction and settlement exceptions can fail open; cancellation
can leave descendants or delayed effects running. Offline component probes
are evidence of those limits, not end-to-end Loom safety proof. The old
`0.99.2` research baseline is unchanged; runtime promotion remains separate.

Required boundaries:

1. **Isolated execution.** Run the entire Pi process, executable extensions
   and descendants inside a restricted OS/container/VM execution domain,
   including startup/reload. Keep the Loom DB, authoritative project state,
   protected host paths and production/provider credentials outside it;
   mediate provider access through an approved credential/egress boundary.
   Raw shell works only in a restricted disposable workspace. Do not reuse
   a writable workspace for a successor until the old execution domain can
   no longer write; candidate output is promoted only through Loom gates.
2. **Owned privileged operations.** Protected writes, merges, deployment
   and other privileged effects go through narrow Loom-controlled operations.
   Bind requests to supervisor-established run/thread identity; validate the
   final payload/target after rewrites and recheck kill, deadline, grant,
   policy and owner/epoch at the write/dispatch boundary. An earlier hook
   approval is not transferable to changed input. Serialize local writes
   with kill/lease state; a SQLite transaction cannot atomically cancel a
   remote request. Never wait for network I/O while holding its write lock.
3. **Independent completion.** Only Loom can mark a task complete, using
   fresh trusted verification tied to the exact candidate artifact hash
   and reconciled privileged work. Pi prose, a resolved `prompt()`,
   `agent_settled` or a terminating tool result is not verification. Missing,
   failed, throwing, cancelled or timed-out verification leaves the task
   unverified/failed, never successfully complete.
4. **Fail-closed output handling.** Owned output paths sanitize or withhold
   content before exposure or persistence, including partial streams,
   structured results, error details and spill files. A sanitizer failure
   returns a safe error, not the raw result. A `tool_result` hook alone is
   insufficient; secrets must not enter the execution domain unnecessarily.
5. **Explicit startup and channels.** Use owned settings/loaders and only
   trusted, reviewed executable components; disable ambient autoload,
   uncontrolled MCP servers, codemode model calls and cache warming
   initially. Enable a channel only after its startup, authorization,
   cancellation, output and usage paths pass conformance. Disable unsupported
   UI/RPC/SDK Bash routes or confine them to the same execution boundary.
6. **Honest cancellation.** Kill closes future admission/dispatch, revokes
   leases and triggers external execution-domain cleanup. Runtime ACKs or
   idle state do not prove descendants stopped. Already-dispatched external
   actions may still finish: record unresolved outcomes, reconcile target
   state and do not replay blindly. Idempotent replay requires a real
   effect-side deduplication contract; cancellation is not rollback.

No untrusted execution or production authority is enabled before these
boundaries are tested. Sandboxing is therefore an adapter prerequisite,
not optional hardening after unrestricted execution has shipped.

## First milestone: session ledger, leases, audit (+ kill switch)

The implementation language/runtime is **Bun**. A scaffold exists (`src/`
library + CLI on `bun:sqlite` in WAL mode, `bun:test` + Biome + CI):
workspace-wide leases with epoch fencing, a transition ledger, and audit
inserts. Milestone 1 hardens this scaffold into enforcement per the
research cited below; the scaffold's permissive paths (ungated writes,
conventional append-only) are replaced, not extended.

1. **Session ledger.** Persist run identity, phase, status, next/resume point, references to
   artifacts and evidence, and a monotonically ordered history of transitions so another
   process can recover after interruption. Resume is per `(run, thread)`;
   approval pauses mint no rows (open `running` row + audit pause record
   is the paused state). Evidence refs are `kind:locator` pointers with
   content hashes for files. Side effects go through an outbox relay
   (same-txn business+outbox write, cursor relay, idempotent replay).
   Recheck each dispatch, not just a batch; unknown outcomes require
   reconciliation before replay unless effect-side deduplication is proven.
   Treat `.itp/run.md` as a framework handoff artifact, not an authoritative
   concurrent database. Research: `research/phase-1/07-r12-pause-vs-turn.md`,
   `research/phase-1/08-r13-threads.md`, `research/phase-1/06-r11-audit-vocabularies.md`,
   `research/phase-0/04-phase0-findings.md` (R-06).
2. **Mutation leases.** Workspace-wide, single holder, TTL + heartbeat;
   epoch increments on post-expiry succession and the epoch is checked
   **at the write path** inside `BEGIN IMMEDIATE` (kill → deadline →
   grant → policy → lease order). Same-owner renewal keeps the epoch;
   stale owner+epoch can neither release nor finalize. Contention safety
   proven by experiment (8-process race → exactly one winner).
   Research: `research/phase-0/04-phase0-findings.md` (R-04/R-05/R-09),
   `research/phase-1/05-r10-crash-recovery.md`.
3. **Audit trail.** Append-only by trigger (`BEFORE UPDATE/DELETE …
   RAISE(ABORT)`; no authorizer exists on `bun:sqlite`), lifecycle as
   inserts: request → verdict → finish rows per `action_id`, current
   state = latest row. Decisions
   `pending|allowed|denied|escalated|expired`; outcomes
   `pending|completed|failed|interrupted|timeout|not-executed`;
   every row carries actor identity and tier. Retention is archival,
   never silent delete. Do not store secrets or raw
   credentials in artifacts or audit entries. Research:
   `research/phase-1/06-r11-audit-vocabularies.md` (schema v2 delta).
4. **Kill switch.** Global + per-run scopes, latched; engage revokes
   leases by epoch bump, freezes pending approvals as denied, halts the
   relay (one txn), then runtime signals/external containment. Deny only
   approvals whose actions have not dispatched; do not label an in-flight
   action `not-executed`. Preserve and reconcile its unresolved outcome.
   Human-only engage/reset; reset re-verifies first. Research:
   `research/phase-2/10-r17-kill-switch.md`.

## Subsequent milestones (from `research/pi/07-loom-v01-mapping.md`)

**Milestone 2 — Isolated Pi runtime adapter.** `loom-pi` extension for
early veto/feedback; owned privileged-operation and fail-closed output paths;
external supervisor controlling a sandboxed SDK runner (sessions,
all-channel usage ingestion, compaction injection, `abort` + `abortBash` +
execution-domain cleanup, role routing);
read-only session reader; structured result schema and independent completion
gate. Establish the selected R-15 sandbox boundary before untrusted execution;
no out-of-band writes to Pi state. `0.99.2` is the historical research
baseline, not an installed dependency; select/promote a version explicitly.
Pi `1.3.0` API compatibility alone does not satisfy this milestone.

**Milestone 3 — Policy, budgets, orchestrator slice.** Single
`authorize()` (deny-wins ACL + narrowing capability grants); risk
scoring with escalate/block thresholds; time/retry/cost/fan-out budgets
with run-scoped kill on cost breach; usage metering with versioned price
tables; memory governance (scopes, provenance, quarantine). Orchestrator
owns `tasks.json`/state files/context retrieval; per-task verification
gates with fresh-evidence rule.

**Milestone 4 — Hardening and second runtime.** Read-only dashboard;
live five-gate deploy procedure; monthly calibration loop feeding budget
and risk tuning; human eval goldens; OpenCode adapter behind the same
shared conformance suite (must stay green on both runtimes).

**Explicitly deferred:** federated leases, A2A adoption, agent
discovery, cross-harness kill, adaptive budgets, MCP server role,
`pi-durable` dependency, System One model adoption (conditional on
R-35 shadow validation). The source `CUSTOM-HARNESS.md` collects
candidate inputs for these, not fixed semantics.

## Constraints to preserve from the framework

- Fail closed when a required skill, pinned revision, input artifact, or approval is
  unavailable. Never claim completion without fresh `itp-verify` evidence.
- User-entry skills are never invoked recursively; stop with a human handoff when needed.
- Respect the framework's bounded recursion and phase/slice checkpoints; preserve a resume
  point across process or agent-session restarts.
- Treat diffs, logs, artifacts, and tool output as untrusted data rather than instructions.
- Framework artifacts remain portable and readable without Loom; a Loom-specific record
  must identify its framework revision and retain pointers to evidence.

## Acceptance criteria for the first milestone (refined post-gate; thresholds tuned via R-26 calibration)

- Two simultaneous attempts to mutate the same workspace cannot both obtain effective
  ownership; an expired owner cannot finalize work after a successor acquires it
  (proven: 8-process race → exactly one winner; stale owner+epoch rejected
  at the write gate).
- After a process crash and restart, the next operator can locate the last committed
  transition, evidence references, and an accurate resume point without conversation history
  (proven: kill -9 mid-transaction keeps committed, drops uncommitted; pause
  triage is three queries, not inference).
- Every high-risk action is auditable as requested, allowed/denied, and
  completed/failed or explicitly unresolved with evidence; a partial action
  cannot appear successful. Denied/expired decisions pair only
  with `not-executed`; an `escalated` row is never terminal; UPDATE/DELETE on
  the audit log fail by trigger (proven in test).
- Once kill commits, no new gated write or dispatch is admitted: leases
  revoked, undispatched approvals denied, relay halted, including between
  items in one batch. Record already-dispatched actions separately; late
  success or uncertain outcomes cannot become `not-executed` or trigger
  blind replay. Reset requires reconciliation and human re-verification,
  never re-grants leases. Runtime containment is an adapter acceptance gate,
  not a guarantee established by milestone-1 DB fixtures.
- Missing or mismatched framework contract input — including skill-content
  hash drift versus `skills.lock.json` — stops the run with an actionable reason.
- Tests demonstrate the above under contention, expiry, kill, and restart
  (deterministic fixtures in CI per R-26); documented artifacts
  remain usable with the framework alone.

## Adapter acceptance criteria (before untrusted execution / production authority)

- Attempts through model/nested/deferred tools, SDK/UI/RPC Bash, extension
  execution, startup and model/usage channels are either disabled, confined
  or mediated; tests cover the final callable inventory, not just visibility.
- Missing mandatory controls, a mutated approved payload or stale owner/epoch
  cannot authorize a privileged effect. The sandbox cannot access the Loom
  DB, protected host paths or production credentials directly.
- A throwing redactor exposes no raw content on final/partial/structured/
  spill paths; missing or throwing verification cannot complete a task.
- Cancellation tests include surviving descendants, unawaited host calls,
  post-abort spawn races and delayed remote completion. Prove local-domain
  cleanup; record/reconcile remote uncertainty rather than claiming undo.
- Run the permanent release-pinned conformance corpus, including real
  provider/MCP and sandbox integration for every enabled channel. The current
  offline API and 16 execution component probes do not close this gate.

## Decisions still open

- Sandbox backend/rung per deploy and its cleanup evidence; isolation of
  the whole execution domain from Loom authority is fixed, not optional.
- Concrete privileged-operation transport, effect-specific idempotency/
  reconciliation and output filtering mechanics, to prove in adapter tests.
- Budget defaults, risk weights/thresholds, and per-runbook policy tuning —
  starting values researched, final values come from R-26 calibration history.
- Dashboard shape and drill-down depth (read-only constraint is fixed).
- Multi-agent wire and federation (deferred until a remote-agent use case).
- System One model adoption (conditional on R-35 shadow validation; banned
  from authorization/completion paths until then).

Decided by research since the last revision: runtime integration order
(Pi adapter first, OpenCode second — `research/runtimes/23-opencode-vs-pi.md`);
lease scope, fencing, and persistence (workspace-wide, epoch fencing at the
write path, SQLite WAL — `research/phase-0/04-phase0-findings.md`);
high-risk taxonomy and audit retention (`research/phase-1/06-r11-audit-vocabularies.md`,
`research/phase-0/04-phase0-findings.md` R-03); pin + drift policy
(`research/phase-0/04-phase0-findings.md` R-08).

## Active phase specification

- **Work package:** governance bootstrap, 2026-10-21; not roadmap P0 execution.
- **Authority:** user requested adaptation of the engineering/support playbook.
- **Branch:** `chore/engineering-governance`, from clean `master` at `05d37d7`.
- **Status:** documentation verified; user authorized the task-scoped commit
  on 2026-10-21. No production phase signed off.
- **Next phase:** P0 remains unstarted; its specification and any material
  architecture choices need the applicable build/owner approval.

### 1. Phase Objective & Scope

Persist a usable production engineering SOP, dynamic phase specification and
critical decision log while preserving Loom's architecture and roadmap.
In scope: governance ownership, ordered verification, branches, upstream trust,
test-first triage, safe escalation and evidence-aware sign-off.
Out of scope: application/test implementation, dependency/scanner installation,
runtime/framework re-pinning, schema changes, P0 execution, publishing or deployment.

### 2. Environment & Upstream State

Observed 2026-10-21: Linux x86_64, Bun `1.4.3`, Node `26.7.0`, TypeScript
`5.9.3`, Biome `2.5.14`, existing `bun.lock`. These are observations, not newly
promoted support pins. `.env.example` is absent; no raw environment values read.
The scaffold's schema is owned by `src/store.ts`; no schema change in this task.
Framework selection stays in `FRAMEWORK_REF`; Pi SDK/Durable selection stays
open under the roadmap. No separate upstream SOP URL/ref is configured; this
change adapts the user-supplied playbook into reviewed repository governance.
No upstream code fetch is needed for this docs-only change. Neither `gitleaks`
nor `trufflehog` was found on PATH; record scanner coverage honestly.
Biome currently uses `rules.preset: "none"`; its configured checks passing is
not proof of a comprehensive static/security rule set. Tightening it is a
separate scoped implementation decision, not an unrequested edit here.

### 3. Architecture & File Manifest

| File | Operation / responsibility |
| --- | --- |
| `AGENTS.md` | Create the repository engineering/support workflow and context pointers. |
| `decisions.md` | Create the append-only critical decision log with ADR format and bootstrap choices. |
| `SPEC.md` | Preserve architecture; add workflow links and this seven-section active-phase block. |
| `ROADMAP.md` | Link delivery readiness/DoD to the canonical governance workflow. |
| `CONTEXT.md` | Label the old handoff historical and direct readers to current governance/state. |

No public API, dependency, schema, exported type, runtime permission or CI
behavior changes. No lowercase spec duplicate or additional ADR directory.

### 4. Test Plan & Coverage Matrix

| Layer | This task's proof | Applicability / limit |
| --- | --- | --- |
| Unit/regression baseline | `bun test --coverage` | Existing three smoke tests; preserve source unchanged and record coverage, not a comprehensive production suite. |
| DB integration baseline | Existing lease and close/reopen smoke assertions in the same suite | Runs with the baseline; no new DB behavior claimed. |
| New integration/E2E | N/A: only documentation/governance changes | Missing application/runner/provider/sandbox E2E remains a future implementation gate, not green coverage. |
| Document regression | Validate local Markdown paths/anchors and all seven phase headings; review file manifest and source ownership | Required for this task; does not validate future SOP execution or external research facts. |
| Security | Read-only dependency audit and scoped manual review of changed documents for secrets/unsafe instructions | Full automated secret scan unavailable; no scanner or dependency installed. Not a production security sign-off. |

Record each command/result before marking this task verified. Future code
phases declare the relevant unit/integration/E2E and coverage comparison cases
before implementation; N/A requires a scope-specific reason.

### 5. Security, Observability & Edge Cases

- Remote documentation cannot silently replace local instructions or grant
  authority. Dirty trees, unknown changes and an unavailable upstream source
  are explicit state, not invitations to reset or fabricate a sync result.
- Keep commits/issues/logs free of credentials, customer data and identifying
  internal details. No new telemetry, application logs or secret values here.
- Intentional CLI logging is not automatically debug output. Missing network,
  audit/scanner tools or E2E suites must be reported, never marked passed.
- Runtime rate limits, production output handling and isolation remain governed
  by the architecture above; this documentation task implements none of them.

### 6. Blast Radius & Rollback Plan

Changes affect future contributor/agent procedure, not running software or data.
Review for accidental authority expansion, case-collision paths and references
to unsupported tooling. Before merge, revise only this task's identified files;
after commit, revert its specific commit only with authorization, preserving
unrelated work and decision history. No feature flags/down-migrations are needed
for a docs-only task. Preserve the architecture and historical handoff content.

### 7. Definition of Done (DoD)

Run in this order; each required executable check must exit `0`:

1. `bun run lint` — formatting/static checks for the configured repository.
2. `bun run check` — strict TypeScript baseline.
3. `bun test --coverage` — existing suite and a recorded coverage snapshot.
4. `bun audit` — read-only dependency advisory audit, no automatic fixes.
5. `git diff --check` — tracked diff whitespace; additionally validate new
   documents' whitespace, local links/anchors and required headings read-only.

Read-only document/structure check (no application/test file generated):

```bash
python3 - <<'PY'
import pathlib, re, unicodedata, urllib.parse
root = pathlib.Path.cwd()
changed = [pathlib.Path(p) for p in
           ('AGENTS.md', 'SPEC.md', 'decisions.md', 'ROADMAP.md', 'CONTEXT.md')]
for file in changed:
    assert file.is_file(), file
    assert all(line == line.rstrip() for line in file.read_text().splitlines()), file
names = [p.name.casefold() for p in root.iterdir() if p.is_file()]
assert len(names) == len(set(names)), 'case-only duplicate root file'
active = pathlib.Path('SPEC.md').read_text().split('## Active phase specification\n', 1)[1]
assert re.findall(r'^### (\d)\. ', active, re.M) == list('1234567')
records = pathlib.Path('decisions.md').read_text()
ids = re.findall(r'^## \[(ADR-\d+)\]', records, re.M)
assert ids and len(ids) == len(set(ids)), 'duplicate/missing ADR IDs'
count = 0
for file in changed + list(pathlib.Path('research').rglob('*.md')):
    text = file.read_text()
    links = re.findall(r'\]\(([^)\s]+)\)', text)
    links += re.findall(r'^\[[^\]\n]+\]:\s*(\S+)', text, re.M)
    for link in links:
        parsed = urllib.parse.urlsplit(link)
        if parsed.scheme:
            continue
        target = ((file.parent / urllib.parse.unquote(parsed.path)).resolve()
                  if parsed.path else file.resolve())
        assert target.exists(), (file, link)
        if parsed.fragment and target.suffix == '.md' and target.is_relative_to(root):
            headings = re.findall(r'^#{1,6}\s+(.+?)\s*#*$', target.read_text(), re.M)
            slugs = []
            for heading in headings:
                heading = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', heading)
                slug = ''.join(c for c in heading.lower()
                               if c in '-_ ' or unicodedata.category(c)[0] in 'LN').replace(' ', '-')
                unique, n = slug, 0
                while unique in slugs:
                    n += 1
                    unique = f'{slug}-{n}'
                slugs.append(unique)
            assert urllib.parse.unquote(parsed.fragment) in slugs, (file, link)
        count += 1
print(f'PASS: {count} local links; seven phase sections; unique ADR IDs; whitespace/casing')
PY
```

Manual sign-off also requires matching file manifest, scope/secret review,
honest scanner/E2E limitations, relevant ADRs and explicit Git status. If a
required audit/check cannot run, record blocked—not successful. A docs-only
verification result does not advance P0 or close any production gate.

Verification record:

- [x] Lint; command/exit and warning scope recorded.
- [x] Strict typecheck.
- [x] Existing tests plus coverage snapshot; no application/test source changed.
- [x] Dependency audit and scoped manual secret/instruction review; scanner
  unavailable, not passed, as recorded below.
- [x] New/tracked whitespace, links/anchors and phase/ADR structure validated.
- [x] Five-file task diff reviewed on `chore/engineering-governance`; commit
  authorized by the user's explicit request. P0 not advanced.

Observed baseline results (2026-10-21, in prescribed order):

| Command / review | Result | Limit |
| --- | --- | --- |
| `bun run lint` | Exit 0; 10 files checked, no diagnostics | Existing configured rule set only. |
| `bun run check` | Exit 0 | Existing TypeScript compilation scope. |
| `bun test --coverage` | Exit 0; 3 pass / 0 fail, 12 assertions; 100% functions / 90.99% lines reported | Instrumented `src/framework.ts` and `src/store.ts`; not all repository code or E2E. This is a snapshot, not an enforced coverage threshold or pre/post comparison. |
| `bun audit` | Exit 0; no advisories found for 14 packages | Advisory snapshot; not secret scanning, runtime/provider certification or a full security audit. |
| Secret scanner | Unavailable (`gitleaks`/`trufflehog` not on PATH) | No automated secret-scan pass claimed; code/release phase requirements must be resolved before its closure. |
| Document/manifest review | Read-only validator passed: 178 local links, seven phase sections, unique ADR IDs and root casing/whitespace; `git diff --check` exit 0; five-file scope/manual secret/instruction review completed | Manual review is not an automated secret scan. |
| Application/config integrity | `git diff --exit-code -- src tests package.json bun.lock biome.json tsconfig.json .github` exited 0 | No application/test, dependency, compiler, linter or CI changes in this task. |
