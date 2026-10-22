# Current-system audit — Local Quant Lab (2026-10-22)

**Scope.** This audit covers the repository and runtime as inspected in the build container, starting from commit `048b63d` (branch `claude/nice-fermat-510prv`).
- **Environment:** Linux x86_64, 4 vCPU, no GPU; Python 3.13.16; Node 22.22.0; Playwright 1.56 with headless Chromium 141 (WebGL in software via SwiftShader).
- **Not inspected:** the founder's MacBook and its `127.0.0.1:8765` process are not reachable from here. Findings about that machine are marked NOT VERIFIED.
- **The prompt's screen recording** (2026-10-22) was not available to any process here. Its described observations are treated as the founder's report, not as evidence.

Status vocabulary: VERIFIED (tested here), PARTIAL, NOT VERIFIED, FAILED, BLOCKED.

## Baseline before any change (exact commands, this container)

| Command | Exit | Result |
|---|---|---|
| `python3 -W error::ResourceWarning -m unittest discover -s tests -t .` | 0 | 172 tests OK (78 s) |
| `node --test web/tests/*.test.mjs` | 0 | 15 tests, 0 failures |
| `python3 scripts/verify.py` | 0 | `{'needs_human': 1, 'done_verified': 13}` |
| `python3 scripts/check_staging.py` | 0 | 0 paths staged; OK |

The prompt's historical figures (156 tests, 12 done_verified) predate the console and floor work. The re-established baseline above is the reference.

## Findings

