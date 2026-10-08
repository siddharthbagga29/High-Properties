# JARVIS for Perspective Engine: architecture

Status: Phase 1 (discovery and design) complete on 2026-10-08. Progress is tracked in `docs/JARVIS_PROGRESS.md`.
Scope: Perspective Engine only. The portfolio is a planned second client of the same core and is out of scope for now; the core is built so it can attach later without changes.

Legend used throughout: **[known]** read from the repository or the platform's own type definitions; **[inferred]** a reasoned conclusion not yet tested; **[gap]** a capability that does not exist yet.

---

## 1. What exists today (discovery)

| Area | Finding |
|---|---|
| Repository | `siddharthbagga29/High-Properties`. The root is a separate business site (High Properties real estate: static HTML, a Vercel serverless API, Supabase, Google Analytics and Meta pixel). Its `vercel.json` sets `Permissions-Policy: microphone=()`. **[known]** |
| Perspective Engine | Lives entirely in `perspective-engine/`, which `.vercelignore` excludes from the real-estate deploy. Nothing in this design touches the root site. **[known]** |
| Project truth | `graph/graph.json` (34-task DAG), `graph/ledger.jsonl` (append-only state changes), `graph/activity/<task>.jsonl` (timestamped steps), all written only through `tools/graph.py` and `tools/activity.py`. **[known]** |
| Agents | Nine role cards in `.claude/agents/pe-*.md`, orchestrated by `PROMPT.md`, with an independent verifier per task. **[known]** |
| City (UI) | `city/`: Vite 7, React 19, React Three Fiber 9, zustand, framer-motion. Published as a claude.ai Artifact with runtime capabilities `db` (rules: read `view`, write `owner`), `sample` (Claude, paid by the viewer) and `user`. A rule-based guide answers when `sample` is unavailable. **[known]** |
| Live sync | The orchestrator writes the full export to the Artifact database document `state/current`; open pages subscribe. **[known]** |
| Scheduling | A routine fires every 6 hours into the orchestrator's Claude Code session, which has push access to the repo and write access to the database. **[known]** |
| AI / voice / analytics in PE | The city's Ask tab (Claude via `sample`, rule-based fallback) and Web Audio sound effects. No speech, no memory, no task engine, no analytics. **[known]** |
| Cloudflare | No Cloudflare configuration exists anywhere in the repo. Perspective Engine is served by claude.ai, not a site you control. **[known]** |
| MCP | None in the repo. The orchestrator session has claude.ai connectors (Gmail, Calendar, Drive, Claude Code Remote and others). **[known]** |
| Tooling here | Node 22, Python 3, Playwright with Chromium. No Ollama, no macOS. **[known]** |
| Artifact runtime | Capabilities available: `artifact, assets, comments, db, downloads, files, mcp, room, sample, self, user` and built-in `permissions`. **There is no microphone capability**, so speech input inside the claude.ai page may be blocked. Speech output (`speechSynthesis`) needs no permission. Declaring `mcp` would stop the page being shareable by public link. **[known]** |

## 2. Proposed architecture

One Jarvis platform, several clients. For now: the public Perspective Engine city, a private local console on your Mac, and the orchestrator session as the cloud executor.

```
                              YOU (voice / text)
                                     |
          +--------------------------+---------------------------+
          |                                                      |
  PE CITY (claude.ai page, public link)              LOCAL CONSOLE (127.0.0.1, private)
  owner mode  | visitor mode                         full voice: STT + TTS, notifications
          |                                                      |
          v                                                      v
  +-------------------------------- JARVIS CORE (jarvis/core, TypeScript) -----------------+
  | context engine | task engine | policy engine | tool registry | memory | audit log      |
  | intent + router | LLM providers | proactivity | reminders | briefing | injection guard |
  +-------------------+-------------------------------------+-------------------------------+
                      |                                     |
        claude.ai runtime (db, sample, user)       JARVIS AGENT (jarvis/agent, Node, your Mac)
                      |                             localhost only, bearer token, allowlists
                      v                             files | shell (allowlisted) | browser (Playwright)
        db: state/current (public, read-only)       research | notifications | Ollama / Claude
            audit/scorecards (public)                        |
            data/users/<owner>/jarvis/* (private)            v
                      |                               ~/.jarvis (tasks, memory, audit)
                      v
        ORCHESTRATOR SESSION (Claude Code, cloud)  <- hourly Jarvis routine + 6-hourly build loop
        reads owner requests and reminders, runs builds through the task graph,
        sends push notifications, writes results back
                      |
                      v
        TASK GRAPH (graph.json, ledger, activity) -> agents -> independent verifiers
                      |
                      v
        JARVIS AUDITOR (second line): scores every agent, including the orchestrator
```

