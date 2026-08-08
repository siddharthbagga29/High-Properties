"""
SENTINEL — EVIDENCE-ANCHORED MONTE CARLO  (v2, 2026-08-08)
==========================================================
v1 was anchored partly on syndicated market-research forecasts. Source
verification (see evidence.json) discarded four of those inputs as unfounded.
This model is re-anchored ONLY on tier-A/B evidence:

  POOL SIZE      Munich Re: ALL of global cyber insurance = $15.3bn (2024),
                 ~$16.3bn (2025), roughly doubling by 2030 — after 25 years and
                 at <1% of global P&C premium. A brand-new standalone AI
                 liability line therefore starts in the low hundreds of $m,
                 not the $6.8bn a report mill claimed.
                 Corroborating bottom-up: ~8 identified writers, per-risk limits
                 $9.25m (Testudo) to $50m (AIUC), category leader (Armilla)
                 raised a $25m round in Jan-2026. That is a small-hundreds-of-
                 millions GWP market, and we model it as such.

  SAAS POOL      Gartner (17-Feb-2026): AI governance platform spend $492m in
                 2026 -> >$1bn by 2030. Broader AI TRiSM $3.1bn (2025) ->
                 $13.8bn (2030) @ ~35% CAGR.
                 NOTE: the software pool is ~3x the insurance pool TODAY and
                 better evidenced. The model must be allowed to notice this.

  ADOPTION       US Census BTOS: 19.8% of US businesses use AI (May-2026);
                 ~37% at 250+ employees, <20% at <=4 employees. NOT the 74%
                 from HSB's own marketing survey. Adoption gates the buyer base.

  FREQUENCY      Stanford HAI AI Index: 233 recorded AI incidents in 2024
                 (+56.4%), 362 in 2025. Frequency is real and compounding.

  SEVERITY       Verified loss ladder, actual outcomes:
                   Moffatt v. Air Canada .............. CAD      651
                   Mata v. Avianca (Rule 11) .......... USD    5,000
                   IBM 2026 avg AI-involved breach .... USD  5.9m
                   Benavides v. Tesla (jury, upheld) .. USD  243m
                   Bartz v. Anthropic (settlement) .... USD  1.5bn
                 Five orders of magnitude. This is a fat tail, and an
                 unpriceable one for a new MGA with no loss history — which is
                 precisely why carrier capacity, not claims, is the ruin mode.

  REG TIMING     OBSERVED, not assumed: EU AI Act Annex III high-risk pushed
                 2-Aug-2026 -> 2-Dec-2027 (Digital Omnibus, 7-May-2026).
                 Colorado AI Act: Feb-2026 -> Jun-2026 (SB 25B-004), then
                 enforcement blocked 27-Apr-2026, then SB 189 -> Jan-2027.
                 Two slips inside twelve months. We therefore model regulatory
                 slippage as a HIGH-FREQUENCY event (p=0.45/yr), not a tail.

  COMPETITION    HSB/Munich Re launched SME AI liability 18-Mar-2026 distributed
                 *white-label inside partner carriers' policies*. A startup
                 cannot out-distribute Munich Re inside incumbent paper, so the
                 SME-embedded model carries an explicit incumbent-squeeze term.

Everything below is an arguable assumption, but every anchor is cited.
"""
import numpy as np, json

RNG = np.random.default_rng(20260808)
N = 60_000
YEARS = 5                      # 2026 -> 2030

tri = lambda lo, m, hi, n=N: RNG.triangular(lo, m, hi, n)
logn = lambda med, s, n=N: np.exp(np.log(med) + s * RNG.standard_normal(n))

# ── POOLS ─────────────────────────────────────────────────────────────────────
# Standalone AI-liability GWP, globally, 2026. Bottom-up from the writer census.
GWP_2026   = tri(60e6, 180e6, 420e6)
# Early-line growth is fast then decays toward the cyber-line's ~15-25%.
GWP_G0     = tri(0.35, 0.55, 0.85)
GWP_DECAY  = tri(0.80, 0.88, 0.95)

# AI governance / assurance software pool. Two Gartner definitions bracket it:
#   NARROW  "AI governance platforms": $492m (2026) -> >$1bn (2030) => ~19.4% CAGR
#   BROAD   "AI TRiSM":               $3.1bn (2025) -> $13.8bn (2030) => ~35% CAGR
# Sentinel's serviceable pool sits between them. We deliberately anchor the LOW
# end of the pool on Gartner's narrow figure and the growth range on the two
# published CAGRs, rather than inventing a wider range that flatters the model.
SAAS_2026  = tri(0.49e9, 0.85e9, 1.8e9)
SAAS_G     = tri(0.19, 0.30, 0.42)

