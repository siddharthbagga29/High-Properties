import { BRIEF, reality } from './brief'
import { agentFeed, agentStats, ago, clock, collapseFeed, fmtK, KIND_LABEL, ms, stalledNow, STATUS_LABEL, taskFeed, ventureStats, workingNow } from './model'
import type { ActivityEvent, GraphState, Status } from './types'
import type { Focus } from '../store'

export interface GuideReply {
  text: string
  /** Where the answer points. The UI offers it as a "Fly there" button; it never navigates by itself. */
  dive?: Focus
  panel?: 'pilot' | 'index'
  source?: string
  chips?: string[]
}

export const STARTER_CHIPS = ['What is this?', 'Who is working right now?', 'What changed recently?', 'What needs the founder?', 'Is this real data?', 'Request a pilot']

const at = (t: number | null) => t ?? Date.now()
const line = (e: ActivityEvent) => `${clock(e.t)} UTC ${KIND_LABEL[e.kind].toLowerCase()}: ${e.text}`

/** Narration for whatever is in focus. Short enough to be spoken. */
export function narrate(state: GraphState, st: Map<string, Status>, focus: Focus, t: number | null): string {
  const v = ventureStats(state, st, t)
  if (focus.kind === 'world' || focus.kind === 'brain') {
    const w = workingNow(state, st, at(t))
    const now = w.length ? `${w.length} ${w.length === 1 ? 'agent is' : 'agents are'} working: ${w.map(x => `${state.agents[x.agent].name} on ${x.node.id}`).join(', ')}.` : 'No agent is working right now.'
    return `${BRIEF.hook} ${v.done} of ${v.total} tasks are built and ${v.waiting} need the founder. ${now}`
  }
  if (focus.kind === 'agent') {
    const a = agentStats(state, st, at(t)).find(x => x.key === focus.id)
    if (!a) return 'That agent is not in the record.'
    const now = a.running ? `It is working on ${a.running.id}, ${a.running.title}.`
      : a.stalled ? `${a.stalled.id} is marked running, but nothing has been recorded for it recently, so no session is working on it.`
      : a.next ? `Next up: ${a.next.id}, ${a.next.title}.` : 'Nothing is ready for it right now.'
    return `${a.name} runs ${a.district}. ${a.role} ${a.done} of ${a.tasks.length} tasks built. ${now}`
  }
  const n = state.nodes.find(x => x.id === focus.id)
  if (!n) return 'That task is not in the record.'
  const s = st.get(n.id) ?? 'pending'
  const run = n.run ? ` It processed ${fmtK(n.run.used_k)} tokens against a ${n.budget_k}k budget.` : ''
  return `${n.id}, ${n.title}. Status: ${STATUS_LABEL[s]}. Owned by ${state.agents[n.agent].name}.${run}`
}

/** Whole-word match, so "new" does not fire on "renewal" and "who" does not fire on "whole". */
const has = (q: string, ...words: string[]) => words.some(w => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(q))

