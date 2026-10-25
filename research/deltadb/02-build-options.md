# Independent code + conversation history: build foundations and options

Research date: **2026-10-25**. Status: design research, not adoption or implementation.
Scope: one developer + AI, one trusted host/operator, initial Loom rootless runner;
no live models/providers, collaboration service, new repository or dependency installation.
Read: `AGENTS.md`, active DeltaDB research contract in `SPEC.md`, ADR-008/009,
and SPEC runtime/authority, evidence, outbox, durability and no-dual-authority boundaries.
Product/API claims about Delta belong to the separate product report; none are assumed here.
**Evidence** below describes upstream documentation; **proposal** describes our own design.
All web observations are dated above; mutable documentation is not a selected release pin.

## 1. Recommendation and decision boundary

- Build, if approved, a **standalone revisioned workspace/provenance service over existing storage**.
  Its value is linking immutable code candidates, conversation excerpts and causal events;
  not implementing a SQL parser, optimizer, pager, replication consensus or new database kernel.
- Start with SQLite metadata + Git objects/trees or a small content-addressed blob store (CAS).
  Prefer existing Git storage when ordinary code snapshots dominate; use SQLite BLOBs for a
  bounded first experiment if single-store atomicity materially simplifies correctness.
- Keep explicit immutable parent/event references even without CRDTs. A local sequence orders
  ingestion; it does not establish which prompt caused a change or whether that change is safe.
- Defer character-level CRDTs until simultaneous human editing/offline device sync is a real need.
  Independent agent branches and explicit merge review do not require a collaborative editor.
- Loom SQLite remains sole authority for tasks, grants, kill, leases, audit and completion.
  History may own immutable content, not a second authoritative workflow or authorization DB.
- First integration should be optional, read-only from Loom's decision perspective, eventually
  consistent, and bound to immutable artifact IDs/hashes. Outage must never grant authority.
- Do not claim Delta wire/file compatibility: this work establishes no public Delta protocol,
  format specification, source license or API stability contract. Implement independent behavior.

## 2. Options with substantial tradeoffs

| Option | Benefits | Costs / failure exposure | Fit / stage |
| --- | --- | --- | --- |
| A. Existing Git + sanitized conversation export/manifest | Least new infrastructure; portable code history; existing review/diff tools | Conversation DAG/search remains custom; Git commit chronology is not runtime causality; privacy and retention need separate handling | Baseline to beat; may fully satisfy initial need |
| B. SQLite metadata/events + Git object store | Transactions/indexes for relationships, reusable trees/blobs/diff/export; familiar recovery tools | SQLite and Git are not one transaction; keep-roots/GC coordination, Git config isolation and consistent backup become owned work | Preferred bounded service when snapshots dominate |
| C. SQLite metadata + own CAS, Git only at export | Explicit canonical manifests, independent content hash; avoids operational coupling to user Git refs | Own durable object publication, tree encoding, integrity traversal, GC, packing and Git mapping; many small objects can hurt | Use only for an evidenced mismatch in B |
| D. SQLite metadata + bounded BLOB payloads | Candidate root, bytes and events can commit in one content DB; simplest consistent backup | Larger WAL/backups; large binaries/streams need strict limits; later externalization requires migration | Strong small-pilot alternative, not a universal large-file design |
| E. Jujutsu-backed history + SQLite provenance | Working-copy revisions, operation views, persistent conflicts and change identity already modeled | Extra runtime/format/API lifecycle, Rust-library or CLI boundary; Git export loses semantics; no conversation model supplied | Compare before recreating sophisticated VCS semantics |
| F. Automerge/Yjs collaboration overlay | Reuses documented convergence/sync rather than inventing a CRDT | Admission/auth, storage durability, cross-document grouping, offline revocation and retention remain custom | Later editor layer, not initial authority store |
| G. PostgreSQL metadata/events + blobs | More independent concurrent writers; server-managed transactions/locking and operational tooling | Server lifecycle, access control, backups, pooling and migrations; no automatic branching of application records | Reconsider after measured SQLite contention, not now |
| H. New general-purpose database engine | Could control every storage/query/replication tradeoff | Must own recovery, concurrency, query execution, compatibility and long-term data correctness before product value | Reject for initial scope; no demonstrated requirement |

