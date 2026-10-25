# DeltaDB-inspired software: Loom compatibility and recommendation

Research date: **2026-10-25**. Loom baseline: `754a9d5`, Bun/SQLite schema5.
Scope: independent software in a **separate repository**, not adopting Delta's
service and not copying an undisclosed implementation. P2 implementation is
paused for this research. No DB/service integration, prototype or benchmark has
been implemented or run.

Companion reports:

- [DeltaDB product and primary-source research](01-product-research.md).
- [Independent build options and storage foundations](02-build-options.md).

Evidence labels throughout: **documented** = first-party claim, not independently
tested; **code-confirmed** = inspected Loom implementation; **proposed** = our
design/recommendation; **unknown** = not established by accessible evidence.

## 1. Executive recommendation

**Build a small independent revision/provenance engine if you want this as a
separate product. Do not build a new general-purpose database engine, and do not
replace Loom's authority SQLite database with it.**

The product opportunity is durable code/context lineage: “what changed, which
conversation or operation it was associated with, which exact candidate was
tested, and how this branch diverged”. That is useful software even when SQLite
or another established engine supplies its persistence. It is not necessary to
invent transactions, page management, WAL recovery or distributed consensus to
own the higher-level data model, API, history and developer experience. This is
a recommendation, not approved implementation scope. [D1; L1–L5]

For Loom, treat the new system as **immutable candidate/history evidence** behind
a trusted supervisor. Keep leases, kill, policy, grants, budgets, audit, workflow
state and completion in Loom. Keep Pi conversations/journals Pi-owned; the new
system stores attributed, sanitized observations/references, not an alternative
live session or workflow scheduler. Keep Git as the accepted-source publication
boundary initially. [L1–L5]

**Timing recommendation:** finish the bounded isolated-runner seam first, or run
a separately approved timeboxed prototype without making it a P2 dependency.
Integrate a read-only/shadow history projection only after capture and failure
semantics are testable. P2's containment/output/provider obligations remain the
critical path; a history engine does not satisfy them. [L1; L6]

## 2. Resolve the name before choosing the architecture

Delta's own homepage calls DeltaDB a **version control system** recording edits
with their conversations and says it underlies the app and planned CLI. That is
not evidence of a PostgreSQL/SQLite-compatible relational engine, a replicated
transaction protocol or a supported embeddable library. The companion product
report distinguishes richer published claims from unknown implementation. [D1;
product report]

### What is actually documented about DeltaDB

The parent cross-checked the product page, technical deep dive, data-storage
documentation, agentic-safety page, review/merge behavior, early-access terms and
pinned public plugin README against the delegated findings. [D2–D8]

| Area | Documented behavior | What it does **not** establish |
| --- | --- | --- |
| Delta model | Edits, messages, comments and file-tree changes have stable delta identities, authors and causal bases | A trusted identity, signed authorship, authorization or cross-object ACID transaction. |
| Replication | CRDT-based convergence; Git blobs/commits can be causal bases | Linearizable leases, all-or-nothing multi-project merge or distributed effect rollback. |
| Text history | Fragment-index B-tree maps current positions to originating deltas; immutable structural sharing reuses unchanged paths | A published complete encoding, bounded space/latency benchmark, GC safety proof or license for core implementation. |
| Git relationship | Fine-grained history sits between ordinary Git commits; Git branches/remotes/PR workflows remain | Lossless export/import of every conversation, comment and causal anchor via an ordinary Git push. |
| Workspaces | Replicated worktrees can be materialized as temporary local checkouts | A host security sandbox; separate folders do not remove process/credential authority. |
| Backend | R2 stores content/commits/history packs/checkpoints; SQLite-backed Durable Objects store active deltas; KV/D1 store metadata | One atomic transaction or a documented durability acknowledgment spanning all those services. |
| Review/merge | Verdicts reference edit snapshots; some failed pulls or multi-worktree merges can already have modified destinations | Safe blind retry or all-or-nothing merge; inspect/reconcile partial outcomes. |

The Oct15 deep dive says the CRDT is loosely based on **diamond-types**, with
substantial differences for Git interoperability. Its example Rust types are
explicitly hypothetical; they do not prove the actual core language or a supported
wire format. A replica's causal frontier is a different concept from a verified
candidate/root, a transaction commit, or a human decision. [D2; product report]

This yields three useful transferable ideas:

