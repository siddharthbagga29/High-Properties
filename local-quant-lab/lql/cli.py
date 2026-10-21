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
    ("H1-hermes-mac", "Install Hermes on the founder's Mac with a local 64K-context model and run "
     "scripts/hermes_check.py", "founder", ["M4-loop-hermes"], ["python3 scripts/hermes_check.py"]),
]


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
