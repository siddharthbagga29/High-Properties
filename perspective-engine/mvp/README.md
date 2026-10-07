# Perspective Engine MVP v0: attention-load illustration (node F04)

## Summary
`index.html` is one self-contained browser app (no build step, no network calls; sound only if the user opts in). A manager does one short workplace task twice, about 15 to 18 minutes in all (estimate, not timed with real users). Round 1 is as usual. Round 2 is a matched version with four tunable conditions from the mechanism spec: M1 inner-voice intrusions, M2 reaction-time variability, M3 delay aversion, M4 salience capture. M5 hyperfocus is off by default, advanced only. A facilitator panel tunes each condition within the spec's ranges (intensity ceiling 0.8). The session ends with the mandatory debrief from the co-design charter, the instruments spec's day-0 measures, and a dose-only JSON export without personal identifiers or step times. Nothing flashes, reduced motion is honoured, Stop is always visible. It illustrates group-level patterns, never "what ADHD is like". Wording is a draft pending neurodivergent advisor review.

## Run it
- Open `perspective-engine/mvp/index.html` in a current Chrome, Edge, Firefox or Safari. Works offline from `file://`. No server, install or account. Optional: `python3 -m http.server` in this folder.
- Add `#selftest` to the URL (`index.html#selftest`) to run 58 built-in checks (spec defaults and ranges, ceiling, M2 mean-drift limit, form parity, no network calls, no prohibited phrases, export has no identifier-like keys, dose-only export, no clock stamps or step labels in the export, and cue spacing, flash rate and delivered rates measured by driving the real scheduler for about 1,500 virtual minutes). The scheduler measurement is also exposed as `PE.simCues()`.
- Nothing is stored: no cookies, no localStorage. Reloading erases the session.

## Session flow
| Step | What happens |
|---|---|
| 1 Intro | Honest framing (what it is, what it is not), data promise, content note, sensory settings (sound off and motion off by default), consent checkbox. |
| 2 Day-0 questions (T0) | Optional. See "Measures". Can be switched off in the facilitator panel. |
| 3 Round 1 | Baseline task. No added conditions. |
| 4 Round 2 | Same task type with matched content and the conditions on. Participant can try illustrative workplace changes. |
| 5 What changed | Neutral comparison table, framed as what the conditions did to the task, not as a score of the person. |
| 6 Debrief | Mandatory, unskippable except by Stop, 10 sections from charter section 6. The continue button unlocks at the end of the page. |
| 7 Planning | Practice selection (5 slots, time budget) and an optional toolkit (agenda and follow-up templates). |
| 8 Day-0 questions (T1) | The post set. |
| 9 Export | Download or copy JSON. Erase everything. |

## The task (same task, twice)
A colleague's email is read out and shown phrase by phrase (like a shared-screen walkthrough). Then: a forced wait for a Finance summary with a "use last month's now" option (M3), 8 questions about the email (M2 delays each registration), and an instruction to follow (choose To, Cc, attachment, then Send).
- **Matched forms.** Round 2 uses a parallel form (A: Thursday handover, B: Wednesday review) with the same structure, word count (checked by the self-test), question types and difficulty, so the comparison is not just memory. Form order is randomised. The facilitator panel offers "identical email in both rounds" for the literal same task; expect memory effects.
- The email stays on screen during the questions. Phrases missed in an intrusion stay dimmed unless the "Written follow-up" change is switched on.
- No right/wrong feedback during the task, no timer, no fail state. Choosing to wait or not has no effect on later questions.

## Mechanisms (spec: `perspective-engine/science/mechanism-spec.md`)
All numbers are DESIGN parameters, not empirical ADHD estimates. Variable = lo + I x (hi - lo), I default 0.5, ceiling 0.8. Evidence grades use the spec's scale: S1 among the most consistent group-level findings; S2 theory-backed, contested or mixed; S3 self-report only.

