"""Isolated NautilusTrader proof of concept (run with the scratchpad venv; nothing is installed in the project).

Same input, same trivial strategy, two engines:
  A. an independent ~25-line reference: SMA(fast)/SMA(slow) on closes; at the close of day t decide a target of
     QTY shares if fast > slow else 0; the order fills at the OPEN of day t+1; no costs; equity = cash + qty * close.
  B. NautilusTrader BacktestEngine: same bars, a strategy with the same rule, zero fees, a 1 ns order latency so a
     market order decided on bar t reaches the venue after bar t and fills at bar t+1's open.
Compares signal days, fills (date, side, qty, price), final equity and max drawdown. Prints JSON."""
import json, resource, sys, time
from collections import deque
from datetime import datetime, timezone
from decimal import Decimal

sys.path.insert(0, sys.argv[1])            # the Local Quant Lab checkout (stdlib-only package) for the synthetic bars
from lql.data.providers import SyntheticProvider

FAST, SLOW, QTY, CASH = 10, 30, 100, 100_000.0
OPEN_TICKS = "--open-ticks" in sys.argv
bars = [(b.event_date.isoformat(), round(b.open, 2), round(b.high, 2), round(b.low, 2), round(b.close, 2), int(b.volume) or 1)
        for b in SyntheticProvider().bars("DEMO-ETF-A")]


def reference():
    closes, pos, cash, pending, fills, equity = [], 0, CASH, None, [], []
    for d, o, h, l, c, v in bars:
        if pending is not None and pending != pos:
            q = pending - pos
            cash -= q * o
            fills.append((d, "BUY" if q > 0 else "SELL", abs(q), o))
            pos = pending
        pending = None
        closes.append(c)
        if len(closes) >= SLOW:
            f, s = sum(closes[-FAST:]) / FAST, sum(closes[-SLOW:]) / SLOW
            pending = QTY if f > s else 0
        equity.append(cash + pos * c)
    return fills, equity


def nautilus():
    from nautilus_trader.backtest.engine import BacktestEngine, BacktestEngineConfig
    from nautilus_trader.backtest.models import LatencyModel
    from nautilus_trader.config import LoggingConfig, StrategyConfig
    from nautilus_trader.model.currencies import USD
    from nautilus_trader.model.data import Bar, BarType
    from nautilus_trader.model.enums import AccountType, OmsType, OrderSide
    from nautilus_trader.model.identifiers import InstrumentId, Symbol, Venue
    from nautilus_trader.model.instruments import Equity
    from nautilus_trader.model.objects import Money, Price, Quantity
    from nautilus_trader.trading.strategy import Strategy

    venue = Venue("SIM")
    iid = InstrumentId(Symbol("DEMOA"), venue)
    inst = Equity(instrument_id=iid, raw_symbol=Symbol("DEMOA"), currency=USD, price_precision=2,
                  price_increment=Price.from_str("0.01"), lot_size=Quantity.from_int(1), ts_event=0, ts_init=0,
                  maker_fee=Decimal(0), taker_fee=Decimal(0))
    bt = BarType.from_str("DEMOA.SIM-1-DAY-LAST-EXTERNAL")

    def ts(d):   # the bar is stamped at the session close, 21:00 UTC
        return int(datetime.fromisoformat(d).replace(hour=21, tzinfo=timezone.utc).timestamp() * 1e9)
    data = [Bar(bt, Price(o, 2), Price(h, 2), Price(l, 2), Price(c, 2), Quantity(v, 0), ts(d), ts(d)) for d, o, h, l, c, v in bars]
    if OPEN_TICKS:   # one trade at each session open (14:30 UTC) so an order decided at the prior close fills at the open
        from nautilus_trader.model.data import TradeTick
        from nautilus_trader.model.enums import AggressorSide
        from nautilus_trader.model.identifiers import TradeId
        def ts_open(d):
            return int(datetime.fromisoformat(d).replace(hour=14, minute=30, tzinfo=timezone.utc).timestamp() * 1e9)
        data += [TradeTick(iid, Price(o, 2), Quantity(v, 0), AggressorSide.NO_AGGRESSOR, TradeId(f"o{k}"), ts_open(d), ts_open(d))
                 for k, (d, o, h, l, c, v) in enumerate(bars)]

    class Cfg(StrategyConfig, frozen=True):
        pass

    class Sma(Strategy):
        def __init__(self):
            super().__init__(Cfg())
            self.closes, self.target = deque(maxlen=SLOW), 0

        def on_start(self):
            self.subscribe_bars(bt)

        def on_bar(self, bar):
            self.closes.append(float(bar.close))
            if len(self.closes) < SLOW:
                return
            cl = list(self.closes)
            want = QTY if sum(cl[-FAST:]) / FAST > sum(cl) / SLOW else 0
            pos = self.target
            if want != pos:
                q = want - pos
                self.submit_order(self.order_factory.market(iid, OrderSide.BUY if q > 0 else OrderSide.SELL, Quantity.from_int(abs(q))))
                self.target = want

    eng = BacktestEngine(BacktestEngineConfig(logging=LoggingConfig(log_level="ERROR")))
    eng.add_venue(venue, OmsType.NETTING, AccountType.CASH, [Money(CASH, USD)], base_currency=USD,
                  latency_model=LatencyModel(base_latency_nanos=1))
    eng.add_instrument(inst)
    eng.add_data(data)
    eng.add_strategy(Sma())
    eng.run()
    rep = eng.trader.generate_order_fills_report()
    fills = []
    for _, r in rep.sort_values("ts_last").iterrows():
        d = datetime.fromtimestamp(int(r["ts_last"].value) / 1e9 if hasattr(r["ts_last"], "value") else 0, tz=timezone.utc)
        fills.append((d.date().isoformat(), str(r["side"]), int(float(r["filled_qty"])), float(r["avg_px"])))
    acct = eng.trader.generate_account_report(venue)
    final_cash = float(acct["total"].iloc[-1])
    eng.dispose()
    return fills, final_cash


