import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { sfx } from '../audio/sound'
import { useStore } from '../store'
import { live, PALETTE } from './shared'
import { districtCenter, PLATE_R, R_DISTRICT, R_PLAZA, RING, ringAngle } from './world'

/** The stage: a polar instrument dial with a slow radar sweep. Rings every 3 units, spokes every 45°. */
export function Ground() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, cLine: { value: PALETTE.active }, cBase: { value: PALETTE.ground }, cViolet: { value: PALETTE.violet } },
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 cLine, cBase, cViolet; varying vec2 vP;
      float line(float v, float w){ float d = abs(fract(v) - 0.5); return 1.0 - smoothstep(0.5 - w, 0.5, d); }
      void main(){
        float r = length(vP); float a = atan(vP.y, vP.x);
        float rings = line(r / 3.0, 0.02) * 0.35;
        float major = (1.0 - smoothstep(0.0, 0.08, abs(r - ${R_DISTRICT.toFixed(1)}))) * 0.5 + (1.0 - smoothstep(0.0, 0.06, abs(r - ${R_PLAZA.toFixed(1)} - 2.0))) * 0.5;
        float rad = line(a / (3.14159265 / 8.0), 0.012 * r) * 0.18 * smoothstep(4.0, 12.0, r);
        float sweepA = mod(a - uTime * 0.25, 6.2831853);
        float sweep = exp(-sweepA * 2.2) * 0.35 * smoothstep(6.0, 20.0, r);
        float fade = 1.0 - smoothstep(30.0, 48.0, r);
        vec3 col = cLine * (rings + major + rad) + mix(cLine, cViolet, 0.5) * sweep;
        float alpha = (rings + major + rad + sweep) * fade * 0.55 + 0.0;
        gl_FragColor = vec4(col, alpha);
      }`,
  }), [])
  useFrame(() => { material.uniforms.uTime.value = live.time * live.motion })
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} material={material} raycast={() => null} renderOrder={-1}>
      <circleGeometry args={[48, 128]} />
    </mesh>
  )
}

export interface PlateStat { agent: string; done: number; total: number; working: boolean; waiting: boolean }

/** One plate per district. Its rim is a gauge: one tick per task, the arc filled for tasks built. */
export function Plates({ stats }: { stats: PlateStat[] }) {
  return <>{RING.map(a => <Plate key={a} agent={a} stat={stats.find(s => s.agent === a)} />)}</>
}

function Plate({ agent, stat }: { agent: string; stat?: PlateStat }) {
  const [cx, cz] = districtCenter(agent)
  const ai = RING.indexOf(agent as (typeof RING)[number]) + 1
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uProgress: { value: 0 }, uTicks: { value: 1 }, uWorking: { value: 0 }, uFocus: { value: 0 }, uHover: { value: 0 },
      cLine: { value: PALETTE.active }, cViolet: { value: PALETTE.violet } },
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uProgress, uTicks, uWorking, uFocus, uHover; uniform vec3 cLine, cViolet; varying vec2 vP;
      void main(){
        float R = ${PLATE_R.toFixed(2)};
        float r = length(vP) / R; float a = atan(vP.x, vP.y); float f = (a + 3.14159265) / 6.2831853;
        float fill = smoothstep(1.0, 0.0, r) * (0.08 + 0.1 * uFocus + 0.06 * uHover);
        float rim = 1.0 - smoothstep(0.0, 0.025, abs(r - 0.94));
        float gauge = (1.0 - smoothstep(0.0, 0.035, abs(r - 1.0))) * step(f, uProgress);
        float tick = (1.0 - smoothstep(0.0, 0.03, abs(fract(f * uTicks) - 0.5) - 0.47)) * step(0.97, r) * step(r, 1.05);
        float pulse = uWorking * (1.0 - smoothstep(0.0, 0.05, abs(r - fract(uTime * 0.35)))) * 0.6;
        vec3 col = cLine * (rim * 0.5 + gauge * 1.6 + tick * 0.6) + mix(cViolet, cLine, 0.4) * (fill + pulse);
        gl_FragColor = vec4(col, rim * 0.35 + gauge * 0.95 + tick * 0.5 + fill + pulse);
      }`,
  }), [])
  useFrame((_, dt) => {
    const u = material.uniforms
    const s = useStore.getState()
    u.uTime.value = live.time * live.motion
    u.uProgress.value += ((stat ? stat.done / Math.max(stat.total, 1) : 0) - u.uProgress.value) * (1 - Math.exp(-dt * 3))
    u.uTicks.value = Math.max(stat?.total ?? 1, 1)
    u.uWorking.value = stat?.working ? 1 : 0
    const f = s.focus.kind === 'agent' && s.focus.id === agent ? 1 : 0
    u.uFocus.value += (f - u.uFocus.value) * (1 - Math.exp(-dt * 5))
    const h = s.hover?.kind === 'agent' && s.hover.id === agent ? 1 : 0
    u.uHover.value += (h - u.uHover.value) * (1 - Math.exp(-dt * 8))
  })
  const st = useStore.getState
  return (
    <mesh rotation-x={-Math.PI / 2} position={[cx, 0.03, cz]} material={material}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); if (st().hover?.id !== agent) sfx.hover(); st().set({ hover: { kind: 'agent', id: agent } }); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { if (st().hover?.id === agent) st().set({ hover: null }); document.body.style.cursor = '' }}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta > 25) return; sfx.dive(); st().select({ kind: 'agent', id: agent }) }}
      userData={{ ai }}>
      <circleGeometry args={[PLATE_R * 1.08, 96]} />
    </mesh>
  )
}

