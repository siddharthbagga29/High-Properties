import { BRIEF } from './brief'
import { agentStats, focusKind, fmtK, fmtTime, ms, STATUS_LABEL, ventureStats } from './model'
import type { GraphState, Status } from './types'

export interface GuideReply {
  text: string
  dive?: string
  panel?: 'pilot' | 'index'
  source?: string
  chips?: string[]
}

export const STARTER_CHIPS = ['What is this?', 'What changed recently?', 'What needs the founder?', 'Show the busiest district', 'Is this real data?', 'Request a pilot']

/** Narration for whatever is in focus. Short enough to be spoken. */
export function narrate(state: GraphState, st: Map<string, Status>, focus: string, t: number | null): string {
  const kind = focusKind(state, focus)
  const v = ventureStats(state, st, t)
  if (kind === 'venture') {
    return `${BRIEF.hook} ${v.done} of ${v.total} tasks are built, ${v.running} are under construction, and ${v.waiting} wait on the founder.`
  }
  if (kind === 'city') {
    const top = [...agentStats(state, st)].sort((a, b) => b.done - a.done)[0]
    return `Nine districts, one per agent. The arcs are dependencies: when a task is built, light flows to the tasks that consume it. ${top.name}'s ${top.district} has built the most so far, ${top.done} towers.`
  }
  if (kind === 'agent') {
    const a = agentStats(state, st).find(x => x.key === focus)!
    const now = a.running ? `It is building ${a.running.id}, ${a.running.title}.` : a.next ? `Next up: ${a.next.id}, ${a.next.title}.` : 'Nothing is ready for it right now.'
    return `${a.name} runs ${a.district}. ${a.role} ${a.done} of ${a.tasks.length} tasks built. ${now}`
  }
  const n = state.nodes.find(x => x.id === focus)!
  const s = st.get(n.id)!
  const run = n.run ? ` It processed ${fmtK(n.run.used_k)} tokens against a ${n.budget_k}k budget${n.run.duration_s ? ` in ${Math.round(n.run.duration_s / 60)} minutes` : ''}.` : ''
  return `${n.id}, ${n.title}. Status: ${STATUS_LABEL[s]}. Owned by ${state.agents[n.agent].name}.${run} Each point orbiting the tower is one record: a criterion, an output, an input or a ledger event.`
}

const has = (q: string, ...words: string[]) => words.some(w => q.includes(w))

/** Answers questions from the brief and the live graph. Rule-based, so it can never invent a fact. */
export function answer(raw: string, state: GraphState, st: Map<string, Status>, t: number | null): GuideReply {
  const q = raw.toLowerCase().trim()
  const stats = agentStats(state, st)
  const v = ventureStats(state, st, t)

  // Direct navigation: a task id, an agent name or a district name.
  const task = state.nodes.find(n => new RegExp(`\\b${n.id.toLowerCase()}\\b`).test(q))
  if (task) return { text: narrate(state, st, task.id, t), dive: task.id }
  // Agent keys ("data", "legal", "brand") are ordinary words, so match names and districts only.
  const word = (w: string) => new RegExp(`\\b${w.toLowerCase()}\\b`).test(q)
  const agent = stats.find(a => word(a.name) || (a.district !== 'Tower' && word(a.district)))
  if (agent && !has(q, 'busiest', 'biggest')) return { text: narrate(state, st, agent.key, t), dive: agent.key }

  if (has(q, 'real', 'simulat', 'fake', 'data', 'source')) return { text: BRIEF.data, chips: ['What changed recently?', 'How do the agents work?'] }
  if (has(q, 'busiest', 'biggest', 'largest', 'most')) {
    const top = [...stats].sort((a, b) => b.done - a.done || b.used - a.used)[0]
    return { text: `${top.name}'s ${top.district}: ${top.done} of ${top.tasks.length} tasks built, ${fmtK(top.used)} tokens spent. Flying there now.`, dive: top.key }
  }
  if (has(q, 'change', 'recent', 'latest', 'today', 'new', 'happen')) {
    const ev = state.ledger.filter(e => t === null || ms(e.t) <= t).slice(-4).reverse()
    if (!ev.length) return { text: 'No ledger events yet at this point in the timeline.' }
    const lines = ev.map(e => `${fmtTime(ms(e.t))}: ${e.event} ${e.node}${e.note ? `, ${e.note}` : ''}`).join('. ')
    return { text: `Latest from the ledger. ${lines}.`, dive: ev[0].node }
  }
  if (has(q, 'founder', 'need me', 'waiting', 'gate', 'permission', 'approve', 'sign-off')) {
    const g = state.nodes.filter(n => st.get(n.id) === 'awaiting_human')
    if (!g.length) return { text: 'Nothing is waiting on the founder at this point in the timeline.' }
    return { text: `${g.length} prepared steps wait on the founder: ${g.map(n => `${n.id}, ${n.gate?.reason}`).join(' ')}`, dive: g[0].id }
  }
  if (has(q, 'evidence', 'science', 'research', 'study', 'proof', 'work?', 'does it work')) {
    return { text: `${BRIEF.evidence[0].text} ${BRIEF.evidence[1].text}`, source: BRIEF.evidence[1].source, dive: 'F03' }
  }
  if (has(q, 'risk', 'kill', 'hypothes', 'fail', 'wrong')) return { text: `Four hypotheses decide this venture, tested cheapest first. ${BRIEF.hypotheses[0]} ${BRIEF.hypotheses[1]}`, dive: 'F05' }
  if (has(q, 'money', 'revenue', 'arr', 'valuation', 'model', 'market', 'tam', '$')) return { text: BRIEF.model, dive: 'V10' }
  if (has(q, 'memo', '72', 'quantum', 'snr', 'claim')) return { text: BRIEF.refuted, dive: 'F03' }
  if (has(q, 'agent', 'graph', 'orchestr', 'how do', 'token', 'work together', 'collaborat')) return { text: `${BRIEF.operating} ${BRIEF.lesson}`, dive: 'city' }
  if (has(q, 'headset', 'vr', 'quest', 'vision pro', 'browser')) return { text: BRIEF.claim.text, source: BRIEF.claim.source }
  if (has(q, 'pilot', 'join', 'sign', 'contact', 'book', 'buy', 'price', 'cost')) return { text: BRIEF.pilot, panel: 'pilot' }
  if (has(q, 'what is', 'about', 'idea', 'explain', 'what does', 'who')) return { text: `${BRIEF.idea} ${BRIEF.claim.text}`, source: BRIEF.claim.source, dive: 'venture' }
  if (has(q, 'progress', 'status', 'how far', 'done')) return { text: `${v.done} of ${v.total} tasks built, ${v.running} building, ${v.waiting} waiting on the founder, ${v.blocked} blocked. ${v.events} ledger events so far.`, dive: 'city' }
  if (has(q, 'index', 'table', 'list')) return { text: 'Opening the full index: every level as a table with the same numbers.', panel: 'index' }
  return { text: 'I answer from the project files only. Try one of these.', chips: STARTER_CHIPS }
}
