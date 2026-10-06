# Perspective Engine City

A live 3D view of a company being built by nine AI agents. The brain in the middle is the plan and its orchestrator, Mayor. Eight districts around it are the specialist agents. Every tower is a task. Click anything to see exactly what it did, with timestamps, and ask questions about it.

## What is real
| On screen | Comes from |
|---|---|
| Tower colour and fill, "working now", "waits on you" | Task status in `graph/graph.json`, replayable from `graph/ledger.jsonl` |
| Activity timeline rows | `graph/activity/<task>.jsonl`. Each row is either a real tool call extracted from the agent's transcript (`tools/activity.py`), a step the agent logged while working (`graph.py log`), or a ledger state change |
| Packets flying between brain and towers | New `start` / `done` ledger events as they arrive |
| Worker drones moving | Only when the agent has a running task or logged a step in the last 5 minutes; otherwise they park and say "idle since HH:MM" |
| Output excerpts | The opening summary of each output file in the repo |
| Ask answers | Claude, given only the record above (when the viewer allows it); otherwise the rule-based guide over the same files |

Ambient motion that is not data: the brain's slow breathing, the radar sweep on the ground, and drifting motes. None of it changes with agent activity.

## How live works
The orchestrator writes the full export (`public/state.json`) to the page's database document `state/current` after every state change. Open pages receive it through a live subscription. If the database is unavailable, the page re-reads the published snapshot every 20 seconds and shows "Snapshot" instead of "Live".

Agents only work when a session runs them. That happens when someone runs `perspective-engine/PROMPT.md`, or on the scheduled routine "Perspective Engine: continue the build". Between runs, the city says nobody is working.

## Run locally
```bash
cd perspective-engine/city
npm install
python3 ../tools/graph.py export     # refresh public/state.json
npm run dev                           # http://localhost:5173
npm test                              # data, activity, guide and world-layout tests
npm run build && npx vite preview --port 4173
node scripts/shots.mjs shots          # screenshots at 1440×900 and 390×844, FPS, console errors
```

## Controls
Drag to orbit · scroll or pinch to zoom · click anything to fly there · Esc to go back · Home for the whole city · ← → for the next agent · `/` or ⌘K to find or ask · L to mute · ? for help. Deep links: `#agent-gtm`, `#task-V05`, `#brain`.
