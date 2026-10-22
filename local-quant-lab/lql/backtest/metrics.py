"""Performance metrics. Conventions: daily simple returns, 252 trading days per year, risk-free rate 0, Sharpe =
mean/std * sqrt(252) with sample std, Sortino uses the root-mean-square of negative daily returns (over all days) as
downside deviation, CAGR compounds over len(returns)/252 years, Calmar = CAGR / |max drawdown|. Relative metrics use
daily active returns (strategy minus benchmark on the same dates): information ratio = mean/std * sqrt(252), tracking
error = std * sqrt(252). Returns None (shown as N/A) where a metric is undefined, never a made-up number."""
import math
import statistics

DAYS = 252


def daily_returns(equity):
    return [equity[i] / equity[i - 1] - 1 for i in range(1, len(equity)) if equity[i - 1] > 0]


def drawdown_series(equity):
    peak, out = -math.inf, []
    for e in equity:
        peak = max(peak, e)
        out.append(e / peak - 1 if peak > 0 else 0.0)
    return out


def summarize(dates, equity, fills=None, exposure=None, costs=0.0):
    n = len(equity)
    if n < 2:
        return {"days": n, "note": "not enough data"}
    rets = daily_returns(equity)
    years = len(rets) / DAYS
    total = equity[-1] / equity[0] - 1
    vol = statistics.stdev(rets) * math.sqrt(DAYS) if len(rets) > 1 else None
    mean = statistics.fmean(rets) if rets else 0.0
    sd = statistics.stdev(rets) if len(rets) > 1 else 0.0
    neg = [r for r in rets if r < 0]
    downside = math.sqrt(sum(r * r for r in neg) / len(rets)) if rets else 0.0
    dd = drawdown_series(equity)
    sorted_r = sorted(rets)
    var5 = sorted_r[int(0.05 * (len(sorted_r) - 1))] if sorted_r else None
    tail = sorted_r[: max(1, len(sorted_r) // 20)]
    out = {
        "start": str(dates[0]), "end": str(dates[-1]), "days": n,
        "total_return": total,
        "cagr": (equity[-1] / equity[0]) ** (1 / years) - 1 if years > 0 and equity[-1] > 0 else None,
        "ann_vol": vol,
        "sharpe": mean / sd * math.sqrt(DAYS) if sd > 0 else None,
        "sortino": mean / downside * math.sqrt(DAYS) if downside > 0 else None,
        "max_drawdown": min(dd),
        "calmar": None,
        "worst_day": sorted_r[0] if sorted_r else None,
        "best_day": sorted_r[-1] if sorted_r else None,
        "var_95_daily": var5,
        "cvar_95_daily": statistics.fmean(tail) if tail else None,
        "costs": costs,
    }
    if out["cagr"] is not None and out["max_drawdown"] < 0:
        out["calmar"] = out["cagr"] / abs(out["max_drawdown"])
    if exposure is not None:
        out["avg_exposure"] = statistics.fmean(exposure) if exposure else 0.0
        out["time_in_market"] = sum(1 for x in exposure if x > 1e-9) / len(exposure)
    if fills is not None:
        traded = sum(abs(f["qty"] * f["price"]) for f in fills)
        avg_eq = statistics.fmean(equity)
        out["n_fills"] = len(fills)
        out["turnover_annual"] = traded / avg_eq / years if years > 0 and avg_eq > 0 else None
        out.update(round_trips(fills))
    return out


def trip_pnls(fills):
    """Pair long entries and exits (FIFO, long-only, ONE instrument) into round trips; returns net P&L per trip."""
    lots, trips = [], []
    for f in fills:
        if f["side"] == "BUY":
            lots.append([f["qty"], f["price"], f["commission"] / f["qty"] if f["qty"] else 0.0])
        else:
            q, exit_px, exit_comm = f["qty"], f["price"], (f["commission"] / f["qty"] if f["qty"] else 0.0)
            pnl = 0.0
            while q > 0 and lots:
                lq, lpx, lc = lots[0]
                take = min(q, lq)
                pnl += take * (exit_px - lpx) - take * (lc + exit_comm)
                lots[0][0] -= take
                q -= take
                if lots[0][0] == 0:
                    lots.pop(0)
            trips.append(pnl)
    return trips


def trip_stats(trips):
    wins = [p for p in trips if p > 0]
    losses = [p for p in trips if p <= 0]
    return {"round_trips": len(trips),
            "win_rate": len(wins) / len(trips) if trips else None,
            "avg_win": statistics.fmean(wins) if wins else None,
            "avg_loss": statistics.fmean(losses) if losses else None,
            "profit_factor": sum(wins) / -sum(losses) if losses and sum(losses) < 0 else None}


def round_trips(fills):
    return trip_stats(trip_pnls(fills))


def monthly_returns(dates, equity):
    out, start_eq, cur = {}, equity[0], str(dates[0])[:7]
    prev = equity[0]
    for d, e in zip(dates, equity):
        m = str(d)[:7]
        if m != cur:
            out[cur] = prev / start_eq - 1
            start_eq, cur = prev, m
        prev = e
    out[cur] = prev / start_eq - 1
    return out


def relative(equity, bench_equity):
    """Strategy versus benchmark on the same dates. None where undefined (different lengths, flat active returns)."""
    if len(equity) != len(bench_equity) or len(equity) < 3:
        return {"excess_total_return": None, "information_ratio": None, "tracking_error": None, "note": "not comparable"}
    a, b = daily_returns(equity), daily_returns(bench_equity)
    if len(a) != len(b):
        return {"excess_total_return": None, "information_ratio": None, "tracking_error": None, "note": "not comparable"}
    active = [x - y for x, y in zip(a, b)]
    sd = statistics.stdev(active) if len(active) > 1 else 0.0
    return {"excess_total_return": (equity[-1] / equity[0]) - (bench_equity[-1] / bench_equity[0]),
            "information_ratio": statistics.fmean(active) / sd * math.sqrt(DAYS) if sd > 0 else None,
            "tracking_error": sd * math.sqrt(DAYS) if len(active) > 1 else None,
            "note": "daily active returns versus buy-and-hold of the same instrument, same costs and caps"}
