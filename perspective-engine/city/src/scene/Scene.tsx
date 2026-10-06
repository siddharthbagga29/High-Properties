import { PerformanceMonitor } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { sfx } from '../audio/sound'
import { newEvents } from '../data/model'
import type { GraphState } from '../data/types'
import { useStore } from '../store'
import { Arcs } from './Arcs'
import { Background, Motes } from './Atmosphere'
import { CameraRig } from './CameraRig'
import { Cortex } from './Cortex'
import { Hotspots } from './Hotspots'
import { AGENTS, buildParticles, towers as layTowers, type LayoutNode, type ParticleOutput } from './layout'
import { Atoms, comets, Incoming } from './Records'
import { live } from './shared'
import { Workers } from './Workers'

const phone = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px), (pointer: coarse)').matches
const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4
/** Particle budget: 160k desktop, 90k on modest machines, 40k on phones. */
export const PARTICLES = phone ? 40_000 : cores <= 4 ? 90_000 : 160_000

function layoutNodes(d: GraphState): LayoutNode[] {
  return d.nodes.map(n => ({ id: n.id, agent: n.agent, budget_k: n.budget_k, used_k: n.run?.used_k ?? 0, phase: n.phase }))
}

function useParticles(data: GraphState | null) {
  const key = data ? data.nodes.map(n => `${n.id}:${n.run?.used_k ?? 0}`).join('|') : ''
  const [buf, setBuf] = useState<ParticleOutput | null>(null)
  useEffect(() => {
    if (!data) return
    const input = { nodes: layoutNodes(data), count: PARTICLES, seed: 20261006 }
    let worker: Worker | null = null
    try {
      worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = e => setBuf(e.data as ParticleOutput)
      worker.onerror = () => setBuf(buildParticles(input))
      worker.postMessage(input)
    } catch {
      setBuf(buildParticles(input))
    }
    return () => worker?.terminate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return buf
}

/** Read-only diagnostics hook for tests and FPS measurement. */
if (typeof window !== 'undefined') (window as unknown as { __pe: unknown }).__pe = { live, store: useStore }

export default function Scene() {
  const data = useStore(s => s.data)
  const buf = useParticles(data)
  const [dpr, setDpr] = useState<number>(phone ? 1.25 : Math.min(2, window.devicePixelRatio || 1))
  const [hidden, setHidden] = useState(false)
  const towers = useMemo(() => (data ? layTowers(layoutNodes(data)) : []), [data])
  const links = useMemo<[number, number][]>(() => {
    if (!data) return []
    const idx = new Map(data.nodes.map((n, i) => [n.id, i]))
    return data.nodes.flatMap((n, j) => n.deps.filter(d => idx.has(d)).map(d => [idx.get(d)!, j] as [number, number]))
  }, [data])

  useEffect(() => {
    const on = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])

  // Live: new ledger events fly in as sparks and ring that agent's bell.
  useEffect(() => useStore.subscribe((s, p) => {
    if (s.data === p.data || !s.data || !p.data) return
    newEvents(p.data, s.data).forEach((e, k) => {
      const i = s.data!.nodes.findIndex(n => n.id === e.node)
      const t = towers[i]
      if (!t) return
      const a = Math.random() * Math.PI * 2
      comets.push({ from: new THREE.Vector3(Math.cos(a) * 60, 18 + Math.random() * 20, Math.sin(a) * 60), to: new THREE.Vector3(t.x, t.h, t.z), t0: live.time + k * 0.25, agent: AGENTS.indexOf(t.agent) })
      setTimeout(() => sfx.ping(AGENTS.indexOf(t.agent)), 1600 + k * 250)
    })
  }), [towers])

  return (
    <Canvas
      dpr={dpr}
      frameloop={hidden ? 'never' : 'always'}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false }}
      camera={{ fov: 42, near: 0.1, far: 500, position: [6, 16, 44] }}
      onPointerMissed={() => useStore.getState().set({ hover: null })}
      aria-hidden="true"
    >
      <color attach="background" args={['#0a0524']} />
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(phone ? 1.25 : Math.min(2, window.devicePixelRatio || 1))} />
      <Background />
      {buf && towers.length > 0 && (
        <>
          <Cortex buf={buf} towers={towers} />
          <Arcs towers={towers} taskBrain={buf.taskBrain} links={links} />
          <Workers towers={towers} lobes={buf.lobeCentroids} />
          <Hotspots towers={towers} lobes={buf.lobeCentroids} />
          <Atoms towers={towers} />
          <Incoming />
          <CameraRig towers={towers} links={links} />
        </>
      )}
      <Motes count={phone ? 160 : 300} />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.7} radius={0.6} luminanceThreshold={0} luminanceSmoothing={0.2} mipmapBlur />
      </EffectComposer>
    </Canvas>
  )
}
