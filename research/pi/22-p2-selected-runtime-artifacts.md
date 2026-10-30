# P2 — Selected daemon/runtime artifacts (read-only)

Checked **2026-10-29**, following explicit owner approval after `aa0a6bb`.
**Outcome:** the associated daemon peer is anchored to an executable directory
under the controller-home prefix, with distinct runtime candidates from the system
packages. Their embedded revisions match the pinned releases and report clean
VCS state. **Active dependency selection, authenticated build provenance and native
worker admission remain unproven.** No worker handles or container lifecycle ran.

## Scope and evidence boundary

- Two diagnostic zero-HTTP connections and one `GET /v1.56/version` to the selected
  rootless Unix endpoint; no `/info`, inspect/list, containerd API or mutation.
- SO_PEERCRED, daemon proc/starttime/pidfd/executable/root and namespace rechecks;
  same diagnostic peer PID on the version connection. This is **not atomic
  socket-handler identity** or worker ownership proof.
- Fixed artifact names only: dockerd, containerd, containerd-shim-runc-v2, runc and
  rootlesskit. First inspect `/usr/bin` in controller and anchored daemon-root
  views, then these exact siblings of the proc-reported executable. No directory
  enumeration, process/child/FD scan, command line, environment or credential read.
- Executable parent traversal rejects symlinks/dot/parent components. Its dockerd
  entry matches the retained executable FD's device/inode and SHA256 before/after.
  Actual private paths, PIDs and namespace identifiers are omitted here.
- Existing Go tool reads metadata through read-only FDs; inspected binaries are
  never executed. GOENV is off; toolchain is local and proxy/sumdb are disabled,
  HOME is a fresh private directory. Raw Go output/build flags are not persisted.
  Telemetry caveat and subsequent explicit-off guard are recorded below; an
  environment request alone did not disable initial local counter collection.

## Fresh server and namespace observations

Engine29.9.2/GitCommit`0367cbe`, API1.56/minimum1.40, Go1.26.10, Linux/amd64 and
kernel7.2.8-9-omarchy remain unchanged. Components report containerd v2.4.2/base
`b7a25261e029d68978bbf290df0a62fc819b3c51`, runc1.5.2 (no commit supplied),
RootlessKit3.3.0 (no commit supplied), docker-init0.19.0/revision`de40ad0`.
These are server-reported fields, not independently authenticated build records.

Daemon/controller PID and cgroup namespace objects match; mount and user namespace
objects differ. These are daemon-only comparisons, not the runtime/shim/procfs/
worker namespace joins. Controller and daemon-root `/usr/bin` artifact hashes match
each other for all four files present there; rootlesskit is absent at that path.
Thus the mount-view distinction does not explain the peer/package byte difference
by itself. No cgroup filesystem or worker namespace was inspected.

## Executable location and artifact inventory

The associated peer is not deleted and retains SHA256
`3a6132d4d99c1437e3422599f802207a3def9ba4de00ec1004a8e40d2740b9b0`.
Its anchored parent matches the controller-home prefix, not system `/usr/bin`.
No recognized controller package owner was recorded for its reported path; that
filtered result alone does not prove no package manager could own it.

| Artifact | Controller and daemon-root `/usr/bin` SHA256 | Anchored peer-directory SHA256 |
| --- | --- | --- |
| dockerd | `32023e4076bc3f3ca84fcab975687bda3c2983a48bfae1c7009feda208022608` | `3a6132d4d99c1437e3422599f802207a3def9ba4de00ec1004a8e40d2740b9b0` |
| containerd | `f4777645464a290227180e598cc300667dd1c88ae973ad88f3a9b0fdb2a9a879` | `5e970f05f9feef7b89e6f38965ea1e91224644864e60bd6f5f3242d84e094228` |
| containerd-shim-runc-v2 | `d3aa80d720b80f70721a3e66997fcfc72fdfc4d5ef304094e0173e829dbf370d` | `7a0ed4065fc701913aabb26b73b7dd07d67b51b1cfe7721bd287161b3b26e865` |
| runc | `5040726d094a01c6aa69a9035b6fceb2c0feb115230be198e2930d41087e199a` | `6043541aca928890ab8ad0630cafd2b272c3880779d8ada1b3fe81bc22e80d20` |
| rootlesskit | absent at this path | `e4daafede0347d4efe2f5eddd5fc93ba1c29a1f94b9320c427f55bbbb1f79dc6` |

Fresh controller package records remain Docker1:29.9.2-1, containerd2.4.2-1
(also owns the system shim), runc1.5.2-1. Package ownership of these system paths
does not identify the different peer-directory files or running dependencies.

| Anchored peer-directory file | Whitelisted embedded build result |
| --- | --- |
| dockerd | module github.com/moby/moby/v2, `(devel)`; no whitelisted VCS/linker revision |
| containerd | module v2.4.2; revision b7a25261e029d68978bbf290df0a62fc819b3c51; vcs.modified=false |
| containerd-shim-runc-v2 | same module/base and vcs.modified=false |
| runc | module v1.5.2; revision 29dd3dc2b13b4123162e5fe132504bb4b15569f1; vcs.modified=false |
| rootlesskit | revision 888c3189e9cdf34dcdb19011e1c7c34eb94b5393; vcs.modified=false |

