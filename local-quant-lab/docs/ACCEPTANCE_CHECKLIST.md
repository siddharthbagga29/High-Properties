# Acceptance Checklist — Local Quant Lab

**Status values:** `done_verified` means the command actually ran with the result shown. `needs_human` means it needs the founder's Mac or an approval. `partial` means it is done with a stated gap. Evidence date is 2026-10-21, Linux x86_64 container, Python 3.13.16.

**Software readiness ≠ trading readiness.** Every strategy's `alpha_status` is `unproven`.

## Master prompt §10

| # | Criterion | Status | Test command / evidence |
|---|---|---|---|
| 1 | Clean local install and startup | done_verified | No dependencies. `make run` starts the server, which was served and driven in headless Chromium. `tests/test_server.py` starts a real HTTP server. |
| 2 | Demo works without secrets or paid services; labelled synthetic | done_verified | `python3 -m lql.cli demo`. The banner and status strip say "REPLAY of DEMO_SYNTHETIC". `tests/test_server.py::test_page_and_status` |
| 3 | Data provenance, ordering, staleness and schema validated; unavailable sources fail visibly | done_verified | `python3 -m unittest tests.test_data`: snapshot sha256 tamper check, Stooq offline gives ProviderError, duplicate/non-monotonic/OHLC/stale checks |
| 4 | Baseline strategy and buy-and-hold through the real backtester | done_verified | `tests.test_backtest`. sma_trend plus the capped buy-and-hold benchmark in every report. |
| 5 | Costs and slippage, time splits, metrics, trade records, sensitivity | done_verified | `tests.test_backtest::test_evaluate_report_reproducible_and_honest`. Cost ×0/1/2/4, parameter grid on train+validation only, splits, fills with the decision date. |
| 6 | Re-running the same data, config and seed reproduces results | done_verified | Equal `config_hash` and `result_hash` in tests. The server re-run returns the cached identical result (`test_backtest_export_and_reproducible_rerun`). |
| 7 | Backend-enforced risk controls; operational kill switch | done_verified | `tests.test_risk`: every limit trips, fail closed. `tests.test_execution::test_kill_switch_cancels_and_blocks_and_survives_restart`. Kill and release also driven from the UI. |
| 8 | Simulated or paper only; no live route reachable | done_verified | `tests.test_security`: no LIVE mode, no broker endpoints, no order route. BROKER_PAPER raises NotConnected (`test_broker_paper_refuses_to_start`). |
| 9 | Records persist, survive restart and reconcile | done_verified | `tests.test_execution`: restart gives identical equity with no duplicate keys; reconciliation mismatch detected. |
| 10 | Dashboard functional, grounded in data, responsive, with clear states | done_verified, with a gap | Chromium at 1440 and 390 px: no errors, no horizontal scroll. KPIs equal the backend report (test). Empty states have messages. Gap: no automated test for the loading state. Reduced motion uses a CSS media query; it was not tested in a browser. |
| 11 | Orchestration persists, recovers, retries are bounded, evidence required | done_verified | `tests.test_orchestrator`, plus `scripts/verify.py` run to 8 done_verified tasks with recorded outputs in `state/current_state.json` |
| 12 | Hermes acceptance (§5.1) | partial / needs_human | See the table below |
| 13 | Unit, integration and smoke tests have run; critical issues fixed | done_verified | `python3 -m unittest discover -s tests -t .`: 66 tests OK, about 9 s. Bugs fixed are listed in BUILD_STATE §5. |
| 14 | README covers install, run, test, architecture, data, limits, risks, troubleshooting | done_verified | `README.md` (reviewed by hand) |
| 15 | Portable export generated and checked for secrets | done_verified | `python3 -m lql.cli export`: 15 files, 0 exclusions. `tests.test_export` plants secrets and checks that they are excluded. |
| 16 | Living docs reflect actual results | done_verified | BUILD_STATE, DECISIONS, BUILD_LOG, RESEARCH_LEDGER and this file, written from the command outputs above |

## Hermes spec acceptance tests

| Test | Status | Evidence |
|---|---|---|
| Official repository, version and licence verified | done_verified | MIT licence file in the shallow clone (D-004). The version is recorded by `hermes --version` on the Mac. |
| Works without a subscription, paid API, hosted memory or credentials | done_verified (by design and test) | `safe_env()` strips credentials. No provider keys are anywhere. Install steps use local models only. |
| Local model actually supports ≥64K context; hardware documented | needs_human | Run `scripts/hermes_check.py` on the Mac and pick a model through `hermes model` → Local models |
| Memory written in one session is recalled in another | needs_human | `scripts/hermes_check.py --memory-roundtrip` on the Mac |
| Project state survives with Hermes absent | done_verified | Every test passes with Hermes absent. All state is in repo files. |
| Approved skills versioned and included in the export | done_verified | `agent_learning/approved_skills/` with a registry. The export includes `approved_skills/**`. |
| Candidate tested against frozen success, failure and unsafe regressions | done_verified | `tests.test_learning`. 12 frozen cases, sha256 pinned. |
| Bad skill blocked; rollback demonstrated | done_verified | `test_weakened_skill_is_rejected`, `test_unsafe_skill_blocked_by_safety_gate`, `test_promote_then_rollback` |
| Restart preserves state; no duplicate experiments or orders | done_verified | Experiment cache keyed by the config hash. Ledger idempotency keys. `test_restart_recovers_without_duplicates`. |
| No live-broker route; cannot override risk | done_verified | `test_hermes_has_no_order_or_risk_route` (AST), `tests.test_security` |
| Logs show when Hermes was unavailable and the fallback was used | done_verified | `test_missing_hermes_uses_logged_fallback`; also `python3 -m lql.cli hermes` in this container |
| No secrets or private memory in the shareable bundle | done_verified | `tests.test_export` (planted MEMORY.md, .env, AWS/GitHub tokens, a JSON password) |

## Not tested here (and why)
- **Real Hermes runtime and model.** It is not installed in this container (D-002). The adapter was tested with a fake subprocess runner that matches the documented CLI.
- **Live Stooq download.** It needs network access, and the data is for personal research use only. Only the visible-failure path is tested.
- **macOS-specific behaviour.** The code uses only the standard library and `fcntl` (available on macOS), but it has not been run on macOS.
