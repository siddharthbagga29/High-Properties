import { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import type CameraControlsImpl from 'camera-controls'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { sfx } from '../audio/sound'
import { STATUS_CODE } from '../data/model'
import type { Status } from '../data/types'
import { focusKey, useStore, type Focus } from '../store'
import { edgeHi, edgeOn } from './Arcs'
import { live, STALLED } from './shared'
import { ALL_AGENTS, BRAIN_C, CENTER_AGENT, districtCenter, MAX_TASKS, R_PLAZA, ringAngle, ringIndex, type Tower } from './world'

export const controlsRef: { current: CameraControlsImpl | null } = { current: null }
const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Default world view: looking down 52°, so the far district sits above the brain instead of behind it. */
const WORLD_EL = THREE.MathUtils.degToRad(52)
const WORLD_T = new THREE.Vector3(0, 4, -2)

/**
 * Distance at which the whole ring, signposts included, fits in the space the panels leave free.
 * Fitted on 1280x800 to 2560x1440: the ring needs about 1.07 viewport heights of free width, or 0.96 of free height.
 */
export function worldDistance(w: number, h: number, portrait: boolean) {
  if (portrait) return 87 * 1.3
  const fw = (w - live.ui.railW - live.ui.inspW) / h, fh = (h - 136 - live.ui.sheetH) / h
  return THREE.MathUtils.clamp(100 * Math.max(1.07 / Math.max(fw, 0.3), 0.96 / Math.max(fh, 0.3)), 87, 190)
}

/** Where the camera stands for each focus: always looking inward, so the brain stays in the frame. */
export function viewFor(f: Focus, towers: Tower[], nodes: { id: string }[], portrait: boolean, worldD = 100): [THREE.Vector3, THREE.Vector3] {
  const k = portrait ? 1.3 : 1
  if (f.kind === 'brain') return [new THREE.Vector3(BRAIN_C[0] + 16 * k, BRAIN_C[1] + 7 * k, BRAIN_C[2] + 30 * k), new THREE.Vector3(BRAIN_C[0], BRAIN_C[1] - 1, BRAIN_C[2])]
  if (f.kind === 'agent') {
    if (f.id === CENTER_AGENT) return [new THREE.Vector3(0, 22 * k, 34 * k), new THREE.Vector3(0, 6, -R_PLAZA * 0.5)]
    // Stand beside the district, slightly outside it: the signpost stays clear of the towers and the brain sits behind them.
    const a = ringAngle(ringIndex(f.id)), u = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), v = new THREE.Vector3(-u.z, 0, u.x)
    const [cx, cz] = districtCenter(f.id)
    const c = new THREE.Vector3(cx, 2, cz)
    return [c.clone().addScaledVector(u, 9 * k).addScaledVector(v, 18 * k).add(new THREE.Vector3(0, 15 * k, 0)), c.clone().addScaledVector(u, -6)]
  }
  if (f.kind === 'task') {
    const i = nodes.findIndex(n => n.id === f.id)
    const t = towers[i]
    if (t) {
      const u = new THREE.Vector3(Math.cos(t.angle), 0, Math.sin(t.angle)), v = new THREE.Vector3(-u.z, 0, u.x)
      const c = new THREE.Vector3(t.x, t.h * 0.5, t.z)
      return [c.clone().addScaledVector(u, 6 * k).addScaledVector(v, 12 * k).add(new THREE.Vector3(0, t.h * 0.5 + 9, 0)), c]
    }
  }
  return [WORLD_T.clone().add(new THREE.Vector3(0, Math.sin(WORLD_EL) * worldD, Math.cos(WORLD_EL) * worldD)), WORLD_T.clone()]
}

