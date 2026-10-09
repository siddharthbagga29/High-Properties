import type { Content } from '@jarvis/types'
import { BRIEF, reality } from './brief'
import { answer } from './guide'
import { agentFeed, agentStats, clock, feed, STATUS_LABEL, taskFeed, ventureStats } from './model'
import type { GraphState, Status } from './types'
import type { Focus } from '../store'

type SampleTurn = { role: 'user' | 'assistant'; content: string }
export type Sample = ((input: string | SampleTurn[], opts?: { onText?: (u: { text: string; delta?: string }) => void; signal?: AbortSignal; modelTier?: string; cache?: boolean }) => Promise<{ text: string; truncated?: boolean }>) | null

let samplePromise: Promise<Sample> | null = null
/** The viewer's Claude, if this view offers it. Resolved once, never prompts by itself. */
export function getSample(): Promise<Sample> {
  if (!samplePromise) {
    const c = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude
    samplePromise = c?.use ? c.use('sample').then(s => (s as Sample) ?? null).catch(() => null) : Promise.resolve(null)
  }
  return samplePromise
}

/**
 * Everything Claude may use to answer, for the object in focus, split by where it comes from so the prompt can
 * label it: `facts` are the record's own fields (statuses, counts, budgets: written by graph.py), `outputs` are
 * the agents' own words (excerpts of their files) and `activity` is their logged steps. Real data only, trimmed.
 */
export interface ContextParts { facts: string; outputs: string; activity: string }

export function contextParts(state: GraphState, st: Map<string, Status>, focus: Focus, t: number | null): ContextParts {
  const v = ventureStats(state, st, t)
  const head = [
    `PROJECT: ${state.project}.`,
    `NORTH STAR: ${state.north_star}`,
    `WHERE IT REALLY STANDS: ${reality(state, st)}`,
    `PROGRESS: ${v.done}/${v.total} tasks built, ${v.running} being worked on now (a step recorded in the last 15 minutes), ${v.stalled} marked running but silent, ${v.waiting} waiting on the founder, ${v.blocked} blocked. Last export ${state.generated}. Rows starting "Verifier" were written by the independent verifier, not the agent.`,
  ]
  const line = (e: { t: string; node: string; kind: string; text: string }) => `${e.t.slice(0, 16).replace('T', ' ')} ${e.node} ${e.kind}: ${e.text}`
  if (focus.kind === 'agent') {
    const a = agentStats(state, st, t ?? Date.now()).find(x => x.key === focus.id)
    if (a) return {
      facts: [...head,
        `AGENT: ${a.name}, district ${a.district}. Role: ${a.role}`,
        `TASKS: ${a.tasks.map(n => `${n.id} "${n.title}" [${STATUS_LABEL[st.get(n.id)!]}]${n.run ? ` used ${n.run.used_k}k tokens of ${n.budget_k}k, ${n.run.tools} tool calls` : ''}`).join('; ')}`].join('\n'),
      outputs: `OUTPUT SUMMARIES: ${a.tasks.flatMap(n => n.outputs.map(o => state.excerpts[o] ? `${o}: ${state.excerpts[o]}` : '')).filter(Boolean).join(' | ').slice(0, 6000)}`,
      activity: `ACTIVITY LOG (newest first, UTC):\n${agentFeed(state, a.key, t).slice(0, 90).map(line).join('\n')}`,
    }
  }
  if (focus.kind === 'task') {
    const n = state.nodes.find(x => x.id === focus.id)
    if (n) return {
      facts: [...head,
        `TASK: ${n.id} "${n.title}", owner ${state.agents[n.agent].name}, status ${STATUS_LABEL[st.get(n.id)!]}, phase ${n.phase}.`,
        `DEPENDS ON: ${n.deps.join(', ') || 'nothing'}. OUTPUTS: ${n.outputs.join(', ')}. ACCEPTANCE: ${n.accept.join('; ')}.${n.gate ? ` FOUNDER GATE: ${n.gate.reason}` : ''}`,
        n.run ? `RUN: ${n.run.used_k}k tokens processed vs ${n.budget_k}k budget, ${n.run.duration_s ?? '?'} s, ${n.run.tools} tool calls.` : 'RUN: not run yet.'].join('\n'),
      outputs: `OUTPUT SUMMARY: ${n.outputs.map(o => state.excerpts[o]).filter(Boolean).join(' | ').slice(0, 3000)}`,
      activity: `ACTIVITY LOG (newest first, UTC):\n${taskFeed(state, n.id, t).slice(0, 80).map(line).join('\n')}`,
    }
  }
  return {
    facts: [...head,
      `AGENTS: ${agentStats(state, st, t ?? Date.now()).map(a => `${a.name} (${a.district}): ${a.done}/${a.tasks.length} built${a.running ? `, working on ${a.running.id}` : ''}${a.stalled ? `, ${a.stalled.id} marked running but silent` : ''}${a.waiting ? `, ${a.waiting} waiting on founder` : ''}`).join('; ')}`,
      `FOUNDER GATES: ${state.nodes.filter(n => st.get(n.id) === 'awaiting_human').map(n => `${n.id} ${n.title}: ${n.gate?.reason ?? ''}`).join('; ') || 'none'}`].join('\n'),
    outputs: '',
    activity: `RECENT ACTIVITY (newest first, UTC):\n${feed(state, t).slice(0, 60).map(line).join('\n')}`,
  }
}

