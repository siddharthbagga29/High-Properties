# Perspective Engine: execution plan v1

**Summary (at most 150 words).** The memo is right that this is a B2B problem, not a consumer app. Four load-bearing claims fail on evidence. Meta ended business Quest sales on 2026-02-20; we will not depend on headset fleets. Disability simulations can raise pity instead of understanding. VR moves emotional empathy but barely the cognitive understanding managers need. The quantum, "18 dB", CPT and $14.8B figures have no support. So we sell a **manager-accommodation program**, with a short experiential module as its hook, to be co-designed with paid ADHD advisors, delivered in any browser (WebXR optional) and judged on what managers *do* 30 days later. The moat is a validated curriculum, a published outcome study, a paid neurodivergent co-design network and outcome data, not EEG. Month 12 target: a pre-registered estimation pilot (80–150 managers; confirmation needs roughly 300+, see `data/instruments.md`), 3 paid enterprise pilots, one non-dilutive grant submitted. Kill criteria below are binding.

*Sources and revisions.* v1 was written from `research/evidence-dossier.md`, F05's only listed input. Later revisions quote `finance/model.md` (V10), `data/instruments.md` (V02), `science/preregistration.md` (V03), `science/mechanism-spec.md` (V01) and `ethics/irb-packet.md` (M03); those reads were outside F05's input list (audit AF-orchestrator-6). Revised 2026-10-09 after audit findings AF-orchestrator-4, -5 and -6.

---

## 1. How a scientist-investor reads this idea

A scientist asks *what would have to be true*, then tries to falsify it cheaply. An investor asks *who pays, how often, and what stops a copy*. Together they reduce the idea to four hypotheses. The whole first year exists to test them, in this order, because each is cheaper to kill than the next.

