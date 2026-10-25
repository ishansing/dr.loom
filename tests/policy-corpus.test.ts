import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as s from "../src/index.ts";

const ctx = {
	runId: "r1",
	threadId: "main",
	workspace: "/workspace",
	owner: "worker",
	epoch: 1,
	nowMs: 1000,
};
const policy: s.PolicyConfig = {
	defaultEffect: "deny",
	rules: [{ scope: "global", tool: "*", pattern: "*", effect: "allow" }],
};
const request: s.EffectRequest = {
	context: ctx,
	tool: "edit",
	targets: ["docs/a.md"],
	targetType: "path",
	deadlineMs: 2000,
	authority: { kind: "root" },
	tier: "standard",
	actionClass: "mutation",
	production: false,
	dataEgress: false,
};

test("R-001 literal wildcard characters in targets cannot bypass deny rules", () => {
	for (const [pattern, target, matched] of [
		["*", "*x", true],
		["docs/*", "docs/*secret", true],
		["docs/**", "docs/**secret", true],
		["docs/*end", "docs/*secretend", true],
		["docs/*end", "docs/*secretending", false],
	] as const)
		expect(s.matchPattern(pattern, target)).toBe(matched);
});

test("R-001 public admission denies a literal-star filename under a wildcard deny", () => {
	const db = ready();
	try {
		const denied: s.PolicyConfig = {
			...policy,
			rules: [
				...policy.rules,
				{ scope: "global", tool: "*", pattern: "docs/*", effect: "deny" },
			],
		};
		expect(
			s.authorize(db, { ...request, targets: ["docs/*secret"] }, denied)
				.decision,
		).toBe("deny");
		expect(
			s.evaluatePolicy(denied, {
				runId: "r1",
				threadId: "main",
				tool: "edit",
				target: "docs/*secret",
				targetType: "path",
			}).effect,
		).toBe("deny");
	} finally {
		db.close();
	}
});

test("R-002 SQLite companions are DB-secret targets, ordinary suffix near-misses are not", () => {
	const db = ready();
	try {
		for (const extension of ["db", "sqlite", "sqlite3"])
			for (const suffix of ["", "-wal", "-shm", "-journal"]) {
				const target = `db/loom.${extension}${suffix}`;
				expect(s.resolvePathTarget(ctx.workspace, target).secretAdjacent).toBe(
					true,
				);
				expect(
					s.authorize(db, { ...request, targets: [target] }, policy).decision,
				).toBe("deny");
			}
		for (const target of [
			"docs/sqlite-guide.md",
			"docs/example.db.txt",
			"docs/normal-wal",
		])
			expect(s.resolvePathTarget(ctx.workspace, target).secretAdjacent).toBe(
				false,
			);
	} finally {
		db.close();
	}
});

test("R-003 exhausted call budget rejects before stale lease without consuming usage", () => {
	const db = ready();
	try {
		s.setBudgetLimit(db, { runId: "r1", kind: "tool-calls", limit: 0 });
		expect(
			s.authorize(db, { ...request, context: { ...ctx, epoch: 2 } }, policy)
				.reason,
		).toBe("budget");
		expect(s.getBudget(db, "r1", "tool-calls")?.used).toBe(0);
		expect(
			db
				.query(
					"SELECT count(*) AS n FROM audit WHERE action='budget-breach' AND actor='system:budget' AND decision='denied'",
				)
				.get(),
		).toEqual({ n: 1 });
		s.setBudgetLimit(db, { runId: "r1", kind: "tool-calls", limit: 1 });
		expect(
			s.authorize(db, { ...request, context: { ...ctx, epoch: 2 } }, policy)
				.reason,
		).toBe("lease");
		expect(s.getBudget(db, "r1", "tool-calls")?.used).toBe(0);
		expect(db.query("SELECT count(*) AS n FROM usage").get()).toEqual({ n: 0 });
	} finally {
		db.close();
	}
});

