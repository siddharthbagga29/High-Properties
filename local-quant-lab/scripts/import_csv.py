#!/usr/bin/env python3
"""Run by the founder: freeze a CSV you downloaded BY HAND (for example from the Stooq website in your browser, where
you handle any login or CAPTCHA yourself) into data/snapshots/ with a hash manifest. Nothing is downloaded here.

    python3 scripts/import_csv.py SPY ~/Downloads/spy_us_d.csv --source "Stooq website, manual download 2026-10-22"

The adjustment status is recorded as 'unknown' (or what you declare, except 'verified', which only
scripts/check_adjustment.py can set). Expected columns: Date,Open,High,Low,Close,Volume."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lql.data.providers import parse_csv, write_snapshot, ProviderError, SNAPSHOT_DIR  # noqa: E402
from lql.data.quality import validate  # noqa: E402
from lql.data.schema import SourceInfo, ADJ_STATUSES, ADJ_VERIFIED  # noqa: E402
from lql.events import now_iso  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("symbol")
    ap.add_argument("csv")
    ap.add_argument("--source", required=True, help="where the file came from and when (free text, recorded)")
    ap.add_argument("--adjusted", default="unknown", choices=[s for s in ADJ_STATUSES if s not in (ADJ_VERIFIED, "n/a")])
    ap.add_argument("--dir", default=str(SNAPSHOT_DIR))
    ap.add_argument("--no-calendar", action="store_true", help="skip the US exchange (XNYS) session check (non-US data)")
    a = ap.parse_args()
    try:
        bars = parse_csv(Path(a.csv).read_text(), a.symbol, source="manual_csv", received_at=now_iso())
    except (ProviderError, OSError) as e:
        print(f"{a.symbol}: FAILED ({e})")
        return 1
    q = validate(bars, a.symbol, calendar=None if a.no_calendar else "XNYS")
    info = SourceInfo(provider="manual_csv", kind="HISTORICAL_DOWNLOADED", description=a.source,
                      retrieved_at=now_iso(), adjusted=a.adjusted, terms="Operator-supplied file; check the vendor's terms")
    path, m = write_snapshot(a.symbol, bars, info, a.dir)
    print(f"{a.symbol}: {len(bars)} bars {q.first}..{q.last} tradable={q.tradable} issues={q.counts()} -> {path}")
    return 0 if q.tradable else 2


if __name__ == "__main__":
    sys.exit(main())
