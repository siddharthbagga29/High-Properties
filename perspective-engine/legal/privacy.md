# Privacy-by-design data map: browser MVP v0 (node V12)

**DRAFT. REVIEW WITH COUNSEL. A checklist and analysis for counsel, not legal advice.** Prepared by Ginsburg (legal agent), 2026-10-07. Subject: `perspective-engine/mvp/index.html`, build `0.1.0-F04`, and `mvp/README.md`.

## Summary
Everything the app handles sits in page memory on the participant's device. It sets no cookies, localStorage, sessionStorage, IndexedDB or Cache entries (checked in headless Chromium) and made 0 network requests in 3 sessions and its own 59-check self-test (CSP `connect-src 'none'`). Reload or "Erase everything" deletes it. The only outputs are files or clipboard text the participant chooses to create: a dose-only JSON export, checked field by field against 3 real exports. There are no biometrics, camera, microphone, location, identifiers or free text. Working view for counsel: GDPR and UK GDPR are not engaged by the app alone but are once the team receives any file; HIPAA and FERPA do not apply on current facts. Each has a named trigger. Section 8 holds 6 findings; section 9 is the "before any server" checklist.

## 1. Scope and method
- Read: `mvp/index.html` (data, export and storage code, intro and Done screens) and `mvp/README.md`. Nothing else was read; the charter and instruments spec are cited only as the README cites them.
- Run (Playwright 1.56, headless Chromium, fake clock, `file://`): 3 end-to-end sessions with the real "Download JSON" button: (a) full, with 3 workplace changes, (b) M5 on, pause, Ease off, Stop in round 2, (c) M5 on, 2 skips, round 2 to the end. Plus the page's own `#selftest` at 1280 px: 59 of 59 pass, 0 requests, 0 page errors.
- Storage probe after each session: localStorage 0, sessionStorage 0, cookies 0 in all 3. IndexedDB 0 databases and CacheStorage 0 keys in sessions (a) and (c) (the probe was added after (b)). Service workers were not probed (not available on `file://`).
- Not covered: Safari, Firefox, real devices, any hosted copy, and the M5 lock and cue events (the board never locked in my sessions, so `M5_lock_*` and `M5_cue_*` lines are read from code only, unverified in a real file).

## 2. Data elements (all device-only)
Home for everything below: JavaScript state `S` in the open tab. Nothing is persisted by the app. Retention for all "memory" rows: until the tab is closed, the page reloaded, or "Erase everything and start over" (`location.reload()`) is pressed.

| # | Element | What it holds | Shown on screen | In export | Retention |
|---|---|---|---|---|---|
| 1 | Consent flag | given, text version `v0-draft-2026-10-06`; a session-clock time is held but not exported | no | yes (flag + version) | memory |
| 2 | Session ID | 6 random bytes (`crypto.getRandomValues`), 12 hex chars; not derived from device or person | no | yes, and in the file name | memory |
| 3 | Start minute | `started_at_utc_minute`, e.g. `2026-10-07T19:25Z` | no | yes. The only wall-clock value in the file | memory |
| 4 | Settings | sound, volume, motion mode, reading pace, form mode, forms used, offers on/off | yes | yes | memory |
| 5 | Condition parameters | per mechanism: enabled, intensity, parameters, custom flag, evidence grade. Design values, not about the person | yes (panel) | yes | memory |
| 6 | Workplace-change toggles | follow, quiet, deadline: on/off, in order | yes | yes | memory |
| 7 | Day-0 answers, T0 and T1 | distress 0-10; AAI-self 10 items Y/N/NA (T0 only); intention 5 x 1-7; self-efficacy 1; knowledge 2 T/F/Not sure; IOS 1-7; 2 instruction checks per wave; `n_answered`, `skipped` | yes (while answering) | yes | memory |
| 8 | Derived counts | per wave: AAI share, intention mean, knowledge and check counts | no | yes (`derived`) | memory |
| 9 | Practice selection | chosen ids, count, time units, share on AAI menu, order shown, slots, budget | yes | yes | memory |
| 10 | Toolkit take-up | template name + action (open, copy, download) | no | yes (no times) | memory |
| 11 | Task dose | per round: phrases missed, words lost, M2 delay list/mean/CV/max, late count, intrusion and notification counts and rates, pulled count, `duration_s`, `D_s`, `skips_count`, M1/M4/M5 event details | yes (comparison table) | yes | memory |
| 12 | Task behaviour | chosen answers, correctness, per-question response time, To/Cc/Attach choices, wait choice and elapsed, words lost at each click, M5 board accuracy, session-clock time on every event, step labels | partly (comparison table shows counts, wait choice and wait seconds) | **no**. Dropped on purpose | memory |
| 13 | Safety telemetry | total and per-screen seconds, pauses (`why`, seconds), Ease-off count, Stop (`screen`, `cond`), debrief status and seconds, `session_completed` | no | yes | memory |
| 14 | Event log | untimed lines: consent, measures_done, run_start/end, setting, ADAPT, M1_start/end, M4_event, pause/resume, ease_off, skip, STOP, debrief_done, practice_saved | no | yes | memory |
| 15 | Live facilitator log | last 90 lines with session times, plus step, screen, response and wait lines | yes (panel only) | **no** | memory |

