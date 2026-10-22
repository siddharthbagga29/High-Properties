"""Read models for the control room (the "Perspective Engine" console). Everything here reads existing state:
the task graph file, the audit events, experiment records, research registrations and results, forward-log
directories, snapshot manifests and the paper ledger. Nothing here computes a market number of its own, changes
state, or reveals a credential (credentials are reported only as configured / not configured)."""
import json
import os
import platform
import resource
import shutil
import sys
import time
import urllib.request
from pathlib import Path

from . import ROOT, __version__
from .backtest.engine import config_hash
from .data.providers import SyntheticProvider, SnapshotProvider, ProviderError, SNAPSHOT_DIR
from .data.quality import validate
from .data.schema import ADJ_VERIFIED, REJECTED, dataset_state, eligibility, DATA_STATES, USES
from .orchestrator import TaskGraph

STARTED = time.time()
_cache = {}


def _cached(key, ttl, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    val = fn()
    _cache[key] = (time.time(), val)
    return val


# -- task graph ----------------------------------------------------------------------------------------------------
def graph(lab, jobs=None):
    tg = TaskGraph(lab.tasks.path)          # re-read: verify.py may have written it since the server started
    tasks = tg.tasks
    order = [t for t in tg.state["order"] if t in tasks]
    level = {}

    def depth(tid, seen=()):
        if tid in level:
            return level[tid]
        if tid in seen:
            return 0
        deps = [d for d in tasks[tid]["deps"] if d in tasks]
        level[tid] = 0 if not deps else 1 + max(depth(d, seen + (tid,)) for d in deps)
        return level[tid]

    for tid in order:
        depth(tid)
    dependents = {tid: [] for tid in order}
    for tid in order:
        for d in tasks[tid]["deps"]:
            if d in dependents:
                dependents[d].append(tid)
    job_list = jobs.list() if jobs else []
    nodes = []
    for tid in order:
        t = tasks[tid]
        ev = t["evidence"][-1] if t["evidence"] else None
        tj = [j for j in job_list if j["kind"] == "recheck" and j["target"] == tid]
        nodes.append({
            "id": tid, "goal": t["goal"], "owner": t["owner"], "status": t["status"], "level": level[tid],
            "deps": t["deps"], "dependents": dependents[tid], "retries": t["retries"],
            "retry_budget": t["retry_budget"], "blocker": t["blocker"], "acceptance": t["acceptance"],
            "evidence": ({k: ev.get(k) for k in ("command", "exit_code", "passed", "failed", "at")} if ev else None),
            "evidence_count": len(t["evidence"]), "failures": t["failures"][-5:], "history": t["history"][-12:],
            "last_action": t["last_action"],
            "job": tj[0] if tj and tj[0]["status"] in ("queued", "running") else None,
            "last_job": next((j for j in tj if j["status"] not in ("queued", "running")), None),
            "recheckable": t["owner"] != "founder" and bool(t["acceptance"]),
        })
    edges = [{"from": d, "to": tid} for tid in order for d in tasks[tid]["deps"] if d in tasks]
    owners = {}
    for n in nodes:
        o = owners.setdefault(n["owner"], {"owner": n["owner"], "tasks": 0, "by_status": {}})
        o["tasks"] += 1
        o["by_status"][n["status"]] = o["by_status"].get(n["status"], 0) + 1
    return {"nodes": nodes, "edges": edges, "owners": list(owners.values()),
            "last_checkpoint": tg.state.get("last_checkpoint"), "source": "state/current_state.json"}


# -- data ----------------------------------------------------------------------------------------------------------
def _synthetic_rows(lab):
    def build():
        p = SyntheticProvider()
        out = []
        for inst in lab.settings.risk.allowed_instruments if lab.settings else ():
            if not inst.startswith("DEMO-"):
                continue
            bars = p.bars(inst)
            q = validate(bars, inst)
            out.append({"instrument": inst, "source": "synthetic", "kind": "DEMO_SYNTHETIC", "data_class": "synthetic",
                        "provider": "synthetic", "description": p.info().description, "rows": q.rows,
                        "first": q.first, "last": q.last, "passes_validation": q.passes_validation,
                        "data_state": dataset_state(p.info(), q), "eligibility": eligibility(dataset_state(p.info(), q)),
                        "issues": q.counts(), "sha256": config_hash([b.to_dict() for b in bars]), "adjusted": "n/a",
                        "adjustment_verified": None, "retrieved_at": None, "terms": p.info().terms})
        return out
    return _cached("synthetic", 3600, build)


def _snapshot_rows(lab):
    d = Path(lab.snapshot_dir or SNAPSHOT_DIR)
    rows = []
    for m in sorted(d.glob("*.manifest.json")):
        inst = m.name[: -len(".manifest.json")]
        key = ("snap", inst, m.stat().st_mtime, (d / f"{inst}.csv").stat().st_mtime if (d / f"{inst}.csv").exists() else 0)

        def build(inst=inst):
            p = SnapshotProvider(d)
            try:
                info, man = p.info(inst), p.manifest(inst)
            except (ProviderError, json.JSONDecodeError, KeyError) as e:
                return {"instrument": inst, "source": "snapshot", "error": str(e), "data_class": "invalid",
                        "data_state": REJECTED, "eligibility": eligibility(REJECTED), "passes_validation": False}
            row = {"instrument": inst, "source": "snapshot", "kind": info.kind, "provider": info.provider,
                   "description": info.description, "retrieved_at": info.retrieved_at, "terms": info.terms,
                   "adjusted": info.adjusted, "adjustment_verified": info.adjustment_verified,
                   "adjustment_evidence": info.adjustment_evidence, "sha256": man.get("sha256", "")[:16],
                   "data_class": "verified" if info.adjustment_verified else "provisional"}
            try:
                bars = p.bars(inst)
                q = validate(bars, inst)
                st = dataset_state(info, q)
                row.update(rows=q.rows, first=q.first, last=q.last, passes_validation=q.passes_validation,
                           issues=q.counts(), hash_ok=True, data_state=st, eligibility=eligibility(st))
            except ProviderError as e:
                row.update(error=str(e), hash_ok=False, data_class="invalid", data_state=REJECTED,
                           eligibility=eligibility(REJECTED), passes_validation=False)
            return row
        rows.append(_cached(key, 3600, build))
    return rows


def data_sources(lab):
    return {"datasets": _synthetic_rows(lab) + _snapshot_rows(lab),
            "providers": [
                {"name": "synthetic", "status": "available", "detail": "generated locally, deterministic, not market data"},
                {"name": "csv snapshot", "status": "available" if any(Path(lab.snapshot_dir or SNAPSHOT_DIR).glob("*.csv"))
                 else "empty", "detail": "local files with a SHA-256 manifest; raw files are git-ignored"},
                {"name": "stooq", "status": "key configured" if os.environ.get("STOOQ_API_KEY") else "not configured",
                 "detail": "never called by the server; founder-run script only; terms and adjustment unverified"}],
            "classes": {"synthetic": "generated fixture, not market data",
                        "provisional": "imported real data, split/dividend adjustment NOT verified: no evidence value",
                        "verified": "adjustment verified against an independent reference (still historical, not live)",
                        "live": "not supported in this build"},
            "states": {"SYNTHETIC": "generated fixture: software tests, simulated replay and research runs only",
                       "IMPORTED_UNVERIFIED": "imported, validation not run or not passed: unusable",
                       "PROVISIONAL": "real data, passes validation, adjustment unverified: runs allowed, no evidence value",
                       "VERIFIED_HISTORICAL": "real data, adjustment verified with evidence: research evidence and holdout allowed",
                       "LIVE_FEED": "not supported in this build", "REJECTED": "failed validation or its hash check"},
            "uses": list(USES), "eligibility": {st: eligibility(st) for st in DATA_STATES}}


def series(lab, source, instrument):
    import re
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.\-]{0,19}", instrument or ""):
        raise ValueError("bad instrument name")
    if source == "synthetic":
        if not instrument.startswith("DEMO-"):
            raise ValueError("synthetic series exist only for DEMO-* instruments")
        bars = SyntheticProvider().bars(instrument)
        cls = "synthetic"
    elif source == "snapshot":
        p = SnapshotProvider(lab.snapshot_dir or SNAPSHOT_DIR)
        bars = p.bars(instrument)
        cls = "verified" if p.info(instrument).adjustment_verified else "provisional"
    else:
        raise ValueError("source must be synthetic or snapshot")
    q = validate(bars, instrument)
    return {"instrument": instrument, "source": source, "data_class": cls,
            "dates": [b.event_date.isoformat() for b in bars], "close": [b.close for b in bars],
            "volume": [b.volume for b in bars],
            "issues": [i for i in q.issues if i["code"] != "gap"][:40]}


