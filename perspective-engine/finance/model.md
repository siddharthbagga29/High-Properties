# Perspective Engine: Bottom-up Financial Model (V10)

## Summary
Bottom-up monthly Monte Carlo (10000 trials, seed 20261006, 2027-2031) of the browser-first manager-accommodation program: paid pilots, then annual per-manager seats; no hardware, no generative inference. Year-5 (Dec 2031) ARR P10/P50/P90: $53k / $633k / $4.31M. Year-5 gross margin P10/P50/P90: 54% / 68% / 77%. Median months to $1M ARR: not reached (>m60) (P(reach within 60 months) = 41%). P(ARR >= $5M by month 48) = 0.6%. P(H1 fails) is drawn per trial and caps growth after the study readout. Cumulative burn through month 60 before grants or financing P10/P50/P90: $3.17M / $4.93M / $8.66M. This is cut off at the horizon, not a peak: monthly net cash flow is still negative at month 60 in 97% of trials, so the full funding need is larger and this model does not determine it. None of the 32 inputs has a public numeric source (dossier found no pricing or buyer data); all are labeled assumptions to replace with interview data. Biggest drivers: h1_failed (realised), growth, seats.

Regenerate (numbers below are printed by the script, never hand-typed): `python3 perspective-engine/finance/model.py --write-md perspective-engine/finance/model.md`

## Results (verbatim script output)
```
Perspective Engine bottom-up Monte Carlo | trials=10000 seed=20261006 horizon=60 months (2027-01..2031-12)
Model run time: 2.4 s | inputs: 32, sourced numerically: 0, assumptions: 32

ARR (annual contracts only), P10 / P50 / P90
  month 12 (Dec 2027): $0k / $0k / $105k
  month 24 (Dec 2028): $0k / $91k / $343k
  month 36 (Dec 2029): $0k / $168k / $799k
  month 48 (Dec 2030): $19k / $318k / $1.85M
  month 60 (Dec 2031): $53k / $633k / $4.31M

Gross margin (pilots + recurring, after facilitation, hosting, CS, co-designer fees), P10 / P50 / P90
  2027: 33% / 64% / 77%
  2028: 50% / 67% / 77%
  2029: 53% / 68% / 77%
  2030: 53% / 68% / 77%
  2031: 54% / 68% / 77%
  P(year-5 gross margin >= 84%, the memo's unverified figure) = 0.2%

Months to $1M ARR (never within 60 months counts as >m60), P10 / P50 / P90: m40 (2030-04) / >m60 / >m60
  P(reach $1M ARR within 60 months) = 40.9%; within 48 months = 24.5%
  Among trials that reach it (n=4089): P10 / P50 / P90 = m34 (2029-10) / m46 (2030-10) / m57 (2031-09)
P(ARR >= $5M at any month <= 48) = 0.6%  | at month 48 exactly = 0.6% | at month 60 = 7.6%
P(H1 failure realised in trial) = 51.0%

Conditional on H1 outcome (ARR month 60 P10 / P50 / P90 ; P(ARR60 >= $1M) ; P($5M by m48))
  H1 holds n=4899: $604k / $2.09M / $6.28M ; 77.7% ; 1.2%
  H1 fails n=5101: $20k / $178k / $707k ; 4.8% ; 0.0%

Cash (before any grants or financing), P10 / P50 / P90
  Cumulative burn through month 60 (deepest cumulative cash inside the horizon; horizon-truncated, not a peak): $3.17M / $4.93M / $8.66M
  Cumulative cash at month 60 (negative = still burning): -$8.66M / -$4.93M / -$3.17M
  P(cash trough before month 60, i.e. cumulative cash already turning up) = 3.2% (H1 holds: 6.2%; ARR60 >= $2M: 11.9%)
  P(month-60 net cash flow > 0) = 2.9%. In the other trials the business still burns cash at month 60, so the full funding need exceeds the burn line above and is not determined by this model
  Paid pilots signed in 2027 (year-1 milestone is 3): 1 / 4 / 7 ; P(>=3) = 68.0%

Unit economics (closed form, H1 holds, no expansion, pilot fee ignored), P10 / P50 / P90
  Mean ACV per annual account: $20k / $46k / $89k
  CAC payback on gross profit, months (CAC / conversion): 7 / 18 / 48
  LTV/CAC (gross profit / churn / CAC per annual account): 1.1 / 3.1 / 8.1

Top drivers of month-60 ARR (Spearman rank correlation)
  h1_failed (realised)   -0.79
  growth                 +0.34
  seats                  +0.29
  price                  +0.15
  r0                     +0.13
  p_fail                 -0.12
  conv                   +0.10
  f_acq                  +0.08
```

