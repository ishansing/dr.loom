# P2 — Static-bundle publisher metadata

Checked **2026-10-30**. **Result: neither historical archive SHA256 is
authenticated by the publisher records inspected.** Exact filenames remain
published, but HTTP metadata is not a digest or build attestation. This is an
evidence gap, not a finding of tampering or a new upstream bug.

## Inputs and trust boundary

[G0 lines 64–74](../phase-0/06-g0-decision-pack.md) records the owner-authorized
static installation under `$HOME/bin` and explicitly unauthenticated hashes:

| Linux amd64 archive | Historical recorded SHA256 |
| --- | --- |
| `docker-29.9.2.tgz` | `9ac225999fd5e863f7694c728ef23d480616b1e5639328fa309befd4243d69eb` |
| `docker-rootless-extras-29.9.2.tgz` | `f2663b230a7afc13dea88fc589685331d01f5f3fc458b92ab40e2388db452ed2` |

[Research22](22-p2-selected-runtime-artifacts.md) is historical input here:
associated peer dockerd SHA256
`3a6132d4d99c1437e3422599f802207a3def9ba4de00ec1004a8e40d2740b9b0`
differs from Arch's system artifact. Nearby runtime candidates report clean
release VCS metadata, but active dependency selection and source/build equivalence
remain unproven. No local executable, archive, member, cache, process, daemon,
worker or cgroup was read in this source-only task.

## Exact current publisher records

All URLs below were requested on 2026-10-30; statuses describe those responses,
not necessarily the publisher state at the original 2026-10-22 download.

