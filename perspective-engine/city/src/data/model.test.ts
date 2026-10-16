import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRIEF, reality } from './brief'
import { answer } from './guide'
import { newer } from './live'
import {
  agentFeed, agentStats, atomsOf, collapseFeed, countCalls, criterionState, feed, freshEvents, historyCut, isVerifier, lastOwnStep, runState,
  stalledNow, statusesAt, timeline, ventureStats, workingNow,
} from './model'
import type { ActivityEvent, GraphState, TaskNode } from './types'
import { parseFocus } from '../store'

const state: GraphState = JSON.parse(readFileSync(new URL('../../public/state.json', import.meta.url), 'utf8'))
const st = statusesAt(state, null)
const runningIds = state.nodes.filter(n => st.get(n.id) === 'running').map(n => n.id)
// The liveness rules need a running task. When the live record has none, mark a task that has activity as running
// in a copy, so these tests never pass vacuously.
const live = (() => {
  if (runningIds.length) return { s: state, st, id: runningIds[0] }
  const s = structuredClone(state)
  const n = s.nodes.find(x => (s.activity?.[x.id] ?? []).length > 0)!
  n.status = 'running'
  n.view = 'running'
  return { s, st: statusesAt(s, null), id: n.id }
})()
const ev = (p: Partial<ActivityEvent>): ActivityEvent => ({ t: '2026-10-07T00:00:00Z', node: 'F04', agent: 'product', kind: 'note', text: 'x', src: 'self', ...p })
const minute = (m: number) => new Date(Date.UTC(2026, 9, 1, 0, m)).toISOString()
/** A small record written out in the test, on the live agents: its tasks, ledger events and activity rows. */
const record = (nodes: Partial<TaskNode>[], ledger: { t: string; node: string; event: string }[], activity: Record<string, ActivityEvent[]> = {}): GraphState => ({
  ...state, ledgerBase: undefined, activity, ledger: ledger.map(e => ({ note: '', ...e })),
  nodes: nodes.map(n => ({ phase: 0, agent: 'gtm', title: `task ${n.id}`, deps: [], outputs: [], accept: [], gate: null, budget_k: 0, status: 'pending', view: 'pending', ...n }) as TaskNode),
})
const gateAt = (s: GraphState, id: string, t: number | null) => atomsOf(s, id, statusesAt(s, t), t).find(a => a.level4Type === 'gate')?.status

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
  it('a reopened task replays as running and its founder approval is re-armed', () => {
    const node = { ...state.nodes[0], id: 'X1', deps: [], status: 'running' as const, view: 'running' as const, gate: { reason: 'r', cleared: null } }
    const at = (m: number) => new Date(Date.UTC(2026, 9, 1, 0, m)).toISOString()
    const g = { ...state, nodes: [node], ledger: [
      { t: at(1), node: 'X1', event: 'start' }, { t: at(2), node: 'X1', event: 'done' },
      { t: at(3), node: 'X1', event: 'clear-gate' }, { t: at(4), node: 'X1', event: 'reopen' },
      { t: at(5), node: 'X1', event: 'done' },
    ] } as unknown as GraphState
    const when = (m: number) => statusesAt(g, Date.parse(at(m)) + 1).get('X1')
    expect([when(2), when(3), when(4), when(5)]).toEqual(['awaiting_human', 'done', 'running', 'awaiting_human'])
  })
  it('before the first event only pre-ledger work is built', () => {
    const [start] = timeline(state)
    expect([...statusesAt(state, start).values()].filter(s => s === 'running')).toHaveLength(0)
  })
  it('in a replay the founder gate is as the ledger had it at that moment, not as it is now', () => {
    const cleared = record([{ id: 'X1', status: 'done', view: 'done', gate: { type: 'founder', reason: 'r', cleared: minute(3) } }], [
      { t: minute(1), node: 'X1', event: 'start' }, { t: minute(2), node: 'X1', event: 'done' }, { t: minute(3), node: 'X1', event: 'clear-gate' },
    ])
    const when = (s: GraphState, m: number) => gateAt(s, 'X1', Date.parse(minute(m)) + 1)
    expect([when(cleared, 2), when(cleared, 3), gateAt(cleared, 'X1', null)]).toEqual(['waiting', 'met', 'met'])
    // A reopen re-arms the gate: the time it was cleared still shows it cleared.
    const rearmed = record([{ id: 'X1', status: 'running', view: 'running', gate: { type: 'founder', reason: 'r' } }], [
      ...cleared.ledger, { t: minute(4), node: 'X1', event: 'reopen' },
    ])
    expect([when(rearmed, 3), when(rearmed, 4), gateAt(rearmed, 'X1', null)]).toEqual(['met', 'waiting', 'waiting'])
  })
  it('a ledger cut to fit the document replays from its base like the whole ledger, and says the history before is missing', () => {
    const full = record([{ id: 'A' }, { id: 'B', gate: { type: 'founder', reason: 'r' } }, { id: 'C', deps: ['A'] }, { id: 'D', status: 'done', view: 'done' }], [
      { t: minute(1), node: 'A', event: 'start' }, { t: minute(2), node: 'A', event: 'done' }, { t: minute(3), node: 'B', event: 'start' },
      { t: minute(4), node: 'B', event: 'done' }, { t: minute(5), node: 'B', event: 'clear-gate' }, { t: minute(6), node: 'C', event: 'start' },
      { t: minute(7), node: 'C', event: 'block' }, { t: minute(8), node: 'C', event: 'unblock' }, { t: minute(9), node: 'B', event: 'reopen' },
      { t: minute(10), node: 'B', event: 'done' },
    ])
    // The base graph.py ledger_base exports for a cut after the first five events (tools/test_activity.py checks the same values).
    const ledgerBase = { t: minute(5), events: 5, status: { A: 'done', B: 'done', C: 'pending', D: 'done' } as const, cleared: ['B'] }
    const cut: GraphState = { ...full, ledger: full.ledger.slice(5), ledgerBase }
    expect(timeline(cut)[0]).toBe(Date.parse(minute(5)))
    expect(historyCut(cut)?.note).toBe('Replay starts 2026-10-01 00:05 UTC: the 5 earlier ledger events were cut to fit the live document, so history before then is not available here.')
    expect(historyCut(full)).toBeNull()
    for (let m = 5; m <= 11; m++) {
      const t = Date.parse(minute(m))
      expect(Object.fromEntries(statusesAt(cut, t))).toEqual(Object.fromEntries(statusesAt(full, t)))
      expect(gateAt(cut, 'B', t)).toBe(gateAt(full, 'B', t))
    }
    // Without its base the cut ledger replays as if it were the whole history, and gets the statuses wrong.
    const end = Date.parse(minute(11))
    expect(Object.fromEntries(statusesAt({ ...cut, ledgerBase: undefined }, end))).not.toEqual(Object.fromEntries(statusesAt(full, end)))
  })
})

