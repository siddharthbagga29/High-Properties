# Perspective Engine MVP v0: attention-load illustration (node F04)

## Summary
`index.html` is one self-contained browser app (HTML, CSS, JS; no build step; no network calls; Web Audio only if the user opts in). A manager does one short workplace task twice, about 15 to 18 minutes in all (estimate, not timed with real users). Round 1 is as usual. Round 2 is a matched version with four tunable conditions from the mechanism spec: M1 inner-voice intrusions, M2 reaction-time variability, M3 delay aversion, M4 salience capture. M5 hyperfocus exists but is off by default and advanced only. A facilitator panel tunes each condition within the spec's ranges (intensity ceiling 0.8). The session ends with the mandatory debrief from the co-design charter, day-0 measures from the instruments spec, and a JSON export with no personal identifiers. Nothing flashes, reduced motion is honoured, Stop is always visible. It is an illustration of group-level patterns, never "what ADHD is like". Wording is a draft pending neurodivergent advisor review.

## Run it
- Open `perspective-engine/mvp/index.html` in a current Chrome, Edge, Firefox or Safari. Works offline from `file://`. No server, install or account. Optional: `python3 -m http.server` in this folder.
- Add `#selftest` to the URL (`index.html#selftest`) to run 45 built-in checks (spec defaults and ranges, ceiling, M2 mean-drift limit, form parity, no network calls, no prohibited phrases, export has no identifier-like keys).
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
| M1 inner-voice intrusions | Off-task thought text appears (optional quiet murmur). Words in the task pane are dimmed; phrases streaming past are missed. Internal, no outside cause. | rate 0.5-4 /min (2.25); duration 2-8 s (5); share lost 0.2-0.8 (0.5); min gap 5 s fixed | S2 | Hypothesis with imaging support (Sonuga-Barke & Castellanos 2007), contested, group-level. Real frequency and duration unverified. Timing is irregular; the first intrusion is placed 8 to 22 s into round 2 so the condition is perceptible (design choice). |
| M2 reaction-time variability | Each answer or send registers after a delay with a wider spread and a slow tail. Mean delay is held at 1.0 s (+-5% over the 9 responses, enforced); round 1 uses the same mean with the baseline spread (CV 0.25). | variability x 1-3 (2); slow-tail share 0.05-0.30 (0.175); M1 to M2 coupling 0-0.8 (0.4) | S1 | Finding is variability, not slowing. Slow-tail shape (6x the normal mean) is a design assumption. Coupling strength unverified. |
| M3 delay aversion | During the wait, the "use last month's now" card gets a growing glow. Both options stay available. The clock is not distorted. | k 0.02-0.20 /s (0.11); pull cue 0.2-1.0 (0.6); wait D 5-30 s (15, scenario-set) | S2 | Cited link is in adolescents; adult workplace use is an extrapolation. Pull = intensity x (1 - 1/(1 + k t)) x display gain 1.5 (design; hyperbolic form is a convention, unverified). Time perception is not modelled. |
| M4 salience capture | Notifications appear (optional ping). Each captures the view with probability p: the card moves to the centre with a vignette for the dwell time. Nothing is blocked. | rate 2-10 /min (6); p 0.1-0.7 (0.4); difficulty modifier 0.5-1.5 (1.0, p capped 0.95); dwell 0.5-3 s (1.75) | S2, mixed | Direction and size are mixed and depend on task difficulty. Authors and effect sizes unverified. |
| M5 hyperfocus (advanced, off) | An extra "milestone board" block in round 2 only, flagged high-interest. After the onset latency M1 rate and M4 p are damped, and non-task cues are missed with some probability. The state is never shown to the participant. | onset 30-120 s (60); multiplier 0.1-0.6 (0.3); cue missed 0.3-0.9 (0.6); duration 30-120 s (75) | S3 | Self-report only (Hupfeld, Abagis & Shah 2019). Not a strength claim. Consequences for outside cues are a design assumption. |

Interaction rules follow spec section 3: only M1 to M2 coupling, and M5 damps M1 and M4 only. There are no "ADHD profile" presets and no attention meter.

**Note on M3 naming.** The build request called M3 "time-blindness/delay aversion". The mechanism spec's M3 is delay aversion only, and spec section 6 lists time perception ("time blindness") as not modelled. The app follows the spec and never distorts the clock.

## Facilitator panel (top right)
Per condition: enable toggle, intensity slider (0 to 0.8), each parameter slider within its spec range (capped at the ceiling for intensity-driven values), evidence grade and caveat, and live status. Also: reading pace, task content mode, round-1 form, offer workplace changes, include day-0 questions, reset to defaults, ease off, and a live timestamped session log (the same events are exported). Changes apply live; lowering is always allowed. The panel has its own Stop button because it covers the header.

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

## Export (JSON, no personal identifiers)
Keys: `schema`, `app_version`, `session_id` (random, not linked to anyone), `started_at_utc_minute`, `privacy`, `framing`, `consent`, `settings`, `mechanisms` (enabled, intensity, parameters, grade), `adaptations`, `conditions.baseline` and `conditions.load` (summary, phrases shown and missed, answers with latencies and registration delays, reply choices, wait choice, M2 delay list, M1 intrusions, M4 events, M5 block), `day0_measures` (T0, T1, derived counts, practice selection, toolkit clicks, administered and not administered lists), `telemetry` (duration, per-screen seconds, pauses, ease-off count, stop, debrief status, `session_completed`), `events` (timestamped).
No name, email, employer, device, user agent, location, free text, camera, microphone or biometric data. A session is `session_completed: true` only if the debrief was read to the end after both rounds. Derived counts (for example AAI share) are for the study team and are never shown to the participant as a score. Per charter section 4, an employer must not require the file; sharing is the participant's choice.

## Safety, accessibility and claims
- **No flashing above 3 Hz.** Nothing loops or pulses. Visual cues are spaced at least 2.5 s apart; the only full-screen cue (the vignette) cycles at most once per 3.4 s (about 0.3 Hz). Gentle motion is fades only.
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
- Self-test (45 checks) passes. M2 over 3000 simulated runs: mean 0.999 s (round 1) and 1.003 s (round 2), worst drift 5.0%, CV 0.28 vs 1.14.
- Not done: screen-reader testing, real-device and Safari testing, timing with real users, advisor review.
