import type { Database } from "bun:sqlite";
import {
	type BudgetKind,
	getAction,
	getBudget,
	getKillStatus,
	type Lease,
	listOpenActions,
	listUnresolvedOutbox,
	recordTransition,
	type Transition,
	type WriteContext,
	writeGate,
} from "./store.ts";

export interface RunInput {
	runId: string;
	runbook: string;
	goal: string;
	scale: "small" | "standard" | "greenfield" | "e2e";
	frameworkCommit: string;
	frameworkVersion: string;
	frameworkLockSha256: string;
}
export interface RunRecord extends RunInput {
	createdAt: string;
}

const runColumns =
	"run_id AS runId, runbook, goal, scale, framework_commit AS frameworkCommit, framework_version AS frameworkVersion, framework_lock_sha256 AS frameworkLockSha256, created_at AS createdAt";

function text(value: unknown, max = 4096): string {
	if (
		typeof value !== "string" ||
		!value.trim() ||
		value.length > max ||
		/[\u0000-\u001f\u007f]/.test(value)
	)
		throw new Error("Invalid run input");
	return value;
}

function runKey(runId: string): void {
	if (/\s/.test(text(runId, 256))) throw new Error("Invalid run ID");
}

function validateRun(input: RunInput): void {
	if (
		!input ||
		typeof input !== "object" ||
		Object.keys(input).some(
			(key) =>
				![
					"runId",
					"runbook",
					"goal",
					"scale",
					"frameworkCommit",
					"frameworkVersion",
					"frameworkLockSha256",
				].includes(key),
		)
	)
		throw new Error("Invalid run metadata");
	runKey(input.runId);
	text(input.runbook, 256);
	text(input.goal);
	if (
		!["small", "standard", "greenfield", "e2e"].includes(input.scale) ||
		!/^[0-9a-f]{40}$/.test(input.frameworkCommit) ||
		!/^\d+\.\d+\.\d+$/.test(input.frameworkVersion) ||
		!/^[0-9a-f]{64}$/.test(input.frameworkLockSha256)
	)
		throw new Error("Invalid run framework metadata");
}

export function getRun(db: Database, runId: string): RunRecord | null {
	runKey(runId);
	const row = db
		.query<RunRecord, [string]>(`SELECT ${runColumns} FROM runs WHERE run_id=?`)
		.get(runId);
	if (row) {
		const { createdAt, ...input } = row;
		validateRun(input);
		if (!Number.isFinite(Date.parse(createdAt)))
			throw new Error("Invalid run history");
	}
	return row;
}

function linkEvidence(
	db: Database,
	transitionId: number,
	refs: readonly string[],
): void {
	for (const [position, ref] of refs.entries()) {
		const result = db
			.query("INSERT INTO transition_evidence VALUES (?,?,?)")
			.run(transitionId, position, ref);
		if (result.changes !== 1)
			throw new Error("Failed to persist transition evidence");
	}
	const rows = db
		.query<{ ref: string }, [number]>(
			"SELECT evidence_ref AS ref FROM transition_evidence WHERE transition_id=? ORDER BY position",
		)
		.all(transitionId);
	if (JSON.stringify(rows.map((row) => row.ref)) !== JSON.stringify(refs))
		throw new Error("Failed to persist transition evidence");
}

