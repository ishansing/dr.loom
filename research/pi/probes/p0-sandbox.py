"""Research-only, trusted synthetic fixtures; not a production sandbox backend."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import select
import selectors
import shutil
import signal
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


def command(workspace, executable, args, experiment=None, verification=None,
            probe="p0-runtime-comparison.mjs", framework=None):
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
        assert probe in {"p0-runtime-comparison.mjs", "p0-runtime-recovery.mjs"}
        source = Path(__file__).resolve().with_name(probe)
        cmd += ["--dir", "/experiment", "--ro-bind", str(experiment / "node_modules"),
                "/experiment/node_modules", "--ro-bind", str(source),
                f"/experiment/{probe}"]
    if verification:
        cmd += ["--ro-bind", str(verification), "/verification"]
    if framework:
        cmd += ["--ro-bind", str(framework), "/framework"]
    return cmd + [f"/runtime/{executable}", *args]


def stop_domain(process, pidfd):
    if not select.select([pidfd], [], [], 0)[0]:
        try:
            signal.pidfd_send_signal(pidfd, signal.SIGKILL)
        except ProcessLookupError:
            pass  # The same pidfd became terminal between poll and signal.
    assert select.select([pidfd], [], [], 5)[0], "PID namespace still alive; reuse blocked"
    process.wait(timeout=5)


def spawn_domain(cmd, **streams):
    info_read, info_write = os.pipe()
    start_read, start_write = os.pipe()
    process = None
    pidfd = None
    try:
        cmd = [*cmd[:1], "--info-fd", str(info_write), "--block-fd", str(start_read), *cmd[1:]]
        process = subprocess.Popen(cmd, env={"PATH": "/usr/bin:/bin",
                                            "LOOM_SYNTHETIC_SECRET": "synthetic-env-sentinel"},
                                   close_fds=True, pass_fds=(info_write, start_read), **streams)
        os.close(info_write)
        info_write = None
        os.close(start_read)
        start_read = None
        raw = b""
        deadline = time.monotonic() + 5
        while True:
            remaining = deadline - time.monotonic()
            assert remaining > 0 and select.select([info_read], [], [], remaining)[0], "sandbox startup info timed out"
            chunk = os.read(info_read, 4096)
            if not chunk:
                break
            raw += chunk
            assert len(raw) <= 4096, "sandbox info limit"
        info = json.loads(raw)
        pidfd = os.pidfd_open(info["child-pid"])
        # Capture the namespace-init identity before allowing COMMAND to start.
        status = Path(f"/proc/{info['child-pid']}/status").read_text()
        assert any(line.startswith("NSpid:") and line.split()[-1] == "1"
                   for line in status.splitlines()), "expected PID namespace init"
        os.write(start_write, b"1")
        return process, pidfd
    except BaseException:
        if process is not None:
            if pidfd is not None:
                stop_domain(process, pidfd)
                os.close(pidfd)
            elif process.poll() is None:
                process.kill()
                process.wait(timeout=5)
        raise
    finally:
        for fd in [info_read, info_write, start_read, start_write]:
            if fd is not None:
                os.close(fd)


def run(cmd, **kwargs):
    process, pidfd = spawn_domain(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        stdout, stderr = process.communicate(timeout=30, **kwargs)
        return subprocess.CompletedProcess(cmd, process.returncode, stdout, stderr)
    finally:
        stop_domain(process, pidfd)
        os.close(pidfd)


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
        p, pidfd = spawn_domain(command(workspace, "node", ["-e", js]),
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            deadline = time.monotonic() + 5
            while not (workspace / "ticks").exists() and time.monotonic() < deadline:
                time.sleep(0.02)
            assert (workspace / "ticks").exists(), "writer never started"
        finally:
            stop_domain(p, pidfd)
            os.close(pidfd)
        time.sleep(0.1)
        before = (workspace / "ticks").stat().st_size
        time.sleep(0.2)
        assert (workspace / "ticks").stat().st_size == before, "descendant still writing"
        # Also stop immediately after the native startup handshake, before a runtime ACK.
        p, pidfd = spawn_domain(command(workspace, "node", ["-e", "setInterval(()=>{},1000)"]),
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        stop_domain(p, pidfd)
        os.close(pidfd)
    print("PASS: synthetic mount/env/loopback boundary; pidfd-confirmed startup/descendant teardown")


def compare(experiment, engine, runtime, version="1.3.0", framework=None):
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
    args = ["/experiment/p0-runtime-comparison.mjs", runtime, version]
    if framework:
        args.append("skills")
    p, pidfd = spawn_domain(command(workspace, engine, args,
                                    experiment=experiment, framework=framework), stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
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
                          "version": version, "skills": bool(framework),
                          "test": "red-to-green; stale hash rejected", "effects": effects,
                          "candidate_sha256": candidate, "reopen": "clean only"}))
    finally:
        selector.close()
        stop_domain(p, pidfd)
        os.close(pidfd)
        for stream in [p.stdin, p.stdout, p.stderr]:
            stream.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--experiment", type=Path)
    parser.add_argument("--engine", choices=["node", "bun"], default="node")
    parser.add_argument("--runtime", choices=["sdk", "durable"], default="sdk")
    parser.add_argument("--version", choices=["1.3.0", "1.4.0"], default="1.3.0")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        assert args.experiment, "--experiment required"
        self_test()  # Boundary failure blocks runtime launch; no host fallback.
        compare(args.experiment.resolve(), args.engine, args.runtime, args.version)
