# Pi Durable — recovery, storage and security boundaries

Reviewed **2026-10-20**. This is the storage/recovery portion of the Pi Durable
evaluation, not an adoption decision or an implementation plan.
For the overall verdict, runtime comparison and Node/Bun API proof, see
[12-pi-durable-adoption.md](12-pi-durable-adoption.md).

## Bottom line for Loom

**Potentially useful as an isolated runtime's recoverable execution journal;
not a replacement for Loom's authoritative ledger, authorization, kill,
outbox or verification boundaries.** Durable admission and task ownership
solve real restart bookkeeping. They do not make external effects exactly
once, provide multi-process ownership fencing, or certify task completion.
The upstream contracts explicitly retain those limits. [admission]
[nested-replay] [storage-contract] [ownership] [hook-errors]

Loom already requires external authority and an OS/container/VM execution
boundary in [SPEC.md](../../SPEC.md#runtime-architecture-and-security-boundary-2026-10-20-decision).
Its [mapping](07-loom-v01-mapping.md#the-layering-read-once-then-the-tables)
requires one writer per fact. `src/store.ts` is still a scaffold: WAL setup
at lines 38–43, simple transition inserts at 77–100, lease acquisition at
123–173 and audit inserts at 185–205 are not the complete enforcement
specified in SPEC. Pi Durable must not be treated as having silently filled
those gaps. This note recommends conditions only; it changes no ownership,
runtime pin or explicit `pi-durable` deferral.

## Scope and evidence labels

- **Inspected release:** Pi `v1.3.0`, commit
  `71023aec1546d6d677a65669c5665c0927ce0dd0` (**R**).
- **Inspected current source:** commit
  `fdce48eb404ec014adaf2ac10a3a53bc6b1740c2` (**C**). Current-only features
  below are not claims about published `1.3.0`.
- **Tested:** the parent's isolated installation of published
  `@earendil-works/pi-durable@1.3.0`, with fake model responses, Memory and
  Node SQLite storage. The parent verified npm integrity; this investigation
  did not independently verify the tarball or install dependencies.
- **Not tested:** current source execution, hard process kills, power loss,
  concurrent writers, real providers/MCP, sandbox containment, remote effect
  deduplication, or Loom integration. Upstream tests cited below were read,
  not run.

## 1. What is committed, and what is not

**Inspected (C):** Session serializes callbacks on one in-process mutation
line. It builds a batch, awaits `Storage.commit()` with caller cancellation
removed, adopts it, then publishes. A throwing callback discards its staged
changes. This is commit-before-observe for managed state, not a transaction
around arbitrary filesystem/network operations performed by callback or
tool code. [commit-line] [commit-publication]

**Inspected (R/C), tested (R):** a tool's final arguments and replay policy
are checkpointed before `execute()`. The terminal result is a later commit.
Therefore a process can fail after an external effect but before its result
is recorded. Unsafe replay reports uncertainty rather than pretending the
effect did not happen; safe replay may repeat it. [release-tool]
[current-tool]

**Inspected (C):** model recovery can resend a request; a committed partial
is converted to an aborted entry before requesting again. Upstream recovery
tests explicitly cover this. Provider session identity is affinity/cache
identity, not an effect-side deduplication contract. Do not infer exactly-once
provider billing or complete usage for an unrecorded request. [model-recovery]
[provider-identity]

**Inspected (C):** any storage error normally fails and closes the Session,
signals invocations and rejects waits; no Harness-level retry occurs. A
commit that threw may nevertheless have committed. Reopen and reuse the
submission key to discover admission, rather than inventing a new request.
Closing can remain pending while invocation code ignores cancellation.
[storage-failure]

**Loom implication:** managed transcript/checkpoint atomicity is useful,
but separate Loom business/outbox state cannot be atomically committed by
this Session transaction. Keep the identity-bound, idempotent handoff and
effect reconciliation required by SPEC; do not dual-write workflow truth
into Pi documents and Loom rows and hope recovery agrees.

## 2. Submission keys: admission deduplication, not payload identity

**Inspected (C), tested (R):** `requestId` is scoped to one conversation in
one store. Lookup precedes admission/busy handling. Reusing a key for a
different submission **type** rejects; reusing it for different content of
the **same type** returns the original submission without comparing the
payload. The same key in another conversation creates another submission.
Deduplication survives close/reopen. [admission] [release-key-tests]

The SQLite request lookup index is **not UNIQUE**. Its intended correctness
comes from the single-owner Session line, not a database uniqueness/fencing
constraint that supports competing Harnesses. [sqlite-schema]
[storage-contract]

**Loom implication:** establish the conversation/run/thread mapping outside
the untrusted runner. Use stable, scoped operation IDs and retain/validate
the immutable payload association in the responsible authority. A reused
key with changed intent otherwise silently gets an old answer. Keys are
neither authorization nor deduplication of the eventual deploy/payment/API
operation.

## 3. Tool recovery has a consequential authorization gap

**Inspected (R/C), tested (R):** ordinary execution prepares and validates
arguments, runs `beforeTool`, validates again, saves intent, then executes.
A throwing `beforeTool` blocks the call. This post-hook schema check is a
real improvement over the coding-agent behavior documented in
[11-pi-1.3.0-execution-coverage.md](11-pi-1.3.0-execution-coverage.md).
Schema validity is still not authorization of a changed target. [release-tool]
[current-tool]

Recovery from the saved `execute` checkpoint follows a different path:

1. Resolve the tool currently selected under that name.
2. Rerun only if **both** stored and current replay policies are `safe`.
3. Pass the stored arguments directly to `run()` — **no `beforeTool`,
   preparation or schema revalidation**.
4. Build the environment again using current conversation configuration.

Otherwise it returns `interrupted`, saying the tool may have partially run.
The default replay policy is unsafe. [release-tool] [current-tool]

**Tested (R):** interrupted a safe tool after an in-memory stand-in effect,
closed, replaced its implementation with a stricter incompatible schema
and a denying hook, changed cwd, then reopened. It executed a second time
with the old string arguments in the new cwd; the new hook never ran.
With stored `unsafe`, it did not run again and the model received the
interrupted/partial-execution diagnostic. These are cooperative close/reopen
tests, not kill-9 tests.

**Inspected (C):** nested call keys prevent re-admission when name/arguments
match and reuse committed results; mismatches reject. A nested call whose
result did not commit still follows its own replay policy. Nested result
documents retire when their caller becomes terminal; they are not a permanent
full-result audit archive. [nested-replay] [nested-source]

**Loom implication:** never put indispensable live authorization only in
`beforeTool`. A replay-safe owned operation must recheck final payload,
kill/deadline/grant/policy/owner+epoch at dispatch, including after restart.
Preserve a stable effect-side idempotency key or reconcile the target before
replay. Consider tool implementation/schema and environment drift during
upgrades; a tool's name and `replay: "safe"` are not a code/content pin.

## 4. Ownership and cancellation: useful structured concurrency, not rollback

**Inspected (C):** immutable owner edges form a tree. Ordinary foreground
work holds its owner in `completing` until that work is terminal; failed or
aborted owners cascade cancellation. Abort handlers run bottom-up.
Background tasks and everything below them are explicit boundaries:
ordinary abort and idle traversal exclude them. [ownership]

**Tested (R):** `conversation.abort()` terminated a foreground task and
`waitForIdle()` resolved while a background task remained running. Passing
`{ background: true }` reached that task too. `Harness.close()` waited for
an invocation that ignored its abort signal until the probe released it.

**Inspected (C):** close signals and joins **all tracked invocations**, then
returns their unfinished records to pending without recording a terminal
outcome. It is not equivalent to abort. A true interrupted `running` record
is counted as a restart; current source parks repeated crashes at the
default restart limit of five. That crash-loop parking is current-source
evidence, not a locally tested `1.3.0` promise. [close-join] [task-versions]

**Important limit:** the ownership guarantee is defined on committed task
records. Code a custom task executes after committing its terminal outcome
is explicitly outside abort ordering. Fire-and-forget host work, escaped
processes and already dispatched remote effects are not made transactional
by joining tracked invocations. A missing/incompatible task definition can
block progress; abort may yield `orphaned`, explicitly meaning its cleanup
code did not run and effects may remain. [ownership] [task-versions]

**Loom implication:** inventory background work explicitly and include it in
kill supervision. Persist unresolved dispatches, externally terminate the
whole execution domain, and do not give a successor the same writable
workspace while old writers survive. A Pi terminal receipt, idle wait or
abort ACK is not evidence that all external effects stopped.

## 5. Storage and upgrade boundaries

| Boundary | Inspected finding | Loom consequence |
| --- | --- | --- |
| Concurrent ownership | Upstream explicitly says one process owns storage; no cross-process locking. The Session line is local. [storage-contract] | Supervisor must enforce exclusive ownership and handover; SQLite write locks are not scheduler leadership or lease fencing. Do not open a successor over a live predecessor. |
| SQLite crash vs host failure | R and C use WAL with `synchronous=NORMAL`; newest acknowledged commits may be lost on power/host failure. [release-sqlite] [current-sqlite] [storage-contract] | Specify the required failure model. Never derive irreversible-effect certainty solely from this default. |
| JSONL | Sidecars precede a main commit marker; torn/unconfirmed tails are removed at recovery. Even `fsync:true` flushes sidecars before the marker but does **not** flush the ordinary main marker; acknowledged tail commits can disappear on host failure. Whole history stays in memory and main JSONL is initially uncompacted. [jsonl-contract] [storage-contract] | SQLite is the more plausible long-running local candidate; JSONL `fsync:true` is not a blanket power-loss durability promise. |
| SQL schema | R schema version 1; C adds version 2 by rebuilding tasks for `sleeping`. Migration application is transactional, and older code refuses newer schema. [release-migrations] [current-migrations] [migration-engine] | Back up/test upgrades on copies. Reverting npm code is not a database downgrade/rollback procedure. |
| Task/document versions | Missing or newer task definitions block; older input/checkpoints require migration. Typed document access rejects newer stored versions; read-only migration is memory-only. [task-versions] [document-versions] | Pin executable extension definitions and exercise pending/running/abort states across upgrades, not just opening an empty DB. Missing cleanup code is an operational failure. |
| Audit retention | Task records are replaced; nested result documents retire; JSONL latest-state sidecars can be reclaimed. [sqlite-schema] [nested-replay] [jsonl-contract] | Runtime storage is not Loom's append-only, actor-bound audit with independent evidence retention. |

No competing-writer, migration, or power-cut experiment was performed here.
The no-concurrent-owner rule is a supported-use constraint, not a newly found
SQLite vulnerability.

## 6. Hooks and independent verification

**Inspected (C), tested (R):** general hook exceptions are reported and
skipped unless cancellation is active. `beforeTool` locally converts an
exception into a block, but `afterTool` does not: a throwing redactor leaves
the previous result intact. The probe persisted `PRIVATE` with a successful
tool result. Progress is written to `pi.live` during execution, before the
final `afterTool` hook; final-result rewriting cannot retract that output.
Sanitization must cover output, structured results, details, diagnostics,
streamed state and spill files. [hook-runner] [current-tool]
[progress-output] [final-output]

**Inspected (C), tested (R):** `onYield` is a continuation hook. Its exception
is skipped, after which generation can append the final answer and settle
the submission `done`. The probe reproduced `done` after throwing
`verification failed`. That state means the runtime answered, not that
Loom's fresh verification passed. [hook-runner] [answer]

**Inspected (C):** an execution environment is explicitly trusted, not a
confinement boundary; even canonical-path checking is not protection against
rename/symlink races. Extensions/tool implementations execute host code.
Putting a remote environment behind file/shell tools does not by itself
isolate the rest of the runner. [environment-boundary]

**Loom implication:** retain the existing independent completion gate tied
to the exact candidate hash and reconciled privileged work. Missing,
throwing, cancelled or timed-out verification leaves it unverified/failed.
Use owned fail-closed output handling before persistence/exposure, and keep
the entire Pi execution domain away from Loom's DB and production secrets.

## 7. Credential-free proof performed

Temporary assertion script (outside Loom):
`/tmp/opencode/loom-pi-durable-review/recovery-probe.mjs`.

```sh
env -i PATH=/home/zeref/.local/share/mise/installs/node/26.7.0/bin:/usr/bin:/bin HOME=/tmp/opencode TMPDIR=/tmp/opencode node /tmp/opencode/loom-pi-durable-review/recovery-probe.mjs
```

Final result: **9 PASS lines**, covering submission-key scope/collision and
reopen, throwing pre-hook, invalid post-hook rewrite, throwing result hook,
throwing completion hook, safe recovery with changed hook/schema/environment,
unsafe recovery, background abort semantics, and close joining non-cooperative
invocation code. Final SQLite state retained at
`/tmp/opencode/loom-durable-recovery-tHRn2M`.

The first run stopped because the probe assumed current source's two-argument
`onReport(error, info)` signature; published `1.3.0` takes only `error`.
Corrected the assertion to inspect report presence and reran green; no
upstream failure is claimed for that setup mistake. A `diff -qr` of the
release/current `packages/durable` trees established substantial source
differences, including storage migrations and scheduler changes. Other
commands were source reads/searches. No providers, secrets, real external
effects, dependency/pin changes, adapter code or commits were involved.

## Conditional fit

An isolated pilot is defensible **if** Loom has a concrete need for durable
runtime conversation/tool recovery and the additional runtime API fits the
adapter. It should prove exclusive storage ownership, conservative replay
and dispatch-time authorization, drift-safe upgrades, background-work kill,
fail-closed output, and independent verification before production authority.
It is **not a fit as the missing authoritative control plane** under Loom's
current requirements, and duplicating Loom workflow truth in its documents
would increase reconciliation complexity rather than remove it.

## Immutable primary sources

[commit-line]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/src/session/session.ts#L106-L119
[commit-publication]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/src/session/session.ts#L716-L810
[release-tool]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/tool.ts#L119-L205
[current-tool]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/src/harness/tool.ts#L125-L211
[model-recovery]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/test/harness-generation-recovery.test.ts#L75-L163
[provider-identity]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/README.md#L113-L134
[storage-failure]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/docs/spec.md#L5282-L5347
[admission]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/src/harness/submissions.ts#L191-L240
[release-key-tests]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/test/harness-submissions.test.ts#L82-L107
[sqlite-schema]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/src/storage/sqlite/migrations.ts#L42-L89
[nested-replay]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/docs/spec.md#L3188-L3229
[nested-source]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/src/harness/tool.ts#L723-L785
[ownership]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/docs/spec.md#L2306-L2394
[close-join]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/src/harness/scheduler.ts#L515-L536
[task-versions]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/docs/spec.md#L2170-L2239
[storage-contract]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/README.md#L757-L785
[release-sqlite]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/storage/sqlite/node.ts#L183-L216
[current-sqlite]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/chord/src/sqlite/node.ts#L226-L249
[jsonl-contract]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/docs/spec.md#L5408-L5458
[release-migrations]: https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/storage/sqlite/migrations.ts#L88-L140
[current-migrations]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/src/storage/sqlite/migrations.ts#L91-L138
[migration-engine]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/chord/src/sqlite/migrations.ts#L11-L43
[document-versions]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/docs/spec.md#L1594-L1624
[hook-errors]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/docs/spec.md#L5335-L5347
[hook-runner]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/src/harness/scheduler.ts#L2096-L2113
[progress-output]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/src/harness/tool.ts#L483-L531
[final-output]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/src/harness/tool.ts#L540-L602
[answer]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/src/harness/generation.ts#L592-L622
[environment-boundary]: https://github.com/earendil-works/pi/blob/fdce48eb404ec014adaf2ac10a3a53bc6b1740c2/packages/durable/docs/spec.md#L3398-L3419
