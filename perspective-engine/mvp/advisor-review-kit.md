# Advisor review kit for MVP v0.1.1-F04 (node V14, prepared 2026-10-07; baseline updated 2026-10-09)

## Summary

This kit lets the founder run paid feedback sessions with neurodivergent advisors on the verified browser MVP, and lets the product agent apply the results the same day. No session has been held. This file holds no advisor feedback, and none was invented, simulated or paraphrased. It gives a screen-by-screen walkthrough, mechanisms M1 to M5 with their parameter ranges, and the ten debrief sections. A form of about 120 items carries one stable note ID each (for example AN-M1-03), covering every mechanism, every debrief section, consent, Stop and the claims wording. It restates the advisor veto, proposes 60 to 90 minute paid sessions recorded only with consent, and defines how a note becomes a change logged in `CHANGELOG.md`. Open founder gates: rate, facilitator, contracts, payment, outreach, recording policy. All ranges are design values, not ADHD estimates.

## 0. Status, sources, limits

- Nothing has been sent, signed, paid or booked. No advisor or organisation has been contacted. Pay terms below are proposals from `ethics/advisory-board.md` until the founder approves them (`docs/founder-decisions.md` items 2 and 4 are still open).
- Sources read for this kit: `mvp/index.html`, `mvp/README.md`, `ethics/advisory-board.md`, `science/mechanism-spec.md`, `docs/founder-decisions.md`. The co-design charter file was not in this node's input list and was not read. The veto rule and charter section numbers (s2, s3, s4, s5, s6, s7) are quoted second-hand from `advisory-board.md` and `mvp/README.md`. Check them against `ethics/codesign-charter.md` before the first session.
- Session timings, the 15 to 18 minute run time and the 3 minute debrief time are design estimates; no user has timed them (README). Any number here without a source is marked unverified.
- Baseline under review (updated 2026-10-09): `perspective-engine/mvp/index.html`, `VERSION='0.1.1-F04'`, 120,373 bytes, sha256 `259502d413c58bd045d26f136b4c435f005dd8926211252ebc58a7874dc709c6`. It replaces 0.1.0-F04 (119,994 bytes, sha256 `83f500ed9a837d56df88a2911bcfc364b14d4d60ec8251c50f34afa16f74e118`), which this kit was first prepared against. The difference is an audit wording correction, not an advisor change (`CHANGELOG.md`, Baseline corrections): intro controls line, Ease off wording, round 2 brief, debrief card 2, one `NOT_ADMIN` label, and the `VERSION` and consent `text_version` strings. `node --check` on the extracted script passes and the in-app self-test is 59 of 59 at 390 and 1280 px (both re-run 2026-10-09, README Revision check 4). The founder confirms the hash before each session (`sha256sum index.html`); a different hash means a different build and the CHANGELOG must explain it.
- Line numbers below are for this baseline and will move after edits; use the constant or function name when they do.

## 1. What advisors see

### 1.1 Plain-language note for advisors (draft; not sent; founder gate; advisors may amend)

> We built a short browser prototype that adds four attention and timing patterns to a workplace task, then ends with a debrief. We want to know whether it should exist, what is wrong with it, and what to change. "Do not make it" is a legitimate answer. Any one advisor can place a hold and we cannot override it. You are paid for all your time whether or not you approve. You can stop at any moment and keep the full fee. We are not testing or scoring you; we are asking you to judge the prototype. The prototype stores nothing and sends nothing. We will not ask for a diagnosis or personal history. Nothing is recorded unless you agree, and you can withdraw that later. [Rate, facilitator name and contact: founder to supply.]

### 1.2 Screens (open `index.html` in a current browser; works offline; no account)

| # | Screen | What the advisor sees | Note areas |
|---|---|---|---|
| 1 | Intro (`#s-intro`, lines 173-198) | Prototype banner (line 168). Title "A short, honest illustration of four attention and timing patterns". Cards: What this is, What this is not, Your data and your control, Sensory settings (sound and motion off by default), For facilitators. Consent checkbox, Begin. | INT, CON, SEN, CLM |
| 2 | Day-0 questions T0 (optional) | Distress 0 to 10; two true/false/not sure knowledge items; five intention items; one confidence item; one closeness picture (7 pictures); ten practice items Yes/No/Not applicable; two instruction checks. "Skip these questions". | MEA |
| 3 | Round 1 brief | "Round 1: the task, as usual". Three steps: wait for Finance's summary, answer 8 questions, follow the instruction. No time limit, no score. | TSK |
| 4 | Round 1 task | A colleague's email is shown phrase by phrase. Wait step with two cards ("Current summary (complete)" and "Use last month's summary now"). 8 questions. Reply (To, Cc, attachment, Send). Phase line, Skip, Pause. No timer, no right/wrong feedback. | TSK, STP |
| 5 | Round 2 brief | Content note. Tick boxes to leave out any of M1 to M4, each with a plain sentence. M5 note only if the facilitator enabled it. | CON, STP, M1-M4 |
| 6 | Round 2 task | Same task type, matched email, with the conditions on. Box "Try a workplace change (illustrative, not proven)". Ease off button. | M1-M5, ADP, STP |
| 7 | What changed | Table of counts for the two rounds, framed as what the conditions did to the task. | CMP |
| 8 | Debrief | Ten sections, required, unlocks at the end of the page (see 1.4). | DB1-DB10, DBX |
| 9 | Planning | Choose up to 5 of 14 practices within a time budget of 8; two copyable templates. | PLN |
| 10 | Day-0 questions T1 | Same questions again, without the practice menu. | MEA |
| 11 | Done and export | Download or copy a JSON with no personal identifiers; erase everything. | EXP, CON |
| 12 | Stopped | Reached by Stop at any time (see STP). | STP |
| 13 | Pause dialog | Esc or Pause; has its own Stop. | STP |
| 14 | Facilitator panel (top right) | Per-condition toggle, intensity slider, parameter sliders within spec ranges, evidence grade and caveat, reading pace, task content mode, session log. Pinned Stop and Close. | FAC, M1-M5 |

