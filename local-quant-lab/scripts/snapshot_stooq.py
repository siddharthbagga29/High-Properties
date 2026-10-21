#!/usr/bin/env python3
"""Optional, run by the founder: download free daily bars from Stooq and freeze them as hashed CSV snapshots in
data/snapshots/ (CSV + manifest with sha256, retrieval time, adjustment status and terms). Research use only.

    python3 scripts/snapshot_stooq.py SPY QQQ IWM TLT
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lql.data.providers import StooqProvider, write_snapshot, ProviderError  # noqa: E402
from lql.data.quality import validate  # noqa: E402


def main(symbols):
    p = StooqProvider()
    for s in symbols or ["SPY"]:
        try:
            bars, info = p.fetch(s)
        except ProviderError as e:
            print(f"{s}: FAILED ({e})")
            continue
        q = validate(bars, s)
        path, _manifest = write_snapshot(s, bars, info)
        print(f"{s}: {len(bars)} bars {q.first}..{q.last} tradable={q.tradable} issues={q.counts()} -> {path}")


if __name__ == "__main__":
    main(sys.argv[1:])
