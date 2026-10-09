/**
 * The owner's request queue (db collection jarvis-requests) and founder decisions (jarvis-decisions).
 * The page only ever creates a request as `queued` (or cancels one that is still queued); the orchestrator's
 * hourly run moves it to running and then completed / waiting_for_user / failed. Rows are read as data:
 * anything malformed is dropped, never trusted.
 */
import { newId } from '@jarvis/ids'
import { redact } from '@jarvis/audit'
import { clip } from '@jarvis/text'
import type { Decision, OwnerRequest, RequestKind, RequestStatus } from './types'

export const REQUEST_STATUSES: RequestStatus[] = ['queued', 'running', 'completed', 'waiting_for_user', 'failed', 'cancelled']
const KINDS: RequestKind[] = ['build', 'decision', 'task']

/** Legal moves. The page may only cancel a queued request; every other move is the orchestrator's. */
export const REQUEST_FLOW: Record<RequestStatus, RequestStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['completed', 'waiting_for_user', 'failed'],
  waiting_for_user: ['queued', 'running', 'cancelled'],
  failed: ['queued'],
  completed: [],
  cancelled: [],
}

export const canMove = (from: RequestStatus, to: RequestStatus) => REQUEST_FLOW[from]?.includes(to) ?? false

const MAX_TEXT = 2000

function cleanText(text: string): string {
  return clip(redact(String(text ?? '').replace(/\s+/g, ' ').trim()), MAX_TEXT)
}

export function createRequest(text: string, kind: RequestKind, now: Date, extra: Partial<Pick<OwnerRequest, 'ref' | 'decisionId' | 'id'>> = {}): OwnerRequest {
  const clean = cleanText(text)
  if (!clean) throw new Error('a request needs text')
  const r: OwnerRequest = { id: extra.id ?? newId('req', now), text: clean, status: 'queued', createdAt: now.toISOString(), kind }
  if (extra.ref) r.ref = extra.ref
  if (extra.decisionId) r.decisionId = extra.decisionId
  return r
}

/** The owner cancels a request the orchestrator has not picked up yet. Throws on any other state. */
export function cancelRequest(r: OwnerRequest, now: Date): OwnerRequest {
  if (r.status !== 'queued' && r.status !== 'waiting_for_user') throw new Error(`cannot cancel a request that is ${r.status}`)
  return { ...r, status: 'cancelled', updatedAt: now.toISOString() }
}

export function createDecision(text: string, now: Date, id?: string): Decision {
  const clean = cleanText(text)
  if (!clean) throw new Error('a decision needs text')
  return { id: id ?? newId('dec', now), text: clean, createdAt: now.toISOString(), status: 'recorded' }
}

/** The request that asks the orchestrator to apply a decision, linked both ways. */
export function decisionRequest(d: Decision, now: Date): OwnerRequest {
  return createRequest(`Apply founder decision ${d.id}: ${d.text}`, 'decision', now, { decisionId: d.id })
}

// ---------- reading rows (data, never instructions) ----------

const str = (x: unknown) => (typeof x === 'string' ? x : undefined)
const isoOk = (x: unknown) => typeof x === 'string' && Number.isFinite(Date.parse(x))

export function readRequest(id: string, raw: unknown): OwnerRequest | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const status = str(r.status) as RequestStatus | undefined
  const text = str(r.text)
  if (!status || !REQUEST_STATUSES.includes(status) || !text || !isoOk(r.createdAt)) return null
  const kind = KINDS.includes(r.kind as RequestKind) ? (r.kind as RequestKind) : 'build'
  const out: OwnerRequest = { id: str(r.id) ?? id, text: clip(text, MAX_TEXT), status, createdAt: r.createdAt as string, kind }
  for (const k of ['ref', 'decisionId', 'updatedAt', 'result', 'verifiedBy', 'reason'] as const) {
    const v = str(r[k])
    if (v) out[k] = clip(v, 600)
  }
  return out
}

