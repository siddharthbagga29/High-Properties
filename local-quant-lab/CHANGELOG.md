# Changelog

## Unreleased (CTO recovery: durable jobs, data states, Monte Carlo, research core, 2026-10-22)
- **Durable jobs (D-018).**
  - Every job persists in `state/jobs/` with explicit states (queued, running, succeeded, failed, cancelled), request hash, measured progress, dataset hashes and artifact links.
  - On restart a running job is marked failed (interrupted) and a never-started one is re-queued.
  - `/api/backtest` now runs through the worker. New routes: `/api/jobs/<id>`, `/api/health`, `/api/montecarlo[/<id>]`.
- **Separate health states.** Web server, API, worker heartbeat, queue, research engine, data sources, model providers and last runs are each reported. A WORKER chip sits next to SERVER; System has a health table.
- **Data states (D-019).** SYNTHETIC, IMPORTED_UNVERIFIED, PROVISIONAL, VERIFIED_HISTORICAL, LIVE_FEED (unsupported) and REJECTED, with a backend eligibility table. No state allows real orders. `tradable` became `passes_validation`.
- **Data adapters.**
  - `MassiveProvider` + `scripts/import_massive.py`: end-of-day, key in a header, 5 calls/min, raw pages hashed, PROVISIONAL.
  - FRED, BEA and SEC context clients with point-in-time helpers (`lql/data/context.py`).
  - All fixture-tested. Live use needs the founder's keys.
- **Exchange calendar.** A rule-based XNYS session calendar checked at import: missing sessions are flagged and bars on holidays block (matches the published 2022–2024 session counts).
- **Metrics.** Calmar; benchmark-relative excess return, information ratio and tracking error; hand-checked arithmetic tests.
- **Monte Carlo.** Seeded circular block bootstrap of an experiment's net daily returns as a background job, with a cached artifact. It reports percentiles, drawdown probabilities, a fan and an ending distribution.
- **Research charts from persisted artifacts.** Monthly heatmap, return distribution, rolling volatility and Sharpe, exposure, cost and parameter sensitivity, walk-forward folds (in-sample vs out-of-sample) with out-of-sample equity, Monte Carlo fan and distribution.
- **Research core (D-021).** A black hole on the floor whose states come only from persisted jobs. The HUD shows its state with measured progress, NEEDS HUMAN blockers and operational counters.
- **NautilusTrader POC (D-020).** Exact parity with an independent reference given open trades. Decision: DEFER. OpenAlgo and LEAN deferred.
- **Fixes.**
  - Line charts starting with gaps drew nothing.
  - A re-render reset typed form values, so a 500-path request ran as 1000.
- **Docs.** `docs/audit/` (current-system audit, compatibility matrix, data-source review) and `docs/engineering/` (DAG, acceptance matrix with readiness score 58 → 82/100, runbook).
- **Tests.** 192 Python, 17 node, 54/54 browser checks.

## Unreleased (the trading floor, 2026-10-22)
- **Overview centre rebuilt as a 3D trading floor** in the Perspective Engine city style (D-017).
  - The supervisor is a holographic bust on the central podium with the brain inside its head. Its chest core dispatches the real job queue to nine trading desks: engineer, reviewer, critic, research and data on the left; risk, paper, Hermes and the founder's human seat on the right.
  - Each desk has a bot, three monitors drawn from real records (task and result, metrics, activity log), privacy glass, a keyboard and a nameplate.
  - Desk callouts at the stage edges show each desk's task, two metrics and last result, with leader lines to the desk.
- **Brain of 150k to 2M neurons** (Web Worker build; "auto" picks 1M on an 8-core, 8 GB Mac). Neurons form only from recorded, verified work (`brain_model`: `formed = 1 - exp(-units/k)` per region).
  - A finished job streams particles from its desk into its region, and the new neurons flash.
  - The EDGE core (20%) stays dark without a proven edge.
- **Path to Ultron:**
  - The brain has six stages: SEED, FORMING, LEARNING, SKILLED, PROVEN EDGE, ULTRON. The last two are gated on a proven edge.
  - The hologram's face is a blank mask until then. It gains eyes, then brow and nose, then a mouth, as the EDGE region forms.
- **Motion is tied to real events.** Dispatch beams, typing bots, completion beams (green done, rose failed) and neuron streams are driven by real jobs and records. Ambient shimmer, scanlines and ticker scroll are labelled in System › What moves and why. Without WebGL the flat SVG dial is shown.
- **three.js r180 vendored** in `web/vendor/three/` (MIT, SHA-256 pinned and tested, loaded only by the Overview). `/api/overview` gains `brain` and `desks`, and the role set gains research and paper.
- **Fixes:** the 3D wall ticker no longer reads mirrored; phone overview no longer scrolls sideways (footer chips and module rows wrap).
- **Tests:**
  - Python: brain model, stages, desks, job-to-desk assignment and the vendored-file pin.
  - Node: brain, bust and floor geometry; growth detection; preferences.
  - `ui_check` now runs 48 browser checks: floor, desks, growth after a real backtest, the face stays blank, the stage HUD and the no-WebGL fallback.

