import { expect, test } from "bun:test";
import {
	mkdirSync,
	readFileSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { checkFrameworkInstallation } from "../src/framework.ts";
import { frameworkFixture } from "./fixtures/framework.ts";

test("installation checker binds actual revision, lock and the worked skill-directory hash", () => {
	const fixture = frameworkFixture();
	try {
		const result = checkFrameworkInstallation({
			referencePath: join(fixture.dir, "FRAMEWORK_REF"),
			skillsRoot: fixture.skillsRoot,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("Synthetic framework failed");
		expect(result.commit).toBe(fixture.commit);
		expect(result.skills).toEqual([
			{
				id: "fixture-skill",
				contentSha256:
					"bf00444cbd297e4afb345832ace4e183d5745a284ad6fbc91bcd8628f114be19",
			},
		]);
		expect(result.lockSha256).toMatch(/^[0-9a-f]{64}$/);
	} finally {
		fixture.close();
	}
});

test("nested skill content uses the pinned sorted path plus NUL byte hashing contract", () => {
	const fixture = frameworkFixture();
	try {
		mkdirSync(join(fixture.skillsRoot, "fixture-skill", "references"));
		writeFileSync(
			join(fixture.skillsRoot, "fixture-skill", "references", "a.md"),
			"alpha\n",
		);
		const file = join(fixture.frameworkRoot, "skills.lock.json");
		const lock = JSON.parse(readFileSync(file, "utf8"));
		lock.skills[0].contentSha256 =
			"0da668d52ca4c439f48a0a23c9fd51707dd200ae8f059e624b60798ab662deb1";
		writeFileSync(file, JSON.stringify(lock));
		fixture.git("add", "--all");
		fixture.git(
			"-c",
			"user.name=Synthetic Fixture",
			"-c",
			"user.email=fixture@example.invalid",
			"-c",
			"commit.gpgsign=false",
			"commit",
			"--quiet",
			"-m",
			"nested fixture",
		);
		writeFileSync(
			join(fixture.dir, "FRAMEWORK_REF"),
			`I2P_COMMIT=${fixture.git("rev-parse", "HEAD")}\nI2P_VERSION=2.1.0\n`,
		);
		const result = checkFrameworkInstallation({
			referencePath: join(fixture.dir, "FRAMEWORK_REF"),
			frameworkRoot: fixture.frameworkRoot,
			skillsRoot: fixture.skillsRoot,
		});
		expect(result.ok).toBe(true);
		if (result.ok)
			expect(result.skills[0]?.contentSha256).toBe(
				"0da668d52ca4c439f48a0a23c9fd51707dd200ae8f059e624b60798ab662deb1",
			);
	} finally {
		fixture.close();
	}
});

test("malformed installed VERSION cannot leak its raw content through failure reasons", () => {
	const fixture = frameworkFixture();
	try {
		writeFileSync(
			join(fixture.frameworkRoot, "VERSION"),
			"synthetic-sensitive-marker",
		);
		const result = checkFrameworkInstallation({
			referencePath: join(fixture.dir, "FRAMEWORK_REF"),
			skillsRoot: fixture.skillsRoot,
		});
		expect(result.ok).toBe(false);
		expect(JSON.stringify(result)).not.toContain("synthetic-sensitive-marker");
	} finally {
		fixture.close();
	}
});

test("local Git replacement refs cannot substitute a different tree under the selected commit", () => {
	const fixture = frameworkFixture();
	try {
		writeFileSync(
			join(fixture.frameworkRoot, "injected.md"),
			"synthetic replacement tree\n",
		);
		fixture.git("add", "--all");
		fixture.git(
			"-c",
			"user.name=Synthetic Fixture",
			"-c",
			"user.email=fixture@example.invalid",
			"-c",
			"commit.gpgsign=false",
			"commit",
			"--quiet",
			"-m",
			"replacement fixture",
		);
		const alternate = fixture.git("rev-parse", "HEAD");
		fixture.git("update-ref", "HEAD", fixture.commit);
		fixture.git("replace", fixture.commit, alternate);
		expect(
			checkFrameworkInstallation({
				referencePath: join(fixture.dir, "FRAMEWORK_REF"),
				skillsRoot: fixture.skillsRoot,
			}).ok,
		).toBe(false);
	} finally {
		fixture.close();
	}
});

test("missing and symlinked installed skill entries fail closed", () => {
	for (const fault of ["missing", "symlink"] as const) {
		const fixture = frameworkFixture();
		try {
			const path = join(fixture.skillsRoot, "fixture-skill", "SKILL.md");
			unlinkSync(path);
			if (fault === "symlink")
				symlinkSync(join(fixture.frameworkRoot, "VERSION"), path);
			expect(
				checkFrameworkInstallation({
					referencePath: join(fixture.dir, "FRAMEWORK_REF"),
					skillsRoot: fixture.skillsRoot,
				}).ok,
			).toBe(false);
		} finally {
			fixture.close();
		}
	}
});

test("malformed and widening lock entries are rejected even in a pinned synthetic tree", () => {
	for (const patch of [
		{ version: 99 },
		{ contentHashMethod: "other" },
		{ skills: [] },
		{ skills: [{ id: "../escape", contentSha256: "0".repeat(64) }] },
		{ skills: [{ id: "fixture-skill", contentSha256: "bad" }] },
		{
			skills: [
				{ id: "fixture-skill", contentSha256: "0".repeat(64) },
				{ id: "fixture-skill", contentSha256: "0".repeat(64) },
			],
		},
	]) {
		const fixture = frameworkFixture();
		try {
			const file = join(fixture.frameworkRoot, "skills.lock.json");
			writeFileSync(
				file,
				JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), ...patch }),
			);
			fixture.git("add", "--all");
			fixture.git(
				"-c",
				"user.name=Synthetic Fixture",
				"-c",
				"user.email=fixture@example.invalid",
				"-c",
				"commit.gpgsign=false",
				"commit",
				"--quiet",
				"-m",
				"invalid lock fixture",
			);
			writeFileSync(
				join(fixture.dir, "FRAMEWORK_REF"),
				`I2P_COMMIT=${fixture.git("rev-parse", "HEAD")}\nI2P_VERSION=2.1.0\nI2P_PATH=framework\n`,
			);
			expect(
				checkFrameworkInstallation({
					referencePath: join(fixture.dir, "FRAMEWORK_REF"),
					skillsRoot: fixture.skillsRoot,
				}).ok,
			).toBe(false);
		} finally {
			fixture.close();
		}
	}
});
