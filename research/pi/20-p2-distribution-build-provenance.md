# P2 — Distribution/build provenance (research only)

Researched **2026-10-28** under SPEC's selected-artifact continuation and
[ADR-028](../../decisions.md#adr-028---2026-10-27-test-only-kernel-observer-acquisition).
**Outcome: exact Arch recipes and full Moby release commit now resolve; selected
peer artifact provenance remains open.** Ordinary HTTP rechecks returned real
PKGBUILD/API text after earlier Anubis responses. No challenge solving, source
execution, artifact download, install or runtime inspection occurred here.

## Parent-supplied local evidence, not recollected here

Installed records name docker `1:29.9.2-1`, containerd `2.4.2-1`, runc `1.5.2-1`.
Selected server reports Engine29.9.2/GitCommit`0367cbe`; local containerd embeds
`b7a25261e029d68978bbf290df0a62fc819b3c51`, module `v2.4.2+dirty` and
`vcs.modified=true`. Earlier limitations: [research19](19-p2-backend-pid-provenance.md).

Parent's new daemon-only SO_PEERCRED/proc/executable-FD diagnostic reports:

| Artifact | SHA256 |
| --- | --- |
| Associated selected peer `dockerd` | `3a6132d4d99c1437e3422599f802207a3def9ba4de00ec1004a8e40d2740b9b0` |
| Docker-package-owned `/usr/bin/dockerd` | `32023e4076bc3f3ca84fcab975687bda3c2983a48bfae1c7009feda208022608` |

Inodes differ; `atomicPeerBindingProven=false`: diagnostic association only, not
atomic socket-handler identity proof. A second zero-HTTP connection confirms the
same peer hash; offline Go `-m` through the passed read-only executable FD yields
module `github.com/moby/moby/v2`, but no whitelisted VCS/linker commit/module
version. Thus Arch's recipe cannot by itself qualify this different peer artifact.
No selected containerd/shim/runc executable identity follows from package records.

## Official distribution records

Arch `extra/x86_64` JSON matched these exact versions at fetch time, not immutable
historical attestations. Docker depends on containerd/runc without version pins;
containerd depends on runc. JSON has no source recipe, package digest or build
reproducibility result. Official archive indexes list the exact docker/containerd
filenames plus `.sig`; neither bytes nor signatures were downloaded/verified. [A]

| Package | Epoch / version / release | Build date UTC | Artifact filename |
| --- | --- | --- | --- |
| docker | `1 / 29.9.2 / 1` | `2026-10-20T23:42:57Z` | `docker-1:29.9.2-1-x86_64.pkg.tar.zst` |
| containerd | `0 / 2.4.2 / 1` | `2026-10-14T08:29:22Z` | `containerd-2.4.2-1-x86_64.pkg.tar.zst` |
| runc | `0 / 1.5.2 / 1` | `2026-09-25T23:30:59Z` | `runc-1.5.2-1-x86_64.pkg.tar.zst` |

## Exact Arch packaging revisions and intended recipes

Ordinary `fetch` rechecks return HTTP200 PKGBUILD text (with `pkgname=`, no Anubis
marker) and tag metadata. Commit-addressed recipes were then fetched separately.
Tag/API associations are observed metadata; no local signature verification. [B–D]

| Package release | Official tag | Tag API target | Peeled packaging commit |
| --- | --- | --- | --- |
| docker `1:29.9.2-1` | `1-29.9.2-1` | `cf8b241a17b5a43d2ce926c1739d6e09edf34524` | `73f823426870d8b4b6a98016b4e296f695583737` |
| containerd `2.4.2-1` | `2.4.2-1` | `02d75c78833ecbaa30a75f10c5dce0df1b37f416` | `813bc2edfa15d4677616b162ab60254786452bfc` |

Docker tag spelling was **discovered via official tag listing**, then individually
resolved; the earlier colon-bearing candidate was invalid as a Git ref, not a
valid tag whose source was missing. Epoch remains1 in the pinned PKGBUILD. [B, D]

**Docker source/checksum order**, exactly as declared by its pinned recipe: [D]

| Source | Declared SHA256 |
| --- | --- |
| `git+https://github.com/docker/cli.git#tag=v29.9.2` | `d353a0420a3d6e3380e1b01b2f1ae0e97cf5daadd0ca19937c6e4110026b14f2` |
| `git+https://github.com/moby/moby.git#tag=docker-v29.9.2` | `bfcc8479a718d7485852249cb2f0614fa5bbca2703cd80357109fd36ab3ebac0` |
| `git+https://github.com/krallin/tini.git#commit=de40ad007797e0dcd8b7126f27bb87401d224240` | `28a6641d508f60d47315efb3c85d97360188750a45bd6d3c8737d3f1a2b44121` |
| Local `docker.sysusers` (`g docker - -`) | `541826011a9836d05a2f42293d5f1beadf2ca8d89fb604487d61a013505678eb` |

No `prepare()`, patch source or patch application is declared. The recipe disables
LTO, exports host C/CGO flags, uses a synthetic GOPATH/`GO111MODULE=off`, and sets
GOFLAGS for PIE, trimpath, readonly modules, writable module cache, external linking,
uncompressed DWARF and Go build-ID notes. CLI uses `make VERSION=29.9.2 dynbinary`
and manpages. Daemon uses `hack/make.sh dynbinary` with `VERSION=29.9.2`, build tags
`seccomp journald apparmor`, and **DOCKER_GITCOMMIT from `git rev-parse --short HEAD`**.
Tini uses CMake (policy minimum3.5) and `make tini-static`; package installs daemon,
proxy, init, CLI, systemd/sysusers files, generated completions and manuals. [D]

**Moby resolution:** official `docker-v29.9.2` annotated tag object
`d7dfd6629b22aed77600050ab53695149b8c550d` targets commit
**`0367cbeb49b9d98cb0b4f51e95f7b54b4803e76c`**; API reports verified signature.
Its prefix matches the server's `0367cbe` and recipe's short-HEAD mechanism.
This resolves the release/source association, not peer byte/build equivalence. [E]

**Containerd:** pinned recipe selects
`git+https://github.com/containerd/containerd.git#tag=v2.4.2?signed`, declares
SHA256 `f3675dedf2914f32e5b6340568643e4230d219cc973f04687f9094acb7f920f1`, and
three allowed signing-key fingerprints. No patch source/application is declared.
`prepare()` does edit tracked `containerd.service` via
`sed -i 's,/sbin,/usr/bin,;s,/usr/local,/usr,'`; pinned upstream service actually
contains `/sbin/modprobe` and `/usr/local/bin/containerd`. This is a concrete
intended packaging modification, not merely a generic dirty-tree hypothesis. [C, F]

Build exports `GOFLAGS="-trimpath -mod=readonly -modcacherw"` and invokes make with
`VERSION=v2.4.2`, the same GO_BUILD_FLAGS, empty GO_GCFLAGS and
`EXTRA_LDFLAGS="-buildid="`, followed by `make VERSION=v2.4.2 man`.
`check()` declares `GOFLAGS="-trimpath" make test`; package uses PREFIX=/usr and
installs the edited service, manuals and shell completions. These are intended
commands, **not executed checks or proof of the actual build tree/toolchain**. [C]

Upstream `v2.4.2` resolves to the observed full base. Its pinned Makefile defaults
VERSION/REVISION dirty suffix to `.m` and injects version-package linker strings;
Arch overrides VERSION. Those strings are distinct from Go's embedded module
`+dirty`/`vcs.modified`. The tracked service edit is compatible with dirty metadata,
but no exact local/build-tree delta or metadata-generation path was reproduced.
Do not claim it exhaustively explains this binary, or proves absence/presence of
malicious changes. Declared source checksums were transcribed, not recomputed. [F]

## Fetch-time failures and remaining joins

Earlier dedicated-webfetch calls returned Anubis for docker/containerd main raw
PKGBUILD, version-shaped browser/raw PKGBUILD/.SRCINFO and tag APIs, and runc
`1.5.2-1` raw PKGBUILD. They are historical fetch-time failures, **superseded for
the recipes above**, not current unconditional source inaccessibility. Docker's
colon-bearing requests were malformed candidates. Earlier Moby short-commit API422
and raw `v29.9.2/daemon/inspect.go`404 did not establish release nonexistence: the
recipe identifies the different `docker-v29.9.2` tag. [H]

Source-host navigation reached `/sources/packages/` with no docker/containerd/runc
entries; candidate `/other/packages/docker/` and `/other/packages/containerd/`
returned404. No archive was fetched. These URL/listing limits add no tampering or
novel-upstream-bug evidence. Issue/PR deduplication was not performed. [I]

**Next owner: selected-build/distribution owner and parent.** Obtain authoritative
source/recipe/patchset and sanitized build evidence for the **different selected
peer bytes**; release-prefix agreement is insufficient. For Arch artifacts,
`.BUILDINFO`, exact toolchain/inputs, authenticated package hashes and reproducible
comparison remain absent. Review actual containerd dirty delta and selected
runtime/shim/runc identities separately. Do not substitute or upgrade the daemon.
Re-trace resolved Moby PID/state/cgroup semantics separately; not done in this slice.
RootlessKit/runc release sources in research19 remain release-only evidence.

Native observer mode is **not implemented**. No worker/cgroup acquisition,
lifecycle, quiescence, reset, reuse or G2 authority follows. Preserve unknown
inventory/pending action/fences. Source researcher changed only this report; parent owns final
document/whitespace/trusted-secret gates. No application/native/coverage tests apply.

## Primary-source ledger (new rechecks HTTP200 unless stated)

- **A:** https://archlinux.org/packages/extra/x86_64/docker/json/ ; https://archlinux.org/packages/extra/x86_64/containerd/json/ ; https://archlinux.org/packages/extra/x86_64/runc/json/ ; https://archive.archlinux.org/packages/d/docker/ ; https://archive.archlinux.org/packages/c/containerd/
- **B:** https://gitlab.archlinux.org/api/v4/projects/archlinux%2Fpackaging%2Fpackages%2Fdocker/repository/tags?per_page=10 ; https://gitlab.archlinux.org/api/v4/projects/archlinux%2Fpackaging%2Fpackages%2Fdocker/repository/tags/1-29.9.2-1
- **C:** https://gitlab.archlinux.org/api/v4/projects/archlinux%2Fpackaging%2Fpackages%2Fcontainerd/repository/tags/2.4.2-1 ; https://gitlab.archlinux.org/archlinux/packaging/packages/containerd/-/raw/2.4.2-1/PKGBUILD ; https://gitlab.archlinux.org/archlinux/packaging/packages/containerd/-/raw/813bc2edfa15d4677616b162ab60254786452bfc/PKGBUILD
- **D:** https://gitlab.archlinux.org/archlinux/packaging/packages/docker/-/raw/73f823426870d8b4b6a98016b4e296f695583737/PKGBUILD ; https://gitlab.archlinux.org/archlinux/packaging/packages/docker/-/raw/73f823426870d8b4b6a98016b4e296f695583737/docker.sysusers
- **E:** https://api.github.com/repos/moby/moby/git/ref/tags/docker-v29.9.2 ; https://api.github.com/repos/moby/moby/git/tags/d7dfd6629b22aed77600050ab53695149b8c550d
- **F:** https://api.github.com/repos/containerd/containerd/git/ref/tags/v2.4.2 ; https://api.github.com/repos/containerd/containerd/git/tags/49c2af6b7b0785ff636bed8b70a86f073ce8bd6e ; https://raw.githubusercontent.com/containerd/containerd/b7a25261e029d68978bbf290df0a62fc819b3c51/Makefile ; https://raw.githubusercontent.com/containerd/containerd/b7a25261e029d68978bbf290df0a62fc819b3c51/containerd.service
- **H (earlier Anubis):** `https://gitlab.archlinux.org/archlinux/packaging/packages/{docker,containerd}/-/raw/main/PKGBUILD`; docker `/-/tree/1:29.9.2-1`, `/-/raw/1%3A29.9.2-1/{PKGBUILD,.SRCINFO}` and API `/projects/archlinux%2Fpackaging%2Fpackages%2Fdocker/repository/tags/1%3A29.9.2-1`; containerd `/-/tree/2.4.2-1`, `/-/raw/2.4.2-1/{PKGBUILD,.SRCINFO}` and C's tag API; runc `/-/raw/1.5.2-1/PKGBUILD` under the same package-browser base. Brace notation abbreviates separate requests, not literal fetched URLs.
- **H (earlier422/404 respectively):** https://api.github.com/repos/moby/moby/commits/0367cbe ; https://raw.githubusercontent.com/moby/moby/v29.9.2/daemon/inspect.go
- **I (indexes):** https://sources.archlinux.org/ ; https://sources.archlinux.org/other/ ; https://sources.archlinux.org/sources/ ; https://sources.archlinux.org/sources/packages/ ; **404:** https://sources.archlinux.org/other/packages/docker/ ; https://sources.archlinux.org/other/packages/containerd/

Parent review independently confirmed official docker/containerd JSON records,
exact tag/packaging commit associations and immutable recipe text, Moby's full
release commit/signature metadata, and the base Makefile's distinct `.m` behavior.
Daemon-only artifact checks/self-checks and sanitized results are retained under
durable private key `peer-artifact-9aws8gnf`; the original researcher return is
archived there. No source-reference result changes native authority or qualification.
Parent final scoped checks pass: pinned scanner identity/seven scans,31 local
links/anchors, protected-file/governance identities, durable evidence hashes/modes
and whitespace. New research/governance diff remains uncommitted; no application,
native or coverage result is implied.