Hierarchy: **Jarvis** (your interface, memory, second-line auditor) sits above **Mayor** (first-line orchestrator), which dispatches the nine agents. Jarvis never builds domain outputs itself; it observes, plans with you, delegates through the graph, verifies and reports.

### 2.1 Packages

```
perspective-engine/jarvis/
  core/            framework-free TypeScript, runs in the browser and in Node
    types.ts       the shared contract (written first; every other module implements it)
    tasks.ts       task state machine and the derived status sentence
    policy.ts      risk levels -> autonomy decisions, per viewer (owner / visitor)
    tools.ts       tool registry: schema check, policy, timeout, audit, retry with backoff
    memory.ts      working / episodic / project / decision / preference memory, keyword retrieval
    audit.ts       audit log with secret redaction
    injection.ts   trust labels; untrusted content is data, never instructions
    intent.ts      deterministic intent parsing (status, next, needs-me, remind, do-it, audit, navigate)
    reminders.ts   natural-language due-time parsing and due checks
    briefing.ts    "since your last visit", "what do you need from me" from real records
    proactive.ts   intervention score with cooldowns and annoyance penalty
    providers.ts   LLMProvider interface + sample / Anthropic / Ollama / Claude Code / rules, fallback chain
    router.ts      model routing by task kind and sensitivity
    body.ts        generic assembly model for the evolving body
    adapters/perspective-engine.ts   PE context provider, project status, body map
  agent/           Node daemon for your Mac (Phase 5): HTTP on 127.0.0.1, token auth, tools, console UI
  tests/           vitest
```

The city imports the core through a Vite alias (`@jarvis`). The core has no runtime dependencies.

## 3. Data flow

1. **Observe.** The city receives `state/current` (graph, ledger, activity, excerpts, audit scorecards). The PE adapter turns it into a `JarvisContext`: application, route, focused artifact, tasks by status, recent actions, project status, and the tools available to this viewer.
2. **Understand.** `intent.ts` resolves deterministic intents first (no model call). Anything else goes to the router, which picks a provider: `sample` in the page, Ollama or Claude on the Mac, with the rule-based guide as the floor.
3. **Plan and check permission.** Every action is a `JarvisTask`. Each tool call passes `policy.decide()` before it runs.
4. **Execute.** Page tools (navigate the city, open a task, set a reminder, record a decision, queue a request) run in the page. Build work is never run in the page: it is queued as an owner request and executed by the orchestrator session through the task graph and its verifiers.
5. **Verify.** A task is `completed` only when its result is checked: a page tool checks its own postcondition; graph work needs the independent verifier's `done`.
6. **Update state.** Task changes go to the owner's private database collection; graph changes go through `graph.py` and the live sync.
7. **Learn.** Explicit corrections and repeated preferences become preference memory. Policy never changes from learned behaviour; changes to policy are proposed for your approval.
8. **Notify.** In the page: activity feed and spoken updates. On your phone: push notifications sent by the orchestrator session. On the Mac: macOS notifications and `say`.

## 4. Security boundaries

| Boundary | Rule |
|---|---|
| Public page vs private data | Visitors read only `state/current` and `audit/scorecards`. Jarvis tasks, memory, reminders and requests live under `data/users/<owner id>/`, private by platform rule. Owner mode is decided by `user.isOwner()` and enforced again by the database rules on write. |
| Page vs your Mac | The page never talks to the Mac. The Mac agent listens on 127.0.0.1 only, needs a bearer token, and acts on its own allowlists. |
| Visitor tools | Visitors get only `scope: "public"` tools with `riskLevel: "safe"`: explain, navigate, search the public record. |
| Autonomy | Level 0 automatic (read, search, summarise, draft, navigate), Level 1 automatic within scope (project files, tests, internal artifacts), Level 2 confirm (send, post, purchase, submit, delete important data, production, auth, DNS, security, sharing private data, destructive shell, new permissions, legal or financial commitments), Level 3 always explicit (money, irreversible destruction, credentials, identity or security changes, safety). Configurable in `policy.ts`; never bypassed globally. |
| Prompt injection | Every web page, document, email, search result, agent output and database row from others is labelled `external` or `tool` and wrapped as data. Only system policy and your own authenticated instructions are control. |
| Secrets | Never in memory, prompts, the database or logs. `audit.ts` redacts key-like strings before anything is stored. Mac agent secrets come from environment variables or the macOS Keychain. |
| Revenue | Revenue entries (which complete the face) can be written only by the founder through `graph.py revenue add --founder` with an evidence reference; the auditor flags any entry without evidence. |

