"""External process-crash controller for trusted synthetic P0 fixtures only."""

import argparse
from contextlib import closing
import fcntl
import hashlib
import json
import os
from pathlib import Path
import runpy
import selectors
import shutil
import sqlite3
import subprocess
import tempfile
import time

if not __debug__:
    raise SystemExit("Run without optimization; recovery assertions are mandatory")

helpers = runpy.run_path(str(Path(__file__).with_name("p0-sandbox.py")))
SCENARIOS = ["before-effect", "uncertain-safe", "uncertain-unsafe", "payload-change", "committed"]


def drive(workspace, experiment, engine, runtime, scenario, stage, state=None,
          ready=None, version="1.3.0"):
    cmd = helpers["command"](workspace, engine,
        ["/experiment/p0-runtime-recovery.mjs", runtime, scenario, stage, version],
        experiment=experiment, probe="p0-runtime-recovery.mjs")
    p, pidfd = helpers["spawn_domain"](cmd, stdin=subprocess.PIPE,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    selector = selectors.DefaultSelector()
    selector.register(p.stdout, selectors.EVENT_READ, "stdout")
    selector.register(p.stderr, selectors.EVENT_READ, "stderr")
    buffer = b""
    errors = b""
    events = []
    killed = False
    deadline = time.monotonic() + 45
    try:
        while selector.get_map() and not killed:
            assert time.monotonic() < deadline, "recovery runner timed out"
            for key, _ in selector.select(timeout=0.1):
                chunk = os.read(key.fileobj.fileno(), 4096)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                if key.data == "stderr":
                    errors += chunk
                    assert len(errors) <= 65536, "stderr limit"
                    continue
                buffer += chunk
                assert len(buffer) <= 65536, "protocol limit"
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    event = json.loads(line)
                    assert isinstance(event, dict)
                    assert len(events) < 4, "unexpected repeated runtime work"
                    events.append(event)
                    if event.get("type") == "request":
                        assert set(event) == {"type", "actionId", "value"} and state is not None
                        state["requests"].append({"stage": stage, "intent": event})
                        if stage == "start" and scenario == "before-effect":
                            killed = True  # Intent checkpoint exists; dispatch has not occurred.
                            break
                        expected = {"type": "request", "actionId": "fixture-action", "value": 7}
                        if event != expected:
                            result = "payload-mismatch"
                        elif stage == "recover" and scenario == "before-effect":
                            result = "denied"
                        elif state["target"].exists():
                            result = "deduplicated"
                        else:
                            state["target"].write_text(json.dumps({"fixture-action": 7}))
                            state["mutations"] += 1
                            result = "applied"
                        if stage == "start" and scenario != "committed":
                            state["outcome"] = "unresolved"
                            killed = True  # Target changed, but no result reaches the runtime.
                            break
                        state["results"].append(result)
                        p.stdin.write((json.dumps({"result": result}) + "\n").encode())
                        p.stdin.flush()
                    elif event.get("type") == "ready":
                        assert stage == "hold" and set(event) == {"type"} and ready
                        ready()
                        killed = True
                        break
                    elif event.get("type") == "terminal":
                        assert set(event) == {"type", "outcomes"}
                        assert isinstance(event["outcomes"], list)
                        if stage == "start":
                            assert scenario == "committed" and "applied" in event["outcomes"]
                            killed = True  # The tool result and terminal submission are committed.
                            break
                    elif event.get("type") == "opened":
                        assert stage == "inspect" and set(event) == {"type"}
                    else:
                        assert stage in {"storage", "reject"}
                        assert event == {"type": "storage", "version": version, "rejected": stage == "reject"}
                if killed:
                    break
        if killed:
            helpers["stop_domain"](p, pidfd)
            assert p.returncode != 0, "expected external hard kill, not clean close"
        else:
            assert p.wait(timeout=5) == 0, "runtime failed (synthetic stderr withheld)"
            assert not buffer and events, "missing runtime evidence"
        return events
    finally:
        selector.close()
        helpers["stop_domain"](p, pidfd)
        os.close(pidfd)
        for stream in [p.stdin, p.stdout, p.stderr]:
            stream.close()


def crash_case(experiment, engine, runtime, scenario, version="1.3.0"):
    root = Path(tempfile.mkdtemp(prefix=f"loom-p0-crash-{engine}-{runtime}-", dir="/tmp/opencode"))
    workspace = root / "workspace"
    workspace.mkdir()
    state = {"target": root / "protected-target.json", "mutations": 0,
             "outcome": "not-dispatched", "requests": [], "results": []}
    first = drive(workspace, experiment, engine, runtime, scenario, "start", state, version=version)
    assert (workspace / "metadata.json").is_file(), "missing committed resume identity"
    if scenario == "before-effect":
        assert not state["target"].exists() and state["mutations"] == 0
    else:
        assert state["target"].exists() and state["mutations"] == 1
        if scenario != "committed":
            assert state["outcome"] == "unresolved"
    resumed = drive(workspace, experiment, engine, runtime, scenario, "recover", state, version=version)
    assert resumed[-1]["type"] == "terminal"
    if scenario in {"committed", "uncertain-unsafe"}:
        assert len(state["requests"]) == 1, "unsafe/completed effect was replayed"
        if scenario == "uncertain-unsafe" and runtime == "durable":
            assert "interrupted" in json.dumps(resumed[-1]).lower()
    else:
        assert len(state["requests"]) == 2
        expected = {"before-effect": "denied", "uncertain-safe": "deduplicated",
                    "payload-change": "payload-mismatch"}[scenario]
        assert state["results"][-1] == expected
    if scenario == "committed":
        assert first[-1] == resumed[-1], "committed tool result changed on reopen"
    if runtime == "durable":
        hooks = [json.loads(line) for line in (workspace / "hooks.jsonl").read_text().splitlines()]
        assert hooks == [{"stage": "start"}], "unexpected recovery hook execution"
        if scenario == "before-effect":
            executions = [json.loads(line) for line in (workspace / "executions.jsonl").read_text().splitlines()]
            assert len(executions) == 2 and "newlyRequired" not in executions[-1]["args"]
    # Reconciliation is independent of runtime success/prose, after its domain exited.
    if scenario == "before-effect":
        assert state["mutations"] == 0 and not state["target"].exists()
        reconciled = "not-dispatched"
    else:
        assert state["mutations"] == 1
        assert json.loads(state["target"].read_text()) == {"fixture-action": 7}
        reconciled = "observed-applied"
    print(json.dumps({"engine": engine, "runtime": runtime, "version": version, "scenario": scenario,
                      "result": "PASS", "mutations": state["mutations"], "reconciled": reconciled}))
    return workspace


def owner_case(experiment, engine, runtime, version="1.3.0"):
    root = Path(tempfile.mkdtemp(prefix="loom-p0-owner-", dir="/tmp/opencode"))
    workspace = root / "workspace"
    workspace.mkdir()
    lock_path = root / "owner.lock"
    with lock_path.open("w") as owner:
        fcntl.flock(owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
        def ready():
            # Independent process denied before any second guarded runtime launch.
            script = """import fcntl,sys
with open(sys.argv[1], 'r+') as f:
 try: fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
 except BlockingIOError: sys.exit(23)
sys.exit(0)
"""
            p = subprocess.run([shutil.which("python3"), "-c", script, str(lock_path)],
                               env={"PATH": "/usr/bin:/bin"}, close_fds=True, capture_output=True, timeout=5)
            assert p.returncode == 23
            # Deliberately bypass the fixture guard on this idle synthetic store:
            # runtime-native open is NOT a leadership fence.
            assert drive(workspace, experiment, engine, runtime, "owner", "inspect", version=version) == [{"type": "opened"}]
        drive(workspace, experiment, engine, runtime, "owner", "hold", ready=ready, version=version)
    with lock_path.open("r+") as successor:
        fcntl.flock(successor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    print(json.dumps({"engine": engine, "runtime": runtime, "version": version, "result": "PASS",
                      "native_dual_open": "allowed (negative evidence)",
                      "external_guard": "contender denied; release after domain exit"}))


def snapshot(path):
    with closing(sqlite3.connect(f"file:{path}?mode=ro", uri=True)) as db:
        assert db.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        return {table: sorted(db.execute(f"SELECT * FROM {table}").fetchall(), key=repr)
                for table in ["durable_metadata", "record_ids", "conversations", "entries",
                              "tasks", "submissions", "documents", "document_revisions"]}


def migration_case(source, experiment, upgrade, engine):
    root = Path(tempfile.mkdtemp(prefix="loom-p0-upgrade-", dir="/tmp/opencode"))
    source_db = source / "runtime.sqlite"
    before_hash = hashlib.sha256(source_db.read_bytes()).hexdigest()
    original = snapshot(source_db)
    backup = root / "backup.sqlite"
    with closing(sqlite3.connect(f"file:{source_db}?mode=ro", uri=True)) as src, closing(sqlite3.connect(backup)) as dst:
        src.backup(dst)
    assert snapshot(backup) == original
    migrated = root / "migrated"
    migrated.mkdir()
    shutil.copyfile(backup, migrated / "runtime.sqlite")
    drive(migrated, upgrade, engine, "durable", "migration", "storage", version="1.4.0")
    assert snapshot(migrated / "runtime.sqlite") == original, "migration lost records"
    drive(migrated, experiment, engine, "durable", "migration", "reject")
    assert snapshot(migrated / "runtime.sqlite") == original
    restored = root / "restored"
    restored.mkdir()
    shutil.copyfile(backup, restored / "runtime.sqlite")
    drive(restored, experiment, engine, "durable", "migration", "storage")
    assert snapshot(restored / "runtime.sqlite") == original
    assert hashlib.sha256(source_db.read_bytes()).hexdigest() == before_hash
    assert snapshot(source_db) == original
    print(json.dumps({"engine": engine, "result": "PASS", "upgrade": "1.3.0 → 1.4.0 on clone",
                      "old_reader": "rejected migrated store", "restore": "1.3.0 backup preserved all records"}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--experiment", type=Path, required=True)
    parser.add_argument("--upgrade-experiment", type=Path, required=True)
    parser.add_argument("--engine", choices=["node", "bun"])
    parser.add_argument("--runtime", choices=["sdk", "durable"])
    parser.add_argument("--version", choices=["1.3.0", "1.4.0"], default="1.3.0")
    args = parser.parse_args()
    helpers["self_test"]()
    for engine in ([args.engine] if args.engine else ["node", "bun"]):
        for runtime in ([args.runtime] if args.runtime else ["sdk", "durable"]):
            for scenario in SCENARIOS:
                workspace = crash_case(args.experiment.resolve(), engine, runtime, scenario, args.version)
                if runtime == "durable" and scenario == "committed" and args.version == "1.3.0":
                    migration_case(workspace, args.experiment.resolve(), args.upgrade_experiment.resolve(), engine)
            owner_case(args.experiment.resolve(), engine, runtime, args.version)
