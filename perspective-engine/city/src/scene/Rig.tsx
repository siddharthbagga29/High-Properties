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
import { live } from './shared'
import { ALL_AGENTS, BRAIN_C, CENTER_AGENT, districtCenter, MAX_TASKS, R_PLAZA, ringAngle, ringIndex, type Tower } from './world'

export const controlsRef: { current: CameraControlsImpl | null } = { current: null }
const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Where the camera stands for each focus: always looking inward, so the brain stays in the frame. */
export function viewFor(f: Focus, towers: Tower[], nodes: { id: string }[], portrait: boolean): [THREE.Vector3, THREE.Vector3] {
  const k = portrait ? 1.5 : 1
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
  return [new THREE.Vector3(0, 46 * k, 66 * k), new THREE.Vector3(0, 8, 0)]
}

/** The one per-frame controller: camera flights, status → shader uniforms, cursor field, framing between panels. */
export function Rig({ towers, links }: { towers: Tower[]; links: [number, number][] }) {
  const ref = useRef<CameraControlsImpl>(null)
  const { size, pointer, raycaster, camera } = useThree()
  const lastSt = useRef<Map<string, Status> | null>(null)
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
    const nodes = useStore.getState().data?.nodes ?? []
    const [p, t] = viewFor(useStore.getState().focus, towers, nodes, portrait)
    const id = setTimeout(() => c.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, !reduce), reduce ? 0 : 400)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fly to every new focus.
  useEffect(() => useStore.subscribe((s, p) => {
    if (s.bump === p.bump && focusKey(s.focus) === focusKey(p.focus)) return
    const c = ref.current
    if (!c || !s.data) return
    const [pos, tgt] = viewFor(s.focus, towers, s.data.nodes, portrait)
    c.setLookAt(pos.x, pos.y, pos.z, tgt.x, tgt.y, tgt.z, !reduce)
  }), [towers, portrait])

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

    if (lastSt.current !== s.st) {
      const prev = lastSt.current
      data.nodes.forEach((n, i) => {
        if (i >= MAX_TASKS) return
        const st = s.st.get(n.id) ?? 'pending'
        if (prev && prev.get(n.id) !== st) live.fresh[i] = 1
        live.status[i] = STATUS_CODE[st]
      })
      links.forEach(([a], e) => { edgeOn[e] = live.status[a] === 3 ? 1 : 0 })
      if (prev) sfx.click()
      lastSt.current = s.st
    }
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

    // Keep the subject centred in the space between the side panels.
    const wide = size.width > 900
    const tx = wide ? (live.ui.railW - live.ui.inspW) / 2 : 0
    const ty = wide ? 0 : -live.ui.sheetH / 2
    shift.current.x += (tx - shift.current.x) * (1 - Math.exp(-dt * 4))
    shift.current.y += (ty - shift.current.y) * (1 - Math.exp(-dt * 4))
    ;(camera as THREE.PerspectiveCamera).setViewOffset(size.width, size.height, -shift.current.x, -shift.current.y, size.width, size.height)
  })

  return (
    <CameraControls ref={ref} makeDefault minDistance={4} maxDistance={150} maxPolarAngle={Math.PI * 0.47} minPolarAngle={0.12}
      dollyToCursor smoothTime={reduce ? 0 : 0.55} draggingSmoothTime={0.12}
      onStart={() => { live.idle = 0 }} />
  )
}
