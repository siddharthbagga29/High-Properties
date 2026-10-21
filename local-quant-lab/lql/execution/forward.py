"""Paper-trading forward log: a repeatable, restartable runner for SIMULATED multi-instrument paper trading.

Each `ForwardRunner.run_once` call is one idempotent pass: load data, process every session that is newer than the
last committed one, and append what happened to `forward_log.jsonl`. Run it as often as you like (for example once
a day after the data refresh); a pass with nothing new changes nothing. It is NOT a daemon and it does not fetch
data by itself: scheduling and data refresh are the operator's job (docs/FORWARD_PAPER.md).

Per session (one calendar date that has at least one bar), `MultiPaperSession.step_day`:
  1. validates each instrument's new bar against its previous one (a bad bar locks that instrument out; others go on);
  2. fills orders decided at the previous session at THIS session's open (sells first); any order that cannot fill
     now (instrument locked out, no bar, stale data) is CANCELLED, never carried across a gap;
  3. marks to the latest known close and reconciles cash and positions against the fill journal;
  4. sizes (equal share per instrument), applies the deterministic risk check, and submits; stale data, an engaged
     kill switch or an unreconciled ledger stop new risk (the risk engine decides, not the strategy).
The last step commits `last_processed`. A crash anywhere earlier is repaired on the next pass: order IDs derive from
idempotency keys, orders left half-way are finished or re-checked, and log records are keyed so they are not
duplicated. The log is rebuilt from the ledger (the source of truth), so an interrupted pass loses nothing.

Evidence classes (stored once, never mixed): SYNTHETIC_REPLAY, SYNTHETIC_FORWARD, REAL_REPLAY, REAL_FORWARD. Only
REAL_FORWARD (bars that did not exist when the log was started, from a real snapshot) can ever count as forward
paper evidence, and even then alpha_status stays "unproven" until the written criteria are met by a human review.
"""
import fcntl
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from ..backtest.metrics import summarize
from ..data.quality import validate
from ..events import now_iso, atomic_write_json
from ..risk import OrderIntent, PortfolioView, size_order
from ..strategies import create
from .ledger import Ledger
from .paper import PaperSession, session_ts

FORWARD_VERSION = "1.0.0"
BLOCKING = ("invalid_ohlc", "non_monotonic", "duplicate", "non_positive_price", "wrong_instrument")
PAPER_EVIDENCE_CRITERIA = {"min_real_forward_sessions": 60, "min_completed_round_trips": 10,
                           "no_unresolved_reconciliation_or_error": True, "human_review": True}


class ForwardError(Exception):
    pass


class RunnerBusy(ForwardError):
    pass


class ForwardConfigError(ForwardError):
    pass


class ForwardLog:
    """Append-only JSONL. Every record has a deterministic `rid`; writing an existing rid is a no-op."""

    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.rids, self._buf = set(), []
        if self.path.exists():
            for line in self.path.read_text().splitlines():
                try:
                    self.rids.add(json.loads(line)["rid"])
                except (json.JSONDecodeError, KeyError):
                    continue  # a torn final line from a crash is ignored; its record is regenerated from the ledger

    def write(self, rid, kind, evidence_class, defer=False, **data):
        """Append one record unless its rid exists. defer=True buffers it until `flush()` (one fsync per batch)."""
        if rid in self.rids:
            return False
        rec = {"rid": rid, "t": now_iso(), "kind": kind, "evidence_class": evidence_class, **data}
        self.rids.add(rid)
        self._buf.append(json.dumps(rec, sort_keys=True, default=str) + "\n")
        if not defer:
            self.flush()
        return True

    def flush(self):
        if not self._buf:
            return
        with open(self.path, "a") as f:
            f.write("".join(self._buf))
            f.flush()
            os.fsync(f.fileno())
        self._buf = []

    def read(self, kinds=None):
        if not self.path.exists():
            return []
        out = []
        for line in self.path.read_text().splitlines():
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            if kinds is None or r["kind"] in kinds:
                out.append(r)
        return out


