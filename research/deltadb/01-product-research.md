# DeltaDB: first-party product and architecture research

**Observed:** 2026-10-25. **Scope:** public-source research, not product adoption,
implementation, interoperability certification, legal advice, or a security audit.
The intended outcome is independent analogous software in a separate repository,
later integrated with Loom only under separately approved boundaries.
No account, installation, executable, private endpoint, upload, or live Delta session
was used. No application tests or performance experiments were performed.

## 1. Findings that change the decision

1. **DeltaDB is a specialized replicated history/version-control substrate**, not a
   documented replacement for a general-purpose transactional database. It combines
   Git-based file state, continuous edits, messages, comments and worktree history.
   Delta is the agent/collaboration application above it. [S1–S4]
2. **CRDTs are explicitly confirmed**, not merely inferred. First-party explanations
   describe causal delta IDs, Git/delta base versions, text fragment B-trees and
   immutable structurally shared versions. They are architectural explanations,
   not an implementable public file/wire-format specification. [S1, S2, S15]
3. **Some backend storage is public documentation:** R2 for content/history packs/
   checkpoints; SQLite-backed Durable Objects for active synchronization deltas;
   KV/D1 for metadata. This does not reveal local persistence or an ACID contract
   spanning those services. Do not invent RocksDB, consensus or Rust internals. [S5]
4. **Public integration source exists, but the core was not found.** The official
   `delta-claude` plugin is AGPL-3.0-only; `delta-nix` packages proprietary binaries
   and labels them unfree. Zed's open editor is not proof of open DeltaDB. [S20–S24]
5. **Offline replication is not an offline-independent product.** Documentation says
   launch needs an online server check; rejected offline changes can require a fork
   or discard decision. Archived local history can be evicted after three days. [S5, S9]
6. **Convergence is not semantic correctness or safe execution.** Merge conflicts,
   partial multi-worktree merges and missing-history failures remain documented.
   Local agents have no sandbox or tool permission system. [S6, S9, S10]
7. **Legal review is a prerequisite before product-use research.** The public early
   access agreement expressly disallows using the product for product-development
   research and contains broad derivative-work/reverse-engineering restrictions.
   This investigation stayed with public documents/source; do not infer that it
   resolves applicability, enforceability, patents or freedom to operate. [S19]
8. **For Loom, copy the problem definition, not the authority model.** An independent
   provenance/workspace-history service could complement Loom; replicated content
   must not become grants, leases, audit authority, verification or completion.
   Loom's SPEC runtime boundary and accepted ADR-008 SQLite durability remain fixed.

## 2. Evidence inventory and interpretation

All URLs below were read on 2026-10-25. Live pages have no immutable documentation
revision; dates below are publication dates or observed release sections, not a
claim that every current paragraph shipped in that release. Source references
using ranges mean each relevant source in that range. No secondary sources are
relied on. Website HTML was read where collapsed tabs/FAQs hid text.

