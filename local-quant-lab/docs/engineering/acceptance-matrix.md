# Acceptance matrix and readiness score (2026-10-22)

This score measures **project readiness**: how much of the research system is built and proven by tests in this container. It is not a prediction of trading performance, and it does not say how much code is missing. No points are given for a heading, a static mock, an untested method or a fabricated metric.

## Weighted readiness score

| Category (max) | Before (048b63d) | After | Evidence for points earned | Missing (no points) / closing test |
|---|---:|---:|---|---|
| Background jobs and orchestration (15) | 6 | **13** | Durable job files with explicit states, timestamps, request hash, correlation id, measured progress, datasets and artifacts (`tests/test_jobs.py`). Restart recovery: interrupted → failed, never-started → re-queued (test). Separate worker/queue health (test plus ui). UI shows the lifecycle and survives refresh and restart (ui). | Worker in its own process (−2): the thread design is accepted in D-018; it would close with a separate worker process plus a crash test. |
| Data integrity, provenance and eligibility (20) | 11 | **16** | Explicit data states with a backend eligibility table, where no state allows real orders (`tests/test_sources.py`). Existing gates keep synthetic and provisional data out of evidence (existing tests). Manifests with hashes, raw data kept separate, importer metadata (test). Quality checks (existing `tests/test_data.py`). XNYS session calendar at the import boundary: missing sessions are flagged, bars on holidays or weekends block (`CalendarTests`, matching the published 2022–2024 session counts). | A verified real dataset with terms reviewed (−4, BLOCKED: key and network). |
| Backtesting and simulation correctness (20) | 11 | **16** | Next-open timing, leakage probe, costs, cash and positions (existing tests). Hand-checked Sharpe, Sortino, CAGR, Calmar, excess return and information ratio, with nulls when undefined (`test_metrics`). Deterministic hashes (test). Independent engine parity with NautilusTrader: 41/41 fills, identical equity (`poc/nautilus`). | Baseline on verified historical data (Gate D, −4, BLOCKED by Gate C). |
| Statistical validation and robustness (20) | 12 | **16** | Preregistered chronological walk-forward with in-sample and out-of-sample kept apart, single-use holdout, bootstrap CI, 2× cost stress, selection stability (existing tests). Seeded, cached, reproducible Monte Carlo block bootstrap (`MonteCarloTests`). Subperiod splits (existing). | Robustness on verified real data (Gate E, −4, BLOCKED). |
| Safety and research controls (10) | 10 | **10** | No live mode or broker routes (`test_security`). Risk engine on every fill, kill switch, CSRF and Host guards, localhost-only bind (tests). Keys never logged and only reported as configured or not (tests). Holdout and preregistration unchanged (registration `fcc75a7c47052167` verifies). | — |
| Observability and persistent evidence (10) | 4 | **7** | Append-only audit events for every job transition, including interrupted and recovered jobs. Persisted jobs and artifacts. `/api/health`. Task evidence ledger (`verify.py`). | Log rotation and retention policy (−1). Health history over time (−2). |
| UI functionality, accessibility and performance (5) | 4 | **4** | All routes render. Every action is real or disabled with a reason. Keyboard, focus, reduced motion and phone checks (ui 54/54). Container measurements recorded. | Performance on the target Mac (−1, NEEDS_HUMAN). |
| **Total (100)** | **58** | **82** | | |

Sub-scores after this session:
- **Interface:** 86%. UI 4/5 plus the lifecycle shown in the UI, 2/2.
- **Data:** 80% (16/20).
- **Research engine:** 80% (32/40).
- **Operational readiness:** 80% (20/25).
- **Safety readiness:** 100% (10/10).

**Confidence:** high for everything tested here; none for the Mac runtime, which was not reachable. **Outstanding blockers:** Gate C (verified data), Mac measurements, broker choice (Gate F).

## Research readiness gates

