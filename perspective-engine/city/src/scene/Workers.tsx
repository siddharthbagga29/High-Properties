import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { sfx } from '../audio/sound'
import { freshEvents, type AgentStats } from '../data/model'
import { useStore } from '../store'
import { labelLayer } from './portal'
import { agentState, live, PALETTE, verifying } from './shared'
import { bustOccludes } from './bust'
import { agentLabel, ALL_AGENTS, CENTER_AGENT, BRAIN_C, districtCenter, R_PLAZA, ringAngle, ringIndex, type Tower } from './world'

export const workerPos: Record<string, THREE.Vector3> = Object.fromEntries(ALL_AGENTS.map(a => [a, new THREE.Vector3(0, 4, 0)]))
const SPARKS = 16
const PARKED = new THREE.Color('#6d6880')
const TAG_COLOR = { building: '#ffb547', verifying: '#8fe6ff', stalled: '#c9bca9', waiting: '#bda6ff', idle: '' }

/**
 * The nine agents as small luminous drones. Only an agent whose own steps are recent moves: it orbits its tower
 * with a work beam. While only the verifier is on its task it waits beside the tower. A stalled agent parks, grey,
 * at the foot of its tower. Everyone else rests at home, still.
 */
export function Workers({ towers, stats, at }: { towers: Tower[]; stats: AgentStats[]; at: number }) {
  return <>{ALL_AGENTS.map((a, i) => <Worker key={a} agent={a} index={i} towers={towers} stat={stats.find(s => s.key === a)} at={at} />)}</>
}

