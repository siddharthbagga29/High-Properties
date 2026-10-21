import math
import unittest
from dataclasses import replace
from datetime import timedelta

from lql.backtest.engine import run
from lql.backtest.portfolio import (run_portfolio, summarize_portfolio, DataError, prepare, benchmark_buy_hold)
from lql.data.providers import SyntheticProvider
from lql.strategies import BuyAndHold, create, Strategy, StrategyMeta
from tests.helpers import settings, bars

A, B = "DEMO-ETF-A", "DEMO-ETF-B"


def journal_state(res, initial_cash):
    cash, pos = initial_cash, {i: 0 for i in res["instruments"]}
    for f in res["fills"]:
        sign = 1 if f["side"] == "BUY" else -1
        cash -= sign * f["qty"] * f["price"] + f["commission"]
        pos[f["instrument"]] += sign * f["qty"]
    return cash, pos


class Flag(Strategy):
    """Test double: long on the listed dates (ISO strings), else flat. Records the last history date it saw."""
    def __init__(self, on, key="flag"):
        self.on, self.seen = set(on), []
        self.meta = StrategyMeta(key, key, "0", "test", warmup=0)

    def target_weight(self, history):
        self.seen.append(history[-1].event_date)
        return 1.0 if history[-1].event_date.isoformat() in self.on else 0.0


class EquivalenceTests(unittest.TestCase):
    def test_single_instrument_matches_the_existing_engine(self):
        s = settings()
        for strat in (create("sma_trend", fast=20, slow=60), BuyAndHold()):
            b = SyntheticProvider(n_days=500).bars(A)
            old = run(b, strat, s, label="x")
            new = run_portfolio({A: b}, strat, s, label="x", max_volume_participation=0, clamp_to_range=False)
            self.assertEqual(old["equity"], new["equity"])
            self.assertEqual([(f["date"], f["side"], f["qty"], f["price"]) for f in old["fills"]],
                             [(f["date"], f["side"], f["qty"], f["price"]) for f in new["fills"]])
            self.assertEqual(old["costs"], new["costs"])

    def test_defaults_are_deterministic(self):
        s = settings()
        data = {i: SyntheticProvider(n_days=400).bars(i) for i in (A, B)}
        r1 = run_portfolio(data, create("sma_trend", fast=20, slow=60), s)
        r2 = run_portfolio(data, create("sma_trend", fast=20, slow=60), s)
        self.assertEqual(r1["equity"], r2["equity"])
        self.assertEqual(r1["fills"], r2["fills"])


class AccountingTests(unittest.TestCase):
    def setUp(self):
        self.s = settings()
        self.data = {i: SyntheticProvider(n_days=600).bars(i) for i in (A, B)}
        self.res = run_portfolio(self.data, create("sma_trend", fast=20, slow=60), self.s)

    def test_equity_identity_and_journal_replay(self):
        res, closes = self.res, {i: {b.event_date.isoformat(): b.close for b in self.data[i]} for i in self.data}
        last = {}
        for k, d in enumerate(res["dates"]):
            for i in res["instruments"]:
                if d in closes[i]:
                    last[i] = closes[i][d]
            pv = sum(res["positions"][i][k] * last[i] for i in last)
            self.assertAlmostEqual(res["equity"][k], res["cash"][k] + pv, places=6)
            self.assertGreaterEqual(res["cash"][k], -1e-6)          # never borrows
            self.assertTrue(all(res["positions"][i][k] >= 0 for i in res["instruments"]))  # never short
        cash, pos = journal_state(res, self.s.initial_cash)
        self.assertAlmostEqual(cash, res["cash"][-1], places=6)
        self.assertEqual(pos, {i: res["positions"][i][-1] for i in res["instruments"]})

    def test_fills_follow_decisions_and_are_unique(self):
        keys = [(f["instrument"], f["decision_date"], f["side"]) for f in self.res["fills"]]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertTrue(self.res["fills"])
        for f in self.res["fills"]:
            self.assertGreater(f["date"], f["decision_date"])

    def test_both_instruments_trade_and_metrics_pool_round_trips(self):
        traded = {f["instrument"] for f in self.res["fills"]}
        self.assertEqual(traded, {A, B})
        m = summarize_portfolio(self.res)
        self.assertEqual(m["n_fills"], len(self.res["fills"]))
        self.assertIsNotNone(m["turnover_annual"])
        self.assertGreaterEqual(m["round_trips"], 1)

    def test_costs_reduce_equity(self):
        free = replace(self.s.costs, commission_per_share=0.0, min_commission=0.0, half_spread_bps=0.0, slippage_bps=0.0)
        r0 = run_portfolio(self.data, create("sma_trend", fast=20, slow=60), self.s, costs=free)
        self.assertGreater(r0["equity"][-1], self.res["equity"][-1])
        self.assertEqual(r0["costs"], 0.0)
        self.assertGreater(self.res["costs"], 0.0)


