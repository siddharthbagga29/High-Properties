import fcntl
import json
import unittest
from dataclasses import replace
from datetime import datetime, timezone, timedelta

from lql.backtest.portfolio import run_portfolio
from lql.data.providers import SyntheticProvider, ProviderError
from lql.data.schema import SourceInfo
from lql.execution.forward import (ForwardRunner, ForwardLog, RunnerBusy, ForwardConfigError, MultiPaperSession)
from lql.execution.ledger import Ledger
from lql.execution.paper import session_ts
from lql.strategies import create
from tests.helpers import settings, tmpdir

A, B = "DEMO-ETF-A", "DEMO-ETF-B"
PARAMS = {"fast": 20, "slow": 60}
SYN = SyntheticProvider().info()
# A fixture that is LABELLED like a real snapshot so the classification logic can be tested. The bars themselves are
# still generated; this proves nothing about markets.
REAL_LABEL = SourceInfo(provider="fixture", kind="HISTORICAL_SNAPSHOT", description="test fixture, not market data",
                        adjusted="split_and_dividend_adjusted", adjustment_evidence="test fixture claim only")


def data(n=420, insts=(A, B)):
    p = SyntheticProvider(n_days=n)
    return {i: p.bars(i) for i in insts}


def loader(d, info=SYN):
    return lambda: (d, info)


def runner(directory=None, s=None, mode="REPLAY", strategy="sma_trend", params=None, universe=(A, B), events=None):
    return ForwardRunner(s or settings(), directory or tmpdir(), universe, strategy, params or PARAMS, mode, events)


def core(log):
    """Log records without run markers (those are unique per pass by design)."""
    return [r for r in log.read() if r["kind"] not in ("run_start", "run_end")]


class ReplayTests(unittest.TestCase):
    def setUp(self):
        self.d = data()
        self.r = runner()
        self.out = self.r.run_once(loader(self.d))

    def test_pass_processes_everything_and_logs_every_required_kind(self):
        self.assertEqual(self.out["status"], "OK")
        self.assertEqual(len(self.out["processed"]), 420)
        kinds = {x["kind"] for x in self.r.log.read()}
        for k in ("init", "run_start", "run_end", "signal", "decision", "fill", "position_change", "equity"):
            self.assertIn(k, kinds)
        for rec in self.r.log.read():
            self.assertIn("t", rec)                                 # wall-clock timestamp
            self.assertEqual(rec["evidence_class"], "SYNTHETIC_REPLAY")
        dec = [x for x in self.r.log.read(("decision",))]
        self.assertTrue(all("decision_ts" in x and x["strategy_version"] for x in dec))
        self.assertTrue(self.out["reconciled"])

    def test_second_pass_is_a_no_op(self):
        before = core(self.r.log)
        again = self.r.run_once(loader(self.d))
        self.assertEqual(again["processed"], [])
        self.assertEqual(core(self.r.log), before)
        led = Ledger(self.r.dir / "ledger.db")
        self.assertEqual(len(led.marks()), 420)
        led.close()

    def test_log_matches_the_ledger(self):
        led = Ledger(self.r.dir / "ledger.db")
        logged = {x["rid"] for x in self.r.log.read(("fill",))}
        self.assertEqual(logged, {"fill:" + f["id"] for f in led.fills()})
        eq = {x["date"]: x["equity"] for x in self.r.log.read(("equity",))}
        self.assertEqual(eq, {m["date"]: m["equity"] for m in led.marks()})
        led.close()

    def test_matches_the_portfolio_backtester_when_frictions_are_equal(self):
        """Three names (a third of equity each) so that cash never binds: the two engines differ by design only when
        a gap-up leaves too little cash (the backtester shrinks the buy, the paper session rejects it)."""
        s = settings()
        d3 = data(420, (A, B, "SPY"))
        r3 = runner(universe=(A, B, "SPY"))
        r3.run_once(loader(d3))
        bt = run_portfolio(d3, create("sma_trend", **PARAMS), s, max_volume_participation=0, clamp_to_range=False)
        eq = [x["equity"] for x in r3.log.read(("equity",))]
        self.assertEqual(len(eq), len(bt["equity"]))
        for a, b in zip(eq, bt["equity"]):
            self.assertAlmostEqual(a, b, places=6)

    def test_incremental_delivery_equals_one_shot(self):
        d = self.d
        r2 = runner()
        r2.run_once(loader({i: d[i][:300] for i in d}))
        r2 = ForwardRunner(settings(), r2.dir, (A, B), "sma_trend", PARAMS, "REPLAY")   # a fresh process
        r2.run_once(loader(d))
        e1 = [(x["date"], x["equity"]) for x in self.r.log.read(("equity",))]
        e2 = [(x["date"], x["equity"]) for x in r2.log.read(("equity",))]
        self.assertEqual(e1, e2)
        f1 = [(x["date"], x["instrument"], x["side"], x["qty"]) for x in self.r.log.read(("fill",))]
        f2 = [(x["date"], x["instrument"], x["side"], x["qty"]) for x in r2.log.read(("fill",))]
        self.assertEqual(f1, f2)