| Gate | Criteria (master prompt §14) | State | Evidence |
|---|---|---|---|
| A: mechanical app and worker health | Separate health states; real job id; worker claims the job; artifact persisted and rendered; honest failures; survives refresh and restart; tests pass | **PASSED (container)** | `tests/test_jobs.py`, `tests/test_server.py`, ui checks: "worker reported separately", "Monte Carlo job runs in the worker…", "results are still there after a browser refresh", "job history and artifacts survive a server restart" |
| B: deterministic synthetic research | Same inputs give the same results; accounting, timing, fees, drawdown and metric tests; one invalid request; one worker-unavailable case | **PASSED** | Result hashes equal on rerun (`test_evaluate_report_reproducible_and_honest`). Monte Carlo recomputed from scratch gives identical numbers. Invalid requests refused (`test_request_validation`, the API 400 tests). `test_worker_down_is_reported…` |
| C: verified historical market data | Terms reviewed, bounded import, provenance and hashes, quality and adjustment checks | **BLOCKED** | Importer ready and fixture-tested. NEEDS_HUMAN: key, terms review, independent adjustment reference (`data-source-review.md` checklist). |
| D: reproducible historical backtest | Baseline on verified data, benchmark, costs, rerun comparison, no leakage | **BLOCKED by C** | Mechanics proven on synthetic data. |
| E: robustness and out-of-sample evidence | Walk-forward (≥5 folds), cost sensitivity, subperiods, bootstrap, no holdout tuning | **BLOCKED by C** (mechanics PASSED on synthetic data) | 5-fold synthetic study `fcc75a7c47052167`: NOT_PROVEN; holdout unspent. |
| F: paper-trading readiness | Entitlements, paper account, reconciliation, idempotency, kill switch, outage recovery | **NOT STARTED (by design)** | The SIMULATED forward log exists. No broker chosen; live trading absent. |
| G: visual and operational acceptance | Routes, real actions, graph from persisted state, black hole from telemetry, labelled synthetic data, charts from artifacts, mute and reduced motion, states exercised, accessibility, recorded performance | **PASSED (container)**, except Mac performance | ui 54/54, node 17/17, `docs/design/verification.md` |
| H: documentation and reproducibility | A new developer can launch, smoke-test, import, reproduce and inspect from the docs alone | **PARTIAL** | `docs/engineering/runbook.md`. The import step cannot be reproduced here without a key. |

**Highest completed gate: B**, with Gate A passed in the container. The system is not "research-ready": Gates C–E are blocked on verified real data.

## Engineering sign-off evidence (2026-10-23: code at `78f1b0d`, plus `scripts/runtime_check.py` added with this section)

States: **PASS** (evidence proves it), **FAIL**, **BLOCKED** (a named external action is needed), **NOT TESTED** (no evidence yet). Cloud means the Linux build container: x86_64, no GPU, Python 3.13.16 (3.14.6 for the warning check), Node 22.22.0, Chromium 141 with SwiftShader. Mac means the founder's MacBook Air M3 with 8 GB RAM. A cloud PASS is never reported as a Mac result.

### 1. Engineering readiness