All metadata reads exit0. Module `(devel)` is now explicitly allowed by the
filter; earlier missing whitelisted module version did not establish missing
metadata. RootlessKit module identity was not emitted by this module whitelist.
System containerd **and shim** embed v2.4.2+dirty/vcs.modified=true at the same base;
system runc emits `(devel)` without a whitelisted VCS revision. These remain valid
system-artifact facts, **not facts about the active runtime chain**.

## Reconcile the historical installation record

[G0 setup evidence](../phase-0/06-g0-decision-pack.md) and
[ADR-006 setup](../../decisions.md#adr-006---2026-10-22-p0-support-profile)
record an owner-authorized static Docker/rootless-extras29.9.2 installation under
`$HOME/bin`, not adoption of Arch's system daemon. The home-prefix finding and
different sibling bytes are consistent with that setup; the exact installation
directory was not retained by the path-redacting output, so do not assert a more
specific fresh pathname match.

Historical downloaded bundle SHA256 values are:

- docker-29.9.2.tgz: `9ac225999fd5e863f7694c728ef23d480616b1e5639328fa309befd4243d69eb`
- docker-rootless-extras-29.9.2.tgz: `f2663b230a7afc13dea88fc589685331d01f5f3fc458b92ab40e2388db452ed2`

The G0 record explicitly says these Docker archive hashes were **recorded, not
independently authenticated**. This slice does not inspect caches, download/extract
archives or compare members. Therefore no authenticated archive→current-file or
source/recipe→binary equivalence is newly proved. Arch recipes in
[research20](20-p2-distribution-build-provenance.md) describe system packages,
not authoritative build provenance for this different peer directory.

## What closes and what remains blocked

**Narrowed:** the previous peer/package mismatch is now tied to an anchored
non-system executable directory. Actual nearby runtime candidates are hashed and
have clean metadata matching release revisions already resolved in
[research19](19-p2-backend-pid-provenance.md) and
[research21](21-p2-moby-pid-cgroup-trace.md). The dirty system build is not a reason
to label those candidates dirty or silently select the system binaries.

**Still open, in order:**

1. Authoritative static-bundle build/download provenance and current member-byte
   binding, especially dockerd's source/build inputs; clean VCS claims are not
   authenticated source or reproducibility evidence.
2. Actual selected containerd/shim/runc/RootlessKit executable chain and options.
   Being a sibling, matching reported version or sharing a directory is not
   process identity, runtime selection or a namespace/mount guarantee.
3. Independent current init identity (inspect can copy recovered cached PID),
   original assigned cgroup root/final OCI/delegation, controller procfs/mount joins,
   retained-handle permissions and lifetime. No worker access was attempted.

Next owner is the build/distribution owner for bundle evidence, then the trusted
supervisor/operator for a precisely scoped runtime-binding check. Existing source
semantics and this diagnostic collection do not qualify native observer admission,
absence of migrated/escaped writers, quiescence, reuse/reset, task completion or G2.
No extra lifecycle, runtime substitution/upgrade, process walk or worker acquisition
is authorized by the result. Preserve unknown inventory, pending actions and fences.

## Reproduction and validation

**Metadata-tool caveat:** the existing reader tool is Go1.27.3, distinct from the
daemon's reported Go1.26.10 build toolchain. Final validation's empty-tool-HOME
assertion failed: the initial runs created local telemetry counters/directories
despite GOTELEMETRY=off. Installed cmd/internal/telemetry and vendored telemetry
source default an absent mode file to `local` (uploads disabled), not `off`.
No user telemetry/config/cache was inspected; generated state is confined to the
fresh private HOME. No packet capture/upload verification was performed, so source
semantics are not observed egress proof. Do not call the initial runs telemetry-off.

A separate fresh private HOME with explicit `.config/go/telemetry/mode`=`off`
passes a bounded `go version` preflight without counter/upload state creation.
Only after that check, an explicit off mode file was added to the original
collector-owned HOME for future reruns; existing local counters were preserved.
Original command/result/source identities remain intact, and the failed empty-HOME
check is retained separately. Any rerun must verify that private mode file first;
the caller's actual HOME/config must never be substituted. No daemon connections
or runtime actions were added by this correction.

Private0700 evidence key `selected-runtime-provenance-fmsp4o1d` retains sources,
hashes, sanitized result JSON and exact command/exit manifests as0600 files:

- Isolated compile without pycache: all collector sources pass.
- `python3 -I -B <evidence>/collect.py --self-test`: exit0, peer/proc/pidfd/hash
  groups plus21 metadata/artifact checks including sentinel/non-ELF/symlink refusal.
- `python3 -I -B <evidence>/collect.py`: exit0, diagnostic-only result; one
  zero-HTTP connection and one GET/version, not runtime qualification.
- `python3 -I -B <evidence>/location.py --self-test`: exit0,10 path/anchoring checks.
- `python3 -I -B <evidence>/location.py`: exit0, one zero-HTTP follow-up; selected
  executable object/byte match and fixed sibling inventory, activeRuntimeChainProven=false.

No raw environment/arguments/credentials, upstream source execution, package/SDK
installation, worker handles, container/mount action, signals to runtime processes,
push or publication. Application/native/coverage tests are N/A for this evidence
and documentation slice. Final scoped checks pass: four document scans and20
private-artifact scans with pinned Gitleaks,39 local links/anchors, governance,
protected files/review hash, source/result identities, private evidence modes,
explicit-off future-run guard and whitespace. The initial empty-HOME assertion
remains failed/preserved; no original telemetry-off or observed egress pass follows.
