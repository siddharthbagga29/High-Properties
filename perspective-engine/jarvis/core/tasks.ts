import { newId } from './ids'
import { capitalize, joinClauses, numberWord, plural } from './text'
import type { JarvisTask, TaskAction, TaskStatus } from './types'

/** Legal moves of the task state machine. completed and cancelled are final; failed may be re-queued. */
export const ALLOWED: Record<TaskStatus, TaskStatus[]> = {
  queued: ['planning', 'running', 'waiting_for_user', 'blocked', 'cancelled'],
  planning: ['queued', 'running', 'waiting_for_user', 'blocked', 'failed', 'cancelled'],
  running: ['waiting_for_user', 'blocked', 'completed', 'failed', 'cancelled'],
  waiting_for_user: ['queued', 'planning', 'running', 'blocked', 'cancelled'],
  blocked: ['queued', 'planning', 'running', 'waiting_for_user', 'failed', 'cancelled'],
  completed: [],
  failed: ['queued'],
  cancelled: [],
}

export interface TransitionOptions {
  verifiedBy?: string
  requiredUserInput?: string
  error?: string
  result?: unknown
}

export type NewTask = Pick<JarvisTask, 'title' | 'source'> & Partial<JarvisTask>

export function createTask(p: NewTask, now: Date, id?: string): JarvisTask {
  const task: JarvisTask = {
    ...p,
    id: id ?? p.id ?? newId('task', now),
    status: p.status ?? 'queued',
    priority: p.priority ?? 'normal',
    createdAt: p.createdAt ?? now.toISOString(),
    actions: p.actions ? [...p.actions] : [],
  }
  if (task.status === 'completed' && !task.verifiedBy?.trim()) throw new Error(`cannot create ${task.id} as completed without verifiedBy`)
  return task
}

/** Returns a new task in state `to`. Completion is refused unless something verified it. */
export function transition(t: JarvisTask, to: TaskStatus, now: Date, note?: string, opts: TransitionOptions = {}): JarvisTask {
  if (!ALLOWED[t.status]?.includes(to)) throw new Error(`invalid transition ${t.status}->${to}`)
  const verifiedBy = opts.verifiedBy?.trim() || t.verifiedBy?.trim()
  if (to === 'completed' && !verifiedBy) throw new Error(`cannot complete ${t.id} without verifiedBy`)

  const at = now.toISOString()
  const next: JarvisTask = { ...t, status: to }
  if (to === 'running' && !t.startedAt) next.startedAt = at
  if (to === 'completed') Object.assign(next, { completedAt: at, verifiedBy })
  if (to === 'waiting_for_user') next.requiredUserInput = opts.requiredUserInput ?? t.requiredUserInput
  else delete next.requiredUserInput
  if (to === 'queued' && t.status === 'failed') delete next.error
  if (opts.error !== undefined) next.error = opts.error
  if (opts.result !== undefined) next.result = opts.result

  next.actions = [...t.actions, statusAction(t.status, to, at, note, verifiedBy)]
  return next
}

function statusAction(from: TaskStatus, to: TaskStatus, at: string, note: string | undefined, verifiedBy: string | undefined): TaskAction {
  const detail = note ? `: ${note}` : ''
  if (to === 'completed') return { at, kind: 'verify', summary: `${from} -> completed (verified by ${verifiedBy})${detail}`, ok: true }
  if (to === 'failed') return { at, kind: 'error', summary: `${from} -> failed${detail}`, ok: false }
  return { at, kind: 'status', summary: `${from} -> ${to}${detail}` }
}

export function addAction(t: JarvisTask, a: Omit<TaskAction, 'at'>, now: Date): JarvisTask {
  return { ...t, actions: [...t.actions, { ...a, at: now.toISOString() }] }
}

// ---------- summary sentence ----------

export interface TaskCounts { completed: number; running: number; waiting: number; blocked: number; failed: number; queued: number }
export interface TaskSummary extends TaskCounts { sentence: string }

const BUCKET: Partial<Record<TaskStatus, keyof TaskCounts>> = {
  completed: 'completed',
  running: 'running',
  planning: 'running',
  waiting_for_user: 'waiting',
  blocked: 'blocked',
  failed: 'failed',
  queued: 'queued',
}

export function summarize(tasks: JarvisTask[]): TaskSummary {
  const counts: TaskCounts = { completed: 0, running: 0, waiting: 0, blocked: 0, failed: 0, queued: 0 }
  for (const t of tasks) {
    const bucket = BUCKET[t.status]
    if (bucket) counts[bucket]++
  }
  return { ...counts, sentence: countsSentence(counts) }
}

type Clause = (n: number, subject: string) => string

/** Order of clauses in the sentence; what needs the owner always comes last, as the call to action. */
const CLAUSES: Array<[keyof TaskCounts, Clause]> = [
  ['completed', (n, s) => `${s} ${plural(n, 'is', 'are')} complete`],
  ['running', (n, s) => `${s} ${plural(n, 'is', 'are')} running`],
  ['queued', (n, s) => `${s} ${plural(n, 'is', 'are')} queued`],
  ['blocked', (n, s) => `${s} ${plural(n, 'is', 'are')} blocked`],
  ['failed', (_n, s) => `${s} failed`],
  ['waiting', n => `I need your decision on ${numberWord(n)} ${plural(n, 'item', 'items')}`],
]

/** "Three things are complete, one is running, and I need your decision on one item." */
export function countsSentence(c: TaskCounts): string {
  const clauses: string[] = []
  for (const [key, clause] of CLAUSES) {
    const n = c[key]
    if (n <= 0) continue
    // Only the first clause names its subject ("three things"); the rest read as "one is running".
    const subject = clauses.length === 0 ? `${numberWord(n)} ${plural(n, 'thing', 'things')}` : numberWord(n)
    clauses.push(clause(n, subject))
  }
  return clauses.length ? `${capitalize(joinClauses(clauses))}.` : 'Nothing is in progress.'
}
