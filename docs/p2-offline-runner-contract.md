# P2-A — owner-approved offline isolated-runner scope

Status: **inventory committed; read-only physical preflight in progress;
launcher/containment qualification pending**. Inventory commit: `264c0b2`.
Owner subsequently requested “commit and continue”; the historical preparation
baseline/approval chronology follows. PR #6 is now merged at `bd397e7`.
Baseline `8e148ed`; branch `feat/p2-isolated-runner` is stacked on research
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

## Proposed fixed profile and read-only evidence

| Item | Proposed launch contract / current evidence |
| --- | --- |
| Backend | Explicit operator-trusted local rootless Docker endpoint;29.9.2 currently reports rootless/seccomp/cgroupns/systemd/cgroup2/overlayfs. Context name alone is insufficient. No rootful/default fallback. |
| Image | Candidate official `oven/bun:1.4.4-slim`; Linux/amd64 manifest digest `sha256:13b43f8bb2c63f5d89c56205c4279b85620363296a00ada33ff7ad568f3688e7`. Launch by exact digest with pull disabled; missing image fails closed. |
| Manifest verification | Docker Hub tag index digest `sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4`; selected manifest/config content hashes verified against registry descriptors. No image layers pulled/executed, vulnerability scan, signature/provenance verification or runtime Bun-version qualification performed. |
| Process | Override image entrypoint with explicit Bun binary/owned read-only script; override empty default image user with nonzero container UID, proposed65532. No ambient SDK/resources, shell startup or host environment. Validate actual uid/gid and mount access, not just flags. |
| Resources | One worker,2 CPUs,4 GiB RAM,256 PIDs,20-minute maximum wall deadline, no restart policy. Rootfs read-only, ALL capabilities dropped, no-new-privileges, private PID/IPC/network namespaces; no host devices, privileged mode or daemon socket. Read back config and test actual enforcement. |
| Persistent writes | Only a dedicated run directory on the existing capped2 GiB ext4 workspace. The image exists, is operator-owned/regular/non-symlink/exactly2 GiB, but its mount is absent. Never fall back to an ordinary directory or ignored Docker storage-size option. |
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
Docker client config into the rootless daemon; no account login or workload ran.
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
