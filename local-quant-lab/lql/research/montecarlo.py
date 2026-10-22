"""Monte Carlo robustness check for one experiment: a seeded circular moving-block bootstrap of the strategy's net
daily returns.

Method. The net equity curve of an experiment gives n daily simple returns r_1..r_n (costs already deducted). One
simulated path draws ceil(n / b) start indices uniformly from 0..n-1, takes b consecutive returns from each (wrapping
around the end of the sample), concatenates them and keeps the first n. It is compounded from 1.0. Blocks keep the
day-to-day dependence (volatility clustering, autocorrelation) that lies within b days; anything longer is broken.

What this is and is not. It asks: "if the future looked like re-shuffled stretches of this backtest, how wide is the
range of outcomes and how deep could drawdowns get?" It is NOT a forecast. It cannot create a regime the sample
never contained, it inherits every flaw of the backtest (look-ahead protections, costs, data quality), and for a
synthetic experiment it says nothing about real markets. Returns are not assumed IID or normal; the block length
is the one modelling choice and is recorded.

Determinism: random.Random(seed) only; the same experiment, paths, block and seed give the same artifact, which is
cached under the hash of all inputs plus METHOD_VERSION.
"""
import hashlib
import json
import math
import random
import time

from ..backtest.metrics import daily_returns
from ..events import atomic_write_json, now_iso

METHOD_VERSION = "mbb-1"
MIN_PATHS, MAX_PATHS = 100, 20000
CHECKPOINTS = 60                       # equity is sampled at this many points per path for the fan chart
PCTS = (5, 25, 50, 75, 95)
DD_THRESHOLDS = (0.10, 0.20, 0.30)


class MonteCarloError(ValueError):
    pass


def validate_request(params):
    p = dict(params or {})
    eid = str(p.get("experiment", ""))
    if not eid.isalnum() or len(eid) > 64:
        raise MonteCarloError("experiment must be an experiment id")
    out = {"experiment": eid}
    for key, lo, hi, default in (("paths", MIN_PATHS, MAX_PATHS, 1000), ("block", 1, 120, 20),
                                 ("seed", 0, 2**31 - 1, 7)):
        v = p.get(key, default)
        if isinstance(v, bool) or not isinstance(v, int) or not lo <= v <= hi:
            raise MonteCarloError(f"{key} must be an integer in {lo}..{hi}")
        out[key] = v
    return out


def percentile(sorted_vals, q):
    """Linear interpolation between closest ranks (numpy's default 'linear')."""
    if not sorted_vals:
        return None
    k = (len(sorted_vals) - 1) * q / 100
    lo, hi = math.floor(k), math.ceil(k)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo)


def max_drawdown(path):
    peak, mdd = path[0], 0.0
    for v in path:
        peak = max(peak, v)
        mdd = min(mdd, v / peak - 1)
    return mdd


def bootstrap(returns, paths, block, seed, progress=None):
    """Run the bootstrap. Returns per-path ending values, max drawdowns and checkpointed equity, or
    {"cancelled_after": k} if `progress(done)` returned True."""
    n = len(returns)
    if n < max(block, 20):
        raise MonteCarloError(f"need at least {max(block, 20)} daily returns for block length {block}; have {n}")
    rng = random.Random(seed)
    cps = sorted({min(n, max(1, round(n * (i + 1) / CHECKPOINTS))) for i in range(CHECKPOINTS)})
    ends, mdds, fan = [], [], [[] for _ in cps]
    n_blocks = math.ceil(n / block)
    for k in range(paths):
        eq, peak, mdd, step, ci = 1.0, 1.0, 0.0, 0, 0
        for _ in range(n_blocks):
            s = rng.randrange(n)
            for j in range(block):
                if step == n:
                    break
                eq *= 1 + returns[(s + j) % n]
                step += 1
                if eq > peak:
                    peak = eq
                elif eq / peak - 1 < mdd:
                    mdd = eq / peak - 1
                if ci < len(cps) and step == cps[ci]:
                    fan[ci].append(eq)
                    ci += 1
        ends.append(eq)
        mdds.append(mdd)
        if progress and (k + 1) % 100 == 0 and progress(k + 1):
            return {"cancelled_after": k + 1}
    return {"ends": ends, "mdds": mdds, "checkpoints": cps, "fan": fan}


