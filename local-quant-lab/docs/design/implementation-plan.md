# Implementation plan and execution ledger — Perspective Engine console

## Work graph (as executed)
```
A audit+baseline ─► B reference audit ─► C capability map ─► D tokens+primitives ─► E shell+navigation
                                                                                     ├─► F overview ─┐
                                                                                     └─► G graph UI ─┤
                                                                         H real data/jobs integration ◄┘
                                                                                     ├─► J motion+sound
                                                                                     └─► K accessibility
                                                                   L performance+security ◄┘
                                                                   M automated+browser verification
                                                                   N visual review+refinement
                                                                   O documentation+report
```
H was built before F/G rendered (the UI needed real read models first): `lql/console.py` and `lql/jobs.py` came before the views. Subagents were not used: the work touched one small codebase where one implementer avoided concurrent edits to the same files.

## Ledger
| Node | Objective | Status | Files | Evidence |
|---|---|---|---|---|
| A | Baseline | done | — | clean tree at `81d473a`; 156 tests OK (72 s); `verify.py` 12 done_verified + 1 needs_human; staging check OK; Python 3.13.16, Node 22.22.0, Playwright 1.56.1 + Chromium |
| B | Reference audit | done | `reference-audit.md` | 3 recordings readable (ffprobe/ffmpeg frames), 1 still, Perspective Engine source; R3 is the "before" app |
| C | Capability map | done | `architecture.md` | existing API, task graph, events, experiments, research, forward logs mapped; gaps: no job runner, no read models |
| D | Design tokens | done | `web/css/tokens.css`, `design-system.md` | semantic tokens only in components |
| E | Shell | done | `web/index.html`, `web/js/main.js`, `web/css/app.css` | ui_check: 7 workspaces by keys 1–7, palette, posture chips, connection state |
| F | Overview | done | `web/js/views/overview.js`, `lql/console.py` | 8 role cards from real roles; dial = real task DAG; decisions; guards; trace; protocol |
| G | Agent graph | done | `web/js/views/graph.js`, `web/js/graph-model.js` | select, inspector, arrows, filters, search, zoom/pan; unit tests for layout/closures/filter/neighbours |
| H | Integration | done | `lql/console.py`, `lql/jobs.py`, `lql/server.py`, `lql/lab.py` | `tests/test_console.py` (11); jobs emit audit events; recheck never changes task status |
| I | Interaction validation | done | views | every control calls a backend route or changes a local preference; disabled states explain why |
| J | Motion + sound | done | `web/js/sound.js`, CSS | sound off by default, click-enabled, rate-limited; motion only on job/events; reduced motion honoured (OS + setting) |
| K | Accessibility | done (manual + scripted) | all views | focusable SVG nodes, labels, aria-live, dialogs, keyboard map; no automated axe audit (no tool available offline) |
| L | Performance + security | done | `verification.md` | measured; CSP unchanged; no remote assets (test); credentials as status only (test); new routes behind host/CSRF guards (test) |
| M | Verification | done | `scripts/ui_check.mjs`, tests | 167 Python tests + 10 node tests OK; ui_check 35/35 |
| N | Visual refinement | done | CSS/views | 4 review passes on screenshots: dial spacing/labels, posture wrap, graph orientation (TB for deep chains), phone overflow, stale-state display |
| O | Docs | done | this folder, README, BUILD_STATE, CHANGELOG, DECISIONS D-016 | — |

## Repairs made during verification (bounded, each fixed in one or two iterations)
1. Graph unreadable at fit (13-level chain drawn left-to-right at 45% scale) → automatic top-to-bottom layout for deep graphs; fit computed from the real canvas size.
2. Phone layout overflowed 58–156 px (ticker buttons, long panel titles) → wrapping ticker row and titles.
3. When the server stopped, the posture chips still showed green "KILL OFF / LEDGER OK" → offline state strikes them through, adds STALE, greys the workspace; banner made sticky and opaque.
4. `hermes --version` would have been spawned on every status poll → cached 60 s in `Lab.hermes_health`.
5. Secret scanner flagged the literal `STOOQ_API_KEY` dictionary key in `console.py` → renamed the key; scanner unchanged.
