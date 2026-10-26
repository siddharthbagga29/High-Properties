#!/usr/bin/env python3
"""Read-only connectivity and signal check, run by the founder. It has no order route of any kind.

    python3 scripts/check_connectivity.py              # credentials file and Massive market data
    python3 scripts/check_connectivity.py --signals    # also: today's strategy signals from the verified snapshots

Keys come from the environment or the credentials file (lql/envfile.py). No key value is ever printed.
Broker hosts are deliberately absent from this code base (tests/test_security.py); an Alpaca paper account is checked
by hand with the read-only command in docs/engineering/runbook.md, not from here."""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lql import envfile  # noqa: E402

def check_massive(env):
    from lql.data.providers import MassiveProvider
    end = datetime.now(timezone.utc).astimezone(ZoneInfo("America/New_York")).date() - timedelta(days=1)
    bars, info, _pages, _req = MassiveProvider(api_key=env.get("MASSIVE_API_KEY", "")).fetch(
        "SPY", (end - timedelta(days=10)).isoformat(), end.isoformat())
    return {"spy_daily_bars": len(bars), "last_session": bars[-1].event_date.isoformat(), "adjusted": info.adjusted}


def signals(snapshot_dir=None, symbols=("SPY", "QQQ", "IWM", "TLT"), strategies=("sma_trend", "vol_scaled_trend")):
    """The target weight each strategy would hold after the last close in each snapshot. A signal, not an order."""
    from lql.data.providers import SnapshotProvider, SNAPSHOT_DIR
    from lql.data.quality import validate
    from lql.data.schema import dataset_state
    from lql.strategies import create
    sp, rows = SnapshotProvider(snapshot_dir or SNAPSHOT_DIR), []
    for sym in symbols:
        try:
            bars, info = sp.bars(sym), sp.info(sym)
        except Exception as e:
            rows.append({"instrument": sym, "error": f"{type(e).__name__}: {e}"[:160]})
            continue
        state = dataset_state(info, validate(bars, sym))
        for k in strategies:
            rows.append({"instrument": sym, "strategy": k, "as_of_close": bars[-1].event_date.isoformat(),
                         "target_weight": round(create(k).target_weight(bars), 3), "data_state": state})
    return rows


def main(argv=None, env=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--signals", action="store_true")
    a = ap.parse_args(argv)
    if env is None:
        print(envfile.describe(envfile.load()))
        env = os.environ
    ok = True
    for name, fn in (("massive", lambda: check_massive(env)),):
        try:
            print(f"{name}: OK {json.dumps(fn())}")
        except Exception as e:
            ok = False
            print(f"{name}: FAILED ({e})")
    if a.signals:
        print("signals (target weight after the last close; 0 = cash, 1 = fully invested; no order is sent):")
        for r in signals():
            print("  " + (f"{r['instrument']}: {r['error']}" if "error" in r else
                          f"{r['instrument']:4} {r['strategy']:17} weight {r['target_weight']:.2f}  as of "
                          f"{r['as_of_close']}  {r['data_state']}"))
    print("orders: none placed, cancelled or changed (this check has no order route)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
