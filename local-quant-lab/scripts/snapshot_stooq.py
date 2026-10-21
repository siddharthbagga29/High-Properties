#!/usr/bin/env python3
"""Optional, run by the founder: download daily bars from Stooq and freeze them as hashed CSV snapshots in
data/snapshots/. Research use only.

Stooq has reportedly required an API key since about March 2026 (see StooqProvider's docstring; unverified against
stooq.com). You must obtain that key yourself on the website. This script never tries to get a key, solve a CAPTCHA,
retry or get around a quota. It stops at the first key or quota failure. The key is read from STOOQ_API_KEY and is
never printed or stored.

    export STOOQ_API_KEY=...        # in your shell only; never in git
    python3 scripts/snapshot_stooq.py --i-have-read-the-stooq-terms SPY QQQ IWM TLT

Without a key, download each CSV in your browser and use scripts/import_csv.py instead.
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lql.data.providers import StooqProvider, write_snapshot, ProviderError  # noqa: E402
from lql.data.quality import validate  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("symbols", nargs="*", default=["SPY"])
    ap.add_argument("--i-have-read-the-stooq-terms", action="store_true", dest="terms",
                    help="confirm you read stooq.com's terms and that this use is allowed")
    ap.add_argument("--pause", type=float, default=3.0, help="seconds between requests")
    a = ap.parse_args(argv)
    if not a.terms:
        print("Refusing to download: read Stooq's terms first, then pass --i-have-read-the-stooq-terms "
              "(or use scripts/import_csv.py with a file you downloaded by hand).")
        return 2
    p = StooqProvider()
    failures = 0
    for n, s in enumerate(a.symbols):
        if n:
            time.sleep(a.pause)
        try:
            bars, info = p.fetch(s)
        except ProviderError as e:
            print(f"{s}: FAILED ({e})")
            return 1   # stop at the first failure: do not keep hitting a service that said no
        q = validate(bars, s)
        path, _manifest = write_snapshot(s, bars, info)
        print(f"{s}: {len(bars)} bars {q.first}..{q.last} tradable={q.tradable} issues={q.counts()} "
              f"adjustment={info.adjusted} (PROVISIONAL until verified) -> {path}")
        failures += 0 if q.tradable else 1
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
