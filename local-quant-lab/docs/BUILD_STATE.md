# Build State — Local Quant Lab (checkpoint)

**Checkpoint:** 2026-10-21. Branch `claude/nice-fermat-510prv`, directory `local-quant-lab/`. Version 0.1.0, engine 1.0.0.

**Milestone:** M0 to M7 (M7 = security audit) are `done_verified` by the supervisor, using real test runs (`state/current_state.json`). H1 (Hermes on the Mac) is `needs_human`.

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
| Strategies | `lql/strategies/__init__.py` (buy_hold, sma_trend) | tested |
| Backtester and metrics | `lql/backtest/engine.py`, `metrics.py` | tested |
| Risk engine and sizing | `lql/risk/__init__.py` | tested: every limit trips |
| Ledger and paper session | `lql/execution/ledger.py`, `paper.py` | tested: restart, kill switch, lockout, limit orders |
| Task graph, supervisor, critic | `lql/orchestrator/__init__.py`, `critic.py` | tested |
| Hermes adapter and fallback | `lql/agents/hermes_adapter.py` | tested with a fake runner; real Hermes not run (not installed here) |
| Skill learning | `lql/learning/skills.py`, `agent_learning/` | tested: promote, reject bad/unsafe, rollback, frozen set |
| App facade, CLI, server | `lql/lab.py`, `lql/cli.py`, `lql/server.py` | tested over real HTTP |
| Control room UI | `web/index.html`, `app.js`, `style.css` | driven in headless Chromium at 1440 and 390 px; no console errors |
| Export | `lql/export.py` | tested: secrets, .env, db, private memory excluded |

## 3. Files created this session
- **Everything under `local-quant-lab/`:**
  - code: `lql/`, `web/`, `tests/` (12 files), `scripts/verify.py`, `scripts/hermes_check.py`, `scripts/snapshot_stooq.py`
  - config and project files: `config/settings.json`, `Makefile`, `.gitignore`, `.env.example`, `README.md`, `CHANGELOG.md`
  - living docs: `docs/*.md`
  - learning: `agent_learning/`
  - state: `state/current_state.json`, `state/research_runs.jsonl`
  - brief copies: `project-brief/`, `reference_materials/`
- Nothing outside `local-quant-lab/` was changed. Perspective Engine is untouched; its last commit is 439ae24.

## 4. Test commands and results (actually executed, 2026-10-21, Linux x86_64, Python 3.13.16)
- `python3 -m unittest discover -s tests -t .`: **Ran 66 tests in ~9 s, OK** (12 test files).
- `python3 scripts/verify.py`:
  - M0 4 passed, M1 5, M2 9, M3 18, M4 18, M5 5, M6 2, M7 5. All `done_verified`.
  - H1 `needs_human`.
- `python3 -m lql.cli demo`: both demo experiments NOT_PROVEN / unproven (synthetic data, too few round trips). Paper replay reconciled.
- `python3 -m lql.cli hermes`: `hermes executable not found on PATH`, so the deterministic fallback ran. `hermes_unavailable` and `fallback_used` were logged.
- Headless Chromium (Playwright 1.56, preinstalled):
  - desktop 1440 px and phone 390 px: no page errors; no horizontal scroll after the fix.
  - Run backtest, Step paper, Kill switch and Release all worked from the UI.
- `python3 -m lql.cli export`: 15 files bundled, 0 excluded.
- `python3 -m lql.cli skills propose agent_learning/candidate_skills/experiment-triage`: promoted 1.0.0 (12/12).

## 5. Bugs found and fixed during this build (by tests or review)
1. **Exits blocked by the order limit.** A full-position sell exceeded `max_order_notional` and was always rejected (109 rejections). Fixed: sizing now slices exits too.
2. **Trivial daily rebalancing.** Buy-and-hold churned (371 fills). Fixed: a 2% no-trade band.
3. **No trading at all.** A 100% target always failed the concentration and position limits. Fixed by D-008 sizing.
4. **Wrong critic verdict.** The critic called a no-trade test window "lost money (+0.00%)". Fixed: `<0` is REJECTED, no position is NOT_PROVEN.
5. **Export missed JSON-quoted secrets** (`"password": "…"`) and wrongly excluded `.env.example`. Both fixed; tests cover them.
6. **Phone layout overflowed** (558 px on a 390 px viewport). Fixed in CSS.
7. **Unclosed sqlite connections** (ResourceWarning). `Ledger.close` / `__del__` added.

## 6. Blockers and decisions
- **Hermes on the Mac (founder action).**
  - This container is not the MacBook Air M3. It is CPU-only, and Hermes plus a ≥64K-context local model cannot usefully run here.
  - Exact steps: `docs/HERMES_INTEGRATION.md`.
  - After install, run `python3 scripts/hermes_check.py --memory-roundtrip` on the Mac.
- **No real market data in the repo yet.**
  - The Stooq fetch exists but was not run: no network calls in tests, and Stooq's terms allow personal research use only.
  - To use real data, run the snapshot steps in `docs/DATA_PROVENANCE.md` on the Mac.
- Decisions D-001 to D-010 are in `docs/DECISIONS.md`.

## 7. Prioritised next steps (atomic)
1. **Founder, Mac:** install Hermes and a local model per `docs/HERMES_INTEGRATION.md`, run `scripts/hermes_check.py --memory-roundtrip`, then commit `state/hermes_check.json` evidence and mark H1.
2. **Founder, Mac (optional):** snapshot real daily data for SPY/QQQ/IWM/TLT (`docs/DATA_PROVENANCE.md`), then `python3 -m lql.cli backtest --source snapshot --instrument SPY`.
3. **Engineer:**
   - Add a multi-instrument portfolio backtest. It is single-instrument today; the risk engine already supports gross exposure across instruments.
   - Add walk-forward re-evaluation with a pre-registered parameter grid.
4. **Engineer:**
   - Add a second strategy family, for example a volatility-scaled trend, so the critic has more than one hypothesis to reject.
   - Add a research-ledger entry per run.
5. **Engineer:** a paper-session forward log against snapshot data refreshed daily. This is the only path to `paper_supported`.

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
> 2. Run `python3 -m unittest discover -s tests -t .` and confirm 66 pass.
> 3. Take the first open engineer item from BUILD_STATE §7. Implement it with tests, then run `python3 scripts/verify.py`.
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