export function initRun(
	db: Database,
	input: RunInput,
	context: WriteContext,
): RunRecord {
	validateRun(input);
	return db
		.transaction(() => {
			writeGate(db, context);
			if (context.runId !== input.runId)
				throw new Error("Run does not match gate context");
			if (
				getRun(db, input.runId) ||
				db
					.query(
						"SELECT 1 FROM transitions WHERE run_id=? UNION ALL SELECT 1 FROM audit WHERE run_id=? UNION ALL SELECT 1 FROM outbox WHERE run_id=? LIMIT 1",
					)
					.get(input.runId, input.runId, input.runId)
			)
				throw new Error("Run already exists; start a new run ID");
			const inserted = db
				.query(
					"INSERT INTO runs (run_id,runbook,goal,scale,framework_commit,framework_version,framework_lock_sha256) VALUES (?,?,?,?,?,?,?)",
				)
				.run(
					input.runId,
					input.runbook,
					input.goal,
					input.scale,
					input.frameworkCommit,
					input.frameworkVersion,
					input.frameworkLockSha256,
				);
			if (inserted.changes !== 1)
				throw new Error("Failed to persist run metadata");
			const evidenceRef = `trace:framework:${input.frameworkCommit}:sha256:${input.frameworkLockSha256}`;
			const transition = recordTransition(
				db,
				{
					runId: input.runId,
					phase: "init",
					status: "committed",
					resumePoint: "record first phase",
					evidenceRef,
				},
				context,
			);
			linkEvidence(db, transition.id, [evidenceRef]);
			const run = getRun(db, input.runId);
			if (
				!run ||
				Object.keys(input).some(
					(key) => Reflect.get(run, key) !== Reflect.get(input, key),
				)
			)
				throw new Error("Failed to persist run metadata");
			return run;
		})
		.immediate();
}

export interface RunTransitionInput {
	phase: string;
	status: "running" | "committed" | "failed" | "interrupted";
	resumePoint: string;
	evidenceRefs?: readonly string[];
}

export function recordRunTransition(
	db: Database,
	input: RunTransitionInput,
	context: WriteContext,
) {
	if (
		!input ||
		typeof input !== "object" ||
		Object.keys(input).some(
			(key) =>
				!["phase", "status", "resumePoint", "evidenceRefs"].includes(key),
		)
	)
		throw new Error("Invalid phase input");
	text(input.phase, 256);
	text(input.resumePoint);
	if (
		input.phase === "init" ||
		!["running", "committed", "failed", "interrupted"].includes(input.status)
	)
		throw new Error("Invalid phase/status; init is reserved");
	const evidenceRefs =
		input.evidenceRefs === undefined ? [] : [...input.evidenceRefs];
	if (
		!Array.isArray(input.evidenceRefs ?? []) ||
		evidenceRefs.length > 32 ||
		new Set(evidenceRefs).size !== evidenceRefs.length
	)
		throw new Error("Invalid evidence references");
	for (const ref of evidenceRefs) {
		text(ref);
		if (
			!/^(cmd|file|session|url|trace|approval|archive):\S/.test(ref) ||
			(ref.startsWith("file:") && !/^file:\S.*@sha256:[0-9a-f]{64}$/.test(ref))
		)
			throw new Error(
				"Invalid evidence reference; file references require @sha256:HASH",
			);
	}
	return db
		.transaction(() => {
			writeGate(db, context);
			if (!getRun(db, context.runId))
				throw new Error("No such registered run; init first");
			const latest = readThreads(db, context.runId, true).find(
				(thread) => thread.threadId === context.threadId,
			)?.latest;
			if (input.status === "running" && latest?.status === "running")
				throw new Error("A phase is still running; close it first");
			if (
				input.status !== "running" &&
				(latest?.status !== "running" || latest.phase !== input.phase)
			)
				throw new Error("No matching running phase to close");
			const transition = recordTransition(
				db,
				{
					runId: context.runId,
					phase: input.phase,
					status: input.status,
					resumePoint: input.resumePoint,
					...(evidenceRefs[0] ? { evidenceRef: evidenceRefs[0] } : {}),
				},
				context,
			);
			linkEvidence(db, transition.id, evidenceRefs);
			return { ...transition, evidenceRefs };
		})
		.immediate();
}

export interface RunTransition extends Transition {
	threadId: string | null;
	evidenceRefs: string[];
}
export interface ThreadResume {
	threadId: string | null;
	latest: RunTransition;
	lastCommitted: RunTransition | null;
	running: RunTransition | null;
}

