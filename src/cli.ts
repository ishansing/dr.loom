#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { checkFrameworkInstallation } from "./framework.ts";
import { getRunStatus, initRun, recordRunTransition } from "./runs.ts";
import {
	engageKill,
	getKillStatus,
	type KillInput,
	openExistingDb,
	prepareKillReset,
	resetKill,
	type WriteContext,
} from "./store.ts";

class CliError extends Error {}
let json = process.argv.includes("--json");
let command = "loom";
const safeErrors = new Set([
	"Unsupported Loom schema; database left unchanged",
	"Store requires explicit host migration to current schema",
	"No such run; init first",
	"No such registered run; init first",
	"Run already exists; start a new run ID",
	"A phase is still running; close it first",
	"No matching running phase to close",
	"Invalid phase/status; init is reserved",
	"Invalid run input",
	"Invalid run metadata",
	"Invalid run framework metadata",
	"Invalid evidence references",
	"Invalid evidence reference; file references require @sha256:HASH",
	"Write gate denied: killed",
	"Write gate denied: invalid or expired lease",
	"Reset plan is stale",
	"Reset requires unresolved work reconciliation",
	"Kill is not engaged",
	"Re-engage legacy kill before reset",
	"Trusted human synthetic control required",
]);

function main(): void {
	let parsed;
	try {
		parsed = parseArgs({
			args: process.argv.slice(2),
			allowPositionals: true,
			strict: true,
			tokens: true,
			options: {
				db: { type: "string" },
				run: { type: "string" },
				thread: { type: "string" },
				workspace: { type: "string" },
				owner: { type: "string" },
				epoch: { type: "string" },
				runbook: { type: "string" },
				goal: { type: "string" },
				scale: { type: "string" },
				phase: { type: "string" },
				status: { type: "string" },
				resume: { type: "string" },
				evidence: { type: "string", multiple: true },
				"framework-root": { type: "string" },
				"skills-root": { type: "string" },
				json: { type: "boolean" },
				help: { type: "boolean" },
				scope: { type: "string" },
				actor: { type: "string" },
				reason: { type: "string" },
				synthetic: { type: "boolean" },
				snapshot: { type: "string" },
				"cleanup-evidence": { type: "string" },
			},
		});
	} catch {
		throw new CliError("Invalid arguments; run loom help");
	}
	const { values, positionals, tokens } = parsed;
	json = values.json === true;
	const cmd = values.help ? "help" : (positionals[0] ?? "help");
	if (
		!["init", "record", "status", "check-framework", "help", "kill"].includes(
			cmd,
		) ||
		positionals.length > (cmd === "kill" ? 2 : 1)
	)
		throw new CliError("Unknown command; run loom help");
	command = cmd;
	const killOperation = positionals[1];
	if (
		cmd === "kill" &&
		!["engage", "status", "plan-reset", "reset"].includes(killOperation ?? "")
	)
		throw new CliError("kill requires engage, status, plan-reset or reset");
	const allowed: Record<string, readonly string[]> = {
		help: ["help", "json"],
		init: [
			"db",
			"run",
			"thread",
			"workspace",
			"owner",
			"epoch",
			"runbook",
			"goal",
			"scale",
			"framework-root",
			"skills-root",
			"json",
		],
		record: [
			"db",
			"run",
			"thread",
			"workspace",
			"owner",
			"epoch",
			"phase",
			"status",
			"resume",
			"evidence",
			"json",
		],
		status: ["db", "run", "json"],
		"check-framework": ["framework-root", "skills-root", "json"],
		kill: [
			"db",
			"scope",
			"json",
			...(["engage", "reset"].includes(killOperation ?? "")
				? ["actor", "reason", "evidence", "synthetic"]
				: []),
			...(killOperation === "reset" ? ["snapshot", "cleanup-evidence"] : []),
		],
	};
	const seen = new Set<string>();
	for (const token of tokens) {
		if (token.kind !== "option") continue;
		if (!allowed[cmd]?.includes(token.name))
			throw new CliError(`Option --${token.name} is not valid for ${cmd}`);
		if (seen.has(token.name) && token.name !== "evidence")
			throw new CliError(`Duplicate --${token.name}; provide it once`);
		seen.add(token.name);
	}
	function required(name: keyof typeof values): string {
		const value = values[name];
		if (typeof value !== "string" || !value.trim())
			throw new CliError(`--${name} is required`);
		return value;
	}
	function context(): WriteContext {
		const epoch = required("epoch");
		if (!/^[1-9]\d*$/.test(epoch) || !Number.isSafeInteger(Number(epoch)))
			throw new CliError("--epoch requires a positive safe integer");
		return {
			runId: required("run"),
			threadId: required("thread"),
			workspace: required("workspace"),
			owner: required("owner"),
			epoch: Number(epoch),
		};
	}
	function framework() {
		const result = checkFrameworkInstallation({
			referencePath: resolve("FRAMEWORK_REF"),
			skillsRoot: required("skills-root"),
			...(values["framework-root"]
				? { frameworkRoot: values["framework-root"] }
				: {}),
		});
		if (!result.ok) throw new CliError(result.reason);
		return result;
	}
	function emit(value: unknown, summary: string): void {
		console.log(
			json
				? JSON.stringify(value)
				: summary.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "?"),
		);
	}
	function label(value: string): string {
		return value.replace(/[\u0000-\u001f\u007f]/g, "?");
	}
	if (cmd === "help") {
		emit(
			{
				commands: ["init", "record", "status", "check-framework", "kill"],
				syntheticOnly: true,
			},
			"usage: loom <init|record|status|check-framework|kill> [--json]\ninit/record require --db --run --thread --workspace --owner --epoch and a host-prepared live lease.\ninit: --runbook NAME --goal TEXT --skills-root PATH [--framework-root PATH] [--scale small|standard|greenfield|e2e]\nrecord: --phase NAME --status running|committed|failed|interrupted --resume POINT [--evidence REF ...]\nstatus: --db PATH --run ID (read-only); check-framework: --skills-root PATH [--framework-root PATH]\nkill <status|plan-reset|engage|reset>: --db PATH --scope global|run:ID\nengage/reset require --synthetic --actor human:ID --reason TEXT --evidence REF; reset also --snapshot HASH --cleanup-evidence REF",
		);
		return;
	}
	if (cmd === "check-framework") {
		const result = framework();
		emit(
			result,
			`Framework ${result.version} ${result.commit}: verified ${result.skills.length} installed skills; lock sha256:${result.lockSha256}`,
		);
		return;
	}
	const dbPath = required("db");
	if (cmd === "kill") {
		const scope = required("scope");
		if (scope !== "global" && !/^run:\S+$/.test(scope))
			throw new CliError("--scope must be global or run:ID");
		const readonly =
			killOperation === "status" || killOperation === "plan-reset";
		if (!readonly && values.synthetic !== true)
			throw new CliError(
				"Critical changes require explicit --synthetic; no production control is qualified",
			);
		const db = openExistingDb(dbPath, readonly);
		try {
			if (killOperation === "status") {
				const result = getKillStatus(
					db,
					scope === "global" ? undefined : scope.slice(4),
				);
				emit(result, `Kill ${scope}: ${result.blocked ? "BLOCKED" : "clear"}`);
			} else if (killOperation === "plan-reset") {
				const plan = prepareKillReset(db, { scope });
				emit(
					plan,
					`Reset ${scope}: ${plan.blocked ? "BLOCKED: reconcile unresolved work" : "ready for human re-verification"}; snapshot ${plan.snapshotHash}`,
				);
			} else {
				const refs = values.evidence ?? [];
				if (refs.length !== 1 || !refs[0])
					throw new CliError(
						"Critical changes require exactly one --evidence reference",
					);
				const input: KillInput = {
					scope,
					actor: required("actor"),
					reason: required("reason"),
					evidenceRef: refs[0],
					synthetic: true,
				};
				const result =
					killOperation === "engage"
						? engageKill(db, input)
						: resetKill(db, {
								...input,
								snapshotHash: required("snapshot"),
								cleanupEvidenceRef: required("cleanup-evidence"),
							});
				emit(
					result,
					`Synthetic kill ${killOperation} recorded for ${scope}; leases are never automatically re-granted`,
				);
			}
		} finally {
			db.close();
		}
		return;
	}
	const runId = required("run");
	if (cmd === "status") {
		if (!existsSync(dbPath)) {
			emit(
				{ ok: true, reason: "no runs", run: null, threads: [] },
				"No runs (database absent; no store created)",
			);
			return;
		}
		const db = openExistingDb(dbPath, true);
		try {
			const result = getRunStatus(db, runId);
			const lines = [
				`Kill: ${result.kills.blocked ? "BLOCKED" : "clear"}`,
				`Run ${label(runId)}: ${label(result.run?.runbook ?? "legacy / unregistered")}`,
			];
			for (const thread of result.threads)
				lines.push(
					`Thread ${label(thread.threadId ?? "unknown (legacy)")}: committed ${label(thread.lastCommitted?.phase ?? "none")}; current ${label(thread.latest.phase)}/${label(thread.latest.status)}; resume ${label(thread.latest.resumePoint)}`,
				);
			lines.push(
				`Awaiting human: ${result.openActions.filter((action) => ["pending", "escalated"].includes(action.decision)).length}; interrupted actions: ${result.interruptedActions.length}; unresolved outbox: ${result.outbox.length}`,
			);
			for (const lease of result.leases)
				lines.push(
					`Lease ${label(lease.workspace)}: ${label(lease.owner)} epoch ${lease.epoch}; expires ${lease.expiresAt}`,
				);
			for (const budget of result.budgets)
				lines.push(
					`Budget ${budget.kind}: ${budget.used}/${budget.limit ?? "unset"} (${budget.mode})`,
				);
			if (!result.budgets.length)
				lines.push("Budgets: none configured; no provider metering qualified");
			emit(result, lines.join("\n"));
		} finally {
			db.close();
		}
		return;
	}
	const ctx = context();
	if (!existsSync(dbPath))
		throw new CliError(
			"Host must initialize the store and acquire a lease before init/record",
		);
	if (cmd === "init") {
		const runbook = required("runbook");
		const goal = required("goal");
		const scale = values.scale ?? "standard";
		if (
			scale !== "small" &&
			scale !== "standard" &&
			scale !== "greenfield" &&
			scale !== "e2e"
		)
			throw new CliError("--scale must be small, standard, greenfield or e2e");
		const proof = framework();
		const db = openExistingDb(dbPath);
		try {
			const result = initRun(
				db,
				{
					runId,
					runbook,
					goal,
					scale,
					frameworkCommit: proof.commit,
					frameworkVersion: proof.version,
					frameworkLockSha256: proof.lockSha256,
				},
				ctx,
			);
			emit(
				result,
				`Run ${result.runId} opened (${result.runbook}, ${result.scale}); phase records are bookkeeping, not verified task completion`,
			);
		} finally {
			db.close();
		}
	} else {
		const phase = required("phase");
		const status = required("status");
		const resumePoint = required("resume");
		if (
			status !== "running" &&
			status !== "committed" &&
			status !== "failed" &&
			status !== "interrupted"
		)
			throw new CliError(
				"--status must be running, committed, failed or interrupted",
			);
		const db = openExistingDb(dbPath);
		try {
			const result = recordRunTransition(
				db,
				{ phase, status, resumePoint, evidenceRefs: values.evidence ?? [] },
				ctx,
			);
			emit(
				result,
				`Run ${runId}: ${result.phase}/${result.status}; resume ${result.resumePoint}`,
			);
		} finally {
			db.close();
		}
	}
}

try {
	main();
} catch (error) {
	const reason =
		error instanceof CliError ||
		(error instanceof Error && safeErrors.has(error.message))
			? error.message
			: "Operation failed; check inputs/current schema/live lease and reconcile history with trusted host APIs";
	console.error(
		json
			? JSON.stringify({ ok: false, reason })
			: `${command} denied: ${reason}`,
	);
	process.exitCode = 1;
}
