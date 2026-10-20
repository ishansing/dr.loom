# Loom — handoff for a fresh OpenCode session

**Historical handoff:** the original requests/state below are preserved, not
current instructions or an implementation inventory. Start with [AGENTS.md](AGENTS.md),
[SPEC.md](SPEC.md) (including the active phase), [decisions.md](decisions.md)
and [ROADMAP.md](ROADMAP.md), then inspect Git and actual code. The old
“no scaffold/no remote” descriptions are historical; they must not override
the active user request or current repository state.

## What the user asked for

The user wants the harness in a **separate local directory/repository** named `loom`, with
**Bun** as its intended runtime. For now they asked for **only a base spec and this context
file, without scaffolding**. This directory was initialized as a local Git repository; no
remote, commit, application code, package manifest, CI, or framework-repo edits were
requested. Do not assume the user has authorized implementation.

## Where to look

- Framework checkout: `/home/zeref/Dev/I2P` (the `../I2P` sibling here).
- Baseline at handoff: commit `1d66588` on `master`, `VERSION` = `2.1.0`. Check its current
  state and use an explicit revision when implementation begins; do not assume a tag exists.
- `../I2P/SKILL-FRAMEWORK.md` §25 defines the readiness gate; §27 describes the division
  between framework behavior and harness enforcement.
- `../I2P/CUSTOM-HARNESS.md` is an **inputs-only stub**, not a settled build plan. It records
  candidate ideas for leases, state, audit, budgets, sandbox, deployment, and kill switches.
- `../I2P/dependency.md` is authoritative for approved skills/statuses;
  `../I2P/dependency.json` is generated from it, and `../I2P/skills.lock.json` pins upstream
  skill content. Adapter contracts are in `../I2P/.agents/skills/itp-*/SKILL.md`.
- `../I2P/.agents/skills/idea-to-production/references/artifacts.md` defines `skill_result`
  and `.itp/run.md` handoff shapes. The Markdown ledger is a coordination aid, *not* a
  production state database.
- `../I2P/tests/skills/results/2026-09-27-readiness-gate.md` assesses the gate as
  **READY (conditional)**. Outstanding confirmations: repeat the standard and greenfield
  goldens, run a full grilling interview, and run browser case FAIL-07 or record it as
  permanently blocked. Reassess against fresh evidence before writing enforcement code.
- `../I2P/tests/skills/HUMAN-RUNS.md` describes human-run cases and runbooks.

## Decisions and current state

- Separate local Git repository: `loom` at `/home/zeref/Dev/loom` on `master`; no remote.
- Bun chosen for the future implementation. An earlier proposed Node/TypeScript scaffold,
  CI, contract test, and `FRAMEWORK_REF` file were superseded by the request for just two
  documents. Do not materialize them now.
- First prospective milestone: persistent session ledger, conflict-safe mutation leases,
  append-only audit; other harness concerns come later. The details are draft in `SPEC.md`.
- This session did not alter the framework checkout. Cross-repo doc moves, links, and
  compatibility wiring remain future work, if requested.

## Suggested next conversation

Start by reading `SPEC.md`, then inspect the referenced framework contracts and check
whether the §25 conditions have since been met. Clarify Loom's actual enforcement boundary
with the user before defining schemas or writing code. Keep the source registry and adapter
procedures in I2P; Loom should consume a pinned revision and persist execution evidence.

## Update 2026-10-01 — gate met, pin moved

The §25 gate is **MET** (I2P `4fe0869`, judgment
`tests/skills/results/2026-10-01-readiness-gate-closed.md`; all four
conditions met by run, none waived). Loom re-pinned `1d66588` → `4fe0869`
(`FRAMEWORK_REF`, `src/framework.ts`, `SPEC.md`; evidence-only delta,
`VERSION` still `2.1.0`). Kill switch joins milestone 1 per the grilling
outcome. Enforcement code is permitted; R-04/R-06/R-11 designs are
build-ready pending build authorization.
