/**
 * Deterministic answers: the intents Jarvis can answer from the record without a model call
 * (status, working_on, next, needs_me, since_last, audit, explain). Every number is counted from the export,
 * the owner's own rows, or the published scorecards. Visitors get the public record only.
 */
import { peEvents, peProjectState, type PEState } from '@jarvis/adapters/perspective-engine'
import { sinceLast } from '@jarvis/briefing'
import { due } from '@jarvis/reminders'
import { capitalize, clip, joinClauses, numberWord, plural } from '@jarvis/text'
import type { Intent, ProjectState, Reminder, StatusItem, Viewer } from '@jarvis/types'
import { explainSimply, narrate } from '../data/guide'
import { ago, stalledNow, workingNow } from '../data/model'
import type { GraphState, Status } from '../data/types'
import type { Focus } from '../store'
import { auditSummary, cardSummary, findCard, kindWord, openFindings, type AuditView } from './scorecards'
import { resolveTarget } from './targets'
import type { Decision, OwnerRequest, Proposal, Reply } from './types'

export interface AnswerCtx {
  viewer: Viewer
  now: Date
  state: GraphState
  /** Live statuses (Jarvis always answers about the present, whatever moment is being replayed). */
  st: Map<string, Status>
  focus: Focus
  audit: AuditView
  /** The owner's previous visit; null on a first visit and for visitors (then "the last day"). */
  sinceIso: string | null
  owner: { reminders: Reminder[]; requests: OwnerRequest[]; decisions: Decision[] } | null
}

export const asPE = (s: GraphState) => s as unknown as PEState
export const projectOf = (c: Pick<AnswerCtx, 'state' | 'now'>): ProjectState => peProjectState(asPE(c.state), c.now)
export const sinceOf = (c: Pick<AnswerCtx, 'state' | 'now' | 'sinceIso'>) => sinceLast(peEvents(asPE(c.state)), c.sinceIso, c.now)

const ids = (items: StatusItem[], max = 3) => {
  const shown = items.slice(0, max).map(i => `${i.id} ${i.title}`)
  return items.length > max ? `${shown.join('; ')}; and ${items.length - max} more` : shown.join('; ')
}
const owner = (c: AnswerCtx) => c.viewer === 'owner'
/** The adapter words details for the founder ("follows once you clear V14"); a visitor hears "the founder". */
export const forViewer = (text: string | undefined, viewer: Viewer) => (text && viewer !== 'owner' ? text.replace(/\byou (clear|decide|approve|sign|answer)\b/g, 'the founder $1s').replace(/\byou\b/g, 'the founder').replace(/\byour\b/g, "the founder's") : text)
const proposal = (tool: string, input: Record<string, unknown>, say: string, now: Date): Proposal => ({ tool, input, say, at: now.getTime() })

// ---------- intents ----------

export function answerStatus(c: AnswerCtx): Reply {
  const ps = projectOf(c)
  const total = c.state.nodes.length
  const working = workingNow(c.state, c.st, c.now.getTime())
  const who = owner(c) ? 'wait on you' : 'wait on the founder'
  const lines = [
    `${ps.completed.length} of ${total} tasks are built and verified, ${ps.waiting_for_user.length} ${who}, ${ps.blocked.length} ${plural(ps.blocked.length, 'is', 'are')} blocked.`,
    working.length ? `${capitalize(numberWord(working.length))} ${plural(working.length, 'agent is', 'agents are')} working right now.` : 'No agent is working right now.',
  ]
  if (owner(c)) lines.push(sinceOf(c).sentence)
  if (owner(c) && c.owner) {
    const open = c.owner.requests.filter(r => r.status === 'queued' || r.status === 'running')
    if (open.length) lines.push(`${capitalize(numberWord(open.length))} of your requests ${plural(open.length, 'is', 'are')} open.`)
  }
  const spoken = `${capitalize(numberWord(ps.completed.length))} of ${total} tasks are built. ${capitalize(numberWord(ps.waiting_for_user.length))} ${who}.`
  return { text: lines.join(' '), spoken, via: 'rules' }
}