function ready() {
	const db = s.openDb();
	s.initSchema(db);
	s.acquireWorkspaceLease(db, {
		runId: "r1",
		workspace: ctx.workspace,
		owner: ctx.owner,
		ttlMs: 10000,
		nowMs: 1000,
	});
	s.setBudgetLimit(db, { runId: "r1", kind: "tool-calls", limit: null });
	return db;
}

test("T-06 public effect gate is present", () => {
	expect(typeof s.authorize).toBe("function");
});

test("policy deny wins across scopes, shell compounds cannot inherit an allow", () => {
	const base = {
		runId: "r1",
		threadId: "main",
		tool: "bash",
		target: "git status",
		targetType: "command",
	} satisfies s.PolicyRequest;
	expect(s.evaluatePolicy(policy, base).effect).toBe("allow");
	for (const target of [
		"git status && rm x",
		"git status;echo x",
		"git status\necho x",
		"git $(echo status)",
	])
		expect(s.evaluatePolicy(policy, { ...base, target }).effect).toBe("deny");
	expect(
		s.evaluatePolicy(
			{
				defaultEffect: "ask",
				rules: [
					{ scope: "global", tool: "*", pattern: "*", effect: "deny" },
					{
						scope: "thread",
						scopeId: "main",
						tool: "*",
						pattern: "*",
						effect: "allow",
					},
				],
			},
			base,
		).effect,
	).toBe("deny");
});

test("effect admission audits decision but never claims the effect ran", () => {
	const db = ready();
	try {
		const allowed = s.authorize(db, request, policy);
		expect(allowed.decision).toBe("allow");
		expect(allowed.risk.score).toBe(10);
		expect(s.getBudget(db, "r1", "tool-calls")?.used).toBe(1);
		const action = s.getAction(db, {
			runId: ctx.runId,
			threadId: ctx.threadId,
			actionId: allowed.auditActionId,
		});
		expect(action?.action).toStartWith("policy:");
		expect(action?.outcome).toBe("completed");
		expect(action?.evidenceRef).not.toContain("docs/a.md");
		const asked = s.authorize(db, request, { rules: [], defaultEffect: "ask" });
		expect(asked.decision).toBe("ask");
		expect(
			s.getAction(db, {
				runId: ctx.runId,
				threadId: ctx.threadId,
				actionId: asked.auditActionId,
			})?.decision,
		).toBe("escalated");
		expect(s.getBudget(db, "r1", "tool-calls")?.used).toBe(1);
	} finally {
		db.close();
	}
});

test("paths, grant scope, deadlines and lease fail closed in gate order", () => {
	const db = ready();
	try {
		for (const target of [
			"../escape",
			"/outside/file",
			".env",
			"config/local.env",
			"keys/id_dsa",
			"keys/secret.pem",
			"db/loom.sqlite",
		])
			expect(
				s.authorize(db, { ...request, targets: [target] }, policy).decision,
			).toBe("deny");
		expect(
			s.authorize(db, { ...request, deadlineMs: 1000 }, policy).reason,
		).toBe("deadline");
		expect(
			s.authorize(db, { ...request, parentDeadlineMs: 1500 }, policy).reason,
		).toBe("deadline");
		const delegated: s.EffectRequest = {
			...request,
			authority: { kind: "grant", grantId: "g1" },
		};
		expect(s.authorize(db, delegated, policy).reason).toBe("grant");
		s.createGrant(db, {
			grantId: "g1",
			runId: "r1",
			threadId: "main",
			tool: "edit",
			pattern: "docs/*",
			expiresAt: 1900,
			actor: "human:test",
			evidenceRef: "approval:synthetic",
		});
		expect(s.getGrant(db, "g1")?.pattern).toBe("docs/*");
		expect(s.authorize(db, delegated, policy).decision).toBe("allow");
		expect(
			s.authorize(db, { ...delegated, targets: ["src/x"] }, policy).reason,
		).toBe("grant");
		expect(
			s.authorize(
				db,
				{ ...delegated, context: { ...ctx, nowMs: 1900 } },
				policy,
			).reason,
		).toBe("grant");
		expect(
			s.authorize(db, { ...request, context: { ...ctx, epoch: 2 } }, policy)
				.reason,
		).toBe("lease");
		s.engageKill(db, {
			scope: "run:r1",
			actor: "human:test",
			reason: "synthetic",
			evidenceRef: "approval:test",
			synthetic: true,
		});
		expect(s.authorize(db, { ...request, deadlineMs: 1 }, policy).reason).toBe(
			"killed",
		);
	} finally {
		db.close();
	}
});