Suggested path (proposal): 1) read the intro and tick consent as a reviewer; 2) skip T0; 3) do round 1 with Skip where wanted; 4) round 2 at defaults; 5) repeat round 2 with one mechanism enabled at a time (panel toggles) at default then at ceiling 0.8; 6) read the comparison and all ten debrief sections; 7) open the Stopped and Pause screens deliberately. Time for this path is unverified; the full flow is estimated at 15 to 18 minutes (README), so split across sessions rather than rushing.

### 1.3 Mechanisms M1 to M5

Rule: variable = lo + I x (hi - lo); default I = 0.5; session ceiling I = 0.8 (`CEIL`, line 236). Every number is a design parameter chosen for perceptibility and comfort, not an empirical ADHD estimate (mechanism-spec s1). Ceiling column computed from that rule. Evidence grades: S1 among the most consistent group-level findings; S2 theory-backed, contested or mixed; S3 self-report only.

| Mechanism and grade | What the participant sees | Parameter | Unit | Range lo to hi | Default | At ceiling 0.8 |
|---|---|---|---|---|---|---|
| **M1 inner-voice intrusions** (S2) | Off-task thought text appears (optional quiet murmur). Words in the task pane are dimmed while it lasts. Internal; no outside cause. | Intrusion rate | per min | 0.5 to 4 | 2.25 | 3.3 |
| | | Duration | s | 2 to 8 | 5 | 6.8 |
| | | Share of task info lost | fraction | 0.2 to 0.8 | 0.5 | 0.68 |
| | | Minimum gap | s | fixed 5 | 5 | fixed |
| **M2 reaction-time variability** (S1) | Answers register after a delay with a wider spread and a slow tail. Mean delay held at 1.0 s (+-5%). Variability, not slowing. | Variability multiplier on baseline CV 0.25 | x | 1 to 3 | 2.0 | 2.6 |
| | | Share of responses from slow tail | fraction | 0.05 to 0.30 | 0.175 | 0.25 |
| | | Coupling M1 to M2 | prob | 0 to 0.8 | 0.4 | 0.64 |
| **M3 delay aversion** (S2) | During a forced wait the "use last month's summary now" card gets a growing glow. Both options stay available. The clock is not distorted. | Discount rate k | 1/s | 0.02 to 0.20 | 0.11 | 0.164 |
| | | Pull-cue intensity | 0 to 1 | 0.2 to 1.0 | 0.6 | 0.84 |
| | | Forced wait length D (scenario-set) | s | 5 to 30 | 15 | not capped |
| **M4 salience capture** (S2, mixed) | Notifications appear (optional ping). Each captures the view with probability p: card moves to the centre with a vignette for the dwell time. Nothing is blocked. | Salient event rate | per min | 2 to 10 | 6 | 8.4 |
| | | Capture probability p | prob | 0.1 to 0.7 | 0.4 | 0.58 |
| | | Task-difficulty modifier (scenario-set; p capped 0.95) | x | 0.5 to 1.5 | 1.0 | not capped |
| | | Capture dwell | s | 0.5 to 3 | 1.75 | 2.5 |
| **M5 hyperfocus** (S3, advanced, default OFF) | An extra "milestone board" block in round 2, flagged high-interest. After onset, M1 rate and M4 p are damped and non-task cues may be missed. Never shown to the participant. | Onset latency | s | 30 to 120 | 60 | not intensity-driven |
| | | Multiplier on M1 rate and M4 p | x | 0.1 to 0.6 | 0.3 | |
| | | Probability a non-task cue is missed | prob | 0.3 to 0.9 | 0.6 | |
| | | Duration | s | 30 to 120 | 75 | |

Other fixed facts advisors may ask about: interaction rules are only M1 to M2 coupling, and M5 damps M1 and M4 only (spec s3). There are no ADHD profile presets and no attention meter. One screen-time gate spaces all visual cues at least 2.5 s apart, so M1 and M4 are not fully independent at high settings (README, measured). Evidence caveats per mechanism are in `MECH` (lines 274-312) and `mechanism-spec.md`. Not modelled (spec s6): diagnosis or severity, hyperactivity, impulsivity beyond M3, working memory and other executive functions, time perception, emotion, sensory processing, genotype, treatment, comorbidity, any empathy or behaviour outcome.

### 1.4 Debrief (ten sections, `DEBRIEF` lines 430-441; text-only; draft wording by the product agent)

| # | Title | Gist |
|---|---|---|
| 1 | What you just did is an analogue | Built from a few reported experiences; not what ADHD is; settings chosen for visibility, not measured from anyone. |
| 2 | Strengths and adaptation | Explicit placeholder: the strengths statement is reserved for advisors (`ethics/irb-packet.md` 4.5) and none is written yet; a short exercise tends to understate what people can do; workplace changes shown are a design idea, not proof. |
| 3 | People differ widely | Findings describe groups; ask rather than assume. |
| 4 | Accommodations and practice | Concrete options to agree together; effect for any one person not established. |
| 5 | Mismatches go both ways | Two-way communication mismatch (double empathy), from autism research, applied to ADHD cautiously as an extrapolation. |
| 6 | Your reaction | Pity, discomfort or confusion are not a measure of understanding; no empathy or stigma claim. |
| 7 | What not to do next | Do not diagnose or label; do not say "now I know how you feel"; do not reuse scenes to test or track people. |
| 8 | Lived-experience voice | Explicit placeholder: no advisor words included yet. |
| 9 | Where to learn more and raise a concern | States that no resource list or named person is set up; "raise concerns with whoever ran your session". |
| 10 | Check in with yourself | Stop, break, talk to someone you trust; local support or emergency services if in distress. |