export function answerWorkingOn(c: AnswerCtx): Reply {
  const at = c.now.getTime()
  const working = workingNow(c.state, c.st, at)
  const stalled = stalledNow(c.state, c.st, at)
  const name = (k: string) => c.state.agents[k]?.name ?? k
  const parts: string[] = []
  if (working.length) parts.push(`${joinClauses(working.map(w => `${name(w.agent)} on ${w.node.id} (${w.node.title}), last step ${ago(w.last, at)}`))}.`)
  else parts.push('No agent is working right now: agents only work while a session runs them.')
  if (stalled.length) parts.push(`Marked running but silent, so nobody is on ${plural(stalled.length, 'it', 'them')}: ${stalled.map(s => s.node.id).join(', ')}.`)
  const running = c.owner?.requests.filter(r => r.status === 'running') ?? []
  if (owner(c) && running.length) parts.push(`The orchestrator is running your request “${clip(running[0].text, 60)}”.`)
  const dive: Focus | undefined = working[0] ? { kind: 'task', id: working[0].node.id } : undefined
  return { text: parts.join(' '), via: 'rules', dive }
}

/** The first next item that can actually start now (its inputs are all done), if any. */
export const firstReady = (ps: ProjectState) => ps.next.find(i => !i.detail || i.detail === 'ready to start') ?? null

export function answerNext(c: AnswerCtx): Reply {
  const ps = projectOf(c)
  if (!ps.next.length) {
    const waiting = ps.waiting_for_user.length
    return { text: `Nothing is ready to start. The remaining work waits on running tasks${waiting ? ` or on ${owner(c) ? 'you' : 'the founder'} (${waiting} ${plural(waiting, 'item', 'items')})` : ''}.`, via: 'rules' }
  }
  const list = ps.next.slice(0, 3).map(i => `${i.id} ${i.title} (${forViewer(i.detail, c.viewer) ?? 'ready to start'})`).join('; ')
  const text = `Next: ${list}${ps.next.length > 3 ? `; and ${ps.next.length - 3} more` : ''}.`
  const ready = firstReady(ps)
  const first = ready ?? ps.next[0]
  const spoken = `Next is ${first.id}, ${first.title}${ready ? '' : `; it ${forViewer(first.detail, c.viewer)}`}.`
  if (owner(c) && ready) {
    return {
      text: `${text} Say “continue the next task” and I'll queue ${ready.id} for the orchestrator's next hourly run.`,
      spoken,
      via: 'rules',
      dive: { kind: 'task', id: ready.id },
      proposal: proposal('jarvis.queue_request', { text: `Continue the next task: ${ready.id} ${ready.title}`, kind: 'task', ref: ready.id }, `queue ${ready.id} for the orchestrator`, c.now),
    }
  }
  return { text, spoken, via: 'rules', dive: { kind: 'task', id: first.id }, proposal: proposal('city.navigate', { target: first.id }, `open ${first.id}`, c.now) }
}

/** What waits on the founder, each with one line of what to do. Visitors see only the public count and ids. */
export function answerNeedsMe(c: AnswerCtx): Reply {
  const ps = projectOf(c)
  const gates = ps.waiting_for_user
  if (!owner(c)) {
    if (!gates.length) return { text: 'Nothing is waiting on the founder right now.', via: 'rules' }
    return { text: `That list is the founder's. Publicly, ${gates.length} prepared ${plural(gates.length, 'step waits', 'steps wait')} on the founder: ${gates.map(g => g.id).join(', ')}.`, via: 'rules' }
  }
  const waitingReq = c.owner?.requests.filter(r => r.status === 'waiting_for_user') ?? []
  const dueNow = c.owner ? due(c.owner.reminders, c.now) : []
  const total = gates.length + waitingReq.length + dueNow.length
  if (!total) return { text: 'Nothing needs you right now.', via: 'rules' }
  const lines = gates.slice(0, 4).map(g => `${g.id} ${g.title}: ${(g.detail ?? 'needs your decision').replace(/[.\s]+$/, '')}`)
  if (gates.length > 4) lines.push(`Plus ${gates.length - 4} more founder ${plural(gates.length - 4, 'gate', 'gates')} in the Brief`)
  waitingReq.forEach(r => lines.push(`Your request “${clip(r.text, 60)}”: ${(r.reason ?? 'needs your input').replace(/[.\s]+$/, '')}`))
  dueNow.forEach(r => lines.push(`Reminder due: ${r.text.replace(/[.\s]+$/, '')}`))
  const first = gates[0]
  return {
    text: `${capitalize(numberWord(total))} ${plural(total, 'item needs', 'items need')} you. ${lines.join('. ')}.`,
    spoken: `${capitalize(numberWord(total))} ${plural(total, 'item needs', 'items need')} you${first ? `, starting with ${first.id}, ${clip(first.title, 50)}` : ''}.`,
    via: 'rules',
    dive: first ? { kind: 'task', id: first.id } : undefined,
    proposal: first ? proposal('city.navigate', { target: first.id }, `open ${first.id}`, c.now) : null,
  }
}

