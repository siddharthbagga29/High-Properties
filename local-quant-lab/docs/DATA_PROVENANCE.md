# Data Provenance — Local Quant Lab

Every bar carries `source` and `received_at`. Every report carries a `SourceInfo` with these fields: provider, kind, description, retrieved_at, content sha256, adjustment status and terms. The UI shows the kind on every chart and in the status strip.

| Provider | Kind label | Rights / terms | Adjusted | Status in repo |
|---|---|---|---|---|
| `SyntheticProvider` (seed 7, 1,260 business days from 2019-01-02, regime-switching geometric random walk) | `DEMO_SYNTHETIC` | Generated locally; no third-party data | n/a | Used by the demo, the tests and the paper replay. **Not market data.** |
| `SnapshotProvider` (`data/snapshots/<SYM>.csv` + `.manifest.json`) | `HISTORICAL_SNAPSHOT` | Inherits from the original source | Taken from the manifest | Directory exists but is empty. The sha256 is verified on every load; a mismatch fails. |
| `StooqProvider` (`https://stooq.com/q/d/l/?s=<sym>&i=d`, EOD CSV) | `HISTORICAL_DOWNLOADED` | **Not verified.** stooq.com could not be reached from the audit environment, so its terms were not read. Assume personal research use only, no redistribution | **Unknown**, recorded as `unknown` | Code present; never run against the real site. Reportedly needs an API key since ~March 2026 (see below). Failures raise `ProviderError`. |
| Manual CSV (`scripts/import_csv.py`) | `HISTORICAL_DOWNLOADED` | Whatever the vendor's terms say for the file you downloaded | `unknown` unless verified | The recommended route while the Stooq key situation is unconfirmed. |

## Stooq access (audit of 2026-10-21; rests on secondary sources, primary site unreachable)
- A GitHub issue on pandas-datareader (opened 2026-04-13) reports that "As March 2026, Stooq requires an API key for data downloads": the plain CSV URL now returns an HTML page asking for a key instead of CSV. The reporter points to `https://stooq.com/q/d/?s=spy.us&get_apikey` as the place to get one.
- API directories report a CAPTCHA step to obtain the key and a daily request quota ("Exceeded the daily hits limit").
- **Not verified:** the key query-parameter name (the code uses `apikey`, a guess), the quota size, the terms of use, and whether automated downloading is permitted. Open stooq.com yourself and read its terms before using the downloader.
- **What the code does:** reads the key from `STOOQ_API_KEY` if you set it; never obtains a key, never solves a CAPTCHA, never retries, stops at the first key or quota failure, never writes the key anywhere. Without a key the earlier assumption ("no API key") is wrong and the download fails with an explicit message.

## Adjustment status (splits and distributions)
- **Cannot be determined from the code or from public documentation I could reach.** Stooq's own statement was not available. The status is therefore `unknown`, and every report built on it is marked **PROVISIONAL**.
- Why it matters: unadjusted prices omit dividends (SPY, TLT, IWM pay them; TLT's yield is large), so buy-and-hold and strategies that sit in cash are compared wrongly, and a split would look like a crash.
- Status vocabulary (`lql/data/schema.py`): `split_and_dividend_adjusted` (verified, needs recorded evidence), `adjusted_unspecified`, `split_adjusted_only`, `unadjusted`, `unknown`, `n/a` (synthetic). Only the first, with evidence, is verified.
- **How it becomes verified:** `scripts/check_adjustment.py` compares the snapshot with raw and adjusted closes you copy from an independent source on at least two old dates where they differ by more than 2%. A match to the adjusted reference at every decisive date records `split_and_dividend_adjusted` plus the evidence in the manifest (with `--write`). Anything else stays provisional. The tool cannot tell whether the references you typed are right.
- **Effects while provisional:** the critic cannot return CANDIDATE; walk-forward adds a failing `price_adjustment_verified` check and labels the report; the single-use holdout is refused; a forward log is flagged provisional (sticky) and never meets the paper-evidence criteria. A `split_suspect` data-quality flag marks close-to-close jumps that look like unadjusted splits.

## Instruments
- **Configured allowed list** (`config/settings.json`): DEMO-ETF-A, DEMO-ETF-B (synthetic), SPY, QQQ, IWM, TLT. These are liquid, unlevered ETFs.
- **No leveraged, short, options, futures or crypto instruments.** Shorting is rejected by config validation.

## Validation (`lql/data/quality.py`)
- **Blocking (data cannot be traded):** empty, wrong instrument, duplicate date, non-monotonic dates, non-positive price, invalid OHLC (including negative volume), stale versus `as_of`.
- **Flagged only:** gaps over 5 calendar days, and close-to-close moves over 15%.
- Nothing is forward-filled.
- In paper mode, a bar that fails validation locks out new orders until a valid bar arrives (`data_lockout` / `data_recovered` events).

## How to add real data (founder, on the Mac, optional)
Exact order is in `docs/MAC_NEXT_STEPS.md`. In short: import files you downloaded by hand with `scripts/import_csv.py` (or use `scripts/snapshot_stooq.py` if you hold a key and have read the terms), verify the adjustment, then research.
- Record here, by hand, the retrieval date, row counts, first/last dates, validation issues and adjustment outcome per symbol (no prices).
- **Vendor data is never committed.** `.gitignore` excludes `data/snapshots/*.csv`, the manifests, `data/snapshots/archive/`, `state/forward/` and `state/hermes_check.json`; `scripts/check_staging.py` refuses a commit that would include any of them. The repository is public.

## Fixtures
- Tests build small hand-written bar series (`tests/helpers.py::bars`) and use the synthetic provider. No vendor data is in the tests.
