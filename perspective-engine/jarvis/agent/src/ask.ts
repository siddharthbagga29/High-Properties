/**
 * POST /api/ask: deterministic intents first (status, next, needs you, reminders, decisions … answered from the
 * record, no model call), a few direct commands (web search, open a link, run the tests) through the tool registry,
 * and everything else to the routed model with memory and project status passed as wrapped data.
 */
import {
  assemble,
  capitalize,
  createReminder,
  label,
  numberWord,
  parseIntent,
  parseReminder,
  peEvents,
  plural,
  remember,
  route,
  sinceLast,
  type Content,
  type IntentKind,
  type LLMProvider,
  type MemoryItem,
  type PENode,
  type StatusItem,
} from '../../core/index'
import type { PEStateInfo, StatusBriefing } from './briefing'
import { AGENT_ROUTES } from './models'
import type { AgentReminder, AgentTask, ReminderStore, TaskStore } from './store'
import type { MemoryStore } from '../../core/index'

export type AskKind = IntentKind | 'research' | 'open_url' | 'run_tests'

export interface AskResult {
  intent: AskKind
  answer: string
  spoken: string
  items?: StatusItem[]
  stop?: boolean
  taskId?: string
  provider?: string
  reminder?: AgentReminder
  memory?: MemoryItem
  tool?: { id: string; ok: boolean; decision: string | number; summary: string; data?: unknown }
}

export interface ToolOutcome { ok: boolean; decision: string | number; summary: string; error?: string; data?: unknown; task: AgentTask }

export interface AskDeps {
  peState: () => PEStateInfo
  status: () => StatusBriefing
  tasks: TaskStore
  reminders: ReminderStore
  memory: MemoryStore & { search(q: string, k?: number): Promise<MemoryItem[]> }
  providers: () => Promise<LLMProvider[]>
  localOnly: () => boolean
  runTool: (id: string, input: Record<string, unknown>, opts: { confirmed: boolean; title?: string }) => Promise<ToolOutcome>
  completeTask: (title: string, verifiedBy: string, result?: unknown) => AgentTask
  failTask: (title: string, error: string) => AgentTask
  session: { get(): { lastVisit?: string }; set(s: { lastVisit?: string }): void }
  now: () => Date
  tzOffsetMinutes: () => number
}

export const SYSTEM_PROMPT =
  'You are Jarvis, the private assistant of the founder of Perspective Engine, running on their Mac. Be brief and concrete. ' +
  'Never claim something happened unless the provided records show it. If you do not know, say so. ' +
  'You cannot take actions from this conversation: if an action is needed, say which tool the founder can run from the console.'

const APPLICATION =
  'Application: Perspective Engine, a venture built through a task graph of agents. The owner is speaking to you through the local console.'

const RESEARCH = /^(?:please\s+)?(?:search(?:\s+the\s+web|\s+online)?(?:\s+for)?|look\s+up|google|web\s+search(?:\s+for)?|research)\s+(.{2,300})$/i
const RUN_TESTS = /^(?:please\s+)?(?:run|start)\s+(?:the\s+)?(?:jarvis\s+)?tests?$/i
const URLISH = /^(https?:\/\/\S+)$/i

function when(iso: string, tzOffsetMinutes: number): string {
  // Format in the owner's zone without depending on the process time zone.
  const shifted = new Date(Date.parse(iso) + tzOffsetMinutes * 60_000)
  const day = shifted.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const time = shifted.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  return `${time} on ${day}`
}

function describeNode(n: PENode, info: PEStateInfo): string {
  const agent = info.state?.agents?.[n.agent]?.name ?? n.agent
  const status = n.view ?? n.status
  const parts = [`${n.id}, ${n.title}: ${status.replace('_', ' ')}, owned by ${agent}.`]
  if (n.gate && status === 'awaiting_human') parts.push(`It waits on you: ${n.gate.reason}.`)
  if (n.accept?.length) parts.push(`Accepted when: ${n.accept.slice(0, 3).join('; ')}.`)
  if (n.deps?.length) parts.push(`Depends on ${n.deps.join(', ')}.`)
  return parts.join(' ')
}

