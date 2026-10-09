import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { GraphState } from '../data/types'
import { respond } from './conversation'
import { flush } from './fake-db'
import {
  cancelRequest, canMove, changeSentence, createDecision, createRequest, decisionRequest, looksLikeWork, readDecision, readRequest,
  REQUEST_FLOW, REQUEST_STATUSES, requestChanges, requestLabel, requestLine, sortRequests,
} from './requests'
import { makeEnv, rowsFrom, UID } from './test-helpers'
import type { OwnerRequest } from './types'

const state = JSON.parse(readFileSync(new URL('../../public/state.json', import.meta.url), 'utf8')) as GraphState
const NOW = new Date('2026-10-09T13:00:00Z')
const req = (p: Partial<OwnerRequest>): OwnerRequest => ({ ...createRequest('build the advisor page', 'build', NOW), ...p })

describe('request queue states', () => {
  it('the page creates requests only as queued', () => {
    const r = createRequest('  build   the advisor page ', 'build', NOW)
    expect(r).toMatchObject({ text: 'build the advisor page', status: 'queued', kind: 'build', createdAt: NOW.toISOString() })
    expect(r.id).toMatch(/^req-/)
    expect(() => createRequest('   ', 'build', NOW)).toThrow()
  })

  it('redacts secrets before anything is stored', () => {
    const r = createRequest('use the key sk-ant-REDACTME0123456789abcdef to call the API', 'build', NOW)
    expect(r.text).not.toContain('sk-ant-REDACTME')
    expect(r.text).toContain('[REDACTED KEY]')
  })

  it('follows the legal moves: queued → running → completed / waiting / failed', () => {
    expect(canMove('queued', 'running')).toBe(true)
    expect(canMove('queued', 'completed')).toBe(false)
    expect(canMove('running', 'completed')).toBe(true)
    expect(canMove('running', 'waiting_for_user')).toBe(true)
    expect(canMove('waiting_for_user', 'queued')).toBe(true)
    expect(canMove('failed', 'queued')).toBe(true)
    for (const s of REQUEST_STATUSES) expect(REQUEST_FLOW[s]).toBeDefined()
    expect(REQUEST_FLOW.completed).toEqual([])
    expect(REQUEST_FLOW.cancelled).toEqual([])
  })

  it('the owner can cancel only what has not started', () => {
    expect(cancelRequest(req({}), NOW).status).toBe('cancelled')
    expect(() => cancelRequest(req({ status: 'running' }), NOW)).toThrow('cannot cancel a request that is running')
    expect(() => cancelRequest(req({ status: 'completed' }), NOW)).toThrow()
  })

  it('says "done" only with what verified it', () => {
    expect(requestLine(req({}))).toBe("Queued for the orchestrator's next hourly run.")
    expect(requestLine(req({ status: 'running' }))).toBe('The orchestrator is working on it now.')
    expect(requestLine(req({ status: 'completed', result: 'page built', verifiedBy: 'verifier V13b' }))).toBe('Done: page built Verified by verifier V13b.')
    expect(requestLine(req({ status: 'completed', result: 'page built' }))).toContain("no verification was recorded, so I can't confirm it")
    expect(requestLine(req({ status: 'waiting_for_user', reason: 'approve the copy' }))).toBe('Needs you: approve the copy')
    expect(requestLine(req({ status: 'failed', reason: 'two rounds failed' }))).toBe('Failed: two rounds failed')
  })

  it('announces status changes between snapshots, not the first load or its own new requests', () => {
    const a = req({ id: 'a' }), b = req({ id: 'b' })
    expect(requestChanges(null, [a, b])).toEqual([])
    expect(requestChanges([a], [a, b])).toEqual([])
    const running = { ...a, status: 'running' as const }
    expect(requestChanges([a, b], [running, b])).toEqual([{ r: running, from: 'queued' }])
    expect(changeSentence(running)).toBe('Your request “build the advisor page” is now running.')
    const done = { ...running, status: 'completed' as const, result: 'built', verifiedBy: 'the verifier' }
    expect(changeSentence(done)).toBe('Your request “build the advisor page”: Done: built Verified by the verifier.')
  })

  it('lists open requests first, newest first', () => {
    const old = req({ id: 'old', createdAt: '2026-10-01T00:00:00Z' })
    const neu = req({ id: 'new', createdAt: '2026-10-08T00:00:00Z' })
    const done = req({ id: 'done', status: 'completed', createdAt: '2026-10-09T00:00:00Z' })
    expect(sortRequests([done, old, neu]).map(r => r.id)).toEqual(['new', 'old', 'done'])
  })

  it('reads rows written by the orchestrator as data and drops malformed ones', () => {
    expect(readRequest('x', { text: 'a', status: 'exploded', createdAt: NOW.toISOString() })).toBeNull()
    expect(readRequest('x', { text: 'a', status: 'running' })).toBeNull()
    const r = readRequest('x', { text: 'a', status: 'completed', createdAt: NOW.toISOString(), kind: 'weird', verifiedBy: 'V', extra: { evil: true } })
    expect(r).toEqual({ id: 'x', text: 'a', status: 'completed', createdAt: NOW.toISOString(), kind: 'build', verifiedBy: 'V' })
    expect(readDecision('d', { text: 'x', createdAt: NOW.toISOString(), status: 'applied' })?.status).toBe('applied')
  })

  it('links a decision and the request that applies it', () => {
    const d = createDecision('the advisor rate is 50 dollars an hour', NOW)
    const r = decisionRequest(d, NOW)
    expect(r).toMatchObject({ kind: 'decision', decisionId: d.id, status: 'queued' })
    expect(r.text).toBe(`Apply founder decision ${d.id}: the advisor rate is 50 dollars an hour`)
    // The owner reads it without the id the orchestrator needs.
    expect(requestLabel(r)).toBe('Apply your decision: the advisor rate is 50 dollars an hour')
    expect(changeSentence({ ...r, status: 'running' })).toBe('Your request “Apply your decision: the advisor rate is 50 dollars an hour” is now running.')
  })

  it('recognises instructions to do project work, not questions', () => {
    expect(looksLikeWork('draft the advisor recruitment email')).toBe(true)
    expect(looksLikeWork('please research SBIR deadlines for 2027')).toBe(true)
    expect(looksLikeWork('can you build the pilot page')).toBe(true)
    expect(looksLikeWork('can you build the pilot page?')).toBe(false)
    expect(looksLikeWork('what did Ada build')).toBe(false)
    expect(looksLikeWork('fix')).toBe(false)
  })
})