/** What the selected agent or task did and is doing, from its own records. Null if the question is not about that. */
function aboutFocus(q: string, state: GraphState, st: Map<string, Status>, focus: Focus, t: number | null): GuideReply | null {
  if (focus.kind !== 'agent' && focus.kind !== 'task') return null
  const now = at(t)
  const ev = collapseFeed(focus.kind === 'agent' ? agentFeed(state, focus.id, t) : taskFeed(state, focus.id, t))
  const asksNow = has(q, 'now', 'currently', 'working on', 'doing')
  const asksRecent = has(q, 'today', 'did', 'done', 'recent', 'latest', 'last', 'happen', 'changed', 'steps', 'log')
  const asksBlock = has(q, 'block', 'stuck', 'wait', 'founder', 'need')
  if (!asksNow && !asksRecent && !asksBlock) return null

  if (focus.kind === 'agent') {
    const a = agentStats(state, st, now).find(x => x.key === focus.id)
    if (!a) return null
    if (asksBlock) {
      const held = a.tasks.filter(n => st.get(n.id) === 'awaiting_human' || st.get(n.id) === 'blocked')
      return held.length
        ? { text: `${a.name} is held up on ${held.map(n => `${n.id} (${STATUS_LABEL[st.get(n.id)!]}${n.gate ? `: ${n.gate.reason}` : ''})`).join('; ')}`, dive: { kind: 'task', id: held[0].id } }
        : { text: `Nothing of ${a.name}'s is blocked or waiting on the founder.` }
    }
    if (asksNow && !asksRecent) {
      if (a.running) return { text: `${a.name} is working on ${a.running.id}, ${a.running.title}. Latest step: ${ev[0] ? line(ev[0]) : 'none yet'}.`, dive: { kind: 'task', id: a.running.id } }
      const idle = a.lastStep ? `Its last step was ${ago(a.lastStep, now)} (${clock(a.lastStep)} UTC).` : 'It has not recorded a step yet.'
      return { text: `${a.name} is not working right now. ${idle}${a.stalled ? ` ${a.stalled.id} is marked running but has no recent record.` : ''}` }
    }
    const day = ev.filter(e => now - ms(e.t) <= 86_400_000).slice(0, 5)
    if (!day.length) return { text: `${a.name} recorded nothing in the 24 hours before ${clock(now)} UTC.` }
    return { text: `${a.name}'s latest steps: ${day.map(line).join('. ')}.` }
  }

  const n = state.nodes.find(x => x.id === focus.id)
  if (!n) return null
  const s = st.get(n.id) ?? 'pending'
  if (asksBlock) return { text: n.gate && s === 'awaiting_human' ? `${n.id} is prepared and waits on the founder: ${n.gate.reason}` : s === 'blocked' ? `${n.id} is blocked. ${ev.find(e => e.kind === 'blocked')?.text ?? ''}` : `${n.id} is ${STATUS_LABEL[s].toLowerCase()} and not waiting on anyone.` }
  if (!ev.length) return { text: `Nothing has been recorded for ${n.id} yet. Status: ${STATUS_LABEL[s]}.` }
  return { text: `${n.id} (${STATUS_LABEL[s]}). Latest steps: ${ev.slice(0, 5).map(line).join('. ')}.` }
}

