# Perspective Engine City

A 3D, explorable view of the venture. From far away it is one cortex. Zoom in and it comes apart into nine districts (one per agent), then towers (tasks), then the records each tower is made of. Everything is read from the task graph the agents update. See `PLAN.md` for the concept, the level mapping and the assumptions.

## Run

```bash
cd perspective-engine/city
npm install
python3 ../tools/graph.py export   # refresh public/state.json from the graph
npm run dev                         # http://localhost:5173
npm test                            # data, guide, deep-link and layout tests
npm run build && npx vite preview --port 4173
node scripts/shots.mjs shots        # screenshots at 1440×900 and 390×844, FPS, console errors
node scripts/fallbacks.mjs shots    # reduced motion + deep link, and the no-WebGL path
```

## Using it
| Do this | And this happens |
|---|---|
| Scroll on the landing page | You fly through five chapters: ×1, ×12, ×140, ×2000, then the experiment |
| Wheel, pinch, `+` and `−`, or the dock | Semantic zoom; crossing a level dives into whatever is under the cursor |
| Click a lobe, district, tower, worker or record | The camera flies there and the dossier explains it |
| `Esc` or the breadcrumb | Back out one level |
| `⌘K` / `Ctrl+K` | Jump to any agent or task by name |
| Scrubber and ▶ | Replay the project from the ledger; **Live** snaps back to now |
| Guide orb | Ask "what changed recently?" or "show Ogilvy"; voice works if sound is on |
| Index | Every level as tables, with the same numbers |

Deep links look like `#V05.4.live` (focus, level, time).

## What is real and what is not
- **Real:** statuses, timestamps, token budgets, tokens spent, run times, tool calls, dependencies and output excerpts. They come from `graph/graph.json`, `graph/ledger.jsonl` and the output files, through `tools/graph.py export`.
- **Illustrative:** the climbing construction front on towers whose status really is "building", and the street traffic.
- **Not connected:** the pilot form. It collects nothing until the founder approves a backend and a privacy notice.
