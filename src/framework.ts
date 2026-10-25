import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export interface FrameworkRevision {
	commit: string;
	version: string;
}

export const EXPECTED_FRAMEWORK: FrameworkRevision = {
	commit: "4fe0869ae41b0d81cbe3c6bc643f10ff2049ceed",
	version: "2.1.0",
};

export function parseFrameworkRef(text: string): FrameworkRevision {
	const out: Record<string, string> = {};
	for (const line of text.split("\n")) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		const eq = t.indexOf("=");
		if (eq < 0) continue;
		out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
	}
	return {
		commit: out.I2P_COMMIT ?? "",
		version: out.I2P_VERSION ?? "",
	};
}

export function checkFramework(
	actual: FrameworkRevision,
	expected: FrameworkRevision = EXPECTED_FRAMEWORK,
): { ok: true } | { ok: false; reason: string } {
	if (!actual.commit || !actual.version) {
		return { ok: false, reason: "missing framework commit/version" };
	}
	if (actual.commit !== expected.commit) {
		return {
			ok: false,
			reason: `framework commit mismatch: got ${actual.commit}, want ${expected.commit}`,
		};
	}
	if (actual.version !== expected.version) {
		return {
			ok: false,
			reason: `framework version mismatch: got ${actual.version}, want ${expected.version}`,
		};
	}
	return { ok: true };
}

export interface FrameworkInstallation extends FrameworkRevision {
	lockSha256: string;
	skills: Array<{ id: string; contentSha256: string }>;
}

function directoryFiles(root: string, skipGit = false): string[] {
	const files: string[] = [];
	function walk(dir: string): void {
		if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink())
			throw new Error("Unsupported skill directory");
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (skipGit && dir === root && entry.name === ".git") continue;
			const path = join(dir, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.isFile()) files.push(path);
			else throw new Error("Unsupported skill entry");
		}
	}
	walk(root);
	return files;
}

function skillDirectoryHash(root: string): string {
	const files = directoryFiles(root);
	files.sort((a, b) => relative(root, a).localeCompare(relative(root, b)));
	const hash = createHash("sha256");
	for (const file of files)
		hash
			.update(relative(root, file))
			.update("\0")
			.update(readFileSync(file))
			.update("\0");
	return hash.digest("hex");
}

function readGit(root: string, ...args: string[]): string {
	const child = Bun.spawnSync(
		["git", "--no-optional-locks", "-C", root, ...args],
		{
			env: {
				PATH: process.env.PATH ?? "/usr/bin:/bin",
				GIT_CONFIG_NOSYSTEM: "1",
				GIT_CONFIG_GLOBAL: "/dev/null",
				GIT_NO_REPLACE_OBJECTS: "1",
			},
			stdout: "pipe",
			stderr: "pipe",
			timeout: 10000,
		},
	);
	if (child.exitCode !== 0) throw new Error("Framework Git unavailable");
	return child.stdout.toString();
}

function verifiedFrameworkLock(root: string, commit: string): Buffer | null {
	if (resolve(readGit(root, "rev-parse", "--show-toplevel").trim()) !== root)
		return null;
	const expected = new Map<string, { mode: string; hash: string }>();
	for (const record of readGit(root, "ls-tree", "-rz", "--full-tree", commit)
		.split("\0")
		.filter(Boolean)) {
		const match = record.match(/^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/);
		if (!match?.[1] || !match[2] || !match[3]) return null;
		expected.set(match[3], { mode: match[1], hash: match[2] });
	}
	const files = directoryFiles(root, true);
	if (files.length !== expected.size) return null;
	let lock: Buffer | null = null;
	for (const file of files) {
		const name = relative(root, file);
		const entry = expected.get(name);
		if (
			!entry ||
			(lstatSync(file).mode & 0o111 ? "100755" : "100644") !== entry.mode
		)
			return null;
		const bytes = readFileSync(file);
		// Git blob hashes bind bytes without executing repository filters or upstream scripts.
		const hash = createHash("sha1")
			.update(`blob ${bytes.length}\0`)
			.update(bytes)
			.digest("hex");
		if (hash !== entry.hash) return null;
		if (name === "skills.lock.json") lock = bytes;
	}
	return lock;
}

