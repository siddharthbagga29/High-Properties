import ast
import unittest
from pathlib import Path

from lql.backtest.engine import run
from lql.backtest.portfolio import run_portfolio
from lql.data.providers import SyntheticProvider
from lql.orchestrator.critic import leakage_probe
from lql.strategies import VolScaledTrend, create, catalog, Strategy, StrategyMeta, REGISTRY
from tests.helpers import settings, bars


class VolScaledTrendTests(unittest.TestCase):
    def test_registered_with_explicit_assumptions(self):
        row = [c for c in catalog() if c["key"] == "vol_scaled_trend"][0]
        self.assertEqual(row["params"], {"slow": 150, "vol_lookback": 20, "target_vol_pct": 10})
        doc = VolScaledTrend.__doc__
        for word in ("assumes", "breaks", "Baselines"):
            self.assertIn(word, doc)

    def test_flat_during_warmup_and_in_downtrends(self):
        s = VolScaledTrend(slow=30, vol_lookback=10, target_vol_pct=10)
        up = bars([100 + i * 0.5 for i in range(80)])
        self.assertEqual(s.target_weight(up[:20]), 0.0)                 # warm-up
        self.assertGreater(s.target_weight(up), 0.0)
        down = bars([200 - i * 0.5 for i in range(80)])
        self.assertEqual(s.target_weight(down), 0.0)                    # below the slow average

    def test_weight_shrinks_when_volatility_rises(self):
        s = VolScaledTrend(slow=30, vol_lookback=10, target_vol_pct=10)
        calm = [100 + i * 0.5 for i in range(60)]
        wild = calm[:-12] + [calm[-13] * (1.03 if i % 2 else 0.97) + i for i in range(12)]
        wild = [max(x, 1.0) for x in wild]
        w_calm = s.target_weight(bars(calm))
        w_wild = s.target_weight(bars(wild))
        self.assertGreater(w_calm, w_wild)
        for w in (w_calm, w_wild):
            self.assertTrue(0.0 <= w <= 1.0)
            self.assertAlmostEqual(w / 0.05, round(w / 0.05), places=6)  # stepped

    def test_parameter_validation(self):
        for kw in ({"slow": 5}, {"vol_lookback": 3}, {"target_vol_pct": 0}, {"slow": 30, "vol_lookback": 60}):
            with self.assertRaises(ValueError):
                VolScaledTrend(**kw)

    def test_no_look_ahead_and_deterministic(self):
        b = SyntheticProvider(n_days=500).bars("DEMO-ETF-A")
        self.assertEqual(leakage_probe(create("vol_scaled_trend", slow=60, vol_lookback=20, target_vol_pct=10), b), [])
        s = settings()
        r1 = run(b, create("vol_scaled_trend", slow=60), s)
        r2 = run(b, create("vol_scaled_trend", slow=60), s)
        self.assertEqual(r1["equity"], r2["equity"])


class StrategiesCannotBypassRiskTests(unittest.TestCase):
    def test_strategy_module_imports_nothing_that_can_trade(self):
        path = Path(__file__).resolve().parent.parent / "lql" / "strategies" / "__init__.py"
        tree = ast.parse(path.read_text())
        mods = set()
        for n in ast.walk(tree):
            if isinstance(n, ast.ImportFrom):
                mods.add((n.module or "").split(".")[-1])
            elif isinstance(n, ast.Import):
                mods |= {a.name.split(".")[-1] for a in n.names}
        self.assertFalse(mods & {"risk", "execution", "ledger", "paper", "config", "engine", "portfolio", "orchestrator"},
                         mods)

    def test_greedy_strategy_is_still_capped_and_checked(self):
        class Greedy(Strategy):
            def __init__(self):
                self.meta = StrategyMeta("greedy", "Greedy", "0", "asks for 10x leverage", warmup=0, max_weight=10.0)

            def target_weight(self, history):
                return 10.0

        s = settings()
        data = {"DEMO-ETF-A": bars([100.0] * 8)}
        r = run_portfolio(data, Greedy(), s, allocation={"DEMO-ETF-A": 1.0})
        for k in range(len(r["dates"])):
            self.assertLessEqual(r["exposure"][k], s.risk.max_concentration + 0.02)
            self.assertGreaterEqual(r["cash"][k], 0)
        self.assertLessEqual(max(r["positions"]["DEMO-ETF-A"]) * 100, s.risk.max_position_notional)
        r1 = run(data["DEMO-ETF-A"], Greedy(), s)
        self.assertLessEqual(max(r1["exposure"]), s.risk.max_concentration + 0.02)

    def test_registry_refuses_overwrite(self):
        from lql.strategies import register
        with self.assertRaises(KeyError):
            register("sma_trend", REGISTRY["sma_trend"])