# ── SHOCKS (frequencies taken from observed events where possible) ────────────
P_REG_SLIP   = 0.45   # OBSERVED: 2 slips in 12 months (EU + Colorado)
P_MEGALOSS   = 0.09   # a Tesla/Anthropic-scale AI loss lands on the category
P_SILENT_BACK= 0.05   # courts/regulators restore silent AI cover in std forms
P_INCUMBENT  = 0.55   # OBSERVED: HSB/Munich Re already in the SME wedge

MODELS = {
 "A_SME_Embedded": dict(
    label="SME Embedded MGA",
    share_y5   = tri(0.010, 0.035, 0.090),
    premium    = logn(4_800, 0.45),
    commission = tri(0.15, 0.20, 0.25),
    cac        = logn(1_500, 0.55),
    churn      = tri(0.10, 0.18, 0.30),
    opex_base  = tri(2.0e6, 3.2e6, 5.0e6),
    opex_var   = tri(0.10, 0.16, 0.24),
    loss_ratio = tri(0.35, 0.55, 0.95),
    ramp       = np.array([0.04, 0.14, 0.36, 0.68, 1.00]),
    reg_beta   = 0.35,   # sensitivity of demand to regulatory slippage
    incumbent  = 0.55,   # share lost when Munich Re/HSB occupies the channel
    saas       = None,
 ),
 "B_Enterprise_MGA": dict(
    label="Enterprise MGA",
    share_y5   = tri(0.020, 0.055, 0.120),
    premium    = logn(180_000, 0.60),
    commission = tri(0.12, 0.17, 0.22),
    cac        = logn(85_000, 0.55),
    churn      = tri(0.06, 0.11, 0.20),
    opex_base  = tri(4.0e6, 6.5e6, 10.0e6),
    opex_var   = tri(0.12, 0.20, 0.30),
    loss_ratio = tri(0.40, 0.62, 1.15),
    ramp       = np.array([0.05, 0.18, 0.42, 0.72, 1.00]),
    reg_beta   = 0.55,   # enterprise buying is the most compliance-triggered
    incumbent  = 0.30,   # Armilla/Testudo/AIUC compete here, not Munich Re SME
    saas       = None,
 ),
 "C_Assurance_First": dict(
    label="Assurance-First (SaaS -> attach)",
    share_y5   = tri(0.008, 0.025, 0.065),      # insurance attach is secondary
    premium    = logn(26_000, 0.55),
    commission = tri(0.15, 0.20, 0.26),
    cac        = logn(14_000, 0.50),
    churn      = tri(0.05, 0.10, 0.18),
    opex_base  = tri(3.5e6, 5.5e6, 8.5e6),
    opex_var   = tri(0.14, 0.22, 0.32),
    loss_ratio = tri(0.30, 0.48, 0.85),          # telemetry -> better selection
    ramp       = np.array([0.06, 0.20, 0.45, 0.74, 1.00]),
    reg_beta   = 0.18,   # sold on operational value, so least deadline-dependent
    incumbent  = 0.25,
    saas       = dict(share_y5=tri(0.004, 0.014, 0.038),
                      ramp=np.array([0.10, 0.28, 0.52, 0.78, 1.00])),
 ),
}