/** Answers questions from the brief and the live graph. Rule-based, so it can never invent a fact. */
export function answer(raw: string, state: GraphState, st: Map<string, Status>, t: number | null, focus: Focus = { kind: 'world' }): GuideReply {
  const q = raw.toLowerCase().trim()
  const now = at(t)
  const stats = agentStats(state, st, now)
  const v = ventureStats(state, st, t)

  // Direct references: a task id, an agent name or a district name.
  const task = state.nodes.find(n => new RegExp(`\\b${n.id.toLowerCase()}\\b`).test(q))
  if (task) return { text: narrate(state, st, { kind: 'task', id: task.id }, t), dive: { kind: 'task', id: task.id } }
  // Agent keys ("data", "legal", "brand") are ordinary words, so match names and districts only.
  const word = (w: string) => new RegExp(`\\b${w.toLowerCase()}\\b`).test(q)
  const agent = stats.find(a => word(a.name) || (a.district !== 'Tower' && word(a.district)))
  if (agent && !has(q, 'busiest', 'biggest')) {
    const r = aboutFocus(q, state, st, { kind: 'agent', id: agent.key }, t)
    return r ? { ...r, dive: r.dive ?? { kind: 'agent', id: agent.key } } : { text: narrate(state, st, { kind: 'agent', id: agent.key }, t), dive: { kind: 'agent', id: agent.key } }
  }
  const local = aboutFocus(q, state, st, focus, t)
  if (local) return local

  if (has(q, 'who is working', 'working', 'busy now', 'right now', 'active')) {
    const w = workingNow(state, st, now), s = stalledNow(state, st, now)
    const head = w.length ? `${w.map(x => `${state.agents[x.agent].name} on ${x.node.id} (last step ${ago(x.last, now)})`).join('; ')}.` : 'No agent is working right now.'
    const tail = s.length ? ` Marked running but silent, so no session is on them: ${s.map(x => x.node.id).join(', ')}.` : ''
    return { text: head + tail, dive: w[0] ? { kind: 'agent', id: w[0].agent } : undefined }
  }
  if (has(q, 'real', 'simulat', 'fake', 'data', 'source')) return { text: `${BRIEF.data} ${reality(state, st)}`, chips: ['What changed recently?', 'How do the agents work?'] }
  if (has(q, 'busiest', 'biggest', 'largest', 'most')) {
    const top = [...stats].sort((a, b) => b.done - a.done || b.toolCalls - a.toolCalls)[0]
    return { text: `${top.name}'s ${top.district}: ${top.done} of ${top.tasks.length} tasks built, ${top.toolCalls} recorded tool calls.`, dive: { kind: 'agent', id: top.key } }
  }
  if (has(q, 'change', 'recent', 'latest', 'today', 'new', 'happen')) {
    const ev = state.ledger.filter(e => t === null || ms(e.t) <= t).slice(-4).reverse()
    if (!ev.length) return { text: 'No ledger events yet at this point in the timeline.' }
    const lines = ev.map(e => `${clock(e.t)} UTC: ${e.event} ${e.node}${e.note ? `, ${e.note}` : ''}`).join('. ')
    return { text: `Latest from the ledger. ${lines}.`, dive: { kind: 'task', id: ev[0].node } }
  }
  if (has(q, 'founder', 'need me', 'waiting', 'gate', 'permission', 'approve', 'sign-off')) {
    const g = state.nodes.filter(n => st.get(n.id) === 'awaiting_human')
    if (!g.length) return { text: 'Nothing is waiting on the founder at this point in the timeline.' }
    return { text: `${g.length} prepared steps need the founder: ${g.map(n => `${n.id}, ${n.gate?.reason}`).join(' ')}`, dive: { kind: 'task', id: g[0].id } }
  }
  if (has(q, 'evidence', 'science', 'research', 'study', 'proof', 'does it work')) {
    return { text: `${BRIEF.evidence[0].text} ${BRIEF.evidence[1].text}`, source: BRIEF.evidence[1].source, dive: { kind: 'task', id: 'F03' } }
  }
  if (has(q, 'risk', 'kill', 'hypothes', 'fail', 'wrong')) return { text: `Four hypotheses decide this venture, tested cheapest first. ${BRIEF.hypotheses[0]} ${BRIEF.hypotheses[1]}`, dive: { kind: 'task', id: 'F05' } }
  if (has(q, 'money', 'revenue', 'arr', 'valuation', 'model', 'market', 'tam', '$')) return { text: BRIEF.model, dive: { kind: 'task', id: 'V10' } }
  if (has(q, 'memo', '72', 'quantum', 'snr', 'claim')) return { text: BRIEF.refuted, dive: { kind: 'task', id: 'F03' } }
  if (has(q, 'goal', 'end goal', 'aim', 'target', 'north star')) return { text: `${BRIEF.goal} ${reality(state, st)}`, dive: { kind: 'brain' } }
  if (has(q, 'agent', 'graph', 'orchestr', 'how do', 'token', 'work together', 'collaborat')) return { text: `${BRIEF.operating} ${BRIEF.lesson}`, dive: { kind: 'brain' } }
  if (has(q, 'headset', 'vr', 'quest', 'vision pro', 'browser')) return { text: BRIEF.claim.text, source: BRIEF.claim.source }
  if (has(q, 'pilot', 'join', 'sign', 'contact', 'book', 'buy', 'price', 'cost')) return { text: BRIEF.pilot, panel: 'pilot' }
  if (has(q, 'what is', 'about', 'idea', 'explain', 'what does', 'who')) return { text: `${BRIEF.idea} ${BRIEF.goal} ${reality(state, st)}` }
  if (has(q, 'progress', 'status', 'how far', 'done')) return { text: `${v.done} of ${v.total} tasks built, ${v.running} being worked on now, ${v.waiting} need the founder, ${v.blocked} blocked. ${v.steps} steps recorded so far.` }
  if (has(q, 'index', 'table', 'list')) return { text: 'Opening the full index: every level as a table with the same numbers.', panel: 'index' }
  return { text: 'I answer from the project files only. Try one of these.', chips: STARTER_CHIPS }
}
