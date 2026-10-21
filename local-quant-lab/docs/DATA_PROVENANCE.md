# Data Provenance — Local Quant Lab

Every bar carries `source` and `received_at`. Every report carries a `SourceInfo` with these fields: provider, kind, description, retrieved_at, content sha256, adjustment status and terms. The UI shows the kind on every chart and in the status strip.

| Provider | Kind label | Rights / terms | Adjusted | Status in repo |
|---|---|---|---|---|
| `SyntheticProvider` (seed 7, 1,260 business days from 2019-01-02, regime-switching geometric random walk) | `DEMO_SYNTHETIC` | Generated locally; no third-party data | n/a | Used by the demo, the tests and the paper replay. **Not market data.** |
| `SnapshotProvider` (`data/snapshots/<SYM>.csv` + `.manifest.json`) | `HISTORICAL_SNAPSHOT` | Inherits from the original source | Taken from the manifest | Directory exists but is empty. The sha256 is verified on every load; a mismatch fails. |
| `StooqProvider` (`https://stooq.com/q/d/l/?s=<sym>&i=d`, free EOD CSV) | `HISTORICAL_DOWNLOADED` | Personal research use; check stooq.com terms before redistributing | Unknown (Stooq may adjust for splits and dividends) | Code present; **never run in this build** (offline tests). Failures raise `ProviderError`, which the UI and CLI show. |

## Instruments
- **Configured allowed list** (`config/settings.json`): DEMO-ETF-A, DEMO-ETF-B (synthetic), SPY, QQQ, IWM, TLT. These are liquid, unlevered ETFs.
- **No leveraged, short, options, futures or crypto instruments.** Shorting is rejected by config validation.

## Validation (`lql/data/quality.py`)
- **Blocking (data cannot be traded):** empty, wrong instrument, duplicate date, non-monotonic dates, non-positive price, invalid OHLC (including negative volume), stale versus `as_of`.
- **Flagged only:** gaps over 5 calendar days, and close-to-close moves over 15%.
- Nothing is forward-filled.
- In paper mode, a bar that fails validation locks out new orders until a valid bar arrives (`data_lockout` / `data_recovered` events).

## How to add real data (founder, on the Mac, optional)
1. Run `python3 scripts/snapshot_stooq.py SPY QQQ IWM TLT`. This writes CSV + manifest files with the retrieval time and sha256.
2. Run `python3 -m lql.cli backtest --source snapshot --instrument SPY`.
3. Record here the retrieval date, row counts, first and last dates, and any validation issues.
- Do not commit vendor data if its terms forbid redistribution. `data/snapshots/` can be git-ignored instead.

## Fixtures
- Tests build small hand-written bar series (`tests/helpers.py::bars`) and use the synthetic provider. No vendor data is in the tests.
