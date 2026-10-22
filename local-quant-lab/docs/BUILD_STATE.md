# Build State — Local Quant Lab (checkpoint)

**Checkpoint:** 2026-10-22 (Overview trading floor: hologram supervisor, brain of up to 2M neurons, nine desks; D-017). Previous: 2026-10-21 (Perspective Engine console redesign). Branch `claude/nice-fermat-510prv`, directory `local-quant-lab/`. Version 0.1.0, engine 1.0.0.

**Milestone:** M0 to M10 are `done_verified` by the supervisor, using real test runs (`state/current_state.json`). M8 to M10 (portfolio backtester and second strategy, walk-forward research, paper forward log) were added in engineering session 2. H1 (Hermes on the Mac) is `needs_human`. Real-market-data validation and the real forward paper run are founder steps: `docs/MAC_NEXT_STEPS.md`.

**Mode:** SIMULATED only. There is no live mode in the code, no broker adapter, no paid service, and no API key.

## 1. Objective and acceptance criteria
- **Objective:** a local research, backtesting, risk and paper-trading lab.
  - Deterministic risk controls with final authority.
  - Honest research reporting.
  - A localhost control room.
  - Hermes Agent as an optional advisory, memory and skills layer, with a deterministic fallback.
- **Full criteria:** `project-brief/CLAUDE_CODE_MASTER_PROMPT.md` §10 and `project-brief/HERMES_INTEGRATION_SPEC.md` §Acceptance tests.
- **Item-by-item status:** `docs/ACCEPTANCE_CHECKLIST.md`.

## 2. Architecture and status
```
data (synthetic | csv snapshot+sha256 | optional Stooq) -> quality.validate -> strategy (past bars only)
 -> risk.size_order -> risk.RiskEngine.check (deterministic, fail-closed) -> simulator fill (open t+1, costs)
 -> execution.Ledger (SQLite, idempotent IDs, reconcile) -> events.jsonl audit -> lab.Lab facade -> server.py -> web/
research plane (async, advisory): orchestrator.TaskGraph/Supervisor, orchestrator.critic, agents.hermes_adapter
 (fallback when Hermes absent), learning.skills (frozen regression + safety gate + rollback)
```

| Module | File | Status |
|---|---|---|
| Config (fail closed; tighten-only) | `lql/config.py`, `config/settings.json` | tested |
| Event/audit log (redacting) | `lql/events.py` | tested via other modules |
| Data providers and quality | `lql/data/*.py` | tested; Stooq tested for visible failure only (no network fetch in tests) |
| Strategies | `lql/strategies/__init__.py` (buy_hold, sma_trend, vol_scaled_trend) | tested; AST-checked to import nothing that trades |
| Backtester and metrics | `lql/backtest/engine.py`, `metrics.py` | tested |
| Portfolio backtester | `lql/backtest/portfolio.py` | tested (21 tests); equals the single-instrument engine for one instrument |
| Walk-forward research | `lql/research/walkforward.py`, `stats.py` | tested (14 tests); synthetic data only so far |
| Paper forward log | `lql/execution/forward.py` | tested (26 tests incl. 8 interruption points); no real-data forward session has run |
| Risk engine and sizing | `lql/risk/__init__.py` | tested: every limit trips |
| Ledger and paper session | `lql/execution/ledger.py`, `paper.py` | tested: restart, kill switch, lockout, limit orders |
| Task graph, supervisor, critic | `lql/orchestrator/__init__.py`, `critic.py` | tested |
| Hermes adapter and fallback | `lql/agents/hermes_adapter.py` | tested with a fake runner; real Hermes not run (not installed here) |
| Skill learning | `lql/learning/skills.py`, `agent_learning/` | tested: promote, reject bad/unsafe, rollback, frozen set |
| App facade, CLI, server | `lql/lab.py`, `lql/cli.py`, `lql/server.py` | tested over real HTTP |
| Console UI (Perspective Engine) | `web/index.html`, `web/js/**`, `web/css/*` | 10 node unit tests; `scripts/ui_check.mjs` 35/35 in headless Chromium at 1440 and 390 px |
| Console read models and jobs | `lql/console.py`, `lql/jobs.py` | `tests/test_console.py` (11) |
| Export | `lql/export.py` | tested: secrets, .env, db, private memory excluded |

## 3. Files created this session
- **Everything under `local-quant-lab/`:**
  - code: `lql/`, `web/`, `tests/` (12 files), `scripts/verify.py`, `scripts/hermes_check.py`, `scripts/snapshot_stooq.py`
  - config and project files: `config/settings.json`, `Makefile`, `.gitignore`, `.env.example`, `README.md`, `CHANGELOG.md`
  - living docs: `docs/*.md`
  - learning: `agent_learning/`
  - state: `state/current_state.json`, `state/research_runs.jsonl`
  - brief copies: `project-brief/`, `reference_materials/`
