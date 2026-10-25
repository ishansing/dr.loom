# P2 kickoff — isolated runner, not live inference

## Baseline and authority

PR #5 is merged into `master` at
`ffbfd47e042214f543593c8e5481fe1f155ab2a5`; its tree matches approved P1 head
`803e5f6`. Owner stated “Merged, continue”. Work starts on
`feat/p2-runner-contract` with a clean tree. SSH fetch remains unavailable;
an authenticated HTTPS fetch through GitHub CLI obtained the exact merge
without changing remote/credential configuration or inspecting credentials.
G1 remains closed in its recorded synthetic/core scope; G2 is open.

Existing decisions remain in force: SDK1.4.0 (ADR-005), rootless Docker29.9.2
lab target (ADR-006), retained framework2.1.0 (ADR-007), local trusted operator
and separate identity-bound runner channel (ADR-009), disabled live SIWC
qualification/no fallback (ADR-010/012). No second runtime comparison is needed.

## Fresh discovery — 2026-10-25

- Bun1.4.4, Node26.7.0. Loom package/lock still contain no Pi runtime dependency;
  the earlier external comparison installation is no longer present.
- Read-only `docker --context rootless version` reports client/server29.9.2.
  Restricted `docker info` fields report rootless, built-in seccomp, cgroupns,
  overlayfs and systemd/cgroup2. No container was started, image pulled, daemon
  reconfigured or host quota changed by discovery.
- `findmnt --mountpoint` on the previously provisioned workspace returns1:
  capped run storage is not currently mounted. Do not silently use an ordinary
  writable directory, Docker storage-size option or rootful/default backend.
- Exact registry SDK1.4.0 tarball was downloaded only for source inspection;
  no package install, lifecycle script, SDK execution or provider call occurred.
  Registry URL: `https://registry.npmjs.org/@earendil-works/pi-coding-agent/1.4.0`.
  SHA512 matches accepted P0 evidence:
  `sha512-Z41LpZ3yYHSC/UUps6Mr39UMFPwH8elhJBG9DY1P7kuzsE5qSK/6eMj2EHzO5evJRQWLbKSqUMw+4nCNtIyiQg==`.
  Archive SHA256:
  `d155c16ef6fa00960fbf58b2911536e80b05f33700e0b14fbd08967ede0c7428`.
  Official GitHub tag API independently confirms source commit
  `4a080252f06caf63a525d7873c5d94d3c23887e0`; no current-main substitution.
- Shipped `dist/core/sdk.js` SHA256
  `992a539079e42f9dc577064e971afa9972a01dbffedb035f7cb68ab204d36964`:
  lines71–80 default to agent auth/models, settings, session storage and resource
  loading; lines88–118 permit model fallback. Explicit isolated resources and
  fail-closed model selection are mandatory, not optional CLI settings.
- `dist/core/sdk.d.ts` exposes `tools` as a string allowlist and `noTools`, not
  a supplied array of tool implementations; custom tools use `customTools`.
  An empty allowlist disables MCP selection, but exposure is not authorization.
  `resource-loader.d.ts` offers explicit context/extension/skill/template controls;
  do not infer channel closure from one `noExtensions` flag.
- `agent-session.d.ts` exposes prompt/subscribe/abort/abortBash/dispose and private
  runtime journal ownership. Cooperative cancellation is still not containment.
  The archive's shipped1.4.0 changelog includes restored-tool/truncated-call fixes
  and default-model/retry changes; no moving latest or ambient provider behavior
  is adopted. These source observations are not an SDK integration test.

## Newly observed baseline issue

`bun run lint` and `bun run check` pass. First full coverage run fails the
existing non-idempotent relay contention test before one child's readiness.
The isolated test fails3/30 repetitions. A minimized60-pair bootstrap captures
2 failures with `SQLITE_BUSY`/`SQLITE_BUSY_RECOVERY` in `schemaKind` during
`openDb`, before the fixture installs its busy timeout. No duplicate dispatch
was observed; this is a startup race obscuring the intended relay assertion.

Repair only the fixture: use the existing phase-writer test's sequential
connection-ready pattern, then release both workers together. Keep real child
processes, independent target and exact one-attempt/one-effect assertions.
Do not add sleeps, automatic retries, skips or public store behavior changes.
Results belong in the active SPEC; do not treat rerun success as erasing the red.

Corrected fixture passes100 independent targeted runs; fresh lint/strict check,
full143 tests/2,082 assertions (100% functions/98.11% lines), empty-`/tmp` full
coverage, automated drill and14-package dependency audit all pass. This repair
does not qualify the planned supervisor/backend or change public SQLite behavior.

## Remapped first implementation sequence — proposed, not approved code

1. **T-09/T-15 offline containment slice first:** one supervisor-owned rootless
   container runs a trusted scripted worker, no SDK/model/framework invocation.
   Reuse P1 gates for admission; validate the actual backend, fixed capped mount,
   digest-pinned image, read-only input/rootfs, bounded writable/temp/log paths,
   resource envelope and default-deny network. No Docker socket, host home,
   protected project/DB or credentials in the worker. No generic sandbox API or
   multi-backend implementation is needed for this first selected profile.
2. **T-08/T-09 pinned SDK integration next:** separately approve exact SDK1.4.0
   promotion and runner image dependency lock; scripted replies only initially.
   Explicit resource/model/settings/session setup, deny ungoverned channels,
   final-payload owned operations and fail-closed output before exposure/storage.
3. **T-10/T-11:** read-only runtime evidence ingestion and exact-hash candidate
   verification. Runtime journals/conversations remain Pi-owned; Loom alone owns
   lifecycle/grants/leases/effect admission and task completion.
4. **Separate live qualification:** approved provider/broker/account/model/data/
   billing and actual framework inputs before enabled real workflows. The G2
   real-provider proof remains required later, not satisfied by offline success.

## Material prerequisites before container/runtime implementation

- Owner approves the bounded first T-09/T-15 slice and its exact active contract.
- Specify/review the image recipe and resolve its immutable digest before launch;
  no unpinned pull/build or SDK installation has been authorized here.
- Operator authorizes restoration/verification of the existing capped workspace
  mount, not formatting/recreating/deleting the image or changing the daemon.
- Set exact IPC message/frame bounds, startup/stop timeouts and log caps in the
  implementation contract. Use the accepted private per-container attach/pipe;
  identity comes from supervisor binding, never runner-supplied owner/epoch.
- Prove startup failure, escaped descendants, timeout/kill cleanup and no writes
  before workspace reuse, retaining filesystem evidence on failure. No claim of
  provider cancellation, remote rollback or production containment follows.

No commit/push, system/mount changes, package promotion, image launch or live
provider/credential access is inferred from this planning document.
