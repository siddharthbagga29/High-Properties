# Next steps on your Mac — safest order

Updated after the pre-market-data audit (2026-10-21). Nothing below was run in the cloud container; it needs your machine, your network, or your decision. Everything is free; the only optional credential is a Stooq API key that you obtain yourself.

**Rules for the whole session:** the repository is public. Never commit price data, forward logs, databases, `.env`, the Hermes hardware report, or a Stooq key. Before every commit run `python3 scripts/check_staging.py`; if it refuses, fix `.gitignore`, do not force. Do not run anything in step 5 or 6 until the earlier steps pass.

## 0. Baseline
```
git clone https://github.com/siddharthbagga29/High-Properties.git && cd High-Properties   # or: git pull
git checkout claude/nice-fermat-510prv && cd local-quant-lab
python3 --version                                # 3.11 or newer
python3 -m unittest discover -s tests -t .       # expect OK; the count is in docs/BUILD_STATE.md
python3 scripts/verify.py                        # expect M0 to M10 done_verified, H1 needs_human
python3 scripts/check_staging.py                 # expect: OK, nothing sensitive
```
If any test fails on macOS, stop and send me the output (the code has only run on Linux).

## 0b. Run the current code and identify your keys (2026-10-22)
1. Follow `docs/engineering/runbook.md` § "Run the current code on the Mac". Your screenshot showed the old 0.1.0 page.
2. Your "beatapi" key: check where it was issued.
   - If it is a 36-character BEA UserID, run `export BEA_API_USERID=…`. It gives macro statistics only, never prices.
   - Otherwise store it under its provider's variable: `MASSIVE_API_KEY`, `FRED_API_KEY`, `ALPACA_PAPER_KEY_ID`, or `STOOQ_API_KEY`.
   - Never put a key in a file in the repository. System › Health shows which variables are set.
3. Preferred price source for a first test: Massive Basic end-of-day. See `docs/audit/data-source-review.md` § Founder checklist.

## 1. Decide how to get the prices (your decision; I could not read Stooq's terms)
1. Open `https://stooq.com` in your browser and read its terms. Decide whether your use (private research, no redistribution) is allowed.
2. **Preferred, no automation:** download the daily CSV for SPY, QQQ, IWM and TLT in your browser (handle any login or CAPTCHA yourself), then:
```
python3 scripts/import_csv.py SPY ~/Downloads/spy_us_d.csv --source "Stooq website, manual download <date>"
python3 scripts/import_csv.py QQQ ... ; python3 scripts/import_csv.py IWM ... ; python3 scripts/import_csv.py TLT ...
```
3. **Alternative, scripted:** only if Stooq gives you an API key and you are comfortable with automated requests (reported key page: `https://stooq.com/q/d/?s=spy.us&get_apikey`; reported by third parties, unverified):
```
export STOOQ_API_KEY=...          # this shell only; never a file in git
python3 scripts/snapshot_stooq.py --i-have-read-the-stooq-terms SPY QQQ IWM TLT
```
It stops at the first failure and never retries. If it says Stooq returned a web page, that is the key requirement; the parameter name (`apikey`) is unconfirmed, so it may need a code change, in which case send me the message, not the key.
4. Read the printed line for each symbol: rows, first/last date, `tradable`, issue counts. Stop if `tradable=False`. Note any `split_suspect` count: that means the series may be unadjusted for splits.
5. `python3 scripts/check_staging.py` again: the CSVs and manifests must not appear.

## 2. Verify the price adjustment (the audit's key finding: it is unverified)
Find, in an **independent source** (the ETF issuer's site or another data site, not Stooq), the raw closing price and the adjusted/total-return closing price for each symbol on **two old dates** (for example 2008-03-14 and 2012-06-01) where they differ by more than 2%. Then:
```
python3 scripts/check_adjustment.py SPY --ref 2008-03-14:<RAW>:<ADJ> --ref 2012-06-01:<RAW>:<ADJ>
python3 scripts/check_adjustment.py SPY --ref ... --ref ... --write      # records the outcome in the manifest
```
Repeat for QQQ, IWM and TLT. Outcomes: `split_and_dividend_adjusted` (verified), `unadjusted` (prices exclude dividends: usable only as clearly price-only research), or `unknown`. Anything but verified stays **PROVISIONAL**. Do not edit manifests by hand.

## 3. Hermes (independent of the data; do it any time)
Follow `docs/HERMES_INTEGRATION.md`. In short: `python3 scripts/hermes_check.py`, install Hermes, `hermes model` (Local models, at least 64K context), `python3 scripts/hermes_check.py --memory-roundtrip`, `python3 -m lql.cli hermes`. `state/hermes_check.json` lists your hardware and paths: it is git-ignored now. **Do not commit it**; write only a summary (chip, RAM, whether the round trip passed) in BUILD_STATE.

## 4. Pipeline smoke test on the real files (provisional is allowed here, evidence is not)
```
python3 -m lql.cli research run --source snapshot --instruments SPY,QQQ,IWM,TLT --start 2005-01-03 --name wf-real-1
```
Read `evidence_label` first. While any symbol is unverified it says PROVISIONAL, the check `price_adjustment_verified` fails, the verdict cannot be CANDIDATE, and `research holdout` refuses. The pre-registration it writes (`state/research/prereg/<hash>.json`) holds no prices and may be committed after `check_staging.py`.
If you verified all four symbols in step 2, run the same command with a new `--name wf-real-2`: the attestation changes the study hash, so it is a separate pre-registration. Choose the name before you look at any result.

## 5. Spend the holdout once (only with verified data and a NOT_PROVEN walk-forward)
```
python3 -m lql.cli research holdout --source snapshot --instruments SPY,QQQ,IWM,TLT --start 2005-01-03 --name wf-real-2 --spec <spec_hash>
```
It cannot be repeated for the same data. A result of CANDIDATE means "survived every pre-registered check", still a hypothesis. Commit `state/research/holdout_registry.json` (no prices) after `check_staging.py`.

## 6. Start the forward paper log (only after step 2 is verified for all four)
Choose strategy and parameters now; they cannot change in an existing log.
```
python3 -m lql.cli forward run --source snapshot --mode FORWARD --instruments SPY,QQQ,IWM,TLT   # day 0: warm-up only
python3 -m lql.cli forward report --source snapshot --mode FORWARD --instruments SPY,QQQ,IWM,TLT
```
A log started on provisional data is flagged PROVISIONAL permanently and can never meet the evidence criteria; start a new log after verification instead. To schedule `scripts/forward_daily.sh` (launchd example in `docs/FORWARD_PAPER.md`), export `LQL_STOOQ_TERMS_OK=yes` only after reading the terms, and note that it needs a working download route (a key) every day; if you only import by hand, run `forward run` yourself after each manual import. Logs live in `state/forward/` and are git-ignored.

## What I will not do
Enable live trading, add a broker, add paid services, bypass Stooq's key, CAPTCHA or quota, or change a risk limit.
