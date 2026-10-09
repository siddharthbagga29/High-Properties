import { describe, expect, it } from 'vitest'
import { briefing, sinceLast } from '../core/briefing'
import { createTask, transition } from '../core/tasks'
import type { JarvisContext, ProjectState, StatusItem } from '../core/types'

const NOW = new Date('2026-10-08T12:00:00Z')
const si = (id: string, title = `Task ${id}`, detail?: string): StatusItem => (detail ? { id, title, detail } : { id, title })

const projectState = (over: Partial<ProjectState> = {}): ProjectState => ({
  completed: ['F01', 'F02', 'F03'].map(id => si(id)),
  in_progress: [si('V05')],
  blocked: [],
  waiting_for_user: [si('D01', 'Founder decision sheet', 'Only the founder can answer'), si('V09', 'Send outreach batch 1', 'Needs Gmail authorization')],
  next: [si('M01', 'MVP iteration')],
  risks: [],
  ...over,
})

const ctx = (over: Partial<JarvisContext> = {}): JarvisContext => ({
  applicationId: 'perspective-engine', applicationName: 'Perspective Engine', environment: 'production', viewer: 'owner', projectState: projectState(), ...over,
})

describe('sinceLast', () => {
  const events = [
    { t: '2026-10-07T10:00:00Z', title: 'Ada started F04', kind: 'start' },
    { t: '2026-10-08T08:00:00Z', title: 'Ada finished F04', kind: 'done' },
    { t: '2026-10-08T09:00:00Z', title: 'Ogilvy prepared V09', kind: 'prepared' },
    { t: '2026-10-08T09:30:00Z', title: 'Curie finished V15', kind: 'done' },
    { t: '2026-10-08T10:00:00Z', title: 'V12 was blocked', kind: 'block' },
    { t: '2026-10-08T11:00:00Z', title: 'Odd thing', kind: 'note' },
    { t: '2026-10-08T13:00:00Z', title: 'From the future', kind: 'done' },
  ]

  it('keeps events after the last visit and up to now, newest first', () => {
    const r = sinceLast(events, '2026-10-08T07:00:00Z', NOW)
    expect(r.items.map(e => e.title)).toEqual(['Odd thing', 'V12 was blocked', 'Curie finished V15', 'Ogilvy prepared V09', 'Ada finished F04'])
    expect(r.sentence).toBe('Since your last visit, two tasks were finished, one was prepared and now needs you, one was blocked, and one other update came in.')
  })

  it('says when nothing changed', () => {
    expect(sinceLast(events, '2026-10-08T11:30:00Z', NOW)).toEqual({ items: [], sentence: 'Nothing has changed since your last visit.' })
  })

  it('looks back one day on a first visit', () => {
    const r = sinceLast(events, null, NOW)
    expect(r.items).toHaveLength(5)
    expect(r.sentence.startsWith('In the last day, two tasks were finished')).toBe(true)
    expect(sinceLast([], null, NOW).sentence).toBe('Nothing was recorded in the last day.')
  })

  it('uses singular forms', () => {
    expect(sinceLast([events[1]], '2026-10-08T07:00:00Z', NOW).sentence).toBe('Since your last visit, one task was finished.')
  })
})

describe('briefing', () => {
  it('builds an owner briefing whose numbers come from the context', () => {
    const b = briefing(ctx(), { greetingHour: 8 })
    expect(b.greeting).toBe('Good morning.')
    expect(b.lines[0]).toBe('Project: 3 complete, 1 in progress, 2 waiting on you, 0 blocked.')
    expect(b.lines).toContain('Needs you (2): D01 Founder decision sheet; V09 Send outreach batch 1.')
    expect(b.lines).toContain('Next (1): M01 MVP iteration.')
    expect(b.needsYou.map(i => i.id)).toEqual(['D01', 'V09'])
    expect(b.next.map(i => i.id)).toEqual(['M01'])
    expect(b.spoken).toBe('Good morning. Three tasks are complete. Two items need you, starting with Founder decision sheet.')
  })

  it('never states a number that is not in the context', () => {
    const b = briefing(ctx(), { greetingHour: 8 })
    const allowed = new Set(['0', '1', '2', '3'])
    for (const n of [...b.lines.join(' ').matchAll(/\b\d+\b/g)].map(m => m[0])) expect(allowed.has(n), n).toBe(true)
  })

  it('keeps the spoken text short', () => {
    const many = projectState({ waiting_for_user: Array.from({ length: 9 }, (_, i) => si(`W${i}`, 'A very long founder gate title that keeps going and going and going on')) })
    const since = sinceLast([{ t: '2026-10-08T11:00:00Z', title: 'x', kind: 'done' }], '2026-10-08T10:00:00Z', NOW)
    const b = briefing(ctx({ projectState: many }), { greetingHour: 20, since })
    expect(b.spoken.split(/\s+/).length).toBeLessThanOrEqual(40)
    expect(b.spoken).toContain('Nine items need you')
    expect(b.spoken).toContain('One update since your last visit.')
    expect(b.lines).toContain(since.sentence)
    expect(b.lines.find(l => l.startsWith('Needs you'))).toMatch(/and 6 more\.$/)
  })

  it('adds Jarvis tasks that wait on the owner, with what they need', () => {
    let t = createTask({ title: 'Approve batch 2', source: 'jarvis' }, NOW, 'J1')
    t = transition(transition(t, 'running', NOW), 'waiting_for_user', NOW, undefined, { requiredUserInput: 'Say yes or no' })
    const b = briefing(ctx({ currentTasks: [t] }), { greetingHour: 14 })
    expect(b.greeting).toBe('Good afternoon.')
    expect(b.needsYou.at(-1)).toEqual({ id: 'J1', title: 'Approve batch 2', detail: 'Say yes or no' })
    expect(b.lines).toContain('My own tasks: I need your decision on one item.')
  })

  it('reports risks when there are any', () => {
    const b = briefing(ctx({ projectState: projectState({ risks: [si('V05', 'Pilot list', 'marked running but nothing recorded for 40 minutes')] }) }), { greetingHour: 9 })
    expect(b.lines).toContain('Risks (1): V05 Pilot list.')
  })

  it('gives visitors counts but not the founder queue', () => {
    const b = briefing(ctx({ viewer: 'visitor' }), { greetingHour: 19 })
    expect(b.needsYou).toEqual([])
    expect(b.lines[0]).toBe('Project: 3 complete, 1 in progress, 2 waiting on the founder, 0 blocked.')
    expect(b.lines.join(' ')).not.toContain('Needs you')
    expect(b.spoken).toBe('Good evening. This is Perspective Engine. Three tasks are complete and two are waiting on the founder.')
  })

  it('says so honestly when there is no data', () => {
    const b = briefing(ctx({ projectState: undefined }), { greetingHour: 3 })
    expect(b.lines).toEqual(['I have no project data yet, so there is nothing to report.'])
    expect(b.spoken).toBe('Hello. I have no project data yet.')
  })
})
