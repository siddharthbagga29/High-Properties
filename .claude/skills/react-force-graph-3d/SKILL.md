---
name: react-force-graph-3d
description: Interactive force-directed network graphs in React via react-force-graph (v1.48.x) — 2D canvas, 3D/WebGL, VR and AR renderers with d3-force or ngraph physics. Use when visualising networks, dependency or flow graphs, counterparty/liquidity routing, portfolio relationships, systemic-risk topologies, or any node-link data that should self-organise spatially. Triggers on ForceGraph3D, force-directed graph, node-link diagram, graph physics, d3-force, network visualisation, or linking 3D graphs into an existing R3F scene.
---

# react-force-graph — node-link graphs in 3D

Four renderers share one API: `ForceGraph2D` (canvas), `ForceGraph3D` (three.js),
`ForceGraphVR`, `ForceGraphAR`.

```bash
npm i react-force-graph-3d      # or react-force-graph for all renderers
```

```jsx
import ForceGraph3D from 'react-force-graph-3d'

const data = {
  nodes: [{ id: 'a', val: 8 }, { id: 'b', val: 3 }],
  links: [{ source: 'a', target: 'b', value: 1.4 }],
}

<ForceGraph3D
  graphData={data}
  nodeVal="val"                     // sphere volume
  nodeLabel={(n) => `${n.id}`}      // HTML tooltip
  nodeColor={(n) => n.color}
  linkWidth={(l) => l.value}
  linkDirectionalParticles={2}      // animated flow along the edge
  linkDirectionalParticleSpeed={(l) => l.value * 0.002}
  backgroundColor="#010101"
  onNodeClick={(n) => {/* … */}}
/>
```

## Data shape

Nodes need an `id`; links reference `source`/`target` by id (the library mutates them
into object references after the first render — treat `graphData` as **owned by the
graph**, and always pass a *new* object when data changes).

## Physics control

- `d3Force('charge'|'link'|'center'|…)` — reach in and tune the d3 forces.
- `d3AlphaDecay`, `d3VelocityDecay`, `cooldownTicks`, `cooldownTime` — settling speed.
- `warmupTicks` — pre-simulate before first paint so the graph opens settled.
- `numDimensions={3}` (default in 3D), `dagMode` + `dagLevelDistance` for layered/DAG
  layouts — very useful when a flow has direction (upstream → downstream).
- `forceEngine="ngraph"` as an alternative physics backend.
- `graph.zoomToFit(ms, padding)` and `graph.cameraPosition(...)` via a `ref`.

## Custom node objects (three.js)

Replace the default sphere with any `Object3D` — this is how you make it art-directed
rather than generic:

```jsx
nodeThreeObject={(node) => {
  const geo = new THREE.IcosahedronGeometry(Math.cbrt(node.val) * 1.2, 1)
  const mat = new THREE.MeshStandardMaterial({
    color: node.color, emissive: node.color,
    emissiveIntensity: node.risk, roughness: .35, metalness: .9,
  })
  return new THREE.Mesh(geo, mat)
}}
nodeThreeObjectExtend={false}
```

`linkThreeObject` + `linkPositionUpdate` do the same for edges.

## Embedding in an existing R3F scene

`ForceGraph3D` creates and owns its own renderer/canvas — it does **not** mount inside
an existing `<Canvas>`. Two options:

1. **Separate layer** (simplest): render it as its own full-screen layer, sync camera
   or z-index with your R3F canvas.
2. **Use the engine only**: import `d3-force-3d` (or `three-forcegraph`) and drive
   positions yourself inside your own R3F scene — best when the graph must share
   lighting, post-processing and a single WebGL context with the rest of the scene.

Option 2 is the right call when the graph is one element in a larger composed scene,
because multiple WebGL contexts cost memory and can't share a post-processing pipeline.

## Performance

- Freeze physics once settled (`cooldownTicks={0}` after settling, or set fixed
  `fx`/`fy`/`fz` on nodes) — idle simulation burns CPU forever otherwise.
- Beyond a few thousand nodes, prefer instanced custom objects over per-node meshes.
- `linkDirectionalParticles` are per-link animated sprites — cheap individually, heavy
  in bulk; cap them to the edges that matter.
- Mutate node/link properties in place and call `refresh()` rather than replacing
  `graphData` on every tick.

## Attribution
Guidance distilled from react-force-graph v1.48.2 (MIT, © Vasco Asturiano).
Source: https://github.com/vasturiano/react-force-graph
