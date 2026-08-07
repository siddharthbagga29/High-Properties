---
name: r3f-scroll-rig
description: Progressive-enhancement architecture with @14islands/r3f-scroll-rig — a single GlobalCanvas behind normal DOM, where WebGL meshes track DOM element positions via ScrollScene/UseCanvas. Use when building "Unseen-style" sites where accessible HTML is the source of truth and WebGL is a visual layer, syncing 3D objects to DOM layout, or adding WebGL image/tile effects that degrade gracefully. Triggers on GlobalCanvas, ScrollScene, UseCanvas, useTracker, DOM-to-WebGL sync, or WebGL-as-enhancement architecture.
---

# r3f-scroll-rig — DOM-first, WebGL-as-enhancement

The 14islands architecture. One persistent `<GlobalCanvas>` is fixed behind the page;
regular DOM elements act as **placeholders**, and WebGL meshes are positioned to match
their bounding boxes. Kill the canvas and the site still works — this is the pattern to
reach for when accessibility and SEO must survive an immersive design.

```bash
npm i @14islands/r3f-scroll-rig @react-three/fiber three
```

## Architecture

```jsx
// layout — one canvas for the whole app, mounted once
import { GlobalCanvas, SmoothScrollbar } from '@14islands/r3f-scroll-rig'

<>
  <GlobalCanvas>{/* optional global/persistent scene contents */}</GlobalCanvas>
  <SmoothScrollbar>{(bind) => <main {...bind}>{children}</main>}</SmoothScrollbar>
</>
```

```jsx
// any component — DOM element is the layout authority
import { UseCanvas, ScrollScene } from '@14islands/r3f-scroll-rig'

function Tile({ children }) {
  const el = useRef()
  return (
    <>
      <div ref={el} className="tile">{children}</div>  {/* real, accessible DOM */}
      <UseCanvas>
        <ScrollScene track={el}>
          {({ scale, ...props }) => (
            <mesh {...props}>
              <planeGeometry args={[scale.width, scale.height]} />
              <meshBasicMaterial color="#0b0d10" />
            </mesh>
          )}
        </ScrollScene>
      </UseCanvas>
    </>
  )
}
```

`UseCanvas` portals children into the global canvas only while that component is
mounted — so scenes mount/unmount with routes without tearing down the WebGL context.

## Exports

`GlobalCanvas` · `ScrollScene` · `ViewportScrollScene` · `UseCanvas` · `SmoothScrollbar`
Hooks: `useScrollRig` · `useCanvas` · `useScrollbar` · `useTracker` · `useWindowSize` ·
`useImageAsTexture` · `useCanvasStore` · `styles`

- **`ScrollScene`** — mesh shares the global camera; cheapest, use by default.
- **`ViewportScrollScene`** — isolated scene + own camera, rendered in a scissored
  viewport. Use for true 3D objects needing their own perspective/lighting. Costs a
  render pass each.
- **`useTracker(ref)`** — raw DOM-tracking numbers (`bounds`, `scale`, `progress`,
  `visibility`, `viewport`) when you want to drive something yourself.
- **`useImageAsTexture(ref)`** — turns an existing `<img>` into a texture, so the DOM
  image is the loading/SEO source of truth and WebGL just enhances it.

## Progressive enhancement

The DOM already renders everything; WebGL adds visuals on top. To go further:

```jsx
const [webgl, setWebgl] = useState(false)
useEffect(() => {
  const gl = document.createElement('canvas').getContext('webgl2')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  setWebgl(!!gl && !reduced && (navigator.deviceMemory ?? 4) >= 4)
}, [])
// hide the DOM visual only when WebGL actually took over
<div className="tile" data-webgl={webgl} ref={el}>…</div>
```

Style the DOM placeholder so it looks correct **before** and **without** WebGL; fade it
only once the canvas confirms it is drawing.

## Rules

- One `GlobalCanvas` per app, mounted at layout level — never per route.
- DOM element sizes drive WebGL; don't set mesh size manually inside `ScrollScene`
  (use the provided `scale`).
- Animate inside `useFrame` with refs — never React state per frame.
- `ViewportScrollScene` is expensive; prefer `ScrollScene` unless you need isolation.
- Pairs naturally with Lenis (`SmoothScrollbar` wraps a smooth-scroll implementation);
  don't run a second competing smooth-scroll library.

## Attribution
Guidance distilled from @14islands/r3f-scroll-rig (MIT, © 14islands).
Source: https://github.com/14islands/r3f-scroll-rig
