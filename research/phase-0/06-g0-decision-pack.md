# P0 — G0 decision pack

Prepared **2026-10-22**, from `5ae0737`. **G0 is OPEN; P1 has not started.**
This pack turns the [roadmap's P0 requirements](../../ROADMAP.md#p0--product-contract-and-irreversible-decisions)
into explicit owner decisions and a blocked implementation backlog. Accepted
design choices, remaining proposals and implementation evidence are different states.
Accepting a target does not install it or certify production support.

## 1. Decision register

| Item | State | Decision / next owner |
| --- | --- | --- |
| Product | Accepted scope | Self-hosted, single-tenant, Linux/local, trusted operator, CLI-first and read-only dashboard. No public service or multi-tenant authority. |
| Runtime | Accepted [ADR-005](../../decisions.md#adr-005---2026-10-22-p0-runtime-recommendation) | Upstream coding-agent SDK `1.4.0`, source `4a080252f06caf63a525d7873c5d94d3c23887e0`; later scoped dependency promotion, not installation now. |
| Reference repository | Owner selected | Disposable Loom checkout with synthetic fault injection and deterministic tests. Never expose the live control-plane checkout, authoritative DB or credentials. |
| Backend | Accepted target [ADR-006](../../decisions.md#adr-006---2026-10-22-p0-support-profile) | Rootless Docker; operator setup permission, exact host/profile and qualification remain separate. No rootful/privileged fallback. |
| Framework | Accepted [ADR-007](../../decisions.md#adr-007---2026-10-22-p0-framework-baseline-proposal) | Owner selected retain/revalidate current `2.1.0` pin for the first small conflict-free TS fix; no re-pin or skill installation. |
| Provider/model/data | Disabled qualification direction accepted | Personal OpenAI account; owner preference Plus plus Free subject to availability; `gpt-6.1-sol` availability, training opt-out and Include environments off are owner attestations. Owner approved deferred live qualification for synthetic-only P1 (ADR-012). SIWC stays disabled, eligibility/data/broker proof remain required before live use; no automatic fallback/rotation, allowance use or paid spend. Consumer Antigravity excluded. |
| Operator/transport | Accepted design [ADR-009](../../decisions.md#adr-009---2026-10-22-p0-operatortransport-proposal) | Trusted local operator channel, narrow runner pipe and command-family contract below; concrete schemas/auth implementation/review still required. |
| Durability/retention | Accepted design [ADR-008](../../decisions.md#adr-008---2026-10-22-p0-durability-proposal) | Explicit authoritative WAL/FULL, consistent backups and recovery targets below; destination/protection and drills not implemented. |
| Host/capacity/deployment | Lab target accepted; rootless setup installed | Owner authorized the user-level rootless lab install on 2026-10-22; CPU/memory/PID limits and whole-container cleanup were observed. A fixed 2 GiB ext4 workspace cap was provisioned and ENOSPC-tested; mount/log integration and boot persistence remain. Final image pin, port publishing, broker and production qualification remain open. Not production support. |
| Independent review | Original report approved; follow-up separate | Ishan Singh, Principal Developer; owner relayed approval of the `fc0e05e` report. R-001 is corrected in the new document candidate; original report preserved. Follow-up review/disposition applies to the corrected artifact, not inherited approval. |
| Build authorization | OPEN | Complete G0 decision/evidence review, then explicitly authorize P1. No G0 exception or phase advancement is granted here. |

## 2. First qualification journey

Target the existing-repository, **small, conflict-free Bun/strict TypeScript fix**:

1. Pin a disposable Loom source revision and framework revision; prepare one
   synthetic defect with a deterministic failing acceptance test. Record the
   issue/slice/spec inputs and fixed review baseline required by the framework.
2. Operator starts a bounded candidate run. Only the disposable checkout is
   writable to the isolated worker; the original repository and Loom authority
   are outside it. No push, protected merge, production access or live deploy.
3. Worker proposes the bounded patch and framework-shaped result. Required
   `tdd`, `code-review` and any triggered child must exist at the selected lock
   commit/path/hash. Missing child, tracker/review configuration or input means
   blocked/handoff, not a substitute skill or invented approval.
4. Trusted verification, outside the worker's authority, runs the repository's
   lint/typecheck/test/coverage checks for the exact candidate and records a fresh
   fixed-point review. Only then can Loom decide the task is verified.
5. Stop/restart drills show committed state, pending human decisions and uncertain
   effects without conversation memory. Unknown non-idempotent effects require
   target-state reconciliation before any new dispatch.

This is the **initial qualification slice**, not a reduction of the roadmap's
GA lifecycle. Greenfield, security/data migrations, conflicts, browser journeys
and deployment families need their own qualified cases. Neither fake-provider
contract transport nor a synthetic `pass` proves the full framework workflow.

Framework review: [07-framework-baseline-review.md](07-framework-baseline-review.md).
The newer revision changes eight relevant files but not the artifact/result/ledger
reference bytes. Retaining the old pin avoids unrelated migration work, not the
need to provision/verify children or execute a fresh supported workflow later.

## 3. Host, sandbox and deployment target

**Observed, not promoted:** Linux x86_64/Omarchy, kernel `7.2.8-9-omarchy`,
16 logical CPUs/~15 GiB RAM, Bun `1.4.3`, Node `26.7.0`. Read-only `docker info`
at the observed endpoint reports server `29.9.1`, cgroup v2/systemd, `overlayfs`, seccomp and cgroup namespaces,
**without `rootless`**. No daemon/context/settings were changed or containers started.

**Lab setup evidence — 2026-10-22 (owner-authorized).** Installed the official
user-level static bundles
`docker-29.9.2.tgz` (SHA-256 `9ac225999fd5e863f7694c728ef23d480616b1e5639328fa309befd4243d69eb`)
and `docker-rootless-extras-29.9.2.tgz`
(SHA-256 `f2663b230a7afc13dea88fc589685331d01f5f3fc458b92ab40e2388db452ed2`)
under `$HOME/bin`, plus upstream static `slirp4netns 1.3.6-x86_64`
(SHA-256 `411167abceff1fc8a7c562f53ed9f26d3ec8a17df4e2fe6eaa3bd53f1c1e1d48`,
matching the GitHub release digest).
`rootlesskit 3.3.0` is bundled. Docker's static path published no separate
checksum, so the two Docker bundle hashes above are recorded rather than
independently verified. A user `docker.service` is active and enabled for
the login session; a dedicated `rootless` CLI context points at
`unix:///run/user/1000/docker.sock`, while the prior `default` context was restored
so existing rootful workflows are unchanged. `docker info` reports `name=rootless`,
storage driver `overlayfs`, cgroup driver `systemd`.

Controlled checks: `--cpus=1 --memory=512m --pids-limit=64` produced
`cpu.max=100000 100000`, `memory.max=536870912`, `pids.max=64`; a 0.5-CPU busy
loop throttled 20/21 periods; a 32 MiB no-swap allocation was OOM-killed (exit
137); a 16-PID limit denied further forks. Default-bridge egress worked via
slirp4netns; `--skip-iptables` was used because `nf_tables` was not loaded. A
`--pids-limit=64` container whose PID 1 and child ignored `SIGTERM` exited 137
under `docker stop -t 1`; the heartbeat file stopped changing (11 lines at stop,
11 after two seconds), no marker process survived, and the container was removed.
A `--storage-opt size=64m` probe wrote 128 MiB successfully (exit 0), so the
storage option is **not an enforced cap** on this rootless `overlayfs`/btrfs host.
The owner chose a provisioned hard cap instead: a fixed-size 2 GiB ext4 image at
`$HOME/.local/share/loom-lab/workspace-2g.img` (`mkfs.ext4 -m 0 -N 200000 -L
loom-workspace -E root_owner=$UID:$GID`) is mounted by udisks at
`/run/media/$USER/loom-workspace` and is the only persistent writable run volume.
With a read-only rootfs and 64 MiB tmpfs `/tmp` and `/dev/shm`, a 2.3 GiB fill
stopped at 1.9 GiB with `ENOSPC` (`dd` exit 1); a 100 MiB `/tmp` fill stopped at
64 MiB. This is a filesystem-size cap, not a Docker quota: the image/layer/
metadata store remains supervisor-owned and uncapped, so the runner must preflight
the mount, disable or cap logs, and expose only this workspace. Boot persistence
and loop cleanup authorization remain open.

`libnetwork: restoring thread network namespace failed: operation not permitted`
appeared while containers still ran. A Moby maintainer's analysis of the same
lines in [moby#52933](https://github.com/moby/moby/issues/52933#issuecomment-5498923624)
calls them inherent noise on working detach-netns setups; our no-port workloads
passed, but port publishing is still untested. Not yet proven: runner integration
of the workspace cap and log limits, boot persistence, final digest-pinned runtime
image, port publishing, broker integration and production-host support. The
rootful daemon was not modified.

The owner selected this exact local reference for initial qualification. The
rootless setup/version is approved and installed; qualification remains partial.
A different production host/distribution must be explicitly named rather than
silently assumed. Rolling kernel/engine/runtime changes trigger a reviewed
evidence delta.

Required configuration/evidence for the rootless target:

- Rootless daemon identity and explicit trusted endpoint, subordinate UID/GID
  prerequisites and appropriate local storage; never trust the CLI context name
  alone. Never stop/reconfigure the existing daemon without operator approval.
- Rootless CPU/memory/PID controls require cgroup v2, systemd and actual controller
  delegation. Official docs warn flags can otherwise be **ignored**. Verify the
  limits with controlled over-limit tests; missing enforcement blocks admission.
- Entire SDK/startup/extensions/descendants in one bounded container domain.
  Pin the image by digest; read-only rootfs and input snapshot, explicit writable
  workspace/runtime-journal volume, bounded temporary storage. The selected cap is
  a fixed-size 2 GiB ext4 workspace plus 64 MiB tmpfs `/tmp` and `/dev/shm`; no
  writable container layer. No host home, host PID/IPC/network namespaces, Docker
  socket, devices or privileged mounts.
- Default network isolation; provider traffic only through the trusted broker
  described below. No raw provider/production credentials in the container.
- Kill/stop and startup-failure tests must prove the whole container domain is
  quiescent before volume/workspace reuse. Preserve evidence on failure. One
  synthetic `stop -t 1` test with a SIGTERM-ignoring PID 1 and child passed with
  no surviving process or heartbeat write; startup failure and volume reuse still
  need explicit tests. The bubblewrap/pidfd research fixture is not production
  Docker qualification.

**Accepted initial qualification envelope, not measured performance:** one active runtime worker,
one effective workspace mutator, 2 CPU cores, 4 GiB memory, 256 PIDs, 2 GiB total
persistent writable run data and a 20-minute wall deadline. Quotas must cover all
writable layers/volumes and temporary storage; a disk-usage poll or Docker memory
flag does not prove a disk quota. Pick/test an enforceable volume/storage profile
before claiming that cap. No fan-out or extra backend enabled implicitly.

Observed 2026-10-22: `--storage-opt size=64m` did not constrain a 128 MiB write
(exit 0), so it is not used. A 2 GiB ext4 workspace image (1.9 GiB usable,
user-level udisks loop mount) was filled from a read-only-rootfs container: `dd`
stopped at 1.9 GiB with `ENOSPC` (exit 1), and a `/tmp` fill stopped at the 64 MiB
tmpfs limit. The workspace is the only persistent writable run volume; container
writable layers are disabled and Docker's image/metadata store is supervisor-owned.
Remaining integration: mount preflight, log caps, boot persistence and loop cleanup
authorization. A supervisor poll is not part of this cap.

**Deployment proposal:** first staging target is a disposable local rootless-OCI
application environment. Later production uses the same reviewed deployment
mechanism with a distinct explicit environment, credentials, approval scope and
artifact roots. Production is unsupported until the G4 five-gate deploy/confirm/
restore drill passes. Ports stay private/loopback as applicable; no host-network
workaround. Opening rollback work after a failed confirm does not authorize its
execution: valid human approval must cover the exact restore target/environment.

Sources inspected 2026-10-22: official Docker [rootless prerequisites](https://docs.docker.com/engine/security/rootless/),
[resource/delegation requirements](https://docs.docker.com/engine/security/rootless/tips/#limiting-resources)
and [limitations](https://docs.docker.com/engine/security/rootless/troubleshoot/).
These live docs are evidence, not permission to execute their setup commands;
revalidate the chosen shipped revision before actual setup. Local design:
[R-15](../phase-2/19-r15-sandbox.md), [R-19](../phase-2/13-r19-deploy.md).

## 4. Accepted operator and runner design contract

### Operator surface — not shipped commands

The actual scaffold has only `init`, `record`, `status`, `check-framework`.
[Historical R-14](../phase-1/09-r14-cli-ux.md) is recording/orientation design,
not evidence that the complete control surface exists. ADR-009's accepted design:

| Command family | Intended invariant |
| --- | --- |
| Existing four names | Preserve orientation/recording where compatible; all writes use the live gate. `record` stores attributable claims, never arbitrary approval/completion authority. `status` is read-only, including on a missing DB. |
| `loom run start` / `loom run resume` | Host-supervised admission/continuation from authoritative state; validate pins, required inputs, live policy, fresh ownership and unresolved work. Resume never rewrites a terminal phase or revives a killed run; create a linked new phase/run where required. |
| `loom approvals list` / `show` / `decide` | Inspect pending immutable intent and bind a human decision to action/run/thread/target/payload/candidate/environment/expiry. Changed intent needs a new decision; expiry/kill cannot be bypassed by a stale approval. |
| `loom kill engage` / `status` / `reset` | Global or per-run latched stop; human reset after reconciliation, fresh verification and confirmed domain cleanup. Reset never regrants leases. No per-thread kill or automatic reset. |

Machine-readable `--json` output is formatting, not authority. A string such as
`--actor human`, a TTY or text saying “approved” is insufficient. The trusted
operator channel uses OS-established identity and explicit critical-action
confirmation outside the sandbox; no runner-readable approval socket/token.
Trusted operator/host-account compromise is outside the initial threat boundary,
not solved by pretending a confirmation prompt proves physical human presence.
Headless critical actions fail closed without an independently approved authority
path. Dashboard remains read-only; no public writable web/API surface in v1.

### Transport and final admission

Use one supervisor-owned private attach/pipe channel per container; no generic
runner-accessible host control socket. The supervisor binds container/run/thread/
owner/epoch identity before launch and does not trust corresponding message fields.
Versioned, strict request/result schemas have bounded lengths and an allowlisted
operation set; unknown messages/fields fail closed. Final byte limits and exact
operation schemas belong in the approved T-04/P2 specifications before code.

- Runner sends operation intents, candidate proposals, usage observations and
  lifecycle signals; it cannot approve, reset kill, mint grants or certify completion.
- Validate framework results against each adapter's actual declared exits and
  required inputs/artifacts, not only the example `skill_result` status comment
  (which is not exhaustive, including `needs-review`). No result string grants authority.
- Persist the validated immutable intent and its digest; bind approval/retry IDs
  to those exact bytes/target. Same ID with changed intent is a conflict, not an
  old result or transferable approval. Narrow owned handlers validate again at
  dispatch: **kill → deadline → grant → policy → owner/epoch**.
- Keep state/audit/outbox admission atomic; perform network I/O outside the DB
  write lock. Track dispatched-but-unconfirmed work honestly. Runtime exit,
  timeout, cancellation or pipe loss is not evidence of no remote effect.
- Provider mediation is a separate allowlisted host broker operation: credentials
  stay outside, caller cannot select arbitrary URLs/headers, budgets apply to
  retries, and usage/unknown billing is attributed to the supervisor-bound run.
  Keep direct egress, ungoverned MCP, codemode model calls and cache warming
  disabled until their individual output/usage/authorization tests pass.
- Sanitize or withhold partial/final/structured/error/spill content before any
  owned exposure/persistence. SDK journal paths also need an appropriate owned
  filtering seam; filtering only the final operator message is insufficient.
  Never copy raw runner stderr to logs as a shortcut.

The data flow is fixed; exact schemas/limits are pending design review. No
transport code or host provider gateway is implemented by this pack.

## 5. Accepted durability, restore and migration design

Authoritative ledger lives on supported **local** storage, not NFS/shared WAL.
The owner approved explicit WAL + `synchronous=FULL`, foreign-key checks, serialized
`BEGIN IMMEDIATE` mutations and read-back/failure handling for mandatory PRAGMAs.
These are file-backed authority requirements; in-memory unit fixtures do not
establish a supported persistent-storage mode.
SQLite's [WAL documentation](https://sqlite.org/wal.html#performance_considerations)
distinguishes FULL's per-commit sync from NORMAL's weaker power-loss durability.
Neither is a distributed transaction with an external deployment or provider.

Read-only runtime inspection found Bun's embedded SQLite `3.53.4` and in-memory
default synchronous value `2` (FULL). This does **not** prove every file-backed
Loom connection explicitly enforces it; `src/store.ts` currently sets only WAL
and foreign keys. The official [WAL-reset bug notice](https://sqlite.org/wal.html#the_wal_reset_bug)
says fixed in `3.51.3` and later; this observed embedded version is newer. No
corruption reproducer or general storage certification was run here.

Owner-approved failure/restore targets, still requiring implementation/evidence:

- Preserve acknowledged authoritative transactions under process-crash tests;
  in-flight/uncommitted writes may roll back. Do not claim zero-loss host/power
  durability beyond the qualified OS/filesystem/device sync guarantees.
- SDK transcript tail is not authoritative. Reconstruct task/effect state from
  Loom records; session loss never licenses repeating an uncertain effect.
- Daily and pre-upgrade/migration consistent backups, seven daily/four weekly
  copies, protected in an operator-managed **separate failure domain**. Accepted
  host-loss RPO: 24 hours; restore target: one hour. Destination/protection and
  measured restore evidence remain open; these are not achieved SLOs.
- Rotate backup copies only under the approved policy. Never silently delete
  primary audit history. Archive/retire policies require their own verified,
  attributable procedure; this pack grants no data deletion authority.
- Backups include schema/pin/policy/price/artifact manifests needed for recovery;
  no raw provider secrets. Use a consistent backup or quiesced/checkpointed copy,
  not the bare main file from a live WAL database. Never unlink live WAL files.
- Persist/hash trusted evidence artifacts before committing authoritative refs;
  a missing, mismatched or non-durable artifact must leave recovery unverified.
  WAL/FULL alone does not make a separate filesystem/artifact write atomic.
- Restore into a separate location with admission closed; verify integrity,
  schema/version, manifests and uncertain effects before reopening. Restore does
  not automatically replay outbox rows, clear kill or restore prior approvals.
- Preserve existing scaffold rows as attributable legacy claims without inventing
  actors/approvals or granting them execution authority. No auto-reset of unknown
  DBs. T-01 must specify/test the exact legacy mapping and reject newer schemas.
- Review the supported rollback path before each migration. A backup restore may
  be safer than a destructive down-migration, but its loss window and effects
  since the snapshot require explicit approval/reconciliation. Code rollback is
  not schema downgrade. R-19's old paired-down-step wording must not force unsafe
  rollback; ADR-008 accepts the explicit restore alternative, not a waived gate.

## 6. Threat, observability and readiness checklist

Untrusted: repository/skill text, model output, tool args/results, startup code and
descendants. Protected: ledger/policy/grants, operator authority, credentials,
approved artifacts, budget and deployment targets. Trust assumptions: reviewed
supervisor/broker, operator account, host kernel/runtime and selected dependency
artifacts. Rootless containers reduce exposure; they do not replace these checks.

Record bounded structured action/run/thread IDs, decision/outcome/reason codes,
intent/artifact hashes, owner epochs, dispatch identities, reconciliation evidence
and cleanup state. Redact before logging; keep model narratives separate from
operational facts. No stable log or dashboard field may imply completion from
runtime settlement or imply `not-executed` from an unknown effect outcome.

G0 closes on an **approved build-ready design and its bounded feasibility evidence**,
not completed P1/P2 implementation (which would be circular). Required before P1:

- Owner-approved framework baseline, provider/model/data/spending intent, concrete
  target host/deployment/capacity, operator/transport and durability assumptions.
- Named owner/booking for independent boundary/recovery review; reviewer availability
  is a real dependency, not an AI self-review checkbox. Named: Ishan Singh,
  Principal Developer; owner-stated availability “always available”; owner relayed
  report approval for `fc0e05e` on 2026-10-22. R-001 correction is prepared for
  follow-up review; approval does not transfer to the corrected artifact.
- Version/profile evidence and setup/qualification owners, no unresolved choice
  changing state ownership or credential/deployment boundaries; approvals recorded
  in ADRs and the support matrix. User-level rootless setup is installed; one
  whole-container cleanup test passed; the 2 GiB ext4 workspace cap was
  ENOSPC-tested; runner integration/log caps, final image pin, port publishing,
  broker and production-host qualification remain open.
- First support/acceptance matrix and specific P1 slice approved. Full workflow,
  Docker containment/provider integration and deploy/restore drills remain G2–G4
  proof obligations, never pre-claimed from this planning document.
- Engineering-check plan: keep existing mandatory tests/coverage; add deterministic
  migration/audit/process/CLI integration cases using Bun, not invented browser
  E2E. Resolve trusted secret-scanner availability before affected code-phase
  closure; the limited Biome rule set is not a broad static/security audit.

## 7. Next two-week P1 backlog — blocked until G0 approval

One package in progress; do not promote the Pi dependency merely to build the DB core.
Reuse the [core implementation plan](../pi/09-milestone-1-implementation.md) and
existing `src/store.ts` as the schema owner. Reforecast from actual completion,
not an assumption that AI supplies a second developer.

| Order | Scope / files to specify before code | Smallest sufficient acceptance evidence |
| --- | --- | --- |
| 1 — T-01 | `src/store.ts`, `tests/schema-v2.test.ts`; migrations, required schema/views, immutable audit constraints, supported legacy mapping and rollback/backup fixtures | Deterministic red tests first; fresh/v1/unknown-newer DBs, idempotent rerun, injected migration failure atomicity, preserved legacy claims, append-only triggers and consistent restore. |
| 2 — T-03 | `src/store.ts`, `tests/audit-lifecycle.test.ts`; request → verdict → outcome, actor/tier/action/thread IDs, evidence refs and triage queries | Denied/expired only pair with known not-executed; allowed does not prove completed; unknown dispatch never falsified; crash between inserts leaves a truthful queryable resume state. |

Each slice needs a fresh seven-section SPEC block with exact commands and coverage
comparison. Run lint/format → strict typecheck → unit/integration/coverage → security
review/scanner/advisory audit in order. No schema work starts from this backlog
alone. T-02/T-04–T-07 still gate G1; partial schema/audit work is not enforcement.

## Owner decisions and remaining handoff

The owner accepted retained `2.1.0`, ADR-008/009's operator/durability design and
the current Linux reference/qualification envelope. Those design decisions are
closed; setup, precise implementation contracts and evidence are not implied.

1. **Disabled-provider boundary accepted; live eligibility deferred:** personal
   OpenAI account; owner preference “Plus tier + Free tier subject to availibility”;
   `gpt-6.1-sol` owner-confirmed available. Training opt-out is confirmed and
   account-level Include environments is explicitly off (owner attestations,
   no independent verification). Private-source permission does not authorize
   submission now; no additional retention/residency limits. **Offline Codex check
   (2026-10-22):** installed `codex-cli 0.163.0` exposes no settings/config
   command for either account control; `features list` has no
   `include_environments`; local `config/read` reports
   `include_environment_context=true` and `include_environment_context_time=true`
   as built-in defaults. The CLI training banner points to ChatGPT settings. The
   account-level **Include environments** state is not proven by this local flag;
   the separate owner attestation above supplies that state. Public-source review of official Codex
   (`9a8a85b`) and three third-party Codex-auth/account tools found no supported
   account-control query; they implement OAuth, account rotation and usage, not
   training/Include environments verification. Verify applicable tier/model
   eligibility, agreement, actual data handling and integration before live use.
   Owner approved deferring these with SIWC disabled during synthetic-only P1;
   Free is a separately qualified explicit choice, not fallback/rotation. This profile does
   not make Loom's authority/workflow/verification model-dependent. Qualify SIWC direct
   with Loom's own identity and a narrow local broker; do not use legacy private
   endpoints or consumer Antigravity as a fallback. [Evidence and required inputs](08-subscription-provider-review.md).
   Login/background automation/live allowance consumption require separate express
   authorization; live calls remain prohibited at the current zero paid budget.
2. **Report approved, as relayed by owner:** Ishan Singh, Principal Developer;
   owner-stated availability “always available”. Owner attributed report approval
   to Ishan on 2026-10-22; no direct signature or independent identity check claimed.
   An [AI-assisted report for `fc0e05e`](../reviews/2026-10-22-g0-fc0e05e.md)
   records scope, evidence and that disposition. R-001's mismatch is corrected
   to the accepted one-hour target; the new candidate needs follow-up disposition.
   No waiver, G0 closure or P1 authorization is inferred.
3. Operator has authorized the user-level rootless lab setup; remaining operator
   decisions cover workspace-cap integration/boot persistence, backup
   destination/protection, production host and any boot/linger policy. Review
   concrete transport/schema/auth details in their phase spec; no broad production
   setup approval.

The [closure packet](09-g0-closure-readiness.md) maps each remaining task to its
gate/owner and proposes T-01 as the first slice. Final package acceptance and
specific slice approval remain human decisions; later implementation proof is
not circularly required before core planning can close.

Until these and the G0 checklist are resolved, continue planning or hand off;
do not call P1 started, certify support or improvise authority. This pack is a
docs-only handoff; neither a cloud booking nor an upstream issue was published.