function readThreads(
	db: Database,
	runId: string,
	registered: boolean,
): ThreadResume[] {
	const rows = db
		.query<Transition & { threadId: string | null }, [string]>(
			"SELECT id,run_id AS runId,thread_id AS threadId,phase,status,resume_point AS resumePoint,evidence_ref AS evidenceRef,created_at AS createdAt FROM transitions WHERE run_id=? ORDER BY id",
		)
		.all(runId);
	const links = db
		.query<{ transitionId: number; position: number; ref: string }, [string]>(
			"SELECT e.transition_id AS transitionId,e.position,e.evidence_ref AS ref FROM transition_evidence e JOIN transitions t ON t.id=e.transition_id WHERE t.run_id=? ORDER BY e.transition_id,e.position",
		)
		.all(runId);
	const refs = new Map<number, string[]>();
	for (const link of links) {
		const list = refs.get(link.transitionId) ?? [];
		if (link.position !== list.length)
			throw new Error("Invalid evidence history");
		list.push(link.ref);
		refs.set(link.transitionId, list);
	}
	const threads = new Map<string | null, ThreadResume>();
	for (const row of rows) {
		const evidenceRefs =
			refs.get(row.id) ??
			(!registered && row.evidenceRef ? [row.evidenceRef] : []);
		if (registered && (evidenceRefs[0] ?? null) !== row.evidenceRef)
			throw new Error("Invalid evidence history");
		const transition = { ...row, evidenceRefs };
		const previous = threads.get(row.threadId);
		if (registered) {
			if (!row.threadId) throw new Error("Invalid registered phase history");
			if (row.phase === "init") {
				if (previous || row.status !== "committed")
					throw new Error("Invalid registered phase history");
			} else if (row.status === "running") {
				if (previous?.running)
					throw new Error("Invalid registered phase history");
			} else if (
				!["committed", "failed", "interrupted"].includes(row.status) ||
				previous?.running?.phase !== row.phase
			)
				throw new Error("Invalid registered phase history");
		}
		threads.set(row.threadId, {
			threadId: row.threadId,
			latest: transition,
			lastCommitted:
				row.status === "committed"
					? transition
					: (previous?.lastCommitted ?? null),
			running: row.status === "running" ? transition : null,
		});
	}
	return [...threads.values()];
}

export function getRunStatus(db: Database, runId: string) {
	runKey(runId);
	return db.transaction(() => {
		const kills = getKillStatus(db, runId);
		const run = getRun(db, runId);
		const threads = readThreads(db, runId, run !== null);
		const openActions = listOpenActions(db, { runId });
		const interruptedActions = db
			.query<{ threadId: string; actionId: string }, [string]>(
				"SELECT thread_id AS threadId,action_id AS actionId FROM latest_audit WHERE run_id=? AND outcome='interrupted' ORDER BY id",
			)
			.all(runId)
			.map((key) => {
				const action = getAction(db, { runId, ...key });
				if (!action) throw new Error("Invalid interrupted action history");
				return action;
			});
		const outbox = listUnresolvedOutbox(db, { runId });
		if (
			!run &&
			!threads.length &&
			!openActions.length &&
			!interruptedActions.length &&
			!outbox.length &&
			!kills.blocked
		)
			throw new Error("No such run; init first");
		const leases = db
			.query<Lease, [string]>(
				"SELECT workspace,owner,epoch,run_id AS runId,acquired_at AS acquiredAt,expires_at AS expiresAt FROM leases WHERE run_id=? ORDER BY workspace",
			)
			.all(runId);
		const budgets = db
			.query<{ kind: BudgetKind }, [string]>(
				"SELECT kind FROM budgets WHERE run_id=? ORDER BY kind",
			)
			.all(runId)
			.map(({ kind }) => {
				const budget = getBudget(db, runId, kind);
				if (!budget) throw new Error("Invalid budget history");
				return {
					...budget,
					mode: budget.limit === null ? "meter-only" : "capped",
				};
			});
		return {
			kills,
			runId,
			run,
			legacy: run === null,
			threads,
			openActions,
			interruptedActions,
			outbox,
			leases,
			budgets,
			...(!threads.length ? { reason: "no transitions" } : {}),
		};
	})();
}