class SimultaneousSignalTests(unittest.TestCase):
    def test_two_buys_same_day_share_equity_and_fill_next_open(self):
        s = settings()
        data = {A: bars([100.0] * 6, A), B: bars([50.0] * 6, B)}
        r = run_portfolio(data, BuyAndHold(), s)
        first = [f for f in r["fills"] if f["date"] == r["dates"][1]]
        self.assertEqual({f["instrument"] for f in first}, {A, B})
        for f in first:
            self.assertEqual(f["decision_date"], r["dates"][0])
        notional = {f["instrument"]: f["qty"] * f["price"] for f in first}
        # each instrument was given half of equity (equal allocation), well under both per-name caps
        self.assertAlmostEqual(notional[A] / s.initial_cash, 0.49, delta=0.01)
        self.assertAlmostEqual(notional[B] / s.initial_cash, 0.49, delta=0.01)

    def test_custom_allocation_and_validation(self):
        s = settings()
        data = {A: bars([100.0] * 6, A), B: bars([100.0] * 6, B)}
        r = run_portfolio(data, BuyAndHold(), s, allocation={A: 0.3, B: 0.1})
        n = {f["instrument"]: f["qty"] * f["price"] for f in r["fills"] if f["date"] == r["dates"][1]}
        self.assertGreater(n[A], 2.5 * n[B])
        with self.assertRaises(DataError):
            run_portfolio(data, BuyAndHold(), s, allocation={A: 0.7, B: 0.7})
        with self.assertRaises(DataError):
            run_portfolio(data, {A: BuyAndHold()}, s)

    def test_different_strategies_per_instrument(self):
        s = settings()
        data = {A: bars([100.0] * 8, A), B: bars([100.0] * 8, B)}
        d = [b.event_date.isoformat() for b in data[A]]
        r = run_portfolio(data, {A: Flag(d[:3]), B: Flag(d[2:4])}, s)
        first_buy = {f["instrument"]: f["date"] for f in r["fills"] if f["side"] == "BUY"}
        self.assertEqual(first_buy[A], d[1])
        self.assertEqual(first_buy[B], d[3])


