import { Html, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { agentStats, clock, fmtK, lastSignal, runState, STATUS_LABEL, type AgentStats } from '../data/model'
import type { GraphState } from '../data/types'
import { bodyAt, partName, type BodyView } from '../jarvis/body'
import { useStore } from '../store'
import { Arcs } from './Arcs'
import { Background, Motes } from './Atmosphere'
import { Brain } from './Brain'
import { buildBust } from './bust'
import { bodyLive, Bust, useBodyHover } from './Bust'
import { Ground, LegendRing, Plates, Shockwave, Spokes, type PlateStat } from './Ground'
import { labelLayer } from './portal'
import { Records } from './Records'
import { Rig } from './Rig'
import { agentState, live, verifying } from './shared'
import { TowerTags, Towers } from './Towers'
import { Packets, Workers, workerPos } from './Workers'
import { agentLabel, BRAIN_C, BRAIN_S, buildBrain, DEPT, towers as layTowers, type BrainOutput, type LayoutNode, type Tower } from './world'

const phone = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px), (pointer: coarse)').matches
const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4
/** Brain particle budget: 105k desktop, 60k on modest machines, 27k on phones (the brain is smaller inside the bust). */
export const PARTICLES = phone ? 27_000 : cores <= 4 ? 60_000 : 105_000
/** The bust around it: built tissue is particles, the faint wireframe carries the unbuilt parts. */
export const BUST_PARTICLES = phone ? 12_000 : cores <= 4 ? 24_000 : 40_000

if (typeof window !== 'undefined') (window as unknown as { __pe: unknown }).__pe = { live, store: useStore, body: bodyLive }

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

function HoverLabel({ towers, stats, run, at, body }: { towers: Tower[]; stats: AgentStats[]; run: Map<string, 'working' | 'stalled'>; at: number; body: BodyView | null }) {
  const hover = useStore(s => s.hover)
  const bodyPart = useBodyHover(s => s.part)
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const group = useRef<THREE.Group>(null!)
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    if (!hover || !group.current || !data) return
    if (hover.kind === 'task') { const t = towers[data.nodes.findIndex(n => n.id === hover.id)]; if (t) v.set(t.x, t.h + 1, t.z) }
    else if (hover.kind === 'worker' || hover.kind === 'agent') { const w = workerPos[hover.id]; if (w) v.copy(w).add(new THREE.Vector3(0, 2.2, 0)) }
    else v.set(BRAIN_C[0], BRAIN_C[1] + BRAIN_S * 1.2, BRAIN_C[2])
    group.current.position.lerp(v, 0.35)
  })
  // A body part speaks for itself (scene/Bust.tsx), even though it lights its agent's district.
  if (!hover || !data || bodyPart !== null) return null
  let title = '', lines: string[] = []
  if (hover.kind === 'task') {
    const n = data.nodes.find(x => x.id === hover.id)
    if (!n) return null
    const r = run.get(n.id), last = r === 'stalled' ? lastSignal(data, n.id, at) : null
    title = `${n.id} · ${n.title}`
    lines = [
      r === 'working' ? 'Working now' : r === 'stalled' ? `Stalled${last ? ` since ${clock(last).slice(0, 5)}` : ''} — no session running` : STATUS_LABEL[st.get(n.id) ?? 'pending'],
      n.run ? `${fmtK(n.run.used_k)} spent / ${n.budget_k}k plan` : `${n.budget_k}k token plan`,
      agentLabel(n.agent, data.agents[n.agent]?.name ?? n.agent),
    ]
  } else if (hover.kind === 'brain') {
    const done = data.nodes.filter(n => st.get(n.id) === 'done').length
    const working = [...run.values()].filter(x => x === 'working').length, stalled = run.size - working
    const mind = body?.parts.find(p => p.id === 'mind')
    title = 'The brain · the plan and the orchestrator'
    lines = [`${done}/${data.nodes.length} tasks built`, `${working || 'nobody'} working${stalled ? ` · ${stalled} stalled` : ''}`, 'click to open']
    if (mind) lines.splice(1, 0, `${partName(mind)}: ${mind.done} of ${mind.total} verified`)
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

/** At the foot of the bust in the world view: the plan, run by the Mayor, and how much of the body is built. */
function BrainLabel({ body }: { body: BodyView | null }) {
  const focus = useStore(s => s.focus)
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const group = useRef<THREE.Group>(null!)
  const el = useRef<HTMLDivElement>(null)
  const dir = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    if (!group.current) return
    // On the camera's side of the bust, on the plaza just in front of its base, inside the near ring of districts.
    dir.set(camera.position.x - BRAIN_C[0], 0, camera.position.z - BRAIN_C[2]).normalize().multiplyScalar(BRAIN_S * 1.15)
    group.current.position.set(BRAIN_C[0] + dir.x, 0.3, BRAIN_C[2] + dir.z)
    if (el.current) el.current.style.opacity = live.assemble > 0.9 ? '1' : '0'
  })
  if (!data || focus.kind !== 'world') return null
  const done = data.nodes.filter(n => st.get(n.id) === 'done').length
  return (
    <group ref={group}>
      <Html portal={labelLayer} zIndexRange={[18, 0]} style={{ transform: 'translate3d(-50%,0,0)', pointerEvents: 'none' }}>
        <div ref={el} className="brain-tag" style={{ opacity: 0, transition: 'opacity 0.6s', background: 'rgba(10,5,36,0.8)', border: '1px solid rgba(143,230,255,0.45)', borderRadius: 3, padding: '3px 9px', whiteSpace: 'nowrap', font: '600 12px var(--mono)', letterSpacing: '0.08em', color: '#8fe6ff' }}>
          THE PLAN · {(data.agents.orchestrator?.name ?? 'Mayor').toUpperCase()} · {done}/{data.nodes.length} BUILT
          {body && <div style={{ font: '500 10.5px var(--mono)', letterSpacing: '0.06em', color: '#bda6ff', textAlign: 'center', marginTop: 1 }}>
            BODY {Math.round(body.overall * 100)}% BUILT · FACE {body.face.stage ? `${body.face.stage}/3 FORMED` : 'AWAITS REVENUE'}
          </div>}
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
  const bust = useMemo(() => buildBust({ count: BUST_PARTICLES, seed: 20261009 }), [])
  // The body as of the replay moment (or live): which parts are built comes only from verified work.
  const body = useMemo(() => (data ? bodyAt(data, st, time) : null), [data, st, time])
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
  // An agent counts as working only on its own recent steps: a task kept live by the verifier alone does not light its district.
  const own = (a: AgentStats) => !!a.running && !!data && !verifying(a, data, at)
  const plates: PlateStat[] = stats.map(a => ({ agent: a.key, done: a.done, total: a.tasks.length, working: own(a), waiting: a.waiting > 0 }))
  const working = stats.filter(own).map(a => a.key)

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
          <Arcs towers={towers} links={links} />
          <Workers towers={towers} stats={stats} at={at} />
          <Packets towers={towers} />
          <Records towers={towers} />
          <BrainLabel body={body} />
          <HoverLabel towers={towers} stats={stats} run={run} at={at} body={body} />
          <Bust buf={bust} body={body} towers={towers} />
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