1. Model code and its associated reasoning as a durable graph instead of losing
   everything between commits.
2. Separate immutable versioned content from disposable filesystem checkouts.
3. Use causal/version-specific anchors for historical navigation, while keeping
   execution/approval/verification outside the content graph.

It does **not** require copying Delta's hosted backend, live shared-editing UX,
account model, binary/protocol or local-agent security decisions. Our first
checkpoint product would intentionally offer less fine-grained history and no
multiplayer parity; state that tradeoff rather than calling it an equivalent.
[proposed application of documented behavior]

### Legal/source boundary before independent implementation

The inspected official `delta-claude` integration README is **AGPL-3.0-only**;
that license does not establish DeltaDB core availability or license. The
product research found no public core implementation/complete file or replication
specification in its bounded source inventory. No such core source was copied.
[D8; product report]

More importantly, Delta's public early-access agreement §3 expressly restricts
using the **product** for product-development research and contains broad
derivative-work/reverse-engineering restrictions. Do not install/log in to
experiment with internals or private protocols on the assumption that public
marketing makes that permitted. Legal counsel should assess applicable terms,
prior use, rights and any patent/trademark issues before a competitive product
or interoperability project. This report uses public material, not an account
session, and is **not legal clearance or a certified clean-room process**. Use
an independent name and original formats/implementation; evaluate any reused
open-source component's license separately. [D7–D8; product report §10]

The independent project's first product contract should therefore be:

> A local-first, revisioned workspace and provenance store that records immutable
> candidate snapshots, attributed context, and causal links; exports ordinary
> Git-compatible source; and never grants execution authority.

“Local-first” here is a **proposed local-durable starting point**, not a claim
that one-host SQLite implements offline multiplayer synchronization. Decide later
whether distributed authoring and real-time collaboration justify a CRDT or
another concurrency model. [build-options report]

The distinction changes the size of the undertaking:

| Meaning of “our own DeltaDB-like DB” | Assessment |
| --- | --- |
| A new domain model/API/CLI over proven persistence | Feasible bounded independent software; recommended starting point. |
| Revisioned code + context graph, Git import/export, reliable local history | A substantial but coherent product; stage it and test recovery. |
| Transparent capture of arbitrary editors/tools, stable evolving anchors, multiplayer/offline sync | A materially larger collaboration/version-control platform, not a database weekend project. |
| A new storage engine, query planner, WAL, consensus and globally shared authority | Not justified by Loom's current one-worker/local profile; highest correctness and maintenance cost. |

No product-parity claim should be made from a local snapshot prototype. [proposed
assessment; build-options report]

## 3. What Loom already owns — code-confirmed, not future architecture

| Responsibility | Current implementation/evidence | Integration implication |
| --- | --- | --- |
| Authoritative local durability/schema | `src/store.ts:434–568`: exact schema signatures, supported migrations, WAL/FULL/foreign-key/trigger read-back | Do not let a history package add private tables to Loom's DB or silently replace the driver. Unknown schema changes are rejected. |
| Workspace owner/epoch/expiry/kill | `src/store.ts:44–144`: live context and lease/kill checks inside a transaction | Distributed content merges cannot mint or synchronize effective execution leases. |
| Registered run/phase history | `src/runs.ts:112–170,180–248`: init and phase/evidence writes in immediate transactions | New system references run/thread/action identities; it does not independently decide lifecycle or reopen a phase. |
| Immutable audit and evidence | `src/store.ts` migration/guard definitions; `src/runs.ts:91–109`; safety tests below | Content revisions may branch; authority audit cannot be selectively undone by checking out an old branch. |
| Effect admission and uncertainty | `src/store.ts:1980–2026,2162–2289`: atomic intent enqueue, live per-dispatch admission, callback outside transaction, unknown outcome | A remote/new-repo service is a separate failure domain; no “exactly once” inference from two successful local calls. |
| Read-only coherent orientation | `src/runs.ts:321–380`: one SQLite read transaction assembles status | A projected history timeline can be stale; it must not replace live admission/status decisions. |
| Evidence locator validation | `src/runs.ts:201–217`: bounded refs and hash syntax; `docs/cli.md:44–48` explicitly says no content verification | New storage can make artifacts retrievable, but a locator/hash string alone is not fresh verification. |
| Framework pin/content validation | `src/framework.ts:145–241` checks actual selected revision/tree/lock/skills | A history root does not prove correct framework revision, required children, or that a run used those bytes. |
| State-bound kill reset | `src/store.ts:2620–2786` hashes scoped history, runs and evidence | A history rollback cannot reset kill, revive leases or erase admitted/unresolved effects. |
| Runtime separation | SPEC and accepted ADRs: Pi owns runtime journals; Loom owns authority | A history observer is another sink/boundary, not permission to inspect host credentials or write Pi-private state. |

