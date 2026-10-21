"""Bounded background job runner for the control room.

One worker thread runs at most one job at a time from a queue of at most MAX_QUEUE jobs, so a long operation never
blocks an HTTP request and the machine is never asked to do two heavy things at once. Jobs exist only in memory (a
server restart forgets the queue; the audit events remain in events.jsonl).

Job kinds (nothing else is accepted):
- `recheck`: re-run one task's acceptance commands (unit tests) and report pass/fail. It never changes the task's
  status: the task graph only lets the supervisor close a task, and a done task is not reopened from the UI. A
  failing recheck is reported as a regression warning. Founder tasks are refused (they run on the founder's Mac).
- `backtest`: one deterministic experiment through `Lab.experiment` (cached if identical).

Every transition emits an audit event (job_queued, job_started, job_finished, job_failed, job_cancelled), which is
what the UI animates. Queued jobs can be cancelled; a running `recheck` can be cancelled (its test process is
terminated); a running `backtest` cannot (it is reported as not cancellable rather than pretending).
"""
import itertools
import re
import resource
import shlex
import subprocess
import threading
import time
from collections import deque

from . import ROOT
from .events import now_iso

MAX_QUEUE = 8
HISTORY = 50
KINDS = ("recheck", "backtest")


class JobError(Exception):
    pass


def _children_cpu():
    r = resource.getrusage(resource.RUSAGE_CHILDREN)
    return r.ru_utime + r.ru_stime


