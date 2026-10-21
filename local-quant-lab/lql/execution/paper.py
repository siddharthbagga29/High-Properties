"""Paper-trading session in SIMULATED mode: replays validated daily bars one session at a time through the same
pipeline a live-data paper loop would use, persisting everything to the ledger.

Per session t: (1) fill orders submitted at t-1 against bar t (market at the open with spread + slippage; day limit
orders if the bar trades through the limit, otherwise they expire as CANCELLED); (2) mark to the close and
reconcile; (3) validate the new bar; a corrupt or stale bar locks out new orders until a valid bar arrives;
(4) strategy -> sizing -> deterministic risk check -> order (RISK_REJECTED, or ACCEPTED then SUBMITTED).

Restart: a new PaperSession on the same ledger resumes after the last processed date. Sessions already processed
are skipped and order IDs come from idempotency keys, so re-running never duplicates orders or fills.

BROKER_PAPER is a design placeholder only: there is no broker adapter in this build and it refuses to start.
Partial fills, queue position and intraday prices are not simulated.
"""
from datetime import datetime, timezone

from ..backtest.engine import fill_price, commission
from ..data.quality import validate
from ..risk import RiskEngine, OrderIntent, PortfolioView, size_order


class NotConnected(Exception):
    pass


def session_ts(d):
    """Decision time for a daily bar: 21:00 UTC on the session date (after the U.S. close)."""
    return datetime(d.year, d.month, d.day, 21, tzinfo=timezone.utc).timestamp()


