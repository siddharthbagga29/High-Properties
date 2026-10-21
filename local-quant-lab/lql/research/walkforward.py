"""Pre-registered walk-forward research (WF engine 1.0.0).

Process, in order. Nothing after step 1 can change step 1:
1. FREEZE. The candidate grid, window lengths, holdout fraction, selection rule, cost assumptions, benchmark and
   acceptance criteria are written to a registration file together with a data fingerprint and a spec hash. A run
   refuses to start if the spec or the data differ from the registration.
2. WALK FORWARD on the pre-holdout data, strictly chronological. For each fold, every candidate is run over
   [train_start - warmup, test_end); the one with the best IN-SAMPLE net Sharpe (ties: fewer fills, then key order;
   needs a minimum number of in-sample exits) is carried into the following TEST window unchanged. No candidate
   is ever scored on data it was selected on, and the test window never feeds back into selection. A fold with no
   eligible candidate stays in cash.
3. REPORT in-sample and out-of-sample separately, with exposure, turnover, costs, exits, drawdown, a paired block
   bootstrap interval for Sharpe and for the Sharpe difference to the benchmark, a 2x-cost stress, and selection
   stability. Invalid, insufficient or suspicious results are labelled as such; the "winner" is never chosen by
   return.
4. HOLDOUT. The last `holdout_fraction` of the data is touched once, by `evaluate_holdout`, using the rule fixed in
   the registration. The holdout fingerprint is recorded; a second evaluation, or any later study that shares the
   same holdout data, is refused or flagged as contaminated.
Backtests alone never rank above CANDIDATE; synthetic data never above NOT_PROVEN; alpha_status is never
`paper_supported` here.
"""
import hashlib
import json
import math
import statistics
from dataclasses import asdict
from pathlib import Path

from ..backtest.metrics import summarize
from ..backtest.portfolio import run_portfolio, summarize_portfolio, benchmark_buy_hold, with_costs, prepare
from ..events import now_iso, atomic_write_json
from ..orchestrator.critic import leakage_probe
from ..strategies import create
from . import stats

WF_VERSION = "1.0.0"


class ResearchError(Exception):
    pass


class HoldoutConsumed(ResearchError):
    pass


DEFAULT_SPEC = {
    "name": "wf-default",
    "candidates": (
        [{"strategy": "sma_trend", "params": {"fast": f, "slow": s}} for f in (20, 50) for s in (100, 150, 200)]
        + [{"strategy": "vol_scaled_trend", "params": {"slow": s, "vol_lookback": 20, "target_vol_pct": v}}
           for s in (100, 150, 200) for v in (10, 15)]),
    "windows": {"train_bars": 504, "test_bars": 126, "step_bars": 126, "warmup_bars": 250, "holdout_fraction": 0.2},
    "selection": {"metric": "in_sample_net_sharpe", "min_in_sample_exits": 3,
                  "ties": "fewer fills, then candidate order"},
    "costs": {"base_multiplier": 1.0, "stress_multiplier": 2.0},
    "benchmark": "equal-share buy-and-hold under the same caps, costs and risk engine",
    "bootstrap": {"n_boot": 1000, "block": 10, "seed": 11, "level": 0.95},
    "acceptance": {
        "min_folds": 3, "min_oos_days": 252, "min_oos_exits": 10, "min_oos_net_sharpe": 0.0,
        "min_sharpe_ci_lower": 0.0, "min_oos_to_is_sharpe_ratio": 0.5, "min_selection_stability": 0.4,
        "benchmark_rule": "sharpe_diff_ci_lower > 0, or (max drawdown <= 75% of the benchmark's and net Sharpe >= "
                          "90% of the benchmark's)",
        "suspicious_sharpe": 3.0,
        "holdout": {"min_return": 0.0, "min_sharpe": 0.0, "max_drawdown_floor": -0.20, "min_exits": 1},
    },
}


# -- registration ------------------------------------------------------------------------------------------------
def fingerprint(data):
    h = hashlib.sha256()
    for inst in sorted(data):
        h.update(inst.encode())
        for b in data[inst]:
            h.update(json.dumps(b.to_dict(), sort_keys=True).encode())
    return h.hexdigest()


def _spec_hash(spec, settings, universe, data_fp):
    payload = {"spec": spec, "wf": WF_VERSION, "universe": sorted(universe), "data": data_fp,
               "costs": asdict(settings.costs), "risk": asdict(settings.risk), "cash": settings.initial_cash}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:16]


