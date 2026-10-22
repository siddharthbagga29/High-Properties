"""Event-driven daily backtester. Order of operations for each session t (strictly chronological):

1. Fill the order decided at the close of t-1 at the OPEN of t, worsened by half-spread + slippage, plus commission.
2. Mark the portfolio to the CLOSE of t.
3. Ask the strategy for a target weight using bars[0..t] only (it never sees t+1).
4. Size the order from equity at the close of t; it fills at the open of t+1. No order is created on the last bar.

Every fill passes the same deterministic risk pre-check used in paper trading (lql.risk). Rejected orders are kept in
the result with their reasons. Unmodelled: queue position, auction dynamics, market impact beyond the linear
slippage term, borrow, dividends/corporate actions on synthetic data, taxes.
"""
import hashlib
import json
import math
from dataclasses import asdict, replace

from ..risk import RiskEngine, OrderIntent, PortfolioView, size_order
from .metrics import summarize, drawdown_series, monthly_returns, relative

ENGINE_VERSION = "1.0.0"


def fill_price(ref, side, costs):
    adj = (costs.half_spread_bps + costs.slippage_bps) / 1e4
    return ref * (1 + adj) if side == "BUY" else ref * (1 - adj)


def commission(qty, costs):
    return max(costs.min_commission, costs.commission_per_share * qty) if qty else 0.0