function findNode(info: PEStateInfo, id?: string, target?: string): PENode | undefined {
  const nodes = info.state?.nodes ?? []
  if (id) {
    const hit = nodes.find(n => n.id.toUpperCase() === id.toUpperCase())
    if (hit) return hit
  }
  const t = target?.toLowerCase().trim()
  if (!t) return undefined
  return nodes.find(n => n.title.toLowerCase().includes(t)) ?? nodes.find(n => (info.state?.agents?.[n.agent]?.name ?? n.agent).toLowerCase() === t)
}

function auditAnswer(info: PEStateInfo, agent?: string): string {
  const audit = info.state?.audit as { computedAt?: string; scorecards?: Array<{ agent: string; name: string; score: number; grade: string; findings?: Array<{ status?: string }> }> } | undefined
  const cards = audit?.scorecards ?? []
  if (!cards.length) return 'There are no audit scorecards in the record yet.'
  const chosen = agent ? cards.filter(c => c.name.toLowerCase() === agent.toLowerCase() || c.agent.toLowerCase() === agent.toLowerCase()) : cards
  if (agent && !chosen.length) return `I have no scorecard for ${agent}.`
  const open = chosen.reduce((n, c) => n + (c.findings ?? []).filter(f => f.status !== 'fixed' && f.status !== 'accepted').length, 0)
  const list = [...chosen].sort((a, b) => b.score - a.score).map(c => `${c.name} ${c.grade} (${c.score})`).join(', ')
  return `Audit scorecards computed ${audit?.computedAt ?? 'at an unknown time'}: ${list}. ${capitalize(numberWord(open))} open ${plural(open, 'finding', 'findings')}.`
}

/** The rules provider's answer when no model is available: honest about the limit, points at what works. */
export function rulesAnswer(): string {
  return (
    'No language model is available right now, so I can only answer from the record. Ask "where are we", "what\'s next", ' +
    '"what do you need from me" or "remind me …". To enable open questions, start Ollama with a model or set ANTHROPIC_API_KEY.'
  )
}