def summarize_runs(raw, actual_end, actual_mdd):
    ends, mdds = sorted(raw["ends"]), sorted(raw["mdds"])
    n = len(ends)
    lo, hi = ends[0], ends[-1]
    bins = 30
    width = (hi - lo) / bins or 1.0
    hist = [0] * bins
    for e in ends:
        hist[min(bins - 1, int((e - lo) / width))] += 1
    return {
        "ending": {f"p{q}": percentile(ends, q) for q in PCTS} | {"mean": sum(ends) / n, "min": lo, "max": hi,
                                                                  "prob_loss": sum(1 for e in ends if e < 1) / n},
        "drawdown": {f"p{q}": percentile(mdds, q) for q in PCTS}
                    | {f"prob_gt_{int(t * 100)}pct": sum(1 for d in mdds if d < -t) / n for t in DD_THRESHOLDS},
        "fan": {"step": raw["checkpoints"],
                **{f"p{q}": [percentile(sorted(col), q) for col in raw["fan"]] for q in PCTS}},
        "histogram": {"lo": lo, "width": width, "counts": hist},
        "actual": {"ending": actual_end, "max_drawdown": actual_mdd,
                   "ending_rank_pct": sum(1 for e in ends if e <= actual_end) / n,
                   "drawdown_rank_pct": sum(1 for d in mdds if d <= actual_mdd) / n},
    }


def key_of(exp, p):
    blob = json.dumps([exp["id"], exp["report"]["result_hash"], p["paths"], p["block"], p["seed"], METHOD_VERSION])
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def run_for_experiment(lab, params, progress=None):
    p = validate_request(params)
    exp = lab.get_experiment(p["experiment"])
    out_dir = lab.state / "montecarlo"
    key = key_of(exp, p)
    path = out_dir / f"{key}.json"
    if path.exists():
        rec = json.loads(path.read_text())
        rec["cached"] = True
        return rec
    series = exp["report"]["series"]
    equity = series["equity"]
    rets = daily_returns(equity)
    t0 = time.time()
    raw = bootstrap(rets, p["paths"], p["block"], p["seed"], progress)
    if "cancelled_after" in raw:
        return {"cancelled": True, "paths_done": raw["cancelled_after"]}
    actual_end = equity[-1] / equity[0]
    actual_mdd = max_drawdown(equity)
    ds = exp.get("dataset") or {}
    src = exp["report"].get("source", {})
    synthetic = src.get("kind") == "DEMO_SYNTHETIC"
    rec = {
        "id": key, "created_at": now_iso(), "method": "circular moving-block bootstrap of net daily returns",
        "method_version": METHOD_VERSION, "seed": p["seed"], "paths": p["paths"], "block_days": p["block"],
        "horizon_days": len(rets),
        "input": {"experiment": exp["id"], "result_hash": exp["report"]["result_hash"],
                  "instrument": exp["instrument"], "strategy": exp["strategy"], "params": exp["params"],
                  "source": exp["source"], "sha256": ds.get("sha256") or exp["report"]["config"].get("data_sha256"),
                  "data_state": ds.get("data_state") or ("SYNTHETIC" if synthetic else "PROVISIONAL"),
                  "first": series["dates"][0], "last": series["dates"][-1], "n_returns": len(rets)},
        "costs": "as in the experiment's net equity (commission, half-spread and slippage already deducted)",
        "assumptions": [
            f"dependence within {p['block']} trading days is kept; longer dependence and regime structure are broken",
            "outcomes are drawn only from this backtest's own history: no new regimes, no parameter uncertainty",
            "inherits the backtest's cost model and data quality; not a forecast and not a guarantee",
        ] + (["SYNTHETIC input: the distribution says nothing about real markets"] if synthetic else []),
        "elapsed_s": None,
    }
    rec.update(summarize_runs(raw, actual_end, actual_mdd))
    rec["elapsed_s"] = round(time.time() - t0, 3)
    atomic_write_json(path, rec)
    lab.events.emit("montecarlo", f"monte carlo {p['paths']} paths (block {p['block']}, seed {p['seed']}) on "
                    f"{exp['strategy']} {exp['instrument']} ({exp['source']}): median ending x{rec['ending']['p50']:.3f}, "
                    f"P(drawdown > 20%) {rec['drawdown']['prob_gt_20pct']:.1%}", montecarlo=key, experiment=exp["id"])
    rec["cached"] = False
    return rec


def list_runs(lab):
    d = lab.state / "montecarlo"
    if not d.exists():
        return []
    rows = []
    for f in d.glob("*.json"):
        r = json.loads(f.read_text())
        rows.append({k: r[k] for k in ("id", "created_at", "seed", "paths", "block_days", "horizon_days", "elapsed_s")}
                    | {"experiment": r["input"]["experiment"], "instrument": r["input"]["instrument"],
                       "strategy": r["input"]["strategy"], "data_state": r["input"]["data_state"],
                       "p50": r["ending"]["p50"], "p5": r["ending"]["p5"],
                       "prob_dd_gt_20pct": r["drawdown"]["prob_gt_20pct"]})
    return sorted(rows, key=lambda r: r["created_at"], reverse=True)


def get_run(lab, mid):
    if not mid.isalnum():
        raise MonteCarloError("bad monte carlo id")
    f = lab.state / "montecarlo" / f"{mid}.json"
    if not f.exists():
        raise MonteCarloError(f"no monte carlo run {mid}")
    return json.loads(f.read_text())
