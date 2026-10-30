# P2 — Static-bundle archive/member verification

Verified **2026-10-30**, after explicit owner selection of **Verify archives**.
**Result:** both current publisher archives match the historical SHA256 records;
all five selected regular ELF members match the previously anchored2026-10-29
artifact hashes. This establishes **current HTTPS publisher bytes → recorded
artifact snapshot continuity**, not signed provenance, reproducible builds or
fresh running-process/runtime selection.

## Authorization and inputs

Owner approved exactly two official Linux x86_64 Docker29.9.2/extras downloads,
bounded size/digest checks and in-memory member hashing. No filesystem member
extraction, installation, execution, daemon/worker inspection or lifecycle.

- Historical archive hashes: [G0 setup](../phase-0/06-g0-decision-pack.md).
- Recorded artifact identities: [research22](22-p2-selected-runtime-artifacts.md),
  private2026-10-29 anchored peer-directory snapshot; no fresh executable read.
- Publication-metadata limits: [research23](23-p2-static-bundle-publisher-metadata.md).
  Its metadata-only outcome remains historical; this new approval permits bodies.
- Snapshot JSON SHA256:
  `619024520b17f993692bcbaabbdbf229fd1849701966b0ef997a352154e037a7`.

## Whole-archive results

Exactly two GET attempts, both200 over normal TLS, identity encoding, no redirects
or retries. Each full compressed size and SHA256 matches before tar parsing:

| Exact publisher URL | Bytes | Computed SHA256, equal to historical record |
| --- | ---: | --- |
| [docker-29.9.2.tgz](https://download.docker.com/linux/static/stable/x86_64/docker-29.9.2.tgz) | 86,374,273 | `9ac225999fd5e863f7694c728ef23d480616b1e5639328fa309befd4243d69eb` |
| [docker-rootless-extras-29.9.2.tgz](https://download.docker.com/linux/static/stable/x86_64/docker-rootless-extras-29.9.2.tgz) | 12,013,420 | `f2663b230a7afc13dea88fc589685331d01f5f3fc458b92ab40e2388db452ed2` |

Total compressed transfer98,387,693 bytes (~94MiB), below the100MiB total budget.
Fresh private filesystem free-space preflight required that total plus128MiB
reserve. Existing files would stop collection; no previous evidence overwritten.

## Selected member results

All selected entries are regular files with ELF magic; no links are followed.
Each digest below equals the corresponding **recorded** peer-directory artifact:

| Member | Uncompressed bytes | SHA256 |
| --- | ---: | --- |
| `docker/dockerd` | 102,937,400 | `3a6132d4d99c1437e3422599f802207a3def9ba4de00ec1004a8e40d2740b9b0` |
| `docker/containerd` | 39,473,314 | `5e970f05f9feef7b89e6f38965ea1e91224644864e60bd6f5f3242d84e094228` |
| `docker/containerd-shim-runc-v2` | 8,138,914 | `7a0ed4065fc701913aabb26b73b7dd07d67b51b1cfe7721bd287161b3b26e865` |
| `docker/runc` | 14,131,248 | `6043541aca928890ab8ad0630cafd2b272c3880779d8ada1b3fe81bc22e80d20` |
| `docker-rootless-extras/rootlesskit` | 23,960,353 | `e4daafede0347d4efe2f5eddd5fc93ba1c29a1f94b9320c427f55bbbb1f79dc6` |

Docker tar traverses9 entries/235,673,600 decoded bytes; extras traverses4 entries/
23,992,320 decoded bytes. Gzip streams are drained within the bound for completion/
CRC validation. Other regular files are skipped under the same decode limit,
not executed or declared equivalent to unmeasured installed files.

## Bounds and verifier evidence

Private stdlib verifier uses fixed HTTPS URLs and normal certificate validation;
redirects/alternate versions/hosts/query URLs fail. Compressed input uses64KiB
chunks, exact expected sizes and one120-second collection deadline. Per-archive
decode deadline is30 seconds (not beyond overall deadline), decoded cap768MiB,
per-member cap256MiB and at most64 entries. Gzip/TarFile streaming is read-only.

Before tarfile processes special metadata, a narrow TarInfo dispatch guard rejects
symlink/hardlink/sparse/PAX/longname records, unsafe paths and excessive sizes.
Installed Python3.15.2 dispatch source/hash is retained; self-tests exercise the
public stream interface to catch bypass of that guard. No extract/extractall or
member-path writes; extractfile returns an in-memory stream, not a disk extraction.
Selected missing/duplicate/type/ELF/size mismatches fail closed. Bad archive size/
digest stops before parsing; any failure stops subsequent download work and keeps
partial evidence rather than deleting it.

Test-first acceptance red: inert parser returns no member result and fails the
known synthetic ELF hash assertion. Then guarded self-tests pass for valid data,
traversal, links/special metadata, duplicates/missing members, header/size/deadline/
decoded bounds, gzip CRC, compressed size/digest and fixed URL/no-redirect policy.
No network occurs during those self-checks.

Private0700 evidence key `static-member-verification-7mvsdobo` retains both raw
archives (nonexecutable0600), source, input snapshot, red/green logs, exact command/
exit and archive/member/result hashes as0600 files. Actual verifier command
`python3 -I -B <evidence>/verify.py` exits0 with
`result=verified-against-recorded-snapshot`, two archive GET attempts and five
member matches. No Go/telemetry command or current daemon/runtime access occurred.

## What this closes — and does not

**Closed for this evidence slice:** the historical archive-hash records agree
with bytes served today by the exact publisher HTTPS endpoints. Their selected
members match the2026-10-29 recorded associated daemon executable and sibling
runtime candidates. The system Arch artifacts are not substituted. The earlier
metadata-only inability to compute those archive/member hashes is resolved under
separate owner approval; no claim is retroactively added to that earlier slice.

**Still unproved:** detached signatures/attestations, original-download transport
history, source/recipe/toolchain→binary reproducibility and fresh live executable
or active containerd/shim/runc/RootlessKit selection. HTTPS origin and equal hashes
are the trust basis here, not independently verified artifact signing.

Remaining native gates include actual dependency chain/options and namespace/
procfs/mount joins, independent fresh init identity rather than recovered inspect
PID, originally assigned cgroup/final OCI/delegation and retained worker-handle
permissions/lifetime. No migration/escaped-writer exclusion, quiescence, reuse/reset,
task completion, native implementation or G2 approval follows. No container/worker
lifecycle is authorized by these matches. Keep unresolved inventory/actions/fences.

Application/native/coverage/drill/dependency gates are N/A for this private
artifact verifier/document-only slice. Final scoped checks pass: four document/
11 private-text secret scans,39 local links/anchors, governance/protected files/
old review hash, red/source/result/snapshot identities, independent archive rehash,
private modes and whitespace. Binary archives are not secret-scanned or release-
qualified; they are private evidence, not commit candidates. Full task diff reviewed.