export function answerSinceLast(c: AnswerCtx): Reply {
  const since = sinceOf(c)
  if (!since.items.length) return { text: since.sentence, via: 'rules' }
  const top = since.items.slice(0, 4).map(e => e.title)
  return { text: `${since.sentence} Latest: ${top.join('; ')}${since.items.length > 4 ? `; and ${since.items.length - 4} more` : ''}.`, spoken: since.sentence, via: 'rules' }
}

export function answerAudit(c: AnswerCtx, intent: Intent): Reply {
  const view = c.audit
  if (!view.cards.length) return { text: 'No scorecards have been published yet.', via: 'rules' }
  const who = intent.args.agent ?? ''
  const card = who ? findCard(view, who) ?? findCard(view, Object.entries(c.state.agents).find(([, a]) => a.name.toLowerCase() === who.toLowerCase())?.[0] ?? '') : null
  if (card) return { text: cardSummary(card), via: 'rules', dive: { kind: 'agent', id: card.agent } }
  if (/hallucinat|made[- ]up|fabricat|false claims/i.test(intent.text)) {
    const flagged = view.cards.map(cd => ({ cd, n: openFindings(cd).filter(f => f.kind === 'hallucination').length })).filter(x => x.n > 0)
    if (!flagged.length) return { text: 'No open finding is flagged as a possible hallucination.', via: 'rules' }
    const total = flagged.reduce((s, x) => s + x.n, 0)
    const first = openFindings(flagged[0].cd).find(f => f.kind === 'hallucination')!
    return {
      text: `${capitalize(numberWord(total))} open ${plural(total, 'finding is', 'findings are')} flagged as possible ${plural(total, 'hallucination', 'hallucinations')}: ${flagged.map(x => `${x.cd.name} ${x.n}`).join(', ')}. For example (${flagged[0].cd.name}, ${first.severity} ${kindWord(first.kind)}): ${clip(first.claim, 160)}`,
      spoken: `${capitalize(numberWord(total))} open ${plural(total, 'finding is', 'findings are')} flagged as possible hallucinations.`,
      via: 'rules',
    }
  }
  return { text: auditSummary(view), via: 'rules' }
}

export function answerExplain(c: AnswerCtx, intent: Intent): Reply {
  const subject = intent.args.subject ?? intent.args.id ?? ''
  const target = subject ? resolveTarget(subject, c.state) : null
  const focus: Focus = target?.kind === 'focus' ? target.focus : c.focus
  const text = c.viewer === 'owner' ? narrate(c.state, c.st, focus, null) : explainSimply(c.state, c.st, focus)
  return { text, via: 'rules', dive: target?.kind === 'focus' ? focus : undefined }
}

/** The deterministic intents; null when the intent needs an action or a model. */
export function answerIntent(intent: Intent, c: AnswerCtx): Reply | null {
  switch (intent.kind) {
    case 'status': return answerStatus(c)
    case 'working_on': return answerWorkingOn(c)
    case 'next': return answerNext(c)
    case 'needs_me': return answerNeedsMe(c)
    case 'since_last': return answerSinceLast(c)
    case 'audit': return answerAudit(c, intent)
    case 'explain': return answerExplain(c, intent)
    default: return null
  }
}
