import { BRIEF } from './brief'
import { answer } from './guide'
import { agentFeed, agentStats, clock, feed, STATUS_LABEL, taskFeed, ventureStats } from './model'
import type { GraphState, Status } from './types'
import type { Focus } from '../store'

type Sample = ((input: string, opts?: { onText?: (u: { text: string }) => void; signal?: AbortSignal; modelTier?: string; cache?: boolean }) => Promise<{ text: string }>) | null

let samplePromise: Promise<Sample> | null = null
/** The viewer's Claude, if this view offers it. Resolved once, never prompts by itself. */
export function getSample(): Promise<Sample> {
  if (!samplePromise) {
    const c = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude
    samplePromise = c?.use ? c.use('sample').then(s => (s as Sample) ?? null).catch(() => null) : Promise.resolve(null)
  }
  return samplePromise
}

/** Everything Claude may use to answer, for the object in focus. Real data only, trimmed to fit. */
export function contextFor(state: GraphState, st: Map<string, Status>, focus: Focus, t: number | null): string {
  const v = ventureStats(state, st, t)
  const head = [
    `PROJECT: ${state.project}. ${BRIEF.idea}`,
    `NORTH STAR: ${state.north_star}`,
    `PROGRESS: ${v.done}/${v.total} tasks built, ${v.running} running, ${v.waiting} waiting on the founder, ${v.blocked} blocked. Last export ${state.generated}.`,
    `HOW IT WORKS: ${BRIEF.operating}`,
  ]
  const line = (e: { t: string; node: string; kind: string; text: string }) => `${e.t.slice(0, 16).replace('T', ' ')} ${e.node} ${e.kind}: ${e.text}`
  if (focus.kind === 'agent') {
    const a = agentStats(state, st).find(x => x.key === focus.id)!
    return [...head,
      `AGENT: ${a.name}, district ${a.district}. Role: ${a.role}`,
      `TASKS: ${a.tasks.map(n => `${n.id} "${n.title}" [${STATUS_LABEL[st.get(n.id)!]}]${n.run ? ` used ${n.run.used_k}k tokens of ${n.budget_k}k, ${n.run.tools} tool calls` : ''}`).join('; ')}`,
      `OUTPUT SUMMARIES: ${a.tasks.flatMap(n => n.outputs.map(o => state.excerpts[o] ? `${o}: ${state.excerpts[o]}` : '')).filter(Boolean).join(' | ').slice(0, 6000)}`,
      `ACTIVITY LOG (newest first, UTC):\n${agentFeed(state, a.key, t).slice(0, 90).map(line).join('\n')}`,
    ].join('\n')
  }
  if (focus.kind === 'task') {
    const n = state.nodes.find(x => x.id === focus.id)!
    return [...head,
      `TASK: ${n.id} "${n.title}", owner ${state.agents[n.agent].name}, status ${STATUS_LABEL[st.get(n.id)!]}, phase ${n.phase}.`,
      `DEPENDS ON: ${n.deps.join(', ') || 'nothing'}. OUTPUTS: ${n.outputs.join(', ')}. ACCEPTANCE: ${n.accept.join('; ')}.${n.gate ? ` FOUNDER GATE: ${n.gate.reason}` : ''}`,
      n.run ? `RUN: ${n.run.used_k}k tokens processed vs ${n.budget_k}k budget, ${n.run.duration_s ?? '?'} s, ${n.run.tools} tool calls.` : 'RUN: not run yet.',
      `OUTPUT SUMMARY: ${n.outputs.map(o => state.excerpts[o]).filter(Boolean).join(' | ').slice(0, 3000)}`,
      `ACTIVITY LOG (newest first, UTC):\n${taskFeed(state, n.id, t).slice(0, 80).map(line).join('\n')}`,
    ].join('\n')
  }
  return [...head,
    `AGENTS: ${agentStats(state, st).map(a => `${a.name} (${a.district}): ${a.done}/${a.tasks.length} built${a.running ? `, running ${a.running.id}` : ''}${a.waiting ? `, ${a.waiting} waiting on founder` : ''}`).join('; ')}`,
    `EVIDENCE: ${BRIEF.evidence.map(e => e.text).join(' ')} ${BRIEF.refuted}`,
    `MODEL: ${BRIEF.model}`,
    `LESSON: ${BRIEF.lesson}`,
    `RECENT ACTIVITY (newest first, UTC):\n${feed(state, t).slice(0, 60).map(line).join('\n')}`,
  ].join('\n')
}

export interface AskResult { text: string; via: 'claude' | 'files'; dive?: string }

const RULES = `You answer questions about a live software project for its founder or a visitor. Use ONLY the data below. If the answer is not in the data, say "That isn't in the project record yet." Never invent people, numbers, dates or sources. Prefer specifics: task ids, agent names, UTC times from the activity log. Plain language, at most 120 words, no headings.`

/** Ask about the object in focus. Claude answers when available; otherwise the rule-based guide answers from the same files. */
export async function ask(q: string, state: GraphState, st: Map<string, Status>, focus: Focus, t: number | null,
  onText: (text: string) => void, signal: AbortSignal): Promise<AskResult> {
  const sample = await getSample()
  if (sample) {
    try {
      const prompt = `${RULES}\n\nDATA:\n${contextFor(state, st, focus, t).slice(0, 60000)}\n\nQUESTION: ${q}`
      const r = await sample(prompt, { onText: u => onText(u.text), signal, modelTier: 'quick', cache: false })
      return { text: r.text, via: 'claude' }
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'cancelled') throw e
      // not_granted, rate_limited, unavailable: fall through to the file-based answer
    }
  }
  const r = answer(q, state, st, t)
  onText(r.text)
  return { text: r.text, via: 'files', dive: r.dive }
}

export const stamp = (iso: string) => `${clock(iso)} UTC`
