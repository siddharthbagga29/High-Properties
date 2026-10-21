"""Price-adjustment verification. Prices from a free vendor may or may not be adjusted for splits and distributions,
and that decides whether returns (especially buy-and-hold versus a strategy that sits in cash) mean anything. This
module never decides from the data alone: it compares the series with reference closes that a person copied from an
INDEPENDENT source (not the vendor being checked). Anything short of a decisive match stays provisional."""
import json
from datetime import date
from pathlib import Path

from ..events import now_iso
from .schema import ADJ_VERIFIED


def classify(bars, refs, tol=0.01, min_decisive=2):
    """bars: list of Bar. refs: [(date, raw_close, adjusted_close_or_None)]. Returns (status, evidence, details).

    A reference is decisive only if its raw and adjusted closes differ by more than 2*tol (otherwise the date cannot
    tell the two apart). The series must match the ADJUSTED reference at every decisive date, and at least
    `min_decisive` decisive dates are needed, to be called verified; matching the RAW reference at all of them gives
    "unadjusted"; anything else is "unknown"."""
    by_date = {b.event_date: b.close for b in bars}
    details, adj_hits, raw_hits, decisive = [], 0, 0, 0
    for d, raw, adj in refs:
        c = by_date.get(d)
        row = {"date": d.isoformat(), "series_close": c, "raw_ref": raw, "adjusted_ref": adj}
        if c is None:
            row["result"] = "date not in the series"
        elif adj is None or abs(raw / adj - 1) <= 2 * tol:
            row["result"] = "not decisive (raw and adjusted references are too close, or no adjusted reference)"
        else:
            decisive += 1
            m_adj, m_raw = abs(c / adj - 1) <= tol, abs(c / raw - 1) <= tol
            adj_hits += m_adj
            raw_hits += m_raw
            row["result"] = "matches adjusted" if m_adj else "matches raw" if m_raw else "matches neither"
        details.append(row)
    if decisive >= min_decisive and adj_hits == decisive:
        status = ADJ_VERIFIED
        ev = f"matched independent adjusted closes at {decisive} dates (tolerance {tol:.1%})"
    elif decisive >= min_decisive and raw_hits == decisive:
        status, ev = "unadjusted", f"matched independent raw closes at {decisive} dates (tolerance {tol:.1%})"
    else:
        status, ev = "unknown", f"inconclusive: {decisive} decisive dates, {adj_hits} adjusted, {raw_hits} raw matches"
    return status, ev, details


def attest(directory, instrument, status, evidence, refs_note=""):
    """Record the outcome in the snapshot manifest. Only a person runs this (scripts/check_adjustment.py --write)."""
    p = Path(directory) / f"{instrument}.manifest.json"
    m = json.loads(p.read_text())
    m["adjusted"] = status
    m["adjustment_evidence"] = (f"{evidence}; csv sha256 {m['sha256'][:16]}; attested {now_iso()}"
                                + (f"; {refs_note}" if refs_note else "")) if status == ADJ_VERIFIED else ""
    m["adjustment_check"] = {"status": status, "evidence": evidence, "at": now_iso()}
    p.write_text(json.dumps(m, indent=2))
    return m


def parse_ref(text):
    """'2007-10-09:156.5:104.2' or '2007-10-09:156.5' -> (date, raw, adjusted|None)"""
    parts = text.split(":")
    if len(parts) not in (2, 3):
        raise ValueError("reference must be DATE:RAW or DATE:RAW:ADJUSTED")
    return date.fromisoformat(parts[0]), float(parts[1]), float(parts[2]) if len(parts) == 3 else None