# -- research ------------------------------------------------------------------------------------------------------
def research(lab):
    rdir = lab.state / "research"
    regs = []
    for p in sorted((rdir / "prereg").glob("*.json")) if (rdir / "prereg").exists() else []:
        try:
            r = json.loads(p.read_text())
        except json.JSONDecodeError:
            continue
        row = {"spec_hash": r["spec_hash"], "name": r["spec"]["name"], "frozen_at": r.get("frozen_at"),
               "universe": r["universe"], "synthetic": r.get("synthetic"), "provisional": r.get("provisional", False),
               "bars": r["bars"], "first": r["first"], "last": r["last"], "pre_holdout_last": r["pre_holdout_last"],
               "candidates": len(r["spec"]["candidates"]), "windows": r["spec"]["windows"],
               "acceptance": r["spec"]["acceptance"], "result": None}
        res = rdir / "results" / f"{r['spec_hash']}.json"
        if res.exists():
            x = json.loads(res.read_text())
            oos = (x.get("out_of_sample") or {}).get("metrics", {})
            row["result"] = {"verdict": x["verdict"], "alpha_status": x["alpha_status"], "reasons": x["reasons"],
                             "checks": x.get("checks", []), "n_folds": x.get("n_folds"),
                             "evidence_label": x.get("evidence_label"), "holdout": x.get("holdout"),
                             "oos": {k: oos.get(k) for k in ("total_return", "sharpe", "max_drawdown", "exits",
                                                             "avg_exposure", "turnover_annual", "costs")},
                             "created_at": x.get("created_at"),
                             "folds": [{"fold": f["fold"], "train": f["train"], "test": f["test"], "selected": f["selected"],
                                        "is_sharpe": (f.get("selected_in_sample") or {}).get("sharpe"),
                                        "oos_sharpe": (f.get("test_metrics") or {}).get("sharpe"),
                                        "oos_return": (f.get("test_metrics") or {}).get("total_return"),
                                        "oos_max_drawdown": (f.get("test_metrics") or {}).get("max_drawdown")}
                                       for f in x.get("folds", [])],
                             "in_sample_note": (x.get("in_sample") or {}).get("note"),
                             "oos_series": x.get("series") if isinstance(x.get("series"), dict) else None}
        regs.append(row)
    hreg = rdir / "holdout_registry.json"
    holdouts = json.loads(hreg.read_text()) if hreg.exists() else {}
    from .strategies import catalog
    return {"experiments": lab.experiments()[:100], "registrations": regs, "strategies": catalog(),
            "instruments": list(lab.settings.risk.allowed_instruments) if lab.settings else [],
            "holdout_registry": [{"fingerprint": k[:16], **v} for k, v in holdouts.items()],
            "ui_policy": "Walk-forward studies and the single-use holdout are run from the CLI on purpose "
                         "(python3 -m lql.cli research ...): the console shows them but cannot start or spend them."}