## Unreleased (Perspective Engine console, 2026-10-21)
- **New console** replacing the single-page control room: ticker with safety posture, seven workspaces (Overview, Agent graph, Data, Research, Paper, Logs, System), command palette, activity drawer, toasts, confirmation dialogs. Plain ES modules and SVG; no dependencies, no build, no remote assets.
- **Overview "command deck":** eight role cards (supervisor, engineer, reviewer, founder, critic, risk, data, Hermes) from real state; an orchestration dial that draws the real task graph on a perspective plane; human decisions; risk guards against limits; decision trace; the frozen research protocol with pass/fail marks.
- **Agent graph:** layered DAG with zoom/pan, filters, search, keyboard navigation, upstream/downstream highlight and an inspector with evidence, history and job output.
- **Background jobs** (`lql/jobs.py`): one worker, bounded queue; `recheck` (re-run a task's acceptance tests, never changes its status, failure = `acceptance_regression`) and `backtest`; cancel; audit events per transition.
- **Read models** (`lql/console.py`) and routes `/api/overview|graph|data|data/series|research|forward|system|jobs|pulse`, `POST /api/jobs`, `/api/jobs/cancel`. Walk-forward, holdout and forward logs remain CLI-only.
- **Motion and sound:** animation only for running jobs and new events; reduced motion (OS and setting); WebAudio cues off by default, rate-limited, optional hum.
- Server `--state-dir`; cached Hermes health; honest data posture label; offline state greys stale values.
- Tests: `tests/test_console.py`, `web/tests/units.test.mjs`, `scripts/ui_check.mjs` (35 browser checks + measurements). Docs in `docs/design/`.

## Unreleased (pre-market-data audit, 2026-10-21)
- **Stooq access:** the "no API key" assumption is reported outdated (March 2026 onward, secondary sources). The provider now reads `STOOQ_API_KEY` if you set one, never obtains one, never retries, stops at the first key/quota failure, and never writes or echoes the key. `snapshot_stooq.py` needs `--i-have-read-the-stooq-terms`; `forward_daily.sh` needs `LQL_STOOQ_TERMS_OK=yes`.
- **Adjustment status:** new vocabulary and `PROVISIONAL` label. Unverified real data cannot yield a critic CANDIDATE, adds a failing `price_adjustment_verified` check to walk-forward, blocks the single-use holdout, and marks forward logs provisional for good. New `scripts/check_adjustment.py` (independent-reference verification) and `scripts/import_csv.py` (manual download route); `split_suspect` data-quality flag.
- **Repository hygiene:** `.gitignore` now excludes vendor CSVs, manifests, snapshot archives, `state/forward/`, `state/hermes_check.json`; `scripts/check_staging.py` refuses a commit containing them; key patterns added to the secret scanner. MAC steps no longer tell you to commit the Hermes report or snapshots.
- Frozen protocol untouched: the committed synthetic registration still verifies (tested); no holdout registry exists; no real-data study was run.

## Engineering session 2, 2026-10-21
- **Portfolio backtester** (`lql/backtest/portfolio.py`): shared cash, several instruments, union calendar, explicit stale/missing-data handling (no forward fill, orders are never carried across a gap), fill-price clamp to the bar range, volume participation cap, cash reserved across same-day orders, risk engine sees the whole portfolio. Reproduces the single-instrument engine exactly when given one instrument (tested).
- **Second strategy** `vol_scaled_trend` (trend filter plus volatility targeting) with explicit assumptions; strategy module is AST-tested to import nothing that can trade.
- **Pre-registered walk-forward research** (`lql/research/`): frozen spec + data fingerprint, strictly chronological rolling folds, in-sample-only selection, separate in/out-of-sample reporting, paired block-bootstrap intervals, 2x-cost stress, selection stability, one-shot holdout with a contamination registry. CLI: `python3 -m lql.cli research run|holdout|show`.
- **Paper forward log** (`lql/execution/forward.py`): multi-instrument, restartable, idempotent passes; append-only journal rebuilt from the ledger; evidence classes (synthetic/real x replay/forward) that cannot be mixed; per-instrument data lockout; stale-data and incomplete-session handling; kill switch; report with the paper-evidence criteria. CLI `forward run|report|kill|release`, `scripts/forward_daily.sh`, `docs/FORWARD_PAPER.md`.
- Ledger marks use the last known price per instrument; skill safety gate also forbids tampering with the holdout, ledger, forward log, pre-registration and acceptance criteria.
- New docs: `docs/FORWARD_PAPER.md`, `docs/MAC_NEXT_STEPS.md`; decisions D-011 to D-014; research-ledger entry H-002.
- Fixed the unclosed-file ResourceWarning in `tests/test_hermes.py`.

## 0.1.0 — 2026-10-21
- **Offline control room** at http://127.0.0.1:8765. It shows:
  - a status strip: mode, data kind, broker, paper clock, kill switch, feed, ledger and Hermes
  - experiment metrics and critic verdict
  - an event-flow map
  - price with fills, equity (net / gross / capped buy-and-hold), drawdown and exposure
  - robustness tables, data quality, the paper ledger, fills, the audit stream and the task ledger
  - CSV and JSON export
- **Deterministic backtester:** next-open fills with spread, slippage and commission; splits; cost and parameter sensitivity; reproducibility hashes.
- **Risk engine:** every master-prompt limit, fail-closed, kill switch, per-strategy disable, audit events.
- **SIMULATED paper session** with a SQLite ledger, idempotent orders, restart recovery, reconciliation and data lockout.
- **Optional Hermes Agent adapter** with a schema-checked, untrusted, logged deterministic fallback.
- **Skill learning:** frozen regression set, safety gate, promote, reject and rollback.
- **Portable, secret-scanned context export.**
- No live trading, no broker connection, no paid services.