Current `relayBatch` is explicitly **synthetic-only** and checks fixture identity;
there is no shipped real “publish history” adapter. Reusing its *pattern* is
architecturally appropriate; calling a new service with `synthetic:true` to bypass
that restriction is not. `recordRunTransition` also does not currently enqueue a
projection operation automatically. A future integration needs approved code,
tests and potentially a schema migration. [L3–L5]

## 4. Compatibility assessment

| Proposed capability | Fit with Loom | Condition / gap |
| --- | --- | --- |
| Exact immutable code snapshots tied to events | High | Capture coherent bytes; root identity and format version are stable. Verification reads the same root. |
| Conversation-to-edit provenance | High | Sanitized, attributed observations; distinguish declared association from proven causation. Do not duplicate Pi session authority. |
| Cross-harness history | High as a goal | Runtime-neutral envelope plus explicitly versioned adapters; no claim an exported transcript can resume another runtime semantically. |
| Offline/local history and later sync | Good for content | Local durability first. Offline history is not offline permission to mutate protected state. |
| Candidate forks and branch comparison | High | Each candidate is separate evidence. Accepted-source promotion still goes through Loom's live gates and trusted verifier. |
| Simultaneous arbitrary writes to the same live workspace | Poor under current P1 profile | Existing workspace-wide lease permits one effective mutator; use separate workspaces/candidate branches, not a silent multi-writer redesign. |
| Real-time shared editing | Future/conditional | Content convergence does not prove compilation, intended behavior, authorization or safe promotion. |
| New backend for Loom leases, audit or outbox | Not a drop-in fit | Current APIs take `bun:sqlite` Database and depend on immediate transactions, PRAGMAs, SQL and exact schemas. Full redesign/requalification. |
| Revision checkout as “undo everything” | Incompatible | Source rollback cannot undo remote effects, budget use, approvals, audit or kill. |
| Distributed writable Loom authority | Not approved | Requires a separately reviewed consistency/fencing/failure model; not established by content CRDTs or sync. |
| Raw shell filesystem access to host history storage | Incompatible | Worker must not receive authority/history DB socket, credentials or protected filesystem mounts. |
| Historical context for debugging/review | High | Context is untrusted input; access controls, source classification and retention apply on every read/export. |

The key answer is **high conceptual compatibility as evidence infrastructure;
low immediate compatibility as a replacement database or live-workspace owner**.
[L1–L6; proposed assessment]

## 5. Recommended ownership and integration seam

```text
Human / trusted Loom supervisor
  ├── Loom SQLite: run state, leases, grants, policy, kill, audit, effects
  ├── trusted sanitizer / coherent candidate capture
  │      └── independent history engine: immutable roots + attributed events
  └── trusted verifier: exact root + tests + effect reconciliation
                    ↓ only after live approval/admission
              accepted Git/source publication

Isolated Pi runner: disposable candidate files + Pi-owned journal
  └── bounded observations/proposals to supervisor; no direct authority DB access
```

This diagram is **proposed**, not an implemented pipeline. P2's fail-closed
sanitizer, trusted snapshot capture, IPC and verifier are still planned. [L1; L6]

### Authority map: one owner for each fact

- **Loom:** whether a run is admitted, killed, interrupted, awaiting approval or
  verified; live lease/epoch and effect uncertainty.
- **Pi:** its active conversation/session/journal and runtime-native continuation.
- **Independent engine:** the exact immutable bytes and history facts it has
  durably accepted, plus attributed observations and revision relationships.
- **Git/project repository:** accepted published code history initially; the new
  engine may export/import copies, but cannot silently publish its branch as
  accepted project truth.
- **Verifier:** fresh evidence over an identified candidate; its result is
  admitted/recorded by Loom, not self-certified by a revision's `status` field.

Copies and projections are allowed; **two writers deciding the same authoritative
fact are not**. Own each mutable pointer explicitly. [L1–L5; L7]

