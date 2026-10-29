"""Synthetic observer checks only; native worker acquisition is not qualified."""

from copy import deepcopy
from contextlib import contextmanager
from datetime import datetime
import json
import math
import os
import re
import select
import stat
import sys
import time
import unittest
from unittest.mock import Mock, patch


class Blocked(ValueError):
    """Fixed safe classification, never raw input or OS diagnostics."""


def _integer(value, minimum, maximum=2**64 - 1):
    return type(value) is int and minimum <= value <= maximum


def _unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise Blocked("frame-duplicate")
        value[key] = item
    return value


def parse_frame(raw, expected):
    if (type(expected) is not str or expected not in {"acquire", "confirm"} or type(raw) is not bytes
            or len(raw) > 8192 or not raw.endswith(b"\n") or raw.count(b"\n") != 1):
        raise Blocked("frame-bounds")
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_object)
    except Blocked:
        raise
    except (ValueError, RecursionError):
        raise Blocked("frame-json") from None
    return _validate_identity(value, expected)


def _validate_identity(value, expected):
    keys = {"type", "containerId", "pid", "startedAt", "restartCount", "mappedUid"}
    if type(value) is not dict or set(value) != keys or value["type"] != expected:
        raise Blocked("frame-shape")
    if (type(value["containerId"]) is not str
            or not re.fullmatch(r"[a-f0-9]{64}", value["containerId"])
            or not _integer(value["pid"], 2, 2**31 - 1)
            or not _integer(value["restartCount"], 0, 2**31 - 1)
            or not _integer(value["mappedUid"], 1, 2**32 - 2)):
        raise Blocked("frame-identity")
    stamp = value["startedAt"]
    if (type(stamp) is not str or not re.fullmatch(
            r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z", stamp)):
        raise Blocked("frame-time")
    try:
        if datetime.fromisoformat(stamp).year == 1:
            raise ValueError()
    except ValueError:
        raise Blocked("frame-time") from None
    return value


class IdentityFrames:
    """Incremental, poisoned-on-error decoder; finish() validates EOF."""

    def __init__(self):
        self._buffer = b""
        self._bytes = 0
        self._count = 0
        self._first = None
        self._failed = False
        self._read_deadline = None

    def feed(self, chunk):
        if self._failed:
            raise Blocked("frame-poisoned")
        try:
            if type(chunk) is not bytes or self._bytes + len(chunk) > 16384:
                raise Blocked("frame-bounds")
            self._bytes += len(chunk)
            self._buffer += chunk
            frames = []
            while b"\n" in self._buffer:
                if self._count == 2:
                    raise Blocked("frame-extra")
                line, self._buffer = self._buffer.split(b"\n", 1)
                frame = parse_frame(line + b"\n", "acquire" if self._count == 0 else "confirm")
                identity = {key: value for key, value in frame.items() if key != "type"}
                if self._count == 0:
                    self._first = identity
                elif identity != self._first:
                    raise Blocked("frame-changed")
                self._count += 1
                frames.append(frame)
            if len(self._buffer) >= 8192 or (self._count == 2 and self._buffer):
                raise Blocked("frame-bounds")
            return frames
        except Blocked:
            self._failed = True
            raise

    def finish(self):
        if self._failed or self._count != 2 or self._buffer:
            self._failed = True
            raise Blocked("frame-eof")

    def read_from(self, fd, deadline):
        """Borrow a stable nonblocking pipe; caller retains ownership until return."""
        if self._failed:
            raise Blocked("frame-poisoned")
        try:
            if self._count == 2:
                raise Blocked("frame-extra")
            if type(deadline) is not float or not math.isfinite(deadline):
                raise Blocked("control-deadline")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise Blocked("control-timeout")
            if remaining > 10 or (self._read_deadline is not None and deadline != self._read_deadline):
                raise Blocked("control-deadline")
            self._read_deadline = deadline
            if (not _integer(fd, 0, 2**31 - 1) or os.get_blocking(fd)
                    or not stat.S_ISFIFO(os.fstat(fd).st_mode)):
                raise Blocked("control-fd")
            poll = select.poll()
            poll.register(fd, select.POLLIN | select.POLLHUP)
            line = bytearray()
            frame = None
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise Blocked("control-timeout")
                try:
                    events = poll.poll(min(100, math.ceil(remaining * 1000)))
                except InterruptedError:
                    continue
                if time.monotonic() >= deadline:
                    raise Blocked("control-timeout")
                if not events:
                    continue
                if (len(events) != 1 or events[0][0] != fd or not events[0][1]
                        or not _valid_mask(events[0][1], select.POLLIN | select.POLLHUP)):
                    raise Blocked("control-poll")
                try:
                    # Do not consume confirmation bytes before the acquisition handshake.
                    chunk = os.read(fd, 1)
                except (BlockingIOError, InterruptedError):
                    continue
                if time.monotonic() >= deadline:
                    raise Blocked("control-timeout")
                if not chunk:
                    if frame is None:
                        raise Blocked("control-eof")
                    self.finish()
                    return frame
                if frame is not None:
                    raise Blocked("frame-extra")
                line.extend(chunk)
                if chunk == b"\n":
                    frame = self.feed(bytes(line))[0]
                    if time.monotonic() >= deadline:
                        raise Blocked("control-timeout")
                    if self._count == 1:
                        return frame
                elif len(line) >= 8192:
                    raise Blocked("frame-bounds")
        except Blocked:
            self._failed = True
            raise
        except OSError:
            self._failed = True
            raise Blocked("control-unavailable") from None


def _pair(value):
    if (type(value) not in {list, tuple} or len(value) != 2
            or not _integer(value[0], 0) or not _integer(value[1], 1)):
        raise Blocked("kernel-handle-identity")
    return tuple(value)


def check_kernel_consistency(identity, before, after, controller_namespaces):
    """Check synthetic snapshots for drift, not ownership or source provenance."""
    identity = _validate_identity(identity, "acquire")
    if type(controller_namespaces) is not dict or set(controller_namespaces) != {"pidNamespace", "cgroupNamespace"}:
        raise Blocked("kernel-controller")
    controller = {key: _pair(value) for key, value in controller_namespaces.items()}
    keys = {"pid", "tgid", "mappedUid", "startTicks", "nspid", "pidNamespace",
            "cgroupNamespace", "cgroupDirectory", "membership", "cgroupType"}
    checked = []
    for row in (before, after):
        if type(row) is not dict or set(row) != keys:
            raise Blocked("kernel-shape")
        if (not _integer(row["pid"], 2, 2**31 - 1) or row["pid"] != identity["pid"]
                or not _integer(row["tgid"], 2, 2**31 - 1) or row["tgid"] != row["pid"]
                or not _integer(row["mappedUid"], 1, 2**32 - 2) or row["mappedUid"] != identity["mappedUid"]
                or not _integer(row["startTicks"], 0)):
            raise Blocked("kernel-process")
        nspid = row["nspid"]
        if (type(nspid) not in {list, tuple} or not 2 <= len(nspid) <= 32
                or any(not _integer(pid, 1, 2**31 - 1) for pid in nspid)
                or nspid[0] != row["pid"] or nspid[-1] != 1):
            raise Blocked("kernel-nspid")
        normalized = dict(row, nspid=tuple(nspid))
        for key in ("pidNamespace", "cgroupNamespace", "cgroupDirectory"):
            normalized[key] = _pair(row[key])
            if key in controller and normalized[key] == controller[key]:
                raise Blocked("kernel-shared-namespace")
        membership = row["membership"]
        if (type(membership) is not str or not membership.startswith("/")
                or len(membership) > 4096 or "\\" in membership
                or any(ord(char) < 32 for char in membership)
                or any(part in {"", ".", ".."} for part in membership[1:].split("/"))
                or row["cgroupType"] != "domain"):
            raise Blocked("kernel-cgroup")
        checked.append(normalized)
    if checked[0] != checked[1]:
        raise Blocked("kernel-changed")


def parse_populated(raw):
    if type(raw) is not bytes or len(raw) > 1024 or not raw.endswith(b"\n"):
        raise Blocked("events-data")
    try:
        text = raw.decode("ascii")
    except UnicodeError:
        raise Blocked("events-data") from None
    if any(ord(char) < 32 and char not in "\t\n" for char in text):
        raise Blocked("events-data")
    values = {}
    lines = text.splitlines()
    for line in lines:
        parts = line.split()
        if (len(parts) != 2 or not re.fullmatch(r"[a-z][a-z0-9_]*", parts[0])
                or parts[0] in values or not parts[1].isdecimal()):
            raise Blocked("events-data")
        values[parts[0]] = parts[1]
    if values.get("populated") not in {"0", "1"}:
        raise Blocked("events-populated")
    return int(values["populated"])


def _valid_mask(mask, allowed):
    return type(mask) is int and mask >= 0 and mask & ~allowed == 0


def classify_snapshot(pidfd_mask, events_mask, fresh_events):
    pidfd = "unavailable"
    if _valid_mask(pidfd_mask, select.POLLIN | select.POLLHUP | select.POLLRDNORM):
        if pidfd_mask == 0:
            pidfd = "live"
        elif pidfd_mask & (select.POLLIN | select.POLLHUP):
            pidfd = "terminal"
    cgroup = "unavailable"
    allowed = select.POLLPRI | select.POLLERR | select.POLLIN | select.POLLOUT | select.POLLRDNORM | select.POLLWRNORM
    if _valid_mask(events_mask, allowed):
        try:
            cgroup = "populated" if parse_populated(fresh_events) else "empty"
        except Blocked:
            pass
    return {"pidfd": pidfd, "cgroup": cgroup, "quiescenceQualified": False}


class ObserverTests(unittest.TestCase):
    def setUp(self):
        self.identity = {"type": "acquire", "containerId": "a" * 64, "pid": 123,
                         "startedAt": "2026-10-28T10:00:00.123456789Z",
                         "restartCount": 0, "mappedUid": 165531}
        self.controller = {"pidNamespace": (1, 10), "cgroupNamespace": (1, 20)}
        self.kernel = {"pid": 123, "tgid": 123, "mappedUid": 165531,
                       "startTicks": 500, "nspid": [123, 1],
                       "pidNamespace": (1, 11), "cgroupNamespace": (1, 21),
                       "cgroupDirectory": (2, 30), "membership": "/synthetic/domain",
                       "cgroupType": "domain"}

    def frame(self, **changes):
        return (json.dumps(dict(self.identity, **changes)) + "\n").encode()

    @contextmanager
    def control_pipe(self):
        read_fd, write_fd = os.pipe2(os.O_NONBLOCK | os.O_CLOEXEC)
        with (
            os.fdopen(read_fd, "rb", buffering=0) as reader,
            os.fdopen(write_fd, "wb", buffering=0) as writer,
        ):
            yield reader.fileno(), writer

    @contextmanager
    def control_clock(self):
        now, waits = [100.0], []
        kernel_poll = select.poll()

        def poll(milliseconds):
            waits.append(milliseconds)
            events = kernel_poll.poll(0)
            if not events:
                now[0] += milliseconds / 1000
            return events

        scripted = Mock()
        scripted.register.side_effect = kernel_poll.register
        scripted.poll.side_effect = poll
        with (
            patch.object(time, "monotonic", side_effect=lambda: now[0]),
            patch.object(select, "poll", return_value=scripted),
        ):
            yield now, waits

    def test_control_read_returns_acquire_without_waiting_for_eof(self):
        with self.control_pipe() as (fd, writer):
            writer.write(self.frame())
            self.assertEqual(IdentityFrames().read_from(fd, time.monotonic() + 1), self.identity)
            self.assertFalse(os.get_blocking(fd))
            os.fstat(fd)

    def test_control_confirm_requires_eof_and_keeps_borrowed_pipe_open(self):
        with self.control_pipe() as (fd, writer):
            writer.write(self.frame() + self.frame(type="confirm"))
            writer.close()
            parser, deadline = IdentityFrames(), time.monotonic() + 1
            self.assertEqual(parser.read_from(fd, deadline), self.identity)
            self.assertEqual(parser.read_from(fd, deadline)["type"], "confirm")
            parser.finish()
            self.assertFalse(os.get_blocking(fd))
            os.fstat(fd)
            with self.assertRaises(Blocked):
                parser.read_from(fd, deadline)
            os.fstat(fd)

    def test_control_missing_frame_or_confirm_eof_times_out(self):
        for data in [b"", self.frame() + self.frame(type="confirm")]:
            with self.subTest(data=data[:20]), self.control_pipe() as (fd, writer), self.control_clock() as (now, waits):
                writer.write(data)
                parser, deadline = IdentityFrames(), 100.25
                with self.assertRaisesRegex(Blocked, "control-timeout"):
                    parser.read_from(fd, deadline)
                    parser.read_from(fd, deadline)
                self.assertGreaterEqual(now[0], deadline)
                self.assertTrue(waits and all(0 < wait <= 100 for wait in waits))
                with self.assertRaises(Blocked):
                    parser.feed(self.frame())
                self.assertFalse(os.get_blocking(fd))
                os.fstat(fd)

    def test_control_two_maximum_frames_preserve_handshake_and_eof(self):
        with self.control_pipe() as (fd, writer):
            parser, deadline = IdentityFrames(), time.monotonic() + 2
            for kind in ["acquire", "confirm"]:
                line = self.frame(type=kind)[:-1]
                padded = line + b" " * (8191 - len(line)) + b"\n"
                self.assertEqual(writer.write(padded), 8192)
                if kind == "confirm":
                    writer.close()
                self.assertEqual(parser.read_from(fd, deadline), dict(self.identity, type=kind))
            parser.finish()
            self.assertFalse(os.get_blocking(fd))
            os.fstat(fd)

    def test_control_eof_truncation_extra_and_changed_input_poison_decoder(self):
        both = self.frame() + self.frame(type="confirm")
        for data in [b"", self.frame()[:-1], self.frame(), both + b"x", both + b"\n",
                     self.frame() + self.frame(type="confirm", pid=124), b"PRIVATE-SENTINEL\n"]:
            with self.subTest(data=data[:20]), self.control_pipe() as (fd, writer):
                writer.write(data)
                writer.close()
                parser, deadline = IdentityFrames(), time.monotonic() + 1
                with self.assertRaises(Blocked) as caught:
                    parser.read_from(fd, deadline)
                    parser.read_from(fd, deadline)
                self.assertNotIn("PRIVATE-SENTINEL", str(caught.exception))
                with self.assertRaises(Blocked):
                    parser.feed(self.frame())
                os.fstat(fd)

    def test_control_deadline_is_finite_shared_and_cannot_be_extended(self):
        with self.control_pipe() as (fd, writer), self.control_clock():
            for deadline in [0.0, 111.0, float("nan"), float("inf"), True, 101]:
                with self.subTest(deadline=deadline), self.assertRaises(Blocked):
                    IdentityFrames().read_from(fd, deadline)
            writer.write(self.frame() + self.frame(type="confirm"))
            parser = IdentityFrames()
            parser.read_from(fd, 101.0)
            with self.assertRaisesRegex(Blocked, "control-deadline"):
                parser.read_from(fd, 102.0)
            with self.assertRaises(Blocked):
                parser.feed(self.frame(type="confirm"))
            os.fstat(fd)

    def test_control_expired_handshake_does_not_consume_confirmation(self):
        with self.control_pipe() as (fd, writer), self.control_clock() as (now, _):
            parser = IdentityFrames()
            writer.write(self.frame())
            self.assertEqual(parser.read_from(fd, 101.0), self.identity)
            now[0] = 101.0
            confirmation = self.frame(type="confirm")
            writer.write(confirmation)
            writer.close()
            with self.assertRaisesRegex(Blocked, "control-timeout"):
                parser.read_from(fd, 101.0)
            self.assertEqual(os.read(fd, len(confirmation) + 1), confirmation)
            with self.assertRaises(Blocked):
                parser.read_from(fd, 102.0)
            self.assertFalse(os.get_blocking(fd))
            os.fstat(fd)

    def test_control_refuses_blocking_invalid_and_nonpipe_descriptors(self):
        with self.control_pipe() as (fd, _):
            os.set_blocking(fd, True)
            with self.assertRaisesRegex(Blocked, "control-fd"):
                IdentityFrames().read_from(fd, time.monotonic() + 1)
            self.assertTrue(os.get_blocking(fd))
            for invalid in [-1, True, "0", 2**31]:
                with self.subTest(invalid=invalid), self.assertRaises(Blocked):
                    IdentityFrames().read_from(invalid, time.monotonic() + 1)
        own_file = os.memfd_create("synthetic-control-negative", os.MFD_CLOEXEC)
        try:
            os.set_blocking(own_file, False)
            with self.assertRaisesRegex(Blocked, "control-fd"):
                IdentityFrames().read_from(own_file, time.monotonic() + 1)
            os.fstat(own_file)
        finally:
            os.close(own_file)

    def test_control_retries_transient_os_reads(self):
        original_read = os.read
        errors = [BlockingIOError("PRIVATE-SENTINEL"), InterruptedError("PRIVATE-SENTINEL")]

        def read(fd, size):
            if errors:
                raise errors.pop()
            return original_read(fd, size)

        with self.control_pipe() as (fd, writer), self.control_clock():
            writer.write(self.frame())
            with patch.object(os, "read", side_effect=read):
                self.assertEqual(IdentityFrames().read_from(fd, 101.0), self.identity)
            os.fstat(fd)

    def test_control_late_readiness_does_not_consume_bytes(self):
        with self.control_pipe() as (fd, writer):
            writer.write(self.frame())
            now, fake = [100.0], Mock()

            def poll(_milliseconds):
                now[0] = 101.0
                return [(fd, select.POLLIN)]

            fake.poll.side_effect = poll
            parser = IdentityFrames()
            with patch.object(time, "monotonic", side_effect=lambda: now[0]), patch.object(select, "poll", return_value=fake):
                with self.assertRaisesRegex(Blocked, "control-timeout"):
                    parser.read_from(fd, 101.0)
            self.assertEqual(os.read(fd, len(self.frame())), self.frame())
            with self.assertRaises(Blocked):
                parser.feed(self.frame())

    def test_control_late_byte_is_not_accepted(self):
        with self.control_pipe() as (fd, writer), self.control_clock() as (now, _):
            writer.write(self.frame())
            original_read = os.read

            def read(source, size):
                result = original_read(source, size)
                now[0] = 101.0
                return result

            parser = IdentityFrames()
            with patch.object(os, "read", side_effect=read):
                with self.assertRaisesRegex(Blocked, "control-timeout"):
                    parser.read_from(fd, 101.0)
            with self.assertRaises(Blocked):
                parser.feed(self.frame())

    def test_control_repeated_readiness_or_poll_interruptions_cannot_extend_wait(self):
        for interrupted in [False, True]:
            with self.subTest(interrupted=interrupted), self.control_pipe() as (fd, _):
                now, waits, fake = [100.0], [], Mock()

                def poll(milliseconds):
                    waits.append(milliseconds)
                    now[0] += 0.06
                    if interrupted:
                        raise InterruptedError("PRIVATE-SENTINEL")
                    return [(fd, select.POLLIN)]

                fake.poll.side_effect = poll
                with (
                    patch.object(time, "monotonic", side_effect=lambda: now[0]),
                    patch.object(select, "poll", return_value=fake),
                    patch.object(os, "read", side_effect=BlockingIOError("PRIVATE-SENTINEL")),
                ):
                    with self.assertRaisesRegex(Blocked, "control-timeout"):
                        IdentityFrames().read_from(fd, 100.2)
                self.assertGreaterEqual(now[0], 100.2)
                self.assertTrue(waits and all(0 < wait <= 100 for wait in waits))
                os.fstat(fd)

    def test_control_poll_errors_are_safe_and_poison_decoder(self):
        with self.control_pipe() as (fd, _):
            for events in [[(fd, select.POLLERR)], [(fd, select.POLLNVAL)],
                           [(fd, 0)], [(fd, 1 << 30)], [(fd + 1, select.POLLIN)],
                           [(fd, select.POLLIN), (fd, select.POLLHUP)]]:
                with self.subTest(events=events):
                    fake, parser = Mock(), IdentityFrames()
                    fake.poll.return_value = events
                    with patch.object(select, "poll", return_value=fake):
                        with self.assertRaisesRegex(Blocked, "control-poll"):
                            parser.read_from(fd, time.monotonic() + 1)
                    with self.assertRaises(Blocked):
                        parser.feed(self.frame())
                    os.fstat(fd)

    def test_control_os_failures_withhold_diagnostics_and_preserve_fd(self):
        with self.control_pipe() as (fd, writer):
            writer.write(self.frame())
            for operation in ["register", "poll", "read"]:
                with self.subTest(operation=operation):
                    parser, fake = IdentityFrames(), Mock()
                    fake.poll.return_value = [(fd, select.POLLIN)]
                    if operation != "read":
                        getattr(fake, operation).side_effect = OSError("PRIVATE-SENTINEL")
                    read_effect = OSError("PRIVATE-SENTINEL") if operation == "read" else None
                    with (
                        patch.object(select, "poll", return_value=fake),
                        patch.object(os, "read", side_effect=read_effect),
                    ):
                        with self.assertRaisesRegex(Blocked, "control-unavailable") as caught:
                            parser.read_from(fd, time.monotonic() + 1)
                    self.assertNotIn("PRIVATE-SENTINEL", str(caught.exception))
                    with self.assertRaises(Blocked):
                        parser.feed(self.frame())
                    os.fstat(fd)

    def test_control_oversized_unterminated_frame_is_bounded(self):
        with self.control_pipe() as (fd, _), self.control_clock():
            fake = Mock()
            fake.poll.return_value = [(fd, select.POLLIN)]
            with (
                patch.object(select, "poll", return_value=fake),
                patch.object(os, "read", side_effect=[b"x"] * 8192 + [AssertionError("Control input exceeded8KiB")]),
            ):
                with self.assertRaisesRegex(Blocked, "frame-bounds"):
                    IdentityFrames().read_from(fd, 101.0)
            os.fstat(fd)

    def test_valid_identity_frames_preserve_precision(self):
        self.assertEqual(parse_frame(self.frame(), "acquire"), self.identity)
        self.assertEqual(parse_frame(self.frame(type="confirm"), "confirm")["startedAt"],
                         self.identity["startedAt"])

    def test_strict_frame_schema(self):
        cases = [dict(self.identity, **{key: value}) for key, value in [
            ("type", "confirm"), ("containerId", "A" * 64), ("containerId", "a" * 63),
            ("containerId", None), ("pid", 0), ("pid", 1), ("pid", True),
            ("pid", 1.5), ("pid", 2**31), ("mappedUid", True), ("mappedUid", 0),
            ("mappedUid", 2**32 - 1), ("restartCount", False), ("restartCount", -1),
            ("startedAt", "0001-01-01T00:00:00Z"), ("startedAt", "2026-02-30T00:00:00Z"),
            ("startedAt", "2026-10-28"), ("startedAt", "2026-10-28T00:00:00.1234567890Z"),
            ("startedAt", None),
        ]]
        cases += [[], None, dict(self.identity, verified=True),
                  {key: value for key, value in self.identity.items() if key != "pid"}]
        for value in cases:
            with self.subTest(value=value), self.assertRaises(Blocked):
                parse_frame((json.dumps(value) + "\n").encode(), "acquire")

    def test_frame_encoding_duplicates_and_bounds(self):
        invalid = [b"", self.frame()[:-1], self.frame() + b"\n", b"\xff\n",
                   b"{bad}\n", self.frame().replace(b'"pid": 123', b'"pid": 123, "pid": 123'),
                   b"[" * 2000 + b"\n", b" " * 8193 + b"\n"]
        for raw in invalid:
            with self.subTest(raw=raw[:40]), self.assertRaises(Blocked):
                parse_frame(raw, "acquire")
        with self.assertRaises(Blocked):
            parse_frame(self.frame(), [])
        line = self.frame()[:-1]
        padded = line + b" " * (8191 - len(line)) + b"\n"
        self.assertEqual(parse_frame(padded, "acquire"), self.identity)

    def test_incremental_frames_and_eof(self):
        data = self.frame() + self.frame(type="confirm")
        for chunks in [[data], [bytes([byte]) for byte in data]]:
            parser = IdentityFrames()
            frames = []
            for chunk in chunks:
                frames.extend(parser.feed(chunk))
            parser.finish()
            self.assertEqual([frame["type"] for frame in frames], ["acquire", "confirm"])
        for data in [b"", self.frame(), self.frame() + b"{", self.frame(type="confirm")]:
            with self.subTest(data=data[:30]), self.assertRaises(Blocked):
                parser = IdentityFrames()
                parser.feed(data)
                parser.finish()

    def test_changed_confirmation_and_extra_data_poison_parser(self):
        changes = [{"containerId": "b" * 64}, {"pid": 124}, {"mappedUid": 165532},
                   {"restartCount": 1}, {"startedAt": "2026-10-28T10:00:00.123456780Z"}]
        for change in changes:
            with self.subTest(change=change), self.assertRaises(Blocked):
                IdentityFrames().feed(self.frame() + self.frame(type="confirm", **change))
        for extra in [self.frame(), b"x", b"\n", b" " * 16385]:
            parser = IdentityFrames()
            with self.subTest(extra=extra[:20]), self.assertRaises(Blocked):
                parser.feed(self.frame() + self.frame(type="confirm") + extra)
            with self.assertRaises(Blocked):
                parser.feed(self.frame())
            with self.assertRaises(Blocked):
                parser.finish()

    def test_two_maximum_frames_and_return_value_mutation(self):
        parser = IdentityFrames()
        frames = parser.feed(self.frame())
        frames[0]["pid"] = 999
        parser.feed(self.frame(type="confirm"))
        parser.finish()
        parser = IdentityFrames()
        for kind in ["acquire", "confirm"]:
            line = self.frame(type=kind)[:-1]
            parser.feed(line + b" " * (8191 - len(line)) + b"\n")
        parser.finish()

    def test_consistent_kernel_snapshots(self):
        after = deepcopy(self.kernel)
        after["nspid"] = tuple(after["nspid"])
        after["cgroupDirectory"] = list(after["cgroupDirectory"])
        self.assertIsNone(check_kernel_consistency(self.identity, self.kernel, after, self.controller))

    def test_kernel_rejection_and_identity_drift(self):
        changes = [("pid", 124), ("tgid", 124), ("mappedUid", 0), ("mappedUid", 165532),
                   ("startTicks", -1), ("startTicks", True), ("startTicks", 501),
                   ("nspid", [123]), ("nspid", [124, 1]), ("nspid", [123, 2]),
                   ("nspid", [123, True]), ("pidNamespace", (1, 10)),
                   ("cgroupNamespace", (1, 20)), ("cgroupDirectory", (2, 31)),
                   ("cgroupDirectory", (2, True)), ("membership", "/other/domain"),
                   ("membership", "/"), ("membership", "relative"),
                   ("membership", "/a/../b"), ("membership", "/a//b"),
                   ("membership", "/a/./b"), ("membership", "/a\\040b"),
                   ("membership", "/a\nb"), ("cgroupType", "threaded")]
        for key, value in changes:
            with self.subTest(key=key, value=value), self.assertRaises(Blocked):
                check_kernel_consistency(self.identity, self.kernel,
                                         dict(self.kernel, **{key: value}), self.controller)
        for before in [{}, None, dict(self.kernel, extra=1)]:
            with self.subTest(before=before), self.assertRaises(Blocked):
                check_kernel_consistency(self.identity, before, self.kernel, self.controller)

    def test_kernel_controller_and_identity_validation(self):
        for controller in [{}, None, {"pidNamespace": [1, False], "cgroupNamespace": [1, 20]}]:
            with self.subTest(controller=controller), self.assertRaises(Blocked):
                check_kernel_consistency(self.identity, self.kernel, self.kernel, controller)
        with self.assertRaises(Blocked):
            check_kernel_consistency({"pid": b"invalid"}, self.kernel, self.kernel, self.controller)

    def test_populated_parser(self):
        self.assertEqual(parse_populated(b"populated 0\nfrozen 0\n"), 0)
        self.assertEqual(parse_populated(b"future_key 2\npopulated\t1\n"), 1)
        invalid = [None, OSError("PRIVATE-SENTINEL"), b"", b"populated 0", b"frozen 0\n",
                   b"populated 2\n", b"populated -1\n", b"populated 00\n",
                   b"populated 0\npopulated 0\n", b"populated 0\n\n",
                   b"populated 0 extra\n", b"populated \xff\n", b"populated 0\vfrozen 0\n",
                   b"populated 0\n" + b"x" * 1024]
        for raw in invalid:
            with self.subTest(raw=str(raw)[:40]), self.assertRaises(Blocked):
                parse_populated(raw)

    def test_missing_events_never_invent_empty(self):
        self.assertEqual(classify_snapshot(0, 0, None), {
            "pidfd": "live", "cgroup": "unavailable", "quiescenceQualified": False,
        })

    def test_observations_are_independent(self):
        self.assertEqual(classify_snapshot(select.POLLIN, select.POLLPRI, b"populated 1\n"), {
            "pidfd": "terminal", "cgroup": "populated", "quiescenceQualified": False,
        })
        self.assertEqual(classify_snapshot(0, select.POLLPRI | select.POLLERR, b"populated 0\n"), {
            "pidfd": "live", "cgroup": "empty", "quiescenceQualified": False,
        })

    def test_pidfd_masks(self):
        for mask in [select.POLLIN, select.POLLHUP, select.POLLIN | select.POLLHUP | select.POLLRDNORM]:
            with self.subTest(mask=mask):
                self.assertEqual(classify_snapshot(mask, 0, b"populated 1\n")["pidfd"], "terminal")
        for mask in [True, -1, None, select.POLLERR, select.POLLNVAL,
                     select.POLLIN | select.POLLERR, select.POLLRDNORM, 1 << 30]:
            with self.subTest(mask=mask):
                self.assertEqual(classify_snapshot(mask, 0, b"populated 1\n")["pidfd"], "unavailable")

    def test_events_notification_and_unavailable_data(self):
        for mask in [0, select.POLLPRI, select.POLLERR, select.POLLPRI | select.POLLERR]:
            with self.subTest(mask=mask):
                self.assertEqual(classify_snapshot(0, mask, b"populated 0\n")["cgroup"], "empty")
                for raw in [None, OSError("PRIVATE-SENTINEL"), b"", b"populated 0\npopulated 1\n"]:
                    result = classify_snapshot(select.POLLIN, mask, raw)
                    self.assertEqual(result["cgroup"], "unavailable")
                    self.assertNotIn("PRIVATE-SENTINEL", json.dumps(result))
                    self.assertIs(result["quiescenceQualified"], False)
        for mask in [True, -1, select.POLLNVAL, select.POLLHUP, 1 << 30]:
            with self.subTest(mask=mask):
                self.assertEqual(classify_snapshot(0, mask, b"populated 0\n")["cgroup"], "unavailable")

    def test_repopulation_and_no_cleanup_verdict(self):
        results = [classify_snapshot(select.POLLIN, select.POLLPRI, raw)
                   for raw in [b"populated 0\n", b"populated 1\n", None]]
        self.assertEqual([result["cgroup"] for result in results], ["empty", "populated", "unavailable"])
        for result in results:
            self.assertEqual(set(result), {"pidfd", "cgroup", "quiescenceQualified"})
            self.assertIs(result["quiescenceQualified"], False)


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        unittest.main(argv=[sys.argv[0]], verbosity=2)
    else:
        print(json.dumps({"result": "blocked", "reason": "native-not-implemented",
                          "quiescenceQualified": False}))
        raise SystemExit(2)