These are alternatives, not permission to introduce an abstraction supporting all of them.
SQLite's one-writer and WAL boundaries justify B/D for the stated local profile [S1];
PostgreSQL's isolation modes justify G as a future alternative, not proof of faster workloads [S17].

## 3. Git versus Jujutsu: reuse semantics carefully

**Git evidence.** Immutable blobs represent bytes; trees connect names/modes to contents;
commits connect a tree to history [S7]. A whole candidate tree is a better identity than
separate mutable refs for every file. Rename/copy detection is a diff transformation based
on content similarity, not proof that a permanent file identity moved [S9].
`update-ref <new> <old>` checks the expected old value. Its transactional stdin interface
can update several refs, but concurrent readers may still see a subset of updates [S8].
Therefore use one published revision root; do not equate multi-ref success with a
cross-process, multi-store snapshot. Git ref atomicity is not a filesystem durability proof.
Git object IDs may use SHA-1 or SHA-256 depending on repository format [S10]; keep a separately
specified artifact digest and algorithm tag rather than assuming every OID is Loom's SHA256.

**Jujutsu evidence.** Its operation log captures a repository *view* (heads/bookmarks/workspaces)
separately from the commit graph, with parent operations and recovery/undo semantics [S11].
Divergent operations can be merged, including conflicted bookmarks, instead of dropping one
writer [S12]. Its architecture distinguishes desired workspace revision from actual working
copy, which can become stale after another operation or a crash [S13]. This is valuable design
precedent for a provenance engine: an operation graph is not identical to source revisions.
The concurrency document also explicitly warns of backend/distributed-filesystem limitations;
do not generalize its lock-free conceptual model into a qualified NFS/Dropbox guarantee [S12].
Git compatibility is partial: latest docs describe unsupported attributes/hooks/LFS and special
conflict encoding/nonstandard change-ID headers that ordinary Git tooling may not preserve [S14].
These are mutable-main observations, not a claim about an installed or selected jj release.

**Proposal.** Borrow concepts, not an entire new VCS UI: immutable revision IDs, explicit
parents, expected-base checks, preserved failed/conflicted candidates and separate event history.
If jj becomes compelling, pin a release and test CLI/library compatibility before choosing it.
Do not operate jj and Git mutating the same authoritative working tree opportunistically.
Export only resolved candidates by default; keep unresolved alternatives in the native archive.

## 4. Minimal independent model: causality without false trust

Proposed immutable entities: content object; canonical file manifest; candidate revision;
conversation record/version; event envelope with typed edges; optional derived search index.
Mutable convenience heads are local content pointers, never permissions or task state.
An envelope should specify format version, event ID, origin namespace, parent IDs,
input revision, output revision, sanitized payload digest, and correlation/request ID.
Host-observed run/thread association must remain distinguishable from runner-asserted labels.
Runtime journal pointers identify exact exported record versions, not a writable alias to
Pi's current session. Store sanitized exports; never write back into Pi journal internals.

- Use explicit `observed`, `derived-from`, `proposed`, `supersedes`, `merged-from` edges.
  A message observed before a write is not automatically the write's sole cause.
- For one host, a transactional ingestion sequence + parent DAG suffices initially.
  Wall timestamps are display metadata; clock rollback must not reorder causal edges.
- Lamport's author explains partial causal order versus a consistent total order [S16].
  Logical-clock comparison alone does not establish the converse causal relationship;
  preserve actual parent/dependency links rather than infer them from numeric ordering.
- If replication arrives, define actor-ID allocation, counter persistence, duplicate identity,
  missing dependency quarantine and fork handling. Vector clocks can expose concurrency,
  but membership/metadata growth is a cost; hybrid timestamps are not a trust primitive.
- A hash chain detects changed bytes relative to a trusted root; it cannot authenticate a
  self-asserted author, prevent a trusted host rewriting the entire chain, or prove completeness.
- Do not execute tools, replay network requests, renew leases or complete tasks during replay.
  Rebuild derived views from events; actual effects remain Loom-owned, separately reconciled.