Debrief flow: required; the continue button unlocks at the end of the page; a participant who pressed Stop can still read it. A session counts as complete only if the debrief was read to the end after both rounds.

### 1.5 Claims wording in the app (exact text advisors are asked to judge)

- Claim: "An interactive illustration of documented attention and timing patterns that some people with ADHD report or show at group level." (line 178)
- Not: "It is an analogue. It is not what ADHD is, and not what any person's day is like. Group findings do not describe individuals, and people with ADHD differ widely." (line 181)
- Not: "It has not been shown to build empathy or change behaviour. One study found simulations can raise discomfort without improving attitudes (Nario-Redmond et al., 2017), so this one is short and has a mandatory debrief." (line 183)
- Use: "A way to start a conversation about working practices, always followed by a debrief." (line 179)
- Consent: "I have read this. I understand that this is an illustration, that it may cause some discomfort, that I can stop at any time, and that a debrief follows." (line 196)
- Banner: "Prototype v0 for internal review. Wording is a draft by the product agent and has not been reviewed or approved by any neurodivergent advisor. Not for use with real participants until the co-design charter's harm review is signed off." (line 168)
- Self-test phrase list that must never appear in visible text (line 1254): feel what, walk a mile, walk in their shoes, step inside, experience adhd, what adhd is like, simulate adhd, adhd brain, superpower.

## 2. Feedback form

### 2.1 How to use it

- Answer about the item, not about yourself. You may say what you or people you know report; you never have to. "Not recognisable" and "do not make this" are useful answers. Pass on any item. Facilitator never asks for diagnosis, treatment history or personal trauma, and never asks you to speak for others.
- **Verdict**: `OK` fine as is; `CH` change (say what); `RM` remove; `ND` need more information; `LO` / `HI` (parameter rows) too weak or low / too strong or high; blank = passed.
- **Hold**: write `H` to place a hold (the veto, section 3) on that item. A hold needs no justification to stand.
- **Note**: your words. The note-taker writes them verbatim, on screen, and you can correct them. Replacement wording you give is used as given.
- **(core)** items go first in every session. Everything else can be done later or in writing.
- **IDs.** Format `AN-<AREA>-<NN>`, e.g. AN-M1-03. Areas: GEN overall, INT intro, CON consent, SEN sensory, STP Stop/Pause/Ease off/Skip, TSK task, M1 to M5, ADP workplace changes, CMP comparison, DB1 to DB10 debrief sections, DBX debrief flow, PLN planning, MEA questions, EXP export and data, FAC facilitator panel, CLM claims wording, OTH anything else. IDs `-01` to `-89` are pre-printed. Unprompted notes use `-91` upward in that area (e.g. AN-M1-91, AN-OTH-91). IDs are never renumbered or reused; a retired prompt keeps its ID and is marked retired in the next kit version.
- Suggested split (proposal; founder decides): session A = GEN, INT, CON, SEN, STP, CLM, FAC; session B = TSK, M1 to M5, ADP, CMP; session C = DB1 to DB10, DBX, PLN, MEA, EXP. The advisory-board plan budgets three content-review sessions in the first quarter (its assumption).

### 2.2 Overall (GEN)

| ID | Look at / ask | Verdict | Hold | Note |
|---|---|---|---|---|
| AN-GEN-01 | (core) After seeing it: should this be made, in this form? "No" is a legitimate answer. | | | |
| AN-GEN-02 | (core) Does any part read as pity, comedy, inspiration or incompetence? Name the part. | | | |
| AN-GEN-03 | Does anything essentialise ("this is what ADHD is")? | | | |
| AN-GEN-04 | Are strengths, adaptation and variability present enough? | | | |
| AN-GEN-05 | Do both sides of the mismatch get to adjust, or only the "affected" person? | | | |
| AN-GEN-06 | Does anything imply diagnosis or labelling of the user or of a colleague? | | | |
| AN-GEN-07 | The user plays a manager doing an email task. Is that the right perspective? Who or what is missing from the picture? | | | |
| AN-GEN-08 | What matters most that is not modelled (see list in 1.3)? | | | |
| AN-GEN-09 | Length: about 15 to 18 minutes plus a debrief (unverified estimate). Too long, too short, enough breaks? | | | |
| AN-GEN-10 | Which parts should be rebuilt from your accounts instead of edited? (No advisor-sourced content is in the prototype yet.) | | | |

### 2.3 Intro (INT)

| ID | Look at / ask | Verdict | Hold | Note |
|---|---|---|---|---|
| AN-INT-01 | (core) "What this is" card: clear, accurate, respectful? | | | |
| AN-INT-02 | (core) "What this is not" card, including the Nario-Redmond sentence: clear? Too negative, too positive, too technical? | | | |
| AN-INT-03 | "Your data and your control" card: do you believe it and understand it? Anything to add? | | | |
| AN-INT-04 | Content note: "interruptions, a wait, notifications from outside the task and, only if you switch sound on, quiet sounds. Nothing flashes. If you have ADHD yourself this may feel inaccurate or upsetting, and you are free to skip it." Right content and tone? What is missing? | | | |
| AN-INT-05 | The "For facilitators" card is visible to participants. Should it be? The prototype banner wording (line 168): fine? | | | |

