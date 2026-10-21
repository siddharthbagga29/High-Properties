# Build Log — Local Quant Lab (append-only)

## 2026-10-21 · Session 1 (cloud container, Linux x86_64, 4 vCPU, 15 GB, Python 3.13.16)
- **Audit:** before this session, Local Quant Lab had no code, only the brief and specs. No secrets or paid services existed.
- **Repositories named by the founder:** licences were checked via shallow clones. None was installed into the product (D-004).
- **Hermes docs read** from the official repo: CLI, local models, memory, skills.
- **Built:**
  - config, events, data providers and validation, strategies, backtester and metrics
  - risk engine and sizing, SQLite ledger and SIMULATED paper session
  - task graph, supervisor and critic
  - Hermes adapter with fallback
  - skill learning with a frozen regression set
  - app facade, CLI, localhost server and dashboard
  - export, `scripts/verify.py`, `scripts/hermes_check.py`, `scripts/snapshot_stooq.py`
- **Commands run and results:**
  - `python3 -m unittest discover -s tests -t .`: 61 tests OK. After adding `tests/test_security.py`: **66 tests OK (~9 s)**.
  - `python3 scripts/verify.py`: 8 tasks `done_verified` (M0–M7), H1 `needs_human`.
  - `python3 -m lql.cli demo`: 2 experiments NOT_PROVEN/unproven; paper replay reconciled.
  - `python3 -m lql.cli hermes`: fallback (Hermes not on PATH), events logged.
  - `python3 -m lql.cli skills propose agent_learning/candidate_skills/experiment-triage`: promoted 1.0.0, score 12/12.
  - `python3 -m lql.cli export`: 15 files, 0 excluded.
  - Headless Chromium (Playwright 1.56.1) at 1440 and 390 px: 0 page errors; Run backtest, Step paper, Kill and Release all worked.
- **Defects found and fixed:** 7, listed in BUILD_STATE §5.
- **Unresolved:**
  - Hermes runtime on the Mac (needs_human).
  - No real market data yet.
  - The backtest covers a single instrument only.
  - The UI loading state has no automated test.

## 2026-10-21 · Session 2 (engineering continuation, same container)
- **Baseline:** 66 tests OK, `verify.py` 8 done_verified + H1 needs_human. The ResourceWarning at `tests/test_hermes.py:93` reproduced and was fixed (`with open`); `-W error::ResourceWarning` passes.
- **Milestone A, portfolio backtester:** `lql/backtest/portfolio.py`, `tests/test_portfolio.py` (21 tests). Reproduces `engine.run` exactly for one instrument (equity, fills, costs). 95 tests OK with the second strategy.
- **Milestone B, second strategy:** `vol_scaled_trend`, `tests/test_strategies.py` (8 tests).
- **Milestone C, walk-forward:** `lql/research/`, `tests/test_walkforward.py` (14 tests). First synthetic default run (5 folds, 12 candidates): NOT_PROVEN (CI lower bound of Sharpe not above 0; synthetic; holdout not evaluated). Holdout left unspent.
- Test-design note: two walk-forward tests use `lenient_spec` and seed 1, found by scanning seeds 1 to 11 for a series that reaches NOT_PROVEN so the holdout path can run. That tells us nothing about any strategy.
- **Milestone D, forward log:** `lql/execution/forward.py`, `tests/test_forward.py` (26 tests); ledger `mark` now uses last known prices; `paper.py` fill logic split into `_fill_order`. First failures: forward log lost the last session when a crash came between commit and logging (fixed by logging before commit); equivalence with the portfolio backtester failed with two names because the paper session rejects a buy that no longer fits the cash while the backtester shrinks it (documented, test uses three names where cash does not bind). Recovery test runtime reduced by using 220 bars.
- **Milestone E, learning/risk preservation:** more forbidden skill patterns (holdout, ledger, forward log, prereg, spec loosening), AST isolation tests between the Hermes adapter and the trading modules, tests added. Re-running `skills propose` on the already-approved 1.0.0 is rejected as expected; that accidental run's record was reverted rather than committed.
- **Final checks (this session):** `python3 -W error::ResourceWarning -m unittest discover -s tests -t .` -> 137 tests OK (60 s). `python3 scripts/verify.py` -> 11 done_verified (M0 to M10), H1 needs_human. `python3 -m lql.cli research run --days 1800` -> NOT_PROVEN (H-002). `python3 -m lql.cli forward run --source synthetic --mode REPLAY ...` -> OK, SYNTHETIC_REPLAY, "Not forward paper evidence". `forward run --mode FORWARD` on synthetic data refused: stale.
- **Not done (needs founder):** Hermes on the Mac, real data, real walk-forward and holdout, the real forward run.
