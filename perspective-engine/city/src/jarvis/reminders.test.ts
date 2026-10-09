import { readFileSync } from 'node:fs'
import { createReminder } from '@jarvis/reminders'
import { describe, expect, it } from 'vitest'
import type { GraphState } from '../data/types'
import { respond } from './conversation'
import { flush } from './fake-db'
import { confirmation, dueToAnnounce, planReminder, readReminder, sortReminders, whenLabel } from './reminders'
import { makeEnv, rowsFrom, UID } from './test-helpers'

const state = JSON.parse(readFileSync(new URL('../../public/state.json', import.meta.url), 'utf8')) as GraphState
// Wednesday 7 October 2026, 10:00 UTC.
const NOW = new Date('2026-10-07T10:00:00Z')

describe('reminder flow (fake database)', () => {
  it('"remind me tomorrow at 9 to review batch one" is saved privately, read back, and confirmed honestly', async () => {
    const t = makeEnv({ viewer: 'owner', now: NOW, state })
    const r = await respond('remind me tomorrow at 9 to review batch one', t.env)
    expect(r.ok).toBe(true)
    expect(r.text).toBe("Reminder set for Thu 9:00: review batch one. I'll show it here when it's due; your phone gets it after the hourly check schedules it.")
    expect(r.spoken).toBe("Reminder set for Thu 9:00. I'll show it here when it's due.")
    const [rem] = rowsFrom(t.db).reminders
    expect(rem).toMatchObject({ text: 'review batch one', dueAt: '2026-10-08T09:00:00.000Z', status: 'pending', channels: ['page', 'speech', 'push'] })
    const path = `data/users/${UID}/jarvis/jarvis-reminders/${rem.id}`
    expect(t.db.writes).toContainEqual({ op: 'set', path })
    // The postcondition: the row was read back after it was written.
    expect(t.db.reads).toContain(path)
    // The action is logged as a Jarvis task, completed only with what verified it.
    const task = [...t.db.docs.entries()].find(([k]) => k.includes('/jarvis-tasks/'))![1]
    expect(task).toMatchObject({ status: 'completed', verifiedBy: 'read back from the database', title: 'Set reminder: review batch one' })
  })

  it('uses the browser offset: 9:00 in India is 03:30 UTC', async () => {
    const t = makeEnv({ viewer: 'owner', now: NOW, state, tz: 330 })
    const r = await respond('remind me tomorrow at 9 to review batch one', t.env)
    expect(r.text).toContain('Reminder set for Thu 9:00')
    expect(rowsFrom(t.db).reminders[0].dueAt).toBe('2026-10-08T03:30:00.000Z')
  })

  it('warns that the phone may be late when it is due before the next hourly check', async () => {
    const t = makeEnv({ viewer: 'owner', now: NOW, state })
    const r = await respond('remind me in 20 minutes to stretch', t.env)
    expect(r.text).toBe("Reminder set for today 10:20: stretch. It's due before the next hourly check, so your phone may get it late; I'll show and say it here if this page is open.")
  })

  it('asks for a time instead of guessing, and writes nothing', async () => {
    const t = makeEnv({ viewer: 'owner', now: NOW, state })
    const r = await respond('remind me to call the bank', t.env)
    expect(r.text).toContain('When should I remind you?')
    expect(t.db.writes).toHaveLength(0)
  })

  it('never says "Reminder set" when the database refused the write', async () => {
    const t = makeEnv({ viewer: 'owner', now: NOW, state })
    t.db.failWith = 'invalid_argument'
    const r = await respond('remind me tomorrow at 9 to review batch one', t.env)
    expect(r.ok).toBe(false)
    expect(r.text).toBe("I couldn't save the reminder: this view isn't allowed to write your private data.")
  })

  it('retries once on a transient refusal', async () => {
    const t = makeEnv({ viewer: 'owner', now: NOW, state })
    let fails = 1
    const ref = t.db.doc.bind(t.db)
    t.db.doc = (p: string) => {
      const d = ref(p)
      const set = d.set.bind(d)
      return { ...d, set: async (b: Record<string, unknown>) => { if (fails-- > 0) throw { code: 'unavailable' }; return set(b) } }
    }
    const coll = t.db.collection.bind(t.db)
    t.db.collection = (p: string) => ({ ...coll(p), doc: (id?: string) => t.db.doc(`${p}/${id}`) })
    const r = await respond('remind me tomorrow at 9 to review batch one', t.env)
    expect(r.ok).toBe(true)
  })

  it('says plainly when this view has no private data at all', async () => {
    const t = makeEnv({ viewer: 'owner', now: NOW, state, withData: false })
    const r = await respond('remind me tomorrow at 9 to review batch one', t.env)
    expect(r.ok).toBe(false)
    expect(r.text).toContain("Your private data isn't available in this view")
  })

  it('the owner sees the reminder arrive through the live subscription', async () => {
    const t = makeEnv({ viewer: 'owner', now: NOW, state })
    const seen: number[] = []
    const off = t.data!.watch(p => { if (p.reminders) seen.push(p.reminders.length) })
    await flush()
    await respond('remind me tomorrow at 9 to review batch one', t.env)
    await flush()
    off()
    expect(seen[0]).toBe(0)
    expect(seen[seen.length - 1]).toBe(1)
  })
})

