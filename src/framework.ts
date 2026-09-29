export interface FrameworkRevision {
	commit: string;
	version: string;
}

export const EXPECTED_FRAMEWORK: FrameworkRevision = {
	commit: "1d6658833713fd8de4852b2c85d8be65db98796f",
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
