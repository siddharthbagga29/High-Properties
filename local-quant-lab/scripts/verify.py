#!/usr/bin/env python3
"""Supervisor pass: for each milestone task, run its acceptance commands, record the real output, and set
done_verified only if every command exits 0 with a positive passed count. Founder tasks become needs_human."""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from lql.cli import SEED_TASKS  # noqa: E402
from lql.events import EventLog  # noqa: E402
from lql.orchestrator import TaskGraph, Supervisor  # noqa: E402


def run_acceptance(tid, _evidence):
    t = graph.get(tid)
    passed = failed = 0
    outputs = []
    for cmd in t["acceptance"]:
        r = subprocess.run(cmd.split(), cwd=ROOT, capture_output=True, text=True, timeout=t["timeout_s"])
        tail = (r.stderr or r.stdout)[-600:]
        m = re.search(r"Ran (\d+) tests?", tail)
        n = int(m.group(1)) if m else 0
        bad = re.search(r"FAILED \((?:failures=(\d+))?(?:, )?(?:errors=(\d+))?", tail)
        f = (int(bad.group(1) or 0) + int(bad.group(2) or 0)) if bad else 0
        passed += n - f
        failed += f + (1 if r.returncode else 0)
        outputs.append({"cmd": cmd, "exit_code": r.returncode, "tail": tail[-300:]})
    code = 0 if failed == 0 and all(o["exit_code"] == 0 for o in outputs) else 1
    return {"command": " && ".join(t["acceptance"]), "exit_code": code, "passed": passed, "failed": failed,
            "outputs": outputs, "signature": outputs[-1]["tail"][-120:] if code else ""}


graph = TaskGraph(ROOT / "state" / "current_state.json", EventLog())
for tid, goal, owner, deps, acc in SEED_TASKS:
    graph.add(tid, goal, owner, deps, acc)
for tid, _g, owner, _d, _a in SEED_TASKS:
    if owner == "founder" and graph.get(tid)["status"] not in ("needs_human", "done_verified"):
        graph.needs_human(tid, "Run on the Mac: install Hermes from the official installer, choose a local model "
                               "with >=64K context, then python3 scripts/hermes_check.py --memory-roundtrip")
sup = Supervisor(graph)
for _ in range(20):
    tid = sup.cycle(lambda t: {}, run_acceptance, lambda t, e: [])
    if tid is None:
        break
    t = graph.get(tid)
    ev = t["evidence"][-1] if t["evidence"] else {}
    print(f"{tid:16} {t['status']:16} passed={ev.get('passed', '-')}")
print(graph.summary()["counts"])
