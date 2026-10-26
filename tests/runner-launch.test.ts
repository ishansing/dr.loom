import { expect, test } from "bun:test";
import * as s from "../src/index.ts";
import {
	assertDomainContainer,
	assertDomainOwner,
	buildDomainCreate,
	runSyntheticDomain,
} from "../src/runner-launch.ts";

function domainFixture() {
	const db = s.openDb();
	s.initSchema(db);
	const ctx = {
		runId: "launch-fixture",
		threadId: "main",
		workspace: "/fixture/project",
		owner: "supervisor",
		epoch: 1,
		nowMs: 1000,
	};
	s.acquireWorkspaceLease(db, {
		...{ runId: ctx.runId, workspace: ctx.workspace, owner: ctx.owner },
		ttlMs: 60000,
		nowMs: 1000,
	});
	s.initRun(
		db,
		{
			runId: ctx.runId,
			runbook: "fixture",
			goal: "Synthetic launch payload",
			scale: "small",
			frameworkCommit: "a".repeat(40),
			frameworkVersion: "2.1.0",
			frameworkLockSha256: "b".repeat(64),
		},
		ctx,
	);
	s.setBudgetLimit(db, { runId: ctx.runId, kind: "tool-calls", limit: 10 });
	try {
		const domain = s.admitDomain(
			db,
			ctx,
			{
				domainId: "00000000-0000-4000-8000-000000000071",
				endpoint: "unix:///fixture/docker.sock",
				config: {
					inputRoot: "/fixture/input",
					workspaceRoot: "/fixture/work",
					workerSha256: "a".repeat(64),
				},
				deadlineMs: 10000,
				authority: { kind: "root" },
			},
			{
				defaultEffect: "deny",
				rules: [
					{
						scope: "global",
						tool: "runner.launch",
						pattern: "*",
						effect: "allow",
					},
				],
			},
		).domain;
		if (!domain) throw new Error("Fixture admission failed");
		return domain;
	} finally {
		db.close();
	}
}
const imageId = `sha256:${"c".repeat(64)}`;
const containerId = "d".repeat(64);

test("fixed Docker payload has only approved identity, mounts and isolation/resource controls", () => {
	const domain = domainFixture();
	expect(buildDomainCreate(domain)).toMatchObject({
		Image: s.OFFLINE_DOMAIN_PROFILE.image,
		User: "65532:65532",
		WorkingDir: "/workspace",
		Tty: false,
		OpenStdin: true,
		Entrypoint: ["/usr/local/bin/bun"],
		Cmd: ["--no-env-file", "/input/worker.ts"],
		Labels: {
			"loom.domain": domain.domainId,
			"loom.run": domain.runId,
			"loom.config": domain.configHash,
		},
		HostConfig: {
			Runtime: "runc",
			ReadonlyRootfs: true,
			Privileged: false,
			NetworkMode: "none",
			CapDrop: ["ALL"],
			SecurityOpt: ["no-new-privileges:true"],
			NanoCpus: 2000000000,
			Memory: 4294967296,
			MemorySwap: 4294967296,
			PidsLimit: 256,
			IpcMode: "private",
			CgroupnsMode: "private",
			PidMode: "",
			UsernsMode: "",
			AutoRemove: false,
			RestartPolicy: { Name: "no", MaximumRetryCount: 0 },
			LogConfig: { Type: "none", Config: {} },
			ShmSize: 67108864,
			Tmpfs: { "/tmp": "rw,nosuid,nodev,noexec,size=67108864,mode=1777" },
			Mounts: [
				{
					Type: "bind",
					Source: domain.config.inputRoot,
					Target: "/input",
					ReadOnly: true,
					BindOptions: {
						Propagation: "rprivate",
						NonRecursive: true,
						CreateMountpoint: false,
					},
				},
				{
					Type: "bind",
					Source: domain.config.workspaceRoot,
					Target: "/workspace",
					ReadOnly: false,
					BindOptions: {
						Propagation: "rprivate",
						NonRecursive: true,
						CreateMountpoint: false,
					},
				},
			],
		},
	});
});

function inspected(domain: s.DomainRecord) {
	const body = buildDomainCreate(domain);
	return {
		Id: containerId,
		Name: `/loom-${domain.domainId}`,
		Image: imageId,
		Config: body,
		HostConfig: body.HostConfig,
		Mounts: [
			{
				Type: "bind",
				Source: domain.config.inputRoot,
				Destination: "/input",
				RW: false,
			},
			{
				Type: "bind",
				Source: domain.config.workspaceRoot,
				Destination: "/workspace",
				RW: true,
			},
		],
		State: {
			Running: false,
			Restarting: false,
			Pid: 0,
			ExitCode: 0,
			Status: "created",
		},
	};
}

test("exact inspect identity/config passes, independently of owned stop permission", () => {
	const domain = domainFixture();
	const actual = inspected(domain);
	expect(() =>
		assertDomainOwner(actual, domain, containerId, imageId),
	).not.toThrow();
	expect(() =>
		assertDomainContainer(actual, domain, containerId, imageId),
	).not.toThrow();
	actual.HostConfig.Privileged = true;
	expect(() =>
		assertDomainOwner(actual, domain, containerId, imageId),
	).not.toThrow();
	expect(() =>
		assertDomainContainer(actual, domain, containerId, imageId),
	).toThrow("runner-launch:config");
});