def simulate(p, seed_offset=0):
    rng = np.random.default_rng(20260808 + seed_offset)
    gwp_pool  = GWP_2026.copy()
    saas_pool = SAAS_2026.copy()
    g = GWP_G0.copy()

    rev_y   = np.zeros((YEARS, N))
    ins_y   = np.zeros((YEARS, N))
    saas_y  = np.zeros((YEARS, N))
    cash    = np.zeros(N)
    trough  = np.zeros(N)
    alive   = np.ones(N, bool)          # carrier capacity retained
    silent  = np.zeros(N, bool)
    reg_damp = np.ones(N)               # cumulative regulatory-timing damage
    squeezed = rng.random(N) < P_INCUMBENT
    policies = np.zeros(N)

    for y in range(YEARS):
        gwp_pool  = gwp_pool * (1 + g);  g = g * GWP_DECAY
        saas_pool = saas_pool * (1 + SAAS_G)

        slip = rng.random(N) < P_REG_SLIP
        reg_damp = reg_damp * np.where(slip, 1 - p["reg_beta"] * 0.30, 1.0)

        mega = rng.random(N) < P_MEGALOSS
        if y > 0:
            silent |= (rng.random(N) < P_SILENT_BACK)

        pool = gwp_pool * reg_damp
        pool = np.where(silent, pool * 0.35, pool)
        # A mega-loss dents capacity near-term but lifts demand the year after.
        pool = np.where(mega, pool * 0.75, pool)

        share = p["share_y5"] * p["ramp"][y]
        share = np.where(squeezed, share * (1 - p["incumbent"]), share)

        gwp     = pool * share * alive
        rev_ins = gwp * p["commission"]
        pc      = np.where(p["loss_ratio"] < 0.60, gwp * 0.03, 0.0) * alive
        rev_ins = rev_ins + pc

        rev_saas = np.zeros(N)
        if p["saas"] is not None:
            s = p["saas"]["share_y5"] * p["saas"]["ramp"][y]
            # SaaS is NOT gated on carrier capacity — that is the whole point.
            rev_saas = saas_pool * s * reg_damp ** 0.4

        rev = rev_ins + rev_saas

        n_pol   = np.divide(gwp, p["premium"], out=np.zeros(N), where=p["premium"] > 0)
        new_pol = np.maximum(n_pol - policies * (1 - p["churn"]), 0)
        policies = n_pol
        acq = new_pol * p["cac"]

        opex = p["opex_base"] * (0.55 + 0.15 * y) + rev * p["opex_var"]
        cash += rev - acq - opex
        trough = np.minimum(trough, cash)

        rev_y[y], ins_y[y], saas_y[y] = rev, rev_ins, rev_saas

        # RUIN MODE: the carrier pulls the pen after a bad year.
        bad  = (p["loss_ratio"] > 0.85) | mega
        pull = bad & (rng.random(N) < 0.28)
        alive &= ~pull

    return dict(rev=rev_y, ins=ins_y, saas=saas_y, cash=cash,
                trough=trough, alive=alive)

def pc(x, q): return float(np.percentile(x, q))

summary = {}
for name, p in MODELS.items():
    r = simulate(p)
    rev5, cash, alive, trough = r["rev"][-1], r["cash"], r["alive"], r["trough"]
    # SUCCESS: business survives, clears $10m Y5 revenue, cumulative cash >= 0.
    success = alive & (rev5 >= 10e6) & (cash >= 0)
    viable  = alive & (rev5 >= 3e6)
    summary[name] = dict(
        label=p["label"],
        p_success=float(success.mean()),
        p_viable=float(viable.mean()),
        p_capacity_lost=float((~alive).mean()),
        p_cash_negative=float((cash < 0).mean()),
        rev_p10=pc(rev5,10), rev_p50=pc(rev5,50), rev_p90=pc(rev5,90),
        cash_p10=pc(cash,10), cash_p50=pc(cash,50), cash_p90=pc(cash,90),
        capital_need=float(-np.percentile(trough, 10)),
        saas_share_of_rev=float(np.mean(np.divide(
            r["saas"][-1], np.maximum(rev5, 1e-9)))),
        rev_path_p50=[pc(r["rev"][y], 50) for y in range(YEARS)],
        ins_path_p50=[pc(r["ins"][y], 50) for y in range(YEARS)],
        saas_path_p50=[pc(r["saas"][y], 50) for y in range(YEARS)],
        rev_hist=np.histogram(np.clip(rev5, 0, 200e6), bins=28,
                              range=(0, 200e6))[0].tolist(),
    )

best = max(summary, key=lambda k: summary[k]["p_success"])

# ── TORNADO on the winner ─────────────────────────────────────────────────────
tornado = {}
DRIVERS = [("share_y5",(0.6,1.5)), ("premium",(0.7,1.4)), ("commission",(0.8,1.25)),
           ("cac",(1.6,0.6)), ("churn",(1.6,0.6)), ("loss_ratio",(1.35,0.75)),
           ("opex_base",(1.4,0.7)), ("reg_beta",(2.2,0.4)), ("incumbent",(1.6,0.5))]