class RecoveryTests(unittest.TestCase):
    def test_interruption_at_every_point_recovers_without_duplicates(self):
        d = data(220)
        base = runner()
        base.run_once(loader(d))
        first_fill = base.log.read(("fill",))[0]["date"]
        decision_day = [x for x in base.log.read(("decision",)) if x["status_at_log"] != "RISK_REJECTED"][0]["date"]
        want_eq = [(x["date"], x["equity"]) for x in base.log.read(("equity",))]
        want_fills = [(x["date"], x["instrument"], x["side"], x["qty"], x["price"]) for x in base.log.read(("fill",))]
        points = [("after_order_created", decision_day), ("after_accepted", decision_day),
                  ("after_decisions", decision_day), ("before_log", decision_day), ("before_commit", decision_day),
                  ("after_commit", decision_day),
                  ("after_fills", first_fill), ("after_mark", first_fill)]
        for point, day in points:
            with self.subTest(point=point, day=day):
                r = runner()
                fired = []

                def fault(p, dd, point=point, day=day, fired=fired):
                    if p == point and dd == day and not fired:
                        fired.append(1)
                        raise RuntimeError(f"simulated crash at {p}")
                out = r.run_once(loader(d), fault=fault)
                self.assertEqual(out["status"], "ERROR", point)
                self.assertTrue(fired)
                out2 = r.run_once(loader(d))
                self.assertEqual(out2["status"], "OK")
                self.assertEqual([(x["date"], x["equity"]) for x in r.log.read(("equity",))], want_eq)
                self.assertEqual([(x["date"], x["instrument"], x["side"], x["qty"], x["price"])
                                  for x in r.log.read(("fill",))], want_fills)
                rids = [x["rid"] for x in r.log.read()]
                self.assertEqual(len(rids), len(set(rids)) )
                led = Ledger(r.dir / "ledger.db")
                self.assertEqual(led.reconcile(), [])
                self.assertEqual(len(led.fills()), len(want_fills))
                keys = [o["idem_key"] for o in led.orders()]
                self.assertEqual(len(keys), len(set(keys)))
                self.assertFalse(led.orders(status=("CREATED", "ACCEPTED")))
                led.close()
                self.assertTrue([x for x in r.log.read(("error",))])    # the interruption itself is on record

    def test_torn_log_line_is_ignored_and_regenerated(self):
        d = data(300)
        r = runner()
        r.run_once(loader({i: d[i][:200] for i in d}))
        with open(r.log.path, "a") as f:
            f.write('{"rid": "equity:broken", "kind": "eq')       # crash mid-write
        r2 = ForwardRunner(settings(), r.dir, (A, B), "sma_trend", PARAMS, "REPLAY")
        out = r2.run_once(loader(d))
        self.assertEqual(out["status"], "OK")
        self.assertEqual(len(r2.log.read(("equity",))), 300)


