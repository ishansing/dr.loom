# Loom CLI v1 — trusted-host, synthetic scope

Run from the trusted Loom checkout containing `FRAMEWORK_REF`. This CLI records
and orients; it does not execute runbooks, verify task completion or authenticate
human identity. Providers, real effects and production containment remain disabled.

## Store and authority prerequisites

The trusted host prepares/migrates a throwaway store with `openDb`/`initSchema`
and acquires its workspace lease through `acquireWorkspaceLease`. Use the actual
returned epoch, never an invented value. CLI init/record require the matching
run/thread/workspace/owner/epoch. There is no automatic lease acquisition or CLI
lease-management command. Renew explicitly through the host API if necessary.

Schema v5 adds immutable run metadata and ordered evidence links. Historical
transitions remain unchanged with unknown metadata; they cannot be adopted by
re-initializing their run ID. Older binaries reject v5. Rollback is a verified
pre-upgrade copy/restore plus reconciliation, not deleting newer history.

## Commands

All commands use short human output by default; add `--json` for machine output.
Failures have empty stdout, stderr with an actionable safe reason, and nonzero
exit. With `--json`, the stderr object is `{ok:false,reason}`. Unknown, duplicate
and command-inapplicable flags are rejected; only `--evidence` is repeatable.

```text
loom check-framework --skills-root PATH [--framework-root PATH] [--json]
loom init --db PATH --run ID --thread ID --workspace ID --owner ID --epoch N
  --runbook NAME --goal TEXT --skills-root PATH [--framework-root PATH]
  [--scale small|standard|greenfield|e2e] [--json]
loom record --db PATH --run ID --thread ID --workspace ID --owner ID --epoch N
  --phase NAME --status running|committed|failed|interrupted --resume POINT
  [--evidence REF ...] [--json]
loom status --db PATH --run ID [--json]
```

`init` registers a new run and its opening transition atomically under the live
gate. `record` opens one phase per thread; a terminal record must close that same
running phase. Different threads have separate phase state but share workspace
lease fencing. A committed phase is a recorded claim, **not** verified successful
task completion. There is no task-completion or run-reopening command.

Evidence is a pointer (`cmd:`, `file:`, `session:`, `url:`, `trace:`, `approval:` or
`archive:`), not a blob or credential. File references require
`file:locator@sha256:HEX` with 64 lowercase hexadecimal digits. Recording checks
format, not file content or successful verification. Hash content on demand at
the real verification boundary; this CLI never invents verification evidence.

Status uses a read-only connection and one snapshot. It reports last committed
work and current/running phase per thread, open approvals/actions, interrupted
actions, unresolved outbox, lease ownership/expiry, kills and explicit budget
modes. Missing DB is informational (`no runs`, exit0) and is never created.
Unknown run in an existing store is actionable failure; historical-only data is
labeled legacy/unregistered rather than assigned guessed metadata.

## Framework integrity

`FRAMEWORK_REF` is trusted expected configuration, not a self-asserted CLI
revision. The checker inspects actual Git HEAD/VERSION and framework file bytes
against Git blob identities, including the lock file. It does not run repository
filters, installers, hooks, upstream version checks or network calls.

Installed external skills must be explicitly supplied at `<skills-root>/<id>` for
every selected lock entry. Hashing uses the pinned method: locale-sorted relative
paths plus NUL, file bytes plus NUL. Missing/drifting content, malformed locks and
symlinked skill entries fail closed; no ambient global directory is consulted.
The source `path` fields in the lock are not installed-directory aliases.

The configured sibling is currently4.0.0 while Loom selects2.1.0. That mismatch
must fail; no re-pin, fetch or installation is performed to conceal it. Fixture
tests use explicit synthetic refs and Git trees under temporary storage, not a
claim that the real framework or provider installation is qualified. Filesystem
verification is point-in-time trusted-host evidence, not runtime containment.

## Synthetic kill and guarded reset

```text
loom kill status --db PATH --scope global|run:ID [--json]
loom kill plan-reset --db PATH --scope global|run:ID [--json]
loom kill engage --db PATH --scope global|run:ID --synthetic
  --actor human:ID --reason TEXT --evidence REF [--json]
loom kill reset --db PATH --scope global|run:ID --synthetic
  --actor human:ID --reason TEXT --evidence REF --snapshot HASH
  --cleanup-evidence REF [--json]
```

Critical changes require explicit synthetic intent and human attribution/evidence.
`human:` is host-trusted attribution syntax, not authentication. Reset consumes
the current plan's `snapshotHash`, refuses stale/blocked plans and requires
cleanup evidence. It never restores leases or resurrects cancelled work.
Already-admitted effects remain separately observable/reconcilable. There are
no real execution domains or remote effects in this qualified CLI scope.

## Offline operator drill

```bash
bun run drill
```

The self-checking drill creates a synthetic Git/skill installation and temporary
DB, exercises the real CLI in subprocesses, inspects pending/interrupted work,
engages kill, rejects a killed write, plans/resets, and proves the old lease still
cannot write. It uses public host APIs for store/lease and audit fixture setup.
All state is cleaned on exit; no providers or actual framework installation are
used. Output identifies `automated-fixture-only`; agent/CI execution is not a
human-run attestation. A human must execute/review the drill separately before
that acceptance item can be marked complete. G1/production approval is separate.
