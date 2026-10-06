import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { sfx } from '../audio/sound'
import { clock, ms, newEvents } from '../data/model'
import { useStore } from '../store'
import { labelLayer } from './portal'
import { live, PALETTE } from './shared'
import { ALL_AGENTS, BRAIN_C, CENTER_AGENT, districtCenter, R_PLAZA, ringAngle, ringIndex, type Tower } from './world'

export const workerPos: Record<string, THREE.Vector3> = Object.fromEntries(ALL_AGENTS.map(a => [a, new THREE.Vector3(0, 4, 0)]))
const SPARKS = 16

/** The nine agents as small luminous drones. Building: hovering over their tower with a work beam. Idle: circling home. */
export function Workers({ towers }: { towers: Tower[] }) {
  return <>{ALL_AGENTS.map((a, i) => <Worker key={a} agent={a} index={i} towers={towers} />)}</>
}

function Worker({ agent, index, towers }: { agent: string; index: number; towers: Tower[] }) {
  const group = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Mesh>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  const tag = useRef<HTMLDivElement>(null!)
  const name = useStore(s => s.data?.agents[agent]?.name ?? agent)
  // Last real step this agent logged: workers only move when there is recent work behind it.
  const lastStep = useStore(s => {
    let best = 0
    for (const evs of Object.values(s.data?.activity ?? {})) for (const e of evs) if (e.agent === agent && e.src !== 'ledger') best = Math.max(best, ms(e.t))
    return best
  })
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

  useFrame((_, dt) => {
    const { data, st, hover, focus } = useStore.getState()
    if (!data) return
    const t = live.time * (live.motion || 0.2)
    const mine = towers.map((tw, i) => ({ tw, n: data.nodes[i] })).filter(x => x.n.agent === agent)
    const building = mine.find(x => st.get(x.n.id) === 'running')
    const waiting = mine.some(x => st.get(x.n.id) === 'awaiting_human')
    const recent = Date.now() - lastStep < 5 * 60_000
    const ph = (recent || building ? t : 0) * 0.35 + index
    if (building) {
      const tw = building.tw
      target.set(tw.x + Math.cos(t * 1.3 + index) * 1.0, tw.h + 2.0 + Math.sin(t * 2.1) * 0.3, tw.z + Math.sin(t * 1.3 + index) * 1.0)
    } else if (agent === CENTER_AGENT) {
      target.set(Math.cos(ph * 0.6) * (R_PLAZA - 2), BRAIN_C[1] - 4.5 + Math.sin(t) * 0.4, Math.sin(ph * 0.6) * (R_PLAZA - 2))
    } else {
      const a = ringAngle(ringIndex(agent))
      target.set(hx - Math.cos(a) * 1.5 + Math.cos(ph) * 3.2, 3.2 + Math.sin(t * 0.9 + index) * 0.35, hz - Math.sin(a) * 1.5 + Math.sin(ph) * 3.2)
    }
    group.current.position.lerp(target, 1 - Math.exp(-dt * 2.5))
    const big = hover?.id === agent || (focus.kind === 'agent' && focus.id === agent)
    group.current.scale.setScalar(Math.min(1, live.assemble * 1.5) * (big ? 1.35 : 1))
    workerPos[agent].copy(group.current.position)
    const m = body.current.material as THREE.MeshBasicMaterial
    m.color.copy(building ? PALETTE.active : waiting ? PALETTE.violet : PALETTE.mote).multiplyScalar(building ? 2.4 : 1.2)
    ring.current.rotation.set(t * 0.8 + index, t * 0.6, 0)

    const on = !!building && live.assemble > 0.8
    if (building) {
      const p = beam.geometry.attributes.position as THREE.BufferAttribute
      const gp = group.current.position, tw = building.tw
      p.setXYZ(0, gp.x, gp.y, gp.z); p.setXYZ(1, tw.x, tw.h * live.progress[data.nodes.indexOf(building.n)], tw.z); p.needsUpdate = true
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
      const label = building ? `working on ${building.n.id}` : waiting ? 'waiting on founder' : lastStep ? `idle since ${clock(lastStep).slice(0, 5)}` : 'not started'
      tag.current.dataset.state = building ? 'building' : waiting ? 'waiting' : 'idle'
      const span = tag.current.lastElementChild
      if (span && span.textContent !== label) span.textContent = label
      tag.current.style.opacity = live.assemble > 0.9 ? '1' : '0'
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
          <meshBasicMaterial color={PALETTE.active} transparent opacity={0.75} toneMapped={false} />
        </mesh>
        <mesh onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
          <sphereGeometry args={[1.2, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
        <Html portal={labelLayer} center position={[0, 1.2, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div ref={tag} className="worker-tag" style={{ opacity: 0 }}><b>{name}</b><span>idle</span></div>
        </Html>
      </group>
      <primitive object={beam} />
      <primitive object={sparks} />
    </>
  )
}

interface Packet { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; color: THREE.Color }
const packets: Packet[] = []

/** Real ledger events become packets: a start flies from the brain to the tower; a finish flies home to the brain. */
export function Packets({ towers }: { towers: Tower[] }) {
  const COUNT = 48
  useEffect(() => useStore.subscribe((s, p) => {
    if (!s.data || !p.data || s.data === p.data) return
    newEvents(p.data, s.data).forEach((e, k) => {
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
