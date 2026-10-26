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

## D-018 · 2026-10-22 · Durable jobs in one local process; separate health states
- **Decision:** jobs are persisted as `state/jobs/<id>.json`, written atomically on every state or stage change. States are queued, running, succeeded, failed and cancelled. Each job records:
  - timestamps, request hash and correlation id;
  - measured progress (stages, commands or paths), or none if nothing can be measured;
  - datasets with their data state and hash, artifact links, and the error and log tail.
- **Restart recovery:** on restart, a job found running is marked failed with `interrupted: true` (never successful), and a never-started job is re-queued. That is safe because both kinds are idempotent: a recheck only reads, and a backtest or Monte Carlo is cached by its input hash.
- **Health:** web server, API, worker (heartbeat), queue, research engine, data sources, model providers, last successful job and last research run are reported separately (`/api/health`, plus a WORKER chip next to SERVER).
- **Alternatives:**
  - Redis or another broker: unnecessary for one local user.
  - SQLite job table: a fine fit too, but per-job JSON files can be inspected and need no migration.
  - A separate worker process: more robust to server crashes, but two processes to manage on the Mac.
- **Reverse if:** jobs run for more than a few minutes, or more than one machine works the queue. Then split the worker into its own process reading the same files.

## D-019 · 2026-10-22 · Explicit data states; end-of-day imports stay provisional
- **Decision:**
  - **States and eligibility:** data carries one of SYNTHETIC, IMPORTED_UNVERIFIED, PROVISIONAL, VERIFIED_HISTORICAL, LIVE_FEED (unsupported) or REJECTED. An eligibility table names the allowed uses; no state allows real orders.
  - **Field rename:** the API field `tradable` became `passes_validation`.
  - **Massive importer:** fetches end-of-day aggregates, records them as `split_adjusted_only`, and therefore keeps them PROVISIONAL until a total-return series is verified independently.
  - **Context data:** FRED, BEA and SEC adapters are separate context datasets, never price data, with point-in-time helpers (ALFRED vintages; SEC filing dates).
- **Why:** a label must never upgrade data. The verified-history gate stays the human-run `check_adjustment.py`.
- **Not verified:** provider terms and response shapes could not be fetched from the build environment. Adapters are tested against fixtures in the documented shapes and must be confirmed on the Mac (`docs/audit/data-source-review.md`).

## D-020 · 2026-10-22 · NautilusTrader: parity proven, adoption deferred; OpenAlgo and LEAN deferred
- **Decision:** NautilusTrader 1.231.0 (stable; release candidates excluded) was run in an isolated venv against an independent reference. With a trade at each session open, fills and equity matched exactly; with bars alone it fills at the next bar's close (a semantic difference).
- **Why defer:** the daily engine has no gap that NautilusTrader closes today. The costs would be 936 MB installed, about 500 MB per run on an 8 GB Mac, numpy/pandas/pyarrow, LGPL obligations and a pending 2.x API change.
- **OpenAlgo** is an execution layer with no proven US equity/ETF broker, under AGPL, with a WebSocket on port 8765. **LEAN** needs Docker and has no concrete gap to close. Both are deferred.
- **Reverse if:** intraday, order-book or multi-venue simulation is needed, or a paper adapter for a chosen broker. `poc/nautilus/` is the starting parity test.

## D-021 · 2026-10-22 · The research core (black hole) is driven by persisted jobs only
- **Decision:** an event horizon and accretion disk on the floor's podium shows the job system's state:
  - IDLE: "NO ACTIVE JOBS", slow labelled ambient turn;
  - QUEUED: one amber marker per persisted queued job;
  - RUNNING: the job id, stage and measured progress, or "PROGRESS NOT MEASURED", with particles spiralling in from the assigned desk;
  - SUCCEEDED: an outward green pulse and a link to the artifact;
  - FAILED: a red pulse and the error;
  - NEEDS HUMAN blockers are listed, never animated.