1. [Docker stable x86_64 index](https://download.docker.com/linux/static/stable/x86_64/)
   — GET **200**, HTML, Content-Length 48,283. Both exact filenames appear, each
   dated `2026-10-20 20:07:04`; rounded sizes are 82MB and 11MB. Filtering the
   index for version/checksum/signature/attestation names returned only those two
   version entries. This establishes discoverability, not SHA256 or completeness
   of all publisher records elsewhere.
2. [Docker archive](https://download.docker.com/linux/static/stable/x86_64/docker-29.9.2.tgz)
   — **HEAD only, 200**, application/x-compressed-tar; Content-Length **86,374,273**;
   ETag `"7653bd06bdfaa08cfbb51aaca6deb1b7"`;
   Last-Modified `Tue, 20 Oct 2026 23:32:25 GMT`.
3. [Rootless-extras archive](https://download.docker.com/linux/static/stable/x86_64/docker-rootless-extras-29.9.2.tgz)
   — **HEAD only, 200**, application/x-compressed-tar; Content-Length **12,013,420**;
   ETag `"cd6e7eef5ab7fae8a8fb1fe8ad7adef3"`;
   same Last-Modified. Neither archive response redirected; no archive body was
   requested. ETags, lengths and timestamps are **not SHA256/provenance**.

### Targeted checksum/signature candidates

These exact conventional candidates each returned GET **404**, small HTML
`NoSuchKey` responses (375–425 declared bytes), on 2026-10-30:

- [docker-29.9.2.tgz.sha256](https://download.docker.com/linux/static/stable/x86_64/docker-29.9.2.tgz.sha256)
- [docker-rootless-extras-29.9.2.tgz.sha256](https://download.docker.com/linux/static/stable/x86_64/docker-rootless-extras-29.9.2.tgz.sha256)
- [docker-29.9.2.tgz.sha256sum](https://download.docker.com/linux/static/stable/x86_64/docker-29.9.2.tgz.sha256sum)
- [docker-rootless-extras-29.9.2.tgz.sha256sum](https://download.docker.com/linux/static/stable/x86_64/docker-rootless-extras-29.9.2.tgz.sha256sum)
- [sha256sum.txt](https://download.docker.com/linux/static/stable/x86_64/sha256sum.txt)
- [SHA256SUMS](https://download.docker.com/linux/static/stable/x86_64/SHA256SUMS)
- [docker-29.9.2.tgz.asc](https://download.docker.com/linux/static/stable/x86_64/docker-29.9.2.tgz.asc)
- [docker-rootless-extras-29.9.2.tgz.asc](https://download.docker.com/linux/static/stable/x86_64/docker-rootless-extras-29.9.2.tgz.asc)

These are **tested guesses**, not documented publisher endpoints. Their absence
does not prove Docker never published checksums/signatures under another path,
name, service or historical state.

### Official documentation and release metadata

- [Installation docs](https://docs.docker.com/engine/install/binaries/) — GET **200**;
  rendered HTML exceeded the approximately 256KiB target and was not used as
  evidence for page contents. The [official Markdown source](https://raw.githubusercontent.com/docker/docs/main/content/manuals/engine/install/binaries.md)
  — GET **200**, text/plain — was inspected instead. Its Linux installation
  section links the static stable directory and instructs choosing platform and
  version; it provides no exact29.9.2 digest or static-tarball verification record.
  It warns static installations lack automatic security updates. This is mutable
  current documentation, not a historical signed publication.
- [Moby exact release API](https://api.github.com/repos/moby/moby/releases/tags/docker-v29.9.2)
  — GET **200**; release ID418790807, tag `docker-v29.9.2`, published/updated
  `2026-10-20T20:51:17Z`, `immutable:false`, `assets:[]`. Body discusses release
  changes and Go1.26.10, not either static filename or archive digest. Source
  tarball/zipball URLs were not followed. Empty assets describes this release
  record only, not all Docker distribution channels.
- Packaging tag discovery via GitHub API:
  [prefix v29.9.2](https://api.github.com/repos/docker/docker-ce-packaging/git/matching-refs/tags/v29.9.2)
  and [prefix29](https://api.github.com/repos/docker/docker-ce-packaging/git/matching-refs/tags/29)
  — GET **200**, each `[]` (no matching refs, not repository/tag absence).
  [Tags page](https://api.github.com/repos/docker/docker-ce-packaging/tags?per_page=100)
  — GET **200**, body not consumed because no Content-Length was available for
  the conservative metadata guard. No exact packaging tag/commit was established;
  no guessed raw recipe ref or broad build investigation followed. A recipe alone
  would not authenticate the two recorded static digests.

No search-engine inference is used. No inspected record supplied a publisher
SHA256, detached signature, static-file subject attestation or build-output digest
for these exact Linux amd64 filenames. OCI image attestations, source archive
checksums, source commits and Arch package artifacts cannot substitute for that.

## Missing evidence and next owner

1. **Publisher binding:** a first-party record naming exact version, Linux amd64
   filename and SHA256, plus its authentication basis. A signed checksum manifest
   or attestation requires a separately established publisher identity/trust root
   and actual signature verification. Neither a signature nor published digest
   was verified here.
2. **Historical binding:** evidence connecting that record to the original archive
   bytes/download. Equality to a currently published digest would strengthen the
   recorded hash, not retroactively prove the original transport/history.
3. **Installed-member/build binding:** independently approved comparison of trusted
   archive member bytes to current artifacts and authoritative build inputs;
   reproducibility is separate from a signed publication. None was attempted.

Smallest next **owner-authorized** action: ask the selected-build/distribution
owner to obtain Docker's existing authenticated checksum/attestation/build-output
record for these two filenames and hashes, including verification identity and
publication date. Do not invent a custom upload, publish an issue, download an
archive, replace the runtime or request another lifecycle to fill this gap.
If the owner cannot supply a record, retain provenance as unresolved; this report
grants no native observer admission, runtime qualification, reuse/reset or G2 closure.

## Collection limitations and handoff

**Researcher:21 targeted HTTP requests**, including four repeated requests after an initial
header-conversion error (their responses were not inspected), two HEAD attempts
per archive, and the guarded tags-page request. No redirects were followed.
Sidecar bodies were admitted only for text/JSON content types with declared
Content-Length below256KiB; no archive type was consumed. The rendered docs GET
used a post-read size check rather than a hard streaming cap: its oversized text
response is a collection-limit exception, not inspected documentary evidence.
Other admitted responses were small metadata/text; compressed Content-Length is
not an uncompressed body-size proof. No archive/package/source-archive download, source
execution, installation, upload or permission change occurred.

Only this report was written. Parent owns independent critical review and final
document/security gates; no application test, signature verification, trusted
secret scan or runtime check is claimed by this delegated report.

## Parent independent review — 2026-10-30

Original researcher report/hash retained before parent edits under private0700
key `static-publisher-metadata-hcsusr6a`. Parent independently issues15 additional
metadata requests: index GET, both archive HEADs, all eight candidate HEADs,
Markdown GET (plus a second bounded excerpt check), exact Moby release GET and
packaging tags-page GET. No archive body, redirect, daemon or Go access.

The assert-based private reader passes8 checks for exact request boundaries,
archive-GET/credential/foreign-host refusal, no redirects and bounded reads.
It accepts only text/JSON GET bodies with identity encoding and a256KiB+1 read
ceiling; oversized content fails rather than being fully consumed. All admitted
parent responses are small (largest48,283 bytes); candidate HEADs read zero bytes.
These bounded checks do not retrospectively erase the researcher's oversized
rendered-document collection exception.

Archive HEAD status/size/ETag/Last-Modified match the records above; none advertises
a value in the checked Digest, Content-Digest or x-amz-checksum-sha256 headers.
Index still lists only the two version entries among filtered names; all eight
candidate HEADs return404. Bounded Markdown source is9,547 bytes, links the stable
directory without the architecture suffix, and warns about lack of automatic
security updates; no exact filename/hash occurs. Release API still has no assets
or matching body digest. No install/doc command is executed.

Parent safely consumes the previously header-blocked packaging tags page:
GET200,46,809 bytes,100 tag records, no name containing29.9.2. This supersedes the
body-not-inspected limitation for that first page only; no universal tag absence
or exact source/build/artifact binding follows. Its body SHA256 is a capture
identity, not a digest for either Docker bundle.

Current publisher availability is corroborated; neither historical archive hash
is authenticated by these inspected records. Exact parent commands/exits, source/
response hashes and excerpts are retained privately. Parent final scoped gates
pass: pinned scanner identity, four document/11 private-artifact scans,37 local
links/anchors, governance/protected-file/review hash, original-return/parent-source/
response identities, private modes and whitespace. Original collection-limit
exception remains explicit; no application/native/signature or archive-body pass.
