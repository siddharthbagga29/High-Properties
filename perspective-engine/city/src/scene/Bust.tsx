import { Html } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import { sfx } from '../audio/sound'
import { bodyArrivals, faceTooltip, partDetail, partName, type BodyView } from '../jarvis/body'
import { useStore } from '../store'
import { labelLayer } from './portal'
import { live, PALETTE } from './shared'
import { ARMS, BUST_PARTS, FACE, handOf, N_PARTS, SHAPE, type BustOutput } from './bust'
import { BRAIN_C, BRAIN_S, districtCenter, type Tower } from './world'

/**
 * Per-frame body state shared without React re-renders. Targets come from the record (bodyAt); the shown values ease
 * toward them so a part visibly assembles when a task is verified.
 */
export const bodyLive = {
  done: new Float32Array(N_PARTS),
  fill: new Float32Array(N_PARTS),
  flash: new Float32Array(N_PARTS),
  hover: new Float32Array(N_PARTS),
  face: 0,
  target: { done: new Float32Array(N_PARTS), fill: new Float32Array(N_PARTS), face: 0 },
  streams: 0,
}

/** The hovered body part (index into BUST_PARTS) and where the pointer met it. */
export const useBodyHover = create<{ part: number | null; at: THREE.Vector3 | null; src: string | null }>(() => ({ part: null, at: null, src: null }))

const SHARED = /* glsl */ `
uniform float uTime, uAssemble, uMotion, uBeat, uBreath;
uniform float uDone[${N_PARTS}], uFill[${N_PARTS}], uFlash[${N_PARTS}], uHover[${N_PARTS}];
uniform vec3 uHeartC, uLungR, uLungL;
uniform vec3 cIdle, cActive, cViolet, cMote;
vec3 organMotion(int pi, vec3 p) {
  if (pi == 2) return uHeartC + (p - uHeartC) * (1.0 + uBeat * 0.075);
  if (pi == 3) { vec3 c = p.x > 0.0 ? uLungR : uLungL; return c + (p - c) * (1.0 + uBreath * 0.035); }
  return p;
}`

const vertex = /* glsl */ `
${SHARED}
uniform float uSize, uPR, uFace, uScanY;
attribute vec3 aScatter;
attribute vec4 aInfo;
attribute vec3 aNrm;
varying vec3 vColor;
varying float vAlpha;
void main() {
  int pi = int(aInfo.x + 0.5);
  float rank = aInfo.y, kind = aInfo.z, rnd = aInfo.w;
  float done = uDone[pi], fill = uFill[pi], flash = uFlash[pi], hov = uHover[pi];
  vec3 col = cActive; float alpha = 0.0; float size = 1.0; float rimK = 1.0;
  vec3 p = position;
  if (kind < 0.5) {
    // Built (verified): cyan. Prepared, waiting on the founder: violet. Not built: almost nothing, the wireframe shows it.
    if (rank < done)      { col = mix(cActive, vec3(1.0), 0.1); alpha = 0.5; }
    else if (rank < fill) { col = mix(cViolet, cActive, 0.12) * 1.15; alpha = 0.4; size = 0.95; }
    else                  { col = mix(cIdle, cViolet, 0.6); alpha = 0.03; size = 0.7; }
    float front = (1.0 - smoothstep(0.0, 0.02, abs(rank - fill))) * step(0.001, fill) * step(fill, 0.995);
    col = mix(col, vec3(1.0), front * 0.5); alpha += front * 0.4; size += front * 0.5;
    alpha += flash * (rank < fill ? 0.55 : 0.08);
    p = organMotion(pi, p);
  } else if (kind < 1.5) {
    // The face mask: featureless and translucent until verified revenue forms it.
    col = mix(cViolet, cActive, 0.25 + 0.15 * uFace); alpha = 0.16 * (1.0 - smoothstep(0.72, 1.0, rank)); size = 0.85;
  } else if (kind < 4.5) {
    // Eyes need stage 1, brow and nose stage 2, the mouth stage 3. Each stroke draws itself in as its stage arrives.
    float show = clamp(uFace - (kind - 2.0), 0.0, 1.0);
    show *= step(rank, show * 1.02);
    col = mix(cActive, vec3(1.0), 0.45); alpha = 0.95 * show; size = 1.25; rimK = 0.0;
  } else {
    col = cMote; alpha = 0.035 + 0.03 * rnd; size = 0.7 + rnd * 0.5; rimK = 0.0;
  }
  col = mix(col, vec3(1.0), flash * 0.45);
  alpha *= 1.0 + hov * 0.9;
  // Hologram shading: shells read brightest at their silhouette, so the organs stay visible through the chest.
  float hasN = step(0.25, dot(aNrm, aNrm)) * rimK;
  vec3 V = normalize(cameraPosition - p);
  float rim = 1.0 - abs(dot(aNrm, V));
  alpha *= mix(1.0, 0.2 + 1.15 * rim * rim, hasN);
  // A slow scan line climbs the bust (motion only).
  float scan = exp(-pow((p.y - uScanY) / 0.9, 2.0)) * uMotion;
  alpha *= 1.0 + scan * 0.8;
  float a = clamp(uAssemble * 1.6 - 0.5 - rnd * 0.45, 0.0, 1.0);
  a = a * a * (3.0 - 2.0 * a);
  vec3 pos = mix(aScatter, p, a);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * size * uPR * (60.0 / -mv.z), 0.0, 10.0 * uPR);
  vColor = col;
  vAlpha = alpha * a;
}`