function Worker({ agent, index, towers, stat, at }: { agent: string; index: number; towers: Tower[]; stat?: AgentStats; at: number }) {
  const group = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Mesh>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  const ringMat = useRef<THREE.MeshBasicMaterial>(null!)
  const tag = useRef<HTMLDivElement>(null!)
  const data = useStore(s => s.data)
  const name = data?.agents[agent]?.name ?? agent
  // Liveness from the record (agentStats at the replay moment or now), refreshed whenever the scene re-renders.
  const state = useRef({ building: -1, verifying: -1, stalled: -1, waiting: false, label: '' })
  const checked = !!stat && !!data && verifying(stat, data, at)
  const onTask = stat?.running ? towers.findIndex(t => t.id === stat.running!.id) : -1
  state.current = {
    building: checked ? -1 : onTask,
    verifying: checked ? onTask : -1,
    stalled: stat?.stalled ? towers.findIndex(t => t.id === stat.stalled!.id) : -1,
    waiting: (stat?.waiting ?? 0) > 0,
    label: stat && data ? agentState(stat, data, at) : 'not started',
  }
  const target = useMemo(() => new THREE.Vector3(), [])
  const [hx, hz] = districtCenter(agent)
  const beam = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: PALETTE.active, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
  }, [])
  const sparks = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3))
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
  }, [])

  useFrame(({ camera }, dt) => {
    const { data, hover, focus } = useStore.getState()
    if (!data) return
    const t = live.time * (live.motion || 0.2)
    const { building: bi, verifying: vi, stalled: si, waiting, label } = state.current
    const building = bi >= 0 ? towers[bi] : null, checked = !building && vi >= 0 ? towers[vi] : null
    const stalled = !building && !checked && si >= 0 ? towers[si] : null
    const beside = checked ?? stalled
    if (building) {
      target.set(building.x + Math.cos(t * 1.3 + index) * 1.0, building.h + 2.0 + Math.sin(t * 2.1) * 0.3, building.z + Math.sin(t * 1.3 + index) * 1.0)
    } else if (beside) {
      // Beside its tower on the side facing the brain: waiting on the verifier, or parked (low) when stalled.
      const r = Math.hypot(beside.x, beside.z) || 1
      target.set(beside.x - (beside.x / r) * 1.4, stalled ? 0.7 : 1.8, beside.z - (beside.z / r) * 1.4)
    } else if (agent === CENTER_AGENT) {
      // Off the brain: the Mayor rests at the front of the plaza, just under the brain's own label.
      target.set(0, 2.2, R_PLAZA - 0.5)
    } else {
      const a = ringAngle(ringIndex(agent))
      target.set(hx - Math.cos(a) * 1.5, 3.2, hz - Math.sin(a) * 1.5)
    }
    group.current.position.lerp(target, 1 - Math.exp(-dt * 2.5))
    const big = hover?.id === agent || (focus.kind === 'agent' && focus.id === agent)
    group.current.scale.setScalar(Math.min(1, live.assemble * 1.5) * (big ? 1.35 : 1) * (stalled ? 0.8 : 1))
    workerPos[agent].copy(group.current.position)
    const m = body.current.material as THREE.MeshBasicMaterial
    if (stalled) m.color.copy(PARKED)
    else m.color.copy(building ? PALETTE.active : waiting ? PALETTE.violet : PALETTE.mote).multiplyScalar(building ? 2.4 : 1.2)
    ringMat.current.color.copy(stalled ? PARKED : PALETTE.active)
    ringMat.current.opacity = stalled ? 0.35 : 0.75
    // Only a drone with a session behind it spins its ring.
    if (building) ring.current.rotation.set(t * 0.8 + index, t * 0.6, 0)
    else ring.current.rotation.set(1.2 + index * 0.4, 0.3, 0)

    const on = !!building && live.assemble > 0.8
    if (building) {
      const p = beam.geometry.attributes.position as THREE.BufferAttribute
      const gp = group.current.position, tw = building
      p.setXYZ(0, gp.x, gp.y, gp.z); p.setXYZ(1, tw.x, tw.h * live.progress[bi], tw.z); p.needsUpdate = true
      const sp = sparks.geometry.attributes.position as THREE.BufferAttribute
      for (let k = 0; k < SPARKS; k++) {
        const f = (t * 0.9 + k / SPARKS) % 1
        sp.setXYZ(k, THREE.MathUtils.lerp(gp.x, tw.x, f) + Math.sin(k * 7 + t * 3) * 0.12, THREE.MathUtils.lerp(gp.y, tw.h * 0.55, f), THREE.MathUtils.lerp(gp.z, tw.z, f) + Math.cos(k * 5 + t * 3) * 0.12)
      }
      sp.needsUpdate = true
    }
    ;(beam.material as THREE.LineBasicMaterial).opacity = on ? 0.6 : 0
    ;(sparks.material as THREE.PointsMaterial).opacity = on ? 0.9 : 0
    if (tag.current) {
      const kind = building ? 'building' : checked ? 'verifying' : stalled ? 'stalled' : waiting ? 'waiting' : 'idle'
      const span = tag.current.lastElementChild as HTMLElement | null
      if (tag.current.dataset.state !== kind) { tag.current.dataset.state = kind; if (span) span.style.color = TAG_COLOR[kind] }
      if (span && span.textContent !== label) span.textContent = label
      // The brain label speaks for the Mayor in the world view, so its tag never sits on the brain.
      const hide = agent === CENTER_AGENT && focus.kind === 'world'
      // A tag standing behind the bust steps back, so it never covers the figure (it stays readable).
      const gp = group.current.position, behind = bustOccludes([camera.position.x, camera.position.y, camera.position.z], [gp.x, gp.y + 1.2, gp.z])
      tag.current.style.opacity = live.assemble > 0.9 && !hide ? (behind ? '0.3' : stalled ? '0.8' : '1') : '0'
    }
  })

  const st = useStore.getState
  const onOver = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); if (st().hover?.id !== agent) sfx.hover(); st().set({ hover: { kind: 'worker', id: agent } }); document.body.style.cursor = 'pointer' }
  const onOut = () => { if (st().hover?.id === agent) st().set({ hover: null }); document.body.style.cursor = '' }
  const onClick = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta > 25) return; sfx.dive(); st().select({ kind: 'agent', id: agent }, 'activity') }

  return (
    <>
      <group ref={group}>
        <mesh ref={body}>
          <icosahedronGeometry args={[0.38, 1]} />
          <meshBasicMaterial toneMapped={false} />
        </mesh>
        <mesh ref={ring}>
          <torusGeometry args={[0.7, 0.014, 6, 48]} />
          <meshBasicMaterial ref={ringMat} color={PALETTE.active} transparent opacity={0.75} toneMapped={false} />
        </mesh>
        <mesh onPointerOver={onOver} onPointerOut={onOut} onClick={onClick} userData={{ solid: true }}>
          <sphereGeometry args={[1.2, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
        <Html portal={labelLayer} center position={[0, 1.2, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div ref={tag} className="worker-tag" style={{ opacity: 0, transition: 'opacity 0.4s' }}><b>{agentLabel(agent, name)}</b><span>idle</span></div>
        </Html>
      </group>
      <primitive object={beam} />
      <primitive object={sparks} />
    </>
  )
}

interface Packet { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; color: THREE.Color }
const packets: Packet[] = []

/**
 * Real ledger events become packets: a start flies from the brain to the tower; a finish flies home to the brain.
 * Only events recorded in the last few minutes, while the page is live: old history never flies.
 */
export function Packets({ towers }: { towers: Tower[] }) {
  const COUNT = 48
  useEffect(() => useStore.subscribe((s, p) => {
    if (!s.data || !p.data || s.data === p.data || s.time !== null) return
    freshEvents(p.data, s.data).forEach((e, k) => {
      const i = s.data!.nodes.findIndex(n => n.id === e.node)
      const tw = towers[i]
      if (!tw) return
      const brain = new THREE.Vector3(BRAIN_C[0], BRAIN_C[1] - 3, BRAIN_C[2])
      const tower = new THREE.Vector3(tw.x, tw.h + 0.5, tw.z)
      const out = e.event === 'start'
      packets.push({ from: out ? brain : tower, to: out ? tower : brain, t0: live.time + k * 0.3, dur: 2.2, color: out ? PALETTE.violet : PALETTE.active })
      live.agentGlow[ALL_AGENTS.indexOf(tw.agent)] = 1
      live.fresh[i] = 1
      setTimeout(() => sfx.ping(ALL_AGENTS.indexOf(tw.agent)), out ? 300 : 2200)
    })
  }), [towers])
  const pts = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3).fill(-999), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))
    return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  }, [])
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    for (let i = 0; i < live.agentGlow.length; i++) live.agentGlow[i] *= Math.exp(-dt * 0.8)
    const pos = pts.geometry.attributes.position as THREE.BufferAttribute
    const col = pts.geometry.attributes.color as THREE.BufferAttribute
    for (let i = 0; i < COUNT; i++) {
      const p = packets[i]
      const f = p ? (live.time - p.t0) / p.dur : 2
      if (!p || f < 0 || f > 1) { pos.setXYZ(i, 0, -999, 0); continue }
      const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2
      v.lerpVectors(p.from, p.to, e)
      v.y += Math.sin(e * Math.PI) * 5
      pos.setXYZ(i, v.x, v.y, v.z)
      col.setXYZ(i, p.color.r * 2, p.color.g * 2, p.color.b * 2)
    }
    while (packets.length && live.time - packets[0].t0 > packets[0].dur + 0.5) packets.shift()
    pos.needsUpdate = true; col.needsUpdate = true
  })
  return <primitive object={pts} />
}
