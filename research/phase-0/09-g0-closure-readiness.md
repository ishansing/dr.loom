# G0 closure preparation — 2026-10-22

**Status: G0 ACCEPTED / CLOSED by owner, 2026-10-23 (“G0 accepted”).**
Preparation baseline: `dbbc576`; reviewed overlay identity and owner-relayed
Ishan approval are in `research/reviews/2026-10-22-g0-follow-up.md`. Original report:
`research/reviews/2026-10-22-g0-fc0e05e.md`. Approval metadata added later does not
change those reviewed snapshots or expand their approval scope. P1 is not started.

## Decisions now established

- ADR-005–009 retain upstream SDK 1.4.0, framework 2.1.0, rootless Docker,
  trusted local operator/narrow runner channel and authoritative WAL/FULL.
- R-001: use accepted ADR-008's **one-hour** restore target, not the earlier
  30-minute roadmap proposal. It is an acceptance target, not an achieved SLO.
- Owner answered **Defer live qualification**: SIWC remains disabled; P1 may be
  planned as provider-independent core work with synthetic/offline tests only.
- Owner tier preference is **“Plus tier + Free tier subject to availibility”**.
  This is attestation of intent, not proof of billing/eligibility; Free is a
  separately qualified run-scoped selection, never automatic fallback or rotation.
- Owner confirms training opt-out and explicitly **Include environments: Off**.
  No independent account check, zero-retention guarantee or permission to send
  private source follows. Login/allowance use remain prohibited; paid budget zero.

## G0 checklist and disposition

| Item | Evidence/state | Owner and remaining action |
| --- | --- | --- |
| Product/reference/host envelope | Accepted small conflict-free Bun/TS fix in disposable Loom; selected local Linux profile, one worker, 2 CPUs/4 GiB/256 PIDs/2 GiB writable data/20-minute deadline | Developer retains scoped acceptance corpus; actual workflow qualification G2/G3 |
| Runtime/framework | ADR-005/007 accepted; pinned-source/recovery/skill feasibility recorded | Developer; no dependency promotion or re-pin for core |
| Isolation/credential boundary | ADR-006/009 accepted; external supervisor and broker own authority/credentials; disposable worker has neither | Developer tests real runner in G2; no unsafe provider route required by T-01 |
| Durability/recovery | ADR-008 accepted; R-001 aligned to one hour | Developer verifies documentation correction; measured restore later |
| Provider/data/spend intent | Disabled SIWC and deferred live qualification approved; attestations recorded | Owner/developer retain qualification and express-live-use gates |
| Review | Original and follow-up approvals attributed to Ishan via owner; R-001 resolved in follow-up candidate | Preserve artifact-specific reports; actual later implementation still needs review |
| First core slice | T-01 schema/safe-migration scope approved by owner: “T-01 approved”; T-03 remains next, not authorized | Developer prepares detailed active P1 specification and migration contract before code |
| Engineering checks | Existing tools/mandatory tests retained; fresh baseline to record before code | Developer; missing scanner blocks affected code-phase closure, not concealed |
| Final G0 decision | ACCEPTED / CLOSED, 2026-10-23: owner stated “G0 accepted” | Scope/failure assumptions accepted as design; P1 start and later qualification remain explicit |

The provider deferral changes qualification timing, not storage ownership,
runtime choice, credential exposure or the first deployment boundary. If future
eligibility requires a different boundary, stop and return it for review; do not
silently route via private APIs or a different billing path.

## Owner-approved first P1 slice scope — T-01 schema and safe migrations

**Scope approved by owner, 2026-10-22 (“T-01 approved”):** evolve the schema through the existing store owner,
with explicit supported-version detection, atomic fresh/legacy migration,
append-only audit enforcement and deterministic tests. No runner, live provider,
outbox dispatch, policy engine, critical approval command or production authority.
T-03 audit lifecycle follows only after T-01 is verified; T-02/T-04–T-07 remain
necessary for G1. Schema work alone is not enforcement or a releasable runtime.

### Ownership and compatibility trace

- `src/store.ts`: `openDb`/`initSchema`, all table creation, migration ownership
  and mandatory PRAGMA handling. Currently WAL/foreign keys only; no migration
  registry or explicit FULL read-back. Extend this layer, not a parallel store.
- `src/cli.ts`: `init`, `record`, `status` open/init the store. Preserve or
  explicitly migrate their supported inputs/outputs; assess failures on unknown
  schema without adding an ungated authority path. Later CLI hardening is T-07.
- `src/index.ts`: re-exports store functions/types; preserve API compatibility
  where safe, document required changes before implementation.
- `tests/smoke.test.ts`: existing three cases must stay valid or be updated only
  for the approved explicit compatibility contract, never deleted to pass.