class DataGapTests(unittest.TestCase):
    def test_missing_bars_gap_events_and_no_orders_for_the_missing_instrument(self):
        d = data()
        gap_dates = {b.event_date for b in d[B][200:206]}
        d2 = {A: d[A], B: [b for b in d[B] if b.event_date not in gap_dates]}
        r = runner()
        out = r.run_once(loader(d2))
        self.assertEqual(out["status"], "OK")
        miss = [x for x in r.log.read(("data_event",)) if x["code"] == "missing_bar"]
        self.assertEqual({x["instrument"] for x in miss}, {B})
        self.assertEqual({x["date"] for x in miss}, {g.isoformat() for g in gap_dates})
        sig = {(x["date"], x["instrument"]) for x in r.log.read(("signal",))}
        self.assertFalse({(g.isoformat(), B) for g in gap_dates} & sig)
        for x in r.log.read(("order_closed",)):
            self.assertIn(x["status"], ("CANCELLED", "REJECTED"))
        led = Ledger(r.dir / "ledger.db")
        self.assertEqual(led.reconcile(), [])
        led.close()

    def test_order_decided_before_a_gap_is_cancelled_not_carried(self):
        d = data()
        base = runner()
        base.run_once(loader(d))
        first = [x for x in base.log.read(("decision",)) if x["instrument"] == A][0]
        nxt = min(b.event_date for b in d[A] if b.event_date.isoformat() > first["date"])
        d2 = {A: [b for b in d[A] if b.event_date != nxt], B: d[B]}
        r = runner()
        r.run_once(loader(d2))
        closed = [x for x in r.log.read(("order_closed",)) if x["order"] == first["order"]]
        self.assertTrue(closed, "order decided before the gap must be cancelled")
        self.assertIn("never carried", closed[0]["note"])
        self.assertFalse([f for f in r.log.read(("fill",)) if f["order"] == first["order"]])

    def test_whole_calendar_gap_is_recorded(self):
        d = data()
        cut = {b.event_date for b in d[A][150:162]}
        d2 = {i: [b for b in d[i] if b.event_date not in cut] for i in d}
        r = runner()
        r.run_once(loader(d2))
        self.assertTrue([x for x in r.log.read(("data_event",)) if x["code"] == "calendar_gap"])

    def test_corrupt_bar_locks_out_only_that_instrument_then_recovers(self):
        d = data()
        bad = replace(d[A][200], high=d[A][200].low * 0.5)       # high below low: invalid OHLC
        d2 = {A: d[A][:200] + [bad] + d[A][201:], B: d[B]}
        r = runner()
        r.run_once(loader(d2))
        locks = [x for x in r.log.read(("data_event",)) if x["code"] == "lockout"]
        self.assertEqual([(x["instrument"], x["date"]) for x in locks], [(A, bad.event_date.isoformat())])
        sig_a = [x["date"] for x in r.log.read(("signal",)) if x["instrument"] == A]
        self.assertNotIn(bad.event_date.isoformat(), sig_a)
        self.assertIn(d[A][201].event_date.isoformat(), sig_a)           # recovered on the next valid bar
        sig_b = [x["date"] for x in r.log.read(("signal",)) if x["instrument"] == B]
        self.assertIn(bad.event_date.isoformat(), sig_b)                 # the other instrument kept trading

    def test_provider_failure_is_visible_and_changes_nothing(self):
        r = runner()

        def boom():
            raise ProviderError("snapshot hash mismatch")
        out = r.run_once(boom)
        self.assertEqual(out["status"], "DATA_ERROR")
        self.assertIn("hash mismatch", out["error"])
        self.assertFalse((r.dir / "ledger.db").exists())
        self.assertEqual([x["kind"] for x in r.log.read()], ["error"])
        self.assertEqual(json.loads((r.dir / "run_state.json").read_text())["status"], "DATA_ERROR")

    def test_missing_instrument_in_the_data_is_an_error(self):
        out = runner().run_once(loader({A: data()[A]}))
        self.assertEqual(out["status"], "DATA_ERROR")


