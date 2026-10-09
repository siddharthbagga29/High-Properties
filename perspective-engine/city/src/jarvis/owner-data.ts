/**
 * The owner's private Jarvis data in the artifact database, under data/users/<id>/ (private to that viewer by
 * platform rule; the page's rules also limit writes to the owner):
 *
 *   data/users/<id>/jarvis-prefs                       document: last visit, voice, quiet hours
 *   data/users/<id>/jarvis/jarvis-reminders/<rid>      reminders (the orchestrator schedules the push)
 *   data/users/<id>/jarvis/jarvis-requests/<qid>       requests for the orchestrator's next hourly run
 *   data/users/<id>/jarvis/jarvis-decisions/<did>      founder decisions
 *   data/users/<id>/jarvis/jarvis-tasks/<tid>          Jarvis's own actions, completed only when checked
 *   data/users/<id>/jarvis/jarvis-memory/<mid>         decision and preference memory
 *
 * Collections sit under the document data/users/<id>/jarvis because the db grammar needs an odd number of
 * segments for a collection (ArtifactData: collection "data/users/me/jarvis/jarvis-requests").
 * Only ever constructed in owner mode with a real id: visitors never get an instance.
 */
import type { JarvisTask, MemoryItem, MemoryStore, Reminder } from '@jarvis/types'
import { readPrefs, type JarvisPrefs } from './prefs'
import { readReminder } from './reminders'
import { readDecision, readRequest } from './requests'
import type { Decision, OwnerRequest } from './types'

// ---------- the slice of the db capability this module uses (see db.d.ts) ----------