const fragment = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main() {
  float s = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); s *= s;
  if (s < 0.01) discard;
  gl_FragColor = vec4(vColor, s * vAlpha);
}`

const lineVertex = /* glsl */ `
${SHARED}
attribute vec2 aInfo;
varying vec3 vColor;
varying float vAlpha;
void main() {
  int pi = int(aInfo.x + 0.5);
  float rank = aInfo.y;
  vec3 col; float alpha;
  if (rank < uDone[pi])      { col = cActive; alpha = 0.2; }
  else if (rank < uFill[pi]) { col = cViolet * 1.3; alpha = 0.2; }
  else                       { col = mix(cViolet, cActive, 0.4); alpha = 0.075; }
  alpha = alpha * (1.0 + uHover[pi] * 1.6) + uFlash[pi] * 0.25;
  vColor = col;
  vAlpha = alpha * smoothstep(0.55, 1.0, uAssemble);
  vec3 p = organMotion(pi, position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`

const lineFragment = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main() { gl_FragColor = vec4(vColor, vAlpha); }`

const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const local = (v: [number, number, number]) => new THREE.Vector3(BRAIN_C[0] + v[0] * BRAIN_S, BRAIN_C[1] + v[1] * BRAIN_S, BRAIN_C[2] + v[2] * BRAIN_S)

/**
 * JARVIS's body around the brain. Each organ belongs to one agent and fills only as that agent's tasks are verified
 * (prepared tasks waiting on the founder fill violet); the rest is a faint wireframe. The face is a featureless mask
 * until verified revenue forms it. Data-driven: fills, the face stage and arrival streams. Not data: the heartbeat,
 * breathing and scan line (all off with reduced motion).
 */
export function Bust({ buf, body, towers }: { buf: BustOutput; body: BodyView | null; towers: Tower[] }) {
  const pr = useThree(s => s.viewport.dpr)
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(buf.pos, 3))
    g.setAttribute('aScatter', new THREE.BufferAttribute(buf.scatter, 3))
    g.setAttribute('aInfo', new THREE.BufferAttribute(buf.info, 4))
    g.setAttribute('aNrm', new THREE.BufferAttribute(buf.nrm, 3))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(...BRAIN_C), 90)
    return g
  }, [buf])
  const lineGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(buf.lines, 3))
    g.setAttribute('aInfo', new THREE.BufferAttribute(buf.lineInfo, 2))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(...BRAIN_C), 90)
    return g
  }, [buf])
  useEffect(() => () => { geometry.dispose(); lineGeometry.dispose() }, [geometry, lineGeometry])

  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uAssemble: { value: 0 }, uMotion: { value: 1 }, uBeat: { value: 0 }, uBreath: { value: 0 },
    uDone: { value: bodyLive.done }, uFill: { value: bodyLive.fill }, uFlash: { value: bodyLive.flash }, uHover: { value: bodyLive.hover },
    uHeartC: { value: local(SHAPE.heart.c) }, uLungR: { value: local(SHAPE.lungR.c) }, uLungL: { value: local(SHAPE.lungL.c) },
    cIdle: { value: PALETTE.idle }, cActive: { value: PALETTE.active }, cViolet: { value: PALETTE.violet }, cMote: { value: PALETTE.mote },
    uSize: { value: 1.7 }, uPR: { value: 1 }, uFace: { value: 0 }, uScanY: { value: -100 },
  }), [])
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms,
  }), [uniforms])
  const lineMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: lineVertex, fragmentShader: lineFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms,
  }), [uniforms])
  useEffect(() => () => { material.dispose(); lineMaterial.dispose() }, [material, lineMaterial])

  // The record → targets. Parts are matched by id, so the core's order never matters.
  useEffect(() => {
    const t = bodyLive.target
    t.done.fill(0); t.fill.fill(0)
    for (const p of body?.parts ?? []) {
      const i = BUST_PARTS.indexOf(p.id as (typeof BUST_PARTS)[number])
      if (i < 0) continue
      t.done[i] = p.built
      t.fill[i] = p.fill
    }
    t.face = body?.face.stage ?? 0
    t.done[FACE] = t.fill[FACE] = t.face / 3
  }, [body])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.25)
    const s = useStore.getState()
    const u = uniforms
    const motion = live.motion
    u.uTime.value = live.time; u.uAssemble.value = live.assemble; u.uMotion.value = motion; u.uPR.value = pr
    // Heartbeat (lub-dub, about 66 per minute) and a slow breath; both still with reduced motion.
    const tb = live.time * 1.1
    const beat = Math.pow(Math.max(0, Math.sin(tb * Math.PI * 2)), 12) + 0.6 * Math.pow(Math.max(0, Math.sin(tb * Math.PI * 2 - 0.9)), 12)
    u.uBeat.value = motion * beat * Math.min(1, bodyLive.done[2] * 2)
    u.uBreath.value = motion * Math.sin(live.time * 0.8)
    u.uScanY.value = motion ? BRAIN_C[1] + (((live.time * 2.2) % 46) - 30) : -100
    // Build up (or, in replay, back down) smoothly: about one second to reach a new fill.
    const k = 1 - Math.exp(-dt * (reduce ? 50 : 2.2))
    const t = bodyLive.target
    for (let i = 0; i < N_PARTS; i++) {
      bodyLive.done[i] += (t.done[i] - bodyLive.done[i]) * k
      bodyLive.fill[i] += (t.fill[i] - bodyLive.fill[i]) * k
      bodyLive.flash[i] *= Math.exp(-dt * 1.1)
      const hp = useBodyHover.getState().part
      const f = s.focus
      const focused = f.kind === 'agent' && body?.parts.find(p => p.builtBy === f.id)?.id === BUST_PARTS[i]
      const h = hp === i ? 1 : focused ? 0.7 : 0
      bodyLive.hover[i] += (h - bodyLive.hover[i]) * (1 - Math.exp(-dt * 8))
    }
    bodyLive.face += (t.face - bodyLive.face) * (1 - Math.exp(-dt * (reduce ? 50 : 0.8)))
    u.uFace.value = bodyLive.face
  })

  return (
    <>
      <points geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
      <lineSegments geometry={lineGeometry} material={lineMaterial} frustumCulled={false} raycast={() => null} />
      <Streams buf={buf} towers={towers} />
      <HitTargets body={body} />
      <PartLabel body={body} />
    </>
  )
}