# -- forward logs --------------------------------------------------------------------------------------------------
def forward_logs(lab):
    out = []
    base = lab.state / "forward"
    for d in sorted(base.iterdir()) if base.exists() else []:
        st = d / "run_state.json"
        if not d.is_dir() or not st.exists():
            continue
        try:
            s = json.loads(st.read_text())
        except json.JSONDecodeError:
            continue
        row = {"dir": d.name, "status": s.get("status"), "error": s.get("error"),
               "evidence_class": s.get("evidence_class"), "last_processed": s.get("last_processed"),
               "last_run_ended": s.get("last_run_ended"), "config": s.get("config")}
        cfg = s.get("config") or {}
        if (d / "ledger.db").exists() and cfg and lab.settings:
            from .execution.forward import ForwardRunner
            try:
                rep = ForwardRunner(lab.settings, d, cfg["universe"], cfg["strategy"], cfg.get("params") or {},
                                    cfg["mode"]).report()
                row["report"] = {k: rep.get(k) for k in ("sessions", "fills", "exits", "risk_rejections",
                                                         "data_events", "errors", "reconciled", "kill_switch",
                                                         "provisional", "metrics", "paper_evidence")}
            except Exception as e:  # show, never hide
                row["report_error"] = f"{type(e).__name__}: {e}"
        out.append(row)
    return {"logs": out, "ui_policy": "Forward logs are started and advanced from the CLI (python3 -m lql.cli "
                                      "forward ...); the console only reads them."}


# -- system --------------------------------------------------------------------------------------------------------
def _ollama():
    def probe():
        binary = shutil.which("ollama") is not None
        try:
            with urllib.request.urlopen("http://127.0.0.1:11434/api/version", timeout=0.4) as r:
                ver = json.loads(r.read().decode()).get("version")
            return {"binary": binary, "endpoint": "reachable", "version": ver}
        except Exception:
            return {"binary": binary, "endpoint": "not reachable on 127.0.0.1:11434", "version": None}
    return _cached("ollama", 30, probe)


def system(lab, jobs=None):
    usage = shutil.disk_usage(lab.state)
    ru = resource.getrusage(resource.RUSAGE_SELF)
    rss_mb = ru.ru_maxrss / (1024 * 1024 if sys.platform == "darwin" else 1024)
    ev = lab.state / "events.jsonl"
    h = lab.hermes().health()
    try:
        load = os.getloadavg()
    except OSError:
        load = None
    return {"app_version": __version__, "python": platform.python_version(), "platform": platform.system(),
            "machine": platform.machine(), "cpus": os.cpu_count(), "load_avg": load,
            "server_uptime_s": round(time.time() - STARTED), "server_peak_rss_mb": round(rss_mb, 1),
            "state_disk_free_gb": round(usage.free / 1e9, 1), "events_log_kb": round(ev.stat().st_size / 1024, 1)
            if ev.exists() else 0,
            "services": [
                {"name": "control room server", "status": "up", "detail": "127.0.0.1 only; host and CSRF guards"},
                {"name": "job worker", "status": (jobs.health()["worker"]["state"] if jobs else "down"),
                 "detail": "1 worker thread, queue max 8; jobs persisted in state/jobs/"},
                {"name": "hermes agent", "status": "available" if h["available"] else "not found",
                 "detail": h["detail"]},
                {"name": "ollama", "status": _ollama()["endpoint"], "detail":
                 ("binary on PATH" if _ollama()["binary"] else "binary not on PATH")
                 + (f", version {_ollama()['version']}" if _ollama()["version"] else "")},
                {"name": "broker", "status": "none", "detail": "no broker adapter exists; live trading absent"}],
            "credentials": {f"{name} ({var})": ("configured" if os.environ.get(var) else "not configured")
                            for name, var in PROVIDER_ENV.items()} | {"broker credentials": "not applicable (no adapter)"},
            "health": health(lab, jobs),
            "execution_mode": lab.settings.execution_mode if lab.settings else "DISABLED",
            "risk_limits": __import__("dataclasses").asdict(lab.settings.risk) if lab.settings else None,
            "costs": __import__("dataclasses").asdict(lab.settings.costs) if lab.settings else None}


# Credentials are read from these environment variables only (never from files in the repository); the API reports
# whether each is set, never its value. A key's provider is known only by the variable it is stored in.
PROVIDER_ENV = {"stooq api key": "STOOQ_API_KEY", "massive api key": "MASSIVE_API_KEY", "fred api key": "FRED_API_KEY",
                "bea api userid": "BEA_API_USERID", "alpaca paper key id": "ALPACA_PAPER_KEY_ID",
                "sec edgar user-agent": "SEC_USER_AGENT"}


