/**
 * Reminders fire at dueAt: an injected clock and a fake notifier for the scheduler itself, and the whole path
 * through the app (ask → reminders.json → tick → notify + say through the tool registry → delivered).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReminder } from '../../core/index'
import { createApp } from '../src/app'
import { MAX_ATTEMPTS, RETRY_AFTER_MS, createScheduler, type ChannelResult } from '../src/scheduler'
import { fileReminderStore, readJsonl, type AgentReminder } from '../src/store'
import { notifyArgs } from '../src/tools/mac'
import { cleanup, fakeRunner, offlineFetch, tempDir, testConfig } from './helpers'

const T0 = new Date('2026-10-09T08:00:00.000Z')

let dir: string
beforeEach(() => {
  dir = tempDir('sched')
})
afterEach(() => cleanup(dir))

function clock(start = T0) {
  let t = start.getTime()
  return { now: () => new Date(t), advance: (ms: number) => void (t += ms) }
}

function reminder(text: string, dueInMs: number, now = T0): AgentReminder {
  return { ...createReminder(text, new Date(now.getTime() + dueInMs).toISOString(), now), channels: ['mac', 'speech'] }
}

describe('reminder scheduler', () => {
  it('delivers a reminder exactly once, when it is due, and marks it delivered', async () => {
    const c = clock()
    const store = fileReminderStore(join(dir, 'reminders.json'))
    store.put(reminder('stretch', 20 * 60_000))
    const delivered: string[] = []
    const audit: string[] = []
    const s = createScheduler({ store, now: c.now, deliver: async r => (delivered.push(r.text), [{ channel: 'mac', ok: true, detail: 'shown' }]), audit: { append: e => audit.push(e.resultSummary) } })

    expect(await s.tick()).toHaveLength(0)
    c.advance(19 * 60_000)
    expect(await s.tick()).toHaveLength(0)
    expect(delivered).toEqual([])

    c.advance(60_000) // exactly at dueAt
    const fired = await s.tick()
    expect(fired).toHaveLength(1)
    expect(delivered).toEqual(['stretch'])
    const stored = store.list()[0]
    expect(stored.status).toBe('delivered')
    expect(stored.deliveredAt).toBe(c.now().toISOString())
    expect(audit[0]).toMatch(/delivered via mac/)

    c.advance(60 * 60_000)
    expect(await s.tick()).toHaveLength(0)
    expect(delivered).toEqual(['stretch'])
    // The file on disk agrees.
    expect((JSON.parse(readFileSync(join(dir, 'reminders.json'), 'utf8')) as AgentReminder[])[0].status).toBe('delivered')
  })

  it('a failed delivery stays pending, records why, and retries a minute later at most three times', async () => {
    const c = clock()
    const store = fileReminderStore(join(dir, 'reminders.json'))
    store.put(reminder('call the bank', 0))
    let calls = 0
    const s = createScheduler({ store, now: c.now, deliver: async (): Promise<ChannelResult[]> => (calls++, [{ channel: 'mac', ok: false, detail: 'notify needs macOS' }]) })

    await s.tick()
    let r = store.list()[0]
    expect(r.status).toBe('pending')
    expect(r.attempts).toBe(1)
    expect(r.lastError).toMatch(/needs macOS/)
    expect(Date.parse(r.nextAttemptAt!)).toBe(c.now().getTime() + RETRY_AFTER_MS)

    await s.tick() // too early for the retry
    expect(calls).toBe(1)
    for (let i = 0; i < 5; i++) {
      c.advance(RETRY_AFTER_MS)
      await s.tick()
    }
    r = store.list()[0]
    expect(calls).toBe(MAX_ATTEMPTS)
    expect(r.attempts).toBe(MAX_ATTEMPTS)
    expect(r.status).toBe('pending') // never claimed as delivered
  })

  it('a deliver function that throws is recorded as a failure, not a crash', async () => {
    const c = clock()
    const store = fileReminderStore(join(dir, 'reminders.json'))
    store.put(reminder('x', 0))
    const s = createScheduler({
      store,
      now: c.now,
      deliver: async () => {
        throw new Error('osascript missing')
      },
    })
    await expect(s.tick()).resolves.toHaveLength(1)
    expect(store.list()[0].lastError).toMatch(/osascript missing/)
  })

  it('overlapping ticks never deliver the same reminder twice', async () => {
    const c = clock()
    const store = fileReminderStore(join(dir, 'reminders.json'))
    store.put(reminder('slow', 0))
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const s = createScheduler({ store, now: c.now, deliver: async () => (calls++, await gate, [{ channel: 'speech', ok: true, detail: 'spoken' }]) })
    const a = s.tick()
    const b = s.tick()
    release()
    await Promise.all([a, b])
    await s.tick()
    expect(calls).toBe(1)
  })

  it('dismissed and future reminders are left alone', async () => {
    const c = clock()
    const store = fileReminderStore(join(dir, 'reminders.json'))
    store.put({ ...reminder('dismissed', 0), status: 'dismissed' })
    store.put(reminder('later', 3_600_000))
    let calls = 0
    const s = createScheduler({ store, now: c.now, deliver: async () => (calls++, []) })
    await s.tick()
    expect(calls).toBe(0)
  })
})

describe('reminders through the agent', () => {
  it('ask creates the reminder; at dueAt the scheduler shows a notification and speaks it (macOS argument vectors)', async () => {
    const c = clock()
    const runner = fakeRunner()
    const home = join(dir, 'home')
    const app = createApp({ home, config: testConfig(dir), env: {}, fetch: offlineFetch, which: () => null, platform: 'darwin', runner, now: c.now, tzOffsetMinutes: () => 0 })
    try {
      const r = await app.ask('remind me in 20 minutes to review batch one')
      expect(r.intent).toBe('remind')
      expect(r.reminder?.dueAt).toBe('2026-10-09T08:20:00.000Z')
      expect(r.answer).toMatch(/^I will remind you to review batch one at 08:20 on Fri,? 9 Oct\.$/) // ICU versions differ on the comma

      c.advance(10 * 60_000)
      expect(await app.scheduler.tick()).toHaveLength(0)
      expect(runner.calls).toHaveLength(0)

      c.advance(10 * 60_000)
      const fired = await app.scheduler.tick()
      expect(fired.map(x => x.status)).toEqual(['delivered'])
      expect(runner.calls.map(x => x.program)).toEqual(['osascript', 'say'])
      expect(runner.calls[0].args).toEqual(notifyArgs('review batch one', 'Jarvis reminder'))
      expect(runner.calls[1].args).toEqual([])
      expect(runner.calls[1].input).toBe('Reminder: review batch one')
      expect(app.reminders()[0].status).toBe('delivered')

      const audit = readJsonl<{ tool: string; ok: boolean }>(app.paths.audit)
      expect(audit.filter(e => e.tool === 'notify' || e.tool === 'say' || e.tool === 'reminder.deliver').map(e => [e.tool, e.ok])).toEqual([
        ['notify', true],
        ['say', true],
        ['reminder.deliver', true],
      ])
    } finally {
      await app.close()
    }
  })

  it('with speech turned off only the notification is used', async () => {
    const c = clock()
    const runner = fakeRunner()
    const cfg = testConfig(dir)
    const app = createApp({ home: join(dir, 'home2'), config: { ...cfg, voice: { say: false } }, env: {}, fetch: offlineFetch, which: () => null, platform: 'darwin', runner, now: c.now })
    try {
      app.addReminder('water the plants', new Date(T0.getTime() + 1000).toISOString())
      c.advance(1000)
      await app.scheduler.tick()
      expect(runner.calls.map(x => x.program)).toEqual(['osascript'])
    } finally {
      await app.close()
    }
  })

  it('off macOS a due reminder is not claimed as delivered: it shows up under Needs you instead', async () => {
    const c = clock()
    const runner = fakeRunner()
    const app = createApp({ home: join(dir, 'home3'), config: testConfig(dir), env: {}, fetch: offlineFetch, which: () => null, platform: 'linux', runner, now: c.now })
    try {
      const added = app.addReminder('submit the form', T0.toISOString())
      expect('reminder' in added).toBe(true)
      await app.scheduler.tick()
      const r = app.reminders()[0]
      expect(r.status).toBe('pending')
      expect(r.lastError).toMatch(/needs macOS/)
      expect(runner.calls).toHaveLength(0)
      const needs = app.briefing().needsYou
      expect(needs.items.some(i => i.title === 'Reminder: submit the form' && /not delivered/.test(i.detail ?? ''))).toBe(true)
    } finally {
      await app.close()
    }
  })
})
