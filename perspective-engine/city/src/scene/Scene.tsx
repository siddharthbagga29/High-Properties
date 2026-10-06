import { Html, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { agentStats, fmtK, STATUS_LABEL } from '../data/model'
import type { GraphState } from '../data/types'
import { useStore } from '../store'
import { Arcs } from './Arcs'
import { Background, Motes } from './Atmosphere'
import { Brain } from './Brain'
import { Ground, LegendRing, Plates, Shockwave, Spokes, type PlateStat } from './Ground'
import { labelLayer } from './portal'
import { Records } from './Records'
import { Rig } from './Rig'
import { live } from './shared'
import { Signs, type SignStat } from './Signs'
import { Towers } from './Towers'
import { Packets, Workers, workerPos } from './Workers'
import { BRAIN_C, buildBrain, towers as layTowers, type BrainOutput, type LayoutNode, type Tower } from './world'

const phone = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px), (pointer: coarse)').matches
const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4
/** Brain particle budget: 140k desktop, 80k on modest machines, 36k on phones. */
export const PARTICLES = phone ? 36_000 : cores <= 4 ? 80_000 : 140_000

if (typeof window !== 'undefined') (window as unknown as { __pe: unknown }).__pe = { live, store: useStore }

const layoutNodes = (d: GraphState): LayoutNode[] => d.nodes.map(n => ({ id: n.id, agent: n.agent, budget_k: n.budget_k, used_k: n.run?.used_k ?? 0, phase: n.phase }))

function useBrain(data: GraphState | null) {
  const key = data ? data.nodes.map(n => `${n.id}:${n.agent}:${n.run?.used_k ?? 0}`).join('|') : ''
  const [buf, setBuf] = useState<BrainOutput | null>(null)
  useEffect(() => {
    if (!data) return
    const input = { nodes: layoutNodes(data), count: PARTICLES, seed: 20261006 }
    let worker: Worker | null = null
    try {
      worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = e => setBuf(e.data as BrainOutput)
      worker.onerror = () => setBuf(buildBrain(input))
      worker.postMessage(input)
    } catch { setBuf(buildBrain(input)) }
    return () => worker?.terminate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return buf
}

function HoverLabel({ towers }: { towers: Tower[] }) {
  const hover = useStore(s => s.hover)
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const group = useRef<THREE.Group>(null!)
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    if (!hover || !group.current || !data) return
    if (hover.kind === 'task') { const t = towers[data.nodes.findIndex(n => n.id === hover.id)]; if (t) v.set(t.x, t.h + 1, t.z) }
    else if (hover.kind === 'worker' || hover.kind === 'agent') v.copy(workerPos[hover.id]).add(new THREE.Vector3(0, 2.2, 0))
    else v.set(BRAIN_C[0], BRAIN_C[1] + 4.5, BRAIN_C[2])
    group.current.position.lerp(v, 0.35)
  })
  if (!hover || !data) return null
  let title = '', lines: string[] = []
  if (hover.kind === 'task') {
    const n = data.nodes.find(x => x.id === hover.id)
    if (!n) return null
    title = `${n.id} · ${n.title}`
    lines = [STATUS_LABEL[st.get(n.id)!], n.run ? `${fmtK(n.run.used_k)} spent / ${n.budget_k}k plan` : `${n.budget_k}k token plan`, data.agents[n.agent].name]
  } else if (hover.kind === 'brain') {
    const done = data.nodes.filter(n => st.get(n.id) === 'done').length
    title = 'The brain · the plan and the orchestrator'
    lines = [`${done}/${data.nodes.length} tasks built`, `${data.nodes.filter(n => st.get(n.id) === 'running').length} running`, 'click to open']
  } else {
    const a = agentStats(data, st).find(x => x.key === hover.id)
    if (!a) return null
    title = `${a.name} · ${a.district}`
    lines = [`${a.done}/${a.tasks.length} built`, a.running ? `building ${a.running.id}` : a.waiting ? 'waiting on founder' : 'idle', 'click for timeline']
  }
  return (
    <group ref={group}>
      <Html portal={labelLayer} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div className="hover-label"><b>{title}</b><span>{lines.map(l => <i key={l}>{l}</i>)}</span></div>
      </Html>
    </group>
  )
}

export default function Scene() {
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const enteredAt = useStore(s => s.enteredAt)
  const buf = useBrain(data)
  const [dpr, setDpr] = useState<number>(phone ? 1.25 : Math.min(2, window.devicePixelRatio || 1))
  const [hidden, setHidden] = useState(false)
  const towers = useMemo(() => (data ? layTowers(layoutNodes(data)) : []), [data])
  const links = useMemo<[number, number][]>(() => {
    if (!data) return []
    const idx = new Map(data.nodes.map((n, i) => [n.id, i]))
    return data.nodes.flatMap((n, j) => n.deps.filter(d => idx.has(d)).map(d => [idx.get(d)!, j] as [number, number]))
  }, [data])
  const stats = useMemo(() => (data ? agentStats(data, st) : []), [data, st])
  const plates: PlateStat[] = stats.map(a => ({ agent: a.key, done: a.done, total: a.tasks.length, working: !!a.running, waiting: a.waiting > 0 }))
  const signs: SignStat[] = stats.map(a => ({
    agent: a.key, name: a.name, district: a.key === 'orchestrator' ? 'The Brain' : a.district, role: a.role, done: a.done, total: a.tasks.length,
    state: a.running ? 'working' : a.waiting ? 'waiting' : a.next ? 'ready' : 'idle',
    line: a.running ? `Building ${a.running.id}: ${a.running.title}` : a.waiting ? `${a.waiting} task${a.waiting > 1 ? 's' : ''} waiting on the founder` : a.next ? `Next: ${a.next.id} ${a.next.title}` : 'Idle until upstream work lands',
  }))
  const working = stats.filter(a => a.running).map(a => a.key)

  useEffect(() => {
    const on = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])

  return (
    <Canvas dpr={dpr} frameloop={hidden ? 'never' : 'always'}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false }}
      camera={{ fov: 40, near: 0.1, far: 600, position: [0, 120, 170] }}
      onPointerMissed={() => useStore.getState().set({ hover: null })} aria-hidden="true">
      <color attach="background" args={['#0a0524']} />
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(phone ? 1.25 : Math.min(2, window.devicePixelRatio || 1))} />
      <Background />
      <Ground />
      <LegendRing />
      <Shockwave at={enteredAt} />
      {data && towers.length > 0 && (
        <>
          <Plates stats={plates} />
          <Spokes working={working} />
          <Towers towers={towers} />
          <Signs stats={signs} />
          <Arcs towers={towers} links={links} />
          <Workers towers={towers} />
          <Packets towers={towers} />
          <Records towers={towers} />
          <HoverLabel towers={towers} />
          <Rig towers={towers} links={links} />
        </>
      )}
      {buf && <Brain buf={buf} />}
      <Motes count={phone ? 140 : 300} />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.7} radius={0.6} luminanceThreshold={0.35} luminanceSmoothing={0.25} mipmapBlur />
      </EffectComposer>
    </Canvas>
  )
}