test("network egress keeps the high-risk ask floor even under an allow rule", () => {
	const db = ready();
	try {
		const decision = s.authorize(
			db,
			{
				...request,
				targets: ["example.invalid"],
				targetType: "domain",
				actionClass: "read",
			},
			policy,
		);
		expect(decision.decision).toBe("ask");
		expect(
			s.getAction(db, {
				runId: "r1",
				threadId: "main",
				actionId: decision.auditActionId,
			})?.tier,
		).toBe("high-risk");
	} finally {
		db.close();
	}
});

test("risk escalates at 40, blocks at 75, and accounts for every included term", () => {
	const input: s.RiskInput = {
		tier: "critical",
		targetCount: 30,
		outsideWorkspace: true,
		secretAdjacent: true,
		production: true,
		dataEgress: true,
		novel: true,
		priorDeny: true,
		irreversible: true,
	};
	const risk = s.scoreRisk(input);
	expect(risk.score).toBe(100);
	expect(Object.values(risk.breakdown).reduce((a, b) => a + b, 0)).toBe(100);
	const db = ready();
	try {
		expect(
			s.authorize(db, { ...request, production: true }, policy).decision,
		).toBe("ask");
		expect(
			s.authorize(db, { ...request, production: true }, policy).decision,
		).toBe("ask");
		expect(
			s.authorize(
				db,
				{ ...request, tier: "critical", production: true, dataEgress: true },
				policy,
			).decision,
		).toBe("deny");
	} finally {
		db.close();
	}
});

test("rule specificity, defaults and glob matching are anchored", () => {
	const base: s.PolicyRequest = {
		runId: "r1",
		threadId: "main",
		tool: "edit",
		target: "docs/a.md",
		targetType: "path",
	};
	expect(
		s.evaluatePolicy(s.DEFAULT_POLICY, { ...base, tool: "read" }).effect,
	).toBe("allow");
	expect(s.evaluatePolicy(s.DEFAULT_POLICY, base).effect).toBe("ask");
	expect(
		s.evaluatePolicy(
			{
				defaultEffect: "deny",
				rules: [
					{ scope: "global", tool: "*", pattern: "*", effect: "ask" },
					{
						scope: "run",
						scopeId: "r1",
						tool: "edit",
						pattern: "docs/*",
						effect: "allow",
					},
					{
						scope: "thread",
						scopeId: "other",
						tool: "*",
						pattern: "*",
						effect: "deny",
					},
				],
			},
			base,
		).effect,
	).toBe("allow");
	for (const [pattern, value, match] of [
		["a?c", "abc", true],
		["a?c", "ac", false],
		["a*b", "axxb", true],
		["a*b", "axxbc", false],
		["[a]", "[a]", true],
		["*", "a\nb", true],
	] as const)
		expect(s.matchPattern(pattern, value)).toBe(match);
	for (const bad of [
		{ ...policy, defaultEffect: "allow" },
		{
			rules: [{ scope: "bad", tool: "*", pattern: "*", effect: "deny" }],
			defaultEffect: "deny",
		},
		{
			rules: [{ scope: "global", tool: "*", pattern: "*", effect: "oops" }],
			defaultEffect: "deny",
		},
		{
			rules: [{ scope: "run", tool: "*", pattern: "*", effect: "allow" }],
			defaultEffect: "deny",
		},
	])
		expect(() =>
			Reflect.apply(s.evaluatePolicy, undefined, [bad, base]),
		).toThrow();
});

