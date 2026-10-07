import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRIEF, reality } from './brief'
import { answer } from './guide'
import { newer } from './live'
import { agentFeed, agentStats, atomsOf, collapseFeed, criterionState, feed, freshEvents, isVerifier, runState, stalledNow, statusesAt, timeline, ventureStats, workingNow } from './model'
import type { ActivityEvent, GraphState } from './types'
import { parseFocus } from '../store'

const state: GraphState = JSON.parse(readFileSync(new URL('../../public/state.json', import.meta.url), 'utf8'))
const st = statusesAt(state, null)
const runningIds = state.nodes.filter(n => st.get(n.id) === 'running').map(n => n.id)
const ev = (p: Partial<ActivityEvent>): ActivityEvent => ({ t: '2026-10-07T00:00:00Z', node: 'F04', agent: 'product', kind: 'note', text: 'x', src: 'self', ...p })

describe('replay', () => {
  it('live statuses equal the exported view', () => {
    state.nodes.forEach(n => expect(st.get(n.id)).toBe(n.view))
  })
  it('replay at the end of the timeline matches the live view', () => {
    const [, end] = timeline(state)
    const replay = statusesAt(state, end + 1)
    const mismatches = state.nodes.filter(n => replay.get(n.id) !== n.view && n.status !== 'blocked')
    expect(mismatches.map(n => n.id)).toEqual([])
  })
  it('before the first event only pre-ledger work is built', () => {
    const [start] = timeline(state)
    expect([...statusesAt(state, start).values()].filter(s => s === 'running')).toHaveLength(0)
  })
})

describe('liveness: "running" is not proof of work', () => {
  it('a running task with a step in the last 15 minutes is working', () => {
    if (!runningIds.length) return
    const id = runningIds[0]
    const last = Math.max(...(state.activity?.[id] ?? []).map(e => Date.parse(e.t)))
    expect(runState(state, st, last + 60_000).get(id)).toBe('working')
    expect(workingNow(state, st, last + 60_000).map(w => w.node.id)).toContain(id)
  })
  it('the same task an hour after its last step is stalled, not working', () => {
    if (!runningIds.length) return
    const id = runningIds[0]
    const last = Math.max(...(state.activity?.[id] ?? []).map(e => Date.parse(e.t)), ...state.ledger.filter(e => e.node === id).map(e => Date.parse(e.t)))
    const later = last + 3_600_000
    expect(runState(state, st, later).get(id)).toBe('stalled')
    expect(workingNow(state, st, later).map(w => w.node.id)).not.toContain(id)
    expect(stalledNow(state, st, later).map(w => w.node.id)).toContain(id)
    expect(ventureStats(state, st, later).running).toBe(workingNow(state, st, later).length)
  })
  it('agent "running" uses the same rule', () => {
    const far = Date.parse(state.generated) + 86_400_000
    agentStats(state, st, far).forEach(a => expect(a.running).toBeNull())
  })
  it('verifier rows are recognised and excluded from the agent\'s own last step', () => {
    expect(isVerifier(ev({ text: 'Verifier: checked the export' }))).toBe(true)
    expect(isVerifier(ev({ actor: 'verifier' }))).toBe(true)
    expect(isVerifier(ev({ text: 'Wrote README' }))).toBe(false)
  })
})

describe('honest criteria', () => {
  it('only done ticks a criterion; a gated task is prepared', () => {
    expect(criterionState('done')).toBe('met')
    expect(criterionState('awaiting_human')).toBe('prepared')
    expect(criterionState('running')).toBe('open')
  })
  it('V09 (prepared, not sent) shows no met criteria', () => {
    if (st.get('V09') !== 'awaiting_human') return
    const crit = atomsOf(state, 'V09', st, null).filter(a => a.level4Type === 'criterion')
    expect(crit.length).toBeGreaterThan(0)
    crit.forEach(c => expect(c.status).toBe('prepared'))
  })
})

