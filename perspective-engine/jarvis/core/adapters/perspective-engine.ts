/**
 * Perspective Engine adapter: turns the city's exported graph state (state.json / db `state/current`) into Jarvis
 * context, project status, briefing events and the evolving body. Read-only; it never changes the graph.
 */
import { faceState, partState, PREPARED_WEIGHT } from '../body'
import { timeOf } from '../text'
import type { BodyPartSpec, BodyPartState, FaceState, JarvisContext, ProjectState, RevenueEntry, StatusItem, TaskAction, Viewer } from '../types'

// ---------- the subset of the city's GraphState Jarvis reads ----------

export type PEStatus = 'pending' | 'ready' | 'running' | 'done' | 'blocked' | 'awaiting_human'
export interface PEGate { type: string; reason: string; cleared?: string }
export interface PENode {
  id: string
  title: string
  agent: string
  phase: number
  status: PEStatus
  /** Derived by graph.py: a pending node whose dependencies are satisfied shows as 'ready'. */
  view?: PEStatus
  gate?: PEGate | null
  accept?: string[]
  outputs?: string[]
  deps?: string[]
}
export interface PELedgerEvent { t: string; event: string; node: string; note?: string }
export interface PEActivityEvent { t: string; node: string; agent?: string; kind: string; text: string; src?: string; actor?: string }
export interface PEAgent { name: string; district?: string; role?: string }
export interface PEState {
  generated: string
  project: string
  north_star?: string
  agents: Record<string, PEAgent>
  nodes: PENode[]
  ledger: PELedgerEvent[]
  activity?: Record<string, PEActivityEvent[]>
  audit?: unknown
  revenue?: RevenueEntry[]
  founderKey?: { registered?: boolean; fingerprint?: string | null; registeredAt?: string | null }
}

// ---------- the body map (docs/JARVIS_ARCHITECTURE.md §9); builtBy is the agent key in state.agents ----------

export const PE_BODY: BodyPartSpec[] = [
  { id: 'mind', label: 'Mind (brain)', builtBy: 'orchestrator', tasks: ['F01', 'F02', 'F05', 'F07', 'D01'] },
  { id: 'crown', label: 'Crown and skull', builtBy: 'science', tasks: ['F03', 'V01', 'V03', 'V15', 'S03'] },
  { id: 'neck', label: 'Neck', builtBy: 'data', tasks: ['V02', 'M02', 'S02'] },
  { id: 'heart', label: 'Heart', builtBy: 'product', tasks: ['F04', 'V14', 'M01'] },
  { id: 'lungs', label: 'Lungs', builtBy: 'ethics', tasks: ['F06', 'V04', 'M03'] },
  { id: 'ribcage', label: 'Ribcage', builtBy: 'legal', tasks: ['V12', 'M04'] },
  { id: 'shoulders', label: 'Shoulders and spine base', builtBy: 'finance', tasks: ['V10', 'V11', 'M05', 'S04'] },
  { id: 'arm_right', label: 'Right arm and hand', builtBy: 'gtm', tasks: ['V05', 'V06', 'V07', 'V08', 'V09', 'M06', 'S01'] },
  { id: 'arm_left', label: 'Left arm and hand', builtBy: 'brand', tasks: ['V13', 'S05'] },
]

/** Minutes without any recorded step after which a running task counts as stalled (same rule as the city). */
export const STALL_MINUTES = 15

const statusOfNode = (n: PENode): PEStatus => n.view ?? n.status
const agentName = (s: PEState, key: string) => s.agents?.[key]?.name ?? key

/** Latest time anything was recorded for each node: ledger events and activity steps. */
function lastSeen(s: PEState): Map<string, number> {
  const seen = new Map<string, number>()
  const note = (node: string, t: string) => seen.set(node, Math.max(seen.get(node) ?? 0, timeOf(t)))
  for (const e of s.ledger ?? []) note(e.node, e.t)
  for (const [node, events] of Object.entries(s.activity ?? {})) for (const e of events) note(e.node || node, e.t)
  return seen
}

function lastLedger(s: PEState, node: string, event?: string): PELedgerEvent | undefined {
  let found: PELedgerEvent | undefined
  for (const e of s.ledger ?? []) {
    if (e.node === node && (!event || e.event === event) && (!found || timeOf(e.t) >= timeOf(found.t))) found = e
  }
  return found
}

function item(s: PEState, n: PENode, detail?: string, at?: string): StatusItem {
  const out: StatusItem = { id: n.id, title: n.title, owner: agentName(s, n.agent) }
  if (detail) out.detail = detail
  const when = at ?? lastLedger(s, n.id)?.t
  if (when) out.at = when
  return out
}

function nextDetail(n: PENode, byId: Map<string, PENode>): string {
  if (statusOfNode(n) === 'ready') return 'ready to start'
  const waiting = (n.deps ?? []).filter(d => byId.get(d) && statusOfNode(byId.get(d)!) === 'awaiting_human')
  return waiting.length ? `follows once you clear ${waiting.join(', ')}` : 'ready to start'
}

