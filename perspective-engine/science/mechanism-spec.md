# Perspective Engine: Mechanism Spec (V01, 2026-10-06)

## Summary (read this only if short on tokens)
The simulation models five published-evidence mechanisms as separable, independently adjustable "experience analogues" for neurotypical users: M1 default-mode (DMN) intrusions, M2 reaction-time (RT) variability, M3 delay aversion, M4 salience capture, M5 hyperfocus. Evidence strength differs: M2 strongest, M1/M3/M4 moderate and contested, M5 weakest (self-report only, default OFF). All numeric ranges are DESIGN parameters chosen for perceptibility and comfort, not empirical ADHD estimates; they are to be calibrated with lived-experience advisors in the pilot. Group-level findings do not describe individuals, so the sim never diagnoses, scores or predicts a person. Sections 5 and 6 list design guards (from Nario-Redmond 2017) and everything NOT modeled (dB SNR, quantum, hyperactivity, working memory, time blindness, emotion, genotype, treatment, and more).

## 1. Scope and framing
- Product claim allowed: "an interactive illustration of five documented attention/timing patterns that some people with ADHD report or show at group level." Not allowed: "feel what ADHD is like", any diagnosis, severity, symptom-reduction or treatment claim (dossier section 8: stay in educational/general-wellness territory; confirm with counsel).
- Each mechanism has an intensity I in [0,1] (default 0.5, session ceiling 0.8, design choice to limit the discomfort and helplessness Nario-Redmond et al. found, https://pubmed.ncbi.nlm.nih.gov/28287757/). Mechanisms vary independently, which respects ADHD heterogeneity (dossier section 4). There are no "ADHD profile" presets.
- Concrete variable = lo + I x (hi - lo), unless stated.
- Evidence provenance: "D" = taken from perspective-engine/research/evidence-dossier.md (search-snippet level, per its method note). "V01" = added in this node by two web searches; full texts were not readable (egress blocked), so these are snippet-level and must be re-checked in the papers before external quoting.
- Strength scale: S1 = among the most consistent group-level findings (per dossier); S2 = theory-backed, imaging/behavioural support, contested or mixed; S3 = self-report only.

## 2. Mechanisms

### M1. Default-mode interference (internal intrusions) | strength S2
- Evidence (D): Default-mode interference hypothesis (periodic DMN intrusions into task-positive processing; reduced DMN deactivation linked to RT variability), Sonuga-Barke & Castellanos 2007. https://pubmed.ncbi.nlm.nih.gov/17445893/ (doi:10.1016/j.neubiorev.2007.02.005) and https://sciencedirect.com/science/article/abs/pii/S0006899309004612
- Caveat: a hypothesis with imaging support, not a diagnostic marker; group-level only. Exact intrusion frequency and duration in people: unverified (not in dossier), hence no empirical values below.
- Simulation: irregular, self-generated off-task content (inner-voice text/audio fragments) intrudes on a running task stream, and part of the task information during the intrusion is missed (dimmed or skipped). The events are internal, with no external cause, and are kept separate from M4.

| Variable | Unit | lo | hi | Default (I=0.5) | Basis |
|---|---|---|---|---|---|
| Intrusion rate | events/min | 0.5 | 4 | 2.25 | design |
| Intrusion duration | s | 2 | 8 | 5 | design |
| Share of task info lost during intrusion | fraction | 0.2 | 0.8 | 0.5 | design |
| Minimum gap between intrusions | s | fixed 5 | | 5 | design; timing irregular on purpose, no claim of periodicity (unverified) |

### M2. Reaction-time variability | strength S1
- Evidence (D): Intra-individual RT variability is among the most consistent ADHD findings; weak/contested association with DAT1 genotype (not modeled). Kofler et al. 2013 meta-analysis (319 studies; g = 0.76 children/adolescents, g = 0.46 adults) https://doi.org/10.1016/j.cpr.2013.06.001 ; DAT1 review (Kebir et al. 2009) https://pmc.ncbi.nlm.nih.gov/articles/PMC2647566 ; link to reduced DMN deactivation: Fassbender et al. 2009, Brain Research 1273:114-128 (n = 12 ADHD, 13 controls; greater RTV tied to failure to deactivate ventromedial PFC) https://pubmed.ncbi.nlm.nih.gov/19281801/ (search-summary level, re-check in full text)
- Caveat: the finding is variability, not simply slowing, so the model keeps the mean response delay constant and changes the spread and tail. Distribution shape (slow tail) is a design assumption (unverified in dossier).
- Simulation: the delay between a cue (for example a question addressed to the user's character) and the character's registered response is drawn from a right-skewed distribution, so most responses are normal and some are very late.

| Variable | Unit | lo | hi | Default | Basis |
|---|---|---|---|---|---|
| Variability multiplier on scenario baseline CV | x | 1.0 | 3.0 | 2.0 | design |
| Share of responses from slow tail | fraction | 0.05 | 0.30 | 0.175 | design |
| Mean-delay drift allowed | % | fixed +-5 | | +-5 | design (variability, not slowing) |
| Coupling M1 -> M2 (probability the first response after an intrusion comes from the slow tail) | prob | 0 | 0.8 | 0.4 | design, motivated by the DMN-RT link (D); strength of coupling unverified |

### M3. Delay aversion / temporal discounting | strength S2
- Evidence (D): Delay aversion and temporal discounting linked with DMN hypoconnectivity in adolescents. https://pubmed.ncbi.nlm.nih.gov/35032471
- Caveat: the cited link is in adolescents; applying it to adult workplace scenes is an extrapolation. Hyperbolic form V = V0 / (1 + k x D) is a standard modelling convention, not taken from the dossier source (unverified).
- Simulation: a forced wait (queue, long meeting segment, slow approval) in which the felt pull of an immediate smaller option grows with elapsed delay. The sim shows this as a visible, growing "pull" cue and a choice between a smaller-sooner and a larger-later option. It does not distort the clock; time-perception differences are not modeled (section 6).

| Variable | Unit | lo | hi | Default | Basis |
|---|---|---|---|---|---|
| Discount rate k | 1/s | 0.02 | 0.20 | 0.11 | design |
| Forced wait length D | s | 5 | 30 | scenario-set | design |
| Pull-cue intensity | 0-1 | 0.2 | 1.0 | 0.6 | design |

### M4. Salience capture (external distractor capture) | strength S2, mixed
- Evidence (V01, snippet-level): adults with ADHD show higher behavioural distractibility than controls; ERP data suggest enhanced bottom-up processing of distractors in high-difficulty trials and enhanced top-down processing in low-difficulty trials, so capture depends on task difficulty. https://www.researchgate.net/publication/323087318_Distraction_by_Salient_Stimuli_in_Adults_with_Attention-DeficitHyperactivity_Disorder_Evidence_for_the_Role_of_Task_Difficulty_in_Bottom-Up_and_Top-Down_Processing . Neuroimaging: "Altered salience processing in ADHD", https://pmc.ncbi.nlm.nih.gov/articles/PMC4670482/ . Top-down control mechanisms of distractibility: https://www.sciencedirect.com/science/article/abs/pii/S0010027709002935 . Authors, sample sizes and effect sizes: unverified.
- Caveat: findings on direction and size are mixed in the snippets (task-difficulty dependent), so the model makes task difficulty an explicit moderator and never a fixed "ADHD distractibility".
- Simulation: salient irrelevant events (motion, sound, notification) occur in the scene; each has a probability of capturing attention, shown as a pull of the view or highlight toward it for a dwell time. Capture probability rises with task difficulty.

| Variable | Unit | lo | hi | Default | Basis |
|---|---|---|---|---|---|
| Salient event rate | events/min | 2 | 10 | 6 | design |
| Capture probability p at nominal difficulty | prob | 0.1 | 0.7 | 0.4 | design |
| Task-difficulty modifier on p (scenario-set) | x | 0.5 | 1.5 | 1.0 | design, direction from V01 evidence; p capped at 0.95 |
| Capture dwell | s | 0.5 | 3.0 | 1.75 | design |

### M5. Hyperfocus | strength S3 (self-report), default OFF
- Evidence (V01, snippet-level): Hupfeld, Abagis & Shah 2019, "Living 'in the zone': hyperfocus in adult ADHD", Adult Hyperfocus Questionnaire, pilot n = 251 and replication n = 372, tested whether hyperfocus is more prevalent with higher ADHD symptoms. https://link.springer.com/article/10.1007/s12402-018-0272-y . Follow-ups: "Testing the relation between ADHD and hyperfocus experiences", https://www.sciencedirect.com/science/article/pii/S0891422220302213 (finding unverified); AHQ-D validation, https://www.nature.com/articles/s41598-024-70028-y .
- Caveat: self-report only; no behavioural or neural validation found; whether hyperfocus is specific to ADHD is unverified here. The sim must not present it as a "superpower" or as proof of strengths. It is the weakest-evidence mechanism and is off by default.
- Simulation (advanced mode only): when the scenario flags a task as high-interest, the user's character can enter a locked-in state. M1 and M4 are damped, and non-task cues (a colleague's message, a timer) are more likely to go unnoticed. Consequences for external cues are a design assumption (unverified).

| Variable | Unit | lo | hi | Default | Basis |
|---|---|---|---|---|---|
| Enabled | bool | | | OFF | evidence weak |
| Onset latency on a flagged high-interest task | s | 30 | 120 | 60 | design |
| Multiplier on M1 rate and M4 p while active | x | 0.1 | 0.6 | 0.3 | design |
| Probability non-task cue is missed while active | prob | 0.3 | 0.9 | 0.6 | design, unverified |
| Duration | s | 30 | 120 | 75 | design |

## 3. Interaction rules (kept minimal and explicit)
1. M1 -> M2 coupling only, via the parameter above. No other cross-effects between M1-M4: M1 is internal, M4 external, M3 time-based, and each can be varied alone.
2. M5, when enabled, damps M1 and M4 only. It does not alter M2 or M3.
3. No hidden state or "attention meter" is shown to the user; any such number would be pseudo-quantitative.

## 4. Calibration and validity plan
- All design ranges above are provisional. Calibrate in the pilot by lived-experience advisor ratings of recognisability and acceptability, not by matching clinical scores.
- Pre-register the pilot with a 4-8 week follow-up and measure interaction attitudes and behaviour, not only empathy (dossier, strategy section). VR/media effects are strongest on emotional empathy (d = 0.33) and weak on cognitive empathy (d = 0.08), see https://tmb.apaopen.org/pub/vr-improves-emotional-empathy-only , so the sim must not assume it builds understanding.
- Empirical ranges for humans (rates, durations) are unverified; before any external claim, replace "design" entries with cited values or keep them labelled as design.

## 5. Design guards derived from the evidence
- Nario-Redmond et al. 2017: simulations raised pity, discomfort and helplessness and did not improve interaction attitudes; short exposures ignore adaptation. https://pubmed.ncbi.nlm.nih.gov/28287757/ . Therefore: no "walk a mile in my shoes" framing; short sessions (design: 5-15 min, unverified); mandatory debrief; lived-experience voices authored by neurodivergent advisors; scenes that include adaptations and strengths.
- Adaptation toggles (for example written follow-up, fewer notifications, structured deadlines) reduce the effect of M1-M4 as an illustration. Efficacy of specific accommodations is unverified in the evidence base, so they are labelled illustrative and co-designed, never as proven interventions.
- Reciprocity: the double empathy problem (https://journals.sagepub.com/doi/10.1177/13623613221129123) is autism-specific; extending it to ADHD is an extrapolation. It is a scenario-design principle (paired, two-way scenes), not a simulated mechanism.

## 6. What is NOT modeled
1. Any dB "SNR", "neurotypical filtering", entropy of "windows", or quantum computing (refuted or unsupported in the dossier).
2. Diagnosis, screening, severity scores, DSM presentations (inattentive/hyperactive/combined) or presets that imitate them.
3. Individual-level inference: the sim does not infer a user's attention or any user's ADHD, and does not estimate any person's experience.
4. Hyperactivity and motor restlessness.
5. Response inhibition and impulsivity beyond delay aversion (M3).
6. Working memory, planning and other executive functions.
7. Time perception differences or "time blindness" (not in the evidence base here); M3 does not distort the clock.
8. Emotional dysregulation, rejection sensitivity, masking, burnout, stigma experience.
9. Genotype effects (DAT1 findings are weak and contested).
10. Medication, treatment effects, symptom improvement, or any therapeutic outcome.
11. Comorbidity (autism, anxiety, depression, sleep), age, sex/gender and cultural differences.
12. Sensory processing differences.
13. Empathy gain, attitude change or behaviour change as simulated outcomes; these are measured in the study, not assumed.
14. Fixation-level or clinical eye tracking; if WebGazer is used, only coarse on-screen attention demos (error about 2-4 degrees, dossier section 10), never diagnostic.
15. Market, pricing, reimbursement and regulatory questions (see dossier sections 6-9).