### Do not fake a distributed transaction

For a first integration, choose one of two explicit semantics:

1. **Optional observational projection:** read committed Loom records through a
   reviewed boundary, append idempotent history events, expose projection lag.
   Crash/replay can duplicate delivery, not history identity. If the projection
   is unavailable, authority remains truthful; never invent missing provenance.
2. **Required candidate evidence:** durably store and pin an immutable candidate
   root first, verify readability/bytes, then attach its immutable reference in
   Loom's own transaction. A crash before attachment can leave a collectible
   orphan; a required reference must not point to uncommitted/GC-eligible data.

The second option needs a reviewed pin/retention/attachment handshake, backup
consistency and orphan-reconciliation rule. “Write service, then write SQLite”
alone is not atomic. Do not hold `BEGIN IMMEDIATE` open across a network request.
For reliable asynchronous export, add a separately reviewed durable delivery
intent/outbox rather than pretending one already exists for run transitions.
External service failure after dispatch remains unknown until idempotent lookup
or reconciliation proves outcome. [L3–L5; proposed design]

### Proposed minimum operation contract — not a shipped API

| Operation | Required invariant |
| --- | --- |
| Store immutable content/root | Verify byte hash and limits before accepting; same digest never maps to different bytes. Return a durable receipt only after the storage contract's commit point. |
| Append attributed event | Caller/run binding established by supervisor; stable event ID + exact payload digest. Identical replay returns the existing result; same ID/different bytes rejects. |
| Retrieve root/range | Verify identity/version/bytes, scope access to project/run; no arbitrary host-path reads or unbounded reconstruction. |
| Pin/release evidence | Pin immutable roots independently of mutable branch tips; deletion requires explicit authorized lifecycle and reconciliation. A pin is retention, not an execution grant. |
| Advance candidate branch | Compare-and-swap expected head or explicitly create a competing branch; never overwrite a competing revision silently. |
| Export candidate | Reconstruct into an owned disposable destination; reject path traversal, symlink/hardlink/device escape and executable hooks. No protected-branch commit/merge side effect. |

Keep this contract runtime/provider-neutral. Version the event schema, hash
encoding and import/export behavior separately from the engine's package version.
Do not expose a new public transport until its limits/authentication are specified.
[proposed; current trust constraints L1–L5]

## 6. Smallest useful independent implementation

### Build first

1. **One-host SQLite-backed service/library + CLI**, not a custom storage engine.
   Store metadata and bounded content blobs in one transactional store initially;
   this avoids creating a second metadata/filesystem atomicity problem before it
   is justified. Benchmark whether blob separation is needed later. [proposed;
   storage rationale in build-options report]
2. **Immutable file-tree roots and typed revision/event DAG.** Hash raw content,
   explicit file modes/path entries and a versioned canonical tree encoding.
   Metadata normalization must not rewrite raw code bytes/newline conventions.
3. **Explicit capture boundaries:** owned edit/tool completion, turn/checkpoint,
   or quiescent candidate export. Declare capture gaps; do not market a watcher
   as “every edit” when events can be missed or files change during reading.
4. **Attribution envelope:** workspace/run/thread/action/source-event IDs,
   observed root, parent/causal references and schema version. Runtime timestamps
   are observations, not a trusted global order or proof of identity.
5. **Local history/diff/reconstruct/export** and a plain portable archive. Git
   remains the external publication path; automatic GitHub merge is out of scope.
6. **Immutable-review anchors:** revision + file identity/path + byte range +
   quoted-content hash. Cross-revision re-anchoring is a proposal requiring user
   confirmation when ambiguous; avoid promising arbitrary-edit anchor stability.
7. **Crash-safe reopen, idempotency, corruption detection, backup/restore, bounded
   admission and an explicit retention contract**, with proof that every pinned
   root reconstructs byte-identically. Initially prefer visible disk/quota failure
   to automatic destructive GC; qualify deletion separately.

These capabilities form an actual independent product, not merely a SQL wrapper:
its value is the data model, coherent capture, history semantics, tooling and
reliable contract. SQLite is an implementation foundation, not the product.

### Explicitly exclude from v0

- Multi-region consensus, writable offline authority, arbitrary multi-user sync.
- A replacement SQL/query/storage engine, custom filesystem or transparent mount.
- Fine-grained every-keystroke capture, perfect semantic causality, universal
  cross-harness session resume, automatic correct code merges.