| ID | What the participant sees | Parameters (lo to hi, default) | Grade | Main caveat |
|---|---|---|---|---|
| M1 inner-voice intrusions | Off-task thought text appears (optional quiet murmur). Words in the task pane are dimmed; phrases streaming past are missed. Internal, no outside cause. | rate 0.5-4 /min (2.25); duration 2-8 s (5); share lost 0.2-0.8 (0.5); min gap 5 s fixed; onset also waits for 2.5 s of screen quiet (see Cue spacing) | S2 | Hypothesis with imaging support (Sonuga-Barke & Castellanos 2007), contested, group-level. Real frequency and duration unverified. Timing is irregular; the first intrusion is placed 8 to 22 s into round 2 so the condition is perceptible (design choice). |
| M2 reaction-time variability | Each answer or send registers after a delay with a wider spread and a slow tail. Mean delay is held at 1.0 s (+-5% over the 9 responses, enforced); round 1 uses the same mean with the baseline spread (CV 0.25). | variability x 1-3 (2); slow-tail share 0.05-0.30 (0.175); M1 to M2 coupling 0-0.8 (0.4) | S1 | Finding is variability, not slowing. Slow-tail shape (6x the normal mean) is a design assumption. Coupling strength unverified. |
| M3 delay aversion | During the wait, the "use last month's now" card gets a growing glow. Both options stay available. The clock is not distorted. | k 0.02-0.20 /s (0.11); pull cue 0.2-1.0 (0.6); wait D 5-30 s (15, scenario-set) | S2 | Cited link is in adolescents; adult workplace use is an extrapolation. Pull = intensity x (1 - 1/(1 + k t)) x display gain 1.5 (design; hyperbolic form is a convention, unverified). Time perception is not modelled. |
| M4 salience capture | Notifications appear (optional ping). Each captures the view with probability p: the card moves to the centre with a vignette for the dwell time. Nothing is blocked. | rate 2-10 /min (6); p 0.1-0.7 (0.4); difficulty modifier 0.5-1.5 (1.0, p capped 0.95); dwell 0.5-3 s (1.75) | S2, mixed | Direction and size are mixed and depend on task difficulty. Authors and effect sizes unverified. Delivered rate equals the set rate when M4 runs alone and falls below it when M1 competes for screen time (see Cue spacing). |
| M5 hyperfocus (advanced, off) | An extra "milestone board" block in round 2 only, flagged high-interest. After the onset latency M1 rate and M4 p are damped, and non-task cues are missed with some probability. The state is never shown to the participant. | onset 30-120 s (60); multiplier 0.1-0.6 (0.3); cue missed 0.3-0.9 (0.6); duration 30-120 s (75) | S3 | Self-report only (Hupfeld, Abagis & Shah 2019). Not a strength claim. Consequences for outside cues are a design assumption. |

Interaction rules follow spec section 3: only M1 to M2 coupling, and M5 damps M1 and M4 only. There are no "ADHD profile" presets and no attention meter.

### Cue spacing and delivered rates (measured)
One screen-time gate covers every visual cue. An M1 intrusion, an M4 notification or an M5 cue starts only when no other cue is on screen and the previous one ended at least 2.5 s ago; M1 start and end are gated like notifications. M4 is scheduled the way M1 is: next onset = this onset + cue length + 2.5 s + Exp(rest of the period), so the mean interval is 60 / rate whenever the period can hold the cue and the gap. A cue held back by the gate starts as soon as it opens, and the next due time is pulled in to catch up, by at most one period. M1 is checked before M4 in each step, so M1 wins ties.

The gate links M1 and M4, which spec section 3 ("each can be varied alone") did not anticipate. Alone, each delivers its set rate. Together they match at defaults and diverge only when the settings ask for more screen time than the gap leaves.

Measured on 2026-10-07 with a node simulation of the real `stepRun` (virtual 0.1 s clock, 30 runs of 60 min per row, cues found by watching `R.intr` and `R.notif`; `PE.simCues()` and the self-test repeat it):