Also not stored: any sound input. Audio is output only (Web Audio, `AudioContext`); no `getUserMedia`, `mediaDevices`, `MediaRecorder` or `geolocation` call exists in the file (grep, 0 matches).

## 3. Export file: fields checked against 3 real exports
16 top-level keys, identical in all three: `schema`, `app_version`, `node`, `session_id`, `started_at_utc_minute`, `privacy`, `framing`, `parameter_note`, `consent`, `settings`, `mechanisms`, `adaptations`, `conditions`, `day0_measures`, `telemetry`, `events`. Files were 14.5 to 17.4 KB, 164 to 178 distinct key names.

| Key | Fields seen |
|---|---|
| `privacy` | 7 booleans, all `false`: personal_identifiers_collected, device_and_place_data_collected, biometrics_stored, network_requests_made, free_text_collected, task_answers_collected, step_and_response_timing_collected |
| `consent`, `settings` | given, text_version; sound, volume, motion, reading_pace_s, form_mode, forms, adaptations_offered, day0_measures_included, m5_block_in_load_round_only |
| `mechanisms` | M1 to M5: enabled, evidence_grade, intensity, custom_parameters, params |
| `adaptations` | toggles[adaptation, on], note |
| `conditions.baseline` / `.load` | form, summary (16 dose keys), phrases[i, missed], m2_responses[registered, slow_tail, coupled_to_m1], wait{D_s}, m2_delays_s[], m1_intrusions[id, dur, share, words_lost, phrases_missed], m4_events[captured, p, dwell], m5 (null, or locked_s, cues_shown, cues_missed), skips_count |
| `day0_measures` | T0, T1 (wave, answers, n_answered, skipped), derived, practice_selection, toolkit_clicks[item, action], administered[], not_administered[] |
| `telemetry` | total_duration_s, screen_seconds, pauses[why, seconds], ease_off_count, stop (null, or screen, cond), debrief{seen, reached_end, seconds, completed}, session_completed |
| `events` | 22 lines (a), 16 (b), 16 (c); types seen: consent, measures_done, run_start, run_end, setting, ADAPT, M1_start, M1_end, M4_event, pause, resume, ease_off, skip, STOP, debrief_done, practice_saved |

**Confirmed absent in all 3 files:** correctness, chosen options, per-question or send response time, wait choice and wait seconds, To/Cc/Attach, `pull_peak`, `rt_s`, step labels, `step`/`screen`/`response`/`wait_resolved` lines, `t` stamps, and device, user-agent, location, name, email or employer keys.
**README matches** every point above except the two small gaps in section 8, finding 1.

## 4. Not collected, and why no biometrics in v0
Not collected: name, email, employer, account, IP (by the app), device or browser data, location, free text, photos, audio or video input, cookies, any stored identifier. The export's `biometrics_stored:false` is a fixed value in the code (finding 2), so the evidence is the code review and run above, not the flag.

Reasons v0 stores no biometrics:
1. **No purpose.** v0 illustrates group-level patterns from design parameters ("dose") and ends in a debrief and a planning step. It never needs to measure the person. Minimisation (GDPR Art. 5(1)(c); charter section 4 as cited in the README) says do not collect what the purpose does not need.
2. **Legal weight.** Biometric data for unique identification is a special category (GDPR Art. 9(1); definition Art. 4(14)). Some US state laws add consent, notice and retention duties and, in Illinois (BIPA, 740 ILCS 14), a private right of action (unverified, from memory). The EU AI Act restricts inferring emotions in the workplace and education (Art. 5(1)(f), from memory, unverified). Any camera, voice or gaze "attention" measure would sit squarely in these.
3. **Claims boundary.** The product stays in education and general-wellness framing: no diagnosis, screening, score or treatment claim. A measured attention or physiological signal would read as assessing a person's condition and would push toward device-style claims (FDA general wellness policy; version in force unverified).
4. **Harm and trust.** The audience includes people who may have the condition and are wary of being assessed. The app says it "does not diagnose, screen, score or rank". Measuring the person would contradict that.
5. **Behavioural signals held in memory are not biometric templates.** Response times and choices (row 12) exist in memory during a session and are not exported or used to identify anyone. Counsel may confirm that transient, non-identifying use is outside Art. 4(14).

