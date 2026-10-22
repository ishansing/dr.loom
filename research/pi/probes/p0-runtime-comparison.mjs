// Run through p0-sandbox.py with pinned external dependencies; synthetic only.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createModels, Type } from "@earendil-works/pi-ai";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { parse, stringify } from "yaml";

assert.equal(process.env.PI_OFFLINE, "1");
globalThis.fetch = () => {
	throw new Error("Unexpected provider/network call");
};
const runtime = process.argv[2];
const expectedVersion = process.argv[3] ?? "1.3.0";
assert.ok(["1.3.0", "1.4.0"].includes(expectedVersion));
const skillMode = process.argv[4] === "skills";
const fixture = skillMode
	? JSON.parse(readFileSync("/framework/fixture.json", "utf8"))
	: undefined;
const skillCalls = [];
let adapterText;
if (fixture) {
	adapterText = readFileSync(
		"/framework/.agents/skills/itp-verify/SKILL.md",
		"utf8",
	);
	const yaml = adapterText.match(/```yaml\n(adapter_contract:[\s\S]*?)\n```/);
	assert.ok(yaml);
	const contract = parse(yaml[1]).adapter_contract;
	assert.equal(contract.id, "itp-verify");
	assert.deepEqual(contract.required_children, [
		"verification-before-completion",
	]);
	assert.ok(contract.exits.includes("blocked"));
}
assert.ok(["sdk", "durable"].includes(runtime));
const input = createInterface({ input: process.stdin });
const replies = input[Symbol.asyncIterator]();
const results = [];
const parameters = Type.Object(
	{
		op: Type.Union(
			[
				"effect",
				"patch",
				"output",
				...(skillMode ? ["child", "missing", "contract"] : []),
			].map((value) => Type.Literal(value)),
		),
	},
	{ additionalProperties: false },
);
const schema = Type.Object({ result: Type.String() });
async function execute(args) {
	let result;
	if (skillMode && ["child", "missing", "contract"].includes(args.op)) {
		skillCalls.push(args.op);
		if (args.op === "child") {
			return {
				result: readFileSync(
					"/framework/.agents/skills/verification-before-completion/SKILL.md",
					"utf8",
				),
			};
		}
		if (args.op === "missing") {
			assert.equal(fixture.skills.includes("tdd"), false);
			return { result: "blocked:missing-pinned-child:tdd" };
		}
		const result = {
			skill_result: {
				skill: "itp-verify",
				status: "pass",
				summary: "synthetic transport only",
				artifacts: [],
				evidence: [],
				findings: [],
				open_questions: [],
				recommended_next: [],
				handoff: {},
			},
		};
		assert.deepEqual(parse(stringify(result)), result);
		assert.equal(result.skill_result.evidence.length > 0, false);
		return { result: JSON.stringify(result) };
	}
	if (args.op === "patch") {
		assert.equal(
			readFileSync("/workspace/sum.ts", "utf8"),
			"export const sum = (a: number, b: number) => a - b;\n",
		);
		writeFileSync(
			"/workspace/sum.ts",
			"export const sum = (a: number, b: number) => a + b;\n",
		);
		return { result: "patched" };
	}
	assert.ok(["effect", "output"].includes(args.op));
	process.stdout.write(`${JSON.stringify({ type: "request", op: args.op })}\n`);
	const reply = await replies.next();
	assert.equal(reply.done, false);
	const response = JSON.parse(reply.value);
	assert.deepEqual(Object.keys(response), ["result"]);
	result = response.result;
	assert.ok(
		["denied", "applied", "deduplicated", "safe-output-error"].includes(result),
	);
	results.push(result);
	return { result };
}
const fake = fauxProvider({ tokensPerSecond: 100000 });
fake.setResponses([
	...(skillMode
		? ["child", "missing", "contract"].map((op) =>
				fauxAssistantMessage(fauxToolCall("fixture", { op }), {
					stopReason: "toolUse",
				}),
			)
		: []),
	...["effect", "effect", "effect", "patch", "output"].map((op) =>
		fauxAssistantMessage(fauxToolCall("fixture", { op }), {
			stopReason: "toolUse",
		}),
	),
	fauxAssistantMessage("candidate-ready-not-verified"),
]);
const definition = {
	name: "fixture",
	description: "Execute one trusted synthetic fixture step",
	parameters,
};
try {
	if (runtime === "sdk") {
		const pi = await import("@earendil-works/pi-coding-agent");
		const { InMemoryCredentialStore } = await import("@earendil-works/pi-ai");
		assert.equal(pi.VERSION, expectedVersion);
		const loaded = skillMode
			? pi.loadSkills({
					cwd: "/workspace",
					agentDir: "/workspace/agent",
					skillPaths: ["/framework/.agents/skills"],
					includeDefaults: false,
				})
			: { skills: [], diagnostics: [] };
		assert.deepEqual(loaded.diagnostics, []);
		if (skillMode)
			assert.deepEqual(
				loaded.skills.map((skill) => skill.name).sort(),
				fixture.skills,
			);
		const models = await pi.ModelRuntime.create({
			credentials: new InMemoryCredentialStore(),
			modelsPath: null,
			refreshOnCreate: false,
		});
		models.registerNativeProvider(fake.provider);
		await models.refresh({ allowNetwork: false });
		const settings = pi.SettingsManager.inMemory({
			cacheWarming: "off",
			retry: { enabled: false },
			compaction: { enabled: false },
		});
		const loader = new pi.DefaultResourceLoader({
			cwd: "/workspace",
			agentDir: "/workspace/agent",
			settingsManager: settings,
			noExtensions: true,
			noSkills: true,
			skillsOverride: () => loaded,
			noPromptTemplates: true,
			noThemes: true,
			agentsFilesOverride: () => ({ agentsFiles: [] }),
			systemPromptOverride: () => "Trusted offline fixture only.",
			appendSystemPromptOverride: () => [],
		});
		await loader.reload();
		const manager = pi.SessionManager.create(
			"/workspace",
			"/workspace/sessions",
		);
		const { session } = await pi.createAgentSession({
			cwd: "/workspace",
			agentDir: "/workspace/agent",
			model: fake.getModel(),
			modelRuntime: models,
			settingsManager: settings,
			resourceLoader: loader,
			sessionManager: manager,
			tools: ["fixture"],
			customTools: [
				pi.defineTool({
					...definition,
					label: "Fixture",
					outputSchema: schema,
					execute: async (_id, args) => {
						const value = await execute(args);
						return {
							content: [{ type: "text", text: value.result }],
							structuredContent: value,
							details: value,
						};
					},
				}),
			],
		});
		try {
			await session.bindExtensions({});
			assert.deepEqual(session.getActiveToolNames(), ["fixture"]);
			await session.prompt(
				skillMode
					? "/skill:itp-verify Run the shared synthetic fixture."
					: "Run the shared synthetic fixture.",
			);
			await session.waitForIdle();
			assert.equal(
				session.getLastAssistantText(),
				"candidate-ready-not-verified",
			);
		} finally {
			session.dispose();
		}
		const reopened = pi.SessionManager.open(manager.getSessionFile());
		if (skillMode) {
			const transcript = JSON.stringify(reopened.getEntries());
			assert.ok(transcript.includes("adapter_contract:"));
			assert.ok(transcript.includes("blocked:missing-pinned-child:tdd"));
			assert.ok(transcript.includes("synthetic transport only"));
		}
		assert.deepEqual(
			reopened.getEntries(),
			JSON.parse(JSON.stringify(manager.getEntries())),
		);
		assert.equal(reopened.getHeader().version, 3);
	} else {
		const { BACKGROUND_CONTEXT: context } = await import(
			"@earendil-works/chord/context"
		);
		const pi = await import("@earendil-works/pi-durable");
		const { NodeExecutionEnv } = await import(
			"@earendil-works/pi-durable/env/node"
		);
		const { openNodeSqliteStorage } = await import(
			"@earendil-works/pi-durable/storage/sqlite/node"
		);
		const metadata = await import("@earendil-works/pi-durable/package.json", {
			with: { type: "json" },
		});
		assert.equal(metadata.default.version, expectedVersion);
		const models = createModels();
		models.setProvider(fake.provider);
		const registry = pi.createRegistry();
		registry.install(
			pi.defineExtension({
				name: "fixture-only",
				tools: [
					pi.defineTool({
						...definition,
						structuredOutputSchema: schema,
						execute: async (args) => {
							const value = await execute(args);
							return {
								output: [{ type: "text", text: value.result }],
								structuredOutput: value,
							};
						},
					}),
				],
			}),
		);
		const options = {
			models,
			registry,
			env: () => new NodeExecutionEnv({ cwd: "/workspace" }),
		};
		const storage = () => openNodeSqliteStorage("/workspace/runtime.sqlite");
		const harness = await pi.Harness.open(await storage(), options, context);
		let conversationId;
		let answerId;
		try {
			const root = await harness.root(context, {
				agent: { model: { provider: "faux", modelId: "faux-1" } },
			});
			conversationId = root.id;
			const result = await (
				await root.submit(
					{
						type: "input",
						content: skillMode
							? `${adapterText}\nRun the shared synthetic fixture.`
							: "Run the shared synthetic fixture.",
					},
					context,
				)
			).wait(context);
			assert.equal(result.status, "done");
			answerId = result.answer;
		} finally {
			await harness.close(context);
		}
		const reopened = await pi.Harness.open(await storage(), options, context);
		try {
			const root = await reopened.root(context);
			assert.equal(root.id, conversationId);
			if (skillMode) {
				const transcript = JSON.stringify(
					await root.entries({ order: "ascending" }, 100, undefined, context),
				);
				assert.ok(transcript.includes("adapter_contract:"));
				assert.ok(transcript.includes("blocked:missing-pinned-child:tdd"));
				assert.ok(transcript.includes("synthetic transport only"));
			}
			const answer = await root.commit(
				(tx) => tx.entry(pi.AssistantEntry, answerId),
				context,
			);
			assert.equal(
				answer.model[0].content[0].text,
				"candidate-ready-not-verified",
			);
		} finally {
			await reopened.close(context);
		}
	}
	assert.deepEqual(results, [
		"denied",
		"applied",
		"deduplicated",
		"safe-output-error",
	]);
	if (skillMode) assert.deepEqual(skillCalls, ["child", "missing", "contract"]);
	process.stdout.write(
		`${JSON.stringify({ type: "report", reopened: true, results })}\n`,
	);
} finally {
	input.close();
}