- VFS/repository virtualization, all editors/OSs, complete Git protocol parity.
- Automatic approvals, policy, grants, workflow execution, task completion or
  credentials inside the history engine.
- A dashboard, hosted product, multi-tenant identity service or paid inference.

If any excluded capability is the actual primary product requirement, revise the
project scope before estimating or integrating it. [proposed scope]

### Technology choice: independent software need not mean novel storage primitives

**My first prototype choice:** a TypeScript/Bun local library/CLI with SQLite,
explicit immutable byte/manifest IDs, a documented archive, and Git export.
This matches Loom's existing runtime and reduces initial integration surface;
it is a proposed implementation choice, not a benchmark result or dependency
approval. Keep a versioned boundary so the separate project can later change
its internals without sharing SQL tables or private classes with Loom.

If low-level text indexes, memory layout, continuous-edit throughput or a
filesystem integration become the demonstrated differentiator, Rust becomes a
reasonable engine candidate. Do not infer that it is mandatory merely because
Delta's blog uses hypothetical Rust. Process/API compatibility is more important
than making both repositories use one language. [D2; proposed assessment]

Evaluate **diamond-types** alongside Automerge/Yjs only when live collaboration
is required: the inspected upstream README at
`89ae3a0ab8d941a2885e6ec89d094bc9ce9d2922` describes a Rust text CRDT, ISC license,
Node/browser WASM packages, and currently plain-text scope; it warns that its
published Cargo package is out of date relative to source. That is evidence for
a release/binding qualification task, not permission to pin current main or a
claim it provides Git/file-tree/conversation/authority semantics. Delta explicitly
says its implementation differs; this library is not a Delta decoder. [D2; D9]

The value to own is **revision, capture, context, reconstruction and reliability**.
Reuse qualified storage/CRDT primitives where they fit; reject any library whose
format, history/GC model, licensing or binding lifecycle conflicts with that value.
Do not adopt all of Git, jj, Automerge, Yjs and diamond-types behind a speculative
backend abstraction. [proposed recommendation; build-options report]

The options report favors Git object reuse when ordinary snapshots dominate;
this synthesis favors bounded SQLite BLOBs for the **first small experiment's
single-store atomicity**. These are alternatives, not two stores to implement at
once. Stage0 should choose one from actual object sizes/capture requirements;
neither preference establishes a measured performance advantage.

Useful independent differentiators would be **documented no-login offline
operation**, a **complete validated export**, **explicit retention/pin/delete
semantics**, and a **history API that composes with an external safety harness**.
Those address observable gaps/unknowns in the researched product without
requiring Delta wire compatibility or its full multiplayer application. They
still require your own implementation and evidence, not a comparative claim that
our nonexistent software is already safer or more durable. [D4–D8; product report]

## 7. Pros and cons for your specific project

| Advantage | Why it matters | Qualification |
| --- | --- | --- |
| Own a reusable neutral provenance layer | Loom can outlive one harness/model and expose richer review/recovery context | Requires stable adapters/schema; portability is not automatic runtime resumability. |
| Exact candidate lineage | Compare attempts, reconstruct a tested root and investigate interrupted changes | Snapshot consistency and independent verification still required. |
| Better review than final Git diff alone | Link review comments to the observed code/context rather than relying on remembered conversations | More retained context increases privacy and prompt-injection risk. |
| Independent release/project lifecycle | Can serve other agent tools without embedding Loom policy | Separate repo doubles protocol/version/migration/release coordination. |
| Local control and predictable data boundary | Can avoid mandatory hosted service or vendor account integration | You inherit backup, security patching, support and recovery obligations. |
| Experimentation without changing accepted source | Store multiple candidate roots while Git remains publication authority | Does not permit multiple effective writers of the same protected workspace. |

