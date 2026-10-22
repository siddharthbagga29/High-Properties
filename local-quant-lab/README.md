# Local Quant Lab

A local research, backtesting, risk and **simulated** paper-trading lab, with a localhost control room.

- It is a research prototype and is not compliance-certified.
- There is **no live trading** in this build: no live mode, no broker connection, no paid services, no API keys.
- Every strategy result is `alpha_status: unproven` until real out-of-sample and paper evidence exists.

## Install and run (macOS or Linux, Python ≥ 3.11, standard library only)
```bash
cd local-quant-lab
make test      # 66 offline tests (or: python3 -m unittest discover -s tests -t .)
make demo      # two synthetic backtests + 300 simulated paper sessions
make run       # control room on http://127.0.0.1:8765 (localhost only; Ctrl+C to stop)
make verify    # supervisor runs each milestone's tests and records evidence in state/current_state.json
make export    # secret-scanned context bundle in exports/
```
There is nothing to `pip install`. Without `make`, use the Python commands shown in the `Makefile`.

## Architecture
```
data (synthetic | hashed CSV snapshot | optional Stooq)
  -> validation (schema, ordering, duplicates, OHLC, staleness)  [lql/data]
  -> strategy (sees past bars only)                              [lql/strategies]
  -> sizing from hard limits -> RiskEngine.check (deterministic, fail-closed)  [lql/risk]
  -> simulator fill at next open with costs -> SQLite ledger -> reconcile  [lql/backtest, lql/execution]
  -> audit events (state/events.jsonl) -> Lab facade -> localhost API -> web UI  [lql/lab.py, lql/server.py, web/]

research plane (async, advisory only): task graph + supervisor + deterministic critic [lql/orchestrator],
Hermes adapter with deterministic fallback [lql/agents], skill learning with frozen regressions [lql/learning]
```
- No LLM sits in the signal-to-order path.
- Hermes cannot reach orders, the ledger or the risk limits. Tests enforce this.
- Agents may only *tighten* limits, through `config.tighten`. A human edits `config/settings.json`.

## Using it
- **UI:**
  - Run a backtest: pick an instrument, strategy and parameters.
  - Choose an experiment and export it to CSV or JSON.
  - Step the paper replay.
  - Inject a corrupt bar to see the data lockout.
  - Engage the kill switch; releasing it needs a named person.
- **Console:** `make run`, then open http://127.0.0.1:8765. Keys 1–7 switch workspaces, ⌘K/Ctrl+K opens the command palette, S toggles sound (off by default), M toggles reduced motion. Use `python3 -m lql.server --state-dir /tmp/demo` to look around without touching `state/`. Design and verification: `docs/design/`.
- **The floor (Overview):** a 3D trading floor. One supervisor dispatches real jobs to nine desks, and each desk's monitors show that role's real task, metrics and result. Above them is a brain whose neurons form only from recorded, verified work. Neurons are **not** a measure of trading skill: the EDGE core stays dark until a CANDIDATE on verified real data exists. Drag to orbit, scroll to zoom, and click a desk or the brain for its record. Pick 150k to 2M neurons in "Neurons" (auto picks from your machine). Without WebGL you get a flat task dial. three.js is vendored in `web/vendor/three/` (MIT, pinned by hash; see D-017).
- **Jobs and health:** every backtest and Monte Carlo run is a background job, persisted in `state/jobs/` and recovered after a restart. `/api/health` (and System › Health) reports the web server, worker, queue, data and models separately. See `docs/engineering/runbook.md` for ports, the smoke test and shutdown.
- **Monte Carlo:** in Research, queue a seeded block bootstrap of any experiment (paths, block length, seed). The fan and distribution are drawn from the saved artifact. It is not a forecast.
- **Readiness:** `docs/engineering/acceptance-matrix.md` (score and gates), `docs/audit/` (audit, data sources, engine compatibility).
- **Front-end checks:** `make test-js` (node unit tests) and `make ui-check` (Playwright browser checks against a temp synthetic state).
- **CLI:** `python3 -m lql.cli {backtest,paper,research,forward,kill,release,status,demo,export,seed-tasks,tasks,skills,hermes}`
- **Portfolio research:** `python3 -m lql.cli research run --instruments SPY,QQQ,IWM,TLT --source snapshot --start YYYY-MM-DD --name my-study` freezes a walk-forward spec and runs it; `research holdout --spec HASH` spends the untouched holdout once. See `docs/MAC_NEXT_STEPS.md`.
- **Paper forward log:** `python3 -m lql.cli forward run|report|kill|release`. See `docs/FORWARD_PAPER.md` for scheduling and limits.
- **Massive end-of-day (optional, on your machine):** `export MASSIVE_API_KEY=…` then `python3 scripts/import_massive.py SPY QQQ IWM TLT --from … --to … --i-have-read-the-massive-terms`. Imports are PROVISIONAL (split-adjusted only) until verified. FRED, BEA and SEC context clients are in `lql/data/context.py` (keys from `FRED_API_KEY`, `BEA_API_USERID`, `SEC_USER_AGENT`).
- **Real data (optional, on your machine):** follow `docs/MAC_NEXT_STEPS.md`: import files you downloaded by hand with `scripts/import_csv.py` (Stooq reportedly needs an API key now), verify the price adjustment with `scripts/check_adjustment.py`, and run `scripts/check_staging.py` before every commit. Unverified data is labelled PROVISIONAL and cannot count as evidence. See `docs/DATA_PROVENANCE.md`.
- **Hermes (optional):** see `docs/HERMES_INTEGRATION.md`. Local model only, no subscription. The app works fully without it.

