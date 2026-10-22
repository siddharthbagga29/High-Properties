# Implementation DAG (master prompt §4), state on 2026-10-22

A node is DONE only when its test command passed here. Tests named `test_*` are under `tests/`; "node" means `web/tests/units.test.mjs`; "ui" means `scripts/ui_check.mjs`.

| ID | Goal | Depends on | Deliverable (files) | Test command | Result | State | Blocker / next |
|---|---|---|---|---|---|---|---|
| A | Audit repository, runtime and baseline | — | `docs/audit/current-system-audit.md` | baseline commands (audit § Baseline) | 172 OK, 15 node OK, verify 13+1, staging OK | DONE | — |
| B | Map data, safety gates, queue, worker, persistence | A | audit F2–F7 | read-through plus existing tests | gates intact | DONE | — |
| C | Job lifecycle and health contracts | B | `lql/jobs.py`, `console.health`, `/api/health`, `/api/jobs/<id>` | `python3 -m unittest tests.test_jobs` | 9 OK | DONE | Worker is a thread in the server process (F4, accepted) |
| D | End-to-end deterministic synthetic smoke experiment | C | job → worker → `state/experiments` + `state/jobs` → UI | `tests.test_jobs`, `tests.test_server`, ui | backtest succeeded with 4/4 stages; artifact linked; survives refresh and restart | DONE | — |
| E | Data provenance and source adapters | D | `lql/data/schema.py` states, `MassiveProvider`, `scripts/import_massive.py`, `lql/data/context.py` | `python3 -m unittest tests.test_sources` | 10 OK (including the XNYS calendar) | DONE (code) | Live import BLOCKED: network here, key on the Mac |
| F | Result artifact and metrics contract | D | `lql/backtest/metrics.py` (`calmar`, `relative`), experiment `dataset` block | `python3 -m unittest tests.test_backtest` | OK | DONE | — |
| G | Historical-data import plus quality and adjustment verification | E, F | founder runs the importer and `check_adjustment.py` | — | — | BLOCKED | NEEDS_HUMAN: key, terms review, independent adjustment reference |
| H | Backtest correctness, costs and benchmark tests | F | existing engine tests plus hand-checked metrics; NautilusTrader parity | `tests.test_backtest`, `poc/nautilus` | OK; parity 41/41 fills | DONE (synthetic) | Verified-data baseline waits on G |
| I | Monte Carlo and stress | H | `lql/research/montecarlo.py`, job kind `montecarlo` | `tests.test_jobs.MonteCarloTests`, ui | OK | DONE (synthetic input) | Real input waits on G |
| J | Walk-forward and out-of-sample | H | existing `lql/research/walkforward.py` (unchanged), folds in the UI | `tests.test_walkforward` | OK | DONE (synthetic) | Real study waits on G; holdout not spent |
| K | Robustness and research acceptance gates | I, J | existing critic and walk-forward checks | existing tests | OK | DONE (mechanics) | Gate E needs verified data |
| L | UI bound to real API, events and artifacts | D, F, I | `web/js/views/research.js`, `system.js`, `data.js`, worker chip | node, ui | 17 node, 54/54 ui | DONE | — |
| M | Black-hole visualization, colours, sound | L | `web/js/scene/blackhole.js`, `core-state.js` | node "research core…", ui core check | OK | DONE | Mac frame rate not measured |
| N | External-engine POC | H | `poc/nautilus/` | `nt-venv/bin/python -I poc/nautilus/parity_poc.py . --open-ticks` | identical fills and equity | DONE → DEFER | OpenAlgo/LEAN: DEFER (no target broker) |
| O | Regression, security, accessibility, performance, reproducibility | all | full suites | see acceptance-matrix | 192 Python, 17 node, 54/54 ui, verify 13+1, staging OK | DONE (container) | Mac performance NEEDS_HUMAN |
| P | Final report, score and runbook | O | `docs/engineering/acceptance-matrix.md`, `runbook.md` | — | — | DONE | — |
