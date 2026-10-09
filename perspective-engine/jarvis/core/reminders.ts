import { redact } from './audit'
import { newId } from './ids'
import { timeOf } from './text'
import type { Reminder } from './types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const DEFAULT_HOUR = 9
const EARLY_HOURS_END = 4

const COUNT_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, sixty: 60, ninety: 90, 'a couple of': 2, 'a few': 3,
}
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_ABBR: Record<string, number> = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 }
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const PART_OF_DAY: Record<string, number> = { morning: 9, afternoon: 14, evening: 18, night: 20, tonight: 20 }

interface YMD { y: number; m: number; d: number }

/** What the time phrases in a sentence said, before it is resolved against the clock. */
interface When {
  absoluteMs?: number
  offsetMs?: number
  offsetDays?: number
  date?: YMD
  dayOffset?: number
  /** The day came from the word "tomorrow" (not "in 1 day"). */
  saidTomorrow?: boolean
  weekday?: { day: number; strict: boolean }
  hour?: number
  minute?: number
  meridiem?: 'am' | 'pm'
  /** The hour was written unambiguously (14:00, 09:30, ISO). */
  h24?: boolean
  partHour?: number
}

type Extractor = [RegExp, (m: RegExpMatchArray, w: When) => boolean]

const num = (s: string | undefined) => Number.parseInt(s ?? '', 10)
const countOf = (s: string) => COUNT_WORDS[s.toLowerCase().replace(/\s+/g, ' ')] ?? Number.parseFloat(s)
const monthIndex = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase())

function unitMs(unit: string): number {
  const u = unit.toLowerCase()
  if (u.startsWith('w')) return 7 * DAY
  if (u.startsWith('d')) return DAY
  if (u.startsWith('h')) return HOUR
  return MINUTE
}

function validDate(y: number, m: number, d: number): boolean {
  const t = new Date(Date.UTC(y, m, d))
  return m >= 0 && m < 12 && t.getUTCFullYear() === y && t.getUTCMonth() === m && t.getUTCDate() === d
}

function setClock(w: When, hour: number, minute: number, meridiem?: string, h24 = false): boolean {
  if (minute < 0 || minute > 59) return false
  if (meridiem) {
    if (hour < 1 || hour > 12) return false
    w.meridiem = meridiem.toLowerCase().startsWith('p') ? 'pm' : 'am'
  } else if (hour < 0 || hour > 23) return false
  w.hour = hour
  w.minute = minute
  w.h24 = h24
  return true
}

