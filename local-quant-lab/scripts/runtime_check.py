#!/usr/bin/env python3
"""Server and worker acceptance against a throwaway state directory and a free port, with synthetic data only.

    python3 scripts/runtime_check.py              # run the checks; exit 0 only if all pass
    python3 scripts/runtime_check.py --simulate-failure   # abort mid-run to prove the servers are still stopped

Never touches state/ in the repository, never imports market data, never submits orders. Every server it starts is
stopped on success, failure and Ctrl+C; the last line reports whether any of them is still running.
"""
import argparse
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TERMINAL = ("succeeded", "failed", "cancelled")
BACKTEST = {"instrument": "DEMO-ETF-A", "strategy": "sma_trend", "source": "synthetic", "params": {}}


class Lab:
    def __init__(self, state):
        self.state, self.procs, self.results = state, [], []
        with socket.socket() as s:                    # a free port, so no leftover server can answer for us
            s.bind(("127.0.0.1", 0))
            self.port = s.getsockname()[1]
        self.base = f"http://127.0.0.1:{self.port}"

    def check(self, name, ok, detail=""):
        self.results.append({"name": name, "ok": bool(ok), "detail": detail})
        print(f"{'PASS' if ok else 'FAIL'} {name}" + (f" - {detail}" if detail else ""), flush=True)

    def call(self, path, body=None):
        req = urllib.request.Request(self.base + path, data=None if body is None else json.dumps(body).encode(),
                                     method="GET" if body is None else "POST",
                                     headers={"Host": f"127.0.0.1:{self.port}", "Content-Type": "application/json",
                                              "X-LQL-Request": "1"})
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())

    def start(self):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", self.port)) == 0:
                raise RuntimeError(f"port {self.port} is already answering: refusing to test someone else's server")
        p = subprocess.Popen([sys.executable, "-m", "lql.server", "--port", str(self.port), "--state-dir", self.state],
                             cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.procs.append(p)
        for _ in range(100):
            if p.poll() is not None:
                raise RuntimeError(f"server exited with {p.returncode}")
            try:
                self.call("/api/status")
                return p
            except OSError:
                time.sleep(0.1)
        raise RuntimeError("server did not answer within 10 s")

    def stop_all(self, sig="term"):
        for p in self.procs:
            if p.poll() is None:
                (p.terminate if sig == "term" else p.kill)()
                try:
                    p.wait(10)
                except subprocess.TimeoutExpired:
                    p.kill(); p.wait(5)

    def submit(self, kind, params):
        r = self.call("/api/jobs", {"kind": kind, "params": params})
        return r.get("id") or r["job"]["id"]

    def wait(self, jid, states=TERMINAL, timeout=60):
        end = time.time() + timeout
        while True:
            j = self.call(f"/api/jobs/{jid}")
            if j["status"] in states or time.time() > end:
                return j
            time.sleep(0.05)

    def events(self, jid=None):
        rows = [json.loads(x) for x in (Path(self.state) / "events.jsonl").read_text().splitlines() if x.strip()]
        return [e for e in rows if jid is None or (e.get("data") or {}).get("job") == jid]


def run(lab, simulate_failure):
    lab.start()
    h = lab.call("/api/health")
    lab.check("1. health reports http, api, worker and queue separately",
              all(isinstance(h.get(k), dict) and "state" in h[k] for k in ("http", "api", "worker", "queue")),
              ", ".join(f"{k}={h[k]['state']}" for k in ("http", "api", "worker", "queue") if k in h))
    if simulate_failure:
        raise RuntimeError("simulated failure after the first server started")

    jid = lab.submit("backtest", BACKTEST)
    seen = []
    end = time.time() + 60
    while time.time() < end:
        s = lab.call(f"/api/jobs/{jid}")["status"]
        if not seen or seen[-1] != s:
            seen.append(s)
        if s in TERMINAL:
            break
        time.sleep(0.02)
    j = lab.call(f"/api/jobs/{jid}")
    lab.check("2. a synthetic backtest is queued and executed by the worker", j["status"] == "succeeded",
              f"{jid}: polled states {' -> '.join(seen)}; stage {j['stage']}; progress {j['progress']}")
    kinds = [e["kind"] for e in lab.events(jid)]
    order_ok = kinds == ["job_queued", "job_started", "job_finished"]
    times_ok = j["created_at"] <= j["started_at"] <= j["finished_at"]
    allowed = {("queued", "running"), ("running", "succeeded"), ("queued", "succeeded")}  # polling may skip running
    poll_ok = all((a, b) in allowed for a, b in zip(seen, seen[1:]))
    lab.check("3. the job moves through valid transitions only", order_ok and times_ok and poll_ok,
              f"events {kinds}; created <= started <= finished: {times_ok}")
    art = j["artifacts"][0]
    rec = lab.call(art["url"])
    on_disk = (Path(lab.state) / "experiments" / f"{art['id']}.json").exists()
    synthetic = all(d.get("data_state") == "SYNTHETIC" for d in j["datasets"])
    lab.check("4. the result artifact is saved and retrievable, labelled SYNTHETIC",
              on_disk and rec.get("id") == art["id"] and synthetic, f"{art['url']} on disk: {on_disk}")
    mc = lab.submit("montecarlo", {"experiment": art["id"], "paths": 500, "block": 20, "seed": 7})
    mcj = lab.wait(mc)
    mca = (mcj.get("artifacts") or [{}])[0]
    mcr = lab.call(mca["url"]) if mca.get("url") else {}
    mc_ok = (mcj["status"] == "succeeded" and mcr.get("id") == mca.get("id") and (mcr.get("paths"), mcr.get("seed")) == (500, 7)
             and (Path(lab.state) / "montecarlo" / f"{mca.get('id')}.json").exists())
    lab.check("4b. a Monte Carlo artifact is saved and retrievable", mc_ok, f"{mc}: {mcj['status']} {mca.get('url')}")

    before = {k: lab.call(f"/api/jobs/{k}") for k in (jid, mc)}
    lab.stop_all("term")
    lab.start()
    after = {k: lab.call(f"/api/jobs/{k}") for k in (jid, mc)}
    same = all(before[k][f] == after[k][f] for k in before for f in ("status", "artifacts", "finished_at", "datasets"))
    lab.check("5. results survive a clean restart unchanged", same and lab.call(art["url"]).get("id") == art["id"])

    # Hard kill while a job is running and another is queued; retry if the long job finished before the kill.
    for attempt in range(1, 4):
        long = lab.submit("montecarlo", {"experiment": art["id"], "paths": 20000, "block": 20, "seed": 100 + attempt})
        queued = lab.submit("backtest", dict(BACKTEST, instrument="DEMO-ETF-B", strategy="vol_scaled_trend"))
        lab.wait(long, ("running",) + TERMINAL, 20)
        at_kill = (lab.call(f"/api/jobs/{long}")["status"], lab.call(f"/api/jobs/{queued}")["status"])
        lab.stop_all("kill")
        if at_kill == ("running", "queued"):
            break
        lab.start()
    else:
        lab.check("6-7. hard-kill scenario reached", False, f"states at kill {at_kill} after 3 attempts")
        return
    lab.start()
    a = lab.call(f"/api/jobs/{long}")
    lab.check("6. the job running at a hard kill is failed + interrupted, never succeeded",
              a["status"] == "failed" and a["interrupted"] is True and not a["artifacts"],
              f"{long}: {a['status']}, interrupted={a['interrupted']}, artifacts={a['artifacts']}")
    b = lab.wait(queued)
    lab.check("7. the job queued at the kill is re-queued once and completes", b["status"] == "succeeded",
              f"{queued}: {b['status']}")
    lab.stop_all("term")                     # one more restart: recovery must not run or re-mark anything again
    lab.start()
    ev_long, ev_q = [e["kind"] for e in lab.events(long)], [e["kind"] for e in lab.events(queued)]
    lab.check("8. audit records agree with the observed transitions",
              ev_long == ["job_queued", "job_started", "job_interrupted"]
              and ev_q == ["job_queued", "job_recovered", "job_started", "job_finished"],
              f"{long}: {ev_long}; {queued}: {ev_q}")
    starts = {}
    for e in lab.events():
        if e["kind"] == "job_started":
            starts[e["data"]["job"]] = starts.get(e["data"]["job"], 0) + 1
    final = {k: lab.call(f"/api/jobs/{k}")["status"] for k in (jid, mc, long, queued)}
    new = lab.submit("backtest", BACKTEST)
    lab.check("9. no job ran twice, no false success, ids keep increasing after recovery",
              max(starts.values()) == 1 and final[long] == "failed" and lab.wait(new)["status"] == "succeeded"
              and int(new[1:]) > max(int(k[1:]) for k in final),
              f"starts per job {starts}; final {final}; next id {new}")
    h = lab.call("/api/health")
    lab.check("worker healthy after recovery", h["worker"]["state"] == "up", f"heartbeat {h['worker'].get('heartbeat_age_s')} s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--simulate-failure", action="store_true")
    a = ap.parse_args()
    with tempfile.TemporaryDirectory(prefix="lql-runtime-") as state:
        (Path(state) / "current_state.json").write_text((ROOT / "state" / "current_state.json").read_text())
        lab = Lab(state)
        err = None
        try:
            run(lab, a.simulate_failure)
        except Exception as e:                  # report, then still stop every server below
            err = f"{type(e).__name__}: {e}"
            print(f"ABORTED {err}", flush=True)
        finally:
            lab.stop_all("term")
        alive = [p.pid for p in lab.procs if p.poll() is None]
        with socket.socket() as s:
            port_free = s.connect_ex(("127.0.0.1", lab.port)) != 0
        lab.check("10. every server this check started is stopped", not alive and port_free,
                  f"{len(lab.procs)} started, alive {alive}, port {lab.port} free: {port_free}")
    failed = [r for r in lab.results if not r["ok"]]
    print(f"\n{len(lab.results) - len(failed)}/{len(lab.results)} checks passed" + (f"; aborted: {err}" if err else ""))
    return 1 if failed or err else 0


if __name__ == "__main__":
    sys.exit(main())