def run(bars, strategy, settings, costs=None, risk_engine=None, label=""):
    costs = costs or settings.costs
    risk = risk_engine or RiskEngine(settings.risk, mode="BACKTEST")
    cash, qty = float(settings.initial_cash), 0
    pending = None  # (side, qty, decision_date, weight, reason)
    dates, equity, exposure, positions, cashes, fills, rejected, signals = [], [], [], [], [], [], [], []
    total_costs = 0.0
    peak = cash
    for i, b in enumerate(bars):
        if pending:
            side, q, ddate, w = pending
            ref = b.open
            px = fill_price(ref, side, costs)
            comm = commission(q, costs)
            if side == "SELL":
                q = min(q, qty)
            if side == "BUY" and q * px + comm > cash:  # never borrow: shrink to what cash allows
                q = max(0, int((cash - costs.min_commission) // px))
                comm = commission(q, costs)
            if q > 0:
                notional = q * px
                cash += -notional - comm if side == "BUY" else notional - comm
                qty += q if side == "BUY" else -q
                slip = abs(px - ref) * q
                total_costs += comm + slip
                fills.append({"date": b.event_date.isoformat(), "decision_date": ddate, "side": side, "qty": q,
                              "price": px, "ref_price": ref, "commission": comm, "spread_slippage": slip,
                              "reason": f"target weight {w:.2f} decided at close {ddate}"})
            pending = None
        eq = cash + qty * b.close
        peak = max(peak, eq)
        dates.append(b.event_date.isoformat())
        equity.append(eq)
        positions.append(qty)
        cashes.append(cash)
        exposure.append(qty * b.close / eq if eq > 0 else 0.0)
        if i == len(bars) - 1:
            break
        w = max(0.0, min(strategy.meta.max_weight, strategy.target_weight(bars[: i + 1])))
        delta = size_order(settings.risk, w, eq, b.close, qty)
        signals.append({"date": dates[-1], "weight": w})
        if delta != 0:
            side = "BUY" if delta > 0 else "SELL"
            intent = OrderIntent(instrument=b.instrument, side=side, qty=abs(delta), order_type="MARKET",
                                 ref_price=b.close, idempotency_key=f"bt:{label}:{b.event_date}:{side}:{abs(delta)}",
                                 strategy=strategy.meta.key)
            view = PortfolioView(cash=cash, positions={b.instrument: qty}, last_prices={b.instrument: b.close},
                                 equity=eq, start_of_day_equity=equity[-2] if len(equity) > 1 else eq,
                                 peak_equity=peak, reconciled=True)
            decision = risk.check(intent, view, market_ok=True, data_age_seconds=0, now_ts=float(i * 86400))
            if decision.approved:
                pending = (side, abs(delta), dates[-1], w)
            else:
                rejected.append({"date": dates[-1], "side": side, "qty": abs(delta), "reasons": decision.reasons})
    return {"dates": dates, "equity": equity, "exposure": exposure, "positions": positions, "cash": cashes,
            "fills": fills, "rejected": rejected, "signals": signals, "costs": total_costs,
            "underwater": drawdown_series(equity)}


def config_hash(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, default=str).encode()).hexdigest()[:16]


def result_hash(res):
    payload = [round(e, 6) for e in res["equity"]] + [(f["date"], f["side"], f["qty"]) for f in res["fills"]]
    return hashlib.sha256(json.dumps(payload).encode()).hexdigest()[:16]


def split_bounds(n, train=0.6, validation=0.2):
    a, b = int(n * train), int(n * (train + validation))
    return {"train": (0, a), "validation": (a, b), "test": (b, n)}


def segment_metrics(res, bounds):
    out = {}
    for name, (a, z) in bounds.items():
        if z - a >= 2:
            fills = [f for f in res["fills"] if res["dates"][a] <= f["date"] <= res["dates"][z - 1]]
            out[name] = summarize(res["dates"][a:z], res["equity"][a:z], fills, res["exposure"][a:z])
    return out


def evaluate(bars, strategy, settings, source_info, seed=None, sensitivity=True):
    """Full experiment: net run, gross run (zero costs), buy-and-hold benchmark, date splits, cost and parameter
    sensitivity, warnings, and reproducibility hashes. Parameters are never tuned on the test window."""
    from ..strategies import BuyAndHold, create
    meta = strategy.meta
    cfg = {"strategy": meta.key, "version": meta.version, "params": meta.params, "instrument": bars[0].instrument,
           "first": bars[0].event_date.isoformat(), "last": bars[-1].event_date.isoformat(), "rows": len(bars),
           "costs": asdict(settings.costs), "initial_cash": settings.initial_cash, "engine": ENGINE_VERSION,
           "data_sha256": source_info.content_sha256 or config_hash([b.to_dict() for b in bars]), "seed": seed}
    zero = replace(settings.costs, commission_per_share=0.0, min_commission=0.0, half_spread_bps=0.0, slippage_bps=0.0)
    net = run(bars, strategy, settings, label="net")
    gross = run(bars, strategy, settings, costs=zero, label="gross")
    bench = run(bars, BuyAndHold(), settings, label="bench")
    bounds = split_bounds(len(bars))
    report = {
        "config": cfg, "config_hash": config_hash(cfg), "result_hash": result_hash(net),
        "source": asdict(source_info), "alpha_status": "unproven",
        "timing": "signal at close t; market order fills at open t+1 with half-spread + slippage; commission per share "
                  "with minimum; no same-bar fills",
        "unmodelled": ["queue position", "auction/partial fills", "nonlinear market impact", "borrow/short costs",
                       "dividends and corporate actions on synthetic data", "taxes"],
        "net": summarize(net["dates"], net["equity"], net["fills"], net["exposure"], net["costs"]),
        "gross": summarize(gross["dates"], gross["equity"], gross["fills"], gross["exposure"], 0.0),
        "benchmark": summarize(bench["dates"], bench["equity"], bench["fills"], bench["exposure"], bench["costs"]),
        "relative": relative(net["equity"], bench["equity"]),
        "splits": {"bounds": {k: [net["dates"][a], net["dates"][z - 1]] for k, (a, z) in bounds.items() if z > a},
                   "net": segment_metrics(net, bounds), "benchmark": segment_metrics(bench, bounds),
                   "note": "fixed parameters; nothing is fitted, so train/validation/test are evaluation windows. "
                           "Parameter sensitivity below uses train+validation only."},
        "monthly": monthly_returns(net["dates"], net["equity"]),
        "series": {"dates": net["dates"], "close": [b.close for b in bars], "equity": net["equity"], "gross_equity": gross["equity"],
                   "benchmark_equity": bench["equity"], "underwater": net["underwater"], "exposure": net["exposure"]},
        "fills": net["fills"], "rejected": net["rejected"],
    }
    if sensitivity:
        sens = []
        for mult in (0.0, 1.0, 2.0, 4.0):
            c = replace(settings.costs, commission_per_share=settings.costs.commission_per_share * mult,
                        min_commission=settings.costs.min_commission * mult,
                        half_spread_bps=settings.costs.half_spread_bps * mult,
                        slippage_bps=settings.costs.slippage_bps * mult)
            r = run(bars, strategy, settings, costs=c, label=f"cost{mult}")
            s = summarize(r["dates"], r["equity"], r["fills"], r["exposure"], r["costs"])
            sens.append({"cost_multiplier": mult, "total_return": s["total_return"], "sharpe": s["sharpe"],
                         "max_drawdown": s["max_drawdown"]})
        report["cost_sensitivity"] = sens
        if meta.key == "sma_trend":
            grid, a, z = [], 0, bounds["validation"][1]
            for fast in (20, 50, 100):
                for slow in (100, 150, 200, 250):
                    if fast >= slow:
                        continue
                    r = run(bars[a:z], create("sma_trend", fast=fast, slow=slow), settings, label=f"p{fast}-{slow}")
                    s = summarize(r["dates"], r["equity"], r["fills"], r["exposure"])
                    grid.append({"fast": fast, "slow": slow, "sharpe": s["sharpe"], "total_return": s["total_return"]})
            report["param_sensitivity"] = {"window": "train+validation only", "grid": grid}
    report["warnings"] = warnings(report, bars, meta, source_info)
    return report


def warnings(rep, bars, meta, info):
    w = []
    if info.is_synthetic:
        w.append("DEMO / SYNTHETIC DATA: results say nothing about real markets")
    if len(bars) < meta.warmup + 252:
        w.append(f"insufficient data: {len(bars)} bars for warm-up {meta.warmup} + one year")
    rt = rep["net"].get("round_trips") or 0
    if meta.key != "buy_hold" and rt < 10:
        w.append(f"only {rt} round trips: too few to judge any edge")
    if info.is_provisional:
        w.append(f"PROVISIONAL: price adjustment status is '{info.adjusted}' and not verified; splits and dividends "
                 "may distort returns, so this result cannot count as evidence")
    sens = rep.get("cost_sensitivity") or []
    signs = {(s["sharpe"] or 0) > 0 for s in sens}
    if len(signs) > 1:
        w.append("FRAGILE: Sharpe changes sign between zero and 4x costs")
    grid = (rep.get("param_sensitivity") or {}).get("grid") or []
    if grid and len({(g["sharpe"] or 0) > 0 for g in grid}) > 1:
        w.append("FRAGILE: neighbouring parameters disagree on the sign of Sharpe (in-sample)")
    ns, bs = rep["net"].get("sharpe"), rep["benchmark"].get("sharpe")
    if ns is not None and bs is not None and ns <= bs:
        w.append("net Sharpe does not beat buy-and-hold on the same data")
    return w
