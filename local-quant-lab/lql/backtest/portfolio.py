"""Multi-instrument daily portfolio backtester (v1.0.0). Same conventions as the single-instrument engine
(`lql.backtest.engine`, D-005), extended to one shared cash balance and several instruments.

Calendar: the union of all instruments' session dates, ascending. Each instrument is validated first (strictly
increasing dates, no duplicates, finite positive OHLC); anything blocking raises `DataError`. Gaps are NOT forward
filled into bars.

Order of operations for each union date t:
1. Fills of orders decided at the previous union date, at the OPEN of t (sells first, then buys; instruments in
   alphabetical order) with half-spread + slippage and commission. An order whose instrument has no bar on t is
   CANCELLED (recorded in `missed`): it is never carried across a data gap. Fill prices are clamped to the bar's
   [low, high], quantity is capped at `max_volume_participation` of the bar's volume (remainder dropped, recorded),
   and a buy is shrunk to the cash left. No borrowing, no shorting.
2. Mark to the latest known close. An instrument without a bar on t keeps its last close and is counted in `stale`;
   once it is older than `max_stale_days` calendar days it gets no new orders (a held position is only flagged).
3. For each instrument that HAS a bar on t (alphabetical): the strategy sees that instrument's bars up to t only and
   returns a weight; weight x allocation share -> `size_order` -> `RiskEngine.check` with the whole portfolio in the
   view (all positions, all last prices, cash minus cash already reserved by orders approved earlier on t, positions
   including those pending orders). Alphabetical priority for cash is arbitrary but deterministic.
No order is created on the last date. Unmodelled: queue position, auctions, market impact beyond linear slippage,
borrow, dividends/corporate actions, taxes, intraday risk.
"""
import math
from dataclasses import replace

from ..data.quality import validate
from ..risk import RiskEngine, OrderIntent, PortfolioView, size_order
from .engine import fill_price, commission
from .metrics import summarize, drawdown_series, trip_pnls, trip_stats

PORTFOLIO_ENGINE_VERSION = "1.0.0"


class DataError(Exception):
    pass


def prepare(bars_by_inst):
    """Validate every instrument and return (sorted union dates, {inst: {date: bar}}, {inst: [bars]})."""
    if not bars_by_inst:
        raise DataError("no instruments")
    by_date, series = {}, {}
    for inst in sorted(bars_by_inst):
        bars = list(bars_by_inst[inst])
        q = validate(bars, instrument=inst)
        blocking = [i for i in q.issues if i["code"] in ("invalid_ohlc", "non_monotonic", "duplicate",
                                                           "non_positive_price", "empty", "wrong_instrument")]
        if blocking:
            raise DataError(f"{inst}: {blocking[0]['code']} on {blocking[0]['date']} ({blocking[0]['detail']})")
        for b in bars:
            if not all(math.isfinite(x) for x in (b.open, b.high, b.low, b.close, b.volume)):
                raise DataError(f"{inst}: non-finite value on {b.event_date}")
        by_date[inst] = {b.event_date: b for b in bars}
        series[inst] = bars
    dates = sorted({d for m in by_date.values() for d in m})
    return dates, by_date, series


def equal_allocation(instruments):
    n = len(instruments)
    return {i: 1.0 / n for i in instruments}


