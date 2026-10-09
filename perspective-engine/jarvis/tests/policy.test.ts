import { describe, expect, it } from 'vitest'
import { autonomyLevel, decide, DEFAULT_POLICY, type PolicyTool } from '../core/policy'
import type { Policy, RiskLevel, Viewer } from '../core/types'

const tool = (riskLevel: RiskLevel, over: Partial<PolicyTool> = {}): PolicyTool => ({ id: `t-${riskLevel}`, riskLevel, requiresConfirmation: false, scope: 'owner', ...over })
const RISKS: RiskLevel[] = ['safe', 'low', 'medium', 'high', 'critical']

describe('DEFAULT_POLICY', () => {
  it('maps risk to the documented levels', () => {
    expect(DEFAULT_POLICY.levels).toEqual({ safe: 0, low: 1, medium: 2, high: 3, critical: 3 })
    expect(DEFAULT_POLICY.visitorRisk).toEqual(['safe'])
  })
})

describe('owner decisions', () => {
  it('runs level 0 and 1 automatically', () => {
    expect(decide(tool('safe'), 'owner')).toMatchObject({ allowed: true, needsConfirmation: false, level: 0 })
    expect(decide(tool('low'), 'owner')).toMatchObject({ allowed: true, needsConfirmation: false, level: 1 })
  })

  it('asks for level 2 unless pre-approved', () => {
    expect(decide(tool('medium'), 'owner')).toMatchObject({ allowed: true, needsConfirmation: true, level: 2 })
    const policy: Policy = { ...DEFAULT_POLICY, preApproved: ['t-medium'] }
    expect(decide(tool('medium'), 'owner', policy)).toMatchObject({ allowed: true, needsConfirmation: false, level: 2 })
  })

  it('always asks for level 3, even when pre-approved', () => {
    const policy: Policy = { ...DEFAULT_POLICY, preApproved: ['t-high', 't-critical'] }
    expect(decide(tool('high'), 'owner', policy)).toMatchObject({ allowed: true, needsConfirmation: true, level: 3 })
    expect(decide(tool('critical'), 'owner', policy)).toMatchObject({ allowed: true, needsConfirmation: true, level: 3 })
  })

  it('honours requiresConfirmation over automatic levels and over pre-approval', () => {
    expect(decide(tool('safe', { requiresConfirmation: true }), 'owner').needsConfirmation).toBe(true)
    const policy: Policy = { ...DEFAULT_POLICY, preApproved: ['t-medium'] }
    expect(decide(tool('medium', { requiresConfirmation: true }), 'owner', policy).needsConfirmation).toBe(true)
  })

  it('denies tools on the denied list for everyone', () => {
    const policy: Policy = { ...DEFAULT_POLICY, denied: ['t-safe'] }
    for (const viewer of ['owner', 'visitor'] as Viewer[]) expect(decide(tool('safe', { scope: 'public' }), viewer, policy).allowed).toBe(false)
  })

  it('cannot be configured below the safety floors', () => {
    const reckless: Policy = { ...DEFAULT_POLICY, levels: { safe: 0, low: 0, medium: 0, high: 0, critical: 0 }, preApproved: ['t-critical', 't-high'] }
    expect(autonomyLevel('critical', reckless)).toBe(3)
    expect(autonomyLevel('high', reckless)).toBe(2)
    expect(decide(tool('critical'), 'owner', reckless).needsConfirmation).toBe(true)
    // high is floored at 2, so pre-approval can apply to it, but never to critical.
    expect(decide(tool('high'), 'owner', reckless).needsConfirmation).toBe(false)
  })

  it('fails closed on an unknown risk level', () => {
    expect(autonomyLevel('catastrophic' as RiskLevel)).toBe(3)
    expect(decide(tool('catastrophic' as RiskLevel), 'owner').needsConfirmation).toBe(true)
  })
})

describe('visitor decisions', () => {
  it('allows only public safe tools', () => {
    expect(decide(tool('safe', { scope: 'public' }), 'visitor')).toMatchObject({ allowed: true, needsConfirmation: false })
  })

  it('never lets a visitor run an owner tool, at any risk level', () => {
    for (const r of RISKS) {
      const d = decide(tool(r, { scope: 'owner' }), 'visitor')
      expect(d.allowed, r).toBe(false)
      expect(d.reason).toMatch(/owner tools/)
    }
  })

  it('never lets a visitor run anything above safe, even if the policy is misconfigured', () => {
    const open: Policy = { ...DEFAULT_POLICY, visitorRisk: ['safe', 'low', 'medium', 'high', 'critical'], preApproved: RISKS.map(r => `t-${r}`) }
    for (const r of RISKS.filter(x => x !== 'safe')) expect(decide(tool(r, { scope: 'public' }), 'visitor', open).allowed, r).toBe(false)
  })

  it('never gives a visitor a confirmation-gated tool', () => {
    expect(decide(tool('safe', { scope: 'public', requiresConfirmation: true }), 'visitor').allowed).toBe(false)
    const strict: Policy = { ...DEFAULT_POLICY, levels: { ...DEFAULT_POLICY.levels, safe: 2 } }
    expect(decide(tool('safe', { scope: 'public' }), 'visitor', strict).allowed).toBe(false)
  })

  it('treats a malformed viewer as a visitor', () => {
    expect(decide(tool('low'), 'admin' as Viewer).allowed).toBe(false)
  })

  it('denies visitors everything when visitorRisk is empty', () => {
    expect(decide(tool('safe', { scope: 'public' }), 'visitor', { ...DEFAULT_POLICY, visitorRisk: [] }).allowed).toBe(false)
  })
})
