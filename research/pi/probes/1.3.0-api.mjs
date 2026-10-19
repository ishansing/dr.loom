// Run from an isolated npm project with pi-coding-agent@1.3.0; see the API review.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import {
	fauxAssistantMessage,
	fauxProvider,
	InMemoryCredentialStore,
} from "@earendil-works/pi-ai";
import { classify } from "@earendil-works/pi-ai/api/typesafe-system-one";
import * as pi from "@earendil-works/pi-coding-agent";

process.env.PI_OFFLINE = "1";
globalThis.fetch = () => {
	throw new Error("Unexpected network request in offline probe");
};
assert.equal(pi.VERSION, "1.3.0");
for (const name of [
	"createAgentSession",
	"createAgentSessionRuntime",
	"AgentSessionRuntime",
	"SessionManager",
	"SettingsManager",
	"DefaultResourceLoader",
	"ModelRuntime",
	"ModelRegistry",
	"defineTool",
	"createBashTool",
	"createBashToolDefinition",
	"createCodemodeExtension",
	"createToolSearchExtension",
	"createMcpExtension",
])
	assert.equal(typeof pi[name], "function", name);

const cwd = mkdtempSync("/tmp/opencode/pi-api-probe-");
const modelRuntime = await pi.ModelRuntime.create({
	credentials: new InMemoryCredentialStore(),
	modelsPath: null,
	refreshOnCreate: false,
});
const fake = fauxProvider({ tokensPerSecond: 100000 });
fake.setResponses([fauxAssistantMessage("offline SDK response")]);
modelRuntime.registerNativeProvider(fake.provider);
await modelRuntime.refresh({ allowNetwork: false });
const settingsManager = pi.SettingsManager.inMemory({
	cacheWarming: "off",
	retry: { enabled: false },
	compaction: { enabled: false },
});
const resourceLoader = new pi.DefaultResourceLoader({
	cwd,
	agentDir: join(cwd, "agent"),
	settingsManager,
	noExtensions: true,
	noSkills: true,
	noPromptTemplates: true,
	noThemes: true,
	agentsFilesOverride: () => ({ agentsFiles: [] }),
	systemPromptOverride: () => "Offline API probe.",
	appendSystemPromptOverride: () => [],
});
await resourceLoader.reload();
assert.equal(resourceLoader.getExtensions().errors.length, 0);
const sessionManager = pi.SessionManager.inMemory(cwd);
const { session, extensionsResult } = await pi.createAgentSession({
	cwd,
	agentDir: join(cwd, "agent"),
	model: fake.getModel(),
	modelRuntime,
	settingsManager,
	resourceLoader,
	sessionManager,
	tools: [],
});
const events = [];
const unsubscribe = session.subscribe((event) => events.push(event.type));
try {
	assert.equal(extensionsResult.extensions.length, 0);
	assert.deepEqual(session.getActiveToolNames(), []);
	await session.bindExtensions({});
	await session.prompt("Exercise the SDK without a provider request.");
	await session.waitForIdle();
	assert.equal(session.getLastAssistantText(), "offline SDK response");
	assert.ok(events.includes("agent_settled"));
	assert.equal(session.getSessionStats().assistantMessages, 1);
	const beforeUsage = session.getSessionStats().tokens.input;
	sessionManager.appendUsage("cache_warm", "faux", "faux-1", {
		input: 7,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 7,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	});
	assert.equal(session.getSessionStats().tokens.input, beforeUsage + 7);
	assert.ok(
		sessionManager.getEntries().some((entry) => entry.type === "message"),
	);
	assert.equal(sessionManager.getSessionFile(), undefined);
	const routeReasons = [];
	modelRuntime.registerVirtualModel({
		provider: "offline-router",
		id: "reviewer",
		name: "Offline reviewer",
		route: (request) => {
			routeReasons.push(request.reason);
			return { model: fake.getModel(), thinkingLevel: "off" };
		},
	});
	await modelRuntime.refresh({ allowNetwork: false });
	fake.appendResponses([fauxAssistantMessage("routed SDK response")]);
	await session.setModel(modelRuntime.getModel("offline-router", "reviewer"));
	await session.prompt("Exercise virtual-model role routing.");
	assert.deepEqual(routeReasons, ["user"]);
	assert.equal(
		session.getLastAssistantText(),
		"routed SDK response",
		JSON.stringify(session.messages),
	);
	await session.abort();
} finally {
	unsubscribe();
	session.dispose();
}
const persisted = pi.SessionManager.create(cwd, join(cwd, "sessions"));
persisted.appendMessage({
	role: "user",
	content: "offline",
	timestamp: Date.now(),
});
persisted.appendMessage(fauxAssistantMessage("persisted"));
const reopened = pi.SessionManager.open(persisted.getSessionFile());
assert.equal(reopened.getHeader().version, 3);
assert.deepEqual(reopened.getEntries(), persisted.getEntries());
console.log(
	"PASS: published SDK exports, isolated session, prompt/subscribe/stats/entries/abort/dispose, virtual routing, JSONL v3 reopen",
);