export async function ask(rawText: string, deps: AskDeps): Promise<AskResult> {
  const text = String(rawText ?? '').trim().slice(0, 4000)
  const now = deps.now()
  if (!text) return { intent: 'chat', answer: 'I did not catch anything.', spoken: 'I did not catch anything.' }

  // ---- direct commands that map onto tools ----
  const research = text.match(RESEARCH)
  if (research) {
    const query = research[1].replace(/[?.!]+$/, '').trim()
    const out = await deps.runTool('research.search', { query }, { confirmed: false, title: `Search the web: ${query}` })
    const results = ((out.data as { results?: Array<{ title: string; url: string }> } | undefined)?.results ?? []).slice(0, 5)
    const answer = out.ok
      ? results.length
        ? `Top results for "${query}" (external, unverified): ${results.map((r, i) => `${i + 1}. ${r.title} (${r.url})`).join(' ')}`
        : `I searched for "${query}" but could not read any results.`
      : `The search did not work: ${out.summary}`
    return { intent: 'research', answer, spoken: out.ok ? `I found ${numberWord(results.length)} ${plural(results.length, 'result', 'results')}. They are on screen.` : answer, taskId: out.task.id, tool: toolInfo('research.search', out) }
  }
  if (RUN_TESTS.test(text)) {
    const out = await deps.runTool('shell.run', { program: 'npm', args: ['test'], cwd: 'jarvis' }, { confirmed: false, title: 'Run the Jarvis tests' })
    const answer = out.ok ? `The Jarvis tests passed: ${out.summary}.` : `The Jarvis tests did not pass: ${out.summary}.`
    return { intent: 'run_tests', answer, spoken: answer, taskId: out.task.id, tool: toolInfo('shell.run', out) }
  }

  const intent = parseIntent(text)
  const info = deps.peState()
  const brief = deps.status()

  switch (intent.kind) {
    case 'stop':
      return { intent: 'stop', answer: 'Stopped.', spoken: '', stop: true }

    case 'status': {
      const answer = [brief.sentence, ...brief.lines.filter(l => l !== brief.sentence)].join(' ')
      return { intent: 'status', answer, spoken: brief.spoken }
    }
    case 'working_on':
      return { intent: 'working_on', answer: brief.currently.text, spoken: brief.currently.text, items: brief.currently.items }
    case 'next':
      return { intent: 'next', answer: brief.next.text, spoken: brief.next.text, items: brief.next.items }
    case 'needs_me':
      return { intent: 'needs_me', answer: brief.needsYou.text, spoken: brief.needsYou.text, items: brief.needsYou.items }

    case 'since_last': {
      const session = deps.session.get()
      const since = sinceLast(info.state ? peEvents(info.state) : [], session.lastVisit ?? null, now)
      deps.session.set({ ...session, lastVisit: now.toISOString() })
      const top = since.items.slice(0, 5).map(i => i.title)
      const answer = top.length ? `${since.sentence} ${top.join('. ')}.` : since.sentence
      return { intent: 'since_last', answer, spoken: since.sentence }
    }

    case 'remind': {
      const wanted = intent.args.text || text
      const parsed = parseReminder(wanted, now, deps.tzOffsetMinutes())
      if (!parsed) {
        const answer = 'When should I remind you? For example: "remind me in 20 minutes to stretch" or "remind me tomorrow at 9 to review batch one".'
        return { intent: 'remind', answer, spoken: answer }
      }
      const reminder: AgentReminder = { ...createReminder(parsed.text, parsed.dueAt, now), channels: ['mac', 'speech', 'page'] }
      deps.reminders.put(reminder)
      const stored = deps.reminders.get(reminder.id)
      if (!stored) {
        const task = deps.failTask(`Reminder: ${reminder.text}`, 'the reminder could not be read back after saving')
        return { intent: 'remind', answer: 'I could not save that reminder.', spoken: 'I could not save that reminder.', taskId: task.id }
      }
      const task = deps.completeTask(`Set reminder: ${reminder.text}`, `reminder ${reminder.id} read back from reminders.json`, { reminder: reminder.id, dueAt: reminder.dueAt })
      const answer = `I will remind you to ${reminder.text} at ${when(reminder.dueAt, deps.tzOffsetMinutes())}.`
      return { intent: 'remind', answer, spoken: answer, reminder: stored, taskId: task.id }
    }

    case 'decide': {
      const decision = intent.args.decision?.trim()
      if (!decision) return { intent: 'decide', answer: 'What did you decide?', spoken: 'What did you decide?' }
      let item: MemoryItem
      try {
        item = await remember(deps.memory, 'decision', decision, now, { project: 'perspective-engine', source: 'owner (local console)' })
      } catch (e) {
        const answer = `I did not record that: ${(e as Error).message}.`
        return { intent: 'decide', answer, spoken: answer }
      }
      const back = (await deps.memory.all('decision')).find(m => m.id === item.id)
      const task = back
        ? deps.completeTask(`Record decision: ${decision.slice(0, 80)}`, `memory ${item.id} read back from memory.jsonl`)
        : deps.failTask(`Record decision: ${decision.slice(0, 80)}`, 'the decision could not be read back')
      const answer = back ? `Recorded your decision: ${item.text}` : 'I could not record that decision.'
      return { intent: 'decide', answer, spoken: back ? 'Recorded.' : answer, memory: back, taskId: task.id }
    }

    case 'audit': {
      const answer = auditAnswer(info, intent.args.agent)
      return { intent: 'audit', answer, spoken: answer }
    }

    case 'navigate': {
      const target = intent.args.target ?? ''
      if (URLISH.test(target)) {
        const out = await deps.runTool('open.url', { url: target }, { confirmed: false, title: `Open ${target}` })
        const answer = out.ok ? `Opened ${target}.` : `I could not open it: ${out.summary}`
        return { intent: 'open_url', answer, spoken: out.ok ? 'Opened.' : answer, taskId: out.task.id, tool: toolInfo('open.url', out) }
      }
      const node = findNode(info, intent.args.id, target)
      const answer = node ? describeNode(node, info) : `I could not find "${target}" in the project record.`
      return { intent: 'navigate', answer, spoken: answer }
    }

    case 'explain': {
      const node = findNode(info, intent.args.id, intent.args.subject)
      if (node) {
        const answer = describeNode(node, info)
        return { intent: 'explain', answer, spoken: answer }
      }
      if (!intent.args.subject) {
        const answer = 'Name a task and I will explain it, for example "explain V09".'
        return { intent: 'explain', answer, spoken: answer }
      }
      break // a general explanation goes to the model
    }

    case 'do_it': {
      const waiting = deps.tasks.list().filter(t => t.status === 'waiting_for_user' && t.pending)
      const next = brief.next.items[0]
      const parts: string[] = []
      if (waiting.length) parts.push(`${capitalize(numberWord(waiting.length))} ${plural(waiting.length, 'action waits', 'actions wait')} for your confirmation. Press Confirm on ${plural(waiting.length, 'it', 'the one you mean')} in the task list, so the approval is for exactly that action.`)
      parts.push(next ? `The next task in the graph is ${next.id} ${next.title}; the orchestrator starts graph work, not this console.` : 'Nothing in the graph is ready to start.')
      const answer = parts.join(' ')
      return { intent: 'do_it', answer, spoken: answer }
    }

    default:
      break
  }

  return chat(text, intent.kind === 'explain' ? 'explain' : 'chat', deps, brief)
}