/** Spokes from the brain's plaza to each district. Static; dashes flow only while that agent really has a session working. */
export function Spokes({ working }: { working: string[] }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOn: { value: new Float32Array(8) }, cLine: { value: PALETTE.active }, cViolet: { value: PALETTE.violet } },
    vertexShader: /* glsl */ `attribute float aIdx; attribute float aT; varying float vIdx; varying float vT; varying float vSide; attribute float aSide;
      void main(){ vIdx = aIdx; vT = aT; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uOn[8]; uniform vec3 cLine, cViolet; varying float vIdx; varying float vT; varying float vSide;
      void main(){
        int i = int(vIdx + 0.5); float on = uOn[i];
        float edge = 1.0 - smoothstep(0.6, 1.0, abs(vSide));
        float dash = step(0.55, fract(vT * 14.0 - uTime * (0.5 + on * 1.5)));
        float a = edge * (0.12 + on * (0.25 + 0.45 * dash));
        gl_FragColor = vec4(mix(cViolet, cLine, 0.4 + on * 0.6), a);
      }`,
  }), [])
  const geometry = useMemo(() => {
    const pos: number[] = [], idx: number[] = [], t: number[] = [], side: number[] = [], tri: number[] = []
    RING.forEach((_, i) => {
      const a = ringAngle(i), ux = Math.cos(a), uz = Math.sin(a), vx = -uz * 0.45, vz = ux * 0.45
      const r0 = R_PLAZA + 2.2, r1 = R_DISTRICT - PLATE_R - 0.4
      const base = pos.length / 3
      for (const [r, tt] of [[r0, 0], [r1, 1]]) for (const s of [-1, 1]) {
        pos.push(ux * r + vx * s, 0.04, uz * r + vz * s); idx.push(i); t.push(tt * (r1 - r0) / 3); side.push(s)
      }
      tri.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('aIdx', new THREE.Float32BufferAttribute(idx, 1))
    g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1))
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1))
    g.setIndex(tri)
    return g
  }, [])
  useFrame(() => {
    material.uniforms.uTime.value = live.time * live.motion
    const on = material.uniforms.uOn.value as Float32Array
    RING.forEach((a, i) => { on[i] = working.includes(a) ? 1 : 0 })
  })
  return <mesh geometry={geometry} material={material} raycast={() => null} />
}

/** Words on the ground, Bruno-style: a ring around the plaza that says how to read the city. */
export function LegendRing() {
  const { geometry, material } = useMemo(() => {
    const text = 'THE BRAIN = THE PLAN AND THE ORCHESTRATOR  ·  DISTRICTS = AI AGENTS  ·  TOWERS = TASKS  ·  ARCS = WHO FEEDS WHOM  ·  PULSES = A LIVE HAND-OFF  ·  '
    const c = document.createElement('canvas')
    c.width = 4096; c.height = 96
    const ctx = c.getContext('2d')!
    const drawText = () => {
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.fillStyle = 'rgba(143,230,255,0.85)'
      ctx.textBaseline = 'middle'
      // Size the text to fill the texture exactly once, so the wrap-around has no seam.
      ctx.font = '600 52px "IBM Plex Mono", ui-monospace, monospace'
      const size = Math.min(60, (52 * c.width) / ctx.measureText(text).width)
      ctx.font = `600 ${size.toFixed(2)}px "IBM Plex Mono", ui-monospace, monospace`
      ctx.fillText(text, 0, 50)
      tex.needsUpdate = true
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.RepeatWrapping
    tex.anisotropy = 8
    drawText()
    document.fonts?.ready.then(drawText).catch(() => undefined)
    const r0 = R_PLAZA + 3.2, r1 = R_PLAZA + 4.4, seg = 256
    const pos: number[] = [], uv: number[] = [], idx: number[] = []
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2
      // Text reads clockwise when seen from above.
      pos.push(Math.cos(a) * r1, 0.05, -Math.sin(a) * r1, Math.cos(a) * r0, 0.05, -Math.sin(a) * r0)
      uv.push((i / seg) * 2, 0, (i / seg) * 2, 1)
      if (i < seg) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2) }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.85, toneMapped: false })
    return { geometry: g, material: m }
  }, [])
  useFrame(() => { material.opacity = 0.85 * Math.min(1, live.assemble * 1.2) })
  return <mesh geometry={geometry} material={material} raycast={() => null} />
}

/** The entrance moment: a ring of light radiates from the brain and lights the districts as it passes. */
export function Shockwave({ at }: { at: number | null }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uR: { value: 0 }, uA: { value: 0 }, cLine: { value: PALETTE.active } },
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uR, uA; uniform vec3 cLine; varying vec2 vP;
      void main(){ float d = abs(length(vP) - uR); float a = (1.0 - smoothstep(0.0, 0.9, d)) * uA; gl_FragColor = vec4(cLine * 1.4, a); }`,
  }), [])
  const start = useMemo(() => ({ t: -1 }), [])
  useFrame(() => {
    if (at !== null && start.t < 0) start.t = live.time
    if (start.t < 0) return
    const f = (live.time - start.t) / 1.8
    const e = 1 - Math.pow(1 - Math.min(f, 1), 3)
    material.uniforms.uR.value = 3.5 + e * 44
    material.uniforms.uA.value = f < 1 ? 1 - f * 0.9 : 0
  })
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.08, 0]} material={material} raycast={() => null}>
      <circleGeometry args={[50, 128]} />
    </mesh>
  )
}
