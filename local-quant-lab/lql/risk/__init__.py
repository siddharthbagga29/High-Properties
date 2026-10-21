"""Deterministic pre-trade risk engine. Ordinary code, no model calls, no network: every order intent from a backtest,
the paper session or anything else passes `RiskEngine.check` before it can reach the simulator.

Fail closed: an unknown instrument or order type, missing limits, a missing data age, an unreconciled ledger, an
engaged kill switch or any internal exception is a rejection. Loss and drawdown breaches block risk-increasing
orders (BUY in this long-only build) but still allow reducing an existing position. Agents may only recommend
stricter limits through `lql.config.tighten`; nothing here reads agent output.
"""
from collections import deque
from dataclasses import dataclass, field

ORDER_TYPES = ("MARKET", "LIMIT")
SIDES = ("BUY", "SELL")


@dataclass(frozen=True)
class OrderIntent:
    instrument: str
    side: str
    qty: int
    order_type: str = "MARKET"
    ref_price: float = None        # trusted reference (last validated close) used for notional
    limit_price: float = None
    idempotency_key: str = ""
    strategy: str = ""


@dataclass
class PortfolioView:
    cash: float
    positions: dict                 # instrument -> qty
    last_prices: dict               # instrument -> last trusted close
    equity: float
    start_of_day_equity: float
    peak_equity: float
    reconciled: bool = True


@dataclass(frozen=True)
class Decision:
    approved: bool
    reasons: tuple = ()
    checked: tuple = field(default=(), compare=False)


