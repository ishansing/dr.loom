import { expect, test } from "bun:test";
import {
	appendFileSync,
	existsSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as s from "../src/index.ts";
import { recordTransitionForMigration } from "../src/store.ts";
import { fixtureEnv, frameworkFixture } from "./fixtures/framework.ts";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

test("check-framework inspects actual installed revision rather than echoing its expected pin", () => {
	const fixture = frameworkFixture();
	try {
		writeFileSync(
			join(fixture.dir, "FRAMEWORK_REF"),
			"I2P_COMMIT=1111111111111111111111111111111111111111\nI2P_VERSION=2.1.0\nI2P_PATH=framework\n",
		);
		const child = Bun.spawnSync(
			[
				process.execPath,
				cli,
				"check-framework",
				"--skills-root",
				fixture.skillsRoot,
			],
			{ cwd: fixture.dir, env: fixtureEnv, stdout: "pipe", stderr: "pipe" },
		);
		expect(child.exitCode).toBe(1);
		expect(child.stdout.toString()).toBe("");
		expect(child.stderr.toString()).toContain("framework commit mismatch");
	} finally {
		fixture.close();
	}
});

test("check-framework rejects one-byte installed skill drift even when Git pin matches", () => {
	const fixture = frameworkFixture();
	try {
		const args = [
			process.execPath,
			cli,
			"check-framework",
			"--skills-root",
			fixture.skillsRoot,
		];
		const valid = Bun.spawnSync(args, {
			cwd: fixture.dir,
			env: fixtureEnv,
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(valid.exitCode).toBe(0);
		writeFileSync(
			join(fixture.skillsRoot, "fixture-skill", "SKILL.md"),
			"synthetic skill!\n",
		);
		const changed = Bun.spawnSync(args, {
			cwd: fixture.dir,
			env: fixtureEnv,
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(changed.exitCode).toBe(1);
		expect(changed.stdout.toString()).toBe("");
		expect(changed.stderr.toString()).toContain("skill content mismatch");
	} finally {
		fixture.close();
	}
});

test("check-framework binds the lock to Git content rather than trusting a changed working file", () => {
	const fixture = frameworkFixture();
	try {
		appendFileSync(join(fixture.frameworkRoot, "skills.lock.json"), "\n");
		const child = Bun.spawnSync(
			[
				process.execPath,
				cli,
				"check-framework",
				"--skills-root",
				fixture.skillsRoot,
			],
			{ cwd: fixture.dir, env: fixtureEnv, stdout: "pipe", stderr: "pipe" },
		);
		expect(child.exitCode).toBe(1);
		expect(child.stderr.toString()).toContain("framework content drift");
	} finally {
		fixture.close();
	}
});

test("framework reference rejects ambiguous duplicate and unknown fields", () => {
	const fixture = frameworkFixture();
	try {
		const ref = join(fixture.dir, "FRAMEWORK_REF");
		const original = readFileSync(ref, "utf8");
		for (const extra of [
			`I2P_COMMIT=${fixture.commit}\n`,
			"UNREVIEWED_OVERRIDE=yes\n",
		]) {
			writeFileSync(ref, original + extra);
			const child = Bun.spawnSync(
				[
					process.execPath,
					cli,
					"check-framework",
					"--skills-root",
					fixture.skillsRoot,
				],
				{ cwd: fixture.dir, env: fixtureEnv, stdout: "pipe", stderr: "pipe" },
			);
			expect(child.exitCode).toBe(1);
			expect(child.stderr.toString()).toContain("invalid framework reference");
		}
	} finally {
		fixture.close();
	}
});

test("status on a missing database is informational and never creates it", () => {
	const fixture = frameworkFixture();
	try {
		const db = join(fixture.dir, "missing.sqlite");
		const child = Bun.spawnSync(
			[
				process.execPath,
				cli,
				"status",
				"--db",
				db,
				"--run",
				"absent",
				"--json",
			],
			{ cwd: fixture.dir, env: fixtureEnv, stdout: "pipe", stderr: "pipe" },
		);
		expect(child.exitCode).toBe(0);
		expect(JSON.parse(child.stdout.toString()).reason).toBe("no runs");
		expect(existsSync(db)).toBe(false);
	} finally {
		fixture.close();
	}
});

test("operator CLI opens a gated run, records running/committed phases and reads the resume bundle", () => {
	const fixture = frameworkFixture();
	const path = join(fixture.dir, "ledger.sqlite");
	const db = s.openDb(path);
	s.initSchema(db);
	s.acquireWorkspaceLease(db, {
		runId: "r1",
		workspace: "fixture:workspace",
		owner: "operator",
		ttlMs: 60000,
	});
	db.close();
	const context = [
		"--db",
		path,
		"--run",
		"r1",
		"--thread",
		"main",
		"--workspace",
		"fixture:workspace",
		"--owner",
		"operator",
		"--epoch",
		"1",
		"--json",
	];
	const invoke = (...args: string[]) =>
		Bun.spawnSync([process.execPath, cli, ...args], {
			cwd: fixture.dir,
			env: fixtureEnv,
			stdout: "pipe",
			stderr: "pipe",
		});
	try {
		const opened = invoke(
			"init",
			...context,
			"--runbook",
			"golden-small",
			"--goal",
			"Synthetic CLI flow",
			"--skills-root",
			fixture.skillsRoot,
		);
		expect(opened.exitCode).toBe(0);
		expect(JSON.parse(opened.stdout.toString()).runbook).toBe("golden-small");
		const running = invoke(
			"record",
			...context,
			"--phase",
			"implement",
			"--status",
			"running",
			"--resume",
			"work",
		);
		expect(running.exitCode).toBe(0);
		expect(JSON.parse(running.stdout.toString()).status).toBe("running");
		const closed = invoke(
			"record",
			...context,
			"--phase",
			"implement",
			"--status",
			"committed",
			"--resume",
			"review",
			"--evidence",
			"cmd:bun test",
			"--evidence",
			"trace:fixture",
		);
		expect(closed.exitCode).toBe(0);
		expect(JSON.parse(closed.stdout.toString()).evidenceRefs).toEqual([
			"cmd:bun test",
			"trace:fixture",
		]);
		const status = invoke("status", "--db", path, "--run", "r1", "--json");
		expect(status.exitCode).toBe(0);
		expect(
			JSON.parse(status.stdout.toString()).threads[0].lastCommitted.resumePoint,
		).toBe("review");
		expect(
			invoke(
				"init",
				...context,
				"--runbook",
				"golden-small",
				"--goal",
				"Again",
				"--skills-root",
				fixture.skillsRoot,
			).exitCode,
		).toBe(1);
	} finally {
		fixture.close();
	}
});

test("synthetic kill CLI requires explicit attribution and consumes only a fresh reset snapshot", () => {
	const fixture = frameworkFixture();
	const path = join(fixture.dir, "control.sqlite");
	const db = s.openDb(path);
	try {
		s.initSchema(db);
		s.acquireWorkspaceLease(db, {
			runId: "r1",
			workspace: "fixture:workspace",
			owner: "operator",
			ttlMs: 60000,
		});
		const invoke = (...args: string[]) =>
			Bun.spawnSync(
				[
					process.execPath,
					cli,
					"kill",
					...args,
					"--db",
					path,
					"--scope",
					"run:r1",
					"--json",
				],
				{ cwd: fixture.dir, env: fixtureEnv, stdout: "pipe", stderr: "pipe" },
			);
		const control = [
			"--actor",
			"human:fixture",
			"--reason",
			"Synthetic drill",
			"--evidence",
			"approval:fixture",
		];
		expect(invoke("engage", ...control).exitCode).toBe(1);
		expect(s.getKillStatus(db, "r1").blocked).toBe(false);
		const engaged = invoke("engage", ...control, "--synthetic");
		expect(engaged.exitCode).toBe(0);
		expect(JSON.parse(invoke("status").stdout.toString()).blocked).toBe(true);
		const plan = JSON.parse(invoke("plan-reset").stdout.toString());
		const stale = invoke(
			"reset",
			...control,
			"--synthetic",
			"--snapshot",
			"0".repeat(64),
			"--cleanup-evidence",
			"trace:cleanup",
		);
		expect(stale.exitCode).toBe(1);
		expect(stale.stderr.toString()).toContain("stale");
		const reset = invoke(
			"reset",
			...control,
			"--synthetic",
			"--snapshot",
			plan.snapshotHash,
			"--cleanup-evidence",
			"trace:cleanup",
		);
		expect(reset.exitCode).toBe(0);
		expect(s.getKillStatus(db, "r1").blocked).toBe(false);
		expect(db.query("SELECT expires_at AS expiry FROM leases").get()).toEqual({
			expiry: 0,
		});
	} finally {
		db.close();
		fixture.close();
	}
});

test("published offline drill runs the operator trajectory without claiming human or production qualification", () => {
	const child = Bun.spawnSync([process.execPath, "run", "drill"], {
		env: fixtureEnv,
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(child.exitCode).toBe(0);
	const result = JSON.parse(child.stdout.toString());
	expect(result.mode).toBe("synthetic");
	expect(result.attestation).toBe("automated-fixture-only");
	expect(result.events).toEqual([
		"framework-verified",
		"run-opened",
		"phase-committed",
		"awaiting-human",
		"interrupted-action",
		"kill-engaged",
		"killed-write-denied",
		"reset-planned",
		"reset-recorded",
		"stale-lease-denied",
	]);
});

test("strict CLI rejects duplicate, misplaced and malformed flags without leaking values or creating stores", () => {
	const fixture = frameworkFixture();
	const path = join(fixture.dir, "untouched.sqlite");
	try {
		for (const args of [
			["record", "--epoch", "1", "--epoch", "2", "--json"],
			[
				"status",
				"--db",
				path,
				"--run",
				"r1",
				"--goal",
				"synthetic-sensitive-marker",
				"--json",
			],
			["record", "--epoch", "--run", "synthetic-sensitive-marker", "--json"],
			["check-framework", "--commit", "synthetic-sensitive-marker", "--json"],
		]) {
			const child = Bun.spawnSync([process.execPath, cli, ...args], {
				cwd: fixture.dir,
				env: fixtureEnv,
				stdout: "pipe",
				stderr: "pipe",
			});
			expect(child.exitCode).toBe(1);
			expect(child.stdout.toString()).toBe("");
			expect(child.stderr.toString()).not.toContain(
				"synthetic-sensitive-marker",
			);
			expect(child.stderr.toString()).not.toContain(" at ");
		}
		expect(existsSync(path)).toBe(false);
		const human = Bun.spawnSync(
			[process.execPath, cli, "status", "--db", path, "--run", "r1"],
			{ cwd: fixture.dir, env: fixtureEnv, stdout: "pipe", stderr: "pipe" },
		);
		expect(human.stdout.toString()).toContain("No runs");
		expect(human.stdout.toString()).not.toStartWith("{");
	} finally {
		fixture.close();
	}
});

test("legacy phase text cannot inject a forged kill-status line into human orientation", () => {
	const fixture = frameworkFixture();
	const path = join(fixture.dir, "legacy.sqlite");
	const db = s.openDb(path);
	try {
		s.initSchema(db);
		recordTransitionForMigration(db, {
			runId: "legacy",
			phase: "legacy\nKill: clear",
			status: "committed",
			resumePoint: "next",
		});
		s.engageKill(db, {
			scope: "global",
			actor: "human:fixture",
			reason: "Synthetic fixture",
			evidenceRef: "approval:fixture",
			synthetic: true,
		});
		const child = Bun.spawnSync(
			[process.execPath, cli, "status", "--db", path, "--run", "legacy"],
			{ cwd: fixture.dir, env: fixtureEnv, stdout: "pipe", stderr: "pipe" },
		);
		expect(child.exitCode).toBe(0);
		expect(child.stdout.toString()).toStartWith("Kill: BLOCKED\n");
		expect(child.stdout.toString()).not.toContain("\nKill: clear");
	} finally {
		db.close();
		fixture.close();
	}
});
