---
name: r3f-postprocessing
description: Post-processing effects for React Three Fiber via @react-three/postprocessing (v3.x) — EffectComposer, Bloom, DepthOfField, ChromaticAberration, Noise, Glitch, and custom GLSL passes with wrapEffect. Use when adding bloom/glow, film grain, distortion or fluid transitions to an R3F scene, writing a custom full-screen shader effect, or tuning post-processing performance. Triggers on EffectComposer, postprocessing, bloom, custom Effect class, wrapEffect, or full-screen shader pass.
---

# React Three Fiber post-processing

Wraps the `postprocessing` library so effects merge into as few passes as possible.
Prefer it over hand-rolled `EffectComposer` — merged effects mean fewer draw calls.

```bash
npm i @react-three/postprocessing postprocessing
```

## Basic composer

```jsx
import { EffectComposer, Bloom, Noise, Vignette } from '@react-three/postprocessing'

<EffectComposer multisampling={0}>            {/* 0 = cheaper; use SMAA instead */}
  <Bloom intensity={0.6} luminanceThreshold={0.6} luminanceSmoothing={0.3} mipmapBlur />
  <Noise opacity={0.02} />
  <Vignette eskil={false} offset={0.1} darkness={0.9} />
</EffectComposer>
```

Ordering is render order — grade/blur before grain/vignette.

## Custom GLSL effect (the important pattern)

Two pieces: a `postprocessing` `Effect` subclass, then `wrapEffect` to get a component.

```jsx
import { Effect } from 'postprocessing'
import { wrapEffect } from '@react-three/postprocessing'
import { Uniform } from 'three'

const frag = /* glsl */`
  uniform float uProgress;
  // Signature is fixed. inputColor = the scene; write to outputColor.
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 offset = vec2(0.02 * uProgress, 0.0);
    outputColor = vec4(
      texture2D(inputBuffer, uv + offset).r,
      inputColor.g,
      texture2D(inputBuffer, uv - offset).b,
      inputColor.a);
  }`

class MyPass extends Effect {
  constructor({ progress = 0 } = {}) {
    super('MyPass', frag, { uniforms: new Map([['uProgress', new Uniform(progress)]]) })
  }
  update(renderer, inputBuffer, dt) { /* per-frame; mutate uniforms here */ }
}

export const MyEffect = wrapEffect(MyPass)
```

**`wrapEffect(EffectClass, defaults?)`** returns a component. In **v3.x** `ref` arrives as a
normal prop (React 19 style) — do **not** wrap it in `forwardRef`. Props are forwarded to
the constructor; changing them re-instantiates the effect, so drive per-frame values
through a **ref + `useFrame`**, never through props:

```jsx
const ref = useRef()
useFrame(() => { ref.current.uniforms.get('uProgress').value = progressRef.current })
return <MyEffect ref={ref} />
```

**Version caution:** the `wrapEffect` contract changed across majors (v2 used
`forwardRef`, some v2.x builds took a `blendFunction` 2nd arg). If a custom effect
throws about refs or arguments, check the installed major first — that is almost
always the cause.

`mainImage` vs `mainUv`: use `mainUv(inout vec2 uv)` for pure UV distortion (cheaper,
composes with other effects); `mainImage` when you need to sample colour yourself.

## Effects available (v3.x)

Bloom · SelectiveBloom · DepthOfField · Autofocus · N8AO · SSAO · ChromaticAberration ·
Glitch · Noise · Scanline · Pixelation · DotScreen · ASCII · Grid · Outline · GodRays ·
LensFlare · TiltShift · HueSaturation · BrightnessContrast · ColorAverage · ColorDepth ·
Sepia · LUT · Ramp · ShockWave · Texture · Depth · Vignette · SMAA · FXAA

## Performance

- Post-processing is **full-screen per pass** — cost scales with pixels, not scene size.
- Set `multisampling={0}` and add `<SMAA />` instead; MSAA on the composer is expensive.
- `mipmapBlur` on Bloom is far cheaper than large kernel sizes.
- Gate expensive passes on an amplitude that is 0 at rest, so idle frames cost nothing.
- Depth-based effects (DoF, SSAO, N8AO) need a depth buffer — heaviest; profile first.
- Drop DPR before dropping effects: `<PerformanceMonitor onDecline={() => setDpr(1)} />`.

## Attribution
Guidance distilled from @react-three/postprocessing v3.0.4 (MIT, © Poimandres).
Source: https://github.com/pmndrs/react-postprocessing