def _cut(data, pre_n):
    """Split every instrument at the same union-date boundary: pre-holdout vs holdout."""
    dates, _, _ = prepare(data)
    cutoff = dates[pre_n - 1]
    pre = {i: [b for b in bars if b.event_date <= cutoff] for i, bars in data.items()}
    return dates, cutoff, pre


def freeze(spec, data, settings, directory, source_info=None, events=None):
    """Write the registration. Returns the registration dict (with `spec_hash`). Idempotent for identical inputs."""
    directory = Path(directory)
    dates, _, _ = prepare(data)
    w = spec["windows"]
    pre_n = int(len(dates) * (1 - w["holdout_fraction"]))
    cutoff = dates[pre_n - 1]
    hold_data = {i: [b for b in bars if b.event_date > cutoff] for i, bars in data.items()}
    fp = fingerprint(data)
    reg = {"spec": spec, "spec_hash": _spec_hash(spec, settings, list(data), fp), "data_fingerprint": fp,
           "holdout_fingerprint": fingerprint(hold_data), "universe": sorted(data),
           "bars": len(dates), "first": dates[0].isoformat(), "last": dates[-1].isoformat(),
           "pre_holdout_last": cutoff.isoformat(), "wf_version": WF_VERSION,
           "synthetic": bool(source_info and source_info.is_synthetic),
           "source": asdict(source_info) if source_info else None}
    path = directory / "prereg" / f"{reg['spec_hash']}.json"
    if path.exists():
        return json.loads(path.read_text())
    reg["frozen_at"] = now_iso()
    atomic_write_json(path, reg)
    if events:
        events.emit("research_frozen", f"walk-forward spec {spec['name']} frozen as {reg['spec_hash']}",
                    spec_hash=reg["spec_hash"])
    return reg


def load_registration(directory, spec_hash):
    path = Path(directory) / "prereg" / f"{spec_hash}.json"
    if not path.exists():
        raise ResearchError(f"no registration {spec_hash}: freeze the spec before running")
    return json.loads(path.read_text())


def _verify(reg, data, settings):
    if fingerprint(data) != reg["data_fingerprint"]:
        raise ResearchError("data differ from the pre-registered fingerprint: freeze a new spec for new data")
    if _spec_hash(reg["spec"], settings, list(data), reg["data_fingerprint"]) != reg["spec_hash"]:
        raise ResearchError("spec, costs or risk limits differ from the registration")


# -- helpers -----------------------------------------------------------------------------------------------------
def _window(data, lo, hi):
    """Bars with lo <= date <= hi per instrument (ISO date strings)."""
    return {i: [b for b in bars if lo <= b.event_date.isoformat() <= hi] for i, bars in data.items()}


def _segment(res, a, z):
    """Metrics for union-date indices [a, z) of a portfolio result."""
    d0, d1 = res["dates"][a], res["dates"][z - 1]
    seg = {"dates": res["dates"][a:z], "equity": res["equity"][a:z], "exposure": res["exposure"][a:z],
           "fills": [f for f in res["fills"] if d0 <= f["date"] <= d1], "instruments": res["instruments"]}
    seg["costs"] = sum(f["commission"] + f["spread_slippage"] for f in seg["fills"])
    return seg


def _seg_metrics(seg):
    m = summarize_portfolio(seg)
    m["exits"] = sum(1 for f in seg["fills"] if f["side"] == "SELL")
    return m


def _candidate_key(c):
    return c["strategy"] + json.dumps(c["params"], sort_keys=True)


def _returns(equity):
    return [equity[i] / equity[i - 1] - 1 for i in range(1, len(equity)) if equity[i - 1] > 0]


def _folds(n_pre, w):
    folds, k = [], 0
    while True:
        start = w["warmup_bars"] + k * w["step_bars"]
        end = start + w["train_bars"] + w["test_bars"]
        if end > n_pre:
            break
        folds.append((start, start + w["train_bars"], end))
        k += 1
    return folds


def _chain(parts, initial):
    """Join per-fold daily returns into one equity curve starting from `initial`."""
    eq = [initial]
    for r in parts:
        eq.append(eq[-1] * (1 + r))
    return eq