- Successful merge, persisted event, passing schema validation, model prose and a terminal
  runtime turn are **not** authorization or task verification. Fresh verification binds the
  exact final candidate hash and trusted environment, under Loom's existing gates.

## 5. File graph and atomic candidate publication

**Proposal, not an upstream guarantee:** canonical manifest maps normalized relative paths
to object digest, byte length, supported kind and executable flag; revision binds manifest
root, parent revision(s) and provenance references. Define sorting/encoding/domain-separated
hashing and test vectors once. Do not hash host-dependent JSON serialization by accident.

- Choose path identity first: immutable snapshots identify path + bytes; explicit stable file
  IDs are optional. If renames must be factual, record host-validated rename operations;
  distinguish inferred similarity from explicit rename and copies from continued identity.
- Handle delete/recreate, rename/rename, rename/delete, directory/file replacement and paths
  colliding after case-folding or Unicode normalization. Never silently normalize away bytes.
- Git accepts pathname bytes with restrictions; jj assumes UTF-8 [S10,S14]. An initial UTF-8,
  Linux-only contract is narrower and must reject unsupported imports explicitly, not corrupt them.
- Preserve binary bytes and executable bits. Git index documentation distinguishes regular
  files, symlinks and gitlinks, with limited regular-file permission modes [S10]. Do not promise
  ownership, ACLs, xattrs, hard-link identity, empty directories or full POSIX restoration.
- Initially reject symlinks and special files, or store symlink targets as inert metadata only.
  Never follow candidate-controlled symlinks on import/materialization; lexical `..` checks alone
  do not stop a symlink-swap race. Confine materialization and use qualified descriptor-based APIs.
- Submodules/LFS require an explicit support/rejection policy; a pointer is not its target bytes.
- Multi-file publication is a **manifest transaction**, not copying live files one by one.
  First stop/fence all candidate writers (including descendants), or use a qualified snapshot;
  an ordinary recursive scan during writes cannot establish one coherent point-in-time tree.
- Verify/stage every object, then atomically publish a single candidate root with its metadata.
  If objects are external, persist bytes and required file/directory syncs before DB publication;
  crash-before-DB leaves orphans, never an acknowledged root with intentionally missing bytes.
- Restore/materialize into a fresh disposable directory, verify its root, then use the approved
  Loom promotion mechanism. DB transactions do not atomically replace arbitrary working files.

## 6. SQLite durability, concurrency and operational limits

WAL permits concurrent readers and a writer, but only one writer; long readers can impede
checkpoint completion and grow WAL; startup/recovery can still return `SQLITE_BUSY` [S1].
Use short metadata transactions, bounded explicit busy behavior and expected-base conflicts.
Do not stream payloads or await services under writer locks. Distinguish retries after a known
rollback from uncertain commit acknowledgment; look up an idempotency key before resubmission.
WAL needs same-host shared memory and is not suitable for a network filesystem; transactions
across attached WAL DBs are not atomic as a set [S1]. Do not ATTACH Loom + history to fake unity.
ADR-008 requires WAL/FULL and readback: FULL syncs WAL on commit, whereas NORMAL may lose
acknowledged tail transactions after power/OS failure [S1,S2]. Guarantees depend on truthful
OS/device flushes; process `SIGKILL` is not power-loss testing [S5].
Fresh official WAL documentation reports the WAL-reset race fixed in 3.51.3 (2026-03-13), with
specific backports [S1]. Loom records 3.53.4; verify the future selected binary and bundled
SQLite, not just the wrapper package. This finding does not authorize an upgrade.
SQLite's default maximum string/BLOB is 1,000,000,000 bytes, with compile/runtime variations;
that theoretical allowance is not an acceptable upload or transaction size policy [S4].
Bound payloads, path counts, event parents, nesting, expanded archive size and query work.
No throughput/latency claim is established: measure actual repo mix, WAL growth, writer wait,
checkpoint/backup time, RSS and disk amplification on the selected storage stack.

## 7. Separate-repository contract; no distributed authority transaction