describe('copy cannot drift from the data', () => {
  it('no brief text hard-codes a task count', () => {
    Object.values(BRIEF).forEach(v => { if (typeof v === 'string') expect(v).not.toMatch(/\b\d+ tasks\b/) })
  })
  it('the brief does not claim advisors exist', () => {
    expect(BRIEF.idea).not.toMatch(/is being co-designed/)
    expect(reality(state, st)).toMatch(/Advisors: none recruited yet/)
  })
})

describe('events and feeds', () => {
  it('old ledger events never animate', () => {
    const prev = { ...state, ledger: state.ledger.slice(0, -1) }
    const last = state.ledger.at(-1)!
    expect(freshEvents(prev, state, Date.parse(last.t) + 10_000)).toHaveLength(1)
    expect(freshEvents(prev, state, Date.parse(last.t) + 3_600_000)).toHaveLength(0)
  })
  it('a fetch and its failure collapse into one row', () => {
    const rows = collapseFeed([
      ev({ kind: 'blocked', src: 'transcript', text: 'Failed (blocked by the network proxy): Opened https://www.sciencedaily.com/x' }),
      ev({ kind: 'fetch', src: 'transcript', text: 'Opened https://www.sciencedaily.com/x' }),
      ev({ kind: 'read', t: '2026-10-06T23:00:00Z', text: 'Read a file' }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0].text).toBe("Couldn't open www.sciencedaily.com (blocked by the network proxy)")
  })
  it('every activity event belongs to a real task and agent', () => {
    const ids = new Set(state.nodes.map(n => n.id))
    feed(state, null).forEach(e => { expect(ids.has(e.node)).toBe(true); expect(state.agents[e.agent]).toBeTruthy() })
  })
  it('feeds are newest first and filter by agent', () => {
    const f = agentFeed(state, 'gtm', null)
    expect(f.length).toBeGreaterThan(10)
    for (let i = 1; i < f.length; i++) expect(Date.parse(f[i - 1].t)).toBeGreaterThanOrEqual(Date.parse(f[i].t))
    f.forEach(e => expect(e.agent).toBe('gtm'))
  })
})

describe('data source', () => {
  it('an identical or older snapshot is not accepted', () => {
    expect(newer(state, state)).toBe(false)
    expect(newer(state, { ...state, generated: '2000-01-01T00:00:00Z' })).toBe(false)
    expect(newer(state, { ...state, generated: '2100-01-01T00:00:00Z' })).toBe(true)
    expect(newer(null, state)).toBe(true)
  })
  it('deep links reject prototype keys and unknown ids', () => {
    expect(parseFocus('agent-constructor', state)).toBeNull()
    expect(parseFocus('agent-__proto__', state)).toBeNull()
    expect(parseFocus('task-NOPE', state)).toBeNull()
    expect(parseFocus('agent-gtm', state)).toEqual({ kind: 'agent', id: 'gtm' })
    expect(parseFocus('brain', state)).toEqual({ kind: 'brain' })
  })
})

describe('guide', () => {
  it('points to a named task', () => expect(answer('show me V05', state, st, null).dive).toEqual({ kind: 'task', id: 'V05' }))
  it('points to an agent by name', () => expect(answer('what is Ogilvy doing', state, st, null).dive).toEqual({ kind: 'agent', id: 'gtm' }))
  it('answers about the agent in focus, from that agent\'s own records', () => {
    const r = answer('What did this agent do today?', state, st, Date.parse(state.generated), { kind: 'agent', id: 'product' })
    expect(r.text).toMatch(/Ada/)
    expect(r.text).not.toMatch(/Milton|Ogilvy/)
  })
  it('is honest about data', () => expect(answer('is this real data?', state, st, null).text).toMatch(/project record/))
  it('falls back to suggestions instead of inventing', () => expect(answer('zzqx', state, st, null).chips?.length).toBeGreaterThan(0))
})
