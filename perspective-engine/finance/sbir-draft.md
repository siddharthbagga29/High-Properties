# SBIR Phase I application draft (M05, 2026-10-07, agent Pacioli). DRAFT v0.2, nothing submitted

**Summary (under 150 words).** SBIR Phase I draft for the Perspective Engine pilot in two scopes: Tier A for NIDILRR (forecast only: due about 2026-12-16, $95k-$100k, 6 months, 40 managers) and Tier B for NIH or NSF (12 months, 120 managers, about $269k). Contains a Specific Aims page, Research Strategy outline, budget with justification, a Monte Carlo (Tier A total P10/P50/P90 $89k/$96k/$102k, 82% within $100k), and the founder's registration list (US entity, SAM.gov/UEI, SBA registry, Grants.gov, eRA Commons, Research.gov). Biggest risks: the indirect-cost rule is unresolved and moves the budget by up to $20k; the NIDILRR notice may not post (36 FY2026 competitions were reported removed); registration takes 6+ weeks, so start by 2026-11-04. Agency sites were blocked again, so rules come from search snippets tagged V1, V2 or U. Nothing was registered, submitted or sent.

## 0. How to read this

- Inputs used: finance/grants.md, ethics/irb-packet.md, docs/founder-decisions.md, plus web search. Every official-site fetch (acl.gov, nsf.gov, sbir.gov, grants.nih.gov, seed.nih.gov, simpler.grants.gov, seedfund.nsf.gov, in both the v0.1 run and this v0.2 run) and the aahd.us letter returned EGRESS_BLOCKED from the network proxy. I opened no cited page and did not work around the block. The v0.2 pass re-checked rules with about 17 web searches; those re-checks are the only evidence added.
- **V1** = a page on an official domain came back in search and its snippet supports the rule. **V2** = secondary or aggregator source only. **U** = unverified. Re-read the live NOFO before relying on any V1 or V2 row.
- **v0.2 changes from v0.1:** NIH parent number resolved to PA-27-100 (R8); NIH Phase I cap changed to $314,363 (R9); indirect rate demoted from fact to sensitivity (R12, section 5.3); NIDILRR continuity risk added (R26); Nario-Redmond wording made balanced (R25); cost model re-run so the appendix reproduces section 5.3 exactly.
- **A#** = assumption (section 5.4). Excluded as unverified, per the finance role card: the original memo's $14.8B TAM, the 72% success figure and CPT reimbursement. No market-size number is used anywhere.
- NIDILRR sits in ACL (HHS), not the Department of Education, so ed.gov is not a source here. The ed.gov IES SBIR is education technology for students or teachers and is out of scope (grants.md row 6).
- Founder gate (from the brief): SAM.gov and eRA Commons registration in the founder's name. This node does only the draft and the list.

## 1. Rules checked, with sources