- `tests/schema-v2.test.ts`: proposed fresh/legacy/version/atomicity/immutability
  coverage; fixtures are synthetic, no real DB migration. No file exists yet.
- `package.json`, `bun.lock`, `FRAMEWORK_REF`, CI: no changes proposed by this
  slice; Bun SQLite/stdlib suffice. CI currently uses mutable Bun latest, not a
  reproducible release qualification; phase spec must record the tested runtime.

### Acceptance and failure matrix to specify before application code

| Case | Required evidence |
| --- | --- |
| Fresh DB | Required v2 tables/columns/views/indexes, migration metadata and PRAGMA read-back; in-memory fixtures not mistaken for file-backed WAL proof |
| Recognized legacy DB | Preserve every original field and row; record legacy provenance without fabricated actor/grant/approval/completion authority |
| Unknown/newer/partially recognized schema | Explicit refusal; no reset, downgrade or partial DDL |
| Repeat initialization | Idempotent, no duplicated migration/audit/evidence facts |
| Injected migration failure | Transaction rollback leaves original schema/data/version intact; reopen confirms |
| Audit mutation attempts | UPDATE/DELETE fail; legitimate inserts/read queries still work |
| Views/identity | Latest-per-key deterministic; legacy unknown identities cannot authorize effects |
| Backup/rollback fixture | Consistent file-backed backup/clone restore with integrity/version/data checks; never bare live WAL DB copy or deletion of source WAL |
| Caller/export regression | Existing CLI/library/smoke usage accounted for; unsupported versions fail visibly rather than silently mutating |

Before code, the active P1 specification must settle exact SQL/type/nullability,
legacy mapping, migration transaction/failure semantics, API changes and fixture
data. These are slice-level contracts, not permission to improvise data migration.
No application or test edits are authorized by this G0 preparation document.

### Estimate and exact engineering checks

Forecast for one developer plus AI, not measured throughput: T-01 **3–5 active
development days** including specification, test-first implementation, compatibility
and review; T-03 next **2–3 days**. Reforecast from actual completion; neither is
a second parallel developer or a delivery promise. Hold one work package at a time.

Before T-01 edits, record the current baseline in this order:

1. `bun run lint`
2. `bun run check`
3. `bun test --coverage`
4. `bun audit` (read-only; no auto-fix) and trusted secret-scanner availability.

After approved test-first work, run the same gates, plus
`bun test tests/schema-v2.test.ts`, approved file-backed/subprocess regressions,
coverage comparison and the selected trusted secret scan. Do not claim unknown
future tests or scanner invocations have run. Keep the previous baseline of three
tests, 100% functions / 90.99% lines as historical until refreshed; coverage
exit zero alone is not non-regression. Scanner absence must be resolved before
affected code-phase closure; installation requires its own approved scope.

For **this document-only delta**, run SPEC's document validator, whitespace and
code/config/pin integrity, plus the one-hour recovery assertion. No application
tests, dependency audit, runtime lab or live provider tests are required to
pretend implementation is complete. Record actual checks in SPEC/follow-up.

## Later proof obligations — not omitted and not G0 implementation blockers

| Gate | Obligation | Accountable owner / failure behavior |
| --- | --- | --- |
| Before G1 closure | Exact migration/audit/gate/kill/outbox/CLI corpus, coverage baseline and secret scan; restore fixtures | Developer; unavailable safety tooling or mandatory failure blocks affected code phase |
| Before real runner admission (G2) | Digest-pinned image, real mount identity/cap preflight, bounded logs/temp/storage, default-deny egress, trusted endpoint, startup/kill/domain quiescence/reuse | Developer; operator approves host changes; fail closed on missing controls, no rootful fallback |
| Before live inference/private data | Tier/model/region/agreement eligibility, own SIWC identity, token/broker isolation, redaction, usage/quota/cancellation and explicit login/allowance/budget approval | Owner supplies account/consent facts; developer qualifies; provider stays disabled on failure |
| Before real framework workflow (G2/G3) | Provision/verify exact locked children including tdd/code-review; required inputs, hash checks and complete workflow | Developer; absent/drifted child is handoff, not ambient-global substitution |
| Before production/restore (G4) | Concrete host/backup destination/protection in separate failure domain, boot policy, backup manifests/retention and timed one-hour restore/reconciliation | Operator selects/approves resources; developer tests; no production effects before qualification |

## Human closeout record

Ishan's follow-up report approval is recorded separately, as relayed by the
owner. Owner approved bounded T-01 scope and explicitly accepted G0 on
2026-10-23 (“G0 accepted”), closing the design/feasibility gate. P1 implementation
is NOT STARTED; its detailed migration contract, active phase specification and
fresh baseline precede code. Later qualification obligations above are not
waived. No live provider, production, install, commit or push permission follows
from this gate acceptance alone.
