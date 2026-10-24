import { isAbsolute, relative, resolve, sep } from "node:path";

export type PolicyEffect = "allow" | "ask" | "deny";
export type PolicyScope = "global" | "run" | "thread";
export type PolicyTier = "standard" | "high-risk" | "critical";
export type TargetType = "path" | "command" | "domain" | "opaque";
export type ActionClass = "read" | "mutation" | "irreversible";

export interface PolicyRule {
	scope: PolicyScope;
	scopeId?: string;
	tool: string;
	pattern: string;
	effect: PolicyEffect;
}

export interface PolicyConfig {
	rules: readonly PolicyRule[];
	defaultEffect: "ask" | "deny";
}

export interface PolicyRequest {
	runId: string;
	threadId: string;
	tool: string;
	target: string;
	targetType: TargetType;
}

export interface PolicyResult {
	effect: PolicyEffect;
	reason: "rule" | "default";
	rule?: PolicyRule;
}

export interface RiskInput {
	tier: PolicyTier;
	targetCount: number;
	outsideWorkspace: boolean;
	secretAdjacent: boolean;
	production: boolean;
	dataEgress: boolean;
	novel: boolean;
	priorDeny: boolean;
	irreversible: boolean;
}

export interface RiskResult {
	score: number;
	breakdown: Record<string, number>;
}

export interface ResolvedPath {
	target: string;
	outside: boolean;
	secretAdjacent: boolean;
}

export const RISK_ESCALATE_AT = 40;
export const RISK_BLOCK_AT = 75;

export const DEFAULT_POLICY: PolicyConfig = {
	defaultEffect: "ask",
	rules: [
		{ scope: "global", tool: "read", pattern: "*", effect: "allow" },
		{ scope: "global", tool: "list", pattern: "*", effect: "allow" },
		{ scope: "global", tool: "stat", pattern: "*", effect: "allow" },
		{ scope: "global", tool: "search", pattern: "*", effect: "allow" },
		{ scope: "global", tool: "grep", pattern: "*", effect: "allow" },
		{ scope: "global", tool: "glob", pattern: "*", effect: "allow" },
		{ scope: "global", tool: "edit", pattern: "*", effect: "ask" },
		{ scope: "global", tool: "write", pattern: "*", effect: "ask" },
		{ scope: "global", tool: "delete", pattern: "*", effect: "ask" },
		{ scope: "global", tool: "bash", pattern: "*", effect: "ask" },
		{ scope: "global", tool: "apply_patch", pattern: "*", effect: "ask" },
		{ scope: "global", tool: "webfetch", pattern: "*", effect: "ask" },
		{ scope: "global", tool: "fetch", pattern: "*", effect: "ask" },
	],
};