// ---------- arrivals: a stream of particles from the district to its organ ----------

interface Stream { from: THREE.Vector3; ctrl: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; part: number; landed: boolean }
const streams: Stream[] = []
const PER = 40
const MAX_STREAMS = 8

/** Fire a stream by hand (the Packets path does this for live ledger events); exposed for checks and demos. */
export function streamTo(part: number, from: THREE.Vector3, to: THREE.Vector3, delay = 0) {
  if (!live.motion) { if (part >= 0) bodyLive.flash[part] = 1; return }
  const ctrl = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 8 + from.distanceTo(to) * 0.25, 0))
  streams.push({ from, ctrl, to, t0: live.time + delay, dur: 2.6, part, landed: false })
  while (streams.length > MAX_STREAMS) streams.shift()
}

function Streams({ buf, towers }: { buf: BustOutput; towers: Tower[] }) {
  const anchor = (i: number) => new THREE.Vector3(buf.anchors[i * 3], buf.anchors[i * 3 + 1], buf.anchors[i * 3 + 2])
  useEffect(() => useStore.subscribe((s, p) => {
    if (!s.data || !p.data || s.data === p.data || s.time !== null) return
    bodyArrivals(p.data, s.data).forEach((a, k) => {
      const part = BUST_PARTS.indexOf(a.part as (typeof BUST_PARTS)[number])
      const tw = towers[s.data!.nodes.findIndex(n => n.id === a.node)]
      const [dx, dz] = districtCenter(a.agent)
      const from = tw ? new THREE.Vector3(tw.x, tw.h + 0.6, tw.z) : new THREE.Vector3(dx, 2, dz)
      // The mind is the brain itself: its arrivals land in the brain.
      const to = part >= 0 ? anchor(part) : new THREE.Vector3(...BRAIN_C)
      streamTo(part, from, to, k * 0.35)
    })
  }), [towers, buf]) // eslint-disable-line react-hooks/exhaustive-deps

  const pts = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PER * MAX_STREAMS * 3).fill(-999), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PER * MAX_STREAMS * 3), 3))
    return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.75, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  }, [])
  useEffect(() => () => { pts.geometry.dispose(); (pts.material as THREE.Material).dispose() }, [pts])
  const v = useMemo(() => new THREE.Vector3(), [])
  const white = useMemo(() => new THREE.Color('#ffffff'), [])
  const c = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const pos = pts.geometry.attributes.position as THREE.BufferAttribute
    const col = pts.geometry.attributes.color as THREE.BufferAttribute
    let active = 0
    for (let si = 0; si < MAX_STREAMS; si++) {
      const st = streams[si]
      if (st && !st.landed && live.time >= st.t0 + st.dur) { st.landed = true; if (st.part >= 0) bodyLive.flash[st.part] = 1 }
      for (let k = 0; k < PER; k++) {
        const i = si * PER + k
        const f = st ? (live.time - st.t0) / st.dur - k * 0.014 : -1
        if (!st || f < 0 || f > 1) { pos.setXYZ(i, 0, -999, 0); continue }
        active++
        const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2
        const m = 1 - e
        v.set(0, 0, 0).addScaledVector(st.from, m * m).addScaledVector(st.ctrl, 2 * m * e).addScaledVector(st.to, e * e)
        // A loose braid around the path, tightening as it lands.
        const sw = (1 - e) * 0.9, ph = live.time * 4 + k * 0.7
        v.x += Math.cos(ph) * sw; v.y += Math.sin(ph * 1.3) * sw * 0.6; v.z += Math.sin(ph) * sw
        pos.setXYZ(i, v.x, v.y, v.z)
        const head = 1 - k / PER
        c.copy(PALETTE.active).lerp(white, head * head * 0.7).multiplyScalar(2.2 * head + 0.25)
        col.setXYZ(i, c.r, c.g, c.b)
      }
    }
    while (streams.length && streams[0].landed && live.time > streams[0].t0 + streams[0].dur + 1) streams.shift()
    bodyLive.streams = active
    pos.needsUpdate = true; col.needsUpdate = true
  })
  return <primitive object={pts} />
}

