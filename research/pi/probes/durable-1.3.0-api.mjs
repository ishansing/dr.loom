// Copy into an isolated npm project with pi-durable@1.3.0; no real model calls.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels, Type } from "@earendil-works/pi-ai";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
	AssistantEntry,
	createRegistry,
	defineDoc,
	defineExtension,
	defineTask,
	defineTool,
	Harness,
	MemoryStorage,
} from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import metadata from "@earendil-works/pi-durable/package.json" with {
	type: "json",
};
import { openNodeJsonlStorage } from "@earendil-works/pi-durable/storage/jsonl/node";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { CodingTools } from "@earendil-works/pi-durable/tools";

assert.equal(metadata.version, "1.3.0");
globalThis.fetch = () => {
	throw new Error("Unexpected network request in offline probe");
};
const directory = mkdtempSync("/tmp/opencode/durable-api-");
const context = BACKGROUND_CONTEXT;
const Note = defineDoc({
	kind: "probe.note",
	version: 1,
	scope: "conversation",
	history: "rewindable",
	fork: "asOf",
	initial: () => ({ text: "" }),
});
const ProbeTask = defineTask({
	name: "probe.task",
	version: 1,
	initial: () => ({ phase: "finish" }),
	phases: {
		finish: (task, runtime, taskContext) =>
			runtime.commit(
				() => ({
					status: "terminal",
					outcome: { status: "completed", result: task.input.value },
				}),
				taskContext,
			),
	},
	abort: (_task, runtime, taskContext) =>
		runtime.commit(
			() => ({ status: "terminal", outcome: { status: "aborted" } }),
			taskContext,
		),
});

for (const backend of ["memory", "sqlite", "jsonl"]) {
	const fake = fauxProvider({ tokensPerSecond: 100000 });
	const models = createModels();
	models.setProvider(fake.provider);
	let nestedCalls = 0;
	const count = defineTool({
		name: "probe_count",
		description: "Offline structured result",
		parameters: Type.Object({ value: Type.Number() }),
		structuredOutputSchema: Type.Object({ count: Type.Number() }),
		execute: async (args) => {
			nestedCalls++;
			return {
				output: [{ type: "text", text: "counted" }],
				structuredOutput: { count: args.value },
			};
		},
	});
	const parent = defineTool({
		name: "probe_parent",
		description: "Offline nested call",
		parameters: Type.Object({}),
		execute: async (_args, api, toolContext) => {
			const result = await api.executeTool(
				"probe_count",
				{ value: 7 },
				toolContext,
			);
			assert.equal(result.isError, false);
			assert.deepEqual(result.structuredOutput, { count: 7 });
			return { output: [{ type: "text", text: "nested call checked" }] };
		},
	});
	const registry = createRegistry();
	registry.install(CodingTools);
	registry.install(
		defineExtension({
			name: "probe",
			tools: [count, parent],
			tasks: [ProbeTask],
		}),
	);
	const options = {
		models,
		registry,
		env: () => new NodeExecutionEnv({ cwd: directory }),
	};
	const path = join(directory, backend);
	const openStorage = () => {
		if (backend === "sqlite") return openNodeSqliteStorage(`${path}.sqlite`);
		if (backend === "jsonl") return openNodeJsonlStorage(path, context);
		return new MemoryStorage();
	};
	const harness = await Harness.open(await openStorage(), options, context);
	let conversationId;
	try {
		const root = await harness.root(context, {
			agent: { model: { provider: "faux", modelId: "faux-1" } },
		});
		conversationId = root.id;
		await root.commit(async (tx) => {
			(await tx.doc(Note, root.id)).text = backend;
		}, context);
		assert.equal(
			(await harness.snapshot(Note, root.id, context)).text,
			backend,
		);
		fake.setResponses([
			fauxAssistantMessage(
				fauxToolCall("write", { path: `${backend}.txt`, content: "fixture" }),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage(fauxToolCall("read", { path: `${backend}.txt` }), {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage(fauxToolCall("probe_parent", {}), {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage("offline result"),
		]);
		const result = await (
			await root.submit({ type: "input", content: "Run the fixture" }, context)
		).wait(context);
		assert.equal(result.status, "done");
		const answer = await root.commit(
			(tx) => tx.entry(AssistantEntry, result.answer),
			context,
		);
		assert.equal(answer.model[0].content[0].text, "offline result");
		assert.equal(nestedCalls, 1);
		assert.equal(
			readFileSync(join(directory, `${backend}.txt`), "utf8"),
			"fixture",
		);
		const taskId = await root.commit(
			(tx) =>
				tx.createTask(
					ProbeTask,
					{ value: 42 },
					{ ownership: { kind: "conversation" } },
				),
			context,
		);
		const task = await harness.waitForTask(taskId, context);
		assert.deepEqual(task.state.outcome, { status: "completed", result: 42 });
	} finally {
		await harness.close(context);
	}
	if (backend !== "memory") {
		const reopened = await Harness.open(await openStorage(), options, context);
		try {
			const root = await reopened.root(context);
			assert.equal(root.id, conversationId);
			assert.equal(
				(await reopened.snapshot(Note, root.id, context)).text,
				backend,
			);
		} finally {
			await reopened.close(context);
		}
	}
	console.log(
		`PASS ${backend}: generation, file tools, nested structured result, document, task${backend === "memory" ? "" : ", clean reopen"}`,
	);
}