| Setting (other parameters default) | Set M1 / M4 per min | Delivered M1 / M4 per min |
|---|---|---|
| Defaults (M1 2.25, 5 s; M4 6, dwell 1.75 s) | 2.25 / 6 | 2.28 / 5.94 |
| M4 alone, default | off / 6 | off / 6.03 |
| M4 alone, ceiling | off / 8.4 | off / 8.40 |
| M1 alone, default | 2.25 / off | 2.23 / off |
| M4 at ceiling with default M1 | 2.25 / 8.4 | 2.25 / 7.71 |
| M1 3.3, 6.8 s and M4 8.4, dwell 2.5 s | 3.3 / 8.4 | 3.25 / 5.18 |
| Lowest M1 and M4 | 0.5 / 2 | 0.51 / 1.99 |

Before this revision the M4 floor `max(5.5 s, Exp(60/rate))` delivered 5.28/min at a setting of 6 and 6.87/min at 8.4 (verifier measurement). The remaining cap is arithmetic: in the second-to-last row M1 needs about 31 s of screen time a minute and M4 about 46 s (each cue's length plus its 2.5 s gap), against 60 s available. Spacing in the same runs: 0 of 14,765 adjacent cue pairs under 2.5 s apart at defaults (7,998 of them between M1 and M4), 0 overlaps, minimum gap 2.50 s; the same in every other row, with uneven timer steps of 0.05 to 0.5 s, and in 200 runs with M5 on (3,815 pairs). The export records the delivered rate of each run (`intrusions_per_min`, `outside_events_per_min`) beside the set rates; one short round has few events, so a single run's rate is noisy and the table is a long-run average. With "Fewer notifications" on, the effective M4 rate is 0.4 times the exported setting; the toggle is in the export.

**Note on M3 naming.** The build request called M3 "time-blindness/delay aversion". The mechanism spec's M3 is delay aversion only, and spec section 6 lists time perception ("time blindness") as not modelled. The app follows the spec and never distorts the clock.

## Facilitator panel (top right)
Per condition: enable toggle, intensity slider (0 to 0.8), each parameter slider within its spec range (capped at the ceiling for intensity-driven values), evidence grade and caveat, and live status. Also: reading pace, task content mode, round-1 form, offer workplace changes, include day-0 questions, reset to defaults, ease off, and a live session log with session times (panel only: the export carries an untimed copy of the cue, setting and safety lines and leaves out the step, screen, response and wait-choice lines). Changes apply live; lowering is always allowed. The panel has its own Stop button because it covers the header.

**Participant controls:** Stop (always visible, top bar, also in the pause dialog and the panel), Pause (also Esc), Ease off (all conditions to 0.2, M5 off), Skip this step, tab-hidden auto-pause.

**Illustrative workplace changes** (round 2, spec section 5): Written follow-up (restores missed phrases; M1), Fewer notifications (M4 rate x 0.4), Structured deadline (stated end and checkpoints, pull x 0.4; M3). Labelled illustrative and co-design pending, never proven interventions. Factors 0.4 are design values.

## Measures (instruments spec: `perspective-engine/data/instruments.md`)
Only items the spec names are used.

| Administered | Waves | Status |
|---|---|---|
| AAI-self, 10 practices, Yes/No/Not applicable (prior 30 days) | T0 | Study-specific, unvalidated. Wording is a paraphrase of the spec's candidate list. |
| Behavioral intention, 5 items, 7-point | T0, T1 | Unvalidated. The spec does not say which five are the "top 5"; the first five AAI items are a placeholder. |
| Self-efficacy, item 1 of 3 (the one the spec words) | T0, T1 | Unvalidated. Response format (7-point) is an assumption. |
| Knowledge/misconception, items 1-2 of 8 (the two the spec words), True/False/Not sure | T0, T1 | Unvalidated. "Not sure" added to avoid forced guessing. |
| IOS, 1 pictorial item | T0, T1 | Target group use is unvalidated. Licensing unverified. |
| Distress now, 0-10 | T0, T1 | Per spec harm monitoring. |
| Instruction-check items, 2 per wave | T0, T1 | Spec names "attention checks (2 per wave)" without wording; generic wording by Ada. |
| Practice-selection task (5 slots, time budget 8, 10 menu practices plus 4 non-menu options) | T1 | Study-specific, unvalidated. Time costs are placeholders. Not scored to the participant. |
| Toolkit take-up (open, copy, download clicks) | T1 | Local click log only. |

**Not administered in v0** (listed in the export as `not_administered`): QPS (37), IRI-PT (7), RIBS (8), OMS-WA (22), AQ-27 pity and fear, Marlowe-Crowne C (13), self-efficacy items 2-3, knowledge items 3-8, AAI-verified, and any follow-up messages. Item texts for the validated scales are not in the instruments spec and licensing is unverified, so none were invented. Adapting any of them to ADHD or managers would be an unvalidated adaptation. T2 and T3 are out of scope for a single-device session.

## Export (JSON, no personal identifiers, no step times)
Keys: `schema`, `app_version`, `session_id` (random, not linked to anyone), `started_at_utc_minute` (wall-clock minute the page opened), `privacy`, `framing`, `consent` (given, text version), `settings`, `mechanisms` (enabled, intensity, parameters, grade), `adaptations` (ordered on/off toggles), `conditions.baseline` and `conditions.load` (dose-only `summary`, a missed flag per phrase, `m2_responses` counts, M2 delay list, `wait` with the scenario-set length `D_s` only, M1 intrusions with length, share, words lost and phrases missed, M4 events with captured, p and dwell, M5 `locked_s` and cue counts, `skips_count`), `day0_measures` (T0 and T1 answers, derived counts, practice selection, toolkit clicks as ordered open, copy or download lines, administered and not administered lists), `telemetry` (total and per-screen seconds, pause lengths, ease-off count, the screen and round of a Stop, debrief status, `session_completed`), `events` (ordered lines without times; step, screen, per-click response and wait-choice lines are left out).
No name, email, employer, device, user agent, location, free text, camera, microphone or biometric data. A session is `session_completed: true` only if the debrief was read to the end after both rounds. Derived counts (for example AAI share) are for the study team and are never shown to the participant as a score. Per charter section 4, an employer must not require the file; sharing is the participant's choice.

**Data minimisation (charter section 4; instruments spec section 2.2: sim telemetry is dose only).** A task export holds what the conditions delivered, plus duration, intensity set, adaptation toggles and debrief completion. Each run's `summary` keeps 16 dose keys: phrases missed and words lost to intrusions, the M2 delay mean, CV, maximum and late count, intrusion and notification counts with delivered per-minute rates, how many pulled the view, and duration. It does not hold which answer was chosen, whether it matched the email, per-question or send response times, words lost at each click, the To, Cc and Attach choices, the wait choice or wait time, or M5 block accuracy. The on-screen comparison still shows the participant their own counts; they are erased on reload. An earlier build exported per-question `rt_s`, correctness and `words_lost_at_click`; they were dropped on 2026-10-07 and a self-test check now fails if they return.

**Timing (revised 2026-10-07).** The export holds no session-clock or run-clock value and no step label. Verifier finding: the exported `step` lines carried a time each, so the wait length (next step time - wait step time - 1.6 s hold) gave the wait choice and wait time, and the reply step to the next step minus the last M2 delay gave the send reaction time. Measured on the old build in headless Chromium with a scripted 4.0 s quick wait and 2.1 s send: the export gave 4.0 s and 2.1 s; for a 15.1 s full wait and 3.5 s send it gave 15.2 s and 3.5 s. Three more routes to the same values were found and closed: `wait.pull_peak` (a fixed function of the time waited; it inverted to 15.0 s for a 15.1 s wait), cue events with a run time and a step label (they bracket step boundaries), and `skips` and `stop` with a step name and a time. What changed in the export:
- Removed: `step`, `screen`, `response` and `wait_resolved` event lines; the time and step on every other event line; `started_s`, `ended_s`, `stopped_at_run_s`, per-phrase `shown_t`, `lock_start_t` and `lock_end_t` (M5 now exports `locked_s`, a length); the time and step on cue events, adaptation toggles, toolkit clicks, pauses (now a length), Stop (now screen and round) and skips (now `skips_count`); `consent.at_s`; the `started` and `ended` of T0 and T1; `wait.pull_peak`.
- Kept, all lengths or scheduler output rather than clock values: run `duration_s` (named by the instruments spec), total and per-screen seconds, debrief seconds, pause lengths, the delay and length of cues, `started_at_utc_minute`.
- Residual, stated plainly: `duration_s` is the sum of read, wait, questions and send and cannot be split into them, but in a run where every other step was skipped it would approximate the wait; a run ended by Stop shows how far in it got; `skips_count` with `summary.responses` shows how many skips were not questions or the send, not which step they were; `words_lost` per intrusion depends on what was on screen, so it hints weakly at the step, with no time attached.
- Verified 2026-10-07 on real exports (Download JSON in headless Chromium, fake clock; four sessions: full, with skip, pause, M5 and two workplace changes, Stop in the wait, reduced motion): an attack script that tries the four routes above found 0 derivations, 0 `step` events and 0 timestamp-like keys (old export: 6 derivations, 10 step events, 19 such keys). Three self-test checks build a full export from a synthetic session that carries stamps, step lines, a wait choice and a send time, and fail if any of them reaches the file; re-adding step labels, `pull_peak` or cue times to a scratch copy made them fail.

## Safety, accessibility and claims
- **No flashing above 3 Hz (visual).** No visual element loops or pulses. Visual cues are M1 intrusions (inner-voice panel and dimmed words) and M4 or M5 notifications, with a full-screen vignette only for a captured M4 event. One gate spaces them across mechanisms: a cue starts only when none is on screen and the last one ended at least 2.5 s ago (see Cue spacing, measured). In the simulation the vignette never repeated faster than once per 3.4 s (0.29 Hz), even at dwell 0.5 s, p 0.56 and rate 8.4 (40 runs of 60 min), and at most 2 visual state changes (one on-off pair) fell in any 1 s window. The M3 glow changes at most once per second (once per 3 s with reduced motion), in small steps. Gentle motion is fades only.
- **Sound is the only repeating element, and it is opt-in.** The M1 murmur is a looped 2 s noise buffer with a 3.3 Hz amplitude modulation. It is audio only, nothing visual follows it, and it is off unless the participant allows sound; the 3 Hz limit is a rule for visuals, not audio. Notification pings are two short tones.
- **Reduced motion.** Sound off and motion off by default. Gentle motion is opt-in and is forced off when the system sets `prefers-reduced-motion` (also checked live). In reduced mode cues appear and disappear instantly and the M3 glow updates in 3 s steps.
- **Stop at every moment**, keyboard operable (Esc, then Tab to Stop in the pause dialog; Stop is also first in the header). Stop silences audio, clears all cues and offers the debrief, the export, or erase. Pause freezes all timers.
- **Keyboard and contrast.** All controls are native buttons, inputs and selects with visible focus; number keys answer questions only while focus is inside the question pane. 24 colour pairs were computed: all meet WCAG AA (lowest text 7.65:1, control borders 3.86:1). Touch targets 44 px. Not tested with screen readers; see limitations.
- **Claims guard.** Uses the spec's product claim and the charter's debrief wording. No "feel what it's like", diagnosis, score, treatment, empathy or stigma-reduction claim. The self-test scans visible text for prohibited phrases.
- **Network.** A Content-Security-Policy meta (`connect-src 'none'`, `default-src 'none'`) blocks requests; the self-test scans the script for network APIs; the headless run recorded zero external requests.

## Draft content needing advisor review (charter section 3 veto)
Everything below is placeholder wording by the product agent and must be reviewed or replaced by paid neurodivergent advisors before any real participant sees it: intro text and consent wording, both email forms and questions, inner-voice fragments, notification texts, the debrief (all 10 sections; card 8 is an explicit placeholder), the comparison framing, the workplace-change texts, the practice list and time costs, the templates, all sensory defaults and the 0.8 ceiling. A harm review (charter section 5) is required before release. The debrief is text only; audio and brief video need advisor-recorded content. The concerns and check-in route is "not set up" because naming a person or resource is a founder-gated step.

## Known limitations
- Prototype, no advisor review, no pilot data. Parameters are design values; calibration by advisor recognisability and acceptability ratings is still to do (spec section 4).
- The analogue is partial by design: M2 is modelled as a delay in registering answers, which is not the same as a person's internal reaction-time variability. M4 pulls the view but does not block input.
- M1 and M4 share one screen-time gate, so they are not fully independent: at high settings together M4's delivered rate falls below the set rate (about 62% in the ceiling row of the table). Delivered rates are exported per run for this reason.
- Pause lengths, the ease-off count, `skips_count` and the screen and round of a Stop stay in the export as safety telemetry, without times, although the instruments spec names only duration, intensity set, adaptation toggles and debrief completion. Whether harm monitoring justifies keeping them is for the founder and advisors to decide (unverified).
- Round 2 uses a different matched form by default. Counts in the comparison are small and noisy and are not results; the pilot's primary outcome is behaviour at day 30, not in-session counts.
- M5 adds a block to round 2 only, so rounds differ in length when it is on.
- Dimmed words are marked `aria-hidden` as an analogue of missed information, but screen-reader behaviour is untested, and the paced read-along is not designed for screen-reader users in v0.
- Debrief unlock relies on reaching the end of the page; reading is not verified.
- Session time is a design estimate; no user has timed it.
- Browser audio needs a click first; some browsers block it otherwise (the sound button handles this).
- No data persistence: closing the tab loses an unexported session.

## Verification done (by the product agent, 2026-10-06)
- `node --check` on the script extracted from `index.html`: passes.
- Headless Chromium (Playwright) end-to-end: consent, T0, round 1, round 2, comparison, debrief gate, planning, T1, export download; Stop mid-run; Pause freezes time; Ease off; M5 lock-in and damping; sound and gentle-motion paths; reduced-motion emulation; 0 page errors; 0 external requests.
- Self-test (45 checks at that time) passes. M2 over 3000 simulated runs: mean 0.999 s (round 1) and 1.003 s (round 2), worst drift 5.0%, CV 0.28 vs 1.14.
- Not done: screen-reader testing, real-device and Safari testing, timing with real users, advisor review.

## Revision check 1 (by the product agent, 2026-10-07)
- `node --check` on the extracted script: passes.
- Node simulation of the real scheduler: delivered rates and spacing as in the Cue spacing table (30 runs of 60 min per row; 200 runs with M5 on; worst-case flash run of 40 runs of 60 min).
- Headless Chromium `#selftest`: 55 of 55 pass, 0 page errors, 0 external requests, cue elements left clean; 25 fresh loads and 20 repeat runs with 0 failures.
- Headless Chromium end-to-end rerun (full flow to export, Stop, Esc pause, reduced-motion emulation): 0 page errors, 0 console errors, 0 external requests. The real export was inspected: no `rt_s`, correctness, chosen options, reply choices, wait choice or `response` events.

## Revision check 2 (by the product agent, 2026-10-07): summary length and timing in the export
- Top comment of `index.html`: 173 words before (lines 10-20); 140 after, counted with `wc -w` on lines 10-20 (141 for the comment body, 143 with the comment markers). Role-card cap is 150. The `## Summary` paragraph of this file: 145 words.
- `node --check` on the script extracted from `index.html`: passes.
- Headless Chromium `#selftest`: 58 of 58 pass (3 new checks on timing in the export), 0 page errors, 0 external requests, no cue elements left behind. Mutation test on scratch copies: re-adding step labels and event times, `pull_peak`, or cue times and step labels to the export fails 2, 3 and 2 checks respectively.
- Four full headless sessions with the real Download JSON: 0 page errors, 0 external requests, 0 derivations of wait choice, wait time or send reaction time from the file (see Export, Timing). Before the change the same driver and attack recovered all of them from the step lines. Reduced-motion emulation gave `motion: reduced` and the same result.
- Not re-run: screen-reader, Safari and real-device checks (code paths unchanged); a real participant session (founder-gated).
