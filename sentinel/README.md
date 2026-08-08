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
| `index.html`, `index2.html` | The built page, 367 KB, self-contained. Byte-identical by construction. |
| `_headers` | Netlify / Cloudflare Pages security headers. |
| `audit.js` | Core Web Vitals, CLS, idle GPU, leak probe, CSP. `node audit.js`. |
| `src/src.html` | Markup with `/*__CSS__*/`, `/*__APP__*/` and JSON placeholders. |
| `src/app.js` | All behavior: reveal, WebGL, neural core, charts, pricing, form. |
| `src/tw.css`, `src/tailwind.config.js` | Tailwind source and theme. |
| `src/build.js` | Runs Tailwind, inlines Chart.js + app + JSON. `node src/build.js`. |
| `evidence.json` | 29 claims, graded A/B/C/D, each with sources and a plain-English gloss. |
| `montecarlo_v2.py` → `mc_v2.json` | Strategy viability. 60,000 trials, seed 20260808. |
| `pricing.py` → `pricing.json` | Actuarial pricing. 400,000 simulations, seed 4711. |
| `backtest.js` | 115 headless assertions. `node backtest.js` (needs playwright-core). |

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

## The build

`index.html` and `index2.html` are **byte-identical**, written from the same
bytes in one build step so they can never diverge. Hosts serve `index.html` at
the root; `index2.html` exists because that name was already in circulation.

## The pinned figure

The core section assembles a **humanoid robot from particles** as you scroll:
head with antenna and visor band, shoulder pauldrons, a closed chest plate,
chest core, two arms with elbows and hands, pelvis, two legs with knee joints
and feet. 247 nodes, 217 bones. Particles fly in from scattered origins and lock
into limbs in waves; the figure is complete by 78% depth.

Five failure modes are mounted on the body part each one is actually about:

| Body part | Failure mode | Cost |
|---|---|---|
| Eye | Hallucination — it sees what is not there | $5,000 + sanctions |
| Mouth | Misrepresentation — what it says binds you | Company held bound |
| Hand | Disparate impact — it sorts people | Nationwide collective |
| Foot | Physical control — it moves in the world | $243,000,000 |
| Chest core | Training data — what it is made of | $1,500,000,000 |

The copy panel sits over the torso, narrower and shorter than the figure, and
shows **one failure at a time**. Geometry is authored y-up and flipped once at
draw time; sizing is solved from the figure's own extents so a narrow screen
gets a properly proportioned figure with the arms tucked in.

The backtest samples the canvas in five bands and requires ink in the head, both
arms and the legs — a NaN in any coordinate term collapses the figure to nothing
while the chest bloom still paints, so "the canvas has pixels" is not enough.

## Scrolling: how the lag was actually fixed

Three rounds of frame timing during real wheel gestures, at Retina resolution:

| Configuration | p50 frame | Effective |
|---|---|---|
| Animated fullscreen canvas | 100 ms | 10 fps |
| Shader cut 15 → 3 octaves, 6 fps cap | 33 ms | 30 fps |
| Canvas static, still in the DOM | 33 ms | 30 fps |
| **Canvas → cached background image** | **17 ms** | **60 fps** |
| No backdrop at all | 17 ms | 60 fps |

The decisive row is the fourth. A `<canvas>` element sits in the compositing
path and is re-rastered as the page scrolls above it **even when its pixels
never change**. A plain image layer is cached by the compositor and costs
nothing. So the shader now runs exactly once into a detached canvas at boot, and
its output is handed to a div as a background image. The visual is identical —
it *is* the shader's output — and the scroll cost is zero.

Two things that were **not** the cause, and were measured rather than assumed:
`backdrop-filter` on 31 panels (disabling it changed nothing) and the canvas
size (shrinking it changed nothing).

A JS smooth-scroll library was also tried and removed. Native scrolling is
driven by the compositor thread and stays smooth when the main thread is busy;
any JS scroll library moves scrolling onto the main thread, where it competes
with canvas work. Measured inside the pinned section: **Lenis ON 30 fps, Lenis
OFF 60 fps.**

## Frame budget

- **Scroll-linked robot** — native refresh rate, never capped. Glows are
  pre-baked sprites (a `createRadialGradient` per node per frame cost 30 fps);
  edges are batched into five paths instead of ~217 stroke calls; the backing
  store is capped at 1.5× rather than 2×.
- **Backdrop** — rendered once, then a cached image.
- **Idle** — nothing. Zero rAF, zero GPU, measured over a clean sample.

## The hardened build

`index.html` **is** the hardened build. There is deliberately only one HTML file:
every static host serves `index.html` at the root, so shipping the good build
under any other name guarantees the stale one gets deployed instead. The prior
staging build is in git history, not in this folder.

