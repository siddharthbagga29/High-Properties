import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { sfx } from '../audio/sound'
import { agentStats, fmtK, STATUS_LABEL } from '../data/model'
import { useStore } from '../store'
import { labelLayer } from './portal'
import { AGENTS, districtCenter, PLATE, type Tower } from './layout'
import { live } from './shared'
import { workerPos } from './Workers'

const hoverOn = (kind: 'agent' | 'task', id: string) => (e: ThreeEvent<PointerEvent>) => {
  e.stopPropagation()
  if (useStore.getState().hover?.id !== id) sfx.hover()
  useStore.getState().set({ hover: { kind, id } })
  document.body.style.cursor = 'pointer'
}
const hoverOff = (id: string) => () => {
  if (useStore.getState().hover?.id === id) useStore.getState().set({ hover: null })
  document.body.style.cursor = ''
}
const clickTo = (id: string) => (e: ThreeEvent<MouseEvent>) => {
  e.stopPropagation()
  sfx.dive()
  useStore.getState().dive(id)
}

/** Invisible hit targets that follow the cortex → city morph: lobes/districts, and towers. */
export function Hotspots({ towers, lobes }: { towers: Tower[]; lobes: Float32Array }) {
  return (
    <>
      {AGENTS.map((a, i) => <District key={a} agent={a} index={i} lobes={lobes} />)}
      {towers.map(t => <TowerHit key={t.id} t={t} />)}
      <HoverLabel towers={towers} lobes={lobes} />
    </>
  )
}

const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
const box = new THREE.BoxGeometry(1, 1, 1)

function District({ agent, index, lobes }: { agent: string; index: number; lobes: Float32Array }) {
  const ref = useRef<THREE.Mesh>(null!)
  const brain = useMemo(() => new THREE.Vector3().fromArray(lobes, index * 3), [lobes, index])
  const [cx, cz] = districtCenter(agent)
  const city = useMemo(() => new THREE.Vector3(cx, 0.2, cz), [cx, cz])
  useFrame(() => {
    const c = live.city
    ref.current.position.lerpVectors(brain, city, c)
    ref.current.scale.set(THREE.MathUtils.lerp(4.6, PLATE * 2, c), THREE.MathUtils.lerp(4.6, 0.4, c), THREE.MathUtils.lerp(5.6, PLATE * 2, c))
    const lvl = useStore.getState().level
    ref.current.visible = live.assemble > 0.6 && (lvl <= 2 || useStore.getState().focus !== agent)
  })
  return <mesh ref={ref} geometry={box} material={hitMat} onPointerOver={hoverOn('agent', agent)} onPointerOut={hoverOff(agent)} onClick={clickTo(agent)} />
}

function TowerHit({ t }: { t: Tower }) {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(() => { ref.current.visible = live.city > 0.7 && useStore.getState().level >= 2 })
  return (
    <mesh ref={ref} geometry={box} material={hitMat} position={[t.x, t.h / 2, t.z]} scale={[t.w + 0.5, t.h + 0.4, t.w + 0.5]}
      onPointerOver={hoverOn('task', t.id)} onPointerOut={hoverOff(t.id)} onClick={clickTo(t.id)} />
  )
}

/** One small label pinned in world space with 2–3 live numbers. Never a modal. */
function HoverLabel({ towers, lobes }: { towers: Tower[]; lobes: Float32Array }) {
  const hover = useStore(s => s.hover)
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const group = useRef<THREE.Group>(null!)
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    if (!hover || !group.current) return
    if (hover.kind === 'task') {
      const t = towers.find(x => x.id === hover.id)
      if (t) v.set(t.x, t.h + 0.9, t.z)
    } else if (hover.kind === 'worker') {
      v.copy(workerPos[hover.id]).add(new THREE.Vector3(0, 1.9, 0))
    } else if (hover.kind === 'agent') {
      const i = AGENTS.indexOf(hover.id)
      const [cx, cz] = districtCenter(hover.id)
      v.lerpVectors(new THREE.Vector3().fromArray(lobes, i * 3).add(new THREE.Vector3(0, 2.6, 0)), new THREE.Vector3(cx, 1.4, cz + PLATE), live.city)
    }
    group.current.position.lerp(v, 0.35)
  })
  if (!hover || !data || hover.kind === 'atom') return null
  let title = '', lines: string[] = []
  if (hover.kind === 'task') {
    const n = data.nodes.find(x => x.id === hover.id)
    if (!n) return null
    const s = st.get(n.id)!
    title = `${n.id} · ${n.title}`
    lines = [STATUS_LABEL[s], n.run ? `${fmtK(n.run.used_k)} spent / ${n.budget_k}k budget` : `${n.budget_k}k budget`, data.agents[n.agent].name]
  } else {
    const a = agentStats(data, st).find(x => x.key === hover.id)
    if (!a) return null
    title = `${a.district} · ${a.name}`
    lines = [`${a.done}/${a.tasks.length} built`, `${fmtK(a.used)} tokens`, a.running ? `building ${a.running.id}` : a.waiting ? `${a.waiting} waiting on founder` : a.next ? `next ${a.next.id}` : 'idle']
  }
  return (
    <group ref={group}>
      <Html portal={labelLayer} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div className="hover-label">
          <b>{title}</b>
          <span>{lines.map(l => <i key={l}>{l}</i>)}</span>
        </div>
      </Html>
    </group>
  )
}
