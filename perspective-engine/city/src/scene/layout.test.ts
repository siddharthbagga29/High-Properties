import { describe, expect, it } from 'vitest'
import { AGENTS, BRAIN_C, buildParticles, type LayoutNode } from './layout'

const nodes: LayoutNode[] = AGENTS.flatMap((a, i) => [0, 1, 2].map(k => ({ id: `${a}${k}`, agent: a, budget_k: 10 + k * 20, used_k: k ? 70 + i : 0, phase: k })))

describe('particle layout', () => {
  const out = buildParticles({ nodes, count: 20000, seed: 7 })
  it('produces finite positions for every particle', () => {
    for (const arr of [out.brain, out.city, out.scatter]) expect(arr.every(Number.isFinite)).toBe(true)
  })
  it('forms a compact cortex around the brain centre', () => {
    let maxR = 0, sum = 0
    const n = out.count
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(out.brain[i * 3] - BRAIN_C[0], out.brain[i * 3 + 1] - BRAIN_C[1], out.brain[i * 3 + 2] - BRAIN_C[2])
      maxR = Math.max(maxR, d); sum += d
    }
    expect(sum / n).toBeLessThan(9)
    expect(maxR).toBeLessThan(16)
  })
  it('is deterministic for a seed', () => {
    const again = buildParticles({ nodes, count: 20000, seed: 7 })
    expect(again.brain.slice(0, 30)).toEqual(out.brain.slice(0, 30))
  })
})
