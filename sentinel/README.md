# Sentinel — Evidence Dossier

A self-contained research and strategy artefact for an AI assurance + liability
business. Research was done first, every claim was source-checked, the
simulation was re-anchored on what survived, and only then was the page built.

## Deploy

`index.html` has **no external dependencies** — no CDN, no fonts, no images, no
network calls. Drag this folder onto <https://app.netlify.com/drop> and it is
live. It also opens correctly straight from disk (`file://`).

## Files

| File | What it is |
|---|---|
| `index.html` | The built page. 102 KB, self-contained. |
| `src.html` | Source template with `/*__MCDATA__*/` and `/*__EVIDENCE__*/` placeholders. |
| `build.js` | Inlines the JSON into the template. `node build.js`. |
| `evidence.json` | 29 claims, each graded A/B/C/D with sources and a plain-English gloss. |
| `montecarlo_v2.py` | The model. 60,000 trials, 5-year horizon, seed 20260808. |
| `mc_v2.json` | Model output consumed by the page. |
| `backtest.js` | 40 headless assertions. `node backtest.js` (needs playwright-core). |

Rebuild loop: `python3 montecarlo_v2.py && node build.js && node backtest.js`

## How claims are graded

- **A** — court docket, regulator, national statistical agency, standards body
- **B** — named-company disclosure or reputable trade / major business press
- **C** — vendor or self-interested survey; shown only with the conflict disclosed
- **D** — syndicated report-mill projection with no traceable primary basis

Tier D claims are **kept in the ledger and displayed struck-through** rather than
deleted, so a reader can see what was rejected and why. Four claims were
discarded, including the widely-quoted "$6.8bn in 2025 → $34.2bn by 2034" AI
liability market figure, which fails a sanity check against Munich Re's
measurement of the *entire* global cyber insurance market at $15.3bn (2024).

## The plain-English layer

Every section carries a `.plain` element — a one- or two-sentence restatement in
non-technical language. It is visible by default and subtle; the **Plain English**
toggle in the nav raises its contrast and persists the choice to `localStorage`.
The backtest asserts that no content section is missing one.

## Rendering guarantees (asserted by the backtest)

- `.reveal` only hides under `html.js-ready`, so **no-JS renders everything**.
- A 1500 ms safety net is scheduled *before* observer setup, so a throwing
  `IntersectionObserver` can never leave the page blank.
- Dynamically injected content re-registers via `window.__scanReveal()`.
- WebGL is raw WebGL1 (no library) and every failure path hides the canvas.
- All 122 external links are `target="_blank" rel="noopener noreferrer"`, https.

## Not legal, financial or insurance advice

This is a strategy and research artefact. It is not an offer of insurance, a
solicitation, financial advice, or a securities offering. Case summaries describe
public court records and are provided for analysis only.
