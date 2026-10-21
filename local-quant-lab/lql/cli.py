"""Command line: python3 -m lql.cli <command>. Every command works offline with no API keys."""
import argparse
import json
import sys

from . import ROOT


def _print(obj):
    print(json.dumps(obj, indent=1, default=str))


SEED_TASKS = [
    ("M0-skeleton", "Runnable skeleton, config, event log", "engineer", [], ["python3 -m unittest tests.test_config"]),
    ("M1-data", "Synthetic/snapshot/Stooq providers with validation", "engineer", ["M0-skeleton"],
     ["python3 -m unittest tests.test_data"]),
    ("M2-backtest", "Event-driven backtester, metrics, splits, sensitivity", "engineer", ["M1-data"],
     ["python3 -m unittest tests.test_backtest"]),
    ("M3-risk-paper", "Risk engine, ledger, SIMULATED paper session, kill switch", "engineer", ["M2-backtest"],
     ["python3 -m unittest tests.test_risk tests.test_execution"]),
    ("M4-loop-hermes", "Task graph, critic, Hermes adapter + fallback, skill learning", "engineer", ["M3-risk-paper"],
     ["python3 -m unittest tests.test_orchestrator tests.test_hermes tests.test_learning"]),
    ("M5-control-room", "Localhost dashboard served from real state", "engineer", ["M4-loop-hermes"],
     ["python3 -m unittest tests.test_server"]),
    ("M6-handoff", "Docs, export, acceptance checklist", "engineer", ["M5-control-room"],
     ["python3 -m unittest tests.test_export"]),
    ("M7-security-audit", "Secret scan, no broker endpoints, no live mode, strategy sandbox, no order route",
     "reviewer", ["M6-handoff"], ["python3 -m unittest tests.test_security"]),
    ("M8-portfolio", "Multi-instrument portfolio backtester and second strategy", "engineer", ["M2-backtest"],
     ["python3 -m unittest tests.test_portfolio tests.test_strategies"]),
    ("M9-walkforward", "Pre-registered walk-forward research with one-shot holdout", "engineer",
     ["M8-portfolio", "M4-loop-hermes"], ["python3 -m unittest tests.test_walkforward"]),
    ("M10-forward-log", "Restartable paper-trading forward log with evidence classes", "engineer",
     ["M8-portfolio", "M3-risk-paper"], ["python3 -m unittest tests.test_forward"]),
    ("M11-data-audit", "Real-data workflow audit: vendor access, adjustment status, provisional labelling, repo hygiene",
     "engineer", ["M9-walkforward", "M10-forward-log"], ["python3 -m unittest tests.test_data_audit"]),
    ("M12-console", "Perspective Engine console: read models, bounded job runner, UI routes, front-end unit tests",
     "engineer", ["M5-control-room", "M11-data-audit"], ["python3 -m unittest tests.test_console"]),
    ("H1-hermes-mac", "Install Hermes on the founder's Mac with a local 64K-context model and run "
     "scripts/hermes_check.py", "founder", ["M4-loop-hermes"], ["python3 scripts/hermes_check.py"]),
]


def _forward(lab, a):
    from .data.providers import SyntheticProvider, SnapshotProvider, combine_info
    from .execution.forward import ForwardRunner, ForwardError
    s = lab._need_settings()
    names = [x.strip() for x in a.instruments.split(",") if x.strip()]
    params = {kv.split("=")[0]: int(kv.split("=")[1]) for kv in a.param}
    directory = a.dir or lab.state / "forward" / f"{a.source}-{a.mode.lower()}"
    runner = ForwardRunner(s, directory, names, a.strategy, params, a.mode, lab.events)
    try:
        if a.action == "report":
            return runner.report()
        if a.action == "kill":
            return {"cancelled": runner.kill(a.reason or "operator")}
        if a.action == "release":
            runner.release(a.by)
            return {"released_by": a.by}

        def loader():
            if a.source == "synthetic":
                p = SyntheticProvider(n_days=a.days)
                return {i: p.bars(i) for i in names}, p.info()
            p = SnapshotProvider(lab.snapshot_dir) if lab.snapshot_dir else SnapshotProvider()
            return {i: p.bars(i) for i in names}, combine_info([p.info(i) for i in names])
        return runner.run_once(loader)
    except ForwardError as e:
        raise SystemExit(f"forward: {e}")


