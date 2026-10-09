# Perspective Engine: Measurement Instruments and Study Design (V02, 2026-10-06, agent Tukey)

## Summary (read this only if short on tokens)
Pre-registered, team-clustered randomized pilot of managers: simulation + debrief vs an equal-length information-only control, measured at T0 (pre), T1 (post, same session) and T2 (day 30, window 25-35). PRIMARY outcome is behavior: a study-specific Accommodation Action Index (AAI), the share of 10 listed manager practices actually enacted in the 30 days after, verified by system logs or anonymous direct-report corroboration (self-report alone is secondary). Mood and empathy are secondary or monitoring only. Named, web-confirmed scales: IRI Perspective-Taking (Davis 1983), QPS stigma toward adults with ADHD (Fuermaier 2012), RIBS (Evans-Lacko 2011), OMS-WA (Lindsay 2024), IOS (Aron 1992), Marlowe-Crowne short form (Reynolds 1982), AQ-27 pity subscale (Corrigan 2003) as harm monitor. The AAI is NOT validated; adaptations of scales to ADHD are unvalidated. Pilot is for estimation, not confirmation; nulls are reported with CIs; cells n<10 are suppressed.

Status tags: **[confirmed]** = bibliographic details seen in a web search this node (snippet level, full text not read); **[partial]** = part confirmed; **[unverified]** = from memory or not found, do not quote externally.

## 1. Design

