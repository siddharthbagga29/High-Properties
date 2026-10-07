import type { ActivityEvent, AtomRecord, GraphState, LedgerEvent, Status, TaskNode } from './types'

/** Orchestrator first, then the ring clockwise from the top (matches scene/world.ts). */
export const AGENT_ORDER = ['orchestrator', 'science', 'data', 'finance', 'legal', 'gtm', 'brand', 'product', 'ethics'] as const
export type AgentKey = (typeof AGENT_ORDER)[number]

export const STATUS_CODE: Record<Status, number> = { pending: 0, ready: 1, running: 2, done: 3, awaiting_human: 4, blocked: 5 }
export const STATUS_LABEL: Record<Status, string> = {
  pending: 'Planned', ready: 'Ready', running: 'Building', done: 'Built', awaiting_human: 'Needs founder', blocked: 'Blocked',
}

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
    // Same rule as graph.py dep_ok: a gated task may start from a dependency that is prepared and waiting on the founder.
    const depsDone = n.deps.every(d => raw.get(d) === 'done' || (!!n.gate && raw.get(d) === 'awaiting_human'))
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
  /** A task with status running AND a recorded step in the last LIVE_WINDOW_MIN minutes: really being worked on. */
  running: TaskNode | null
  /** A task whose status says running but nothing was recorded for LIVE_WINDOW_MIN minutes: no session is on it. */
  stalled: TaskNode | null
  /** Time of the agent's own latest step (verifier and ledger rows excluded), or null. */
  lastStep: number | null
  /** Real tool calls extracted from the agent's transcripts. */
  toolCalls: number
  /** Tasks the agent worked on whose token use has not been measured yet (running, gated or failed rounds). */
  unmeasured: number
  next: TaskNode | null
  waiting: number
  budget: number
  used: number
  efficiency: { id: string; ratio: number; t: number }[]
  inbound: Set<string>
  outbound: Set<string>
}

export function agentStats(state: GraphState, st: Map<string, Status>, at: number = Date.now()): AgentStats[] {
  const live = runState(state, st, at)
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
      running: tasks.find(n => live.get(n.id) === 'working') ?? null,
      stalled: tasks.find(n => live.get(n.id) === 'stalled') ?? null,
      lastStep: lastOwnStep(state, key, at),
      toolCalls: tasks.reduce((s, n) => s + (state.activity?.[n.id] ?? []).filter(e => isToolCall(e) && ms(e.t) <= at).length, 0),
      unmeasured: tasks.filter(n => !n.run && (state.activity?.[n.id] ?? []).some(e => e.src !== 'ledger' && ms(e.t) <= at)).length,
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
  const live = [...runState(state, st, t ?? Date.now()).values()]
  return {
    total: state.nodes.length,
    done: count('done'),
    /** Status running AND a step recorded in the last LIVE_WINDOW_MIN minutes. */
    running: live.filter(x => x === 'working').length,
    /** Status running but silent: no session is working on it. */
    stalled: live.filter(x => x === 'stalled').length,
    toolCalls: feed(state, t).filter(isToolCall).length,
    steps: feed(state, t).length,
    ready: count('ready'),
    waiting: count('awaiting_human'),
    blocked: count('blocked'),
    usedK: state.nodes.reduce((s, n) => s + (n.run?.used_k ?? 0), 0),
    budgetK: state.nodes.reduce((s, n) => s + n.budget_k, 0),
    events: events.length,
    last: events.at(-1) ?? null,
  }
}