Separate repo helps reuse, isolated releases and testing; it also adds API/version skew,
installation/artifact verification, compatibility fixtures, ownership and recovery obligations.
Specify a small versioned protocol/export schema, not a direct import of private SQL tables.
Proposed capabilities: put/get immutable object; publish/get revision; append/query provenance;
export/import archive. No generic SQL endpoint, runner-chosen host path or approve/kill API.
Version protocol, event schema, manifest/hash format and internal DB schema separately;
reject unknown required fields/features and unsupported versions before mutating anything.
Immutable identifiers survive physical packing/migration. Encoding changes require an explicit
old→new ID mapping; do not silently relabel different bytes with existing verification hashes.

Proposed sequence avoiding cross-DB transactions:
1. Host captures/fences candidate, sanitizes content, persists and validates immutable objects.
2. History returns immutable revision/digest; this is evidence availability, not permission.
3. Loom's own transaction checks live authority and records exact hash/reference plus any
   required outbox intent with business/audit changes. No history call inside its write lock.
4. Relay projects committed facts using a stable event ID; history deduplicates identical
   retries and rejects the same ID with different bytes. Lost ACK is safely discoverable.
5. Dashboard reports source watermark/projection lag. Missing content means unavailable
   evidence; never infer approval/completion from history's latest head or claimed status.

Crash between 1–3 may leave orphan content; between 3–4 leaves projection lag. Those are
repairable without distributed commit. A read-only index is rebuildable; unique content is
not, and needs its own durable backup. Loom remains recoverable without conversation inference.
The history service must not become an artifact availability SPOF for existing Loom recovery:
retain required evidence durably under an approved retention contract before relying on it.
Initial read-only projection may have narrower availability than future promotion integration;
the latter needs an explicit SPEC/ADR and backup/GC handshake, not this research preference.

## 8. CRDT/local-first later; PostgreSQL only for an evidenced concurrency need

Automerge models maps/lists/text with retained change history; concurrent map assignment has
a deterministic winner, which is not necessarily the application-intended value [S18,S19].
Its repo storage uses snapshot/incremental chunks; compaction deletes only incorporated chunks,
not every chunk under a document prefix [S20]. Useful precedent, not automatic Loom durability.
Yjs documents binary updates as commutative, associative and idempotent when all updates arrive;
state vectors support difference sync. Merging updates alone does not GC deleted content [S21].
Choose Automerge for an evaluated change/history-centric document model, or Yjs for an evaluated
editor/update ecosystem; compare pinned libraries and adapters, not marketing performance claims.
Neither primitive provides atomic project-wide transactions across independent file documents.
Capture an explicit project root/version vector for a candidate, then materialize and verify it.
Do not change immutable conversation turns into collaboratively editable truth accidentally.
Offline edits may converge after kill; they remain untrusted proposals and cannot revive grants.
Text convergence can produce invalid syntax or subtly incorrect multi-file behavior. Even a
clean Git three-way merge can compile yet violate requirements; independent tests/review remain.
Do not invent a CRDT: reuse a qualified library if collaboration is approved; keep binary files
as explicit alternatives/conflicts. Preserve attribution separately from update-origin strings.

PostgreSQL 18 documents default Read Committed statement snapshots and Serializable retries
[S17]. A server branch could use per-workspace expected-base updates/row locks or carefully
retried serializable transactions. Keep non-idempotent effects out of retried transactions.
MVCC is not application revision control; immutable revisions/events and Git bridge remain owned.
A managed PostgreSQL offering would add provider/data/account/backup contracts; none is selected,
tested or adopted. Hosting it elsewhere would not move Loom authority under the current SPEC.

## 9. Compaction, retention, backup, export and migration

