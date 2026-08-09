# Sentinel — AI Liability Telemetry & Coverage

A six-page static site for an AI assurance and liability business. The research
was verified first, the models were re-anchored on what survived verification,
and the pages were generated from those outputs. No figure on the site is
hand-typed.

## Deploy

Drag this folder onto <https://app.netlify.com/drop> and it is live. Every page
has **no external dependencies** — no CDN, no web fonts, no remote images, no
runtime network calls — so each one also opens correctly straight from disk
(`file://`), which is how it is developed and tested.

## The site

| URL | Page | Intent it serves |
|---|---|---|
| `/` | Home | What the company is, in one screen |
| `/coverage.html` | Coverage & pricing | What it sells and what it costs |
| `/evidence.html` | The loss record | What AI failure has actually cost |
| `/research.html` | Market research | Sector exposure, market sizing, ROI |
| `/method.html` | Method | How every number was produced |
| `/contact.html` | Contact | Get an indicative quote |

Six separate documents rather than one long scroll, because a single page cannot
rank for six different search intents and a buyer who wants pricing should not
have to scroll past a research dashboard to reach it. Each page carries its own
`<title>`, meta description, canonical, Open Graph card and JSON-LD, all
asserted unique by the backtest.

## Layout

| Path | What it is |
|---|---|
| `*.html` | The six built pages. Self-contained; nothing to serve alongside them. |
| `index2.html` | Byte-identical copy of `index.html` (that name was already in circulation). Excluded from the sitemap and disallowed in `robots.txt` so it cannot be indexed as a second home page. |
| `sitemap.xml`, `robots.txt`, `_headers` | Crawl surface and real HTTP security headers. |
| `og.jpg` | 1200×630 social card, rendered by the same shader as the hero. |
| `src/pages.js` | The content model: every page's title, description, h1, intro and body. |
| `src/build.js` | Generates all six pages, per-page CSP hashes, sitemap, robots, `_headers`. |
| `src/app.js` | All behavior: reveal, scroll-formed robot, charts, pricing tables, form. |
| `src/tw.css`, `src/tailwind.config.js` | Tailwind source and theme. |
| `src/frag.glsl`, `src/bake.js` | The raymarched hero bust and its build-time renderer. |
| `src/bust.datauri` | The baked render, inlined by the build. Regenerate with `node src/bake.js`. |
| `evidence.json` | 29 claims, graded A/B/C/D, each with sources and a plain-English gloss. |
| `montecarlo_v2.py` → `mc_v2.json` | Strategy viability. 60,000 trials, seed 20260808. |
| `pricing.py` → `pricing.json` | Actuarial pricing. 400,000 simulations, seed 4711. |
| `backtest.js` | 324 headless assertions across all six pages. Needs `playwright-core`. |
| `audit.js` | Core Web Vitals, CLS, idle GPU, leak probe, CSP. |

Full rebuild:

```
python3 montecarlo_v2.py && python3 pricing.py \
  && node src/bake.js && node src/build.js && node backtest.js
```

`src/bake.js` is only needed when the shader changes; the baked result is
committed.

## Page weight is chosen, not inherited

Payloads are selected per page from what the markup actually contains, so no
page carries a library it never calls:

| Page | Size | Carries |
|---|---|---|
| index | 158 KB | app, CSS, hero bust |
| method | 157 KB | app, CSS |
| coverage | 166 KB | + `pricing.json` |
| contact | 166 KB | + `pricing.json` |
| evidence | 183 KB | + `evidence.json` |
| research | 374 KB | + `pricing.json` + Chart.js (204 KB) |

Chart.js is 204 KB and only one page draws charts. Shipping it everywhere would
have added a megabyte across the site for nothing. The build detects the need
from the markup (`<canvas id="chart…">`), so a page that grows a chart starts
shipping the library on the next build without anyone maintaining a list.

## The hero backdrop

A raymarched signed-distance-field robot bust: cranium with a machined crown
seam, tilted face plate, emissive visor slits, cheek vents, canted shoulder
pauldrons, a glowing chest core ring and panel lines cut with `smax`. Gunmetal
material with a GGX specular lobe, a fresnel rim light gated to the light's own
side, and hemisphere ambient.

It is rendered **once at build time** and shipped as an inline JPEG data URI.
The shipped pages contain no WebGL at all — no context creation, no shader
compile, no context-loss handling, no GPU variance between machines, and no
per-frame compositing cost. Because the render is offline, quality is free:
2× supersampling and a chroma-gated bloom that no runtime budget would allow.

Three problems were solved in the render rather than papered over in CSS:

- **The rim light was flooding whole faces teal.** It was a diffuse term
  (`pow(dot(n, l), k)`) wearing a rim light's name. A rim light lives on the
  silhouette, so it now needs two gates: a fresnel term to confine it to the
  edge, and `dot(n, rimDir)` to confine it to the side the light is actually on.
- **The key highlight bloomed into a lamp stuck to the head.** A
  luminance-only bloom threshold cannot tell a white specular hit from a cyan
  emissive. The threshold is now weighted by distance from neutral toward
  green-blue, so metal highlights stay crisp and only the visor and core glow.
- **The image's bounding box read as a faint rectangle behind the hero.** A
  JPEG has no alpha, so whatever fills the empty studio is painted onto the page
  as an opaque block. The shader now resolves its frame edges to the page's
  exact background colour (`#05070a`), per-axis rather than radially, and the
  boundary disappears because there is nothing there to see.

Legibility is enforced, not hoped for. The copy sits on a glass panel on the
left; the bust is anchored right, masked out of the copy column entirely, and a
directional scrim sits over both. The backtest hides the copy, screenshots the
hero, finds the **brightest pixel actually behind the text**, and requires WCAG
AA against it. Current measurement: **6.64:1**.

Honest framing: this is a stylized product render produced by a distance-field
shader written for this page. It is not a photoreal 3D asset, and it is not
AI-generated imagery — there is no image model in this pipeline.

## The pinned figure

The home page keeps the scroll-formed figure. A **humanoid robot assembles from
particles** as you scroll a pinned section: head with antenna and visor band,
shoulder pauldrons, chest plate and core, two arms with elbows and hands,
pelvis, two legs with knees and feet. 247 nodes, 217 bones, flying in from
scattered origins and locking into limbs in waves; complete by 78% depth.

Five failure modes are mounted on the body part each one is actually about:

| Body part | Failure mode | Cost |
|---|---|---|
| Eye | Hallucination — it sees what is not there | $5,000 + sanctions |
| Mouth | Misrepresentation — what it says binds you | Company held bound |
| Hand | Disparate impact — it sorts people | Nationwide collective |
| Foot | Physical control — it moves in the world | $243,000,000 |
| Chest core | Training data — what it is made of | $1,500,000,000 |

The copy panel sits over the torso, deliberately narrower and shorter than the
figure so the crown, both arms and both legs stay visible, and shows one failure
at a time. Geometry is authored y-up and flipped once at draw time; sizing is
solved from the figure's own extents, so a narrow screen gets a properly
proportioned figure with the arms tucked in.

The backtest samples the canvas in five bands and requires ink in the head, both
arms and the legs. This is not paranoia: a `var` shadowing bug once put `NaN`
into every node's x-coordinate, and the chest bloom still painted — so "the
canvas has pixels" passed while the robot was gone.

## How the pricing is derived

Standard excess-of-loss ratemaking, not a markup on a competitor's rate card:

1. **Frequency** — Poisson, base 6% per insured per year, modified by sector
   (0.9×–2.4×), revenue band, and whether the system is under telemetry.
2. **Severity** — three-component lognormal mixture, calibrated so simulated
   quantiles reproduce the five adjudicated outcomes on the evidence page:
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

Structured data reflects this. The coverage page emits `Service`, not `Product`
with an `offers.price` — these are modeled technical premiums, not bound quotes,
and emitting them as a price would be a misrepresentation dressed as schema.

## Evidence grading

- **A** — court docket, regulator, statistical agency, standards body
- **B** — named-company disclosure or reputable trade / business press
- **C** — vendor or self-interested survey, shown only with the conflict disclosed
- **D** — syndicated report-mill projection with no traceable basis

Tier D claims stay in the ledger, struck through, so a reader can see what was
rejected and why. Four were discarded, including the widely-quoted "$6.8B in
2025 → $34.2B by 2034" AI liability market figure, which fails a sanity check
against Munich Re's measurement of the *entire* global cyber market at $15.3B.

## Security

Every page ships a hash-based Content-Security-Policy: `default-src 'none'`,
one SHA-256 per inline script and per inline stylesheet, no `unsafe-inline` and
no `unsafe-eval`. Because payloads differ per page, so do the hashes; `_headers`
carries the union (a header applies to every path) and the browser enforces the
intersection of header and meta.

`frame-ancestors` is spec-ignored inside `<meta>`, so it ships only as a real
header alongside `X-Frame-Options`, HSTS, `nosniff`, `Referrer-Policy`,
`Permissions-Policy` and COOP/CORP.

The site holds **no customer data**. The contact form composes a `mailto:` in
the reader's own client; nothing is transmitted and nothing is stored beyond a
single UI preference (`sentinel-pe`).

If a CRM or lead view is ever added on top of this:

