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

## Phase 4–5: Mac agent and browser tool (`jarvis/agent`, `docs/JARVIS_SETUP.md`, `docs/JARVIS_OPERATIONS.md`)
- IMPLEMENTED: Node daemon bound to 127.0.0.1 only (refuses any other host); bearer token (env or `~/.jarvis/token`, mode 0600, constant-time compare); Host and Origin checks against DNS rebinding; JSON API (status, tasks, ask, tools, audit, memory, reminders); local console with voice (Web Speech STT, speechSynthesis TTS, barge-in), briefing, tasks with confirm buttons, reminders and audit feed; 18 tools through the core registry and policy (allowlisted file roots with realpath/symlink checks, `execFile` command allowlist with no shell strings, macOS open/notify/say, Playwright browser tools, DuckDuckGo research labelled as external content); SSRF guard on agent-initiated fetches; persistence in `~/.jarvis` with redacted audit; reminder scheduler; model routing (Ollama with RAM-based size advice and no auto-pull, Anthropic API, `claude -p`, rules fallback); setup and operations guides; `.env.example` with names only.
- TESTED: 566 tests in 22 files pass in `jarvis/` (core and agent); `tsc --noEmit` clean. The tests include a real server on a random port, 401 and 403 cases, path traversal, symlink escape, metacharacters, SSRF, needs-confirmation and the reminder scheduler with an injected clock.
- VERIFIED: an earlier run found two real defects (the start guard threw instead of rejecting, and a secret reached `audit.jsonl` unredacted); both are fixed and covered by tests.
- CAPABILITY GAP: nothing macOS-specific (open, osascript, say, Keychain, launchd, microphone permission) could run in this Linux container; those tools are covered by argument and policy tests and marked "untested on macOS" in the docs. No Ollama, microphone or speech engine here: model detection was tested with fake HTTP responses.
- USER INPUT REQUIRED: to use it, follow `docs/JARVIS_SETUP.md` on your Mac (Node 20+, `npm install`, `npm run jarvis`); optional Ollama and Playwright Chromium. Nothing is needed for the website.

## Phase 6, 8, 9, 10: Jarvis in the city (voice, owner and visitor modes, body, proactivity)
- IMPLEMENTED: "Talk to Jarvis" bar (text, mic, speak toggle, listening ring only once capture really starts, speaking waveform, Stop; typing or the mic stops speech at once); presence (Online · Currently · Done since your last visit · Needs you · Next); console with Brief, Talk and Agents tabs; deterministic answers from the record for status, next, needs-me, since-last, scorecards, navigation, explain and stop; anything else through Claude via the artifact's `sample` with the record wrapped as untrusted data, and a rule-based fallback; owner-private reminders, requests, decisions, tasks and memory in the founder's own database subtree (`data/users/<id>/jarvis/...`); build work only ever queued for the orchestrator; visitor mode limited to public tools; session-only, in-memory visitor help offers with a cooldown and a privacy line in Help; one spoken briefing per owner visit respecting quiet hours and mute. The evolving body: a holographic bust whose parts fill from verified tasks per agent (prepared work shows violet, unbuilt is a faint wireframe), a particle stream from an agent's district to its organ when a task is verified, hover and click per part, and a face that stays a blank mask until verified revenue (eyes at the first paying customer, brow and nose at the second, mouth at the third).
- TESTED: 148 city tests in 12 files pass; `tsc` clean; production build passes; the release check (`scripts/check.mjs`: entrance, world, agent, task, brain, replay, bad deep link, phone) shows no page errors, console errors or failed requests.
- VERIFIED: screenshots at 1440×900, 1280×800, 1024×768 and 390×844, visitor and simulated owner, console open; mic refusal shows the honest message and hides the mic; a visitor offer appears after about 25 s on one task; with the Jarvis chunk blocked the city still works; face stages checked with injected test revenue in the browser only (nothing written to the record). Published as version 8 of https://claude.ai/artifact/D4mz6TQGSr2Lcm6hCo2tTg; visitors are refused writes (checked with `as_level`), and the owner path resolves to the founder's own id.
- CAPABILITY GAP: owner mode ran against fakes and a simulated runtime, not inside claude.ai; real speech recognition and audible speech were not verified (no microphone here, and the claude.ai frame is expected to refuse the mic, which the page then says); animation smoothness was judged from still frames because software WebGL renders at 1–2 fps.
- REMAINING: brain click still opens the plan inspector rather than the Jarvis console (the presence and the bar open Jarvis).

## Phase 10–12: Reminders to your phone, routines and deployment
- IMPLEMENTED: routine "Jarvis hourly: deliver due reminders" (`trig_01Kf8vjgpiApGzVYBAbhGPPE`, a fresh session every hour at :48 UTC, push and email notifications on) marks each due reminder delivered and replies with the reminder lines, which is what reaches your phone and email; a reminder arrives within an hour after it is due. The orchestrator routine (`trig_01RNwgUpCB6oYUtt22vE5LaU`, every six hours) applies decisions and works queued requests. The page states both cadences as they really are.
- TESTED: end to end on 2026-10-09: a test reminder written to your private subtree was read by a fresh routine session, marked delivered at 13:48:21 UTC and announced in its reply. The first design (one routine per reminder) failed in testing because routine-fired sessions cannot create routines; that is recorded as a capability gap and the design was changed.
- CAPABILITY GAP: whether the push reached your phone and the email your inbox can only be confirmed by you; a run with nothing due replies "Nothing to deliver." and should not notify you, which is also unconfirmed.
- USER INPUT REQUIRED: tell me whether the test reminder ("Test from Jarvis: reminders now reach your phone and email") arrived, and whether you get hourly "Nothing to deliver" notices (if so, I will turn email off).

## Phase 7: Portfolio
- Out of scope this round, as requested: the core is framework-free and the adapter pattern (`jarvis/core/adapters/`) is where a portfolio adapter would go.

## Phase 11: Hardening
- IMPLEMENTED: injection labelling and wrapping, policy and visitor-isolation tests in the core, city and agent; signed founder actions with an independent auditor re-check.
- REMAINING: an external penetration test of the Mac agent on a real Mac.
