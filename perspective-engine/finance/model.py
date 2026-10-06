#!/usr/bin/env python3
"""Perspective Engine: bottom-up Monte Carlo (node V10). Python 3 stdlib only.

Product: browser-first manager-accommodation program (experiential module + debrief +
practice). Paid pilots first, then annual per-manager seats. No hardware, no generative
inference in the core loop. Monthly model, month 1 = Jan 2027, month 60 = Dec 2031.

Run:   python3 perspective-engine/finance/model.py
Write: python3 perspective-engine/finance/model.py --write-md perspective-engine/finance/model.md
Every input is triangular(low, mode, high) with a label: "sourced: <url>" or "assumption".
ARR counts annual contracts only; pilot fees are revenue but not ARR. No grants modelled.
"""
import argparse, math, random, time

SEED, TRIALS, H = 20261006, 10000, 60
TARGET_ARR, T48 = 5e6, 48          # $5M ARR = $50M at an assumed 10x ARR multiple
A = "assumption"

# (key, low, mode, high, unit, label, basis)
PARAMS = [
 ("r0",        0.15, 0.28, 0.50, "pilots signed/month at launch", A, "Year-1 milestone is 3 paid pilots (execution plan); founder-led; modelled 2027 pilot count is reported in the results"),
 ("cycle",     3, 5, 9, "months, first touch to signed pilot", A, "ICP: all cycle lengths are role-logic hypotheses; 2 months of 2026 interviewing assumed head-start"),
 ("growth",    1.3, 2.0, 3.2, "x per year on pilot signing rate", A, "Sales hires and references; no comparable growth data found"),
 ("n_reach",   500, 1500, 4000, "reachable target accounts", A, "ICP segments 1-3; size band 1,000-10,000 staff is untested; count unverified"),
 ("pilot_price", 4000, 12000, 30000, "USD per paid pilot", A, "Dossier: no public pricing for comparables (Embodied Labs unverified)"),
 ("pilot_months", 1.5, 2.0, 3.4, "months, pilot length", A, "ICP: 4-8 week pilot with 4-8 week follow-up"),
 ("pilot_seats", 15, 30, 60, "managers per pilot cohort", A, "ICP: one cohort of managers"),
 ("conv",      0.25, 0.45, 0.65, "pilot-to-annual conversion", A, "No data; conditional on H1 holding"),
 ("lag",       1, 2, 5, "months, pilot end to annual start", A, "Budget-cycle and Legal/IT review (ICP blockers)"),
 ("seats",     30, 100, 400, "median managers per annual account", A, "No data; first contract assumed to cover one business unit of a 1,000-10,000 staff employer (ICP)"),
 ("sigma",     0.4, 0.6, 0.9, "lognormal sigma, account size spread", A, "Account sizes are skewed"),
 ("price",     100, 200, 400, "USD per manager seat per year", A, "No public pricing found (dossier section 7); memo's $25k-60k/yr is unverified and only a cross-check on the ACV line in the results, not an input"),
 ("exp",       0.0, 0.08, 0.25, "annual seat growth at renewal", A, "No data"),
 ("churn",     0.10, 0.20, 0.35, "annual logo churn at renewal", A, "Includes budget-line cuts (19% of firms cut DEI funding in 2025, https://www.hr-brew.com/stories/2025/12/04/2025-in-review-businesses-walked-a-fine-line-on-dei-as-the-government-ramped-up-threats-on-corporate-initiatives); product is positioned outside DEI"),
 ("p_fail",    0.30, 0.50, 0.70, "P(H1 value hypothesis fails)", A, "Dossier: no controlled ADHD-simulation trial; cognitive empathy d=0.08 (https://tmb.apaopen.org/pub/vr-improves-emotional-empathy-only); Nario-Redmond 2017 (https://pubmed.ncbi.nlm.nih.gov/28287757/)"),
 ("t_res",     10, 14, 22, "months, estimation-study readout", A, "First-year milestone is the study; readout lag assumed"),
 ("f_acq",     0.05, 0.15, 0.35, "x pilot signing rate after H1 failure", A, "Growth cap: residual referral-only sales"),
 ("f_conv",    0.30, 0.50, 0.80, "x conversion after H1 failure", A, "Growth cap"),
 ("f_churn",   1.3, 1.8, 2.5, "x churn after H1 failure", A, "Growth cap"),
 ("f_cost",    0.40, 0.60, 0.85, "fraction of fixed cost kept after H1 failure", A, "Cost cuts begin 3 months after readout"),
 ("cac",       8000, 18000, 40000, "USD fully loaded S&M per signed pilot", A, "No data; includes sales salary and travel"),
 ("sm_floor",  4000, 8000, 15000, "USD/month minimum S&M", A, "Tools, events, part-time BD"),
 ("fac_hours", 20, 40, 80, "facilitator hours per pilot", A, "Live debrief is part of the product (task brief)"),
 ("fac_rate",  60, 90, 140, "USD per facilitator hour", A, "No data"),
 ("fac_seat",  6, 20, 60, "USD facilitation per seat per year", A, "Annual debrief mostly productized and grouped"),
 ("fac_imp",   0.0, 0.10, 0.30, "annual facilitation cost reduction", A, "Productization"),
 ("hosting",   2, 5, 12, "USD hosting per seat per year", A, "Browser-first, no generative inference, no hardware"),
 ("cs",        0.04, 0.07, 0.12, "customer success, share of recurring revenue", A, "No data"),
 ("content",   0.03, 0.05, 0.10, "co-designer fees and licensed assets, share of revenue", A, "Dossier: lived-experience co-design required"),
 ("opex0",     30000, 45000, 70000, "USD/month R&D+G&A in 2027", A, "2-4 person lean team"),
 ("opex_g",    0.10, 0.25, 0.50, "annual growth of fixed R&D+G&A", A, "No data"),
 ("opex_pct",  0.15, 0.25, 0.35, "variable R&D+G&A, share of revenue", A, "No data"),
]
KEYS = [p[0] for p in PARAMS]