- **Brain counter kept:** the neurons counter is a defined, persisted quantity (D-017). Operational counters (jobs, artifacts) now sit next to it.

## D-017 · 2026-10-22 · The Overview becomes a 3D trading floor; three.js is vendored for it alone
- **Decision:** the Overview's centre is a WebGL scene. The supervisor is a holographic bust on the central podium, after the Perspective Engine city's Jarvis (`perspective-engine/city/src/scene/bust.ts`), with the brain inside its head. Its chest core dispatches the real job queue to bots at nine trading desks (engineer, reviewer, critic, research, data, risk, paper, Hermes, and the founder's empty human seat). Each desk's monitors draw that role's real task, three metrics and last result from `/api/overview` (`desks`). Above the podium, a brain of 150k to 2M neurons is built in a Web Worker. Its neurons light only from recorded, verified work: `formed(region) = 1 - exp(-units / k)` over counts from the task file, experiments, the research registry, the paper ledger, datasets and the audit log (`lql/console.py`, `brain_model`). The EDGE core is 20% of the neurons and stays dark until a CANDIDATE on verified real data or verified real forward sessions exist. The bust's body is an outline (decoration). Its face is data: it stays a blank mask until the EDGE region forms, then gains eyes (first proven edge), brow and nose (EDGE 50%), and a mouth (EDGE 90%). A six-stage "path to Ultron" (`brain_stage`) runs SEED, FORMING, LEARNING, SKILLED, PROVEN EDGE, ULTRON. The first four come from verified work, and the last two only from a proven edge, so synthetic or engineering work can never reach them. three.js r180 (MIT) is vendored under `web/vendor/three/` with pinned SHA-256s, loaded only by the Overview, through dynamic `import()`. When WebGL is missing, the old SVG dial is shown.
- **Alternatives:** keep the SVG dial (it was rejected by the founder: "not what I want"); load three.js from a CDN (forbidden by the CSP and by local-first use); WebGPU (not yet available in every Safari version the Mac may run); a canvas-2D pseudo-3D brain (cannot draw a million points at interactive rates).
- **Why:** the founder asked for the Perspective Engine city look: one agent assigning work to bots with visible tasks, metrics and results, and a central brain that grows piece by piece as work is done. This partly reverses D-016's "no three.js": the dependency is still offline and pinned, and nothing else in the console loads it.
- **Honesty rules:** no fabricated activity. Bots move only while their desk has a running job. Beams and neuron streams mark real job transitions and real growth. The neuron shimmer and drift, the skyline and the scrolling ticker are labelled ambient (System › What moves and why) and stop under reduced motion. Neurons measure verified work, not trading skill. The quality setting changes how many neurons are drawn, never the evidence.
- **Trade-offs:** about 750 KB of vendored JavaScript (fetched only on the Overview). At 1M neurons and above, GPU cost is real. The default is chosen from the device's cores and memory, and you can change it in the floor's "Neurons" menu. Frame rates were measured only in the container's software renderer (SwiftShader, 2 to 4 fps). Those numbers say nothing about the Mac's GPU, and the Mac's own figures are still to be measured.
- **Reverse if:** the Mac cannot hold 30 fps at "medium" (400k neurons), or the founder prefers the flat dial. The fallback path already exists and is tested.

## D-016 · 2026-10-21 · Console redesign stays on the existing stack
- **Decision:** rebuild the UI as plain ES modules + SVG served by the existing stdlib server (D-003), not React/Vite/three.js. Long operations go through a single-worker, in-memory job runner. The console reads state and can start only two job kinds (recheck, backtest) plus the existing paper/kill/release actions.
- **Why:** zero install on an 8 GB Mac, nothing to audit or pin, works offline, and the measured render costs (≤ 60 ms for a 300-task graph) do not justify a framework or WebGL. The Perspective Engine city's React/three.js stack was reviewed and rejected for this app on weight.
- **Safety:** the console has no route to freeze or run a walk-forward study, spend a holdout, start a forward log, change limits or reach a broker; a recheck never changes a task's status.
- **Reverse if:** the graph grows to thousands of nodes or interaction needs exceed what SVG handles; then consider a small canvas renderer before any framework.

## D-015 · 2026-10-21 · Real-data workflow: unverified adjustment is provisional, vendor data stays out of git
- **Decision:** (1) A price series counts as verified only as `split_and_dividend_adjusted` with recorded evidence from an independent reference (two decisive old dates). Everything else is PROVISIONAL: no CANDIDATE, no holdout, no forward evidence. (2) The Stooq downloader is opt-in, key-from-environment, single-shot, and never circumvents access controls; manual CSV import is the preferred route. (3) The attestation is part of the study hash only for non-synthetic data, so existing registrations stay valid and a later attestation is a new study that cannot reset the holdout registry. (4) Raw prices, manifests, forward logs, databases and machine reports are git-ignored and `check_staging.py` blocks them (the repository is public).
- **Why:** I could not read stooq.com or its terms from the audit environment; the adjustment status, key parameter name and quota are unverified. Treating that as provisional is the only honest default.
- **Reverse if:** Stooq documents its adjustment and terms, or a verified source replaces it; then the vendor can be marked verified through the same check.

## D-011 · 2026-10-21 · Portfolio backtester conventions
- **Decision:** one shared cash balance over the union of the instruments' session dates (`lql/backtest/portfolio.py`). No forward filling of bars. An order whose instrument has no bar on the next date is cancelled, not carried. Fills are clamped to the bar's low/high, quantity is capped at 10% of the bar's volume (remainder dropped and recorded), buys shrink to the cash left. Same-day orders reserve cash against each other; alphabetical priority is arbitrary but deterministic. The risk engine sees every position and every last price.
- **Why:** these remove the cheapest ways to get unrealistic fills (a fill outside the day's range, trading more than the market, spending cash twice, filling days after a gap on stale information).
- **Check:** for one instrument and with the clamp and volume cap off, it reproduces `engine.run` exactly (tested). The single-instrument engine stays untouched as the reference.
- **Trade-off:** the paper session *rejects* a buy that no longer fits the cash at the open; the backtester *shrinks* it. Paper is more conservative (see FORWARD_PAPER.md).
- **Reverse if:** a real calendar (exchange holidays) and a corporate-actions feed exist; then gaps could be classified instead of just reported.

## D-012 · 2026-10-21 · Second strategy: volatility-scaled trend
- **Decision:** `vol_scaled_trend` (long above SMA, weight = target volatility / realised volatility, capped at 1, 0.05 steps). Baselines: buy-and-hold and `sma_trend`. Its docstring states what it assumes and what breaks it.
- **Why this one:** simple, explainable, the one the earlier plan named, and it addresses a known weakness of the plain trend rule (full exposure in violent markets). It is not claimed to work.
- **Guards:** the strategy module is AST-tested to import nothing that trades; weights are clamped by the engine and sized by `size_order`, so even a strategy asking for 10x leverage gets a capped, risk-checked order (tested).

## D-013 · 2026-10-21 · Walk-forward is pre-registered and the holdout is single-use
- **Decision:** a study is frozen first (grid, windows, selection rule, costs, benchmark, acceptance criteria, data fingerprint, hash) in `state/research/prereg/`. Folds are rolling and strictly chronological; each fold selects by in-sample net Sharpe only and carries the choice unchanged into the next window. The last 20% of the data is evaluated once, after the walk-forward, by the rule fixed in the registration; `holdout_registry.json` records the holdout fingerprint, so a second evaluation is refused and any later study on the same data is flagged contaminated (cannot exceed NOT_PROVEN).
- **Verdicts:** INSUFFICIENT (too few folds, days or exits), SUSPICIOUS (implausible Sharpe, zero costs), REJECTED (losing or Sharpe <= 0 out of sample, or a look-ahead probe failure), NOT_PROVEN, CANDIDATE (only with every check, real data and a passed holdout). Never `paper_supported`.
- **Not done on purpose:** no search over strategies by return; no ranking of winners; no re-tuning after seeing the holdout.
- **Known limits:** a 95% block-bootstrap interval is a lower bound on uncertainty; only about 20 to 60 candidate configurations are tried per study, but running further studies on the same data still inflates the chance of a lucky result, which is why the registry exists and why the number of candidates scored is printed.
- **Reverse if:** the acceptance thresholds prove unusable on real data. Change them by freezing a NEW spec before looking at results, never by editing an old one.

## D-014 · 2026-10-21 · Forward log is the ledger plus an append-only journal, and evidence is classified
- **Decision:** `lql/execution/forward.py` runs idempotent passes over the SQLite ledger and writes `forward_log.jsonl` from the ledger, keyed by deterministic ids. Evidence class (`SYNTHETIC_REPLAY`, `SYNTHETIC_FORWARD`, `REAL_REPLAY`, `REAL_FORWARD`) is fixed at creation and cannot change. Only real data that arrives after the log started is `REAL_FORWARD`.
- **Why:** a replay of history through the paper code path is a backtest, however it is described. The class makes that difference impossible to blur.
- **Reverse if:** a different data source (broker paper account) is ever approved; the evidence classes would then need a new member, not a relaxed rule.

## D-022 · 2026-10-24 · Hermes is deferred; scheduled Python jobs run the lab without it
- **Decision (founder):** drop Hermes for now. Nothing in the lab depends on it: it is advisory only, every test passes with it absent, and the deterministic fallback is logged. `H1-hermes-mac` stays `needs_human` with the deferral as its question. It is not closed and no evidence is recorded for it.
- **Why:** Hermes v0.22.2 refuses a context window below 64,000 tokens (`MINIMUM_CONTEXT_LENGTH`, `agent/model_metadata.py`). For `qwen3:4b-instruct` at 65,536 tokens the KV cache alone is about 9.7 GB at f16, 5.1 GB at q8_0 and 2.7 GB at q4_0 (calculated from 36 layers, 8 KV heads and head size 128, not measured), on top of about 2.5 GB of weights. On the founder's 8 GB Mac only the q4_0 cache could fit, and only at the edge of available memory. The founder had already seen swapping at 64K.
- **Instead:** `scripts/daily_run.py` runs the routine work on a schedule (launchd or cron): optional data refresh, research jobs, the SIMULATED forward pass and a dated report. No language model is involved.
- **Reverse if:** the lab moves to a 16 GB+ machine, or a q4_0 KV cache with flash attention is measured on this Mac without swapping (`ollama ps`, `sysctl vm.swapusage`). Then run `python3 scripts/hermes_check.py --memory-roundtrip` and close H1 only if `memory_roundtrip.ok` is true.

## D-023 · 2026-10-26 · Dividend adjustment is computed locally and verified by a person, then re-checked daily
- **Finding:** Massive's free `adjusted=true` series is split-adjusted only. Checked against a dividend-adjusted reference, it can never verify, so every result would stay PROVISIONAL for good.
- **Decision:** `import_massive.py --with-dividends`, which the daily pass uses, fetches Massive's dividend records (`/v3/reference/dividends`; shape confirmed on the live API on 2026-10-25). It back-adjusts the closes multiplicatively: `factor = 1 - cash / previous close`, applied to every earlier bar. The series is labelled `dividend_adjusted_unverified`, which is PROVISIONAL.
- **Verification:** a person compares the series with an independent source's raw and adjusted closes on two early dates: `check_adjustment.py --tol 0.003 --write`. Only a match marks it verified. The references are saved (git-ignored), and each daily import repeats the check. Distributions after the verification date are rolled into the references with the same factors; that part is not an independent check. So the references expire after 120 days, and a mismatch or expiry returns the data to PROVISIONAL.
- **Reverse if:** a vendor with an independently verifiable total-return series becomes available.

