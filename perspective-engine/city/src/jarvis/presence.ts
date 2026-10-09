/**
 * The compact Jarvis presence line: Online/Offline · Currently · Completed (since last visit) · Needs you · Next.
 * Pure and counted from the record and the owner's rows, so it can never run ahead of the data.
 */
import { peEvents, peProjectState, type PEState } from '@jarvis/adapters/perspective-engine'
import type { Reminder, Viewer } from '@jarvis/types'
import { statusesAt, workingNow } from '../data/model'
import type { GraphState } from '../data/types'
import type { Source } from '../store'
import type { OwnerRequest } from './types'

const asPE = (s: GraphState) => s as unknown as PEState
const DAY_MS = 86_400_000

/** Reminders due now (same rule as the core's due(); kept here so the reminder parser stays out of first paint). */
export const dueNow = (list: Reminder[], now: number) => list.filter(r => (r.status === 'pending' || r.status === 'scheduled') && Date.parse(r.dueAt) <= now)

/** Verified completions after `sinceIso` (or in the last day), counted the way the core's sinceLast() counts them. */
export function completedSince(events: Array<{ t: string; kind: string }>, sinceIso: string | null, now: number): number {
  const parsed = sinceIso ? Date.parse(sinceIso) : NaN
  const start = Number.isFinite(parsed) ? parsed : now - DAY_MS
  return events.filter(e => e.kind === 'done' && Date.parse(e.t) > start && Date.parse(e.t) <= now).length
}

export type JarvisStatus = 'booting' | 'ready' | 'failed'

export interface PresenceInput {
  data: GraphState | null
  source: Source
  status: JarvisStatus
  viewer: Viewer
  sinceIso: string | null
  now: number
  requests: OwnerRequest[]
  reminders: Reminder[]
}

export interface Presence {
  online: 'online' | 'offline' | 'starting'
  onlineLabel: string
  onlineTitle: string
  currently: string
  completed: number
  completedLabel: string
  needs: number
  needsLabel: string
  next: string | null
  nextTitle: string | null
}

export function presence(p: PresenceInput): Presence {
  const owner = p.viewer === 'owner'
  const online: Presence['online'] = p.status === 'failed' || p.source === 'offline' ? 'offline' : p.status === 'booting' || !p.data ? 'starting' : 'online'
  const onlineTitle = online === 'offline'
    ? p.status === 'failed' ? 'Jarvis could not start in this view; the city still works.' : 'The project record could not be reached.'
    : online === 'starting' ? 'Jarvis is starting.'
    : p.source === 'live' ? 'Jarvis is running in this page and reading the live project database.' : 'Jarvis is running in this page and reading the published snapshot.'
  const base: Presence = {
    online,
    onlineLabel: online === 'online' ? 'Online' : online === 'offline' ? 'Offline' : 'Starting',
    onlineTitle,
    currently: '—',
    completed: 0,
    completedLabel: owner && p.sinceIso ? 'since your last visit' : 'in the last day',
    needs: 0,
    needsLabel: owner ? 'Needs you' : 'Waiting on founder',
    next: null,
    nextTitle: null,
  }
  if (!p.data) return base
  const now = new Date(p.now)
  const pe = asPE(p.data)
  const ps = peProjectState(pe, now)
  const working = workingNow(p.data, statusesAt(p.data, null), p.now)
  const name = (k: string) => p.data!.agents[k]?.name ?? k
  const running = owner ? p.requests.filter(r => r.status === 'running') : []
  base.currently = working.length
    ? `${name(working[0].agent)} on ${working[0].node.id}${working.length > 1 ? ` +${working.length - 1}` : ''}`
    : running.length ? 'Your request' : 'Nobody working'
  base.completed = completedSince(peEvents(pe), owner ? p.sinceIso : null, p.now)
  base.needs = ps.waiting_for_user.length + (owner ? p.requests.filter(r => r.status === 'waiting_for_user').length + dueNow(p.reminders, p.now).length : 0)
  base.next = ps.next[0]?.id ?? null
  base.nextTitle = ps.next[0]?.title ?? null
  return base
}
