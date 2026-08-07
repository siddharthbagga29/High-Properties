---
name: react-three-next
description: Production architecture for Next.js + React Three Fiber — a persistent global canvas alongside the App Router, DOM/3D component co-location, dynamic imports to keep three.js out of the initial bundle, and GLSL loader setup. Use when scaffolding a Next.js 3D site, keeping WebGL state alive across route changes, code-splitting three.js, or wiring shaders in a Next build. Triggers on Next.js three.js setup, R3F with App Router, persistent canvas, tunnel-rat, glslify loader, or SSR-safe 3D.
---

# Next.js + React Three Fiber architecture

The pmndrs `react-three-next` pattern. The problem it solves: a `<Canvas>` inside a page
is destroyed on every navigation (context loss, asset re-upload, visible flash). The fix
is **one canvas at layout level** that pages *portal into*.

Reference stack: Next 14 (App Router) · R3F 8 · drei 9 · three 0.160 · Tailwind ·
`glslify-loader` for shaders. MIT.

## The persistent-canvas pattern

```jsx
// app/layout.jsx — canvas mounted ONCE, survives navigation
import { Scene } from '@/components/canvas/Scene'

export default function RootLayout({ children }) {
  return (
    <html><body>
      {children}
      <Scene className="pointer-events-none fixed inset-0" eventSource={ref} eventPrefix="client" />
    </body></html>
  )
}
```

```jsx
// components/canvas/Scene.jsx — client-only, never SSR'd
'use client'
import { Canvas } from '@react-three/fiber'
import { Preload } from '@react-three/drei'
import { r3f } from '@/helpers/global'          // tunnel-rat instance

export function Scene(props) {
  return (
    <Canvas {...props} onCreated={(s) => (s.gl.toneMappingExposure = 1)}>
      <r3f.Out />                                {/* pages render in here */}
      <Preload all />
    </Canvas>
  )
}
```

```jsx
// helpers/global.js
import { tunnel } from 'tunnel-rat'
export const r3f = tunnel()
```

```jsx
// components/View.jsx — co-locate DOM + 3D, portal the 3D upward
'use client'
import { View as ViewImpl } from '@react-three/drei'
import { r3f } from '@/helpers/global'

export const Three = ({ children }) => <r3f.In>{children}</r3f.In>

export const View = ({ children, ...props }) => {
  const ref = useRef(null)
  return (
    <>
      <div ref={ref} {...props} />                {/* DOM box defines the viewport */}
      <Three><ViewImpl track={ref}>{children}</ViewImpl></Three>
    </>
  )
}
```

Now any page writes 3D next to its markup, and it renders in the one shared canvas:

```jsx
<View className="h-96 w-full">
  <mesh><boxGeometry /><meshStandardMaterial /></mesh>
  <OrbitControls />
</View>
```

## SSR safety & bundle size

three.js is large and touches `window`. Always dynamic-import client 3D:

```jsx
const View = dynamic(() => import('@/components/View').then((m) => m.View), {
  ssr: false,
  loading: () => <div className="h-96 animate-pulse rounded bg-white/5" />,
})
```

- Keep every 3D file under `components/canvas/` and mark `'use client'`.
- Never import `three` from a Server Component or `layout.jsx` directly.
- `drei`'s `<View track={ref}>` scissors the canvas to a DOM rect — that's what makes
  multiple independent "3D windows" share one context.

## GLSL in Next

```js
// next.config.js
webpack(config) {
  config.module.rules.push({
    test: /\.(glsl|vs|fs|vert|frag)$/,
    use: ['raw-loader', 'glslify-loader'],   // or { type: 'asset/source' } for raw only
  })
  return config
}
```

## Rules

- One `<Canvas>` per app. Multiple canvases = multiple WebGL contexts; browsers cap
  these (~8–16) and will drop the oldest.
- `eventSource` + `eventPrefix="client"` let a fixed, `pointer-events-none` canvas still
  receive pointer events routed from the DOM tree.
- `<Preload all />` warms shaders/textures so first interaction doesn't hitch.
- Animate with refs in `useFrame`; React state per frame kills the frame budget.
- Pair with `r3f-scroll-rig` when DOM elements should *drive* mesh layout, and with
  `lenis-smooth-scroll` for scroll momentum.

## Attribution
Guidance distilled from the react-three-next starter (MIT, © Poimandres).
Source: https://github.com/pmndrs/react-three-next