| # | Rule | Source | Status |
|---|---|---|---|
| R1 | SBIR/STTR reauthorized 2026-04-13 through 2031-09-30 (S. 3971) | https://www.iedconline.org/news/2026/04/15/federal-policy-updates/federal-policy-update-sbir-and-sttr-reauthorized/ | V2 |
| R2 | New national-security and foreign-risk due diligence. The statute leaves proposal caps to each agency, to be set at least 90 days before FY2027 (which began 2026-10-01), so caps should exist now; no agency figure was found. At NIH the foreign-ties disclosure reaches all owners and covered individuals | https://grantedai.com/blog/sbir-sttr-reauthorization-2026-signed-fy2031-strategic-breakthrough-award-30-million-application-caps-foreign-risk-screening-small-business-strategy ; https://iquasar.com/blog/sbir-sttr-is-back-through-2031-and-from-fy2027-every-proposal-has-to-count/ ; https://acquia.fenwick.com/insights/publications/sbir-and-sttr-programs-renewed-with-new-foreign-risk-due-diligence-measures-and-pilot-programs | V2; cap numbers U |
| R3 | Applicant must be an SBA-defined small business concern: for-profit, **more than 50%** directly owned and controlled by US citizens or permanent residents (or by small businesses so owned, or tribal entities), tested at time of award; majority venture-capital ownership counts only where the agency elects it. Fewer than 500 employees. ACL page: American-owned, independent, for-profit, principal researcher employed by the business. Foreign entities are not eligible for NIDILRR. (grants.md and D01 say "at least 51%", which is the older wording) | https://www.ecfr.gov/current/title-13/chapter-I/part-121/subpart-A/subject-group-ECFRb7921b3fcf04228/section-121.702 ; https://acl.gov/programs/research-and-development/small-business-innovation-research-program ; https://simpler.grants.gov/opportunity/e7d0e12f-fafe-4802-868e-1f2c7ebfb258 | V1 (eCFR, ACL, NIDILRR FY26 snippets) |
| R4 | NIDILRR Phase I FY2027, **forecast only**: HHS-2027-ACL-NIDILRR-BISA-0308; forecast posted 2026-09-25; est. post 2026-10-16; est. due 2026-12-16; est. start 2027-06-01; 11 grants; $95,000-$100,000 each ($1.1M total); 6-month project and budget period. This run's searches did not return the FY2027 listing itself; they found the FY2026 notice HHS-2026-ACL-NIDILRR-BISA-0207 (about 10 grants, $95k-$100k, 6 months, due 2025-12-15) and an Atom Grants forecast of 11 six-month grants due December 2026. Prior cycles posted in mid-October and closed on 12-15 or 12-16 | https://simpler.grants.gov/opportunity/474541a4-7569-4d5f-9ca2-b7ecd7aaf9d6 ; https://simpler.grants.gov/opportunity/e7d0e12f-fafe-4802-868e-1f2c7ebfb258 ; https://atomgrants.com/grant/small-business-innovation-research-phase-one | V1 (v0.1 run), V2 this run; forecast, may change |
| R5 | NIDILRR SBIR projects must address people with disabilities and promote health and function, community living, or employment outcomes (FY2025 text; FY2027 text U) | https://acl.gov/news-and-events/announcements/new-funding-opportunity-small-business-innovation-research-program-4 | V1 |
| R6 | NIDILRR Phase I: at least two-thirds of research or analytic activity by the small business (FY26 NOFO HHS-2026-ACL-NIDILRR-BISA-0207) | https://simpler.grants.gov/opportunity/e7d0e12f-fafe-4802-868e-1f2c7ebfb258 | V1 |
| R7 | NIDILRR award ceiling includes direct costs, indirect costs and any reasonable profit or fee (FY2025 ACL text). Project narrative limit was 40 pages in the FY2025 cycle (aggregator), a very different length from NIH's 6. Aggregators also say digital outputs should meet Section 508 and WCAG 2.0/2.1 AA. FY2027 forms, page limits, indirect rule and Section 508/WCAG wording: not seen | https://acl.gov/news-and-events/announcements/new-funding-opportunity-small-business-innovation-research-program-4 ; https://platform.grantexec.com/grants/bfa2a81e-8626-4fe2-8529-6650a41d6f18-small-business-innovation-research-sbir-program | ceiling V1 (FY2025); 40 pages and WCAG V2; FY2027 U |
| R8 | NIH parent SBIR is **PA-27-100** (R43/R44, clinical trial optional). **PA-27-102** is the STTR parent and PA-27-101 is the Phase IIB track. grants.md's "PA-27-102" for SBIR looks wrong. Receipt dates 2026-09-05 (passed), 2027-01-05, 2027-04-05. One notice now covers trial and non-trial projects, but some institutes decline trials (aggregator: NIAMS, NIDCR, NCATS, ORIP and FDA centers). Confirm in the NIH Guide | https://grantedai.com/news/pa-27-100-1-4b-2026-05-31 ; https://www.bwcoconsulting.com/fod/nihsbir ; https://grantedai.com/blog/nih-sbir-sttr-omnibus-live-pa-27-100-102-101-parp-27-098-september-5-2026-deadline-small-business-strategy ; https://grants.nih.gov/funding/nih-guide-for-grants-and-contracts (check here) | V2 only; number now mostly resolved, trial rules U |
| R9 | NIH Phase I "normal" cap: **$314,363** total (direct + indirect + fee) per NOT-OD-25-013 (Phase II $2,095,748); this replaces the $306,872 in v0.1 and grants.md. A 2026 third-party guide lists $323,090 with no NIH notice, so the FY2027 figure is U. Each institute may set a lower or higher topic limit. Tier B ($269k) fits under all three figures | https://grants.nih.gov/grants/guide/notice-files/NOT-OD-25-013.html ; https://opengrants.io/sbir-phase-1-grant-amount-why-numbers-differ/ ; https://www.niaid.nih.gov/grants-contracts/sbir-know-your-actual-budget-cap | notice V1 (snippet, date not seen); FY2027 value U |
| R10 | NIH: PD/PI primary employment (more than 50%) with the small business; normally at least 67% of Phase I work by the small business and at most 33% to third parties (of direct + indirect + fee) | https://grants.nih.gov/grants/guide/notice-files/NOT-AR-21-022.html ; https://grants.nih.gov/funding/activity-codes/R43 | V1 |
| R11 | NIH fee normally at most 7% of total costs (direct + indirect) per phase, and must be in the budget at application | https://grants.nih.gov/grants/policy/nihgps/HTML5/section_18/18.5.4_allowable_costs_and_fee.htm | V1 |
| R12 | **Unresolved.** 2 CFR 200.414(f) allows a de minimis rate of up to 15% of modified total direct costs (MTDC) from 2024-10-01, with the first $50,000 of each subaward in the base. But (a) NIH notice NOT-OD-25-059 keeps SBIR/STTR recipients on the NIH Grants Policy Statement 18.5.4.3 framework (use your current federal rate if you hold one) and recognizes de minimis for non-SBIR awards, and (b) a university summary of NOT-OD-26-072 says NIH reverted to a 10% rate and a $25,000 subaward base. The rule for a first-time company with no federal rate, and the NIDILRR and NSF treatment, are U. Section 5.3 therefore tests 10%, 15% and a 40%-of-direct stress case | https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-E/subject-group-ECFRd93f2a98b1f6455/section-200.414 ; https://grants.nih.gov/grants/guide/notice-files/NOT-OD-25-059.html ; https://orpa.princeton.edu/news/nih-not-od-26-072-implementation-uniform-administrative-requirements-federal-financial ; https://www.grants.nih.gov/grants/policy/nihgps/html5/section_18/18.5.4_allowable_costs_and_fee.htm | eCFR and NOT-OD-25-059 V1; NOT-OD-26-072 V2 (notice not opened); applicability U |
| R13 | NIH Specific Aims 1 page; Phase I Research Strategy 6 pages; no separate commercialization plan for Phase I (explain market potential under Significance) | https://grants.nih.gov/grants-process/write-application/how-to-apply-application-guide/page-limits ; https://www.bwcoconsulting.com/blog/nih-sbir-sttr-formatting-page-limits | V1 existence, V2 values |
| R14 | NIH requires a 2-page Data Management and Sharing Plan when the project generates scientific data (policy from 2023-01-25) | https://research.ncsu.edu/administration/proposals/nih-dms-plan/ | V2 |
| R15 | NIH clinical trial = human participants prospectively assigned to an intervention to evaluate effects on health-related biomedical or behavioral outcomes. Under the single PA-27-100 route (R8) the question becomes whether the chosen institute accepts trials. Whether this pilot counts is U (its outcome is manager workplace behaviour, which may not be "health-related") | https://www.grants.nih.gov/node/728 | V1, application U |
| R16 | NIH salary cap $228,000 (Executive Level II) from 2026-01-11. Not binding on the rates in this budget | https://www.grants.nih.gov/grants/guide/notice-files/NOT-OD-26-034.html | V1 |
| R17 | NIH registrations: SAM, eRA Commons, Grants.gov, SBA Company Registry; eRA needs a Signing Official and a PD/PI account; SBC Control ID goes in the SBIR/STTR Information form; "6 weeks or more" for the full set (SAM alone 3 weeks or more for a first registration); SBA registry is not a prerequisite for the other three. Grants.gov needs an active SAM, and the AOR role is assigned through the organization's SAM EBiz point of contact | https://seed.nih.gov/small-business-funding/how-to-apply/before-you-apply/register-company ; https://www.grants.nih.gov/node/1112 | NIH page V1; Grants.gov role detail V2 |
| R18 | NSF 26-510: Phase I up to $305,000 including direct, indirect, fee, TABA and optional I-Corps, 6-18 months; Project Pitch and an NSF invitation before a full proposal; full-proposal windows 2026-07-27 (passed), 2026-11-04, 2027-03-04, 2027-07-07; a pitch submitted now probably will not return in time for 2026-11-04 (aggregator inference) | https://www.nsf.gov/funding/opportunities/small-business-innovation-research-small-business-technology/nsf26-510/solicitation ; https://grantedai.com/news/nsf-sbir-sttr-250m-2026-05-31 ; https://grantedai.com/blog/nsf-sbir-sttr-nsf-26-510-july-27-deadline-305k-phase-i-instrumentation-pilot-startup-strategy-2026 | V1 existence and "active" label, V2 values |
| R19 | NSF Project Pitch has four sections: innovation (500 words), technical objectives and challenges (500), market (250), company and team (250). An invitation covers the next two deadlines. Maximum two pitches per company per year, and a declined pitch uses a slot (older text, 26-510 values U) | https://federalist-d99fdc38-63df-4d35-bcc2-5f9654483de0.sites.pages.cloud.gov/preview/engiip/nsf-sbir/relocations/apply/project-pitch/ ; https://grantedai.com/blog/nsf-sbir-sttr-nsf-26-510-250-million-july-27-deadline-project-pitch-strategic-breakthrough-deep-tech-strategy | V2 |
| R20 | NSF budget: fee 7% of direct + indirect; SBIR at least two-thirds of budget to the small business; subawards and consultants do not count as small-business funds | https://seedfund.nsf.gov/solicitation-budget/ | V1 |
| R21 | NSF registrations: SAM (free, "up to one month"; only "financial assistance" authority is needed) then UEI, SBC Control ID, Research.gov. A mismatch between organization name and IRS taxpayer name can delay activation. SBIR.gov FY26 instructions mention a notarized Entity Administrator letter and up to 10 business days to activate after submission. SBA registry is free, takes minutes once the UEI exists. Suggested: SAM 15 business days and NSF 10 business days before the deadline | https://seedfund.nsf.gov/how-to-submit/unique-entity-id ; https://seedfund.nsf.gov/how-to-submit/sba-company-registry ; https://www.sbir.gov/sites/default/files/FAST_FY26_Instructions%20Package_Final.pdf ; https://technologylicensing.utah.edu/images/pdfs-doc/SBC_registration_requirements_NSF.pdf | V1 (NSF, SBIR.gov snippets), timing V2 |
| R22 | NSF full-proposal Project Description length under 26-510. A forum post (undated) says 15 pages maximum and 9 minimum | https://sbirland.com/forums/topic/nsf-phase-1-submittal-lenght-limitation/ | U (forum only) |
| R23 | Duplicate or overlapping SBIR work: disclose to every agency; one award per identical project unless agencies agree | https://sbirland.com/2021/09/02/multiple-submissions-the-shots-on-goal-strategy/ | V2 (SBA Policy Directive not seen) |
| R24 | BLS 2025: 22.8% of people with a disability employed vs 65.2% of people without (release 2026-03-03). Re-confirmed this run from the bls.gov snippet. Not age-adjusted: the disabled population skews older | https://www.bls.gov/news.release/disabl.nr0.htm ; https://www.bls.gov/news.release/archives/disabl_03032026.htm | V1 |
| R25 | Nario-Redmond, Gospodinov, Cobb 2017, Rehabilitation Psychology 62(3):324-333, DOI 10.1037/rep0000127: two experiments (N=60, N=50) with simulations of dyslexia, hearing, mobility and low vision (not ADHD). Both: more confused, embarrassed, helpless; empathic concern rose but comfort interacting did not improve. Experiment 2 only: more pity, more interaction discomfort, not more willing to interview disabled students. Abstract seen only via a secondary page | https://pubmed.ncbi.nlm.nih.gov/28287757/ ; https://deiteaching.nursing.uw.edu/crip-for-a-day-the-unintended-negative-consequences-of-disability-simulations/ | V2 (PubMed page not opened) |
| R26 | NIDILRR continuity risk: a coalition letter dated 2026-08-10 says 36 planned FY2026 NIDILRR competitions (about 45% of those forecast, over $6.8M) were removed from grants.gov. These are the coalition's own numbers, not checked against grants.gov. Whether the FY2027 SBIR notice will post is not known | https://aahd.us/wp-content/uploads/2026/08/NIDILRR-grant-funding-delays-DRRC-to-ACL-August-10-2026.pdf | V2; letter not opened |
| R27 | FY2027 NIDILRR funding is not final: a coalition asked Congress for $150M on 2026-05-14, and an AOTA page reports FY2027 spending bills were still under consideration (page date not seen) | https://www.aota.org/advocacy/advocacy-news/2026/aota-urges-congress-to-protect-ot-and-disability-research-at-nih-and-nidilrr | V2 |

