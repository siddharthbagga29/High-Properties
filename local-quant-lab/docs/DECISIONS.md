# Decisions — Local Quant Lab

Each entry: decision, alternatives considered, rationale, trade-offs, and the condition for reversing it.

## D-001 · 2026-10-21 · Build location and scope
- **Decision:** build in `local-quant-lab/` inside the existing `High-Properties` repository, on branch `claude/nice-fermat-510prv`. Perspective Engine (`perspective-engine/`) is legacy and is left untouched.
- **Alternatives:** a new repository (needs founder authorization and a GitHub action); replacing the existing repo (destructive).
- **Reverse if:** the founder wants a dedicated repository. Moving the directory is lossless.

## D-002 · 2026-10-21 · Build machine is a cloud container, not the founder's MacBook
- **Fact:** this session runs in a Linux x86_64 cloud container (4 vCPU, 15 GB RAM, no GPU, Python 3.13.16, Node 22). The MacBook Air M3 named in the brief is not reachable from here.
- **Decision:** everything that must run on the Mac (Hermes install, local model download, `hermes memory` checks) is prepared as exact commands plus a verification script (`scripts/hermes_check.py`), and is marked `needs_human` in the acceptance checklist until run there.
- **Reverse if:** the session runs on the Mac (for example Claude Code locally).

## D-003 · 2026-10-21 · Stack: Python standard library backend, no-build vanilla web UI
- **Decision:** backend in Python ≥ 3.11 using only the standard library (`http.server` bound to 127.0.0.1, `sqlite3`, `json`, `hashlib`, `statistics`). Frontend is plain HTML/CSS/ES-module JavaScript with hand-drawn SVG charts. Tests use `unittest`.
- **Alternatives:** FastAPI + React/Vite (more dependencies and a build step, more ways to break on a fresh Mac); pandas/numpy (useful later; not needed for daily-bar backtests).
- **Rationale:** zero install, works offline, nothing to pin or audit, starts on any Mac with the system or Homebrew Python. Correctness first.
- **Trade-offs:** fewer UI conveniences; slower on very large data (not a v1 concern for a small daily universe).
- **Reverse if:** the universe grows to intraday multi-asset data (then numpy/pandas or polars) or the UI needs complex interaction (then a framework).

## D-004 · 2026-10-21 · External repositories named by the founder: evaluated, none installed into the product
Licences verified from each repository's LICENSE file via shallow clone on 2026-10-21.

| Repository | Licence | Decision | Why |
|---|---|---|---|
| NousResearch/hermes-agent | MIT | **Integrate as optional, via its documented CLI** (`hermes chat --query-file -`) | Persistent memory and skills layer per the spec. Not a dependency of the core app. |
| NousResearch/hermes-agent-self-evolution | (no LICENSE file found at HEAD on 2026-10-21) | **Deferred** | Spec says evaluate only after base Hermes is stable; licence unclear. |
| nautechsystems/nautilus_trader | LGPL-3.0 | **Not adopted for v1** | Strong production-grade event engine (Rust core). Heavy install and a large API surface for a first local prototype. Best candidate for a later engine or paper-broker adapter. |
| microsoft/qlib | MIT | **Not adopted for v1** | Factor research platform with its own data layer. Heavy; its data downloader is Yahoo-based. Future research extension. |
| microsoft/RD-Agent | MIT | **Rejected for the default build** | Its agent loop calls a hosted LLM API by default, which would incur cost and send data out. Conflicts with the no-paid-API rule. |
| obra/superpowers, mattpocock/skills, affaan-m/ECC | MIT | **Not runtime dependencies** | Developer-assistant skill packs for coding agents, not trading software. The founder may install them into their own Claude Code; nothing in the product needs them. |

- **Reverse if:** a specific capability is needed that one of these provides better than local code (for example nautilus for realistic order-book simulation).

## D-005 · 2026-10-21 · Execution timing convention
- **Decision:** a daily signal is computed from bars up to and including the close of day *t*. The order is created at *t* and filled at the **open of day t+1**, adjusted for half-spread and slippage, plus commission. No same-bar fills.
- **Rationale:** removes the most common look-ahead error. Unmodelled: queue position, partial fills at the open auction, market impact beyond the linear slippage term, borrow costs, dividends and corporate actions on synthetic data.

## D-006 · 2026-10-21 · Data sources
- **Decision:** (1) a deterministic synthetic provider (seeded) for offline demo and tests, always labelled `DEMO / SYNTHETIC`; (2) a local CSV snapshot provider with a manifest (source, retrieval time, SHA-256); (3) an optional Stooq daily-CSV adapter (free, no key, research-only, end-of-day, not a live feed) that writes snapshots through (2).
- **Reverse if:** Stooq terms or availability change; switch to another free EOD source behind the same interface.

## D-007 · 2026-10-21 · Hermes integration surface
- **Decision:** a narrow adapter (`lql/agents/hermes_adapter.py`) that (a) detects the `hermes` executable, (b) sends a structured task contract on stdin with `hermes chat --query-file -` (documented in the official CLI guide), with a hard timeout and a size cap, (c) treats the reply as untrusted text parsed against a JSON schema, and (d) falls back to the deterministic implementation and logs `hermes_unavailable` / `fallback_used` events. No undocumented endpoints, no network listeners.
- **Model policy:** no provider is configured by this project. On the Mac, the founder uses Hermes's documented local-model runtime (managed llama.cpp, which guarantees ≥ 64K context for recommended models) or a local Ollama endpoint. No Nous Portal, OpenRouter or other paid provider.
- **Learning:** project skills live in `agent_learning/` and are promoted only by `lql/learning/skills.py` after a frozen regression and safety suite passes; rollback restores the previous approved version.

## D-008 · 2026-10-21 · Position sizing is derived from the hard limits
- **Decision:** `lql.risk.size_order` turns a target weight into an order that already fits the limits. The weight is capped at `max_concentration` × 0.98 and the position at `max_position_notional` × 0.98. Each order is a slice no bigger than `max_order_qty` / `max_order_notional`. Trades under 2% of equity are skipped unless they fully exit. The resulting intent still goes through `RiskEngine.check`.
- **Why:** with $100k equity and a $50k order limit, a 100% target was always rejected, so nothing traded. Shrinking orders after rejection would hide the risk gate.
- **Trade-off:** the benchmark is "buy-and-hold under the same caps", not 100% invested. It is labelled that way in the UI.
- **Reverse if:** a portfolio-construction module with its own tested constraints replaces it.

## D-009 · 2026-10-21 · Critic evidence bar
- **Decision:** the deterministic critic (`lql/orchestrator/critic.py`) can return three verdicts.
  - REJECTED: a metric does not match the equity series, a fill happened on the decision bar, the look-ahead probe fails, or the out-of-sample test window loses money.
  - NOT_PROVEN: synthetic data, fewer than 30 round trips, fragile sensitivity, or no position held during the test window.
  - CANDIDATE: none of the above.
- Backtests alone never give more than `candidate`. Synthetic data never gives more than `unproven`. `paper_supported` requires forward paper evidence, which this build does not yet produce.

## D-010 · 2026-10-21 · Paper trading = SIMULATED replay
- **Decision:** the paper session replays validated bars one session at a time and writes to a SQLite ledger. It uses the same risk engine and the same fill model as the backtest. It produces identical equity on the same bars, and a test enforces this.
- BROKER_PAPER raises `NotConnected`. No broker SDK is installed.
- **Reverse if:** the founder explicitly opts in to a paper broker. See the checklist in docs/HERMES_INTEGRATION.md §Future and README §Live trading.