class ForwardModeTests(unittest.TestCase):
    def test_cannot_start_a_forward_log_on_stale_data(self):
        d = data(300)
        last = max(b.event_date for b in d[A])
        now = datetime(last.year, last.month, last.day, tzinfo=timezone.utc) + timedelta(days=30)
        r = runner(mode="FORWARD")
        out = r.run_once(loader(d, REAL_LABEL), now=now)
        self.assertEqual(out["status"], "DATA_ERROR")
        self.assertIn("stale", out["error"])
        self.assertFalse((r.dir / "ledger.db").exists())

    def test_first_pass_only_warms_up_then_new_sessions_trade(self):
        d = data(400)
        n0 = 300
        last0 = d[A][n0 - 1].event_date
        now0 = datetime.fromtimestamp(session_ts(last0), timezone.utc) + timedelta(hours=1)
        r = runner(mode="FORWARD")
        out0 = r.run_once(loader({i: d[i][:n0] for i in d}, REAL_LABEL), now=now0)
        self.assertEqual(out0["processed"], [])                     # history is warm-up, never traded
        self.assertEqual(out0["evidence_class"], "REAL_FORWARD")
        self.assertEqual(r.log.read(("fill",)), [])
        # 30 more sessions arrive "over time"; the operator runs once at the end, within the freshness limit
        last1 = d[A][n0 + 29].event_date
        now1 = datetime.fromtimestamp(session_ts(last1), timezone.utc) + timedelta(hours=1)
        out1 = r.run_once(loader({i: d[i][:n0 + 30] for i in d}, REAL_LABEL), now=now1)
        self.assertEqual(out1["status"], "OK")
        self.assertEqual(len(out1["processed"]), 30)
        stale_sessions = [x for x in r.log.read(("data_event",)) if x["code"] == "stale_data"]
        # sessions older than the freshness limit relative to `now` are marked but never traded
        limit_days = settings().risk.max_data_age_seconds / 86400
        expected_stale = sum(1 for b in d[A][n0:n0 + 30] if (now1.timestamp() - session_ts(b.event_date)) / 86400 > limit_days)
        self.assertEqual(len(stale_sessions), expected_stale)
        self.assertGreater(expected_stale, 0)
        stale_days = {x["date"] for x in stale_sessions}
        self.assertFalse([x for x in r.log.read(("decision",)) if x["date"] in stale_days])
        self.assertEqual(len(r.log.read(("equity",))), 30)

    def test_today_s_incomplete_bar_is_deferred_until_the_session_has_closed(self):
        d = data(310)
        n0 = 300
        now0 = datetime.fromtimestamp(session_ts(d[A][n0 - 1].event_date), timezone.utc) + timedelta(hours=1)
        r = runner(mode="FORWARD")
        r.run_once(loader({i: d[i][:n0] for i in d}, REAL_LABEL), now=now0)
        today = d[A][n0].event_date
        before_close = datetime(today.year, today.month, today.day, 15, tzinfo=timezone.utc)
        out = r.run_once(loader({i: d[i][:n0 + 1] for i in d}, REAL_LABEL), now=before_close)
        self.assertEqual(out["processed"], [])
        self.assertTrue([x for x in r.log.read(("data_event",)) if x["code"] == "incomplete_session_deferred"])
        after_close = before_close + timedelta(hours=8)
        out = r.run_once(loader({i: d[i][:n0 + 1] for i in d}, REAL_LABEL), now=after_close)
        self.assertEqual(out["processed"], [today.isoformat()])

    def test_real_labelled_replay_is_not_forward_evidence(self):
        d = data(300)
        r = runner()
        r.run_once(loader(d, REAL_LABEL))
        rep = r.report()
        self.assertEqual(rep["evidence_class"], "REAL_REPLAY")
        self.assertIn("Not forward paper evidence", rep["paper_evidence"]["statement"])
        self.assertFalse(rep["paper_evidence"]["mechanical_criteria_met"])
        self.assertEqual(rep["paper_evidence"]["alpha_status"], "unproven")

    def test_synthetic_report_is_labelled_and_never_evidence(self):
        r = runner()
        r.run_once(loader(data()))
        rep = r.report()
        self.assertEqual(rep["evidence_class"], "SYNTHETIC_REPLAY")
        self.assertEqual(rep["paper_evidence"]["real_forward_sessions"], 0)
        self.assertIn("metrics", rep)


class ConfigAndConcurrencyTests(unittest.TestCase):
    def test_configuration_and_data_kind_cannot_change_mid_log(self):
        d = data(250)
        r = runner()
        r.run_once(loader(d))
        with self.assertRaises(ForwardConfigError):
            ForwardRunner(settings(), r.dir, (A, B), "vol_scaled_trend", {}, "REPLAY").run_once(loader(d))
        with self.assertRaises(ForwardConfigError):
            ForwardRunner(settings(), r.dir, (A,), "sma_trend", PARAMS, "REPLAY").run_once(loader(d))
        with self.assertRaises(ForwardConfigError):
            r.run_once(loader(d, REAL_LABEL))                          # synthetic log cannot take "real" data

    def test_concurrent_pass_is_refused(self):
        r = runner()
        with open(r.dir / "run.lock", "w") as held:
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(RunnerBusy):
                r.run_once(loader(data(100)))
            fcntl.flock(held, fcntl.LOCK_UN)
        self.assertEqual(r.run_once(loader(data(100)))["status"], "OK")

    def test_invalid_mode(self):
        with self.assertRaises(ForwardConfigError):
            ForwardRunner(settings(), tmpdir(), (A,), "sma_trend", PARAMS, "LIVE")


