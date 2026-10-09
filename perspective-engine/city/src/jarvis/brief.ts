/**
 * The greeting and briefing, from the core's briefing() and sinceLast() over the record's events.
 * Every number is counted from the export; nothing is estimated.
 */
import { peContext, peEvents, peProjectState, type PEState } from '@jarvis/adapters/perspective-engine'
import { briefing, sinceLast, type Briefing, type SinceLast } from '@jarvis/briefing'
import type { Viewer } from '@jarvis/types'
import type { GraphState } from '../data/types'
import { localMinutes } from './prefs'

export interface Brief extends Briefing {
  since: SinceLast
  /** Greeting plus every line, for the thread. */
  text: string
}

export function composeBrief(state: GraphState, viewer: Viewer, sinceIso: string | null, now: Date, tzOffsetMinutes: number): Brief {
  const pe = state as unknown as PEState
  const since = sinceLast(peEvents(pe), viewer === 'owner' ? sinceIso : null, now)
  const ctx = { ...peContext(pe, viewer), projectState: peProjectState(pe, now) }
  const b = briefing(ctx, { greetingHour: Math.floor(localMinutes(now, tzOffsetMinutes) / 60), since })
  return { ...b, since, text: [b.greeting, ...b.lines].join(' ') }
}