| Disadvantage/risk | Concrete cost to Loom | Mitigation / residual limit |
| --- | --- | --- |
| Delays the first useful isolated runner | Another system before P2 has real candidate/verifier events | Do not make a full-history product a prerequisite for P2. |
| Two durable stores | Dangling refs, orphan roots, skewed backups, service unavailable mid-operation | Separate optional projection from required evidence, pin/receipt protocol, restore rehearsal. |
| Dangerous “undo” intuition | Users may expect code rollback to undo effects/approvals | Separate content restoration from new live-authorized actions and reconciliation. |
| Capture is difficult outside owned edits | Shell tools, formatters, compilers and humans mutate files differently | Checkpoint/quiescence contract and explicit gaps first; no watcher completeness claim. |
| Sync and code merge are different problems | Replicas can converge on syntactically valid but behaviorally wrong code | Branch candidates, surface conflicts, run trusted exact-root verification. |
| Permanent-history security burden | Prompts/files may contain credentials, private source or tool-generated injection | Minimize/classify/redact before admission; explicit retention/deletion, scoped exports. |
| Storage growth and GC correctness | Fine-grained history can exceed the 2 GiB runner-workspace target; stale replicas/pins can retain large histories | Host-managed separately budgeted history store; no worker access; bounded imports and measured policies. |
| Compatibility liability | Git modes/renames/binaries/submodules and hash/protocol versions evolve | Define supported subset and deterministic unsupported handoff. |
| New maintenance/security supply chain | Another package/service/daemon, data migrations, dependency and license reviews | Small proven base, explicit lock/protocol compatibility and review gates. |
| Insufficient evidence for a generic DB replacement | Delta's product success would not prove your engine's serializable fencing or audit durability | Keep accepted SQLite authority; any replacement needs a new explicit project. |

Overall: **a worthwhile separate product hypothesis, but an expensive detour if
its only purpose is improving Loom's first local single-worker alpha**. [proposed
judgment based on current scope L1; L6]

## 8. Failure cases the integration must explicitly define

| Failure | Safe behavior |
| --- | --- |
| Content store down during optional export | Mark projection delayed/incomplete; never fabricate history or change live authorization. |
| Required root missing/hash mismatch | Verification and promotion fail closed; retained locator is not sufficient evidence. |
| Crash after content commit, before Loom attachment | Retain receipt/orphan for reconciliation; GC only under reviewed retention rules. |
| Crash after Loom delivery intent, before service acknowledgement | Replay stable event ID and bytes; query idempotent outcome rather than duplicate side effects. |
| Kill occurs during capture/export | Stop future mutations/admission; preserve existing immutable observations; root existence cannot clear kill or renew leases. |
| Disconnected peer returns with stale branch/authority | Import as untrusted content branch only; require current supervisor identity/epoch/policy for new protected work. |
| Hash-valid but malicious archive | Validate type/path/size/mode and access scope; content integrity is not safe execution. |
| File changes while snapshotting | Fail/retry capture under explicit consistency policy or record an incomplete observation; never label a torn tree verified. |
| Disk full during blob/event write | Transaction leaves no acknowledged partial root; fail visibly, preserve old roots. |
| GC races verification or backup | Durable pins/read protections and conservative reachability; pinned/backup-required roots must survive. |
| Restore history older than authority or vice versa | Reconcile receipts/refs; mark unavailable evidence/unresolved effects; never reset authority to match a convenient content snapshot. |
| Secret discovered in old history | Revoke access, assess exports/replicas/backups and apply explicit deletion/crypto-erasure policy; no false “deleted everywhere” claim. |
| Candidate edited after passing tests | Candidate/root mismatch invalidates the old result; verification is tied to exact immutable bytes, not a branch name. |

These are proposed acceptance requirements, not test results. Current Loom tests
cover analogous admission/replay/immutable-history properties, not this new engine.
[L3–L5; L8–L10]

## 9. Delivery strategy and stop/go gates

| Stage | Deliverable / decision gate | Not included |
| --- | --- | --- |
| 0 — problem validation | Select 3 real user questions current Git/Pi/Loom cannot answer adequately; define capture/privacy contract and success metrics | No DB replacement or multiplayer claim. |
| 1 — separate-repo prototype | Local immutable roots/events, CLI inspect/diff/export, deterministic fixtures | No live Loom authority integration or production data. |
| 2 — durable local product | Crash/ENOSPC/corruption/backup/restore/GC/import compatibility corpus; documented versioning and license policy | No distributed authority or broad platform parity. |
| 3 — Loom shadow integration | Sanitized observations/read-only projection; compare reconstructed roots with trusted snapshots, report lag/gaps | No effect admission or completion delegated to the new system. |
| 4 — required artifact integration | Approved pin/receipt/retention/migration contract, exact-root verifier, two-store restore drills, independent security review | No implied live provider/production authority. |
| 5 — optional collaboration | Only if users require it: chosen CRDT/sync protocol, membership/revocation/offline/GC compatibility and semantic conflict UX | Still no merging of kill/leases/approvals by eventual content sync. |

