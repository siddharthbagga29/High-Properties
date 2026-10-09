/**
 * Camera framing, pure maths so it can be checked without a browser (framing.test.ts projects the bust and the
 * district ring at the sizes visitors use). The Rig flies to these views; it also shifts the view so the subject sits
 * in the space the panels leave free (viewShift).
 */
import * as THREE from 'three'
import type { Focus } from '../store'
import { BRAIN_C, BRAIN_S, CENTER_AGENT, districtCenter, R_PLAZA, ringAngle, ringIndex, type Tower } from './world'

export interface PanelSizes { railW: number; inspW: number; sheetH: number }

/** Default world view: looking down 33°, low enough that the bust reads as a figure, high enough to see the ring. */
export const WORLD_EL = THREE.MathUtils.degToRad(33)
/** On a phone the ring is narrow: a steeper look spreads it in depth, so the district tags stop stacking on each other. */
export const PORTRAIT_EL = THREE.MathUtils.degToRad(45)
/** Aim point of the world view: on the bust's chest, so the bust and the ring around it share the frame. */
export const WORLD_T = new THREE.Vector3(0, 10.5, 3)
const AGENT_EL = THREE.MathUtils.degToRad(40)
/** Space the top bar and the ask bar take on wide screens (px). */
export const CHROME_H = 150

/**
 * Distance at which the whole ring (plates and tags) and the whole bust fit in the space the panels leave free,
 * between the mini-map and the drawer and above the ask bar. On a phone the drawer is a sheet below the scene.
 * Checked by projection in framing.test.ts at 1440x900, 1280x800 and 390x844.
 */
export function worldDistance(w: number, h: number, portrait: boolean, ui: PanelSizes) {
  if (portrait) {
    // Free band: below the top bar, above the ask bar that sits on the sheet.
    const fw = w / h, fh = Math.max(h - ui.sheetH - 190, 120) / h
    return THREE.MathUtils.clamp(100 * Math.max(1.16 / Math.max(fw, 0.2), 0.86 / Math.max(fh, 0.2)), 110, 320)
  }
  const fw = (w - ui.railW - ui.inspW) / h, fh = (h - CHROME_H - ui.sheetH) / h
  return THREE.MathUtils.clamp(100 * Math.max(1.0 / Math.max(fw, 0.3), 0.92 / Math.max(fh, 0.3)), 90, 200)
}

/** Pixels to move the picture so the subject is centred in the free space (wide: between the side panels). */
export function viewShift(w: number, ui: PanelSizes) {
  const wide = w > 900
  return { x: wide ? (ui.railW - ui.inspW) / 2 : 0, y: wide ? -30 : -(ui.sheetH / 2) }
}

/** Where the camera stands for each focus: always looking inward, so the bust stays in the frame. */
export function viewFor(f: Focus, towers: Tower[], nodes: { id: string }[], portrait: boolean, worldD = 100): [THREE.Vector3, THREE.Vector3] {
  const k = portrait ? 1.3 : 1
  if (f.kind === 'brain') {
    // A three-quarter portrait of the whole bust: the brain in its head, the face, the organs, both hands.
    const t = new THREE.Vector3(BRAIN_C[0] - 2.5, BRAIN_C[1] - BRAIN_S * 1.32 + (portrait ? 8 : 2.1), BRAIN_C[2])
    const d = portrait ? 148 : 74
    const az = THREE.MathUtils.degToRad(portrait ? 14 : 22), el = THREE.MathUtils.degToRad(portrait ? 12 : 10)
    return [t.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d)), t]
  }
  if (f.kind === 'agent') {
    if (f.id === CENTER_AGENT) return [new THREE.Vector3(0, 22 * k, 34 * k), new THREE.Vector3(0, 6, -R_PLAZA * 0.5)]
    // Face the district from outside, looking in: its towers spread into rows and columns so every tower's tag reads,
    // and the bust stands behind them. (Its own signpost fades out in this view; it would stand in front.)
    const a = ringAngle(ringIndex(f.id)), u = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
    const [cx, cz] = districtCenter(f.id)
    // Far enough that the tallest tower (about 9 units) and its tag fit below the top bar.
    const t = new THREE.Vector3(cx, 4, cz).addScaledVector(u, -2)
    const d = 38 * k
    return [t.clone().addScaledVector(u, d * Math.cos(AGENT_EL)).add(new THREE.Vector3(0, d * Math.sin(AGENT_EL), 0)), t]
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
  // Phone: aim higher, so the plan label over the crown clears the Jarvis status pill under the top bar.
  const T = portrait ? WORLD_T.clone().add(new THREE.Vector3(0, 11, -2)) : WORLD_T.clone()
  const el = portrait ? PORTRAIT_EL : WORLD_EL
  return [T.clone().add(new THREE.Vector3(0, Math.sin(el) * worldD, Math.cos(el) * worldD)), T]
}

/** Project world points through a camera placed as the Rig places it; returns pixel positions (x right, y down). */
export function project(points: THREE.Vector3[], pos: THREE.Vector3, target: THREE.Vector3, w: number, h: number, shift: { x: number; y: number }) {
  const cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 600)
  cam.position.copy(pos)
  cam.lookAt(target)
  cam.setViewOffset(w, h, -shift.x, -shift.y, w, h)
  cam.updateMatrixWorld()
  cam.updateProjectionMatrix()
  return points.map(p => { const v = p.clone().project(cam); return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, z: v.z } })
}
