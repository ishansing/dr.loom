"""Pinned I2P text/contract compatibility fixture; does not execute skills."""

import argparse
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import tempfile

if not __debug__:
    raise SystemExit("Run without optimization; framework assertions are mandatory")


def validate(root, manifest):
    assert not any(p.is_symlink() for p in root.rglob("*")), "framework symlink rejected"
    for relative, digest in manifest.items():
        path = root / relative
        assert path.is_file() and not path.is_symlink(), "missing regular framework file"
        assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, "framework digest mismatch"
    assert {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()
            and p != root / "fixture.json"} == set(manifest), "unexpected framework files"


def snapshot(repo):
    ref = {}
    for line in Path("FRAMEWORK_REF").read_text().splitlines():
        if line and not line.startswith("#"):
            key, value = line.split("=", 1)
            ref[key] = value
    commit = ref["I2P_COMMIT"]
    assert len(commit) == 40 and all(c in "0123456789abcdef" for c in commit)
    def git(*args):
        return subprocess.run(["git", "-C", str(repo), *args], check=True,
                              capture_output=True, timeout=30).stdout
    assert git("show", f"{commit}:VERSION").decode().strip() == ref["I2P_VERSION"]
    root = Path(tempfile.mkdtemp(prefix="loom-p0-framework-", dir="/tmp/opencode"))
    manifest = {}
    tree = git("ls-tree", "-rz", "--full-tree", commit, "--", ".agents/skills", "dependency.json", "skills.lock.json")
    for item in tree.split(b"\0"):
        if not item:
            continue
        metadata, name = item.split(b"\t", 1)
        mode, kind, oid = metadata.decode().split()
        assert mode == "100644" and kind == "blob", "only regular tracked data files allowed"
        relative = name.decode()
        path = root / relative
        assert path.resolve().is_relative_to(root), "framework path escape"
        data = git("cat-file", "blob", oid)
        assert hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest() == oid
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        manifest[relative] = hashlib.sha256(data).hexdigest()
    skills = sorted(p.parent.name for p in (root / ".agents/skills").glob("*/SKILL.md"))
    assert "itp-verify" in skills and "verification-before-completion" in skills and "tdd" not in skills
    lock = json.loads((root / "skills.lock.json").read_text())
    child = root / ".agents/skills/verification-before-completion"
    digest = hashlib.sha256()
    for path in sorted(child.rglob("*")):
        if path.is_file():
            digest.update(path.relative_to(child).as_posix().encode() + b"\0" + path.read_bytes() + b"\0")
    expected = next(item for item in lock["skills"] if item["id"] == child.name)
    assert digest.hexdigest() == expected["contentSha256"], "locked vendored child mismatch"
    (root / "fixture.json").write_text(json.dumps({"commit": commit, "skills": skills, "files": manifest}))
    validate(root, manifest)
    negative = Path(tempfile.mkdtemp(prefix="loom-p0-framework-negative-", dir="/tmp/opencode")) / "snapshot"
    shutil.copytree(root, negative)
    path = negative / ".agents/skills/itp-verify/SKILL.md"
    original = path.read_bytes()
    path.write_bytes(original + b"\ntampered fixture\n")
    try:
        validate(negative, manifest)
    except AssertionError as error:
        assert str(error) == "framework digest mismatch"
    else:
        raise AssertionError("tampered framework accepted")
    path.write_bytes(original)
    (negative / ".agents/skills/verification-before-completion/SKILL.md").unlink()
    try:
        validate(negative, manifest)
    except AssertionError as error:
        assert str(error) == "missing regular framework file"
    else:
        raise AssertionError("missing pinned child accepted")
    (negative / ".agents/skills/verification-before-completion/SKILL.md").symlink_to(
        root / ".agents/skills/verification-before-completion/SKILL.md")
    try:
        validate(negative, manifest)
    except AssertionError as error:
        assert str(error) == "framework symlink rejected"
    else:
        raise AssertionError("framework symlink escape accepted")
    print(json.dumps({"framework_commit": commit, "skills": len(skills),
                      "vendored_child_hash": "verified", "tampered_missing_symlink_snapshots": "rejected"}))
    return root, manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--framework", type=Path, required=True)
    parser.add_argument("--experiment", type=Path, required=True)
    parser.add_argument("--version", choices=["1.3.0", "1.4.0"], required=True)
    args = parser.parse_args()
    helpers = runpy.run_path(str(Path(__file__).with_name("p0-sandbox.py")))
    helpers["self_test"]()
    root, manifest = snapshot(args.framework.resolve())
    for engine in ["node", "bun"]:
        for runtime in ["sdk", "durable"]:
            validate(root, manifest)  # A bad snapshot is rejected before any runtime launch.
            helpers["compare"](args.experiment.resolve(), engine, runtime, args.version, root)
