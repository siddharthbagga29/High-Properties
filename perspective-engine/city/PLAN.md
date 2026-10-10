# Perspective Engine City: build plan

**Metaphor: a cortex that resolves into a city.** The product is about how minds filter attention. The venture is literally nine agents thinking in parallel. So from far away the whole venture reads as one brain. Zoom in and the lobes separate into districts, the districts into towers, and the towers into the records they are made of. The viewer looks through a microscope-style reticle. The magnification changes with each semantic level: ×1, ×12, ×140, ×2000.

## The four levels, mapped to real data (`graph/graph.json` + `graph/ledger.jsonl`)
| Level | Name | What it is | Numbers shown |
|---|---|---|---|
| L1 | Venture (×1) | The cortex: every task in `graph/graph.json` as a particle patch in 9 lobes (34 tasks on 2026-10-10 per `graph.py validate`; the city reads the tasks from the graph export `state.json`, not from this file) | tasks built / total, tokens spent, gates waiting on the founder, ledger events |
| L2 | Districts (×12) | The city: one district per agent, laid out on a 3×3 grid with City Hall in the centre | per agent: done/total, tokens used vs budget, current task |
| L3 | Agent (×140) | One district: towers (tasks) and its worker | the agent's execution trace, efficiency trend, collaborators |
| L4 | Records (×2000) | One tower: its atoms (acceptance criteria, outputs, inputs, ledger events, gate) | per record: status, timestamp, excerpt of the output file |

Encoding: tower height = token budget (plan). Particle density = tokens actually spent (`run.used_k`). Colour = status. Bright atoms are records; the haze is substrate.

## Data schema
Source records stay as exported by `tools/graph.py`. The city derives one normalized event stream:
`{ id, level4Type: 'ledger'|'criterion'|'output'|'input'|'gate', parentIds: [venture, agent, task], timestamp, value, category: agent, status, meta }`.
Live = `state.json` polled every 20 s, with batched diffs and fresh-event flashes. Replay = statuses re-derived from ledger events up to time t.

## Component tree
`App` (DOM, renders before WebGL) → `Story` (scroll chapters) / `HUD` (breadcrumb, badge, zoom, sound, ⌘K, index) / `Dossier` / `Guide` / `Scrubber` / `Palette` / `Mirror` / `Pilot`.
`Scene` is lazy-loaded and contains `Background` (indigo + flames), `Cortex` (GPU particles), `Arcs` (dependency pulses), `Workers` (9 agents), `Hotspots` (hit targets and labels), `Atoms` (L4 cards), `Motes`, `CameraRig`, plus bloom. Layout is computed in a Web Worker.

## Performance budget
160k particles desktop, 90k mid, 40k phone. One draw call for particles, one for arcs, one for motes. DPR capped at 2 desktop and 1.25 phone, adaptive. Rendering pauses when the tab is hidden. Three.js is lazy-loaded, so the headline and primary action paint first.

## Assumptions
- No external live source exists yet, so "live" means the graph export polled from the same origin. Nothing is simulated except the construction animation on towers whose status really is "running".
- Primary action: request a pilot. The form is inert until the founder wires a backend, which is a gated step. The page says so.
- The project timeline replaces "24 h / 30 d" in the scrubber, because the venture is one day old.
- Voice uses the Web Speech API. Sound is off until the visitor chooses "Enter with sound", and the choice is remembered.
- Reference site: typography and dossier patterns only (Archivo 900, IBM Plex Mono, Spectral italic). Colours and structure follow the brief.
