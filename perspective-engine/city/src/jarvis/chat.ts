/**
 * Conversation with a model, for anything the deterministic intents do not cover. The prompt is assembled by the
 * core injection guard: standing rules and the project brief are instructions; the record, the agents' outputs and
 * activity, and the owner's own rows are wrapped as data that can never instruct. Providers: the viewer's Claude
 * through the `sample` capability first, the rule-based guide as the floor.
 */
import { assemble, label, neutralizeFences } from '@jarvis/injection'
import { ruleProvider, sampleProvider, withFallback } from '@jarvis/providers'
import type { ChatMessage, Content, LLMProvider, MemoryItem, Viewer } from '@jarvis/types'
import { labelledContext } from '../data/ask'
import { answer } from '../data/guide'
import type { GraphState, Status } from '../data/types'
import type { Focus } from '../store'
import type { ThreadMsg } from './types'

export const IDENTITY =
  'You are Jarvis, the one persistent assistant of Perspective Engine, built into its city view. ' +
  'Calm, concise, plain words; at most 120 words unless asked for more; no headings, no lists longer than four items. ' +
  'Answer only from the data provided. If something is not in it, say "That isn\'t in the project record yet." ' +
  'Never invent people, numbers, dates, sources or results. ' +
  'You cannot act in this reply: never say you did, started, sent, scheduled or changed anything. ' +
  'If asked to do project work, say the founder can ask you to queue it for the orchestrator and that it runs on the next hourly run.'

export function systemRules(viewer: Viewer): string {
  return viewer === 'owner'
    ? `${IDENTITY} You are talking with the founder, who owns this project. Their private reminders, requests and decisions may appear as data.`
    : `${IDENTITY} You are talking with a visitor, not the founder. Use only the public record. Never guess at or describe the founder's private reminders, requests, decisions or memory; say they are private if asked.`
}

const DEEP = /\b(why|how come|explain|compare|plan|strategy|should|trade-?offs?|risks?|summari[sz]e|analy[sz]e|evaluate|recommend|what if)\b/i

/** "quick" for short, simple questions; "default" for anything longer or asking for reasoning. */
export function chatTier(q: string): 'quick' | 'default' {
  const t = q.trim()
  return t.length <= 90 && !DEEP.test(t) ? 'quick' : 'default'
}

export interface ChatInput {
  question: string
  viewer: Viewer
  state: GraphState
  st: Map<string, Status>
  focus: Focus
  /** Recent turns of this conversation, oldest first. */
  history?: ThreadMsg[]
  /** Owner only: a short summary of their open reminders, requests and decisions. */
  ownerNotes?: string
  /** Owner only: recalled decision and preference memory. */
  memory?: MemoryItem[]
}

const HISTORY_TURNS = 6

/** System message, the last few turns, then the wrapped data and the new question as the final user turn. */
export function buildMessages(input: ChatInput): ChatMessage[] {
  const parts: Content[] = [label(systemRules(input.viewer), 'system'), ...labelledContext(input.state, input.st, input.focus, null)]
  if (input.viewer === 'owner') {
    if (input.ownerNotes) parts.push(label(input.ownerNotes, 'memory', "the founder's private Jarvis rows"))
    if (input.memory?.length) parts.push(label(input.memory.map(m => `${m.at.slice(0, 10)} ${m.kind}: ${m.text}`).join('\n'), 'memory', 'recalled memory'))
  }
  parts.push(label(input.question, 'user'))
  const [system, user] = assemble(parts)
  const turns: ChatMessage[] = (input.history ?? [])
    .filter(m => !m.busy && m.text.trim() && !m.kind)
    .slice(-HISTORY_TURNS)
    .map(m => ({ role: m.who === 'you' ? 'user' : 'assistant', content: m.who === 'you' ? neutralizeFences(m.text) : m.text }))
  // The sample capability needs the list to start with a user turn; a leading assistant turn is dropped.
  while (turns.length && turns[0].role === 'assistant') turns.shift()
  return [system, ...turns, user]
}

/** The page's provider chain: Claude through `sample` when this view has it, then the rule-based guide. */
export function pageProviders(sample: unknown, guide: (q: string) => string): LLMProvider {
  const chain: LLMProvider[] = []
  if (typeof sample === 'function') chain.push(sampleProvider(sample))
  chain.push(ruleProvider(guide))
  return withFallback(chain, 'page')
}

/** The guide's answer to a question, as plain text (the floor of the chain). */
export function guideText(state: GraphState, st: Map<string, Status>, focus: Focus) {
  return (q: string) => answer(q, state, st, null, focus).text
}
