import math
import unittest
from dataclasses import replace

from lql.backtest.engine import run, evaluate, fill_price, commission
from lql.backtest.metrics import summarize, drawdown_series, round_trips
from lql.data.providers import SyntheticProvider
from lql.orchestrator.critic import leakage_probe, review
from lql.strategies import create, SMATrend, BuyAndHold, sma, Strategy, StrategyMeta
from tests.helpers import settings, bars


class StrategyTests(unittest.TestCase):
    def test_sma_uses_past_only_and_warmup(self):
        self.assertIsNone(sma([1, 2], 3))
        self.assertEqual(sma([1, 2, 3, 4], 2), 3.5)
        s = SMATrend(2, 4)
        b = bars([10, 11, 12, 13, 14, 15])
        self.assertEqual(s.target_weight(b[:3]), 0.0)  # warm-up: flat
        self.assertEqual(s.target_weight(b), 1.0)

    def test_determinism(self):
        b = SyntheticProvider().bars("DEMO-ETF-A")
        s = settings()
        self.assertEqual(run(b, create("sma_trend"), s)["equity"], run(b, create("sma_trend"), s)["equity"])

    def test_leakage_probe(self):
        b = SyntheticProvider(n_days=400).bars("DEMO-ETF-A")
        self.assertEqual(leakage_probe(create("sma_trend"), b), [])

        class Leaky(Strategy):
            """Caches the longest series it has ever seen and peeks one bar ahead."""
            def __init__(self):
                self.meta = StrategyMeta("leaky", "Leaky", "0", "bad", warmup=0)
                self.seen = []
            def target_weight(self, history):
                if len(history) > len(self.seen):
                    self.seen = list(history)
                i = len(history)
                return 1.0 if i < len(self.seen) and self.seen[i].close > history[-1].close else 0.0
        self.assertTrue(leakage_probe(Leaky(), b))


class EngineTests(unittest.TestCase):
    def test_timing_costs_cash_and_positions(self):
        s = settings()
        closes = [100.0] * 3 + [100.0, 102.0, 104.0]
        opens = [100.0, 100.0, 100.0, 101.0, 103.0, 105.0]
        b = bars(closes, opens=opens)
        r = run(b, BuyAndHold(), s)
        f = r["fills"][0]
        self.assertEqual(f["date"], b[1].event_date.isoformat())   # decided at close 0, filled at open 1
        self.assertEqual(f["decision_date"], b[0].event_date.isoformat())
        adj = (s.costs.half_spread_bps + s.costs.slippage_bps) / 1e4
        self.assertAlmostEqual(f["price"], 100.0 * (1 + adj))
        self.assertEqual(f["commission"], commission(f["qty"], s.costs))
        # position capped by risk sizing: 0.65 * 0.98 of equity, at most max_order_qty / notional per slice
        self.assertLessEqual(f["qty"] * 100, s.risk.max_order_notional)
        cash = s.initial_cash - f["qty"] * f["price"] - f["commission"]
        self.assertAlmostEqual(r["cash"][1], cash)
        self.assertAlmostEqual(r["equity"][1], cash + f["qty"] * closes[1])
        self.assertTrue(all(x["date"] > x["decision_date"] for x in r["fills"]))
        self.assertEqual(r["signals"][-1]["date"], b[-2].event_date.isoformat())  # no order on last bar

    def test_fill_price_and_commission(self):
        s = settings()
        self.assertGreater(fill_price(100, "BUY", s.costs), 100)
        self.assertLess(fill_price(100, "SELL", s.costs), 100)
        self.assertEqual(commission(10, s.costs), s.costs.min_commission)
        self.assertEqual(commission(0, s.costs), 0.0)

    def test_metrics(self):
        eq = [100, 110, 99, 120]
        self.assertAlmostEqual(min(drawdown_series(eq)), 99 / 110 - 1)
        m = summarize(["a", "b", "c", "d"], eq)
        self.assertAlmostEqual(m["total_return"], 0.2)
        self.assertIsNone(summarize(["a", "b"], [100, 100])["sharpe"])  # undefined -> None, not invented
        rt = round_trips([{"side": "BUY", "qty": 10, "price": 10, "commission": 1},
                          {"side": "SELL", "qty": 10, "price": 12, "commission": 1}])
        self.assertEqual(rt["round_trips"], 1)
        self.assertAlmostEqual(rt["win_rate"], 1.0)

    def test_evaluate_report_reproducible_and_honest(self):
        p = SyntheticProvider()
        b = p.bars("DEMO-ETF-A")
        r1 = evaluate(b, create("sma_trend"), settings(), p.info(), seed=7)
        r2 = evaluate(b, create("sma_trend"), settings(), p.info(), seed=7)
        self.assertEqual((r1["config_hash"], r1["result_hash"]), (r2["config_hash"], r2["result_hash"]))
        self.assertEqual(r1["alpha_status"], "unproven")
        self.assertTrue(any("SYNTHETIC" in w for w in r1["warnings"]))
        self.assertEqual(r1["param_sensitivity"]["window"], "train+validation only")
        self.assertEqual([c["cost_multiplier"] for c in r1["cost_sensitivity"]], [0.0, 1.0, 2.0, 4.0])
        self.assertGreaterEqual(r1["gross"]["total_return"], r1["net"]["total_return"])
        v = review(r1, create("sma_trend"), b)
        self.assertEqual(v["verdict"], "NOT_PROVEN")
        self.assertEqual(v["alpha_status"], "unproven")

    def test_critic_catches_tampered_metrics_and_same_bar_fills(self):
        p = SyntheticProvider()
        b = p.bars("DEMO-ETF-B")
        rep = evaluate(b, create("sma_trend"), settings(), p.info(), sensitivity=False)
        rep["net"]["total_return"] = 5.0
        self.assertEqual(review(rep)["verdict"], "REJECTED")
        rep2 = evaluate(b, create("sma_trend"), settings(), p.info(), sensitivity=False)
        rep2["fills"][0] = dict(rep2["fills"][0], date=rep2["fills"][0]["decision_date"])
        self.assertTrue(any(x.startswith("timing") for x in review(rep2)["blocking"]))

    def test_risk_rejections_are_kept(self):
        s = settings(max_drawdown=0.01)
        closes = [100 - i * 0.5 for i in range(60)]
        r = run(bars(closes), BuyAndHold(), s)
        self.assertTrue(r["rejected"])
        self.assertTrue(any("max_drawdown" in x for rj in r["rejected"] for x in rj["reasons"]))
