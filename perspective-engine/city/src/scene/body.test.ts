/**
 * The body, data side (src/jarvis/body.ts) and geometry side (scene/bust.ts). Kept beside the scene because the body
 * module and its renderer are one feature; the data checks run on the real export in public/state.json.
 */
import { readFileSync } from 'node:fs'
import { PE_BODY, peBody, type PEState } from '@jarvis/adapters/perspective-engine'
import { describe, expect, it } from 'vitest'
import type { GraphState, Status } from '../data/types'
import { bodyArrivals, bodyAt, faceTooltip, partDetail, partName, partOfTask, partTooltip, revenueOf } from '../jarvis/body'
import { ARMS, BUST_PARTS, buildBust, bustOccludes, FACE, flyIn, handOf, KIND, N_PARTS, toLocal, toWorld } from './bust'
import { BRAIN_C, BRAIN_S, BUST_BASE, districtCenter } from './world'

const state = JSON.parse(readFileSync(new URL('../../public/state.json', import.meta.url), 'utf8')) as GraphState
const revenue = (entries: unknown[]) => ({ ...state, revenue: entries }) as GraphState
// Revenue as the export publishes it once the founder's signature on it was re-checked (sigVerified).
const paid = (payer: string, t = '2026-10-08T10:00:00Z') => ({ t, amountUsd: 500, payer, evidence: 'invoice INV-1 paid (bank statement)', recordedBy: 'founder', auth: 'signed', sigVerified: true })

describe('body from the record', () => {
  const body = bodyAt(state)

  it('agrees with the Jarvis core on every part, the face and the overall share', () => {
    const core = peBody(state as unknown as PEState)
    expect(body.parts.map(p => p.id)).toEqual(PE_BODY.map(p => p.id))
    expect(body.parts.map(p => [p.done, p.prepared, p.total, p.fill])).toEqual(core.parts.map(p => [p.done, p.prepared, p.total, p.fill]))
    expect(body.overall).toBe(core.overall)
    expect(body.face).toEqual(core.face)
  })

  it('splits each part into verified (cyan) and prepared (violet) work, task by task', () => {
    const status = new Map(state.nodes.map(n => [n.id, n.view ?? n.status]))
    for (const p of body.parts) {
      expect(p.verified).toEqual(p.tasks.filter(id => status.get(id) === 'done'))
      expect(p.waiting).toEqual(p.tasks.filter(id => status.get(id) === 'awaiting_human'))
      expect(p.done).toBe(p.verified.length)
      expect(p.prepared).toBe(p.waiting.length)
      expect(p.built).toBeCloseTo(p.done / p.total, 3)
      expect(p.fill).toBeGreaterThanOrEqual(p.built)
      expect(p.fill).toBeLessThanOrEqual(1)
      expect(p.agentName).toBe(state.agents[p.builtBy]?.name ?? p.builtBy)
    }
  })

  it('writes the hover line in the agreed form', () => {
    expect(partTooltip({ label: 'Heart', agentName: 'Ada', done: 1, total: 3, verified: ['F04'] })).toBe('Heart · built by Ada · 1 of 3 tasks verified (F04)')
    expect(partTooltip({ label: 'Mind (brain)', agentName: 'Mayor', done: 0, total: 1, verified: [] })).toBe('Mind · built by Mayor · 0 of 1 task verified')
    for (const p of body.parts) expect(p.tooltip).toBe(partTooltip(p))
    expect(partName({ label: 'Mind (brain)' })).toBe('Mind')
  })

  it('says what is prepared and what is left', () => {
    const heart = body.parts.find(p => p.id === 'heart')!
    const detail = partDetail(heart)
    if (heart.done === heart.total) expect(detail).toBe('fully built')
    else expect(detail.length).toBeGreaterThan(0)
    const fake = { ...heart, done: 1, prepared: 1, total: 3, waiting: ['V14'] }
    expect(partDetail(fake)).toBe('1 prepared, waiting on the founder (V14) · 1 not built yet')
  })

  it('keeps the face unformed without revenue, and when revenue is absent from the export', () => {
    expect(revenueOf({ ...state, revenue: undefined } as unknown as GraphState)).toEqual([])
    expect(bodyAt({ ...state, revenue: undefined } as unknown as GraphState).face.stage).toBe(0)
    expect(bodyAt(revenue([])).face.stage).toBe(0)
    expect(faceTooltip(bodyAt(revenue([])).face)).toContain('verified revenue')
  })

  it('forms the face only from founder-recorded revenue with evidence, one stage per paying customer', () => {
    expect(bodyAt(revenue([{ ...paid('Acme'), recordedBy: 'agent' }])).face.stage).toBe(0)
    expect(bodyAt(revenue([{ ...paid('Acme'), auth: 'attested', sigVerified: false }])).face.stage).toBe(0)  // on trust: never
    expect(bodyAt(revenue([{ ...paid('Acme'), evidence: '' }])).face.stage).toBe(0)
    expect(bodyAt(revenue([paid('Acme')])).face.stage).toBe(1)
    expect(bodyAt(revenue([paid('Acme'), paid('acme ')])).face.stage).toBe(1)
    expect(bodyAt(revenue([paid('Acme'), paid('Beta')])).face.stage).toBe(2)
    expect(bodyAt(revenue([paid('Acme'), paid('Beta'), paid('Gamma'), paid('Delta')])).face.stage).toBe(3)
  })

  it('replays: statuses and revenue as of the replay moment', () => {
    const s = revenue([paid('Acme', '2026-10-08T10:00:00Z'), paid('Beta', '2026-10-08T12:00:00Z')])
    expect(bodyAt(s, undefined, Date.parse('2026-10-08T09:00:00Z')).face.stage).toBe(0)
    expect(bodyAt(s, undefined, Date.parse('2026-10-08T11:00:00Z')).face.stage).toBe(1)
    expect(bodyAt(s, undefined, null).face.stage).toBe(2)
    const nothing = new Map<string, Status>(state.nodes.map(n => [n.id, 'pending']))
    const empty = bodyAt(state, nothing, 0)
    expect(empty.overall).toBe(0)
    for (const p of empty.parts) expect([p.done, p.prepared, p.fill]).toEqual([0, 0, 0])
  })

  it('maps every task to at most one part', () => {
    expect(partOfTask('F04')).toBe('heart')
    expect(partOfTask('V05')).toBe('arm_right')
    expect(partOfTask('NOPE')).toBeUndefined()
    const all = PE_BODY.flatMap(p => p.tasks)
    expect(new Set(all).size).toBe(all.length)
  })

  it('turns a fresh ledger "done" into an arrival at that agent\'s organ; old history never animates', () => {
    const now = Date.parse('2026-10-09T12:00:00Z')
    const t = new Date(now - 20_000).toISOString()
    const next = { ...state, ledger: [...state.ledger, { t, event: 'done', node: 'F04', note: 'verified' }, { t, event: 'start', node: 'V14', note: '' }] } as GraphState
    expect(bodyArrivals(state, next, now)).toEqual([{ part: 'heart', agent: 'product', node: 'F04', t }])
    expect(bodyArrivals(null, next, now)).toEqual([])
    const old = { ...state, ledger: [...state.ledger, { t: new Date(now - 3_600_000).toISOString(), event: 'done', node: 'F04', note: '' }] } as GraphState
    expect(bodyArrivals(state, old, now)).toEqual([])
  })
})

