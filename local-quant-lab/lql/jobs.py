"""Durable, bounded background job runner for the control room.

One worker thread runs at most one job at a time from a queue of at most MAX_QUEUE jobs, so a long operation never
blocks an HTTP request and the machine is never asked to do two heavy things at once.

Every job is persisted as `state/jobs/<id>.json` (atomic write) on every state or stage change, so job history and
result links survive a browser refresh and a server restart. Lifecycle (nothing else is a valid state):

    queued -> running -> succeeded | failed | cancelled          queued -> cancelled

On restart a job found `running` is marked `failed` with `interrupted: true` (it never completed and is never called
successful); a job still `queued` never started, and both job kinds are idempotent (a recheck only reads, a backtest
is cached by its full input hash), so it is re-queued and reported with a `job_recovered` event.

Job kinds (nothing else is accepted):
- `recheck`: re-run one task's acceptance commands (unit tests) and report pass/fail. It never changes the task's
  status: the task graph only lets the supervisor close a task, and a done task is not reopened from the UI. A
  failing recheck is reported as a regression warning. Founder tasks are refused (they run on the founder's Mac).
- `backtest`: one deterministic experiment through `Lab.experiment` (cached if identical). Its artifact is the
  experiment record in state/experiments/.
- `montecarlo`: a seeded block bootstrap of one experiment's daily returns (lql.research.montecarlo). Its artifact is
  state/montecarlo/<id>.json.

Every transition emits an audit event (job_queued, job_started, job_finished, job_failed, job_cancelled,
job_recovered, job_interrupted), which is what the UI animates. Progress is reported only where it is measurable:
stages completed of a known stage list, commands run of a task's command list, or bootstrap paths simulated.
"""
import hashlib
import json
import re
import resource
import shlex
import subprocess
import threading
import time
from collections import deque

from . import ROOT
from .events import atomic_write_json, now_iso

MAX_QUEUE = 8
HISTORY = 200
KINDS = ("recheck", "backtest", "montecarlo")
STATES = ("queued", "running", "succeeded", "failed", "cancelled")
TERMINAL = ("succeeded", "failed", "cancelled")
BACKTEST_STAGES = ("loading data", "running engine", "critic review", "writing artifact")
HEARTBEAT_STALE_S = 5.0


class JobError(Exception):
    pass


def _children_cpu():
    r = resource.getrusage(resource.RUSAGE_CHILDREN)
    return r.ru_utime + r.ru_stime


def request_hash(kind, target, params):
    return hashlib.sha256(json.dumps([kind, target, params], sort_keys=True, default=str).encode()).hexdigest()[:16]