### 2.4 Consent (CON)

| ID | Look at / ask | Verdict | Hold | Note |
|---|---|---|---|---|
| AN-CON-01 | (core) The consent sentence (1.5): understandable, sufficient, not pressuring? | | | |
| AN-CON-02 | (core) Consent is one checkbox at the start, plus tick boxes to leave out any of M1 to M4 before round 2. Is that enough, or should consent be asked again at round 2? | | | |
| AN-CON-03 | The line that an employer must not require the export or see individual responses appears only on the final screen. Should it appear at the start? | | | |
| AN-CON-04 | Who should control the settings: facilitator, participant, both? Does a facilitator choosing intensity change what consent means? | | | |
| AN-CON-05 | "You can leave at any point without consequence." True in the app; unverified in a workplace. Should the text say more, or less? | | | |

### 2.5 Sensory (SEN)

| ID | Look at / ask | Verdict | Hold | Note |
|---|---|---|---|---|
| AN-SEN-01 | (core) Defaults: sound off, gentle motion off, system reduced-motion honoured. Right defaults? | | | |
| AN-SEN-02 | Sound, if allowed: test sound, volume 0.05 to 0.5 (default 0.25), M1 murmur (audio only, 3.3 Hz amplitude modulation), two-tone ping. Anything uncomfortable? Does anything need a visual or caption alternative? | | | |
| AN-SEN-03 | Visual cues: dimmed words, inner-voice panel, notifications, M4 vignette, M3 glow. "Nothing flashes" is a product rule (no flashing above 3 Hz; vignette measured at most once per 3.4 s; basis for 3 Hz not in this node's inputs, unverified). Does anything feel harsh, too fast or too sudden regardless of that rule? | | | |
| AN-SEN-04 | Colours, contrast, text size, dark theme, layout at phone and desktop widths. Please try your own assistive technology (screen reader untested, README). What failed? | | | |

### 2.6 Stop, Pause, Ease off, Skip (STP)

| ID | Look at / ask | Verdict | Hold | Note |
|---|---|---|---|---|
| AN-STP-01 | (core) Stop ("■ Stop", top bar; pinned in the open facilitator panel; in the pause dialog). Is it visible and findable at every moment on your device, with the panel open? | | | |
| AN-STP-02 | (core) Stop acts immediately with no confirmation: silences sound, clears all cues, then offers debrief, export or erase. Right? Should it ask first? | | | |
| AN-STP-03 | (core) Stopped screen: "Everything has stopped. Nothing else will play or move." "You have not done anything wrong." Does anything pressure you to continue? | | | |
| AN-STP-04 | Pause (Esc or button), dialog wording, auto-pause when the tab is hidden. | | | |
| AN-STP-05 | Ease off: lowers each of M1 to M4 that is above 0.2 to 0.2 (lower settings stay as they are, and a condition that is off stays off) and turns M5 off; visible in round 2 only; the facilitator panel can raise settings again afterwards. Is 0.2 right? Is the label and place clear? Should it exist in round 1? | | | |
| AN-STP-06 | Skip this step / question: enough control? Any consequence you would fear for skipping? | | | |
| AN-STP-07 | After Stop the Done screen says the session "is not recorded as complete". Does that read as a penalty? | | | |
| AN-STP-08 | Distress is asked only at T0 and T1 (0 to 10). Should there be a check mid-session? | | | |
| AN-STP-09 | Debrief cards 9 and 10 say no named person or resource list exists yet. What must exist before any real participant sees this? | | | |

### 2.7 Task (TSK)

| ID | Look at / ask | Verdict | Hold | Note |
|---|---|---|---|---|
| AN-TSK-01 | (core) The two matched emails (Form A Thursday client handover, Form B Wednesday supplier review): realistic, respectful, anything stereotyped or demeaning? (`FORMS`, lines 353-394) | | | |
| AN-TSK-02 | The 8 questions per form: does this feel like a memory test that could shame someone? | | | |
| AN-TSK-03 | Wait step wording: "Finance’s system is slow today. You can wait for the current summary, or use last month’s now. Either is fine. There is no right answer, and it does not change the questions." | | | |
| AN-TSK-04 | Is "email read phrase by phrase, then questions, a wait and a reply" a fair stand-in for a workday? What scene would you choose instead? | | | |
| AN-TSK-05 | No timer, no right/wrong feedback, no fail state. Right? Reading pace 1.2 to 3 s per phrase: fair? | | | |

### 2.8 Mechanism M1 inner-voice intrusions (grade S2)

| ID | Look at / ask | Verdict | Hold | Note |
|---|---|---|---|---|
| AN-M1-01 | (core) Does this resemble anything you or people you know report? You choose whether to say. | | | |
| AN-M1-02 | (core) Harm table: does it read as pity, comedy, inspiration, incompetence, or as trivialising? | | | |
| AN-M1-03 | Rate 0.5 to 4 per min (default 2.25, ceiling 3.3): LO / OK / HI. | | | |
| AN-M1-04 | Duration 2 to 8 s (default 5, ceiling 6.8): LO / OK / HI. | | | |
| AN-M1-05 | Share of information lost 0.2 to 0.8 (default 0.5, ceiling 0.68), shown as dimmed words: LO / OK / HI. Is dimming a fair analogue of missed information? | | | |
| AN-M1-06 | The 12 inner-voice fragments (`INNER`, line 396) and the label "Inner voice (off-task thought)": wording, tone, kinds of thought missing or wrong? Optional murmur sound? | | | |
| AN-M1-07 | Timing is irregular, at least 5 s apart, first one 8 to 22 s into round 2. Right shape? | | | |

### 2.9 Mechanism M2 reaction-time variability (grade S1)

| ID | Look at / ask | Verdict | Hold | Note |
|---|---|---|---|---|
| AN-M2-01 | (core) Does "answers register after a variable delay, same average, wider spread" resemble anything you or people you know report? | | | |
| AN-M2-02 | (core) Harm table: does a late answer read as slowness, laziness or incompetence of the person? | | | |
| AN-M2-03 | Variability multiplier 1 to 3 (default 2.0, ceiling 2.6): LO / OK / HI. | | | |
| AN-M2-04 | Slow-tail share 0.05 to 0.30 (default 0.175, ceiling 0.25): LO / OK / HI. | | | |
| AN-M2-05 | M1 to M2 coupling 0 to 0.8 (default 0.4, ceiling 0.64): LO / OK / HI. Is linking an intrusion to a later answer fair? | | | |
| AN-M2-06 | The analogue is a delay in the interface registering answers, not an internal process. Does that mislead, or feel like "the software is broken"? | | | |
| AN-M2-07 | How the delay appears to the person doing the task: acceptable? | | | |

### 2.10 Mechanism M3 delay aversion (grade S2)

| ID | Look at / ask | Verdict | Hold | Note |
|---|---|---|---|---|
| AN-M3-01 | (core) Does a growing pull toward a smaller, sooner option during a forced wait resemble anything you or people you know report? | | | |
| AN-M3-02 | (core) Harm table: does choosing the quick option read as impulsive or weak? Is "Either is fine" enough? | | | |
| AN-M3-03 | Discount rate k 0.02 to 0.20 per s (default 0.11, ceiling 0.164): LO / OK / HI. | | | |
| AN-M3-04 | Pull-cue intensity 0.2 to 1.0 (default 0.6, ceiling 0.84), shown as a growing glow on one card: LO / OK / HI. Too strong or too coercive? | | | |
| AN-M3-05 | Wait length 5 to 30 s (default 15, set by the scenario): right? | | | |
| AN-M3-06 | The clock is not distorted; time perception is not modelled. Is leaving it out acceptable, or misleading by omission? | | | |
| AN-M3-07 | Evidence is from adolescents; use for adults at work is an extrapolation. Is the caveat (facilitator panel only) enough? | | | |

### 2.11 Mechanism M4 salience capture (grade S2, mixed)

| ID | Look at / ask | Verdict | Hold | Note |
|---|---|---|---|---|
| AN-M4-01 | (core) Does a notification that pulls the view resemble anything you or people you know report? | | | |
| AN-M4-02 | (core) Harm table: does it read as blaming the person for being distractible? | | | |
| AN-M4-03 | Event rate 2 to 10 per min (default 6, ceiling 8.4): LO / OK / HI. | | | |
| AN-M4-04 | Capture probability 0.1 to 0.7 (default 0.4, ceiling 0.58): LO / OK / HI. | | | |
| AN-M4-05 | Task-difficulty modifier 0.5 to 1.5 (default 1.0, set by the scenario; p capped at 0.95): right idea that capture depends on difficulty? | | | |
| AN-M4-06 | Dwell 0.5 to 3 s (default 1.75, ceiling 2.5), card moved to centre with a vignette: too sudden or harsh? | | | |
| AN-M4-07 | The 7 notification texts and sender names (`NOTIFS`, line 397) and the optional ping: wording, realism, tone. | | | |

### 2.12 Mechanism M5 hyperfocus (grade S3, advanced, off by default)

| ID | Look at / ask | Verdict | Hold | Note |
|---|---|---|---|---|
| AN-M5-01 | (core) Should M5 exist at all, given self-report-only evidence? Keep as advanced and off, remove, or other? | | | |
| AN-M5-02 | (core) Harm table: could it read as a "superpower", or blame the person for missing cues? | | | |
| AN-M5-03 | Onset 30 to 120 s (60), multiplier 0.1 to 0.6 (0.3), cue missed 0.3 to 0.9 (0.6), duration 30 to 120 s (75): LO / OK / HI each. | | | |
| AN-M5-04 | The milestone-board task flagged "high-interest", and the state never being shown to the participant: acceptable? | | | |

### 2.13 Workplace changes (ADP) and comparison (CMP)

| ID | Look at / ask | Verdict | Hold | Note |
|---|---|---|---|---|
| AN-ADP-01 | "Written follow-up": restores missed phrases (M1). Wording, realism, fairness. | | | |
| AN-ADP-02 | "Fewer notifications": outside events about 60% less often (M4; factor 0.4 is a design value). | | | |
| AN-ADP-03 | "Structured deadline": stated end and checkpoints, pull cut by 60% (M3; factor 0.4 is a design value). | | | |
| AN-ADP-04 | Does the box imply the individual's difficulty is "fixed" by toggles? Is "illustrative, not proven" clear? Which changes are missing, especially ones the whole team makes? | | | |
| AN-CMP-01 | (core) The comparison table (missed phrases, matching answers, instruction parts, the wait, late responses, intrusions, outside events, time): could it be read as a score of the person? | | | |
| AN-CMP-02 | Framing: "These counts describe what the conditions did to one small task. They are not a measure of your attention, or anyone’s, and they do not predict how any person works." Enough? | | | |
| AN-CMP-03 | Should this screen exist at all? | | | |

### 2.14 Debrief (DB1 to DB10, DBX)

For each section: `-01` accuracy and tone (does it read as accurate and respectful; any pity, comedy, inspiration or incompetence); `-02` what to add, change or remove. Gist in 1.4; full text in the app.

| ID | Look at / ask | Verdict | Hold | Note |
|---|---|---|---|---|
| AN-DB1-01 | (core) 1 "What you just did is an analogue": accuracy and tone. | | | |
| AN-DB1-02 | Anything a participant must know before leaving that is missing? | | | |
| AN-DB2-01 | (core) 2 "Strengths and adaptation": accuracy and tone. | | | |
| AN-DB2-02 | Card 2 holds no strengths statement until advisors write one or record a decision not to use one (`ethics/irb-packet.md` 4.5). Will you write it, in what form, and how should it avoid "superpower" or silver-lining framing? | | | |
| AN-DB3-01 | 3 "People differ widely": accuracy and tone. | | | |
| AN-DB3-02 | "Ask rather than assume": is that safe advice, or can it pressure disclosure? | | | |
| AN-DB4-01 | 4 "Accommodations and practice": accuracy and tone. | | | |
| AN-DB4-02 | Which practices to add or remove? Could an employer misuse the list? | | | |
| AN-DB5-01 | 5 "Mismatches go both ways": accuracy and tone. | | | |
| AN-DB5-02 | It extends autism research (double empathy) to ADHD cautiously. Keep, qualify, or remove? | | | |
| AN-DB6-01 | (core) 6 "Your reaction": accuracy and tone. | | | |
| AN-DB6-02 | "Pity, discomfort or confusion are common reactions" cites no source on the card. Keep, soften, remove? | | | |
| AN-DB7-01 | (core) 7 "What not to do next": accuracy and tone. | | | |
| AN-DB7-02 | What else should it say a colleague must not do? | | | |
| AN-DB8-01 | 8 "Lived-experience voice" is a placeholder. Who should author it, in what form (text, audio, video), credited how? (Paying for authoring is a founder gate.) | | | |
| AN-DB8-02 | Should the placeholder card be shown at all until real content exists? | | | |
| AN-DB9-01 | 9 "Where to learn more and raise a concern": what would you trust here (named person, resource list, channel)? | | | |
| AN-DB9-02 | Interim line "raise concerns with whoever ran your session": acceptable? | | | |
| AN-DB10-01 | 10 "Check in with yourself": wording and tone. | | | |
| AN-DB10-02 | "If you are in distress or crisis, contact local support or emergency services." Enough? Anything to change? | | | |
| AN-DBX-01 | (core) The debrief is required, and only Stop skips it. Right? | | | |
| AN-DBX-02 | The continue button unlocks at the end of the page (reading is not verified). Acceptable? | | | |
| AN-DBX-03 | Length (about 3 minutes, unverified) and text-only format. What should be audio or video, recorded by advisors? | | | |
| AN-DBX-04 | Order: debrief comes before planning and the T1 questions. Right? | | | |
| AN-DBX-05 | The line "Draft wording written by the product agent from the co-design charter. Not yet reviewed or approved by any neurodivergent advisor." Keep until approval? | | | |

### 2.15 Planning, questions, export, facilitator panel, claims

| ID | Look at / ask | Verdict | Hold | Note |
|---|---|---|---|---|
| AN-PLN-01 | The 14 practices (10 from the study menu, 4 non-menu such as "Ask people to share any diagnosis before offering flexibility"): wording, missing items, harm. | | | |
| AN-PLN-02 | 5 slots and a time budget of 8 with placeholder costs, no score shown: sensible? | | | |
| AN-PLN-03 | The agenda and written follow-up templates: useful, respectful? | | | |
| AN-MEA-01 | (core) Day-0 questions (practices, intentions, confidence, knowledge, closeness picture, distress 0 to 10): wording and burden. Anything othering? | | | |
| AN-MEA-02 | Knowledge item "ADHD means a person cannot focus" (answer: false) and "Research findings about ADHD describe groups of people, not any one individual" (true): wording OK? | | | |
| AN-MEA-03 | Closeness picture "relationship with people who have ADHD, as a group": acceptable, or does it other? | | | |
| AN-MEA-04 | Are the questions optional enough (Skip; facilitator can switch them off)? Should they be on or off by default? | | | |
| AN-EXP-01 | (core) Export contents (README "Export"): settings, counts, delays, day-0 answers, no identifiers or step times. Comfortable? What would you remove? | | | |
| AN-EXP-02 | Safety telemetry kept without times: pause lengths, ease-off count, skip count, screen and round of a Stop. Keep or drop? (README leaves this to founder and advisors; unverified.) | | | |
| AN-EXP-03 | Who may see the file? "Per the co-design charter, an employer must not require this file." Enough protection? | | | |
| AN-FAC-01 | (core) A facilitator panel lets a third party set intensity. Is that acceptable? What guardrails? | | | |
| AN-FAC-02 | Default intensity 0.5 and session ceiling 0.8 (design choices): keep, lower, or other? Raising the ceiling needs a spec change and a founder decision. | | | |
| AN-FAC-03 | No ADHD "profile" presets, by design; mechanisms vary independently. Agree? | | | |
| AN-FAC-04 | Who should facilitate (ND-affiliated, trained, from outside the company)? The facilitator log shows session times; panel only. | | | |
| AN-CLM-01 | (core) The product claim (1.5). Accurate, respectful, anything you would change? | | | |
| AN-CLM-02 | (core) Does anything claim or imply that using this lets someone understand or feel what ADHD is like? | | | |
| AN-CLM-03 | Title and header wording: "A short, honest illustration of four attention and timing patterns"; "Attention-load illustration". | | | |
| AN-CLM-04 | The word "analogue" and the phrase "made-up, adjustable way": clear and fair? | | | |
| AN-CLM-05 | Evidence labels S1, S2, S3 and caveats are shown to facilitators only. Should participants see them? Are the labels fair? | | | |
| AN-CLM-06 | Language: "people with ADHD" or identity-first wording? Terms to avoid, beyond the list in 1.5? | | | |
| AN-CLM-07 | The working name "Perspective Engine": does it suggest something you object to? | | | |
| AN-CLM-08 | The Nario-Redmond sentence and the statement "has not been shown to build empathy": fair to the evidence and to you? | | | |

### 2.16 Coverage check

README lists draft content that needs advisor review (charter s3 veto, s5 harm review). Each maps to IDs: intro text INT; consent wording CON; both email forms and questions TSK; inner-voice fragments AN-M1-06; notification texts AN-M4-07; debrief (all ten, card 8 a placeholder) DB1 to DB10, DBX; comparison framing CMP; workplace-change texts ADP; practice list, time costs and templates PLN; sensory defaults SEN; the 0.8 ceiling AN-FAC-02; harm review GEN-02 to GEN-06 and every harm-table item; concerns and check-in route AN-DB9, AN-DB10, AN-STP-09.

## 3. Advisor veto rule

As stated in `ethics/advisory-board.md` (s3 recruitment call, s4 scripts; restating the charter; charter text itself not read for this kit):

- Any single advisor can place a hold on anything the company makes about neurodivergent people. Staff, including the founder, cannot override or lift it. Silence is not approval.
- A hold stands until the holder accepts a change, or a majority of advisors lifts it after hearing the holder.
- Each review ends with a round-robin vote, pass allowed: **Approve**, **Approve with named changes**, or **Hold**. The facilitator does not argue for approval. No count of approvals is shown before the holder speaks.
- Pay is never tied to approval, endorsement or tenure; a hold does not reduce pay. Advisors get no equity or revenue share.
- In this kit: the `Hold` column is the veto in writing. An item with a hold is not released to any real participant, and no agent may mark it resolved. Only the facilitator's session log (date, item, version, outcome, reasoning, read back to advisors) can close one.
- The advisory-board plan says the charter takes effect only once advisors approve a version, and that a first content review comes only after a debrief draft exists (it now does). The founder confirms advisors have approved a charter version before treating any outcome as binding.

## 4. Session logistics

| Item | Plan (all proposals unless noted) |
|---|---|
| Length | 60 to 90 minutes per review session (advisory-board s4B). 60-minute variant: core items only, shorter walk-through. Breaks at the midpoint; camera optional. |
| Pay | Floor USD 50 per hour for all time worked (screening, reading, prep, sessions, async review, time after a distressing item), not contingent on approval or hold; minimum 1 hour per booked session; company-cancelled sessions inside 48 hours paid in full; access costs (captioning, interpreters, assistive technology) are the company's budget. The final rate is the founder's decision (`docs/founder-decisions.md` item 2, open). Benchmarks are snippet-level and not ND-specific (advisory-board s1, unverified). |
| People | A named human facilitator (founder item 4, open) and a second person as note-taker; notes on screen live and open to advisor correction. Agents draft only; they do not run sessions or contact anyone. |
| Recording | Not recorded by default. Any recording needs each advisor's explicit, revocable consent, asked separately and before it starts, with "no" an easy answer. Storage place, retention and what happens on withdrawal: no policy exists in my inputs; unverified, founder with counsel. |
| Before (T-5 days) | Agenda, charter, one-page plain summary (1.1), content note, participation options (video, audio only, text chat only, async written), this form, pay confirmation, facilitator and backup names. |
| Format options | Live, text chat (counts as speaking), audio only, or async written. Advisors may run their own copy of `index.html` offline on their device, or watch the facilitator's screen share. The app has no free-text fields, so feedback goes only into this form. Advisors are never asked to send an export file. |
| Content note | Read aloud and in writing first: interruptions, a wait, notifications, optional sound, nothing flashes, may feel inaccurate or upsetting. Offer to skip any part. "You can leave at any point and keep the full session fee." |
| After | Written follow-up within 2 working days; human follow-up within one working day after any distress; hours confirmed; each advisor chooses per comment: on the record, anonymous, or not recorded. |

Agenda for a 90-minute session (adapted from advisory-board s4B):

| Time | Step |
|---|---|
| 0:00 to 0:10 | Arrive and set up. Chat always open. Notes on screen. Recording only if each advisor has said yes. |
| 0:10 to 0:15 | Content note, what you will see, how to Stop, the hold rule in one minute. |
| 0:15 to 0:40 | Walk-through of that session's screens (1.2). Advisors may Stop, Pause or skip at any time. |
| 0:40 to 0:50 | Silent review and writing or typing (5 to 10 minutes), sensory controls and pause on. |
| 0:50 to 1:15 | Form items round-robin, core first, pass allowed. Facilitator does not defend the text. Disagreement is logged verbatim. |
| 1:15 to 1:25 | Decision per area: Approve / Approve with named changes / Hold. |
| 1:25 to 1:30 | Read back the log, attribution choices, hours to claim, check-in by each person's chosen method. |

Facilitator rules (advisory-board s4): never ask for diagnosis, treatment history or personal trauma; never ask one advisor to speak for others; never reward agreement or press for a decision to hit a launch date; never pitch the product; pause at any sign of distress (offer a break, an exit with full pay, human follow-up). Any claim near charter s7 goes to advisors before it is spoken. Counsel questions (classification, tax, benefits interaction, privacy) are not answered here (unverified).

Founder gates before the first session (none cleared): approve rate and payment terms; appoint facilitator and note-taker; approve each outreach channel and message; sign contracts; make payments; choose the recording tool and policy; set up the concerns route and resource list that debrief cards 9 and 10 depend on; confirm advisors approved a charter version; confirm whether advisor review of this build satisfies the "harm review" that the on-screen banner names (unverified).

## 5. How each note becomes a change

Intake (founder or facilitator to agent, same day). Provide the notes as a table: `Note ID | Session date | Advisor label (per attribution choice) | Verdict | Hold | Note (verbatim) | Attribution (N named, A anonymous, X not recorded) | Read back and corrected (Y/N)`. Only rows read back to the advisor, or confirmed by them in writing, count. For attribution X, the words are not kept; the ID, verdict and hold are kept, and a `CH` needs a short instruction the advisor agreed may be recorded. Suggested file: `perspective-engine/mvp/advisor-notes-<date>.md` (not created; founder decides where advisor words are stored). Check the `index.html` sha256 against section 0.

Triage order: 1) holds; 2) safety and consent (STP, CON, SEN, CLM); 3) debrief and task text; 4) mechanism parameters; 5) everything else. `ND` items go back to the facilitator for follow-up and get no change.

