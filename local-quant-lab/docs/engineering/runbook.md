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
make test                       # 190 Python tests
make test-js                    # 17 node tests
python3 scripts/verify.py       # 13 done_verified, H1 needs_human
python3 -m lql.server --port 8766 --state-dir /tmp/lql-demo &   # throwaway state, separate port
H='-H Host:127.0.0.1:8766 -H Content-Type:application/json -H X-LQL-Request:1'
curl -s $H -d '{"kind":"backtest","params":{"instrument":"DEMO-ETF-A","strategy":"sma_trend","source":"synthetic","params":{}}}' http://127.0.0.1:8766/api/jobs
curl -s -H Host:127.0.0.1:8766 http://127.0.0.1:8766/api/jobs/j1        # status, stage, progress, artifacts
curl -s $H -d '{"kind":"montecarlo","params":{"experiment":"<id from artifacts>","paths":1000,"block":20,"seed":7}}' http://127.0.0.1:8766/api/jobs
```
Restart the server and fetch `/api/jobs` again. The jobs, and their links to `state/experiments` and `state/montecarlo`, are still there. A job that was running at shutdown shows `failed` with `interrupted: true`.

The browser checks (`make ui-check`) run all of this, plus the UI, against a temporary state directory.

## Where results live (all git-ignored)

| Path | What |
|---|---|
| `state/jobs/j<N>.json` | every job: state, stage, progress, timestamps, request hash, datasets, artifacts, error, log tail |
| `state/experiments/<hash>.json` | backtest artifacts (report, critic verdict, dataset state and hash) |
| `state/montecarlo/<hash>.json` | Monte Carlo artifacts (method, seed, paths, block, percentiles, fan, histogram, assumptions) |
| `state/research/` | frozen walk-forward registrations, results, holdout registry (CLI only) |
| `state/events.jsonl` | append-only audit log |
| `data/snapshots/` | imported price snapshots, manifests and raw responses |
| `data/context/` | FRED, BEA and SEC context datasets |

## Import historical data (founder, on the Mac)

Follow `docs/audit/data-source-review.md` § Founder checklist. Imports stay PROVISIONAL until `scripts/check_adjustment.py` verifies the adjustment.

## Shut down

Press Ctrl+C in the `make run` terminal. A job that is running at that moment is recorded as failed (interrupted) at the next start. Queued jobs are re-queued at the next start.