/** The project brief: written by the page's authors, so it travels as application context, not data. */
export const BRIEF_TEXT = `${BRIEF.idea}\nHOW IT WORKS: ${BRIEF.operating}\nEVIDENCE: ${BRIEF.evidence.map(e => e.text).join(' ')} ${BRIEF.refuted}\nMODEL: ${BRIEF.model}\nLESSON: ${BRIEF.lesson}`

/** The same context as one block (kept for callers that want plain text). */
export function contextFor(state: GraphState, st: Map<string, Status>, focus: Focus, t: number | null): string {
  const p = contextParts(state, st, focus, t)
  return [p.facts, p.outputs, p.activity].filter(Boolean).join('\n')
}

/** Labelled prompt parts: the brief as application context; the record, outputs and activity as wrapped data. */
export function labelledContext(state: GraphState, st: Map<string, Status>, focus: Focus, t: number | null): Content[] {
  const p = contextParts(state, st, focus, t)
  const parts: Content[] = [{ trust: 'application', text: `PROJECT BRIEF:\n${BRIEF_TEXT}` }]
  parts.push({ trust: 'tool', text: p.facts, source: 'project record (graph export)' })
  if (p.outputs) parts.push({ trust: 'external', text: p.outputs, source: 'agent outputs' })
  if (p.activity) parts.push({ trust: 'external', text: p.activity, source: 'agent activity log' })
  return parts
}

export interface AskResult { text: string; via: 'claude' | 'files'; dive?: Focus }

const RULES = `You answer questions about a live software project for its founder or a visitor. Use ONLY the data provided. If the answer is not in the data, say "That isn't in the project record yet." Never invent people, numbers, dates or sources. Prefer specifics: task ids, agent names, UTC times from the activity log. Plain language, at most 120 words, no headings.`

/** Ask about the object in focus. Claude answers when available; otherwise the rule-based guide answers from the same files. */
export async function ask(q: string, state: GraphState, st: Map<string, Status>, focus: Focus, t: number | null,
  onText: (text: string) => void, signal: AbortSignal): Promise<AskResult> {
  const sample = await getSample()
  if (sample) {
    try {
      // The injection guard and providers load with the first question, not with the page.
      const [{ assemble }, { sampleProvider }] = await Promise.all([import('@jarvis/injection'), import('@jarvis/providers')])
      const messages = assemble([{ trust: 'system', text: RULES }, ...labelledContext(state, st, focus, t), { trust: 'user', text: q }])
      const r = await sampleProvider(sample).chat(messages, { onText, signal, tier: 'quick' })
      return { text: r.text, via: 'claude' }
    } catch (e) {
      const code = (e as { code?: string }).code
      if (signal.aborted || code === 'cancelled') throw e
      // not_granted, rate_limited, refused, unavailable: fall through to the file-based answer
    }
  }
  if (signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' })
  const r = answer(q, state, st, t, focus)
  onText(r.text)
  return { text: r.text, via: 'files', dive: r.dive }
}

export const stamp = (iso: string) => `${clock(iso)} UTC`
