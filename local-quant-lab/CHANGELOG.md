# Changelog

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
