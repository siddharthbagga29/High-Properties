# Data-source review (2026-10-22)

**What could be checked from here.** Official provider pages (massive.com, docs.alpaca.markets, fred.stlouisfed.org, apps.bea.gov, sec.gov, stooq.com) do **not resolve** from the build container: `curl` returns `000` and the fetch tool reports `ENOTFOUND`. A web search returned only secondary sources.
- Those secondary sources agree with the founder's review for Massive Basic: $0 tier, end-of-day data, 2 years of history, 5 calls a minute, HTTP 429 when over the limit. They also say Polygon.io was renamed Massive in October 2025 and both API hosts accept the same keys.
- Everything below that cites terms or limits is therefore the founder's 2026-10-22 official-source review (master prompt §11.5), **NOT VERIFIED by this audit**. Re-check each provider's current page before the first import (§ Founder checklist).

## Data states and what they allow (enforced in `lql/data/schema.py`)

| State | Meaning | Software tests | Simulated replay | Research run | Research evidence / CANDIDATE / holdout / forward evidence | Real orders |
|---|---|---|---|---|---|---|
| SYNTHETIC | generated fixture | yes | yes | yes | **no** | **no** |
| IMPORTED_UNVERIFIED | fetched but not yet hashed into a snapshot, or not validated | no | no | no | no | **no** |
| PROVISIONAL | real data, passes validation, split/dividend treatment unverified | yes | yes | yes | **no** | **no** |
| VERIFIED_HISTORICAL | real data, passes validation, adjustment verified with recorded evidence (`scripts/check_adjustment.py`) | yes | yes | yes | yes | **no** |
| LIVE_FEED | not supported in this build | no | no | no | no | **no** |
| REJECTED | failed validation or its hash check | no | no | no | no | **no** |

No state is eligible for real orders: there is no broker adapter and no live mode. The existing research gates already enforce the evidence columns:
- the critic never gives SYNTHETIC or PROVISIONAL data a CANDIDATE verdict;
- walk-forward checks `not_synthetic` and `price_adjustment_verified`;
- the holdout refuses provisional or synthetic registrations;
- a forward log that ever saw unverified adjustment stays provisional for good.

The API field formerly called `tradable` meant "passes blocking validation". It is now `passes_validation`. The legacy key is kept only inside stored quality reports, with a comment.

## Provenance recorded per snapshot (manifest)

Each snapshot manifest records:
- instrument, provider, kind, description, retrieval time;
- SHA-256 of the normalised CSV, checked on every read;
- row count and first/last dates;
- adjustment status and the human's adjustment evidence;
- terms note.

The Massive importer also records:
- the request (endpoint, query, number of pages) and the timestamp convention;
- SHA-256 of each raw response page, with the raw pages kept separately in `data/snapshots/raw/` (git-ignored);
- importer version, the validation report, and the data state computed after the hash exists.

## Candidates

| Source | Use here | Facts (founder's review, NOT VERIFIED here) | Adapter | Status | Limitations kept visible |
|---|---|---|---|---|---|
| Massive (formerly Polygon.io) Basic | US equity/ETF **end-of-day** history for a small universe (e.g. SPY, QQQ, IWM, TLT) | $0; all US tickers; 2 years; 5 calls/min; end-of-day (previous session available after midnight ET); corporate actions and reference data included; no current-day data on Basic | `MassiveProvider` + `scripts/import_massive.py` (key `MASSIVE_API_KEY` in an Authorization header; calls ≥12.5 s apart; stops on 429; past sessions only; New York dates; raw pages hashed) | BUILT, fixture-tested; live import **BLOCKED** (network here, key on the Mac) | `adjusted=true` is taken to mean **split-adjusted only** (no dividends), so imports are `split_adjusted_only`, i.e. PROVISIONAL until a total-return series is verified independently. Two years is short for regime tests. |
| Alpaca Basic data + Paper Only | A separately configured **paper** workflow (Gate F), IEX feed only | IEX real-time; history since 2016; 200 calls/min; 15-minute recency limit; paper orders simulated, not routed | not built (Gate F is out of scope until research gates pass) | DEFER | IEX is not consolidated; paper fills differ from live. Never combine with Massive bars unmarked. |
| FRED | Macro context (rates, inflation, employment) | API key required; show the notice "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis."; some series are third-party owned | `FredClient` (key `FRED_API_KEY`; ALFRED vintages; `as_of_values` returns only what was published by a decision date) | BUILT, fixture-tested; live **BLOCKED** | Not price data. Revised series must not be backfilled: use vintages. |
| BEA | Macro statistics | Registered 36-character UserID | `BeaClient` (key `BEA_API_USERID`, shape-checked without printing) | BUILT, fixture-tested; live **BLOCKED** | Not price data. Revisions: record retrieval dates. |
| SEC EDGAR (data.sec.gov) | Company facts for fundamentals research | No key; a descriptive User-Agent with a contact address; under 10 requests/s | `SecClient` (User-Agent from `SEC_USER_AGENT`; 0.15 s spacing; `point_in_time` keeps only facts filed by the decision date) | BUILT, fixture-tested; live **BLOCKED** | Not price data. Point-in-time use only. |
| Stooq | Historical prices, if access and terms can be established | Plain CSV now reportedly needs a key, with a CAPTCHA to obtain it; terms and adjustment unverified | existing `StooqProvider` (opt-in, `STOOQ_API_KEY`) | PROVISIONAL / quarantined | Never primary until a terms review and adjustment checks pass. |

## "beatapi" key

No such variable exists in this container (only variable names were inspected; no values were read). The provider cannot be identified from here, so this is **BLOCKED → NEEDS_HUMAN**:
- On the Mac, look at where the key was issued.
- A BEA UserID is a 36-character string from apps.bea.gov registration. If that is what it is, export it as `BEA_API_USERID`. It gives macro statistics only, never equity prices.
- If it came from another provider, store it under that provider's variable (see `lql/console.py` `PROVIDER_ENV`).
- Keys live in your shell only, never in a file in the repository.

## Founder checklist before the first real import (Gate C)

1. Read Massive's current pricing and terms page. Confirm the Basic entitlements and the personal-use and no-redistribution terms. Record the date.
2. Run `export MASSIVE_API_KEY=…`, then `python3 scripts/import_massive.py SPY QQQ IWM TLT --from <2y ago> --to <yesterday> --i-have-read-the-massive-terms`.
3. Check each manifest: `data_state` must be PROVISIONAL and `adjusted` must be `split_adjusted_only`.
4. Build or obtain a split-and-dividend-adjusted series and verify it with `scripts/check_adjustment.py` against an independent reference. Only then does a dataset become VERIFIED_HISTORICAL.
5. Run `python3 scripts/check_staging.py` before every commit. Vendor data must never enter git.
