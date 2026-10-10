/** Scorecards, the owner's private paths, the presence line and the briefing, against the real export. */
import { readFileSync } from 'node:fs'
import { createReminder } from '@jarvis/reminders'
import { describe, expect, it } from 'vitest'
import type { GraphState } from '../data/types'
import { composeBrief } from './brief'
import { createFakeDb, flush } from './fake-db'
import { COLLECTIONS, createOwnerData, dbErrorText, ownerPaths, readTask } from './owner-data'
import { completedSince, dueNow, presence } from './presence'
import { peEvents, type PEState } from '@jarvis/adapters/perspective-engine'
import { sinceLast } from '@jarvis/briefing'
import { due } from '@jarvis/reminders'
import { createRequest } from './requests'
import { auditSummary, cardSummary, findCard, gradeOf, readAudit, topFindings } from './scorecards'
import { resolveTarget } from './targets'

const state = JSON.parse(readFileSync(new URL('../../public/state.json', import.meta.url), 'utf8')) as GraphState
const NOW = new Date('2026-10-09T13:00:00Z')

describe('scorecards', () => {
  const view = readAudit(state)
  it('reads every published card, best first', () => {
    expect(view.cards).toHaveLength(9)
    expect(view.cards.map(c => c.score)).toEqual([...view.cards.map(c => c.score)].sort((a, b) => b - a))
    // Exactly the cards the auditor marked: score >= 80 and no open critical finding.
    for (const c of view.cards) {
      const openCritical = c.findings.some(f => f.severity === 'critical' && f.status === 'open')
      expect(c.meetsInstitutionalBar, c.agent).toBe(c.score >= 80 && !openCritical)
    }
    expect(view.notice).toContain('not a certification')
  })
  it('summarises the team and one agent with its top findings', () => {
    const meet = view.cards.filter(c => c.meetsInstitutionalBar)
    expect(auditSummary(view)).toMatch(new RegExp(`^${meet.length} of 9 agents meet the institutional bar`))
    const lowest = view.cards[view.cards.length - 1]
    expect(auditSummary(view)).toContain(`Lowest: ${lowest.name} at ${Math.round(lowest.score)} (${lowest.grade}).`)
    const curie = findCard(view, 'curie')!
    expect(cardSummary(curie)).toContain(`Curie: ${Math.round(curie.score)} out of 100, grade ${curie.grade}; ` +
      `${curie.meetsInstitutionalBar ? 'meets' : 'does not meet'} the institutional bar.`)
    // Top findings put open before closed and severe before minor.
    const top = topFindings(curie)
    const rank = (f: { status: string; severity: string }) => (f.status === 'open' ? 0 : 3) + ({ critical: 0, major: 1, minor: 2 } as Record<string, number>)[f.severity]
    expect(top.map(rank)).toEqual([...top.map(rank)].sort((a, b) => a - b))
  })
  it('drops malformed rows instead of trusting them', () => {
    const v = readAudit({ audit: { scorecards: [{ agent: 'x', score: 'high' }, { agent: 'y', score: 91, findings: [{ severity: 'apocalyptic', claim: 'c' }, { severity: 'minor', claim: 'ok' }] }, null] } })
    expect(v.cards).toHaveLength(1)
    expect(v.cards[0]).toMatchObject({ agent: 'y', grade: 'A', meetsInstitutionalBar: false })
    expect(v.cards[0].findings).toHaveLength(1)
    expect(readAudit({}).cards).toEqual([])
    expect(auditSummary(readAudit(null))).toBe('No scorecards have been published yet.')
    expect(gradeOf(59.9)).toBe('F')
  })
})

describe("the owner's private paths", () => {
  it('put every collection under the owner’s own subtree with a valid collection path', () => {
    const p = ownerPaths(state.agents ? 'u_abc' : 'x')
    expect(p.prefs).toBe('data/users/u_abc/jarvis-prefs')
    for (const k of Object.keys(COLLECTIONS) as Array<keyof typeof COLLECTIONS>) {
      const path = p.collection(k)
      expect(path.startsWith('data/users/u_abc/jarvis/jarvis-')).toBe(true)
      expect(path.split('/').length % 2).toBe(1)
    }
    expect(p.prefs.split('/').length % 2).toBe(0)
    expect(() => ownerPaths('../other')).toThrow()
    expect(() => ownerPaths('')).toThrow()
  })
  it('the fake store enforces the same grammar the platform does', () => {
    const db = createFakeDb()
    expect(() => db.collection('data/users/u_abc/jarvis-reminders')).toThrow(/not a collection/)
    expect(() => db.collection(ownerPaths('u_abc').collection('reminders'))).not.toThrow()
  })
  it('subscribes to prefs and lists, and reports a missing prefs doc as loaded', async () => {
    const db = createFakeDb()
    const data = createOwnerData(db, 'u_abc')
    const patches: Array<Record<string, unknown>> = []
    const off = data.watch(p => patches.push(p))
    await flush()
    expect(patches).toContainEqual({ prefs: null, prefsLoaded: true })
    await data.saveRequest(createRequest('x', 'build', NOW))
    await data.savePrefs({ lastVisit: NOW.toISOString(), voice: { speak: false, rate: 1 }, quietHours: { enabled: true, start: '22:00', end: '07:00' } })
    await flush()
    off()
    expect(patches.some(p => Array.isArray(p.requests) && (p.requests as unknown[]).length === 1)).toBe(true)
    expect(patches.some(p => (p.prefs as { voice?: { speak?: boolean } } | null)?.voice?.speak === false)).toBe(true)
  })
  it('words database refusals for the owner', () => {
    expect(dbErrorText({ code: 'invalid_argument' })).toBe("this view isn't allowed to write your private data")
    expect(dbErrorText({ code: 'something new' })).toBe('the database could not be reached')
  })
  it('never shows an unverified Jarvis task as completed', () => {
    expect(readTask('t', { title: 'x', status: 'completed', createdAt: NOW.toISOString() })?.status).toBe('failed')
    expect(readTask('t', { title: 'x', status: 'completed', createdAt: NOW.toISOString(), verifiedBy: 'read back' })?.status).toBe('completed')
  })
})

