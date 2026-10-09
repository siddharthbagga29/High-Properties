/**
 * One turn of the conversation: deterministic intents first (no model call), page actions through the core
 * registry and its policy, everything else through the model chain with the record wrapped as data.
 * Framework-free and clock-injected, so the whole flow is unit-tested with fakes.
 */
import { parseIntent } from '@jarvis/intent'
import type { Registry, RunResult } from '@jarvis/tools'
import type { ChatMessage, ChatOptions, Intent, MemoryItem, Reminder, Viewer } from '@jarvis/types'
import { clip } from '@jarvis/text'
import { statusesAt } from '../data/model'
import type { GraphState } from '../data/types'
import type { Focus } from '../store'
import { answerIntent, firstReady, forViewer, projectOf, type AnswerCtx } from './answers'
import { buildMessages, chatTier } from './chat'
import { planReminder, whenLabel } from './reminders'
import { looksLikeWork, requestLine } from './requests'
import type { AuditView } from './scorecards'
import { resolveTarget } from './targets'
import type { Decision, OwnerRequest, Proposal, Reply, ThreadMsg } from './types'

/** A proposal older than this is forgotten: "yes" an hour later should not act on it. */
export const PROPOSAL_TTL_MS = 10 * 60_000

export interface OwnerRows { reminders: Reminder[]; requests: OwnerRequest[]; decisions: Decision[] }

export interface ConvEnv {
  viewer: Viewer
  now(): Date
  /** The browser's UTC offset in minutes (reminder times are local). */
  tz: number
  state(): GraphState | null
  focus(): Focus
  audit(): AuditView
  /** The owner's previous visit (ISO) or null. */
  sinceIso(): string | null
  /** The owner's private rows; null for visitors and when this view has no private data. */
  owner(): OwnerRows | null
  registry: Registry
  proposal: { get(): Proposal | null; set(p: Proposal | null): void }
  /** The model chain (sample, then the guide). Resolves with the provider that answered. */
  chat(messages: ChatMessage[], opts: ChatOptions): Promise<{ text: string; provider?: string }>
  /** The conversation so far, without the question being answered. */
  history(): ThreadMsg[]
  /** Owner only: memory recalled for a question. */
  recall?(q: string): Promise<MemoryItem[]>
}

const VISITOR_DENIED = "That's for the founder: visitors can explore the city and ask anything about the public record, but can't change anything."

function ctxOf(env: ConvEnv, state: GraphState): AnswerCtx {
  return {
    viewer: env.viewer,
    now: env.now(),
    state,
    st: statusesAt(state, null),
    focus: env.focus(),
    audit: env.audit(),
    sinceIso: env.viewer === 'owner' ? env.sinceIso() : null,
    owner: env.viewer === 'owner' ? env.owner() : null,
  }
}

const run = (env: ConvEnv, tool: string, input: Record<string, unknown>): Promise<RunResult> =>
  // `confirmed` is true only because the founder just said this exact thing (or "yes" to this exact proposal).
  env.registry.run(tool, input, { viewer: env.viewer, confirmed: env.viewer === 'owner', now: env.now })

function refused(r: RunResult): string | null {
  if (r.ok) return null
  if (r.decision === 'denied' && r.error === 'denied') return VISITOR_DENIED
  return r.summary
}

async function remind(env: ConvEnv, intent: Intent): Promise<Reply> {
  if (env.viewer !== 'owner') return { text: 'Reminders are private to the founder, so I can’t set one here.', via: 'rules' }
  const now = env.now()
  const plan = planReminder(intent.text, now, env.tz)
  if (!plan.ok) return { text: plan.text, via: 'rules' }
  const r = await run(env, 'jarvis.set_reminder', { text: plan.reminder.text, dueAt: plan.reminder.dueAt, id: plan.reminder.id })
  const no = refused(r)
  if (no) return { text: no, via: 'action', ok: false }
  return { text: plan.text, spoken: plan.spoken, via: 'action', ok: true }
}

async function decide(env: ConvEnv, intent: Intent): Promise<Reply> {
  if (env.viewer !== 'owner') return { text: 'Only the founder can record decisions.', via: 'rules' }
  const decision = (intent.args.decision ?? '').trim()
  if (!decision) return { text: 'What did you decide? For example: “I decide the advisor rate is 50 dollars an hour”.', via: 'rules' }
  const r = await run(env, 'jarvis.record_decision', { text: decision })
  const no = refused(r)
  if (no) return { text: no, via: 'action', ok: false }
  return {
    text: `Recorded your decision: ${decision}. I've queued a request for the orchestrator to apply it on its next hourly run; I'll show its status here.`,
    spoken: 'Decision recorded. The orchestrator applies it on its next hourly run.',
    via: 'action',
    ok: true,
  }
}

async function queued(env: ConvEnv, input: Record<string, unknown>): Promise<Reply> {
  const r = await run(env, 'jarvis.queue_request', input)
  const no = refused(r)
  if (no) return { text: no, via: 'action', ok: false }
  return {
    text: `Queued: ${clip(String(input.text), 140)}. The orchestrator picks it up on its next hourly run; I'll show its status here as it changes.`,
    spoken: "Queued for the orchestrator's next hourly run.",
    via: 'action',
    ok: true,
  }
}

