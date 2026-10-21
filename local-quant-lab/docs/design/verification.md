# Verification record — console redesign (2026-10-21)

Environment: Linux x86_64 cloud container (4 vCPU, no GPU), Python 3.13.16, Node 22.22.0, Playwright 1.56.1 with Chromium 141 (headless, software rendering). **Not** the MacBook Air M3: numbers below are from this container and must be re-measured on the Mac (`make ui-check`).

## Commands and results
| Command | Result |
|---|---|
| `python3 -W error::ResourceWarning -m unittest discover -s tests -t .` | 167 tests OK (~75 s); baseline before the work: 156 OK |
| `node --test web/tests/*.test.mjs` (`make test-js`) | 10 tests, 0 failures (also run inside `tests/test_console.py`) |
| `python3 scripts/verify.py` | 13 done_verified (M0–M12), H1 needs_human |
| `python3 scripts/check_staging.py` | OK (no data, logs, databases, env files, machine reports) |
| `node scripts/ui_check.mjs` (`make ui-check`) | 35/35 checks passed against a real server on a temp synthetic state |

## Browser checks (scripts/ui_check.mjs)
Startup; posture and synthetic banner; every workspace by number key without horizontal scroll; graph select/inspect/arrow navigation/status filter/search; a real **recheck job** started from the inspector, finished, toasted and logged (`job_queued/started/finished`); the dial is busy only while a job runs and still afterwards; the owning role card lights up; command palette navigation; sound off by default, enabled by click, one start cue, off again; OS reduced motion; motion preference + last workspace persist across reload; Tab focus; **server stopped → SERVER DOWN, STALE chips, greyed workspace; restarted → reconnects**; phone 390 px without page overflow on overview/graph/research; no page or console errors.

## Measurements (container, headless Chromium, 1440×900, synthetic demo state)
| Metric | Result |
|---|---|
| Navigation to overview rendered | 185–228 ms (DOMContentLoaded 61–75 ms; HTML 5.4 KB) |
| Workspace switch (key press → content) | 12–98 ms (median ≈ 48 ms) |
| Frame rate, overview idle / with a job running | 53–55 / 55–58 fps (headless software rendering; idle draws nothing) |
| Long tasks during the whole run | 0–1, max 59 ms |
| JS heap before/after 28 workspace switches | 9.5 MB / 9.5 MB |
| Synthetic stress fixture: 300 tasks, 461 edges | layout 0.9–2.2 ms, SVG render 31–55 ms |
| Recheck job M0 (4 tests) wall time | ≈ 0.3 s; child CPU recorded per job |
| Front-end size | ~132 KB uncompressed HTML+JS+CSS in total, 0 dependencies, no build step |

Not measured here: model-inference responsiveness (no local model in the container), behaviour on the 8 GB Mac, Safari/WebKit (Playwright WebKit not installed).

## Screenshots
`screenshots/overview-1440.jpg`, `graph-1440.jpg`, `research-1440.jpg`, `overview-390.jpg`, `disconnected-1440.jpg` (synthetic demo data; no personal data, no browser chrome).

## Manual visual review against the references
Compared side by side with R1/R2/R4 frames (`reference-audit.md`): the role-card band (R1), numbered module panels and central hero with flanking modules (R2), ticker header with UTC clock (R2/R4), guards-against-limits bars (R2), and a protocol panel (R1) are present; decorative avatars, meshes and P&L headlines are not. The dial is SVG with CSS perspective, deliberately lighter than R2's 3D ring.