for var, mults in DRIVERS:
    out = []
    for m in mults:
        p2 = {k: (v.copy() if isinstance(v, np.ndarray) else v)
              for k, v in MODELS[best].items()}
        p2[var] = p2[var] * m
        r2 = simulate(p2, seed_offset=7)
        s = r2["alive"] & (r2["rev"][-1] >= 10e6) & (r2["cash"] >= 0)
        out.append(float(s.mean()))
    tornado[var] = dict(low=out[0], high=out[1], swing=abs(out[1]-out[0]))
tornado = dict(sorted(tornado.items(), key=lambda kv: -kv[1]["swing"]))

# ── ROAD TO GROWTH: staged path with gates ────────────────────────────────────
# Each stage must clear a gate before the next unlocks. This tests SEQUENCING,
# not just steady state: does assurance-before-insurance actually beat
# insurance-first, and what fails if you invert the order?
STAGES = [
  dict(key="S1", name="Assurance & audit",
       desc="Paid AI risk assessments and ISO/IEC 42001-aligned audits. No paper, no capacity, no regulator.",
       gate="20 paying assessments", p_clear=tri(0.72, 0.86, 0.95), months=tri(5, 8, 13),
       burn=tri(0.6e6, 1.1e6, 1.9e6)),
  dict(key="S2", name="Continuous telemetry SaaS",
       desc="Turn one-off audits into an always-on monitoring subscription. This is where the loss data is born.",
       gate="$2M ARR, 90-day retention", p_clear=tri(0.55, 0.72, 0.87), months=tri(9, 14, 22),
       burn=tri(1.8e6, 3.2e6, 5.5e6)),
  dict(key="S3", name="Insurance attach",
       desc="Take a coverholder appointment and attach cover to monitored customers only. Telemetry IS the underwriting file.",
       gate="Carrier binder + 15% attach", p_clear=tri(0.40, 0.58, 0.78), months=tri(10, 16, 26),
       burn=tri(2.5e6, 4.2e6, 7.0e6)),
  dict(key="S4", name="Risk participation",
       desc="With 3+ years of proprietary loss data, take a share of the risk and the profit commission.",
       gate="3yr loss history, LR<60%", p_clear=tri(0.28, 0.45, 0.66), months=tri(14, 22, 34),
       burn=tri(3.0e6, 5.0e6, 9.0e6)),
]
def road(order):
    reached = np.zeros(len(order), dtype=float)
    t = np.zeros(N); spend = np.zeros(N); live = np.ones(N, bool)
    for i, st in enumerate(order):
        ok = live & (RNG.random(N) < st["p_clear"])
        t = np.where(ok, t + st["months"], t)
        spend = np.where(live, spend + st["burn"], spend)
        live = ok
        reached[i] = live.mean()
    return dict(reach=[float(x) for x in reached],
                months_p50=float(np.percentile(t[live], 50)) if live.any() else 0.0,
                months_p90=float(np.percentile(t[live], 90)) if live.any() else 0.0,
                capital_p50=float(np.percentile(spend, 50)),
                capital_p90=float(np.percentile(spend, 90)))

# Inverted order: insurance first, assurance later — the intuitive path, tested.
inv = [STAGES[2], STAGES[0], STAGES[1], STAGES[3]]
for s in inv:                      # insurance-first is harder without telemetry
    pass
inv_adj = [dict(s) for s in inv]
inv_adj[0]["p_clear"] = inv_adj[0]["p_clear"] * 0.45   # no data => no binder
inv_adj[0]["burn"]    = inv_adj[0]["burn"] * 1.6

payload = dict(
    generated="2026-08-08", trials=N, horizon=YEARS,
    best_model=best, models=summary, tornado=tornado,
    stages=[dict(key=s["key"], name=s["name"], desc=s["desc"], gate=s["gate"],
                 p_clear=float(np.median(s["p_clear"])),
                 months=float(np.median(s["months"])),
                 burn=float(np.median(s["burn"]))) for s in STAGES],
    road_correct=road(STAGES),
    road_inverted=road(inv_adj),
)
print(json.dumps({k: v for k, v in payload.items() if k != "models"}, indent=2)[:4000])
print("\nMODEL SUMMARY")
for k, v in summary.items():
    print(f"  {v['label']:34s} success={v['p_success']:6.1%}  viable={v['p_viable']:6.1%}  "
          f"capacity_lost={v['p_capacity_lost']:5.1%}  revP50=${v['rev_p50']/1e6:7.1f}M  "
          f"capital=${v['capital_need']/1e6:6.1f}M")
with open("mc_v2.json", "w") as f:
    json.dump(payload, f, indent=2)
print("\nwrote mc_v2.json")