describe('liveness: "running" is not proof of work', () => {
  it('a running task with a step in the last 15 minutes is working', () => {
    const { s, st, id } = live
    const last = Math.max(...(s.activity?.[id] ?? []).map(e => Date.parse(e.t)))
    expect(runState(s, st, last + 60_000).get(id)).toBe('working')
    expect(workingNow(s, st, last + 60_000).map(w => w.node.id)).toContain(id)
  })
  it('the same task an hour after its last step is stalled, not working', () => {
    const { s, st, id } = live
    const last = Math.max(...(s.activity?.[id] ?? []).map(e => Date.parse(e.t)), ...s.ledger.filter(e => e.node === id).map(e => Date.parse(e.t)))
    const later = last + 3_600_000
    expect(runState(s, st, later).get(id)).toBe('stalled')
    expect(workingNow(s, st, later).map(w => w.node.id)).not.toContain(id)
    expect(stalledNow(s, st, later).map(w => w.node.id)).toContain(id)
    expect(ventureStats(s, st, later).running).toBe(workingNow(s, st, later).length)
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
  it('a row\'s text makes it the verifier\'s only for rows from before the actor field', () => {
    const fix = ev({ t: '2026-10-16T05:07:26Z', node: 'X1', agent: 'gtm', kind: 'edit', text: 'Verifier GAP fixed: section 6 recounted against targets.csv' })
    expect(isVerifier(fix)).toBe(false)
    expect(isVerifier({ ...fix, actor: 'verifier' })).toBe(true)
    expect(isVerifier({ ...fix, t: '2026-10-07T19:00:00Z' })).toBe(true)
    const s = record([{ id: 'X1' }], [], { X1: [fix] })
    expect(lastOwnStep(s, 'gtm', Date.parse(fix.t))).toBe(Date.parse(fix.t))
  })
  it('a call credited only because its command named a task\'s output is not a step on that task', () => {
    // A V07 session's command read V05's output as its input and was ingested --related for V05, two hours after V05
    // was reopened with nobody on it.
    const read = ev({ t: minute(120), node: 'X1', agent: 'gtm', kind: 'run', src: 'transcript', related: 'path', text: 'Append segment-1 rows to targets.csv' })
    const with_ = (e: ActivityEvent) => record([{ id: 'X1', status: 'running', view: 'running' }], [{ t: minute(0), node: 'X1', event: 'reopen' }], { X1: [e] })
    const at = Date.parse(minute(121))
    const s = with_(read), gtm = agentStats(s, statusesAt(s, null), at).find(a => a.key === 'gtm')!
    expect(runState(s, statusesAt(s, null), at).get('X1')).toBe('stalled')
    expect([gtm.running?.id, gtm.stalled?.id, gtm.lastStep]).toEqual([undefined, 'X1', null])
    // Naming the task, writing or editing its output, or a whole transcript ingested for the task are steps on it.
    for (const e of [{ ...read, related: 'id' as const }, { ...read, kind: 'edit' as const }, { ...read, related: undefined }]) {
      const w = with_(e)
      expect(runState(w, statusesAt(w, null), at).get('X1')).toBe('working')
      expect(lastOwnStep(w, 'gtm', at)).toBe(Date.parse(read.t))
    }
  })
})

describe('tool calls', () => {
  it('one call credited to several tasks counts once, also when it was ingested before calls had an id', () => {
    const call = (node: string, agent: string, p: Partial<ActivityEvent>) => ev({ node, agent, kind: 'run', src: 'transcript', text: 'Print briefs', ...p })
    const failed = ev({ node: 'X1', agent: 'gtm', kind: 'blocked', src: 'transcript', text: 'Failed (Exit code 1): Print briefs', call: 't:a' })
    // Rows without a call id are told apart as the record tells rows apart (graph.py activity_all): time, kind and text.
    const legacy = { t: '2026-10-06T10:00:00Z', text: 'Count rows' }
    const s = record([{ id: 'X1' }, { id: 'X2' }, { id: 'Y1', agent: 'finance' }], [], {
      X1: [call('X1', 'gtm', { call: 't:a' }), failed, call('X1', 'gtm', legacy), call('X1', 'gtm', { ...legacy, t: '2026-10-06T10:00:01Z' })],
      X2: [call('X2', 'gtm', { call: 't:a' }), call('X2', 'gtm', legacy)],
      Y1: [call('Y1', 'finance', { call: 't:a' }), call('Y1', 'finance', { call: 't:b' })],
    })
    expect(countCalls(feed(s, null))).toBe(4)
    expect(ventureStats(s, statusesAt(s, null), null).toolCalls).toBe(4)
    const by = Object.fromEntries(agentStats(s, statusesAt(s, null), Date.now()).map(a => [a.key, a.toolCalls]))
    expect([by.gtm, by.finance]).toEqual([3, 2])
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
