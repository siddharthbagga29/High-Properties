/**
 * Reminders in the page: parse with the core, confirm honestly, and announce the ones that fall due while the
 * page is open. The push to the founder's phone is the orchestrator's job (hourly), never claimed here as done.
 */
import { createReminder, due, parseReminder } from '@jarvis/reminders'
import type { Reminder } from '@jarvis/types'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const HOUR_MS = 3_600_000

/** "Thu 9:00" in the owner's local time; with the date when it is a week or more away ("Thu 22 Oct 9:00"). */
export function whenLabel(dueIso: string, now: Date, tzOffsetMinutes: number): string {
  const t = Date.parse(dueIso)
  const local = new Date(t + tzOffsetMinutes * 60_000)
  const time = `${local.getUTCHours()}:${String(local.getUTCMinutes()).padStart(2, '0')}`
  const today = new Date(now.getTime() + tzOffsetMinutes * 60_000)
  const dayMs = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const days = Math.round((dayMs(local) - dayMs(today)) / 86_400_000)
  if (days === 0) return `today ${time}`
  const day = DAYS[local.getUTCDay()]
  return days >= 7 || days < 0 ? `${day} ${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} ${time}` : `${day} ${time}`
}

export type ReminderPlan =
  | { ok: true; reminder: Reminder; text: string; spoken: string }
  | { ok: false; text: string }

/**
 * "remind me tomorrow at 9 to review batch one" → a pending reminder and the honest confirmation that goes with it.
 * Nothing is saved here; the caller writes the reminder and only then says the confirmation.
 */
export function planReminder(sentence: string, now: Date, tzOffsetMinutes: number, id?: string): ReminderPlan {
  const parsed = parseReminder(sentence, now, tzOffsetMinutes)
  if (!parsed) return { ok: false, text: 'When should I remind you? For example: “remind me tomorrow at 9 to review batch one”.' }
  if (Date.parse(parsed.dueAt) <= now.getTime()) return { ok: false, text: 'That time has already passed. When should I remind you?' }
  const reminder = createReminder(parsed.text, parsed.dueAt, now, id)
  return { ok: true, reminder, ...confirmation(reminder, now, tzOffsetMinutes) }
}

/** Written and spoken confirmation, said only after the reminder was saved and read back. */
export function confirmation(r: Reminder, now: Date, tzOffsetMinutes: number): { text: string; spoken: string } {
  const when = whenLabel(r.dueAt, now, tzOffsetMinutes)
  const soon = Date.parse(r.dueAt) - now.getTime() < HOUR_MS
  const phone = soon
    ? "It's due before the next hourly check, so your phone may get it late; I'll show and say it here if this page is open."
    : "I'll show it here when it's due; your phone gets it after the hourly check schedules it."
  return {
    text: `Reminder set for ${when}: ${r.text}. ${phone}`,
    spoken: `Reminder set for ${when}. ${soon ? 'Your phone may get it late; I will say it here if the page is open.' : "I'll show it here when it's due."}`,
  }
}

/** Reminders that are due now and have not been announced in this page yet, oldest first. */
export function dueToAnnounce(reminders: Reminder[], announced: ReadonlySet<string>, now: Date): Reminder[] {
  return due(reminders, now).filter(r => !announced.has(r.id))
}

const STATUSES: Reminder['status'][] = ['pending', 'scheduled', 'delivered', 'dismissed']
const CHANNELS: Reminder['channels'][number][] = ['page', 'speech', 'push', 'mac']

/** A reminder row read as data; null when malformed. */
export function readReminder(id: string, raw: unknown): Reminder | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.text !== 'string' || typeof r.dueAt !== 'string' || !Number.isFinite(Date.parse(r.dueAt))) return null
  const status = STATUSES.includes(r.status as Reminder['status']) ? (r.status as Reminder['status']) : 'pending'
  const channels: Reminder['channels'] = Array.isArray(r.channels) ? (r.channels.filter(c => CHANNELS.includes(c as Reminder['channels'][number])) as Reminder['channels']) : ['page']
  return {
    id: typeof r.id === 'string' ? r.id : id,
    text: r.text.slice(0, 600),
    dueAt: r.dueAt,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : r.dueAt,
    status,
    channels,
  }
}

/** Upcoming first, then due, then delivered/dismissed. */
export function sortReminders(list: Reminder[]): Reminder[] {
  const rank = (r: Reminder) => (r.status === 'pending' || r.status === 'scheduled' ? 0 : 1)
  return [...list].sort((a, b) => rank(a) - rank(b) || Date.parse(a.dueAt) - Date.parse(b.dueAt))
}