| # | Requirement | Cloud | Mac | Evidence / closing action |
|---|---|---|---|---|
| E1 | Repository integrity: branch, `HEAD` = `origin` = `78f1b0d`, the six published files present | PASS | — | `git rev-list --left-right --count` = 0 0; `git show --stat 78f1b0d` lists the six files |
| E2 | Reproducible Node dependencies | PASS | NOT TESTED | `npm ci` exit 0; installed `playwright` 1.64.1 = lockfile 1.64.1; 0 vulnerabilities |
| E3 | Browser checks | PASS (54/54) | NOT TESTED | `make ui-check` exit 0. The container has no Chromium revision 1248, so it used `LQL_CHROMIUM=/opt/pw-browsers/chromium` (141.0.7390.37). The Mac uses Playwright's pinned browser: `npx playwright install chromium`, then `make ui-check`. |
| E4 | ...covering navigation, persistence, sound, reduced motion, phone layout, no-WebGL fallback, server down/reconnect | PASS | NOT TESTED | Named checks in `ui_check.json` (sound off by default; turns on and off; OS reduced motion honoured; preferences persist after reload; phone 390 px ×4; flat dial without WebGL; down, never healthy; reconnects) |
| E5 | The renderer is identified in every browser measurement | PASS | NOT TESTED | `ui_check.json` `conditions.webgl_renderer` = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)…), SwiftShader driver)"; `gpu_fps.json` `conditions.renderer` plus `software` |
| E6 | Test servers are cleaned up after success and failure | PASS | NOT TESTED | ui-check success: 0 servers left. Forced launch failure (`LQL_CHROMIUM=/nonexistent/chrome`): exit 1, 0 servers left. `runtime_check.py --simulate-failure`: exit 1, port free, temp state removed. |
| E7 | Python suite with ResourceWarning as an error | PASS (194 OK) | NOT TESTED | `python3 -W error::ResourceWarning -m unittest discover -s tests -t .` exit 0. Python 3.14.6: `tests.test_sources` 0 ResourceWarnings (the 3.14 HTTPError warning was reproduced before the fix). |
| E8 | HTTP error responses closed; 429 never retried; request spacing unchanged | PASS | NOT TESTED | `test_http_errors_stop_without_retry_and_close_the_response` (Massive 429/403/500, FRED 429/500: one request, response closed). `test_rate_limit_pagination_and_refusals` (spacing ≥ `MIN_INTERVAL_S` = 12.5 s). The diff since `b47de4c` adds only `e.close()`. |
| E9 | Task verifier | PASS | NOT TESTED | `{'needs_human': 1, 'done_verified': 13}`, exit 0 |
| E10 | Staging safety check | PASS | NOT TESTED | `check_staging.py`: OK, nothing that looks like data, logs, databases, env files or machine reports |
| R1 | Health: http, api, worker and queue reported separately | PASS | NOT TESTED | `runtime_check.py` 1: http=up, api=up, worker=up, queue=ok |
| R2 | A synthetic job is queued and executed by the worker | PASS | NOT TESTED | 2: backtest `j1` succeeded, 4/4 stages |
| R3 | Valid state transitions only | PASS | NOT TESTED | 3: events exactly queued → started → finished; created ≤ started ≤ finished; polled states only move forward |
| R4 | Artifact saved and retrievable, labelled SYNTHETIC | PASS | NOT TESTED | 4: `/api/experiment/<id>` and the file on disk. 4b: `/api/montecarlo/<id>` |
| R5 | Results survive a clean restart | PASS | NOT TESTED | 5: status, artifacts, finished_at and datasets identical after SIGTERM and restart |
| R6 | A job running at a hard kill is failed + interrupted, never succeeded | PASS | NOT TESTED | 6: SIGKILL while running → `failed`, `interrupted: true`, no artifacts |
| R7 | Queued work is re-queued per the documented rule | PASS | NOT TESTED | 7: `job_recovered` then succeeded |
| R8 | Audit log agrees with the observed transitions | PASS | NOT TESTED | 8: the interrupted job is queued, started, interrupted; the re-queued job is queued, recovered, started, finished; an extra restart adds nothing |
| R9 | No duplicate execution, no false success, ids continue | PASS | NOT TESTED | 9: one `job_started` per job; next id `j5` |
| R10 | Runtime-check servers stopped on success and failure | PASS | NOT TESTED | 10, in both modes |
| P0 | Floor frame rate on the Mac's own GPU | NOT TESTED | NOT TESTED | `make gpu-fps` on the Mac; JSON not yet received. The cloud has only SwiftShader (2–3 fps), labelled not representative. |
| P1 | Initial load: overview interactive ≤ 1.5 s; 150k brain built ≤ 0.5 s, off the main thread | PASS | NOT TESTED | ui-check `startup_to_overview_ms` 269–536; `brain_build_ms_150k` 71–150 (Web Worker) |
| P2 | Idle rendering on hardware GPU at the auto quality: p50 ≤ 16.7 ms, p95 ≤ 25 ms | NOT TESTED | NOT TESTED | `gpu_fps.json` `idle_<quality>`; the renderer must not be software |
| P3 | Rendering while a real job runs: p50 ≤ 20 ms, p95 ≤ 33 ms, max ≤ 100 ms | NOT TESTED | NOT TESTED | `gpu_fps.json` `job_running_<quality>` with `job_was_running: true` |
| P4 | Higher quality (1M, 2M): p50 ≤ 33 ms, p95 ≤ 50 ms, or auto must not select it on that machine | NOT TESTED | NOT TESTED | `gpu_fps.json` `idle_high`, `idle_ultra`. Note: `autoQuality` returns "high" (1M) for 8 cores with `deviceMemory` 8 (Chrome) and also with no `deviceMemory` (Safari), so on the 8 GB M3 Air "auto" draws 1M neurons in any browser (checked: `autoQuality({cores:8,memory:8})` = `autoQuality({cores:8,memory:null})` = "high"). If `idle_high` misses P2, this is the first evidence-supported change. |
| P5 | Fallback without WebGL works with no errors | PASS | NOT TESTED | ui-check "flat task dial" and "no page or console errors" |
| P6 | Reduced motion: no continuous redraw while idle | PASS (code) | NOT TESTED | `floor.js` `frame()`: `animating = !reducedNow`; renders only when `dirty` or something animates. Not yet measured. |
| W1 | Worker in its own process | FAIL (accepted) | — | A thread in the server process (D-018). Recovery above is proven; a server crash still stops running work. |
| H1 | `H1-hermes-mac`: local Hermes with a ≥64K-context model and a cross-session memory round trip | BLOCKED | BLOCKED | Founder action on the Mac; see § Remaining human task |

