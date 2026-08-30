# Claude Code design skills

Animation / 3D / motion skills installed for this project so Claude Code has
consistent guidance when building immersive ("Unseen-style") front-end work.

## Data & integration skills

`public-apis` — offline-searchable catalog of 1,650+ free public APIs
(weather, geocoding, finance, open data, etc.) vendored from
[public-apis/public-apis](https://github.com/public-apis/public-apis). See
`public-apis/SKILL.md`.

## Generative media skills

`ltx-video` — operating knowledge for Lightricks
[LTX-Video](https://github.com/Lightricks/LTX-Video) text-to-video and
image-to-video generation: the 11-config model matrix, input constraints,
prompt structure, and a command builder. Weights are not vendored; generation
needs a CUDA GPU. See `ltx-video/SKILL.md`.

## Engineering-workflow skills (11)

Vendored from [WorldFlowAI/everything-claude-code](https://github.com/WorldFlowAI/everything-claude-code):

`backend-patterns` · `clickhouse-io` · `coding-standards` · `continuous-learning`
· `eval-harness` · `frontend-patterns` · `project-guidelines-example`
· `security-review-checklist` · `strategic-compact` · `tdd-workflow`
· `verification-loop`

That repo also supplied 9 subagents in `.claude/agents/` and 15 slash commands
in `.claude/commands/`. Its hooks, rules, contexts and MCP examples are vendored
inert under `.claude/everything-claude-code/`, which also documents the two
renames made to avoid shadowing built-in skills and the three skills whose
missing frontmatter had to be written. See
`.claude/everything-claude-code/INSTALL-NOTES.md`.

## Installed (22)

**Core 3D & animation**
`threejs-webgl` · `react-three-fiber` · `gsap-scrolltrigger` · `motion-framer` · `babylonjs-engine`

**Scroll & page transitions**
`locomotive-scroll` · `scroll-reveal-libraries` · `barba-js`

**2D / WebXR / engines**
`pixijs-2d` · `playcanvas-engine` · `aframe-webxr` · `lightweight-3d-effects`

**Component & micro-animation**
`react-spring-physics` · `animejs` · `lottie-animations` · `animated-component-libraries`

**Authoring pipelines**
`blender-web-pipeline` · `spline-interactive` · `rive-interactive` · `substance-3d-texturing`

**Meta**
`web3d-integration-patterns` · `modern-web-design`

## Not installed

`skill-creator` — upstream ships one, but Claude Code already provides a
built-in skill of that name; a project copy would shadow it. Omitted on purpose.

## Source & license

Vendored from **https://github.com/freshtechbro/claudedesignskills** —
MIT License, Copyright (c) 2025 Claude Skills Project. Unmodified copies of the
upstream `skills/*` folders (taken from `plugins/individual/*` where available,
otherwise `plugins/bundles/*`).

Upstream also publishes these as a Claude Code plugin marketplace. To track
upstream updates instead of these vendored copies, run in an interactive
Claude Code session:

```
/plugin marketplace add freshtechbro/claudedesignskills
/plugin install core-3d-animation
/plugin install extended-3d-scroll
/plugin install animation-components
/plugin install authoring-motion
/plugin install meta-skills
```

...then delete this directory.
