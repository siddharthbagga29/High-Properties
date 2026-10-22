# Design reference audit

Date: 2026-10-21. Method: `ffprobe` for metadata, `ffmpeg` frame extraction at 1 fps (scaled to 1280 px) plus full-resolution crops of the content area, inspected visually. The recordings are short browser captures of looping social-media videos, so observations are limited to what the visible frames show. Inferences are marked *(inferred)*.

## Inventory

| # | File (uploaded) | Duration / size | Readable | What it shows |
|---|---|---|---|---|
| R1 | `Screen_Recording_2026-10-21_at_2.10.44PM.mov` | 7.2 s, 2560×1600, 60 fps | yes | A Threads post: "GROKBOT + JEV" trading-agent dashboard (third-party). |
| R2 | `Screen_Recording_2026-10-21_at_2.14.42PM.mov` | 5.0 s, 2560×1600, 60 fps | yes | A Threads post: "OPUS 5.5 INTO ARCHITECTURE REACTOR" agent dashboard (third-party). |
| R3 | `Screen_Recording_2026-10-21_at_3.38.27PM.mov` | 8.8 s, 2560×1600, 60 fps | yes | The current Local Quant Lab control room at `127.0.0.1:8765`, scrolled top to bottom (the "before" state). |
| R4 | `local-quant-lab/reference_materials/dashboard_visual_reference.png` | still, 2048×1280 | yes | A Threads post: "POLYMARKET BOT" dashboard with a central particle torus (third-party). |
| R5 | `perspective-engine/city/` (source, README, `styles.css`, `audio/sound.ts`) | code | yes | The Perspective Engine "city": a brain/orchestrator at the centre of a dial, agents as districts, tasks as towers; strict "what is real" rules. No screenshots exist in the repo. |
| — | Recordings around 2:00–2:30 PM other than R1/R2 | — | not found | Only the three files above were uploaded to this session. No other recordings or Perspective Engine images exist in the repository. |
| R6 | `7bedfe9d-b3e568c8308d48fcb4caddd74cfeb91b_2.mp4` (uploaded 2026-10-22) | video | yes | "Scalp City" by @nickafischer (third-party): a neon 3D city of worker towers with green/red beams to a central vault dome, then desk interiors with robots at monitors (a signal scanner, a leaderboard, a worker heatmap). |
| R7 | Screenshot of the founder's Perspective Engine City (uploaded 2026-10-22) | still | yes | A neuron-cloud brain inside a holographic bust at the centre, district labels around it, a Jarvis panel. The founder's stated target: "the center … should look exactly like perspective engine city". |

No two recordings were duplicates.

## Observations

### R1 — GROKBOT + JEV (pink frame, dark panels)
- **Layout:** a header row (product mark, mission line, progress bar "0.5%", day/date, large UTC clock in a boxed chip). Under it, a 4×2 grid of **agent cards** (CHIEF, SCAN, VET, QUANT, SIZE, FILLS, RISK, CRAWLER). Each card has an icon glyph, an uppercase coloured name, a one-line role tagline, a status line ("typing", "last pick HIRE"), a metric with a label, and a thin coloured **progress/level bar**. Each agent has its own hue (green, red, amber, blue, orange, magenta).
- **Centre:** an isometric pixel-art office (desks, monitors, plants, a rocket, a radar dish), with agent avatars at desks. **Motion observed:** bundles of thin lines fan out from a card or desk to points around the scene and fade (frames 2–6); avatars change position between frames.
- **Below:** a full-width balance chart (green area line with volume bars and a large current-value label), then two panels: an embedded candlestick chart ("JEV · ANALYSIS · 842 SCANNED") and a code-like `thresholds.py` panel listing HARD and SOFT rules with values and pass marks, ending in a pipeline of chips ("filter.py · THE ORDER IS THE WHOLE POINT").
- **Strongest patterns:** per-agent cards with role, live status line and one metric; an explicit rules/thresholds panel that shows *every number the desk believes*; a pipeline of chips.
- **Do not copy:** the saturated magenta frame, pixel-art décor, avatars that move without meaning, and the implied profitability of the balance curve.

### R2 — ARCHITECTURE REACTOR (deep navy, cyan/violet/amber)
- **Header:** product badge, title, a "1,452 STATES" chip, three circular gauges, three large counters with sparklines, a UTC clock and a "BUILD …" chip. A second row is a **ticker** of key=value deltas.
- **Top band:** "CORE MODEL" with a huge number (1,332 labels measured today), "LIFE OF A DECISION" (a monospaced trace with tags), "WHERE A BUY LANDS ON THE CURVE" (a curve chart), "BLOCK STACK" (a heat-grid).
- **Centre:** a large 3D **ring/gyroscope** around a core cylinder, flanked by eight numbered module panels (01 PLANNER, 02 INDEXER, 03 EXECUTOR, 04 VERIFIER, 05 RESOLVER, 06 PATCHER, 07 BUILDER, 08 AUDITOR). Each has a sparkline or bar mini-chart, a small ring gauge and a status. **Motion observed:** the ring rotates; floating robot figures with labels ("MEDUSA-02 · CARRY") drift across the page.
- **Bottom:** "SIGNAL WEIGHTS" horizontal bars, "EQUITY CURVE" with buy/sell markers, a 12-ticker sparkline grid, a code panel (`sniper.py`), a "TRADE LOG", a "PNL SPLIT" with a donut, and "RISK GUARDS" (bars against limits). Footer tabs and the note "sim run · numbers illustrative".
- **Strongest patterns:** a central orchestration hero with modules arranged around it; numbered agent modules; a decision trace; **risk guards drawn as bars against their limits**; a dense but aligned bottom grid; the honest footer note.
- **Do not copy:** the free-floating figures (decoration that looks like activity), the 3D mesh (too heavy for an 8 GB MacBook Air and unreadable), sparklines without a data source.