Threats and mitigations are detailed in `docs/JARVIS_SECURITY.md`.

## 5. Agent and tool architecture

Tool definition (see `core/types.ts`): id, name, description, input schema, risk level, confirmation requirement, scope (`public` or `owner`), timeout, retry policy, and an `execute` function. The registry wraps every call with: schema validation, `policy.decide`, timeout, bounded retries with exponential backoff, a circuit breaker after repeated failures, and an audit entry.

| Category | Page (city) | Mac agent | Orchestrator session |
|---|---|---|---|
| Information | search the public record, explain, open task | local file search, read approved files | web search, repo reads |
| Browser | navigate within the city | Playwright: open, read, click, type, extract, download | WebFetch / WebSearch |
| Project | create Jarvis task, record decision, queue request | run tests, update artifacts | graph.py, workflows, verifiers |
| Communication | speak, in-page notice | macOS notification, `say` | push notification, Gmail drafts only with your approval |

## 6. Memory architecture

| Level | Where | Contents |
|---|---|---|
| Working | in memory (page / agent process) | current conversation, focused artifact, pending confirmation |
| Episodic | owner-private db (`jarvis-episodes`) and `~/.jarvis/memory.jsonl` | what happened and when: "2026-10-08: founder chose the United States" |
| Project | derived from the task graph, never duplicated | completed, in progress, blocked, waiting on you, next, risks |
| Decisions | owner-private db (`jarvis-decisions`), mirrored to `docs/founder-decisions.md` by the orchestrator | decision, reason, date, project, source |
| Preferences | owner-private db (`jarvis-preferences`) | communication style, voice on/off, quiet hours, research depth |

Retrieval: keyword scoring over memory items plus the graph's own excerpts; prompts receive the top results, never the whole store.

## 7. Voice architecture

| Surface | Speech output | Speech input |
|---|---|---|
| PE city (claude.ai page) | `speechSynthesis`, local to the browser, interruptible | Web Speech API when the browser grants the microphone. **[gap]** The page has no microphone capability, so it is expected to be refused there; the page detects this and says so. |
| Local console (127.0.0.1 on your Mac) | `speechSynthesis` in the browser, or macOS `say` | Web Speech API on localhost (a secure context, so Chrome grants the microphone after your consent). Chrome's recogniser sends audio to Google; a fully local recogniser (whisper.cpp) is optional and documented. |

Turn-taking: push-to-talk or tap-to-talk by default; speaking stops the moment you start talking (barge-in); spoken updates respect quiet hours. An always-listening wake word is **[gap]** and needs a local recogniser on the Mac.

## 8. Visitor intelligence (Perspective Engine city)

Investors and partners who open the city are visitors. The city keeps a **session-only, in-memory** behaviour model; nothing is stored or sent. Signals: focused task or agent, dwell time on one focus, repeated clicks on the same object, back-and-forth between two objects, opening Help. `proactive.ts` turns them into an intervention score (relevance + confusion + repetition + dwell + navigation uncertainty − cooldown − annoyance) and offers help only above a threshold, at most once per cooldown. No keystrokes, form contents, audio, clipboard or identifiers are collected. Cloudflare Web Analytics does not apply here (claude.ai serves the page).

## 9. The evolving body (the Brain becomes Jarvis)

The brain stays the mind at the centre: the plan and the orchestrator. Around it a holographic bust assembles from verified work. Each organ belongs to one agent and fills only as that agent's tasks are verified; prepared tasks waiting on you count as partial; untouched parts stay as faint wireframe.

| Part | Built by | Tasks |
|---|---|---|
| Mind (brain) | Mayor | F01 F02 F05 F07 D01 |
| Crown / skull | Curie (research) | F03 V01 V03 V15 S03 |
| Neck | Tukey (data) | V02 M02 S02 |
| Heart | Ada (product) | F04 V14 M01 |
| Lungs | Milton (ethics) | F06 V04 M03 |
| Ribcage | Ginsburg (legal) | V12 M04 |
| Shoulders and spine base | Pacioli (finance) | V10 V11 M05 S04 |
| Right arm and hand | Ogilvy (go-to-market) | V05 V06 V07 V08 V09 M06 S01 |
| Left arm and hand | Rams (brand) | V13 S05 |
| **Face** | **Revenue only** | Featureless mask until verified revenue exists. Eyes form at the first verified payment, brow and nose at the second paying customer, the mouth at the third. The face completes only with a real flow of revenue. |

