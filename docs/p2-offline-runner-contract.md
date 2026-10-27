# P2-A — owner-approved offline isolated-runner scope

Status: **inventory, physical preflight and IPC committed; governed synthetic
bootstrap in progress; independent cleanup/containment qualification pending**.
Inventory `264c0b2`, physical preflight `e40acc3`, IPC/owned worker `3ed86ee`.

Bootstrap implementation committed as `8befd5a`. Owner approved a split verification
gate: native full physical tests with fresh private state/TMPDIR preserve mapped
UID checks; portable/read-only preflight retains Bubblewrap empty-`/tmp` tests.
The original combined Bubblewrap gate failed due to unmapped subordinate IDs and
is retained as failed evidence, not relabeled passed. The replacement does not
prove controller filesystem isolation or literal empty host `/tmp`; no G2 closure
or independent cleanup qualification follows. Exact commands/results live in SPEC.
The approved split run passes:216 native tests at100% function/98.61% line
coverage and200 portable/read-only preflight tests with initially-empty `/tmp`.
These are bootstrap-local verification results, not full containment qualification.

Bounded temp-cap continuation extends the owned access fixture, not the runner:
verify both fixed temp roots are64 MiB tmpfs, then write64 MiB of synthetic data
to each and require the next bounded write to fail ENOSPC. Total attempt ceiling
is130 MiB with a single reusable1 MiB buffer; the persistent workspace is not
filled. Candidate hash binds the observed facts; pending/unknown inventory stays
unchanged. CPU/PID/memory/disk pressure and independent cleanup remain separate
qualification gates. See active SPEC for fresh test results and limitations.

PID-cap continuation attempts at most256 fixed sleeping children under the same
256-task cgroup, requires EAGAIN and increased local `pids.events max`, then kills
only recorded child handles and awaits their pre-registered exits before proposal.
Threads consume slots too; no fixed number of child processes is assumed. This
is bounded fixture proof of the PID controller, not independent descendant
quiescence, general runtime resilience at exhaustion or permission to reuse state.
The final PID-cap run passes216 native tests/3,279 assertions at unchanged100%
function/98.61% line coverage plus three repeated actual-access checks. Each
child's exit promise is captured before saturation; deferred first access after
saturation reproduced failure. Exact Bun internal cause is unconfirmed; no
runtime upgrade or extra task headroom is used to hide it. Broader CPU/memory/
persistent-disk and independent cleanup/recovery qualification remain open.

Detached-descendant continuation uses one bounded trusted child in a separate
session/process group, verified with numeric `/proc` identity. A delivered SIGTERM
is marked in its heartbeat followed by continued writes; parent ignores the IPC
stop so the supervisor must force-stop the domain. The host must observe live
heartbeat growth and then five unchanged100ms samples after daemon stop. This is
known-actor shutdown evidence only, not general descendant quiescence or automatic
reuse authority. Child has a30-second timer and1,500-byte heartbeat cap; parent
timer cannot bound its blocking IPC without host supervision. Supervisor-crash
recovery remains unqualified. All persistent synthetic evidence/containers stay
retained.

This regression passes in the217-test native corpus and three further physical
repetitions. Native coverage100% functions/98.60% lines; production-module
coverage unchanged, aggregate down0.01 point from new test-harness error/timeout
branches. Unknown inventory/pending action and successor reuse fences stay intact.

Supervisor-crash continuation runs the same synthetic worker under a separate
test controller, SIGKILLs that owned controller after live heartbeat, and reopens
the durable store. It must observe surviving worker activity, pending/unknown
inventory and fenced successor admission without another budget draw. Test-owned
cleanup independently rechecks image/mount/worker/ID/name/labels before stop and
records unknown only. This does not add automatic recovery or qualify daemon loss,
all descendant writers, workspace reuse or G2; no daemon restart/delete is used.
The218-test native corpus and three crash repetitions pass. Controller death
demonstrably leaves the worker running; only explicit test-owned cleanup stops it.
Native coverage100% functions/98.59% lines; production coverage unchanged, with
the0.01-point aggregate change from additional harness guards. Production
automatic crash reconciliation remains unimplemented and G2 stays open.

