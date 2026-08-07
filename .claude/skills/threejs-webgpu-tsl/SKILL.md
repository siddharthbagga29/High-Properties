---
name: threejs-webgpu-tsl
description: Three.js WebGPU renderer and TSL (Three Shading Language) node materials — write shaders as composable JS/TS nodes that compile to both WGSL and GLSL, with compute shaders for GPU particle systems. Use when targeting WebGPU, writing TSL node materials, porting GLSL to TSL, building GPU compute/instanced particle simulations, or needing one shader codebase that runs on both backends. Triggers on WebGPURenderer, three/tsl, three/webgpu, TSL nodes, Fn(), storage buffers, compute shaders, or WGSL.
---

# Three.js WebGPU + TSL

TSL lets you author shaders as **JS node graphs** instead of raw shader strings. One
source compiles to WGSL (WebGPU) or GLSL (WebGL2 fallback), so you write the material
once and pick the backend at runtime.

Entry points (three r167+, verified on r185):

```js
import * as THREE from 'three/webgpu'          // WebGPURenderer + node materials
import { Fn, uv, vec3, vec4, uniform, texture, positionLocal, normalLocal,
         time, mx_noise_float, instanceIndex, storage } from 'three/tsl'
```

## Renderer with automatic WebGL fallback

```js
const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: false })
await renderer.init()                          // async — must await before first render
renderer.setSize(innerWidth, innerHeight)
console.log(renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2 fallback')
```

`WebGPURenderer` transparently falls back to WebGL2, so shipping it is safe today.
`renderer.setAnimationLoop(fn)` is required (WebGPU can't use a bare rAF + `render`).

## A TSL node material

```js
const uRisk = uniform(0.4)                                   // .value is mutable per frame

const material = new THREE.MeshStandardNodeMaterial()
material.colorNode = Fn(() => {
  const n = mx_noise_float(uv().mul(4).add(time.mul(0.1)))   // built-in MaterialX noise
  const contained = vec3(0.04, 0.10, 0.07)
  const critical  = vec3(1.0, 0.24, 0.19)
  return vec3(contained.mix(critical, n.mul(uRisk).clamp(0, 1)))
})()

// vertex displacement
material.positionNode = positionLocal.add(
  normalLocal.mul(mx_noise_float(positionLocal.mul(2).add(time)).mul(0.05))
)
```

Key node handles: `colorNode` · `positionNode` · `normalNode` · `emissiveNode` ·
`roughnessNode` · `metalnessNode` · `opacityNode` · `fragmentNode`.

Nodes are **method-chained, not operator-based**: `a.add(b).mul(c).clamp(0,1)`,
`.mix()`, `.smoothstep()`, `.length()`, `.dot()`, `.pow()`, `.oneMinus()`, `.sin()`.
Swizzles work as properties: `myVec.xy`, `myVec.rgb`.

## Uniforms & animation (performance rule 1)

```js
const uProgress = uniform(0)
// in the loop — mutate .value, never rebuild the node graph:
renderer.setAnimationLoop(() => { uProgress.value = scrollRef.current; renderer.render(scene, camera) })
```

Rebuilding a node graph recompiles the shader — never do it per frame, and in R3F never
drive it from `useState`.

## GPU compute (particle systems)

WebGPU's real unlock: simulate in storage buffers, zero CPU per particle.

```js
const count = 100_000
const positions = storage(new THREE.StorageInstancedBufferAttribute(count, 3), 'vec3', count)
const velocities = storage(new THREE.StorageInstancedBufferAttribute(count, 3), 'vec3', count)

const computeStep = Fn(() => {
  const p = positions.element(instanceIndex)
  const v = velocities.element(instanceIndex)
  p.addAssign(v.mul(0.016))
})().compute(count)

renderer.computeAsync(computeStep)             // each frame

const mat = new THREE.SpriteNodeMaterial()
mat.positionNode = positions.toAttribute()     // feed sim straight into rendering
```

## R3F integration

```jsx
import * as THREE from 'three/webgpu'
<Canvas
  gl={(props) => { const r = new THREE.WebGPURenderer(props); return r.init().then(() => r) }}
  frameloop="never"                            // let R3F resume after init resolves
/>
```
Check the installed `@react-three/fiber` version — WebGPU support matured across v8→v9,
and the async-renderer handshake differs. Verify before committing to it in production.

## Rules

- `await renderer.init()` before the first render; skipping this is the #1 blank-screen bug.
- Mutate `uniform().value`; never rebuild node graphs per frame.
- Prefer built-in TSL functions (`mx_noise_float`, `mx_fractal_noise_vec3`) over
  hand-porting GLSL noise — they compile cleanly to both backends.
- Node materials (`MeshStandardNodeMaterial`) are required; classic materials ignore nodes.
- Compute shaders are **WebGPU-only** — gate them and keep an instanced-CPU fallback.
- TSL is still evolving; pin your `three` version and re-check the API on upgrade.

## Attribution
Guidance distilled from three.js r185 (MIT, © three.js authors), `three/tsl` and
`three/webgpu` entry points. Source: https://github.com/mrdoob/three.js
