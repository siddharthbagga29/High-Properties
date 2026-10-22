"""Data-quality validation. Returns issues; `tradable` is False on any blocking issue. Never forward-fills."""
from dataclasses import dataclass, field
from datetime import date, datetime, timezone

SPLIT_RATIOS = (0.5, 1 / 3, 0.25, 0.2, 0.1, 2.0, 3.0, 4.0, 5.0, 10.0)
BLOCKING = {"invalid_ohlc", "non_monotonic", "duplicate", "non_positive_price", "empty", "stale", "wrong_instrument",
            "non_session_bar"}


@dataclass
class QualityReport:
    instrument: str
    rows: int
    issues: list = field(default_factory=list)   # dicts: {code, date, detail}
    first: str = ""
    last: str = ""

    @property
    def tradable(self):
        return not any(i["code"] in BLOCKING for i in self.issues)

    @property
    def passes_validation(self):
        """No blocking issue. This says nothing about trading eligibility: see lql.data.schema.eligible()."""
        return self.tradable

    def counts(self):
        c = {}
        for i in self.issues:
            c[i["code"]] = c.get(i["code"], 0) + 1
        return c

    def to_dict(self):
        return {"instrument": self.instrument, "rows": self.rows, "first": self.first, "last": self.last,
                "passes_validation": self.tradable,
                "tradable": self.tradable,   # legacy key: means "passes blocking validation", NOT eligible to trade
                "counts": self.counts(), "issues": self.issues[:50]}


def validate(bars, instrument=None, as_of=None, max_age_days=None, gap_days=5, outlier_ret=0.15, calendar=None):
    """Check schema, chronology, duplicates, OHLC validity, gaps, outliers and staleness. With calendar="XNYS" (real
    US equity data), also flag every exchange session with no bar (`missing_session`, a warning: the vendor's gap is
    kept visible, never filled) and every bar on a weekend or exchange holiday (`non_session_bar`, blocking: usually a
    timestamp or timezone error). Synthetic fixtures run on plain business days and are checked without a calendar."""
    inst = instrument or (bars[0].instrument if bars else "?")
    rep = QualityReport(inst, len(bars))
    if not bars:
        rep.issues.append({"code": "empty", "date": None, "detail": "no bars"})
        return rep
    rep.first, rep.last = bars[0].event_date.isoformat(), bars[-1].event_date.isoformat()
    seen = set()
    prev = None
    for b in bars:
        d = b.event_date.isoformat()
        if b.instrument != inst:
            rep.issues.append({"code": "wrong_instrument", "date": d, "detail": b.instrument})
        if b.event_date in seen:
            rep.issues.append({"code": "duplicate", "date": d, "detail": "duplicate session date"})
        seen.add(b.event_date)
        if min(b.open, b.high, b.low, b.close) <= 0:
            rep.issues.append({"code": "non_positive_price", "date": d, "detail": "price <= 0"})
        elif not (b.low <= min(b.open, b.close) and b.high >= max(b.open, b.close) and b.low <= b.high):
            rep.issues.append({"code": "invalid_ohlc", "date": d, "detail": f"o{b.open} h{b.high} l{b.low} c{b.close}"})
        if b.volume < 0:
            rep.issues.append({"code": "invalid_ohlc", "date": d, "detail": "negative volume"})
        if prev is not None:
            if b.event_date < prev.event_date:
                rep.issues.append({"code": "non_monotonic", "date": d, "detail": f"after {prev.event_date}"})
            elif (b.event_date - prev.event_date).days > gap_days:
                rep.issues.append({"code": "gap", "date": d,
                                   "detail": f"{(b.event_date - prev.event_date).days} calendar days since previous bar"})
            if prev.close > 0 and abs(b.close / prev.close - 1) > outlier_ret:
                rep.issues.append({"code": "outlier", "date": d, "detail": f"close-to-close {b.close / prev.close - 1:+.1%}"})
                ratio = b.close / prev.close
                if any(abs(ratio / r - 1) < 0.06 for r in SPLIT_RATIOS):
                    rep.issues.append({"code": "split_suspect", "date": d,
                                       "detail": f"close ratio {ratio:.3f} looks like a split; an unadjusted series "
                                                 "would distort returns here"})
        prev = b
    if calendar is not None:
        if calendar != "XNYS":
            raise ValueError(f"unknown calendar {calendar!r}; supported: XNYS")
        from .calendar import holidays, sessions
        have = {b.event_date for b in bars}
        for d in sorted(have):
            if d.weekday() >= 5 or d in holidays(d.year):
                rep.issues.append({"code": "non_session_bar", "date": d.isoformat(),
                                   "detail": holidays(d.year).get(d, "weekend") + ": the exchange was closed"})
        for d in sessions(min(have), max(have)):
            if d not in have:
                rep.issues.append({"code": "missing_session", "date": d.isoformat(),
                                   "detail": "XNYS session with no bar (left missing, not filled)"})
    if as_of is not None and max_age_days is not None:
        last = max(b.event_date for b in bars)
        ref = as_of.date() if isinstance(as_of, datetime) else as_of
        if (ref - last).days > max_age_days:
            rep.issues.append({"code": "stale", "date": last.isoformat(),
                               "detail": f"last bar {last} is {(ref - last).days} days before {ref}"})
    return rep


def today_utc():
    return datetime.now(timezone.utc).date()