class MultiPaperSession(PaperSession):
    """PaperSession for several instruments sharing one ledger. Reuses the single-instrument fill model."""

    def __init__(self, settings, ledger, strategy, universe, events=None):
        super().__init__(settings, ledger, strategy, events)
        self.universe = sorted(universe)
        self.share = 1.0 / len(self.universe)
        self.hist = {i: [] for i in self.universe}
        self.fault = None
        for o in ledger.orders(status="CREATED"):   # not yet risk-checked: must be checkable again after a restart
            self.risk._seen_keys.discard(o["idem_key"])
            if o["decision_ts"] in self.risk._order_times:
                self.risk._order_times.remove(o["decision_ts"])

    def _fault(self, point, day):
        if self.fault:
            self.fault(point, day)

    def warm(self, inst, bars):
        """Rebuild strategy history after a restart from already-processed sessions (valid bars only)."""
        for b in bars:
            prev = self.hist[inst][-1] if self.hist[inst] else None
            if validate(([prev] if prev else []) + [b], instrument=inst).tradable:
                self.hist[inst].append(b)

    def step_day(self, day, bars, data_age_seconds=0, market_ok=True):
        iso = day.isoformat()
        last = self.ledger.get("last_processed")
        if last is not None and iso <= last:
            return {"date": iso, "skipped": "already processed"}
        L, lim = self.ledger, self.settings.risk
        out = {"date": iso, "lockouts": [], "gaps": [], "signals": [], "decisions": [], "stale": False,
               "cancelled": [], "healed": []}
        # an order that passed the risk check but was never submitted (crash) is finished, not re-decided
        for o in L.orders(status="ACCEPTED"):
            L.transition(o["id"], "SUBMITTED", "recovered after interruption: passed the risk check earlier")
            out["healed"].append(o["id"])
        locked = set(L.get("lockout_instruments", []))
        valid = {}
        for inst in sorted(bars):
            b = bars[inst]
            prev = self.hist[inst][-1] if self.hist[inst] else None
            q = validate(([prev] if prev else []) + [b], instrument=inst)
            why = [i["code"] for i in q.issues if i["code"] in BLOCKING]
            if not market_ok:
                why.append("provider_disconnected")
            if why:
                if inst not in locked:
                    self._emit("data_lockout", f"{inst} {iso}: trading locked out ({', '.join(why)})", "critical")
                locked.add(inst)
                out["lockouts"].append({"instrument": inst, "reasons": why})
            else:
                if inst in locked:
                    self._emit("data_recovered", f"{inst} {iso}: validated data restored; lockout cleared", "warning")
                    locked.discard(inst)
                valid[inst] = b
        L.set("lockout_instruments", sorted(locked))
        for inst in self.universe:
            if inst not in bars:
                h = self.hist[inst]
                out["gaps"].append({"instrument": inst, "last_bar": h[-1].event_date.isoformat() if h else None,
                                    "age_days": (day - h[-1].event_date).days if h else None,
                                    "held_qty": L.positions().get(inst, 0)})
        stale = data_age_seconds is None or data_age_seconds > lim.max_data_age_seconds
        out["stale"] = stale
        if stale:
            self._emit("data_stale", f"{iso}: data is {data_age_seconds}s old; no fills or new orders", "critical")
        # fills at this session's open, sells first
        if not stale:
            todo = [o for o in L.orders(status="SUBMITTED") if o["decision_date"] < iso]
            for o in sorted(todo, key=lambda o: (o["side"] != "SELL", o["instrument"])):
                if o["instrument"] in valid:
                    self._fill_order(o, valid[o["instrument"]])
        self._fault("after_fills", iso)
        for o in L.orders(status="SUBMITTED"):
            if o["decision_date"] < iso:
                L.transition(o["id"], "CANCELLED", "could not fill at the next session (locked out, no bar or stale "
                                                   "data); orders are never carried across a gap")
                out["cancelled"].append(o["id"])
        for inst, b in valid.items():
            self.hist[inst].append(b)
        eq = L.mark(iso, {i: b.close for i, b in valid.items()})
        problems = L.reconcile()
        if problems:
            self._emit("reconciliation_mismatch", "; ".join(problems), "critical")
        out["equity"] = eq
        self._fault("after_mark", iso)
        if not stale:
            self._decide_all(day, valid, eq, out, data_age_seconds)
        return out

    def commit(self, day):
        """Mark the session processed. Called by the runner after the log has been written."""
        self.ledger.set("last_processed", day.isoformat())

    def _decide_all(self, day, valid, eq, out, data_age_seconds):
        L = self.ledger
        marks = L.marks()
        sod = marks[-2]["equity"] if len(marks) > 1 else eq
        peak = max(m["equity"] for m in marks)
        ts = session_ts(day)
        iso = day.isoformat()
        # finish orders that were created but not risk-checked before an interruption
        for o in L.orders(status="CREATED"):
            self._check_and_submit(o, self._intent_from_row(o), eq, sod, peak, ts, data_age_seconds, out)
        for inst in sorted(valid):
            b = valid[inst]
            w = max(0.0, min(self.strategy.meta.max_weight, self.strategy.target_weight(self.hist[inst]))) * self.share
            out["signals"].append({"instrument": inst, "weight": w, "close": b.close,
                                   "history_bars": len(self.hist[inst]), "strategy": self.strategy.meta.key,
                                   "strategy_version": self.strategy.meta.version})
            held = L.positions().get(inst, 0)
            for o in L.orders(status=("ACCEPTED", "SUBMITTED")):
                if o["instrument"] == inst:
                    held += o["qty"] if o["side"] == "BUY" else -o["qty"]
            delta = size_order(self.settings.risk, w, eq, b.close, held)
            if delta == 0:
                continue
            side = "BUY" if delta > 0 else "SELL"
            intent = OrderIntent(inst, side, abs(delta), "MARKET", ref_price=b.close, strategy=self.strategy.meta.key,
                                 idempotency_key=f"paper:{self.strategy.meta.key}:{inst}:{iso}")
            oid, created = L.create_order(intent, iso, ts, self.strategy.meta.version)
            if not created:
                out["decisions"].append({"order": oid, "instrument": inst, "duplicate": True,
                                         "status": L.order(oid)["status"]})
                continue
            self._fault("after_order_created", iso)
            self._check_and_submit(L.order(oid), intent, eq, sod, peak, ts, data_age_seconds, out)
        self._fault("after_decisions", iso)

    @staticmethod
    def _intent_from_row(o):
        return OrderIntent(o["instrument"], o["side"], o["qty"], o["order_type"], ref_price=o["ref_price"],
                           limit_price=o["limit_price"], strategy=o["strategy"], idempotency_key=o["idem_key"])

    def _check_and_submit(self, o, intent, eq, sod, peak, ts, data_age_seconds, out):
        L = self.ledger
        committed = dict(L.positions())
        reserved = 0.0
        for x in L.orders(status=("ACCEPTED", "SUBMITTED")):
            committed[x["instrument"]] = committed.get(x["instrument"], 0) + (x["qty"] if x["side"] == "BUY" else -x["qty"])
            if x["side"] == "BUY":
                reserved += x["qty"] * x["ref_price"]
        view = PortfolioView(cash=L.cash() - reserved, positions=committed, last_prices=L.last_prices(), equity=eq,
                             start_of_day_equity=sod, peak_equity=peak, reconciled=L.get("reconciled"))
        d = self.risk.check(intent, view, market_ok=True, data_age_seconds=data_age_seconds, now_ts=ts)
        if not d.approved:
            L.transition(o["id"], "RISK_REJECTED", "pre-trade risk check", reasons=d.reasons)
            out["decisions"].append({"order": o["id"], "instrument": intent.instrument, "status": "RISK_REJECTED",
                                     "reasons": list(d.reasons)})
            return
        L.transition(o["id"], "ACCEPTED", "passed pre-trade risk check")
        self._fault("after_accepted", o["decision_date"])
        L.transition(o["id"], "SUBMITTED", "submitted to local simulator")
        out["decisions"].append({"order": o["id"], "instrument": intent.instrument, "status": "SUBMITTED",
                                 "side": intent.side, "qty": intent.qty})


