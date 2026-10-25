import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	truncateSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { preflightDomain } from "../../src/runner.ts";

// This explicit lab corpus is never selected by the portable default test glob.
test("selected rootless lab passes physical preflight without launching a workload", async () => {
	const endpoint = process.env.LOOM_LAB_ENDPOINT;
	const workspaceMount = process.env.LOOM_LAB_MOUNT;
	const workspaceImage = process.env.LOOM_LAB_IMAGE;
	if (!endpoint || !workspaceMount || !workspaceImage)
		throw new Error("Explicit offline lab paths required");
	mkdirSync("/tmp/opencode", { recursive: true });
	const temp = mkdtempSync("/tmp/opencode/loom-lab-input-");
	const inputRoot = join(temp, "input");
	mkdirSync(inputRoot, { mode: 0o700 });
	const workspaceRoot = mkdtempSync(join(workspaceMount, "preflight-"));
	const worker = "// Owned synthetic preflight input; not executed.\n";
	writeFileSync(join(inputRoot, "worker.ts"), worker, { mode: 0o600 });
	const config = {
		inputRoot,
		workspaceRoot,
		workerSha256: createHash("sha256").update(worker).digest("hex"),
	};
	const input = { endpoint, config, workspaceMount, workspaceImage };
	try {
		const result = await preflightDomain(input);
		expect(result.imageId).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(result.workspaceDevice).toMatch(/^7:\d+$/);
		expect(result.workerSha256).toBe(config.workerSha256);
		const expectedHash = config.workerSha256;
		const pending = preflightDomain(input);
		config.workerSha256 = "b".repeat(64);
		try {
			expect((await pending).workerSha256).toBe(expectedHash);
		} finally {
			config.workerSha256 = expectedHash;
		}
		for (const bad of [
			{ ...input, workspaceMount: workspaceRoot },
			{ ...input, workspaceMount: inputRoot },
			{ ...input, workspaceImage: join(inputRoot, "worker.ts") },
		])
			await expect(preflightDomain(bad)).rejects.toThrow("workspace");
		const wrongImage = join(temp, "wrong-image.img");
		writeFileSync(wrongImage, "", { mode: 0o600 });
		truncateSync(wrongImage, 2147483648);
		await expect(
			preflightDomain({ ...input, workspaceImage: wrongImage }),
		).rejects.toThrow("workspace");
		function isolated(bindings: string[], expected: "pass" | "workspace") {
			const child = Bun.spawnSync(
				[
					"bwrap",
					"--ro-bind",
					"/",
					"/",
					"--dev-bind",
					"/dev",
					"/dev",
					"--proc",
					"/proc",
					...bindings,
					process.execPath,
					"--eval",
					`import {preflightDomain} from ${JSON.stringify(import.meta.dir + "/../../src/runner.ts")};try{await preflightDomain(${JSON.stringify(input)});process.exit(${expected === "pass" ? 0 : 2});}catch(e){process.exit(${expected === "workspace"}&&e instanceof Error&&e.message==='runner-preflight:workspace'?0:3);}`,
				],
				{ env: {}, stdout: "pipe", stderr: "pipe" },
			);
			expect(child.exitCode).toBe(0);
			expect(child.stdout.toString()).toBe("");
			expect(child.stderr.toString()).toBe("");
		}
		isolated([], "workspace");
		isolated(["--bind", workspaceMount, workspaceMount], "pass");
		writeFileSync(join(workspaceRoot, "worker.ts"), worker, { mode: 0o600 });
		isolated(
			[
				"--bind",
				workspaceMount,
				workspaceMount,
				"--ro-bind",
				workspaceRoot,
				inputRoot,
			],
			"workspace",
		);
		const aliasRoot = mkdtempSync(join(workspaceMount, "preflight-alias-"));
		isolated(
			[
				"--bind",
				workspaceMount,
				workspaceMount,
				"--bind",
				aliasRoot,
				workspaceRoot,
			],
			"workspace",
		);
		unlinkSync(join(workspaceRoot, "worker.ts"));
		chmodSync(workspaceRoot, 0o702);
		await expect(preflightDomain(input)).rejects.toThrow("workspace");
		chmodSync(workspaceRoot, 0o700);
		writeFileSync(
			join(workspaceRoot, "preflight.json"),
			JSON.stringify({
				mode: "read-only-preflight",
				workloadExecuted: false,
				...result,
			}) + "\n",
			{ mode: 0o600 },
		);
	} finally {
		chmodSync(workspaceRoot, 0o700);
		rmSync(temp, { recursive: true, force: true });
	}
});