def mdd(eq):
    peak, m = eq[0], 0.0
    for e in eq:
        peak = max(peak, e); m = min(m, e / peak - 1)
    return m


t0 = time.time(); ref_fills, ref_eq = reference(); t_ref = time.time() - t0
t0 = time.time(); nt_fills, nt_cash = nautilus(); t_nt = time.time() - t0
# rebuild Nautilus equity from its own fills on the same closes (cash + position * close), to compare curves
pos, cash, k, nt_eq = 0, CASH, 0, []
for d, o, h, l, c, v in bars:
    while k < len(nt_fills) and nt_fills[k][0] == d:
        _, side, q, px = nt_fills[k]
        pos += q if side == "BUY" else -q
        cash += -q * px if side == "BUY" else q * px
        k += 1
    nt_eq.append(cash + pos * c)
same_fills = ref_fills == [(d, s, q, round(p, 2)) for d, s, q, p in nt_fills]
first_diff = next(((a, b) for a, b in zip(ref_fills, nt_fills) if a != (b[0], b[1], b[2], round(b[3], 2))), None)
print(json.dumps({
    "variant": "bars + a trade tick at each open" if OPEN_TICKS else "daily bars only",
    "input": {"instrument": "DEMO-ETF-A (SYNTHETIC)", "bars": len(bars), "first": bars[0][0], "last": bars[-1][0],
              "prices_rounded_to": 0.01, "strategy": f"SMA {FAST}/{SLOW}, {QTY} shares, long/flat, no costs"},
    "reference": {"fills": len(ref_fills), "final_equity": round(ref_eq[-1], 2), "max_drawdown": round(mdd(ref_eq), 6), "seconds": round(t_ref, 3)},
    "nautilus": {"version": __import__("nautilus_trader").__version__, "fills": len(nt_fills), "final_equity_rebuilt": round(nt_eq[-1], 2),
                 "account_cash_after_run": round(nt_cash, 2), "max_drawdown": round(mdd(nt_eq), 6), "seconds": round(t_nt, 3)},
    "fills_identical": same_fills, "first_difference": first_diff,
    "equity_max_abs_diff": round(max(abs(a - b) for a, b in zip(ref_eq, nt_eq)), 6),
    "first_fills": {"reference": ref_fills[:3], "nautilus": nt_fills[:3]},
    "peak_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
}, indent=1))