### R4 — POLYMARKET BOT (still)
- Status ticker header with UTC clock; a big headline number; candlestick and depth panels; a large central particle torus; a right column of compact metric cards; bottom panels with distributions. **Pattern kept:** the ticker header and a right column of compact cards. **Not kept:** the hero that encodes nothing.

### R3 — Current Local Quant Lab (before)
- One long scrolling page: a wrap of status chips, an amber synthetic-data banner, a run form, KPI grid, critic verdict, a 9-box "event flow" row, price/equity/drawdown/exposure charts, robustness tables, data provenance, paper ledger, fills, events and the task ledger table.
- **Strengths to keep:** every number comes from the backend; honest labels (synthetic, not live, no broker); a critic verdict with reasons; hashes.
- **Weaknesses:** no workspaces or navigation (everything on one scroll), monotone styling, the task graph shown only as a table, the event-flow diagram is static, no activity feedback for long operations, `prompt()` dialogs, no keyboard shortcuts, no sound or motion preferences.

### R5 — Perspective Engine (principal direction)
- Palette from `city/src/styles.css`: ink `#0a0524`, cyan `#2bf0ff`, violet `#7a3cff`, amber `#ffb547`, rose `#ff7a9c`, bone `#efeee8`; display/mono pairing (Archivo / IBM Plex Mono, with system fallbacks); uppercase mono "kickers".
- Concept: one orchestrator at the centre of a dial; every surrounding element is a real agent or task; clicking anything opens its record. A written **"What is real"** table separates data-driven motion from ambient decoration.
- Sound: WebAudio-generated cues (`audio/sound.ts`), no audio files.

### R6 — Scalp City (third-party video)
- **Take:** the institutional floor: bots at desks, each with monitors showing its own task, metrics and results. Beams that show work dispatched and returned (green success, red failure). A dark city with lit windows as a backdrop.
- **Leave:** fabricated workers, a leaderboard of invented P&L, and a heatmap of activity that does not exist. In this lab, every bot is a real role from the task file, and an idle bot sits still.

### R7 — Perspective Engine City (founder's screenshot)
- **Take:** the brain as the hero, a dense neuron cloud that grows by region and hemisphere, district labels, and the violet/cyan palette already in `tokens.css`.
- **Built as (2026-10-22, D-017):** the Overview's 3D floor. One supervisor assigns real jobs to nine desks under a brain of 150k to 2M neurons. Neurons form only from recorded, verified work. The EDGE core stays dark until a proven edge exists.

## Unified direction: "Perspective Engine / Quant Research System"
1. **Shell** (from R2/R4): a top ticker with the product mark, safety posture chips (SIMULATED, data class, broker none, kill switch), live job counter, UTC clock; a left rail of workspaces with keyboard numbers.
2. **Role cards** (from R1, but with real roles): Supervisor, Engineer, Reviewer, Founder (human gate), Critic, Risk engine, Data, Hermes. Each shows its real status line and one measured metric with a level bar. Hue identifies the role; a text label gives the state.
3. **Central dial** (from Perspective Engine and R2): the actual task DAG drawn as rings around the supervisor core on a plane tilted in perspective in the overview, with the eight role cards around it. It is flat and precise in the Graph workspace. Rings and edges animate only when a real job runs or a task changes state. *(2026-10-22: in the overview this is replaced by the 3D trading floor after R6/R7. The dial remains the fallback without WebGL, and the flat graph stays in the Graph workspace.)*
4. **Guards against limits** (from R2): risk limits as bars, with the current paper exposure where it exists.
5. **Rules panel** (from R1): the frozen research protocol (acceptance criteria) and data gates shown as a code-like list with pass/fail marks from real reports.
6. **Decision trace** (from R2): the audit event stream in monospace, with severity tags.
7. **Honesty legend** (from Perspective Engine): every view carries its data class; a "What moves and why" table is in Settings.

Rejected for all references: saturated full-page frames, any balance or P&L headline that is not from a real record, and motion that runs while nothing happens. (Robots and a 3D scene were rejected on 2026-10-21 and adopted on 2026-10-22 after R6/R7, but only as stand-ins for real roles and real jobs; see D-017.)