| ID | Exact primary source | Relevant sections / revision |
| --- | --- | --- |
| S1 | <https://delta.dev/deltadb> | How DeltaDB works; Under the hood, including hidden Convergence/Fragment index/Structural sharing tabs |
| S2 | <https://delta.dev/blog/future-of-version-control> | Conrad Irwin, 2026-10-15; How DeltaDB's CRDTs work; Fragment index; Structural sharing; What this unlocks |
| S3 | <https://delta.dev/docs/concepts/delta-and-git> | What is DeltaDB; What is a delta; Open a project; two remotes; recorded files; Jujutsu |
| S4 | <https://delta.dev/docs/concepts/core-concepts> | Threads; Projects; Delta worktrees; relationship diagram |
| S5 | <https://delta.dev/docs/privacy-and-security/data-storage> | Stored data; Cloudflare storage table; repository-wide access; retention/deletion |
| S6 | <https://delta.dev/docs/agents/review-and-sync> | Reviews/verdict snapshots; selected-worktree merges; Land; Git export |
| S7 | <https://delta.dev/docs/concepts/worktrees> | Checkout lifecycle; new-thread bases; existing-checkout warning; preparation |
| S8 | <https://delta.dev/docs/agents/threads> | Forks; agent messaging; sent-message editing; revert; archive lifecycle |
| S9 | <https://delta.dev/docs/troubleshooting> | Online launch; missing history; divergence; protocol/local-data mismatches |
| S10 | <https://delta.dev/docs/privacy-and-security/agentic-safety> | No agent permissions/sandbox; auto-loaded repository configuration; planned controls |
| S11 | <https://delta.dev/docs/privacy-and-security/security> | TLS/at-rest encryption; secret discovery/redaction limits; raw terminal capture |
| S12 | <https://delta.dev/docs/privacy-and-security/privacy> | Model request routing; no training; mandatory telemetry and crash reporting |
| S13 | <https://delta.dev/docs/collaboration/collaborate-thread> | Access levels; drafts; local/browser/cloud execution; payment attribution |
| S14 | <https://delta.dev/docs/agents/subagents> | Profile/worktree access; v0.20.0 behavior transition; final-result delivery |
| S15 | <https://zed.dev/blog/agentic-xanadu> | Nathan Sobo, 2026-09-01; actor/Lamport identities; anchors; design goals |
| S16 | <https://zed.dev/blog/introducing-deltadb> | Nathan Sobo, 2026-06-11; operations, stable references, code/conversation provenance |
| S17 | <https://zed.dev/blog/delta-public-beta> | Nathan Sobo, 2026-09-16; beta launch; Git compatibility; future verification |
| S18 | <https://delta.dev/roadmap> | In Progress / Up Next; explicit scope/sequencing caveat |
| S19 | <https://delta.dev/early-access> | Last updated 2026-08-05; §§3–6, 8, 12–14 |
| S20 | <https://api.github.com/orgs/zed-industries/repos?per_page=100&page=1> and <https://api.github.com/orgs/zed-industries/repos?per_page=100&page=2> | Public repository inventory, 100 + 35 entries observed; no DeltaDB core repository identified |
| S21 | <https://github.com/zed-industries/delta-claude/tree/66b6c45139bf937f160b16b76c022446e649973b> | Public integration source, pinned observed main; README License/Privacy/Usage |
| S22 | <https://github.com/zed-industries/delta-claude/blob/66b6c45139bf937f160b16b76c022446e649973b/hooks/cli/thread-commands.ts> | ThreadState, AppendReceipt, WatchEvent; contract 8; errors; frontier validation |
| S23 | <https://github.com/zed-industries/delta-claude/blob/66b6c45139bf937f160b16b76c022446e649973b/hooks/cli/delta-cli.ts> | Actual CLI argument construction, local acknowledgments, mount ownership, watch |
| S24 | <https://github.com/zed-industries/delta-nix/blob/79f76929c63869d89bbd04e9422bc6908a5c5770/flake.nix> | Binary packaging; `dontBuild`; `lib.licenses.unfree`; Linux architectures |
| S25 | <https://github.com/zed-industries/delta-nix/blob/79f76929c63869d89bbd04e9422bc6908a5c5770/releases.json> | Published binary pins: stable v0.21.0, x86_64/aarch64 Linux |
| S26 | <https://github.com/zed-industries/zed/blob/a5c4ca8bf6c4717a328a4a61b42d6d1d38949bcc/README.md> | Zed editor identity and GPL-3.0-or-later / marked Apache-2.0 licensing |
| S27 | <https://delta.dev/docs/whats-in-the-latest> | Latest listed v0.21.0, 2026-10-21; v0.20.0, v0.19.0 and earlier reliability notes |
| S28 | <https://delta.dev/pricing> | Personal/Pro cards and collapsed plan/Business-control FAQs |
| S29 | <https://delta.dev/docs/installation> | Platform support; account/terms requirement; CLI/background process |
| S30 | <https://delta.dev/docs/collaboration/delta-on-the-web> | Browser capabilities; local-only threads; internet/account requirement |
| S31 | <https://delta.dev/docs/agents/cloud-runners> | Private beta; per-sender sandbox; setup; lifecycle; preview access |
| S32 | <https://delta.dev/blog/escaping-the-tyranny-of-worktrees> | Conrad Irwin, 2026-10-06; independent clones, transient checkouts, shared host resources |
| S33 | <https://delta.dev/brand> | Downloadable Delta logo and wordmark; no implementation license grant identified |

