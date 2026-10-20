# Loom — Architecture and Critical Decision Log

This is an append-only record of significant decisions, not a task diary.
Consult it with [SPEC.md](SPEC.md) before implementing a relevant change.
Accepted records are design choices, not claims that code or production gates
have passed. Existing architecture/research decisions remain in their linked
sources; this log does not retroactively change their dates or approval state.

## Recording rules and ADR format

Append when choosing/changing a dependency, data/authority boundary, meaningful
workaround, verification strategy or upstream escalation. Record the choice
when made, before the implementation obscures its alternatives. Use the next
unused sequential ID. Append supersession/status events with dates and links;
preserve earlier rationale instead of silently rewriting history.

Each record uses:

- **ID & Timestamp:** `[ADR-XXX] - YYYY-MM-DD (Phase X)` and a short title.
- **Status:** `Proposed | Accepted | Deprecated | Superseded by ADR-YYY`.
- **Context & Problem Statement:** the triggering constraint or requirement.
- **Options Evaluated:** at least two real viable paths and their tradeoffs.
  If a hard constraint leaves only one viable path, state that constraint and
  the eliminated alternatives; do not invent a viable unsafe option.
- **Decision & Rationale:** chosen path and the evidence/authority for choosing it.
- **Consequences & Tech Debt:** operational/performance impact, limits, owner and
  follow-up. Use “not measured” where no experiment establishes a benefit.

## [ADR-001] - 2026-10-21 (Governance bootstrap)

**Title:** Reuse the canonical SPEC for dynamic phase governance.

**Status:** Accepted.

**Context & Problem Statement:** The requested playbook calls for root
`spec.md` and `decisions.md`. Loom already has a normative `SPEC.md` with many
links, plus a product roadmap. Two tracked files differing only by letter case
would collide on common case-insensitive filesystems and confuse ownership.

**Options Evaluated:**

1. Keep `SPEC.md`; add one replaceable active-phase section with the seven
   required headings, preserving the architecture requirements above it.
2. Keep `SPEC.md` for architecture and use a separate `phase-spec.md` for phase
   execution. This separates concerns but introduces another mandatory document
   and diverges further from the requested name.
3. Rename the existing contract to `ARCHITECTURE.md` and introduce lowercase
   `spec.md`. This is portable but requires broad link/path churn for no current
   behavioral benefit.

**Decision & Rationale:** Choose option 1 as the smallest complete adaptation
of the user's governance request. `AGENTS.md` defines the workflow, `SPEC.md`
owns architecture plus clearly scoped active-phase requirements, `ROADMAP.md`
owns sequencing and `decisions.md` owns critical rationale. Avoid a case-only
duplicate and do not replace the architecture contract with a task scratchpad.

**Consequences & Tech Debt:** No runtime/schema/API or measured performance
change. Before a new authorized phase, update only the active-phase block;
completed phase evidence remains in Git history. If multiple simultaneous
phase specifications become necessary, revisit option 2 explicitly. Owner:
implementing developer; follow-up at the next phase kickoff.

## [ADR-002] - 2026-10-21 (Governance bootstrap)

**Title:** Use reviewed local governance and scope-aware, evidence-based gates.

**Status:** Accepted.

**Context & Problem Statement:** Automatic pulls of unspecified upstream rules
can merge unrelated changes or admit unreviewed instructions. The requested
SOP supplies no upstream rules URL/ref. Loom has three smoke tests, no dedicated
E2E runner/coverage threshold and no installed secret-scanner command; calling
all production checks green would misrepresent the current evidence.

**Options Evaluated:**

1. Version the user's adapted SOP locally and use its reviewed Git revision;
   configure external provenance only when an owner supplies/approves it.
2. Maintain a separate approved SOP repository with a pinned revision, fetch
   updates read-only, and review/promote them as governed changes. This is viable
   once the source, trust owner and compatibility policy are known.

**Decision & Rationale:** Use option 1 now; leave external synchronization
explicitly unconfigured rather than invent a source. Preserve the requested
lint → typecheck → test/coverage → security order. Required missing checks block
the affected code/release phase; justified docs-only N/A is not a code waiver.
Commits need an explicit request or approved phase commit policy; uploads,
pushes, deployments and phase advancement retain separate authorization.

**Consequences & Tech Debt:** No automatic pull, dependency update, upstream
issue publication or production action. A dependency audit/manual diff review
is not a complete secret scan or production certification. The next application
phase must establish appropriate integration/regression coverage, a comparable
coverage baseline and a trusted scanner as required by its risk. Owner:
implementing developer; review/approval remains with the project owner/operator.
No productivity or performance gain has been measured.
