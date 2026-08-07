# Claude Code design skills

Animation / 3D skills installed for this project so Claude Code has consistent
guidance when building the immersive ("Unseen-style") front-end work.

| Skill | Covers |
|---|---|
| `threejs-webgl` | Three.js scenes, cameras, materials, GLSL shaders, instancing, post-processing |
| `react-three-fiber` | Declarative 3D in React (R3F + drei), `useFrame`, loaders |
| `gsap-scrolltrigger` | GSAP timelines, ScrollTrigger pinning/scrubbing/parallax |
| `motion-framer` | Motion (Framer Motion) components, variants, gestures, layout animation |
| `locomotive-scroll` | Smooth/inertia scrolling, parallax, scroll detection |

## Source & license

Vendored from **https://github.com/freshtechbro/claudedesignskills** —
MIT License, Copyright (c) 2025 Claude Skills Project. Unmodified copies of the
`plugins/individual/*/skills/*` folders.

Upstream also publishes these as a Claude Code plugin marketplace. To switch to
the marketplace (and get updates) instead of these vendored copies, run in an
interactive Claude Code session:

```
/plugin marketplace add freshtechbro/claudedesignskills
/plugin install core-3d-animation
```

...then delete this directory.
