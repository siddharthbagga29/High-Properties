import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PE_BODY, peBody, peContext, peEvents, peProjectState, STALL_MINUTES, type PENode, type PEState } from '../core/adapters/perspective-engine'
import { briefing, sinceLast } from '../core/briefing'

// The real export the city ships. Expectations are recomputed from the raw JSON so the test stays true as the graph moves.
const STATE_URL = new URL('../../city/public/state.json', import.meta.url)
const real = JSON.parse(readFileSync(STATE_URL, 'utf8')) as PEState
const view = (n: PENode) => n.view ?? n.status
const ids = (items: Array<{ id: string }>) => items.map(i => i.id)
const asOf = new Date(real.generated)

describe('PE_BODY', () => {
  it('has the nine documented parts', () => {
    expect(PE_BODY.map(p => p.id)).toEqual(['mind', 'crown', 'neck', 'heart', 'lungs', 'ribcage', 'shoulders', 'arm_right', 'arm_left'])
  })

  it('covers every task in the real graph exactly once', () => {
    const mapped = PE_BODY.flatMap(p => p.tasks)
    expect(new Set(mapped).size).toBe(mapped.length)
    expect([...mapped].sort()).toEqual(real.nodes.map(n => n.id).sort())
  })

  it('assigns each part only tasks owned by the agent that builds it', () => {
    const agentOf = new Map(real.nodes.map(n => [n.id, n.agent]))
    for (const part of PE_BODY) for (const task of part.tasks) expect(agentOf.get(task), `${part.id}/${task}`).toBe(part.builtBy)
    for (const part of PE_BODY) expect(Object.keys(real.agents)).toContain(part.builtBy)
  })
})

describe('peProjectState on the real state.json', () => {
  const ps = peProjectState(real, asOf)

  it('maps graph statuses to project status', () => {
    expect(ids(ps.completed)).toEqual(real.nodes.filter(n => view(n) === 'done').map(n => n.id))
    expect(ids(ps.in_progress)).toEqual(real.nodes.filter(n => view(n) === 'running').map(n => n.id))
    expect(ids(ps.blocked)).toEqual(real.nodes.filter(n => view(n) === 'blocked').map(n => n.id))
    expect(ids(ps.waiting_for_user)).toEqual(real.nodes.filter(n => view(n) === 'awaiting_human').map(n => n.id))
    expect(ps.completed.length + ps.in_progress.length + ps.blocked.length + ps.waiting_for_user.length + ps.next.length).toBeLessThanOrEqual(real.nodes.length)
  })

  it('gives each founder gate its reason as the detail and the agent name as owner', () => {
    for (const item of ps.waiting_for_user) {
      const node = real.nodes.find(n => n.id === item.id)!
      expect(item.detail).toBe(node.gate?.reason)
      expect(item.owner).toBe(real.agents[node.agent].name)
      expect(item.title).toBe(node.title)
    }
  })

  it('lists as next the ready tasks plus pending tasks whose dependencies are done or prepared', () => {
    const byId = new Map(real.nodes.map(n => [n.id, n]))
    const expected = real.nodes
      .filter(n => view(n) === 'ready' || (view(n) === 'pending' && (n.deps ?? []).every(d => ['done', 'awaiting_human'].includes(view(byId.get(d)!)))))
      .map(n => n.id)
    expect(ids(ps.next)).toEqual(expected)
    for (const item of ps.next) {
      const waitingDeps = (byId.get(item.id)!.deps ?? []).filter(d => view(byId.get(d)!) === 'awaiting_human')
      expect(item.detail).toBe(waitingDeps.length ? `follows once you clear ${waitingDeps.join(', ')}` : 'ready to start')
    }
  })

  it('stamps completed tasks with their verified done time from the ledger', () => {
    for (const item of ps.completed) {
      const doneTimes = real.ledger.filter(e => e.node === item.id && e.event === 'done').map(e => e.t)
      if (doneTimes.length) expect(item.at).toBe(doneTimes.sort().at(-1))
    }
  })
})

