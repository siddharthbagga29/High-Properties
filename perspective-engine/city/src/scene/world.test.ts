import { describe, expect, it } from 'vitest'
import { ALL_AGENTS, BRAIN_C, buildBrain, districtCenter, RING, towers, type LayoutNode } from './world'

const nodes: LayoutNode[] = ALL_AGENTS.flatMap((a, i) => [0, 1, 2].map(k => ({ id: `${a}${k}`, agent: a, budget_k: 10 + k * 20, used_k: k ? 70 + i : 0, phase: k })))

describe('world layout', () => {
  it('puts the brain at the centre and the eight districts on a ring', () => {
    RING.forEach(a => expect(Math.hypot(...districtCenter(a))).toBeCloseTo(27, 5))
    expect(districtCenter('orchestrator')).toEqual([0, 0])
  })
  it('never places two towers on the same lot', () => {
    const t = towers(nodes)
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) expect(Math.hypot(t[i].x - t[j].x, t[i].z - t[j].z)).toBeGreaterThan(1.5)
  })
})

describe('brain particles', () => {
  const out = buildBrain({ nodes, count: 20000, seed: 7 })
  it('are finite and compact around the brain centre', () => {
    expect(out.pos.every(Number.isFinite)).toBe(true)
    let sum = 0
    for (let i = 0; i < out.count; i++) sum += Math.hypot(out.pos[i * 3] - BRAIN_C[0], out.pos[i * 3 + 1] - BRAIN_C[1], out.pos[i * 3 + 2] - BRAIN_C[2])
    expect(sum / out.count).toBeLessThan(14)
  })
  it('are deterministic for a seed', () => {
    expect(buildBrain({ nodes, count: 20000, seed: 7 }).pos.slice(0, 30)).toEqual(out.pos.slice(0, 30))
  })
})
