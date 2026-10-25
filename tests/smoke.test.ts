import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { checkFramework, parseFrameworkRef } from "../src/framework.ts";
import {
	acquireWorkspaceLease,
	appendAudit,
	getLastTransition,
	initSchema,
	openDb,
	recordTransitionForMigration,
	releaseWorkspaceLease,
} from "../src/store.ts";

describe("framework pin", () => {
	test("fails closed on mismatch, passes on exact pin", () => {
		const text = "I2P_COMMIT=abc\nI2P_VERSION=1.0.0\n";
		const ref = parseFrameworkRef(text);
		expect(checkFramework({ commit: "other", version: "1.0.0" }, ref).ok).toBe(
			false,
		);
		expect(checkFramework(ref, ref).ok).toBe(true);
		expect(checkFramework({ commit: "", version: "" }, ref).ok).toBe(false);
	});
});

describe("leases", () => {
	test("contender cannot acquire while valid; successor can after expiry with higher epoch", () => {
		const db = openDb();
		try {
			initSchema(db);
			const first = acquireWorkspaceLease(db, {
				runId: "r1",
				workspace: "ws",
				owner: "a",
				ttlMs: 1000,
				nowMs: 1_000,
			});
			expect(first.ok).toBe(true);
			const epochA = first.ok ? first.epoch : -1;

			const blocked = acquireWorkspaceLease(db, {
				runId: "r1",
				workspace: "ws",
				owner: "b",
				ttlMs: 1000,
				nowMs: 1_500,
			});
			expect(blocked.ok).toBe(false);

			const next = acquireWorkspaceLease(db, {
				runId: "r1",
				workspace: "ws",
				owner: "b",
				ttlMs: 1000,
				nowMs: 2_001,
			});
			expect(next.ok).toBe(true);
			if (next.ok) expect(next.epoch).toBeGreaterThan(epochA);

			// Stale owner/epoch cannot release the successor's lease.
			expect(
				releaseWorkspaceLease(db, {
					workspace: "ws",
					owner: "a",
					epoch: epochA,
				}),
			).toBe(false);
		} finally {
			db.close();
		}
	});
});

describe("ledger recovery + audit", () => {
	test("last committed transition survives reopen; partial audit never reads as success", async () => {
		mkdirSync("/tmp/opencode", { recursive: true });
		const path = `/tmp/opencode/loom-test-${Date.now()}.sqlite`;
		const db = openDb(path);
		initSchema(db);
		recordTransitionForMigration(db, {
			runId: "r1",
			phase: "slice",
			status: "running",
			resumePoint: "slice-2",
		});
		const committed = recordTransitionForMigration(db, {
			runId: "r1",
			phase: "slice",
			status: "committed",
			resumePoint: "slice-3",
		});
		appendAudit(db, {
			runId: "r1",
			action: "deploy",
			decision: "allowed",
			outcome: "interrupted",
		});
		db.close();

		const db2 = openDb(path);
		try {
			const last = getLastTransition(db2, "r1");
			expect(last?.resumePoint).toBe("slice-3");
			expect(last?.status).toBe("committed");
			expect(committed.id).toBeGreaterThan(0);
			const audits = db2
				.query<{ outcome: string }, []>("SELECT outcome FROM audit")
				.all();
			expect(audits.map((a) => a.outcome)).toEqual(["interrupted"]);
		} finally {
			db2.close();
		}
		await Bun.$`rm -f ${path} ${path}-wal ${path}-shm ${path}-journal`.quiet();
	});
});
