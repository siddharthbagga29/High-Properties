# JARVIS security model (Perspective Engine)

Jarvis is a security-sensitive agent: it reads untrusted content, holds private memory and can act on a computer. This file lists the threats and the control for each. Controls marked **[built]** have tests; **[planned]** are designed but not yet implemented.

| # | Threat | Control |
|---|---|---|
| 1 | A visitor uses the public page to reach private data or actions | Viewer mode from `user.isOwner()`; visitor tools limited to `scope: public` and `riskLevel: safe` by `policy.decide`; private data stored under `data/users/<owner>/`, which the platform hides from everyone else. **[built in core; page wiring in Phase 8]** |
| 2 | Prompt injection in a web page, document, email, search result or agent output | Trust labels (`system > user > application > memory > tool > external`); untrusted content wrapped as data with a standing rule; instruction-like text flagged; tools never invoked because content asked. **[built in core]** |
| 3 | Over-autonomy | Risk levels 0–3 with confirmation at 2 and 3; level 3 cannot be pre-approved; denied list; audit entry for every decision. **[built in core]** |
| 4 | Secrets leaking into memory, prompts or logs | `redact()` on every audit summary and memory write; memory refuses credential-like text; no secrets in the database. **[built in core]** |
| 5 | Remote control of the Mac | Mac agent binds 127.0.0.1 only; bearer token compared in constant time; Host/Origin checks against DNS rebinding; CORS limited to its own console. **[planned: Phase 5]** |
| 6 | Path traversal / arbitrary file access | File tools resolve real paths and refuse anything outside the allowlisted roots; symlinks resolved before the check. **[planned: Phase 5]** |
| 7 | Command injection | No shell string interpolation; commands run with `execFile` from an allowlist of program + argument patterns; destructive commands are level 3. **[planned: Phase 5]** |
| 8 | SSRF from browser or fetch tools | Block private, loopback and link-local addresses and non-http(s) schemes for agent-initiated fetches. **[planned: Phase 4]** |
| 9 | Runaway retries or loops | Bounded retries with exponential backoff, per-tool circuit breaker, timeouts. **[built in core]** |
| 10 | Fabricated progress | Tasks reach `completed` only with `verifiedBy`; status sentences are computed from task data; the auditor scores honesty. **[built in core + auditor]** |
| 11 | Fake revenue, gate clearances or unblocks (an agent acting as the founder) | Founder actions are signed with the founder's SSH key once it is registered (`graph.py founder-key`): `graph.py authorize` prints the exact request, the founder signs it on their Mac (`ssh-keygen -Y sign -n pe-founder`), `ssh-keygen -Y verify` checks it, and the sequence number stops replay. A key can be replaced only with the current key's signature. The auditor re-verifies every signature independently and flags unsigned founder actions as critical. Tested with real ssh-keygen signatures (`tools/test_founder_auth.py`). **[built; needs the founder to register a key]** Before registration these actions are attested only (honour system). Residual risk: an agent that can edit both `graph.py` and `audit.py` could bypass this; git history and the fingerprint the founder checks make that visible. |
| 12 | Covert visitor surveillance | Session-only, in-memory interaction signals; no keystrokes, form contents, audio, clipboard or identifiers stored or sent. **[Phase 9]** |

Reporting: anything that looks like a security issue is logged as an audit finding with severity `critical` and raised to the founder in the next briefing.
