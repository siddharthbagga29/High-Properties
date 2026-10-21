# Portable Project Context — Local Quant Lab

**Last updated:** 2026-10-21  
**Status:** v0.1.0 plus portfolio backtester, second strategy, pre-registered walk-forward and a restartable paper forward log, implemented and tested offline (see docs/BUILD_STATE.md for the current test count; Linux container). Hermes runtime on the Mac not yet installed (needs founder). Live state: `docs/BUILD_STATE.md`.  
**Current project direction:** Build a local-first algorithmic trading research, backtesting, risk, and paper-trading system. This supersedes the earlier Perspective Engine startup as the active build objective. Keep Perspective Engine as reference material only unless the founder explicitly reactivates it.

## 1. The goal

Build an interactive, locally runnable quantitative trading lab inspired by the *workflow discipline* of professional market-making and quantitative trading firms. It should be visually rich, but the interface must expose real system state and measurable results rather than decorative or invented metrics.

The system should have designated components/agents for data intake, market-data quality, strategy research, backtesting, independent criticism, risk review, order simulation, monitoring, and post-trade audit. Use AI agents for research and asynchronous critique. Do not put an LLM in the latency-critical order path or give an LLM authority to bypass deterministic trading controls.

The first deliverable is a functioning local app with historical research and simulated/paper execution. It must not make live trades by default. It must not require company formation, paid cloud infrastructure, a paid market-data subscription, or brokerage credentials to launch the initial offline demo. Live brokerage connectivity is a later, explicitly gated extension.

## 2. Founder profile from the supplied portfolio

Portfolio: https://siddharthbagga29.github.io/

The public portfolio describes the portfolio owner as a valuation and commercial due-diligence analyst with an M.S. in Financial Mathematics from the University of Cincinnati and a graduate certificate in Quantitative Finance. It lists:

- Strategic Finance Lead at Turnkey Services Pro: underwriting a $6M+ multistate acquisition pipeline; normalized EBITDA and backlog analysis; IRR/MOIC and purchase-price sensitivity; go/no-go investment memoranda; private-company valuation cases; a reported 6% operating-expense reduction; and Reg D offering materials.
- Financial Associate at Turnkey Services Pro: building DCF, free-cash-flow, AR/AP, and job-costing tools from bank statements.
- Wealth Management Intern at Cerity Partners: daily reporting turnaround improvement.
- Selected projects: S&P Global multi-scenario DCF; Risk Tolerance Analysis; Strategy Lab with interactive allocation/risk-rule backtests; High Properties full-stack lead platform; and a Jarvis voice assistant mentioned on the site.
- Education: M.S. Financial Mathematics, University of Cincinnati; Graduate Certificate in Quantitative Finance; B.Com. (Honors) Finance; Bloomberg Market Concepts. The site explicitly says the CFA Level I exam has not yet been taken.

Treat these as portfolio-stated facts, not independently audited claims. Do not inflate skill level or state that the founder has institutional HFT experience. Use the profile as evidence of fit for quantitative analysis, financial modeling, risk analysis, investment research, and business decision support.

## 3. Legacy uploaded ZIP: Perspective Engine City

The uploaded `Perspective Engine City.zip` has been retained under `reference_materials/` for portability. The ZIP contains an `index.html`, bundled/minified JavaScript/CSS assets, and `state.json`. It does **not** include the source files that its graph says were produced under paths such as `perspective-engine/graph/graph.json`, `perspective-engine/tools/graph.py`, or `perspective-engine/mvp/index.html`.

What `state.json` says:

- Project: Perspective Engine.
- North star: a validated, co-designed perspective-taking simulator with 3 paid B2B pilots and a published pilot study by month 12.
- Its workflow graph lists 34 nodes: 19 `done`, 8 `pending`, and 7 `awaiting_human` at the time the state file was generated (2026-10-10).
- Nine role labels are used for orchestration, science, ethics, product, data, go-to-market, finance, legal, and brand.
- The site concept is an explorable “city” view that maps the venture to tasks and records.

This is useful as an example of a persistent workflow graph, explicit task statuses, acceptance criteria, human gates, and a visually explorable control room. It is not a trading system and should not be treated as validated production code. Do not spend effort finishing its old startup roadmap as part of this project.

## 4. Visual reference supplied separately

`reference_materials/dashboard_visual_reference.png` is a screenshot of a Threads post showing a dense, dark institutional-style trading dashboard. Desired design cues:

- Deep navy/obsidian background with restrained cyan, green, amber, and red status colors.
- Persistent top status strip with runtime, data freshness, mode, connection, and system status.
- Dense but legible quantitative panels: equity curve, candlesticks, spread/depth, portfolio/exposure, latency/freshness, scenario or risk distributions, activity/event ledger, strategy health.
- A striking central visualization is acceptable only if it encodes real state (strategy relationships, portfolio exposures, execution flow, or market regime). It must never imply real-time market data or profitable results when unavailable.
- Prefer high-quality motion sparingly, and provide a reduced-motion mode and a functional 2D fallback. Mobile layout and keyboard accessibility must still work.

Treat the screenshot as visual inspiration, not as a requirement to recreate another person's exact interface or invent metrics from it.

## 5. Desired autonomy and interaction model

- Founder wants human involvement only when genuinely necessary.
- Claude Code should proceed using reasonable documented defaults and should not stop at a plan or boilerplate. It should inspect the repository, implement, run tests, fix failures, perform a skeptical review, and continue until the local acceptance criteria are met.
- Do not create a company, submit forms, contact people, open accounts, spend money, deploy to public infrastructure, or place live trades.
- Ask for human intervention only when a blocked action truly requires credentials, legal authority, money, a subjective founder decision that materially changes the architecture, or real-world authorization.
- Keep a durable record of changes so work can resume if the agent/process is interrupted.