Separate logical history retention from physical compaction: repacking must preserve all
retained IDs/bytes/parents. Summaries are derived views, never substitutes for required evidence.
GC roots include retained revisions, conversations, Loom-referenced evidence, unfinished exports,
backup snapshots and in-flight publications. Start with no automatic destructive GC and quotas;
disk-full must produce explicit failure, not silent old-history deletion.
Later GC needs a host-controlled barrier/root inventory, mark/sweep generation, durable
quarantine and resumable deletion; revalidate roots before sweep. Age alone is not reachability.
Git cannot see SQLite-only references. Pin content roots in a dedicated ref namespace, or forbid
pruning until a coordinated root plan is qualified. Git warns concurrent pruning has risk;
`--prune=now` is especially unsafe with concurrent object creation [S15].
Deleting a conversation from the UI does not erase blobs, replicas, packfiles or backups.
Approve redaction/retention/export policy before ingesting real conversations; fail closed on
sanitizer errors. Content hashes can themselves reveal equality; avoid global cross-tenant CAS
if tenant isolation is later introduced. Encryption/key rotation needs its own approved design.
SQLite online backup or VACUUM INTO can create a consistent DB snapshot [S3]; copying only a live
main DB loses WAL state [S1]. With external CAS, freeze/pin the DB snapshot's reachable roots,
copy and verify exactly those objects, and publish the backup manifest last. DB-only backup is
incomplete. Maintain encryption/access protection and the ADR-008 separate-failure-domain plan.
Restore into a clone; verify DB integrity AND foreign keys AND every retained manifest/blob hash,
then reconcile Loom references/outbox watermarks before reopening writers. A digest is not backup.
Export a documented archive of canonical manifests, raw blobs, sanitized events/edges, version
metadata and checksums. Provide an offline validator; portable data must not require a running daemon.
Git bridge exports selected resolved code trees/commits and explicit revision↔OID mapping; store
conversation/provenance in a separately requested archive, not public commit messages by default.
Git fast-import is a documented bridge protocol [S22], not proof that every native semantic
round-trips; keep unsafe features disabled and never execute imported hooks/filters/config.
Migrations need fixed prior-version fixtures, interrupted-upgrade recovery and pre-change backup;
old readers must reject unknown schemas. Rollback restores a reviewed snapshot and reconciles
later records; it is not binary downgrade or a destructive invented down-migration.

## 10. Failure matrix and realistic validation corpus (proposed, not executed)

| Failure / corpus | Required observation and validation method |
| --- | --- |
| Crash at each object/staging/commit/ACK boundary | Fault hooks + real subprocess kill; no visible partial root, acknowledged data survives supported failure model, orphans discoverable |
| Power/storage failure | Separately approved VM/block-device fault lab, dropped/reordered writes and sync failures; process-kill corpus alone cannot close durability |
| Two candidate publishers from same base | Barrier-controlled processes; one expected-base head update wins, other revision retained/conflict explicit; no lost data |
| SQLite open/recovery/busy/checkpoint starvation | Real connections/processes, bounded waits, long reader, WAL growth metrics; explicit failure, no infinite retry |
| Root capture while runner/descendant writes | Delayed writers and post-stop races; capture refused until fencing/cleanup or qualified snapshot, no mixed candidate |
| Kill between capture, record and projection | Loom gate rejects stale authority; delayed history ingestion never executes or completes anything |
| Duplicate/reordered/replayed events | Same ID+bytes no-op, different bytes reject, missing parents quarantined; deterministic rebuilt view; no effects |
| Malicious paths/symlink swaps/binaries | Traversal, absolute/NUL/case/Unicode collisions, link races, devices/FIFOs, executable changes and arbitrary bytes; confined/rejected, exact round-trip |
| Merge and causal edge cases | Rename/delete, both rename, binary conflict, missing base, prompt forks, crossed dependencies; conflict preserved; separate semantic test intentionally fails on converged code |
| Disk-full/read-only/EIO/truncated object | Inject at blob, DB, checkpoint, backup and export boundaries; no success ACK with missing root, safe error and restart |
| Backup under writes/GC | Pinned snapshot roots, concurrent append and attempted deletion; restore clone validates all content and source watermarks |
| GC concurrent publication/backup | Fixed roots + property-generated DAGs; only unreachable eligible objects removed, restart sweep idempotent, pins never lost |
| Migration/format compatibility | Independent historical archives/DB fixtures, crash per step, unknown versions rejected, pre-change restore and ID mapping verified |
| Tampering/untrusted attribution/output | Byte edits, forged origin/human strings, hash mismatch, prompt injection and sanitizer exceptions; safe errors, no trust escalation or raw spill |
| Git bridge portability | Separate temporary repos, supported SHA modes/file kinds, no ambient hooks/filters; compare exact trees/modes and report nonrepresentable metadata |
| Future CRDT replication | Permuted/duplicated/dropped-until-resync updates, offline forks/GC/actor reuse and project-root capture; convergence plus independent candidate verification |