class JobRunner:
    def __init__(self, lab, start=True):
        self.lab = lab
        self.lock = threading.Lock()
        self.cv = threading.Condition(self.lock)
        self.queue = deque()
        self.jobs = {}
        self.order = deque(maxlen=HISTORY)
        self.ids = itertools.count(1)
        self.running = None
        self._proc = None
        self._stop = False
        self.thread = None
        if start:
            self.start()

    def start(self):
        if self.thread is None:
            self.thread = threading.Thread(target=self._loop, name="lql-jobs", daemon=True)
            self.thread.start()

    def stop(self):
        with self.cv:
            self._stop = True
            self.cv.notify_all()

    # -- public API --------------------------------------------------------------------------------------------------
    def submit(self, kind, target=None, params=None):
        if kind not in KINDS:
            raise JobError(f"unknown job kind {kind!r}; allowed: {', '.join(KINDS)}")
        params = params or {}
        if kind == "recheck":
            t = self.lab.tasks.tasks.get(str(target))
            if t is None:
                raise JobError(f"unknown task {target!r}")
            if t["owner"] == "founder":
                raise JobError(f"{target} is a founder task: it runs on the founder's Mac, not from this server")
            if not t["acceptance"]:
                raise JobError(f"{target} has no acceptance commands")
            for cmd in t["acceptance"]:
                if not re.fullmatch(r"python3 (-m unittest [\w. ]+|scripts/[\w]+\.py)", cmd):
                    raise JobError(f"acceptance command not in the allowed form: {cmd}")
            label = f"re-run acceptance for {target}"
        else:
            label = (f"backtest {params.get('strategy', 'sma_trend')} on {params.get('instrument', 'DEMO-ETF-A')} "
                     f"({params.get('source', 'synthetic')})")
        with self.cv:
            if len(self.queue) >= MAX_QUEUE:
                raise JobError(f"queue is full ({MAX_QUEUE} jobs); wait for one to finish")
            dup = [j for j in self.queue if j["kind"] == kind and j["target"] == target and j["params"] == params]
            if dup or (self.running and self.running["kind"] == kind and self.running["target"] == target
                       and self.running["params"] == params):
                raise JobError("an identical job is already queued or running")
            jid = f"j{next(self.ids)}"
            job = {"id": jid, "kind": kind, "target": target, "params": params, "label": label, "status": "queued",
                   "created_at": now_iso(), "started_at": None, "finished_at": None, "duration_s": None,
                   "cpu_s": None, "cancellable": True, "result": None, "error": None, "log": []}
            self.jobs[jid] = job
            self.order.append(jid)
            self.queue.append(job)
            self.cv.notify_all()
        self._emit("job_queued", f"{jid} queued: {label}", job)
        return self.view(job)

    def cancel(self, jid):
        with self.cv:
            job = self.jobs.get(jid)
            if job is None:
                raise JobError(f"unknown job {jid}")
            if job["status"] == "queued":
                self.queue.remove(job)
                job.update(status="cancelled", finished_at=now_iso(), cancellable=False)
                cancelled = True
            elif job["status"] == "running" and job["kind"] == "recheck" and self._proc is not None:
                job["cancel_requested"] = True
                self._proc.terminate()
                cancelled = True
            elif job["status"] == "running":
                raise JobError(f"{jid} is a running {job['kind']} and cannot be cancelled safely; it will finish")
            else:
                raise JobError(f"{jid} is already {job['status']}")
        if job["status"] == "cancelled":
            self._emit("job_cancelled", f"{jid} cancelled before it started", job, "warning")
        return self.view(job)

    def list(self):
        with self.lock:
            return [self.view(self.jobs[j]) for j in reversed(self.order) if j in self.jobs]

    def get(self, jid):
        with self.lock:
            if jid not in self.jobs:
                raise JobError(f"unknown job {jid}")
            return self.view(self.jobs[jid])

    @staticmethod
    def view(job):
        out = {k: v for k, v in job.items() if k != "log"}
        out["log"] = job["log"][-40:]
        if job["status"] == "running" and job["started_at"]:
            out["elapsed_s"] = round(time.time() - job["_t0"], 1) if "_t0" in job else None
        out.pop("_t0", None)
        return out

    # -- worker ------------------------------------------------------------------------------------------------------
    def _loop(self):
        while True:
            with self.cv:
                while not self.queue and not self._stop:
                    self.cv.wait(timeout=1.0)
                if self._stop:
                    return
                job = self.queue.popleft()
                job.update(status="running", started_at=now_iso(), _t0=time.time(),
                           cancellable=job["kind"] == "recheck")
                self.running = job
            self._emit("job_started", f"{job['id']} started: {job['label']}", job)
            cpu0, t0 = _children_cpu(), time.time()
            try:
                job["result"] = self._run_recheck(job) if job["kind"] == "recheck" else self._run_backtest(job)
                ok = job["result"].get("ok", True)
                status = "cancelled" if job.get("cancel_requested") else ("done" if ok else "failed")
            except Exception as e:  # record, never hide
                job["error"] = f"{type(e).__name__}: {e}"[:500]
                status = "failed"
            with self.cv:
                job.update(status=status, finished_at=now_iso(), duration_s=round(time.time() - t0, 2),
                           cancellable=False)
                if job["kind"] == "recheck":
                    job["cpu_s"] = round(_children_cpu() - cpu0, 2)
                self.running = None
                self._proc = None
            kind = {"done": "job_finished", "failed": "job_failed", "cancelled": "job_cancelled"}[status]
            sev = {"done": "info", "failed": "warning", "cancelled": "warning"}[status]
            detail = job["error"] or (job["result"] or {}).get("summary", "")
            self._emit(kind, f"{job['id']} {status} in {job['duration_s']}s: {job['label']}"
                       + (f" ({detail})" if detail else ""), job, sev)

    def _run_recheck(self, job):
        task = self.lab.tasks.get(job["target"])
        passed = failed = 0
        outputs = []
        for cmd in task["acceptance"]:
            job["log"].append(f"$ {cmd}")
            with self.cv:
                self._proc = subprocess.Popen(shlex.split(cmd), cwd=ROOT, stdout=subprocess.PIPE,
                                              stderr=subprocess.STDOUT, text=True)
            try:
                out, _ = self._proc.communicate(timeout=task.get("timeout_s", 600))
            except subprocess.TimeoutExpired:
                self._proc.kill()
                out, _ = self._proc.communicate()
                job["log"].append("timed out")
            rc = self._proc.returncode
            tail = (out or "")[-1500:]
            job["log"].extend(tail.splitlines()[-12:])
            m = re.search(r"Ran (\d+) tests?", tail)
            n = int(m.group(1)) if m else 0
            bad = re.search(r"FAILED \((?:failures=(\d+))?(?:, )?(?:errors=(\d+))?", tail)
            f = (int(bad.group(1) or 0) + int(bad.group(2) or 0)) if bad else 0
            passed += n - f
            failed += f + (1 if rc else 0)
            outputs.append({"cmd": cmd, "exit_code": rc, "tests": n})
            if job.get("cancel_requested"):
                break
        ok = failed == 0 and all(o["exit_code"] == 0 for o in outputs) and passed > 0
        status = task["status"]
        summary = f"{passed} passed, {failed} failed" + ("" if ok else
                                                          f"; task stays {status}: investigate a regression")
        if not ok and not job.get("cancel_requested"):
            self.lab.events.emit("acceptance_regression", f"recheck of {task['id']} failed: {summary}", "critical",
                                 task=task["id"], job=job["id"])
        return {"ok": ok, "passed": passed, "failed": failed, "outputs": outputs, "task_status_unchanged": status,
                "summary": summary}

    def _run_backtest(self, job):
        p = job["params"]
        rec = self.lab.experiment(str(p.get("instrument", "DEMO-ETF-A")), str(p.get("strategy", "sma_trend")),
                                  p.get("params") or {}, str(p.get("source", "synthetic")))
        job["log"].append(f"experiment {rec['id']} cached={rec['cached']}")
        return {"ok": True, "experiment": rec["id"], "cached": rec["cached"], "verdict": rec["critic"]["verdict"],
                "summary": f"critic {rec['critic']['verdict']}" + (" (identical run reused)" if rec["cached"] else "")}

    def _emit(self, kind, msg, job, severity="info"):
        self.lab.events.emit(kind, msg, severity, job=job["id"], job_kind=job["kind"], target=job["target"])
