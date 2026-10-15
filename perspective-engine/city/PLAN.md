# Perspective Engine City: build plan

*Revised 2026-10-15 so that it describes the build as it is (verifier R1 of 2026-10-10 found that the earlier plan named parts the build never had, gave other particle budgets and promised a magnification readout). If this file and the code disagree, the code is right and this file must be corrected.*

**Metaphor: a mind at the centre of a city.** The venture is nine agents working in parallel on one plan. The plan and its orchestrator (Mayor) are a particle brain in the middle of the world. The brain sits inside a translucent bust, JARVIS's body: each part belongs to one agent and fills only as that agent's tasks are verified, and the face stays a blank mask until verified revenue forms it (`scene/Bust.tsx`, `jarvis/body.ts`). The other eight agents are districts on a ring around the brain, joined to it by spokes (`scene/world.ts` RING). Zoom in and a district resolves into its towers (tasks), and a tower into the records it is made of. The levels are camera framings with a breadcrumb and an inspector drawer. There is no microscope reticle and no magnification readout.

## The four levels, mapped to real data (`graph/graph.json` + `graph/ledger.jsonl`, read through the graph export)
| Level | Focus (`store.ts`) | What it is | What the drawer shows (`ui/Drawer.tsx`) |
|---|---|---|---|
| L1 | City (`world`; the brain alone is `brain`) | The whole venture: brain and bust at the centre, eight district plates on the ring, every task as a tower (34 tasks in `graph/graph.json` on 2026-10-15; the city reads them from the graph export `state.json`, not from that file) | How to read the city, what needs the founder, the agents. The brain view adds progress by phase, ready to start next, planned effort vs actual per finished task, and the evidence that shaped the plan |
| L2 | District (`agent`) | One agent's plate and towers. Its worker drone moves only while that agent's own steps are recent | Latest steps, its towers, effort vs plan for finished tasks, who it works with |
| L3 | Tower (`task`) | One task. Tower height = planned token budget; fill = status (running is drawn half-built, not as a percentage) | The task, its status, "Done means" (acceptance criteria), the tasks it needs work from, latest steps |
| L4 | Records (a record selected on a `task`) | Up to 14 records orbit the selected tower: acceptance criteria, outputs, inputs, ledger lines, gate (`scene/Records.tsx`, `atomsOf` in `data/model.ts`) | The selected record |

Moving between levels: click to dive. Escape goes back one level (record, then task to its district, then the city), Home returns to the city, and the left and right arrows step around the districts. The breadcrumb reads City › district › task. Every view has a deep link (`#world`, `#brain`, `#agent-<id>`, `#task-<id>`).

Encoding: the colour of a brain patch and a tower = the task's status. Arcs join each task to the tasks that consume its output; a pulse travels only when a real hand-off is recorded while the page is open. Packets fly between brain and tower only for ledger events from the last few minutes. Nothing moves on a timer pretending to be work: an agent is "working" only when its own steps are recent; a task that says running with no recent step is shown as stalled.

## Data
Source records stay as `tools/graph.py` exports them. Live state, in order (`data/live.ts`): (1) the live database document `state/current`, when the hosting page provides a database; (2) the `state.json` snapshot published with the page, re-read every 20 s. If neither answers, the page says so. A snapshot is accepted only if it moves forward.
Replay (`ui/Chrome.tsx` Replay, `statusesAt` in `data/model.ts`) re-derives every status from ledger events up to time t and plays the whole project, from just before the first ledger event to the export time, in 20 s. **Known defect (verifier R1, 2026-10-10):** `statusesAt` handles start, done, block, unblock and clear-gate but not `reopen`, so at the end of the timeline replay shows reopened tasks as done or awaiting while the record says running. The live view is not affected (it uses each node's exported status). The fix belongs in `data/model.ts`, which is not one of F07's listed outputs; see the F07 record.

## Component tree (as built)
`App` (DOM, renders before WebGL) → `TopBar` (status, data source and age, main actions; Replay, Index, Help and sound behind "⋯" on narrow screens) / `Drawer` (inspector: breadcrumb, Overview, Activity, Output and Ask tabs) / `MiniMap` (agent picker) / `HintChip` / `Replay` / `TalkBar` (Jarvis bar; falls back to the plain `AskBar`) / `JarvisPresence` and `JarvisBubble` / `JarvisConsole` (lazy) / `Toasts` / `IndexMirror` / `Search` (⌘K) / `Help` / `Pilot` / `Index` / `Gate` (the entrance). The scene, the drawer and each Jarvis part sit in their own `ErrorBoundary`: a failure in the scene or the drawer returns the visitor to the whole city with a notice, and a Jarvis failure leaves the rest of the city working.
`Scene` is lazy-loaded after first paint and contains `Background` and `Motes` (`scene/Atmosphere.tsx`), `Ground`, `LegendRing`, `Shockwave`, `Plates`, `Spokes`, `Towers`, `TowerTags`, `Arcs`, `Workers`, `Packets`, `Records`, `BrainLabel`, `HoverLabel`, `Bust`, `Brain` and `Rig` (the one per-frame controller: camera flights and framing between panels, from `scene/framing.ts`), plus bloom. The brain's particle layout is computed in a Web Worker (`scene/layout.worker.ts`), with a main-thread fallback.
The Jarvis parts (console, talk bar, presence) are documented in `docs/JARVIS_ARCHITECTURE.md`; the city works without them.

## Performance budget (as built, `scene/Scene.tsx`)
Brain particles: 105k on desktop, 60k on machines with 4 or fewer cores, 27k on phones. Bust particles: 40k / 24k / 12k. Motes: 300, or 140 on phones. The brain, the bust and the motes are one `points` object each; all arcs are one `lineSegments`. Device pixel ratio starts at 1.25 on phones and at most 2 elsewhere, and drops to 1 when the performance monitor sees frame rates decline. Rendering stops while the tab is hidden. Three.js and the Jarvis console are separate lazy chunks, so the headline and the primary action paint first.
Measured: Lighthouse 12.8.2 on the 2026-10-06 build (http://localhost:4173/) gave accessibility, best practices and SEO 100 on desktop and mobile, with performance 48 desktop and 59 mobile; an earlier mobile run that day gave performance 38 and SEO 91. These reports are in a session scratchpad, not in the repo (audit AF-orchestrator-16). Later builds have not been measured for performance in this file.

## Accessibility and fallbacks
- No WebGL: the page shows the Index as a full page of tables (`IndexPage`) instead of the 3D view.
- With WebGL: a skip link opens the same tables; `IndexMirror` keeps a plain-text copy of every number for assistive technology.
- Reduced motion: `MotionConfig reducedMotion="user"`, and the camera, bust heartbeat, breathing and scan line respect `prefers-reduced-motion`.
- While the entrance or a panel is open, everything behind it is inert.

## Assumptions
- "Live" means the graph export from the same origin, or the live database document when the hosting page provides one. Nothing is simulated except the construction animation on towers whose status really is "running".
- Primary action: request a pilot. The form is not connected to a server until the founder approves where the data goes, which is a gated step. The page says so.
- Replay covers the project timeline, first ledger event to last, not a fixed "24 h / 30 d" window.
- Sound is generative (no samples) and stays off until the visitor chooses "Enter with sound"; the choice is remembered. Spoken replies use the Web Speech API.
- Typography from the reference site: Archivo, IBM Plex Mono and Spectral (italic). Palette #0a0524 / #2bf0ff / #7a3cff, as in the brief.