Use small deterministic fixtures plus seeded property tests, record seeds and expected roots.
Add scale distributions (many tiny files, large binary, long conversations, repeated edits),
not invented benchmark numbers. Measure p50/p95/p99 where sample size supports it, peak space,
recovery/restore duration and ingest/backlog limits. Approve thresholds from actual use before
claiming suitability. Existing Loom safety tests remain mandatory; this corpus is additional.

## 11. Stages and assumption-based effort ranges

Planning ranges only: one experienced developer, AI assistance with human review, local CLI,
Linux/local storage, no UI/auth/network replication or provider work; ordinary review access.
No measured productivity uplift, delivery promise, staffing conclusion or fixed cost is implied.

| Stage | Scope / gate | Rough focused developer effort |
| --- | --- | --- |
| 0 | Decide whether Git + sanitized manifests suffice; approve formats/retention and fixtures | 1–2 weeks |
| 1 | Independent offline content/revision/event core, exact snapshots, archive validator and Git export | 3–6 weeks |
| 2 | Crash/replay/concurrency/backup/restore/migration corpus, quotas, safe materialization | 4–8 additional weeks |
| 3 | Loom optional projection adapter/outbox dedup, compatibility fixtures, kill/lag/recovery proof | 2–5 additional weeks |
| 4 | Retention/GC, operator restore drills and workload qualification before durable reliance | 3–7 additional weeks |

These scoped estimates total roughly 13–28 focused developer-weeks, not elapsed completion;
stages can stop early if A suffices. UI, multi-OS, remote collaboration and product support
are excluded. A CRDT collaboration slice might add 6–16+ weeks for sync/auth/offline/GC/editor
qualification, not merely adding a library. A new database kernel is outside an estimable
bounded MVP here; do not extrapolate these ranges to it. Re-estimate after stage 0 measurements.

## 12. Licensing, evidence inventory and remaining unknowns

Independent implementation is not a license to copy proprietary code, branding or unpublished
protocols; public descriptions do not establish patent clearance or interoperability rights.
Git v2.56.0's COPYING specifies GPL v2 unless otherwise stated [L1]. Invoking a Git executable
and copying/linking Git source are different legal/distribution decisions; no blanket exemption
or copyleft conclusion for the proposed whole product is established here. Review packaging.
jj's inspected source is Apache-2.0 [L2]; Automerge and Yjs inspected core source are MIT [L3,L4].
Apache notices/patent terms and MIT notice retention apply; adapters, bindings, WASM bundles
and transitives require their own pinned license inventory. Core license is not ecosystem clearance.
SQLite deliverable code/docs are dedicated to public domain, with build-tool/jurisdiction
caveats [L5]. PostgreSQL uses its own permissive license [L6]. None is installed by this research.

Sources below were fetched/read on 2026-10-25. Exact source revisions are evidence anchors,
not adoption pins; jj/CRDT main snapshots must not be represented as released qualifications.

