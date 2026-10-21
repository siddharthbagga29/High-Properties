"""Append-only audit/event log (state/events.jsonl). Every risk rejection, kill-switch change, stale-data event,
reconciliation mismatch, order transition, task transition and Hermes fallback is written here."""
import json
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path

from . import ROOT

_lock = threading.Lock()
SECRETISH = re.compile(r"(?i)(api[_-]?key|secret|token|password|passwd|bearer)\s*[:=]\s*\S+")


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def redact(text):
    return SECRETISH.sub(lambda m: m.group(1) + "=[REDACTED]", str(text))


class EventLog:
    def __init__(self, path=None):
        self.path = Path(path or ROOT / "state" / "events.jsonl")
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def emit(self, kind, message, severity="info", **data):
        rec = {"t": now_iso(), "kind": kind, "severity": severity, "message": redact(message)}
        if data:
            rec["data"] = json.loads(redact(json.dumps(data, default=str)))
        line = json.dumps(rec, sort_keys=True)
        with _lock, open(self.path, "a") as f:
            f.write(line + "\n")
            f.flush()
            os.fsync(f.fileno())
        return rec

    def read(self, limit=None, kinds=None):
        if not self.path.exists():
            return []
        out = []
        for line in self.path.read_text().splitlines():
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            if kinds is None or r.get("kind") in kinds:
                out.append(r)
        return out[-limit:] if limit else out


def atomic_write_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2, sort_keys=True, default=str))
    os.replace(tmp, path)