async function chat(text: string, kind: AskKind, deps: AskDeps, brief: StatusBriefing): Promise<AskResult> {
  const providers = await deps.providers()
  const routeKind = deps.localOnly() ? 'sensitive' : 'conversation'
  let memories: MemoryItem[] = []
  try {
    memories = await deps.memory.search(text, 5)
  } catch {
    memories = []
  }
  const parts: Content[] = [
    label(SYSTEM_PROMPT, 'system'),
    label(APPLICATION, 'application'),
    // Project status is derived from records other agents wrote, so it is data, not instructions.
    label([brief.sentence, brief.currently.text, brief.needsYou.text, brief.next.text].join('\n'), 'tool', 'perspective-engine state.json'),
    ...memories.map(m => label(`${m.kind} (${m.at.slice(0, 10)}): ${m.text}${m.reason ? ` (because ${m.reason})` : ''}`, 'memory', 'jarvis memory')),
    label(text, 'user'),
  ]
  const title = `Answer: ${text.slice(0, 80)}`
  try {
    const provider = route(routeKind, providers, AGENT_ROUTES)
    const r = (await provider.chat(assemble(parts), { maxTokens: 800 })) as { text: string; provider?: string }
    const answeredBy = r.provider ?? provider.id
    const task = deps.completeTask(title, `answer returned by ${answeredBy}`, { provider: answeredBy })
    return { intent: kind, answer: r.text, spoken: r.text, provider: answeredBy, taskId: task.id }
  } catch (e) {
    const task = deps.failTask(title, (e as Error).message)
    const answer = `I could not answer that: ${(e as Error).message}`
    return { intent: kind, answer, spoken: 'I could not answer that.', taskId: task.id }
  }
}

function toolInfo(id: string, out: ToolOutcome): NonNullable<AskResult['tool']> {
  return { id, ok: out.ok, decision: out.decision, summary: out.summary, data: out.data }
}