test("foreign container identity never grants cleanup permission", () => {
	const domain = domainFixture();
	for (const field of ["Id", "Name", "Image", "labels"] as const) {
		const actual = inspected(domain);
		if (field === "labels") actual.Config.Labels["loom.config"] = "foreign";
		else actual[field] = "foreign";
		expect(() =>
			assertDomainOwner(actual, domain, containerId, imageId),
		).toThrow("runner-launch:ownership");
	}
	for (const value of [null, [], {}, { Id: containerId }])
		expect(() =>
			assertDomainOwner(value, domain, containerId, imageId),
		).toThrow("runner-launch:ownership");
});

test("security, environment and mount drift block start despite a matching owner", () => {
	const domain = domainFixture();
	for (const [field, value] of Object.entries({
		ReadonlyRootfs: false,
		Runtime: "foreign",
		NetworkMode: "bridge",
		NanoCpus: 0,
		Memory: 0,
		MemorySwap: -1,
		PidsLimit: -1,
		IpcMode: "host",
		CgroupnsMode: "host",
		PidMode: "host",
		UsernsMode: "host",
		ShmSize: 0,
		AutoRemove: true,
		CapAdd: ["SYS_ADMIN"],
		CapDrop: [],
		SecurityOpt: [],
		Binds: ["/host:/private"],
		Devices: [{}],
		DeviceRequests: [{}],
		VolumesFrom: ["foreign"],
		PortBindings: { "80/tcp": [{}] },
		PublishAllPorts: true,
		RestartPolicy: { Name: "always" },
		LogConfig: { Type: "json-file" },
		Tmpfs: { "/tmp": "size=1g" },
	})) {
		const actual = inspected(domain);
		Reflect.set(actual.HostConfig, field, value);
		expect(() =>
			assertDomainContainer(actual, domain, containerId, imageId),
		).toThrow("runner-launch:config");
	}
	for (const [field, value] of Object.entries({
		User: "0",
		Image: "unbound:latest",
		Tty: true,
		OpenStdin: false,
		Entrypoint: ["/bin/sh"],
		Cmd: ["-c", "private-sentinel"],
		WorkingDir: "/",
		Env: ["TOKEN=PRIVATE-SENTINEL"],
	})) {
		const actual = inspected(domain);
		Reflect.set(actual.Config, field, value);
		expect(() =>
			assertDomainContainer(actual, domain, containerId, imageId),
		).toThrow("runner-launch:config");
	}
	for (const change of ["source", "write", "extra"] as const) {
		const actual = inspected(domain);
		if (change === "source") actual.Mounts[0]!.Source = "/private-sentinel";
		if (change === "write") actual.Mounts[0]!.RW = true;
		if (change === "extra")
			actual.Mounts.push({
				Type: "bind",
				Source: "/host",
				Destination: "/secret",
				RW: true,
			});
		expect(() =>
			assertDomainContainer(actual, domain, containerId, imageId),
		).toThrow("runner-launch:config");
	}
	for (const [field, value] of Object.entries({
		Propagation: "shared",
		NonRecursive: false,
		CreateMountpoint: true,
	})) {
		const actual = inspected(domain);
		Reflect.set(actual.HostConfig.Mounts[0]!.BindOptions, field, value);
		expect(() =>
			assertDomainContainer(actual, domain, containerId, imageId),
		).toThrow("runner-launch:config");
	}
});

test("executable profile rejects delegated authority and uncloneable caller input before backend access", async () => {
	const domain = domainFixture();
	const db = s.openDb();
	s.initSchema(db);
	try {
		const ctx = {
			runId: domain.runId,
			threadId: domain.threadId,
			workspace: domain.workspace,
			owner: domain.owner,
			epoch: domain.epoch,
		};
		const input = {
			domainId: domain.domainId,
			endpoint: domain.endpoint,
			config: domain.config,
			deadlineMs: domain.deadlineMs,
			authority: { kind: "grant", grantId: "foreign" },
		};
		await expect(
			Reflect.apply(runSyntheticDomain, null, [
				db,
				ctx,
				input,
				{ workspaceMount: "/fixture", workspaceImage: "/fixture/image" },
				{ defaultEffect: "deny", rules: [] },
			]),
		).rejects.toThrow("runner-launch:authority");
		await expect(
			Reflect.apply(runSyntheticDomain, null, [
				db,
				ctx,
				{ ...input, authority: { kind: "root" } },
				{ workspaceMount: "/fixture", workspaceImage: "/fixture/image" },
				{
					callback: () => {
						throw new Error("PRIVATE-SENTINEL");
					},
				},
			]),
		).rejects.toThrow("runner-launch:input");
		expect(s.listDomains(db)).toEqual([]);
	} finally {
		db.close();
	}
});
