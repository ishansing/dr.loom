# R-13 — Per-Thread Resume Semantics

Status: design. No `src/` changes (R-01 gate still closed).
Grounding: subagent isolation shape — fresh context in, final report
out (02 Part 4.6); LangGraph `thread_id`; OpenAI handoff history;
R-12 lifecycle; workspace-wide lease (user decision).

## Model

- `run_id` = the whole run. **Thread** = one agent execution context:
  `main` plus one thread per subagent spawn. Threads are the unit of
  resume; the run is the unit of audit.
- `transitions` and `audit` each gain `thread_id TEXT NOT NULL DEFAULT
  'main'` (schema v2, with R-11's `action_id/actor/tier`). Resume point
  = latest committed transition per `(run_id, thread_id)`.
- A parent thread resumes from its own thread's last committed row and
  never sees child rows in its resume path. Child threads' transitions
  persist for audit (and for child-scoped resume if the child itself is
  resumed) but are invisible to the parent's "where was I" query. This
  mirrors the isolation contract: parent got a final report, not the
  producing calls.

## Spawn and handoff (audit shapes, R-11 lifecycle)

- Spawn = an audit action (`action=spawn`, `actor=<parent-thread>`,
  evidence `session:<child-thread-id>`), tier standard. The child
  thread's first transition references the spawn row. No orphan threads:
  a thread with no spawn row is a writer bug → reject.
- Effect handoff between threads (manager → specialist doing the
  mutation): lease ownership transfers as **release + acquire** (epoch
  bumps — clean fencing, exactly R-10's succession shape), recorded as
  one audit action (`action=handoff`, actor=old owner, evidence=new
  owner + epoch). No silent owner overwrite: the epoch trail shows every
  hand that held the workspace.
- Threads never share an open phase: at most one `running` transition
  per `(run_id, thread_id)` (R-12 rule, scoped). Two threads in the
  same phase name is fine — the thread scope disambiguates.

## Lease interaction

- One workspace lease, one holder at a time — across all threads. The
  holder is the thread currently executing effects, named in
  `leases.owner` as `<agent-id>:<thread-id>`.
- Non-holding threads may read, plan, and request (audit rows flow);
  only the holder's owner+epoch passes the R-04 write gate. A thread
  that needs to mutate without the lease gets `held by …` — the same
  answer as a foreign agent, because to the lease they are identical.

## Termination and cost containment

- Depth bound: spawn depth ≤ 3 (Claude default, 02 Part 4.6) — deeper
  nesting is rejected at spawn-audit time, aligning with I2P's
  recursion bounds (depth/repeat/children) that Loom will enforce at
  §27.3.
- The spawn audit row carries the parent's budget context; per-thread
  token/cost accounting (R-16) aggregates by `thread_id` roll-up to
  `run_id`. Fan-out without a cap is the failure mode — depth bound is
  the cap until budgets land.