| Item | Specification |
|---|---|
| Population | Managers / team leads who decide on workplace practices (the people whose behavior buyers pay to change). Secondary respondents: their direct reports (anonymous). |
| Arms | **T-arm**: simulation (mechanism-spec M1-M4, M5 off, intensity default 0.5, ceiling 0.8) + mandatory debrief + commitment-planning step. **C-arm (active control)**: equal-time information module on ADHD at work (group-level facts, accommodation menu, same commitment-planning step, no simulation). **W-arm (optional)**: waitlist, gives the natural 30-day base rate. Planning is held constant in T and C so the contrast isolates the simulation. Rationale: Nario-Redmond 2017 found simulations did not improve interaction attitudes (https://pubmed.ncbi.nlm.nih.gov/28287757/), so the pilot must test whether the sim adds anything over information. |
| Randomization | By team (cluster), stratified by organization and seniority, to limit contamination between managers who talk. Allocation concealed until enrolment. |
| Waves | **T0** pre (within 7 days before). **T1** post (immediately after session). **T2** behavioral follow-up at day 30 (window 25-35). **T3** optional day 56 durability wave (mechanism-spec section 4 asks for 4-8 weeks). |
| Blinding | Participants cannot be blinded to arm. Analyst blinded to arm labels until the analysis script is frozen. Direct reports blinded to their manager's arm. |
| Pre-registration | Register on a public registry (for example OSF) before the first participant: hypotheses, AAI definition, exclusions, analysis code. Deviations are logged and reported. |
| Out of scope here | Recruitment, ethics approval, buyer contracts, any contact with real people: founder gates, handled in later nodes. |

## 2. Outcomes

### 2.1 PRIMARY (behavior, day 30): Accommodation Action Index (AAI)
- Definition: proportion of applicable practices enacted in the prior 30 days from a fixed 10-item menu, scored 0-1. Items are "universal design" practices that apply to all team members, so no employee is identified or asked to disclose a diagnosis. Candidate items, to be finalized with lived-experience advisors: (1) agenda sent 24 h before meetings; (2) written follow-up after meetings; (3) priorities and deadlines stated in writing; (4) large tasks split with interim checkpoints; (5) notification-light or focus-time blocks offered; (6) asking team members what helps them work, without requiring disclosure; (7) quiet-space or headphone/remote-work flexibility offered; (8) a written response to any accommodation request within a stated time; (9) feedback structured and specific rather than vague; (10) check-ins on workload at a regular cadence. Categories are drawn from the Job Accommodation Network ADHD resource (https://askjan.org/disabilities/Attention-Deficit-Hyperactivity-Disorder-AD-HD.cfm, snippet-level read). Efficacy of each practice for ADHD is **unverified** (mechanism-spec section 5), so the AAI counts adoption, not benefit. "Not applicable" is allowed (for example no request received), and the denominator excludes it.
- **AAI-verified (the primary)**: item counted only if backed by (a) a system or calendar log the buyer agrees to share in aggregate (agenda timing, follow-up message present), or (b) at least 3 direct reports per manager confirm it in an anonymous survey (majority confirm, individual answers never shown to the manager or employer).
- **AAI-self (secondary)**: manager self-report of the same 10 items. Higher bias risk (social desirability), always shown beside AAI-verified.
- Psychometric status: study-specific, **unvalidated**. Before use: content review by lived-experience advisors, cognitive interviews, test-retest and inter-source agreement (self vs direct-report) reported in the pilot.
- Baseline: same items asked about the previous 30 days at T0 (covariate; baseline reports may prime, noted as a limitation). Direct-report baseline survey preferred, otherwise T2 only (randomization still identifies the effect).

### 2.2 Proximal behavioral measures (T1, not a substitute for the primary)
- **Practice-selection task**: a realistic team scenario, 5 practice "slots", the participant chooses which practices to adopt from the AAI menu with time-cost trade-offs. Scored as the number chosen and the share matched to the menu. This is a decision proxy, not enacted behavior. Study-specific, unvalidated.
- **Toolkit take-up**: whether the participant opens or downloads agenda/follow-up templates in-session (click log). Any later message to the participant is a gated step (contact with real people).
- Sim telemetry as dose only: duration, intensity set, adaptation toggles used, debrief completion. No gaze, webcam or biometric data is stored (mechanism-spec section 6, item 14).

### 2.3 Secondary (attitudes, intentions), and what each can and cannot tell us

| Construct | Instrument | Items | Waves | Status and caveats |
|---|---|---|---|---|
| Stigmatizing attitudes toward adults with ADHD | **QPS**, Questionnaire on Stigmatizing Attitudes toward Adults with ADHD: Fuermaier ABM, Tucha L, Koerts J, Mueller AK, Lange KW, Tucha O (2012). Measurement of stigmatization towards adults with attention deficit hyperactivity disorder. PLoS ONE 7(12): e51755. https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0051755 | 37, six factors (Reliability and Social Functioning; Malingering and Misuse of Medication; Ability to Take Responsibility; Norm-violating and Externalizing Behavior; Consequences of Diagnostic Disclosure; Etiology) | T0, T2 full; T1 only two subscales (Reliability and Social Functioning, Ability to Take Responsibility), a deviation from the validated form, flagged | **[confirmed]** for authorship, structure, 37 items. Reliability values and response format: **unverified**. Developed for general-public attitudes; its use with managers is **unverified** (a teacher sample exists, https://link.springer.com/article/10.1186/2193-1801-3-26, author list not confirmed). |
| Perspective-taking disposition | **IRI Perspective-Taking subscale**: Davis MH (1983). Measuring individual differences in empathy: Evidence for a multidimensional approach. J Pers Soc Psychol 44: 113-126. Overview: https://www.eckerd.edu/psychology/iri/ | 7 | T0, T1, T2 | **[confirmed]**. A trait measure: change over minutes is a weak manipulation check, report as exploratory. Sensitivity to short interventions: **unverified**. Alpha and norms: **unverified**. Alternative if the IRI is not licensable: Toronto Empathy Questionnaire, Spreng RN, McKinnon MC, Mar RA, Levine B (2009), J Pers Assess 91(1): 62-71, **[confirmed]** (item count not confirmed). Use one, not both. |
| Stigma-related behavior (reported and intended) | **RIBS**, Reported and Intended Behaviour Scale: Evans-Lacko S, Rose D, Little K, Flach C, Rhydderch D, Henderson C, Thornicroft G (2011). Development and psychometric properties of the Reported and Intended Behaviour Scale (RIBS): a stigma-related behaviour measure. Epidemiol Psychiatr Sci. https://www.researchgate.net/publication/51647651_Development_and_psychometric_properties_of_the_Reported_and_Intended_Behaviour_Scale_RIBS_A_stigma-related_behaviour_measure | 8 (4 reported, 4 intended), based on the Star Social Distance Scale | T0, T1 (intended subscale only), T2 | **[confirmed]** (journal, year, item structure; volume and pages **unverified**). Validated for mental health problems in the general public, not ADHD or managers. Target wording changed to "someone with ADHD" is an **unvalidated adaptation**. Reported subscale covers general social contact, not accommodation, so it is secondary to the AAI. |
| Workplace stigma toward mental illness (generalization check) | **OMS-WA**, Opening Minds Scale for Workplace Attitudes: Lindsay BL, Dobson KS, Krupa T, Knaak S, Szeto ACH (2024). A psychometric evaluation of the OMS-WA. Discover Psychology 4: 134. https://link.springer.com/article/10.1007/s44202-024-00249-9 | 22-23, **unverified** (one secondary description says 22 items; audit search snippets say a 27-item pool was cut to 23 items over five factors in Study 1; an 11-item short form also exists. Confirm in the full text before freezing the battery) | T0, T2 | **[partial]**: citation and authorship confirmed; item count and factor structure not confirmed (search-summary level, 2026-10-09). Validated in N = 207, 107, 5385, 1207 across studies (only N = 207 seen in a search snippet; others unverified). Targets mental illness, not ADHD; ADHD may not be conceptualized as mental illness by respondents or advisors. Use as a general-attitude generalization check only. Wording left unchanged. |
| Closeness to the group | **IOS** (Inclusion of Other in the Self): Aron A, Aron EN, Smollan D (1992). J Pers Soc Psychol 63: 596-612. | 1 (pictorial) | T0, T1, T2 | **[confirmed]**. Target "people with ADHD" is a group use, not a validated one for this target: **unverified**. |
| Behavioral intention | Study-specific 5 items: "I intend to adopt [practice] in the next 30 days", 7-point, one per top-5 AAI practice, matching the AAI so intention and behavior share target, action, context and time. | 5 | T0, T1, T2 | **Unvalidated.** Matching principle follows the theory of planned behavior (Ajzen 1991, **[unverified]**, not web-checked). Expect intention gains to overstate behavior gains: Webb & Sheeran (2006), Psychol Bull 132(2): 249-268, **[confirmed]**, found a medium-to-large intention change (d = 0.66) producing a small-to-medium behavior change (d = 0.36). |
| Manager self-efficacy | Study-specific 3 items ("I know what to do when a team member struggles with attention-related demands") | 3 | T0, T1, T2 | **Unvalidated.** Doubles as the "helplessness" monitor (see 2.4). |
| Knowledge and misconception check | Study-specific 8 true/false items from the evidence base (for example "findings describe groups, not any individual"; "ADHD means a person cannot focus") | 8 | T0, T1, T2 | **Unvalidated.** Checks the sim did not teach a stereotype, and that the debrief caveats landed. |

### 2.4 Harm and bias monitoring (reported in every readout)
- Nario-Redmond 2017 found pity, discomfort and helplessness after simulations. Monitor these directly: **AQ-27 Pity and Fear subscales** (Corrigan P, Markowitz FE, Watson A, Rowan D, Kubiak MA (2003). An attribution model of public discrimination towards persons with mental illness. J Health Soc Behav 44(2): 162-179) **[confirmed]** (27 items, 9 subscales, so about 3 items per subscale, inferred not read). The validated vignette concerns schizophrenia; an ADHD vignette is an **unvalidated adaptation**. Add a single "distress now" item (0-10) and the self-efficacy items above at T1.
- QPS Reliability and Social Functioning subscale is the stereotype-hardening indicator: an increase in the T-arm relative to C is a **harm signal**, triggers a pre-registered stop-and-review rule (threshold set with advisors, **unset** here).
- **Social desirability**: Marlowe-Crowne short form C, 13 items, Reynolds WM (1982), J Clin Psychol 38(1): 119-125 **[confirmed]**. Collected at T0 as a covariate and for sensitivity analysis of self-reported outcomes.
- Attention checks (2 items per wave), duplicate and bot screening, completion time floor.

## 3. Instrument by wave (burden target: T0 ~12 min, T1 ~8 min beyond the session, T2 ~12 min)

| Instrument | T0 | T1 | T2 | T3 |
|---|---|---|---|---|
| AAI-self (T0 asks the prior 30 days) | x | | x | x |
| AAI-verified (logs + direct reports) | x (if available) | | x | x |
| Practice-selection task, toolkit take-up | | x | | |
| Intention (5), self-efficacy (3), knowledge (8) | x | x | x | |
| QPS (37) | x | 2 subscales | x | |
| IRI-PT (7), IOS (1) | x | x | x | |
| RIBS (8) | x | intended 4 | x | |
| OMS-WA (22-23, item count unverified; 11 if the short form is chosen) | x | | x | |
| AQ-27 Pity+Fear, distress (1) | x | x | x | |
| Marlowe-Crowne C (13) | x | | | |

## 4. Analysis plan (pre-specify; abbreviated)
- **Primary**: intention-to-treat; linear mixed model of AAI-verified at T2 on arm, baseline AAI, strata, random intercept for team. One primary test, two-sided alpha 0.05. Report estimate and 95% CI whether or not significant.
- **Smallest effect of interest**: to be set with buyers and advisors before data collection (placeholder: +1 practice out of 10, a design choice, **unverified** as meaningful). If the CI excludes the effect of interest, say "no meaningful effect" using an equivalence test; if the CI is wide, say "inconclusive". A pilot of this size will often be inconclusive; that is reported as such.
- **Secondary**: IRI-PT, QPS, RIBS, OMS-WA, IOS, intention (family controlled with Holm). Mediation (does attitude or intention change precede AAI change) is exploratory.
- **Missing data**: report attrition by arm at T1 and T2, multiple imputation, and a worst-case sensitivity analysis. Differential attrition is reported as a threat.
- **Moderators (exploratory)**: baseline QPS, prior contact with someone with ADHD, prior training, role level. Subgroup cells with n<10 are not shown.
- **Dose**: sim telemetry (dose) vs outcome is descriptive only (not randomized).

## 5. Sample size (calculation by Tukey; assumptions are design choices)
Normal approximation, two-sided alpha 0.05, 80% power, two arms, baseline covariate r = 0.5 (variance factor 0.75), team cluster size 5 with ICC 0.05 (design effect 1.2, ICC **unverified**, estimate it in the pilot), 30% attrition by T2 (assumed, **unverified**).

| Target standardized effect on AAI | Completers per arm | Recruit per arm | Total recruited |
|---|---|---|---|
| d = 0.36 (benchmark: behavior d in Webb & Sheeran 2006; likely optimistic for this product) | 110 | 156 | 312 |
| d = 0.25 | 227 | 323 | 646 |
| d = 0.15 (plausible if effects behave like weak cognitive-empathy effects, d = 0.08 in mechanism-spec section 4) | 628 | 898 | 1,796 |

Implication: a first pilot of about 80-150 managers estimates feasibility, attrition, ICC and a wide-interval effect; it cannot confirm a small effect. Do not market a pilot null or pilot positive as proof. Real prejudice-reduction effects on behavior are often smaller and less durable than attitude effects, and light-touch interventions dominate the literature (Paluck, Porat, Clark, Green 2021, Annu Rev Psychol 72: 533-560, **[confirmed]** snippet-level; Hsieh, Faulkner, Wickes 2022, Br J Soc Psychol 61: 689-710, **[confirmed]** snippet-level, found contact-based interventions more effective than awareness-based ones and benefits fading in adult samples).

## 6. Buyer ROI dashboard specification (aggregates only)

Rules: aggregate data only; **suppress any cell with n<10** (counts, means, differences, and any complement that would reveal it, so apply complementary suppression); no individual or team named; no diagnosis or disability field exists in the data model; nulls and CIs shown with the same prominence as positive results; every behavioral metric tagged "verified" or "self-reported".

| Panel | Content | Source |
|---|---|---|
| 1 Reach | Enrolled, completed session, T2 retention, by arm (suppressed if n<10) | platform |
| 2 Primary behavior | AAI-verified at day 30: T vs C difference, 95% CI, n per arm; "no detectable difference" or "inconclusive" label shown as appropriate | AAI-verified |
| 3 Practice breakdown | Share enacting each of 10 practices, verified vs self-reported side by side | AAI |
| 4 Secondary | QPS, RIBS, IRI-PT, OMS-WA, IOS, intention: T0 to T1 to T2 change with CI, labeled "attitudes, not behavior" | instruments |
| 5 Harm monitor | AQ-27 pity/fear, distress, self-efficacy, QPS Reliability subscale: T vs C change, with stop-rule status | monitoring set |
| 6 Data quality | Attrition, attention-check failures, AAI self vs direct-report agreement, social-desirability sensitivity result | QC |
| 7 Cost and ROI | Cost per manager from buyer-supplied license cost; **cost per additional verified practice enacted** (cost / (effect x managers)). No monetary benefit figure (retention, productivity) unless the buyer supplies the parameter and labels it a buyer assumption; Tukey has no sourced conversion from AAI to dollars (**unverified**). | buyer inputs |
| 8 Method and limits | Design, validated vs unvalidated instruments, adaptation notes, "group-level findings only, not individuals" | static |

Pilot report template: pre-registered primary result first (including a null), then secondary, harm monitor, deviations, limitations (unvalidated AAI, short follow-up, self-selection of managers, buyer-site generalizability).

## 7. Open items and flags
1. AAI item list, ICC, attrition and the smallest effect of interest are assumptions to replace with pilot data.
2. QPS, RIBS, AQ-27, IOS ADHD adaptations: unvalidated; budget a small psychometric sub-study (CFA, test-retest) or label results accordingly. Licensing and permission status of each scale: **unverified**, check before use.
3. Response format, reliabilities and subscale item counts for QPS: not read from full text.
4. Mechanism-spec ranges are design values; this instrument set does not measure whether the sim is "accurate", only what managers do afterward (calibration is by advisor ratings, spec section 4).
5. Ethics approval, recruitment, employer data-sharing agreements, direct-report surveys and any message to a real person are founder-gated.
6. ADHD-specific manager accommodation behavior scale with published validation: none found in the searches run this node (a general Reasonable Accommodation Scale by Scroggins 2007, Employee Responsibilities and Rights Journal 19: 279-291, and the Job Accommodation Scale, Shaw et al. 2014, J Occup Rehabil 24: 755-765, both **[confirmed]**, target general or temporary-injury contexts and were not adopted).