Owner-approved stop-only recovery is implemented locally as `stopSyntheticDomain`
in the existing launcher module (locally verified, no public CLI/index export).
An explicit trusted supervisor under the existing nonroot UID may stop only an
unresolved inventory-bound ID after fresh backend/image/native ownership proof.
Launch worker/workspace checks remain mandatory for create/start, but missing
launch paths and revoked leases/kill do not block this cleanup-only operation.
No new execution, name adoption, extra budget draw, deletion, lease revival or
quiescence/completion; unknown inventory and pending actions/reuse/reset fences
remain. Unbound/foreign/backend/corrupt states fail closed, repeated observed stop
does not dispatch another POST. Live cleanup and explicit recovery share one owned
stop implementation; automatic startup recovery and independent quiescence remain
unqualified. Renamed synthetic launch paths/evidence are retained, not repaired.
Fresh native verification passes221 tests/3,454 assertions at100% function/98.61%
line coverage, plus three repeated recovery corpora. This includes cleanup after
kill/lease release with both launch roots missing, strict authority/identity/
inventory errors and idempotent observed-stop behavior. The approved split gate's
reduced controller-isolation claim remains unchanged; G2 stays open.

Active-worker refusal continuation fault-injects503 backend unavailability and
foreign inspect labels only through the private test proxy. Worker heartbeat must
continue while recovery refuses without a POST, retains the original bound ID and
keeps action/cleanup/reuse uncertainty. After explicit restoration of the same
proxy, existing owned-stop recovery must stop the same worker without another
start or budget draw. No actual daemon restart, alternate endpoint/fallback,
production behavior change or general daemon-loss/quiescence proof is implied.
This passes in the221-test native corpus/3,528 assertions and three further
recovery repetitions. Production modules and coverage are unchanged; aggregate
100% functions/98.59% lines includes new unexercised defensive proxy-upgrade
refusal code. General daemon-loss and independent quiescence remain open.
Owner subsequently requested “commit and continue”; the historical preparation
baseline/approval chronology follows. PR #6 is now merged at `bd397e7`.
Historical preparation baseline `8e148ed`; branch `feat/p2-isolated-runner` was stacked on research
[PR #6](https://github.com/ishansing/dr.loom/pull/6), not merged master.
Owner requested “open pr to merge this research and continue with P2”. This
resumed P2 preparation. The owner subsequently stated “commit and Approved”,
approving the two decisions at the end of this document. This commit records
approval only; no schema change, image pull, mount or container run has occurred.

## Scope

One supervisor-owned rootless Docker domain runs an owned synthetic Bun worker.
No Pi SDK, framework skills, model calls, real privileged operation, Git promotion,
general shell service or task-success semantics. Existing P1 admission/audit/
kill/lease invariants stay outside the domain. This proves one seam toward G2,
not G2 itself or production support.

The separate standalone provenance/history build remains a later reminder after
this seam is verified; no part of it is implemented here.

## Fixed offline profile and evidence limits

| Item | Proposed launch contract / current evidence |
| --- | --- |
| Backend | Explicit operator-trusted local rootless Docker endpoint;29.9.2 currently reports rootless/seccomp/cgroupns/systemd/cgroup2/overlayfs. Context name alone is insufficient. No rootful/default fallback. |
| Image | Candidate official `oven/bun:1.4.4-slim`; Linux/amd64 manifest digest `sha256:13b43f8bb2c63f5d89c56205c4279b85620363296a00ada33ff7ad568f3688e7`. Launch by exact digest with pull disabled; missing image fails closed. |
| Manifest verification | Docker Hub tag index digest `sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4`; selected manifest/config content hashes verified against registry descriptors. Approved layers were subsequently pulled and owned-worker Bun1.4.4 observed. Vulnerability scan, signature/provenance verification and untrusted-runtime qualification remain pending. |
| Process | Override image entrypoint with explicit Bun binary/owned read-only script; override empty default image user with nonzero container UID, proposed65532. No ambient SDK/resources, shell startup or host environment. Validate actual uid/gid and mount access, not just flags. |
| Resources | One worker,2 CPUs,4 GiB RAM,256 PIDs,20-minute maximum wall deadline, no restart policy. Rootfs read-only, ALL capabilities dropped, no-new-privileges, private PID/IPC/network namespaces; no host devices, privileged mode or daemon socket. Read back config and test actual enforcement. |
| Persistent writes | Only a fresh dedicated run directory on the existing capped2 GiB ext4 workspace. The approved mount is restored, but preflight must still reject an absent/wrong mount. Never fall back to an ordinary directory or ignored Docker storage-size option. |
| Temp storage |64 MiB `/tmp` and64 MiB `/dev/shm`; explicit mount modes, no writable root layer or additional volume. Accepted persistent cap does not include these separately bounded tmpfs mounts. |
| Network | `none`; no provider/broker/DNS/MCP access, port publication or implicit image pull at start. Registry metadata research is not permission to enable worker egress. |
| Logs | Docker logging disabled; private bounded attach streams only. No raw runner output or daemon diagnostic forwarded to persistent logs/operator. Retain only validated metadata and safe classified failures. |

Sources: accepted [ADR-006](../decisions.md#adr-006---2026-10-22-p0-support-profile),
[G0 mount/resource contract](../research/phase-0/06-g0-decision-pack.md#3-host-sandbox-and-deployment-target),
and read-only Docker/registry inspection on2026-10-25. Image metadata obtained from
`registry-1.docker.io/v2/oven/bun/manifests/1.4.4-slim`, selected immutable manifest
and config descriptor; anonymous registry bearer token was neither logged nor
persisted. This profile is owner-approved scope, not evidence the image meets
every control.

## Nonroot mount ownership is a real preflight, not a name check

Continuation evidence: the existing image was mapped by noninteractive udisks;
the expected filesystem was already mounted when the explicit mount returned AlreadyMounted.
The exact ext4 mount is2 GiB-backed, rw/nosuid/nodev, with zero loop offset/limit.
The approved immutable Bun image was pulled anonymously with an empty temporary
Docker client config into the rootless daemon; no account login or workload ran at
that preflight stage. Governed owned-worker bootstrap follows below.
Read-only preflight checks actual visible mount IDs, backing inode and filesystem
size, rejecting symlinks, nested bind aliases and input on the writable filesystem.
This is not workload UID mapping, resource enforcement or cleanup qualification.

Rootless daemon UID mappings differ from ordinary host identity. The old ext4
image's owner does not establish that container UID65532 can write, or that the
trusted supervisor can read the resulting evidence. Do not solve this with a
world-writable workspace, blanket recursive chown, privileged helper or UID0
worker fallback. Provision only a new dedicated run directory under an explicitly
approved mapping/permission scheme, preserve existing data, then test workload
write + supervisor read + denied writes outside that directory.

Restoring the old mount and provisioning its narrow run directory are now
owner-authorized within this scope. No formatting/recreation/deletion, boot/linger changes,
daemon restart or rootful-context modification is part of this proposal.

## Private transport — proposed v1 bounds

- One supervisor-owned attach/pipe session per owned container. Host binds
  run/thread/workspace/owner/epoch/launch identity; worker messages cannot set them.
- UTF-8 newline-delimited JSON, one frame at a time, maximum4 KiB encoded bytes
  per frame and64 KiB combined stdout/stderr per domain. Reject malformed UTF-8,
  unknown fields/version/type, oversized/incomplete frames and output after a
  terminal frame. No arbitrary runner-supplied host paths or commands.
- Minimal worker frames: `ready` and `candidate-proposed`, each with `version:1`
  and monotonic integer sequence starting1. A candidate frame names only the
  fixture's fixed `candidate.txt` and lowercase SHA256; no arbitrary prose/body.
- Supervisor command set: one fixed `start` and cooperative `stop`; no generic
  execute/approval/reset/grant/provider operation. Domain destruction is not a
  worker command. Protocol success is not candidate verification or completion.
- Stderr or unexpected stdout is withheld; emit only a bounded safe host-side
  failure code. Parser/validator exception stops admission and requests cleanup.
  Never echo raw bytes to explain why they failed. Limits bound memory even if
  no newline arrives; exceeding them triggers domain stop, not silent truncation.

These are reversible implementation defaults for review, not a public protocol
release. Exact schemas and deterministic encoding fixtures precede code.

### Private v1 transport/worker implementation cut

`RunnerOutput` in `src/runner-protocol.ts` incrementally consumes Docker1.56's
non-TTY8-byte multiplexed headers and strictly bounded NDJSON. Only stdout1 is
accepted; stderr2, stdin echo0, unknown streams, nonzero reserved header bytes and
empty payload frames fail closed. The parser does not implement a general Docker
stream viewer. Headers announce unsigned big-endian payload lengths, charged
against the64 KiB aggregate before allocation. JSON frame limit includes newline.
Two exact frame shapes are accepted, in order:

```json
{"version":1,"type":"ready","seq":1}
{"version":1,"type":"candidate-proposed","seq":2,"path":"candidate.txt","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
```

The displayed hash is synthetic. Unknown/missing fields, malformed UTF-8/JSON,
BOM-prefixed JSON, wrong sequence/path/hash and partial/trailing output reject.
Any error poisons the parser; only `runner-output:invalid` escapes. `finish()` is
required for a normal terminal stream, but even successful finish is not proof of
worker exit, cleanup, file contents or task success. Fixed command encodings:

```json
{"version":1,"type":"start"}
{"version":1,"type":"stop"}
```

Each encoded command ends with one newline. The self-contained owned fixture
`tests/fixtures/runner-worker.ts` starts ready, creates only `candidate.txt` with
fixed synthetic text using exclusive create on start, proposes its hash and waits
for stop. No start means no write; existing candidates are never overwritten.
Malformed/foreign/repeated-start/oversized/partial input or EOF without stop exits
64, withholding diagnostics. Native tests use empty environment/temporary cwd
and `--no-env-file`; no Docker workload, identity mapping/access or descendant
containment is qualified by those subprocess tests.

## Governed synthetic bootstrap — not independent cleanup qualification

`src/runner-launch.ts` owns the selected-backend bootstrap. This first executable
profile accepts trusted root supervisor authority only; grant-based launch requires
a shared per-dispatch revalidation contract before it can be enabled. There is no
public run CLI, SDK/provider integration or generic sandbox driver.

Preflight and sealed worker hash precede atomic policy/budget/audit/inventory
admission. Require an empty synthetic workspace both before admission and after
create/before start; reject/preserve existing data or staged ambient cwd config.
The executable profile atomically fences any unresolved domain in the same store,
even disjoint roots, honoring its one-worker ceiling without changing generic
metadata admission. Duplicate launch IDs never restart/replay. All effects use
fresh host kill/lease/deadline gates, ignoring a caller's fixture clock.

Create only the fixed digest/nonroot/resource/no-network/no-log profile, bind the
native64-hex ID before start, inspect name/image/labels/security/mounts, and attach
through a private native Unix HTTP upgrade. Start acknowledgment delay consumes
the monotonic10-second ready budget; it never renews it. Poll active authority
every100ms. A valid proposal receives the private stop command and2-second grace;
failed/poisoned channels close immediately, then owned Docker stop provides
SIGTERM/2-second/KILL cleanup. Never stop an unproven/foreign identity or retry an
uncertain create/start. Raw daemon/worker diagnostics stay withheld.

Actual lab bootstrap observes real/effective UID/GID65532, candidate ownership
mapped to165531, supervisor-read access, denied root/input/outside writes,
no-new-privileges/zero effective capabilities and configured cgroup limits. Only
new exact input/workspace paths receive measured named-user ACLs; ordinary group
and other entries remain denied. Candidate0640 preserves the named supervisor
read mask;0600 was proven to mask it off. Failed original evidence is retained,
not repaired with chown, broad ACL changes or permissive fallback.

Even a normal observed zero-exit stop records **unknown/unqualified cleanup**, keeps
inventory unresolved and the native action pending, and blocks reuse/reset.
`stopped` is a daemon observation, not descendant quiescence, candidate verification
or task completion. Native proxy faults exercise uncertainty/config/ownership
failures against the actual selected backend without enabling unsafe flags.
Durable synthetic DB/input evidence and stopped/created containers are retained.
Actual over-limit tests, escaped descendants, supervisor-crash/daemon-loss recovery,
image security review and independent quiescence remain mandatory before support;
no G2 closure or untrusted execution is inferred from this bootstrap.

## Admission, durable launch inventory and cleanup

A supervisor cannot safely recover containers after its own crash using only an
in-memory handle. Owner-approved direction: additive **schema6 domain launch/event
inventory** in Loom's existing store owner. Exact SQL/types/migration must be
specified in the active phase before test-first implementation; do not add ad-hoc side tables,
reinterpret synthetic outbox adapters as real Docker effects, or install another
authoritative DB.

An immutable launch record must bind stable launch ID, exact image/config digest,
host-established run/thread/epoch and owned target identity. Record admission and
uncertain create/start/stop observations durably. Worker cannot provide its own
container identity or authoritative lifecycle. Preserve late observations after
kill without treating them as fresh admission or successful task completion.

Proposed lifecycle:

1. Preflight explicit endpoint, qualified image, mount/resource/user prerequisites
   and known existing domain inventory. No untracked create/start during preflight.
2. Under the existing short live authorization transaction, bind immutable launch
   intent to final configuration and persist request/verdict before dispatch.
3. Create/start Docker domain outside the SQLite lock. Stable owned name/labels
   aid reconciliation, but inspect exact container/config ownership before any
   stop; never remove a foreign collision or blindly retry uncertain creation.
4. Ready timeout10 seconds; enforce the accepted wall deadline from the host.
   Recheck kill/lease during startup and while active. Kill racing an admitted
   external start may yield a late-start fact; stop/reconcile it, never claim the
   SQLite kill transaction atomically prevented Docker from starting.
5. Cooperative stop grace2 seconds, then Docker kill if necessary; allow a further
   bounded5-second inspection window. Timeout is unresolved cleanup, not a false
   quiescence claim. Internal timeout/protocol failure may stop its domain; it
   does not autonomously engage/reset the human-controlled kill latch.
6. Confirm domain stopped and prove no descendant/heartbeat writes before reuse.
   Docker state alone and cooperative abort ACK alone are insufficient fixture
   evidence. Preserve stopped container/filesystem on failure; no `--rm`, broad
   cleanup, automatic restart, lease resurrection or implicit kill reset.
7. On supervisor restart, reconcile persisted launch inventory against the trusted
   daemon before any successor writes. Wrong ownership or daemon loss blocks
   reuse; do not treat an unavailable daemon as proof that the worker is dead.

## Acceptance corpus before supported launch

The first implementation cut provides schema6 inventory only: atomic policy/
budget/native-audit admission, immutable config and container binding, late trusted
observations, metadata-level logical-workspace/writable-root reuse fences, and
domain-aware status/kill/reset snapshots. Read-back validates registered-run and
admission evidence. It neither launches Docker nor verifies physical roots,
containment, cleanup or task completion. See SPEC's active phase for evidence.

- Pure/native-process: strict framing/limits, no raw error leakage, final config
  binding, stale/killed admission, immutable inventory, duplicate IDs, rollback,
  identity spoofing and late observations. No Docker mock counts as containment.
- Actual selected rootless backend: read-only root/input; no host DB/home/socket/
  credentials/network; nonroot identity; CPU/memory/PID/temp/disk/log enforcement;
  startup exception, malformed/flooded output and deadline cleanup.
- Real supervisor/domain crashes at create/start/ready/stop boundaries; foreign
  name collision, daemon loss, detached descendants ignoring TERM, no writes after
  cleanup, preserved evidence and blocked successor reuse until quiescent.
- Full existing143-test conformance/coverage and ordered lint/typecheck/drill/
  audit/secret review. Rootless lab unavailable is a named blocked gate, not skip
  or fallback. No full G2 closure or live runtime qualification from this slice.

## Recorded owner decisions — 2026-10-25

The owner answered “commit and Approved” to both requested decisions:

1. **Approved:** bounded offline T-09/T-15 slice and additive durable domain
   inventory direction; exact schema/acceptance contract precedes code.
2. **Approved:** pull only the immutable image identified above for the lab and
   restore the existing workspace mount, with narrow nonroot run-directory
   provisioning. No formatting/deleting existing data, daemon changes, SDK install,
   live inference, extra spend or weaker-identity/storage fallback.

Contract commit authorized; push/merge and G2 closure are not. No application
implementation or container/mount operation is performed by this approval-record
commit. PR #6 remains independent. Rootless identity, mount mapping, image and
containment still require fresh preflight/evidence before support is claimed.