**Labels:** documented = first-party statement, not independently tested;
source-observed = pinned integration code, not core/released-binary verification;
inference = architectural consequence; proposed = our requirement; unknown = not
established. Confidence is high in attribution, lower in implementation completeness
and release alignment: no core/running system was inspected. Absence findings are
bounded to this inventory, not universal proofs.

## 3. Product boundary and actual data model

### Domain objects

- **Thread:** durable conversation, optionally with multiple projects; the basic
  collaboration unit. Projectless threads are supported. [S4, S13]
- **Project:** top-level Git checkout with configured source remote; tracked files
  and nonignored untracked files enter DeltaDB, including tracked ignored files.
  A remote is used as repository identity even for private projects. [S3, S4]
- **Delta worktree:** versioned shared project files/history inside DeltaDB, normally
  one per thread/project; not Git's `git worktree` feature. [S4, S7]
- **Checkout:** a machine-local materialization, synchronized with that worktree.
  It can disappear while the recorded worktree remains. Managed checkouts have
  independent Git repositories/clones; an existing checkout can instead be adopted.
  The exact cheap-clone mechanism is not disclosed. [S7, S32]
- **Delta:** file text edit, file-tree change, message, comment or other shared-state
  update with author and placement in history; not just a Git patch or commit. [S1, S3]
- **Version:** the explanatory model permits a Git SHA-1 base or a vector/set-like
  frontier of Delta IDs. It is a causal state descriptor, not a SQL row version. [S2]

The public narrative calls this one history; the backend documentation separately
names thread and worktree deltas. No published schema establishes that every edit
and message across all projects commits atomically as one history transaction.
Consequently, “recorded together” must not be upgraded into a cross-object ACID
guarantee or a total real-time order of independent concurrent actions. [S1–S5]

### Delta identity, causal order and text representation

The product page shows explanatory `HistoryDeltaBatch` fields `id`, `parent` and
`payloads`, and `DeltaId` fields `timestamp: u64` and `actor_id`. Its figure describes
Lamport timestamps greater than parents'. The technical blog explicitly introduces
its `EditDelta { insert, at, based_on }` and `Version` types as **hypothetical Rust**.
Neither establishes production language, ABI, serialization or encoding. [S1, S2]

The documented algorithm anchors edits to positions in a particular causal version.
Concurrent same-position insertions receive a deterministic actor-ID tie break.
An immutable B-tree fragment index tracks which delta produced each character;
historical positions are mapped into the present through that structure. The
product-page illustration retains deleted text as invisible fragments. New versions
copy the changed root-to-leaf path and share other nodes. [S1, S2]

**Important explanatory inconsistency:** the Oct 15 blog says actor `a` precedes `b`
in its example; the current product figure says the higher actor goes first. These
can use different identifiers/order conventions, but do not specify one normative
comparator. Do not implement a supposedly compatible merge from these examples.
Deletion ordering, interval coordinates (bytes/codepoints/UTF-16), actor lifecycle,
ID collision handling and missing-parent delivery rules remain unspecified. [S1, S2]

The blog contrasts DeltaDB with Zed's older character-ID CRDT and says DeltaDB is
loosely based on diamond-types with a substantially different implementation for
Git interoperation. This is not a claim that diamond-types can decode Delta data,
nor that Delta is a reusable diamond-types library distribution. [S2]

### Provenance: association versus proof

Stable delta/span anchors are the published basis for linking current/past code
to conversations, authors and prompts. The June announcement describes bidirectional
navigation; September discusses exploratory agent traversal of prior attention and
reasoning. These are not published evidence of a complete cross-repository semantic
provenance API, and repository-level context remains on the roadmap. [S15, S16, S18]

**Inference:** a shared causal graph provides strong navigation coordinates, but an
adjacent prompt does not prove why a change happened. Shell writes, imported files,
human edits and concurrent turns require explicit attribution conventions. An actor
ID or content hash is not an authenticated human signature, approval or test verdict.
No cryptographic author-signing or tamper-evident audit contract was found. [S1–S3, S22]

## 4. Concurrent work, branching, merge and rewind

### Two different concurrency models