# -- the study ---------------------------------------------------------------------------------------------------
def run_walk_forward(reg, data, settings, directory, events=None):
    directory = Path(directory)
    _verify(reg, data, settings)
    spec, w, acc = reg["spec"], reg["spec"]["windows"], reg["spec"]["acceptance"]
    dates, cutoff, pre = _cut(data, int(reg["bars"] * (1 - w["holdout_fraction"])))
    pre_dates = [d for d in dates if d <= cutoff]
    n_pre = len(pre_dates)
    folds = _folds(n_pre, w)
    ds = [d.isoformat() for d in pre_dates]
    cands = spec["candidates"]
    report = {"wf_version": WF_VERSION, "spec_hash": reg["spec_hash"], "spec_name": spec["name"],
              "data_fingerprint": reg["data_fingerprint"], "synthetic": reg["synthetic"], "universe": reg["universe"],
              "pre_holdout": [ds[0], ds[-1]], "n_pre_bars": n_pre, "n_folds": len(folds),
              "candidates_evaluated": len(cands) * len(folds), "folds": [], "created_at": now_iso(),
              "holdout": {"status": "NOT_EVALUATED"}, "checks": []}
    problems = []

    # integrity probe: no candidate family may look ahead
    first = reg["universe"][0]
    probe = [c["strategy"] for c in cands if leakage_probe(create(c["strategy"], **c["params"]), pre[first][:400])]
    if probe:
        problems.append(f"look-ahead probe failed for {sorted(set(probe))}")

    if len(folds) < acc["min_folds"]:
        report["verdict"], report["alpha_status"] = "INSUFFICIENT", "unproven"
        report["reasons"] = [f"only {len(folds)} folds fit (need {acc['min_folds']}) in {n_pre} pre-holdout bars"]
        return _finish(report, directory, events)

    oos_ret, oos_ret_stress, bench_ret, oos_dates, oos_exposure, oos_fills = [], [], [], [], [], []
    is_sharpes, picks = [], []
    bench_full = benchmark_buy_hold(pre, settings)
    for k, (s, t, e) in enumerate(folds):
        lo = max(0, s - w["warmup_bars"])
        win = _window(pre, ds[lo], ds[e - 1])
        off = s - lo
        scored = []
        runs = {}
        for c in cands:
            res = run_portfolio(win, create(c["strategy"], **c["params"]), settings, label=f"wf{k}")
            runs[_candidate_key(c)] = res
            ins = _seg_metrics(_segment(res, off, off + (t - s)))
            scored.append((c, ins))
        eligible = [(c, m) for c, m in scored
                    if m.get("sharpe") is not None and m["exits"] >= spec["selection"]["min_in_sample_exits"]]
        eligible.sort(key=lambda cm: (-cm[1]["sharpe"], cm[1]["n_fills"], cands.index(cm[0])))
        fold = {"fold": k, "train": [ds[s], ds[t - 1]], "test": [ds[t], ds[e - 1]],
                "in_sample": [{"candidate": _candidate_key(c), "sharpe": m.get("sharpe"), "exits": m["exits"],
                               "total_return": m.get("total_return"), "max_drawdown": m.get("max_drawdown")}
                              for c, m in scored]}
        if eligible:
            c, ins = eligible[0]
            key = _candidate_key(c)
            res = runs[key]
            test = _segment(res, off + (t - s), off + (e - s))
            prev_eq = res["equity"][off + (t - s) - 1]
            fold_eq = [prev_eq] + test["equity"]
            oos_ret += _returns(fold_eq)
            stress = run_portfolio(win, create(c["strategy"], **c["params"]), settings,
                                   costs=with_costs(settings, spec["costs"]["stress_multiplier"]), label=f"wfs{k}")
            sp = stress["equity"][off + (t - s) - 1]
            oos_ret_stress += _returns([sp] + stress["equity"][off + (t - s):off + (e - s)])
            oos_exposure += test["exposure"]
            oos_fills += test["fills"]
            is_sharpes.append(ins["sharpe"])
            picks.append(key)
            fold["selected"] = key
            fold["selected_in_sample"] = {k2: ins.get(k2) for k2 in ("sharpe", "total_return", "max_drawdown", "exits",
                                                                   "avg_exposure", "turnover_annual")}
            fold["test_metrics"] = {k2: v for k2, v in _seg_metrics(test).items()
                                    if k2 in ("total_return", "sharpe", "max_drawdown", "exits", "n_fills",
                                              "avg_exposure", "turnover_annual", "costs")}
        else:
            n_test = e - t
            oos_ret += [0.0] * n_test
            oos_ret_stress += [0.0] * n_test
            oos_exposure += [0.0] * n_test
            picks.append(None)
            fold["selected"] = None
            fold["note"] = "no candidate had enough in-sample exits; stayed in cash"
        oos_dates += ds[t:e]
        b_idx = list(range(t, e))
        bench_ret += _returns([bench_full["equity"][t - 1]] + [bench_full["equity"][i] for i in b_idx])
        report["folds"].append(fold)

    init = settings.initial_cash
    oos_eq = _chain(oos_ret, init)
    bench_eq = _chain(bench_ret, init)
    oos_seg = {"dates": ["start"] + oos_dates, "equity": oos_eq, "exposure": [0.0] + oos_exposure,
               "fills": oos_fills, "costs": sum(f["commission"] + f["spread_slippage"] for f in oos_fills),
               "instruments": reg["universe"]}
    oos = _seg_metrics(oos_seg)
    bench = summarize(["start"] + oos_dates, bench_eq)
    stress_eq = _chain(oos_ret_stress, init)
    stress = summarize(["start"] + oos_dates, stress_eq)
    boot = spec["bootstrap"]
    ci = stats.block_bootstrap(oos_ret, bench_ret, **boot)
    is_mean = statistics.fmean(is_sharpes) if is_sharpes else None
    chosen = [p for p in picks if p]
    modal = max(set(chosen), key=chosen.count) if chosen else None
    stability = chosen.count(modal) / len(folds) if chosen else 0.0
    report.update({
        "in_sample": {"mean_selected_sharpe": is_mean, "selected_sharpes": is_sharpes,
                      "note": "in-sample numbers are optimistic by construction (selected as the best of "
                              f"{len(cands)}); only out-of-sample numbers count"},
        "out_of_sample": {"metrics": oos, "benchmark": bench, "stress_2x_costs": {k2: stress.get(k2) for k2 in
                          ("total_return", "sharpe", "max_drawdown")}, "bootstrap": ci, "days": len(oos_ret),
                          "selection_stability": stability, "modal_candidate": modal, "selections": picks},
        "series": {"dates": ["start"] + oos_dates, "equity": oos_eq, "benchmark_equity": bench_eq},
        "multiple_testing_note": f"{len(cands)} candidates x {len(folds)} folds were scored; the best in-sample "
                                 "candidate per fold is expected to look better in-sample than it will out of sample"})

    # contamination of the holdout by earlier studies on the same data
    reg_path = directory / "holdout_registry.json"
    registry = json.loads(reg_path.read_text()) if reg_path.exists() else {}
    prior = registry.get(reg["holdout_fingerprint"])
    contaminated = bool(prior and prior.get("spec_hash") != reg["spec_hash"])
    report["holdout_contaminated_by"] = prior["spec_hash"] if contaminated else None

    # acceptance
    sh, ci_lo = oos.get("sharpe"), (ci or {}).get("sharpe_ci", [None])[0] if ci and ci.get("sharpe_ci") else None
    diff_lo = ci["sharpe_diff_ci"][0] if ci and ci.get("sharpe_diff_ci") else None
    dd_ok = oos.get("max_drawdown") is not None and bench.get("max_drawdown") is not None and \
        abs(oos["max_drawdown"]) <= 0.75 * abs(bench["max_drawdown"]) and sh is not None and \
        bench.get("sharpe") is not None and sh >= 0.9 * bench["sharpe"]

    def chk(name, passed, value, threshold):
        report["checks"].append({"name": name, "passed": bool(passed), "value": value, "threshold": threshold})
    chk("enough_folds", len(folds) >= acc["min_folds"], len(folds), acc["min_folds"])
    chk("enough_oos_days", len(oos_ret) >= acc["min_oos_days"], len(oos_ret), acc["min_oos_days"])
    chk("enough_oos_exits", oos["exits"] >= acc["min_oos_exits"], oos["exits"], acc["min_oos_exits"])
    chk("oos_net_sharpe_positive", sh is not None and sh > acc["min_oos_net_sharpe"], sh, acc["min_oos_net_sharpe"])
    chk("oos_sharpe_ci_lower_positive", ci_lo is not None and ci_lo > acc["min_sharpe_ci_lower"], ci_lo,
        acc["min_sharpe_ci_lower"])
    chk("oos_vs_in_sample_sharpe", is_mean is None or is_mean <= 0 or (sh is not None and
        sh >= acc["min_oos_to_is_sharpe_ratio"] * is_mean), {"oos": sh, "is_mean": is_mean},
        f">= {acc['min_oos_to_is_sharpe_ratio']} x in-sample")
    chk("survives_2x_costs", stress.get("sharpe") is not None and stress["sharpe"] > 0, stress.get("sharpe"), "> 0")
    chk("selection_stable", stability >= acc["min_selection_stability"], stability, acc["min_selection_stability"])
    chk("beats_or_derisks_benchmark", (diff_lo is not None and diff_lo > 0) or dd_ok,
        {"sharpe_diff_ci_lower": diff_lo, "drawdown_rule": dd_ok}, acc["benchmark_rule"])
    chk("not_synthetic", not reg["synthetic"], reg["synthetic"], False)
    chk("holdout_uncontaminated", not contaminated, report["holdout_contaminated_by"], None)
    chk("holdout_passed", False, "not evaluated", "evaluate_holdout once, after this report")

    suspicious = []
    if sh is not None and sh > acc["suspicious_sharpe"]:
        suspicious.append(f"out-of-sample Sharpe {sh:.2f} > {acc['suspicious_sharpe']}")
    if oos["costs"] == 0 and oos["n_fills"]:
        suspicious.append("fills with zero costs")
    if is_mean and is_mean > 0 and sh is not None and sh > 3 * is_mean:
        suspicious.append("out-of-sample Sharpe far above in-sample Sharpe")
    if any(v is None or (isinstance(v, float) and not math.isfinite(v)) for v in (oos.get("total_return"),)):
        problems.append("non-finite out-of-sample return")

    by = {c["name"]: c["passed"] for c in report["checks"]}
    reasons = []
    if problems:
        verdict, status, reasons = "REJECTED", "rejected", problems
    elif not (by["enough_folds"] and by["enough_oos_days"] and by["enough_oos_exits"]):
        verdict, status = "INSUFFICIENT", "unproven"
        reasons = [c["name"] for c in report["checks"] if c["name"].startswith("enough") and not c["passed"]]
    elif suspicious:
        verdict, status, reasons = "SUSPICIOUS", "unproven", suspicious
    elif oos["total_return"] < 0 or not by["oos_net_sharpe_positive"]:
        verdict, status, reasons = "REJECTED", "rejected", ["out-of-sample net result is not positive"]
    else:
        failed = [c["name"] for c in report["checks"] if not c["passed"]]
        verdict, status, reasons = "NOT_PROVEN", "unproven", failed or ["holdout pending"]
    report["verdict"], report["alpha_status"], report["reasons"] = verdict, status, reasons
    report["note"] = ("Backtest evidence only. CANDIDATE needs every check including a passed holdout on real "
                      "data; paper_supported needs forward paper results.")
    return _finish(report, directory, events)


