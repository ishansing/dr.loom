import type { Database } from "bun:sqlite";
import {
	getBudget,
	type RelayPolicy,
	setBudgetLimit,
} from "../../src/index.ts";

export function relayPolicy(db: Database): RelayPolicy {
	if (!getBudget(db, "r1", "tool-calls"))
		setBudgetLimit(db, { runId: "r1", kind: "tool-calls", limit: null });
	return {
		defaultEffect: "deny",
		rules: [
			{
				scope: "global",
				tool: "fixture:*",
				pattern: "fixture:*",
				effect: "allow",
			},
		],
		deadlineMs: Date.now() + 60000,
		authority: { kind: "root" },
	};
}