- [S1] SQLite WAL, §§2–4,6,9,11; page updated 2026-08-25: <https://sqlite.org/wal.html>.
- [S2] SQLite synchronous semantics: <https://sqlite.org/pragma.html#pragma_synchronous>.
- [S3] SQLite online backup, page updated 2025-11-13: <https://sqlite.org/backup.html>.
- [S4] SQLite limits, mutable docs: <https://sqlite.org/limits.html>; actual build limits need readback.
- [S5] SQLite atomic commit/hardware assumptions, rollback algorithm distinguished from WAL: <https://sqlite.org/atomiccommit.html>.
- [S7] Git v2.56.0 core tutorial/object and tree model: <https://raw.githubusercontent.com/git/git/v2.56.0/Documentation/gitcore-tutorial.adoc>.
- [S8] Git v2.56.0 expected-old and ref-transaction reader caveat: <https://raw.githubusercontent.com/git/git/v2.56.0/Documentation/git-update-ref.adoc>.
- [S9] Git v2.56.0 rename/copy transformation: <https://raw.githubusercontent.com/git/git/v2.56.0/Documentation/gitdiffcore.adoc>.
- [S10] Git index format, manual last changed 2.55.0 / unchanged 2.56.0: <https://git-scm.com/docs/gitformat-index>.
- [S11] jj operation log, exact observed main revision: <https://raw.githubusercontent.com/jj-vcs/jj/095c1ca3b42f43d740f5736acf4989daa46fb5ec/docs/operation-log.md>.
- [S12] jj concurrency/caveats, same revision: <https://raw.githubusercontent.com/jj-vcs/jj/095c1ca3b42f43d740f5736acf4989daa46fb5ec/docs/technical/concurrency.md>.
- [S13] jj architecture, same revision: <https://raw.githubusercontent.com/jj-vcs/jj/095c1ca3b42f43d740f5736acf4989daa46fb5ec/docs/technical/architecture.md>.
- [S14] jj Git-compatibility matrix/format mapping, same revision: <https://raw.githubusercontent.com/jj-vcs/jj/095c1ca3b42f43d740f5736acf4989daa46fb5ec/docs/git-compatibility.md>; rendered docs also read: <https://jj-vcs.github.io/jj/latest/git-compatibility/>.
- [S15] Git v2.56.0 GC roots/concurrent pruning: <https://raw.githubusercontent.com/git/git/v2.56.0/Documentation/git-gc.adoc>.
- [S16] Lamport's author commentary on July 1978 paper, causal versus total order: <https://lamport.azurewebsites.net/pubs/pubs.html#time-clocks>; linked PDF was not renderable by fetch, so this report relies on the readable author commentary, not a claimed PDF inspection.
- [S17] PostgreSQL 18 isolation (rendered 18.6 documentation): <https://www.postgresql.org/docs/18/transaction-iso.html>.
- [S18] Automerge document model, mutable docs: <https://automerge.org/docs/reference/documents/>.
- [S19] Automerge map/list/text merge rules: <https://automerge.org/docs/reference/under-the-hood/merge-rules/>.
- [S20] Automerge-repo chunk compaction/storage model: <https://automerge.org/docs/reference/under-the-hood/storage/>.
- [S21] Yjs updates/state vectors/GC distinction: <https://docs.yjs.dev/api/document-updates>.
- [S22] Git v2.56.0 bridge protocol/security: <https://raw.githubusercontent.com/git/git/v2.56.0/Documentation/git-fast-import.adoc>.
- [L1] Git v2.56.0 license: <https://raw.githubusercontent.com/git/git/v2.56.0/COPYING>.
- [L2] jj license, observed main `095c1ca3b42f43d740f5736acf4989daa46fb5ec` (2026-10-25): <https://raw.githubusercontent.com/jj-vcs/jj/095c1ca3b42f43d740f5736acf4989daa46fb5ec/LICENSE>.
- [L3] Automerge license, main `5bae7757ef7b92c8cd6850def388f22767305ccb` (2026-10-23): <https://raw.githubusercontent.com/automerge/automerge/5bae7757ef7b92c8cd6850def388f22767305ccb/LICENSE>.
- [L4] Yjs license, main `0e0dc3401b9753fbffb60699f6b68460cf1bcdf9` (2026-10-23): <https://raw.githubusercontent.com/yjs/yjs/0e0dc3401b9753fbffb60699f6b68460cf1bcdf9/LICENSE>.
- [L5] SQLite dedication/qualification, page updated 2026-01-12: <https://sqlite.org/copyright.html>.
- [L6] PostgreSQL license: <https://www.postgresql.org/about/licence/>.

**Unknowns / owner decisions:** actual retention/legal deletion needs; conversation volume and
sanitization policy; binary/submodule/LFS/path requirements; acceptable capture pauses; whether
history is optional convenience or required evidence custody; supported runtime/storage stack;
backup destination/protection; stable external service API and release owner; future tenant/offline
requirements. No dependency binding, implementation benchmark, crash lab or compatibility result
exists from this research. Parent assessment owns source cross-checks and final research gates.