// ---------- hover and click: one invisible hit shape per part ----------

/** Inner organs win over the shells around them; towers, drones and the brain (marked solid) win over the hologram. */
const PRIO: Record<string, number> = { heart: 9, lungs: 8, face: 7, arm_right: 6, arm_left: 6, neck: 5, shoulders: 4, ribcage: 3, crown: 2 }
const unitSphere = new THREE.SphereGeometry(1, 20, 14)
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 14, 1)
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })

interface HitSpec { part: string; kind: 'ell' | 'cyl'; c: THREE.Vector3; r: THREE.Vector3; q?: THREE.Quaternion; front?: boolean }

function hitSpecs(): HitSpec[] {
  const v = (a: [number, number, number]) => new THREE.Vector3(...a)
  const out: HitSpec[] = [
    { part: 'crown', kind: 'ell', c: v(SHAPE.cranium.c), r: v(SHAPE.cranium.r) },
    { part: 'face', kind: 'ell', c: v(SHAPE.jaw.c), r: v(SHAPE.jaw.r).multiplyScalar(1.03), front: true },
    { part: 'neck', kind: 'cyl', c: new THREE.Vector3(0, -1.52, SHAPE.neck.cz), r: new THREE.Vector3(SHAPE.neck.rx * 1.05, 0.85, SHAPE.neck.rz * 1.05) },
    { part: 'shoulders', kind: 'ell', c: v(SHAPE.trap.c), r: v(SHAPE.trap.r) },
    { part: 'shoulders', kind: 'ell', c: v(SHAPE.deltR.c), r: v(SHAPE.deltR.r) },
    { part: 'shoulders', kind: 'ell', c: v(SHAPE.deltL.c), r: v(SHAPE.deltL.r) },
    { part: 'ribcage', kind: 'ell', c: v(SHAPE.chest.c), r: v(SHAPE.chest.r) },
    { part: 'lungs', kind: 'ell', c: v(SHAPE.lungR.c), r: v(SHAPE.lungR.r) },
    { part: 'lungs', kind: 'ell', c: v(SHAPE.lungL.c), r: v(SHAPE.lungL.r) },
    { part: 'heart', kind: 'ell', c: v(SHAPE.heart.c), r: new THREE.Vector3(0.3, 0.3, 0.26) },
  ]
  for (const name of ['arm_right', 'arm_left'] as const) {
    const a = ARMS[name]
    for (const [A, B, rad] of [[a.J, a.E, 0.3], [a.E, a.W, 0.24]] as const) {
      const pa = v(A), pb = v(B), d = pb.clone().sub(pa)
      out.push({ part: name, kind: 'cyl', c: pa.clone().add(pb).multiplyScalar(0.5), r: new THREE.Vector3(rad, d.length(), rad), q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()) })
    }
    const h = handOf(a)
    out.push({ part: name, kind: 'ell', c: v(h.palm.c).add(v(h.palm.f).multiplyScalar(0.1)), r: new THREE.Vector3(0.32, 0.32, 0.32) })
  }
  return out
}

