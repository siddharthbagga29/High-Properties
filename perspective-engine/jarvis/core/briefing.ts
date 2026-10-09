import { summarize } from './tasks'
import { capitalize, clip, joinClauses, numberWord, plural, timeOf } from './text'
import type { JarvisContext, ProjectState, StatusItem } from './types'

export interface BriefEvent { t: string; title: string; kind: string }
export interface SinceLast { items: BriefEvent[]; sentence: string }
export interface Briefing { greeting: string; lines: string[]; needsYou: StatusItem[]; next: StatusItem[]; spoken: string }

const FIRST_VISIT_WINDOW_MS = 24 * 60 * 60 * 1000

const was = (n: number) => plural(n, 'was', 'were')

/** How each event kind reads in a sentence, in the order clauses are spoken. Unknown kinds are counted as "other updates". */
const KIND_PHRASE: Array<[string[], (n: number) => string]> = [
  [['done', 'completed', 'verified'], n => `${was(n)} finished`],
  [['prepared', 'awaiting_human'], n => `${was(n)} prepared and now ${plural(n, 'needs', 'need')} you`],
  [['gate_cleared', 'clear-gate'], n => `${was(n)} cleared by you`],
  [['start', 'started'], n => `${was(n)} started`],
  [['block', 'blocked'], n => `${was(n)} blocked`],
  [['unblock', 'unblocked'], n => `${was(n)} unblocked`],
]

/** Events after the last visit (or in the last day on a first visit), newest first, with one sentence that counts them. */
export function sinceLast(events: BriefEvent[], lastVisitIso: string | null, now: Date): SinceLast {
  const end = now.getTime()
  const parsedStart = lastVisitIso ? Date.parse(lastVisitIso) : NaN
  const firstVisit = !Number.isFinite(parsedStart)
  const start = firstVisit ? end - FIRST_VISIT_WINDOW_MS : parsedStart
  const items = events
    .filter(e => {
      const t = timeOf(e.t)
      return t > start && t <= end
    })
    .sort((a, b) => timeOf(b.t) - timeOf(a.t))
  return { items, sentence: sinceSentence(items, firstVisit) }
}

function sinceSentence(items: BriefEvent[], firstVisit: boolean): string {
  if (!items.length) return firstVisit ? 'Nothing was recorded in the last day.' : 'Nothing has changed since your last visit.'
  const clauses: string[] = []
  let other = items.length
  for (const [kinds, phrase] of KIND_PHRASE) {
    const n = items.filter(e => kinds.includes(e.kind)).length
    if (!n) continue
    other -= n
    const subject = clauses.length === 0 ? `${numberWord(n)} ${plural(n, 'task', 'tasks')}` : numberWord(n)
    clauses.push(`${subject} ${phrase(n)}`)
  }
  if (other > 0) clauses.push(`${numberWord(other)} other ${plural(other, 'update', 'updates')} came in`)
  return `${firstVisit ? 'In the last day' : 'Since your last visit'}, ${joinClauses(clauses)}.`
}

function greetingFor(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24
  if (h < 5) return 'Hello'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function listItems(items: StatusItem[], max = 3): string {
  const shown = items.slice(0, max).map(i => `${i.id} ${i.title}`)
  const more = items.length - shown.length
  return more > 0 ? `${shown.join('; ')}; and ${more} more` : shown.join('; ')
}

function projectLine(ps: ProjectState, owner: boolean): string {
  const waiting = owner ? 'waiting on you' : 'waiting on the founder'
  return `Project: ${ps.completed.length} complete, ${ps.in_progress.length} in progress, ${ps.waiting_for_user.length} ${waiting}, ${ps.blocked.length} blocked.`
}

/** The opening briefing. Every number is counted from ctx.projectState and ctx.currentTasks; nothing is estimated. */
export function briefing(ctx: JarvisContext, opts: { greetingHour: number; since?: SinceLast }): Briefing {
  const ps = ctx.projectState
  const tasks = ctx.currentTasks ?? []
  const owner = ctx.viewer === 'owner'
  const greeting = `${greetingFor(opts.greetingHour)}.`
  const waitingTasks: StatusItem[] = tasks
    .filter(t => t.status === 'waiting_for_user')
    .map(t => (t.requiredUserInput ? { id: t.id, title: t.title, detail: t.requiredUserInput } : { id: t.id, title: t.title }))
  // Founder gates are the owner's business; a visitor's briefing only says how many exist.
  const needsYou = owner ? [...(ps?.waiting_for_user ?? []), ...waitingTasks] : []
  const next = ps?.next ?? []

  const lines: string[] = []
  if (ps) lines.push(projectLine(ps, owner))
  if (opts.since) lines.push(opts.since.sentence)
  if (needsYou.length) lines.push(`Needs you (${needsYou.length}): ${listItems(needsYou)}.`)
  if (next.length) lines.push(`Next (${next.length}): ${listItems(next)}.`)
  if (ps?.risks.length) lines.push(`Risks (${ps.risks.length}): ${listItems(ps.risks)}.`)
  if (owner && tasks.length) lines.push(`My own tasks: ${summarize(tasks).sentence}`)
  if (!lines.length) lines.push('I have no project data yet, so there is nothing to report.')

  return { greeting, lines, needsYou, next, spoken: spokenBrief(ctx, greeting, needsYou, opts.since) }
}

/** At most three short sentences: what is done, what needs the listener, what changed. */
function spokenBrief(ctx: JarvisContext, greeting: string, needsYou: StatusItem[], since?: SinceLast): string {
  const ps = ctx.projectState
  if (!ps && !ctx.currentTasks?.length) return `${greeting} I have no project data yet.`
  const parts = [greeting]
  if (ctx.viewer !== 'owner') {
    parts.push(`This is ${ctx.applicationName}.`)
    if (ps) parts.push(`${capitalize(numberWord(ps.completed.length))} ${plural(ps.completed.length, 'task is', 'tasks are')} complete and ${numberWord(ps.waiting_for_user.length)} ${plural(ps.waiting_for_user.length, 'is', 'are')} waiting on the founder.`)
    return parts.join(' ')
  }
  if (ps) parts.push(`${capitalize(numberWord(ps.completed.length))} ${plural(ps.completed.length, 'task is', 'tasks are')} complete.`)
  else parts.push(summarize(ctx.currentTasks ?? []).sentence)
  if (needsYou.length) {
    const first = clip(needsYou[0].title, 60)
    parts.push(`${capitalize(numberWord(needsYou.length))} ${plural(needsYou.length, 'item needs', 'items need')} you, starting with ${first}.`)
  } else parts.push('Nothing needs you right now.')
  if (since?.items.length) parts.push(`${capitalize(numberWord(since.items.length))} ${plural(since.items.length, 'update', 'updates')} since your last visit.`)
  return parts.join(' ')
}