Stage gates should stop the project if measured user benefit is weak, capture
completeness is unaffordable, restore cannot preserve pins, or integration
requires duplicating authority. Do not adopt a separate microservice merely to
give an embedded library a product-shaped deployment. A separate repository can
initially publish a local library/CLI with a stable on-disk/export contract.

Estimates belong to scope, not brand similarity. A narrow synthetic prototype
can be a **weeks-scale experiment**; a trustworthy local product is a
**months-scale engineering commitment**; transparent cross-platform capture,
robust offline collaboration and Git/VFS parity are **multi-quarter product
work**, typically with more than one specialty. These are planning judgments
for an experienced developer with AI assistance, not measured delivery forecasts.
The companion options report supplies assumptions and alternative scopes. Do not
promise a full DeltaDB equivalent on prototype timelines.

For a more explicit planning envelope, the companion report estimates **13–28
focused developer-weeks** across requirements, a3–6-week core, hardening,
optional Loom projection and retention/restore qualification, for one experienced
developer with AI assistance. These are assumption-based ranges, not measured
productivity or calendar promises. UI, multi-OS support, hosted identity,
collaboration and ongoing product support are excluded;6–16+ extra weeks for a
collaboration slice is likewise only a rough planning hypothesis. A new DB
kernel or full Delta-parity platform is outside this bounded estimate.

### Capacity and cost: measure your capture policy, not the brand's claims

Illustrations only, with **no benchmark or storage guarantee**:

| Hypothetical capture pattern | Arithmetic before indexes/replication/backups |
| --- | --- |
| 10,000 metadata events averaging2 KiB | Approximately19.5 MiB of payloads. |
| 2,000 distinct changed-file versions averaging32 KiB | 62.5 MiB of raw unique content before compression. |
| Copying an entire500 MiB repository100 times | Approximately48.8 GiB; immutable roots with unchanged-content reuse avoid this particular naive amplification, not every history cost. |
| 10 edits/second for4 active hours | 144,000 edit records before batching; event/index/CRDT overhead can dominate small inserts. |

Budget actual file sizes, edit frequency, binaries, capture boundaries, raw/sanitized
conversation volume, WAL/checkpoint peaks, indexes, retained revisions, export
staging and backup copies. Fine-grained changes/structural sharing do not remove
the need for size/admission caps. Do not put an unbounded host history archive
inside the runner's2 GiB capped workspace. Benchmark reconstruction/diff/append/
restore and disk amplification on the selected local stack before choosing
thresholds. [arithmetic examples/proposed measurement plan; L6]

## 10. What would change the recommendation?

Favor building the narrow engine sooner if you intend it to be a standalone
product, multiple non-Loom consumers are real, and exact historical code/context
lineage is already a user pain with measurable benefit. Favor postponing it if
the immediate objective is simply “Loom completes one small safe task”. Favor
adopting a mature revision/CRDT component if its semantics/license fit, rather
than independently recreating its algorithm solely to avoid a dependency.

A generic transactional authority replacement would require explicit evidence
of requirements SQLite cannot satisfy, selected consistency/failure semantics,
equivalent kill/fencing/outbox/audit/recovery guarantees, data migration/rollback
and a separately approved architecture review. None is established by this
research request or the current one-worker profile. [L1; L2]

Questions to settle before a separate-repo build, not assumptions to smuggle in:

1. Primary product: personal recovery/debugging, precise code/context review,
   real-time team collaboration, or a new general-purpose DB?
2. What must be captured: explicit checkpoints, every tool operation, every file
   edit, every keystroke, and which non-editor writers? What gaps are acceptable?
3. Is offline multi-writer authoring required in v0, or can one trusted local
   observer/serial writer satisfy the first users?
4. What source/conversation classes may be retained, for how long, and what is
   the deletion/backup/export obligation? What is the supported failure model?
5. Does Loom need an optional history view or required artifact availability?
   The latter is a stronger dependency and recovery contract.
6. Must the new system interoperate with Delta itself? If not, do not assume or
   require an undocumented proprietary wire/on-disk protocol.

## 11. Evidence and verification limits

