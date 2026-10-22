"""Research-only, trusted synthetic fixtures; not a production sandbox backend."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import tempfile
import time


if not __debug__:
    raise SystemExit("Run without Python optimization; fixture assertions are mandatory")


FIXED = "export const sum = (a: number, b: number) => a + b;\n"
BROKEN = FIXED.replace("a + b", "a - b")
TEST = '''import { expect, test } from "bun:test";
import { sum } from "/workspace/sum.ts";
test("fixture sum", () => expect(sum(2, 3)).toBe(5));
'''


def command(workspace, executable, args, experiment=None, verification=None):
    binary = Path(shutil.which(executable)).resolve()
    cmd = ["bwrap", "--unshare-all", "--die-with-parent", "--new-session",
           "--cap-drop", "ALL", "--ro-bind", "/usr", "/usr",
           "--symlink", "usr/bin", "/bin", "--symlink", "usr/lib", "/lib",
           "--symlink", "usr/lib64", "/lib64", "--proc", "/proc", "--dev", "/dev",
           "--tmpfs", "/tmp", "--dir", "/runtime",
           "--ro-bind", str(binary), f"/runtime/{executable}",
           "--bind", str(workspace), "/workspace", "--chdir", "/workspace",
           "--clearenv", "--setenv", "PATH", "/runtime:/usr/bin",
           "--setenv", "HOME", "/tmp", "--setenv", "PI_OFFLINE", "1"]
    if experiment:
        source = Path(__file__).resolve().with_name("p0-runtime-comparison.mjs")
        cmd += ["--dir", "/experiment", "--ro-bind", str(experiment / "node_modules"),
                "/experiment/node_modules", "--ro-bind", str(source),
                "/experiment/p0-runtime-comparison.mjs"]
    if verification:
        cmd += ["--ro-bind", str(verification), "/verification"]
    return cmd + [f"/runtime/{executable}", *args]


def run(cmd, **kwargs):
    return subprocess.run(cmd, env={"PATH": "/usr/bin:/bin",
                                   "LOOM_SYNTHETIC_SECRET": "synthetic-env-sentinel"}, close_fds=True,
                          capture_output=True, timeout=30, **kwargs)


def self_test():
    with tempfile.TemporaryDirectory(prefix="loom-p0-boundary-", dir="/tmp/opencode") as tmp:
        root = Path(tmp)
        workspace = root / "workspace"
        workspace.mkdir()
        protected = root / "protected"
        protected.write_text("synthetic-protected-sentinel")
        (workspace / "escape").symlink_to(protected)
        js = '''const fs = require('node:fs');
const assert = require('node:assert/strict');
assert.equal(process.env.LOOM_SYNTHETIC_SECRET, undefined);
for (const p of [process.argv[1], '/workspace/escape', '/home', '/run/docker.sock'])
  assert.throws(() => fs.readFileSync(p));
assert.throws(() => fs.writeFileSync('/usr/loom-p0-write', 'no'));
assert.throws(() => fs.writeFileSync('/runtime/node', 'no'));
fs.writeFileSync('/workspace/allowed', 'yes');
assert.equal(fs.existsSync('/sys/class/net'), false);
'''
        p = run(command(workspace, "node", ["-e", js, str(protected)]))
        assert p.returncode == 0, "synthetic filesystem/environment boundary failed"
        assert (workspace / "allowed").read_text() == "yes"
        assert protected.read_text() == "synthetic-protected-sentinel"
        # A listener on the host loopback must be unreachable in the new net namespace.
        import socket
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            js = """const net = require('node:net');
const s = net.connect({host:'127.0.0.1', port:Number(process.argv[1])});
s.on('connect', () => process.exit(1));
s.on('error', () => process.exit(0));
setTimeout(() => process.exit(2), 2000);"""
            assert run(command(workspace, "node", ["-e", js, str(port)])).returncode == 0
        # Test domain teardown, not just cooperative parent exit: a detached writer
        # remains alive until its namespace init is killed from outside.
        js = """const {spawn} = require('node:child_process');
spawn(process.execPath, ['-e', `setInterval(() => require('node:fs').appendFileSync('/workspace/ticks','x'), 10)`],
 {detached:true,stdio:'ignore'}).unref();
