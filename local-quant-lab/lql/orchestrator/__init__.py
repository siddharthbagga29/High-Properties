"""Persistent task graph and supervisor loop.

OBSERVE -> RECONCILE STATE -> SELECT ONE READY TASK -> EXECUTE -> RUN ACCEPTANCE CHECKS -> INDEPENDENTLY CRITIQUE ->
UPDATE STATE/LOG -> SELECT NEXT TASK

State lives in state/current_state.json and is written atomically after every transition. Only the supervisor role
may set done_verified, and only with evidence that names a command, an exit code of 0 and a positive count of
passed checks. A task that fails with the same error signature three times in a row is marked blocked_external with
that evidence instead of being retried again.
"""
import copy

from .. import ROOT, __version__
from ..events import atomic_write_json, now_iso

STATUSES = ("pending", "ready", "in_progress", "blocked_external", "failed", "rejected_by_critic", "needs_human",
            "done_verified")
TERMINAL = ("done_verified",)
STATE_FILE = ROOT / "state" / "current_state.json"


class TaskError(Exception):
    pass


class TaskGraph:
    def __init__(self, path=STATE_FILE, events=None):
        self.path, self.events = path, events
        if path.exists():
            import json
            self.state = json.loads(path.read_text())
        else:
            self.state = {"schema": 1, "app_version": __version__, "execution_mode": "SIMULATED",
                          "live_trading": "absent", "tasks": {}, "order": [], "last_checkpoint": None}

    # -- persistence ----------------------------------------------------------------------------------------------
    def save(self, note=""):
        self.state["last_checkpoint"] = {"at": now_iso(), "note": note}
        atomic_write_json(self.path, self.state)

    @property
    def tasks(self):
        return self.state["tasks"]

    def get(self, tid):
        if tid not in self.tasks:
            raise TaskError(f"unknown task {tid}")
        return self.tasks[tid]

    # -- building -------------------------------------------------------------------------------------------------
    def add(self, tid, goal, owner, deps=(), acceptance=(), expected_output="", timeout_s=600, retry_budget=3,
            status="pending"):
        """Idempotent: adding an existing task ID leaves its history untouched."""
        if tid in self.tasks:
            return self.tasks[tid]
        if status not in STATUSES or status == "done_verified":
            raise TaskError(f"cannot create a task as {status}")
        self.tasks[tid] = {"id": tid, "goal": goal, "owner": owner, "deps": list(deps),
                           "acceptance": list(acceptance), "expected_output": expected_output,
                           "timeout_s": timeout_s, "retry_budget": retry_budget, "status": status, "retries": 0,
                           "failures": [], "evidence": [], "last_action": None, "blocker": None,
                           "history": [{"at": now_iso(), "to": status, "by": "orchestrator"}]}
        self.state["order"].append(tid)
        self.save(f"added {tid}")
        return self.tasks[tid]

    def _set(self, tid, status, by, note=""):
        t = self.get(tid)
        t["status"] = status
        t["history"].append({"at": now_iso(), "to": status, "by": by, "note": note})
        self.save(f"{tid} -> {status}")
        if self.events is not None:
            self.events.emit("task_transition", f"{tid} -> {status} by {by}" + (f": {note}" if note else ""),
                             task=tid, status=status)

    # -- loop primitives ------------------------------------------------------------------------------------------
    def refresh(self):
        """RECONCILE: promote pending tasks whose dependencies are all verified."""
        for tid in self.state["order"]:
            t = self.tasks[tid]
            if t["status"] == "pending" and all(self.tasks.get(d, {}).get("status") == "done_verified"
                                                for d in t["deps"]):
                self._set(tid, "ready", "orchestrator", "dependencies verified")

    def select_ready(self):
        self.refresh()
        for tid in self.state["order"]:
            t = self.tasks[tid]
            if t["status"] == "ready" or (t["status"] in ("failed", "rejected_by_critic") and not t["blocker"]
                                          and t["retries"] < t["retry_budget"]):
                return tid
        return None

    def start(self, tid, action):
        t = self.get(tid)
        if t["status"] not in ("ready", "failed", "rejected_by_critic"):
            raise TaskError(f"{tid} is {t['status']}, not startable")
        t["last_action"] = action
        self._set(tid, "in_progress", "worker", action)

    def record_failure(self, tid, signature, detail=""):
        t = self.get(tid)
        t["retries"] += 1
        t["failures"].append({"at": now_iso(), "signature": signature, "detail": detail[:2000]})
        last = [f["signature"] for f in t["failures"][-3:]]
        if len(last) == 3 and len(set(last)) == 1:
            t["blocker"] = {"kind": "identical_failure_x3", "signature": signature, "evidence": detail[:2000]}
            self._set(tid, "blocked_external", "orchestrator", f"same failure three times: {signature}")
        elif t["retries"] >= t["retry_budget"]:
            t["blocker"] = {"kind": "retry_budget_exhausted", "signature": signature}
            self._set(tid, "failed", "orchestrator", "retry budget exhausted")
        else:
            self._set(tid, "failed", "worker", signature)

    def critic_reject(self, tid, findings):
        self.get(tid)["evidence"].append({"at": now_iso(), "critic_findings": findings})
        self._set(tid, "rejected_by_critic", "critic", "; ".join(findings)[:500])

    def needs_human(self, tid, question):
        self.get(tid)["blocker"] = {"kind": "human_gate", "question": question}
        self._set(tid, "needs_human", "orchestrator", question)

    def verify(self, tid, role, evidence):
        """Only the supervisor may close a task, and only with recorded passing evidence."""
        if role != "supervisor":
            raise TaskError(f"role {role!r} cannot set done_verified")
        t = self.get(tid)
        if t["status"] != "in_progress":
            raise TaskError(f"{tid} is {t['status']}; only an in-progress task can be verified")
        ok = (isinstance(evidence, dict) and evidence.get("command") and evidence.get("exit_code") == 0
              and isinstance(evidence.get("passed"), int) and evidence["passed"] > 0 and not evidence.get("failed"))
        if not ok:
            raise TaskError("evidence must record the command, exit_code 0, passed > 0 and no failures")
        t["evidence"].append(dict(evidence, at=now_iso()))
        t["blocker"] = None
        self._set(tid, "done_verified", "supervisor", evidence["command"])

    def summary(self):
        counts = {}
        for t in self.tasks.values():
            counts[t["status"]] = counts.get(t["status"], 0) + 1
        return {"counts": counts, "tasks": [copy.deepcopy({k: t[k] for k in ("id", "goal", "owner", "status",
                                                                           "retries", "blocker", "deps")})
                                            for t in (self.tasks[i] for i in self.state["order"])],
                "last_checkpoint": self.state.get("last_checkpoint")}


class Supervisor:
    """Runs one cycle at a time. `execute` returns evidence; `acceptance` turns evidence into
    {command, exit_code, passed, failed}; `critic` returns a list of blocking findings (empty = no objection)."""

    def __init__(self, graph):
        self.graph = graph

    def cycle(self, execute, acceptance, critic):
        tid = self.graph.select_ready()
        if tid is None:
            return None
        self.graph.start(tid, f"execute {tid}")
        try:
            evidence = execute(tid)
            result = acceptance(tid, evidence)
        except Exception as e:  # record, never hide
            self.graph.record_failure(tid, f"{type(e).__name__}: {e}"[:200], repr(e))
            return tid
        if result.get("exit_code") != 0 or result.get("failed"):
            self.graph.record_failure(tid, result.get("signature", "acceptance failed"), str(result)[:2000])
            return tid
        findings = critic(tid, evidence)
        if findings:
            self.graph.critic_reject(tid, findings)
            return tid
        self.graph.verify(tid, "supervisor", result)
        return tid
