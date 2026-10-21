# Changelog

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
