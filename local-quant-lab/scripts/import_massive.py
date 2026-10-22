#!/usr/bin/env python3
"""Run by the founder on the Mac: import end-of-day daily bars from Massive (formerly Polygon.io) into
data/snapshots/ as hashed snapshots, keeping the raw responses beside them (both git-ignored; never commit vendor data).

    export MASSIVE_API_KEY=...      # your own key, in your shell only; never in a file in the repository
    python3 scripts/import_massive.py SPY QQQ IWM TLT --from 2024-10-22 --to 2026-10-21 --i-have-read-the-massive-terms

Every dataset is labelled `split_adjusted_only` and therefore PROVISIONAL: it can be run and inspected but has no
evidence value until scripts/check_adjustment.py verifies a split-and-dividend-adjusted series. Calls are spaced to stay
under the Basic plan's reported 5 per minute; a rate-limit answer stops the import (no retry loop)."""
import argparse
import hashlib
import json
import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lql.data.providers import MassiveProvider, ProviderError, write_snapshot, SNAPSHOT_DIR  # noqa: E402
from lql.data.quality import validate  # noqa: E402
from lql.data.schema import dataset_state  # noqa: E402

IMPORTER_VERSION = "massive-import-1"


def import_one(provider, symbol, start, end, directory):
    bars, info, pages, request = provider.fetch(symbol, start, end)
    raw_dir = Path(directory) / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    raw_hashes = []
    for i, page in enumerate(pages):
        h = hashlib.sha256(page).hexdigest()
        (raw_dir / f"{symbol}-{info.retrieved_at[:10]}-{i}.json").write_bytes(page)
        raw_hashes.append(h)
    q = validate(bars, symbol)
    extra = {"request": request, "raw_sha256": raw_hashes, "importer_version": IMPORTER_VERSION,
             "validation": q.to_dict(), "frequency": "1 day", "currency": "USD",
             "calendar": "US equity sessions as returned by the vendor"}
    path, m = write_snapshot(symbol, bars, info, directory, extra=extra)
    m["data_state"] = dataset_state(replace(info, content_sha256=m["sha256"]), q)   # frozen now: state from the hash
    Path(path).with_name(f"{symbol}.manifest.json").write_text(json.dumps(m, indent=2))
    return q, path, m


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("symbols", nargs="+")
    ap.add_argument("--from", dest="start", required=True)
    ap.add_argument("--to", dest="end", required=True)
    ap.add_argument("--dir", default=str(SNAPSHOT_DIR))
    ap.add_argument("--i-have-read-the-massive-terms", dest="terms", action="store_true",
                    help="confirm you read Massive's current plan and terms (personal use, no redistribution)")
    a = ap.parse_args(argv)
    if not a.terms:
        print("Read Massive's current pricing/terms page first, then add --i-have-read-the-massive-terms.")
        return 2
    provider, worst = MassiveProvider(), 0
    for sym in a.symbols:
        try:
            q, path, m = import_one(provider, sym.upper(), a.start, a.end, a.dir)
        except ProviderError as e:
            print(f"{sym}: FAILED ({e})")
            if "rate limit" in str(e):
                return 3
            worst = max(worst, 1)
            continue
        print(f"{sym}: {m['rows']} bars {m['first']}..{m['last']} state={m['data_state']} "
              f"issues={q.counts()} -> {path}")
        if not q.passes_validation:
            worst = max(worst, 2)
    return worst


if __name__ == "__main__":
    sys.exit(main())
