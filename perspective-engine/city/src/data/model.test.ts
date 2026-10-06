import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatLink, parseLink } from './deeplink'
import { answer } from './guide'
import { agentStats, atomsOf, parentOf, statusesAt, timeline } from './model'
import type { GraphState } from './types'

const state: GraphState = JSON.parse(readFileSync(new URL('../../public/state.json', import.meta.url), 'utf8'))

describe('replay', () => {
  it('live statuses equal the exported view', () => {
    const live = statusesAt(state, null)
    state.nodes.forEach(n => expect(live.get(n.id)).toBe(n.view))
  })
  it('replay at the end of the timeline matches the live view', () => {
    const [, end] = timeline(state)
    const replay = statusesAt(state, end + 1)
    const mismatches = state.nodes.filter(n => replay.get(n.id) !== n.view && n.status !== 'blocked')
    expect(mismatches.map(n => n.id)).toEqual([])
  })
  it('before the first event only pre-ledger work is built', () => {
    const [start] = timeline(state)
    const early = statusesAt(state, start)
    expect([...early.values()].filter(s => s === 'running')).toHaveLength(0)
  })
})

describe('aggregation', () => {
  it('agent totals add up to the graph', () => {
    const stats = agentStats(state, statusesAt(state, null))
    expect(stats.reduce((s, a) => s + a.tasks.length, 0)).toBe(state.nodes.length)
  })
  it('atoms use the normalized schema and point at their parents', () => {
    const atoms = atomsOf(state, 'V05', statusesAt(state, null), null)
    expect(atoms.length).toBeGreaterThan(2)
    atoms.forEach(a => expect(a.parentIds).toEqual(['venture', 'gtm', 'V05']))
  })
  it('parents walk back up the levels', () => {
    expect(parentOf(state, 'V05')).toBe('gtm')
    expect(parentOf(state, 'gtm')).toBe('city')
    expect(parentOf(state, 'city')).toBe('venture')
  })
})

describe('deep links', () => {
  it('round-trips', () => {
    const l = { focus: 'V05', level: 4 as const, time: 1791290000000 }
    expect(parseLink(formatLink(l))).toEqual(l)
    expect(parseLink('#gtm.3.live')).toEqual({ focus: 'gtm', level: 3, time: null })
    expect(parseLink('#nonsense')).toBeNull()
  })
})

describe('guide', () => {
  const st = statusesAt(state, null)
  it('navigates to a named task', () => expect(answer('show me V05', state, st, null).dive).toBe('V05'))
  it('navigates to an agent by name', () => expect(answer('what is Ogilvy doing', state, st, null).dive).toBe('gtm'))
  it('is honest about data', () => expect(answer('is this real data?', state, st, null).text).toMatch(/Nothing in this city is simulated/))
  it('falls back to suggestions instead of inventing', () => expect(answer('zzqx', state, st, null).chips?.length).toBeGreaterThan(0))
})