describe('peProjectState on edge cases', () => {
  const base: PEState = {
    generated: '2026-10-08T12:00:00Z',
    project: 'Test',
    agents: { a: { name: 'Ada' }, b: { name: 'Curie' } },
    nodes: [
      { id: 'X1', title: 'Built', agent: 'a', phase: 0, status: 'done' },
      { id: 'X2', title: 'Live', agent: 'a', phase: 0, status: 'running', deps: ['X1'] },
      { id: 'X3', title: 'Silent', agent: 'b', phase: 0, status: 'running', deps: ['X1'] },
      { id: 'X4', title: 'Stuck', agent: 'b', phase: 0, status: 'blocked' },
      { id: 'X5', title: 'Ready', agent: 'a', phase: 1, status: 'pending', view: 'ready', deps: ['X1'] },
      { id: 'X6', title: 'Gate', agent: 'b', phase: 1, status: 'awaiting_human', gate: { type: 'human', reason: 'Founder signs' } },
      { id: 'X7', title: 'After gate', agent: 'a', phase: 2, status: 'pending', deps: ['X6', 'X1'] },
      { id: 'X8', title: 'Later', agent: 'a', phase: 2, status: 'pending', deps: ['X2'] },
      { id: 'X9', title: 'Unknown dep', agent: 'a', phase: 2, status: 'pending', deps: ['NOPE'] },
    ],
    ledger: [
      { t: '2026-10-08T11:00:00Z', event: 'start', node: 'X3' },
      { t: '2026-10-08T11:50:00Z', event: 'start', node: 'X2' },
      { t: '2026-10-08T11:30:00Z', event: 'block', node: 'X4', note: 'source paywalled' },
    ],
    activity: { X3: [{ t: '2026-10-08T11:20:00Z', node: 'X3', kind: 'search', text: 'searched' }] },
  }
  const now = new Date('2026-10-08T12:00:00Z')
  const ps = peProjectState(base, now)

  it('flags running tasks with no step in the stall window as risks', () => {
    expect(ids(ps.in_progress)).toEqual(['X2', 'X3'])
    expect(ps.risks.find(r => r.id === 'X3')?.detail).toBe('marked running but nothing recorded for 40 minutes')
    expect(ps.risks.find(r => r.id === 'X2')).toBeUndefined()
    expect(STALL_MINUTES).toBe(15)
  })

  it('reports blocked tasks with the ledger reason, also as risks', () => {
    expect(ps.blocked).toEqual([{ id: 'X4', title: 'Stuck', owner: 'Curie', detail: 'source paywalled', at: '2026-10-08T11:30:00Z' }])
    expect(ps.risks.find(r => r.id === 'X4')?.detail).toBe('blocked: source paywalled')
  })

  it('describes a gate the founder cleared, and later work on that task as finished', () => {
    const gated: PEState = {
      ...base,
      ledger: [
        { t: '2026-10-08T09:00:00Z', event: 'done', node: 'X6', note: 'prepared' },
        { t: '2026-10-08T10:00:00Z', event: 'clear-gate', node: 'X6', note: 'signed' },
        { t: '2026-10-08T11:00:00Z', event: 'done', node: 'X6' },
        { t: '2026-10-08T11:30:00Z', event: 'retire', node: 'GONE' },
      ],
    }
    expect(peEvents(gated)).toEqual([
      { t: '2026-10-08T09:00:00Z', kind: 'prepared', title: 'Curie prepared X6 (Gate); it now needs you' },
      { t: '2026-10-08T10:00:00Z', kind: 'gate_cleared', title: 'You cleared the gate on X6 (Gate): signed' },
      { t: '2026-10-08T11:00:00Z', kind: 'done', title: 'Curie finished X6 (Gate)' },
      { t: '2026-10-08T11:30:00Z', kind: 'retire', title: 'GONE: retire' },
    ])
  })

  it('computes next from ready and from pending tasks behind done or prepared work', () => {
    expect(ps.next.map(i => [i.id, i.detail])).toEqual([['X5', 'ready to start'], ['X7', 'follows once you clear X6']])
  })
})