class RiskEngine:
    def __init__(self, limits, mode="PAPER", events=None):
        self.limits = limits
        self.mode = mode
        self.events = events
        self.kill_switch = False
        self.kill_reason = ""
        self.disabled_strategies = set()
        self._seen_keys = set()
        self._order_times = deque()

    # -- switches -------------------------------------------------------------------------------------------------
    def engage_kill_switch(self, reason):
        self.kill_switch, self.kill_reason = True, reason or "unspecified"
        self._emit("kill_switch", f"kill switch engaged: {self.kill_reason}", "critical")

    def release_kill_switch(self, by):
        """Human action only. The caller records who released it."""
        if not by:
            raise ValueError("releasing the kill switch needs a named human operator")
        self.kill_switch, self.kill_reason = False, ""
        self._emit("kill_switch", f"kill switch released by {by}", "warning")

    def disable_strategy(self, key, reason=""):
        self.disabled_strategies.add(key)
        self._emit("strategy_disabled", f"strategy {key} disabled: {reason}", "warning", strategy=key)

    def enable_strategy(self, key, by):
        if not by:
            raise ValueError("re-enabling a strategy needs a named human operator")
        self.disabled_strategies.discard(key)
        self._emit("strategy_enabled", f"strategy {key} re-enabled by {by}", "warning", strategy=key)

    # -- the check ------------------------------------------------------------------------------------------------
    def check(self, intent, view, market_ok=True, data_age_seconds=None, now_ts=None):
        try:
            reasons, checked = self._evaluate(intent, view, market_ok, data_age_seconds, now_ts)
        except Exception as e:  # fail closed on any internal error
            reasons, checked = [f"risk_engine_error: {type(e).__name__}: {e}"], ("internal",)
        decision = Decision(approved=not reasons, reasons=tuple(reasons), checked=tuple(checked))
        if decision.approved:
            self._seen_keys.add(intent.idempotency_key)
            self._order_times.append(now_ts)
        else:
            self._emit("risk_rejected", f"{intent.side} {intent.qty} {intent.instrument} rejected: "
                       + "; ".join(reasons), "warning", intent=intent.__dict__, reasons=list(reasons))
        return decision

    def _evaluate(self, o, v, market_ok, data_age, now_ts):
        L, r, checked = self.limits, [], []

        def rule(name, ok, msg):
            checked.append(name)
            if not ok:
                r.append(f"{name}: {msg}")

        if L is None:
            return ["missing_config: no risk limits loaded"], ["config"]
        rule("kill_switch", not self.kill_switch, f"engaged ({self.kill_reason})")
        rule("strategy_disabled", o.strategy not in self.disabled_strategies, f"{o.strategy} is disabled")
        rule("instrument", o.instrument in L.allowed_instruments, f"{o.instrument} is not on the allowed list")
        rule("order_type", o.order_type in ORDER_TYPES, f"unknown order type {o.order_type!r}")
        rule("side", o.side in SIDES, f"unknown side {o.side!r}")
        rule("quantity", isinstance(o.qty, int) and not isinstance(o.qty, bool) and o.qty > 0,
             f"quantity must be a positive whole number, got {o.qty!r}")
        ref = o.ref_price
        rule("price", isinstance(ref, (int, float)) and ref > 0 and ref == ref, f"invalid reference price {ref!r}")
        if o.order_type == "LIMIT":
            rule("limit_price", isinstance(o.limit_price, (int, float)) and o.limit_price > 0,
                 f"invalid limit price {o.limit_price!r}")
        rule("idempotency", bool(o.idempotency_key) and o.idempotency_key not in self._seen_keys,
             "missing or duplicate idempotency key")
        rule("market_state", bool(market_ok), "provider disconnected or market state invalid")
        rule("data_fresh", data_age is not None and 0 <= data_age <= L.max_data_age_seconds,
             "missing data age" if data_age is None else
             ("negative data age: clock/timezone mismatch" if data_age < 0 else
              f"data is {data_age:.0f}s old, limit {L.max_data_age_seconds}s"))
        rule("reconciled", bool(v.reconciled), "ledger/portfolio state is not reconciled")
        rule("clock", isinstance(now_ts, (int, float)), "no decision timestamp")
        if r:  # structural failures: do not evaluate exposure maths on bad inputs
            return r, checked

        px = o.limit_price if o.order_type == "LIMIT" and o.side == "BUY" else ref
        notional = o.qty * px
        trusted = v.last_prices.get(o.instrument)
        rule("trusted_reference", trusted is not None and trusted > 0, "no trusted reference price")
        if trusted:
            for name, p in (("price_band", ref), ("limit_band", o.limit_price)):
                if p is not None:
                    rule(name, abs(p / trusted - 1) <= L.price_band,
                         f"{p:.4f} deviates {abs(p / trusted - 1):.1%} from trusted {trusted:.4f} (band {L.price_band:.0%})")
        rule("max_order_qty", o.qty <= L.max_order_qty, f"{o.qty} > {L.max_order_qty}")
        rule("max_order_notional", notional <= L.max_order_notional, f"{notional:,.0f} > {L.max_order_notional:,.0f}")
        held = v.positions.get(o.instrument, 0)
        if o.side == "SELL":
            rule("no_short", o.qty <= held, f"sell {o.qty} exceeds held {held}; shorting is disabled")
        increasing = o.side == "BUY"
        if increasing:
            new_pos = (held + o.qty) * px
            gross = sum(abs(q) * v.last_prices.get(i, 0) for i, q in v.positions.items() if i != o.instrument) + new_pos
            rule("max_position_notional", new_pos <= L.max_position_notional,
                 f"position would be {new_pos:,.0f} > {L.max_position_notional:,.0f}")
            rule("max_gross_exposure", gross <= L.max_gross_exposure, f"gross would be {gross:,.0f} > {L.max_gross_exposure:,.0f}")
            rule("max_concentration", v.equity > 0 and new_pos / v.equity <= L.max_concentration,
                 f"would be {new_pos / v.equity:.0%} of equity > {L.max_concentration:.0%}" if v.equity > 0 else "equity <= 0")
            rule("cash", notional <= v.cash, f"needs {notional:,.0f}, cash {v.cash:,.0f}; no borrowing")
            loss = v.start_of_day_equity - v.equity
            rule("max_daily_loss", loss < L.max_daily_loss, f"daily loss {loss:,.0f} >= {L.max_daily_loss:,.0f}")
            dd = 1 - v.equity / v.peak_equity if v.peak_equity > 0 else 1
            rule("max_drawdown", dd < L.max_drawdown, f"drawdown {dd:.1%} >= {L.max_drawdown:.0%}")
        window = L.order_window_seconds
        recent = sum(1 for t in self._order_times if now_ts - t < window)
        rule("order_rate", recent < L.max_orders_per_window,
             f"{recent} orders in the last {window}s, limit {L.max_orders_per_window}")
        while self._order_times and now_ts - self._order_times[0] >= window:
            self._order_times.popleft()
        return r, checked

    def _emit(self, kind, msg, severity="info", **data):
        if self.events is not None:
            self.events.emit(kind, msg, severity, mode=self.mode, **data)


def size_order(limits, weight, equity, price, held, buffer=0.98, min_trade_fraction=0.02):
    """Portfolio construction shared by backtest and paper: turn a target weight into a signed share delta that fits
    the hard limits (weight capped at max_concentration, position at max_position_notional, each order at
    max_order_qty / max_order_notional), so a 100% signal builds a capped position in limit-sized slices. This is
    sizing, not approval: the resulting intent still goes through `RiskEngine.check`. Trades smaller than
    min_trade_fraction of equity are skipped (no daily drift rebalancing) unless they exit the position fully."""
    import math
    if price <= 0 or equity <= 0:
        return -held if held > 0 else 0
    w = max(0.0, min(weight, limits.max_concentration * buffer))
    target = int(math.floor(min(w * equity, limits.max_position_notional * buffer) / price))
    delta = target - held
    slice_cap = min(limits.max_order_qty, int(limits.max_order_notional * buffer // price))
    delta = max(-slice_cap, min(delta, slice_cap))
    if target > 0 and abs(delta) * price < min_trade_fraction * equity:
        return 0
    return delta
