/**
 * The status briefing (Online · Currently · Completed · Needs you · Next), computed from the Perspective Engine
 * record (city/public/state.json, or JARVIS_PE_STATE) plus the agent's own tasks and reminders. Nothing is estimated:
 * every count is a count of records, and a missing or unreadable state file is reported as such.
 */
import { readFileSync, statSync } from 'node:fs'
import { briefing, capitalize, numberWord, peContext, plural, timeOf, type JarvisContext, type PEState, type StatusItem } from '../../core/index'
import type { AgentReminder, AgentTask } from './store'

export interface PEStateInfo { ok: boolean; path: string; state?: PEState; error?: string; modifiedAt?: string; generated?: string }

let cache: { path: string; mtimeMs: number; info: PEStateInfo } | null = null

/** Reads and validates the exported state. Cached by modification time, so a fresh export is picked up at once. */
export function loadPEState(path: string): PEStateInfo {
  let mtimeMs: number
  try {
    mtimeMs = statSync(path).mtimeMs
  } catch (e) {
    return { ok: false, path, error: (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'the state file does not exist' : (e as Error).message }
  }
  if (cache && cache.path === path && cache.mtimeMs === mtimeMs) return cache.info
  let info: PEStateInfo
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<PEState>
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.ledger)) throw new Error('the file is not a Perspective Engine export (nodes and ledger missing)')
    const state = { agents: {}, project: 'Perspective Engine', generated: '', ...parsed } as PEState
    info = { ok: true, path, state, modifiedAt: new Date(mtimeMs).toISOString(), generated: state.generated || undefined }
  } catch (e) {
    info = { ok: false, path, error: `could not read the state file: ${(e as Error).message}` }
  }
  cache = { path, mtimeMs, info }
  return info
}

export interface Section { count: number; items: StatusItem[]; text: string }

export interface StatusBriefing {
  online: string
  currently: Section
  completed: Section
  needsYou: Section
  next: Section
  /** The project line, e.g. "Project: 19 complete, 0 in progress, 7 waiting on you, 0 blocked." */
  sentence: string
  lines: string[]
  spoken: string
  source: { path: string; ok: boolean; generated?: string; error?: string }
}

export interface ModelSummary { answering: string[]; local: boolean }

const list = (items: StatusItem[], max = 3) => {
  const shown = items.slice(0, max).map(i => `${i.id} ${i.title}`)
  return items.length > max ? `${shown.join('; ')}; and ${items.length - max} more` : shown.join('; ')
}

function section(items: StatusItem[], empty: string, lead: (n: number) => string): Section {
  return { count: items.length, items, text: items.length ? `${lead(items.length)}: ${list(items)}.` : empty }
}

/** Agent tasks that wait for the owner, as status items. */
function waitingTasks(tasks: AgentTask[]): StatusItem[] {
  return tasks
    .filter(t => t.status === 'waiting_for_user')
    .map(t => ({ id: t.id, title: t.title, detail: t.requiredUserInput ?? 'needs your confirmation', at: t.createdAt }))
}

function overdue(reminders: AgentReminder[], now: Date): StatusItem[] {
  return reminders
    .filter(r => (r.status === 'pending' || r.status === 'scheduled') && timeOf(r.dueAt) <= now.getTime())
    .map(r => ({ id: r.id, title: `Reminder: ${r.text}`, detail: r.lastError ? `due, not delivered: ${r.lastError}` : 'due now', at: r.dueAt }))
}

export function peContextFor(info: PEStateInfo, tasks: AgentTask[]): JarvisContext {
  if (info.ok && info.state) return peContext(info.state, 'owner', { currentTasks: tasks })
  return { applicationId: 'perspective-engine', applicationName: 'Perspective Engine', environment: 'production', viewer: 'owner', currentTasks: tasks }
}

export function statusBriefing(info: PEStateInfo, tasks: AgentTask[], reminders: AgentReminder[], models: ModelSummary, now: Date, startedAt: Date): StatusBriefing {
  const ctx = peContextFor(info, tasks)
  const ps = ctx.projectState
  const core = briefing(ctx, { greetingHour: now.getHours() })

  const answering = models.answering.filter(id => id !== 'rules')
  const online = `Online since ${startedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} on this machine. ${
    answering.length ? `Open questions go to ${answering.join(', then ')}, with the rules as the floor.` : 'No language model is available, so I answer from the record only.'
  }${info.ok ? '' : ` The project record is unavailable: ${info.error}.`}`

  const runningTasks: StatusItem[] = tasks.filter(t => t.status === 'running' || t.status === 'planning').map(t => ({ id: t.id, title: t.title, at: t.startedAt }))
  const currentlyItems = [...(ps?.in_progress ?? []), ...runningTasks]
  const completedItems = [...(ps?.completed ?? [])].sort((a, b) => timeOf(b.at) - timeOf(a.at))
  const needsItems = [...(ps?.waiting_for_user ?? []), ...waitingTasks(tasks), ...overdue(reminders, now)]
  const nextItems = ps?.next ?? []

  const sentence = ps
    ? `Project: ${ps.completed.length} complete, ${ps.in_progress.length} in progress, ${ps.waiting_for_user.length} waiting on you, ${ps.blocked.length} blocked.`
    : 'I have no project data yet, so there is nothing to report.'

  return {
    online,
    currently: section(currentlyItems, 'Nothing is running right now.', n => `${capitalize(numberWord(n))} in progress`),
    completed: section(completedItems, 'Nothing is complete yet.', n => `${capitalize(numberWord(n))} complete, most recent first`),
    needsYou: section(needsItems, 'Nothing needs you right now.', n => `${capitalize(numberWord(n))} ${plural(n, 'item needs', 'items need')} you`),
    next: section(nextItems, 'Nothing is ready to start.', n => `${capitalize(numberWord(n))} ready next`),
    sentence,
    lines: core.lines,
    spoken: core.spoken,
    source: { path: info.path, ok: info.ok, generated: info.generated, error: info.error },
  }
}