**Same shared worktree:** participants' deltas replicate live; desktop users get
separate synchronized checkouts, browser users operate on the replicated files.
Humans and agents can contribute concurrently. Machine-local services, ignored
files, credentials, ports and processes do not replicate. A shared checkout option
removes file isolation between threads and lets agents overwrite the same files.
Separate directories never create a host security sandbox. [S7, S10, S13, S32]

**Forked worktrees:** a conversation fork starts with parent conversation/worktree
state and then advances independently. File changes do not flow automatically in
either direction. A fresh agent-created top-level thread is different: it starts
with a fresh conversation and does not inherit the current thread's edits. [S8]

Worker/Reviewer subagents normally use isolated copies; Scout uses the parent's
checkout. Scout and Reviewer lack file-edit tools but can still mutate through
terminal commands, so neither is actually read-only. New subagents since v0.20.0
report results but do not automatically merge; older attached subagents retain the
previous automatic-merge behavior. Version and object lineage matter. [S14, S27]

### Merge semantics and limits

- Related-thread selected-worktree merges transfer files, not conversations, and
  do not modify sources. The documented family constraint excludes independently
  created threads. Multi-worktree failure can leave earlier merges applied. [S6]
- Review verdicts capture an edit snapshot. Pull Changes applies that snapshot,
  not later review edits. A failed pull may already have modified some/all worktrees
  before its merge event was recorded. Inspect before retrying. [S6]
- Git merge conflicts still exist. CRDT deterministic text convergence is not a
  guarantee that two independently developed features integrate, build or satisfy
  user intent. The technical blog explicitly calls out directory rename cycles
  as a filesystem modeling challenge without publishing the resolution. [S2, S32]
- v0.19.0 release notes report fixes for simultaneous merges losing/duplicating/
  misplacing text, out-of-sync files and reconnect stalls. v0.21.0 reports more
  merge/recovery fixes and now surfaces affected paths on conflicts. These are
  documented fixes, not evidence those cases have been independently tested. [S27]

### Revert does not mean rollback of execution

Revert Conversation to Cursor removes later conversation and restores attached
worktrees that still match the selected point; worktrees using a different checkout
are left unchanged. Editing and resending a past message replaces the subsequent
conversation. The underlying recoverability of discarded transcript branches is
not defined as a public guarantee. [S8]

**Inference for Loom:** reverting files/transcript cannot undo network requests,
production changes, spent tokens, processes or external effects. A fork/merge/revert
must mint a new exact candidate identity, invalidate stale verification, and retain
authority/audit history outside the rewindable content service. [S6, S8; Loom SPEC]

## 5. Git import/export and interoperability

Import includes tracked content, tracked-file uncommitted edits and nonignored
untracked files. A Git remote is required, with `origin` required when several source
remotes exist. The remote URL participates in repository identity; credential-bearing
URLs are expressly discouraged. Conversion honors line endings, `core.autocrlf`,
`core.eol` and `.gitattributes`. Early colocated `jj` support is documented, not full
Jujutsu compatibility. [S3, S5]

Delta-created clones preserve the selected source remote and additional remotes;
`local` points back to the user's repository or a managed clone on a teammate's
machine. Pushing to `local` transfers commits without GitHub; a clean checked-out
branch may update in place, while Git rejects overwriting tracked local edits.
Normal source-remote push/PR workflows and copying checkout files remain available.
Git commits do not automatically appear in the original checkout. [S3, S6, S9]

**What Git export preserves:** Git objects, commits, trees, branch content and normal
host compatibility. **What it does not establish:** portable export of every delta,
conversation, comment, stable span anchor, review snapshot or causal frontier.
No public complete-history export/import format, stable DeltaDB storage schema,
replication protocol, server SDK or self-hosted core distribution was found in the
reviewed sources. CLI transcript observation is not a lossless history backup. [S3, S20–S24]

The blog says Git-based deltas allow rebasing changes onto another commit. Exact
mapping of provenance across rebase/squash/cherry-pick, Git SHA-256 repositories,
submodules, binary/LFS histories, file modes and case collisions is not specified
as a comprehensive compatibility matrix. Existing LFS and Windows line-ending fixes
in release notes show real edge cases, not universal compatibility proof. [S2, S27]

## 6. Local replicas, synchronization, persistence and durability