def health(lab, jobs, light=False):
    """Separate health states. The web server answering says nothing about the worker, the data or the models."""
    from .backtest.engine import ENGINE_VERSION
    from .research.montecarlo import METHOD_VERSION
    from .strategies import catalog
    jh = jobs.health() if jobs else {"worker": {"state": "down", "thread_alive": False}, "queue": {"state": "unknown"},
                                     "last_successful_job": None}
    out = {
        "http": {"state": "up", "detail": "this response came from the control-room server (127.0.0.1 only)"},
        "api": {"state": "up" if lab.settings else "degraded",
                "detail": "settings valid" if lab.settings else f"settings rejected: {lab.settings_error}"},
        "worker": jh["worker"], "queue": jh["queue"], "last_successful_job": jh["last_successful_job"],
        "research_engine": {"state": "available" if lab.settings else "disabled", "engine_version": ENGINE_VERSION,
                            "montecarlo_method": METHOD_VERSION, "walk_forward": "CLI only (python3 -m lql.cli research)"},
    }
    if light:
        return out
    exps = lab.experiments()
    data = _cached("health-data", 30, lambda: data_sources(lab))
    states = {}
    for d in data["datasets"]:
        states[d.get("data_state", "UNKNOWN")] = states.get(d.get("data_state", "UNKNOWN"), 0) + 1
    h = lab.hermes().health()
    out.update({
        "data_sources": {"synthetic": {"state": "available", "class": "SYNTHETIC"},
                         "snapshots": {"state": f"{sum(1 for d in data['datasets'] if d['source'] == 'snapshot')} "
                                                f"dataset(s)", "states": states},
                         "external": {name: ("key configured (not verified from here)" if os.environ.get(var)
                                             else "not configured") for name, var in PROVIDER_ENV.items()}},
        "model_provider": {"hermes": "available" if h["available"] else "not found", "ollama": _ollama()["endpoint"]},
        "last_research_run": ({k: exps[0][k] for k in ("id", "at", "strategy", "instrument", "source", "verdict")}
                              if exps else None),
        "strategies": [m["key"] for m in catalog()] if callable(catalog) else None,
    })
    return out


# -- overview ------------------------------------------------------------------------------------------------------
def _risk_guards(lab, paper):
    if not lab.settings:
        return []
    L = lab.settings.risk
    gross, conc, dd, day_loss = None, None, None, None
    if paper and paper["equity"]:
        eq = paper["equity"][-1]["equity"]
        peak = max(e["equity"] for e in paper["equity"])
        prev = paper["equity"][-2]["equity"] if len(paper["equity"]) > 1 else eq
        gross = eq - paper["cash"]
        conc = gross / eq if eq > 0 else None
        dd = 1 - eq / peak if peak > 0 else None
        day_loss = max(0.0, prev - eq)
    rows = [("gross exposure", gross, L.max_gross_exposure, "money"),
            ("concentration", conc, L.max_concentration, "pct"),
            ("drawdown", dd, L.max_drawdown, "pct"),
            ("daily loss", day_loss, L.max_daily_loss, "money")]
    return [{"name": n, "value": v, "limit": lim, "unit": u, "ratio": (v / lim if v is not None and lim else None),
             "source": "paper ledger (SIMULATED replay)" if v is not None else "no paper session"}
            for n, v, lim, u in rows] + [
        {"name": "max order notional", "value": None, "limit": L.max_order_notional, "unit": "money", "ratio": None,
         "source": "checked per order"},
        {"name": "orders per window", "value": None, "limit": L.max_orders_per_window, "unit": "count", "ratio": None,
         "source": "checked per order"}]


# -- the brain: neurons formed only by verified work ------------------------------------------------------------------
# Each region grows with one kind of real, recorded evidence. formed = 1 - exp(-units / k): every new piece of evidence
# adds neurons, ever more slowly, and no region is ever "complete". This measures verified work, NOT trading skill:
# the EDGE region grows only from evidence that could indicate a real edge (a CANDIDATE on verified real data, or real
# forward paper sessions on verified data), and stays dark otherwise.
BRAIN_REGIONS = [
    # key, label, unit description, k, share of the brain's neurons
    ("supervisor", "SUPERVISOR · orchestration", "tasks closed with recorded evidence", 24, 0.10),
    ("engineer", "ENGINEER · build", "unit tests passed in verified engineer tasks", 180, 0.14),
    ("reviewer", "REVIEWER · security", "tests passed in the verified security audit", 12, 0.05),
    ("critic", "CRITIC · evidence", "experiments reviewed by the critic (any verdict)", 24, 0.10),
    ("research", "RESEARCH · walk-forward", "out-of-sample folds evaluated + studies frozen", 24, 0.10),
    ("data", "DATA · provenance", "datasets that passed validation (+3 per verified adjustment)", 12, 0.07),
    ("risk", "RISK · control", "orders checked by the risk engine in the paper ledger", 150, 0.09),
    ("paper", "PAPER · simulation", "simulated paper sessions processed", 1500, 0.09),
    ("hermes", "HERMES · memory", "Hermes results accepted after schema checks", 20, 0.06),
    ("edge", "EDGE · proven trading edge", "CANDIDATE verdicts on verified real data x10 + verified real forward sessions",
     60, 0.20),
]