export function checkFrameworkInstallation(args: {
	referencePath: string;
	frameworkRoot?: string;
	skillsRoot: string;
}): ({ ok: true } & FrameworkInstallation) | { ok: false; reason: string } {
	try {
		const text = readFileSync(args.referencePath, "utf8");
		const keys = new Set<string>();
		for (const line of text.split("\n")) {
			const value = line.trim();
			if (!value || value.startsWith("#")) continue;
			const match = value.match(/^(I2P_COMMIT|I2P_VERSION|I2P_PATH)=(.+)$/);
			if (!match?.[1] || keys.has(match[1]))
				return {
					ok: false,
					reason: "invalid framework reference: duplicate or unknown field",
				};
			keys.add(match[1]);
		}
		const expected = parseFrameworkRef(text);
		if (
			!/^[0-9a-f]{40}$/.test(expected.commit) ||
			!/^\d+\.\d+\.\d+$/.test(expected.version)
		)
			return { ok: false, reason: "invalid framework pin" };
		const configured = text.match(/^I2P_PATH=(.+)$/m)?.[1]?.trim();
		if (!args.frameworkRoot && !configured)
			return { ok: false, reason: "missing framework root" };
		const root = args.frameworkRoot
			? resolve(args.frameworkRoot)
			: resolve(dirname(args.referencePath), configured ?? "");
		const actual = {
			commit: readGit(root, "rev-parse", "HEAD").trim(),
			version: readFileSync(resolve(root, "VERSION"), "utf8").trim(),
		};
		if (
			!/^\d+\.\d+\.\d+$/.test(actual.version) ||
			!/^[0-9a-f]{40}$/.test(actual.commit)
		)
			return {
				ok: false,
				reason: "invalid installed framework revision/version",
			};
		const checked = checkFramework(actual, expected);
		if (!checked.ok) return checked;
		if (!args.skillsRoot)
			return { ok: false, reason: "explicit --skills-root is required" };
		const bytes = verifiedFrameworkLock(root, actual.commit);
		if (!bytes)
			return {
				ok: false,
				reason:
					"framework content drift or unsupported tree; use the selected clean checkout",
			};
		const lock: unknown = JSON.parse(bytes.toString());
		if (
			!lock ||
			typeof lock !== "object" ||
			!("version" in lock) ||
			lock.version !== 1 ||
			!("framework" in lock) ||
			lock.framework !== "idea-to-production@2" ||
			!("contentHashMethod" in lock) ||
			lock.contentHashMethod !==
				"sha256 over sorted (relative path + NUL + file bytes + NUL) for every file in the skill directory" ||
			!("skills" in lock) ||
			!Array.isArray(lock.skills) ||
			!lock.skills.length
		)
			return { ok: false, reason: "invalid framework skill lock" };
		const skills: FrameworkInstallation["skills"] = [];
		const ids = new Set<string>();
		for (const skill of lock.skills) {
			if (
				!skill ||
				typeof skill.id !== "string" ||
				!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/.test(skill.id) ||
				typeof skill.contentSha256 !== "string" ||
				!/^[0-9a-f]{64}$/.test(skill.contentSha256) ||
				ids.has(skill.id)
			)
				return { ok: false, reason: "invalid framework skill lock entry" };
			ids.add(skill.id);
			const contentSha256 = skillDirectoryHash(join(args.skillsRoot, skill.id));
			if (contentSha256 !== skill.contentSha256)
				return { ok: false, reason: `skill content mismatch: ${skill.id}` };
			skills.push({ id: skill.id, contentSha256 });
		}
		return {
			ok: true,
			...actual,
			lockSha256: createHash("sha256").update(bytes).digest("hex"),
			skills,
		};
	} catch {
		return {
			ok: false,
			reason:
				"framework input unavailable; provide matching checkout and explicit skills root",
		};
	}
}
