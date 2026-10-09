/** Visitor tool isolation: a visitor can explore and ask, and never reaches an owner tool or the owner's rows. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { GraphState } from '../data/types'
import { respond } from './conversation'
import { createFakeDb } from './fake-db'
import { createOwnerData } from './owner-data'
import { makeEnv, UID } from './test-helpers'
import { cityRegistry, cityTools, PUBLIC_TOOL_IDS } from './tools'

const state = JSON.parse(readFileSync(new URL('../../public/state.json', import.meta.url), 'utf8')) as GraphState
const NOW = new Date('2026-10-09T13:00:00Z')

describe('visitor tool isolation', () => {
  it('visitors are offered only the public, safe tools', () => {
    const { env } = makeEnv({ viewer: 'visitor', now: NOW, state })
    expect(env.registry.list('visitor').map(t => t.id).sort()).toEqual([...PUBLIC_TOOL_IDS].sort())
    expect(env.registry.list('owner').length).toBeGreaterThan(PUBLIC_TOOL_IDS.length)
    for (const t of cityTools({ state: () => state, go: () => true, data: null, requests: () => [], reminders: () => [], now: () => NOW })) {
      if (t.scope === 'public') expect(t.riskLevel).toBe('safe')
    }
  })

  it('even with the owner store wired in by mistake, the policy stops every owner tool before it runs', async () => {
    const db = createFakeDb()
    const data = createOwnerData(db, UID)
    // Deliberately misconfigured: a visitor registry holding the owner's store.
    const { registry, audit } = cityRegistry({ state: () => state, go: () => true, data, requests: () => [], reminders: () => [], now: () => NOW })
    const calls: Array<[string, Record<string, unknown>]> = [
      ['jarvis.set_reminder', { text: 'x', dueAt: '2026-10-10T09:00:00Z' }],
      ['jarvis.queue_request', { text: 'build something' }],
      ['jarvis.record_decision', { text: 'the rate is 50' }],
      ['jarvis.cancel_request', { id: 'req-1' }],
      ['jarvis.dismiss_reminder', { id: 'rem-1' }],
    ]
    for (const [id, input] of calls) {
      const r = await registry.run(id, input, { viewer: 'visitor', confirmed: true })
      expect(r.ok).toBe(false)
      expect(r.decision).toBe('denied')
    }
    expect(db.writes).toEqual([])
    expect(db.reads).toEqual([])
    expect(audit.entries().every(e => e.actor === 'visitor' && e.decision === 'denied')).toBe(true)
  })

  it('a malformed viewer value fails closed like a visitor', async () => {
    const t = makeEnv({ viewer: 'owner', now: NOW, state })
    const r = await t.env.registry.run('jarvis.queue_request', { text: 'x' }, { viewer: 'admin' as never, confirmed: true })
    expect(r.decision).toBe('denied')
    expect(t.db.writes).toEqual([])
  })

  it('in conversation, a visitor cannot remind, decide, queue or continue anything', async () => {
    const t = makeEnv({ viewer: 'visitor', now: NOW, state })
    const said = [
      await respond('remind me tomorrow at 9 to review batch one', t.env),
      await respond('I decide the advisor rate is 50 dollars an hour', t.env),
      await respond('build the advisor recruitment page', t.env),
      await respond('yes, do it', t.env),
    ]
    expect(said[0].text).toContain('private to the founder')
    expect(said[1].text).toBe('Only the founder can record decisions.')
    expect(said[3].text).toContain('nothing waiting for a yes')
    expect(t.db.writes).toEqual([])
    expect(t.db.reads).toEqual([])
  })

  it("a visitor's model prompt carries no owner rows and says the private data is off limits", async () => {
    const t = makeEnv({ viewer: 'visitor', now: NOW, state })
    t.env.owner = () => ({ reminders: [], requests: [{ id: 'r', text: 'SECRET owner request', status: 'queued', createdAt: NOW.toISOString(), kind: 'build' }], decisions: [] })
    await respond('what has the founder asked you to do?', t.env)
    const all = t.chats.flat().map(m => m.content).join('\n')
    expect(all).not.toContain('SECRET owner request')
    expect(all).toContain('Never guess at or describe the founder')
  })

  it("the owner's model prompt carries their rows, wrapped as data", async () => {
    const t = makeEnv({ viewer: 'owner', now: NOW, state })
    await respond('I decide the advisor rate is 50 dollars an hour', t.env)
    await respond('what did I decide about advisors?', t.env)
    const last = t.chats[t.chats.length - 1]
    const user = last[last.length - 1].content
    expect(user).toContain(`source="the founder's private Jarvis rows" trust="memory"`)
    expect(user).toContain('the advisor rate is 50 dollars an hour')
  })
})
