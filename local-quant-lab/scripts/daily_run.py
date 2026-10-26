#!/usr/bin/env python3
"""One scheduled pass of the lab, for launchd or cron on the founder's Mac. No language model, no broker, no orders.

    python3 scripts/daily_run.py                         # research jobs + report (synthetic until real data exists)
    python3 scripts/daily_run.py --refresh-data --forward   # also refresh Massive end-of-day data and run the
                                                            # SIMULATED forward paper pass on it

Steps, in order; each records ran / skipped (with the reason) / failed, and a failure never hides the other steps:
  1. data     (--refresh-data) Massive end-of-day import, only with MASSIVE_API_KEY and LQL_MASSIVE_TERMS_OK=yes in the
              environment; a dated copy of what was used goes to data/snapshots/archive/. Imports stay PROVISIONAL.
  2. research one backtest job per strategy and instrument (real snapshots if present, else the synthetic demo), then a
              seeded Monte Carlo job on each. Jobs go to the running control room if it answers, so they appear live;
              otherwise they run in this process and still land in state/jobs/ and the UI history.
  3. forward  (--forward) one idempotent SIMULATED forward pass on the snapshots (lql/execution/forward.py).
  4. report   state/reports/daily/<date>.json (+ latest.json) and one `scheduled_run` audit event.

Exit 0 when nothing failed (skips are not failures), 1 when a step failed, 3 when another pass holds the lock.
Defaults are fixed on purpose (default strategy parameters, seed 7): a daily pass never tunes anything.
"""
import argparse
import fcntl
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from lql import code_fingerprint  # noqa: E402
from lql.data.providers import SNAPSHOT_DIR  # noqa: E402
from lql.events import atomic_write_json, now_iso  # noqa: E402

STRATEGIES = ("sma_trend", "vol_scaled_trend")       # buy_hold is every report's benchmark, not a strategy to run
DEMO = ("DEMO-ETF-A", "DEMO-ETF-B")
MC = {"paths": 1000, "block": 20, "seed": 7}
NY = ZoneInfo("America/New_York")
JOB_TIMEOUT_S = 600


class HttpJobs:
    """The running control room: jobs show up live in the UI. Only used for the default state directory."""

    def __init__(self, base):
        self.base = base.rstrip("/")
        self.host = self.base.split("//", 1)[-1]

    def _call(self, path, body=None):
        req = urllib.request.Request(self.base + path, data=None if body is None else json.dumps(body).encode(),
                                     method="GET" if body is None else "POST",
                                     headers={"Host": self.host, "Content-Type": "application/json", "X-LQL-Request": "1"})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            with e:
                detail = e.read().decode("utf-8", "replace")[:300]
            raise RuntimeError(f"HTTP {e.code}: {detail}") from None

    def status(self):
        try:
            s = self._call("/api/status")
            return s if "execution_mode" in s else None
        except (OSError, RuntimeError, ValueError):
            return None

    def alive(self):
        return self.status() is not None

    def submit(self, kind, params):
        r = self._call("/api/jobs", {"kind": kind, "params": params})
        return r.get("id") or r["job"]["id"]

    def wait(self, jid, timeout=JOB_TIMEOUT_S):
        end = time.time() + timeout
        while True:
            j = self._call(f"/api/jobs/{jid}")
            if j["status"] in ("succeeded", "failed", "cancelled") or time.time() > end:
                return j
            time.sleep(0.5)

    def experiment(self, eid):
        return self._call(f"/api/experiment/{eid}")

    def close(self):
        pass


class LocalJobs:
    """No server running: the same JobRunner in this process, so the history is identical either way."""

    def __init__(self, lab):
        from lql.jobs import JobRunner
        self.lab, self.runner = lab, JobRunner(lab)

    def submit(self, kind, params):
        return self.runner.submit(kind, params=params)["id"]

    def wait(self, jid, timeout=JOB_TIMEOUT_S):
        return self.runner.wait(jid, timeout)

    def experiment(self, eid):
        return self.lab.get_experiment(eid)

    def close(self):
        self.runner.stop(wait=True)


STALE_SERVER = ("the running control room loaded older code than is now on disk (a git pull since it started), so its "
                "results could be wrong: restart it (Ctrl+C in its window, then make run) and run this again")


def pick_jobs(http, lab):
    """(jobs, via, problem). Use the control room when it answers and runs the code on disk; when it runs older code,
    run nothing: a second job runner on the same state directory would collide with its job ids."""
    st = http.status() if http else None
    if st is None:
        return LocalJobs(lab), "this process", None
    if st.get("code_fingerprint") != code_fingerprint():
        return None, "control room server", STALE_SERVER
    return http, "control room server", None


def step(name):
    return {"step": name, "status": "skipped", "started_at": now_iso(), "detail": ""}