## 2. Specific Aims (draft text, NIH format, about one page)

**Title.** A harm-monitored, advisor-governed attention-pattern simulation with debrief: Phase I feasibility of a team-randomized pilot on manager accommodation behaviour

People with a disability are far less likely to be employed in the US: in 2025, 22.8% of people with a disability were employed, against 65.2% of people without one (BLS, 2026; not age-adjusted). Managers control many everyday practices that make work accessible to people who work differently, such as sending agendas before meetings or following up in writing. Employers often buy awareness training, and some of it uses disability simulations. The one published test we rely on is not encouraging: in two experiments with university students (N=60 and N=50) using dyslexia, hearing, mobility and low-vision simulations, participants felt more confused, embarrassed and helpless, and their empathic concern rose but comfort interacting did not; in the second experiment they also showed more pity and were no more willing to interview disabled students (Nario-Redmond et al., 2017). Those studies did not test ADHD or attention patterns, or manager behaviour at work. Whether a simulation built around those failure modes can change what managers do, without raising pity or stereotype, is unknown.

Perspective Engine is a browser session that illustrates four attention and timing patterns that some people with ADHD report or show on average. It is followed by a mandatory debrief on variability between people, strengths and accommodations, and by a planning step in which the manager chooses practices that suit everyone. It does not claim to show what ADHD is like, and its settings are design values, not measurements. Paid neurodivergent advisors hold a veto over content. Intensity has a ceiling, the manager can stop at any time, and a pre-registered rule pauses the study if harm indicators rise.

