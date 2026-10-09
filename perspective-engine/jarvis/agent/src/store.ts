/**
 * File persistence for the agent: small JSON documents written atomically and append-only JSONL logs.
 * Everything is written with mode 0600 because ~/.jarvis holds private memory and the audit trail.
 * Synchronous on purpose: one owner, small files, and no interleaved partial writes.
 */
import { appendFileSync, chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'
import { createTask, recall, type MemoryItem, type MemoryKind, type MemoryStore, type JarvisTask, type Reminder } from '../../core/index'

const FILE_MODE = 0o600

export function readJson<T>(file: string, fallback: T): T {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw e
  }
  try {
    return JSON.parse(text) as T
  } catch {
    // Keep the unreadable file for inspection instead of silently overwriting it later.
    const aside = `${file}.corrupt-${Date.now()}`
    try {
      renameSync(file, aside)
    } catch {
      // nothing more we can do; the fallback is still returned
    }
    return fallback
  }
}

/** Write to a temporary file, fsync, then rename: a crash leaves either the old or the new document, never half of one. */
export function writeJsonAtomic(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  const fd = openSync(tmp, 'w', FILE_MODE)
  try {
    writeSync(fd, `${JSON.stringify(data, null, 2)}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, file)
  chmodSync(file, FILE_MODE)
}

export const JSONL_ROTATE_BYTES = 5 * 1024 * 1024

/** Appends one JSON line. When the file passes `rotateBytes` it is renamed to <file>.1 first (one generation kept). */
export function appendJsonl(file: string, value: unknown, rotateBytes = JSONL_ROTATE_BYTES): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  try {
    if (statSync(file).size > rotateBytes) renameSync(file, `${file}.1`)
  } catch {
    // no file yet
  }
  appendFileSync(file, `${JSON.stringify(value)}\n`, { mode: FILE_MODE })
}

/** Reads a JSONL file, skipping malformed lines. `limit` keeps only the last N records. */
export function readJsonl<T>(file: string, limit?: number): T[] {
  if (!existsSync(file)) return []
  const out: T[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line) as T)
    } catch {
      // a torn or hand-edited line must not hide the rest of the log
    }
  }
  return limit !== undefined && out.length > limit ? out.slice(-limit) : out
}

// ---------- tasks ----------

const MAX_TASKS = 1000
const FINAL: JarvisTask['status'][] = ['completed', 'failed', 'cancelled']

/** A pending tool call parked on a task until the owner confirms it. Stored with the task, never in the audit log. */
export interface PendingCall { tool: string; input: Record<string, unknown>; requestedAt: string }
export type AgentTask = JarvisTask & { pending?: PendingCall }

export interface TaskStore {
  list(): AgentTask[]
  get(id: string): AgentTask | undefined
  put(task: AgentTask): AgentTask
  create(p: Parameters<typeof createTask>[0], now: Date): AgentTask
}

export function fileTaskStore(file: string): TaskStore {
  let tasks = readJson<AgentTask[]>(file, [])
  if (!Array.isArray(tasks)) tasks = []
  const save = () => {
    if (tasks.length > MAX_TASKS) {
      // Drop the oldest finished tasks first; open work is never dropped.
      const excess = tasks.length - MAX_TASKS
      let dropped = 0
      tasks = tasks.filter(t => !(dropped < excess && FINAL.includes(t.status) && ++dropped))
    }
    writeJsonAtomic(file, tasks)
  }
  return {
    list: () => tasks.map(t => ({ ...t })),
    get: id => {
      const t = tasks.find(x => x.id === id)
      return t ? { ...t } : undefined
    },
    put(task) {
      const i = tasks.findIndex(x => x.id === task.id)
      if (i === -1) tasks.push(task)
      else tasks[i] = task
      save()
      return { ...task }
    },
    create(p, now) {
      const task = createTask(p, now)
      tasks.push(task)
      save()
      return { ...task }
    },
  }
}

// ---------- reminders ----------

export type AgentReminder = Reminder & { deliveredAt?: string; attempts?: number; lastError?: string; nextAttemptAt?: string }

export interface ReminderStore {
  list(): AgentReminder[]
  get(id: string): AgentReminder | undefined
  put(r: AgentReminder): AgentReminder
}

export function fileReminderStore(file: string): ReminderStore {
  let items = readJson<AgentReminder[]>(file, [])
  if (!Array.isArray(items)) items = []
  return {
    list: () => items.map(r => ({ ...r })),
    get: id => {
      const r = items.find(x => x.id === id)
      return r ? { ...r } : undefined
    },
    put(r) {
      const i = items.findIndex(x => x.id === r.id)
      if (i === -1) items.push(r)
      else items[i] = r
      writeJsonAtomic(file, items)
      return { ...r }
    },
  }
}

// ---------- memory ----------

/** The core MemoryStore over memory.jsonl. Additions append; removals rewrite the file. */
export function fileMemoryStore(file: string): MemoryStore & { search(q: string, k?: number, kinds?: MemoryKind[]): Promise<MemoryItem[]> } {
  const items = new Map<string, MemoryItem>()
  for (const item of readJsonl<MemoryItem & { deleted?: boolean }>(file)) {
    if (item && typeof item.id === 'string') {
      if (item.deleted) items.delete(item.id)
      else items.set(item.id, item)
    }
  }
  const store: MemoryStore & { search(q: string, k?: number, kinds?: MemoryKind[]): Promise<MemoryItem[]> } = {
    async add(item) {
      items.set(item.id, { ...item })
      appendJsonl(file, item, Number.POSITIVE_INFINITY)
    },
    async all(kind) {
      return [...items.values()].filter(i => !kind || i.kind === kind).map(i => ({ ...i }))
    },
    async remove(id) {
      if (!items.delete(id)) return
      // Rewrite rather than leave a tombstone so a removed memory is really gone from disk.
      writeLines(file, [...items.values()])
    },
    search: (q, k = 5, kinds) => recall(store, q, k, kinds),
  }
  return store
}

function writeLines(file: string, values: unknown[]): void {
  const tmp = `${file}.${process.pid}.tmp`
  const fd = openSync(tmp, 'w', FILE_MODE)
  try {
    for (const v of values) writeSync(fd, `${JSON.stringify(v)}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, file)
}

// ---------- session ----------

export interface SessionState { lastVisit?: string }

export function sessionStore(file: string): { get(): SessionState; set(s: SessionState): void } {
  return {
    get: () => readJson<SessionState>(file, {}),
    set: s => writeJsonAtomic(file, s),
  }
}