describe('bust geometry', () => {
  const N = 12_000
  const b = buildBust({ count: N, seed: 7 })

  it('is deterministic for a seed and fills the whole budget', () => {
    const again = buildBust({ count: N, seed: 7 })
    expect(b.count).toBe(N)
    expect(Array.from(again.pos.slice(0, 300))).toEqual(Array.from(b.pos.slice(0, 300)))
    expect(b.pos.length).toBe(N * 3)
    expect(b.info.length).toBe(N * 4)
    for (const v of b.pos) expect(Number.isFinite(v)).toBe(true)
    for (const v of b.lines) expect(Number.isFinite(v)).toBe(true)
  })

  it('lands every particle by the end of the opening (the assemble clock stops at 1)', () => {
    for (let i = 0; i < N; i++) expect(flyIn(1, b.info[i * 4 + 3])).toBe(1)
    expect(flyIn(1, 1)).toBe(1)
    expect(flyIn(0, 0)).toBe(0)
    // Still mid-flight part way through, so the body visibly assembles.
    expect(flyIn(0.6, 0.9)).toBe(0)
  })

  it('sets the eyes below the brain, so the mind never hides the face', () => {
    // The brain's lowest cortex sits about 0.44 (local) below its centre; every eye particle is under that line.
    let eyes = 0
    for (let i = 0; i < N; i++) {
      if (b.info[i * 4 + 2] !== KIND.eyes) continue
      eyes++
      expect(toLocal([b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]])[1]).toBeLessThan(-0.4)
    }
    expect(eyes).toBeGreaterThan(50)
  })

  it('gives every organ particles and a wireframe ghost', () => {
    for (let i = 0; i < N_PARTS; i++) {
      if (i !== FACE) expect(b.perPart[i], BUST_PARTS[i]).toBeGreaterThan(N * 0.03)
      let segs = 0
      for (let v = 0; v < b.lineInfo.length / 2; v++) if (b.lineInfo[v * 2] === i) segs++
      expect(segs, `${BUST_PARTS[i]} wireframe`).toBeGreaterThan(0)
    }
  })

  it('lights exactly a part\'s built share of its particles (ranks are uniform)', () => {
    for (let i = 0; i < N_PARTS; i++) {
      if (i === FACE) continue
      const ranks: number[] = []
      for (let k = 0; k < N; k++) if (b.info[k * 4] === i && b.info[k * 4 + 2] === KIND.body) ranks.push(b.info[k * 4 + 1])
      for (const f of [1 / 3, 0.6, 2 / 3]) {
        const lit = ranks.filter(r => r < f).length / ranks.length
        expect(Math.abs(lit - f), `${BUST_PARTS[i]} at ${f}`).toBeLessThan(0.02)
      }
      expect(ranks.every(r => r >= 0 && r < 1)).toBe(true)
    }
  })

  it('stands on the plaza without touching the ground, the brain in its head', () => {
    let minY = Infinity, maxY = -Infinity
    for (let k = 0; k < N; k++) { minY = Math.min(minY, b.pos[k * 3 + 1]); maxY = Math.max(maxY, b.pos[k * 3 + 1]) }
    expect(minY).toBeGreaterThan(0)
    expect(toWorld([0, BUST_BASE, 0])[1]).toBeGreaterThan(0)
    expect(maxY).toBeGreaterThan(BRAIN_C[1] + BRAIN_S * 0.8)
    expect(b.anchors[0 * 3 + 1]).toBeGreaterThan(BRAIN_C[1] - BRAIN_S)
  })

  it('keeps the face featureless except for the stroke kinds revenue unlocks', () => {
    const kinds = new Set<number>()
    for (let k = 0; k < N; k++) if (b.info[k * 4] === FACE) kinds.add(b.info[k * 4 + 2])
    expect([...kinds].sort()).toEqual([KIND.mask, KIND.eyes, KIND.browNose, KIND.mouth])
    // Features lie on the front of the face.
    for (let k = 0; k < N; k++) {
      if (b.info[k * 4 + 2] >= KIND.eyes && b.info[k * 4 + 2] <= KIND.mouth) expect(b.pos[k * 3 + 2] - BRAIN_C[2]).toBeGreaterThan(0.3 * BRAIN_S)
    }
  })

  it('reaches each hand toward its own district: right → go-to-market, left → brand', () => {
    for (const [name, agent, other] of [['arm_right', 'gtm', 'brand'], ['arm_left', 'brand', 'gtm']] as const) {
      const a = ARMS[name], tip = toWorld(handOf(a).palm.c), sh = toWorld(a.J)
      const dist = (agentKey: string) => { const [x, z] = districtCenter(agentKey); return Math.hypot(tip[0] - x, tip[2] - z) }
      const [ox, oz] = districtCenter(agent)
      expect(dist(agent)).toBeLessThan(dist(other))
      expect(Math.hypot(tip[0] - ox, tip[2] - oz)).toBeLessThan(Math.hypot(sh[0] - ox, sh[2] - oz))
    }
  })

  it('puts each organ\'s stream anchor inside the bust', () => {
    for (let i = 0; i < N_PARTS; i++) {
      const [x, y, z] = [b.anchors[i * 3], b.anchors[i * 3 + 1], b.anchors[i * 3 + 2]]
      expect(Math.hypot(x - BRAIN_C[0], z - BRAIN_C[2])).toBeLessThan(BRAIN_S * 3)
      expect(y).toBeGreaterThan(0)
      expect(y).toBeLessThan(BRAIN_C[1] + BRAIN_S * 1.2)
    }
  })

  it('knows when a label stands behind the bust', () => {
    const cam: [number, number, number] = [0, 75, 100]
    expect(bustOccludes(cam, [0, 4.4, -25.5])).toBe(true)
    expect(bustOccludes(cam, [27, 4.4, 0])).toBe(false)
    expect(bustOccludes(cam, [0, 2, 27])).toBe(false)
    expect(bustOccludes(cam, [0, BRAIN_C[1] + 30, -25])).toBe(false)
    expect(toLocal(toWorld([0.5, -1, 0.25]))).toEqual([0.5, -1, 0.25])
  })
})
