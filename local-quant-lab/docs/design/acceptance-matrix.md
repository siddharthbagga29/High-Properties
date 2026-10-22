# Definition of done — evaluated

| Area | Criterion | Status | Evidence |
|---|---|---|---|
| Design | references inspected or marked unavailable | done | `reference-audit.md` (3 videos + 1 still read; other 2:00–2:30 PM recordings not found) |
| Design | one coherent visual system | done | `tokens.css`, `design-system.md`, screenshots |
| Design | motion tied to real events | done | ui_check "dial shows activity only while a real job runs" / "returns to still" |
| Design | sound optional and controllable | done | off by default, click-enabled, volume, hum opt-in; node tests + ui_check |
| Design | not a static mockup | done | all views load from `/api/*`; jobs run real tests |
| Function | navigation works | done | keys 1–7, rail, palette, hash routes |
| Function | visible controls do real things | done | each control maps to a route or a preference; disabled controls say why |
| Function | loading/empty/error/disconnected/human-review states | done | per-view empty text, load error panel, offline state, "Waiting on a human" |
| Function | graph reflects real state | done | `test_console.test_graph_matches_the_task_file` |
| Function | data and experiments traceable | done | source in every panel header; hashes; provenance table |
| Function | nothing fabricated as live | done | data classes; "live: not supported"; tests on `data_mode` |
| Function | existing workflows intact | done | all 156 earlier tests pass; old routes unchanged |
| Safety | research invariants preserved | done | no change to walkforward/forward/risk code; console has no route to freeze/run/spend a study or start a forward log |
| Safety | provisional stays provisional | done | data class PROVISIONAL shown; decisions list it; backend gates unchanged |
| Safety | holdout/forward safeguards | done | CLI-only, stated in UI; job kinds `holdout`/`forward` refused (test) |
| Safety | live trading disabled, no money path | done | `test_security` (routes, no broker endpoints, no remote URLs in web/) |
| Safety | no credentials committed | done | `check_staging.py` OK; secret scan test OK; credentials shown as configured/not configured |
| Engineering | regression tests pass | done | 167 OK |
| Engineering | new tests for new behaviour | done | `tests/test_console.py` (11), `web/tests/units.test.mjs` (10), ui_check (35) |
| Engineering | build/startup checks | done | no build step; `make run` / ui_check starts the real server |
| Engineering | performance measured | done (container) / needs_human (Mac) | `verification.md` |
| Engineering | accessibility reviewed | partial | keyboard, labels, focus, live regions, reduced motion checked; no automated axe/contrast tool run (none available offline) |
| Engineering | docs sufficient to run and maintain | done | README, `architecture.md`, this folder |
| Integrity | every node has evidence; blockers explicit | done | `implementation-plan.md`; blockers below |
| Floor (2026-10-22) | centre looks like the Perspective Engine city: one agent assigning work to bots with tasks, metrics, results; brain grows from finished work | done | hologram supervisor with the brain in its head; 9 desks with real monitors and callouts; growth after a real job (ui_check); D-017 |
| Floor | "millions of neurons" | done (container: 150k/400k rendered) / needs_human (Mac at 1M/2M) | presets up to 2M; auto picks 1M on 8 cores and 8 GB; frame rate on the Mac not yet measured |
| Floor | no fabricated activity; no fake skill | done | bots move only for running jobs; neurons from records; EDGE dark, face blank, stage < PROVEN EDGE on synthetic data (tests + ui_check) |

## Remaining blockers and limits
- Mac-side measurements, Safari, and behaviour with a real Hermes/Ollama endpoint: needs the founder's machine.
- The HP Envy host is not hardware-verified or connected; the console only probes localhost.
- Jobs were in memory until 2026-10-22; they are now persisted and recovered (D-018, `docs/engineering/acceptance-matrix.md`).
- No automated accessibility audit tool was available; review was manual plus scripted keyboard checks.