| | Original staging build | Current build |
|---|---|---|
| CSP | none | `default-src 'none'` + SHA-256 hashes, no `unsafe-inline` |
| HTTP headers | none | `_headers`: frame-ancestors, HSTS, nosniff, Permissions-Policy |
| Global error handling | none | `error` + `unhandledrejection`, per-feature guards |
| Chart.js | executed at load | inert `text/plain`, injected on demand |
| Charts built | 5 at load | lazily, per section |
| Below-fold DOM | built at load | `deferBuild` — IO-near or idle, whichever first |
| Animation loops | boot, 60fps, always on, two competing rAF loops | one shared ticker; scroll-linked at native rate, ambient dual-rate, idle-paused |
| Scrolling | native | native (a JS scroll library was tried and measured out) |
| Backdrop | animated canvas, 15 octaves/px | rendered once, cached as an image |
| Scroll frame rate | **10 fps** | **60 fps** |
| Pinned figure | concentric rings (read as an atom) | humanoid robot, 247 particles, failures mounted per body part |
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

| Metric | Original | Current |
|---|---|---|
| CLS | 0.0000 | 0.0000 |
| FCP | 292 ms | ~300 ms |
| DOMContentLoaded | 813 ms | ~250 ms |
| Total blocking time | 2,487 ms | **138 ms** |
| Longest task | 391 ms | 121 ms |
| **ScriptDuration (CDP, 3.5 s)** | — | **66 ms** |
| JS heap at boot | 4.2 MB | 1.7 MB |
| Idle GPU draws | continuous | 0 |
| Functional checks | 70 | **115** |

TBT is now inside Google's "good" threshold even under headless swiftshader,
where canvas rasterization runs on the CPU.

### How the scroll lag was found

Frame timing during a real wheel gesture, isolating one layer at a time:

| Configuration | p50 frame | Effective |
|---|---|---|
| As shipped (before) | 100 ms | 10 fps |
| `backdrop-filter` disabled | 100 ms | 10 fps — not the cause |
| Background canvas hidden | 17 ms | **59 fps** — the cause |
| Background visible but never repainted | 17 ms | 60 fps |

The last row is the useful one: a **static** fullscreen canvas composites for
free. Every **repaint** costs ~33 ms in software, and on a real GPU forces all
31 `backdrop-filter` panels to re-blur because their backdrop changed. So the
ambient layer now runs at 6 fps while scrolling and 20 fps at rest — during a
scroll it is effectively a still image, which is what returns the page to 60.

### A note on the background shader

It evaluated ~15 noise octaves per pixel. The domain warp is now two sines
instead of two fbm calls and the tear field uses three octaves instead of five —
three total, down from fifteen — rendered at 0.34× and upscaled. Behind glass
at this blur the difference is not visible; the cost is roughly 8× lower.

### Reproduce

```
node src/build.js     # Tailwind, inline, compute CSP hashes, emit _headers
node backtest.js      # 98 functional assertions
node audit.js         # CWV, CLS, idle GPU, leak probe, CSP, accessibility
```

## The pinned figure

The core section assembles a **robot** — head, antenna, eyes, torso, chest core,
two arms, two legs — from scattered particles as you scroll. Bones are explicit
node chains, so limbs lock into place rather than a cloud condensing.

Five failure modes are mounted on the body part each one is actually about:

| Body part | Failure mode | Cost |
|---|---|---|
| Eye | Hallucination — it sees what is not there | $5,000 + sanctions |
| Mouth | Misrepresentation — what it says binds you | Company held bound |
| Hand | Disparate impact — it sorts people | Nationwide collective |
| Foot | Physical control — it moves in the world | $243,000,000 |
| Chest core | Training data — what it is made of | $1,500,000,000 |

The copy panel sits **over the torso**, deliberately narrower and shorter than
the figure so the crown, both arms and both legs stay visible around it. One
failure is shown at a time; the full list lives in the loss record below, and
repeating it here buried the figure behind a 700px panel.

Geometry is authored y-up and flipped once at draw time. Sizing is solved from
the figure's own extents rather than a fraction of the viewport, so a narrow
screen gets a properly sized figure with the arms tucked in — the hand carries a
marker and has to stay on screen.

## Motion architecture

Three things want animation frames: Lenis, the ambient background shader, and
the scroll-linked core. Running three rAF loops means they tear against each
other, and the core can read a scroll position Lenis has not yet committed —
which reads as lag.

One `Ticker` fixes it. Subscribers run in registration order (Lenis first, so
downstream readers see this frame's scroll position), each returns whether it
still wants frames, and the loop **stops entirely** when nobody does. That is
how the page reaches zero idle rAF while still running smooth scroll.

Frame budgets are set by what the layer actually is:

- **Scroll-linked core — native refresh rate, never capped.** Capping this is
  what makes scrolling feel broken on a 60/120 Hz display.
- **Ambient background — 30 fps.** It drifts at `uTime * 0.02` behind glass
  panels; nobody can tell, and it halves the rasterization cost.
- **Idle — nothing.** 1.5 s after the last interaction the ticker stops.

`prefers-reduced-motion` disables Lenis entirely and paints each canvas once.

### Deploying

Drop this folder on Netlify or Cloudflare Pages — both read `_headers` and both
serve `index.html` at the root, so there is nothing to rename. `frame-ancestors`
only works as a real header, which is why it ships there rather than in the meta.

Screenshots are off by default so test runs leave the tree clean. Set
`SENTINEL_SHOTS=/some/dir node backtest.js` to capture them.