def run_portfolio(bars_by_inst, strategies, settings, costs=None, risk_engine=None, label="", allocation=None,
                  max_stale_days=5, max_volume_participation=0.10, clamp_to_range=True):
    """strategies: one Strategy (applied to every instrument) or {instrument: Strategy}. allocation: {instrument:
    share of equity the instrument's 0..1 weight is scaled by}; default equal shares; shares must sum to <= 1."""
    costs = costs or settings.costs
    dates, by_date, series = prepare(bars_by_inst)
    insts = sorted(bars_by_inst)
    strat = strategies if isinstance(strategies, dict) else {i: strategies for i in insts}
    if set(strat) != set(insts):
        raise DataError("strategies must cover exactly the instruments")
    alloc = allocation or equal_allocation(insts)
    if set(alloc) != set(insts) or any(v < 0 for v in alloc.values()) or sum(alloc.values()) > 1 + 1e-9:
        raise DataError("allocation must cover the instruments, be non-negative and sum to <= 1")
    risk = risk_engine or RiskEngine(settings.risk, mode="BACKTEST")
    cash = float(settings.initial_cash)
    qty = {i: 0 for i in insts}
    last_close, last_date = {}, {}
    hist = {i: [] for i in insts}
    pending = {}   # inst -> (side, qty, decision_date, weight)
    out = {"dates": [], "equity": [], "cash": [], "exposure": [], "positions": {i: [] for i in insts},
           "fills": [], "rejected": [], "missed": [], "stale": [], "signals": []}
    total_costs, peak, seen_fill_keys = 0.0, cash, set()
    for t, d in enumerate(dates):
        ds = d.isoformat()
        # 1. fills, sells before buys
        for side_now in ("SELL", "BUY"):
            for inst in sorted(pending):
                side, q, ddate, w = pending[inst]
                if side != side_now:
                    continue
                b = by_date[inst].get(d)
                if b is None:
                    out["missed"].append({"date": ds, "instrument": inst, "decision_date": ddate, "side": side,
                                          "qty": q, "reason": "no bar on the fill date; order cancelled, not carried"})
                    continue
                ref = b.open
                px = fill_price(ref, side, costs)
                clamped = False
                if clamp_to_range and not b.low <= px <= b.high:
                    px, clamped = min(max(px, b.low), b.high), True
                cap = int(max_volume_participation * b.volume) if max_volume_participation else q
                q_try = min(q, max(cap, 0))
                if side == "SELL":
                    q_try = min(q_try, qty[inst])
                comm = commission(q_try, costs)
                if side == "BUY" and q_try * px + comm > cash:
                    q_try = max(0, int((cash - costs.min_commission) // px))
                    comm = commission(q_try, costs)
                if q_try < q:
                    out["missed"].append({"date": ds, "instrument": inst, "decision_date": ddate, "side": side,
                                          "qty": q - q_try, "reason": "unfilled remainder (volume cap, cash or "
                                                                      "position limit); dropped, not carried"})
                if q_try > 0:
                    key = (inst, ddate, side)
                    if key in seen_fill_keys:
                        raise DataError(f"duplicate fill event {key}")
                    seen_fill_keys.add(key)
                    notional = q_try * px
                    cash += -notional - comm if side == "BUY" else notional - comm
                    qty[inst] += q_try if side == "BUY" else -q_try
                    slip = abs(px - ref) * q_try
                    total_costs += comm + slip
                    out["fills"].append({"date": ds, "decision_date": ddate, "instrument": inst, "side": side,
                                         "qty": q_try, "price": px, "ref_price": ref, "commission": comm,
                                         "spread_slippage": slip, "clamped_to_bar_range": clamped,
                                         "reason": f"target weight {w:.3f} decided at close {ddate}"})
        pending = {}
        # 2. mark
        for inst in insts:
            b = by_date[inst].get(d)
            if b is not None:
                last_close[inst], last_date[inst] = b.close, d
                hist[inst].append(b)
            elif inst in last_date:
                out["stale"].append({"date": ds, "instrument": inst, "age_days": (d - last_date[inst]).days,
                                     "held_qty": qty[inst]})
        pos_val = {i: qty[i] * last_close[i] for i in insts if i in last_close}
        eq = cash + sum(pos_val.values())
        peak = max(peak, eq)
        out["dates"].append(ds)
        out["equity"].append(eq)
        out["cash"].append(cash)
        out["exposure"].append(sum(pos_val.values()) / eq if eq > 0 else 0.0)
        for i in insts:
            out["positions"][i].append(qty[i])
        if t == len(dates) - 1:
            break
        # 3. decisions
        reserved, committed = 0.0, dict(qty)
        sod = out["equity"][-2] if len(out["equity"]) > 1 else eq
        for inst in insts:
            b = by_date[inst].get(d)
            if b is None:
                continue
            if (d - last_date[inst]).days > max_stale_days:  # unreachable for a fresh bar; kept explicit
                continue
            s = strat[inst]
            w = max(0.0, min(s.meta.max_weight, s.target_weight(hist[inst]))) * alloc[inst]
            out["signals"].append({"date": ds, "instrument": inst, "weight": w})
            delta = size_order(settings.risk, w, eq, b.close, qty[inst])
            if delta == 0:
                continue
            side = "BUY" if delta > 0 else "SELL"
            intent = OrderIntent(instrument=inst, side=side, qty=abs(delta), order_type="MARKET", ref_price=b.close,
                                 idempotency_key=f"pbt:{label}:{ds}:{inst}:{side}:{abs(delta)}", strategy=s.meta.key)
            view = PortfolioView(cash=cash - reserved, positions=dict(committed), last_prices=dict(last_close),
                                 equity=eq, start_of_day_equity=sod, peak_equity=peak, reconciled=True)
            dec = risk.check(intent, view, market_ok=True, data_age_seconds=0, now_ts=float(t * 86400))
            if dec.approved:
                pending[inst] = (side, abs(delta), ds, w)
                if side == "BUY":
                    reserved += abs(delta) * b.close
                    committed[inst] += abs(delta)
                else:
                    committed[inst] -= abs(delta)
            else:
                out["rejected"].append({"date": ds, "instrument": inst, "side": side, "qty": abs(delta),
                                        "reasons": list(dec.reasons)})
    out["costs"] = total_costs
    out["underwater"] = drawdown_series(out["equity"])
    out["instruments"] = insts
    out["allocation"] = alloc
    out["engine"] = PORTFOLIO_ENGINE_VERSION
    return out


def summarize_portfolio(res, costs=None):
    """Portfolio metrics. Round trips are FIFO per instrument, then pooled."""
    s = summarize(res["dates"], res["equity"], None, res["exposure"], res["costs"] if costs is None else costs)
    if s.get("days", 0) < 2 or "total_return" not in s:
        return s
    fills = res["fills"]
    traded = sum(f["qty"] * f["price"] for f in fills)
    years = (len(res["equity"]) - 1) / 252
    avg_eq = sum(res["equity"]) / len(res["equity"])
    s["n_fills"] = len(fills)
    s["turnover_annual"] = traded / avg_eq / years if years > 0 and avg_eq > 0 else None
    trips = []
    for inst in res["instruments"]:
        trips += trip_pnls([f for f in fills if f["instrument"] == inst])
    s.update(trip_stats(trips))
    s["cost_drag_total_return"] = s["costs"] / res["equity"][0] if res["equity"][0] else None
    return s


def benchmark_buy_hold(bars_by_inst, settings, **kw):
    """Equal-share buy-and-hold under the same caps, costs and risk engine: the benchmark for any strategy."""
    from ..strategies import BuyAndHold
    return run_portfolio(bars_by_inst, BuyAndHold(), settings, label="bench", **kw)


def with_costs(settings, mult):
    c = settings.costs
    return replace(c, commission_per_share=c.commission_per_share * mult, min_commission=c.min_commission * mult,
                   half_spread_bps=c.half_spread_bps * mult, slippage_bps=c.slippage_bps * mult)