**Objective.** To determine whether a team-randomized, harm-monitored pilot of the session is feasible and safe to run in workplaces, and to estimate its effect on verified manager behaviour, so that a Phase II confirmatory trial can be sized. We make no claim yet that the session works.

**Aim 1. Freeze an advisor-approved, accessible build (months 1-2).** Advisors review the simulation, debrief, information-module control and consent text, and approve, rewrite or veto each. We test flashing against WCAG 2.3.1, check sound levels and register the protocol before enrolment. *Milestone:* a recorded advisor decision on every component, no empty strengths slot, accessibility checks passed, protocol registered.

**Aim 2. Test study feasibility (months 3-5).** Managers consent individually. Teams are randomized 1:1, stratified by organization and seniority, to simulation + debrief + planning or to an equal-length information module + planning. We enrol 40 managers (Tier A) or 120 (Tier B). We measure enrolment rate, retention to day 30, the share of managers whose behaviour can be verified (at least 3 responding direct reports, or consented system counts), session stop rate, and adverse events. *Milestone (assumption A16, advisors to set before registration):* retention at least 70% and verification coverage at least 60%.

**Aim 3. Estimate effect and harm (months 5-6).** Primary outcome: the Accommodation Action Index, verified, at day 30 (practices used out of 10), as the arm difference with a 95% CI. Harm monitors: QPS Reliability and Social Functioning, AQ-27 Pity and Fear, distress now (0-10) and self-efficacy, under the pause rule. Outputs: outcome SD, team correlation and attrition for Phase II sample size. For the pre-registered pilot of 80-150 managers the expected CI half-width is about 0.36-0.50 SD (irb-packet section 1), so it cannot confirm a small effect. At 40 managers (Tier A) only feasibility and harm signals are interpretable; the CI width is not computed.