/** Project status as the founder would ask for it. `now` decides which running tasks count as stalled. */
export function peProjectState(s: PEState, now: Date): ProjectState {
  const nodes = s.nodes ?? []
  const byId = new Map(nodes.map(n => [n.id, n]))
  const seen = lastSeen(s)
  const stallBefore = now.getTime() - STALL_MINUTES * 60_000
  const settled = (id: string) => {
    const dep = byId.get(id)
    return dep !== undefined && (statusOfNode(dep) === 'done' || statusOfNode(dep) === 'awaiting_human')
  }
  const depsSettled = (n: PENode) => (n.deps ?? []).every(settled)
  const state: ProjectState = { completed: [], in_progress: [], blocked: [], waiting_for_user: [], next: [], risks: [] }

  for (const n of nodes) {
    const st = statusOfNode(n)
    if (st === 'done') state.completed.push(item(s, n, undefined, lastLedger(s, n.id, 'done')?.t))
    else if (st === 'running') {
      state.in_progress.push(item(s, n))
      const last = seen.get(n.id) ?? 0
      if (last < stallBefore) {
        const minutes = last ? Math.round((now.getTime() - last) / 60_000) : null
        state.risks.push(item(s, n, minutes === null ? 'marked running but nothing has been recorded' : `marked running but nothing recorded for ${minutes} minutes`))
      }
    } else if (st === 'blocked') {
      const why = lastLedger(s, n.id, 'block')?.note || 'blocked'
      state.blocked.push(item(s, n, why))
      state.risks.push(item(s, n, `blocked: ${why}`))
    } else if (st === 'awaiting_human') state.waiting_for_user.push(item(s, n, n.gate?.reason))
    else if (st === 'ready' || (st === 'pending' && depsSettled(n))) state.next.push(item(s, n, nextDetail(n, byId)))
  }
  return state
}

const RECENT_ACTIONS = 10

function toAction(e: PEEvent): TaskAction {
  const kind: TaskAction['kind'] = e.kind === 'done' ? 'verify' : e.kind === 'block' ? 'error' : e.kind === 'prepared' || e.kind === 'gate_cleared' ? 'handoff' : 'status'
  return { at: e.t, kind, summary: e.title, ok: e.kind !== 'block' }
}

export function peContext(s: PEState, viewer: Viewer, extras: Partial<JarvisContext> = {}): JarvisContext {
  // The export time is the honest "now" for this snapshot: stalls are judged as of when the data was written.
  const asOf = new Date(timeOf(s.generated) || (s.ledger ?? []).reduce((max, e) => Math.max(max, timeOf(e.t)), 0))
  return {
    applicationId: 'perspective-engine',
    applicationName: s.project || 'Perspective Engine',
    environment: 'production',
    viewer,
    projectState: peProjectState(s, asOf),
    recentActions: peEvents(s).slice(-RECENT_ACTIONS).reverse().map(toAction),
    ...extras,
  }
}

export function peBody(s: PEState): { parts: BodyPartState[]; face: FaceState; overall: number } {
  const status = new Map((s.nodes ?? []).map(n => [n.id, statusOfNode(n)]))
  const parts = PE_BODY.map(spec => partState(spec, id => status.get(id)))
  const total = parts.reduce((sum, p) => sum + p.total, 0)
  const built = parts.reduce((sum, p) => sum + p.done + PREPARED_WEIGHT * p.prepared, 0)
  const overall = total ? Math.round((built / total) * 1000) / 1000 : 0
  // Only revenue whose founder signature the export verified forms the face: with no key registered there is none,
  // so nothing an agent records on trust can complete it.
  return { parts, face: faceState(s.revenue ?? [], { requireSigned: true }), overall }
}

// ---------- ledger events in plain words ----------

export interface PEEvent { t: string; title: string; kind: string }

/**
 * Ledger events in plain words, oldest first. A 'done' on a founder-gated task means "prepared, waiting on you"
 * until the founder clears the gate, exactly as graph.py records it.
 */
export function peEvents(s: PEState): PEEvent[] {
  const byId = new Map((s.nodes ?? []).map(n => [n.id, n]))
  const cleared = new Set<string>()
  const ordered = [...(s.ledger ?? [])].map((e, i) => ({ e, i })).sort((a, b) => timeOf(a.e.t) - timeOf(b.e.t) || a.i - b.i)
  const out: PEEvent[] = []
  for (const { e } of ordered) {
    const n = byId.get(e.node)
    const who = n ? agentName(s, n.agent) : 'An agent'
    const what = n ? `${n.id} (${n.title})` : e.node
    if (e.event === 'clear-gate') cleared.add(e.node)
    out.push(describe(e, who, what, Boolean(n?.gate) && !cleared.has(e.node)))
  }
  return out
}

function describe(e: PELedgerEvent, who: string, what: string, gated: boolean): PEEvent {
  const note = e.note ? `: ${e.note}` : ''
  switch (e.event) {
    case 'start': return { t: e.t, kind: 'start', title: `${who} started ${what}` }
    case 'done': return gated
      ? { t: e.t, kind: 'prepared', title: `${who} prepared ${what}; it now needs you` }
      : { t: e.t, kind: 'done', title: `${who} finished ${what}` }
    case 'block': return { t: e.t, kind: 'block', title: `${what} was blocked${note}` }
    case 'unblock': return { t: e.t, kind: 'unblock', title: `${what} was unblocked` }
    case 'clear-gate': return { t: e.t, kind: 'gate_cleared', title: `You cleared the gate on ${what}${note}` }
    default: return { t: e.t, kind: e.event, title: `${what}: ${e.event}${note}` }
  }
}