def _finish(report, directory, events):
    atomic_write_json(Path(directory) / "results" / f"{report['spec_hash']}.json", report)
    oos = report.get("out_of_sample", {})
    row = {"at": report["created_at"], "kind": "walk_forward", "spec_hash": report["spec_hash"],
           "spec": report["spec_name"], "universe": report["universe"], "synthetic": report["synthetic"],
           "folds": report["n_folds"], "candidates_evaluated": report["candidates_evaluated"],
           "verdict": report["verdict"], "alpha_status": report["alpha_status"], "reasons": report["reasons"],
           "oos_sharpe": oos.get("metrics", {}).get("sharpe"), "oos_return": oos.get("metrics", {}).get("total_return"),
           "benchmark_sharpe": oos.get("benchmark", {}).get("sharpe")}
    with open(Path(directory) / "runs.jsonl", "a") as f:
        f.write(json.dumps(row, sort_keys=True) + "\n")
    if events:
        events.emit("research_walkforward", f"walk-forward {report['spec_name']} {report['spec_hash']}: "
                    f"{report['verdict']}", verdict=report["verdict"], spec_hash=report["spec_hash"])
    return report


# -- holdout (once) ----------------------------------------------------------------------------------------------
def evaluate_holdout(reg, data, settings, directory, events=None):
    """Evaluate the untouched holdout exactly once. The candidate is fixed by the registered rule applied to ALL
    pre-holdout data; nothing is tuned on the holdout. Updates the stored walk-forward report."""
    directory = Path(directory)
    _verify(reg, data, settings)
    rpath = directory / "results" / f"{reg['spec_hash']}.json"
    if not rpath.exists():
        raise ResearchError("run the walk-forward first; the holdout is evaluated after it, never before")
    report = json.loads(rpath.read_text())
    if report["verdict"] != "NOT_PROVEN":
        raise ResearchError(f"walk-forward verdict is {report['verdict']}: the holdout is not spent on a study that "
                            "already failed or lacks evidence")
    reg_path = directory / "holdout_registry.json"
    registry = json.loads(reg_path.read_text()) if reg_path.exists() else {}
    if reg["holdout_fingerprint"] in registry:
        raise HoldoutConsumed(f"this holdout was already evaluated by spec {registry[reg['holdout_fingerprint']]['spec_hash']}"
                              "; evaluating it again would turn it into training data")
    spec, w = reg["spec"], reg["spec"]["windows"]
    dates, cutoff, pre = _cut(data, int(reg["bars"] * (1 - w["holdout_fraction"])))
    all_dates = [d.isoformat() for d in dates]
    n_pre = len([d for d in dates if d <= cutoff])
    cands = spec["candidates"]
    full = {}
    scored = []
    for c in cands:
        res = run_portfolio(data, create(c["strategy"], **c["params"]), settings, label="holdout")
        full[_candidate_key(c)] = res
        m = _seg_metrics(_segment(res, w["warmup_bars"], n_pre))
        scored.append((c, m))
    elig = [(c, m) for c, m in scored if m.get("sharpe") is not None and
            m["exits"] >= spec["selection"]["min_in_sample_exits"]]
    elig.sort(key=lambda cm: (-cm[1]["sharpe"], cm[1]["n_fills"], cands.index(cm[0])))
    h = spec["acceptance"]["holdout"]
    out = {"status": "EVALUATED", "evaluated_at": now_iso(), "holdout": [all_dates[n_pre], all_dates[-1]],
           "bars": len(all_dates) - n_pre}
    if not elig:
        out.update({"selected": None, "passed": False, "reason": "no candidate eligible on pre-holdout data"})
    else:
        c, ins = elig[0]
        key = _candidate_key(c)
        res = full[key]
        seg = _segment(res, n_pre, len(all_dates))
        m = _seg_metrics(seg)
        bench = benchmark_buy_hold(data, settings)
        bm = summarize(all_dates[n_pre:], bench["equity"][n_pre:])
        passed = (m["total_return"] > h["min_return"] and m.get("sharpe") is not None and m["sharpe"] > h["min_sharpe"]
                  and m["max_drawdown"] >= h["max_drawdown_floor"] and m["exits"] >= h["min_exits"])
        out.update({"selected": key, "selected_pre_holdout_sharpe": ins["sharpe"], "passed": bool(passed),
                    "metrics": {k: m.get(k) for k in ("total_return", "sharpe", "max_drawdown", "exits", "n_fills",
                                                      "avg_exposure", "turnover_annual", "costs")},
                    "benchmark": {k: bm.get(k) for k in ("total_return", "sharpe", "max_drawdown")}})
    registry[reg["holdout_fingerprint"]] = {"spec_hash": reg["spec_hash"], "at": out["evaluated_at"],
                                            "selected": out.get("selected"), "passed": out.get("passed")}
    atomic_write_json(reg_path, registry)
    report["holdout"] = out
    for c in report["checks"]:
        if c["name"] == "holdout_passed":
            c["passed"], c["value"], c["threshold"] = bool(out.get("passed")), out.get("passed"), h
    if report["verdict"] == "NOT_PROVEN" and all(c["passed"] for c in report["checks"]):
        report["verdict"], report["alpha_status"], report["reasons"] = "CANDIDATE", "candidate", []
    elif report["verdict"] == "NOT_PROVEN":
        report["reasons"] = [c["name"] for c in report["checks"] if not c["passed"]]
    if report["verdict"] in ("NOT_PROVEN", "CANDIDATE") and out.get("passed") is False:
        report["verdict"], report["alpha_status"] = "NOT_PROVEN", "unproven"
    atomic_write_json(rpath, report)
    if events:
        events.emit("research_holdout", f"holdout for {reg['spec_hash']} evaluated once: passed={out.get('passed')}",
                    spec_hash=reg["spec_hash"])
    return report
