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
- **Pre-market-data audit (same day):** read the real-data path end to end. Findings: (1) stooq.com is unreachable from the container, so Stooq's terms, key parameter and adjustment policy could not be read; secondary sources (a pandas-datareader issue dated 2026-04-13 and API directories) say a key has been required since March 2026, with a CAPTCHA to obtain it and a daily quota. The old provider would have failed with a misleading "no CSV" message. (2) Adjustment status was only a free-text field and nothing consumed it; real-data results would not have been labelled provisional. (3) `.gitignore` did not cover snapshots, manifests, forward logs or the Hermes report, and MAC_NEXT_STEPS told the founder to commit `state/hermes_check.json`. (4) The secret scanner missed `STOOQ_API_KEY=...`. All fixed with 19 tests (156 total, `verify.py` 12 done_verified). The frozen registration `fcc75a7c47052167` still verifies; no holdout registry exists; no real-data run was made.
- **Not done (needs founder):** Hermes on the Mac, real data, real walk-forward and holdout, the real forward run.

## 2026-10-21 · Session 3 (Perspective Engine console)
- **Baseline:** clean tree at `81d473a`, 156 tests OK, verify 12 + H1, staging OK.
- **References:** three uploaded recordings (two third-party agent dashboards and the current app) and the Perspective Engine city source audited with ffmpeg frames: `docs/design/reference-audit.md`.
- **Built:** new console (`web/`), read models (`lql/console.py`), job runner (`lql/jobs.py`), routes, `--state-dir`, cached Hermes health, data posture label. Old `web/app.js` and `web/style.css` removed.
- **Verified:** 167 Python tests, 10 node tests, verify 13 + H1, `ui_check.mjs` 35/35. Measurements in `docs/design/verification.md`. Five repairs found by the checks are listed in `docs/design/implementation-plan.md`.

## 2026-10-22 · Session 4 (the trading floor)
- **Founder feedback:** the SVG dial was "not what I want". The centre should look like the Perspective Engine city: one agent assigning work to bots with defined tasks, metrics and results in an institutional office, and a brain of millions of neurons that grows after each finished task, "making it an Ultron at trading piece by piece". Reference: the founder's City screenshot and the third-party "Scalp City" video (`docs/design/reference-audit.md` R6/R7).
- **Built:**
  - Vendored three.js r180 (D-017).
  - New modules: `web/js/scene/` (floor, brain and bust geometry, worker, floor model, monitors).
  - `lql/console.py`: `brain_model`, `brain_stage` and `desks`.
  - Overview skeleton that keeps the WebGL canvas across polls; `enter`/`leave` hooks; the "Neurons" preference.
- **Found and fixed while checking:**
  - A null `shares` crashed the worker; the fallback dial covered it, which proved the fallback works.
  - The first layout hid the brain behind the back desks, so the desks were rearranged into two banks.
  - The wall ticker read mirrored from inside the room.
  - Labels buried the desks, so they moved into callout columns with leader lines.
  - The near-side wall posts blocked the view; the near wall is now cut away.
  - Phone overview scrolled sideways by 46 px.
  - A fast job could finish between two polls without its completion beam.
  - The reduced-motion check had to wait for the media-query event under software WebGL.
- **Honesty:** neurons count verified work, not trading skill. On the synthetic demo state the brain is at stage 3/6 (LEARNING), the EDGE core is dark and the face is a blank mask. A dev-only visual check forced the face stage in the served file in memory (never written to disk) to confirm that the eyes, brow, nose and mouth render.


## 2026-10-22 · Session 5 (CTO recovery master prompt)
- **Baseline (before changes):** 172 Python OK, 15 node OK, verify 13 + H1, staging OK.
- **Findings:** `docs/audit/current-system-audit.md`. The founder's screenshot showed the 0.1.0 page, so the Mac ran stale code. Jobs were in memory. Health was one chip. `tradable` was ambiguous. There was no Monte Carlo and the research charts were thin.
- **Built:** durable jobs and recovery, health contract, data states and eligibility, Massive/FRED/BEA/SEC adapters, Calmar and relative metrics, Monte Carlo job, research charts, research core, NautilusTrader parity POC.
- **Found while checking:**
  - The SVG path bug (charts blank after gaps).
  - Form values lost on re-render.
  - A stale "done" job-state regex in ui_check.
  - The reduced-motion check's timing.
  - A fresh import is IMPORTED_UNVERIFIED until it is hashed into a snapshot.
- **Not done (needs the founder):**
  - A real data import and terms review (provider hosts unreachable here).
  - Identify the "beatapi" key's provider.
  - Mac performance.
  - Choose a broker before any OpenAlgo-style evaluation.
- **Final:** 192 Python OK, 17 node OK, ui_check 54/54, verify 13 + H1, staging OK. Readiness 58 → 82/100 (after the XNYS calendar check). Highest gate: B (A passed in the container).
