import { OFFLINE_DOMAIN_PROFILE } from "./store.ts";

export type RunnerFrame =
	| { version: 1; type: "ready"; seq: 1 }
	| {
			version: 1;
			type: "candidate-proposed";
			seq: 2;
			path: "candidate.txt";
			sha256: string;
	  };

/** Private non-TTY Docker output; validated proposals are not verified completion. */
export class RunnerOutput {
	private readonly header = Buffer.alloc(8);
	private readonly line = Buffer.alloc(OFFLINE_DOMAIN_PROFILE.maxFrameBytes);
	private headerUsed = 0;
	private lineUsed = 0;
	private remaining = 0;
	private budget: number = OFFLINE_DOMAIN_PROFILE.maxOutputBytes;
	private sequence = 0;
	private poisoned = false;
	private closed = false;

	private fail(): never {
		this.poisoned = true;
		this.header.fill(0);
		this.line.fill(0);
		throw new Error("runner-output:invalid");
	}

	private frame(): RunnerFrame {
		const value: unknown = JSON.parse(
			new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
				this.line.subarray(0, this.lineUsed - 1),
			),
		);
		if (!value || typeof value !== "object" || Array.isArray(value))
			return this.fail();
		const v = value as Record<string, unknown>;
		if (v.version !== 1 || v.seq !== this.sequence + 1) return this.fail();
		const keys = Object.keys(v);
		if (
			this.sequence === 0 &&
			v.type === "ready" &&
			keys.length === 3 &&
			keys.every((key) => ["version", "type", "seq"].includes(key))
		) {
			this.sequence = 1;
			return { version: 1, type: "ready", seq: 1 };
		}
		if (
			this.sequence === 1 &&
			v.type === "candidate-proposed" &&
			v.path === "candidate.txt" &&
			typeof v.sha256 === "string" &&
			/^[a-f0-9]{64}$/.test(v.sha256) &&
			keys.length === 5 &&
			keys.every((key) =>
				["version", "type", "seq", "path", "sha256"].includes(key),
			)
		) {
			this.sequence = 2;
			return {
				version: 1,
				type: "candidate-proposed",
				seq: 2,
				path: "candidate.txt",
				sha256: v.sha256,
			};
		}
		return this.fail();
	}

	push(chunk: Uint8Array): RunnerFrame[] {
		try {
			if (this.poisoned || this.closed || !(chunk instanceof Uint8Array))
				return this.fail();
			const frames: RunnerFrame[] = [];
			let offset = 0;
			while (offset < chunk.length) {
				if (this.sequence === 2) return this.fail();
				if (!this.remaining) {
					const size = Math.min(8 - this.headerUsed, chunk.length - offset);
					this.header.set(
						chunk.subarray(offset, offset + size),
						this.headerUsed,
					);
					this.headerUsed += size;
					offset += size;
					if (this.headerUsed < 8) continue;
					const length = this.header.readUInt32BE(4);
					if (
						this.header[0] !== 1 ||
						this.header[1] ||
						this.header[2] ||
						this.header[3] ||
						!length ||
						length > this.budget
					)
						return this.fail();
					this.headerUsed = 0;
					this.remaining = length;
					this.budget -= length;
					continue;
				}
				this.line[this.lineUsed++] = chunk[offset++]!;
				this.remaining--;
				if (this.line[this.lineUsed - 1] === 10) {
					frames.push(this.frame());
					this.lineUsed = 0;
				} else if (this.lineUsed === this.line.length) return this.fail();
			}
			return frames;
		} catch {
			return this.fail();
		}
	}

	finish(): void {
		if (
			this.poisoned ||
			this.closed ||
			this.sequence !== 2 ||
			this.headerUsed ||
			this.remaining ||
			this.lineUsed
		)
			this.fail();
		this.closed = true;
	}
}

export function encodeRunnerCommand(type: "start" | "stop"): Uint8Array {
	if (type !== "start" && type !== "stop")
		throw new Error("runner-command:invalid");
	return new TextEncoder().encode(JSON.stringify({ version: 1, type }) + "\n");
}
