import { describe, expect, it } from 'vitest'
import { createReminder, due, parseReminder } from '../core/reminders'
import type { Reminder } from '../core/types'

// Thursday 8 October 2026, 12:00 UTC.
const NOW = new Date('2026-10-08T12:00:00Z')
const iso = (s: string) => new Date(s).toISOString()

describe('parseReminder (UTC)', () => {
  it.each([
    ['remind me in 20 minutes to stretch', '2026-10-08T12:20:00Z', 'stretch'],
    ['Remind me to call mom in 20 minutes', '2026-10-08T12:20:00Z', 'call mom'],
    ['in 2 hours check the build', '2026-10-08T14:00:00Z', 'check the build'],
    ['remind me in an hour to stand up', '2026-10-08T13:00:00Z', 'stand up'],
    ['remind me in half an hour to eat', '2026-10-08T12:30:00Z', 'eat'],
    ['remind me in 3 days to follow up', '2026-10-11T12:00:00Z', 'follow up'],
    ['remind me in a week to review pricing', '2026-10-15T12:00:00Z', 'review pricing'],
    ['remind me in 1.5 hours to leave', '2026-10-08T13:30:00Z', 'leave'],
    ['remind me tomorrow at 9 to review batch one', '2026-10-09T09:00:00Z', 'review batch one'],
    ['Remind me tomorrow at 9:30am to call Ada', '2026-10-09T09:30:00Z', 'call Ada'],
    ['remind me tomorrow at 5 to send the deck', '2026-10-09T17:00:00Z', 'send the deck'],
    ['remind me tomorrow to pay the invoice', '2026-10-09T09:00:00Z', 'pay the invoice'],
    ['tomorrow morning check the inbox', '2026-10-09T09:00:00Z', 'check the inbox'],
    ['tomorrow evening call home', '2026-10-09T18:00:00Z', 'call home'],
    ['remind me at 5pm to send the deck', '2026-10-08T17:00:00Z', 'send the deck'],
    ['remind me to send 5 emails at 3pm', '2026-10-08T15:00:00Z', 'send 5 emails'],
    ['at 9 call the bank', '2026-10-08T21:00:00Z', 'call the bank'],
    ['at 14:00 stand-up', '2026-10-08T14:00:00Z', 'stand-up'],
    ['at noon lunch with Curie', '2026-10-09T12:00:00Z', 'lunch with Curie'],
    ['at midnight rotate logs', '2026-10-09T00:00:00Z', 'rotate logs'],
    ['remind me tonight to read the dossier', '2026-10-08T20:00:00Z', 'read the dossier'],
    ['tonight at 10 call Sam', '2026-10-08T22:00:00Z', 'call Sam'],
    ['this evening at 7 dinner', '2026-10-08T19:00:00Z', 'dinner'],
    ['remind me on Friday at 10am about the board pack', '2026-10-09T10:00:00Z', 'the board pack'],
    ['on Thursday at 3pm demo', '2026-10-08T15:00:00Z', 'demo'],
    ['on Thursday at 10am demo', '2026-10-15T10:00:00Z', 'demo'],
    ["Don't let me forget the rent next Monday", '2026-10-12T09:00:00Z', 'the rent'],
    ['next Thursday review the LOI', '2026-10-15T09:00:00Z', 'review the LOI'],
    ['on fri at 4pm ship it', '2026-10-09T16:00:00Z', 'ship it'],
    ['remind me next week to plan the pilot', '2026-10-12T09:00:00Z', 'plan the pilot'],
    ['remind me 2026-10-09 14:00 to submit the grant', '2026-10-09T14:00:00Z', 'submit the grant'],
    ['2026-10-20 file taxes', '2026-10-20T09:00:00Z', 'file taxes'],
    ['remind me on October 20 at 3pm to renew the domain', '2026-10-20T15:00:00Z', 'renew the domain'],
    ['remind me on 9 Oct to call Rams', '2026-10-09T09:00:00Z', 'call Rams'],
    ['remind me on Oct 1 to close the books', '2027-10-01T09:00:00Z', 'close the books'],
    ['set a reminder for 5pm to stretch', '2026-10-08T17:00:00Z', 'stretch'],
    ['Remind me in 2 hours.', '2026-10-08T14:00:00Z', 'Reminder'],
  ])('%j', (text, dueAt, rest) => {
    expect(parseReminder(text, NOW)).toEqual({ dueAt: iso(dueAt), text: rest })
  })

  it('rolls "at 5pm" to tomorrow when it has passed', () => {
    expect(parseReminder('at 5pm stretch', new Date('2026-10-08T18:00:00Z'))?.dueAt).toBe(iso('2026-10-09T17:00:00Z'))
  })

  it('reads "tonight" after 20:00 as an hour from now', () => {
    expect(parseReminder('tonight check the build', new Date('2026-10-08T21:30:00Z'))?.dueAt).toBe(iso('2026-10-08T22:30:00Z'))
  })

  it('honours an explicit zone in an ISO time', () => {
    expect(parseReminder('remind me 2026-10-09T14:00Z to call', NOW, 330)?.dueAt).toBe(iso('2026-10-09T14:00:00Z'))
    expect(parseReminder('remind me 2026-10-09T14:00+05:30 to call', NOW)?.dueAt).toBe(iso('2026-10-09T08:30:00Z'))
  })

  it.each(['remind me to call mom', 'hello there', '', 'remind me on 2026-02-30 to do it'])('returns null when no valid time is stated: %j', text => {
    expect(parseReminder(text, NOW)).toBeNull()
  })
})