def brain_model(g, exps, reg_rows, fwd_logs, paper, datasets, all_events):
    import math
    nodes = g["nodes"]
    passed = lambda owner: sum((n["evidence"] or {}).get("passed") or 0 for n in nodes  # noqa: E731
                               if n["owner"] == owner and n["status"] == "done_verified")
    real_candidates = sum(1 for e in exps if e["verdict"] == "CANDIDATE" and e.get("source") != "synthetic")
    real_candidates += sum(1 for r in reg_rows if r.get("result") and r["result"]["verdict"] == "CANDIDATE"
                           and not r.get("synthetic") and not r.get("provisional"))
    real_fwd = sum((f.get("report") or {}).get("sessions") or 0 for f in fwd_logs
                   if f.get("evidence_class") == "REAL_FORWARD" and not (f.get("report") or {}).get("provisional"))
    fwd_sessions = sum((f.get("report") or {}).get("sessions") or 0 for f in fwd_logs)
    units = {
        "supervisor": sum(1 for n in nodes if n["status"] == "done_verified"),
        "engineer": passed("engineer"),
        "reviewer": passed("reviewer"),
        "critic": len(exps),
        "research": sum((r.get("result") or {}).get("n_folds") or 0 for r in reg_rows) + len(reg_rows),
        "data": sum(1 for d in datasets if d.get("passes_validation")) + 3 * sum(1 for d in datasets if d.get("data_class") == "verified"),
        "risk": len(paper["orders"]) if paper else 0,
        "paper": (len(paper["equity"]) if paper else 0) + fwd_sessions,
        "hermes": sum(1 for e in all_events if e["kind"] == "hermes_result"),
        "edge": 10 * real_candidates + real_fwd,
    }
    regions = []
    for key, label, unit, k, share in BRAIN_REGIONS:
        u = units[key]
        regions.append({"key": key, "label": label, "unit": unit, "units": u, "k": k, "share": share,
                        "formed": 1 - math.exp(-u / k)})
    total = sum(r["share"] * r["formed"] for r in regions)
    region_of = {"experiment": "critic", "research_walkforward": "research", "research_frozen": "research",
                 "risk_rejected": "risk", "hermes_result": "hermes", "data_lockout": "data", "data_recovered": "data",
                 "order_filled": "paper"}
    growth = []
    for e in all_events[-400:]:
        k = e["kind"]
        d = e.get("data") or {}
        if k == "task_transition" and d.get("status") == "done_verified":
            growth.append({"t": e["t"], "region": "supervisor", "message": e["message"]})
        elif k == "job_finished" and d.get("job_kind") == "recheck":
            growth.append({"t": e["t"], "region": "engineer", "message": e["message"], "strengthen": True})
        elif k in region_of:
            growth.append({"t": e["t"], "region": region_of[k], "message": e["message"]})
    return {"regions": regions, "formed": total, "growth": growth[-24:], "stage": brain_stage(regions),
            "formula": "formed(region) = 1 - exp(-units / k); a region's neurons = its share of the brain",
            "meaning": "Neurons form only from recorded, verified work. They do not measure trading skill: the "
                       "EDGE region stays dark until a CANDIDATE on verified real data or verified real forward "
                       "sessions exist. alpha_status stays unproven."}


# The path to "Ultron": stages of the brain. The first four come from verified work of any kind; the last two only from
# a proven edge (the EDGE region), so synthetic or engineering work can never reach them.
BRAIN_STAGES = [
    ("SEED", "no verified work yet"),
    ("FORMING", "work regions at least 5% formed"),
    ("LEARNING", "work regions at least 20% formed"),
    ("SKILLED", "work regions at least 45% formed"),
    ("PROVEN EDGE", "EDGE core forming: a CANDIDATE on verified real data or verified real forward sessions"),
    ("ULTRON", "EDGE core and every region at least 90% formed"),
]


def brain_stage(regions):
    work = [r for r in regions if r["key"] != "edge"]
    edge = next(r["formed"] for r in regions if r["key"] == "edge")
    core = sum(r["share"] * r["formed"] for r in work) / (sum(r["share"] for r in work) or 1)
    met = [True, core >= 0.05, core >= 0.20, core >= 0.45, edge > 0,
           edge >= 0.9 and all(r["formed"] >= 0.9 for r in work)]
    index = 0
    while index + 1 < len(met) and met[index + 1]:
        index += 1
    nxt = BRAIN_STAGES[index + 1] if index + 1 < len(BRAIN_STAGES) else None
    return {"index": index, "of": len(BRAIN_STAGES), "name": BRAIN_STAGES[index][0], "work_formed": core,
            "next": {"name": nxt[0], "needs": nxt[1]} if nxt else None,
            "stages": [{"name": n, "rule": rule, "met": m} for (n, rule), m in zip(BRAIN_STAGES, met)],
            "face": "eyes form at the first proven edge, brow and nose at EDGE 50%, the mouth at EDGE 90%"}


