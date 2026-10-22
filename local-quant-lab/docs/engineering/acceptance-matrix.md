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