class JobRunner:
    def __init__(self, lab, start=True):
        self.lab = lab
        self.dir = lab.state / "jobs"
        self.lock = threading.Lock()
        self.cv = threading.Condition(self.lock)
        self.queue = deque()
        self.jobs = {}
        self.order = deque(maxlen=HISTORY)
        self.next_id = 1
        self.running = None
        self._proc = None
        self._stop = False
        self.thread = None
        self.heartbeat = None
        self.started_at = None
        self._recover()
        if start:
            self.start()

    def start(self):
        if self.thread is None or not self.thread.is_alive():
            self._stop = False
            self.thread = threading.Thread(target=self._loop, name="lql-jobs", daemon=True)
            self.started_at = now_iso()
            self.thread.start()

    def stop(self, wait=False):
        with self.cv:
            self._stop = True
            self.cv.notify_all()
        if wait and self.thread is not None:
            self.thread.join(timeout=10)

    # -- persistence and recovery --------------------------------------------------------------------------------------
    def _save(self, job):
        job["updated_at"] = now_iso()
        atomic_write_json(self.dir / f"{job['id']}.json", {k: v for k, v in job.items() if not k.startswith("_")})

    def _recover(self):
        if not self.dir.exists():
            return
        loaded = []
        for p in self.dir.glob("j*.json"):
            try:
                job = json.loads(p.read_text())
                n = int(job["id"][1:])
            except (ValueError, KeyError, json.JSONDecodeError):
                self.lab.events.emit("job_store_error", f"unreadable job file {p.name} ignored", "warning")
                continue
            loaded.append((n, job))
        loaded.sort(key=lambda x: x[0])
        if loaded:
            self.next_id = loaded[-1][0] + 1
        for _, job in loaded[-HISTORY:]:
            self.jobs[job["id"]] = job
            self.order.append(job["id"])
            if job["status"] == "running":
                job.update(status="failed", interrupted=True, finished_at=now_iso(), cancellable=False,
                           stage="interrupted",
                           error="interrupted: the server stopped while this job was running; it did not complete")
                self._save(job)
                self._emit("job_interrupted", f"{job['id']} was running when the server stopped: marked failed "
                           f"(not completed): {job['label']}", job, "warning")
            elif job["status"] == "queued":
                job["attempt"] = job.get("attempt", 1) + 1
                self.queue.append(job)
                self._save(job)
                self._emit("job_recovered", f"{job['id']} never started before the restart: re-queued "
                           f"(idempotent {job['kind']})", job)

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
            progress = {"done": 0, "total": len(t["acceptance"]), "unit": "commands"}
        elif kind == "backtest":
            label = (f"backtest {params.get('strategy', 'sma_trend')} on {params.get('instrument', 'DEMO-ETF-A')} "
                     f"({params.get('source', 'synthetic')})")
            progress = {"done": 0, "total": len(BACKTEST_STAGES), "unit": "stages"}
        else:
            from .research.montecarlo import validate_request
            params = validate_request(params)
            self.lab.get_experiment(params["experiment"])          # must exist before it is queued
            label = (f"monte carlo {params['paths']} paths, block {params['block']}, seed {params['seed']} "
                     f"on {params['experiment'][:8]}")
            progress = {"done": 0, "total": params["paths"], "unit": "paths"}
        rh = request_hash(kind, target, params)
        with self.cv:
            if len(self.queue) >= MAX_QUEUE:
                raise JobError(f"queue is full ({MAX_QUEUE} jobs); wait for one to finish")
            active = list(self.queue) + ([self.running] if self.running else [])
            if any(j["request_hash"] == rh for j in active):
                raise JobError("an identical job is already queued or running")
            jid = f"j{self.next_id}"
            self.next_id += 1
            job = {"id": jid, "kind": kind, "target": target, "params": params, "label": label, "status": "queued",
                   "request_hash": rh, "correlation_id": f"{jid}-{rh[:8]}", "attempt": 1,
                   "created_at": now_iso(), "started_at": None, "finished_at": None, "duration_s": None,
                   "cpu_s": None, "stage": "waiting for the worker", "progress": progress, "datasets": [],
                   "artifacts": [], "cancellable": True, "interrupted": False, "result": None, "error": None,
                   "log": []}
            self.jobs[jid] = job
            self.order.append(jid)
            self.queue.append(job)
            self._save(job)
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
                job.update(status="cancelled", finished_at=now_iso(), cancellable=False, stage="cancelled")
                self._save(job)
            elif job["status"] == "running" and job["kind"] == "recheck" and self._proc is not None:
                job["cancel_requested"] = True
                self._proc.terminate()
            elif job["status"] == "running" and job["kind"] == "montecarlo":
                job["cancel_requested"] = True
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

    def wait(self, jid, timeout):
        """Block until a job is terminal or the timeout passes; returns its view either way."""
        t_end = time.time() + timeout
        with self.cv:
            while self.jobs[jid]["status"] not in TERMINAL and time.time() < t_end:
                self.cv.wait(timeout=min(0.5, max(0.01, t_end - time.time())))
            return self.view(self.jobs[jid])

    def health(self):
        alive = bool(self.thread and self.thread.is_alive() and not self._stop)
        age = round(time.time() - self.heartbeat, 1) if self.heartbeat else None
        busy = self.running is not None
        state = "down" if not alive else "busy" if busy else ("up" if age is not None and age < HEARTBEAT_STALE_S
                                                                 else "stale")
        last_ok = next((self.jobs[j] for j in reversed(self.order) if self.jobs[j]["status"] == "succeeded"), None)
        return {"worker": {"state": state, "thread_alive": alive, "heartbeat_age_s": age,
                           "started_at": self.started_at,
                           "running_job": self.running["id"] if busy else None},
                "queue": {"state": "full" if len(self.queue) >= MAX_QUEUE else "ok", "depth": len(self.queue),
                          "max": MAX_QUEUE, "persisted_in": "state/jobs/"},
                "last_successful_job": ({k: last_ok[k] for k in ("id", "kind", "label", "finished_at")}
                                        | {"artifacts": last_ok.get("artifacts", [])}) if last_ok else None}

    @staticmethod
    def view(job):
        out = {k: v for k, v in job.items() if k != "log" and not k.startswith("_")}
        out["log"] = job["log"][-40:]
        if job["status"] == "running" and job.get("_t0"):
            out["elapsed_s"] = round(time.time() - job["_t0"], 1)
        return out

    # -- worker ------------------------------------------------------------------------------------------------------
    def _stage(self, job, name, done=None):
        with self.cv:
            job["stage"] = name
            if done is not None and job.get("progress"):
                job["progress"]["done"] = done
            self._save(job)
            self.cv.notify_all()

    def _loop(self):
        while True:
            with self.cv:
                while not self.queue and not self._stop:
                    self.heartbeat = time.time()
                    self.cv.wait(timeout=1.0)
                if self._stop:
                    return
                self.heartbeat = time.time()
                job = self.queue.popleft()
                job.update(status="running", started_at=now_iso(), _t0=time.time(), stage="started",
                           cancellable=job["kind"] in ("recheck", "montecarlo"))
                self.running = job
                self._save(job)
            self._emit("job_started", f"{job['id']} started: {job['label']}", job)
            cpu0, t0 = _children_cpu(), time.time()
            try:
                run = {"recheck": self._run_recheck, "backtest": self._run_backtest,
                       "montecarlo": self._run_montecarlo}[job["kind"]]
                job["result"] = run(job)
                ok = job["result"].get("ok", True)
                status = "cancelled" if job.get("cancel_requested") else ("succeeded" if ok else "failed")
            except Exception as e:  # record, never hide
                job["error"] = f"{type(e).__name__}: {e}"[:500]
                job["log"].append(job["error"])
                status = "failed"
            with self.cv:
                job.update(status=status, finished_at=now_iso(), duration_s=round(time.time() - t0, 2),
                           cancellable=False, stage={"succeeded": "done", "failed": "failed",
                                                     "cancelled": "cancelled"}[status])
                if job["kind"] == "recheck":
                    job["cpu_s"] = round(_children_cpu() - cpu0, 2)
                job["log"] = job["log"][-200:]
                self.running = None
                self._proc = None
                self.heartbeat = time.time()
                self._save(job)
                self.cv.notify_all()
            kind = {"succeeded": "job_finished", "failed": "job_failed", "cancelled": "job_cancelled"}[status]
            sev = {"succeeded": "info", "failed": "warning", "cancelled": "warning"}[status]
            detail = job["error"] or (job["result"] or {}).get("summary", "")
            self._emit(kind, f"{job['id']} {status} in {job['duration_s']}s: {job['label']}"
                       + (f" ({detail})" if detail else ""), job, sev)

    def _run_recheck(self, job):
        task = self.lab.tasks.get(job["target"])
        passed = failed = 0
        outputs = []
        for i, cmd in enumerate(task["acceptance"]):
            self._stage(job, f"running {cmd}", i)
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
            self._stage(job, f"ran {cmd}", i + 1)
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
        stage = lambda name: self._stage(job, name, BACKTEST_STAGES.index(name))  # noqa: E731
        rec = self.lab.experiment(str(p.get("instrument", "DEMO-ETF-A")), str(p.get("strategy", "sma_trend")),
                                  p.get("params") or {}, str(p.get("source", "synthetic")), on_stage=stage)
        self._stage(job, "writing artifact", len(BACKTEST_STAGES))
        job["log"].append(f"experiment {rec['id']} cached={rec['cached']}")
        job["datasets"] = [rec.get("dataset") or {"instrument": rec["instrument"], "source": rec["source"]}]
        job["artifacts"] = [{"kind": "experiment", "id": rec["id"], "path": f"state/experiments/{rec['id']}.json",
                             "url": f"/api/experiment/{rec['id']}"}]
        return {"ok": True, "experiment": rec["id"], "cached": rec["cached"], "verdict": rec["critic"]["verdict"],
                "summary": f"critic {rec['critic']['verdict']}" + (" (identical run reused)" if rec["cached"] else "")}

    def _run_montecarlo(self, job):
        from .research.montecarlo import run_for_experiment
        p = job["params"]

        def progress(done):
            self._stage(job, "simulating paths", done)
            return bool(job.get("cancel_requested"))
        self._stage(job, "loading experiment returns", 0)
        res = run_for_experiment(self.lab, p, progress=progress)
        if res.get("cancelled"):
            return {"ok": False, "summary": f"cancelled after {res['paths_done']} paths; nothing saved"}
        self._stage(job, "writing artifact", p["paths"])
        job["datasets"] = [res["input"]]
        job["artifacts"] = [{"kind": "montecarlo", "id": res["id"], "path": f"state/montecarlo/{res['id']}.json",
                             "url": f"/api/montecarlo/{res['id']}"}]
        job["log"].append(f"montecarlo {res['id']} cached={res['cached']} in {res['elapsed_s']}s")
        e = res["ending"]
        return {"ok": True, "montecarlo": res["id"], "cached": res["cached"],
                "summary": (f"{p['paths']} paths: median ending x{e['p50']:.3f}, 5th pct x{e['p5']:.3f}; "
                            f"P(max drawdown > 20%) {res['drawdown']['prob_gt_20pct']:.1%}")
                + (" (identical run reused)" if res["cached"] else "")}

    def _emit(self, kind, msg, job, severity="info"):
        self.lab.events.emit(kind, msg, severity, job=job["id"], job_kind=job["kind"], target=job["target"])
