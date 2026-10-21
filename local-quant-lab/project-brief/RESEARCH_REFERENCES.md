# Research references for the build brief

These sources inform the architecture and risk framing. Re-check the applicable documentation and rules before adding any broker integration.

1. **Jane Street, Overview** — https://www.janestreet.com/what-we-do/overview/  
   Describes Jane Street as a research-driven trading firm combining quantitative analysis, market mechanics, machine learning, proprietary technology, global market access, and human expertise. Useful as a process inspiration; it does not disclose proprietary strategies or create a replicable blueprint for its economics.

2. **Jane Street, Client Offering** — https://www.janestreet.com/what-we-do/client-offering/  
   Describes liquidity provision, trading venues, ETFs/equities/bonds/options, and proprietary routing/platform technology.

3. **Jane Street, How to Build an Exchange** — https://www.janestreet.com/tech-talks/building-an-exchange/  
   Discusses exchange-engine throughput and deterministic latency as systems-engineering challenges. It is a useful reminder that HFT is not just a dashboard or an LLM-agent organization chart.

4. **SEC, Risk Management Controls for Brokers or Dealers With Market Access (Rule 15c3-5)** — https://www.sec.gov/rules-regulations/2011/06/risk-management-controls-brokers-or-dealers-market-access  
   Official SEC rule overview describing market-access financial/regulatory risk controls, thresholds, erroneous-order prevention, supervisory procedures, and review. This project is not a broker-dealer compliance implementation and remains paper-only.

5. **SEC staff FAQ on market-access controls** — https://www.sec.gov/rules-regulations/staff-guidance/trading-markets-frequently-asked-questions/divisionsmarketregfaq-0  
   Additional explanation about risk controls, erroneous automated orders, and obligations relevant to covered market access. Consult qualified counsel and broker documentation before any future live use.

6. **Interactive Brokers API documentation** — https://www.interactivebrokers.com/docs/  
   Official overview of supported API methods. Listed only as a possible future paper-broker adapter reference; not required for v1.

7. **Interactive Brokers TWS API limitations / paper-trading notes** — https://www.interactivebrokers.com/docs/tws-api/doc/notes-limitations/tws-api-limitations  
   Official notes that simulated/paper behavior, including executions, can differ from live trading. The prototype must communicate these limitations.

8. **Founder portfolio** — https://siddharthbagga29.github.io/  
   Portfolio-stated qualifications and projects summarized in `PROJECT_CONTEXT.md`. Treat claims as portfolio descriptions, not audited facts.


9. **Nous Research, Hermes Agent repository** — https://github.com/NousResearch/hermes-agent  
   Official open-source Hermes Agent repository. Review its current license, release/version, supported interfaces, security model, memory and skills functionality before installing. Do not rely on third-party copies or stale instructions.

10. **Hermes Agent, Quickstart** — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/quickstart.md  
    Official setup guidance, supported providers, and current context-window requirements. Re-check before choosing a runtime.

11. **Hermes Agent, Local Models** — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/local-models.md  
    Official local inference guidance. Local inference avoids provider API charges but remains constrained by hardware capacity, context support, memory, speed, disk, and power.

12. **Hermes Agent, Persistent Memory** — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory.md  
    Describes the built-in bounded cross-session memory and search. Use versioned project files as the portable source of truth across different AI systems.

13. **Hermes Agent, Memory Providers** — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory-providers.md  
    Describes memory backend choices, including local SQLite-based Holographic where supported. Follow the installed version's current docs/CLI, since provider packaging may change.

14. **Nous Research, Hermes Agent Self-Evolution** — https://github.com/NousResearch/hermes-agent-self-evolution  
    Optional experimental evaluation project for optimizing skills/prompts/code. Evaluate compatibility and reproducible benefits before adding it. Do not allow self-evolution code to change risk rules or live execution boundaries.