### 2. Data readiness (separate from engineering)

| Requirement | State | Evidence |
|---|---|---|
| Synthetic data is labelled and kept out of evidence | PASS | data-state eligibility tests; critic and walk-forward gates; R4 |
| XNYS calendar checks at the import boundary | PASS | `CalendarTests`; unchanged since `c59022e` |
| A verified real dataset (Gate C) | BLOCKED | Massive key, terms review and an independent adjustment reference (founder). Imports stay PROVISIONAL until `check_adjustment.py` passes. |

### 3. Demonstrated strategy validity (separate again)

| Requirement | State | Evidence |
|---|---|---|
| Any strategy shown to have an edge | NOT TESTED | No verified data (Gate C). The synthetic walk-forward `fcc75a7c47052167` is NOT_PROVEN. The holdout is unspent and the registration is unchanged. |
| Live trading | Disabled by design | No broker adapter or live route (`test_security`) |

### Remaining human task: `H1-hermes-mac`

`scripts/verify.py` marks any founder-owned seed task `needs_human`. H1's acceptance command is `python3 scripts/hermes_check.py`, which always exits 0, so its exit code proves nothing. The evidence is the fields in `state/hermes_check.json`.

Minimum action, in order. Nothing is reinstalled first.
1. `python3 scripts/hermes_check.py` makes no model calls. Read `hermes` (path or null), `hermes_version`, `hermes_memory_status` and `ram_gb`. This shows whether Hermes is already installed.
2. Only if it is installed and its configured model is usable: run `python3 scripts/hermes_check.py --memory-roundtrip`, then check that `memory_roundtrip.ok` is `true`. The nonce must appear in the recall output.
3. On an 8 GB Mac a 64K context was reported as sluggish. Do not raise the context or change the runtime to force this. The documented alternative is to leave Hermes off (`HERMES_INTEGRATION.md` step 4): the app is fully functional without it, every test passes with Hermes absent, and the fallback is logged. Closing H1 that way is the founder's decision, recorded in `DECISIONS.md`, and H1 stays BLOCKED until then.