def desks(roles, g, exps, reg_rows, paper, fwd_logs, datasets, jobs_list, status, decisions, events):
    """One desk per bot on the trading floor: its current or last task, three metrics and its last result."""
    by = {r["key"]: r for r in roles}
    running = [j for j in jobs_list if j["status"] == "running"]
    queued = [j for j in jobs_list if j["status"] == "queued"]
    owner_of = {n["id"]: n["owner"] for n in g["nodes"]}

    def job_desk(j):
        return owner_of.get(j["target"], "engineer") if j["kind"] == "recheck" else "research"   # backtest, montecarlo

    def assigned(key):
        return next((j for j in running if job_desk(j) == key), None) or next((j for j in queued if job_desk(j) == key), None)

    def last_job(key):
        return next((j for j in jobs_list if j["status"] not in ("queued", "running") and job_desk(j) == key), None)

    nodes = g["nodes"]
    done = [n for n in nodes if n["status"] == "done_verified"]
    last_closed = max(done, key=lambda n: (n["evidence"] or {}).get("at") or "", default=None)
    exp0 = exps[0] if exps else None
    reg = reg_rows[-1] if reg_rows else None
    eq = paper["equity"] if paper else []
    out = []

    def add(key, title, task, detail, metrics, result, tone):
        r = by.get(key, {})
        j = assigned(key)
        lj = last_job(key)
        if j:
            task, detail = j["label"], f"{j['id']} {j['status']}" + (f" · {j.get('elapsed_s')}s" if j.get("elapsed_s") is not None else "")
        if lj and not j:
            result, tone = f"{lj['id']} {lj['status']}: {(lj.get('result') or {}).get('summary') or lj.get('error') or ''}", \
                ("ok" if lj["status"] == "succeeded" else "bad" if lj["status"] == "failed" else "muted")
        out.append({"key": key, "name": r.get("name", key.upper()), "title": title, "status": r.get("status", ""),
                    "active": bool(j and j["status"] == "running"), "queued": bool(j and j["status"] == "queued"),
                    "job": j, "task": task, "detail": detail, "metrics": metrics, "result": result, "tone": tone,
                    "attention": bool(r.get("attention"))})

    add("supervisor", "Orchestrator · assigns and verifies", "Supervisor loop", (g["last_checkpoint"] or {}).get("note", ""),
        [["verified", f"{len(done)}/{len(nodes)}"], ["needs human", str(sum(1 for n in nodes if n["status"] == "needs_human"))],
         ["jobs queued", str(len(queued))]],
        f"last closed: {last_closed['id']}" if last_closed else "nothing closed yet", "ok" if last_closed else "muted")
    for key, title in (("engineer", "Builds and tests modules"), ("reviewer", "Security audit")):
        ts = [n for n in nodes if n["owner"] == key]
        tests = sum((n["evidence"] or {}).get("passed") or 0 for n in ts if n["status"] == "done_verified")
        last = max((n for n in ts if n["evidence"]), key=lambda n: n["evidence"].get("at") or "", default=None)
        add(key, title, last["id"] if last else "no task", (last or {}).get("goal", ""),
            [["tasks", f"{sum(1 for n in ts if n['status'] == 'done_verified')}/{len(ts)}"], ["tests passed", str(tests)],
             ["retries", str(sum(n["retries"] for n in ts))]],
            f"{last['id']}: {last['evidence']['passed']} passed, exit {last['evidence']['exit_code']}" if last else "no evidence yet",
            "ok" if last and last["evidence"].get("exit_code") == 0 else "muted")
    verdicts = {}
    for e in exps:
        verdicts[e["verdict"]] = verdicts.get(e["verdict"], 0) + 1
    add("critic", "Reviews every experiment", f"{exp0['strategy']} on {exp0['instrument']}" if exp0 else "no experiment",
        exp0["source"] if exp0 else "", [["reviewed", str(len(exps))], ["candidate", str(verdicts.get("CANDIDATE", 0))],
                                          ["rejected", str(verdicts.get("REJECTED", 0))]],
        f"{exp0['verdict']} · sharpe {exp0['sharpe']:.2f}" if exp0 and exp0.get("sharpe") is not None else
        (exp0["verdict"] if exp0 else "nothing reviewed"),
        {"CANDIDATE": "ok", "NOT_PROVEN": "warn", "REJECTED": "bad"}.get(exp0["verdict"], "muted") if exp0 else "muted")
    rr = (reg or {}).get("result") or {}
    add("research", "Backtests and walk-forward studies", reg["name"] if reg else "no study frozen",
        f"{reg['candidates']} candidates · frozen {reg['spec_hash']}" if reg else "studies run from the CLI",
        [["studies", str(len(reg_rows))], ["folds", str(rr.get("n_folds") or 0)],
         ["oos sharpe", f"{rr['oos']['sharpe']:.2f}" if rr.get("oos") and rr["oos"].get("sharpe") is not None else "N/A"]],
        rr.get("verdict", "not run"), {"CANDIDATE": "ok", "NOT_PROVEN": "warn", "REJECTED": "bad"}.get(rr.get("verdict"), "muted"))
    ds = datasets
    add("data", "Provenance and validation", f"{len(ds)} datasets", status["data_mode"],
        [["pass validation", f"{sum(1 for d in ds if d.get('passes_validation'))}/{len(ds)}"],
         ["provisional", str(sum(1 for d in ds if d.get("data_class") == "provisional"))],
         ["verified", str(sum(1 for d in ds if d.get("data_class") == "verified"))]],
        "feed locked out" if status["data_lockout"] else "all datasets validated" if all(d.get("passes_validation") for d in ds) else "issues found",
        "bad" if status["data_lockout"] else "ok")
    orders = paper["orders"] if paper else 0
    rej = sum(1 for e in events if e["kind"] == "risk_rejected")
    add("risk", "Deterministic pre-trade checks", "Every order passes the risk engine",
        "kill switch ENGAGED" if status["kill_switch"] else "kill switch off",
        [["orders checked", str(orders)], ["rejections", str(rej)], ["kill switch", "ON" if status["kill_switch"] else "off"]],
        "kill switch engaged" if status["kill_switch"] else "limits holding", "bad" if status["kill_switch"] else "ok")
    add("paper", "Simulated paper trading", f"{paper['strategy']} on {paper['instrument']}" if paper else "no paper session",
        f"paper clock {paper['last_processed']}" if paper else "step the replay from the Paper workspace",
        [["sessions", str(len(eq))], ["fills", str(paper["fills"] if paper else 0)],
         ["equity", f"{eq[-1]['equity']:,.0f}" if eq else "N/A"]],
        ("ledger reconciled" if paper["reconciled"] else "LEDGER MISMATCH") if paper else "idle",
        ("ok" if paper["reconciled"] else "bad") if paper else "muted")
    h = by.get("hermes", {})
    add("hermes", "Advisory memory (optional)", "advice only: no route to orders", h.get("status", ""),
        [["accepted", str(sum(1 for e in events if e["kind"] == "hermes_result"))], ["fallbacks", h.get("metric", "0")],
         ["mode", "advisory"]], h.get("status", ""), "ok" if "available" in h.get("status", "") else "warn")
    add("founder", "The human gate", decisions[0]["title"] if decisions else "nothing waiting",
        decisions[0]["detail"] if decisions else "", [["decisions", str(len(decisions))],
                                                       ["tasks need you", by.get("founder", {}).get("metric", "0")],
                                                       ["live trading", "absent"]],
        "waiting on you" if decisions else "clear", "warn" if decisions else "ok")
    return out


