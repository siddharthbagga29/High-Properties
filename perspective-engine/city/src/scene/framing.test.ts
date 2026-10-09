import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { GraphState } from '../data/types'
import { buildBust } from './bust'
import { project, viewFor, viewShift, worldDistance, type PanelSizes } from './framing'
import { districtCenter, PLATE_R, RING, ringAngle, ringIndex, towers as layTowers } from './world'

const state = JSON.parse(readFileSync(new URL('../../public/state.json', import.meta.url), 'utf8')) as GraphState
const towers = layTowers(state.nodes.map(n => ({ id: n.id, agent: n.agent, budget_k: n.budget_k, used_k: n.run?.used_k ?? 0, phase: n.phase })))
const bust = buildBust({ count: 6000, seed: 3 })

/** Panel sizes as the page reports them (measured in Chromium at each size) and the free area they leave. */
const SIZES: Array<{ w: number; h: number; ui: PanelSizes; free: [number, number, number, number] }> = [
  { w: 1440, h: 900, ui: { railW: 252, inspW: 424, sheetH: 0 }, free: [252, 78, 1016, 836] },
  { w: 1280, h: 800, ui: { railW: 252, inspW: 424, sheetH: 0 }, free: [252, 78, 856, 736] },
  { w: 390, h: 844, ui: { railW: 0, inspW: 0, sheetH: 304 }, free: [0, 112, 390, 484] },
]

function subject() {
  const ring: THREE.Vector3[] = []
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2
    for (const agent of RING) {
      const [cx, cz] = districtCenter(agent)
      ring.push(new THREE.Vector3(cx + Math.cos(a) * PLATE_R * 1.08, 0, cz + Math.sin(a) * PLATE_R * 1.08))
    }
  }
  for (const t of towers) ring.push(new THREE.Vector3(t.x, t.h, t.z))
  const body: THREE.Vector3[] = []
  for (let i = 0; i < bust.count; i++) if (bust.info[i * 4 + 2] < 4.5) body.push(new THREE.Vector3(bust.pos[i * 3], bust.pos[i * 3 + 1], bust.pos[i * 3 + 2]))
  // District tags: centred 1.2 above each drone at home, about 130 x 34 px.
  const tags = RING.map(agent => {
    const a = ringAngle(ringIndex(agent)), [hx, hz] = districtCenter(agent)
    return new THREE.Vector3(hx - Math.cos(a) * 1.5, 4.4, hz - Math.sin(a) * 1.5)
  })
  return { ring, body, tags }
}

function box(pts: { x: number; y: number }[]) {
  return pts.reduce((b, p) => [Math.min(b[0], p.x), Math.min(b[1], p.y), Math.max(b[2], p.x), Math.max(b[3], p.y)], [Infinity, Infinity, -Infinity, -Infinity])
}

describe('camera framing', () => {
  const { ring, body, tags } = subject()
  for (const { w, h, ui, free } of SIZES) {
    it(`frames the whole bust and the district ring at ${w}x${h}`, () => {
      const portrait = w / h < 0.8
      const d = worldDistance(w, h, portrait, ui)
      const [pos, tgt] = viewFor({ kind: 'world' }, towers, state.nodes, portrait, d)
      const shift = viewShift(w, ui)
      const rb = box(project(ring, pos, tgt, w, h, shift))
      const bb = box(project(body, pos, tgt, w, h, shift))
      const tb = box(project(tags, pos, tgt, w, h, shift).flatMap(p => [{ x: p.x - 65, y: p.y - 17 }, { x: p.x + 65, y: p.y + 17 }]))
      const all = [Math.min(rb[0], bb[0], tb[0]), Math.min(rb[1], bb[1], tb[1]), Math.max(rb[2], bb[2], tb[2]), Math.max(rb[3], bb[3], tb[3])]
      // The bust is the subject: it takes a real share of the free height, not a speck in the middle.
      const bustShare = (bb[3] - bb[1]) / (free[3] - free[1])
      if (process.env.FRAMING_DEBUG) console.log(JSON.stringify({ w, h, d: +d.toFixed(1), ring: rb.map(Math.round), bust: bb.map(Math.round), tags: tb.map(Math.round), bustShare: +bustShare.toFixed(2) }))
      expect(all[0]).toBeGreaterThanOrEqual(free[0])
      expect(all[1]).toBeGreaterThanOrEqual(free[1])
      expect(all[2]).toBeLessThanOrEqual(free[2])
      expect(all[3]).toBeLessThanOrEqual(free[3])
      expect(bustShare).toBeGreaterThan(0.38)
    })

    it(`frames the whole bust in the brain view at ${w}x${h}`, () => {
      const portrait = w / h < 0.8
      const [pos, tgt] = viewFor({ kind: 'brain' }, towers, state.nodes, portrait)
      const bb = box(project(body, pos, tgt, w, h, viewShift(w, ui)))
      if (process.env.FRAMING_DEBUG) console.log(JSON.stringify({ brain: [w, h], bust: bb.map(Math.round), share: +((bb[3] - bb[1]) / (free[3] - free[1])).toFixed(2) }))
      expect(bb[0]).toBeGreaterThanOrEqual(free[0])
      expect(bb[1]).toBeGreaterThanOrEqual(free[1])
      expect(bb[2]).toBeLessThanOrEqual(free[2])
      expect(bb[3]).toBeLessThanOrEqual(free[3])
      expect((bb[3] - bb[1]) / (free[3] - free[1])).toBeGreaterThan(0.6)
    })
  }
})