Revenue comes only from `graph/revenue.jsonl`, written by the founder with evidence. No agent, routine or Jarvis itself can complete the face.

## 10. The auditor (Jarvis as second line)

Jarvis audits every agent, including Mayor, the way a second line of defence reviews a first line. Scores combine deterministic metrics computed from the record (`tools/audit.py`) with findings from independent LLM auditors that re-check claims, sources and acceptance criteria. The rubric (`docs/JARVIS_AUDIT_RUBRIC.md`) is informed by NIST AI RMF 1.0, Federal Reserve SR 11-7 model-risk validation, ISO/IEC 42001, GRADE evidence certainty, and first-pass-yield quality metrics. It is a rubric informed by these frameworks, not a certification under them.

## 11. Deployment

| Piece | Where it runs | Notes |
|---|---|---|
| City + Jarvis UI | claude.ai Artifact (current link) | same publish path as today; capabilities `db`, `sample`, `user` kept; no `mcp` so the public link keeps working |
| Jarvis core | bundled into the city; imported by the Mac agent | no runtime dependencies |
| Mac agent + local console | your Mac (`npm run jarvis` in `perspective-engine/jarvis`) | localhost only; setup in `docs/JARVIS_SETUP.md` |
| Executor | the orchestrator Claude Code session | hourly Jarvis routine (requests, reminders, push) + 6-hourly build loop |

## 12. Risks

1. Speech input in the claude.ai page is likely refused (no microphone capability). Mitigation: spoken output works there; full voice on the local console.
2. Reminders created in the page reach your phone only after the hourly routine picks them up (up to about an hour late if set for the near future). Exact times are honoured once scheduled.
3. Owner requests made in the page run asynchronously (next hourly run), not instantly.
4. Usage limits have interrupted sub-agents several times; long builds must record interruptions and resume.
5. The Mac agent cannot be executed on macOS from this cloud container; its macOS-specific tools are tested by policy and unit tests only until you run it.
6. LLM auditors can themselves be wrong; their findings carry evidence and are scored separately from deterministic metrics.

## 13. Assumptions

- You are the only owner of the Perspective Engine artifact; `user.isOwner()` identifies you.
- Your Mac runs a recent macOS with Node 20+; Ollama is optional.
- Push notifications reach you through the Claude app.

## 14. Open questions (not blocking)

1. Keep the page shareable by public link (current), or make it owner-only so it can use connectors (`mcp`) for instant execution? Default: keep it shareable.
2. Should audit scorecards be visible to visitors? Default: yes, for transparency.
3. Local recogniser (whisper.cpp) for fully offline voice on the Mac? Default: optional, documented.

## 15. Implementation plan

| Phase | Deliverable | This round |
|---|---|---|
| 1 Discovery | this document, progress file, security notes, `CLAUDE.md` | yes |
| 2 Core | context, tasks, policy, tools, audit, injection, intent, router, providers | yes |
| 3 Memory | episodic, project, decision, preference memory and retrieval | yes |
| 4 Browser | Playwright tool in the Mac agent | scaffold + tests |
| 5 Mac agent | localhost daemon, token auth, allowlisted tools, console | scaffold + tests |
| 6 Voice | TTS everywhere, STT where granted, barge-in, spoken updates | yes |
| 7 Portfolio | adapter only (out of scope) | no |
| 8 Perspective Engine | Jarvis in the city, owner and visitor modes, body | yes |
| 9 Visitor intelligence | session-only interaction model and offers | yes |
| 10 Proactivity | briefings, reminders, push, spoken updates | yes |
| 11 Hardening | injection, permission, visitor-isolation tests | partial |
| 12 Deployment | publish, routines, docs | yes |

**Smallest safe vertical slice:** you open the city → Jarvis greets you with a briefing derived from the record → you say or type "remind me tomorrow at 9 to review batch one" → a task is created, checked by the policy engine, stored privately, confirmed aloud → the hourly routine schedules it → at 9:00 your phone receives the push and the task completes in the activity feed.
