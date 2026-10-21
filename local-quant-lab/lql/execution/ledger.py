"""SQLite ledger: orders, lifecycle transitions, fills, positions, cash, equity marks and session metadata.

The ledger is the source of truth for paper state. Order IDs are derived from the idempotency key, and the key is
UNIQUE, so retrying or restarting a step can never create a second order for the same decision. Every fill updates
cash and positions in the same transaction. `reconcile()` rebuilds cash and positions from the fill journal and
compares them with the stored balances; a mismatch blocks trading until a human investigates.
"""
import hashlib
import json
import sqlite3
from pathlib import Path

from ..events import now_iso

TRANSITIONS = {
    "CREATED": {"RISK_REJECTED", "ACCEPTED"},
    "ACCEPTED": {"SUBMITTED", "CANCELLED"},
    "SUBMITTED": {"FILLED", "CANCELLED", "REJECTED"},
    "FILLED": {"RECONCILED"},
}
OPEN = ("ACCEPTED", "SUBMITTED")

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, idem_key TEXT NOT NULL UNIQUE, strategy TEXT, strategy_version TEXT, config_hash TEXT,
  instrument TEXT NOT NULL, side TEXT NOT NULL, qty INTEGER NOT NULL, order_type TEXT NOT NULL, limit_price REAL,
  ref_price REAL, status TEXT NOT NULL, reasons TEXT, decision_date TEXT, decision_ts REAL, created_at TEXT,
  updated_at TEXT);
CREATE TABLE IF NOT EXISTS transitions (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL,
  at TEXT NOT NULL, note TEXT);