Each connected client holds a replica, and the product claims convergence under
different arrival orders. That addresses replicated content convergence, not
linearizability, external-effect ordering or Byzantine/malicious replica safety.
The public material does not publish a formal consistency model or proof. [S1–S3]

Local-only threads and offline changes exist, but troubleshooting says opening a
workspace requires sign-in, accepted terms and an online check at launch. An existing
session can accumulate disconnected changes; server-rejected histories use a recovery
copy with Keep Local Changes in a New Thread / Discard Local Changes or Fork & Restore.
The recovery copy is not checked out until resolved. This refutes an assumption that
all offline histories automatically merge into the original thread. [S9, S30]

| Layer | Confirmed documented storage | Important unknowns |
| --- | --- | --- |
| Client | Active thread history locally; encrypted settings cache; temporary checkout | Local DB engine/schema, transaction/fsync policy, corruption recovery, encryption of all local content |
| Durable content | Cloudflare R2: file contents, Git commits, history packs, checkpoints | Pack/checkpoint encoding, integrity verification, atomic publication, backup/restore guarantees |
| Active sync | Cloudflare Durable Objects backed by SQLite: thread/worktree deltas | Acknowledgment durability boundary, cross-object transaction contract, ordering/failover behavior |
| Metadata | Cloudflare KV/D1; settings in SQLite-backed Durable Objects | Cross-store consistency, identity migration, recovery reconciliation |

Storage rows come from S5. No RPO/RTO, durability SLA, local WAL/FULL requirement,
power-loss experiment, filesystem support contract or complete disaster-recovery
runbook was found. Statements such as “you can't lose work” in S2 are aspirations/
vendor assertions, not substitutes for such evidence; S9 documents missing-history
failure, and S19 expressly warns not to rely on correct operation or data safety.

Archived synced threads lose local history three days after archive/last open, only
after the server holds a full copy; reopening downloads it and needs a connection.
Never-synced threads retain local history until deleted. Managed checkout cleanup
and history eviction are distinct. A missing worktree history can leave conversation
readable while checkout recreation fails; removing/reattaching does not recover the
old worktree. [S5, S7–S9]

Structural sharing reduces repeated tree nodes, but is not a published global GC
algorithm. Tombstone reclamation, safe pruning with offline replicas, history-pack
compaction, retention quotas, binary deduplication and bounded worst-case history
growth remain undisclosed. “Linearithmic” growth in the blog is a qualitative data
structure assertion, not a measured repository/storage benchmark. [S1, S2, S5]

## 7. Public source and agent-facing surfaces

GitHub returned 135 repositories across two pages (third page empty). Relevant names
were `delta-claude`, `delta-nix` and `zed`; `cargo-deltabuild` is a Cargo impact tool.
The observed Zed tree had Delta assets but no identified DeltaDB core crate.
This does not prove no public implementation exists elsewhere. [S20, S26]

The Claude plugin provides unusually useful **public integration evidence**: [S21–S23]

- A CLI contract negotiation (`thread contract`), min/max **8** at the pinned source.
- Thread create/status/append/watch/share/invite/fork/discard/merge and mount calls;
  worktree list/create/attach/mount; machine-readable `--json` and JSONL streaming.
- Producers identified by source/external ID, next sequence and optional actor ID;
  append receipts distinguish recorded/fenced/duplicate and carry a version.
- Watch frames include transcript items, incremental text, turns, presence,
  children, worktrees and anchored comments; transcript fields include `after_id`,
  `turn_id`, author, timestamps and typed content, not core CRDT serialization.
- Failures distinguish sequence gaps, history reset, reload required, incompatible
  app and unavailable/inactive checkout. Plugin validation refuses to reset/reuse
  sequences when acknowledged history is lost or producer state differs.
- Local acknowledgment is explicitly requested in one append mode. A local receipt
  must not be described as confirmed remote persistence. Mount lifetime is owned by
  a long-running command process; ending that process releases its mounts.

These are source-observed client contracts, **not executed commands in this research**.
They prove more than “no API exists,” but less than a stable supported public DeltaDB
database API. One contract comment still says plugin/CLI have not shipped, while the
v0.21.0 release notes describe Claude integration. Treat source comments, main and
released behavior separately; no exact plugin-release/binary conformance was proved.