This is a research/design assessment, not a completed clean-room implementation,
legal opinion, security audit, license clearance, load test or production
compatibility result. No Delta account/service, binary reverse engineering,
private API, paid model call, new dependency or repository was used/created.
Public documentation can support a feature claim, not prove its internal
durability, replication or consistency implementation. Source availability,
licenses and roadmap status are qualified in the product report.

Loom code was inspected at `754a9d5`; many adapter/output/candidate operations
remain planned. No new application tests were invented for documents. Document
and secret-scan results are recorded in SPEC after the reports are complete.
Research does not change ADR-008, consume P2 setup approval, or approve a new
storage backend. Final recommendation awaits the owner's disposition.

## Source map

- **D1:** Delta first-party homepage, https://delta.dev, accessed2026-10-25;
  “DeltaDB, underneath both” and model/harness/runtime portability description.
  Additional product-specific evidence is in the companion primary-source report.
- **D2:** DeltaDB technical deep dive,2026-10-15,
  https://delta.dev/blog/future-of-version-control; causal versions, fragment
  index, structural sharing, hypothetical Rust and diamond-types distinction.
- **D3:** Product architecture description, https://delta.dev/deltadb; edits/
  messages/file changes, replicas and Git relationship. Vendor claims, not tests.
- **D4:** https://delta.dev/docs/privacy-and-security/data-storage; explicit
  backend storage table, access/retention/deletion boundaries.
- **D5:** https://delta.dev/docs/privacy-and-security/agentic-safety; current
  local-agent safeguards absent and repository configuration auto-execution.
- **D6:** https://delta.dev/docs/agents/review-and-sync; snapshot verdicts and
  documented partial merge/pull outcomes.
- **D7:** https://delta.dev/early-access,2026-08-05, especially§3;
  product-use/derivative/reverse-engineering restrictions. Not legal advice.
- **D8:** https://github.com/zed-industries/delta-claude/blob/66b6c45139bf937f160b16b76c022446e649973b/README.md;
  pinned public plugin scope, captured data and AGPL-3.0-only licensing.
- **D9:** https://github.com/josephg/diamond-types/blob/89ae3a0ab8d941a2885e6ec89d094bc9ce9d2922/README.md;
  pinned observed master source (2026-09-02 commit), text-only scope, WASM
  bindings, ISC license and published-package warning; not a selected release.
- **L1:** [SPEC](../../SPEC.md), runtime architecture/security boundary,
  first-milestone and adapter acceptance, provider independence; [ROADMAP](../../ROADMAP.md)
  P2/P3 gates. Normative project requirements, not implemented guarantees.
- **L2:** [ADR-008](../../decisions.md#adr-008---2026-10-22-p0-durability-proposal),
  accepted local WAL/FULL, backup/restore assumptions and targets.
- **L3:** [Public exports](../../src/index.ts), [store](../../src/store.ts)
  live `writeGate`, `authorize`, `enqueueOutbox`, `relayBatch`, `resetKill`.
- **L4:** [Run/evidence API](../../src/runs.ts), registration/lifecycle/ref validation
  and read-snapshot status; [CLI contract](../../docs/cli.md) evidence limits.
- **L5:** [Outbox tests](../../tests/outbox.test.ts): business rollback, external
  callback outside write transaction, unknown-outcome reconciliation, independent
  target crash/replay and competing relay processes.
- **L6:** [P2 kickoff](../../docs/p2-runner-kickoff.md), current unimplemented
  supervisor/output/IPC/image/mount obligations; [ADR-020](../../decisions.md#adr-020---2026-10-25-p2-kickoff-and-contention-fixture-boundary).
- **L7:** [Ownership mapping](../pi/07-loom-v01-mapping.md#the-layering-read-once-then-the-tables),
  “no fact has two writers”; referenced task graph is future project truth,
  not an already implemented orchestrator.
- **L8:** [Write-gate tests](../../tests/write-gate.test.ts), native contention,
  stale/expired epochs, rollback, kill and abrupt exit.
- **L9:** [Kill tests](../../tests/kill.test.ts) and [run tests](../../tests/runs.test.ts),
  fresh reset snapshots, append-only history and v5 evidence binding.
- **L10:** [Schema tests](../../tests/schema-v2.test.ts), exact recognition,
  migration rollback/ENOSPC and verified independent backup clone.