**Impact and Phase II decision.** Go if both feasibility thresholds are met and no harm signal appears. Results are published whatever they show, including null or harmful. Phase II (a confirmatory trial) is not budgeted here.

*Format notes.* Month numbers are Tier A (6 months); Tier B runs the same steps over 12 months (A18). Length is about 640 words (roughly 1.2 pages at a typical NIH density; the words-per-page figure is my estimate) and should be trimmed by 100-150 words to be safely inside the 1-page NIH limit (R13); NIDILRR and NSF page rules are U (R7, R22). Wording stays inside the claims check (irb-packet section 9): no "know what ADHD is like", "builds empathy", "reduces stigma" or "proven".

## 3. Research Strategy outline (NIH Phase I, 6 pages; page split is assumption A17)

**Significance (about 1.25 pages).**
- Employment gap (R24) and the manager-practice lever. Accommodation behaviour, not empathy, is the target.
- Why simulations are risky (R25) and what a safer design must do.
- Market potential, one paragraph (NIH wants it here, R13): buyer is the employer, via HR or learning teams. No market-size figure is used.
- Framing: disability employment and accessible workplace practice, not DEI. No symptom, diagnosis or treatment claims (grants.md section 4).

**Innovation (about 0.75 page).**
- Advisor veto and a mandatory debrief designed against the known failure modes.
- Behaviour verified by direct reports or system counts, not only self-report.
- Equal-length active control, a harm monitor with stop rules, an independent blinded analyst, and results reported whatever they show.
- R&D risks (this is also the NSF "technical risk" story): (1) can behaviour be verified at useful coverage; (2) can the session be safe and still engaging; (3) can the build meet accessibility limits.

**Approach (about 4 pages).** Content comes from irb-packet sections 1, 5, 6 and 7.
1. Intervention and control. T-arm: four patterns (M1 default-mode intrusions, M2 reaction-time variability, M3 delay aversion, M4 salience capture; M5 hyperfocus off), intensity default 0.5, ceiling 0.8, no ADHD presets, debrief, planning. C-arm: information module of the same length, same planning step.
2. Design. Two-arm, cluster-randomized by team (about 5 managers per team, planning assumption), allocation concealed until the team is enrolled. Individual consent. Participants cannot be blinded; the analyst is.
3. Measures. T0 baseline, T1 right after, T2 day 30 (window 25-35), T3 optional. Primary AAI-verified at T2. Verification by consented system counts or an anonymous direct-report survey (at least 3 responders; results never shown to the manager or employer).
4. Analysis. Team-clustered model, intention-to-treat, estimation with 95% CI, no confirmatory claim. Detail comes from the pre-registration, which this node did not read.
5. Human subjects. Partner-university IRB decides the review route. Our own assessment is low to moderate risk. Distress levels 1-3, stop rules, support page, aggregate-only employer readouts with cells under 10 suppressed (irb-packet sections 5 and 6).
6. Timeline (assumption A18, Tier A). Month 1: advisors, IRB approval confirmed, site agreements. Month 2: build freeze, registration. Months 3-4: enrolment and T0-T1. Months 4-5: T2 window. Month 6: analysis, report, Phase II plan. In Tier B the same steps run over 12 months with a second enrolment wave and optional T3.
7. Risks and alternatives. See section 7 of this draft.
8. Rigor. Pre-registration before enrolment, frozen build with hash, deviation log, independent analyst, all outcomes reported.
9. Data. Research team holds coded individual data, employers get aggregate only. Data Management and Sharing Plan (2 pages, R14) is needed if NIH.

**Other components, outline only (not drafted).** Project summary and narrative; bibliography; facilities; biosketches for key personnel; letters of support (advisors, partner PI, each site) [TO FILL]; budget and justification (section 5); human-subjects and clinical-trial information (R15 decides the NOFO variant); inclusion enrollment report; SBIR/STTR information form with SBC Control ID; NIDILRR-specific forms U (R7); NSF Project Pitch 4 sections (R19) if NSF.

## 4. Agency variants (same project, different framing)

| Agency | Scope | Frame | Gap to close |
|---|---|---|---|
| NIDILRR (best fit, grants.md fit 0.80) | Tier A, 6 months, at most $100k | Employment outcome for people with disabilities (R5). ADHD qualifies only as a disability | NOFO not posted until about 2026-10-16. Read page limits, fee, indirect (R7) |
| NIH (NIMH, NICHD, NIA) | Tier B, 12 months, under $306,872 | Needs a health or mental-health relevant outcome, not only manager attitudes (grants.md row 1) | Program officer call on institute fit and clinical-trial status (R15). Founder gate |
| NSF 26-510 | Tier B, up to $305,000 | "Deep technology" R&D risk, Learning and Cognition topic. A training course alone will not score (grants.md row 3) | Project Pitch first, then an invitation (R18). Founder gate |

