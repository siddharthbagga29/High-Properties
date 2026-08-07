---
name: use-shader-fx
description: GPU-accelerated shader effects for React Three Fiber via use-shader-fx (v1.1.x) — real-time fluid simulation, cursor velocity trails, ping-pong distortion buffers, ripples, noise/marble fields, morph particles and blend utilities that all output a texture you can feed into any material. Use when adding a fluid or brush cursor trail, GPU ping-pong feedback, procedural noise textures, or offscreen FBO effect chains. Triggers on useFluid, useBrush, useRipple, useNoise, ping-pong buffer, FBO chain, cursor velocity trail, or GPU simulation texture.
---

# use-shader-fx — offscreen GPU effect chains

Every hook renders into its **own offscreen FBO** and hands back a texture. You compose
effects by piping one hook's `output` into the next hook's input, then sample the final
texture in your own material. Nothing is drawn to screen until you choose to.

```bash
npm i @funtech-inc/use-shader-fx
```

## The universal hook contract

Every fx hook returns the same 3-tuple:

```ts
const [updateFx, updateParams, fxObject] = useSomeFx({ size, dpr, ...opts })
// fxObject = { scene, mesh, material, camera, renderTarget, output }
```

- **`updateFx(rootState, params?)`** — call inside `useFrame`; renders one step, returns
  the output texture.
- **`updateParams(params)`** — mutate params without re-rendering React.
- **`output`** — the `THREE.Texture` to sample downstream.

```jsx
function FluidBackground() {
  const { size, viewport } = useThree()
  const [updateFluid, , fluid] = useFluid({ size, dpr: viewport.dpr })
  const mat = useRef()
  useFrame((state) => {
    const tex = updateFluid(state)            // simulate one step
    mat.current.uniforms.uTex.value = tex     // mutate ref, never setState
  })
  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={mat} uniforms={{ uTex: { value: null } }} /* … */ />
    </mesh>
  )
}
```

## Hooks by category

| Category | Hooks |
|---|---|
| **simulations** | `useFluid` (Navier–Stokes ping-pong), `useRipple` |
| **interactions** | `useBrush` — cursor velocity trail |
| **noises** | `useNoise`, `useMarble`, `useColorStrata`, `useCosPalette` |
| **effects** | `useMotionBlur`, `useSimpleBlur`, `useWave` |
| **3D** | `useMorphParticles`, `useWobble3D` |
| **utils** | `useBlending`, `useFxBlending`, `useAlphaBlending`, `useFxTexture`, `useCoverTexture`, `useDuoTone`, `useHSV`, `useBrightnessPicker` |
| **misc** | `useChromaKey`, `useDomSyncer` |
| **blank** | `useBlank`, `useRawBlank` — bring-your-own-shader FBO scaffold |

## `useFluid` params

`densityDissipation` · `velocityDissipation` · `velocityAcceleration` ·
`pressureDissipation` · `pressureIterations` · `curlStrength` · `splatRadius` ·
`fluidColor` · `pointerValues`

`pressureIterations` is the main cost dial — each iteration is a full-screen pass.
Start at ~8–16 and lower before touching resolution.

## Chaining (the real power)

```jsx
const [updateBrush, , brush] = useBrush({ size, dpr })
const [updateFx, , fx] = useFxTexture({ size, dpr })
useFrame((state) => {
  const trail = updateBrush(state)
  const distorted = updateFx(state, { map: myTexture, texture: trail })  // trail warps the map
  mat.current.uniforms.uTex.value = distorted
})
```

Cursor trail → distortion map → material is the canonical "liquid hover" effect.

## Performance rules

- Every hook is at minimum one extra full-screen pass — budget them like post-processing.
- Pass a **reduced `dpr`** to simulations (`dpr: Math.min(viewport.dpr, 1.5)`); fluid at
  full retina resolution is usually wasted.
- `size` should track `useThree().size` so buffers resize with the canvas.
- Call `updateFx` **once per frame per hook** — calling it twice double-steps the sim.
- Mutate uniforms through refs; never `setState` in `useFrame`.
- Dispose is handled by the hook lifecycle; don't manually dispose the returned
  `renderTarget` while the component is mounted.

## Attribution
Guidance distilled from use-shader-fx v1.1.43 (MIT, © FunTech Inc.).
Source: https://github.com/FunTechInc/use-shader-fx