Rule for later versions: no biometric, physiological, camera, microphone or keystroke-dynamics data without a written purpose, counsel sign-off, a DPIA and a harm review.

## 5. Where data can leave the device (all participant-initiated)
| Path | What goes | Notes |
|---|---|---|
| Download JSON | the export | file name embeds the session ID. Lands in the Downloads folder; OS or browser sync/backup (for example cloud folders) may copy it. The app cannot see or recall it |
| Copy JSON | the export as text | system clipboard; cloud clipboard or clipboard history may keep it |
| Toolkit copy/download | static template text | contains no participant data |
| Screen sharing or projection | on-screen counts, wait choice, wait seconds, facilitator log | the comparison table and panel show more than the export does |
| Hosting (if a copy is ever hosted) | HTTP request metadata (IP, user agent, URL, time) to the host | outside the app and outside the CSP. No hosted copy is known; unverified |

The README says run from `file://` or a local `python3 -m http.server`. Neither sends data to the team.

## 6. Applicability analysis (for counsel; each point is a working view)
**GDPR (Regulation 2016/679).**
- *App alone.* Data is processed in the participant's browser and the team cannot read it. Working view: the team has no controller or processor role for in-browser data it never receives (Art. 4(7), 4(8)). Whether supplying the code, or a host who runs a workshop, changes that is for counsel.
- *Once files are received.* Treat every export as personal data (pseudonymous), not anonymous. No direct identifier, but a random ID, a start minute, attitude answers, and the channel it arrives by (an email sender) can single a person out (Recital 26, "means reasonably likely"). Write "contains no personal identifiers", never "anonymous".
- *Special categories (Art. 9).* No item asks for the participant's own diagnosis. The file holds attitudes, intentions and a 0-10 "distress now" rating (a momentary state, arguably data concerning health on a broad reading, Art. 4(15)), on an ADHD-related topic. Low but not zero: handle as sensitive. Do not add own-diagnosis or medication items without counsel and a DPIA.
- *Consent.* The intro checkbox is an acknowledgement of what the session is. It is not an Art. 6 or Art. 9(2)(a) consent to processing by the team. If files are collected, a separate, specific, explicit consent or another basis is needed. Consent at work is hard to show as freely given (Art. 7(4), Recital 43); the charter's "an employer must not require the file" helps. Specific guidance on employment consent: unverified here.
- *By design (Art. 25).* Minimisation, storage limitation and transparency are met in the build (rows 11 to 15). Transparency for any team-held data (Arts. 12-14) has no controller name or contact yet; the README says the concerns route is "not set up".
- *Transfers (Ch. V), DPIA (Art. 35).* None in v0. A DPIA is likely before a server (workplace, ADHD topic, possible special category); counsel decides.
- *ePrivacy Art. 5(3).* Nothing is stored on the device, so no storage-consent question arises. A "save progress" feature using localStorage would raise it.
- *Children (Art. 8).* The audience is working adults. The app has no age gate (grep found none). Counsel to say whether an adults-only statement is needed.

**UK GDPR and Data Protection Act 2018.** Same working view; regulator is the ICO. Check separately: PECR reg. 6 for any device storage; special-category conditions in DPA 2018 Sch. 1 if team-held data ever counts; age 13 for child consent (DPA 2018 s. 9, unverified); UK representative (Art. 27) and transfer tools (IDTA or Addendum) if the team has no UK/EU base or uses non-UK vendors; effect of the Data (Use and Access) Act 2025 amendments (commencement unverified).

