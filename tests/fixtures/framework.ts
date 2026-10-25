import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const fixtureEnv = {
	PATH: "/usr/bin:/bin",
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_CONFIG_GLOBAL: "/dev/null",
};

export function frameworkFixture() {
	const dir = mkdtempSync("/tmp/opencode/loom-framework-");
	const frameworkRoot = join(dir, "framework");
	const skillsRoot = join(dir, "skills");
	mkdirSync(frameworkRoot);
	mkdirSync(join(skillsRoot, "fixture-skill"), { recursive: true });
	writeFileSync(
		join(skillsRoot, "fixture-skill", "SKILL.md"),
		"synthetic skill\n",
	);
	writeFileSync(join(frameworkRoot, "VERSION"), "2.1.0\n");
	writeFileSync(
		join(frameworkRoot, "skills.lock.json"),
		JSON.stringify({
			version: 1,
			framework: "idea-to-production@2",
			contentHashMethod:
				"sha256 over sorted (relative path + NUL + file bytes + NUL) for every file in the skill directory",
			skills: [
				{
					id: "fixture-skill",
					contentSha256:
						"bf00444cbd297e4afb345832ace4e183d5745a284ad6fbc91bcd8628f114be19",
				},
			],
		}),
	);
	function git(...args: string[]): string {
		const child = Bun.spawnSync(["git", "-C", frameworkRoot, ...args], {
			env: fixtureEnv,
			stdout: "pipe",
			stderr: "pipe",
		});
		if (child.exitCode !== 0) throw new Error("Synthetic Git fixture failed");
		return child.stdout.toString().trim();
	}
	git("init", "--quiet");
	git("add", "--", "VERSION", "skills.lock.json");
	git(
		"-c",
		"user.name=Synthetic Fixture",
		"-c",
		"user.email=fixture@example.invalid",
		"-c",
		"commit.gpgsign=false",
		"commit",
		"--quiet",
		"-m",
		"synthetic framework",
	);
	const commit = git("rev-parse", "HEAD");
	writeFileSync(
		join(dir, "FRAMEWORK_REF"),
		`I2P_COMMIT=${commit}\nI2P_VERSION=2.1.0\nI2P_PATH=framework\n`,
	);
	return {
		dir,
		frameworkRoot,
		skillsRoot,
		commit,
		git,
		close: () => rmSync(dir, { recursive: true, force: true }),
	};
}