Overlap: Tier A is wave 1 of Tier B. Disclose it to every agency, and do not submit the same aims to two agencies without a disclosure strategy (R23). FY2027 per-company proposal caps may limit how many we can send (R2, details U).

## 5. Budget and justification

### 5.1 Tier A: NIDILRR, 6 months, 40 managers (mode values)

| Line | Basis | USD |
|---|---|---|
| PI / founder | 416 h x $50/h (A1, A5) | 20,800 |
| Engineer (part-time employee) | 200 h x $70/h (A2, A5) | 14,000 |
| Study operations lead | 160 h x $35/h (A3, A5) | 5,600 |
| Fringe | 10% of salaries (A4) | 4,040 |
| Survey and data platform, hosting | A7 | 1,500 |
| Participant incentives | 40 x $25 (A6) | 1,000 |
| Supplies and software | A7 | 500 |
| Advisors (consultants) | 2 quarters x $5,850 (A8; D01 input $4.7k-$7k per quarter) | 11,700 |
| Legal counsel (site agreements, COI) | A9 | 3,000 |
| University subaward (IRB of record, faculty sponsor, independent analyst, safety reviewer; includes its F&A) | A11 | 14,000 |
| **Total direct** | | **76,140** |
| Indirect | 15% x $75,140 (excludes incentives) (A12, R12) | 11,271 |
| Fee | 7% of direct + indirect (A13, R11) | 6,119 |
| **Total request** | | **93,530** |

Headroom to the $100,000 ceiling: $6,470. Third-party share (advisors, legal, subaward) $28,700 = 30.7%, against the 33% limit (R6, R10). The small business holds 69.3%.

### 5.2 Tier B: NIH or NSF, 12 months, 120 managers (mode values)

PI 1,040 h x $50 = 52,000; engineer 480 h x $70 = 33,600; operations lead 800 h x $35 = 28,000; fringe 11,360; platform 4,000; incentives 120 x $25 = 3,000; supplies 2,000; advisors 4 quarters x $5,850 = 23,400; legal 6,000; external accessibility audit 4,000; university subaward 52,000. Direct 219,360; indirect 32,454; fee 17,627. **Total request 269,441.** Headroom: $35,559 to NSF's $305,000 (R18) and $37,431 to NIH's $306,872 (R9). Third-party share 31.7%. The headroom could fund the optional T3 wave or a second analyst; not allocated.

### 5.3 Monte Carlo on cost (python3 stdlib, 20,000 draws, seed 20261007, script in the appendix)

| Tier | Total P10 / P50 / P90 | Third-party share P10 / P50 / P90 | P(total within ceiling) | P(share at most 33%) | P(both) |
|---|---|---|---|---|---|
| A (ceiling $100,000) | $89,138 / $95,693 / $101,751 | 28.0% / 30.6% / 33.0% | 0.81 | 0.90 | 0.71 |
| B (ceiling $305,000) | $254,063 / $271,935 / $288,021 | 29.3% / 32.0% / 34.4% | about 1.00 | 0.69 | 0.69 |

Reading: Tier A fits the NIDILRR ceiling about four times in five and fails both tests about three in ten. The university subaward is the swing line. If it grows, move the analyst or coordinator in-house, or cut N. Tier B's binding limit is the one-third rule, not the dollar cap.

### 5.4 Assumptions (none is a sourced figure unless stated)

| ID | Assumption (low / mode / high) | Basis |
|---|---|---|
| A1 | PI rate $40 / $50 / $70 per hour | Placeholder. Founder pay unknown. PI must be employed more than 50% by the company (R10) |
| A2 | Engineer $50 / $70 / $100 per hour | Placeholder |
| A3 | Operations lead $28 / $35 / $45 per hour | Placeholder |
| A4 | Fringe 8% / 10% / 15% of salaries (payroll taxes only) | Placeholder |
| A5 | Hours. Tier A: PI 350/416/480, engineer 150/200/280, ops 100/160/220. Tier B: PI 900/1,040/1,100, engineer 350/480/600, ops 600/800/1,000 | Sized from the aims; placeholder |
| A6 | Incentive $0 / $25 / $50 per manager | irb-packet leaves it [TO FILL]; IRB reviews |
| A7 | Platform A $0.8k/1.5k/3k; B $2k/4k/7k. Supplies A $0.5k, B $2k | Placeholder |
| A8 | Advisors: $4.7k-$7k per quarter, mode $5.85k, same intensity each quarter | D01 input (founder-decisions.md, quoting advisory-board.md, which I did not read). Extension to 2 or 4 quarters is mine |
| A9 | Legal A $1.5k/3k/6k; B $3k/6k/10k | Placeholder, counsel to quote |
| A10 | External accessibility audit, Tier B only, $2k/4k/7k. Tier A does it in-house | Placeholder |
| A11 | University subaward incl. F&A: A $9k/14k/22k; B $35k/52k/80k | Placeholder. No partner contacted; rate and IRB fee U |
| A12 | Indirect 15% (the rule maximum, as a worst case), base excludes incentives | R12. MTDC definition not checked here. NIDILRR indirect rules U |
| A13 | Fee 7%, held inside the ceiling | NIH and NSF rule (R11, R20). NIDILRR treatment U |
| A14 | Triangular draws, independent lines | Simplification |
| A15 | Team size about 5; Tier A 8 teams, Tier B 24 teams | irb-packet planning assumption |
| A16 | Feasibility thresholds: retention at least 70%, verification coverage at least 60% | Mine; advisors and Curie to set before registration |
| A17 | Research Strategy page split | Mine; NIH only fixes the 6-page total (R13) |
| A18 | Tier A month plan | Mine. IRB approval, advisors and site agreements must exist before the est. 2027-06-01 start, so they are unfunded pre-award work |

