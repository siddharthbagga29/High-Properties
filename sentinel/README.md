# Sentinel — AI Liability Telemetry & Coverage

A single self-contained page for an AI assurance and liability business.
Research was verified first, the models were re-anchored on what survived, and
the site was built from those outputs. Nothing on the page is hand-typed data.

## Deploy

`index.html` has **no external dependencies** — no CDN, no web fonts, no images,
no runtime network calls. Drag this folder onto <https://app.netlify.com/drop>
and it is live. It also opens correctly straight from disk (`file://`).

## Layout

| Path | What it is |
|---|---|
| `index.html` | The built page. 344 KB, self-contained. |
| `src/src.html` | Markup with `/*__CSS__*/`, `/*__APP__*/` and JSON placeholders. |
| `src/app.js` | All behavior: reveal, WebGL, neural core, charts, pricing, form. |
| `src/tw.css`, `src/tailwind.config.js` | Tailwind source and theme. |
| `src/build.js` | Runs Tailwind, inlines Chart.js + app + JSON. `node src/build.js`. |
| `evidence.json` | 29 claims, graded A/B/C/D, each with sources and a plain-English gloss. |
| `montecarlo_v2.py` → `mc_v2.json` | Strategy viability. 60,000 trials, seed 20260808. |
| `pricing.py` → `pricing.json` | Actuarial pricing. 400,000 simulations, seed 4711. |
| `backtest.js` | 70 headless assertions. `node backtest.js` (needs playwright-core). |

Full rebuild:

```
python3 montecarlo_v2.py && python3 pricing.py && node src/build.js && node backtest.js
```

## How the pricing is derived

Standard excess-of-loss ratemaking, not a markup on a competitor's rate card:

1. **Frequency** — Poisson, base 6% per insured per year, modified by sector
   (0.9×–2.4×), revenue band, and whether the system is under telemetry.
2. **Severity** — three-component lognormal mixture, calibrated so simulated
   quantiles reproduce the five adjudicated outcomes on the page. Verified:
   p50 $82k · p90 $1.3M · p99 $32M · p99.9 $336M · p99.99 $1.2B.
3. **Layer** — Monte Carlo the aggregate annual loss ceded to (limit xs attachment).
4. **Loading** — 28% expense, 10% profit, plus a risk load proportional to the
   layer's coefficient of variation. A new line with no credible history has to
   charge for parameter uncertainty.

Layers whose rate on line exceeds 4% are **declined rather than quoted** — at
that burn rate the policy is a payment plan, not a risk transfer.

**Competitor rates are labeled SIMULATED.** Armilla, Testudo, AIUC and HSB write
on Lloyd's and surplus-lines paper, where rates are not publicly filed. Limits
and paper are verified from trade press; the rates are inferred from published
cyber rate-on-line ranges and marked as such on the page.

## Evidence grading

- **A** — court docket, regulator, statistical agency, standards body
- **B** — named-company disclosure or reputable trade / business press
- **C** — vendor or self-interested survey, shown only with the conflict disclosed
- **D** — syndicated report-mill projection with no traceable basis

Tier D claims stay in the ledger, struck through, so a reader can see what was
rejected and why. Four were discarded, including the widely-quoted "$6.8B in
2025 → $34.2B by 2034" AI liability market figure, which fails a sanity check
against Munich Re's measurement of the *entire* global cyber market at $15.3B.

## Guarantees asserted by the backtest

- **Contrast** — every visible text node is measured against its *composited*
  background (each ancestor alpha layered onto the page base) and must clear
  WCAG AA. Current floor: 5.23:1 desktop, 5.36:1 mobile.
- **Scroll mapping** — the neural core's reported progress is the raw scroll
  fraction, not an eased value, so the narrative lands on exactly the depth it
  claims. Verified monotonic 3% → 100% with all five failure modes firing in order.
- **No-JS** — `.reveal` only hides under `html.js-ready`; a 1500 ms safety net is
  armed before observer setup. 309k characters remain readable with JS disabled.
- **No dead controls** — every slider, select, button and form field is asserted
  to change something.
- All 122 external links are https + `_blank` + `noopener noreferrer`.

## Not legal, financial, or insurance advice

This is a strategy and research artifact. It is not an offer of insurance, a
solicitation, financial advice, or a securities offering. Premiums shown are
modeled technical premiums, not quotes, and are not backed by bound capacity.
Case summaries describe public court records and are provided for analysis only.

## index2.html — the hardened build

`index2.html` is the production build; `index.html` is kept as the prior staging
build for comparison.

| | index.html | index2.html |
|---|---|---|
| CSP | none | `default-src 'none'` + SHA-256 hashes, no `unsafe-inline` |
| HTTP headers | none | `_headers`: frame-ancestors, HSTS, nosniff, Permissions-Policy |
| Global error handling | none | `error` + `unhandledrejection`, per-feature guards |
| Chart.js | executed at load | inert `text/plain`, injected on demand |
| Charts built | 5 at load | lazily, per section |
| Below-fold DOM | built at load | `deferBuild` — IO-near or idle, whichever first |
| Animation loops | boot, 60fps, always on | after boot, 30fps, idle-paused |
| Idle GPU | continuous | **0 draws** |
| innerHTML | 8 sites | **0** — every node built with textContent |
| Globals | `__MC__ __EV__ __PR__ __GL_OK__ __CORE_OK__` | one frozen `sentinelDiagnostics` |
| Mobile nav | 2 of 6 destinations | disclosure menu, all 7, Escape + focus return |
| Stat pairs | `div`+`div` | `dl`/`dt`/`dd` |
| Assembly indicator | visual only | `role="progressbar"` + `aria-live` announcements |
| Form errors | one banner | banner + per-field `aria-invalid`, cleared on fix |
| Chart failure | empty box | visible fallback pointing at the data |
| WebGL context loss | permanent death | full rebuild on `webglcontextrestored` |
| Shader objects | retained for page life | detached and deleted after link |

### Measured

| Metric | index.html | index2.html |
|---|---|---|
| CLS | 0.0000 | 0.0000 |
| FCP | 292 ms | ~300 ms |
| DOMContentLoaded | 813 ms | ~250 ms |
| Total blocking time | 2,487 ms | ~510 ms |
| Longest task | 391 ms | ~145 ms |
| **ScriptDuration (CDP, 3.5 s)** | — | **66 ms** |
| JS heap at boot | 4.2 MB | 1.7 MB |
| Idle GPU draws | continuous | 0 |
| Functional checks | 70 | **98** |

TBT here is measured under headless swiftshader, where canvas rasterization runs
on the CPU. CDP attribution over the same window shows **66 ms ScriptDuration**
against **1,710 ms of raster/paint** — that portion is GPU work on real hardware
and never reaches a user's main thread.

### A note on the background render scale

The coverage-lattice shader evaluates ~15 noise octaves per pixel. It is
decorative, low-frequency, and sits behind glass panels, so it renders at 0.62×
and upscales. Visually indistinguishable, roughly 2.6× cheaper on every GPU.

### Reproduce

```
node src/build.js     # Tailwind, inline, compute CSP hashes, emit _headers
node backtest.js      # 98 functional assertions
node audit.js         # CWV, CLS, idle GPU, leak probe, CSP, accessibility
```

### Deploying

Drop this folder on Netlify or Cloudflare Pages — both read `_headers`. Rename
`index2.html` to `index.html` to serve it at the root. `frame-ancestors` only
works as a real header, which is why it ships there rather than in the meta tag.