class ForwardRunner:
    def __init__(self, settings, directory, universe, strategy="sma_trend", params=None, mode="REPLAY", events=None):
        if mode not in ("FORWARD", "REPLAY"):
            raise ForwardConfigError("mode must be FORWARD or REPLAY")
        self.settings, self.dir, self.mode, self.events = settings, Path(directory), mode, events
        self.universe, self.strategy_key, self.params = sorted(universe), strategy, params or {}
        self.dir.mkdir(parents=True, exist_ok=True)
        self.log = ForwardLog(self.dir / "forward_log.jsonl")
        self.state_path = self.dir / "run_state.json"

    # -- one pass -------------------------------------------------------------------------------------------------
    def run_once(self, loader, now=None, fault=None):
        """loader() -> ({instrument: [Bar]}, SourceInfo). Returns a summary dict; never raises on data problems."""
        now = now or datetime.now(timezone.utc)
        lock = open(self.dir / "run.lock", "w")
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            lock.close()
            raise RunnerBusy("another forward pass holds the lock; nothing was changed")
        try:
            return self._pass(loader, now, fault)
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)
            lock.close()

    def _evidence_class(self, info):
        return f"{'SYNTHETIC' if info.is_synthetic else 'REAL'}_{self.mode}"

    def _pass(self, loader, now, fault):
        started = now_iso()
        cls = None
        try:
            data, info = loader()
        except Exception as e:  # provider/hash/IO failure: visible, no state change
            return self._fail("DATA_ERROR", f"{type(e).__name__}: {e}", None, started)
        cls = self._evidence_class(info)
        if self.mode == "FORWARD":   # a session is complete only after 21:00 UTC (conservative US close); defer the rest
            cut = now.timestamp()
            deferred = sorted({b.event_date for i in self.universe for b in data.get(i, []) if session_ts(b.event_date) > cut})
            data = {i: [b for b in bars if session_ts(b.event_date) <= cut] for i, bars in data.items()}
            for d in deferred:
                self.log.write(f"data:{d}:incomplete", "data_event", cls, date=d.isoformat(),
                               code="incomplete_session_deferred", detail="bar dated after the last completed session")
        missing = [i for i in self.universe if i not in data or not data[i]]
        if missing:
            return self._fail("DATA_ERROR", f"no bars for {missing}", cls, started)
        if self.mode == "FORWARD" and not (self.dir / "ledger.db").exists():
            last_bar = max(b.event_date for i in self.universe for b in data[i])
            age = now.timestamp() - session_ts(last_bar)
            if age > self.settings.risk.max_data_age_seconds:
                return self._fail("DATA_ERROR", f"cannot start a FORWARD log on stale data (newest bar {last_bar}, "
                                                f"{age / 86400:.1f} days old)", cls, started)
        ledger = Ledger(self.dir / "ledger.db", self.settings.initial_cash)
        try:
            return self._process(ledger, data, info, cls, now, fault, started)
        finally:
            ledger.close()

    def _process(self, ledger, data, info, cls, now, fault, started):
        s = self.settings
        cfg = ledger.get("forward_cfg")
        want = {"mode": self.mode, "evidence_class": cls, "strategy": self.strategy_key, "params": self.params,
                "universe": self.universe, "forward_version": FORWARD_VERSION,
                "strategy_version": create(self.strategy_key, **self.params).meta.version}
        if cfg is None:
            last_bar = max(b.event_date for i in self.universe for b in data[i])
            if self.mode == "FORWARD":
                age = now.timestamp() - session_ts(last_bar)
                if age > s.risk.max_data_age_seconds:
                    return self._fail("DATA_ERROR", f"cannot start a FORWARD log on stale data (newest bar {last_bar}, "
                                                    f"{age / 86400:.1f} days old)", cls, started)
                want["forward_start"] = last_bar.isoformat()
                ledger.set("last_processed", last_bar.isoformat())   # everything up to here is warm-up only
            else:
                want["forward_start"] = None
            ledger.set("forward_cfg", want)
            ledger.set("evidence_class", cls)
            cfg = want
            self.log.write("init", "init", cls, config=want, source=info.__dict__)
        elif {k: cfg.get(k) for k in want if k != "forward_start"} != {k: v for k, v in want.items() if k != "forward_start"}:
            raise ForwardConfigError(f"this forward log was started as {cfg}; it cannot continue as {want}. "
                                     "Start a new log directory instead of mixing configurations or data kinds.")
        cls = cfg["evidence_class"]
        session = MultiPaperSession(s, ledger, create(self.strategy_key, **self.params), self.universe, self.events)
        session.fault = fault
        last_done = ledger.get("last_processed")
        for inst in self.universe:
            ordered = sorted(data[inst], key=lambda b: b.event_date)
            session.warm(inst, [b for b in ordered if last_done and b.event_date.isoformat() <= last_done])
        by_date = {}
        for inst in self.universe:
            for b in data[inst]:
                by_date.setdefault(b.event_date, {})[inst] = b
        todo = [d for d in sorted(by_date) if last_done is None or d.isoformat() > last_done]
        self.log.write(f"run:{started}", "run_start", cls, pending_sessions=[d.isoformat() for d in todo])
        processed, status, error = [], "OK", None
        prev_date = datetime.fromisoformat(last_done).date() if last_done else None
        for d in todo:
            bars = by_date[d]
            age = (now.timestamp() - session_ts(d)) if self.mode == "FORWARD" else 0
            try:
                if prev_date and (d - prev_date).days > 5:
                    self.log.write(f"data:{d}:calendar_gap", "data_event", cls, date=d.isoformat(), code="calendar_gap",
                                   detail=f"{(d - prev_date).days} calendar days since the previous session")
                out = session.step_day(d, bars, data_age_seconds=max(0, age))
                session._fault("before_log", d.isoformat())
                self._sync_log(ledger, d, out, cls)
                session._fault("before_commit", d.isoformat())
                session.commit(d)
                session._fault("after_commit", d.isoformat())
            except Exception as e:  # leave the ledger as is; the next pass repairs and continues
                status, error = "ERROR", f"{type(e).__name__}: {e}"
                self.log.write(f"error:{d}:{type(e).__name__}:{str(e)[:60]}", "error", cls, date=d.isoformat(),
                               error=error, note="pass stopped; ledger is consistent and the next pass repairs")
                if self.events:
                    self.events.emit("forward_error", f"{d}: {error}", "critical")
                break
            processed.append(d.isoformat())
            prev_date = d
        self.log.write(f"runend:{started}", "run_end", cls, status=status, processed=processed, error=error)
        summary = {"status": status, "error": error, "processed": processed, "evidence_class": cls,
                   "last_processed": ledger.get("last_processed"), "reconciled": ledger.get("reconciled")}
        atomic_write_json(self.state_path, {**summary, "last_run_started": started, "last_run_ended": now_iso(),
                                            "config": cfg})
        return summary

    def _fail(self, status, error, cls, started):
        self.log.write(f"error:{started}", "error", cls or "UNKNOWN", error=error, note="no state change")
        if self.events:
            self.events.emit("forward_error", error, "critical")
        summary = {"status": status, "error": error, "processed": [], "evidence_class": cls}
        atomic_write_json(self.state_path, {**summary, "last_run_started": started, "last_run_ended": now_iso()})
        return summary

    # -- log from ledger -------------------------------------------------------------------------------------------
    def _sync_log(self, ledger, d, out, cls):
        iso = d.isoformat()

        def W(rid, kind, cls, **data):
            return self.log.write(rid, kind, cls, defer=True, **data)
        for sig in out.get("signals", []):
            W(f"signal:{iso}:{sig['instrument']}", "signal", cls, date=iso, **sig)
        for lo in out.get("lockouts", []):
            W(f"data:{iso}:{lo['instrument']}:lockout", "data_event", cls, date=iso, code="lockout", **lo)
        for g in out.get("gaps", []):
            W(f"data:{iso}:{g['instrument']}:missing_bar", "data_event", cls, date=iso, code="missing_bar", **g)
        if out.get("stale"):
            W(f"data:{iso}:stale", "data_event", cls, date=iso, code="stale_data",
              detail="no fills or new orders on stale data")
        pos, fills = {}, ledger.fills()
        for f in fills:
            pos[f["instrument"]] = pos.get(f["instrument"], 0) + (f["qty"] if f["side"] == "BUY" else -f["qty"])
            if f["fill_date"] == iso:
                before = pos[f["instrument"]] - (f["qty"] if f["side"] == "BUY" else -f["qty"])
                W(f"fill:{f['id']}", "fill", cls, date=iso, order=f["order_id"], instrument=f["instrument"],
                  side=f["side"], qty=f["qty"], price=f["price"], commission=f["commission"],
                  spread_slippage=f["spread_slippage"])
                W(f"poschg:{f['id']}", "position_change", cls, date=iso, instrument=f["instrument"], before=before,
                  after=pos[f["instrument"]])
        for o in ledger.orders():
            if o["decision_date"] == iso:
                W(f"decision:{o['id']}", "decision", cls, date=iso, order=o["id"], instrument=o["instrument"],
                  side=o["side"], qty=o["qty"], ref_price=o["ref_price"], decision_ts=o["decision_ts"],
                  strategy=o["strategy"], strategy_version=o["strategy_version"], status_at_log=o["status"],
                  reasons=o["reasons"])
                if o["status"] == "RISK_REJECTED":
                    W(f"riskrej:{o['id']}", "risk_rejection", cls, date=iso, order=o["id"],
                      instrument=o["instrument"], side=o["side"], qty=o["qty"], reasons=o["reasons"])
            if o["status"] in ("CANCELLED", "REJECTED"):
                note = [t["note"] for t in ledger.transitions(o["id"])][-1]
                W(f"terminal:{o['id']}:{o['status']}", "order_closed", cls, date=iso, order=o["id"],
                  instrument=o["instrument"], status=o["status"], note=note)
        m = [x for x in ledger.marks() if x["date"] == iso]
        if m:
            W(f"equity:{iso}", "equity", cls, date=iso, cash=m[0]["cash"], equity=m[0]["equity"],
              positions_value=m[0]["positions_value"], positions=dict(pos),
              reconciled=ledger.get("reconciled"))
        self.log.flush()

    # -- operator controls (persisted in the ledger; the next pass honours them) -------------------------------------
    def _session(self, ledger):
        return MultiPaperSession(self.settings, ledger, create(self.strategy_key, **self.params), self.universe,
                                 self.events)

    def kill(self, reason):
        ledger = Ledger(self.dir / "ledger.db", self.settings.initial_cash)
        try:
            cancelled = self._session(ledger).kill(reason)
            self.log.write(f"kill:{now_iso()}", "kill_switch", ledger.get("evidence_class", "UNKNOWN"),
                           engaged=True, reason=reason, cancelled=cancelled)
            return cancelled
        finally:
            ledger.close()

    def release(self, by):
        ledger = Ledger(self.dir / "ledger.db", self.settings.initial_cash)
        try:
            self._session(ledger).release(by)
            self.log.write(f"release:{now_iso()}", "kill_switch", ledger.get("evidence_class", "UNKNOWN"),
                           engaged=False, by=by)
        finally:
            ledger.close()

    # -- reporting -------------------------------------------------------------------------------------------------
    def report(self):
        ledger = Ledger(self.dir / "ledger.db", self.settings.initial_cash)
        try:
            cfg = ledger.get("forward_cfg")
            marks = ledger.marks()
            errors = self.log.read(("error",))
            cls = (cfg or {}).get("evidence_class", "NONE")
            sessions = len(marks)
            trips = sum(1 for f in ledger.fills() if f["side"] == "SELL")
            rep = {"evidence_class": cls, "config": cfg, "sessions": sessions,
                   "first": marks[0]["date"] if marks else None, "last": marks[-1]["date"] if marks else None,
                   "fills": len(ledger.fills()), "exits": trips,
                   "risk_rejections": len(self.log.read(("risk_rejection",))),
                   "data_events": len(self.log.read(("data_event",))), "errors": len(errors),
                   "reconciled": ledger.get("reconciled"), "kill_switch": ledger.get("kill_switch"),
                   "positions": ledger.positions(), "cash": ledger.cash()}
            if len(marks) > 1:
                m = summarize([x["date"] for x in marks], [x["equity"] for x in marks])
                rep["metrics"] = {k: m.get(k) for k in ("total_return", "sharpe", "max_drawdown")}
            real_fwd = sessions if cls == "REAL_FORWARD" else 0
            met = (real_fwd >= PAPER_EVIDENCE_CRITERIA["min_real_forward_sessions"]
                   and trips >= PAPER_EVIDENCE_CRITERIA["min_completed_round_trips"]
                   and not errors and bool(ledger.get("reconciled")))
            rep["paper_evidence"] = {
                "criteria": PAPER_EVIDENCE_CRITERIA, "real_forward_sessions": real_fwd,
                "mechanical_criteria_met": met, "alpha_status": "unproven",
                "statement": ("Not forward paper evidence: " + cls + ". Synthetic or replayed data cannot support a "
                              "claim.") if cls != "REAL_FORWARD" else
                ("Mechanical criteria met; a human review is still required before any status change."
                 if met else "REAL_FORWARD data, but the minimum sessions/exits/clean-run criteria are not met yet."),
            }
            return rep
        finally:
            ledger.close()