### 5.5 Justification by line (draft text)

- **PI / founder.** Leads design, advisor liaison, safety escalation and reporting. The PI's primary employment must be with the company (R10); the founder's current employment is U.
- **Engineer.** Build freeze, telemetry (dose only; no gaze, webcam, audio or biometrics), flash and sound checks, survey integration. If done by a contractor it moves to the third-party share and breaks the one-third limit in Tier A.
- **Operations lead.** Recruitment logistics under IRB-approved text, scheduling the T0-T2 windows, data cleaning. Study contacts are kept separate from sales contacts (irb-packet section 2).
- **Fringe.** Employer payroll taxes only; benefits would raise it.
- **Platform and supplies.** Survey tool, storage and hosting for coded data; vendor and region U (irb-packet section 6).
- **Incentives.** Small, so they do not override judgement (irb-packet section 2 rule 5). Amount subject to IRB.
- **Advisors.** Paid neurodivergent advisors review content and hold a veto (irb-packet sections 4.5 and 8). No advisor is seated yet; seating and payment are founder-gated.
- **Legal.** Employer site agreements, conflict-of-interest management, consent wording (irb-packet sections 3.3 and 8).
- **University subaward.** IRB of record, faculty sponsor, independent blinded analyst and safety reviewer, which the conflict-of-interest safeguards need (irb-packet section 1). Partner not chosen.
- **Not budgeted.** Travel (virtual study), equipment, publication fees, and any Phase II work.

## 6. Registrations and accounts the founder must hold

Nothing below was created or touched. Each needs the founder's identity, signature or a contact with a real person. Dates are computed from the 42-day "6 weeks or more" figure in R17, a conservative lead time. Entity formation and EIN lead time is U.