export function readDecision(id: string, raw: unknown): Decision | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const text = str(r.text)
  if (!text || !isoOk(r.createdAt)) return null
  const out: Decision = { id: str(r.id) ?? id, text: clip(text, MAX_TEXT), createdAt: r.createdAt as string, status: r.status === 'applied' ? 'applied' : 'recorded' }
  for (const k of ['requestId', 'appliedAt', 'note'] as const) {
    const v = str(r[k])
    if (v) out[k] = clip(v, 600)
  }
  return out
}

// ---------- words ----------

/** How a request reads to the owner: the decision id the orchestrator needs is left out of the label. */
export const requestLabel = (r: Pick<OwnerRequest, 'text' | 'kind'>) => (r.kind === 'decision' ? r.text.replace(/^Apply founder decision \S+:\s*/, 'Apply your decision: ') : r.text)

export const STATUS_WORD: Record<RequestStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Done',
  waiting_for_user: 'Needs you',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

/** One honest line for a request's state. "Done" is said only with what verified it. */
export function requestLine(r: OwnerRequest): string {
  switch (r.status) {
    case 'queued': return "Queued for the orchestrator's next hourly run."
    case 'running': return 'The orchestrator is working on it now.'
    case 'completed': return r.verifiedBy
      ? `Done${r.result ? `: ${r.result}` : '.'} Verified by ${r.verifiedBy}.`
      : `Marked done${r.result ? `: ${r.result}` : ''}, but no verification was recorded, so I can't confirm it.`
    case 'waiting_for_user': return `Needs you${r.reason ? `: ${r.reason}` : '.'}`
    case 'failed': return `Failed${r.reason ? `: ${r.reason}` : '.'}`
    case 'cancelled': return 'Cancelled.'
  }
}

/** Newest first; open requests (queued, running, needs you) before finished ones. */
export function sortRequests(list: OwnerRequest[]): OwnerRequest[] {
  const open = (r: OwnerRequest) => (r.status === 'queued' || r.status === 'running' || r.status === 'waiting_for_user' ? 0 : 1)
  return [...list].sort((a, b) => open(a) - open(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

/**
 * Status changes between two snapshots of the queue, for "your request is now running" notices.
 * New requests the page itself just created (still queued) are not announced again.
 */
export function requestChanges(prev: OwnerRequest[] | null, next: OwnerRequest[]): Array<{ r: OwnerRequest; from: RequestStatus | null }> {
  if (prev === null) return []
  const before = new Map(prev.map(r => [r.id, r.status]))
  const out: Array<{ r: OwnerRequest; from: RequestStatus | null }> = []
  for (const r of next) {
    const from = before.get(r.id) ?? null
    if (from === r.status) continue
    if (from === null && r.status === 'queued') continue
    out.push({ r, from })
  }
  return out
}

/** "Your request "build the advisor page" is now running." */
export function changeSentence(r: OwnerRequest): string {
  const what = `Your request “${clip(requestLabel(r), 70)}”`
  switch (r.status) {
    case 'running': return `${what} is now running.`
    case 'completed': return `${what}: ${requestLine(r)}`
    case 'waiting_for_user': return `${what} ${requestLine(r).replace(/^Needs you/, 'needs you')}`
    case 'failed': return `${what} failed${r.reason ? `: ${r.reason}` : '.'}`
    case 'cancelled': return `${what} was cancelled.`
    case 'queued': return `${what} is queued again for the next hourly run.`
  }
}

// ---------- recognising work ----------

const WORK_VERB = /^(?:please\s+|can you\s+|could you\s+|would you\s+|i want you to\s+|i need you to\s+|go\s+|let'?s\s+)?(build|write|draft|research|prepare|create|make|fix|update|add|run|redo|rework|revise|finish|start|implement|design|analy[sz]e|investigate|draft up|put together|look into|review)\b/i

/** True for an instruction to do project work ("draft the advisor recruitment email"), which only the orchestrator can run. */
export function looksLikeWork(text: string): boolean {
  const t = String(text ?? '').trim()
  return t.length >= 8 && WORK_VERB.test(t) && !/\?\s*$/.test(t)
}