class PaperSession:
    def __init__(self, settings, ledger, strategy, events=None, order_type="MARKET", limit_offset=0.0):
        if settings.execution_mode != "SIMULATED":
            raise NotConnected(f"execution_mode {settings.execution_mode}: no broker adapter is configured in this "
                               "build; only SIMULATED runs")
        self.settings, self.ledger, self.strategy, self.events = settings, ledger, strategy, events
        self.order_type, self.limit_offset = order_type, limit_offset
        self.risk = RiskEngine(settings.risk, mode="SIMULATED", events=events)
        if ledger.get("kill_switch"):
            self.risk.kill_switch, self.risk.kill_reason = True, ledger.get("kill_reason", "restored from ledger")
        for key in ledger.get("disabled_strategies", []):
            self.risk.disabled_strategies.add(key)
        for o in ledger.orders():  # restore duplicate and rate-limit memory across restarts
            if o["status"] != "RISK_REJECTED":
                self.risk._seen_keys.add(o["idem_key"])
                self.risk._order_times.append(o["decision_ts"])
        self.history = []
        self.locked_out = ledger.get("data_lockout", False)

    # -- operator controls ----------------------------------------------------------------------------------------
    def kill(self, reason):
        self.risk.engage_kill_switch(reason)
        self.ledger.set("kill_switch", True)
        self.ledger.set("kill_reason", reason)
        cancelled = self.ledger.cancel_open(f"kill switch: {reason}")
        self._emit("orders_cancelled", f"kill switch cancelled {len(cancelled)} open orders", "critical",
                   orders=cancelled)
        return cancelled

    def release(self, by):
        self.risk.release_kill_switch(by)
        self.ledger.set("kill_switch", False)
        self.ledger.set("kill_reason", "")

    def disable_strategy(self, key, reason=""):
        self.risk.disable_strategy(key, reason)
        self.ledger.set("disabled_strategies", sorted(self.risk.disabled_strategies))

    # -- the session loop -----------------------------------------------------------------------------------------
    def run(self, bars, data_age_seconds=0, market_ok=True):
        out = []
        for b in bars:
            out.append(self.step(b, data_age_seconds=data_age_seconds, market_ok=market_ok))
        return out

    def step(self, bar, data_age_seconds=0, market_ok=True):
        day = bar.event_date.isoformat()
        last = self.ledger.get("last_processed")
        prev = self.history[-1] if self.history else None
        if last is not None and day <= last:
            if validate(([prev] if prev else []) + [bar], instrument=bar.instrument).tradable:
                self.history.append(bar)  # rebuild strategy history while skipping processed sessions
            return {"date": day, "skipped": "already processed"}
        # 3 first for the incoming bar: a corrupt bar is never used for fills, marks or signals
        q = validate(([prev] if prev else []) + [bar], instrument=bar.instrument)
        if not q.tradable or not market_ok or data_age_seconds is None \
                or data_age_seconds > self.settings.risk.max_data_age_seconds:
            why = [i["code"] for i in q.issues if i["code"] in ("invalid_ohlc", "non_monotonic", "duplicate",
                                                                "non_positive_price", "wrong_instrument")]
            if not market_ok:
                why.append("provider_disconnected")
            if data_age_seconds is None or data_age_seconds > self.settings.risk.max_data_age_seconds:
                why.append("stale")
            if not self.locked_out:
                self._emit("data_lockout", f"{bar.instrument} {day}: trading locked out ({', '.join(why)})",
                           "critical", issues=q.issues[:5])
            self.locked_out = True
            self.ledger.set("data_lockout", True)
            return {"date": day, "lockout": why}
        if self.locked_out:
            self._emit("data_recovered", f"{bar.instrument} {day}: validated data restored; lockout cleared", "warning")
            self.locked_out = False
            self.ledger.set("data_lockout", False)
        self.history.append(bar)
        fills = self._fill_open_orders(bar)
        eq = self.ledger.mark(day, {bar.instrument: bar.close})
        problems = self.ledger.reconcile()
        if problems:
            self._emit("reconciliation_mismatch", "; ".join(problems), "critical")
        decision = self._decide(bar, eq, data_age_seconds)
        self.ledger.set("last_processed", day)
        return {"date": day, "equity": eq, "fills": fills, "decision": decision}

    def _fill_open_orders(self, bar):
        done, costs = [], self.settings.costs
        for o in self.ledger.orders(status="SUBMITTED"):
            if o["instrument"] != bar.instrument or o["decision_date"] >= bar.event_date.isoformat():
                continue
            side, qty = o["side"], o["qty"]
            if o["order_type"] == "MARKET":
                ref = bar.open
                px = fill_price(ref, side, costs)
            else:
                lim = o["limit_price"]
                touched = bar.low <= lim if side == "BUY" else bar.high >= lim
                if not touched:
                    self.ledger.transition(o["id"], "CANCELLED", "day limit order expired unfilled")
                    continue
                ref = min(bar.open, lim) if side == "BUY" else max(bar.open, lim)
                px = min(fill_price(ref, side, costs), lim) if side == "BUY" else max(fill_price(ref, side, costs), lim)
            if side == "BUY" and qty * px + commission(qty, costs) > self.ledger.cash():
                self.ledger.transition(o["id"], "REJECTED", "insufficient cash at fill (gap up); no borrowing")
                self._emit("order_rejected", f"{o['id']} rejected at fill: insufficient cash", "warning")
                continue
            if side == "SELL":
                qty = min(qty, self.ledger.positions().get(o["instrument"], 0))
                if qty <= 0:
                    self.ledger.transition(o["id"], "REJECTED", "nothing to sell at fill")
                    continue
            comm = commission(qty, costs)
            self.ledger.record_fill(o["id"], bar.event_date.isoformat(), qty, px, comm, abs(px - ref) * qty)
            self._emit("order_filled", f"{side} {qty} {o['instrument']} @ {px:.4f}", order=o["id"])
            done.append(o["id"])
        return done

    def _decide(self, bar, eq, data_age_seconds):
        if self.strategy.meta.key in self.risk.disabled_strategies and not self.ledger.positions():
            return {"skipped": "strategy disabled"}
        w = max(0.0, min(self.strategy.meta.max_weight, self.strategy.target_weight(self.history)))
        held = self.ledger.positions().get(bar.instrument, 0)
        # count shares already committed by open orders so a restart does not double the exposure
        for o in self.ledger.orders(status=("ACCEPTED", "SUBMITTED")):
            if o["instrument"] == bar.instrument:
                held += o["qty"] if o["side"] == "BUY" else -o["qty"]
        delta = size_order(self.settings.risk, w, eq, bar.close, held)
        if delta == 0:
            return {"weight": w, "order": None}
        side = "BUY" if delta > 0 else "SELL"
        limit = None
        if self.order_type == "LIMIT":
            limit = round(bar.close * (1 - self.limit_offset if side == "BUY" else 1 + self.limit_offset), 4)
        intent = OrderIntent(bar.instrument, side, abs(delta), self.order_type, ref_price=bar.close,
                             limit_price=limit, strategy=self.strategy.meta.key,
                             idempotency_key=f"paper:{self.strategy.meta.key}:{bar.instrument}:{bar.event_date}")
        ts = session_ts(bar.event_date)
        oid, created = self.ledger.create_order(intent, bar.event_date.isoformat(), ts, self.strategy.meta.version)
        if not created:
            return {"weight": w, "order": oid, "duplicate": True}
        marks = self.ledger.marks()
        view = PortfolioView(cash=self.ledger.cash(), positions=self.ledger.positions(),
                             last_prices={bar.instrument: bar.close}, equity=eq,
                             start_of_day_equity=marks[-2]["equity"] if len(marks) > 1 else eq,
                             peak_equity=max(m["equity"] for m in marks), reconciled=self.ledger.get("reconciled"))
        d = self.risk.check(intent, view, market_ok=True, data_age_seconds=data_age_seconds, now_ts=ts)
        if not d.approved:
            self.ledger.transition(oid, "RISK_REJECTED", "pre-trade risk check", reasons=d.reasons)
            return {"weight": w, "order": oid, "rejected": list(d.reasons)}
        self.ledger.transition(oid, "ACCEPTED", "passed pre-trade risk check")
        self.ledger.transition(oid, "SUBMITTED", "submitted to local simulator")
        return {"weight": w, "order": oid, "side": side, "qty": abs(delta)}

    def _emit(self, kind, msg, severity="info", **data):
        if self.events is not None:
            self.events.emit(kind, msg, severity, **data)