## How results are judged
- Fills happen at the next open: half-spread 2 bps + slippage 3 bps, plus a commission of $0.005 per share with a $1 minimum.
- Reports include:
  - gross versus net results, and a benchmark (buy-and-hold under the same caps);
  - 60/20/20 time windows;
  - cost sensitivity at 0/1/2/4×, and a parameter grid on train+validation only;
  - VaR and CVaR, turnover, and win/loss statistics;
  - config and result hashes.
- **Critic checks:**
  - It recomputes metrics from the equity series and checks fill timing.
  - It probes for look-ahead.
  - It labels synthetic, thin or fragile results NOT_PROVEN.
  - It labels a losing test window or any integrity defect REJECTED.

**Not modelled:** queue position, partial and auction fills, non-linear impact, borrow, dividends on synthetic data, taxes, and intraday prices.

## Risks and limitations
- The data is synthetic until you add snapshots. Synthetic results say nothing about markets.
- `lql.cli backtest` is still single-instrument; portfolio backtests, walk-forward studies and the forward log work on several instruments (`lql/backtest/portfolio.py`, `lql/research/`, `lql/execution/forward.py`). The universe is small daily ETFs; there is no HFT or market-making capability, and none is claimed.
- `BROKER_PAPER` is a placeholder that refuses to start. Live trading would need a separate review of broker agreements, market-access rules and explicit founder approval.

## Troubleshooting
- **`settings invalid`:** `config/settings.json` failed validation. Everything that trades is disabled. Read the message and fix the field.
- **`paper ledger is bound to …`:** archive it with `POST /api/paper/archive {"confirm":"archive"}`. It is renamed, not deleted.
- **Port in use:** `python3 -m lql.server --port 8877`.
- **Hermes shows `OFF · FALLBACK`:** expected until Hermes is installed. See `docs/HERMES_INTEGRATION.md`.

## Project files
- **Start here:** `PROJECT_CONTEXT.md` and `docs/BUILD_STATE.md`.
- **Living docs:** `docs/{DECISIONS,BUILD_LOG,ACCEPTANCE_CHECKLIST,RESEARCH_LEDGER,DATA_PROVENANCE,HERMES_INTEGRATION,FORWARD_PAPER,MAC_NEXT_STEPS}.md`, `CHANGELOG.md`, `agent_learning/README.md`.
- **The brief:** `project-brief/`.

## Third-party notices
- The code uses only the Python standard library. No third-party code is vendored.
- Hermes Agent (MIT, NousResearch) is an optional external tool, installed separately by the user.