def snapshot_symbols(snap_dir, symbols):
    return [s for s in symbols if (Path(snap_dir) / f"{s}.manifest.json").exists() and (Path(snap_dir) / f"{s}.csv").exists()]


def last_closed_session(now):
    """Yesterday in New York: the importer refuses the current session and so does the forward pass."""
    return (now.astimezone(NY).date() - timedelta(days=1)).isoformat()


def refresh_data(a, snap_dir, now, env):
    s = step("data")
    if not a.refresh_data:
        s["detail"] = "not requested (--refresh-data)"
        return s
    if not env.get("MASSIVE_API_KEY"):
        s["detail"] = "MASSIVE_API_KEY is not set in this environment (the value is never printed or stored)"
        return s
    if env.get("LQL_MASSIVE_TERMS_OK") != "yes":
        s["detail"] = "set LQL_MASSIVE_TERMS_OK=yes after reading Massive's current terms"
        return s
    end = last_closed_session(now)
    start = (datetime.fromisoformat(end).date() - timedelta(days=a.history_days)).isoformat()
    cmd = [sys.executable, str(ROOT / "scripts" / "import_massive.py"), *a.symbols, "--from", start, "--to", end,
           "--dir", str(snap_dir), "--i-have-read-the-massive-terms", "--with-dividends"]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=a.import_timeout, env=env)
    s["status"] = "ran" if r.returncode == 0 else "failed"
    s["detail"] = f"import_massive {' '.join(a.symbols)} {start}..{end}: exit {r.returncode}"
    s["tail"] = (r.stdout + r.stderr)[-800:]
    if r.returncode == 0:
        stamp = now.strftime("%Y%m%dT%H%M%SZ")
        arch = Path(snap_dir) / "archive" / stamp
        arch.mkdir(parents=True, exist_ok=True)
        for sym in snapshot_symbols(snap_dir, a.symbols):
            for suffix in (".csv", ".manifest.json"):
                shutil.copy2(Path(snap_dir) / f"{sym}{suffix}", arch / f"{sym}{suffix}")
        s["archive"] = str(arch.relative_to(ROOT)) if arch.is_relative_to(ROOT) else str(arch)
        s["adjustment"] = {sym: json.loads((Path(snap_dir) / f"{sym}.manifest.json").read_text()).get("adjusted")
                           for sym in snapshot_symbols(snap_dir, a.symbols)}
    return s


def research(jobs, snap_dir, symbols):
    s = step("research")
    real = snapshot_symbols(snap_dir, symbols)
    universe = [(sym, "snapshot") for sym in real] or [(sym, "synthetic") for sym in DEMO]
    s["universe"] = [f"{sym} ({src})" for sym, src in universe]
    s["results"], failures = [], 0
    for sym, src in universe:
        for strat in STRATEGIES:
            row = {"instrument": sym, "source": src, "strategy": strat}
            try:
                j = jobs.wait(jobs.submit("backtest", {"instrument": sym, "strategy": strat, "source": src, "params": {}}))
                row["job"], row["status"] = j["id"], j["status"]
                if j["status"] != "succeeded":
                    row["error"] = j.get("error")
                    failures += 1
                else:
                    eid = j["artifacts"][0]["id"]
                    rec = jobs.experiment(eid)
                    net, bench = rec["report"]["net"], rec["report"]["benchmark"]
                    row.update(experiment=eid, cached=j["result"]["cached"], verdict=rec["critic"]["verdict"],
                               data_state=(rec.get("dataset") or {}).get("data_state"),
                               net={k: net.get(k) for k in ("total_return", "cagr", "sharpe", "max_drawdown", "n_fills")},
                               buy_hold={k: bench.get(k) for k in ("total_return", "cagr", "sharpe", "max_drawdown")})
                    m = jobs.wait(jobs.submit("montecarlo", dict(MC, experiment=eid)))
                    row["montecarlo"] = {"job": m["id"], "status": m["status"],
                                         "summary": (m.get("result") or {}).get("summary") or m.get("error")}
                    failures += m["status"] != "succeeded"
            except Exception as e:                       # one bad request must not stop the rest of the pass
                row["status"], row["error"] = "failed", f"{type(e).__name__}: {e}"[:300]
                failures += 1
            s["results"].append(row)
    s["status"] = "failed" if failures else "ran"
    states = {}
    for row in s["results"]:
        if row.get("data_state"):
            states[row["data_state"]] = states.get(row["data_state"], 0) + 1
    on = (f"real snapshots ({', '.join(f'{n} {k}' for k, n in sorted(states.items())) or 'data state unknown'})"
          if real else "the synthetic demo: no real data imported yet")
    s["detail"] = (f"{len(s['results'])} backtests on {on}"
                   + (f"; {failures} failed" if failures else ""))
    return s