test("risk rejects malformed observables rather than emitting NaN or lowering risk", () => {
	const input: s.RiskInput = {
		tier: "standard",
		targetCount: 1,
		outsideWorkspace: false,
		secretAdjacent: false,
		production: false,
		dataEgress: false,
		novel: false,
		priorDeny: false,
		irreversible: false,
	};
	expect(s.scoreRisk(input)).toEqual({ score: 0, breakdown: {} });
	for (const patch of [
		{ tier: "unknown" },
		{ targetCount: NaN },
		{ targetCount: 0 },
		{ targetCount: 1.5 },
		{ production: "false" },
	])
		expect(() =>
			Reflect.apply(s.scoreRisk, undefined, [{ ...input, ...patch }]),
		).toThrow();
});

test("missing budgets, unsafe retry, duplicate grants and hostile extra fields fail closed", () => {
	const db = ready();
	try {
		const usage: s.BudgetInput = {
			runId: "r1",
			threadId: "main",
			kind: "threads",
			amount: 1,
			evidenceRef: "trace:test",
		};
		expect(() => s.drawBudget(db, usage)).toThrow("explicitly");
		for (const patch of [
			{ amount: -1 },
			{ amount: NaN },
			{ kind: "bogus" },
			{ evidenceRef: "bad" },
			{ extra: true },
		])
			expect(() =>
				Reflect.apply(s.recordUsage, undefined, [db, { ...usage, ...patch }]),
			).toThrow();
		for (const patch of [
			{ targets: [] },
			{ tool: "" },
			{ targetType: "bad" },
			{ tier: "bad" },
			{ actionClass: "bad" },
			{ production: "yes" },
			{ deadlineMs: -1 },
			{ authority: { kind: "agent" } },
			{ authority: { kind: "root", approval: "I approve" } },
			{ extra: true },
		])
			expect(() =>
				Reflect.apply(s.authorize, undefined, [
					db,
					{ ...request, ...patch },
					policy,
				]),
			).toThrow();
		const grant = {
			grantId: "x",
			runId: "r1",
			threadId: "main",
			tool: "edit",
			pattern: "*",
			expiresAt: 2000,
			actor: "human:test",
			evidenceRef: "approval:test",
		};
		expect(() => s.createGrant(db, { ...grant, actor: "agent:self" })).toThrow(
			"supervisor",
		);
		s.createGrant(db, grant);
		expect(() => s.createGrant(db, grant)).toThrow();
		expect(() =>
			Reflect.apply(s.drawRetry, undefined, [
				db,
				{
					runId: "r1",
					threadId: "main",
					safe: false,
					evidenceRef: "trace:test",
				},
			]),
		).toThrow("safe");
	} finally {
		db.close();
	}
});

test("safe retry bucket exhausts, expires and remains accounted in append-only usage", () => {
	const db = ready();
	try {
		const retry = {
			runId: "r1",
			threadId: "main",
			safe: true,
			evidenceRef: "trace:retry",
			nowMs: 1000,
		} satisfies Parameters<typeof s.drawRetry>[1];
		expect(() => s.drawRetry(db, retry)).toThrow("configured");
		s.setBudgetLimit(db, { runId: "r1", kind: "retries", limit: null });
		for (let i = 0; i < 10; i++) expect(s.drawRetry(db, retry).ok).toBe(true);
		expect(s.drawRetry(db, retry).ok).toBe(false);
		expect(s.drawRetry(db, { ...retry, nowMs: 61000 }).ok).toBe(true);
		expect(s.getBudget(db, "r1", "retries")?.used).toBe(11);
		s.recordUsage(db, {
			runId: "r1",
			threadId: "main",
			kind: "tool-calls",
			amount: 100,
			evidenceRef: "trace:calls",
		});
		expect(s.drawRetry(db, { ...retry, nowMs: 61000 }).ok).toBe(true);
	} finally {
		db.close();
	}
});

