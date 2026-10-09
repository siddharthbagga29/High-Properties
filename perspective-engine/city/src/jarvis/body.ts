/**
 * JARVIS's body, read from the record. The brain stays the mind; around it a bust assembles from verified work
 * (docs/JARVIS_ARCHITECTURE.md §9). Every number here comes from the graph export through the Jarvis core adapter:
 * a part fills only as its agent's tasks are verified (prepared tasks waiting on the founder count 0.6), and the face
 * forms only from founder-recorded revenue with evidence. Pure functions, no rendering.
 */
import { PE_BODY, peBody, type PEState } from '@jarvis/adapters/perspective-engine'
import type { BodyPartState, FaceState, RevenueEntry } from '@jarvis/types'
import { freshEvents, ms } from '../data/model'
import type { GraphState, Status } from '../data/types'

export interface BodyPartView extends BodyPartState {
  /** The agent's display name ("Ada"); falls back to the agent key. */
  agentName: string
  /** Task ids verified done, in the part's own order. */
  verified: string[]
  /** Task ids prepared and waiting only on the founder. */
  waiting: string[]
  /** Share of the part that is verified (done / total): drawn cyan. `fill` adds prepared work (violet). */
  built: number
  /** One line for the hover label, e.g. "Heart · built by Ada · 1 of 3 tasks verified (F04)". */
  tooltip: string
}

export interface BodyView {
  parts: BodyPartView[]
  face: FaceState
  /** Weighted share of the whole body built, 0..1 (from the core). */
  overall: number
}

/** Revenue entries in the export. Absent (older exports) means none: nothing else can form the face. */
export function revenueOf(state: GraphState): RevenueEntry[] {
  const r = (state as GraphState & { revenue?: unknown }).revenue
  return Array.isArray(r) ? (r as RevenueEntry[]) : []
}

/** Short name of a part for labels: the core's label without the parenthetical ("Mind (brain)" → "Mind"). */
export const partName = (p: Pick<BodyPartState, 'label'>) => p.label.replace(/\s*\(.*\)\s*$/, '')

const ids = (list: string[]) => (list.length ? ` (${list.join(', ')})` : '')

export function partTooltip(p: Pick<BodyPartView, 'label' | 'agentName' | 'done' | 'total' | 'verified'>): string {
  return `${partName(p)} · built by ${p.agentName} · ${p.done} of ${p.total} task${p.total === 1 ? '' : 's'} verified${ids(p.verified)}`
}

/** The second line under a part's tooltip: what is prepared, and what is left. */
export function partDetail(p: BodyPartView): string {
  const parts: string[] = []
  if (p.waiting.length) parts.push(`${p.waiting.length} prepared, waiting on the founder${ids(p.waiting)}`)
  const left = p.total - p.done - p.prepared
  if (left > 0) parts.push(`${left} not built yet`)
  return parts.join(' · ') || 'fully built'
}

/**
 * The body as of the live export (st omitted) or of a replay moment: statuses from `st` (statusesAt) and only the
 * revenue recorded by then. Uses the core's peBody so the city and Jarvis agree on every number.
 */
export function bodyAt(state: GraphState, st?: Map<string, Status>, time: number | null = null): BodyView {
  const nodes = st ? state.nodes.map(n => ({ ...n, view: st.get(n.id) ?? n.view })) : state.nodes
  const revenue = revenueOf(state).filter(e => time === null || ms(e.t) <= time)
  const pe: PEState = { ...(state as unknown as PEState), nodes: nodes as unknown as PEState['nodes'], revenue }
  const { parts, face, overall } = peBody(pe)
  const status = new Map(nodes.map(n => [n.id, n.view ?? n.status]))
  return {
    face,
    overall,
    parts: parts.map(p => {
      const agentName = state.agents?.[p.builtBy]?.name ?? p.builtBy
      const verified = p.tasks.filter(id => status.get(id) === 'done')
      const waiting = p.tasks.filter(id => status.get(id) === 'awaiting_human')
      const view = { ...p, agentName, verified, waiting, built: p.total ? p.done / p.total : 0, tooltip: '' }
      view.tooltip = partTooltip(view)
      return view
    }),
  }
}

/** Which body part a task builds (undefined for a task outside the body map). */
export function partOfTask(taskId: string): string | undefined {
  return PE_BODY.find(p => p.tasks.includes(taskId))?.id
}

export interface Arrival { part: string; agent: string; node: string; t: string }

/**
 * Fresh ledger "done" events between two exports, as arrivals at body parts: each one sends a stream of particles
 * from the agent's district to its organ. Old history never animates (freshEvents keeps only recent events).
 */
export function bodyArrivals(prev: GraphState | null, next: GraphState, now: number = Date.now()): Arrival[] {
  const byId = new Map(next.nodes.map(n => [n.id, n]))
  const out: Arrival[] = []
  for (const e of freshEvents(prev, next, now)) {
    if (e.event !== 'done') continue
    const part = partOfTask(e.node)
    const n = byId.get(e.node)
    if (part && n) out.push({ part, agent: n.agent, node: n.id, t: e.t })
  }
  return out
}

/** What the face says on hover, from the core's face state. */
export function faceTooltip(face: FaceState): string {
  return `Face · formed only by verified revenue · ${face.label}`
}