const toLocal = (p: THREE.Vector3) => p.clone().sub(new THREE.Vector3(...BRAIN_C)).divideScalar(BRAIN_S)

function pick(e: ThreeEvent<PointerEvent | MouseEvent>): { part: number; point: THREE.Vector3 } | null {
  let best: THREE.Intersection | null = null
  for (const h of e.intersections) {
    const ud = h.object.userData
    if (ud.solid) return null
    if (ud.part === undefined) continue
    // The face is only the front of the lower head.
    if (ud.front && toLocal(h.point).z < 0.3) continue
    if (!best || PRIO[ud.part] > PRIO[best.object.userData.part]) best = h
  }
  return best ? { part: BUST_PARTS.indexOf(best.object.userData.part), point: best.point.clone() } : null
}

function HitTargets({ body }: { body: BodyView | null }) {
  const specs = useMemo(hitSpecs, [])
  const agentOf = (part: number) => body?.parts.find(p => p.id === BUST_PARTS[part])?.builtBy
  const clear = (src: string) => {
    const h = useBodyHover.getState()
    if (h.src !== src) return
    const agent = h.part !== null ? agentOf(h.part) : undefined
    useBodyHover.setState({ part: null, at: null, src: null })
    const s = useStore.getState()
    if (agent && s.hover?.kind === 'agent' && s.hover.id === agent) s.set({ hover: null })
    document.body.style.cursor = ''
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const src = e.object.uuid
    const hit = pick(e)
    if (!hit) { clear(useBodyHover.getState().src ?? ''); return }
    e.stopPropagation()
    const prev = useBodyHover.getState().part
    if (prev !== hit.part) sfx.hover()
    useBodyHover.setState({ part: hit.part, at: hit.point, src })
    const agent = agentOf(hit.part)
    // Light the district that built this part, so the link between organ and agent is visible.
    const s = useStore.getState()
    if (agent && !(s.hover?.kind === 'agent' && s.hover.id === agent)) s.set({ hover: { kind: 'agent', id: agent } })
    else if (!agent && s.hover) s.set({ hover: null })
    document.body.style.cursor = agent ? 'pointer' : 'default'
  }
  const onOut = (e: ThreeEvent<PointerEvent>) => clear(e.object.uuid)
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const hit = pick(e)
    if (!hit) return
    e.stopPropagation()
    if (e.delta > 25) return
    const agent = agentOf(hit.part)
    if (!agent) return
    sfx.dive()
    useStore.getState().select({ kind: 'agent', id: agent })
  }
  return (
    <group position={BRAIN_C} scale={BRAIN_S}>
      {specs.map((h, i) => (
        <mesh key={i} geometry={h.kind === 'ell' ? unitSphere : unitCyl} material={hitMat} position={h.c} scale={h.r} quaternion={h.q ?? new THREE.Quaternion()}
          userData={{ part: h.part, front: h.front }} onPointerOver={onMove} onPointerMove={onMove} onPointerOut={onOut} onClick={onClick} />
      ))}
    </group>
  )
}

