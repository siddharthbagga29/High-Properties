"""Deterministic critic/auditor for experiment reports. It does not trust the report: it re-derives metrics from the
equity series, checks fill timing in the journal, probes the strategy for look-ahead, and applies the evidence bar
for alpha_status. Backtests alone can never produce more than `candidate`; synthetic data never more than `unproven`.

Verdicts: REJECTED (a correctness or integrity defect, or the out-of-sample window loses money), NOT_PROVEN (no
defect, but the evidence is too thin, fragile or synthetic), CANDIDATE (survived every check on real historical data;
still only a hypothesis until paper evidence exists).
"""
from dataclasses import replace

from ..backtest.metrics import summarize

MIN_ROUND_TRIPS = 30


def leakage_probe(strategy, bars, probes=12):
    """Look-ahead probe. Record decisions on clean history, then show the strategy a version of the series whose
    future bars are tripled, then ask again for each decision using only the past slice. Any change means the
    strategy kept state derived from bars after the decision point. A strategy that loads data by itself cannot be
    probed this way; that is prohibited by the strategy contract instead. Returns the failing indices."""
    n = len(bars)
    if n < 3:
        return []
    step = max(1, n // probes)
    idx = list(range(min(strategy.meta.warmup, n - 2), n - 1, step))
    base = {i: strategy.target_weight(bars[: i + 1]) for i in idx}
    bad = []
    for i in idx:
        shocked = bars[: i + 1] + [replace(b, open=b.open * 3, high=b.high * 3, low=b.low * 3, close=b.close * 3)
                                   for b in bars[i + 1:]]
        strategy.target_weight(shocked)
        if strategy.target_weight(shocked[: i + 1]) != base[i]:
            bad.append(i)
    return bad


def review(report, strategy=None, bars=None):
    findings, blocking = [], []
    s = report.get("series", {})
    recomputed = summarize(s.get("dates", []), s.get("equity", []))
    for key in ("total_return", "max_drawdown", "sharpe"):
        a, b = recomputed.get(key), report.get("net", {}).get(key)
        if (a is None) != (b is None) or (a is not None and abs(a - b) > 1e-9):
            blocking.append(f"integrity: reported net {key}={b} but the equity series gives {a}")
    for f in report.get("fills", []):
        if not f["date"] > f["decision_date"]:
            blocking.append(f"timing: fill on {f['date']} for a decision at close {f['decision_date']} (same-bar fill)")
            break
    if strategy is not None and bars is not None:
        leaks = leakage_probe(strategy, bars)
        if leaks:
            blocking.append(f"leakage: decision changed when only future bars changed (indices {leaks[:5]})")
    synthetic = report.get("source", {}).get("kind") == "DEMO_SYNTHETIC"
    if synthetic:
        findings.append("synthetic data: no market claim is possible")
    src = report.get("source", {})
    if not synthetic and not (src.get("adjusted") == "split_and_dividend_adjusted" and src.get("adjustment_evidence")):
        findings.append(f"PROVISIONAL: price adjustment '{src.get('adjusted')}' is not verified; no evidence value")
    rt = report.get("net", {}).get("round_trips") or 0
    if rt < MIN_ROUND_TRIPS:
        findings.append(f"{rt} round trips < {MIN_ROUND_TRIPS}: sample too small")
    for w in report.get("warnings", []):
        if w.startswith("FRAGILE"):
            findings.append(w)
    test = report.get("splits", {}).get("net", {}).get("test", {})
    bench_test = report.get("splits", {}).get("benchmark", {}).get("test", {})
    if test.get("total_return") is not None and test["total_return"] < 0:
        blocking.append(f"out-of-sample test window lost money ({test['total_return']:+.2%})")
    elif test.get("total_return") is not None and not test.get("n_fills") and not test.get("time_in_market"):
        findings.append("no position in the out-of-sample test window: the strategy is untested out of sample")
    if test.get("sharpe") is not None and bench_test.get("sharpe") is not None and test["sharpe"] <= bench_test["sharpe"]:
        findings.append("test window Sharpe does not beat the capped buy-and-hold benchmark")
    if blocking:
        verdict, status = "REJECTED", "rejected"
    elif synthetic or findings:
        verdict, status = "NOT_PROVEN", "unproven"
    else:
        verdict, status = "CANDIDATE", "candidate"
    return {"verdict": verdict, "alpha_status": status, "blocking": blocking, "findings": findings,
            "note": "Backtest evidence only. No profitability claim; paper_supported needs forward paper results."}