export interface DocSnapLike { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
export interface QuerySnapLike { docs: DocSnapLike[] }
export interface DbErrorLike { code?: string; message?: string }
export interface QueryLike {
  orderBy(field: string, dir?: 'asc' | 'desc'): QueryLike
  limit(n: number): QueryLike
  get(): Promise<QuerySnapLike>
  onSnapshot(next: (s: QuerySnapLike) => void, error?: (e: DbErrorLike) => void): () => void
}
export interface CollRefLike extends QueryLike { path: string; doc(id?: string): DocRefLike }
export interface DocRefLike {
  id: string
  path: string
  get(): Promise<DocSnapLike>
  set(data: Record<string, unknown>): Promise<void>
  update(data: Record<string, unknown>): Promise<void>
  delete(): Promise<void>
  onSnapshot(next: (s: DocSnapLike) => void, error?: (e: DbErrorLike) => void): () => void
  collection(path: string): CollRefLike
}
export interface DbLike { doc(path: string): DocRefLike; collection(path: string): CollRefLike }

export const COLLECTIONS = {
  tasks: 'jarvis-tasks',
  reminders: 'jarvis-reminders',
  requests: 'jarvis-requests',
  decisions: 'jarvis-decisions',
  memory: 'jarvis-memory',
} as const
export type CollectionKey = keyof typeof COLLECTIONS

const SEGMENT = /^(?!\.\.?$)[A-Za-z0-9_\-.~:@+]{1,200}$/

export function ownerPaths(uid: string) {
  if (!SEGMENT.test(uid)) throw new Error('not a usable viewer id')
  const root = `data/users/${uid}`
  return {
    root,
    prefs: `${root}/jarvis-prefs`,
    home: `${root}/jarvis`,
    collection: (k: CollectionKey) => `${root}/jarvis/${COLLECTIONS[k]}`,
  }
}

/** A database refusal in plain words for the owner. */
export function dbErrorText(e: unknown): string {
  const code = (e as DbErrorLike | null)?.code
  switch (code) {
    case 'invalid_argument': return "this view isn't allowed to write your private data"
    case 'quota_exceeded': return "the page's database is full"
    case 'resource_exhausted': return 'too many database calls at once; try again in a moment'
    case 'revoked': case 'not_granted': case 'capability_disabled': case 'capability_removed': return 'the database is no longer available in this view'
    default: return 'the database could not be reached'
  }
}

export interface WriteResult { ok: boolean; verifiedBy?: string; error?: string }

export interface OwnerSnapshot {
  prefs: JarvisPrefs | null
  /** True once the prefs document has been read (it may not exist yet). */
  prefsLoaded: boolean
  reminders: Reminder[]
  requests: OwnerRequest[]
  decisions: Decision[]
}

export interface OwnerData {
  uid: string
  paths: ReturnType<typeof ownerPaths>
  watch(onChange: (patch: Partial<OwnerSnapshot>) => void, onError?: (text: string) => void): () => void
  saveReminder(r: Reminder): Promise<WriteResult>
  setReminderStatus(r: Reminder, status: Reminder['status']): Promise<WriteResult>
  saveRequest(r: OwnerRequest): Promise<WriteResult>
  saveDecision(d: Decision): Promise<WriteResult>
  saveTask(t: JarvisTask): Promise<WriteResult>
  savePrefs(p: JarvisPrefs): Promise<WriteResult>
  memory: MemoryStore
}

const LIST_LIMIT = 100

/** JSON-safe copy: undefined fields dropped (the store takes plain JSON only). */
const plain = <T>(x: T): Record<string, unknown> => JSON.parse(JSON.stringify(x)) as Record<string, unknown>

export function createOwnerData(db: DbLike, uid: string, opts: { sleep?: (ms: number) => Promise<void> } = {}): OwnerData {
  const paths = ownerPaths(uid)
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  const col = (k: CollectionKey) => db.collection(paths.collection(k))
  /** One write at a time per document, as the db contract asks. */
  const chains = new Map<string, Promise<unknown>>()

  function serial<T>(path: string, job: () => Promise<T>): Promise<T> {
    const prev = chains.get(path) ?? Promise.resolve()
    const next = prev.catch(() => undefined).then(job)
    chains.set(path, next)
    return next
  }

  /** Write, retrying once on a transient refusal, then read back: the postcondition the page can check itself. */
  async function write(ref: DocRefLike, body: Record<string, unknown>): Promise<WriteResult> {
    return serial(ref.path, async () => {
      try {
        try {
          await ref.set(body)
        } catch (e) {
          if ((e as DbErrorLike)?.code !== 'unavailable') throw e
          await sleep(300 + Math.random() * 400)
          await ref.set(body)
        }
        const back = await ref.get()
        if (!back.exists) return { ok: false, error: 'the write did not read back' }
        const id = back.data()?.id
        if (body.id !== undefined && id !== body.id) return { ok: false, error: 'the saved record did not match' }
        return { ok: true, verifiedBy: 'read back from the database' }
      } catch (e) {
        return { ok: false, error: dbErrorText(e) }
      }
    })
  }

  const memory: MemoryStore = {
    async add(item: MemoryItem) {
      const r = await write(col('memory').doc(item.id), plain(item))
      if (!r.ok) throw new Error(r.error)
    },
    async all(kind) {
      const snap = await col('memory').orderBy('at', 'desc').limit(LIST_LIMIT).get()
      return snap.docs.map(d => d.data() as MemoryItem | undefined).filter((m): m is MemoryItem => !!m && typeof m.text === 'string' && (!kind || m.kind === kind))
    },
    async remove(id) {
      await serial(`${paths.collection('memory')}/${id}`, () => col('memory').doc(id).delete())
    },
  }

  return {
    uid,
    paths,
    memory,
    watch(onChange, onError) {
      const offs: Array<() => void> = []
      const fail = (e: DbErrorLike) => onError?.(dbErrorText(e))
      const list = <T>(k: CollectionKey, read: (id: string, raw: unknown) => T | null, key: keyof OwnerSnapshot) => {
        try {
          offs.push(col(k).orderBy('createdAt', 'desc').limit(LIST_LIMIT).onSnapshot(s => {
            onChange({ [key]: s.docs.map(d => (d.exists ? read(d.id, d.data()) : null)).filter((x): x is T => x !== null) } as Partial<OwnerSnapshot>)
          }, fail))
        } catch (e) {
          fail(e as DbErrorLike)
        }
      }
      try {
        offs.push(db.doc(paths.prefs).onSnapshot(s => onChange({ prefs: s.exists ? readPrefs(s.data()) : null, prefsLoaded: true }), e => {
          onChange({ prefsLoaded: true })
          fail(e)
        }))
      } catch (e) {
        onChange({ prefsLoaded: true })
        fail(e as DbErrorLike)
      }
      list('reminders', readReminder, 'reminders')
      list('requests', readRequest, 'requests')
      list('decisions', readDecision, 'decisions')
      return () => offs.forEach(off => off())
    },
    saveReminder: r => write(col('reminders').doc(r.id), plain(r)),
    setReminderStatus: (r, status) => write(col('reminders').doc(r.id), plain({ ...r, status })),
    saveRequest: r => write(col('requests').doc(r.id), plain(r)),
    saveDecision: d => write(col('decisions').doc(d.id), plain(d)),
    saveTask: t => write(col('tasks').doc(t.id), plain(t)),
    savePrefs: p => write(db.doc(paths.prefs), plain({ ...p, id: 'jarvis-prefs' })),
  }
}

const TASK_STATUS: JarvisTask['status'][] = ['queued', 'planning', 'running', 'waiting_for_user', 'blocked', 'completed', 'failed', 'cancelled']

export function readTask(id: string, raw: unknown): JarvisTask | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.title !== 'string' || !TASK_STATUS.includes(r.status as JarvisTask['status']) || typeof r.createdAt !== 'string') return null
  const t: JarvisTask = {
    id: typeof r.id === 'string' ? r.id : id,
    title: r.title.slice(0, 300),
    status: r.status as JarvisTask['status'],
    priority: r.priority === 'low' || r.priority === 'high' || r.priority === 'critical' ? r.priority : 'normal',
    createdAt: r.createdAt,
    actions: [],
    source: r.source === 'graph' || r.source === 'request' ? r.source : 'jarvis',
  }
  // A completed task without a verification is not shown as completed.
  if (t.status === 'completed' && typeof r.verifiedBy !== 'string') t.status = 'failed'
  for (const k of ['completedAt', 'startedAt', 'verifiedBy', 'error', 'ref', 'requiredUserInput'] as const) if (typeof r[k] === 'string') t[k] = (r[k] as string).slice(0, 300)
  return t
}