class RiskEnforcementTests(unittest.TestCase):
    def test_limits_hold_and_rejections_are_logged_with_reasons(self):
        s = settings(max_position_notional=12000.0, max_gross_exposure=15000.0, max_concentration=0.2,
                     max_order_notional=8000.0)
        r = runner(s=s)
        r.run_once(loader(data()))
        led = Ledger(r.dir / "ledger.db")
        closes = {}
        for m in led.marks():
            closes = json.loads(m["prices"]) or closes
        gross_by_day = [x["positions_value"] for x in r.log.read(("equity",))]
        self.assertLessEqual(max(gross_by_day), 15000.0 * 1.12)     # risk is checked at decision prices; allow the overnight move
        for o in led.orders():
            self.assertLessEqual(o["qty"] * o["ref_price"], 8000.0)
        led.close()
        r2 = runner(s=settings(max_gross_exposure=3000.0))
        r2.run_once(loader(data()))
        rej = r2.log.read(("risk_rejection",))
        self.assertTrue(rej)
        self.assertTrue(any("max_gross_exposure" in why or "max_position_notional" in why
                            for x in rej for why in x["reasons"]))

    def test_kill_switch_blocks_new_orders_and_survives_a_restart(self):
        d = data(420)
        r = runner()
        r.run_once(loader({i: d[i][:250] for i in d}))
        fills_before = len(r.log.read(("fill",)))
        cancelled = r.kill("operator test")
        self.assertIsInstance(cancelled, list)
        r2 = ForwardRunner(settings(), r.dir, (A, B), "sma_trend", PARAMS, "REPLAY")      # new process
        r2.run_once(loader(d))
        new = [f for f in r2.log.read(("fill",))]
        self.assertEqual(len(new), fills_before)                                          # nothing new filled
        dec = [x for x in r2.log.read(("decision",)) if x["date"] > d[A][249].event_date.isoformat()]
        self.assertTrue(all(x["status_at_log"] == "RISK_REJECTED" for x in dec))
        self.assertTrue(any("kill_switch" in w for x in dec for w in x["reasons"]) or not dec)
        kill_recs = r2.log.read(("kill_switch",))
        self.assertTrue(kill_recs and kill_recs[0]["engaged"])
        r2.release("tester")
        self.assertFalse(r2.log.read(("kill_switch",))[-1]["engaged"])
        with self.assertRaises(ValueError):
            r2.release("")

    def test_data_age_limit_blocks_trading_in_forward_mode(self):
        s = settings()
        d = data(320)
        n0 = 300
        now0 = datetime.fromtimestamp(session_ts(d[A][n0 - 1].event_date), timezone.utc) + timedelta(hours=1)
        r = runner(s=s, mode="FORWARD")
        r.run_once(loader({i: d[i][:n0] for i in d}, REAL_LABEL), now=now0)
        far = datetime.fromtimestamp(session_ts(d[A][n0 + 19].event_date), timezone.utc) + timedelta(days=60)
        out = r.run_once(loader(d, REAL_LABEL), now=far)
        self.assertEqual(out["status"], "OK")
        self.assertEqual(r.log.read(("decision",)), [])
        self.assertEqual(r.log.read(("fill",)), [])


class SessionUnitTests(unittest.TestCase):
    def test_marking_a_held_position_without_a_price_is_an_error(self):
        from lql.execution.ledger import LedgerError
        from lql.risk import OrderIntent
        L = Ledger(tmpdir() / "l.db", 10000.0)
        i = OrderIntent("SPY", "BUY", 1, ref_price=10.0, idempotency_key="k")
        oid, _ = L.create_order(i, "2020-01-01", 0.0)
        L.transition(oid, "ACCEPTED")
        L.transition(oid, "SUBMITTED")
        L.record_fill(oid, "2020-01-02", 1, 10.0, 1.0, 0.0)
        with self.assertRaises(LedgerError):
            L.mark("2020-01-02", {"QQQ": 5.0})
        self.assertEqual(L.mark("2020-01-02", {"SPY": 11.0}), L.cash() + 11.0)
        self.assertEqual(L.mark("2020-01-03", {}), L.cash() + 11.0)       # last known price is used, explicitly stored
        L.close()

    def test_forward_module_has_no_broker_or_network_access(self):
        import ast
        import lql.execution.forward as f
        with open(f.__file__) as fh:
            tree = ast.parse(fh.read())
        mods = set()
        for n in ast.walk(tree):
            if isinstance(n, ast.Import):
                mods |= {a.name.split(".")[0] for a in n.names}
            elif isinstance(n, ast.ImportFrom):
                mods.add((n.module or "").split(".")[0])
        self.assertFalse(mods & {"socket", "urllib", "http", "requests", "subprocess", "ssl"}, mods)


if __name__ == "__main__":
    unittest.main()