/** The one per-frame controller: camera flights, status → shader uniforms, cursor field, framing between panels. */
export function Rig({ towers, links, run }: { towers: Tower[]; links: [number, number][]; run: Map<string, 'working' | 'stalled'> }) {
  const ref = useRef<CameraControlsImpl>(null)
  const { size, pointer, raycaster, camera } = useThree()
  const lastSt = useRef<Map<string, Status> | null>(null)
  const lastRun = useRef<Map<string, 'working' | 'stalled'> | null>(null)
  const lastTime = useRef<number | null>(null)
  const framedAt = useRef(0)
  const plane = useMemo(() => new THREE.Plane(), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const frames = useRef({ n: 0, t: 0 })
  const shift = useRef({ x: 0, y: 0 })
  const portrait = size.width / size.height < 0.8
  live.motion = reduce ? 0 : 1

  // Opening shot: start high and far, then swoop to the world view as the brain assembles.
  useEffect(() => {
    const c = ref.current
    if (!c) return
    controlsRef.current = c
    c.setLookAt(0, 120, 170, 0, 5, 0, false)
    const id = setTimeout(() => {
      const nodes = useStore.getState().data?.nodes ?? []
      const d = worldDistance(size.width, size.height, portrait)
      const [p, t] = viewFor(useStore.getState().focus, towers, nodes, portrait, d)
      framedAt.current = d
      c.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, !reduce)
    }, reduce ? 0 : 400)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fly to every new focus.
  useEffect(() => useStore.subscribe((s, p) => {
    if (s.bump === p.bump && focusKey(s.focus) === focusKey(p.focus)) return
    const c = ref.current
    if (!c || !s.data) return
    const d = worldDistance(size.width, size.height, portrait)
    const [pos, tgt] = viewFor(s.focus, towers, s.data.nodes, portrait, d)
    if (s.focus.kind === 'world') framedAt.current = d
    c.setLookAt(pos.x, pos.y, pos.z, tgt.x, tgt.y, tgt.z, !reduce)
  }), [towers, portrait, size.width, size.height])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.25)
    const s = useStore.getState()
    const data = s.data
    if (!data) return
    live.time += dt
    live.assemble = reduce ? 1 : Math.min(1, live.assemble + dt / 3.5)
    live.idle += dt
    frames.current.n++; frames.current.t += rawDt
    if (frames.current.t > 1) { live.fps = frames.current.n / frames.current.t; frames.current = { n: 0, t: 0 }; (window as unknown as { __fps: number }).__fps = live.fps }

    if (lastSt.current !== s.st || lastRun.current !== run) {
      const prev = lastSt.current
      let changed = false
      data.nodes.forEach((n, i) => {
        if (i >= MAX_TASKS) return
        const st = s.st.get(n.id) ?? 'pending'
        if (prev && prev.get(n.id) !== st) {
          changed = true
          // Live flashes come only from fresh ledger events (Packets); in replay a change at the replay moment flashes.
          if (s.time !== null) live.fresh[i] = 1
        }
        live.status[i] = st === 'running' && run.get(n.id) === 'stalled' ? STALLED : STATUS_CODE[st]
      })
      links.forEach(([a], e) => { edgeOn[e] = live.status[a] === 3 ? 1 : live.status[a] === 4 ? 0.5 : 0 })
      live.working = [...run.values()].filter(x => x === 'working').length
      // A click only for a real change in the live record, not for replay frames or leaving replay.
      if (changed && s.time === null && lastTime.current === null) sfx.click()
      lastSt.current = s.st
      lastRun.current = run
    }
    lastTime.current = s.time
    for (let i = 0; i < Math.min(data.nodes.length, MAX_TASKS); i++) {
      live.progress[i] = 0.5
      live.fresh[i] *= Math.exp(-dt * 1.0)
      live.visible[i] = !s.statusFilter.length || s.statusFilter.includes(s.st.get(data.nodes[i].id) ?? 'pending') ? 1 : 0
    }

    const f = s.focus
    const ti = f.kind === 'task' ? data.nodes.findIndex(n => n.id === f.id) : -1
    live.focusTask = ti
    live.focusAgent = f.kind === 'agent' ? ALL_AGENTS.indexOf(f.id) : ti >= 0 ? ALL_AGENTS.indexOf(data.nodes[ti].agent) : -1
    live.focusMix += ((f.kind === 'agent' || f.kind === 'task' ? 1 : 0) - live.focusMix) * (1 - Math.exp(-dt * 3))
    links.forEach(([a, b], e) => {
      const touch = ti >= 0 ? a === ti || b === ti
        : f.kind === 'agent' ? data.nodes[a].agent === f.id || data.nodes[b].agent === f.id : false
      edgeHi[e] += ((touch ? 1 : 0) - edgeHi[e]) * (1 - Math.exp(-dt * 4))
    })

    // Cursor field around the brain.
    raycaster.setFromCamera(pointer, camera)
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), new THREE.Vector3(...BRAIN_C))
    if (raycaster.ray.intersectPlane(plane, hit)) live.mouse.lerp(hit, 1 - Math.exp(-dt * 10))
    live.mouseOn = reduce ? 0 : 1
    live.mouseR = f.kind === 'brain' ? 1.4 : 1.9

    // Attract mode: after 14 s without input, the world slowly turns.
    const c = ref.current
    if (c && !reduce && f.kind === 'world' && live.idle > 14 && !s.touring) c.rotate(dt * 0.035, 0, false)

    // The panels changed size (or the window did): re-frame the world view so every district stays visible.
    if (c && f.kind === 'world' && !s.touring && framedAt.current) {
      const d = worldDistance(size.width, size.height, portrait)
      if (Math.abs(d - framedAt.current) > 4) {
        framedAt.current = d
        const [pos, tgt] = viewFor(f, towers, data.nodes, portrait, d)
        c.setLookAt(pos.x, pos.y, pos.z, tgt.x, tgt.y, tgt.z, !reduce)
      }
    }

    // Keep the subject centred in the space between the side panels, lifted clear of the ask bar.
    const wide = size.width > 900
    const tx = wide ? (live.ui.railW - live.ui.inspW) / 2 : 0
    const ty = wide ? -36 : -live.ui.sheetH / 2
    shift.current.x += (tx - shift.current.x) * (1 - Math.exp(-dt * 4))
    shift.current.y += (ty - shift.current.y) * (1 - Math.exp(-dt * 4))
    ;(camera as THREE.PerspectiveCamera).setViewOffset(size.width, size.height, -shift.current.x, -shift.current.y, size.width, size.height)
  })

  return (
    <CameraControls ref={ref} makeDefault minDistance={4} maxDistance={200} maxPolarAngle={Math.PI * 0.47} minPolarAngle={0.12}
      dollyToCursor smoothTime={reduce ? 0 : 0.55} draggingSmoothTime={0.12}
      onStart={() => { live.idle = 0 }} />
  )
}