Disposition (exactly one per note, kept in the CHANGELOG register):
- **APPLIED**: edited; entry added.
- **NO-CHANGE**: verdict OK, or advisor chose to leave it; logged so the register is complete.
- **NEEDS-DECISION**: only the founder can decide or supply it (named contact, resource list, payment, authoring of the lived-experience card).
- **NEEDS-SPEC**: parameter outside the mechanism-spec range, or a raised ceiling. The spec is another agent's file; the product agent records the note and does not edit it. Lowering a value, range or ceiling within the spec is allowed without a spec change.
- **CONFLICT**: two advisors disagree. Goes back to the advisors; the agent does not choose.
- **BLOCKED-RULE**: would break a product floor (flashing above 3 Hz, a hidden Stop, data leaving the device, a claim barred by the claims guard). Not implemented; the reason is recorded and the holder is told. Advisors can only make the product safer than the floor.

Rules:
- No note ID, no change. A change that cannot cite a note ID is not made. A change needed only to make a noted change work cites that same ID.
- Advisor wording replaces the draft verbatim. The agent does not paraphrase advisor words into claims. The CHANGELOG records the ID, not the advisor's words or name unless they chose attribution.
- The agent never decides a hold is resolved, and never argues against one. A changed item goes back to advisors for a new Approve / Hold before release.
- Edits touch `mvp/index.html`, and the README sections that describe the changed behaviour. If a wording change affects the in-app self-test (for example the prohibited-phrase list, line 1254), update the test in the same change.

