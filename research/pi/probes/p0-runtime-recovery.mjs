// Trusted synthetic recovery fixture, launched only by p0-recovery.py.
import assert from "node:assert/strict";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import {
	createModels,
	InMemoryCredentialStore,
	Type,
} from "@earendil-works/pi-ai";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";

assert.equal(process.env.PI_OFFLINE, "1");
globalThis.fetch = () => {
	throw new Error("Unexpected network call");
};
const [runtime, scenario, stage, expectedVersion = "1.3.0"] =
	process.argv.slice(2);
assert.ok(["sdk", "durable"].includes(runtime));
assert.ok(
	["start", "recover", "hold", "inspect", "storage", "reject"].includes(stage),
);
const emit = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const park = () => new Promise(() => setInterval(() => {}, 1000));
const readMeta = () =>
	JSON.parse(readFileSync("/workspace/metadata.json", "utf8"));
const saveMeta = (value) =>
	writeFileSync("/workspace/metadata.json", JSON.stringify(value));
const input = createInterface({ input: process.stdin });
const replies = input[Symbol.asyncIterator]();
const fake = fauxProvider({ tokensPerSecond: 100000 });
const intent = { actionId: "fixture-action", value: 7 };
const definition = {
	name: "fixture",
	description: "Request the protected synthetic operation",
	parameters: Type.Object(
		{
			actionId: Type.Literal("fixture-action"),
			value: Type.Number(),
			...(runtime === "durable" &&
			stage === "recover" &&
			scenario === "before-effect"
				? { newlyRequired: Type.String() }
				: {}),
		},
		{ additionalProperties: false },
	),
};
async function execute(args) {
	appendFileSync(
		"/workspace/executions.jsonl",
		`${JSON.stringify({ stage, args })}\n`,
	);
	const final = {
		...args,
		...(stage === "recover" && scenario === "payload-change"
			? { value: 9 }
			: {}),
	};
	emit({ type: "request", ...final });
	const reply = await replies.next();
	assert.equal(reply.done, false);
	const value = JSON.parse(reply.value);
	assert.deepEqual(Object.keys(value), ["result"]);
	assert.ok(
		["applied", "denied", "deduplicated", "payload-mismatch"].includes(
			value.result,
		),
	);
	return value.result;
}
const finalResponse = () => fauxAssistantMessage("runtime-ended-not-verified");
fake.setResponses(
	stage === "start" ||
		(stage === "recover" &&
			runtime === "sdk" &&
			!["uncertain-unsafe", "committed"].includes(scenario))
		? [
				fauxAssistantMessage(fauxToolCall("fixture", intent), {
					stopReason: "toolUse",
				}),
				finalResponse(),
			]
		: [finalResponse()],
);

try {
	if (runtime === "sdk") {
		const pi = await import("@earendil-works/pi-coding-agent");
		assert.equal(pi.VERSION, expectedVersion);
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
			noPromptTemplates: true,
			noThemes: true,
			agentsFilesOverride: () => ({ agentsFiles: [] }),
			systemPromptOverride: () => "Trusted offline crash fixture.",
			appendSystemPromptOverride: () => [],
		});
		await loader.reload();
		const manager = ["recover", "inspect"].includes(stage)
			? pi.SessionManager.open(readMeta().file)
			: pi.SessionManager.create("/workspace", "/workspace/sessions");
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
					execute: async (_id, args) => {
						const result = await execute(args);
						return {
							content: [{ type: "text", text: result }],
							details: { result },
						};
					},
				}),
			],
		});
		try {
			await session.bindExtensions({});
			if (stage === "start" || stage === "hold")
				saveMeta({ file: manager.getSessionFile() });
			if (stage === "inspect") {
				emit({ type: "opened" });
			} else if (stage === "hold") {
				await session.prompt("Initialize ownership fixture.");
				emit({ type: "ready" });
				await park();
			} else {
				if (!(stage === "recover" && scenario === "committed")) {
					await session.prompt(
						stage === "start"
							? "Execute fixed intent."
							: "Supervised recovery of fixed intent.",
					);
					await session.waitForIdle();
				}
				const entries = manager.getEntries();
				assert.ok(
					entries.some(
						(entry) =>
							entry.type === "message" && entry.message.role === "assistant",
					),
				);
				const outcomes = entries
					.filter(
						(entry) =>
							entry.type === "message" && entry.message.role === "toolResult",
					)
					.map((entry) =>
						entry.message.content
							.filter((part) => part.type === "text")
							.map((part) => part.text)
							.join(""),
					);
				emit({ type: "terminal", outcomes });
				if (stage === "start") await park();
			}
		} finally {
			session.dispose();
		}
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
		const storage = () => openNodeSqliteStorage("/workspace/runtime.sqlite");
		if (stage === "storage" || stage === "reject") {
			if (stage === "reject") {
				await assert.rejects(
					storage(),
					(error) =>
						/version|schema|migration/i.test(error.message) &&
						error.message.includes("2"),
				);
			} else {
				await (await storage()).close(context);
			}
			emit({
				type: "storage",
				version: expectedVersion,
				rejected: stage === "reject",
			});
		} else {
			const models = createModels();
			models.setProvider(fake.provider);
			const registry = pi.createRegistry();
			registry.install(
				pi.defineExtension({
					name: "crash-fixture",
					hooks: [
						pi.hook(pi.ToolTask, {
							beforeTool: () => {
								appendFileSync(
									"/workspace/hooks.jsonl",
									`${JSON.stringify({ stage })}\n`,
								);
								if (stage === "recover") return { block: "live-hook-denial" };
							},
						}),
					],
					tools: [
						pi.defineTool({
							...definition,
							replay: scenario === "uncertain-unsafe" ? "unsafe" : "safe",
							execute: async (args) => ({
								output: [{ type: "text", text: await execute(args) }],
							}),
						}),
					],
				}),
			);
			const harness = await pi.Harness.open(
				await storage(),
				{
					models,
					registry,
					env: () => new NodeExecutionEnv({ cwd: "/workspace" }),
				},
				context,
			);
			try {
				const root =
					stage === "recover" || stage === "inspect"
						? await harness.conversation(readMeta().conversationId, context)
						: await harness.root(context, {
								agent: { model: { provider: "faux", modelId: "faux-1" } },
							});
				assert.ok(root);
				if (stage === "inspect") {
					emit({ type: "opened" });
				} else if (stage === "hold") {
					saveMeta({ conversationId: root.id });
					emit({ type: "ready" });
					await park();
				} else {
					let submission;
					if (stage === "start") {
						submission = await root.submit(
							{
								type: "input",
								content: "Execute fixed intent.",
								requestId: "fixture-submission",
							},
							context,
						);
						saveMeta({ conversationId: root.id, submissionId: submission.id });
					} else {
						submission = await harness.submission(
							readMeta().submissionId,
							context,
						);
						assert.ok(submission);
					}
					const result = await submission.wait(context);
					assert.ok(["done", "unanswered"].includes(result.status));
					const entries = await root.entries(
						{ order: "ascending" },
						100,
						undefined,
						context,
					);
					const outcomes = entries.items.flatMap((entry) =>
						(entry.model ?? [])
							.filter((msg) => msg.role === "toolResult")
							.map((msg) =>
								msg.content
									.filter((part) => part.type === "text")
									.map((part) => part.text)
									.join(""),
							),
					);
					emit({ type: "terminal", outcomes });
					if (stage === "start") await park();
				}
			} finally {
				await harness.close(context);
			}
		}
	}
} finally {
	input.close();
}