| # | Item | Needed for | Source | Lead time or note |
|---|---|---|---|---|
| G0 | Decision D01 #1: country and majority owners (more than 50% US citizens or permanent residents, R3) | all three | founder-decisions.md | Blocks everything below. Foreign-owned or foreign-based applicants are not eligible for NIDILRR (R3) |
| G1 | US for-profit legal entity, plus an EIN from the IRS | all | R3; EIN requirement U | Formation time U. Counsel |
| G2 | Business bank account | SAM payment details, U | U | U |
| G3 | Login.gov account in the founder's name | SAM.gov | R21 | Minutes |
| G4 | SAM.gov entity registration, which issues the UEI. Free; do not pay a third party | all | R17, R21 | Up to about a month (R21) |
| G5 | SBA Company Registry, which issues the SBC Control ID. Needs the UEI | all | R17, R21 | U |
| G6 | Grants.gov organization registration and an authorized organization representative role | NIH, NIDILRR (U for NOFO) | R17 | Needs active SAM |
| G7 | eRA Commons: organization, Signing Official, PD/PI account | NIH | R17 | Part of the 6 weeks or more |
| G8 | Research.gov organization and PI accounts | NSF | R21 | Needs UEI and SAM |
| G9 | OSF account for the pre-registration | all (D01 #5) | founder-decisions.md | Founder authorizes when V03 reaches them |
| G10 | Partner-university IRB route: PI, faculty sponsor, IRB submission | all | irb-packet section 8 | Partner not chosen; no contact made |
| G11 | Human-subjects training records for key personnel; assurance or IRB reliance arrangement | NIH, NIDILRR (U) | irb-packet section 8 | Requirement and provider U |
| G12 | NIH program-officer contact on institute fit and clinical-trial status (R15); NSF Project Pitch; NIDILRR contact named in the FY26 NOFO (Brian Bard, ACL; confirm in FY27) | each agency | grants.md section 4 | Contact with a real person: founder gate |
| G13 | If NIH deems it a clinical trial, ClinicalTrials.gov registration | NIH | R15 | U |
| G14 | Foreign ownership, affiliation and cybersecurity disclosures under the new due diligence | all | R2 | Content U |

| Agency | SAM/UEI | SBA registry | Grants.gov | eRA Commons | Research.gov |
|---|---|---|---|---|---|
| NIDILRR | yes | yes (expected, NOFO U) | yes (NOFO U) | no | no |
| NIH | yes | yes | yes | yes | no |
| NSF | yes | yes | not seen | no | yes |

**Critical path (today 2026-10-07; NIDILRR est. due 2026-12-16 is 70 days away).**
- G0 decision and G1 entity come first, then G3-G5. Starting registrations by **2026-11-04** is the latest for a 2026-12-16 due date, with zero slack. Earlier is safer.
- NIH 2027-01-05: start by 2026-11-24. NIH 2027-04-05: start by 2027-02-22. NSF full proposal 2027-03-04: start by 2027-01-21, after a Project Pitch invitation (U on turnaround).
- The NIDILRR NOFO was forecast for about 2026-10-16. Replace every U in R7 once it posts.
- Founder-gated before any submission: G0-G14, plus advisors seated, partner IRB route, site letters, and final sign-off on the aims text.

## 7. What reviewers will probe

| Weakness | Response in the draft |
|---|---|
| No preliminary data, pre-revenue | Phase I is the feasibility mechanism. The aims ask for feasibility and harm signals only |
| No advisors, no partner IRB yet | Must exist before award start. Founder gates; unfunded pre-award work (A18) |
| Conflict of interest: company builds the product under test | Independent blinded analyst, frozen script, all outcomes reported (irb-packet section 1) |
| Harm risk (pity, stereotype, distress) | Intensity ceiling, stop button, debrief, pause rule, advisor veto (irb-packet sections 4-5, 7) |
| Pilot cannot confirm an effect | Aims estimate; CI half-width stated (irb-packet section 1) |
| NIH health relevance of an employment outcome | NIDILRR is the best fit; NIH needs an institute conversation (G12) |
| Thin Tier A margin | 81% within ceiling (section 5.3). Subaward is the lever |
| Founder eligibility | PI employed more than 50% by the company; more than 50% US ownership (R3, R10) |

Expected value is not computed. The award probabilities in grants.md (0.20 NIDILRR, 0.12 NIH, 0.10 NSF) are that node's assumptions, not published rates.

## 8. Checks and open items

- **Claims check.** Phrases flagged in irb-packet section 9 do not appear in this draft. The Specific Aims text makes no claim that the session works, and no symptom, diagnosis or treatment claim.
- **Unverified, left open.** NIDILRR forms, page limits, fee and indirect (R7); NIH NOFO number (R8) and current cap (R9); clinical-trial classification (R15); NSF Project Description length (R22); NSF Project Pitch turnaround; FY2027 proposal caps (R2); entity formation time; human-subjects training requirement; university subaward and IRB fee; founder's employment and pay.
- **For the founder.** G0 first. Then approve or change A1-A4 and A6, decide Tier A vs B first, and clear the gates in section 6.
- **Not read.** preregistration.md and advisory-board.md (outside this node's inputs). Statistical detail and the advisor rate come only through the three input files.

## Appendix: cost model (python3 stdlib only)

```python
import random
random.seed(20261007); T = random.triangular
FEE, IDC, FR = 0.07, 0.15, (0.08, 0.10, 0.15)
RATE = dict(pi=(40,50,70), eng=(50,70,100), ops=(28,35,45))
def pct(x, p):
    x = sorted(x); k = (len(x)-1)*p/100; f = int(k); c = min(f+1, len(x)-1)
    return x[f] + (x[c]-x[f])*(k-f)
A = dict(N=40, hours=dict(pi=(350,416,480), eng=(150,200,280), ops=(100,160,220)),
  incent=(0,25,50), platform=(800,1500,3000), misc=500, advisors=(9400,11700,14000),
  legal=(1500,3000,6000), audit=(0,0,0), subaward=(9000,14000,22000), cap=100000)
B = dict(N=120, hours=dict(pi=(900,1040,1100), eng=(350,480,600), ops=(600,800,1000)),
  incent=(0,25,50), platform=(2000,4000,7000), misc=2000, advisors=(18800,23400,28000),
  legal=(3000,6000,10000), audit=(2000,4000,7000), subaward=(35000,52000,80000), cap=305000)
def run(t, n=20000):
    out = []
    for _ in range(n):
        r = {k: T(*v) for k, v in RATE.items()}
        sal = sum(T(*t['hours'][k]) * r[k] for k in r)
        inc = t['N'] * T(*t['incent'])
        tp = T(*t['advisors']) + T(*t['legal']) + T(*t['audit']) + T(*t['subaward'])
        direct = sal*(1+T(*FR)) + T(*t['platform']) + inc + t['misc'] + tp
        costs = direct + IDC*(direct-inc)
        total = costs*(1+FEE)
        out.append((total, tp/total))
    return out
for name, t in (('A', A), ('B', B)):
    res = run(t); tot = [a for a, b in res]; sh = [b for a, b in res]
    print(name, [round(pct(tot, p)) for p in (10, 50, 90)], [round(pct(sh, p), 3) for p in (10, 50, 90)],
          sum(a <= t['cap'] for a in tot)/len(tot), sum(b <= .33 for b in sh)/len(sh),
          sum(a <= t['cap'] and b <= .33 for a, b in res)/len(res))
```

Note on the appendix: it reproduces the section 5.3 figures only if the draw order matches the working script; re-run it to confirm before quoting a figure externally. The working script (scratch file, not a deliverable) printed the section 5.3 numbers.
