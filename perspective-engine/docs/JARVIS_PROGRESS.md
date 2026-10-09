# JARVIS progress (Perspective Engine)

Updated: 2026-10-08. Format per phase: IMPLEMENTED / TESTED / VERIFIED / REMAINING / BLOCKED / USER INPUT REQUIRED.

## Phase 1: Discovery and design
- IMPLEMENTED: repository inspection; `docs/JARVIS_ARCHITECTURE.md`, `docs/JARVIS_SECURITY.md`, `perspective-engine/CLAUDE.md`, the core contract (`jarvis/core/types.ts`, `jarvis/core/CONTRACT.md`).
- TESTED: not applicable (documents).
- VERIFIED: findings checked against the repository files and the artifact runtime's own type definitions (no microphone capability; `user.isOwner()` exists).
- REMAINING: none for this phase.
- BLOCKED: none.
- USER INPUT REQUIRED: none (open questions in the architecture document have defaults).

## Phase 2–3: Core and memory
- IMPLEMENTED: `jarvis/core` (zero runtime dependencies): task engine (completion requires verification), policy engine (risk levels 0–3, visitor isolation, level 3 never pre-approvable), tool registry (schema, policy, timeout, backoff retries for safe/low, circuit breaker, audit), audit log with secret redaction, prompt-injection guard (trust labels, unforgeable wrapped blocks), memory (redaction, credential refusal, keyword + recency recall), intent parser (12 kinds), reminder parser, briefing, proactivity scoring, LLM providers (Ollama, Anthropic, Claude Code, artifact sample, rules) with fallback and routing (sensitive work stays local), body model, Perspective Engine adapter.
- TESTED: 395 tests in 15 files pass; `tsc --noEmit` clean in `jarvis/` and the city.
- VERIFIED: the adapter is tested against the real `city/public/state.json`; every graph task maps to exactly one body part owned by the right agent.
- REMAINING: none for the core.
- BLOCKED: none.
- CAPABILITY GAP: Ollama, the Anthropic API and the `claude` CLI were exercised only through fakes here; `sampleProvider` only against the platform's type definitions.

## Auditor (Jarvis as second line)
- IMPLEMENTED: `docs/JARVIS_AUDIT_RUBRIC.md` (8 weighted dimensions informed by NIST AI RMF 1.0, SR 11-7, ISO/IEC 42001, GRADE, first-pass yield and research-integrity definitions; not a certification), `tools/audit.py` (deterministic metrics from the record merged with LLM findings), `graph.py revenue add/list` (founder-only, evidence required), export of `audit` and `revenue` to the live city.
- TESTED: `tools/test_audit.py` passes; graph validates; export stays under the size cap.
- VERIFIED: independent LLM auditors re-checked science, data, finance and legal outputs (findings in `graph/audit/findings/`); gtm, brand, product, ethics and orchestrator audits in progress.

## Phases 4–12
- Not started.