def _research(lab, a):
    import copy
    from .data.providers import SyntheticProvider, SnapshotProvider, combine_info
    from .data.quality import validate
    from .research import walkforward as wf
    s = lab._need_settings()
    directory = lab.state / "research"
    names = [x.strip() for x in a.instruments.split(",") if x.strip()]
    if a.source == "synthetic":
        p = SyntheticProvider(n_days=a.days)
        data, info = {i: p.bars(i) for i in names}, p.info()
    else:
        p = SnapshotProvider(lab.snapshot_dir) if lab.snapshot_dir else SnapshotProvider()
        data = {i: p.bars(i) for i in names}
        info = combine_info([p.info(i) for i in names])
    if a.start:
        data = {i: [b for b in bars if b.event_date.isoformat() >= a.start] for i, bars in data.items()}
    for i, bars in data.items():
        if not bars:
            raise SystemExit(f"no bars for {i} on or after {a.start}")
        if not validate(bars, i).tradable:
            raise SystemExit(f"data for {i} failed validation")
    if a.action == "show":
        return json.loads((directory / "results" / f"{a.spec}.json").read_text())
    spec = copy.deepcopy(wf.DEFAULT_SPEC)
    spec["name"] = a.name
    reg = wf.freeze(spec, data, s, directory, info, lab.events) if a.action == "run" \
        else wf.load_registration(directory, a.spec)
    if a.action == "run":
        rep = wf.run_walk_forward(reg, data, s, directory, lab.events)
    else:
        rep = wf.evaluate_holdout(reg, data, s, directory, lab.events)
    keep = ("spec_hash", "evidence_label", "provisional", "verdict", "alpha_status", "reasons", "synthetic", "n_folds", "holdout_contaminated_by",
            "holdout")
    out = {k: rep.get(k) for k in keep}
    out["checks"] = [(c["name"], c["passed"]) for c in rep.get("checks", [])]
    oos = rep.get("out_of_sample")
    if oos:
        out["out_of_sample"] = {k: oos["metrics"].get(k) for k in ("total_return", "sharpe", "max_drawdown", "exits",
                                                                  "avg_exposure", "turnover_annual", "costs")}
        out["benchmark"] = {k: oos["benchmark"].get(k) for k in ("total_return", "sharpe", "max_drawdown")}
        out["bootstrap"] = oos["bootstrap"]
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(prog="lql", description="Local Quant Lab (SIMULATED only; no live trading exists)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("backtest")
    b.add_argument("--instrument", default="DEMO-ETF-A")
    b.add_argument("--strategy", default="sma_trend")
    b.add_argument("--source", default="synthetic", choices=("synthetic", "snapshot"))
    b.add_argument("--param", action="append", default=[], help="name=int, e.g. fast=50")
    p = sub.add_parser("paper")
    p.add_argument("--steps", type=int, default=50)
    p.add_argument("--instrument", default="DEMO-ETF-A")
    p.add_argument("--strategy", default="sma_trend")
    rs = sub.add_parser("research", help="pre-registered walk-forward study (freeze, run) and the one-shot holdout")
    rs.add_argument("action", choices=("run", "holdout", "show"))
    rs.add_argument("--source", default="synthetic", choices=("synthetic", "snapshot"))
    rs.add_argument("--instruments", default="DEMO-ETF-A,DEMO-ETF-B")
    rs.add_argument("--days", type=int, default=1800, help="synthetic series length")
    rs.add_argument("--start", help="first session date YYYY-MM-DD; use a common start so every instrument exists")
    rs.add_argument("--name", default="wf-default")
    rs.add_argument("--spec", help="spec hash (holdout/show)")
    fw = sub.add_parser("forward", help="restartable multi-instrument paper forward log (SIMULATED)")
    fw.add_argument("action", choices=("run", "report", "kill", "release"))
    fw.add_argument("--source", default="snapshot", choices=("synthetic", "snapshot"))
    fw.add_argument("--mode", default="FORWARD", choices=("FORWARD", "REPLAY"))
    fw.add_argument("--instruments", default="SPY,QQQ,IWM,TLT")
    fw.add_argument("--strategy", default="sma_trend")
    fw.add_argument("--param", action="append", default=[])
    fw.add_argument("--days", type=int, default=800, help="synthetic series length")
    fw.add_argument("--dir", help="log directory (default state/forward/<source>-<mode>)")
    fw.add_argument("--reason", default="")
    fw.add_argument("--by", default="")
    k = sub.add_parser("kill")
    k.add_argument("--reason", required=True)
    r = sub.add_parser("release")
    r.add_argument("--by", required=True)
    sub.add_parser("status")
    sub.add_parser("demo", help="run the offline demo: two backtests and 300 paper sessions")
    sub.add_parser("export", help="write a secret-scanned context bundle to exports/")
    sub.add_parser("seed-tasks", help="create the milestone task graph if missing (idempotent)")
    sub.add_parser("tasks")
    sk = sub.add_parser("skills")
    sk.add_argument("action", choices=("propose", "rollback", "status"))
    sk.add_argument("target", nargs="?")
    sk.add_argument("--by", default="")
    h = sub.add_parser("hermes", help="health check and one advisory call (falls back if Hermes is absent)")
    h.add_argument("--kind", default="propose_experiments")
    a = ap.parse_args(argv)

    from .lab import Lab, LabError
    lab = Lab()
    try:
        if a.cmd == "backtest":
            params = {kv.split("=")[0]: int(kv.split("=")[1]) for kv in a.param}
            rec = lab.experiment(a.instrument, a.strategy, params, a.source)
            _print({"id": rec["id"], "cached": rec["cached"], "net": rec["report"]["net"],
                    "benchmark": rec["report"]["benchmark"], "warnings": rec["report"]["warnings"],
                    "critic": rec["critic"]})
        elif a.cmd == "paper":
            _print(lab.paper_step(a.steps, a.instrument, a.strategy))
        elif a.cmd == "forward":
            _print(_forward(lab, a))
        elif a.cmd == "research":
            _print(_research(lab, a))
        elif a.cmd == "kill":
            _print({"cancelled": lab.kill(a.reason)})
        elif a.cmd == "release":
            lab.release(a.by)
            _print({"released_by": a.by})
        elif a.cmd == "status":
            _print(lab.status())
        elif a.cmd == "demo":
            out = []
            for inst in ("DEMO-ETF-A", "DEMO-ETF-B"):
                rec = lab.experiment(inst, "sma_trend")
                out.append({"instrument": inst, "verdict": rec["critic"]["verdict"],
                            "alpha_status": rec["critic"]["alpha_status"],
                            "net_total_return": rec["report"]["net"]["total_return"]})
            ps = lab.paper_state()
            if not ps or ps["instrument"] == "DEMO-ETF-A":
                lab.paper_step(300, "DEMO-ETF-A", "sma_trend")
            _print({"experiments": out, "paper": {k: v for k, v in (lab.paper_state() or {}).items()
                                                  if k not in ("equity", "orders", "fills")},
                    "label": "DEMO / SYNTHETIC: no market claim"})
        elif a.cmd == "export":
            from .export import build
            dest, man = build()
            _print({"bundle": str(dest), "files": len(man["included"]), "excluded": man["excluded"]})
        elif a.cmd == "seed-tasks":
            for tid, goal, owner, deps, acc in SEED_TASKS:
                lab.tasks.add(tid, goal, owner, deps, acc)
            _print(lab.tasks.summary()["counts"])
        elif a.cmd == "tasks":
            _print(lab.tasks.summary())
        elif a.cmd == "skills":
            from .learning.skills import SkillLab
            sl = SkillLab(events=lab.events)
            if a.action == "propose":
                rec = sl.propose(a.target)
                _print({k: rec[k] for k in ("name", "version", "decision", "reasons", "score", "baseline_version")})
            elif a.action == "rollback":
                _print(sl.rollback(a.target, a.by))
            else:
                _print(sl.registry())
        elif a.cmd == "hermes":
            from .agents.hermes_adapter import TaskContract
            ad = lab.hermes()
            tried = [e["params"] for e in lab.experiments() if e["strategy"] == "sma_trend"]
            res = ad.run(TaskContract("cli-hermes", a.kind, "Propose up to three falsifiable SMA experiments",
                                      {"tried_params": tried}))
            _print({"health": ad.health(), "result": res.to_dict()})
    except LabError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
