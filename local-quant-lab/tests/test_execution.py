import unittest
from dataclasses import replace

from lql.backtest.engine import run
from lql.data.providers import SyntheticProvider
from lql.events import EventLog
from lql.execution.ledger import Ledger, LedgerError
from lql.execution.paper import PaperSession, NotConnected
from lql.risk import OrderIntent
from lql.strategies import create, BuyAndHold
from tests.helpers import settings, tmpdir, bars


def session(path, s=None, strat="sma_trend", events=None, **kw):
    s = s or settings()
    return PaperSession(s, Ledger(path, s.initial_cash), create(strat), events, **kw)


class LedgerTests(unittest.TestCase):
    def test_lifecycle_idempotency_and_illegal_transitions(self):
        L = Ledger(tmpdir() / "l.db", 1000)
        i = OrderIntent("SPY", "BUY", 1, ref_price=10.0, idempotency_key="x")
        oid, created = L.create_order(i, "2020-01-01", 0.0)
        self.assertTrue(created)
        self.assertEqual(L.create_order(i, "2020-01-01", 0.0), (oid, False))
        with self.assertRaises(LedgerError):
            L.transition(oid, "FILLED")
        L.transition(oid, "ACCEPTED")
        L.transition(oid, "SUBMITTED")
        L.record_fill(oid, "2020-01-02", 1, 10.0, 1.0, 0.0)
        self.assertEqual(L.cash(), 989.0)
        self.assertEqual(L.positions(), {"SPY": 1})
        self.assertEqual(L.reconcile(), [])
        self.assertEqual(L.order(oid)["status"], "RECONCILED")
        self.assertEqual([t["to_status"] for t in L.transitions(oid)],
                         ["CREATED", "ACCEPTED", "SUBMITTED", "FILLED", "RECONCILED"])

    def test_reconciliation_mismatch_detected(self):
        L = Ledger(tmpdir() / "l.db", 1000)
        L.set("cash", 5000.0)  # simulate corruption
        self.assertTrue(L.reconcile())
        self.assertFalse(L.get("reconciled"))


class PaperTests(unittest.TestCase):
    def test_broker_paper_refuses_to_start(self):
        s = settings()
        s = replace(s, execution_mode="BROKER_PAPER")
        with self.assertRaises(NotConnected):
            PaperSession(s, Ledger(tmpdir() / "p.db", 1000), create("sma_trend"))

    def test_full_pipeline_matches_backtest(self):
        b = SyntheticProvider().bars("DEMO-ETF-B")[:700]
        sess = session(tmpdir() / "p.db")
        sess.run(b)
        bt = run(b, create("sma_trend"), settings())
        self.assertAlmostEqual(sess.ledger.marks()[-1]["equity"], bt["equity"][-1], places=6)
        self.assertEqual(len(sess.ledger.fills()), len(bt["fills"]))
        self.assertEqual(sess.ledger.reconcile(), [])
        self.assertTrue(all(o["status"] in ("RECONCILED", "SUBMITTED") for o in sess.ledger.orders()))

    def test_restart_recovers_without_duplicates(self):
        b = SyntheticProvider().bars("DEMO-ETF-B")[:700]
        d = tmpdir()
        one = session(d / "a.db")
        one.run(b)
        first = session(d / "b.db")
        first.run(b[:420])
        again = session(d / "b.db")          # restart: new objects, same ledger
        again.run(b[:420])                   # replaying processed sessions does nothing
        self.assertEqual(len(again.ledger.orders()), len(first.ledger.orders()))
        again.run(b)
        self.assertAlmostEqual(again.ledger.marks()[-1]["equity"], one.ledger.marks()[-1]["equity"], places=6)
        keys = [o["idem_key"] for o in again.ledger.orders()]
        self.assertEqual(len(keys), len(set(keys)))

    def test_kill_switch_cancels_and_blocks_and_survives_restart(self):
        d = tmpdir()
        b = bars([100.0] * 10)
        sess = session(d / "k.db", strat="buy_hold")
        sess.run(b[:2])
        self.assertTrue(sess.ledger.orders(status="SUBMITTED"))
        cancelled = sess.kill("test stop")
        self.assertTrue(cancelled)
        self.assertFalse(sess.ledger.orders(status="SUBMITTED"))
        restarted = session(d / "k.db", strat="buy_hold")
        restarted.run(b[:6])
        rej = restarted.ledger.orders(status="RISK_REJECTED")
        self.assertTrue(rej and any(r.startswith("kill_switch") for r in rej[-1]["reasons"]))

    def test_corrupt_feed_locks_out_then_recovers(self):
        log = EventLog(tmpdir() / "e.jsonl")
        b = bars([100.0 + i for i in range(8)])
        sess = session(tmpdir() / "c.db", strat="buy_hold", events=log)
        sess.run(b[:2])
        bad = replace(b[2], high=b[2].low * 0.5)
        r = sess.step(bad)
        self.assertIn("lockout", r)
        n_orders = len(sess.ledger.orders())
        self.assertIn("non_positive_price", sess.step(replace(b[3], open=-1.0))["lockout"])
        self.assertEqual(len(sess.ledger.orders()), n_orders)   # nothing traded while locked out
        stale = sess.step(b[3], data_age_seconds=10 ** 7)
        self.assertIn("stale", stale["lockout"])
        ok = sess.step(b[3])
        self.assertNotIn("lockout", ok)
        kinds = [e["kind"] for e in log.read()]
        self.assertIn("data_lockout", kinds)
        self.assertIn("data_recovered", kinds)

    def test_bad_order_reason_in_audit_history(self):
        log = EventLog(tmpdir() / "e.jsonl")
        s = settings(allowed_instruments=["SPY"])
        sess = session(tmpdir() / "r.db", s=s, strat="buy_hold", events=log)
        sess.run(bars([100.0] * 3))  # DEMO-ETF-A is not on the allowed list in this config
        rej = sess.ledger.orders(status="RISK_REJECTED")
        self.assertTrue(rej)
        self.assertIn("not on the allowed list", rej[0]["reasons"][0])
        self.assertTrue(any("not on the allowed list" in e["message"] for e in log.read(kinds={"risk_rejected"})))

    def test_limit_orders_fill_or_expire(self):
        sess = session(tmpdir() / "lim.db", strat="buy_hold", order_type="LIMIT", limit_offset=0.05)
        b = bars([100.0, 100.0, 100.0, 90.0, 90.0], opens=[100.0, 100.0, 100.0, 93.0, 90.0])
        sess.run(b)
        st = [o["status"] for o in sess.ledger.orders()]
        self.assertIn("CANCELLED", st)       # limit 95 not reached on a 99-101 bar: expired
        fills = sess.ledger.fills()
        self.assertTrue(fills and fills[0]["price"] <= 95.0)
