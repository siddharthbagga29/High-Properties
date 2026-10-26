#!/usr/bin/env python3
"""Run by the founder on the Mac. Compares a snapshot with reference closes you copied from an INDEPENDENT source
(for example the ETF issuer's or a second data site's raw close and its adjusted/total-return close on old dates).
It does not download anything.

    python3 scripts/check_adjustment.py SPY --ref 2008-03-14:<RAW>:<ADJUSTED> --ref 2012-06-01:<RAW>:<ADJUSTED>
    ...add --write to record the outcome in the manifest (only a verified outcome clears the PROVISIONAL label).

Pick OLD dates: on a recent date raw and adjusted closes are nearly equal and cannot be told apart."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from datetime import date  # noqa: E402
import json  # noqa: E402
from lql.data.adjustment import classify, attest, parse_ref, save_refs  # noqa: E402
from lql.data.schema import ADJ_VERIFIED  # noqa: E402
from lql.data.providers import SnapshotProvider, SNAPSHOT_DIR  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("symbol")
    ap.add_argument("--ref", action="append", required=True, help="DATE:RAW[:ADJUSTED], at least two decisive dates")
    ap.add_argument("--dir", default=str(SNAPSHOT_DIR))
    ap.add_argument("--tol", type=float, default=0.01)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    bars = SnapshotProvider(a.dir).bars(a.symbol)
    refs = [parse_ref(r) for r in a.ref]
    status, evidence, details = classify(bars, refs, a.tol)
    for d in details:
        print(d)
    print(f"\n{a.symbol}: {status} ({evidence})")
    if status != "split_and_dividend_adjusted":
        print("Result stays PROVISIONAL: research output built on this data cannot count as evidence.")
    if a.write:
        attest(a.dir, a.symbol, status, evidence, "references typed in by the operator")
        print("manifest updated")
        applied = json.loads((Path(a.dir) / f"{a.symbol}.manifest.json").read_text()).get("dividends")
        if status == ADJ_VERIFIED and applied is not None:   # daily imports repeat this check until it expires
            save_refs(a.dir, a.symbol, refs, a.tol, applied, date.today())
            print("references saved: each daily import re-checks against them")
    return 0


if __name__ == "__main__":
    sys.exit(main())