def _ops(lab, job_list):
    """Operational counters, all from persisted records: jobs by terminal state (state/jobs), artifacts on disk."""
    by = {}
    for j in job_list:
        by[j["status"]] = by.get(j["status"], 0) + 1
    count = lambda d: sum(1 for _ in (lab.state / d).glob("*.json")) if (lab.state / d).exists() else 0  # noqa: E731
    return {"jobs_succeeded": by.get("succeeded", 0), "jobs_failed": by.get("failed", 0),
            "jobs_interrupted": sum(1 for j in job_list if j.get("interrupted")), "jobs_cancelled": by.get("cancelled", 0),
            "experiments": count("experiments"), "montecarlo_runs": count("montecarlo"),
            "walkforward_results": count("research/results"),
            "note": "job counts cover the last 200 persisted jobs"}


def overview(lab, jobs=None):
    status = lab.status()
    g = graph(lab, jobs)
    data = data_sources(lab)
    res = research(lab)
    fwd = forward_logs(lab)
    paper = lab.paper_state()
    all_events = lab.events.read()
    events = all_events[-300:]
    exps = res["experiments"]
    verdicts = {}
    for e in exps:
        verdicts[e["verdict"]] = verdicts.get(e["verdict"], 0) + 1
    counts = {}
    for n in g["nodes"]:
        counts[n["status"]] = counts.get(n["status"], 0) + 1
    snaps = [d for d in data["datasets"] if d["source"] == "snapshot"]
    prov = [d for d in snaps if d.get("data_class") == "provisional"]
    decisions = []
    for n in g["nodes"]:
        if n["status"] == "needs_human":
            decisions.append({"kind": "task", "ref": n["id"], "title": n["goal"],
                              "detail": (n["blocker"] or {}).get("question", ""), "severity": "warning"})
    for d in prov:
        decisions.append({"kind": "data", "ref": d["instrument"], "title": f"{d['instrument']}: price adjustment unverified",
                          "detail": "Run scripts/check_adjustment.py against an independent reference "
                                    "(docs/MAC_NEXT_STEPS.md step 2). Until then results are PROVISIONAL.",
                          "severity": "warning"})
    if not snaps:
        decisions.append({"kind": "data", "ref": "snapshots", "title": "No real-market data imported",
                          "detail": "Only synthetic data exists. Import CSVs on the Mac (docs/MAC_NEXT_STEPS.md step 1).",
                          "severity": "info"})
    if status["kill_switch"]:
        decisions.append({"kind": "safety", "ref": "kill switch", "title": "Kill switch engaged",
                          "detail": "Releasing it needs a named human operator.", "severity": "critical"})
    if not status["reconciled"]:
        decisions.append({"kind": "safety", "ref": "ledger", "title": "Paper ledger not reconciled",
                          "detail": "Investigate before any further paper step.", "severity": "critical"})
    for e in events[-100:]:
        if e["kind"] == "acceptance_regression":
            decisions.append({"kind": "regression", "ref": e.get("data", {}).get("task"), "title": e["message"],
                              "detail": "A re-run of a verified task's tests failed.", "severity": "critical"})
    job_list = jobs.list() if jobs else []
    active = [j for j in job_list if j["status"] in ("queued", "running")]
    hermes = status["hermes"]
    fallbacks = sum(1 for e in events if e["kind"] in ("fallback_used", "hermes_unavailable"))
    rejections = sum(1 for e in events if e["kind"] == "risk_rejected")
    last_exp = exps[0] if exps else None

    def last_of(*kinds):
        for e in reversed(events):
            if e["kind"] in kinds:
                return e
        return None

    owner = lambda o: [n for n in g["nodes"] if n["owner"] == o]  # noqa: E731
    running_task = next((j for j in active if j["status"] == "running"), None)
    roles = []
    for key, name, tag in (("engineer", "ENGINEER", "builds and tests modules"),
                           ("reviewer", "REVIEWER", "security audit")):
        ts = owner(key)
        done = sum(1 for t in ts if t["status"] == "done_verified")
        rj = running_task if running_task and running_task["kind"] == "recheck" and \
            any(t["id"] == running_task["target"] for t in ts) else None
        roles.append({"key": key, "name": name, "tagline": tag,
                      "status": f"re-running {rj['target']}" if rj else "idle: no job running",
                      "active": bool(rj), "metric": f"{done}/{len(ts)}", "metric_label": "verified",
                      "level": done / len(ts) if ts else None})
    sup_done = counts.get("done_verified", 0)
    roles.insert(0, {"key": "supervisor", "name": "SUPERVISOR", "tagline": "closes tasks only with evidence",
                     "status": ((g["last_checkpoint"] or {}).get("note") or "no checkpoint"), "active": False,
                     "metric": f"{sup_done}/{len(g['nodes'])}", "metric_label": "done_verified",
                     "level": sup_done / len(g["nodes"]) if g["nodes"] else None,
                     "at": (g["last_checkpoint"] or {}).get("at")})
    fd = owner("founder")
    roles.append({"key": "founder", "name": "FOUNDER", "tagline": "the human gate",
                  "status": f"{len(decisions)} decision(s) open" if decisions else "nothing waiting",
                  "active": False, "metric": str(sum(1 for t in fd if t["status"] == "needs_human")),
                  "metric_label": "tasks need you", "level": None, "attention": bool(decisions)})
    roles.append({"key": "critic", "name": "CRITIC", "tagline": "rejects weak evidence",
                  "status": (f"last: {last_exp['verdict']} on {last_exp['strategy']} {last_exp['instrument']}"
                             if last_exp else "no experiment yet"), "active": False,
                  "metric": str(verdicts.get("REJECTED", 0)), "metric_label": f"rejected of {len(exps)}",
                  "level": verdicts.get("REJECTED", 0) / len(exps) if exps else None})
    roles.append({"key": "risk", "name": "RISK", "tagline": "deterministic, final authority",
                  "status": "KILL SWITCH ENGAGED" if status["kill_switch"] else "kill switch off",
                  "active": False, "metric": str(rejections), "metric_label": "rejections logged",
                  "level": None, "attention": status["kill_switch"]})
    roles.append({"key": "data", "name": "DATA", "tagline": "provenance before prices",
                  "status": (f"{len(prov)} provisional snapshot(s)" if prov else
                             f"{len(snaps)} snapshot(s)" if snaps else "synthetic only"),
                  "active": False, "metric": f"{len(data['datasets'])}", "metric_label": "datasets",
                  "level": None, "attention": bool(prov) or status["data_lockout"]})
    roles.append({"key": "hermes", "name": "HERMES", "tagline": "advisory memory layer",
                  "status": "available (advisory only)" if hermes["available"] else "not found: deterministic fallback",
                  "active": False, "metric": str(fallbacks), "metric_label": "fallbacks logged", "level": None})
    regs = res["registrations"]
    bt = running_task if running_task and running_task["kind"] == "backtest" else None
    roles.insert(5, {"key": "research", "name": "RESEARCH", "tagline": "backtests and walk-forward",
                     "status": f"running {bt['label']}" if bt else (f"latest study: {regs[-1]['name']}" if regs else "no study frozen"),
                     "active": bool(bt), "metric": str(len(regs)), "metric_label": "studies frozen", "level": None})
    roles.append({"key": "paper", "name": "PAPER", "tagline": "simulated execution",
                  "status": (f"clock {paper['last_processed']}" if paper else "no paper session"),
                  "active": False, "metric": str(len(paper["equity"]) if paper else 0), "metric_label": "sessions simulated",
                  "level": None, "attention": bool(paper and (paper["kill_switch"] or not paper["reconciled"]))})
    datasets = data["datasets"]
    brain = brain_model(g, exps, regs, fwd["logs"], paper, datasets, all_events)
    desk_list = desks(roles, g, exps, regs, ({**paper, "orders": len(paper["orders"]), "fills": len(paper["fills"])}
                                             if paper else None), fwd["logs"], datasets, job_list, status, decisions,
                      all_events)
    return {"status": status, "roles": roles,
            "task_counts": counts, "graph": g, "decisions": decisions, "jobs": job_list, "active_jobs": len(active),
            "experiments": {"count": len(exps), "verdicts": verdicts, "latest": exps[:8]},
            "research": {"registrations": len(res["registrations"]),
                         "latest": res["registrations"][-1] if res["registrations"] else None,
                         "holdouts_spent": len(res["holdout_registry"])},
            "forward": {"logs": len(fwd["logs"]), "items": fwd["logs"][:4]},
            "data": {"datasets": data["datasets"], "provisional": len(prov), "snapshots": len(snaps)},
            "paper": ({k: paper[k] for k in ("instrument", "strategy", "last_processed", "cash", "positions",
                                             "kill_switch", "reconciled", "data_lockout")}
                      | {"equity": paper["equity"][-260:], "orders": len(paper["orders"]), "fills": len(paper["fills"])}
                      if paper else None),
            "risk_guards": _risk_guards(lab, paper), "events": events[-60:], "brain": brain, "desks": desk_list,
            "ops": _ops(lab, job_list),
            "last_job_event": last_of("job_finished", "job_failed", "job_cancelled", "job_started")}