test("ignored usage/counter writes roll back instead of manufacturing successful draws", () => {
	for (const table of ["usage", "budgets"]) {
		const db = ready();
		try {
			db.exec(
				`CREATE TRIGGER ignore_draw BEFORE ${table === "usage" ? "INSERT" : "UPDATE"} ON ${table} BEGIN SELECT RAISE(IGNORE); END`,
			);
			expect(() =>
				s.drawBudget(db, {
					runId: "r1",
					threadId: "main",
					kind: "tool-calls",
					amount: 1,
					evidenceRef: "trace:test",
				}),
			).toThrow("persist");
			expect(s.getBudget(db, "r1", "tool-calls")?.used).toBe(0);
			expect(db.query("SELECT count(*) AS n FROM usage").get()).toEqual({
				n: 0,
			});
		} finally {
			db.close();
		}
	}
});

test("grant mint verifies the persisted run/thread binding and rolls back audit on mismatch", () => {
	const db = ready();
	try {
		db.exec(
			"CREATE TRIGGER corrupt_grant AFTER INSERT ON grants BEGIN UPDATE grants SET thread_id='other' WHERE grant_id=NEW.grant_id; END",
		);
		expect(() =>
			s.createGrant(db, {
				grantId: "g",
				runId: "r1",
				threadId: "main",
				tool: "edit",
				pattern: "*",
				expiresAt: 2000,
				actor: "human:test",
				evidenceRef: "approval:test",
			}),
		).toThrow("persist");
		expect(s.getGrant(db, "g")).toBeNull();
		expect(db.query("SELECT count(*) AS n FROM audit").get()).toEqual({ n: 0 });
	} finally {
		db.close();
	}
});

test("corrupt counters, ignored limits and disappearing draws cannot report success", () => {
	for (const fault of [
		"date",
		"counter",
		"ignored-limit",
		"changed-limit",
		"deleted-draw",
		"lease",
	] as const) {
		const db = ready();
		try {
			if (fault === "date") db.exec("UPDATE budgets SET updated_at='invalid'");
			if (fault === "counter") db.exec("UPDATE budgets SET used=1");
			if (fault === "ignored-limit")
				db.exec(
					"CREATE TRIGGER ignore_limit BEFORE UPDATE ON budgets BEGIN SELECT RAISE(IGNORE); END",
				);
			if (fault === "changed-limit")
				db.exec(
					'CREATE TRIGGER change_limit AFTER UPDATE ON budgets WHEN NEW."limit" != 99 BEGIN UPDATE budgets SET "limit"=99; END',
				);
			if (fault === "deleted-draw")
				db.exec(
					"CREATE TRIGGER delete_draw AFTER UPDATE ON budgets BEGIN DELETE FROM budgets WHERE run_id=NEW.run_id; END",
				);
			if (fault === "lease") db.exec("UPDATE leases SET acquired_at='invalid'");
			if (fault === "lease")
				expect(() => s.authorize(db, request, policy)).toThrow("history");
			else if (fault === "ignored-limit" || fault === "changed-limit")
				expect(() =>
					s.setBudgetLimit(db, { runId: "r1", kind: "tool-calls", limit: 5 }),
				).toThrow("persist");
			else if (fault === "deleted-draw")
				expect(() =>
					s.drawBudget(db, {
						runId: "r1",
						threadId: "main",
						kind: "tool-calls",
						amount: 1,
						evidenceRef: "trace:test",
					}),
				).toThrow("persist");
			else expect(() => s.getBudget(db, "r1", "tool-calls")).toThrow();
		} finally {
			db.close();
		}
	}
});