setInterval(() => {}, 1000);"""
        p = subprocess.Popen(command(workspace, "node", ["-e", js]),
                             env={"PATH": "/usr/bin:/bin"}, close_fds=True,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            deadline = time.monotonic() + 5
            while not (workspace / "ticks").exists() and time.monotonic() < deadline:
                time.sleep(0.02)
            assert (workspace / "ticks").exists(), "writer never started"
        finally:
            p.kill()
            p.wait(timeout=5)
        time.sleep(0.1)
        before = (workspace / "ticks").stat().st_size
        time.sleep(0.2)
        assert (workspace / "ticks").stat().st_size == before, "descendant still writing"
    print("PASS: synthetic mount/env/loopback boundary and detached-writer teardown")


def compare(experiment, engine, runtime):
    assert (experiment / "node_modules").is_dir(), "external pinned dependencies required"
    root = Path(tempfile.mkdtemp(prefix=f"loom-p0-{engine}-{runtime}-", dir="/tmp/opencode"))
    workspace = root / "workspace"
    verification = root / "verification"
    workspace.mkdir()
    verification.mkdir()
    (workspace / "sum.ts").write_text(BROKEN)
    (verification / "sum.test.ts").write_text(TEST)
    verify = command(workspace, "bun", ["test", "/verification/sum.test.ts"], verification=verification)
    red = run(verify)
    assert red.returncode == 1 and b"fixture sum" in red.stderr, "expected deterministic red test"
    target = root / "protected-effect.json"
    allowed = False
    effects = 0
    requests = []
    report = None
    p = subprocess.Popen(command(workspace, engine, ["/experiment/p0-runtime-comparison.mjs", runtime],
                                 experiment=experiment), env={"PATH": "/usr/bin:/bin"},
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                         close_fds=True)
    selector = selectors.DefaultSelector()
    selector.register(p.stdout, selectors.EVENT_READ, "stdout")
    selector.register(p.stderr, selectors.EVENT_READ, "stderr")
    buffer = b""
    errors = b""
    deadline = time.monotonic() + 60
    try:
        while selector.get_map():
            assert time.monotonic() < deadline, "runtime timed out"
            for key, _ in selector.select(timeout=0.2):
                chunk = os.read(key.fileobj.fileno(), 4096)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                if key.data == "stderr":
                    errors += chunk
                    assert len(errors) <= 65536, "stderr limit exceeded"
                    continue
                buffer += chunk
                assert len(buffer) <= 65536, "protocol limit exceeded"
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    message = json.loads(line)
                    assert isinstance(message, dict)
                    if message.get("type") == "report":
                        assert report is None and set(message) == {"type", "reopened", "results"}
                        report = message
                        continue
                    assert report is None and set(message) == {"type", "op"}
                    assert message["type"] == "request"
                    op = message["op"]
                    expected = ["effect", "effect", "effect", "output"]
                    assert len(requests) < len(expected) and op == expected[len(requests)]
                    requests.append(op)
                    if op == "effect":
                        if not allowed:
                            assert not target.exists()
                            result = "denied"
                            allowed = True  # Scripted human grant, not model authority.
                        elif effects:
                            result = "deduplicated"
                        else:
                            target.write_text(json.dumps({"fixture-action": 7}))
                            effects += 1
                            result = "applied"
                    else:
                        # Inject a throwing filter before anything is sent to the runner.
                        try:
                            raise ValueError("synthetic-output-sentinel")
                        except ValueError:
                            result = "safe-output-error"
                    p.stdin.write((json.dumps({"result": result}) + "\n").encode())
                    p.stdin.flush()
        assert p.wait(timeout=5) == 0, "runtime failed (raw stderr withheld)"
        assert not buffer and len(requests) == 4
        assert report == {"type": "report", "reopened": True,
                          "results": ["denied", "applied", "deduplicated", "safe-output-error"]}
        assert effects == 1 and json.loads(target.read_text()) == {"fixture-action": 7}
        assert (workspace / "sum.ts").read_text() == FIXED
        candidate = hashlib.sha256((workspace / "sum.ts").read_bytes()).hexdigest()
        green = run(verify)
        assert green.returncode == 0, "trusted verification failed"
        assert hashlib.sha256((workspace / "sum.ts").read_bytes()).hexdigest() == candidate
        # A stale verification cannot certify a changed candidate, even when model work ended.
        (workspace / "sum.ts").write_text(BROKEN)
        assert hashlib.sha256((workspace / "sum.ts").read_bytes()).hexdigest() != candidate
        for path in workspace.rglob("*"):
            if path.is_file():
                assert b"synthetic-output-sentinel" not in path.read_bytes()
        assert b"synthetic-output-sentinel" not in errors
        print(json.dumps({"engine": engine, "runtime": runtime, "result": "PASS",
                          "test": "red-to-green; stale hash rejected", "effects": effects,
                          "candidate_sha256": candidate, "reopen": "clean only"}))
    finally:
        selector.close()
        if p.poll() is None:
            p.kill()
            p.wait(timeout=5)
        for stream in [p.stdin, p.stdout, p.stderr]:
            stream.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--experiment", type=Path)
    parser.add_argument("--engine", choices=["node", "bun"], default="node")
    parser.add_argument("--runtime", choices=["sdk", "durable"], default="sdk")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        assert args.experiment, "--experiment required"
        self_test()  # Boundary failure blocks runtime launch; no host fallback.
        compare(args.experiment.resolve(), args.engine, args.runtime)