## Mechanics
- Monthly, month 1 = Jan 2027, month 60 = Dec 2031. Each input is drawn once per trial from a triangular(low, mode, high) distribution; trials are independent and inputs are uncorrelated (a known simplification).
- Pilot signings are Poisson with a rate that starts after the sales cycle (less a 2-month head start), grows by the annual growth multiplier, and shrinks as cumulative pilots approach the reachable-account cap.
- Each pilot pays a fee over its length, then converts to an annual contract with probability `conv` after `lag` months. Account size = median seats x lognormal spread x price per seat. Renewals every 12 months: churn draw, then seat expansion.
- ARR = sum of active annual contracts. Pilot fees are revenue, not ARR. Hardware cost is zero by design (browser-first; the enterprise headset channel contracted, dossier section 6: https://forwork.meta.com/blog/an-update-on-meta-for-work/).
- COGS = pilot facilitation and hosting, per-seat hosting and facilitation (falling with productization), customer success, co-designer fees and licensed assets. S&M = max(floor, CAC x pilots signed). R&D+G&A = growing fixed floor + share of revenue.
- H1 value hypothesis: in each trial it fails with probability `p_fail` (itself uncertain). After the readout month, a failed trial gets a lower pilot signing rate, lower conversion, higher churn, and cost cuts. Ranges for conversion, churn and price are conditional on H1 holding, so failure is the main growth cap.
- Target: $5M ARR is taken as $50M at an assumed 10x ARR multiple (assumption, not a market fact). "By month 48" means ARR is at or above $5M in any month up to month 48; month-48 and month-60 values are also shown.

## Inputs (all triangular; label is `assumption` or `sourced: <url>`)
| Key | Low | Mode | High | Unit | Label | Basis |
|---|---|---|---|---|---|---|
| `r0` | 0.15 | 0.28 | 0.5 | pilots signed/month at launch | assumption | Year-1 milestone is 3 paid pilots (execution plan); founder-led; modelled 2027 pilot count is reported in the results |
| `cycle` | 3 | 5 | 9 | months, first touch to signed pilot | assumption | ICP: all cycle lengths are role-logic hypotheses; 2 months of 2026 interviewing assumed head-start |
| `growth` | 1.3 | 2 | 3.2 | x per year on pilot signing rate | assumption | Sales hires and references; no comparable growth data found |
| `n_reach` | 500 | 1500 | 4000 | reachable target accounts | assumption | ICP segments 1-3; size band 1,000-10,000 staff is untested; count unverified |
| `pilot_price` | 4000 | 12000 | 30000 | USD per paid pilot | assumption | Dossier: no public pricing for comparables (Embodied Labs unverified) |
| `pilot_months` | 1.5 | 2 | 3.4 | months, pilot length | assumption | ICP: 4-8 week pilot with 4-8 week follow-up |
| `pilot_seats` | 15 | 30 | 60 | managers per pilot cohort | assumption | ICP: one cohort of managers |
| `conv` | 0.25 | 0.45 | 0.65 | pilot-to-annual conversion | assumption | No data; conditional on H1 holding |
| `lag` | 1 | 2 | 5 | months, pilot end to annual start | assumption | Budget-cycle and Legal/IT review (ICP blockers) |
| `seats` | 30 | 100 | 400 | median managers per annual account | assumption | No data; first contract assumed to cover one business unit of a 1,000-10,000 staff employer (ICP) |
| `sigma` | 0.4 | 0.6 | 0.9 | lognormal sigma, account size spread | assumption | Account sizes are skewed |
| `price` | 100 | 200 | 400 | USD per manager seat per year | assumption | No public pricing found (dossier section 7); memo's $25k-60k/yr is unverified and only a cross-check on the ACV line in the results, not an input |
| `exp` | 0 | 0.08 | 0.25 | annual seat growth at renewal | assumption | No data |
| `churn` | 0.1 | 0.2 | 0.35 | annual logo churn at renewal | assumption | Includes budget-line cuts: 19% of organisations said they were decreasing DEI funding in 2025 and 23% increasing (Paradigm 2025 DEI Benchmarking Study, 443 organisations surveyed March 2025, https://info.paradigmiq.com/hubfs/2025%20DEI%20Benchmarking%20Study.pdf ; seen in secondary reports by web-search summary only, report not read; same source as gtm/icp.md section 2). Context only, not a numeric basis for the churn range; product is positioned outside DEI |
| `p_fail` | 0.3 | 0.5 | 0.7 | P(H1 value hypothesis fails) | assumption | Dossier: no controlled ADHD-simulation trial; cognitive empathy d=0.08 (https://tmb.apaopen.org/pub/vr-improves-emotional-empathy-only); Nario-Redmond 2017 (https://pubmed.ncbi.nlm.nih.gov/28287757/) |
| `t_res` | 10 | 14 | 22 | months, estimation-study readout | assumption | First-year milestone is the study; readout lag assumed |
| `f_acq` | 0.05 | 0.15 | 0.35 | x pilot signing rate after H1 failure | assumption | Growth cap: residual referral-only sales |
| `f_conv` | 0.3 | 0.5 | 0.8 | x conversion after H1 failure | assumption | Growth cap |
| `f_churn` | 1.3 | 1.8 | 2.5 | x churn after H1 failure | assumption | Growth cap |
| `f_cost` | 0.4 | 0.6 | 0.85 | fraction of fixed cost kept after H1 failure | assumption | Cost cuts begin 3 months after readout |
| `cac` | 8000 | 18000 | 40000 | USD fully loaded S&M per signed pilot | assumption | No data; includes sales salary and travel |
| `sm_floor` | 4000 | 8000 | 15000 | USD/month minimum S&M | assumption | Tools, events, part-time BD |
| `fac_hours` | 20 | 40 | 80 | facilitator hours per pilot | assumption | Live debrief is part of the product (task brief) |
| `fac_rate` | 60 | 90 | 140 | USD per facilitator hour | assumption | No data |
| `fac_seat` | 6 | 20 | 60 | USD facilitation per seat per year | assumption | Annual debrief mostly productized and grouped |
| `fac_imp` | 0 | 0.1 | 0.3 | annual facilitation cost reduction | assumption | Productization |
| `hosting` | 2 | 5 | 12 | USD hosting per seat per year | assumption | Browser-first, no generative inference, no hardware |
| `cs` | 0.04 | 0.07 | 0.12 | customer success, share of recurring revenue | assumption | No data |
| `content` | 0.03 | 0.05 | 0.1 | co-designer fees and licensed assets, share of revenue | assumption | Dossier: lived-experience co-design required |
| `opex0` | 30000 | 45000 | 70000 | USD/month R&D+G&A in 2027 | assumption | 2-4 person lean team |
| `opex_g` | 0.1 | 0.25 | 0.5 | annual growth of fixed R&D+G&A | assumption | No data |
| `opex_pct` | 0.15 | 0.25 | 0.35 | variable R&D+G&A, share of revenue | assumption | No data |

## Limits and what to do next
- No input is numerically sourced. The dossier states that no public pricing, buyer or conversion data were found (sections 7 and "Verdict" table), and the ICP says all cycle lengths and prices are hypotheses. The unverified $14.8B TAM, 72% success figure and CPT reimbursement are not used. Treat all output percentiles as a structured statement of uncertainty, not a forecast.
- Replace inputs, starting with the drivers listed in the results, using data from the 10-20 buyer interviews and the three paid pilots: price per seat, seats per account, conversion, churn, then CAC and sales cycle. Re-run with the same seed to see the effect.
- Not modelled: grants (SBIR/NIMH), reimbursement, equity financing, taxes, working capital, multi-year contracts, and channel partners (EAP and consultancy vendors, ICP section 4). The cash lines are before any grants or financing.
- Funding need is horizon-truncated. In almost every trial cumulative cash is still falling at month 60 (see the trough and month-60 cash-flow lines in the results), so for those trials "cumulative burn through month 60" is a lower bound on the funding requirement, not a peak; it is the actual peak only in the few trials whose trough falls before month 60. Do not quote it as "peak funding need" in raise materials; extend the horizon or add a financing model first.
- Inputs are independent. In reality price, seats and conversion are correlated (larger accounts negotiate discounts), so the tails are probably too wide in one direction and too narrow in another.
- The H1 failure treatment is a regime switch, not a learning model; partial success (effect on behaviour but not attitudes) would sit between the two conditional rows.
