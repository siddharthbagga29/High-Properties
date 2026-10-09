/** Shared fixtures for the Jarvis tests: the real export, a fake database and a conversation environment. */
import type { ChatMessage, ChatOptions, Viewer } from '@jarvis/types'
import type { GraphState } from '../data/types'
import type { Focus } from '../store'
import type { ConvEnv } from './conversation'
import { createFakeDb, type FakeDb } from './fake-db'
import { createOwnerData, type OwnerData } from './owner-data'
import { readReminder } from './reminders'
import { readDecision, readRequest } from './requests'
import { readAudit } from './scorecards'
import type { Target } from './targets'
import { cityRegistry } from './tools'
import type { Proposal } from './types'

export const UID = 'u_testowner0000000000000'

export interface TestEnv {
  env: ConvEnv
  db: FakeDb
  data: OwnerData | null
  went: Target[]
  chats: ChatMessage[][]
  proposal: () => Proposal | null
  audit: ReturnType<typeof cityRegistry>['audit']
}

/** Owner rows as the page would hold them, read straight from the fake database. */
export function rowsFrom(db: FakeDb, uid = UID) {
  const under = (name: string) => [...db.docs.entries()].filter(([k]) => k.startsWith(`data/users/${uid}/jarvis/${name}/`))
  return {
    reminders: under('jarvis-reminders').map(([k, v]) => readReminder(k.split('/').pop()!, v)!).filter(Boolean),
    requests: under('jarvis-requests').map(([k, v]) => readRequest(k.split('/').pop()!, v)!).filter(Boolean),
    decisions: under('jarvis-decisions').map(([k, v]) => readDecision(k.split('/').pop()!, v)!).filter(Boolean),
  }
}

export function makeEnv(opts: { viewer: Viewer; now: Date; tz?: number; state: GraphState; focus?: Focus; withData?: boolean; sinceIso?: string | null; chat?: (m: ChatMessage[], o: ChatOptions) => Promise<{ text: string; provider?: string }> }): TestEnv {
  const state = opts.state
  const db = createFakeDb()
  const data = opts.viewer === 'owner' && opts.withData !== false ? createOwnerData(db, UID, { sleep: async () => undefined }) : null
  const went: Target[] = []
  let focus: Focus = opts.focus ?? { kind: 'world' }
  let proposal: Proposal | null = null
  const chats: ChatMessage[][] = []
  const { registry, audit } = cityRegistry({
    state: () => state,
    go: t => { went.push(t); if (t.kind === 'focus') focus = t.focus; return true },
    data,
    requests: () => rowsFrom(db).requests,
    reminders: () => rowsFrom(db).reminders,
    now: () => opts.now,
  })
  const env: ConvEnv = {
    viewer: opts.viewer,
    now: () => opts.now,
    tz: opts.tz ?? 0,
    state: () => state,
    focus: () => focus,
    audit: () => readAudit(state),
    sinceIso: () => opts.sinceIso ?? null,
    owner: () => (data ? rowsFrom(db) : null),
    registry,
    proposal: { get: () => proposal, set: p => { proposal = p } },
    chat: opts.chat ?? (async m => { chats.push(m); return { text: 'model answer', provider: 'sample' } }),
    history: () => [],
  }
  return { env, db, data, went, chats, proposal: () => proposal, audit }
}