def forward(a, lab, snap_dir):
    s = step("forward")
    if not a.forward:
        s["detail"] = "not requested (--forward)"
        return s
    have = snapshot_symbols(snap_dir, a.symbols)
    missing = sorted(set(a.symbols) - set(have))
    if missing:
        s["detail"] = f"no snapshot for {', '.join(missing)}: the forward pass needs real end-of-day data for every instrument"
        return s
    from lql.cli import _forward
    ns = argparse.Namespace(action="run", source="snapshot", mode="FORWARD", instruments=",".join(a.symbols),
                            strategy=a.forward_strategy, param=[], days=0, dir=None, reason="", by="")
    try:
        res = _forward(lab, ns)
        s["status"], s["result"] = "ran", res
        s["detail"] = f"SIMULATED forward pass, {a.forward_strategy} on {', '.join(a.symbols)}"
    except SystemExit as e:                               # ForwardError (stale data, busy, kill switch) is reported, not raised
        s["status"], s["detail"] = "failed", str(e)[:400]
    except Exception as e:
        s["status"], s["detail"] = "failed", f"{type(e).__name__}: {e}"[:400]
    return s


def main(argv=None, env=None, now=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--symbols", default="SPY,QQQ,IWM,TLT", help="comma-separated; real data only when imported")
    ap.add_argument("--refresh-data", action="store_true")
    ap.add_argument("--history-days", type=int, default=700,
                    help="calendar days of history; kept inside the Basic plan's 2-year window")
    ap.add_argument("--import-timeout", type=int, default=1800)
    ap.add_argument("--forward", action="store_true")
    ap.add_argument("--forward-strategy", default="sma_trend")
    ap.add_argument("--server", default="http://127.0.0.1:8765", help="use this control room if it answers")
    ap.add_argument("--no-server", action="store_true", help="always run jobs in this process")
    ap.add_argument("--state-dir", help="another state directory (tests, demos); never uses the server")
    ap.add_argument("--snapshot-dir", help="default data/snapshots")
    a = ap.parse_args(argv)
    a.symbols = [x.strip().upper() for x in a.symbols.split(",") if x.strip()]
    if env is None:                                     # scheduled runs: keys from the environment or the env file
        from lql import envfile
        print(envfile.describe(envfile.load()), file=sys.stderr)
    env = dict(os.environ if env is None else env)
    now = now or datetime.now(timezone.utc)

    from lql.lab import Lab
    lab = Lab(state_dir=a.state_dir, snapshot_dir=a.snapshot_dir)
    snap_dir = Path(a.snapshot_dir or SNAPSHOT_DIR)
    lock_path = lab.state / "daily_run.lock"
    lock = open(lock_path, "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        print("another daily_run pass holds the lock; nothing done")
        return 3
    t0 = time.time()
    report = {"started_at": now_iso(), "date": now.astimezone(NY).date().isoformat(), "execution_mode": "SIMULATED",
              "live_trading": "absent", "symbols": a.symbols, "steps": []}
    try:
        report["steps"].append(refresh_data(a, snap_dir, now, env))
        http = None if (a.state_dir or a.no_server) else HttpJobs(a.server)
        jobs, report["jobs_via"], problem = pick_jobs(http, lab)
        if problem:
            s = step("research")
            s.update(status="failed", detail=problem)
            report["steps"].append(s)
        else:
            try:
                report["steps"].append(research(jobs, snap_dir, a.symbols))
            finally:
                jobs.close()
        report["steps"].append(forward(a, lab, snap_dir))
    finally:
        report["finished_at"], report["elapsed_s"] = now_iso(), round(time.time() - t0, 1)
        failed = [s["step"] for s in report["steps"] if s["status"] == "failed"]
        report["status"] = "failed" if failed else "ok"
        out = lab.state / "reports" / "daily"
        out.mkdir(parents=True, exist_ok=True)
        atomic_write_json(out / f"{report['date']}.json", report)
        atomic_write_json(out / "latest.json", report)
        summary = ", ".join(f"{s['step']} {s['status']}" for s in report["steps"])
        lab.events.emit("scheduled_run", f"daily run {report['status']}: {summary}",
                        "warning" if failed else "info", date=report["date"], steps=summary,
                        report=f"state/reports/daily/{report['date']}.json")
        fcntl.flock(lock, fcntl.LOCK_UN)
        lock.close()
    print(json.dumps({"status": report["status"], "jobs_via": report.get("jobs_via"),
                      "steps": {s["step"]: f"{s['status']}: {s['detail']}" for s in report["steps"]},
                      "report": str(out / f"{report['date']}.json")}, indent=1))
    return 1 if report["status"] == "failed" else 0


if __name__ == "__main__":
    sys.exit(main())