- Session 2 added: `lql/backtest/portfolio.py`, `lql/research/`, `lql/execution/forward.py`, `scripts/forward_daily.sh`, `tests/test_{portfolio,strategies,walkforward,forward}.py`, `docs/FORWARD_PAPER.md`, `docs/MAC_NEXT_STEPS.md`, decisions D-011 to D-014, research-ledger entry H-002. Small edits to `metrics.py`, `ledger.py`, `paper.py`, `cli.py`, `learning/skills.py` (more forbidden patterns), `strategies/__init__.py`.
- Nothing outside `local-quant-lab/` was changed. Perspective Engine is untouched; its last commit is 439ae24.

## 4. Test commands and results (actually executed, 2026-10-21, Linux x86_64, Python 3.13.16)
- `python3 -m unittest discover -s tests -t .`: **Ran 167 tests in ~75 s, OK** (17 test files; also OK with `-W error::ResourceWarning`). Session 1 had 66 tests; session 2 added 71; the data audit added 19; the console added 11 (plus 10 node tests and 35 browser checks).
- `python3 scripts/verify.py`:
  - M0 4 passed, M1 5, M2 9, M3 18, M4 18, M5 5, M6 2, M7 5, M8 29, M9 14, M10 26, M11 19, M12 11. All `done_verified`.
  - H1 `needs_human`.
- `python3 -m lql.cli demo`: both demo experiments NOT_PROVEN / unproven (synthetic data, too few round trips). Paper replay reconciled.
- `python3 -m lql.cli hermes`: `hermes executable not found on PATH`, so the deterministic fallback ran. `hermes_unavailable` and `fallback_used` were logged.
- Headless Chromium (Playwright 1.56, preinstalled):
  - desktop 1440 px and phone 390 px: no page errors; no horizontal scroll after the fix.
  - Run backtest, Step paper, Kill switch and Release all worked from the UI.
- `python3 -m lql.cli export`: 15 files bundled, 0 excluded.
- `python3 -m lql.cli skills propose agent_learning/candidate_skills/experiment-triage`: promoted 1.0.0 (12/12).