function PartLabel({ body }: { body: BodyView | null }) {
  const part = useBodyHover(s => s.part)
  const group = useRef<THREE.Group>(null!)
  useFrame(() => {
    const at = useBodyHover.getState().at
    if (group.current && at) group.current.position.lerp(at, 0.4)
  })
  if (part === null || !body) return null
  let title = '', lines: string[] = []
  if (part === FACE) {
    title = 'Face · formed only by verified revenue'
    lines = [body.face.label, body.face.payers ? `${body.face.payers} verified paying customer${body.face.payers === 1 ? '' : 's'}` : 'nothing any agent does can form it']
  } else {
    const p = body.parts.find(x => x.id === BUST_PARTS[part])
    if (!p) return null
    title = `${partName(p)} · built by ${p.agentName}`
    lines = [`${p.done} of ${p.total} task${p.total === 1 ? '' : 's'} verified${p.verified.length ? ` (${p.verified.join(', ')})` : ''}`, partDetail(p), `click to open ${p.agentName}`]
  }
  return (
    <group ref={group} position={useBodyHover.getState().at ?? undefined}>
      <Html portal={labelLayer} center zIndexRange={[32, 0]} style={{ pointerEvents: 'none' }}>
        <div className="hover-label" role="tooltip" aria-label={part === FACE ? faceTooltip(body.face) : body.parts.find(x => x.id === BUST_PARTS[part])?.tooltip}
          style={{ transform: 'translate(0, -120%)' }}>
          <b>{title}</b><span style={{ flexDirection: 'column', gap: 2 }}>{lines.map(l => <i key={l}>{l}</i>)}</span>
        </div>
      </Html>
    </group>
  )
}
