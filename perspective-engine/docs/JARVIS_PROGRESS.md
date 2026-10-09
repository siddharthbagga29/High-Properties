# JARVIS progress (Perspective Engine)

Updated: 2026-10-09. Format per phase: IMPLEMENTED / TESTED / VERIFIED / REMAINING / BLOCKED / USER INPUT REQUIRED.

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
- VERIFIED: independent LLM auditors re-checked the outputs of all nine agents (findings in `graph/audit/findings/`, 53 in total plus one note per agent of what checked out).
- RESULTS (2026-10-09): legal 97.1 A and finance 85.9 B meet the institutional bar; product 76.9 C, science 74.4 C, data 73.4 C, brand 67.4 D, orchestrator 60.9 D, gtm 59.5 F and ethics 58.3 F do not. The main causes are 19 closures made without a verifier record and open evidence findings.
- FIXED SINCE (by the orchestrator, logged in the activity record and pending independent re-check): the one critical finding (the landing page said "co-designed with paid ADHD advisors" when none are engaged), the same claim in outreach and the LOI, and founder-decisions item 2.
- Founder actions are now signed: once the founder registers an SSH public key (`graph.py founder-key`), revenue entries, gate clearances and unblocks need the founder's `ssh-keygen -Y sign` signature over that exact action, and replay is refused. The auditor re-verifies each signature on its own. 29 tool tests pass, including real ssh-keygen signatures, forged keys, replay, key swap and fail-closed.
- Scoring fixes: positive "checked" notes no longer deduct; missing-verifier findings are not counted twice; a verification made only after closing earns half credit.
- REMAINING: rework of the other open findings by their owners with an independent re-check (queued after the surfaces finish).
- USER INPUT REQUIRED (optional, about 2 minutes): register your signing key so founder-only actions become cryptographic rather than honour-system. On your Mac run `cat ~/.ssh/id_ed25519.pub` (or `ssh-keygen -t ed25519` first if it says no such file) and send me the line; it is a public key, safe to share.

## Phases 4–12
- Not started.