## 6. Minimum scientific standard

The app should make it easy to discover that a strategy has no demonstrated edge. A strategy is not successful because a chart is green or one backtest made money. Evaluation needs realistic transaction costs, slippage/spread assumptions, temporal train/validation/test separation, protection against look-ahead bias, benchmarks, drawdown and tail-risk measurements, sensitivity analysis, and paper-trading evidence.

Clearly distinguish:

1. Synthetic/demo data.
2. Downloaded historical data, with provider and retrieval timestamp.
3. Simulated backtest results.
4. Paper-trading results.
5. Live account results, which should not exist in the initial deliverable.

Never label synthetic or delayed data as live. Never claim a strategy is profitable without explicit, reproducible evidence and caveats.

## 7. Hermes Agent: persistent learning and orchestration layer

The founder wants the system to use the official open-source NousResearch Hermes Agent (`https://github.com/NousResearch/hermes-agent`, MIT license at time of review) for persistent memory, cross-session recall, reusable skills, and asynchronous agent tasks without buying a new Hermes subscription.

Hermes is an agent/memory/workflow layer, not the trading engine and not a substitute for deterministic risk code. The application must keep a version-controlled, model-portable project source of truth, while Hermes adds its own memory and reusable procedural skills. Claude Code and Hermes do not automatically share private memory: the project needs an explicit documented bridge and portable exports.

Default economics and privacy: prefer local inference (e.g. a compatible Ollama/llama.cpp endpoint or the current documented Hermes local-model workflow), no paid provider, no paid cloud memory, and no new subscription. Hermes is open source, but model inference still uses local compute/storage/energy; hosted inference can incur charges and transfer data. The current official Hermes documentation specifies at least a 64K context window, so the selected model and runtime must be checked against machine RAM, disk, actual supported context and speed. Do not download a large model until suitability is checked. If no adequate local model fits, keep the product's deterministic/non-LLM workflows fully functional and document the trade-off rather than enabling a hosted provider silently.

Use Hermes for persistent memory, research planning, asynchronous strategy review, explaining test failures, skill reuse, and scheduled project maintenance when these tasks add measurable value. Do not put LLMs in the signal-to-order path. Do not grant Hermes live broker access, permission to modify hard risk limits, credentials, or authority to promote an unproven strategy. It may propose candidate skills; only measured regression tests and independent review can promote them. No autonomous self-modification of risk/security boundaries.

The primary shared memory remains `PROJECT_CONTEXT.md`, `docs/DECISIONS.md`, `docs/BUILD_LOG.md`, `docs/BUILD_STATE.md`, `docs/RESEARCH_LEDGER.md`, `docs/DATA_PROVENANCE.md`, `docs/ACCEPTANCE_CHECKLIST.md`, machine-readable state, and audit events. Hermes's built-in memory and optional local Holographic SQLite provider supplement these artifacts, not replace them. Keep approved project skills in a version-controlled project directory and exclude Hermes's private global memory/secrets from portable exports.

Official starting references:
- Repo: https://github.com/NousResearch/hermes-agent
- Quickstart: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/quickstart.md
- Local models: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/local-models.md
- Persistent memory: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory.md
- Memory providers: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory-providers.md
- Optional self-evolution research: https://github.com/NousResearch/hermes-agent-self-evolution

The build prompt is the engineering contract for implementation and tests. See `HERMES_INTEGRATION_SPEC.md` for the operating model.

## 8. Reference sources to start from

- Portfolio: https://siddharthbagga29.github.io/
- Jane Street overview: https://www.janestreet.com/what-we-do/overview/
- Jane Street client offering / liquidity provision: https://www.janestreet.com/what-we-do/client-offering/
- Jane Street exchange engineering talk: https://www.janestreet.com/tech-talks/building-an-exchange/
- SEC Rule 15c3-5 overview: https://www.sec.gov/rules-regulations/2011/06/risk-management-controls-brokers-or-dealers-market-access
- SEC staff FAQ on market-access controls: https://www.sec.gov/rules-regulations/staff-guidance/trading-markets-frequently-asked-questions/divisionsmarketregfaq-0
- Interactive Brokers API documentation: https://www.interactivebrokers.com/docs/
- Interactive Brokers TWS API limitations / paper trading notes: https://www.interactivebrokers.com/docs/tws-api/doc/notes-limitations/tws-api-limitations

These links are starting points, not proof that the local prototype satisfies any regulatory standard or replicates the systems of an institutional trading firm.

## 9. Explicit non-goals for v1

- Do not claim to replicate Jane Street, its proprietary strategies, infrastructure, or profits.
- Do not claim microsecond/low-latency HFT capability from a MacBook or ordinary retail broker connection.
- Do not use an LLM to decide or approve trades in place of a deterministic risk engine.
- Do not permit live trading by default or store brokerage secrets in source control.
- Do not optimize strategies on the test set or repeatedly tune until historical performance looks good.
- Do not use leveraged, short, options, futures, or crypto instruments by default; the initial universe should be a small, explicitly configured set of liquid, unlevered instruments or local sample data.
- Do not fabricate quotes, fills, slippage, P&L, latency, market depth, connectivity, or agent activity to make the dashboard impressive.
- Do not start company formation or a monetization process before a working, independently tested product and a validated strategy/revenue path exist.

## 10. Definition of success

Software success and trading-edge success are separate. The software is ready when the app can be installed and launched locally, its major workflows work end-to-end, data provenance is visible, risk rules are tested and cannot be bypassed by agents, results are reproducible, logs and recovery work, and documentation is accurate. Trading-edge success remains **unproven** until a sufficiently rigorous out-of-sample and paper-trading process supports it. An honest negative result is better than manufactured alpha.
