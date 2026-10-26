"""Price-adjustment verification. Prices from a free vendor may or may not be adjusted for splits and distributions,
and that decides whether returns (especially buy-and-hold versus a strategy that sits in cash) mean anything. This
module never decides from the data alone: it compares the series with reference closes that a person copied from an
INDEPENDENT source (not the vendor being checked). Anything short of a decisive match stays provisional."""
import json
from datetime import date
from pathlib import Path

from ..events import now_iso
from .schema import ADJ_VERIFIED, DIV_UNVERIFIED

# A founder's verification is re-used by later daily imports for this long, then must be done again.
REFS_MAX_AGE_DAYS = 120


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


def apply_dividends(bars, dividends):
    """Back-adjust a split-adjusted daily series for cash distributions, the multiplicative method behind the usual
    "adjusted close": for each ex-date e with cash D, factor = 1 - D / (close of the last session before e), and every
    bar before e is multiplied by it. Returns (bars, applied); `applied` lists each distribution with its factor, or
    factor None when it falls outside the series (no earlier close, or after the last bar)."""
    from dataclasses import replace
    bars = sorted(bars, key=lambda b: b.event_date)
    factors, applied = [], []
    for ex, cash, kind in sorted(dividends):
        prev = [b for b in bars if b.event_date < ex]
        row = {"ex_date": ex.isoformat(), "cash": cash, "type": kind}
        if not prev or ex > bars[-1].event_date:
            applied.append(dict(row, factor=None, note="outside the series"))
            continue
        f = 1 - cash / prev[-1].close
        if not 0.5 < f < 1:
            raise ValueError(f"distribution {cash} on {ex} against close {prev[-1].close} gives factor {f}; refusing")
        factors.append((ex, f))
        applied.append(dict(row, factor=f, prev_close=prev[-1].close))
    out = []
    for b in bars:
        m = 1.0
        for ex, f in factors:
            if b.event_date < ex:
                m *= f
        out.append(replace(b, open=b.open * m, high=b.high * m, low=b.low * m, close=b.close * m))
    return out, applied


def refs_path(directory, instrument):
    return Path(directory) / f"{instrument}.adjustment_refs.json"


def save_refs(directory, instrument, refs, tol, applied, verified_on):
    """Keep the references a person verified, so the daily import can repeat the same check (never the reverse)."""
    rec = {"instrument": instrument, "verified_on": verified_on.isoformat(), "tol": tol,
           "refs": [[d.isoformat(), raw, adj] for d, raw, adj in refs],
           "dividends_at_verification": sorted(a["ex_date"] for a in applied if a.get("factor")),
           "source": "typed in by the operator from an independent source (scripts/check_adjustment.py)"}
    refs_path(directory, instrument).write_text(json.dumps(rec, indent=2))
    return rec


def recheck(directory, instrument, bars, applied, today):
    """Repeat the founder's verification on a fresh import. Distributions that went ex after the verification are
    rolled into the saved adjusted references with the same factors used for the series; that part is NOT an
    independent check, which is why references expire after REFS_MAX_AGE_DAYS. Returns (status, evidence)."""
    p = refs_path(directory, instrument)
    if not p.exists():
        return DIV_UNVERIFIED, "no saved references yet: run scripts/check_adjustment.py --write"
    r = json.loads(p.read_text())
    age = (today - date.fromisoformat(r["verified_on"])).days
    if age > REFS_MAX_AGE_DAYS:
        return DIV_UNVERIFIED, f"references verified {age} days ago (limit {REFS_MAX_AGE_DAYS}): verify again"
    known = set(r["dividends_at_verification"])
    later = [a for a in applied if a.get("factor") and a["ex_date"] not in known]
    rolled = []
    for d, raw, adj in r["refs"]:
        d = date.fromisoformat(d)
        m = 1.0
        for a in later:
            if d < date.fromisoformat(a["ex_date"]):
                m *= a["factor"]
        rolled.append((d, raw, adj * m if adj is not None else None))
    status, ev, _ = classify(bars, rolled, r["tol"])
    if status != ADJ_VERIFIED:
        return DIV_UNVERIFIED, f"automatic re-check against the {r['verified_on']} references failed: {ev}"
    return ADJ_VERIFIED, (f"re-checked against references verified by the founder on {r['verified_on']} ({ev}); "
                          f"{len(later)} later distribution(s) applied by the same method, not independently checked")