describe('reminder helpers', () => {
  it('labels times locally, with the date when a week or more away', () => {
    expect(whenLabel('2026-10-08T09:00:00Z', NOW, 0)).toBe('Thu 9:00')
    expect(whenLabel('2026-10-07T17:30:00Z', NOW, 0)).toBe('today 17:30')
    expect(whenLabel('2026-10-20T09:05:00Z', NOW, 0)).toBe('Tue 20 Oct 9:05')
    expect(whenLabel('2026-10-08T03:30:00Z', NOW, 330)).toBe('Thu 9:00')
  })

  it('refuses a time already past', () => {
    expect(planReminder('remind me at 9am to stand up', new Date('2026-10-07T08:59:00Z'), 0).ok).toBe(true)
    const p = planReminder('remind me 2026-10-01 at 09:00 to file', NOW, 0)
    expect(p.ok).toBe(false)
  })

  it('announces each due reminder once while the page is open', () => {
    const r1 = createReminder('review batch one', '2026-10-07T09:00:00Z', new Date('2026-10-06T09:00:00Z'), 'r1')
    const r2 = createReminder('later thing', '2026-10-08T09:00:00Z', new Date('2026-10-06T09:00:00Z'), 'r2')
    const dismissed = { ...createReminder('old', '2026-10-01T09:00:00Z', new Date('2026-09-30T09:00:00Z'), 'r3'), status: 'dismissed' as const }
    const announced = new Set<string>()
    const first = dueToAnnounce([r1, r2, dismissed], announced, NOW)
    expect(first.map(r => r.id)).toEqual(['r1'])
    first.forEach(r => announced.add(r.id))
    expect(dueToAnnounce([r1, r2, dismissed], announced, NOW)).toEqual([])
    expect(dueToAnnounce([r1, r2], announced, new Date('2026-10-08T09:00:00Z')).map(r => r.id)).toEqual(['r2'])
  })

  it('reads reminder rows as data and drops malformed ones', () => {
    expect(readReminder('x', { text: 'a', dueAt: 'not a date' })).toBeNull()
    expect(readReminder('x', null)).toBeNull()
    expect(readReminder('x', { text: 'a', dueAt: '2026-10-08T09:00:00Z', status: 'hacked', channels: ['push', 'email'] })).toMatchObject({ status: 'pending', channels: ['push'] })
  })

  it('sorts upcoming before finished', () => {
    const a = { ...createReminder('a', '2026-10-09T09:00:00Z', NOW, 'a'), status: 'delivered' as const }
    const b = createReminder('b', '2026-10-10T09:00:00Z', NOW, 'b')
    expect(sortReminders([a, b]).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('confirmation never claims the push was sent', () => {
    const r = createReminder('x', '2026-10-09T09:00:00Z', NOW, 'x')
    const c = confirmation(r, NOW, 0)
    expect(c.text).not.toMatch(/sent|pushed|scheduled the push/i)
  })
})
