# Local Quant Lab — Claude Code Build Brief

This package contains the master build prompt and portable context for a local-first quantitative trading research and paper-trading system.

## Files

- `CLAUDE_CODE_MASTER_PROMPT.md` — paste or provide this to Claude Code in the target workspace. It instructs Claude Code to inspect, build, test, repair, audit, and continue until the local acceptance criteria are met.
- `PROJECT_CONTEXT.md` — the portable source of truth for the portfolio background, old artifact, UI reference, current direction, constraints, and definitions of success.
- `RESEARCH_REFERENCES.md` — first-party references for Jane Street's public materials, SEC market-access controls, IBKR APIs, and the portfolio.
- `INITIAL_BUILD_STATE.json` — structured starting state for a persistent build loop.
- `HERMES_INTEGRATION_SPEC.md` — detailed design for open-source Hermes Agent, local inference, persistent memory, evaluated skill learning, and safe integration.
- `reference_materials/dashboard_visual_reference.png` — the visual reference screenshot.
- `reference_materials/perspective_engine_city_original.zip` — the original uploaded Perspective Engine City ZIP retained as reference material.

## How to use

1. Create/open the repository you want Claude Code to work in. Make a backup or commit current changes first.
2. Copy the entire package into that workspace, preferably in a `project-brief/` folder, or provide the files to Claude Code as context.
3. Start Claude Code in the repository root and instruct it: `Read PROJECT_CONTEXT.md, HERMES_INTEGRATION_SPEC.md, and CLAUDE_CODE_MASTER_PROMPT.md completely. Follow the prompt, inspect this repository, then implement and verify the system. Do not stop at a plan.` Adjust relative paths if needed.
4. Let Claude inspect the machine and current official Hermes docs before installing. Default to open-source local inference and local memory. Do not subscribe to Nous Portal or any provider; do not download a large model until RAM, disk and 64K context compatibility are checked.
5. Keep live trading disabled. The deliverable is a local research and simulated/paper-trading system. Any future broker connection must be a separate, explicitly reviewed phase.

## Important

This is an engineering brief, not a claim that an edge exists. Passing software tests means the software meets its tested behavior. It does not mean a trading strategy is profitable, market-ready, compliant, or equivalent to an institutional market maker.