/** Level-4 atoms of one task, all in the normalized record shape. */
export function atomsOf(state: GraphState, id: string, st: Map<string, Status>, t: number | null): AtomRecord[] {
  const n = state.nodes.find(x => x.id === id)
  if (!n) return []
  const p: [string, string, string] = ['venture', n.agent, n.id]
  const cs = criterionState(st.get(n.id))
  const byId = new Map(state.nodes.map(x => [x.id, x]))
  const atoms: AtomRecord[] = []
  n.accept.forEach((a, i) => atoms.push({
    id: `${id}:c${i}`, level4Type: 'criterion', parentIds: p, timestamp: null, value: null, category: n.agent,
    status: cs, meta: { label: a, detail: CRITERION_NOTE[cs] },
  }))
  n.outputs.forEach((o, i) => atoms.push({
    id: `${id}:o${i}`, level4Type: 'output', parentIds: p, timestamp: null, value: null, category: n.agent,
    status: cs, meta: { label: o.split('/').slice(-2).join('/'), detail: cs === 'open' ? undefined : state.excerpts[o] ?? undefined, source: o },
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

// ---------- liveness: "running" in the graph is not proof that anyone is working ----------

/** Minutes without any recorded step after which a running task counts as stalled (no session is on it). */
export const LIVE_WINDOW_MIN = 15
const WINDOW = LIVE_WINDOW_MIN * 60_000

/** A real tool call from a transcript. A failed call is one call: its "Failed (...)" result row is not counted again. */
export const isToolCall = (e: ActivityEvent) => e.src === 'transcript' && !(e.kind === 'blocked' && e.text.startsWith('Failed ('))

/** Rows written by the independent verifier, not by the agent that owns the task. */
export const isVerifier = (e: ActivityEvent) => e.actor === 'verifier' || /^verifier\b/i.test(e.text)

/** Latest recorded moment for a task (any activity row or ledger event) at or before `at`. */
export function lastSignal(state: GraphState, id: string, at: number): number | null {
  let best = -Infinity
  for (const e of state.activity?.[id] ?? []) { const t = ms(e.t); if (t <= at && t > best) best = t }
  for (const e of state.ledger) if (e.node === id) { const t = ms(e.t); if (t <= at && t > best) best = t }
  return Number.isFinite(best) ? best : null
}

/** The agent's own latest step: its transcript and self-logged rows, not the verifier's or the ledger's. */
export function lastOwnStep(state: GraphState, agent: string, at: number): number | null {
  let best = -Infinity
  for (const n of state.nodes) if (n.agent === agent)
    for (const e of state.activity?.[n.id] ?? []) {
      if (e.src === 'ledger' || isVerifier(e)) continue
      const t = ms(e.t); if (t <= at && t > best) best = t
    }
  return Number.isFinite(best) ? best : null
}

/** Every running task, judged at time `at`: 'working' if something was recorded in the window, else 'stalled'. */
export function runState(state: GraphState, st: Map<string, Status>, at: number): Map<string, 'working' | 'stalled'> {
  const out = new Map<string, 'working' | 'stalled'>()
  for (const n of state.nodes) {
    if (st.get(n.id) !== 'running') continue
    const last = lastSignal(state, n.id, at)
    out.set(n.id, last !== null && at - last <= WINDOW ? 'working' : 'stalled')
  }
  return out
}

/** Tasks really being worked on at `at` (default now): status running and a step recorded within the window. */
export function workingNow(state: GraphState, st: Map<string, Status>, at: number = Date.now()) {
  const live = runState(state, st, at)
  return state.nodes.filter(n => live.get(n.id) === 'working').map(n => ({ agent: n.agent, node: n, last: lastSignal(state, n.id, at)! }))
}

/** Tasks marked running that nobody has touched within the window. */
export function stalledNow(state: GraphState, st: Map<string, Status>, at: number = Date.now()) {
  const live = runState(state, st, at)
  return state.nodes.filter(n => live.get(n.id) === 'stalled').map(n => ({ agent: n.agent, node: n, last: lastSignal(state, n.id, at) }))
}

/** Acceptance criteria are met only once a task is done. A gated task is prepared, not finished. */
export function criterionState(s: Status | undefined): 'met' | 'prepared' | 'open' {
  return s === 'done' ? 'met' : s === 'awaiting_human' ? 'prepared' : 'open'
}
export const CRITERION_NOTE = {
  met: 'Checked by an independent verifier before the task was marked done',
  prepared: 'Prepared and verified; the last step waits on the founder',
  open: 'Not yet checked',
} as const

/** Ledger events that are new in this export AND recent enough to animate (no flashes for old history). */
export function freshEvents(prev: GraphState | null, next: GraphState, now: number = Date.now(), maxAgeMs = 180_000): LedgerEvent[] {
  return newEvents(prev, next).filter(e => now - ms(e.t) <= maxAgeMs)
}

/** Feed rows ready to display: a step immediately followed by its own failure becomes one "Failed" row. */
export function collapseFeed(events: ActivityEvent[]): ActivityEvent[] {
  const out: ActivityEvent[] = []
  for (let i = 0; i < events.length; i++) {
    const a = events[i], b = events[i + 1]
    const fail = a?.kind === 'blocked' ? a : b?.kind === 'blocked' ? b : null
    const step = fail === a ? b : a
    const m = fail && step && step !== fail && a.node === b?.node && Math.abs(ms(a.t) - ms(b.t)) <= 1000
      ? /^Failed \((.*?)\): (.*)$/s.exec(fail.text) : null
    if (m && step && m[2].startsWith(step.text.slice(0, 60))) {
      const host = step.kind === 'fetch' ? /https?:\/\/([^/\s]+)/.exec(step.text)?.[1] : null
      out.push({ ...fail!, text: host ? `Couldn't open ${host} (${m[1]})` : `${step.text}: failed (${m[1]})` })
      i++
    } else out.push(a)
  }
  return out
}

export function ago(iso: string | number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - (typeof iso === 'number' ? iso : ms(iso))) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export const clock = (iso: string | number) => new Date(typeof iso === 'number' ? iso : ms(iso)).toISOString().slice(11, 19)
