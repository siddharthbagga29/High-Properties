"""Application facade used by the CLI and the localhost server. Every number the dashboard shows comes from here,
and everything here comes from the data, backtest, ledger, task graph and event log modules."""
import hashlib
import json
import threading
import time
from pathlib import Path

from . import ROOT, __version__, config
from .agents.hermes_adapter import HermesAdapter
from .backtest.engine import evaluate, ENGINE_VERSION, config_hash
from .data.providers import SyntheticProvider, SnapshotProvider, ProviderError
from .data.quality import validate
from .events import EventLog, atomic_write_json, now_iso
from .execution.ledger import Ledger
from .execution.paper import PaperSession
from .orchestrator import TaskGraph
from .orchestrator.critic import review
from .strategies import create, catalog

SOURCES = ("synthetic", "snapshot")


class LabError(Exception):
    pass


class Lab:
    def __init__(self, state_dir=None, settings_path=None, snapshot_dir=None):
        self.state = Path(state_dir or ROOT / "state")
        self.state.mkdir(parents=True, exist_ok=True)
        self.events = EventLog(self.state / "events.jsonl")
        self.snapshot_dir = snapshot_dir
        self.lock = threading.RLock()  # one writer at a time for paper/ledger operations
        self.settings_error = None
        try:
            self.settings = config.load(settings_path) if settings_path else config.load()
        except config.ConfigError as e:
            self.settings, self.settings_error = None, str(e)
            self.events.emit("config_error", f"settings rejected, trading disabled: {e}", "critical")
        self.tasks = TaskGraph(self.state / "current_state.json", self.events)
        self.exp_dir = self.state / "experiments"
        self._hermes = None
        self._hermes_health = None

    def _need_settings(self):
        if self.settings is None:
            raise LabError(f"settings invalid, everything that trades is disabled: {self.settings_error}")
        return self.settings

    # -- data -----------------------------------------------------------------------------------------------------
    def provider(self, source):
        if source == "synthetic":
            return SyntheticProvider()
        if source == "snapshot":
            return SnapshotProvider(self.snapshot_dir) if self.snapshot_dir else SnapshotProvider()
        raise LabError(f"unknown source {source!r}; choose {SOURCES}")

    def load(self, instrument, source="synthetic"):
        p = self.provider(source)
        try:
            bars = p.bars(instrument)
            info = p.info(instrument) if source == "snapshot" else p.info()
        except (ProviderError, FileNotFoundError) as e:
            self.events.emit("data_error", f"{source}/{instrument}: {e}", "warning")
            raise LabError(str(e))
        q = validate(bars, instrument)
        if not q.tradable:
            self.events.emit("data_quality", f"{instrument} from {source} failed validation: {q.counts()}", "critical")
        return bars, info, q

    # -- research -------------------------------------------------------------------------------------------------
    def experiment(self, instrument, strategy="sma_trend", params=None, source="synthetic"):
        s = self._need_settings()
        params = params or {}
        bars, info, q = self.load(instrument, source)
        if not q.tradable:
            raise LabError(f"data failed validation: {q.counts()}")
        strat = create(strategy, **params)
        data_sha = info.content_sha256 or config_hash([b.to_dict() for b in bars])
        key = config_hash({"instrument": instrument, "strategy": strategy, "version": strat.meta.version,
                           "params": strat.meta.params, "source": source, "data": data_sha,
                           "costs": config.as_dict(s)["costs"], "risk": config.as_dict(s)["risk"],
                           "cash": s.initial_cash, "engine": ENGINE_VERSION})
        path = self.exp_dir / f"{key}.json"
        if path.exists():  # same inputs, same result: never rerun or duplicate an experiment
            rec = json.loads(path.read_text())
            rec["cached"] = True
            return rec
        t0 = time.time()
        rep = evaluate(bars, strat, s, info, seed=7 if source == "synthetic" else None)
        verdict = review(rep, create(strategy, **params), bars)
        rep["alpha_status"] = verdict["alpha_status"]
        rec = {"id": key, "created_at": now_iso(), "instrument": instrument, "source": source,
               "strategy": strategy, "params": strat.meta.params, "elapsed_s": round(time.time() - t0, 3),
               "quality": q.to_dict(), "report": rep, "critic": verdict}
        atomic_write_json(path, rec)
        with open(self.state / "research_runs.jsonl", "a") as f:
            f.write(json.dumps(self._index_row(rec), sort_keys=True) + "\n")
        self.events.emit("experiment", f"{strategy}{strat.meta.params} on {instrument} ({source}): critic "
                         f"{verdict['verdict']}, alpha_status {verdict['alpha_status']}", experiment=key)
        rec["cached"] = False
        return rec

    @staticmethod
    def _index_row(rec):
        n = rec["report"]["net"]
        return {"id": rec["id"], "at": rec["created_at"], "instrument": rec["instrument"], "source": rec["source"],
                "strategy": rec["strategy"], "params": rec["params"], "verdict": rec["critic"]["verdict"],
                "alpha_status": rec["critic"]["alpha_status"], "total_return": n.get("total_return"),
                "sharpe": n.get("sharpe"), "max_drawdown": n.get("max_drawdown"),
                "round_trips": n.get("round_trips"), "config_hash": rec["report"]["config_hash"],
                "result_hash": rec["report"]["result_hash"]}

    def experiments(self):
        if not self.exp_dir.exists():
            return []
        rows = [self._index_row(json.loads(p.read_text())) for p in self.exp_dir.glob("*.json")]
        return sorted(rows, key=lambda r: r["at"], reverse=True)

    def get_experiment(self, eid):
        if not eid.isalnum():
            raise LabError("bad experiment id")
        p = self.exp_dir / f"{eid}.json"
        if not p.exists():
            raise LabError(f"no experiment {eid}")
        return json.loads(p.read_text())

    # -- paper (SIMULATED replay) ---------------------------------------------------------------------------------
    def _session(self, instrument, strategy):
        s = self._need_settings()
        db = self.state / "paper.db"
        ledger = Ledger(db, s.initial_cash)
        cur = (ledger.get("paper_instrument"), ledger.get("paper_strategy"))
        if cur == (None, None):
            ledger.set("paper_instrument", instrument)
            ledger.set("paper_strategy", strategy)
        elif cur != (instrument, strategy):
            raise LabError(f"paper ledger is bound to {cur[1]} on {cur[0]}; archive it first (paper_archive)")
        return PaperSession(s, ledger, create(strategy), self.events)

    def paper_step(self, steps=20, instrument="DEMO-ETF-A", strategy="sma_trend", corrupt_next=False):
        with self.lock:
            sess = self._session(instrument, strategy)
            bars, _, _ = self.load(instrument, "synthetic")
            last = sess.ledger.get("last_processed")
            done = [b for b in bars if last and b.event_date.isoformat() <= last]
            todo = [b for b in bars if not last or b.event_date.isoformat() > last]
            sess.run(done)  # rebuilds strategy history only; processed sessions are skipped, never re-traded
            out = []
            for i, b in enumerate(todo[:steps]):
                if corrupt_next and i == 0:
                    from dataclasses import replace
                    b = replace(b, high=b.low * 0.5)  # deliberately corrupt feed for the demo/test
                out.append(sess.step(b))
            return {"processed": len(out), "results": out[-5:], "remaining": max(0, len(todo) - steps)}

    def paper_archive(self):
        with self.lock:
            db = self.state / "paper.db"
            if db.exists():
                dest = self.state / f"paper-{time.strftime('%Y%m%dT%H%M%S')}.db"
                db.rename(dest)
                self.events.emit("paper_archived", f"paper ledger archived to {dest.name}", "warning")
                return dest.name
            return None

    def kill(self, reason):
        with self.lock:
            s = self._need_settings()
            ledger = Ledger(self.state / "paper.db", s.initial_cash)
            sess = PaperSession(s, ledger, create(ledger.get("paper_strategy") or "sma_trend"), self.events)
            return sess.kill(reason or "operator")

    def release(self, by):
        with self.lock:
            s = self._need_settings()
            ledger = Ledger(self.state / "paper.db", s.initial_cash)
            PaperSession(s, ledger, create(ledger.get("paper_strategy") or "sma_trend"), self.events).release(by)

    def paper_state(self):
        db = self.state / "paper.db"
        if not db.exists() or self.settings is None:
            return None
        ledger = Ledger(db, self.settings.initial_cash)
        marks = ledger.marks()
        return {"instrument": ledger.get("paper_instrument"), "strategy": ledger.get("paper_strategy"),
                "last_processed": ledger.get("last_processed"), "cash": ledger.cash(),
                "positions": ledger.positions(), "kill_switch": ledger.get("kill_switch"),
                "kill_reason": ledger.get("kill_reason"), "reconciled": ledger.get("reconciled"),
                "data_lockout": ledger.get("data_lockout", False),
                "equity": [{"date": m["date"], "equity": m["equity"]} for m in marks],
                "orders": ledger.orders(limit=200), "fills": ledger.fills(limit=200)}

    # -- status ---------------------------------------------------------------------------------------------------
    def hermes(self):
        if self._hermes is None:
            self._hermes = HermesAdapter(events=self.events)
        return self._hermes

    def data_posture(self):
        """Short, honest label for the data the lab can use. Never says live: no live feed exists."""
        from .data.providers import SNAPSHOT_DIR
        d = Path(self.snapshot_dir or SNAPSHOT_DIR)
        snaps = sorted(d.glob("*.manifest.json")) if d.exists() else []
        if not snaps:
            return "synthetic only (not market data)"
        prov = 0
        for m in snaps:
            try:
                man = json.loads(m.read_text())
            except (OSError, json.JSONDecodeError):
                prov += 1
                continue
            if not (man.get("adjusted") == "split_and_dividend_adjusted" and man.get("adjustment_evidence")):
                prov += 1
        return (f"{len(snaps)} snapshot(s), {prov} provisional + synthetic" if prov
                else f"{len(snaps)} verified snapshot(s) + synthetic; historical, not live")

    def hermes_health(self, ttl=60):
        """`hermes --version` spawns a process; cache it so polling the status never spawns one per request."""
        now = time.time()
        if self._hermes_health is None or now - self._hermes_health[0] > ttl:
            self._hermes_health = (now, self.hermes().health())
        return self._hermes_health[1]

    def status(self):
        paper = self.paper_state()
        h = self.hermes_health()
        return {"app_version": __version__, "engine_version": ENGINE_VERSION,
                "execution_mode": self.settings.execution_mode if self.settings else "DISABLED (invalid settings)",
                "live_trading": "absent from this build", "broker": "none connected",
                "data_mode": self.data_posture(),
                "settings_ok": self.settings is not None, "settings_error": self.settings_error,
                "kill_switch": bool(paper and paper["kill_switch"]),
                "data_lockout": bool(paper and paper["data_lockout"]),
                "reconciled": paper["reconciled"] if paper else True,
                "paper_clock": paper["last_processed"] if paper else None,
                "hermes": {"available": h["available"], "detail": h["detail"],
                           "fallback": "deterministic fallback active" if not h["available"] else "advisory only"},
                "server_time": now_iso()}

    def dashboard(self, eid=None):
        exps = self.experiments()
        rec = None
        if eid:
            rec = self.get_experiment(eid)
        elif exps:
            rec = self.get_experiment(exps[0]["id"])
        return {"status": self.status(), "experiment": rec, "experiments": exps[:50], "paper": self.paper_state(),
                "events": self.events.read(limit=200), "tasks": self.tasks.summary(), "strategies": catalog(),
                "risk_limits": config.as_dict(self.settings)["risk"] if self.settings else None,
                "instruments": list(self.settings.risk.allowed_instruments) if self.settings else []}


def file_sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()