const registry = new pi.ModelRegistry(modelRuntime);
assert.equal(typeof registry.findOfType, "function");
assert.equal(typeof registry.getAvailableOfType, "function");
assert.equal(typeof registry.classify, "function");
assert.deepEqual(
	registry.getModelsOfType("classifier", "typesafe").map((entry) => entry.id),
	["jev-latest"],
);
assert.equal(
	registry.findOfType("classifier", "typesafe", "jev-1.13.0"),
	undefined,
);
assert.equal(
	registry.findOfType("classifier", "typesafe", "jev-latest").cost.input,
	0,
);
const missing = {
	type: "classifier",
	api: "typesafe-system-one",
	provider: "missing-probe-provider",
	id: "missing",
};
const unavailable = await registry.classify(missing, {
	state: "",
	questions: {},
});
assert.equal(unavailable.stopReason, "error");
assert.deepEqual(unavailable.answers, {});

const model = {
	type: "classifier",
	api: "typesafe-system-one",
	provider: "typesafe",
	id: "jev-latest",
	baseUrl: "https://offline.invalid/v1",
	cost: { input: 0.042, output: 0 },
};
const context = {
	state: "offline",
	questions: {
		choice: { type: "choice", criteria: { allow: "A", deny: "B" } },
		score: { type: "score", criteria: "severity" },
		bool: { type: "bool", criteria: "relevant" },
	},
};
let wireBody;
let requestSignal;
const result = await classify(model, context, {
	apiKey: "offline-fixture-not-a-secret",
	maxRetries: 0,
	fetch: async (_url, options) => {
		wireBody = JSON.parse(options.body);
		requestSignal = options.signal;
		return Response.json({
			model: "jev-server-version",
			answers: {
				choice: {
					type: "choice",
					choice: "unknown",
					probabilities: { alien: -1, other: 3 },
					confidence: 9,
				},
				score: {
					type: "score",
					score: 0.5,
					confidence: 0.8,
					probabilities: { low: 0.5, high: 0.5 },
					legend: ["low", "high"],
				},
				bool: { type: "noul", noul: 2 },
			},
			usage: { input_tokens: -9, output_tokens: 3 },
		});
	},
});
assert.equal(result.stopReason, "stop");
assert.equal(result.answers.choice.choice, "unknown");
assert.equal(result.answers.bool.probability, 2);
assert.equal(result.answers.score.probabilities, undefined);
assert.equal(result.model, "jev-latest");
assert.equal(result.usage.input, 0);
assert.equal(wireBody.questions.bool.type, "noul");
assert.equal(requestSignal, undefined);
console.log(
	"PASS: classifier still accepts invalid probabilities/options, drops Score distribution, masks resolved model ID, has no default request timeout",
);

const timeoutResult = await classify(model, context, {
	apiKey: "offline-fixture-not-a-secret",
	timeoutMs: 5,
	maxRetries: 0,
	fetch: async (_url, options) =>
		new Promise((_resolve, reject) => {
			const guard = setTimeout(
				() => reject(new Error("Probe abort did not fire")),
				1000,
			);
			options.signal.addEventListener(
				"abort",
				() => {
					clearTimeout(guard);
					reject(options.signal.reason);
				},
				{ once: true },
			);
		}),
});
assert.equal(timeoutResult.stopReason, "error");
assert.match(timeoutResult.errorMessage, /timed out/);
const controller = new AbortController();
controller.abort();
let abortFetchCalled = false;
const aborted = await classify(model, context, {
	apiKey: "offline-fixture-not-a-secret",
	signal: controller.signal,
	maxRetries: 0,
	fetch: async (_url, options) => {
		assert.equal(options.signal.aborted, true);
		abortFetchCalled = true;
		throw new Error("Pre-aborted request reached fetch");
	},
});
assert.equal(aborted.stopReason, "aborted");
assert.equal(abortFetchCalled, true);
const attemptSignals = [];
const retried = await classify(
	model,
	{ state: "offline", questions: {} },
	{
		apiKey: "offline-fixture-not-a-secret",
		timeoutMs: 1000,
		fetch: async (_url, options) => {
			attemptSignals.push(options.signal);
			return attemptSignals.length < 3
				? new Response("{}", {
						status: 503,
						headers: { "retry-after-ms": "0" },
					})
				: Response.json({ answers: {} });
		},
	},
);
assert.equal(retried.stopReason, "stop");
assert.equal(attemptSignals.length, 3);
assert.equal(new Set(attemptSignals).size, 3);
console.log(
	"PASS: classifier error/timeout/abort results; default two retries with fresh per-attempt timeout signals",
);