test("kill denies new draws and grants but does not erase late usage facts", () => {
	const db = ready();
	try {
		s.engageKill(db, {
			scope: "run:r1",
			actor: "human:test",
			reason: "synthetic",
			evidenceRef: "approval:test",
			synthetic: true,
		});
		expect(() =>
			s.drawBudget(db, {
				runId: "r1",
				threadId: "main",
				kind: "tool-calls",
				amount: 1,
				evidenceRef: "trace:test",
			}),
		).toThrow("killed");
		expect(() =>
			s.createGrant(db, {
				grantId: "g",
				runId: "r1",
				threadId: "main",
				tool: "*",
				pattern: "*",
				expiresAt: 2000,
				actor: "system:supervisor",
				evidenceRef: "approval:test",
			}),
		).toThrow("killed");
		expect(
			s.recordUsage(db, {
				runId: "r1",
				threadId: "main",
				kind: "tool-calls",
				amount: 1,
				evidenceRef: "trace:late",
			}).budget.used,
		).toBe(1);
	} finally {
		db.close();
	}
});

test("retry draws at the first valid timestamp still consume bucket capacity", () => {
	const db = ready();
	try {
		s.setBudgetLimit(db, { runId: "r1", kind: "retries", limit: null });
		const retry = {
			runId: "r1",
			threadId: "main",
			safe: true,
			evidenceRef: "trace:test",
			nowMs: 0,
		} satisfies Parameters<typeof s.drawRetry>[1];
		for (let i = 0; i < 10; i++) expect(s.drawRetry(db, retry).ok).toBe(true);
		expect(s.drawRetry(db, retry).ok).toBe(false);
	} finally {
		db.close();
	}
});