> Client-side gating is obscurity, NOT security. For real customer lead data,
> set AUTH_MODE='supabase' and serve CRM data only after server-side auth.

No API key belongs in this HTML, ever.

## Scrolling: how the lag was actually fixed

Frame timing during real wheel gestures at Retina resolution, isolating one
layer at a time:

| Configuration | p50 frame | Effective |
|---|---|---|
| Animated fullscreen canvas | 100 ms | 10 fps |
| Shader cut 15 → 3 octaves, 6 fps cap | 33 ms | 30 fps |
| Canvas static, still in the DOM | 33 ms | 30 fps |
| **Canvas → cached image layer** | **17 ms** | **60 fps** |
| No backdrop at all | 17 ms | 60 fps |

The decisive row is the fourth. A `<canvas>` sits in the compositing path and is
re-rastered as the page scrolls above it **even when its pixels never change**;
an image layer is cached by the compositor and costs nothing. The current build
goes one step further and does not render at runtime at all.

Two things that were **not** the cause, and were measured rather than assumed:
`backdrop-filter` on 31 panels (disabling it changed nothing, and removing it
was slightly worse) and canvas size (shrinking it changed nothing).

CDP attribution over 3.5 s: ScriptDuration **66 ms** against raster/paint
**1,710 ms** — the residual is software rasterization in headless, not the
page's JavaScript.

A JS smooth-scroll library (Lenis) was tried and **removed**. Native scrolling
is driven by the compositor thread and stays smooth when the main thread is
busy; any JS scroll library moves scrolling onto the main thread, where it
competes with canvas work. Measured inside the pinned section: **Lenis ON
30 fps, Lenis OFF 60 fps.** The backtest asserts no scroll library is present so
nobody reintroduces one without re-measuring.

## Frame budget

- **Scroll-linked robot** — native refresh rate, never capped. Capping this is
  what makes scrolling feel broken on a 60/120 Hz display. Glows are pre-baked
  sprites (a `createRadialGradient` per node per frame cost 30 fps) and edges
  are batched into five paths instead of ~217 stroke calls.
- **Hero backdrop** — rendered at build time. Zero runtime cost.
- **Page backdrop** — pure CSS gradients on a fixed layer. No image, no bytes.
- **Idle** — nothing. One shared `Ticker`; subscribers return whether they still
  want frames and the loop stops entirely when none do. Zero rAF, zero GPU,
  measured over a clean sample.

## What the backtest guarantees

`node backtest.js` — **324 assertions**, all against the shipped files in a real
browser from a `file://` URL.

Per page, all six:

- No console or page errors; no guarded feature threw; no internals on `window`.
- Exactly one `<h1>`; no skipped heading levels; `lang` declared.
- Title, description, canonical, robots, Open Graph and Twitter card present;
  JSON-LD parses and carries the right types.
- CSP present, `default-src 'none'`, hashes only, `frame-ancestors` absent from
  the meta form.
- Every visible text node measured against its *composited* background clears
  WCAG AA. Current floors: 6.64:1 over the hero bust, 5.36:1 on mobile.
- Nothing above the fold hidden on load, and nothing still hidden after
  scrolling the whole document.
- No dead in-page anchors; every internal link target exists; every external
  link is https + `_blank` + `noopener noreferrer`.
- Zero literal `style` attributes; every table captioned; every canvas labeled
  or hidden from assistive tech.

Across pages:

- Titles, descriptions, canonicals and h1s are **all distinct** — the standard
  way a multi-page site cannibalises its own results.
- Every canonical appears in the sitemap and points at its own URL.
- No orphans: every page is linked from at least two others (measured: five).

Plus the behavior: assembly maps monotonically to scroll depth with all five
failure modes firing in order; five charts paint; the ROI calculator responds to
both selectors; the quote form blocks empty and invalid submits with per-field
`aria-invalid` and composes a `mailto` carrying the entered data; the mobile
disclosure menu reaches all six destinations, flips `aria-expanded` and returns
focus on Escape; all six pages remain readable with JavaScript disabled.

And the numbers: CLS 0.0000, FCP under 700 ms, DOMContentLoaded under 200 ms,
median scroll frame under 34 ms at 2× DPR on both the heaviest and the lightest
page — under headless software rasterization, which is slower than any real GPU.

Screenshots are off by default so test runs leave the tree clean. Set
`SENTINEL_SHOTS=/some/dir node backtest.js` to capture one per page.

## Not legal, financial, or insurance advice

This is a strategy and research artifact. It is not an offer of insurance, a
solicitation, financial advice, or a securities offering. Premiums shown are
modeled technical premiums, not quotes, and are not backed by bound capacity.
Case summaries describe public court records and are provided for analysis only.