/** Each extractor reads one kind of time phrase; matched text is removed so it does not end up in the reminder. */
const EXTRACTORS: Extractor[] = [
  // ISO date, optional time, optional zone: 2026-10-09, 2026-10-09 14:00, 2026-10-09T14:00Z
  [/\b(?:on\s+)?(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?(?!\d)/i, (m, w) => {
    const [y, mo, d] = [num(m[1]), num(m[2]) - 1, num(m[3])]
    if (!validDate(y, mo, d)) return false
    if (m[4] !== undefined && m[6]) {
      const zone = m[6].toUpperCase() === 'Z' ? 'Z' : m[6].replace(/^([+-]\d{2}):?(\d{2})$/, '$1:$2')
      const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, '0')}:${m[5]}:00${zone}`)
      if (!Number.isFinite(t)) return false
      w.absoluteMs = t
      return true
    }
    w.date = { y, m: mo, d }
    return m[4] === undefined || setClock(w, num(m[4]), num(m[5]), undefined, true)
  }],
  // October 9, Oct 9th, October 9 2026
  [/\b(?:on\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i, (m, w) => {
    w.date = { y: m[3] ? num(m[3]) : NaN, m: monthIndex(m[1]), d: num(m[2]) }
    return true
  }],
  // 9 October, 9th of Oct
  [/\b(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:,?\s+(\d{4}))?/i, (m, w) => {
    w.date = { y: m[3] ? num(m[3]) : NaN, m: monthIndex(m[2]), d: num(m[1]) }
    return true
  }],
  [/\bin\s+half\s+an?\s+hour\b/i, (_m, w) => {
    w.offsetMs = 30 * MINUTE
    return true
  }],
  // in 20 minutes, in 2 hours, in 3 days, in a week, in an hour
  [/\bin\s+(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty-five|forty|fifty|sixty|ninety|a\s+couple\s+of|a\s+few)\s*(minutes?|mins?|m|hours?|hrs?|hr|h|days?|d|weeks?|wks?|w)\b/i, (m, w) => {
    const n = countOf(m[1])
    if (!Number.isFinite(n) || n <= 0) return false
    const unit = unitMs(m[2])
    w.offsetMs = Math.round(n * unit)
    if (unit >= DAY && Number.isInteger(n)) w.offsetDays = n * (unit / DAY)
    return true
  }],
  // 5pm, 9:30am, at 10 a.m.
  [/\b(?:at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/i, (m, w) => setClock(w, num(m[1]), m[2] ? num(m[2]) : 0, m[3])],
  [/\b(?:at\s+)?(noon|midday|midnight)\b/i, (m, w) => setClock(w, m[1].toLowerCase() === 'midnight' ? 0 : 12, 0, undefined, true)],
  // tomorrow, today, tonight, tomorrow morning
  [/\b(tomorrow|tmrw|tmr|today|tonight)\b(?:\s+(morning|afternoon|evening|night))?/i, (m, w) => {
    const word = m[1].toLowerCase()
    w.dayOffset = word === 'today' || word === 'tonight' ? 0 : 1
    w.saidTomorrow = w.dayOffset === 1
    const part = m[2]?.toLowerCase() ?? (word === 'tonight' ? 'tonight' : undefined)
    if (part) w.partHour = PART_OF_DAY[part]
    return true
  }],
  [/\b(?:this|in the)\s+(morning|afternoon|evening)\b/i, (m, w) => {
    w.partHour = PART_OF_DAY[m[1].toLowerCase()]
    return true
  }],
  // on Friday, next Monday, this Thursday evening
  [/\b(?:on\s+)?(?:(next|this|coming)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b(?:\s+(morning|afternoon|evening|night))?/i, (m, w) => {
    w.weekday = { day: WEEKDAYS.indexOf(m[2].toLowerCase()), strict: m[1]?.toLowerCase() === 'next' }
    if (m[3]) w.partHour = PART_OF_DAY[m[3].toLowerCase()]
    return true
  }],
  // Abbreviations only after on/next/this: "sat" and "sun" are ordinary words too.
  [/\b(on|next|this)\s+(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b\.?/i, (m, w) => {
    w.weekday = { day: WEEKDAY_ABBR[m[2].toLowerCase()], strict: m[1].toLowerCase() === 'next' }
    return true
  }],
  [/\bnext\s+week\b/i, (_m, w) => {
    w.weekday = { day: 1, strict: true }
    return true
  }],
  // at 9, at 14:00, at 9:30
  [/\bat\s+(\d{1,2})(?::(\d{2}))?(?![\d:])(?!\s*(?:%|percent|min|minutes?|hours?|hrs?|days?|weeks?|times?|people|items?|tasks?))/i, (m, w) =>
    setClock(w, num(m[1]), m[2] ? num(m[2]) : 0, undefined, num(m[1]) >= 13 || m[1].startsWith('0'))],
  // bare 14:30 or 9:30
  [/\b([01]?\d|2[0-3]):([0-5]\d)\b/, (m, w) => setClock(w, num(m[1]), num(m[2]), undefined, num(m[1]) >= 13 || m[1].startsWith('0'))],
]

// ---------- clock arithmetic in the owner's local time ----------

function localDay(nowMs: number, tz: number): YMD & { dow: number } {
  const local = new Date(nowMs + tz * MINUTE)
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate(), dow: local.getUTCDay() }
}

function localHour(nowMs: number, tz: number): number {
  return new Date(nowMs + tz * MINUTE).getUTCHours()
}

function addDays(day: YMD, n: number): YMD {
  const t = new Date(Date.UTC(day.y, day.m, day.d + n))
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() }
}

function toMs(day: YMD, hour: number, minute: number, tz: number): number {
  return Date.UTC(day.y, day.m, day.d, hour, minute) - tz * MINUTE
}

/** Hour of day for the phrase; `ambiguous` when "at 5" could be 05:00 or 17:00 and nothing else decides it. */
function clockOf(w: When, dayGiven: boolean): { hour: number; minute: number; ambiguous: boolean } {
  const minute = w.minute ?? 0
  if (w.hour === undefined) return { hour: w.partHour ?? DEFAULT_HOUR, minute: 0, ambiguous: false }
  const h = w.hour
  if (w.meridiem) return { hour: (h % 12) + (w.meridiem === 'pm' ? 12 : 0), minute, ambiguous: false }
  if (w.h24 || h === 0 || h >= 12) return { hour: h, minute, ambiguous: false }
  if (w.partHour !== undefined) return { hour: w.partHour >= 12 ? h + 12 : h, minute, ambiguous: false }
  // With a day named, "at 5" is an afternoon and "at 9" a morning: the way people book things.
  if (dayGiven) return { hour: h <= 6 ? h + 12 : h, minute, ambiguous: false }
  return { hour: h, minute, ambiguous: true }
}

function resolve(w: When, nowMs: number, tz: number): number | null {
  if (w.absoluteMs !== undefined) return w.absoluteMs
  const timeGiven = w.hour !== undefined || w.partHour !== undefined
  if (w.offsetMs !== undefined) {
    if (w.offsetDays === undefined || !timeGiven) return nowMs + w.offsetMs
    w.dayOffset = w.offsetDays // "in 3 days at 10am"
  }
  const dayGiven = w.date !== undefined || w.dayOffset !== undefined || w.weekday !== undefined
  if (!dayGiven && !timeGiven) return null

  const today = localDay(nowMs, tz)
  const { hour, minute, ambiguous } = clockOf(w, dayGiven)
  if (w.date) return resolveDate(w.date, today, hour, minute, nowMs, tz)
  if (w.weekday) {
    const ahead = (w.weekday.day - today.dow + 7) % 7
    const first = toMs(addDays(today, ahead === 0 && w.weekday.strict ? 7 : ahead), hour, minute, tz)
    return first > nowMs ? first : first + 7 * DAY
  }
  if (w.dayOffset !== undefined) {
    // Before 04:00, "tomorrow" means the coming day the speaker has not slept through yet: today's date.
    const offset = w.saidTomorrow && localHour(nowMs, tz) < EARLY_HOURS_END ? 0 : w.dayOffset
    const due = toMs(addDays(today, offset), hour, minute, tz)
    // "tonight" said after 20:00 has nothing left to aim at; an hour from now is the honest reading.
    if (due <= nowMs && w.dayOffset === 0 && w.hour === undefined) return nowMs + HOUR
    return due
  }
  return nextOccurrence(today, hour, minute, ambiguous, nowMs, tz)
}

/** A time with no day: today if still ahead, otherwise tomorrow. "at 5" means 17:00 when 05:00 has passed. */
function nextOccurrence(today: YMD, hour: number, minute: number, ambiguous: boolean, nowMs: number, tz: number): number {
  const candidates = ambiguous ? [hour, hour + 12] : [hour]
  for (const h of candidates) {
    const t = toMs(today, h, minute, tz)
    if (t > nowMs) return t
  }
  return toMs(addDays(today, 1), hour, minute, tz)
}

/** A calendar date; without a year, the next time that date comes round. */
function resolveDate(date: YMD, today: YMD, hour: number, minute: number, nowMs: number, tz: number): number | null {
  if (!Number.isNaN(date.y)) return validDate(date.y, date.m, date.d) ? toMs(date, hour, minute, tz) : null
  for (const y of [today.y, today.y + 1]) {
    if (!validDate(y, date.m, date.d)) continue
    const t = toMs({ y, m: date.m, d: date.d }, hour, minute, tz)
    if (t > nowMs) return t
  }
  return null
}

// ---------- the reminder text ----------

const LEAD =
  /^(?:(?:hey|ok|okay)\s+)?(?:jarvis\s*[,:]?\s*)?(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:remind\s+me|set\s+(?:a\s+|an\s+)?(?:reminder|alarm)|add\s+(?:a\s+)?reminder|reminder|don'?t\s+let\s+me\s+forget|make\s+sure\s+i)\b\s*(?:(?:to|that|about|of|for)\b|:)?\s*/i

function cleanText(work: string): string {
  const trimPunct = (s: string) => s.replace(/^[\s,.;:!-]+|[\s,;:!-]+$/g, '')
  let t = trimPunct(work.replace(/\s+/g, ' '))
  t = t.replace(LEAD, '')
  t = t.replace(/^(?:to|that|about|for|of)\s+/i, '')
  t = t.replace(/\s+(?:please)$/i, '').replace(/(?:\s+(?:on|at|by|for|in|from))+$/i, '')
  return trimPunct(t.replace(/\s+([,.;:!?])/g, '$1')) || 'Reminder'
}

/**
 * Finds the due time in a sentence such as "remind me tomorrow at 9 to review batch one" and returns the
 * reminder text without the time phrase. Times are wall-clock times at UTC offset `tzOffsetMinutes`
 * (e.g. 330 for India, -420 for California in summer). Returns null when no time is stated.
 */
export function parseReminder(text: string, now: Date, tzOffsetMinutes = 0): { text: string; dueAt: string } | null {
  const w: When = {}
  let work = ` ${String(text ?? '')} `
  for (const [pattern, apply] of EXTRACTORS) {
    const m = work.match(pattern)
    if (m && m.index !== undefined && apply(m, w)) work = `${work.slice(0, m.index)} ${work.slice(m.index + m[0].length)}`
  }
  const dueMs = resolve(w, now.getTime(), tzOffsetMinutes)
  if (dueMs === null || !Number.isFinite(dueMs)) return null
  return { text: cleanText(work), dueAt: new Date(dueMs).toISOString() }
}

/** Reminders that should fire now, oldest first. */
export function due(reminders: Reminder[], now: Date): Reminder[] {
  const t = now.getTime()
  return reminders
    .filter(r => (r.status === 'pending' || r.status === 'scheduled') && Number.isFinite(Date.parse(r.dueAt)) && Date.parse(r.dueAt) <= t)
    .sort((a, b) => timeOf(a.dueAt) - timeOf(b.dueAt))
}

export function createReminder(text: string, dueAt: string, now: Date, id?: string): Reminder {
  const dueMs = Date.parse(dueAt)
  if (!Number.isFinite(dueMs)) throw new Error(`invalid due time: ${dueAt}`)
  return {
    id: id ?? newId('rem', now),
    text: redact(text.trim()) || 'Reminder',
    dueAt: new Date(dueMs).toISOString(),
    createdAt: now.toISOString(),
    status: 'pending',
    channels: ['page', 'speech', 'push'],
  }
}
