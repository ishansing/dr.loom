# Research watch schedule

Use this schedule for R-27–R-29 in [the research backlog](03-research-backlog.md).
These checks run when a person or agent is available; this file is a reminder,
not an automatic monitor. Record each completed check in a dated note under
`research/watches/` using the template below. A missed date stays due until
the check is performed; do not mark it complete based on a calendar reminder.

| Watch | When to check | First check / next trigger | What closes the check |
| --- | --- | --- | --- |
| **R-27 — provisional research** | When either 2026 context-rot or premature-termination preprint is published in a reviewed venue, **or before** relying on one for a Loom design or implementation decision. | Event-triggered; no periodic poll required. | Record the published primary source, differences from the cited preprint, and any Loom docs or decisions that need updating. If still unreviewed, label the claim provisional. |
| **R-28 — primary-source cleanup** | **One-time:** before reusing secondary-only claims from research 01/02 in a spec or build ticket. | Do once before the next such reuse; this is a finite task, not a recurring watch. | For each claim, cite its primary source, mark it explicitly as Loom's inference, or remove it. Then mark R-28 done in the backlog. |
| **R-29 — upstream drift** | **Monthly, first working day**, and additionally **before** upgrading Pi, changing an adapter, implementing a pinned I2P contract, or adopting an MCP-facing feature. | First calendar check: **2026-11-02** (November 1 is Sunday); an implementation trigger before then takes precedence. Repeat on the first working day each month. | Record checked revisions and contract-relevant differences; decide `no action`, `investigate`, or `propose re-pin`. When re-pinning, run the relevant contract/conformance checks and record the result in a separate change. |

## R-29 review procedure

1. Compare Loom's `FRAMEWORK_REF` to the I2P checkout and its skill lock hashes;
   check I2P's recorded readiness/contract evidence. Compare Loom's selected Pi
   package version with its upstream release notes and the APIs Loom uses
   (`tool_call`, SDK session lifecycle, JSONL format, compaction, RPC). If MCP
   is in use, compare the pinned spec revision and relevant transport/security
   changes. Check other runtime adapters only when installed or being changed.
2. Classify differences by *effect on Loom's contracts*, not by whether an
   upstream commit exists. Record exact versions/commits, source links and the
   result; documentation-only drift may be `no action`.
3. Never install, substitute, or re-pin skills/runtimes automatically. A
   proposed pin change gets its own reviewed change and the affected tests.
   Keep the existing pin until that change is accepted.

## Dated record template

Create `research/watches/YYYY-MM-DD-<watch-id>.md` when a check actually runs:

```markdown
# R-29 upstream drift — YYYY-MM-DD

- Trigger: monthly / pre-upgrade / pre-contract / pre-MCP
- Baselines checked: I2P commit and lock hashes; Pi package version; MCP spec (if used)
- Upstream sources and revisions: <links + exact revisions>
- Contract-relevant differences: <specific differences, or none>
- Decision: no action / investigate / propose re-pin
- Verification run and observed result: <commands/results if a change is proposed>
- Owner and next action: <who will act; link to follow-up if needed>
```

For R-27, replace the baseline fields with paper/version and peer-review status.
For R-28, keep a list of each resolved secondary-only claim and its replacement
primary link or inference label. No watch is complete merely because upstream
has not changed: record what was inspected and when.