CREATE TABLE IF NOT EXISTS fills (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE, fill_date TEXT NOT NULL, instrument TEXT NOT NULL,
  side TEXT NOT NULL, qty INTEGER NOT NULL, price REAL NOT NULL, commission REAL NOT NULL,
  spread_slippage REAL NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS positions (instrument TEXT PRIMARY KEY, qty INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS marks (
  date TEXT PRIMARY KEY, cash REAL NOT NULL, equity REAL NOT NULL, positions_value REAL NOT NULL, prices TEXT);
"""


class LedgerError(Exception):
    pass


def order_id(idem_key):
    return "o-" + hashlib.sha256(idem_key.encode()).hexdigest()[:16]


class Ledger:
    def __init__(self, path, initial_cash=None):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        if self.get("initial_cash") is None:
            if initial_cash is None:
                raise LedgerError("new ledger needs initial_cash")
            with self.db:
                self._set("initial_cash", float(initial_cash))
                self._set("cash", float(initial_cash))
                self._set("reconciled", True)
                self._set("kill_switch", False)
                self._set("created_at", now_iso())

    def close(self):
        self.db.close()

    def __del__(self):
        try:
            self.db.close()
        except Exception:
            pass

    # -- meta -----------------------------------------------------------------------------------------------------
    def get(self, key, default=None):
        row = self.db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def _set(self, key, value):
        self.db.execute("INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (key, json.dumps(value)))

    def set(self, key, value):
        with self.db:
            self._set(key, value)

    def cash(self):
        return self.get("cash")

    def positions(self):
        return {r["instrument"]: r["qty"] for r in self.db.execute("SELECT * FROM positions WHERE qty != 0")}

    # -- orders ---------------------------------------------------------------------------------------------------
    def create_order(self, intent, decision_date, decision_ts, strategy_version="", config_hash=""):
        """Insert a CREATED order. Returns (order_id, created). created=False means this idempotency key already
        exists and nothing was written."""
        oid, now = order_id(intent.idempotency_key), now_iso()
        with self.db:
            cur = self.db.execute(
                "INSERT OR IGNORE INTO orders(id, idem_key, strategy, strategy_version, config_hash, instrument, side, "
                "qty, order_type, limit_price, ref_price, status, reasons, decision_date, decision_ts, created_at, "
                "updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (oid, intent.idempotency_key, intent.strategy, strategy_version, config_hash, intent.instrument,
                 intent.side, intent.qty, intent.order_type, intent.limit_price, intent.ref_price, "CREATED", "[]",
                 decision_date, decision_ts, now, now))
            if cur.rowcount:
                self.db.execute("INSERT INTO transitions(order_id, from_status, to_status, at, note) VALUES(?,?,?,?,?)",
                                (oid, None, "CREATED", now, "intent recorded"))
        return oid, bool(cur.rowcount)

    def order(self, oid):
        row = self.db.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone()
        return dict(row) if row else None

    def orders(self, status=None, limit=None):
        q, args = "SELECT * FROM orders", ()
        if status:
            statuses = (status,) if isinstance(status, str) else tuple(status)
            q += f" WHERE status IN ({','.join('?' * len(statuses))})"
            args = statuses
        q += " ORDER BY decision_ts, created_at"
        rows = [dict(r) for r in self.db.execute(q, args)]
        for r in rows:
            r["reasons"] = json.loads(r["reasons"] or "[]")
        return rows[-limit:] if limit else rows

    def _transition(self, oid, to, note="", reasons=None):
        row = self.db.execute("SELECT status FROM orders WHERE id=?", (oid,)).fetchone()
        if row is None:
            raise LedgerError(f"unknown order {oid}")
        frm = row["status"]
        if to not in TRANSITIONS.get(frm, ()):
            raise LedgerError(f"illegal transition {frm} -> {to} for {oid}")
        now = now_iso()
        if reasons is not None:
            self.db.execute("UPDATE orders SET status=?, updated_at=?, reasons=? WHERE id=?",
                            (to, now, json.dumps(list(reasons)), oid))
        else:
            self.db.execute("UPDATE orders SET status=?, updated_at=? WHERE id=?", (to, now, oid))
        self.db.execute("INSERT INTO transitions(order_id, from_status, to_status, at, note) VALUES(?,?,?,?,?)",
                        (oid, frm, to, now, note))

    def transition(self, oid, to, note="", reasons=None):
        with self.db:
            self._transition(oid, to, note, reasons)

    def transitions(self, oid=None):
        q = "SELECT * FROM transitions" + (" WHERE order_id=?" if oid else "") + " ORDER BY seq"
        return [dict(r) for r in self.db.execute(q, (oid,) if oid else ())]

    def cancel_open(self, note):
        """Cancel every ACCEPTED/SUBMITTED order (used by the kill switch). Returns the cancelled IDs."""
        ids = [r["id"] for r in self.db.execute("SELECT id FROM orders WHERE status IN (?, ?)", OPEN)]
        with self.db:
            for oid in ids:
                self._transition(oid, "CANCELLED", note)
        return ids

    # -- fills and marks ------------------------------------------------------------------------------------------
    def record_fill(self, oid, fill_date, qty, price, commission, spread_slippage):
        o = self.order(oid)
        if o is None or o["status"] != "SUBMITTED":
            raise LedgerError(f"cannot fill {oid}: status {o and o['status']}")
        if qty <= 0 or qty > o["qty"]:
            raise LedgerError(f"invalid fill quantity {qty} for {oid}")
        sign = 1 if o["side"] == "BUY" else -1
        cash = self.cash() - sign * qty * price - commission
        held = self.positions().get(o["instrument"], 0)
        if cash < -1e-6 or held + sign * qty < 0:
            raise LedgerError(f"fill {oid} would borrow cash or go short")
        with self.db:
            self.db.execute("INSERT INTO fills(id, order_id, fill_date, instrument, side, qty, price, commission, "
                            "spread_slippage, at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                            ("f-" + oid[2:], oid, fill_date, o["instrument"], o["side"], qty, price, commission,
                             spread_slippage, now_iso()))
            self.db.execute("INSERT INTO positions(instrument, qty) VALUES(?, ?) ON CONFLICT(instrument) "
                            "DO UPDATE SET qty = qty + ?", (o["instrument"], sign * qty, sign * qty))
            self._set("cash", cash)
            self._transition(oid, "FILLED", f"{qty} @ {price:.4f} on {fill_date}")

    def fills(self, limit=None):
        rows = [dict(r) for r in self.db.execute("SELECT * FROM fills ORDER BY fill_date, at")]
        return rows[-limit:] if limit else rows

    def mark(self, date, prices):
        """Value positions at the latest known price per instrument (today's prices override the stored ones).
        A held instrument with no known price is an error, never a silent zero."""
        last = dict(self.get("last_prices", {}))
        last.update(prices)
        pos = self.positions()
        missing = [i for i in pos if i not in last]
        if missing:
            raise LedgerError(f"no price to mark held positions: {missing}")
        pv = sum(q * last[i] for i, q in pos.items())
        cash = self.cash()
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO marks(date, cash, equity, positions_value, prices) VALUES(?,?,?,?,?)",
                            (date, cash, cash + pv, pv, json.dumps(prices)))
            self._set("last_prices", last)
        return cash + pv

    def last_prices(self):
        return dict(self.get("last_prices", {}))

    def marks(self):
        return [dict(r) for r in self.db.execute("SELECT * FROM marks ORDER BY date")]

    # -- reconciliation -------------------------------------------------------------------------------------------
    def reconcile(self):
        """Rebuild cash and positions from the fill journal and compare with stored balances."""
        cash, pos = self.get("initial_cash"), {}
        for f in self.fills():
            sign = 1 if f["side"] == "BUY" else -1
            cash -= sign * f["qty"] * f["price"] + f["commission"]
            pos[f["instrument"]] = pos.get(f["instrument"], 0) + sign * f["qty"]
        pos = {k: v for k, v in pos.items() if v}
        problems = []
        if abs(cash - self.cash()) > 1e-6:
            problems.append(f"cash: journal {cash:.6f} vs stored {self.cash():.6f}")
        if pos != self.positions():
            problems.append(f"positions: journal {pos} vs stored {self.positions()}")
        orphan = self.db.execute("SELECT COUNT(*) c FROM orders o WHERE status IN ('FILLED','RECONCILED') AND NOT "
                                 "EXISTS (SELECT 1 FROM fills f WHERE f.order_id = o.id)").fetchone()["c"]
        if orphan:
            problems.append(f"{orphan} filled orders without a fill record")
        with self.db:
            self._set("reconciled", not problems)
            if not problems:
                for r in self.db.execute("SELECT id FROM orders WHERE status='FILLED'").fetchall():
                    self._transition(r["id"], "RECONCILED", "cash and position match the fill journal")
        return problems
