import unittest

from lql.events import EventLog
from lql.risk import RiskEngine, OrderIntent, PortfolioView, size_order
from tests.helpers import settings, tmpdir


def view(**kw):
    d = dict(cash=100000.0, positions={}, last_prices={"SPY": 100.0}, equity=100000.0, start_of_day_equity=100000.0,
             peak_equity=100000.0, reconciled=True)
    d.update(kw)
    return PortfolioView(**d)


def intent(**kw):
    d = dict(instrument="SPY", side="BUY", qty=10, order_type="MARKET", ref_price=100.0, idempotency_key="k1",
             strategy="sma_trend")
    d.update(kw)
    return OrderIntent(**d)


class RiskTests(unittest.TestCase):
    def setUp(self):
        self.log = EventLog(tmpdir() / "events.jsonl")
        self.r = RiskEngine(settings().risk, events=self.log)

    def rejected(self, rule, i=None, v=None, **kw):
        d = self.r.check(i or intent(), v or view(), **dict(dict(market_ok=True, data_age_seconds=0, now_ts=0.0), **kw))
        self.assertFalse(d.approved, f"{rule} should reject")
        self.assertTrue(any(x.startswith(rule) for x in d.reasons), d.reasons)
        return d

    def test_clean_order_passes(self):
        self.assertTrue(self.r.check(intent(), view(), data_age_seconds=0, now_ts=0.0).approved)

    def test_each_limit_fails_closed(self):
        self.rejected("instrument", intent(instrument="GME"))
        self.rejected("order_type", intent(order_type="STOP"))
        self.rejected("quantity", intent(qty=0))
        self.rejected("quantity", intent(qty=1.5))
        self.rejected("price", intent(ref_price=-1))
        self.rejected("price", intent(ref_price=float("nan")))
        self.rejected("limit_price", intent(order_type="LIMIT", limit_price=None))
        self.rejected("max_order_qty", intent(qty=2001, ref_price=1.0), view(last_prices={"SPY": 1.0}))
        self.rejected("max_order_notional", intent(qty=600))
        self.rejected("max_position_notional", intent(qty=100), view(positions={"SPY": 550}, cash=100000, equity=155000))
        self.rejected("max_concentration", intent(qty=400), view(equity=50000, cash=50000))
        self.rejected("max_gross_exposure", intent(qty=400), view(positions={"SPY": 0, "QQQ": 700},
                                                                last_prices={"SPY": 100.0, "QQQ": 100.0}, equity=200000))
        self.rejected("cash", intent(qty=400), view(cash=1000.0))
        self.rejected("max_daily_loss", v=view(equity=96000, start_of_day_equity=100000, peak_equity=100000))
        self.rejected("max_drawdown", v=view(equity=79000, start_of_day_equity=79000, peak_equity=100000))
        self.rejected("price_band", intent(ref_price=120.0))
        self.rejected("no_short", intent(side="SELL", qty=5))
        self.rejected("market_state", market_ok=False)
        self.rejected("data_fresh", data_age_seconds=None)
        self.rejected("data_fresh", data_age_seconds=10 ** 7)
        self.rejected("data_fresh", data_age_seconds=-5)
        self.rejected("reconciled", v=view(reconciled=False))
        self.rejected("clock", now_ts=None)

    def test_loss_limits_still_allow_reducing(self):
        v = view(positions={"SPY": 10}, equity=79000, start_of_day_equity=79000, peak_equity=100000)
        self.assertTrue(self.r.check(intent(side="SELL"), v, data_age_seconds=0, now_ts=0.0).approved)

    def test_duplicate_idempotency_key(self):
        self.assertTrue(self.r.check(intent(), view(), data_age_seconds=0, now_ts=0.0).approved)
        self.rejected("idempotency")
        self.rejected("idempotency", intent(idempotency_key=""))

    def test_order_rate_limit(self):
        r = RiskEngine(settings(max_orders_per_window=3, order_window_seconds=60).risk)
        for i in range(3):
            self.assertTrue(r.check(intent(idempotency_key=f"k{i}"), view(), data_age_seconds=0, now_ts=float(i)).approved)
        d = r.check(intent(idempotency_key="k9"), view(), data_age_seconds=0, now_ts=5.0)
        self.assertIn("order_rate", d.reasons[0])
        self.assertTrue(r.check(intent(idempotency_key="k10"), view(), data_age_seconds=0, now_ts=100.0).approved)

    def test_kill_switch_and_strategy_disable(self):
        self.r.engage_kill_switch("test")
        self.rejected("kill_switch")
        with self.assertRaises(ValueError):
            self.r.release_kill_switch("")
        self.r.release_kill_switch("founder")
        self.r.disable_strategy("sma_trend")
        self.rejected("strategy_disabled", intent(idempotency_key="k2"))

    def test_missing_config_and_internal_error_fail_closed(self):
        self.assertFalse(RiskEngine(None).check(intent(), view(), data_age_seconds=0, now_ts=0.0).approved)
        d = self.r.check(intent(), None, data_age_seconds=0, now_ts=0.0)
        self.assertFalse(d.approved)
        self.assertTrue(d.reasons[0].startswith("risk_engine_error"))

    def test_rejections_are_audited_with_reason(self):
        self.rejected("instrument", intent(instrument="GME"))
        ev = self.log.read(kinds={"risk_rejected"})
        self.assertTrue(ev and "not on the allowed list" in ev[-1]["message"])

    def test_sizing_respects_limits(self):
        lim = settings().risk
        d = size_order(lim, 1.0, 100000, 50.0, 0)
        self.assertLessEqual(d * 50, lim.max_order_notional)
        self.assertLessEqual(d, lim.max_order_qty)
        self.assertLess(size_order(lim, 0.0, 100000, 50.0, 1100), 0)
        self.assertGreaterEqual(size_order(lim, 0.0, 100000, 50.0, 1100), -lim.max_order_qty)
        self.assertEqual(size_order(lim, 1.0, 100000, 100.0, 600), 0)  # target 588: 12 shares is inside the 2% band