describe('presence line', () => {
  const base = { data: state, source: 'live' as const, status: 'ready' as const, now: NOW.getTime(), requests: [], reminders: [] }
  const gates = state.nodes.filter(n => n.view === 'awaiting_human').length
  it('counts from the record for a visitor', () => {
    const p = presence({ ...base, viewer: 'visitor', sinceIso: null })
    expect(p).toMatchObject({ online: 'online', onlineLabel: 'Online', currently: 'Nobody working', needs: gates, needsLabel: 'Waiting on founder', next: 'M01', completedLabel: 'in the last day' })
  })
  it('adds the owner’s waiting requests and due reminders to "Needs you"', () => {
    const waiting = { ...createRequest('x', 'build', NOW), status: 'waiting_for_user' as const }
    const dueR = createReminder('due', '2026-10-09T12:00:00Z', new Date('2026-10-08T00:00:00Z'))
    const p = presence({ ...base, viewer: 'owner', sinceIso: '2026-10-07T00:00:00Z', requests: [waiting], reminders: [dueR] })
    expect(p.needs).toBe(gates + 2)
    expect(p.needsLabel).toBe('Needs you')
    expect(p.completedLabel).toBe('since your last visit')
    const doneSince = state.ledger.filter(e => e.event === 'done' && e.t > '2026-10-07T00:00:00Z' && !state.nodes.find(n => n.id === e.node)?.gate).length
    expect(p.completed).toBe(doneSince)
  })
  it('counts exactly as the core does (kept inline to keep the parser out of first paint)', () => {
    const events = peEvents(state as unknown as PEState)
    for (const since of [null, '2026-10-06T00:00:00Z', '2026-10-07T12:00:00Z', '2026-10-09T00:00:00Z']) {
      for (const at of [new Date('2026-10-07T20:00:00Z'), NOW]) {
        expect(completedSince(events, since, at.getTime())).toBe(sinceLast(events, since, at).items.filter(e => e.kind === 'done').length)
      }
    }
    const list = [
      createReminder('a', '2026-10-09T12:00:00Z', new Date('2026-10-08T00:00:00Z'), 'a'),
      { ...createReminder('b', '2026-10-09T12:00:00Z', new Date('2026-10-08T00:00:00Z'), 'b'), status: 'scheduled' as const },
      { ...createReminder('c', '2026-10-09T12:00:00Z', new Date('2026-10-08T00:00:00Z'), 'c'), status: 'delivered' as const },
      createReminder('d', '2026-10-10T12:00:00Z', new Date('2026-10-08T00:00:00Z'), 'd'),
    ]
    expect(dueNow(list, NOW.getTime()).map(r => r.id).sort()).toEqual(due(list, NOW).map(r => r.id).sort())
  })
  it('says Offline when Jarvis failed or the record is unreachable, never Online', () => {
    expect(presence({ ...base, viewer: 'visitor', sinceIso: null, status: 'failed' }).online).toBe('offline')
    expect(presence({ ...base, viewer: 'visitor', sinceIso: null, source: 'offline' }).online).toBe('offline')
    expect(presence({ ...base, viewer: 'visitor', sinceIso: null, data: null }).online).toBe('starting')
  })
})

describe('briefing', () => {
  it('greets in local time and counts since the last visit', () => {
    const b = composeBrief(state, 'owner', '2026-10-07T19:00:00Z', NOW, 330)
    expect(b.greeting).toBe('Good evening.')
    expect(b.text).toContain('Since your last visit,')
    expect(b.lines[0]).toMatch(/^Project: \d+ complete, 0 in progress, \d+ waiting on you, 0 blocked\.$/)
    expect(b.spoken.split('. ').length).toBeLessThanOrEqual(5)
  })
  it('a visitor briefing never lists the founder’s gates', () => {
    const b = composeBrief(state, 'visitor', null, NOW, 0)
    expect(b.needsYou).toEqual([])
    expect(b.text).toContain('waiting on the founder')
  })
})

describe('navigation targets', () => {
  it('resolve only to things in the record', () => {
    expect(resolveTarget('V09', state)).toMatchObject({ kind: 'focus', focus: { kind: 'task', id: 'V09' } })
    expect(resolveTarget('the finance district', state)).toMatchObject({ focus: { kind: 'agent', id: 'finance' } })
    expect(resolveTarget("Ogilvy's district", state)).toMatchObject({ focus: { kind: 'agent', id: 'gtm' } })
    expect(resolveTarget('go-to-market', state)).toMatchObject({ focus: { kind: 'agent', id: 'gtm' } })
    expect(resolveTarget('the brain', state)).toMatchObject({ focus: { kind: 'brain' } })
    expect(resolveTarget('home', state)).toMatchObject({ focus: { kind: 'world' } })
    expect(resolveTarget('scorecards', state)).toEqual({ kind: 'console', tab: 'agents', label: 'the agent scorecards' })
    expect(resolveTarget('help', state)).toMatchObject({ kind: 'panel', panel: 'help' })
    expect(resolveTarget('Z99', state)).toBeNull()
    expect(resolveTarget('the evidence for pricing', state)).toBeNull()
  })
})