async function doIt(env: ConvEnv, intent: Intent, c: AnswerCtx): Promise<Reply> {
  const p = env.proposal.get()
  const fresh = p && env.now().getTime() - p.at <= PROPOSAL_TTL_MS ? p : null
  const wantsNext = /\bnext\b/i.test(intent.text)
  env.proposal.set(null)
  if (fresh && !(wantsNext && fresh.tool !== 'jarvis.queue_request')) {
    if (fresh.tool === 'jarvis.queue_request') return queued(env, fresh.input)
    const r = await run(env, fresh.tool, fresh.input)
    return { text: refused(r) ?? r.summary, via: 'action', ok: r.ok }
  }
  if (wantsNext) {
    const ps = projectOf(c)
    const next = firstReady(ps)
    if (!next) {
      const blocked = ps.next[0]
      return blocked
        ? { text: `Nothing can start yet: next is ${blocked.id} ${blocked.title}, which ${forViewer(blocked.detail, env.viewer)}.${env.viewer === 'owner' ? " I haven't queued anything." : ''}`, via: 'rules', dive: { kind: 'task', id: blocked.id } }
        : { text: 'Nothing is ready to start: the remaining work waits on running tasks or on the founder. I haven’t queued anything.', via: 'rules' }
    }
    if (env.viewer !== 'owner') return { text: `Only the founder can start work. Next up is ${next.id}, ${next.title}.`, via: 'rules', dive: { kind: 'task', id: next.id } }
    return queued(env, { text: `Continue the next task: ${next.id} ${next.title}`, kind: 'task', ref: next.id })
  }
  return { text: 'There is nothing waiting for a yes right now. Ask me something, or say “continue the next task”.', via: 'rules' }
}

async function navigate(env: ConvEnv, intent: Intent, state: GraphState): Promise<Reply | null> {
  const target = intent.args.target ?? ''
  // Not a place in the city ("find the evidence for pricing"): let the model answer instead.
  if (!resolveTarget(target, state)) return null
  const r = await run(env, 'city.navigate', { target })
  return { text: refused(r) ?? r.summary, via: 'action', ok: r.ok }
}

function ownerNotes(rows: OwnerRows | null, now: Date, tz: number): string | undefined {
  if (!rows) return undefined
  const lines: string[] = []
  rows.reminders.filter(r => r.status === 'pending' || r.status === 'scheduled').slice(0, 8).forEach(r => lines.push(`Reminder ${whenLabel(r.dueAt, now, tz)}: ${r.text}`))
  rows.requests.slice(0, 8).forEach(r => lines.push(`Request (${r.status}): ${r.text}. ${requestLine(r)}`))
  rows.decisions.slice(0, 8).forEach(d => lines.push(`Decision ${d.createdAt.slice(0, 10)} (${d.status}): ${d.text}`))
  return lines.length ? lines.join('\n') : undefined
}

export interface TurnIO { onText?: (text: string) => void; signal?: AbortSignal }

export async function respond(text: string, env: ConvEnv, io: TurnIO = {}): Promise<Reply> {
  const intent = parseIntent(text)
  if (intent.kind === 'stop') {
    env.proposal.set(null)
    return { text: 'Stopped.', via: 'rules', silent: true }
  }
  const state = env.state()
  if (!state) return { text: "The project record hasn't loaded yet, so I can't answer from it. Try again in a moment.", via: 'system' }
  const c = ctxOf(env, state)

  switch (intent.kind) {
    case 'remind': return remind(env, intent)
    case 'decide': return decide(env, intent)
    case 'do_it': return doIt(env, intent, c)
    case 'navigate': {
      const r = await navigate(env, intent, state)
      if (r) return r
      break
    }
    default: {
      const r = answerIntent(intent, c)
      if (r) {
        env.proposal.set(r.proposal ?? null)
        return r
      }
    }
  }

  // Build work is never run in the page: offer to queue it, and wait for an explicit yes.
  if (env.viewer === 'owner' && looksLikeWork(text)) {
    const p: Proposal = { tool: 'jarvis.queue_request', input: { text: text.trim(), kind: 'build' }, say: 'queue it for the orchestrator', at: env.now().getTime() }
    env.proposal.set(p)
    return {
      text: "That's build work, which the orchestrator runs through the task graph and its verifiers, not this page. Say “yes, do it” and I'll queue it for its next hourly run.",
      spoken: 'That is build work. Say yes, do it, and I will queue it.',
      via: 'rules',
      proposal: p,
    }
  }

  env.proposal.set(null)
  const memory = env.viewer === 'owner' && env.recall ? await env.recall(text).catch(() => []) : []
  const messages = buildMessages({
    question: text,
    viewer: env.viewer,
    state,
    st: c.st,
    focus: c.focus,
    history: env.history(),
    ownerNotes: env.viewer === 'owner' ? ownerNotes(c.owner, c.now, env.tz) : undefined,
    memory,
  })
  const r = await env.chat(messages, { onText: io.onText, signal: io.signal, tier: chatTier(text) })
  return { text: r.text, via: r.provider === 'rules' ? 'guide' : 'claude' }
}
