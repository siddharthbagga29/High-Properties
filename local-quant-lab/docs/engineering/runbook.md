# Runbook — Local Quant Lab (2026-10-22)

## Run the current code on the Mac

```bash
lsof -nP -iTCP:8765 -sTCP:LISTEN          # who owns the port? (an old control room keeps serving old pages)
kill <pid>                                 # only if it is a Local Quant Lab server you started earlier
cd ~/High-Properties && git status          # commit or stash your own changes first; nothing here resets them
git checkout claude/nice-fermat-510prv && git pull origin claude/nice-fermat-510prv
cd local-quant-lab && make run              # http://127.0.0.1:8765 ; Ctrl+C stops it
curl -s -H "Host: 127.0.0.1:8765" http://127.0.0.1:8765/api/health   # web, API, worker, queue... reported separately
```
If you don't know where your clone is, a fresh one works: `git clone -b claude/nice-fermat-510prv https://github.com/siddharthbagga29/High-Properties.git`.

## Port matrix

| Service | Bind | Port | Notes |
|---|---|---|---|
| Local Quant Lab control room (web, API and job worker in one process) | 127.0.0.1 | 8765 | refuses to bind anything but localhost |
| Ollama (optional) | 127.0.0.1 | 11434 | probed only, never exposed |
| OpenAlgo (not installed) | — | its docs say a WebSocket on **8765** and REST on 5000 | if ever evaluated, move it to an unused port (for example 18765) and keep live routes disabled |

Never expose any of these to the internet. For a future HP host, use a private network or VPN with firewall rules.

## Smoke test: one synthetic experiment end to end (Gate A)

```bash
make test                       # 192 Python tests
make test-js                    # 17 node tests
python3 scripts/verify.py       # 13 done_verified, H1 needs_human
make runtime-check              # server/worker lifecycle, clean restart, hard-kill recovery (temp state, free port)
python3 -m lql.server --port 8766 --state-dir /tmp/lql-demo &   # throwaway state, separate port
H='-H Host:127.0.0.1:8766 -H Content-Type:application/json -H X-LQL-Request:1'
curl -s $H -d '{"kind":"backtest","params":{"instrument":"DEMO-ETF-A","strategy":"sma_trend","source":"synthetic","params":{}}}' http://127.0.0.1:8766/api/jobs
curl -s -H Host:127.0.0.1:8766 http://127.0.0.1:8766/api/jobs/j1        # status, stage, progress, artifacts
curl -s $H -d '{"kind":"montecarlo","params":{"experiment":"<id from artifacts>","paths":1000,"block":20,"seed":7}}' http://127.0.0.1:8766/api/jobs
```
Restart the server and fetch `/api/jobs` again. The jobs, and their links to `state/experiments` and `state/montecarlo`, are still there. A job that was running at shutdown shows `failed` with `interrupted: true`.

The browser checks (`make ui-check`) run all of this, plus the UI, against a temporary state directory.

## Credentials file (optional)

Scripts and the server read keys from environment variables only.
- **What the loader reads:** `lql/envfile.py` can fill those variables from one file: `$LQL_ENV_FILE`, else `~/.config/lql/env` (preferred, outside the repository), else the repository's `.env`.
- **Allowed names:** only the names in `.env.example`. A value already set in your shell, such as the Keychain one, wins.
- **Permissions:** a file other users can read is refused until you run `chmod 600`.
- **Git:** every `.env` is git-ignored at the repository root and in `local-quant-lab/`.

Check it, and Massive, without printing any key: `python3 scripts/check_connectivity.py --signals`.

**Alpaca paper account: a read-only check by hand.** Broker hosts are kept out of the code on purpose (`tests/test_security.py`). This command only reads the account:
```bash
set -a; . ~/HP-floor/.env; set +a
printf 'APCA-API-KEY-ID: %s\nAPCA-API-SECRET-KEY: %s\n' "${ALPACA_PAPER_KEY_ID:-$APCA_API_KEY_ID}" "${ALPACA_PAPER_SECRET_KEY:-$APCA_API_SECRET_KEY}" \
 | curl -s -H @- https://paper-api.alpaca.markets/v2/account \
 | python3 -c "import sys,json;a=json.load(sys.stdin);print({k:a.get(k) for k in ('status','currency','trading_blocked','account_blocked')}, 'PAPER' if str(a.get('account_number','')).startswith('PA') else 'NOT A PAPER ACCOUNT', a.get('message',''))"
unset ALPACA_PAPER_KEY_ID ALPACA_PAPER_SECRET_KEY APCA_API_KEY_ID APCA_API_SECRET_KEY MASSIVE_API_KEY
```