## 5. Bugs found and fixed during this build (by tests or review)
Session 2 additions are items 8 to 11 at the end.
1. **Exits blocked by the order limit.** A full-position sell exceeded `max_order_notional` and was always rejected (109 rejections). Fixed: sizing now slices exits too.
2. **Trivial daily rebalancing.** Buy-and-hold churned (371 fills). Fixed: a 2% no-trade band.
3. **No trading at all.** A 100% target always failed the concentration and position limits. Fixed by D-008 sizing.
4. **Wrong critic verdict.** The critic called a no-trade test window "lost money (+0.00%)". Fixed: `<0` is REJECTED, no position is NOT_PROVEN.
5. **Export missed JSON-quoted secrets** (`"password": "…"`) and wrongly excluded `.env.example`. Both fixed; tests cover them.
6. **Phone layout overflowed** (558 px on a 390 px viewport). Fixed in CSS.
7. **Unclosed sqlite connections** (ResourceWarning). `Ledger.close` / `__del__` added.
8. **Unclosed file** in `tests/test_hermes.py` (`ast.parse(open(...))`): `with open`, now clean under `-W error::ResourceWarning`.
9. **Forward log lost the last session after a crash between commit and logging** (found by the injected-interruption test). Fixed: log first, then commit.
10. **Ledger could not mark several instruments** (`mark` needed today's price for every holding). Fixed: it uses the last known price per instrument, and raises if a held instrument never had one.
11. **A stuck `CREATED` order after a crash** was rejected as a duplicate by the risk engine on restart. Fixed: such orders are re-checked, not re-created.

## 6. Blockers and decisions
- **Data access and adjustment (audit finding, founder action).** Stooq reportedly needs an API key since about March 2026 (secondary sources only; stooq.com was unreachable from the container, so its terms and its adjustment policy were NOT read). Real-data results are PROVISIONAL until `scripts/check_adjustment.py` verifies the adjustment against an independent source. Safest order: `docs/MAC_NEXT_STEPS.md`. Decision D-015.
- **Hermes on the Mac (founder action).**
  - This container is not the MacBook Air M3. It is CPU-only, and Hermes plus a ≥64K-context local model cannot usefully run here.
  - Exact steps: `docs/HERMES_INTEGRATION.md`.
  - After install, run `python3 scripts/hermes_check.py --memory-roundtrip` on the Mac.
- **No real market data in the repo yet, so no real-data research or forward run exists.**
  - The Stooq fetch exists but was not run: no network calls in tests, and Stooq's terms allow personal research use only.
  - To use real data, run the snapshot steps in `docs/DATA_PROVENANCE.md` on the Mac.
- Decisions D-001 to D-010 are in `docs/DECISIONS.md`.

## 7. Prioritised next steps (atomic)
Engineer-owned items from the first checkpoint are done (items 3 to 5 there plus the research-ledger entry). What remains is founder-side, in this order (exact commands in `docs/MAC_NEXT_STEPS.md`):
0. **Founder, Mac (new):** read Stooq's terms; import the four CSVs (`scripts/import_csv.py`) or use a key; run `scripts/check_adjustment.py` against an independent source; run `scripts/check_staging.py` before every commit.
1. **Founder, Mac:** run the suite and `verify.py` on macOS; install Hermes and a local model; run `scripts/hermes_check.py --memory-roundtrip`; commit a summary of the Hermes check (the JSON itself is git-ignored); mark H1.
2. **Founder, Mac:** snapshot SPY/QQQ/IWM/TLT, read the quality output, then run the pre-registered walk-forward (`research run`), and only if it is NOT_PROVEN spend the holdout once.
3. **Founder, Mac:** start the `REAL_FORWARD` paper log and schedule `scripts/forward_daily.sh`. Review after 60 sessions and 10 exits.
4. **Engineer, later, only if real results justify it:** exchange-holiday calendar and corporate-action handling; intraday data; a human-approved paper-broker adapter (not started; needs your approval, see HERMES_INTEGRATION.md "Future"); a UI panel for walk-forward and forward-log results (CLI and JSON only today).

## 8. Dependencies and setup
- Python ≥ 3.11 (tested on 3.13.16). Standard library only: no pip install, no lockfile needed.
- Optional: Playwright/Chromium for UI checks (not required to run).
- Run:
  - `make test`
  - `make run`, then open http://127.0.0.1:8765
  - `make demo`
  - `make verify`
  - `make export`

## 9. Hermes integration plan
See `docs/HERMES_INTEGRATION.md`. In short:
- **Official sources:** the NousResearch/hermes-agent repo (MIT), installed via the official installer, with a local model through Hermes's managed llama.cpp or Ollama (≥64K context).
- **What the adapter uses:** only `hermes --version` and `hermes chat --query-file`. The adapter:
  - checks output against a schema and treats it as untrusted;
  - gives Hermes no route to orders or risk limits;
  - holds one lock per profile;
  - uses a timeout;
  - falls back to deterministic code and logs it.
- **Learning:** project skills in `agent_learning/` are promoted only through the frozen regression set and the safety gate.

## 10. Portable context files
- Run `python3 -m lql.cli export`. It writes `exports/context-<UTC>.zip` with a MANIFEST.json.
- **Included:** PROJECT_CONTEXT, README, CHANGELOG, docs, brief, config, task state, research runs, approved skills, regression set, evaluation log.
- **Excluded:** `.env`, databases, keys, Hermes private memory, and anything that looks like a secret.

## 11. Resume instructions (fresh session, e.g. Sonnet 5.5 Medium)
Read these, in this order, and nothing else first:
1. `local-quant-lab/docs/BUILD_STATE.md` (this file)
2. `local-quant-lab/docs/ACCEPTANCE_CHECKLIST.md`
3. `local-quant-lab/docs/DECISIONS.md`
4. `local-quant-lab/project-brief/CLAUDE_CODE_MASTER_PROMPT.md` §4, §7 and §10 (constraints and acceptance)
5. The source file for the module you will touch.

Resume prompt:
> Continue Local Quant Lab in `local-quant-lab/` on branch `claude/nice-fermat-510prv`.
> 1. Read `docs/BUILD_STATE.md` and `docs/ACCEPTANCE_CHECKLIST.md`.
> 2. Run `python3 -m unittest discover -s tests -t .` and confirm 167 pass.
> 3. Take the first open engineer item from BUILD_STATE §7 (all current items need the founder's Mac or approval first). Implement it with tests, then run `python3 scripts/verify.py`.
> 4. Update BUILD_STATE, BUILD_LOG and CHANGELOG, then commit and push to the same branch. No PR.
>
> Constraints:
> - SIMULATED only. No live orders, paid services, or secrets.
> - The risk engine keeps final authority. No LLM in the order path.
> - Never claim profitability from backtests.
> - Do not touch `perspective-engine/`.

## 12. Not preserved in files
- **The founder's Mac state:** hardware, installed tools, and whether Hermes or Ollama exist. It is unknown from here; `scripts/hermes_check.py` captures it.
- **Runtime state that is git-ignored by design:**
  - `state/paper.db`, `state/events.jsonl`, `state/experiments/*.json`, `exports/`
  - All of it can be regenerated: `make demo` and `make export`.
- **The shallow clones of the external repositories** used for licence checks. They live in the session scratchpad and are discarded. Licence results are recorded in D-004.
- **This conversation's reasoning.** Its conclusions are in the decisions, build log, and this file.
