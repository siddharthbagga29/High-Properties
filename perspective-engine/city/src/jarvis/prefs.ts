/**
 * The owner's Jarvis preferences (db doc data/users/<id>/jarvis-prefs): last visit, voice and quiet hours.
 * Pure: every function takes the clock and the browser's UTC offset as arguments.
 */

export interface QuietHours {
  enabled: boolean
  /** Local wall-clock "HH:MM". The window may cross midnight (22:00 to 07:00). */
  start: string
  end: string
}

export interface JarvisPrefs {
  /** When the owner last opened the page (ISO), for "since your last visit". */
  lastVisit: string | null
  voice: { speak: boolean; rate: number }
  quietHours: QuietHours
  updatedAt?: string
}

export const DEFAULT_PREFS: JarvisPrefs = {
  lastVisit: null,
  voice: { speak: true, rate: 1 },
  quietHours: { enabled: true, start: '22:00', end: '07:00' },
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/

/** Minutes after local midnight for "HH:MM", or null when malformed. */
export function minutesOf(hhmm: string): number | null {
  const m = HHMM.exec(String(hhmm ?? '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** The browser's offset from UTC in minutes, the way the core wants it (India +330, California in summer -420). */
export function browserTzOffset(d: Date = new Date()): number {
  const off = -d.getTimezoneOffset()
  return Number.isFinite(off) ? off : 0
}

/** Local minutes after midnight at `now` for a UTC offset. */
export function localMinutes(now: Date, tzOffsetMinutes: number): number {
  const t = new Date(now.getTime() + tzOffsetMinutes * 60_000)
  return t.getUTCHours() * 60 + t.getUTCMinutes()
}

/** True while `now` is inside the quiet window. Start == end means no window; a malformed window is never quiet. */
export function inQuietHours(q: QuietHours | null | undefined, now: Date, tzOffsetMinutes: number): boolean {
  if (!q?.enabled) return false
  const start = minutesOf(q.start), end = minutesOf(q.end)
  if (start === null || end === null || start === end) return false
  const m = localMinutes(now, tzOffsetMinutes)
  return start < end ? m >= start && m < end : m >= start || m < end
}

export type SpeechKind = 'reply' | 'briefing' | 'notification'

/**
 * Whether Jarvis may speak now. Replies to something the owner just said follow the speak toggle only:
 * they asked. Anything Jarvis starts by itself (briefing, reminders, request updates) also respects quiet hours.
 */
export function maySpeak(kind: SpeechKind, speak: boolean, prefs: JarvisPrefs | null, now: Date, tzOffsetMinutes: number): { ok: boolean; reason: string } {
  if (!speak) return { ok: false, reason: 'muted' }
  if (kind !== 'reply' && inQuietHours(prefs?.quietHours, now, tzOffsetMinutes)) return { ok: false, reason: 'quiet hours' }
  return { ok: true, reason: kind === 'reply' ? 'reply to you' : 'outside quiet hours' }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Reads a prefs document tolerantly: anything missing or malformed falls back to the default. */
export function readPrefs(raw: unknown): JarvisPrefs {
  const r = isObj(raw) ? raw : {}
  const voice = isObj(r.voice) ? r.voice : {}
  const q = isObj(r.quietHours) ? r.quietHours : {}
  const iso = typeof r.lastVisit === 'string' && Number.isFinite(Date.parse(r.lastVisit)) ? r.lastVisit : null
  const rate = typeof voice.rate === 'number' && voice.rate >= 0.5 && voice.rate <= 2 ? voice.rate : DEFAULT_PREFS.voice.rate
  const out: JarvisPrefs = {
    lastVisit: iso,
    voice: { speak: typeof voice.speak === 'boolean' ? voice.speak : DEFAULT_PREFS.voice.speak, rate },
    quietHours: {
      enabled: typeof q.enabled === 'boolean' ? q.enabled : DEFAULT_PREFS.quietHours.enabled,
      start: typeof q.start === 'string' && minutesOf(q.start) !== null ? q.start : DEFAULT_PREFS.quietHours.start,
      end: typeof q.end === 'string' && minutesOf(q.end) !== null ? q.end : DEFAULT_PREFS.quietHours.end,
    },
  }
  if (typeof r.updatedAt === 'string') out.updatedAt = r.updatedAt
  return out
}

/** "22:00–07:00" for the console. */
export const quietLabel = (q: QuietHours) => (q.enabled ? `${q.start}–${q.end}` : 'off')
