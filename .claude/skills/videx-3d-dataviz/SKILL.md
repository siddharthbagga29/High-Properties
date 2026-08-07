---
name: videx-3d-dataviz
description: Architecture patterns from @equinor/videx-3d for data-driven 3D visualisation at scale in React Three Fiber — decoupling data sources from components, generator functions offloaded to workers, LOD/streaming for large datasets, pointer-event systems on custom geometry, and label/annotation layers in world space. Use when building 3D visualisations backed by large or remote datasets, streaming geometry, adding HTML annotations pinned to 3D positions, or structuring a data-to-R3F component pipeline. Triggers on data-driven 3D, geometry generators, worker-generated buffers, LOD streaming, 3D annotations, or spatial coordinate viewports.
---

# videx-3d — data-driven 3D architecture

`@equinor/videx-3d` (v3) visualises **subsurface/oil-and-gas data** — wellbore
trajectories, casings, formations, horizons. Its domain components (`Wellbores`,
`Surfaces`, `Ocean`, `UtmArea`) are **not** transferable outside that field.

What *is* transferable — and why this is worth a skill — is its **architecture** for
connecting arbitrary data to R3F components at scale. Borrow the patterns, not the
components.

## Pattern 1 — data source decoupled from components

Components never fetch. A provider supplies a data-store abstraction; components
subscribe by id through a hook (`useData`). This keeps R3F components pure and lets you
swap REST/GraphQL/websocket/mock sources without touching the scene.

```tsx
<DataProvider store={store}>          {/* store = your async data adapter */}
  <Canvas><Scene /></Canvas>
</DataProvider>

function Node({ id }) {
  const data = useData(`positions/${id}`)   // suspends or returns cached
  if (!data) return null
  return <mesh geometry={data.geometry} />
}
```

**Why:** a financial scene pulling live prices/positions has exactly this shape —
many components, one streaming source, no prop-drilling.

## Pattern 2 — generators, off the main thread

Heavy geometry construction lives in pure **generator functions** kept separate from
components (videx ships them as a distinct `/generators` export) and run in workers.
They return transferable typed arrays, not `Object3D`s.

```ts
// generator (worker): pure, no three.js scene objects
export function buildRibbon(points: Float32Array, width: number) {
  const positions = new Float32Array(/* … */)
  return { positions, indices }          // transferable
}
```

```tsx
const buffers = useGenerator('buildRibbon', [points, width])   // memoised + worker-backed
```

**Why:** the main thread stays free for the render loop — the single biggest cause of
jank in data-heavy 3D is geometry built synchronously in a component body.

## Pattern 3 — LOD + streaming

Large datasets are loaded and simplified by distance/priority rather than all at once:
request low-detail first, refine on approach, and unload what's out of range. Pair with
`<Detail>`/`THREE.LOD` and suspense boundaries so partial data renders immediately.

## Pattern 4 — world-space annotation layer

An HTML/label layer projects world positions to screen and resolves collisions, so text
stays crisp DOM (accessible, selectable) while anchored to 3D. Prefer this over 3D text
for anything a user must read or copy.

## Pattern 5 — pointer events on custom geometry

Custom buffer geometry needs explicit raycast support. Provide simplified proxy
geometry for picking rather than raycasting against millions of triangles, and
centralise hover/select state outside React state when it updates per frame.

## Applying these

For a financial 3D scene, the mapping is direct:
- data store → live market/position feed
- generators → building instanced buffers for large node/edge sets in a worker
- LOD/streaming → detail by zoom level or portfolio depth
- annotation layer → readable price/metric labels pinned to 3D objects
- proxy picking → hit-test against simple shapes, not instanced detail

## Rules

- Keep generators pure and free of three.js scene objects so they can run in a worker.
- Return transferable typed arrays; avoid structured-cloning big JS objects.
- Never build geometry inline in a component body — memoise or generate off-thread.
- Centralise per-frame interaction state in refs/stores, not React state.
- Do not pull in videx's domain components for non-subsurface work; take the patterns.

## Attribution
Patterns distilled from @equinor/videx-3d v3.0.0 (MIT, © Equinor ASA).
Source: https://github.com/equinor/videx-3d
