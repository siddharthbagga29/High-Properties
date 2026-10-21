# Changelog

## Unreleased (engineering session 2, 2026-10-21)
- **Portfolio backtester** (`lql/backtest/portfolio.py`): shared cash, several instruments, union calendar, explicit stale/missing-data handling (no forward fill, orders are never carried across a gap), fill-price clamp to the bar range, volume participation cap, cash reserved across same-day orders, risk engine sees the whole portfolio. Reproduces the single-instrument engine exactly when given one instrument (tested).
- **Second strategy** `vol_scaled_trend` (trend filter plus volatility targeting) with explicit assumptions; strategy module is AST-tested to import nothing that can trade.
- **Pre-registered walk-forward research** (`lql/research/`): frozen spec + data fingerprint, strictly chronological rolling folds, in-sample-only selection, separate in/out-of-sample reporting, paired block-bootstrap intervals, 2x-cost stress, selection stability, one-shot holdout with a contamination registry. CLI: `python3 -m lql.cli research run|holdout|show`.
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
