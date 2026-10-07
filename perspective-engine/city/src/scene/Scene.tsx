import { Html, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { agentStats, clock, fmtK, lastSignal, runState, STATUS_LABEL, type AgentStats } from '../data/model'
import type { GraphState } from '../data/types'
import { useStore } from '../store'
import { Arcs } from './Arcs'
import { Background, Motes } from './Atmosphere'
import { Brain } from './Brain'
import { Ground, LegendRing, Plates, Shockwave, Spokes, type PlateStat } from './Ground'
import { labelLayer } from './portal'
import { Records } from './Records'
import { Rig } from './Rig'
import { agentState, live } from './shared'
import { Signs, type SignStat } from './Signs'
import { TowerTags, Towers } from './Towers'
import { Packets, Workers, workerPos } from './Workers'
import { agentLabel, BRAIN_C, BRAIN_S, buildBrain, DEPT, towers as layTowers, type BrainOutput, type LayoutNode, type Tower } from './world'

const phone = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px), (pointer: coarse)').matches
const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4
/** Brain particle budget: 140k desktop, 80k on modest machines, 36k on phones. */
export const PARTICLES = phone ? 36_000 : cores <= 4 ? 80_000 : 140_000

if (typeof window !== 'undefined') (window as unknown as { __pe: unknown }).__pe = { live, store: useStore }

const layoutNodes = (d: GraphState): LayoutNode[] => d.nodes.map(n => ({ id: n.id, agent: n.agent, budget_k: n.budget_k, used_k: n.run?.used_k ?? 0, phase: n.phase }))

/** Wall clock for liveness: a running task turns stalled with the passage of time alone, without any new data. */
function useNow(every = 15_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), every); return () => clearInterval(id) }, [every])
  return now
}


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

function HoverLabel({ towers, stats, run, at }: { towers: Tower[]; stats: AgentStats[]; run: Map<string, 'working' | 'stalled'>; at: number }) {
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
    const r = run.get(n.id), last = r === 'stalled' ? lastSignal(data, n.id, at) : null
    title = `${n.id} · ${n.title}`
    lines = [
      r === 'working' ? 'Working now' : r === 'stalled' ? `Stalled${last ? ` since ${clock(last).slice(0, 5)}` : ''} — no session running` : STATUS_LABEL[st.get(n.id) ?? 'pending'],
      n.run ? `${fmtK(n.run.used_k)} spent / ${n.budget_k}k plan` : `${n.budget_k}k token plan`,
      agentLabel(n.agent, data.agents[n.agent].name),
    ]
  } else if (hover.kind === 'brain') {
    const done = data.nodes.filter(n => st.get(n.id) === 'done').length
    const working = [...run.values()].filter(x => x === 'working').length, stalled = run.size - working
    title = 'The brain · the plan and the orchestrator'
    lines = [`${done}/${data.nodes.length} tasks built`, `${working || 'nobody'} working${stalled ? ` · ${stalled} stalled` : ''}`, 'click to open']
  } else {
    const a = stats.find(x => x.key === hover.id)
    if (!a) return null
    title = agentLabel(a.key, a.name)
    lines = [`${a.done}/${a.tasks.length} built`, agentState(a, data, at, true), 'click for timeline']
  }
  return (
    <group ref={group}>
      <Html portal={labelLayer} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div className="hover-label"><b>{title}</b><span>{lines.map(l => <i key={l}>{l}</i>)}</span></div>
      </Html>
    </group>
  )
}

/** Under the brain in the world view: it is the plan, run by the Mayor, and how much of it is built. */
function BrainLabel() {
  const focus = useStore(s => s.focus)
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const group = useRef<THREE.Group>(null!)
  const el = useRef<HTMLDivElement>(null)
  const dir = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    if (!group.current) return
    // On the camera's side of the brain, just under its lower edge, above the district tags of the near ring.
    dir.set(camera.position.x - BRAIN_C[0], 0, camera.position.z - BRAIN_C[2]).normalize().multiplyScalar(BRAIN_S * 0.99)
    group.current.position.set(BRAIN_C[0] + dir.x, 4.5, BRAIN_C[2] + dir.z)
    if (el.current) el.current.style.opacity = live.assemble > 0.9 ? '1' : '0'
  })
  if (!data || focus.kind !== 'world') return null
  const done = data.nodes.filter(n => st.get(n.id) === 'done').length
  return (
    <group ref={group}>
      <Html portal={labelLayer} zIndexRange={[18, 0]} style={{ transform: 'translate3d(-50%,0,0)', pointerEvents: 'none' }}>
        <div ref={el} className="brain-tag" style={{ opacity: 0, transition: 'opacity 0.6s', background: 'rgba(10,5,36,0.8)', border: '1px solid rgba(143,230,255,0.45)', borderRadius: 3, padding: '3px 9px', whiteSpace: 'nowrap', font: '600 12px var(--mono)', letterSpacing: '0.08em', color: '#8fe6ff' }}>
          THE PLAN · {(data.agents.orchestrator?.name ?? 'Mayor').toUpperCase()} · {done}/{data.nodes.length} BUILT
        </div>
      </Html>
    </group>
  )
}

export default function Scene() {
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const time = useStore(s => s.time)
  const enteredAt = useStore(s => s.enteredAt)
  const now = useNow()
  // Liveness is judged at the replay moment, or now: "running" alone is not proof that anyone is working.
  const at = time ?? now
  const buf = useBrain(data)
  const [dpr, setDpr] = useState<number>(phone ? 1.25 : Math.min(2, window.devicePixelRatio || 1))
  const [hidden, setHidden] = useState(false)
  // Rebuild towers and arcs only when the graph's shape changes, not on every new step in the record.
  const shape = data ? data.nodes.map(n => `${n.id}:${n.agent}:${n.budget_k}:${n.deps.join(',')}`).join('|') : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const towers = useMemo(() => (data ? layTowers(layoutNodes(data)) : []), [shape])
  const links = useMemo<[number, number][]>(() => {
    if (!data) return []
    const idx = new Map(data.nodes.map((n, i) => [n.id, i]))
    return data.nodes.flatMap((n, j) => n.deps.filter(d => idx.has(d)).map(d => [idx.get(d)!, j] as [number, number]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape])
  const stats = useMemo(() => (data ? agentStats(data, st, at) : []), [data, st, at])
  const run = useMemo(() => (data ? runState(data, st, at) : new Map<string, 'working' | 'stalled'>()), [data, st, at])
  const plates: PlateStat[] = stats.map(a => ({ agent: a.key, done: a.done, total: a.tasks.length, working: !!a.running, waiting: a.waiting > 0 }))
  const signs: SignStat[] = stats.map(a => ({
    agent: a.key, dept: DEPT[a.key] ?? a.district, name: a.name, done: a.done, total: a.tasks.length,
    state: a.running ? 'working' : a.stalled ? 'stalled' : a.waiting ? 'waiting' : a.next ? 'ready' : 'idle',
    cells: a.tasks.map(n => (st.get(n.id) === 'running' ? (run.get(n.id) ?? 'stalled') : st.get(n.id) ?? 'pending')),
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
          <TowerTags towers={towers} run={run} at={at} />
          <Signs stats={signs} />
          <Arcs towers={towers} links={links} />
          <Workers towers={towers} stats={stats} at={at} />
          <Packets towers={towers} />
          <Records towers={towers} />
          <BrainLabel />
          <HoverLabel towers={towers} stats={stats} run={run} at={at} />
          <Rig towers={towers} links={links} run={run} />
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