describe('request status as the orchestrator moves it', () => {
  it('a queued request read back through the live subscription shows each new status', async () => {
    const t = makeEnv({ viewer: 'owner', now: NOW, state })
    await respond('build the advisor recruitment page', t.env)
    await respond('yes, do it', t.env)
    const [queued] = rowsFrom(t.db).requests
    const statuses: string[][] = []
    let prev: OwnerRequest[] | null = null
    const notices: string[] = []
    const off = t.data!.watch(p => {
      if (!p.requests) return
      statuses.push(p.requests.map(r => r.status))
      notices.push(...requestChanges(prev, p.requests).map(c => changeSentence(c.r)))
      prev = p.requests
    })
    await flush()
    // The orchestrator (acting as the founder through ArtifactData) moves it on.
    const path = `data/users/${UID}/jarvis/jarvis-requests/${queued.id}`
    await t.db.doc(path).update({ status: 'running', updatedAt: '2026-10-09T14:00:00Z' })
    await flush()
    await t.db.doc(path).update({ status: 'completed', result: 'page drafted', verifiedBy: 'independent verifier, 4/4 criteria' })
    await flush()
    off()
    expect(statuses.map(s => s[0])).toEqual(['queued', 'running', 'completed'])
    expect(notices).toEqual([
      'Your request “build the advisor recruitment page” is now running.',
      'Your request “build the advisor recruitment page”: Done: page drafted Verified by independent verifier, 4/4 criteria.',
    ])
  })

  it('the owner can cancel a queued request; it is written as cancelled', async () => {
    const t = makeEnv({ viewer: 'owner', now: NOW, state })
    await respond('build the advisor recruitment page', t.env)
    await respond('yes, do it', t.env)
    const [queued] = rowsFrom(t.db).requests
    const r = await t.env.registry.run('jarvis.cancel_request', { id: queued.id }, { viewer: 'owner' })
    expect(r.ok).toBe(true)
    expect(rowsFrom(t.db).requests[0].status).toBe('cancelled')
    const again = await t.env.registry.run('jarvis.cancel_request', { id: queued.id }, { viewer: 'owner' })
    expect(again.ok).toBe(false)
  })
})
