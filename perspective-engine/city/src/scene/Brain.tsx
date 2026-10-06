import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { sfx } from '../audio/sound'
import { useStore } from '../store'
import { live, PALETTE, SNOISE } from './shared'
import { BRAIN_C, BRAIN_S, MAX_TASKS, type BrainOutput } from './world'

const vertex = /* glsl */ `
uniform float uTime, uAssemble, uSize, uPR, uMotion, uFocusTask, uFocusAgent, uFocusMix, uMouseR, uMouseOn, uHover;
uniform vec3 uMouse, uBrainC;
uniform float uStatus[${MAX_TASKS}];
uniform float uFresh[${MAX_TASKS}];
uniform float uVisible[${MAX_TASKS}];
uniform float uGlow[9];
uniform vec3 cIdle, cActive, cViolet, cRose, cMote;
attribute vec3 aScatter;
attribute vec4 aInfo;
varying vec3 vColor;
varying float vAlpha;
${SNOISE}
void main() {
  float kind = aInfo.z, rnd = aInfo.w;
  int ti = int(aInfo.x + 0.5);
  int ai = int(aInfo.y + 0.5);
  vec3 col = cActive; float alpha = 1.0; float size = 1.0;
  float glow = uGlow[ai];
  if (kind < 0.5) {
    float st = uStatus[ti];
    if (st < 0.5)      { col = mix(cIdle, cViolet, 0.55); alpha = 0.35; }
    else if (st < 1.5) { col = mix(cIdle, cActive, 0.6); alpha = 0.5; }
    else if (st < 2.5) { float s = 0.5 + 0.5 * sin(uTime * 5.0 + rnd * 30.0); col = mix(cViolet, vec3(1.0), 0.35 + 0.5 * s); alpha = 0.9; size = 1.15; }
    else if (st < 3.5) { col = mix(cActive, vec3(1.0), 0.18); alpha = 1.0; size = 1.1; }
    else if (st < 4.5) { float p = 0.6 + 0.4 * sin(uTime * 2.2); col = mix(cViolet, cActive, 0.2 * p); alpha = 0.65 + 0.3 * p; }
    else               { col = cRose; alpha = 0.7; }
    float fr = uFresh[ti];
    col = mix(col, vec3(1.0), fr * 0.9); size += fr * 1.8;
    alpha *= mix(0.08, 1.0, uVisible[ti]);
    float isF = uFocusTask >= 0.0 ? step(abs(float(ti) - uFocusTask), 0.5) : (uFocusAgent >= 0.0 ? step(abs(aInfo.y - uFocusAgent), 0.5) : 1.0);
    alpha *= mix(1.0, mix(0.18, 1.25, isF), uFocusMix);
  } else if (kind < 1.5) {
    col = mix(cIdle, cActive, 0.3 + glow * 0.5); alpha = 0.4 + glow * 0.4; size = 0.9;
    float isF = uFocusAgent >= 0.0 ? step(abs(aInfo.y - uFocusAgent), 0.5) : 1.0;
    alpha *= mix(1.0, mix(0.3, 1.3, isF), uFocusMix);
  } else if (kind < 2.5) {
    float flow = 0.5 + 0.5 * sin(uTime * 2.0 - rnd * 40.0);
    col = mix(cViolet, cActive, flow); alpha = 0.18 + 0.3 * flow; size = 0.8;
  } else {
    col = cMote; alpha = 0.07 + 0.08 * rnd; size = 0.7 + rnd;
  }
  float a = clamp(uAssemble * 1.5 - rnd * 0.5, 0.0, 1.0);
  a = a * a * (3.0 - 2.0 * a);
  vec3 pos = mix(aScatter, position, a);
  float tn = uTime * 0.06;
  vec3 q = pos * 0.11;
  float amp = uMotion * (0.1 + (1.0 - a) * 1.6);
  pos += amp * vec3(snoise(q + vec3(tn, 0.0, 0.0)), snoise(q + vec3(0.0, tn + 31.7, 0.0)), snoise(q + vec3(0.0, 0.0, tn + 57.3)));
  pos = uBrainC + (pos - uBrainC) * (1.0 + (0.016 * sin(uTime * 0.9) + uHover * 0.03) * uMotion);
  vec3 dm = pos - uMouse; float dl = length(dm);
  pos += (dl > 0.001 ? dm / dl : vec3(0.0)) * uMouseOn * uMouseR * 0.55 * (1.0 - smoothstep(0.0, uMouseR, dl));
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * size * uPR * (60.0 / -mv.z), 0.0, 14.0 * uPR);
  vColor = col;
  vAlpha = alpha * (0.25 + 0.75 * a);
}`

const fragment = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main() {
  float s = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); s *= s;
  if (s < 0.01) discard;
  gl_FragColor = vec4(vColor, s * vAlpha);
}`

/** The brain at the centre of the world: the plan and the orchestrator, one patch of cortex per task. */
export function Brain({ buf }: { buf: BrainOutput }) {
  const pr = useThree(s => s.viewport.dpr)
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(buf.pos, 3))
    g.setAttribute('aScatter', new THREE.BufferAttribute(buf.scatter, 3))
    g.setAttribute('aInfo', new THREE.BufferAttribute(buf.info, 4))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(...BRAIN_C), 90)
    return g
  }, [buf])
  useEffect(() => () => geometry.dispose(), [geometry])
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uAssemble: { value: 0 }, uSize: { value: 1.75 }, uPR: { value: 1 }, uMotion: { value: 1 },
      uFocusTask: { value: -1 }, uFocusAgent: { value: -1 }, uFocusMix: { value: 0 }, uHover: { value: 0 },
      uMouse: { value: live.mouse }, uMouseR: { value: 1.8 }, uMouseOn: { value: 0 }, uBrainC: { value: new THREE.Vector3(...BRAIN_C) },
      uStatus: { value: live.status }, uFresh: { value: live.fresh }, uVisible: { value: live.visible }, uGlow: { value: live.agentGlow },
      cIdle: { value: PALETTE.idle }, cActive: { value: PALETTE.active }, cViolet: { value: PALETTE.violet }, cRose: { value: PALETTE.rose }, cMote: { value: PALETTE.mote },
    },
  }), [])
  useEffect(() => () => material.dispose(), [material])
  useFrame((_, dt) => {
    const u = material.uniforms
    u.uTime.value = live.time; u.uAssemble.value = live.assemble; u.uPR.value = pr; u.uMotion.value = live.motion
    u.uFocusTask.value = live.focusTask; u.uFocusAgent.value = live.focusAgent; u.uFocusMix.value = live.focusMix
    u.uMouseR.value = live.mouseR; u.uMouseOn.value = live.mouseOn
    const h = useStore.getState().hover?.kind === 'brain' ? 1 : 0
    u.uHover.value += (h - u.uHover.value) * (1 - Math.exp(-dt * 6))
  })
  const s = useStore.getState
  return (
    <>
      <points geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
      {/* Hit target: the brain is one clickable object. */}
      <mesh position={BRAIN_C} scale={[BRAIN_S * 0.95, BRAIN_S * 0.62, BRAIN_S * 1.05]}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); if (s().hover?.kind !== 'brain') sfx.hover(); s().set({ hover: { kind: 'brain', id: 'brain' } }); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { if (s().hover?.kind === 'brain') s().set({ hover: null }); document.body.style.cursor = '' }}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta > 25) return; sfx.dive(); s().select({ kind: 'brain' }) }}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </>
  )
}
