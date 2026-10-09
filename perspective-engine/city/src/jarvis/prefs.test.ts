import { describe, expect, it } from 'vitest'
import { browserTzOffset, DEFAULT_PREFS, inQuietHours, localMinutes, maySpeak, minutesOf, quietLabel, readPrefs } from './prefs'

const at = (iso: string) => new Date(iso)
const NIGHT = { enabled: true, start: '22:00', end: '07:00' }

describe('quiet hours', () => {
  it('cover a window that crosses midnight', () => {
    expect(inQuietHours(NIGHT, at('2026-10-09T21:59:00Z'), 0)).toBe(false)
    expect(inQuietHours(NIGHT, at('2026-10-09T22:00:00Z'), 0)).toBe(true)
    expect(inQuietHours(NIGHT, at('2026-10-10T03:00:00Z'), 0)).toBe(true)
    expect(inQuietHours(NIGHT, at('2026-10-10T06:59:00Z'), 0)).toBe(true)
    expect(inQuietHours(NIGHT, at('2026-10-10T07:00:00Z'), 0)).toBe(false)
  })

  it('cover a same-day window', () => {
    const lunch = { enabled: true, start: '12:00', end: '13:30' }
    expect(inQuietHours(lunch, at('2026-10-09T12:45:00Z'), 0)).toBe(true)
    expect(inQuietHours(lunch, at('2026-10-09T13:30:00Z'), 0)).toBe(false)
  })

  it('are judged in the owner’s local time', () => {
    // 17:00 UTC is 22:30 in India (+330): quiet there, not in London.
    expect(inQuietHours(NIGHT, at('2026-10-09T17:00:00Z'), 330)).toBe(true)
    expect(inQuietHours(NIGHT, at('2026-10-09T17:00:00Z'), 60)).toBe(false)
    // 05:00 UTC is 22:00 the day before in California (-420).
    expect(inQuietHours(NIGHT, at('2026-10-09T05:00:00Z'), -420)).toBe(true)
    expect(localMinutes(at('2026-10-09T17:00:00Z'), 330)).toBe(22 * 60 + 30)
  })

  it('are off when disabled, empty or malformed', () => {
    expect(inQuietHours({ ...NIGHT, enabled: false }, at('2026-10-10T03:00:00Z'), 0)).toBe(false)
    expect(inQuietHours({ enabled: true, start: '09:00', end: '09:00' }, at('2026-10-10T09:00:00Z'), 0)).toBe(false)
    expect(inQuietHours({ enabled: true, start: '25:00', end: '07:00' }, at('2026-10-10T03:00:00Z'), 0)).toBe(false)
    expect(inQuietHours(null, at('2026-10-10T03:00:00Z'), 0)).toBe(false)
    expect(minutesOf('7:05')).toBe(425)
    expect(minutesOf('7:5')).toBeNull()
    expect(quietLabel(NIGHT)).toBe('22:00–07:00')
  })
})

describe('when Jarvis may speak', () => {
  const night = at('2026-10-10T03:00:00Z')
  const day = at('2026-10-10T12:00:00Z')
  it('never when muted', () => {
    expect(maySpeak('reply', false, DEFAULT_PREFS, day, 0)).toEqual({ ok: false, reason: 'muted' })
  })
  it('replies to the owner even in quiet hours: they just asked', () => {
    expect(maySpeak('reply', true, DEFAULT_PREFS, night, 0).ok).toBe(true)
  })
  it('briefings and notifications respect quiet hours', () => {
    expect(maySpeak('briefing', true, DEFAULT_PREFS, night, 0)).toEqual({ ok: false, reason: 'quiet hours' })
    expect(maySpeak('notification', true, DEFAULT_PREFS, night, 0).ok).toBe(false)
    expect(maySpeak('notification', true, DEFAULT_PREFS, day, 0).ok).toBe(true)
    expect(maySpeak('notification', true, { ...DEFAULT_PREFS, quietHours: { ...NIGHT, enabled: false } }, night, 0).ok).toBe(true)
  })
})

describe('prefs document', () => {
  it('reads tolerantly and falls back field by field', () => {
    expect(readPrefs(undefined)).toEqual(DEFAULT_PREFS)
    expect(readPrefs({ lastVisit: 'yesterday', voice: { speak: 'yes', rate: 9 }, quietHours: { start: '23:00', end: 'late' } })).toEqual({
      ...DEFAULT_PREFS,
      quietHours: { enabled: true, start: '23:00', end: '07:00' },
    })
    expect(readPrefs({ lastVisit: '2026-10-08T09:00:00Z', voice: { speak: false, rate: 1.2 } })).toMatchObject({ lastVisit: '2026-10-08T09:00:00Z', voice: { speak: false, rate: 1.2 } })
  })
  it('takes the browser offset with the right sign', () => {
    const d = new Date('2026-10-09T12:00:00Z')
    expect(browserTzOffset(d)).toBe(-d.getTimezoneOffset())
  })
})
