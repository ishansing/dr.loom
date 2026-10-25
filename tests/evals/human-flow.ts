import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as s from "../../src/index.ts";
import { fixtureEnv, frameworkFixture } from "../fixtures/framework.ts";

const fixture = frameworkFixture();
const path = join(fixture.dir, "drill.sqlite");
const cli = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));
const events: string[] = [];
const db = s.openDb(path);
const context = [
	"--db",
	path,
	"--run",
	"drill",
	"--thread",
	"main",
	"--workspace",
	"fixture:drill",
	"--owner",
	"fixture",
	"--epoch",
	"1",
];
const control = ["--db", path, "--scope", "run:drill"];
const attribution = [
	"--actor",
	"human:fixture-operator",
	"--reason",
	"Synthetic operator drill",
	"--evidence",
	"approval:fixture-drill",
	"--synthetic",
];

function invoke(args: string[], expectedExit = 0) {
	const child = Bun.spawnSync([process.execPath, cli, ...args, "--json"], {
		cwd: fixture.dir,
		env: fixtureEnv,
		stdout: "pipe",
		stderr: "pipe",
	});
	assert.equal(
		child.exitCode,
		expectedExit,
		`Synthetic CLI step failed: ${args[0]}`,
	);
	if (expectedExit === 0) {
		assert.equal(child.stderr.toString(), "");
		return JSON.parse(child.stdout.toString());
	}
	assert.equal(child.stdout.toString(), "");
	return JSON.parse(child.stderr.toString());
}

try {
	s.initSchema(db);
	assert.deepEqual(
		s.acquireWorkspaceLease(db, {
			runId: "drill",
			workspace: "fixture:drill",
			owner: "fixture",
			ttlMs: 60000,
		}),
		{ ok: true, epoch: 1 },
	);
	invoke(["check-framework", "--skills-root", fixture.skillsRoot]);
	events.push("framework-verified");
	invoke([
		"init",
		...context,
		"--runbook",
		"synthetic-operator-drill",
		"--goal",
		"Offline bookkeeping and scoped control only",
		"--skills-root",
		fixture.skillsRoot,
	]);
	events.push("run-opened");
	invoke([
		"record",
		...context,
		"--phase",
		"implement",
		"--status",
		"running",
		"--resume",
		"fixture-work",
	]);
	invoke([
		"record",
		...context,
		"--phase",
		"implement",
		"--status",
		"committed",
		"--resume",
		"review",
		"--evidence",
		"trace:synthetic-proof",
		"--evidence",
		"cmd:bun test",
	]);
	events.push("phase-committed");
	const waiting = {
		runId: "drill",
		threadId: "main",
		actionId: "00000000-0000-4000-8000-000000000201",
	};
	s.openAction(db, {
		...waiting,
		action: "fixture:approval",
		actor: "agent:fixture",
		tier: "high-risk",
	});
	const interrupted = {
		...waiting,
		actionId: "00000000-0000-4000-8000-000000000202",
	};
	s.openAction(db, {
		...interrupted,
		action: "fixture:interruption",
		actor: "agent:fixture",
		tier: "standard",
	});
	s.recordVerdict(db, {
		...interrupted,
		actor: "human:fixture-operator",
		decision: "allowed",
		evidenceRef: "approval:fixture-drill",
	});
	s.recordFinish(db, {
		...interrupted,
		actor: "system:fixture",
		outcome: "interrupted",
		evidenceRef: "trace:synthetic-interruption",
	});
	const status = invoke(["status", "--db", path, "--run", "drill"]);
	assert.equal(status.threads[0].lastCommitted.resumePoint, "review");
	assert.equal(status.openActions.length, 1);
	events.push("awaiting-human");
	assert.equal(status.interruptedActions.length, 1);
	events.push("interrupted-action");
	invoke(["kill", "engage", ...control, ...attribution]);
	events.push("kill-engaged");
	const denied = invoke(
		[
			"record",
			...context,
			"--phase",
			"review",
			"--status",
			"running",
			"--resume",
			"inspect",
		],
		1,
	);
	assert.match(denied.reason, /killed/);
	events.push("killed-write-denied");
	const plan = invoke(["kill", "plan-reset", ...control]);
	assert.equal(plan.blocked, false);
	events.push("reset-planned");
	invoke([
		"kill",
		"reset",
		...control,
		...attribution,
		"--snapshot",
		plan.snapshotHash,
		"--cleanup-evidence",
		"trace:synthetic-no-process-or-remote-effect",
	]);
	events.push("reset-recorded");
	assert.equal(s.getKillStatus(db, "drill").blocked, false);
	const stale = invoke(
		[
			"record",
			...context,
			"--phase",
			"review",
			"--status",
			"running",
			"--resume",
			"inspect",
		],
		1,
	);
	assert.match(stale.reason, /lease/);
	events.push("stale-lease-denied");
	console.log(
		JSON.stringify({
			ok: true,
			mode: "synthetic",
			attestation: "automated-fixture-only",
			events,
			verifiedTaskCompletion: false,
		}),
	);
} finally {
	db.close();
	fixture.close();
}
