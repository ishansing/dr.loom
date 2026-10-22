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

- **Work package:** P0 runtime comparison — crash, ownership and rollback evidence, 2026-10-22.
- **Authority:** user authorized starting P0 after PR #1 merged; confirmed existing
  TS repository, Linux/local evaluation and offline-only experiments.
- **Branch:** `chore/p0-runtime-recovery`, from committed first evidence `af998f2`.
- **Status:** P0 in progress; previous evidence committed at the user's request;
  recovery increment verified within the stated research limits; the user's
  subsequent request authorizes its task-scoped commit and next steps.
  No push or runtime promotion implied. G0 remains open;
  five-active-development-day comparison budget remains in force.
- **Next gate:** owner approval of the complete G0 evidence before P1. No paid
  calls, deployment, dependency promotion or phase advancement authorized here.

### 1. Phase Objective & Scope

Extend the shared offline evidence with real external SIGKILL checkpoints before
effect dispatch, after target mutation/before result commit and after terminal
commit. Compare Durable saved-task recovery with explicit SDK supervisor retry;
never attribute a new SDK prompt to automatic task replay. Revoke live policy,
change final payload and preserve/reconcile uncertain non-idempotent effects.
Exercise competing storage owners on synthetic stores and a standard-library
external ownership guard; test backup/migration/rollback on copies only.
Use reviewed synthetic code under the existing experimental bubblewrap boundary.
Out of scope: application code, Loom dependency installation/promotion, paid
calls, secrets, host configuration, production sandbox certification, framework
re-pin, P1, publishing or deployment. Experiment-only pinned dependencies may
be downloaded under `/tmp/opencode`, with lifecycle scripts disabled.

### 2. Environment & Upstream State

Observed 2026-10-22: Linux x86_64 (Omarchy), 16 logical CPUs, approximately
15 GiB RAM; Docker and bubblewrap on PATH, Podman absent. This is the development
host, not a qualified deployment or sandbox. Bun `1.4.3`, Node `26.7.0`; existing TypeScript
`5.9.3`, Biome `2.5.14`, existing `bun.lock`. These are observations, not newly
promoted support pins. `.env.example` is absent; no raw environment values read.
The scaffold's schema is owned by `src/store.ts`; no schema change in this task.
Framework selection stays in `FRAMEWORK_REF`; Pi SDK/Durable selection stays
open under the roadmap. No separate upstream SOP URL/ref is configured; this
change adapts the user-supplied playbook into reviewed repository governance.
Merged `master` was fetched read-only over HTTPS after verifying PR #1's merge.
Existing external `1.3.0` experiment installation and integrity evidence may be
reused if present and unchanged. Evaluate Durable `1.4.0` only in a separate
external installation for schema migration, not as a Loom upgrade. Revalidate
its published artifact and installed migration source before execution. Bubblewrap
`0.13.1` runs an empty unshared domain on this host. Docker reports seccomp and
cgroup namespaces but not rootless mode; do not escalate to daemon privileges.
Neither `gitleaks`
nor `trufflehog` was found on PATH; record scanner coverage honestly.
Biome currently uses `rules.preset: "none"`; its configured checks passing is
not proof of a comprehensive static/security rule set. Tightening it is a
separate scoped implementation decision, not an unrequested edit here.

### 3. Architecture & File Manifest

| File | Operation / responsibility |
| --- | --- |
| `SPEC.md` | Declare recovery increment and results. |
| `decisions.md` | Record recovery/retry and backup test strategy. |
| `research/pi/16-p0-crash-recovery.md` | Exact crash/ownership/migration evidence, recommendation limits and next owner. |
| `research/pi/probes/p0-runtime-recovery.mjs` | Runtime-specific start/recover/storage fixture modes; self-checking assertions. |
| `research/pi/probes/p0-recovery.py` | External checkpoint driver, synthetic authority/reconciliation, ownership and copy-only migration assertions. |
| `research/pi/probes/p0-sandbox.py` | Allow the additional reviewed probe file using the same mount/env boundary. |
| `research/phase-0/05-p0-support-profile.md` | Link recovery evidence without rewriting acceptance gates. |

No public API, dependency, schema, exported type, runtime permission or CI
behavior changes. No lowercase spec duplicate or additional ADR directory.

### 4. Test Plan & Coverage Matrix

| Layer | This task's proof | Applicability / limit |
| --- | --- | --- |
| Unit/regression baseline | `bun test --coverage` | Existing three smoke tests; preserve source unchanged and record coverage, not a comprehensive production suite. |
| DB integration baseline | Existing lease and close/reopen smoke assertions in the same suite | Runs with the baseline; no new DB behavior claimed. |
| Experiment integration | Real SIGKILL and persisted recovery scenarios on SDK/Durable under Node/Bun; ownership counterexample and external lock; copied SQLite upgrade and restore | Process crashes, not power/host loss; external synthetic authority is not Loom enforcement. |
| Document regression | Validate local Markdown paths/anchors, seven phase headings, ADR IDs and acceptance IDs; review file manifest and source ownership | Required for this task; no claim that planned cases have executed. |
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
  by the architecture above. The probe implements only synthetic contracts:
  it is not a reusable authority service or production sandbox backend.
