import { describe, expect, it } from 'vitest'
import { addAction, ALLOWED, createTask, summarize, transition } from '../core/tasks'
import type { JarvisTask, TaskStatus } from '../core/types'

const NOW = new Date('2026-10-08T12:00:00Z')
const LATER = new Date('2026-10-08T12:05:00Z')

const task = (status: TaskStatus, i = 0): JarvisTask => createTask({ title: `t${i}`, source: 'jarvis', status, verifiedBy: status === 'completed' ? 'test' : undefined }, NOW, `t${i}`)
const many = (counts: Partial<Record<TaskStatus, number>>): JarvisTask[] =>
  Object.entries(counts).flatMap(([status, n], k) => Array.from({ length: n ?? 0 }, (_, i) => task(status as TaskStatus, k * 100 + i)))

describe('createTask', () => {
  it('defaults to queued and normal priority, with the given id and time', () => {
    const t = createTask({ title: 'Review batch one', source: 'request' }, NOW, 'r1')
    expect(t).toMatchObject({ id: 'r1', title: 'Review batch one', status: 'queued', priority: 'normal', createdAt: NOW.toISOString(), source: 'request', actions: [] })
  })

  it('generates distinct ids when none is given', () => {
    const a = createTask({ title: 'a', source: 'jarvis' }, NOW)
    const b = createTask({ title: 'b', source: 'jarvis' }, NOW)
    expect(a.id).not.toBe(b.id)
    expect(a.id).toMatch(/^task-/)
  })

  it('refuses to create a completed task without verification', () => {
    expect(() => createTask({ title: 'x', source: 'jarvis', status: 'completed' }, NOW)).toThrow(/verifiedBy/)
  })
})

describe('transition', () => {
  it('moves through a normal life cycle and records each step', () => {
    let t = createTask({ title: 'Run tests', source: 'jarvis' }, NOW, 'x')
    t = transition(t, 'running', NOW)
    expect(t.startedAt).toBe(NOW.toISOString())
    t = transition(t, 'completed', LATER, 'all green', { verifiedBy: 'npm test exit 0', result: { passed: 12 } })
    expect(t).toMatchObject({ status: 'completed', completedAt: LATER.toISOString(), verifiedBy: 'npm test exit 0', result: { passed: 12 } })
    expect(t.actions.map(a => a.kind)).toEqual(['status', 'verify'])
    expect(t.actions[1].summary).toContain('verified by npm test exit 0')
  })

  it('does not mutate the input task', () => {
    const t = createTask({ title: 'x', source: 'jarvis' }, NOW, 'x')
    const copy = structuredClone(t)
    transition(t, 'running', NOW)
    expect(t).toEqual(copy)
  })

  it('throws the documented message on an illegal move', () => {
    const t = createTask({ title: 'x', source: 'jarvis' }, NOW, 'x')
    expect(() => transition(t, 'completed', NOW)).toThrow('invalid transition queued->completed')
  })

  it('refuses completion without verifiedBy, and accepts it from the task itself', () => {
    const running = transition(createTask({ title: 'x', source: 'jarvis' }, NOW, 'x'), 'running', NOW)
    expect(() => transition(running, 'completed', NOW)).toThrow(/verifiedBy/)
    expect(() => transition(running, 'completed', NOW, undefined, { verifiedBy: '   ' })).toThrow(/verifiedBy/)
    const preVerified = { ...running, verifiedBy: 'verifier pass' }
    expect(transition(preVerified, 'completed', NOW).status).toBe('completed')
  })

  it('keeps requiredUserInput only while waiting for the user', () => {
    const running = transition(createTask({ title: 'Send batch', source: 'jarvis' }, NOW, 'x'), 'running', NOW)
    const waiting = transition(running, 'waiting_for_user', NOW, undefined, { requiredUserInput: 'Approve batch 1' })
    expect(waiting.requiredUserInput).toBe('Approve batch 1')
    expect(transition(waiting, 'running', LATER).requiredUserInput).toBeUndefined()
  })

  it('records failure with the error, and a re-queue clears it', () => {
    const running = transition(createTask({ title: 'x', source: 'jarvis' }, NOW, 'x'), 'running', NOW)
    const failed = transition(running, 'failed', NOW, 'network', { error: 'ECONNRESET' })
    expect(failed.error).toBe('ECONNRESET')
    expect(failed.actions.at(-1)).toMatchObject({ kind: 'error', ok: false })
    expect(transition(failed, 'queued', LATER).error).toBeUndefined()
  })

  it('treats completed and cancelled as final', () => {
    expect(ALLOWED.completed).toEqual([])
    expect(ALLOWED.cancelled).toEqual([])
  })
})

describe('addAction', () => {
  it('appends a timestamped action without mutating', () => {
    const t = createTask({ title: 'x', source: 'jarvis' }, NOW, 'x')
    const u = addAction(t, { kind: 'tool', summary: 'searched the record', tool: 'search', ok: true }, LATER)
    expect(t.actions).toHaveLength(0)
    expect(u.actions[0]).toEqual({ at: LATER.toISOString(), kind: 'tool', summary: 'searched the record', tool: 'search', ok: true })
  })
})

describe('summarize', () => {
  it('reads the documented example', () => {
    const s = summarize(many({ completed: 3, running: 1, waiting_for_user: 1 }))
    expect(s.sentence).toBe('Three things are complete, one is running, and I need your decision on one item.')
    expect(s).toMatchObject({ completed: 3, running: 1, waiting: 1, blocked: 0, failed: 0, queued: 0 })
  })

  it('says nothing is in progress when empty or only cancelled', () => {
    expect(summarize([]).sentence).toBe('Nothing is in progress.')
    expect(summarize(many({ cancelled: 2 })).sentence).toBe('Nothing is in progress.')
  })

  it.each([
    [{ completed: 1 }, 'One thing is complete.'],
    [{ completed: 2 }, 'Two things are complete.'],
    [{ running: 1 }, 'One thing is running.'],
    [{ running: 2, queued: 1 }, 'Two things are running and one is queued.'],
    [{ waiting_for_user: 1 }, 'I need your decision on one item.'],
    [{ waiting_for_user: 3 }, 'I need your decision on three items.'],
    [{ completed: 1, blocked: 2 }, 'One thing is complete and two are blocked.'],
    [{ completed: 12, failed: 1 }, 'Twelve things are complete and one failed.'],
    [{ completed: 13, failed: 2 }, '13 things are complete and two failed.'],
    [{ completed: 2, running: 1, queued: 4, blocked: 1, failed: 1, waiting_for_user: 2 }, 'Two things are complete, one is running, four are queued, one is blocked, one failed, and I need your decision on two items.'],
    [{ queued: 1, waiting_for_user: 2 }, 'One thing is queued and I need your decision on two items.'],
  ] as Array<[Partial<Record<TaskStatus, number>>, string]>)('%o -> %s', (counts, sentence) => {
    expect(summarize(many(counts)).sentence).toBe(sentence)
  })

  it('counts planning as running', () => {
    expect(summarize(many({ planning: 1, running: 1 })).running).toBe(2)
  })
})
