---
name: theatre-js-sequencing
description: Theatre.js animation sequencing for the web — keyframe any JS object or Three.js/R3F scene through a visual editor, then play the saved state in production. Use when choreographing multi-step camera narration, art-directing 3D scene animation on a timeline, scrubbing animation to scroll, or when a designer needs to tune motion without editing code. Triggers on Theatre.js, getProject, useCurrentSheet, SheetProvider, editable camera, timeline sequencing, or keyframed 3D animation.
---

# Theatre.js sequencing

An animation *tool*, not a tween library: you open a visual editor in dev, keyframe
values on a timeline, save the state to JSON, then ship that JSON and play it back.
Use it when hand-tuned camera choreography beats programmatic lerps.

```bash
npm i @theatre/core @theatre/studio          # studio is dev-only
npm i @theatre/r3f                           # for React Three Fiber
```

## Core concepts

| Term | Meaning |
|---|---|
| **Project** | Top-level container; owns the saved state JSON. |
| **Sheet** | A timeline. One per scene/section. |
| **Object** | A named bag of props you keyframe. |
| **Sequence** | The playhead: `sheet.sequence.position`, `.play()`, `.attachAudio()`. |

## Vanilla / Three.js

```js
import { getProject, types } from '@theatre/core'
import studio from '@theatre/studio'
if (import.meta.env.DEV) studio.initialize()          // never in production

const sheet = getProject('Risk Journey').sheet('Scene')
const obj = sheet.object('Camera', {
  position: { x: types.number(0), y: types.number(0), z: types.number(6) },
  intensity: types.number(1, { range: [0, 3] }),
})
obj.onValuesChange((v) => {
  camera.position.set(v.position.x, v.position.y, v.position.z)
})
sheet.sequence.play({ iterationCount: Infinity })
```

## React Three Fiber

```jsx
import { getProject } from '@theatre/core'
import { SheetProvider, editable as e, PerspectiveCamera } from '@theatre/r3f'
import state from './state.json'                       // exported from studio

const sheet = getProject('Risk Journey', { state }).sheet('Scene')

<Canvas>
  <SheetProvider sheet={sheet}>
    <PerspectiveCamera theatreKey="Camera" makeDefault position={[0,0,6]} />
    <e.mesh theatreKey="Tile">
      <boxGeometry /><meshStandardMaterial />
    </e.mesh>
  </SheetProvider>
</Canvas>
```

Any `<e.*>` element becomes selectable and keyframeable in the studio UI.

## Scrub the timeline to scroll (the narrative pattern)

Bind sequence position to scroll progress instead of playing in real time:

```jsx
import { useCurrentSheet } from '@theatre/r3f'

function ScrollNarration({ progressRef }) {           // Lenis progress ref, 0..1
  const sheet = useCurrentSheet()
  useFrame(() => {
    const len = sheet.sequence.pointer.length ? val(sheet.sequence.pointer.length) : 1
    sheet.sequence.position = THREE.MathUtils.clamp(progressRef.current, 0, 1) * len
  })
  return null
}
```

This is the clean way to art-direct a "camera flies through chapters" story: keyframe
it visually once, then drive `sequence.position` from scroll.

## Production workflow

1. Dev: `studio.initialize()`, keyframe in the browser UI.
2. Export the project state from the studio toolbar → `state.json`.
3. Prod: pass `{ state }` into `getProject(...)` and **do not** import `@theatre/studio`
   (tree-shake or dynamic-import it behind a dev check) — it's a large editor bundle.

## Rules

- Studio must never ship to production; gate it on `NODE_ENV`/`import.meta.env.DEV`.
- The saved `state.json` is the source of truth — commit it.
- `theatreKey` values are identity: renaming one orphans its keyframes.
- Theatre owns the props it animates; don't also mutate them in `useFrame`.
- For simple one-off tweens, GSAP is lighter — Theatre earns its weight when there is
  real choreography or a designer in the loop.
- Licence differs from the rest of this stack: **Apache-2.0**.

## Attribution
Guidance distilled from Theatre.js (Apache-2.0, © Theatre.js contributors).
Source: https://github.com/theatre-js/theatre