- Clear runner environment; mount only runtime/dependencies read-only and
  synthetic workspace writable; unshare network/PID/IPC and close descriptors.
  No host home, Docker socket, raw env or Loom DB is exposed to the runner.
  A sandbox/precondition failure blocks launch rather than falling back.
- Establish the PID-namespace init pidfd via a native startup barrier before
  COMMAND executes; stop and confirm that identity's exit before workspace reuse.
  A runtime ACK, outer process exit or a heartbeat-only observation is insufficient.
- Deliberate dual-owner opens are counterexamples on disposable synthetic stores,
  never supported production behavior. Positive ownership tests deny the second
  owner before launch and release only after the first domain is confirmed dead.
- Preserve the source store and offline backup; migration and old-version
  rejection happen only on clones. No code rollback is called a DB downgrade.

### 6. Blast Radius & Rollback Plan

Changes affect P0 research/probes, not running Loom software or data.
Review for accidental authority expansion, case-collision paths and references
to unsupported tooling. Before merge, revise only this task's identified files;
after commit, revert its specific commit only with authorization, preserving
unrelated work and decision history. No feature flags/down-migrations are needed
for this experiment. Preserve evidence; no broad temporary-directory deletion.

### 7. Definition of Done (DoD)

Run in this order; each required executable check must exit `0`:

1. `bun run lint` — formatting/static checks for the configured repository.
2. `bun run check` — strict TypeScript baseline.
   Research syntax checks: `node --check research/pi/probes/p0-runtime-comparison.mjs`
   and `python3 -c 'from pathlib import Path; p = Path("research/pi/probes/p0-sandbox.py"); compile(p.read_text(), str(p), "exec")'`.
3. `bun test --coverage` — existing suite and a recorded coverage snapshot.
   Then run `python3 research/pi/probes/p0-sandbox.py --self-test` and both
   comparison paths with `node` and `bun` through the wrapper, using its
   documented external experiment directory. Each assertion must pass;
   missing dependencies/isolation mean blocked, not a substitute host launch.
   Recovery command: `python3 research/pi/probes/p0-recovery.py --experiment /tmp/opencode/loom-p0-comparison --upgrade-experiment /tmp/opencode/loom-p0-durable-140`;
   it runs both engines/runtimes and copy-only migration. Check recovery MJS
   with `node --check` and Python by in-memory `compile()` before test execution.
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
profile = pathlib.Path('research/phase-0/05-p0-support-profile.md').read_text()
assert all(line == line.rstrip() for line in profile.splitlines()), 'profile whitespace'
cases = re.findall(r'^\| (P0-A\d{2}) \|', profile, re.M)
assert len(cases) == 12 and len(set(cases)) == 12, 'missing/duplicate acceptance IDs'
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
required audit/check cannot run, record blocked—not successful. This research
experiment's verification does not close G0 or any production gate.

Verification record:

- [x] Lint, strict typecheck and research syntax checks.
- [x] Baseline coverage and four ordinary probe paths unchanged; 20 crash,
  four ownership and two migration/restore cases pass with namespace-exit checks.
- [x] Loom and both external tree audits; scanner unavailable, not passed.
- [x] Links, phase/ADR structure, whitespace and seven-file task diff reviewed.
- [x] G0 remains open; task-scoped commit explicitly authorized by the user's
  subsequent request; no required checks waived.

Baseline from governance (2026-10-21): lint/typecheck passed; 3 tests passed,
100% functions / 90.99% instrumented lines; audit found no advisories across
14 packages. Prior comparison verified/committed at `af998f2`; recovery results (2026-10-22):

| Command / review | Result | Limit |
| --- | --- | --- |
| `bun run lint` | Exit 0; 12 files | Existing configured rules only; Python syntax/self-check separate. |
| `bun run check` and research syntax checks | Exit 0; Node syntax and Python in-memory compilation passed | MJS/Python not claimed strictly typed. |
| `bun test --coverage` and experiment assertions | Exit 0; 3 tests, 100% functions / 90.99% instrumented lines unchanged; four ordinary paths, 20 crash scenarios, four ownership cases and two migration/restore cases passed | Process-crash and synthetic-authority evidence, not power loss or full Loom enforcement. |
| `bun audit` and external experiment dependency review | Exit 0 with no advisories across 14 Loom packages; external npm audits exit 0 with zero advisories in 121-/91-package trees; lock hashes unchanged; direct `1.4.0` tarball SHA-512 matched metadata | No full source/license/provenance review. |
| Secret scanner | Unavailable (`gitleaks`/`trufflehog` not on PATH) | No automated secret-scan pass claimed; code/release phase requirements must be resolved before its closure. |
| Document/manifest review | Validator exit 0: 204 local links, seven phase sections, 12 unique acceptance IDs and unique ADR IDs; new-file whitespace/optimization guards and `git diff --check` passed; seven-file scoped manual review completed | Manual review is not an automated secret scan. |
| Application/config integrity | `git diff --exit-code -- src tests package.json bun.lock biome.json tsconfig.json .github` exit 0 | No application/test, dependency, compiler, linter or CI changes. |