const shellMeta = /[;&|<>$`\n\r]/;
const secretPath =
	/(^|\/)(\.env[^/]*|\.ssh|\.git)(\/|$)|\.(env|pem|key|p12|pfx)$|\.(sqlite|sqlite3|db)(-(wal|shm|journal))?$|(^|\/)id_(rsa|dsa|ed25519|ecdsa)(\.|$)/i;

function checkedText(value: unknown, name: string, max = 4096): string {
	if (typeof value !== "string" || value.length === 0 || value.length > max)
		throw new Error(`Invalid ${name}`);
	if (
		value.includes("\0") ||
		/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
	)
		throw new Error(`Invalid ${name}`);
	return value;
}

export function matchPattern(pattern: string, value: string): boolean {
	checkedText(pattern, "policy pattern");
	checkedText(value, "policy target");
	let p = 0;
	let v = 0;
	let star = -1;
	let retry = 0;
	while (v < value.length) {
		if (pattern[p] === "*") {
			star = p++;
			retry = v;
		} else if (pattern[p] === "?" || pattern[p] === value[v]) {
			p++;
			v++;
		} else if (star >= 0) {
			p = star + 1;
			v = ++retry;
		} else return false;
	}
	while (pattern[p] === "*") p++;
	return p === pattern.length;
}

function shellSafeMatch(rule: PolicyRule, request: PolicyRequest): boolean {
	if (!matchPattern(rule.tool, request.tool)) return false;
	if (!matchPattern(rule.pattern, request.target)) return false;
	if (
		request.targetType === "command" &&
		shellMeta.test(request.target) &&
		rule.effect === "allow"
	)
		return false;
	return true;
}

function scopeRank(rule: PolicyRule, request: PolicyRequest): number {
	if (rule.scope === "global") return 0;
	if (rule.scope === "run") return rule.scopeId === request.runId ? 1 : -1;
	return rule.scopeId === request.threadId ? 2 : -1;
}

export function evaluatePolicy(
	policy: PolicyConfig,
	request: PolicyRequest,
): PolicyResult {
	if (!policy || !Array.isArray(policy.rules))
		throw new Error("Invalid policy");
	if (policy.defaultEffect !== "ask" && policy.defaultEffect !== "deny")
		throw new Error("Invalid policy default");
	const matching: Array<{ rule: PolicyRule; rank: number }> = [];
	for (const rule of policy.rules) {
		if (!rule || typeof rule !== "object")
			throw new Error("Invalid policy rule");
		if (!["global", "run", "thread"].includes(rule.scope))
			throw new Error("Invalid policy scope");
		if (!["allow", "ask", "deny"].includes(rule.effect))
			throw new Error("Invalid policy effect");
		if (rule.scope !== "global") checkedText(rule.scopeId, "policy scope ID");
		checkedText(rule.tool, "policy tool", 256);
		checkedText(rule.pattern, "policy pattern");
		const rank = scopeRank(rule, request);
		if (rank >= 0 && shellSafeMatch(rule, request))
			matching.push({ rule, rank });
	}
	const denied = matching.find(({ rule }) => rule.effect === "deny");
	if (denied) return { effect: "deny", reason: "rule", rule: denied.rule };
	const rank = Math.max(-1, ...matching.map((item) => item.rank));
	if (rank < 0) return { effect: policy.defaultEffect, reason: "default" };
	const sameRank = matching.filter((item) => item.rank === rank);
	const selected = sameRank[sameRank.length - 1]?.rule;
	if (!selected) return { effect: policy.defaultEffect, reason: "default" };
	return { effect: selected.effect, reason: "rule", rule: selected };
}

export function resolvePathTarget(
	workspace: string,
	target: string,
): ResolvedPath {
	checkedText(workspace, "workspace");
	checkedText(target, "target");
	// shortcut: lexical resolution only; real adapters must qualify symlink-safe containment before use.
	const root = resolve(workspace);
	const absolute = isAbsolute(target) ? resolve(target) : resolve(root, target);
	const rel = relative(root, absolute);
	const outside = rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
	const normalized = outside
		? absolute.split(sep).join("/")
		: rel.split(sep).join("/") || ".";
	const probe = absolute.split(sep).join("/");
	return {
		target: normalized,
		outside,
		secretAdjacent: secretPath.test(probe),
	};
}

export function scoreRisk(input: RiskInput): RiskResult {
	if (
		!input ||
		!["standard", "high-risk", "critical"].includes(input.tier) ||
		!Number.isSafeInteger(input.targetCount) ||
		input.targetCount < 1
	)
		throw new Error("Invalid risk observables");
	for (const key of [
		"outsideWorkspace",
		"secretAdjacent",
		"production",
		"dataEgress",
		"novel",
		"priorDeny",
		"irreversible",
	] as const)
		if (typeof input[key] !== "boolean")
			throw new Error("Invalid risk observable");
	const tierWeight =
		input.tier === "critical" ? 40 : input.tier === "high-risk" ? 20 : 0;
	const breakdown: Record<string, number> = {};
	if (tierWeight) breakdown.tier = tierWeight;
	if (input.outsideWorkspace) breakdown.workspace = 25;
	if (input.secretAdjacent) breakdown.secrets = 30;
	if (input.production) breakdown.prod = 30;
	if (input.dataEgress) breakdown.egress = 15;
	const fanout = Math.min(
		20,
		Math.max(0, Math.trunc(input.targetCount) - 1) * 2,
	);
	if (fanout) breakdown["fan-out"] = fanout;
	if (input.novel) breakdown.novelty = 10;
	if (input.priorDeny) breakdown["prior-deny"] = 10;
	if (input.irreversible) breakdown.irreversible = 10;
	const raw = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
	const score = Math.min(100, raw);
	if (raw > 100) breakdown.cap = 100 - raw;
	return { score, breakdown };
}