## Scheduled daily pass (no Hermes, no language model)

`scripts/daily_run.py` runs one pass and writes `state/reports/daily/<date>.json`. It also writes a `scheduled_run` event, shown in Logs, and the jobs appear in the job history:
1. **data** (`--refresh-data`): Massive end-of-day import for `--symbols` (default SPY, QQQ, IWM, TLT). Imports stay PROVISIONAL.
2. **research:** two strategies × each instrument, then a seeded Monte Carlo on each. It uses default parameters, so nothing is ever tuned, and an unchanged dataset gives cached results.
3. **forward** (`--forward`): one SIMULATED forward paper pass. It needs a snapshot for every symbol.
4. **report.**

A step that cannot run is recorded as `skipped` with the reason. The exit code is 0 (ok), 1 (a step failed) or 3 (another pass is running). If the control room is running, jobs go through it and you can watch them live.

Try it once by hand: `make daily`, or `python3 scripts/daily_run.py --refresh-data --forward` once the key is set.

**The key lives in the Keychain, never in a file.** Store it once with `security add-generic-password -s lql-massive -a "$USER" -w`; it prompts for the value, which keeps it out of your shell history.

**launchd job.** It runs every day at 07:00 local time, after Massive publishes the previous session. If the Mac was asleep, it runs on wake. Save the following as `~/Library/LaunchAgents/com.localquantlab.daily.plist`, replace `/ABSOLUTE/PATH`, then run `launchctl load ~/Library/LaunchAgents/com.localquantlab.daily.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.localquantlab.daily</string>
  <key>ProgramArguments</key><array>
    <string>/bin/sh</string><string>-c</string>
    <string>cd /ABSOLUTE/PATH/local-quant-lab &amp;&amp; MASSIVE_API_KEY="$(security find-generic-password -s lql-massive -w)" LQL_MASSIVE_TERMS_OK=yes /usr/bin/python3 scripts/daily_run.py --refresh-data --forward</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/tmp/localquantlab-daily.log</string>
  <key>StandardErrorPath</key><string>/tmp/localquantlab-daily.log</string>
</dict></plist>
```
- **Run it now:** `launchctl start com.localquantlab.daily`.
- **Stop it:** `launchctl unload ~/Library/LaunchAgents/com.localquantlab.daily.plist`.
- **cron instead:** cron skips any run while the Mac is asleep. The crontab line is `0 7 * * * cd /ABSOLUTE/PATH/local-quant-lab && /usr/bin/python3 scripts/daily_run.py >> /tmp/localquantlab-daily.log 2>&1`. Add the Keychain prefix above for `--refresh-data`.
- **Older script:** `scripts/forward_daily.sh` uses Stooq, which is quarantined. It is kept for reference; `daily_run.py` replaces it.

## Where results live (all git-ignored)

| Path | What |
|---|---|
| `state/jobs/j<N>.json` | every job: state, stage, progress, timestamps, request hash, datasets, artifacts, error, log tail |
| `state/experiments/<hash>.json` | backtest artifacts (report, critic verdict, dataset state and hash) |
| `state/montecarlo/<hash>.json` | Monte Carlo artifacts (method, seed, paths, block, percentiles, fan, histogram, assumptions) |
| `state/research/` | frozen walk-forward registrations, results, holdout registry (CLI only) |
| `state/events.jsonl` | append-only audit log |
| `state/reports/daily/` | one report per scheduled pass (`latest.json` = the most recent) |
| `data/snapshots/` | imported price snapshots, manifests and raw responses |
| `data/context/` | FRED, BEA and SEC context datasets |

## Import historical data (founder, on the Mac)

Follow `docs/audit/data-source-review.md` § Founder checklist. Imports stay PROVISIONAL until `scripts/check_adjustment.py` verifies the adjustment.

## Shut down

Press Ctrl+C in the `make run` terminal. A job that is running at that moment is recorded as failed (interrupted) at the next start. Queued jobs are re-queued at the next start.
