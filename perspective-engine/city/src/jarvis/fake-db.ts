/**
 * An in-memory stand-in for the artifact `db` capability, for tests only. It follows the parts of db.d.ts the page
 * relies on: the path grammar (documents even, collections odd), set/update/get/delete, orderBy/limit and
 * onSnapshot with an initial delivery. It records every read and write so tests can prove what was touched.
 */
import type { CollRefLike, DbLike, DocRefLike, DocSnapLike, QueryLike, QuerySnapLike } from './owner-data'

type Listener = () => void

export interface FakeDb extends DbLike {
  docs: Map<string, Record<string, unknown>>
  writes: Array<{ op: 'set' | 'update' | 'delete'; path: string }>
  reads: string[]
  /** When set, every write rejects with this code. */
  failWith: string | null
}

const segs = (p: string) => p.split('/')
function check(path: string, parity: 'doc' | 'col') {
  const n = segs(path).length
  if (segs(path).some(s => !/^(?!\.\.?$)[A-Za-z0-9_\-.~:@+]{1,200}$/.test(s))) throw new TypeError(`bad path ${path}`)
  if ((parity === 'doc') !== (n % 2 === 0)) throw new TypeError(`${path} has ${n} segments: not a ${parity === 'doc' ? 'document' : 'collection'}`)
}

export function createFakeDb(): FakeDb {
  const docs = new Map<string, Record<string, unknown>>()
  const listeners = new Set<Listener>()
  const notify = () => queueMicrotask(() => listeners.forEach(l => l()))
  let auto = 0
  const db: FakeDb = {
    docs,
    writes: [],
    reads: [],
    failWith: null,
    doc: path => docRef(path),
    collection: path => colRef(path),
  }
  const snap = (path: string): DocSnapLike => {
    const body = docs.get(path)
    const frozen = body ? structuredClone(body) : undefined
    return { id: segs(path).pop()!, exists: !!body, data: () => frozen }
  }
  const reject = async () => {
    if (db.failWith) throw { code: db.failWith, message: 'fake failure' }
  }
  function docRef(path: string): DocRefLike {
    check(path, 'doc')
    return {
      id: segs(path).pop()!,
      path,
      async get() { db.reads.push(path); return snap(path) },
      async set(data) { await reject(); docs.set(path, structuredClone(data)); db.writes.push({ op: 'set', path }); notify() },
      async update(data) {
        await reject()
        if (!docs.has(path)) throw { code: 'invalid_argument', message: 'missing' }
        docs.set(path, { ...docs.get(path), ...structuredClone(data) }); db.writes.push({ op: 'update', path }); notify()
      },
      async delete() { await reject(); docs.delete(path); db.writes.push({ op: 'delete', path }); notify() },
      onSnapshot(next) {
        db.reads.push(path)
        const l = () => next(snap(path))
        listeners.add(l)
        queueMicrotask(l)
        return () => listeners.delete(l)
      },
      collection: sub => colRef(`${path}/${sub}`),
    }
  }
  function query(path: string, order: [string, 'asc' | 'desc'] | null, lim: number | null): QueryLike {
    const run = (): QuerySnapLike => {
      const prefix = `${path}/`
      let rows = [...docs.keys()].filter(k => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
      if (order) {
        const [f, dir] = order
        rows.sort((a, b) => {
          const va = docs.get(a)![f] as string | number | undefined, vb = docs.get(b)![f] as string | number | undefined
          if (va === undefined || va === null) return 1
          if (vb === undefined || vb === null) return -1
          return (va < vb ? -1 : va > vb ? 1 : 0) * (dir === 'desc' ? -1 : 1)
        })
      } else rows.sort()
      if (lim !== null) rows = rows.slice(0, lim)
      return { docs: rows.map(snap) }
    }
    return {
      orderBy: (f, dir = 'asc') => query(path, [f, dir], lim),
      limit: n => query(path, order, n),
      async get() { db.reads.push(path); return run() },
      onSnapshot(next) {
        db.reads.push(path)
        const l = () => next(run())
        listeners.add(l)
        queueMicrotask(l)
        return () => listeners.delete(l)
      },
    }
  }
  function colRef(path: string): CollRefLike {
    check(path, 'col')
    return { ...query(path, null, null), path, doc: id => docRef(`${path}/${id ?? `auto${++auto}`}`) }
  }
  return db
}

/** Lets pending microtasks (snapshot deliveries) run. */
export const flush = () => new Promise<void>(r => setTimeout(r, 0))
