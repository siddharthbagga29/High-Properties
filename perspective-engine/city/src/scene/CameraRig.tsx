import { useFrame, useThree } from '@react-three/fiber'
import { easing } from 'maath'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { sfx } from '../audio/sound'
import { focusKind, STATUS_CODE } from '../data/model'
import type { Status } from '../data/types'
import { useStore } from '../store'
import { edgeHi, edgeOn } from './Arcs'
import { AGENTS, BRAIN_C, districtCenter, MAX_TASKS, type Tower } from './layout'
import { live } from './shared'
import { workerPos } from './Workers'

const R_BY_LEVEL = [0, 0.36, 0.47, 0.37, 0.4]
const MOUSE_R = [0, 2.4, 3.4, 1.8, 0.8]
const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The single per-frame controller: camera dive paths, semantic-zoom blend, cursor field,
 * reticle position, and status uniforms. Everything else only reads `live`.
 */
export function CameraRig({ towers, links }: { towers: Tower[]; links: [number, number][] }) {
  const { camera, size, raycaster, pointer } = useThree()
  const look = useRef(new THREE.Vector3(...BRAIN_C))
  const want = useMemo(() => new THREE.Vector3(), [])
  const fp = useMemo(() => new THREE.Vector3(), [])
  const off = useMemo(() => new THREE.Vector3(), [])
  const plane = useMemo(() => new THREE.Plane(), [])
  const ndc = useMemo(() => new THREE.Vector3(), [])
  const lastSt = useRef<Map<string, Status> | null>(null)
  const lastLevel = useRef(0)
  const shift = useRef(0)
  const frames = useRef({ n: 0, t: 0 })
  const reticle = useMemo(() => (typeof document !== 'undefined' ? document.documentElement : null), [])
  live.motion = reduce ? 0 : 1

  useFrame((state, rawDt) => {
    // Real time, lightly capped: slow devices still assemble in ~3.5 s instead of stretching out.
    const dt = Math.min(rawDt, 0.25)
    const s = useStore.getState()
    const data = s.data
    if (!data) return
    live.time += dt
    live.assemble = reduce ? 1 : Math.min(1, live.assemble + dt / 3.5)

    // FPS, exposed for measurement
    frames.current.n++; frames.current.t += rawDt
    if (frames.current.t > 1) { live.fps = frames.current.n / frames.current.t; frames.current = { n: 0, t: 0 }; (window as unknown as { __fps: number }).__fps = live.fps }

    // Statuses → uniforms (only when the map changes)
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
      live.progress[i] = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(live.time * 0.32 + i * 1.7))
      live.fresh[i] *= Math.exp(-dt * 1.1)
      const n = data.nodes[i]
      const okS = !s.statusFilter.length || s.statusFilter.includes(s.st.get(n.id) ?? 'pending')
      const okP = !s.phaseFilter.length || s.phaseFilter.includes(n.phase)
      live.visible[i] = okS && okP ? 1 : 0
    }

    // Semantic zoom: level + nudge drives the cortex → city blend.
    const zoom = s.level + s.nudge
    easing.damp(live, 'city', THREE.MathUtils.clamp((zoom - 1.3) / 0.55, 0, 1), reduce ? 0.001 : 0.5, dt)

    // Focus point and camera offset per level.
    const kind = focusKind(data, s.focus)
    const lean = reduce ? 0 : 0.12
    // Portrait screens see less width, so the camera stands further back.
    const k = (1 - s.nudge * 0.45) * (size.width / size.height < 0.8 ? 1.45 : 1)
    let focusTask = -1, focusDistrict = -1
    if (kind === 'venture') {
      fp.set(...BRAIN_C)
      off.set(14, 7, 21).multiplyScalar(k)
    } else if (kind === 'city') {
      fp.set(0, 1, 0)
      off.set(0, 31, 37).multiplyScalar(k)
    } else if (kind === 'agent') {
      const [cx, cz] = districtCenter(s.focus)
      focusDistrict = AGENTS.indexOf(s.focus)
      if (s.workerView) { fp.copy(workerPos[s.focus]); off.set(2.6, 1.8, 5.6).multiplyScalar(k) }
      else { fp.set(cx, 1.6, cz); off.set(0, 12.5, 15.5).multiplyScalar(k) }
    } else {
      const i = data.nodes.findIndex(n => n.id === s.focus)
      const t = towers[i]
      focusTask = i
      focusDistrict = AGENTS.indexOf(t.agent)
      fp.set(t.x, t.h * 0.5, t.z)
      off.set(3.2 + t.h * 0.35, 2.4 + t.h * 0.35, 7.5 + t.h * 0.55).multiplyScalar(k)
    }
    live.focusTask = focusTask
    live.focusDistrict = focusDistrict
    easing.damp(live, 'focusMix', kind === 'agent' || kind === 'task' ? 1 : 0, 0.4, dt)

    // The form leans toward the cursor: a small orbit around the focus.
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), -pointer.x * lean * 1.6)
    off.y += pointer.y * lean * off.length() * 0.35
    want.copy(fp).add(off)
    const smooth = reduce ? 0.0001 : 0.42
    easing.damp3(camera.position, want, smooth, dt)
    easing.damp3(look.current, fp, smooth, dt)
    camera.lookAt(look.current)

    // Keep the subject clear of side panels.
    const wide = size.width > 900
    // Story captions sit on the left (subject moves right); the dossier sits on the right (subject moves left).
    const target = !wide ? 0 : s.mode === 'story' ? size.width * 0.17 : -170
    shift.current += (target - shift.current) * (1 - Math.exp(-dt * 4))
    const cam = camera as THREE.PerspectiveCamera
    const lift = !wide && s.mode === 'explore' ? size.height * 0.14 : 0
    cam.setViewOffset(size.width, size.height, -shift.current, lift, size.width, size.height)

    // Cursor field: where the pointer meets a plane through the focus.
    raycaster.setFromCamera(pointer, camera)
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), look.current)
    const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3())
    if (hit) live.mouse.lerp(hit, 1 - Math.exp(-dt * 10))
    live.mouseOn = reduce ? 0 : 1
    live.mouseR = MOUSE_R[s.level] * (s.workerView ? 0.4 : 1)

    // Highlight dependency arcs touching the focus.
    links.forEach(([a, b], e) => {
      const touch = focusTask >= 0 ? a === focusTask || b === focusTask
        : focusDistrict >= 0 ? data.nodes[a].agent === s.focus || data.nodes[b].agent === s.focus : false
      edgeHi[e] += ((touch ? 1 : 0) - edgeHi[e]) * (1 - Math.exp(-dt * 4))
    })

    // Reticle: the circular window glides to the focus and resizes per level.
    ndc.copy(look.current).project(camera)
    const sx = (ndc.x * 0.5 + 0.5) * size.width, sy = (-ndc.y * 0.5 + 0.5) * size.height
    const r = R_BY_LEVEL[s.level] * Math.min(size.width, size.height) * (1 + s.nudge * 0.25) * (s.workerView ? 0.6 : 1)
    live.windowR += (r - live.windowR) * (1 - Math.exp(-dt * (reduce ? 60 : 5)))
    if (reticle) {
      reticle.style.setProperty('--fx', `${sx.toFixed(1)}px`)
      reticle.style.setProperty('--fy', `${sy.toFixed(1)}px`)
      reticle.style.setProperty('--fr', `${live.windowR.toFixed(1)}px`)
    }

    if (lastLevel.current !== s.level) { sfx.level(s.level); lastLevel.current = s.level }
    void state
  })
  return null
}