**HIPAA (45 CFR Parts 160 and 164).** Does not apply on current facts. It binds covered entities (health plans, clearinghouses, providers who transmit standard transactions) and their business associates (45 CFR 160.103). The team is none of these, the app is a workplace education tool, and no covered entity is involved on the facts known. Also, PHI excludes employment records a covered entity holds as an employer (from memory, unverified). Triggers: a covered entity or employer health plan sponsors or integrates the tool for its members or patients; any individual-level result flows to a provider or plan; the product starts to offer assessment or care. Separate flag if a server later holds health-like data about individuals: FTC Health Breach Notification Rule and state consumer-health laws (for example Washington's My Health My Data Act), not analysed here.

**FERPA (20 U.S.C. 1232g; 34 CFR Part 99).** Does not apply to the app itself: it creates no education record and no school holds one. It binds educational agencies and institutions that receive US Department of Education funds. Triggers: a university or school runs the tool in a course and keeps exports, ties them to a student, or grades participation. Those copies could be education records (34 CFR 99.3), and the institution, not the team, carries the duty. Participants are managers, not students, so this is an edge case; keep student IDs out of the schema.

**Other regimes not analysed:** US state privacy laws (for example CCPA/CPRA), Canada, Australia, and consumer-protection and accessibility law. Counsel to scope.

## 7. Claims boundary (FDA general wellness, education framing)
The data map keeps the boundary: the app outputs counts of what the conditions did, never a score, label or prediction of a person. Any new output screen, metric or integration needs a claims check before it ships.

## 8. Findings for the product agent and founder
1. **README gap.** `events` lines for `M1_start` and `M4_event` carry a `text` field (the stimulus string shown; M5 cue lines do too in code). These are fixed app-authored strings, not participant input, so no privacy issue, but the README's Export list omits them. `m1_intrusions` also has an `id`.
2. **Flags are declarations.** `privacy.*` in the export are hard-coded literals (index.html line 1116), not computed. The self-test scans for network APIs and identifier-like keys only. Suggest a check that fails if `getUserMedia`, `mediaDevices`, `MediaRecorder`, `geolocation`, `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie` appear.
3. **CSP does not govern device permissions.** Camera and microphone access is controlled by Permissions-Policy, a response header (a meta tag is not supported for it, to my knowledge; unverified). If a copy is hosted, set `camera=(), microphone=(), geolocation=()`.
4. **Minimisation candidates (founder and advisors decide).** `started_at_utc_minute` is the only wall-clock value and aids linking to an email timestamp; a date or nothing may suffice. A pause with `why: "tab hidden"` exports that the participant looked away (code line 1305; not seen in my sessions).
5. **Leaves the device after the click.** The Done screen says nothing has left the device, true at that moment. A short line that downloads and the clipboard may be synced or backed up by the device would be honest.
6. **Projection.** The comparison table shows wait choice and seconds, which the export hides. Facilitators should not project it.

## 9. Before any server is added (checklist, review with counsel)
- [ ] Name the controller (and any joint-controller or processor roles with customers); publish a contact. Founder-gated.
- [ ] Write the purpose and lawful basis per purpose (Art. 6), plus an Art. 9 condition if needed. Build consent separate from the intro checkbox.
- [ ] Re-run this map: every new field needs a purpose, owner and retention period. Update the README, the export `privacy` block and the self-test.
- [ ] DPIA screening, outcome recorded even if "not required".
- [ ] Privacy notice (Arts. 13-14) linked from the intro: retention, rights, contact, transfers.
- [ ] Retention schedule and a deletion route. Show the session ID on the Done screen so a participant can ask for deletion (no other identifier exists; see Art. 11).
- [ ] Upload only what the participant previewed, only on a click, never in the background. Limit `connect-src` to one named endpoint. No analytics, third-party scripts or cookies. Any device storage added: ePrivacy Art. 5(3) / PECR reg. 6 analysis first.
- [ ] Processor agreement (Art. 28) with any host or database; fix region; list sub-processors; transfer tools if data leaves the EEA or UK. A BAA only if PHI ever appears (it should not).
- [ ] Security: TLS, encryption at rest, access control, breach procedure (72-hour regulator notice, Art. 33), no IP retention or truncated IPs in server logs. Header `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- [ ] Employer firewall: no individual rows to employers; minimum group size before any aggregate is shown (value unverified, set with counsel). Keep any follow-up email apart from responses.
- [ ] Claims check and advisor harm review of every new screen or wording; still no biometrics.
- [ ] Counsel sign-off recorded: name ____ date ____.

## 10. Questions for counsel
1. Is the team a controller for anything while it receives nothing? 2. Is a file with a random ID and a start minute "personal data" when sent by email? 3. Does the 0-10 distress item raise Art. 9 on its own? 4. Is an adults-only statement needed? 5. Is any hosted copy planned, and who hosts it? 6. Which US state laws matter if US managers are the first users?