test("two actual processes cannot overdraw a one-slot budget", async () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-policy-race-");
	const path = join(dir, "ledger.sqlite");
	const db = s.openDb(path);
	try {
		s.initSchema(db);
		s.setBudgetLimit(db, { runId: "r1", kind: "threads", limit: 1 });
		const script = `import * as s from ${JSON.stringify(import.meta.dir + "/../src/index.ts")}; const db=s.openDb(${JSON.stringify(path)}); db.exec('PRAGMA busy_timeout=5000'); console.log('ready'); await Bun.stdin.text(); const result=s.drawBudget(db,{runId:'r1',threadId:'child',kind:'threads',amount:1,evidenceRef:'trace:race'}); db.close(); process.exit(result.ok?0:24);`;
		const children = [];
		try {
			for (let i = 0; i < 2; i++) {
				const child = Bun.spawn([process.execPath, "--eval", script], {
					env: {},
					stdin: "pipe",
					stdout: "pipe",
					stderr: "pipe",
				});
				children.push(child);
				const reader = child.stdout.getReader();
				const first = await reader.read();
				expect(new TextDecoder().decode(first.value)).toBe("ready\n");
				reader.releaseLock();
			}
			for (const child of children) child.stdin.end();
			expect(
				(await Promise.all(children.map((child) => child.exited))).sort(),
			).toEqual([0, 24]);
			for (const child of children)
				expect(await new Response(child.stderr).text()).toBe("");
			expect(s.getBudget(db, "r1", "threads")?.used).toBe(1);
		} finally {
			for (const child of children) {
				child.kill();
				await child.exited;
			}
		}
	} finally {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

test("admission samples the clock after acquiring the writer lock, not before waiting", async () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-policy-deadline-");
	const path = join(dir, "ledger.sqlite");
	const db = s.openDb(path);
	let child: ReturnType<typeof Bun.spawn> | undefined;
	try {
		s.initSchema(db);
		db.exec("PRAGMA busy_timeout=5000");
		s.setBudgetLimit(db, { runId: "r1", kind: "tool-calls", limit: null });
		s.acquireWorkspaceLease(db, {
			runId: "r1",
			workspace: ctx.workspace,
			owner: ctx.owner,
			ttlMs: 10000,
		});
		const script = `import * as s from ${JSON.stringify(import.meta.dir + "/../src/index.ts")}; const db=s.openDb(${JSON.stringify(path)}); db.transaction(()=>{console.log('locked'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500);}).immediate(); db.close();`;
		const blocker = Bun.spawn([process.execPath, "--eval", script], {
			env: {},
			stdout: "pipe",
			stderr: "pipe",
		});
		child = blocker;
		const reader = blocker.stdout.getReader();
		expect(new TextDecoder().decode((await reader.read()).value)).toBe(
			"locked\n",
		);
		reader.releaseLock();
		const { nowMs: _, ...context } = ctx;
		const decision = s.authorize(
			db,
			{ ...request, context, deadlineMs: Date.now() + 100 },
			policy,
		);
		expect(decision.reason).toBe("deadline");
		expect(s.getBudget(db, "r1", "tool-calls")?.used).toBe(0);
		expect(await blocker.exited).toBe(0);
		expect(await new Response(blocker.stderr).text()).toBe("");
	} finally {
		if (child) {
			child.kill();
			await child.exited;
		}
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

test("budget status uses one snapshot while another process draws", async () => {
	mkdirSync("/tmp/opencode", { recursive: true });
	const dir = mkdtempSync("/tmp/opencode/loom-policy-status-");
	const path = join(dir, "ledger.sqlite");
	const db = s.openDb(path);
	let child: ReturnType<typeof Bun.spawn> | undefined;
	try {
		s.initSchema(db);
		s.setBudgetLimit(db, { runId: "r1", kind: "threads", limit: null });
		const script = `import * as s from ${JSON.stringify(import.meta.dir + "/../src/index.ts")}; const db=s.openDb(${JSON.stringify(path)}); db.exec('PRAGMA busy_timeout=5000'); console.log('ready'); await Bun.stdin.text(); for(let i=0;i<1000;i++) s.drawBudget(db,{runId:'r1',threadId:'child',kind:'threads',amount:1,evidenceRef:'trace:race'}); db.close();`;
		const writer = Bun.spawn([process.execPath, "--eval", script], {
			env: {},
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});
		child = writer;
		const reader = writer.stdout.getReader();
		expect(new TextDecoder().decode((await reader.read()).value)).toBe(
			"ready\n",
		);
		reader.releaseLock();
		writer.stdin.end();
		for (let i = 0; i < 1000; i++)
			expect(() => s.getBudget(db, "r1", "threads")).not.toThrow();
		expect(await writer.exited).toBe(0);
		expect(await new Response(writer.stderr).text()).toBe("");
		expect(s.getBudget(db, "r1", "threads")?.used).toBe(1000);
	} finally {
		if (child) {
			child.kill();
			await child.exited;
		}
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

test("budget draws reject over-cap, recordUsage preserves actual overage, no auto-kill", () => {
	const db = ready();
	try {
		s.setBudgetLimit(db, { runId: "r1", kind: "tool-calls", limit: 1 });
		expect(s.authorize(db, request, policy).decision).toBe("allow");
		expect(s.authorize(db, request, policy).reason).toBe("budget");
		expect(s.getBudget(db, "r1", "tool-calls")?.used).toBe(1);
		s.setBudgetLimit(db, { runId: "r1", kind: "cost-tokens", limit: 2 });
		expect(
			s.recordUsage(db, {
				runId: "r1",
				threadId: "main",
				kind: "cost-tokens",
				amount: 3,
				evidenceRef: "trace:synthetic",
			}).over,
		).toBe(true);
		expect(s.getBudget(db, "r1", "cost-tokens")?.used).toBe(3);
		s.setBudgetLimit(db, { runId: "r1", kind: "tool-calls", limit: null });
		expect(s.authorize(db, request, policy).reason).toBe("budget");
		expect(db.query("SELECT count(*) AS n FROM kills").get()).toEqual({ n: 0 });
		expect(
			db
				.query("SELECT sum(amount) AS n FROM usage WHERE kind='cost-tokens'")
				.get(),
		).toEqual({ n: 3 });
	} finally {
		db.close();
	}
});