| # | Hypothesis | Cheapest test | Graph nodes | Kill / pivot signal |
|---|---|---|---|---|
| H1 Value | Managers who go through simulation + debrief + practice take more accommodation actions at 30 days than managers who complete an equal-length information module (the pilot's control arm, `science/preregistration.md`). | Pre-registered randomized pilot, 80–150 managers, verified behavioral outcome (estimation, not confirmation) | V01, V02, V03, M03, S02 | Point estimate at or below zero, or the CI rules out the smallest effect worth selling → drop the "experience" claim and sell the curriculum only |
| H2 Harm | The experience does not raise pity or lower perceived competence of ADHD colleagues. | Attitude items pre/post in every session; advisory veto | F06, V04, V14 | Any reliable rise in pity or a drop in competence ratings → redesign before any sale |
| H3 Buyer | A named budget owner (L&D, accessibility, HRBP) will pay for a pilot without a DEI line item. | 50-account list, outreach, LOIs with a success metric attached | V05–V09, S01 | Fewer than 3 LOIs from 50 qualified conversations → change segment (universities, clinics' family programs) |
| H4 Delivery | The experience works in a normal browser in under 20 minutes, with no hardware. | MVP v0 in 5 facilitated sessions | F04, V14, M01 | Facilitators need a headset to make it land → partner with a headset lessor, never own fleets |

These thresholds are founder decisions, not measured facts. Revise them only before the data arrives, never after.

## 2. What changes versus the memo

| Memo | Revised | Why (see `research/evidence-dossier.md`) |
|---|---|---|
| Vision Pro / Quest app first | Browser first, WebXR optional (Quest browser) | Meta stopped selling commercial Quest SKUs and Horizon managed services on 2026-02-20 (existing customers supported to 2030-01-04); a channel change, not a measured collapse of fleets. Vision Pro cutbacks are secondary reports only (unverified; dossier s6) |
| "Simulate ADHD" | "Approximates some reported attentional experiences, to be co-designed with paid ADHD advisors" | Nario-Redmond 2017: simulations can increase pity |
| Empathy Index as the KPI | Behavior at 30 days (accommodation actions, follow-up quality) | VR shifts emotional (d≈0.33) but not cognitive (d≈0.08) empathy |
| Bio-calibrated EEG/GSR moat | Outcome data + validated curriculum + ND co-design network + publication | Biometrics are a privacy liability; webcam gaze error is about 2–4° |
| DEI budget | Accessibility, manager effectiveness, retention | Surveys disagree on US DEI budgets (one 2025 survey: 19% of companies cut DEI funding; 78% of C-suite leaders said they rebrand it; dossier s6), so a DEI line item is not a dependable budget |
| CPT reimbursement upside | None assumed | 0770T is a therapy add-on that sunsets in 2028; Akili's reimbursement path failed |
| Quantum multi-agent modeling | Removed | No scientific or engineering basis |
| 72% success, $38M P50 ARR | Recomputed bottom-up in V10 from sourced ranges | No basis given |

## 3. The product (what we actually build)

A 45–60 minute **manager session** (design target, not timed), facilitated or self-run:
1. **Before**: day-0 questions. In the pilot this is the T0 battery, about 12 min (`ethics/irb-packet.md` s1); a shorter set for paid sessions outside the study is not yet specified.
2. **Experience**: the same workplace task twice, once at baseline and once under load. The load adds four mechanisms with published group-level evidence of varying strength (`science/mechanism-spec.md` s2): default-mode intrusions (M1), reaction-time variability (M2), delay aversion (M3) and salience capture (M4). Hyperfocus (M5) rests on self-report evidence only and is off by default. Time perception ("time blindness") is not modelled (spec s6). All are tunable, and none is a diagnosis (V01).
3. **Perspective-giving**: short recorded accounts from paid ADHD advisors, covering strengths, variability and what helps. This is the part VR alone cannot supply (F06, V04).
4. **Practice**: three accommodation micro-scenarios (written instructions, async follow-ups, focus blocks), with feedback.
5. **Debrief and commitment**: the manager picks one accommodation to try. We check back at 30 days (V02).

The buyer sees an aggregate dashboard with n≥10 suppression (M02).

## 4. Twelve-month milestones (mapped to graph nodes)

| Month | Milestone | Nodes | Gate (your action) |
|---|---|---|---|
| 0 (now) | Evidence dossier, browser MVP v0, agent city, this plan | F01–F05 | none |
| 1 | Co-design charter; mechanism spec; ICP; funding map | F06, V01, V05, V11 | none |
| 1–2 | Recruit 5–7 paid ND advisors; instruments; privacy map | V04, V02, V12 | Approve the advisor budget |
| 2 | Pre-registration on OSF; 10-lab partner shortlist | V03, V15 | OSF account |
| 2–3 | Target list, LOI, outreach drafts, landing page | V06–V08, V13 | none |
| 3 | Outreach sent; 50 conversations | V09 | Gmail authorization + batch approval |
| 3–4 | MVP v0.2 from advisor sessions; financial model | V14, V10 | Run the advisor sessions |
| 4–6 | WebXR v1; IRB packet via university partner; entity formed | M01, M03, M04 | Incorporation; IRB via partner |
| 5–6 | SBIR/STTR Phase I draft (reauthorized through 2031) | M05 | SAM.gov / eRA registration |
| 6–9 | Pilot playbook; buyer dashboard; 3 paid pilots | M06, M02, S01 | Sign pilot contracts |
| 9–12 | Pilot report (nulls included); paper; seed memo; case studies | S02–S05 | Author sign-off; customer quote approval |

## 5. Economics, honestly

- Pricing is a hypothesis to test in discovery. Start with paid pilots priced per cohort, then move to annual per-manager seats. No figure from the memo is reused until V10 recomputes it from sourced ranges.
- Gross margin should be high: browser delivery, no hardware, no generative inference needed in the core loop. Facilitation is the main cost risk; productize it into self-run sessions by month 9.
- $50M enterprise value in 48 months would need roughly $5–8M ARR, which assumes a revenue multiple of about 6–10x (assumption; the repo has no sourced multiple). The first bottom-up model (`finance/model.py`, 10,000 trials, every input an unsourced assumption) gives P(ARR ≥ $5M by month 48) = **0.6%** (`finance/model.md`). $5M is the low end of the range, so 0.6% is an upper bound on the $50M outcome under these assumptions, not an estimate of it. Year-5 ARR comes out at $53k / $633k / $4.31M (P10/P50/P90), with gross margin near 68% at the median, not 84%. Whether H1 holds is the dominant driver: P50 year-5 ARR is $2.09M if it holds and $178k if it fails. Cumulative burn through month 60, before grants or financing, is $4.93M at P50. That figure is cut off at the model horizon, not a peak: monthly cash flow is still negative at month 60 in 97% of trials, so the full funding need is larger and the model does not determine it.
- What this means: the $50M goal is a tail outcome on today's assumptions. Two things move it. First, settle H1 early and cheaply. Second, find a larger seat footprint per account, such as a manager curriculum that HR adopts company-wide. Replace model inputs with interview and pilot data in this order: H1, pilot-rate growth, seats per account, price, conversion, churn.

## 6. Free-first resources

GitHub (code, Pages for the landing page), Python stdlib (models), three.js/A-Frame via CDN (WebXR), OSF (pre-registration), PubMed and Google Scholar, SBIR.gov and Grants.gov, company careers and ERG pages for account research, WebGazer.js only for coarse demos. Paid items appear only as gated nodes.

## 7. Operating system

Nine agents, one per district, run the DAG in `graph/graph.json` with the prompt in `PROMPT.md`. Each agent reads only the files its brief lists and writes only its own outputs. State changes only through `tools/graph.py`, which updates the city dashboard. Anything needing your account, money, signature, or a message to a real person stops in **Waiting on you**.
