# P0 — Framework baseline review

Date: **2026-10-22**. Read-only local Git-object research; no skill/test execution,
installation, fetch, pin change or sibling-worktree modification. **Research
recommendation, subsequently accepted in ADR-007:** retain `2.1.0` for the first bounded TS-fix workflow,
then revalidate that exact pin and its required children before claiming support.
Do not promote `4.0.0` merely because its release number is newer.

Authority: [SPEC baseline](../../SPEC.md#source-of-truth-and-readiness),
[active phase](../../SPEC.md#active-phase-specification),
[ADR-005](../../decisions.md#adr-005---2026-10-22-p0-runtime-recommendation),
[support profile](05-p0-support-profile.md), and
[current runtime/skill evidence](../pi/17-p0-runtime-recommendation.md).
Owner accepted baseline selection on 2026-10-22; G0/P1 and production
qualification are not closed by this review.

**Owner-input follow-up (2026-10-22):** a disposable Loom checkout with synthetic
fault injection was subsequently selected as the reference repository. Exact
golden-task/framework inputs and whole-workflow qualification are still pending;
the read-only source findings below do not become fresh execution evidence.
The owner also chose retained `2.1.0` in [ADR-007](../../decisions.md#adr-007---2026-10-22-p0-framework-baseline-proposal);
no installation/re-pin or fresh readiness claim follows.

## Sources and measured delta

All framework citations below are **`revision:path` Git objects**, not working-tree
files or remote links. `P` means `4fe0869ae41b0d81cbe3c6bc643f10ff2049ceed`;
`N` means `bd0cacc5a0a81d41311782d2b20f778ee7b40392`. Resolve with
`git -C ../I2P show <revision>:<path>`; these aliases denote exact commits throughout.
[FRAMEWORK_REF](../../FRAMEWORK_REF) selects P. `P:VERSION` is `2.1.0`;
`N:VERSION` is `4.0.0`. Inspection preserved the current branch and existing work.

`git diff --stat P N` records **84 files, +6280/−409 lines** overall. The relevant
contract/registry/skill-lock subset is **8 changed files**:

| Surface | Measured change / consequence |
| --- | --- |
| Adapter contracts | **3** changed `SKILL.md` files: `N:.agents/skills/itp-architecture/SKILL.md` adds conditional `security-threat-model`; `N:.agents/skills/itp-implement/SKILL.md` removes conditional `resolving-merge-conflicts`; `N:.agents/skills/itp-verify/SKILL.md` adds conditional `pr`. Required children unchanged. |
| Root/routing | **2** changed files: `N:.agents/skills/idea-to-production/SKILL.md` and `N:.agents/skills/idea-to-production/references/lifecycle.md` add optional user-entry handoffs and direct conflict routing. Thus **5 skill-tree files** change in total. |
| Registry | **2** changed files: `dependency.md` and generated `dependency.json`; inventory **23 → 26**. Add `pr`, `implement-spec`, `retro`, `security-threat-model`; remove `resolving-merge-conflicts`. Canonical React trigger spelling corrected. |
| Skill lock | **1** changed `skills.lock.json`: **23 → 26** entries; four additions, one removal, ten surviving Matt entries change commit, four of those also change directory hash. Both vendored entries unchanged. |

Separately, N adds `package.json` and a **53-line `package-lock.json`** with direct
dependencies `parse5@8.0.1` and `yaml@2.9.1` for framework tooling. These are not
Loom dependencies or additions to `skills.lock.json`. Installer/distribution and
watchlist growth is not required to execute the first small workflow.

Migration history (full commit IDs):

- `25ebeee6a9e48430fe3f3dfd69a9caa21be8c4f2`: existing Matt dependencies move
  from `959a8e9f1edc3adbe2f7e3054bb6fbefa6696260` to
  `984a2c023c9fb42bb6ea40c70a652284a109dc05` (Matt v1.3).
  `N:tests/skills/results/2026-10-08-matt-v1.3-migration.md` reports all four
  hash changes (`domain-modeling`, `codebase-design`, `tdd`, `diagnosing-bugs`)
  are glossary filename/reference migrations, not a new TDD algorithm. This is
  recorded upstream review, not a fresh independent comparison of external blobs.
- `ed7c6eb73a49c045cdcbc6b7505692cdfeef0b55`: optional workflows and invocation
  guards; `e344138f56825d745ce5058d4f6d8c388f88ce18`: release `3.0.0`.
- `350d633859b61717c2e1be22413219b5914ad812`: conditional threat-model adoption;
  `84e9104be3414ff8d341f0e45decc92dbaa50e54`: `installed-local` location checks.
- `28ef662515a504cfec38c15423f0d0605ccb2e09`: verified installation bundles/menu;
  `5b3c992a369018f8cdeb6f3030de8691a0065b50`: release `4.0.0`.
  N includes subsequent presentation changes, not another framework contract version.

## First supported workflow: what actually changes

At both revisions, `references/lifecycle.md` under
`.agents/skills/idea-to-production/` defines `small` as one module, clear requirements,
no new interface/boundary and no security/data/destructive/migration surface.
Greenfield is not small. Root-authored spec-lite → slice → implement → review →
verify remains the bounded route (target at most four adapter loads). A clear bug
may take the documented implementation shortcut. Review and verification never
disappear; a hard specialist trigger raises scale and may leave initial support.

Concrete N differences for a small existing-repository TS fix:

- **Implementation:** same required `tdd`, but its lock hash and the conditional
  diagnosis child's hash change. Glossary/reference discovery must be rechecked.
  Conflicts now belong directly to `itp-implement`, with checks and ambiguity
  handoff, rather than a removed external conflict skill. Initial conflict-free
  scope needs neither behavior, but unexpected conflicts must stop or follow the
  explicitly qualified revision's contract, not silently mix revisions.
- **Review:** `itp-review` and required `code-review` adapter relationship are
  unchanged; the review child's Matt commit changes but its content hash does not.
  `itp-review/SKILL.md` requires a resolvable fixed point, real spec/slice inputs,
  and `needs-human` if tracker configuration is missing. These prerequisites are
  not removed by choosing small scope.
- **Verify:** same vendored `verification-before-completion`; N can draft a
  requested PR body only after pass. Missing `pr` becomes a separate human
  close-out handoff preserving verification evidence. This does not authorize
  publication. No requested PR delivery means no additional child for the first fix.
- **Architecture/parallelism:** threat modeling fires only on its security trigger;
  that is outside the proposed small scope. `implement-spec` and `retro` are
  user-entry only, never recursive children; no new scheduler is needed. Returned
  parallel integration still requires actual review and fresh verification.

Sources: P/N `.agents/skills/itp-{slice,implement,review,verify}/SKILL.md`,
N `.agents/skills/itp-architecture/SKILL.md`, and P/N `dependency.md` and
`skills.lock.json`. No listed skill procedure was invoked during this review.

## Artifact/result/ledger versions: no schema migration found

P and N `.agents/skills/idea-to-production/references/artifacts.md` have the
**identical Git blob** `eec6b815e6927c014e3d3bcf37610dc2ed6d4ad6`.
The release version changes **2.1.0 → 4.0.0**, but adapter metadata remains
`framework-version: "2"`; skill-lock `version: 1` and
`framework: idea-to-production@2` remain unchanged.

Neither `skill_result`, portable artifacts nor `.itp/run.md` carries a new numeric
schema version. The result still has `skill`, `status`, `summary`, `artifacts`,
`evidence`, `findings`, `open_questions`, `recommended_next`, `handoff`.
The sample status comment lists completed/changes-requested/pass/fail/blocked/
needs-human, while the implementation adapter also declares `needs-review` at
both revisions: validate actual per-adapter exits, not only that sample comment.

Small minimum artifacts remain spec with stable `REQ-` IDs, ISSUE with inline
acceptance criteria, review, verification and `.itp/run.md`. The ledger remains
`goal`, `scale`, `checkpoints`, `next_phase`, `completed`, artifact pointers,
`loaded_skills`, `open_questions`, plus optional slice/awaiting/amendments.
`checkpoints` supports false/phase/slice (legacy true means phase); paused state
uses `awaiting: user`, and `next_phase` supplies resume. This is a coordination
artifact, not Loom's concurrent authority database. Loom must separately bind
evidence to the exact framework revision and candidate hash.

## Readiness evidence: present is not newly executed

| Revision-bound source | What it establishes / limit |
| --- | --- |
| `P:tests/skills/results/2026-10-01-readiness-gate-closed.md` | Historical §25 closure: standard and greenfield repeats, full grilling interview, FAIL-07 negative/positive paths; all four met by recorded runs. It retains harness exclusions, including conflict-invocation proof. This is the strongest closed baseline, not a fresh SDK 1.4.0 workflow run. |
| `N:tests/skills/results/2026-10-08-matt-v1.3-{migration,capabilities,behavior}.md` | Structural/install checks, invocation-class negatives and file-driven glossary/conflict/handoff/PR/retro cases, each with explicit limits. They explicitly do not extend the earlier §25 closure to changed paths. |
| `N:tests/skills/results/2026-10-08-matt-v1.3-native.md` and `2026-10-08-matt-v1.3-conformance.md` in the same directory | Native OpenCode discovery, real parallel ordering and review/verify; constrained second integration uses strict fast-forward landings and 7/7 tests. Original grilling recommendation formatting failed twice; those failures remain historical failures. No Pi qualification follows. |
| `N:tests/skills/results/2026-10-08-grilling-prompt-diagnosis.md`; correction commit `6230ad0e06fc430f6771737b9da20ae734cfea42` | Later controlled prompt contrasts diagnose a conflicting validation clause; clarified full scenario produces four recommendation-bearing questions and awaits the human. This closes that probe defect, not general reliability or whole-release readiness. Do not report the earlier failure as the final unresolved diagnosis. |
| `N:tests/skills/results/2026-10-12-threat-model-adoption.md` | Historical 63 contract checks, 80 script tests, strict isolated install and native security trigger pass; non-trigger evaluated, not separately executed. |
| `N:docs/work/verification.md`, `N:docs/validation.md` | Later local record reports 89 script tests and 63 contract checks; release distribution/scope smokes are recorded. Validation explicitly calls §25 historical and OpenCode the primary behavioral runtime. No new whole-release §25 closure or Loom/Pi small-workflow qualification was found. |

For **recommended P**, Loom's [current report](../pi/17-p0-runtime-recommendation.md#pinned-framework-what-actually-loaded)
adds dated SDK 1.4.0 discovery/text-persistence and negative tamper/missing/symlink
evidence: 12 roots, verified vendored child, synthetic result transport. It expressly
does **not** execute an entire I2P workflow. This review reran none of those cases.

## Provisioning gap and narrow revalidation

Both revisions track **12 roots** (root, nine adapters, two vendored children).
An isolated snapshot is not a complete skill installation. Small implementation
requires externally provisioned **`tdd` and `code-review`**; unknown-cause failures
also require **`diagnosing-bugs`**. Provision every triggered child at its selected
lock commit/path/hash, including its references, before invocation. Both vendored
children are unchanged; completion uses `verification-before-completion`, not a
substitute. Global inventory status is a declaration, not host evidence.

`N:tests/skills/check-contracts.mjs` checks graph/lock consistency, invocation
classes, vendored hashes and installed-local location/name, but **does not verify
installed-global existence/content**. A green static check cannot close this gap.
The shared lock method is SHA-256 over sorted relative path + NUL + bytes + NUL
for each directory file (`P/N:scripts/skill-hash.mjs`). Resolve names explicitly;
reject missing/drifted children rather than using ambient global skills.

**Future approved revalidation only; none run here:**

1. Recheck exact Git objects/version/registry/locks; export a fresh regular-file
   snapshot outside the sibling checkout. Inspect and hash the separately approved
   child directories with `node scripts/skill-hash.mjs <approved-child-dir>` from
   that revision's snapshot. Compare against its lock, not current global content.
   Run `node tests/skills/check-contracts.mjs <snapshot>` from the reviewed snapshot;
   retain the independent global-content admission check above.
2. For retained P, repeat the existing bounded transport/negative probe on the
   already reviewed external SDK installation (if still available):
   `python3 research/pi/probes/p0-framework.py --framework ../I2P --experiment /tmp/opencode/loom-p0-comparison-140 --version 1.4.0`.
   It reads current `FRAMEWORK_REF`; **it has no alternate-ref option**, so this
   command cannot establish N compatibility while P remains selected. It still
   does not run child procedures or qualify a full workflow.
3. After provisioning/authority approval, execute one sanitized representative
   small TS fix on SDK 1.4.0: recorded deterministic red test → bounded patch →
   lint/typecheck/tests/coverage → independent fixed-point review → fresh exact-hash
   verification. Preserve portable artifacts and resume/checkpoint state. Exercise
   missing/drifted `tdd`/review child, missing review, fabricated empty-evidence
   pass, and post-verification candidate change as rejection cases. A missing
   tracker/configuration is a handoff, not invented setup. Exact repository gate
    commands must come from that disposable Loom fixture; its exact golden task
    and required framework inputs still need specification.
4. If N is chosen instead, first authorize a separate exact-ref snapshot/probe
   path and explicit re-pin work package. Recheck changed glossary references,
   direct conflict ambiguity, user-entry rejection and conditional close-out
   semantics; rerun applicable native cases on the selected SDK, not OpenCode
   evidence alone. No install/upgrade or test command is authorized by this list.

## Recommendation, risks and next owner

**Recommend retain/revalidate P for the first small, conflict-free TS fix.** Its
closed historical gate, unchanged core route and existing exact-pin SDK transport
evidence avoid migrating unrelated optional capabilities before first support.
This is not indefinite freeze or a claim P is production ready.

| Path | Material risk / missing evidence |
| --- | --- |
| Retain P | Older child content and conflict contract; current global skill copies may not match. Must provision exact old locks and run the real small workflow on the selected SDK. No fresh complete-run/representative-repository evidence yet. Do not silently use N children. |
| Reviewed re-pin N | Bounded adapter delta but changed child hashes, invocation/handoff cases and installer/tooling surface; inherited §25 results do not cover the new revision. Requalification needed; release/distribution success is not a fresh Pi workflow or Loom safety gate. No schema migration is implied by version 4 alone. |

**Next owner:** developer scopes provisioning and exact-revision workflow revalidation under
the existing isolation/authority rules. No dependency promotion, changed pin,
phase advancement, commit or publication occurs from this source review. Automated
secret scanning and runtime/full-workflow checks were not performed; all runtime
results cited above are dated records, not fresh execution by this review.