describe('parseReminder with tzOffsetMinutes', () => {
  it('uses local wall-clock time east of UTC (India, +330)', () => {
    expect(parseReminder('tomorrow at 9 review', NOW, 330)?.dueAt).toBe(iso('2026-10-09T03:30:00Z'))
    expect(parseReminder('2026-10-09 14:00 review', NOW, 330)?.dueAt).toBe(iso('2026-10-09T08:30:00Z'))
  })

  it('uses local wall-clock time west of UTC (California summer, -420)', () => {
    // 12:00 UTC is 05:00 local, so 5pm is still today locally.
    expect(parseReminder('at 5pm review', NOW, -420)?.dueAt).toBe(iso('2026-10-09T00:00:00Z'))
    expect(parseReminder('tomorrow at 9 review', NOW, -420)?.dueAt).toBe(iso('2026-10-09T16:00:00Z'))
  })

  it('decides "tomorrow" and weekdays by the local date, not the UTC date', () => {
    const lateUtc = new Date('2026-10-08T23:30:00Z') // already Friday 05:00 in India
    expect(parseReminder('tomorrow at 9 review', lateUtc, 330)?.dueAt).toBe(iso('2026-10-10T03:30:00Z'))
    expect(parseReminder('on Friday at 10am review', lateUtc, 330)?.dueAt).toBe(iso('2026-10-09T04:30:00Z'))
  })

  it('reads "tomorrow" said after midnight but before 04:00 as the coming morning', () => {
    const halfPastMidnight = new Date('2026-10-08T19:00:00Z') // 00:30 on Friday 9 October in India
    expect(parseReminder('tomorrow at 9 review', halfPastMidnight, 330)?.dueAt).toBe(iso('2026-10-09T03:30:00Z'))
    expect(parseReminder('in 1 day review', halfPastMidnight, 330)?.dueAt).toBe(iso('2026-10-09T19:00:00Z'))
  })

  it('keeps relative times independent of the offset', () => {
    expect(parseReminder('in 20 minutes stretch', NOW, 330)?.dueAt).toBe(iso('2026-10-08T12:20:00Z'))
  })
})

describe('due and createReminder', () => {
  const r = (id: string, dueAt: string, status: Reminder['status'] = 'pending'): Reminder => ({ ...createReminder(id, dueAt, NOW, id), status })

  it('creates a pending reminder on the default channels', () => {
    expect(createReminder('review batch one', '2026-10-09T09:00:00Z', NOW, 'r1')).toEqual({
      id: 'r1', text: 'review batch one', dueAt: '2026-10-09T09:00:00.000Z', createdAt: NOW.toISOString(), status: 'pending', channels: ['page', 'speech', 'push'],
    })
  })

  it('rejects an invalid due time and redacts secrets in the text', () => {
    expect(() => createReminder('x', 'tomorrow', NOW)).toThrow(/invalid due time/)
    expect(createReminder('rotate ghp_abcdefghijklmnopqrstuvwxyz0123456789', '2026-10-09T09:00:00Z', NOW).text).toBe('rotate [REDACTED TOKEN]')
  })

  it('returns pending and scheduled reminders that are due, oldest first', () => {
    const list = [
      r('late', '2026-10-08T11:00:00Z', 'scheduled'),
      r('early', '2026-10-08T10:00:00Z'),
      r('exact', '2026-10-08T12:00:00Z'),
      r('future', '2026-10-08T12:00:01Z'),
      r('done', '2026-10-08T09:00:00Z', 'delivered'),
      r('dismissed', '2026-10-08T09:00:00Z', 'dismissed'),
    ]
    expect(due(list, NOW).map(x => x.id)).toEqual(['early', 'late', 'exact'])
  })

  it('works end to end with parseReminder', () => {
    const parsed = parseReminder('remind me in 20 minutes to stretch', NOW)!
    const reminder = createReminder(parsed.text, parsed.dueAt, NOW, 'r')
    expect(due([reminder], new Date('2026-10-08T12:19:59Z'))).toEqual([])
    expect(due([reminder], new Date('2026-10-08T12:20:00Z'))).toEqual([reminder])
  })
})