The plugin README says captured sessions include thinking, tool inputs/outputs and
checkout files, with private/team/manual synchronization choices. This is an external
agent recorder/collaboration adapter, not evidence the underlying model runtime or
conversation ownership has moved to a portable DeltaDB SDK. [S21]

## 8. Security, privacy and lifecycle tradeoffs

- **Cloud persistence is normal product behavior**, including Git objects/history,
  deltas and remote/identity metadata. Private means unshared, not local-only. Shared
  thread access grants attached-repository access, including **every worktree history
  for that repository**, not just histories attached to that thread. [S5]
- Invitees join as editors. Every participant can edit files, steer the agent and
  edit/delete drafts, including another person's draft. Restricting a thread to
  invited people does not remove already admitted participants. A share URL is
  sensitive; read/view-only controls are roadmap work. [S13, S18]
- TLS and Cloudflare-managed at-rest encryption are documented; **end-to-end encryption
  or user-exclusive content keys are not established**. Settings include synced model
  keys and cloud variables. Regional control details are incomplete. [S5, S11]
- Secret redaction discovers known local values/formats before thread persistence,
  sync and provider transmission. It is heuristic, excludes short values and does
  not scan arbitrary files. Tracked ignored files still import; `.gitignore` alone
  is not a secrecy boundary. Background terminals can retain up to 8 MiB of raw
  temporary output until requested/redacted. [S3, S11]
- Provider routing documentation differs: S5's introductory wording says agent
  conversation goes through Zed Cloud; the more specific S12 says hosted requests
  use Cloud while connected-key/subscription requests go directly to providers.
  Preserve this discrepancy rather than asserting all requests are proxied. [S5, S12]
- Delta says it does not train models on code/conversations. Provider-specific terms
  and external subscriptions remain separate. Mandatory authenticated telemetry has
  no Delta opt-out; mandatory Sentry crash dumps can contain thread content. [S12, S19]
- Delete Locally and CLI delete/purge are not reliable all-device/server erasure.
  Account deletion is email-mediated; shared content, others' downloaded/exported
  copies and temporary backups can remain. Durable history creates a real privacy/
  retention tension; it is not automatically a compliant immutable audit. [S5]
- Local agents have unrestricted device access, no permission system and no repository
  trust prompt; preparation scripts and applicable direnv configuration may execute
  automatically. Cloud runner private-beta sandboxes are a distinct execution mode,
  not evidence local agents are contained. [S10, S31]

## 9. Current beta, roadmap, platform and pricing alignment

Latest listed application release is **0.21.0 (2026-10-21)**, corroborated by pinned
Nix release metadata. Installation documents macOS 13+ Apple Silicon, glibc Linux
x86_64/ARM64 and Windows x86_64/ARM64; browser/mobile participation exists. WSL
locations are currently rejected by the Windows app. No installation was attempted.
[S9, S25, S27, S29, S30]

The live roadmap still labels CLI, MCP and mentions In Progress and conversation
branching Up Next, although current docs/release notes describe shipped subsets.
Thus it is not a reliable binary capability matrix. Safeguards remain explicitly
unshipped on the dedicated safety page; cloud runners are explicitly private beta;
repository-level context, graph view and read/view permissions remain roadmap items.
Content-based builds/CI-in-thread are longer-term blog plans. [S8, S10, S17, S18, S27, S31]

Current pricing: Personal $0 with existing keys/external agents; Pro $10/month with
$5 monthly included tokens and usage billing beyond credits; shared Zed account and
credits. FAQ says selected Business organization's server-enforced data/privacy
controls carry over. No standalone DeltaDB engine license/support price, self-host
price, storage/egress quota, guaranteed retention or SLA is established by that page.
The Sept 16 “free during beta” announcement is historical, not current pricing. [S17, S28]

The technical sources contain no reproducible benchmarks, hardware profiles, storage
amplification results or independent durability tests. “Cheap,” “as you type” and
sharing claims are not capacity/cost estimates for our implementation. [S1, S2, S32]

## 10. Licensing, clean-room and independent implementation

**Factual constraints, not legal conclusions:** [S19, S21, S24, S26, S33]

