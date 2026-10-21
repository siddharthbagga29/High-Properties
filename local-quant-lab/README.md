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
- **CLI:** `python3 -m lql.cli {backtest,paper,kill,release,status,demo,export,seed-tasks,tasks,skills,hermes}`
- **Real data (optional, on your machine):** run `python3 scripts/snapshot_stooq.py SPY QQQ`, then `python3 -m lql.cli backtest --source snapshot --instrument SPY`. See `docs/DATA_PROVENANCE.md`.
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
- The backtest covers a single instrument. The universe is small daily ETFs; there is no HFT or market-making capability, and none is claimed.
- `BROKER_PAPER` is a placeholder that refuses to start. Live trading would need a separate review of broker agreements, market-access rules and explicit founder approval.

## Troubleshooting
- **`settings invalid`:** `config/settings.json` failed validation. Everything that trades is disabled. Read the message and fix the field.
- **`paper ledger is bound to …`:** archive it with `POST /api/paper/archive {"confirm":"archive"}`. It is renamed, not deleted.
- **Port in use:** `python3 -m lql.server --port 8877`.
- **Hermes shows `OFF · FALLBACK`:** expected until Hermes is installed. See `docs/HERMES_INTEGRATION.md`.

## Project files
- **Start here:** `PROJECT_CONTEXT.md` and `docs/BUILD_STATE.md`.
- **Living docs:** `docs/{DECISIONS,BUILD_LOG,ACCEPTANCE_CHECKLIST,RESEARCH_LEDGER,DATA_PROVENANCE,HERMES_INTEGRATION}.md`, `CHANGELOG.md`, `agent_learning/README.md`.
- **The brief:** `project-brief/`.

## Third-party notices
- The code uses only the Python standard library. No third-party code is vendored.
- Hermes Agent (MIT, NousResearch) is an optional external tool, installed separately by the user.
