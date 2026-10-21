# Design system — Perspective Engine / Quant Research System

Implemented in `web/css/tokens.css` (tokens) and `web/css/app.css` (components). Rationale and sources: `reference-audit.md`.

## Principles
1. **A research instrument, not a slot machine.** Depth and glow mark hierarchy and real activity; an idle system is drawn still.
2. **Every figure is traceable.** Each panel names its source (`state/current_state.json`, `state/events.jsonl`, `config/settings.json`, …) in its header.
3. **Data class is always visible.** Synthetic, provisional, verified-historical and live are separate labels with separate glyphs; they never collapse into one green light.
4. **Colour is never the only signal.** Every state has a text label and a glyph (`web/js/status.js`).

## Tokens
| Group | Tokens |
|---|---|
| Surfaces | `--ink-0` #07051a (page), `--ink-1`, `--ink-2`, `--ink-3`, `--glass` (translucent drawer/role cards) |
| Lines | `--line` (cyan 13%), `--line-2` (white 7%), `--line-strong` (cyan 32%) |
| Text | `--text` #efeee8 (bone), `--text-2` #c2bfdc, `--text-3` #9592bb (≈5:1 on ink-0) |
| Accents | `--cyan` #2bf0ff (primary, "active"), `--violet` / `--violet-2`, `--amber`, `--rose` |
| Semantics | `--ok`, `--warn`, `--bad`, `--info`, `--active`, `--human` (amber), `--synthetic` (lavender), `--pos`, `--neg` |
| Role hues | `--r-supervisor` cyan, `--r-engineer` blue, `--r-reviewer` lavender, `--r-founder` amber, `--r-critic` rose, `--r-risk` orange, `--r-data` green, `--r-hermes` violet |
| Type | `--f-disp` Archivo → Inter → system UI; `--f-mono` IBM Plex Mono → JetBrains Mono → ui-monospace. **No font is downloaded**: if the named faces are not installed the system faces are used. |
| Scale | 10.5 / 12 / 13.5 / 16 / 22 / 34 px |
| Space | 4 / 8 / 12 / 16 / 24 px; radius 4 px |
| Motion | 120 / 240 / 520 ms, `cubic-bezier(.2,.7,.2,1)` |

## Typography
- Display face for headings and role names; mono with `tabular-nums` for every number, time, id, hash and log line.
- Uppercase mono "kickers" (10.5 px, 0.14em tracking) title panels, with a cyan ◆.

## Components
| Component | Where | Notes |
|---|---|---|
| Ticker | top bar | product mark, safety posture chips, connection, jobs, palette, activity, sound, UTC clock |
| Safety posture chips | ticker | mode, data class, no broker/no live, kill switch, ledger, feed, Hermes; struck through and marked STALE when the server is down |
| Rail | left (top strip on phones) | 7 workspaces with number keys |
| Role card | overview | from reference R1, with real roles; hue bar, icon, tagline, status line, one metric, optional level bar; glows only while a real job runs for that role |
| Orchestration dial | overview | the real task DAG on rings by dependency depth, on a plane tilted with CSS perspective; labels are projected flat so no text is ever tilted |
| Module panel | overview | numbered (01 DATA … 04 FORWARD LOG) like reference R2, click to open the workspace |
| Risk guards | overview | bars against hard limits (reference R2) |
| research_protocol.py | overview | frozen acceptance criteria with ✓/✗ from the latest study (reference R1's thresholds.py) |
| Decision trace | overview | mono event stream (reference R2's "life of a decision") |
| Graph canvas | agent graph | flat, precise: layered DAG (top-to-bottom for deep chains), zoom/pan, filters, keyboard |
| Inspector | agent graph | task record, action, acceptance, evidence, jobs, upstream/downstream, history |
| Tag / chip | everywhere | `ok`, `warn`, `bad`, `info`, `active`, `human`, `synthetic`, `muted` |
| Dialogs | confirm, palette | native `<dialog>`; replaces `prompt()` |
| Toasts / activity drawer | right | `aria-live`; jobs with cancel; notable events |

## Motion
Only these animate, and only for the stated reason (also shown in System → "What moves and why"):
- dial node halo, graph node glow and role glow: a job is running for that task or role;
- scan arc around the dial core: any job is running;
- edge sweep from a task to its dependents: once, after a job for that task finished;
- new decision-trace rows flash: a new audit event arrived;
- workspace fade-in: navigation.
`prefers-reduced-motion` or the in-app setting (System → Motion) reduces all of them to static states (`body.reduced`). Nothing animates on a timer; polling pauses while the tab is hidden.

## Sound (`web/js/sound.js`)
WebAudio oscillators, no files, no network. **Off by default**, enabled only from a click (autoplay rules). Cues: `start` (you started an operation), `complete` (a job finished), `warning` (job failed, risk rejection, data lockout), `critical` (kill switch, acceptance regression, reconciliation mismatch). One cue per batch of events; at most one cue per kind per 0.9 s and 4 per 6 s (critical always passes). Optional low hum while a job runs (separate opt-in). Volume and preferences persist in `localStorage` for this browser only. Every cue accompanies a visible change.

## Accessibility
Skip link; landmarks; `aria-current` on the rail; `aria-live` for status, toasts and announcements; every interactive SVG node is focusable with `role="button"` and a label; arrow keys move between graph tasks; visible focus ring (cyan); confirmations for consequential actions; text alternatives for charts (`role="img"` + label). Contrast: body text ≥ 12:1, secondary text ≈ 5:1 on the page background.

## Rejected
Decorative avatars and floating robots (R1, R2), permanent 3D meshes (R2, R4), saturated full-page frames (R1), headline P&L numbers that are not from a record, idle "ambient" motion.
