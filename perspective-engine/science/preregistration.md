# Perspective Engine: Pilot Pre-registration Draft for OSF (V03, 2026-10-06, agent Curie)

## Summary (read this only if short on tokens)
Paste-ready draft of the OSF Preregistration for the first pilot: a team-clustered randomized ESTIMATION study of 80-150 managers (target 120), simulation + debrief (T-arm) vs equal-length information module (C-arm), outcomes at T0, T1 (same session), T2 (day 30, window 25-35), optional T3 (day 56). Primary outcome is behavior: the Accommodation Action Index, verified version (AAI-verified, unvalidated, study-specific). Hypotheses are directional expectations to be estimated with 95% CIs, not confirmed; harm monitoring (stigma, pity, distress) is pre-registered. The pilot cannot confirm a small effect: expected 95% CI half-width is about 0.36-0.50 SD. The confirmatory sample is stated separately (156 per arm recruited for d = 0.36; 323 for d = 0.25; 898 for d = 0.15) and is to be registered in its own, later registration. Founder gates: OSF account, ethics, recruitment, items in the checklist below.

## 0. Not for pasting: checks, gates, checklist

### 0.1 Power check (python3 stdlib, normal approximation)
Inputs from data/instruments.md section 5: two-sided alpha 0.05, power 80%, covariate variance factor 0.75, design effect 1.2, attrition 30%. Result: the V02 table is reproduced (completers per arm 110 / 227 / 628; recruit per arm 156 / 323 / 898; total 312 / 646 / 1,796). V02 applies the 30% attrition to the unrounded completer count; rounding completers first gives 158 / 325 / 898, a difference of at most 2 per arm, immaterial. NEW in this node (derived by Curie from the same V02 assumptions, same formula, SE of standardized difference = sqrt(2/n x 0.75 x 1.2), n = completers per arm): expected 95% CI half-width is 0.50 SD at 80 recruited (28 completers per arm), 0.41 SD at 120 (42), 0.36 SD at 150 (52.5). With few clusters and t-based inference the real interval will be wider. Assumptions (ICC 0.05, attrition 30%, cluster size 5, r = 0.5) are design choices, unverified, to be replaced with pilot estimates.

### 0.2 Founder checklist before posting to OSF (gate: needs the founder's OSF account)
1. Authors, affiliations, contact; conflict-of-interest names (the team builds the product under test).
2. Ethics approval reference and date (unverified; none exists in the inputs). Recruitment channel and window dates (fills the Stopping rule field).
3. Smallest effect of interest (SESOI): placeholder +0.10 on AAI (+1 practice of 10) is a design choice, unverified as meaningful. Confirm with buyers and advisors BEFORE registering. If it cannot be set, delete the SESOI sentences in Inference criteria and keep estimation-only wording.
4. Final AAI wording of the 10 items (lived-experience advisor review and cognitive interviews). Candidate list is in Measured variables.
5. Freeze the simulation build: fill "[SIM VERSION / COMMIT HASH]" in Manipulated variables. Any later change is logged as a deviation.
6. Third arm: this draft has two arms (T, C). V02 lists a waitlist arm as optional; omitted here because three arms would leave about 19-35 completers each. Adding it changes Design plan, Sample size and Analysis.
7. Harm stop-and-review: the threshold on the QPS Reliability and Social Functioning subscale (T minus C) and the interim checkpoint are unset in V02; set with advisors, fill the two bracketed slots in Stopping rule.
8. Scale licensing and permission (QPS, IRI, RIBS, IOS, AQ-27, OMS-WA, Marlowe-Crowne): unverified; check before use.
9. Optional: go/no-go thresholds for feasibility indicators (not set here).
10. Ethics-protocol items (distress response, consent, data-sharing with employers, direct-report surveys) are not in this document.

### 0.3 Format notes
- Field headings below follow the OSF Preregistration template (Study Information, Design Plan, Sampling Plan, Variables, Analysis Plan, Other). Verified at snippet level against https://cran.r-project.org/web/packages/preregr/vignettes/form_OSFprereg_v1.html and https://www.cos.io/blog/choosing-preregistration-template-guide-for-researchers ; match wording to the live OSF form when pasting, field order may differ. The "Existing data" options named in the OSF form include registration prior to creation of data; choose that one.
- Text between the PASTE markers is plain text with numbered lists and no tables, so it survives a paste into OSF text boxes.
- Status tags: [unverified] = from memory or not found; do not quote externally. Sources are as recorded in perspective-engine/data/instruments.md (V02, snippet-level) and perspective-engine/science/mechanism-spec.md (V01).