1. Delta's public early-access terms describe proprietary products. §3 limits use
   to testing/feedback and explicitly excludes product-development research and
   commercial purpose; it also restricts derivative products and reverse engineering.
   §§4/6 cover confidentiality and retained IP. Public pricing availability does
   not silently erase those terms; counsel must reconcile any applicable contract.
2. This research did not register, accept terms, use the service, inspect private
   APIs or extract binaries. Reading public materials is not represented as legal
   clearance or proof the agreement cannot apply to any future conduct.
3. The **plugin** README expressly says AGPL-3.0-only. Reusing/modifying plugin source
   is a separate licensing decision, potentially carrying distribution/network-use
   obligations; do not call it permissive or transfer its license to DeltaDB core.
4. The **Nix packaging source** exposes build instructions for prebuilt binaries and
   marks the application unfree. It is not a buildable DeltaDB core source release.
   No top-level license file was identified in the observed packaging tree; public
   visibility by itself is not permission to copy unlicensed packaging code.
5. The **Zed editor** README states primarily GPL-3.0-or-later with Apache-2.0 where
   marked. Its editor CRDT/source has separate provenance/licensing and is not
   evidence that DeltaDB uses the same algorithm, backend or license.
6. Downloadable brand assets do not grant a general right to use Delta/DeltaDB marks
   for a competing product. Choose an independent name/visual identity; no trademark
   registration search, patent search or freedom-to-operate opinion was performed.

**Proposed process:** use public descriptions only to formulate product requirements;
record origins and consulted revisions; design an original schema/protocol/UI from
general Git/CRDT research and Loom requirements; do not copy vendor code, assets or
hypothetical structs as the project's implementation. A genuine formal clean-room
process may require separate research/implementation personnel and legal controls;
this document alone is not such a certification. Never use an authenticated product
session as a reverse-engineering shortcut without scoped approval and legal review.

## 11. Implications and open questions for an independent Loom companion

The valuable analogy is **continuous content history with durable context and
disposable workspaces**. The unnecessary assumption is “build a new general-purpose
DB.” A separate, bounded service can model history without claiming Delta format
compatibility or replacing Loom's authoritative SQLite ledger. That is a proposal,
not a researched claim that a Git/SQLite implementation reproduces Delta's CRDTs.

Recommended requirements for a later design decision, not authorized work:

- Define explicit run/thread/tool/candidate links; hash exact artifacts; preserve
  message origin and distinguish declared author from authenticated actor.
- Keep immutable authority/audit/effect records in Loom. Rewind only candidate
  content. Promote only through supervisor-owned writes and fresh verification.
- Begin with isolated workspaces and explicit merge; demand true live shared editing
  only if the user needs it. Concurrent text convergence does not remove semantic
  merge, filesystem identity or authority fencing requirements.
- Specify local durable acknowledgment separately from remote replicated receipt;
  survive lost replies, duplicate IDs, server rejection, corrupt/missing history,
  partial materialization and restore-before-replay without silent data loss.
- Make offline startup, full export, no-upload mode, retention/deletion, redaction,
  backup targets and compatibility explicit rather than copying vendor defaults.
- Do not execute repository preparation, ambient skills or credential discovery in
  Loom's trusted history process. Path/symlink validation and sandbox boundaries
  apply even when workspace contents come from a convergent replica.

**Material unresolved questions:** Is character-level collaboration essential, or
are tool/edit checkpoints sufficient? Must history survive independently of both
Loom and any server? Which runtime owns transcript truth? What content may be kept
and for how long? How are external edits attributed? Is a failed multi-project merge
atomic or recoverable partial work? Which independent schema/export/license will
be supported? What are the accepted durability/restore targets and legal boundaries?

Vendor unknowns: core availability/license, local format/wire protocol, transaction/
ack boundaries, crash durability, causal-to-Git mapping, normative tie-breaking,
filesystem CRDTs, GC safety and full-history export. These constrain Delta-parity
claims, not simpler original requirements. Production Loom compatibility is unproved.

**Validation boundary:** citations and pinned integration source were inspected;
application tests, dependency audits, live security tests and performance checks
were not run. Parent synthesis owns repository document/secret/whitespace gates.