def draw():
    return {k: random.triangular(lo, hi, mo) for k, lo, mo, hi, *_ in PARAMS}


def poisson(lam):
    if lam <= 0:
        return 0
    if lam >= 30:
        return max(0, int(round(random.gauss(lam, math.sqrt(lam)))))
    lim, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= random.random()
        if p <= lim:
            return k
        k += 1


def trial(P):
    failed = random.random() < P["p_fail"]
    tres = P["t_res"]
    s = max(1, int(round(P["cycle"])) - 2)
    dur, lag = max(1, int(round(P["pilot_months"]))), max(1, int(round(P["lag"])))
    arr, crec, pr, pc, pil = ([0.0] * (H + 2) for _ in range(5))
    cum = 0
    fac_p = P["fac_hours"] * P["fac_rate"] / dur + P["pilot_seats"] * P["hosting"] / 12
    for t in range(s, H + 1):
        lam = P["r0"] * P["growth"] ** ((t - s) / 12) * max(0.0, 1 - cum / P["n_reach"])
        if failed and t >= tres:
            lam *= P["f_acq"]
        n = poisson(lam)
        cum += n
        pil[t] = n
        for _ in range(n):
            for k in range(dur):
                if t + k <= H:
                    pr[t + k] += P["pilot_price"] / dur
                    pc[t + k] += fac_p
            d = t + dur + lag
            if d > H:
                continue
            if random.random() >= P["conv"] * (P["f_conv"] if failed and d >= tres else 1.0):
                continue
            seats = P["seats"] * random.lognormvariate(0, P["sigma"])
            start, age = d, 0
            while start <= H:
                end = min(start + 12, H + 1)
                v = seats * P["price"]
                rate = seats * (P["hosting"] + P["fac_seat"] * (1 - P["fac_imp"]) ** age) / 12
                arr[start] += v; arr[end] -= v
                crec[start] += rate; crec[end] -= rate
                if start + 12 > H:
                    break
                c = min(0.9, P["churn"] * (P["f_churn"] if failed and start + 12 >= tres else 1.0))
                if random.random() < c:
                    break
                seats *= 1 + P["exp"]
                start += 12
                age += 1
    a = r = cash = low = 0.0
    arr_t, yrev, ycogs = [0.0] * (H + 1), [0.0] * 5, [0.0] * 5
    for t in range(1, H + 1):
        a += arr[t]; r += crec[t]
        arr_t[t] = a
        rec = a / 12
        rev = rec + pr[t]
        cogs = r + pc[t] + P["cs"] * rec + P["content"] * rev
        kf = P["f_cost"] if failed and t >= tres + 3 else 1.0
        opex = P["opex0"] * (1 + P["opex_g"]) ** ((t - 1) // 12) * kf + P["opex_pct"] * rev
        sm = max(P["sm_floor"] * kf, P["cac"] * pil[t])
        cash += rev - cogs - opex - sm
        low = min(low, cash)
        y = (t - 1) // 12
        yrev[y] += rev; ycogs[y] += cogs
    return failed, arr_t, yrev, ycogs, -low, cash, sum(pil[1:13])


def q(xs, p):  # nearest-rank percentile; xs sorted
    return xs[min(len(xs) - 1, max(0, math.ceil(p * len(xs)) - 1))]


def ranks(xs):
    idx = sorted(range(len(xs)), key=xs.__getitem__)
    r, i = [0.0] * len(xs), 0
    while i < len(xs):
        j = i
        while j + 1 < len(xs) and xs[idx[j + 1]] == xs[idx[i]]:
            j += 1
        for k in range(i, j + 1):
            r[idx[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def pearson(a, b):
    n = len(a); ma, mb = sum(a) / n, sum(b) / n
    sa = math.sqrt(sum((x - ma) ** 2 for x in a)); sb = math.sqrt(sum((y - mb) ** 2 for y in b))
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (sa * sb) if sa and sb else 0.0


def ym(t):
    return "m%d (%d-%02d)" % (t, 2027 + (t - 1) // 12, (t - 1) % 12 + 1)


def money(x):
    sg = "-" if x < 0 else ""
    x = abs(x)
    return sg + ("$%.2fM" % (x / 1e6) if x >= 1e6 else "$%dk" % round(x / 1e3))


def run(trials=TRIALS, seed=SEED):
    random.seed(seed)
    t0 = time.time()
    S = [dict() for _ in range(trials)]
    R = []
    for i in range(trials):
        P = draw()
        S[i] = P
        R.append(trial(P))
    return S, R, time.time() - t0


def report(S, R, secs, trials, seed):
    n = len(R)
    out = []
    w = out.append
    fail = [r[0] for r in R]
    arr = [r[1] for r in R]
    def trio(xs, f):
        s = sorted(xs); return "%s / %s / %s" % (f(q(s, .1)), f(q(s, .5)), f(q(s, .9)))
    w("Perspective Engine bottom-up Monte Carlo | trials=%d seed=%d horizon=%d months (2027-01..2031-12)" % (trials, seed, H))
    w("Model run time: %.1f s | inputs: %d, sourced numerically: %d, assumptions: %d" % (
        secs, len(PARAMS), sum(p[5].startswith("sourced") for p in PARAMS), sum(p[5] == A for p in PARAMS)))
    w("")
    w("ARR (annual contracts only), P10 / P50 / P90")
    for t in (12, 24, 36, 48, 60):
        w("  month %2d (Dec %d): %s" % (t, 2026 + t // 12, trio([a[t] for a in arr], money)))
    w("")
    w("Gross margin (pilots + recurring, after facilitation, hosting, CS, co-designer fees), P10 / P50 / P90")
    for y in range(5):
        w("  %d: %s" % (2027 + y, trio([(1 - r[3][y] / r[2][y]) if r[2][y] > 0 else 0.0 for r in R], lambda x: "%.0f%%" % (100 * x))))
    w("  P(year-5 gross margin >= 84%%, the memo's unverified figure) = %.1f%%" % (100 * sum((1 - r[3][4] / r[2][4]) >= 0.84 for r in R if r[2][4] > 0) / n))
    w("")
    m1 = sorted([next((t for t in range(1, H + 1) if a[t] >= 1e6), math.inf) for a in arr])
    def mo(x): return ym(x) if x < math.inf else ">m60"
    w("Months to $1M ARR (never within 60 months counts as >m60), P10 / P50 / P90: %s / %s / %s" % (mo(q(m1, .1)), mo(q(m1, .5)), mo(q(m1, .9))))
    w("  P(reach $1M ARR within 60 months) = %.1f%%; within 48 months = %.1f%%" % (
        100 * sum(x <= H for x in m1) / n, 100 * sum(x <= T48 for x in m1) / n))
    hit = [x for x in m1 if x <= H]
    if hit:
        w("  Among trials that reach it (n=%d): P10 / P50 / P90 = %s / %s / %s" % (len(hit), mo(q(hit, .1)), mo(q(hit, .5)), mo(q(hit, .9))))
    p5_any = sum(max(a[1:T48 + 1]) >= TARGET_ARR for a in arr) / n
    w("P(ARR >= $5M at any month <= 48) = %.1f%%  | at month 48 exactly = %.1f%% | at month 60 = %.1f%%" % (
        100 * p5_any, 100 * sum(a[T48] >= TARGET_ARR for a in arr) / n, 100 * sum(a[H] >= TARGET_ARR for a in arr) / n))
    w("P(H1 failure realised in trial) = %.1f%%" % (100 * sum(fail) / n))
    w("")
    w("Conditional on H1 outcome (ARR month 60 P10 / P50 / P90 ; P(ARR60 >= $1M) ; P($5M by m48))")
    for lab, flag in (("H1 holds", False), ("H1 fails", True)):
        sub = [r for r in R if r[0] == flag]
        m = max(1, len(sub))
        p1 = 100 * sum(r[1][H] >= 1e6 for r in sub) / m
        p5 = 100 * sum(max(r[1][1:T48 + 1]) >= TARGET_ARR for r in sub) / m
        w("  %-8s n=%d: %s ; %.1f%% ; %.1f%%" % (lab, len(sub), trio([r[1][H] for r in sub] or [0.0], money), p1, p5))
    w("")
    w("Cash (before any grants or financing), P10 / P50 / P90")
    w("  Peak cumulative funding need: %s" % trio([r[4] for r in R], money))
    w("  Cumulative cash at month 60 (negative = still burning): %s" % trio([r[5] for r in R], money))
    w("  Paid pilots signed in 2027 (year-1 milestone is 3): %s ; P(>=3) = %.1f%%" % (
        trio([r[6] for r in R], lambda x: "%d" % x), 100 * sum(r[6] >= 3 for r in R) / n))
    # unit economics, closed form from sampled inputs (H1 holds, no expansion, undiscounted)
    ue_pay, ue_ltv, acv = [], [], []
    for P in S:
        a_ = P["seats"] * math.exp(P["sigma"] ** 2 / 2) * P["price"]
        gp = a_ * (1 - P["cs"] - P["content"]) - P["seats"] * math.exp(P["sigma"] ** 2 / 2) * (P["hosting"] + P["fac_seat"])
        cac_acct = P["cac"] / P["conv"]
        acv.append(a_); ue_pay.append(12 * cac_acct / gp if gp > 0 else math.inf); ue_ltv.append(gp / P["churn"] / cac_acct)
    w("")
    w("Unit economics (closed form, H1 holds, no expansion, pilot fee ignored), P10 / P50 / P90")
    w("  Mean ACV per annual account: %s" % trio(acv, money))
    w("  CAC payback on gross profit, months (CAC / conversion): %s" % trio(ue_pay, lambda x: "%.0f" % x if x < math.inf else "inf"))
    w("  LTV/CAC (gross profit / churn / CAC per annual account): %s" % trio(ue_ltv, lambda x: "%.1f" % x))
    # sensitivity
    tgt = ranks([a[H] for a in arr])
    sens = []
    for k in KEYS:
        sens.append((abs(pearson(tgt, ranks([P[k] for P in S]))), pearson(tgt, ranks([P[k] for P in S])), k))
    sens.append((abs(pearson(tgt, ranks([1.0 if f else 0.0 for f in fail]))), pearson(tgt, ranks([1.0 if f else 0.0 for f in fail])), "h1_failed (realised)"))
    sens.sort(reverse=True)
    w("")
    w("Top drivers of month-60 ARR (Spearman rank correlation)")
    for _, rho, k in sens[:8]:
        w("  %-22s %+.2f" % (k, rho))
    return out, [k for _, _, k in sens[:3]], sorted(m1), p5_any


def write_md(path, lines, S, R, secs, top3, m1, p5_any, trials, seed):
    n = len(R); arr60 = sorted(r[1][H] for r in R)
    gm5 = sorted((1 - r[3][4] / r[2][4]) if r[2][4] > 0 else 0.0 for r in R)
    p50m = q(m1, .5)
    summ = ("Bottom-up monthly Monte Carlo (%d trials, seed %d, 2027-2031) of the browser-first manager-accommodation program: "
            "paid pilots, then annual per-manager seats; no hardware, no generative inference. Year-5 (Dec 2031) ARR P10/P50/P90: %s / %s / %s. "
            "Year-5 gross margin P10/P50/P90: %.0f%% / %.0f%% / %.0f%%. Median months to $1M ARR: %s (P(reach within 60 months) = %.0f%%). "
            "P(ARR >= $5M by month 48) = %.1f%%. P(H1 fails) is drawn per trial and caps growth after the study readout. "
            "None of the %d inputs has a public numeric source (dossier found no pricing or buyer data); all are labeled assumptions to replace with interview data. "
            "Biggest drivers: %s.") % (
        trials, seed, money(q(arr60, .1)), money(q(arr60, .5)), money(q(arr60, .9)),
        100 * q(gm5, .1), 100 * q(gm5, .5), 100 * q(gm5, .9),
        ym(p50m) if p50m < math.inf else "not reached (>m60)", 100 * sum(x <= H for x in m1) / n, 100 * p5_any,
        len(PARAMS), ", ".join(top3))
    rows = "\n".join("| `%s` | %g | %g | %g | %s | %s | %s |" % (k, lo, mo, hi, u, lab, b) for k, lo, mo, hi, u, lab, b in PARAMS)
    md = """# Perspective Engine: Bottom-up Financial Model (V10)

## Summary
%s

Regenerate (numbers below are printed by the script, never hand-typed): `python3 perspective-engine/finance/model.py --write-md perspective-engine/finance/model.md`

## Results (verbatim script output)
```
%s
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
%s

## Limits and what to do next
- No input is numerically sourced. The dossier states that no public pricing, buyer or conversion data were found (sections 7 and "Verdict" table), and the ICP says all cycle lengths and prices are hypotheses. The unverified $14.8B TAM, 72%% success figure and CPT reimbursement are not used. Treat all output percentiles as a structured statement of uncertainty, not a forecast.
- Replace inputs, starting with the drivers listed in the results, using data from the 10-20 buyer interviews and the three paid pilots: price per seat, seats per account, conversion, churn, then CAC and sales cycle. Re-run with the same seed to see the effect.
- Not modelled: grants (SBIR/NIMH), reimbursement, equity financing, taxes, working capital, multi-year contracts, and channel partners (EAP and consultancy vendors, ICP section 4). Peak funding need is before any financing.
- Inputs are independent. In reality price, seats and conversion are correlated (larger accounts negotiate discounts), so the tails are probably too wide in one direction and too narrow in another.
- The H1 failure treatment is a regime switch, not a learning model; partial success (effect on behaviour but not attitudes) would sit between the two conditional rows.
""" % (summ, "\n".join(lines), rows)
    with open(path, "w") as f:
        f.write(md)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--trials", type=int, default=TRIALS)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--write-md", default=None)
    a = ap.parse_args()
    S, R, secs = run(a.trials, a.seed)
    lines, top3, m1, p5 = report(S, R, secs, a.trials, a.seed)
    print("\n".join(lines))
    if a.write_md:
        write_md(a.write_md, lines, S, R, secs, top3, m1, p5, a.trials, a.seed)