Routing (baseline lines in `index.html`):

| Area | Where |
|---|---|
| INT, CON, CLM | `#s-intro` 173-198; banner 168; header 158; summary comment 8-21; `buildBrief2` 898; `buildDone` 999; phrase list 1254 |
| SEN | settings card 189-194; `Aud` 444; CSS `#vig` 115, `#innerWrap` 119, `.sooner.pulling` 100 |
| STP | header buttons 161-164; pause dialog 226-229; `skipStep` 716; `doStop` 808; `easeOff` 816; `buildStopped` 991 |
| TSK | `FORMS` 353-394; `initWait` 610; `renderQ` 643; `renderReply` 667; `buildRunShell` 837 |
| M1 | `MECH.M1` 275-281; `INNER` 396; `startIntr` 520; `endIntr` 527; `m1Tick` 535 |
| M2 | `MECH.M2` 282-288; `drawDelay` 496 |
| M3 | `MECH.M3` 289-295; `pullAt` 606; `initWait` |
| M4 | `MECH.M4` 296-303; `NOTIFS` 397; `showNotif` 547; `m4Tick` 559 |
| M5 | `MECH.M5` 304-311; `CUES` 398; `MILES` 686; `initFlow` 687; `flowTick` 703 |
| ADP, CMP | `ADAPT` 324-329; `buildRunShell` 843; `toggleAdapt` 850; `buildCompare` 911 |
| DB1-DB10, DBX | `DEBRIEF` 430-441 (section n is the nth entry); `buildDebrief` 934; `finishDebrief` 946 |
| PLN, MEA | `PRACT` 418; `TOOLKIT` 426; `buildPlan` 952; measures 400-417; `renderMeasures` 863 |
| EXP | `buildExport` 1109; `buildDone` 999 |
| FAC | `CEIL` 236; `buildFac` 1030; `mechCard` 1014 |

Verification of every change (recorded as "verified by"): extract the script and run `node --check`; open `index.html#selftest` at about 390 px and about 1280 px wide and record "n of n" (59 of 59 at baseline, per README); look at the changed screen by hand; confirm Stop is still visible; confirm no network calls and no flashing above 3 Hz where cues changed. Do not write "advisor approved" unless the facilitator's log says so. Bump `VERSION` for each release (proposed `0.2.N-V14`), keep the top `SUMMARY` comment at 150 words or fewer, and add the entry to `mvp/CHANGELOG.md`.

Close the loop: read the change list back to advisors by note ID (next session or written within 2 working days). The holder accepts, or the hold stands. The facilitator's log then supplies the date for a "HOLD closed" line in the CHANGELOG register.
