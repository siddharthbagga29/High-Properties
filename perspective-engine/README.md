# Perspective Engine

A venture build run by a graph of AI agents. It is kept separate from the High Properties website, and `.vercelignore` keeps this folder off the live site.

| Path | What it is |
|---|---|
| `docs/execution-plan.md` | Strategy, hypotheses, kill criteria, 12-month plan |
| `research/evidence-dossier.md` | The memo's claims checked against sources |
| `graph/graph.json` | The task graph (DAG), the single source of truth |
| `graph/ledger.jsonl` | Append-only history of every state change |
| `tools/graph.py` | CLI that agents use to read and advance the graph (stdlib only) |
| `.claude/agents/pe-*.md` (repo root) | Nine role cards, one agent per responsibility |
| `PROMPT.md` | Graph-engineering prompt that continues the build |
| `dashboard/index.html` | The agent city. Open it in a browser; it reads `dashboard/state.js` |
| `mvp/` | Browser MVP of the attention-load experience |
| `city/` | The 3D city (Vite, React, three.js), published at https://claude.ai/artifact/D4mz6TQGSr2Lcm6hCo2tTg, with Jarvis and the evolving body |
| `jarvis/core/` | Jarvis's framework-free core: tasks, policy, tools, memory, intents, reminders, briefings, model routing, body model |
| `jarvis/agent/` | The private local Jarvis agent for the founder's Mac (localhost only, token, allowlisted tools, voice console) |
| `tools/audit.py` | Jarvis as second line: scores every agent against `docs/JARVIS_AUDIT_RUBRIC.md` |
| `docs/JARVIS_*.md` | Architecture, progress, security, setup, operations and the audit rubric |

## Run

```bash
python3 perspective-engine/tools/graph.py status   # whole graph
python3 perspective-engine/tools/graph.py ready    # what agents can do next
python3 perspective-engine/tools/graph.py human    # what needs the founder
python3 -m http.server -d perspective-engine 8000  # then open /dashboard/ and /mvp/
```

```bash
cd perspective-engine/jarvis && npm install && npm test   # Jarvis core and Mac agent tests
cd perspective-engine/city && npm install && npm test     # city and Jarvis UI tests
python3 -m unittest discover -s perspective-engine/tools -p 'test_*.py'   # graph, auditor, founder signatures
python3 perspective-engine/tools/audit.py                 # recompute the agent scorecards
```

To continue the build, open Claude Code on this repo and paste `PROMPT.md`. To run Jarvis on your Mac, follow `docs/JARVIS_SETUP.md`.
