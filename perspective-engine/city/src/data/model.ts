import type { ActivityEvent, AtomRecord, FocusKind, GraphState, LedgerEvent, Status, TaskNode } from './types'

/** City grid order (row-major, City Hall in the centre). Shared by the layout and the UI. */
/** Orchestrator first, then the ring clockwise from the top (matches scene/world.ts). */
export const AGENT_ORDER = ['orchestrator', 'science', 'data', 'finance', 'legal', 'gtm', 'brand', 'product', 'ethics'] as const
export type AgentKey = (typeof AGENT_ORDER)[number]

export const STATUS_CODE: Record<Status, number> = { pending: 0, ready: 1, running: 2, done: 3, awaiting_human: 4, blocked: 5 }
export const STATUS_LABEL: Record<Status, string> = {
  pending: 'Planned', ready: 'Ready', running: 'Building', done: 'Built', awaiting_human: 'Needs founder', blocked: 'Blocked',
}
export const LEVEL_MAG = ['', '×1', '×12', '×140', '×2000'] as const
export const LEVEL_NAME = ['', 'Venture', 'Districts', 'Agent', 'Records'] as const

export const ms = (iso: string) => Date.parse(iso)

/** Start of the project timeline: one minute before the first ledger event. */
export function timeline(state: GraphState): [number, number] {
  const ts = state.ledger.map(e => ms(e.t)).filter(Number.isFinite)
  const end = Math.max(ms(state.generated), ...ts)
  const start = ts.length ? Math.min(...ts) - 60_000 : end - 3_600_000
  return [start, end]
}

/**
 * Status of every task at time t, re-derived from the append-only ledger.
 * t = null means live: use the exported view. Nodes that finished before the ledger existed
 * (done in the graph with no ledger event) count as done from the start.
 */
export function statusesAt(state: GraphState, t: number | null): Map<string, Status> {
  const out = new Map<string, Status>()
  if (t === null) {
    state.nodes.forEach(n => out.set(n.id, n.view))
    return out
  }
  const logged = new Set(state.ledger.map(e => e.node))
  const raw = new Map<string, Status>()
  state.nodes.forEach(n => raw.set(n.id, n.status === 'done' && !logged.has(n.id) ? 'done' : 'pending'))
  const byId = new Map(state.nodes.map(n => [n.id, n]))
  const cleared = new Set<string>()
  for (const e of [...state.ledger].sort((a, b) => ms(a.t) - ms(b.t))) {
    if (ms(e.t) > t) break
    const n = byId.get(e.node)
    if (!n) continue
    if (e.event === 'start') raw.set(n.id, 'running')
    else if (e.event === 'done') raw.set(n.id, n.gate && !cleared.has(n.id) ? 'awaiting_human' : 'done')
    else if (e.event === 'block') raw.set(n.id, 'blocked')
    else if (e.event === 'unblock') raw.set(n.id, 'pending')
    else if (e.event === 'clear-gate') {
      cleared.add(n.id)
      if (raw.get(n.id) === 'awaiting_human') raw.set(n.id, 'done')
    }
  }
  for (const n of state.nodes) {
    const s = raw.get(n.id)!
    const depsDone = n.deps.every(d => raw.get(d) === 'done')
    out.set(n.id, s === 'pending' && depsDone ? 'ready' : s)
  }
  return out
}

export interface AgentStats {
  key: string
  name: string
  district: string
  role: string
  tasks: TaskNode[]
  done: number
  running: TaskNode | null
  next: TaskNode | null
  waiting: number
  budget: number
  used: number
  efficiency: { id: string; ratio: number; t: number }[]
  inbound: Set<string>
  outbound: Set<string>
}

export function agentStats(state: GraphState, st: Map<string, Status>): AgentStats[] {
  const byId = new Map(state.nodes.map(n => [n.id, n]))
  const doneAt = new Map<string, number>()
  state.ledger.forEach(e => { if (e.event === 'done') doneAt.set(e.node, ms(e.t)) })
  return AGENT_ORDER.map(key => {
    const a = state.agents[key]
    const tasks = state.nodes.filter(n => n.agent === key)
    const inbound = new Set<string>(), outbound = new Set<string>()
    tasks.forEach(n => n.deps.forEach(d => { const o = byId.get(d)?.agent; if (o && o !== key) inbound.add(o) }))
    state.nodes.forEach(n => n.deps.forEach(d => { if (byId.get(d)?.agent === key && n.agent !== key) outbound.add(n.agent) }))
    const efficiency = tasks
      .filter(n => n.run && st.get(n.id) !== 'pending')
      .map(n => ({ id: n.id, ratio: n.run!.used_k / Math.max(n.budget_k, 1), t: doneAt.get(n.id) ?? 0 }))
      .sort((x, y) => x.t - y.t)
    return {
      key, name: a.name, district: a.district, role: a.role, tasks,
      done: tasks.filter(n => st.get(n.id) === 'done').length,
      running: tasks.find(n => st.get(n.id) === 'running') ?? null,
      next: tasks.find(n => st.get(n.id) === 'ready') ?? null,
      waiting: tasks.filter(n => st.get(n.id) === 'awaiting_human').length,
      budget: tasks.reduce((s, n) => s + n.budget_k, 0),
      used: tasks.reduce((s, n) => s + (n.run?.used_k ?? 0), 0),
      efficiency, inbound, outbound,
    }
  })
}