describe('peContext, peEvents and peBody on the real state.json', () => {
  it('builds a context for each viewer', () => {
    const owner = peContext(real, 'owner')
    expect(owner).toMatchObject({ applicationId: 'perspective-engine', applicationName: real.project, environment: 'production', viewer: 'owner' })
    expect(owner.projectState).toEqual(peProjectState(real, asOf))
    expect(owner.recentActions!.length).toBe(Math.min(10, real.ledger.length))
    expect(peContext(real, 'visitor', { currentRoute: '/city' })).toMatchObject({ viewer: 'visitor', currentRoute: '/city' })
  })

  it('describes every ledger event in plain words', () => {
    const events = peEvents(real)
    expect(events).toHaveLength(real.ledger.length)
    for (const e of events) {
      expect(e.title).not.toMatch(/undefined/)
      expect(['start', 'done', 'prepared', 'block', 'unblock', 'gate_cleared']).toContain(e.kind)
    }
    const sorted = [...events].sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
    expect(events.map(e => e.t)).toEqual(sorted.map(e => e.t))
  })

  it('calls a done on a founder-gated task "prepared", and on an ungated one "finished"', () => {
    const events = peEvents(real)
    const gated = new Set(real.nodes.filter(n => n.gate).map(n => n.id))
    const clearedBy = (node: string, t: string) => real.ledger.some(c => c.event === 'clear-gate' && c.node === node && Date.parse(c.t) <= Date.parse(t))
    const doneEvents = real.ledger.filter(e => e.event === 'done')
    for (const e of doneEvents) {
      // A start and a done can share a timestamp, so match on the finishing kinds only.
      const described = events.filter(x => x.t === e.t && x.title.includes(`${e.node} (`) && ['prepared', 'done'].includes(x.kind))
      expect(described.map(x => x.kind), e.node).toEqual([gated.has(e.node) && !clearedBy(e.node, e.t) ? 'prepared' : 'done'])
    }
  })

  it('assembles the body from verified work only, and keeps the face unformed without revenue', () => {
    const body = peBody(real)
    const statusOf = new Map(real.nodes.map(n => [n.id, view(n)]))
    for (const part of body.parts) {
      expect(part.done).toBe(part.tasks.filter(t => statusOf.get(t) === 'done').length)
      expect(part.prepared).toBe(part.tasks.filter(t => statusOf.get(t) === 'awaiting_human').length)
    }
    const done = real.nodes.filter(n => view(n) === 'done').length
    const prepared = real.nodes.filter(n => view(n) === 'awaiting_human').length
    expect(body.overall).toBeCloseTo((done + 0.6 * prepared) / real.nodes.length, 3)
    expect(body.face.stage).toBe(real.revenue?.length ? body.face.stage : 0)
    if (!real.revenue?.length) expect(body.face.label).toBe('No verified revenue yet: the face stays unformed.')
  })

  it('needs signed revenue for the face once the founder key is registered', () => {
    const pay = (payer: string, auth: 'signed' | 'attested') => ({ t: '2026-10-09T10:00:00Z', amountUsd: 500, payer, evidence: 'INV', recordedBy: 'founder' as const, auth })
    const revenue = [pay('Acme', 'attested'), pay('Beta', 'signed')]
    expect(peBody({ ...real, revenue }).face.stage).toBe(0)  // no verified signature: nothing counts, key or no key
    // The label "signed" alone does not count: only sigVerified, which the export computes from the signature log.
    expect(peBody({ ...real, revenue, founderKey: { registered: true } }).face).toMatchObject({ stage: 0, excluded: 2 })
    const checked = revenue.map(e => ({ ...e, sigVerified: e.auth === 'signed' }))
    expect(peBody({ ...real, revenue: checked, founderKey: { registered: true } }).face).toMatchObject({ stage: 1, payers: 1, unsigned: 0 })
    // Nothing about key registration, the audit or its absence can turn the requirement off.
    expect(peBody({ ...real, revenue: checked, founderKey: { registered: false }, audit: null }).face.stage).toBe(1)
    expect(peBody({ ...real, revenue, founderKey: { registered: false }, audit: null }).face.stage).toBe(0)
  })

  it('feeds a briefing whose counts match the file', () => {
    const ctx = peContext(real, 'owner')
    const since = sinceLast(peEvents(real), null, asOf)
    const b = briefing(ctx, { greetingHour: 9, since })
    const count = (s: string) => real.nodes.filter(n => view(n) === s).length
    expect(b.lines[0]).toBe(`Project: ${count('done')} complete, ${count('running')} in progress, ${count('awaiting_human')} waiting on you, ${count('blocked')} blocked.`)
    expect(b.needsYou).toHaveLength(count('awaiting_human'))
  })
})