class ConstraintTests(unittest.TestCase):
    def test_cash_is_never_borrowed_when_the_open_gaps_up(self):
        s = settings(max_concentration=1.0)
        s = replace(s, initial_cash=3000.0)
        b = bars([100.0] * 4, A, opens=[100.0, 107.0, 107.0, 107.0])
        r = run_portfolio({A: b}, BuyAndHold(), s, allocation={A: 1.0})
        f = r["fills"][0]
        self.assertLess(f["qty"], int(0.98 * 3000 // 100))      # sized for 100, shrunk to afford 107
        self.assertGreaterEqual(min(r["cash"]), -1e-6)
        self.assertTrue(any("remainder" in m["reason"] for m in r["missed"]))

    def test_gross_exposure_limit_rejects_the_second_name(self):
        s = settings(max_gross_exposure=60000.0)
        data = {A: bars([100.0] * 6, A), B: bars([100.0] * 6, B)}
        r = run_portfolio(data, BuyAndHold(), s)
        self.assertEqual({f["instrument"] for f in r["fills"]}, {A})   # alphabetical priority, deterministic
        rej = [x for x in r["rejected"] if x["instrument"] == B]
        self.assertTrue(rej)
        self.assertTrue(any("max_gross_exposure" in why for x in rej for why in x["reasons"]))

    def test_position_and_concentration_caps_hold_every_day(self):
        s = settings()
        data = {i: SyntheticProvider(n_days=500).bars(i) for i in (A, B)}
        r = run_portfolio(data, create("sma_trend", fast=20, slow=60), s)
        for k in range(len(r["dates"])):
            for i in r["instruments"]:
                px = {b.event_date.isoformat(): b.close for b in data[i]}[r["dates"][k]]
                self.assertLessEqual(r["positions"][i][k] * px, s.risk.max_position_notional * 1.15)
            self.assertLessEqual(r["exposure"][k], 1.0 + 1e-9)

    def test_instrument_outside_allowed_list_is_rejected_by_the_risk_engine(self):
        s = settings()
        data = {"NOT-ALLOWED": bars([100.0] * 5, "NOT-ALLOWED")}
        r = run_portfolio(data, BuyAndHold(), s, allocation={"NOT-ALLOWED": 1.0})
        self.assertFalse(r["fills"])
        self.assertTrue(r["rejected"])

    def test_volume_cap_makes_partial_fills_and_prices_stay_inside_the_bar(self):
        s = settings()
        b = bars([100.0] * 4, A)
        thin = [replace(x, volume=1000.0) for x in b]
        r = run_portfolio({A: thin}, BuyAndHold(), s, allocation={A: 1.0})
        self.assertEqual(r["fills"][0]["qty"], 100)             # 10% of 1000 shares
        self.assertTrue(any("volume cap" in m["reason"] for m in r["missed"]))
        flat_high = [replace(x, open=100.0, high=100.0, low=99.0, close=100.0) for x in b]
        r2 = run_portfolio({A: flat_high}, BuyAndHold(), s, allocation={A: 1.0})
        self.assertLessEqual(r2["fills"][0]["price"], 100.0)    # cost-adjusted buy cannot exceed the day's high
        self.assertTrue(r2["fills"][0]["clamped_to_bar_range"])


class MissingDataTests(unittest.TestCase):
    def _gapped(self):
        full = bars([100.0] * 12, A)
        sparse = [x for i, x in enumerate(bars([50.0] * 12, B)) if i not in (3, 4, 5)]
        return {A: full, B: sparse}

    def test_no_forward_fill_stale_is_reported_and_orders_are_not_carried(self):
        s = settings()
        data = self._gapped()
        dates = [x.event_date.isoformat() for x in data[A]]
        r = run_portfolio(data, {A: BuyAndHold(), B: Flag([dates[2]])}, s)
        # B is decided on dates[2]; its next union date (dates[3]) has no bar -> cancelled, never filled later
        self.assertFalse([f for f in r["fills"] if f["instrument"] == B])
        self.assertTrue([m for m in r["missed"] if m["instrument"] == B and "no bar" in m["reason"]])
        self.assertEqual([x["date"] for x in r["stale"] if x["instrument"] == B], dates[3:6])
        self.assertEqual([x["age_days"] for x in r["stale"] if x["instrument"] == B], [1, 2, 3])

    def test_no_decisions_on_instruments_without_a_bar_and_held_positions_stay_marked(self):
        s = settings()
        data = self._gapped()
        dates = [x.event_date.isoformat() for x in data[A]]
        r = run_portfolio(data, BuyAndHold(), s)
        no_bar = set(dates[3:6])
        self.assertFalse([x for x in r["signals"] if x["instrument"] == B and x["date"] in no_bar])
        pos_before = r["positions"][B][2]
        self.assertGreater(pos_before, 0)
        self.assertEqual(r["positions"][B][3:6], [pos_before] * 3)     # held, valued at the last close
        for k in (3, 4, 5):
            self.assertAlmostEqual(r["equity"][k], r["cash"][k] + r["positions"][A][k] * 100.0 + pos_before * 50.0)

    def test_blocking_data_defects_raise(self):
        s = settings()
        good = bars([100.0] * 5, A)
        with self.assertRaises(DataError):
            run_portfolio({A: good + [good[-1]]}, BuyAndHold(), s)                       # duplicate event
        with self.assertRaises(DataError):
            run_portfolio({A: [good[1], good[0]] + good[2:]}, BuyAndHold(), s)           # out of order
        with self.assertRaises(DataError):
            run_portfolio({A: good[:2] + [replace(good[2], high=1.0)] + good[3:]}, BuyAndHold(), s)  # bad OHLC
        with self.assertRaises(DataError):
            run_portfolio({A: good[:2] + [replace(good[2], close=float("nan"))] + good[3:]}, BuyAndHold(), s)
        with self.assertRaises(DataError):
            prepare({})
        with self.assertRaises(DataError):
            run_portfolio({A: good[:2] + [replace(good[2], instrument=B)] + good[3:]}, BuyAndHold(), s)

    def test_misaligned_calendars_use_the_union(self):
        s = settings()
        a = bars([100.0] * 6, A)
        b = bars([50.0] * 6, B, start=a[0].event_date + timedelta(days=2))
        dates, by_date, _ = prepare({A: a, B: b})
        self.assertEqual(len(dates), 8)
        r = run_portfolio({A: a, B: b}, BuyAndHold(), s)
        self.assertEqual(len(r["dates"]), 8)
        self.assertEqual(r["positions"][B][:2], [0, 0])        # nothing before B exists


class LookAheadTests(unittest.TestCase):
    def test_strategies_only_see_bars_up_to_the_current_date(self):
        s = settings()
        data = {A: bars([100.0 + i for i in range(10)], A), B: bars([50.0] * 10, B)}
        strat = Flag([])
        run_portfolio(data, strat, s)
        # history[-1] is the date being decided: dates arrive in order, one decision per instrument-date
        seen_a = [d for d in strat.seen if d in {x.event_date for x in data[A]}]
        self.assertEqual(sorted(seen_a), seen_a)

    def test_changing_the_future_does_not_change_the_past(self):
        s = settings()
        base = {i: SyntheticProvider(n_days=400).bars(i) for i in (A, B)}
        k = 250
        shocked = {i: base[i][:k] + [replace(x, open=x.open * 3, high=x.high * 3, low=x.low * 3, close=x.close * 3)
                                     for x in base[i][k:]] for i in base}
        r1 = run_portfolio(base, create("sma_trend", fast=20, slow=60), s)
        r2 = run_portfolio(shocked, create("sma_trend", fast=20, slow=60), s)
        self.assertEqual(r1["equity"][:k], r2["equity"][:k])
        self.assertEqual([f for f in r1["fills"] if f["date"] < r1["dates"][k]],
                         [f for f in r2["fills"] if f["date"] < r2["dates"][k]])

    def test_benchmark_runs_under_the_same_caps(self):
        s = settings()
        data = {i: SyntheticProvider(n_days=300).bars(i) for i in (A, B)}
        r = benchmark_buy_hold(data, s)
        self.assertLess(max(r["exposure"]), 1.0)
        self.assertTrue(math.isfinite(r["equity"][-1]))


if __name__ == "__main__":
    unittest.main()