export function ventureStats(state: GraphState, st: Map<string, Status>, t: number | null) {
  const count = (s: Status) => state.nodes.filter(n => st.get(n.id) === s).length
  const events = state.ledger.filter(e => t === null || ms(e.t) <= t)
  return {
    total: state.nodes.length,
    done: count('done'),
    running: count('running'),
    ready: count('ready'),
    waiting: count('awaiting_human'),
    blocked: count('blocked'),
    usedK: state.nodes.reduce((s, n) => s + (n.run?.used_k ?? 0), 0),
    budgetK: state.nodes.reduce((s, n) => s + n.budget_k, 0),
    events: events.length,
    last: events.at(-1) ?? null,
  }
}

export function focusKind(state: GraphState, id: string): FocusKind {
  if (id === 'venture') return 'venture'
  if (id === 'city') return 'city'
  if (state.agents[id]) return 'agent'
  return state.nodes.some(n => n.id === id) ? 'task' : 'venture'
}

export const levelOf = (k: FocusKind) => ({ venture: 1, city: 2, agent: 3, task: 4 } as const)[k]

/** Parent focus one level up (Esc / breadcrumb). */
export function parentOf(state: GraphState, id: string): string {
  const k = focusKind(state, id)
  if (k === 'task') return state.nodes.find(n => n.id === id)!.agent
  if (k === 'agent') return 'city'
  return 'venture'
}

/** Level-4 atoms of one task, all in the normalized record shape. */
export function atomsOf(state: GraphState, id: string, st: Map<string, Status>, t: number | null): AtomRecord[] {
  const n = state.nodes.find(x => x.id === id)
  if (!n) return []
  const p: [string, string, string] = ['venture', n.agent, n.id]
  const s = st.get(n.id)
  const met = s === 'done' || s === 'awaiting_human'
  const byId = new Map(state.nodes.map(x => [x.id, x]))
  const atoms: AtomRecord[] = []
  n.accept.forEach((a, i) => atoms.push({
    id: `${id}:c${i}`, level4Type: 'criterion', parentIds: p, timestamp: null, value: null, category: n.agent,
    status: met ? 'met' : 'open', meta: { label: a, detail: met ? 'Checked by the orchestrator before marking done' : 'Not yet checked' },
  }))
  n.outputs.forEach((o, i) => atoms.push({
    id: `${id}:o${i}`, level4Type: 'output', parentIds: p, timestamp: null, value: null, category: n.agent,
    status: met ? 'met' : 'open', meta: { label: o.split('/').slice(-2).join('/'), detail: state.excerpts[o] ?? undefined, source: o },
  }))
  n.deps.forEach((d, i) => {
    const dn = byId.get(d)
    if (dn) atoms.push({
      id: `${id}:i${i}`, level4Type: 'input', parentIds: p, timestamp: null, value: null, category: dn.agent,
      status: st.get(d) === 'done' ? 'met' : 'open', meta: { label: `${d} · ${dn.title}`, detail: `From ${state.agents[dn.agent].name}` },
    })
  })
  state.ledger.filter(e => e.node === id && (t === null || ms(e.t) <= t)).forEach((e, i) => atoms.push({
    id: `${id}:l${i}`, level4Type: 'ledger', parentIds: p, timestamp: ms(e.t), value: null, category: n.agent,
    status: 'event', meta: { label: e.event, detail: e.note || undefined },
  }))
  if (n.gate) atoms.push({
    id: `${id}:g`, level4Type: 'gate', parentIds: p, timestamp: null, value: null, category: n.agent,
    status: n.gate.cleared ? 'met' : 'waiting', meta: { label: 'Founder gate', detail: n.gate.reason },
  })
  return atoms
}

export function edges(state: GraphState) {
  const out: { from: string; to: string }[] = []
  state.nodes.forEach(n => n.deps.forEach(d => out.push({ from: d, to: n.id })))
  return out
}

/** New ledger events between two exports, for live flashes. */
export function newEvents(prev: GraphState | null, next: GraphState): LedgerEvent[] {
  if (!prev) return []
  const seen = new Set(prev.ledger.map(e => e.t + e.event + e.node))
  return next.ledger.filter(e => !seen.has(e.t + e.event + e.node))
}

export const fmtTime = (t: number) => new Date(t).toISOString().slice(11, 16) + ' UTC'
export const fmtK = (k: number) => (k >= 1000 ? `${(k / 1000).toFixed(2)}M` : `${Math.round(k)}k`)

// ---------- activity: what each agent actually did, with timestamps ----------

export const KIND_LABEL: Record<ActivityEvent['kind'], string> = {
  plan: 'Started', read: 'Read', search: 'Searched', fetch: 'Opened', write: 'Wrote', edit: 'Edited',
  run: 'Ran', check: 'Checked', note: 'Note', blocked: 'Blocked', handoff: 'Handed off',
}

/** Every activity event up to time t (null = now), newest first. */
export function feed(state: GraphState, t: number | null): ActivityEvent[] {
  const all = Object.values(state.activity ?? {}).flat()
  return all.filter(e => t === null || ms(e.t) <= t).sort((a, b) => ms(b.t) - ms(a.t) || (a.src === 'ledger' ? -1 : 1))
}

export const agentFeed = (state: GraphState, agent: string, t: number | null) => feed(state, t).filter(e => e.agent === agent)
export const taskFeed = (state: GraphState, id: string, t: number | null) => feed(state, t).filter(e => e.node === id)

/** Agents with a task whose status is really "running" right now. */
export function workingNow(state: GraphState, st: Map<string, Status>) {
  return state.nodes.filter(n => st.get(n.id) === 'running').map(n => ({ agent: n.agent, node: n }))
}

export function ago(iso: string | number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - (typeof iso === 'number' ? iso : ms(iso))) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export const clock = (iso: string | number) => new Date(typeof iso === 'number' ? iso : ms(iso)).toISOString().slice(11, 19)