=== PASTE BELOW THIS LINE ===

## STUDY INFORMATION

#### Title
Perspective Engine pilot: does an interactive attention-pattern simulation with debrief change what managers do in the 30 days after, compared with an equal-length information module? A team-clustered randomized estimation study.

#### Description
This is a pilot ESTIMATION study, not a confirmatory trial. Its aims are to (1) estimate, with a 95% confidence interval, the difference in manager behavior 30 days after a simulation-plus-debrief session versus an equal-length information-only session; (2) estimate secondary attitude and intention effects and monitor possible harms; (3) estimate feasibility parameters (attrition, intra-team correlation, verification coverage, SD of the primary outcome) needed to plan a confirmatory study. The confirmatory sample size is stated separately in the Sample size rationale and will be registered separately.

Intervention (T-arm): a browser-based interactive illustration of four documented attention/timing patterns that some people with ADHD report or show at group level: (M1) default-mode interference, intrusions of self-generated off-task content (Sonuga-Barke and Castellanos 2007, https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3805479/); (M2) reaction-time variability, a right-skewed delay distribution with the mean held constant (https://pubmed.ncbi.nlm.nih.gov/24204553); (M3) delay aversion in forced waits (https://pubmed.ncbi.nlm.nih.gov/35032471); (M4) salience capture by irrelevant events, moderated by task difficulty (https://pmc.ncbi.nlm.nih.gov/articles/PMC4670482/). A fifth mechanism, hyperfocus (self-report evidence only, https://link.springer.com/article/10.1007/s12402-018-0272-y), is switched OFF. All numeric parameters of the simulation are design values chosen for perceptibility and comfort, not empirical ADHD estimates. The simulation is not diagnostic, does not describe any individual, and makes no claim to let users "feel what ADHD is like". It is followed by a mandatory debrief and a commitment-planning step.

Rationale for the control: research on disability simulation exercises found increased pity, discomfort and helplessness and no improvement in interaction attitudes (Nario-Redmond et al. 2017, https://pubmed.ncbi.nlm.nih.gov/28287757/). VR/media perspective-taking effects were larger for emotional empathy (d = 0.33) than cognitive empathy (d = 0.08) (https://tmb.apaopen.org/pub/vr-improves-emotional-empathy-only). The study therefore tests whether the simulation adds anything beyond information, and measures behavior, not only empathy.

Group-level findings do not describe individuals. The study does not collect diagnoses or disability status from any participant.

#### Hypotheses
Because this is an estimation pilot, hypotheses are stated as directional expectations that will be estimated and interpreted from confidence intervals, not as confirmatory tests.

1. H1 (primary estimand). At day 30 (T2), the intention-to-treat mean AAI-verified score (share of applicable management practices enacted and verified, 0 to 1) is higher in the T-arm than in the C-arm. Competing expectation H1-null: the simulation adds nothing beyond the equal-length information module (the Nario-Redmond 2017 pattern). The study estimates the T minus C difference and its 95% CI and reports it whatever its direction.
2. H2 (harm). Relative to the C-arm, the T-arm does NOT show a larger increase in stereotype-hardening, pity or distress. Indicators: QPS Reliability and Social Functioning subscale (stereotype-hardening indicator), AQ-27 Pity and Fear subscales, single "distress now" item (0-10) and manager self-efficacy (helplessness monitor). An increase in the T-arm relative to C on the QPS Reliability and Social Functioning subscale is a pre-registered harm signal (see Stopping rule).
3. H3 (secondary attitudes and intentions, T2 and T1). Relative to C, the T-arm shows more favorable scores on IRI Perspective-Taking, QPS (lower stigma), RIBS, IOS, OMS-WA (lower stigma) and behavioral intention. Effect sizes are expected to be larger for attitudes and intention than for behavior; see H4.
4. H4 (intention-behavior gap, exploratory). The standardized T minus C difference in behavioral intention at T1 is larger than the standardized T minus C difference in AAI-verified at T2, as in Webb and Sheeran (2006, Psychol Bull 132(2): 249-268; a medium-to-large intention change, d = 0.66, produced a small-to-medium behavior change, d = 0.36; DOI not verified here).
5. H5 (no stereotype taught). Knowledge and misconception check scores at T1 and T2 are not lower in the T-arm than in the C-arm.

## DESIGN PLAN

#### Study type
Experiment: randomized, team-clustered, two-arm parallel-group pilot (estimation) with an active control, in managers who decide on workplace practices.

#### Blinding
Participants cannot be blinded to arm. The analyst is blinded to arm labels (coded A/B) until the analysis script is frozen and time-stamped on OSF. Direct reports who corroborate their manager's practices are blinded to their manager's arm and never see the manager's answers. Extraction of log-based verification uses a fixed script applied to both arms.

#### Study design
Two arms, equal total session time:
- T-arm: simulation (mechanisms M1-M4 on, M5 off; intensity default 0.5, ceiling 0.8) + mandatory debrief + commitment-planning step.
- C-arm (active control): equal-time information module on ADHD at work (group-level facts, a menu of accommodations), the same commitment-planning step, no simulation. Planning is held constant so the contrast isolates the simulation.
Waves: T0 baseline (within 7 days before the session); T1 immediately after the session; T2 day 30 (window 25-35), the primary time point; T3 day 56, optional durability wave (descriptive only). No waitlist arm in this pilot.

#### Randomization
Cluster randomization by team (a team is a set of managers likely to talk to each other, planning size 5 managers per team, an assumption), stratified by organization and seniority (senior vs non-senior, cut-off set in the codebook before randomization), 1:1 allocation, computer-generated, with allocation concealed until enrolment of the whole team. Teams, not individuals, are the units because managers who talk would contaminate each other. With about 16-30 teams in total, stratification may leave small strata; restricted (blocked) allocation within strata is used and the realized balance on baseline AAI is reported.

## SAMPLING PLAN

#### Existing data
Registration prior to creation of data.

#### Explanation of existing data
No study data exist. Lived-experience advisor ratings of the simulation and cognitive interviews on the AAI items are collected before registration and used only to finalize the materials; they are not outcome data and are not part of the analysis.

#### Data collection procedures
Managers and team leads who decide on workplace practices, recruited via [RECRUITMENT CHANNEL, FILL AT REGISTRATION] after ethics approval [REFERENCE]. Informed consent precedes T0. Direct reports of each enrolled manager are invited by an anonymous survey to corroborate AAI items at T2 (and at T0 where available); individual direct-report answers are never shown to the manager or employer. Where an organization agrees, aggregate log data (for example agenda timing, presence of a follow-up message) are shared. No gaze, webcam or biometric data are stored. Simulation telemetry (duration, intensity set, adaptation toggles used, debrief completion, template downloads) is recorded as dose only. Each wave includes 2 attention-check items; duplicate and bot screening and a completion-time floor apply. Target burden: T0 about 12 min, T1 about 8 min beyond the session, T2 about 12 min.

#### Sample size
Pilot (this registration): target 120 managers randomized (about 24 teams of about 5), minimum 80 for the planned analysis, hard cap 150. With 30% attrition assumed by T2, expected completers are about 56 (N = 80), 84 (N = 120) and 105 (N = 150).

Confirmatory study (NOT powered by this pilot; to be registered separately): see Sample size rationale for the planning numbers.

#### Sample size rationale
The pilot is sized for estimation, not for a significance test. Under the planning assumptions (covariate correlation r = 0.5, variance factor 0.75; team design effect 1.2 from cluster size 5 and ICC 0.05; 30% attrition; two-sided alpha 0.05), the expected 95% CI half-width for the standardized T minus C difference on AAI-verified is about 0.50 SD at N = 80, 0.41 SD at N = 120 and 0.36 SD at N = 150 (normal approximation; the realized interval will be wider with few clusters). The pilot therefore cannot distinguish a small effect (d = 0.15) from a moderate one (d = 0.36), and a pilot null or positive result will not be presented as proof. Its purpose is to estimate attrition, ICC, the SD of AAI-verified, verification coverage and the effect with a wide interval. ICC (0.05), attrition (30%) and cluster size (5) are assumptions, unverified, to be replaced by pilot estimates.

Confirmatory sample planning values (normal approximation, same assumptions, 80% power, two-sided alpha 0.05, two arms; d is standardized by the unadjusted pooled within-arm SD):
1. d = 0.36 (benchmark: behavior change d = 0.36 in Webb and Sheeran 2006, likely optimistic for this product): 110 completers per arm, 156 recruited per arm, 312 total.
2. d = 0.25: 227 completers per arm, 323 recruited per arm, 646 total.
3. d = 0.15 (plausible if effects behave like the weak cognitive-empathy effect, d = 0.08, https://tmb.apaopen.org/pub/vr-improves-emotional-empathy-only): 628 completers per arm, 898 recruited per arm, 1,796 total.
The confirmatory target will be set from the pre-specified smallest effect of interest and the pilot's ICC, attrition and SD, not from the pilot point estimate alone. The 80-150 pilot sample is not included in the confirmatory sample.

#### Stopping rule
Recruitment stops at the earliest of: (a) 150 managers randomized; (b) the end of the recruitment window [DATE, FILL AT REGISTRATION]. If fewer than 80 are randomized at (b), the study is reported as a feasibility description with estimates and CIs but no inference claims. Harm stop-and-review: when T1 data are available for the first [CHECKPOINT N, SET WITH ADVISORS] managers, and again at the end of recruitment, the unblinded safety reviewer (not the analyst) examines the T minus C change in QPS Reliability and Social Functioning, AQ-27 Pity and Fear, distress and self-efficacy. If the T minus C increase in QPS Reliability and Social Functioning exceeds [THRESHOLD, SET WITH ADVISORS BEFORE REGISTRATION], enrolment into the T-arm pauses for review of the simulation and debrief. Any pause, change or stop is reported.

## VARIABLES

#### Manipulated variables
Arm (T vs C), randomized by team. T-arm simulation specification (frozen at [SIM VERSION / COMMIT HASH]): mechanisms M1 default-mode intrusions, M2 reaction-time variability, M3 delay aversion, M4 salience capture on; M5 hyperfocus off; each mechanism has an intensity I in [0,1], default 0.5, session ceiling 0.8, adjustable independently by the participant; concrete parameter = lo + I x (hi - lo) with ranges as in the frozen mechanism specification (design values, not empirical estimates). No ADHD "profile" presets. Adaptation toggles (for example written follow-up, fewer notifications) are available as illustrations, not as proven interventions. Mandatory debrief; lived-experience content authored by neurodivergent advisors. The M1 to M2 coupling (default 0.4) is the only cross-mechanism effect. Session length is matched across arms [TOTAL MINUTES, FILL AT FREEZE; the design intention is a short simulation of about 5-15 min, unverified].

#### Measured variables
PRIMARY (T2): Accommodation Action Index, verified (AAI-verified). Study-specific, UNVALIDATED. The proportion of applicable practices enacted in the prior 30 days from a fixed 10-item menu of "universal design" practices that apply to all team members (no employee is identified or asked to disclose a diagnosis). Candidate items, final wording frozen at registration: (1) agenda sent 24 h before meetings; (2) written follow-up after meetings; (3) priorities and deadlines stated in writing; (4) large tasks split with interim checkpoints; (5) notification-light or focus-time blocks offered; (6) asking team members what helps them work, without requiring disclosure; (7) quiet-space or headphone/remote-work flexibility offered; (8) a written response to any accommodation request within a stated time; (9) feedback structured and specific rather than vague; (10) check-ins on workload at a regular cadence. Categories drawn from the Job Accommodation Network ADHD resource (https://askjan.org/disabilities/Attention-Deficit-Hyperactivity-Disorder-AD-HD.cfm). The efficacy of each practice for ADHD is unverified, so the AAI counts adoption, not benefit. An item counts as enacted-and-verified only if backed by (a) a system or calendar log shared in aggregate, or (b) a majority of at least 3 direct reports of that manager confirming it in an anonymous survey. "Not applicable" is allowed with a free-text reason (for example no accommodation request received for item 8) and is excluded from the denominator.

SECONDARY OUTCOMES:
1. AAI-self: manager self-report of the same 10 items (T0 asks the prior 30 days; T2; T3), always reported beside AAI-verified.
2. IRI Perspective-Taking subscale (7 items; Davis 1983, J Pers Soc Psychol 44: 113-126; T0, T1, T2). A trait measure; short-term change is a weak manipulation check, exploratory at T1. Alternative if not licensable: Toronto Empathy Questionnaire (Spreng et al. 2009, J Pers Assess 91(1): 62-71); use one, not both.
3. QPS, Questionnaire on Stigmatizing Attitudes toward Adults with ADHD (37 items, 6 factors; Fuermaier et al. 2012, PLoS ONE 7(12): e51755, https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0051755 ; T0 and T2 full; T1 only the Reliability and Social Functioning and Ability to Take Responsibility subscales, a deviation from the validated form). Response format and reliabilities not read from full text, unverified. Developed for general-public attitudes; use with managers unverified.
4. RIBS, Reported and Intended Behaviour Scale (8 items, 4 reported and 4 intended; Evans-Lacko et al. 2011, Epidemiol Psychiatr Sci; T0, T1 intended subscale only, T2). Validated for mental health problems in the general public; wording changed to "someone with ADHD" is an unvalidated adaptation.
5. OMS-WA, Opening Minds Scale for Workplace Attitudes (22 items; Lindsay et al. 2024, Discover Psychology 4: 134, https://link.springer.com/article/10.1007/s44202-024-00249-9 ; T0, T2). Targets mental illness; wording unchanged; a generalization check.
6. IOS, Inclusion of Other in the Self (1 pictorial item; Aron, Aron and Smollan 1992, J Pers Soc Psychol 63: 596-612; T0, T1, T2). Use with "people with ADHD" as the target is not validated.
7. Behavioral intention: 5 study-specific items, "I intend to adopt [practice] in the next 30 days", 7-point, one per top-5 AAI practice (T0, T1, T2). Unvalidated.
Further measures (exploratory or monitoring):
8. Manager self-efficacy, 3 study-specific items (T0, T1, T2); also the helplessness monitor. Unvalidated.
9. Knowledge and misconception check, 8 study-specific true/false items (T0, T1, T2). Unvalidated.
10. Practice-selection task at T1 (5 slots, choose practices from the AAI menu with time-cost trade-offs; number chosen and share matched to the menu) and toolkit take-up (in-session template download click log). Decision proxies, not enacted behavior. Study-specific, unvalidated.
11. Harm and bias monitoring: AQ-27 Pity and Fear subscales (Corrigan et al. 2003, J Health Soc Behav 44(2): 162-179; the validated vignette concerns schizophrenia, an ADHD vignette is an unvalidated adaptation; T0, T1, T2); "distress now" item 0-10 (T1; also T0 and T2); Marlowe-Crowne short form C, 13 items (Reynolds 1982, J Clin Psychol 38(1): 119-125; T0 only, covariate and sensitivity analysis for self-reports); attention checks.
12. Dose (descriptive only): session duration, intensity set, adaptation toggles used, debrief completion.
13. Baseline covariates: AAI-self T0, QPS T0, prior contact with someone with ADHD, prior training, role level, organization, team.
Optional T3 (day 56): AAI-verified, AAI-self, descriptive.

#### Indices
1. AAI-verified = (number of applicable items enacted and verified) / (number of applicable items), 0 to 1. AAI-self analogous. Reported also as a count out of 10 (AAI x 10).
2. Scale scores (IRI-PT, QPS total and subscales, RIBS total and subscales, OMS-WA, intention, self-efficacy) = mean of items per the published scoring, with reverse-scoring as in the instrument manual, computed if at least 80% of items are answered (design choice). Knowledge score = number correct of 8. Practice-selection: number chosen and share matched. Reliabilities (Cronbach alpha) are computed in this sample and reported, not assumed.
3. Verification-eligible manager: has a shared log source, or at least 3 responding direct reports. AAI-verified is undefined (treated as missing) for a manager who is not verification-eligible; see Missing data.

## ANALYSIS PLAN

#### Statistical models
Intention-to-treat: all randomized managers are analyzed in the arm allocated, whatever the session completion.
1. PRIMARY (one test): linear mixed model, AAI-verified at T2 ~ arm + AAI-self at T0 + stratum (organization, seniority) + random intercept for team. Estimand: T minus C mean difference in AAI-verified at T2, reported (a) in AAI units, (b) as practices out of 10, (c) standardized by the unadjusted pooled within-arm SD. Small-sample degrees of freedom correction (Kenward-Roger) because of few clusters (design choice). Estimate and 95% CI reported whether or not significant.
2. Robustness of the primary: (a) mixed-effects binomial model on item-level enacted-and-verified counts out of applicable items (logit link) with the same terms; (b) the same linear model with AAI-verified at T0 as covariate where available; (c) with N/A items scored as not enacted for all items except item 8.
3. SECONDARY (T2): the same linear mixed model for each of IRI-PT, QPS total, RIBS total, OMS-WA, IOS, behavioral intention, with the matching T0 score as covariate. This secondary family (six outcomes) is controlled with Holm adjustment; unadjusted 95% CIs are reported beside Holm-adjusted p-values. AAI-self at T2 is reported with the same model and equal prominence as the primary.
4. HARM MONITORING: the same model for the QPS Reliability and Social Functioning subscale, AQ-27 Pity and Fear, distress, self-efficacy (T1 and T2), no multiplicity adjustment (monitoring, not testing), CIs reported in every readout.
5. T1 outcomes (IRI-PT, IOS, QPS two subscales, RIBS intended, intention, self-efficacy, knowledge): the same model with T0 covariate, descriptive, no multiplicity claim. H4: compare the standardized T minus C difference in intention at T1 with that of AAI-verified at T2, with a cluster bootstrap CI for the difference in standardized effects.
6. ICC of AAI-verified (by team), SD of AAI-verified, attrition by arm and wave, verification coverage by arm, and inter-source agreement (AAI-self vs direct-report, item level kappa and manager-level correlation) are reported as feasibility and psychometric outputs, with CIs. Test-retest of the AAI between T2 and T3 where T3 is collected (real change over 26 days can lower it).

#### Transformations
None planned for AAI-verified (a bounded proportion analyzed on its natural scale, with the binomial model as robustness). Scale scores computed as in Indices. If model residuals are clearly non-normal or the team variance estimate is zero or at the boundary, the binomial model and a cluster-robust (CR2) estimator are reported in addition and the discrepancy is stated; the primary stays the pre-specified linear mixed model.

#### Inference criteria
The study is an estimation pilot: no efficacy claim is made from p < 0.05. The primary uses two-sided alpha 0.05 and a 95% CI. Interpretation uses the CI relative to the smallest effect of interest (SESOI), placeholder +0.10 on AAI-verified (+1 practice of 10; a design choice, unverified as meaningful, to be confirmed with buyers and advisors before registration; the SD of AAI is unknown so the SESOI in standardized units is estimated in the pilot):
1. "No meaningful effect": the 90% CI of the T minus C difference lies wholly within -SESOI to +SESOI (two one-sided tests at alpha 0.05).
2. "Meaningful positive effect (pilot-level evidence, needs confirmatory replication)": the 95% CI lies wholly above +SESOI.
3. Otherwise "inconclusive", reported with the estimate and CI.
The expected CI width (about 0.36 to 0.50 SD) means "inconclusive" is the likely outcome and will be reported as such. Nulls and CIs are reported with the same prominence as positive findings. For secondary outcomes, Holm-adjusted p-values are shown beside CIs and none is used to claim confirmation. No claim about individuals, diagnosis, severity or treatment is made from any result.

#### Data exclusion
Randomized managers are never excluded from the ITT analysis for non-completion. Response-level rules, applied blind to arm: (a) a wave's self-report responses are set to missing if both attention-check items in that wave are failed; (b) responses completed faster than one third of the sample median completion time for that wave are set to missing (design choice); (c) for duplicate enrolment keep the first record, discard later ones; bot-flagged records are discarded. A direct-report response is excluded if it duplicates another or fails the attention check. AAI-verified items are never counted from a single direct report; the 3-respondent rule applies. Teams or organizations that withdraw are retained up to withdrawal and counted as attrition.

#### Missing data
Report attrition by arm at T1 and T2 and verification-eligibility by arm. Primary analysis uses multiple imputation (at least 20 imputations, design choice) under missing-at-random given arm, team, stratum, AAI-self at T0, AAI-self at T2, T1 outcomes, QPS at T0 and Marlowe-Crowne. AAI-verified is treated as missing (not zero) for managers who are not verification-eligible; because eligibility could differ by arm, it is reported by arm and checked in sensitivity analyses. Sensitivity analyses: (a) complete case; (b) worst-case (tipping-point): shift imputed T-arm AAI-verified values downward until the 95% CI includes 0 and report the shift in AAI units; (c) analysis of AAI-self, which is available for more managers, with the same model. If AAI-verified is available for fewer than 50% of T2 completers (design threshold), the result is labeled "limited verification" and AAI-self is shown with equal prominence. Differential attrition is reported as a threat to validity.

#### Exploratory analyses
All unregistered analyses are labeled exploratory. Planned exploratory: (1) moderators: baseline QPS, prior contact with someone with ADHD, prior training, role level (T x moderator interaction, estimates with CIs, subgroup cells with n < 10 not shown); (2) mediation: whether change in QPS, IRI-PT or intention at T1 precedes AAI change (not randomized, descriptive); (3) dose (intensity, toggles, duration, debrief completion) vs outcome, descriptive only, not causal; (4) item-level AAI practice breakdown, verified vs self-reported side by side; (5) social-desirability sensitivity (Marlowe-Crowne) for self-reported outcomes; (6) QPS subscale and RIBS reported vs intended subscale results; (7) practice-selection task and toolkit take-up by arm; (8) T3 durability (descriptive). Deviations from this plan are logged with dates and reported.

## OTHER

#### Other
1. Confirmatory sample (stated separately, repeated here for clarity): not powered by this pilot. Planning values: d = 0.36 needs 156 recruited per arm (312 total); d = 0.25 needs 323 per arm (646 total); d = 0.15 needs 898 per arm (1,796 total), all under the pilot assumptions (ICC 0.05, cluster size 5, attrition 30%, covariate r = 0.5), to be updated with pilot estimates and registered in a separate pre-registration before any confirmatory data are collected.
2. Instrument status: the AAI, behavioral intention, self-efficacy, knowledge and practice-selection measures are study-specific and unvalidated; the ADHD adaptations of QPS (use with managers), RIBS, AQ-27 and IOS are unvalidated. A psychometric sub-analysis (reliability, inter-source agreement, test-retest) is reported; results on unvalidated measures are labeled accordingly.
3. Limitations declared in advance: unvalidated primary outcome, short follow-up (day 30, optionally 56), self-selection of managers, generalizability to buyer sites, assumed ICC and attrition, possible baseline priming by AAI items at T0, no waitlist arm so the 30-day base rate is estimated only through the C-arm.
4. Conflict of interest: the study team develops the product under test [NAMES, FILL]. Safeguards: blinded analyst, frozen and time-stamped analysis script, reporting of all pre-registered outcomes and nulls, deviations log.
5. Reporting: a pilot report presents the pre-registered primary result first (including a null), then secondary outcomes, the harm monitor, deviations and limitations. Group-level findings only; no individual or team is identified; cells with n < 10 are suppressed in any aggregate readout shared with an employer.
6. Data and code: de-identified data and analysis code to be shared on OSF after the study subject to ethics approval and employer agreements [FOUNDER TO CONFIRM].

=== END PASTE ===

## 7. Provenance and unverified items (not for pasting)
- Sources: perspective-engine/data/instruments.md (V02, snippet-level web confirmation for most scale citations) and perspective-engine/science/mechanism-spec.md (V01, evidence URLs for M1-M5). OSF template structure confirmed at snippet level this node (URLs in 0.3).
- Unverified, do not quote externally: ICC 0.05, attrition 30%, cluster size 5, covariate r = 0.5; SESOI of +0.10; Webb and Sheeran DOI and exact figures beyond V02's record; QPS response format and reliabilities; scale licensing; ADHD adaptations of scales; efficacy of any AAI practice; session length of 5-15 min; thresholds marked "design choice" (imputations, 80% item rule, one-third completion time, 50% verification coverage).
- Decisions Curie made where V02 was ambiguous (flag to the orchestrator): (1) AAI-verified is treated as missing, not zero, for managers with no verification source; (2) the waitlist arm is omitted; (3) pilot precision (CI half-widths) was derived from V02 assumptions; (4) the SESOI interpretation categories and the tipping-point analysis are new specifics; (5) T1 and T3 outcomes are descriptive only.