| # | Area | Finding | Status | Evidence | Impact | Next action / closing test |
|---|---|---|---|---|---|---|
| F1 | Runtime on the Mac | The founder's screenshot of `127.0.0.1:8765` shows the 0.1.0 "LQL // CONTROL ROOM" page, two redesigns old. Two causes are likely: the local checkout never pulled the branch, and an old server still held the port. | NOT VERIFIED (screenshot only) | user screenshot, 2026-10-22; repo HEAD serves `web/index.html` "Command deck" | The founder saw old code: a static page with synchronous backtests and no job runner. | Runbook § "Run the current code" (stop the old process, pull, `make run`). Closing test: `/api/health` answers on the Mac. |
| F2 | Job runner | Jobs lived only in memory, so a restart forgot the queue and the history. The states were `done`/`failed`/`cancelled`, with no stage, no measured progress, no artifact link and no dataset hash. | FIXED → VERIFIED | `lql/jobs.py` before/after; `tests/test_jobs.py` | Results could not be traced from a job, and the history vanished on restart. | Durable jobs in `state/jobs/<id>.json`. Closing tests: `test_history_survives_a_restart_and_ids_continue`, `test_restart_marks_an_interrupted_run_failed_and_requeues_never_started_work`, ui_check "job history and artifacts survive a server restart". |
| F3 | Health | The UI showed one `SERVER UP` chip. The worker's state appeared only as `thread.is_alive()` inside System › Services. | FIXED → VERIFIED | `console.health`, `/api/health`, `#worker-chip` | "Server up" could be read as "work is happening". | Separate web, API, worker (heartbeat), queue, research-engine, data, model, last-job and last-run states. Closing tests: `test_worker_down_is_reported…`, ui_check "the worker is reported separately". |
| F4 | Worker process | The worker is a thread inside the web-server process, not a separate process. A crash of the server stops the worker. | PARTIAL (accepted, documented) | `lql/server.py` `serve()` | A server crash interrupts a running job. Recovery now marks it failed and re-queues never-started jobs. | Kept on purpose (D-018): one local process is the simplest durable design for one user. Revisit if jobs grow beyond minutes. |
| F5 | Legacy `/api/backtest` | It computed in the HTTP thread. | FIXED → VERIFIED | `lql/server.py` | Two execution paths with different evidence. | It now submits a job and waits for the worker, returning the job id. Closing test: `test_backtest_export_and_reproducible_rerun` (asserts the job id and the artifact link). |
| F6 | Data states | Data classes (synthetic/provisional/verified) were implicit. The API field `tradable` meant "passes validation", which reads as trading eligibility. | FIXED → VERIFIED | `lql/data/schema.py` `dataset_state`, `eligible`; `/api/data` `data_state`, `eligibility`, `passes_validation` | An ambiguous label could have been taken as permission to trade. | Explicit states with a use table; no state allows `real_orders`. Closing tests: `tests/test_sources.py::DataStateTests`. |
| F7 | Research gates | The critic never gives synthetic or provisional data CANDIDATE. Walk-forward fails `not_synthetic` and `price_adjustment_verified`. The holdout is single-use and refuses provisional data. A provisional forward log stays provisional. | VERIFIED (unchanged) | `lql/orchestrator/critic.py`, `lql/research/walkforward.py`, `lql/execution/forward.py`; existing tests pass | These gates protect the evidence standard. | Preserved. The frozen registration `fcc75a7c47052167` still verifies, and no holdout was spent. |
| F8 | Metrics | Calmar and benchmark-relative metrics were missing. The arithmetic tests were thin. | FIXED → VERIFIED | `lql/backtest/metrics.py` `relative`, `calmar`; hand-checked test | The report was incomplete. | Closing test: `tests/test_backtest.py::test_metrics` (Sharpe, Sortino, CAGR, Calmar, excess return and information ratio by hand). |
| F9 | Monte Carlo | Not implemented. | FIXED → VERIFIED | `lql/research/montecarlo.py`, job kind `montecarlo` | No robustness range for outcomes. | Seeded circular block bootstrap, cached artifact. Closing tests: `tests/test_jobs.py::MonteCarloTests`, ui_check MC checks. |
| F10 | Research visuals | The view showed price, equity, drawdown and split windows only. | FIXED → VERIFIED | `web/js/views/research.js`, `web/js/research-model.js` | Robustness could not be inspected. | Added: monthly heatmap, return distribution, rolling volatility and Sharpe, exposure, cost and parameter sensitivity, walk-forward folds (in-sample vs out-of-sample) with out-of-sample equity, Monte Carlo fan and ending distribution, all from persisted artifacts. Closing tests: node tests plus ui_check. |
| F11 | Chart bug | A series beginning with gaps produced an SVG path starting with `L`, which the browser rejects, so the line was blank. | FIXED → VERIFIED | `web/js/charts.js` `line()` | Rolling charts showed nothing. | Pen-up on gaps. Closing test: ui_check "no page or console errors". |
| F12 | Form state | A re-render (a job event) reset typed inputs, so a 500-path request ran as 1000. | FIXED → VERIFIED | `web/js/main.js` `render()` | The user's request was silently changed. | Edited controls are carried over by `data-k`. Closing test: ui_check "results are still there after a browser refresh" (500 paths). |
| F13 | Black-hole centrepiece | It did not exist. The floor had a hologram and a brain bound to records. | FIXED → VERIFIED | `web/js/scene/blackhole.js`, `core-state.js` | — | Event horizon and accretion disk with states IDLE/QUEUED/RUNNING/SUCCEEDED/FAILED, taken from persisted jobs only. NEEDS HUMAN blockers are listed, not animated. Closing tests: node "research core…" test, ui_check "the research core shows the running job with measured progress". |
| F14 | Neurons counter | It already maps to a persisted, defined quantity: `brain_model`, `formed = 1 - exp(-units/k)` over recorded evidence counts. It is not trading skill. | VERIFIED (kept) | `lql/console.py` `BRAIN_REGIONS`; `tests/test_console.py` | — | Operational counters were added beside it (jobs succeeded/failed/interrupted, experiments, Monte Carlo runs, walk-forward results). |
| F15 | External data | Stooq is quarantined, PROVISIONAL and key-gated. No verified real dataset exists. No Massive, FRED, BEA or SEC adapter existed. | PARTIAL / BLOCKED | `lql/data/providers.py`, `lql/data/context.py`, `scripts/import_massive.py` | Gates C–E cannot pass. | Adapters added with fixture tests. A live import needs the founder's key and network (BLOCKED here: provider hosts do not resolve from the container). See `data-source-review.md`. |
| F16 | "beatapi" key | No variable with that name, and no BEA/FRED/Massive/Alpaca key variable, exists in this container's environment (names checked, values never read). | BLOCKED (on the Mac) | `env` variable-name scan | The provider cannot be identified from here. | NEEDS_HUMAN: on the Mac, see which provider issued it. If it is a 36-character BEA UserID, store it as `BEA_API_USERID` (macro data only, never prices). |
| F17 | Engines | NautilusTrader 1.231.0 matches an independent reference exactly for next-open fills, once open trades are supplied. OpenAlgo and LEAN were not installed. | VERIFIED (POC) / DEFER | `poc/nautilus/` | — | See `compatibility-matrix.md`. |
| F18 | Ports | The app binds 127.0.0.1:8765. OpenAlgo reportedly uses 8765 for its WebSocket. No OpenAlgo process was started. | VERIFIED (app) / NOT VERIFIED (OpenAlgo) | `lql/server.py`; runbook port table | A port collision if both ever run. | Runbook port matrix: give OpenAlgo another port if it is ever evaluated. |
| F20 | Exchange calendar | Validation used a 5-calendar-day gap heuristic. It could not tell a holiday from a missing session, or catch a bar dated on a holiday (a timezone error). | FIXED → VERIFIED | `lql/data/calendar.py`; `validate(..., calendar="XNYS")` in both importers | Missing vendor sessions or shifted timestamps would pass unnoticed. | Rule-based XNYS calendar (holidays, observed days, special closures since 2000). Closing test: `tests/test_sources.py::CalendarTests` (published session counts 251/250/252 for 2022–2024). Applied at the import boundary; existing pipelines and fixtures are unchanged. |
| F19 | Performance on the Mac | Container frame rates (2–4 fps) come from the software renderer and say nothing about the M3 GPU. | NOT VERIFIED | `docs/design/verification.md` | Unknown frame rate at 1M or 2M neurons. | NEEDS_HUMAN: `make ui-check` on the Mac. |

## Root causes of the "motionless or disconnected" impression

1. **Stale code on the Mac (F1).** The page in the founder's screenshot predates the job runner, the console and the floor.
2. **Idle is drawn still on purpose.** With `0 JOBS` nothing animates, by the project's own rule against fabricated activity. With no job ever submitted, nothing moves except the labelled ambient effects.
3. **Lost history (F2).** Jobs and their state disappeared on every restart, so there was never visible history to inspect.
4. **Nothing beyond one backtest report (F9, F10).** There was no Monte Carlo and no diagnostic charts, so a finished run had little to show.

## Readiness score

The weighted score is in `docs/engineering/acceptance-matrix.md`: 58/100 before this session, 82/100 after.
