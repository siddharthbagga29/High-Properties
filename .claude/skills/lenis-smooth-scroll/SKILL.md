---
name: lenis-smooth-scroll
description: Lenis smooth/inertia scroll (v1.3.x) for heavy, gliding scroll momentum. Use when implementing smooth scrolling, syncing scroll with GSAP ScrollTrigger or a React Three Fiber render loop, building scroll-driven narrative sites, or replacing native scroll jump with eased motion. Triggers on Lenis, smooth scroll, inertia scroll, scroll momentum, scroll progress, or scroll-linked animation sync.
---

# Lenis smooth scroll

Lightweight smooth-scroll that keeps native scrollbar/accessibility behaviour while
easing the scroll position. The core value: one authoritative scroll clock that GSAP
and WebGL can both read, so DOM and 3D never drift apart.

## Install & minimal setup

```bash
npm i lenis
```

```js
import Lenis from 'lenis'
const lenis = new Lenis({ autoRaf: true })   // autoRaf drives its own loop
```

## Options that matter (v1.3.x)

| Option | Use |
|---|---|
| `lerp` | 0–1 easing factor per frame (~`0.08–0.12` = the "heavy" feel). Mutually exclusive with `duration`. |
| `duration` / `easing` | Time-based alternative to `lerp`. |
| `smoothWheel` | Ease wheel input (default true). |
| `syncTouch` | Ease touch too — off by default; native touch usually feels better. |
| `wheelMultiplier` / `touchMultiplier` | Input gain. |
| `orientation` / `gestureOrientation` | `'vertical' \| 'horizontal'`. |
| `infinite` | Loop scrolling. |
| `autoRaf` | Let Lenis own its RAF. Set **false** when GSAP drives the ticker. |
| `anchors` | Handle in-page `#anchor` links. |

## The three integration patterns

**1 — Standalone**
```js
const lenis = new Lenis({ lerp: 0.1, autoRaf: true })
```

**2 — GSAP ScrollTrigger (single clock; do this when using GSAP)**
```js
const lenis = new Lenis({ lerp: 0.1, autoRaf: false })
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add((t) => lenis.raf(t * 1000))   // GSAP seconds -> Lenis ms
gsap.ticker.lagSmoothing(0)
```

**3 — React Three Fiber (never put scroll in React state)**
Publish progress to a **ref** so `useFrame` reads it without re-rendering:
```jsx
const progress = useRef(0)
useEffect(() => {
  const lenis = new Lenis({ lerp: 0.09 })
  lenis.on('scroll', (e) => { progress.current = e.progress ?? e.scroll / (e.limit || 1) })
  let id = requestAnimationFrame(function raf(t){ lenis.raf(t); id = requestAnimationFrame(raf) })
  return () => { cancelAnimationFrame(id); lenis.destroy() }
}, [])
```

## API surface

`lenis.raf(timeMs)` · `lenis.scrollTo(target, {offset, duration, immediate, lock})`
`lenis.stop()` / `.start()` / `.resize()` / `.destroy()`
Read-only: `scroll`, `limit`, `progress`, `velocity`, `direction`, `isScrolling`
Events: `lenis.on('scroll', cb)`

## Rules

- **One instance per page.** Two Lenis instances fight and produce jitter.
- **Never mix `autoRaf: true` with a GSAP ticker** — that's two loops calling `raf`.
- Honour `prefers-reduced-motion`: skip Lenis entirely and use native scroll.
- Any `position: fixed` overlay must live outside the scrolled content.
- Call `lenis.resize()` after layout changes that alter page height.
- If ScrollTrigger positions look stale, ensure `lenis.on('scroll', ScrollTrigger.update)`
  is wired and call `ScrollTrigger.refresh()` after content loads.

## Attribution
Guidance distilled from Lenis v1.3.26 (MIT, © Darkroom Engineering).
Source: https://github.com/darkroomengineering/lenis
