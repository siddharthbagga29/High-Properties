import { describe, expect, it } from 'vitest'
import { faceState, partState } from '../core/body'
import type { BodyPartSpec, RevenueEntry } from '../core/types'

const spec: BodyPartSpec = { id: 'heart', label: 'Heart', builtBy: 'product', tasks: ['A', 'B', 'C', 'D', 'E'] }

describe('partState', () => {
  it('counts done and prepared tasks and weights prepared at 0.6', () => {
    const status: Record<string, string> = { A: 'done', B: 'done', C: 'awaiting_human', D: 'running' }
    expect(partState(spec, id => status[id])).toEqual({ ...spec, done: 2, prepared: 1, total: 5, fill: 0.52 })
  })

  it('is empty for no progress and for a part with no tasks', () => {
    expect(partState(spec, () => undefined).fill).toBe(0)
    expect(partState({ ...spec, tasks: [] }, () => 'done')).toMatchObject({ total: 0, fill: 0 })
  })

  it('is full only when every task is done', () => {
    expect(partState(spec, () => 'done').fill).toBe(1)
    expect(partState(spec, () => 'awaiting_human').fill).toBe(0.6)
  })
})

describe('faceState', () => {
  const pay = (payer: string, amountUsd = 500, over: Partial<RevenueEntry> = {}): RevenueEntry => ({
    t: '2026-11-01T10:00:00Z', amountUsd, payer, evidence: `invoice-${payer}.pdf`, recordedBy: 'founder', ...over,
  })

  it('stays unformed without verified revenue', () => {
    expect(faceState([])).toEqual({ stage: 0, payers: 0, totalUsd: 0, label: 'No verified revenue yet: the face stays unformed.', verifiedEntries: 0, unsigned: 0, excluded: 0 })
  })

  it('ignores entries without founder record, evidence, a payer, a positive amount or a valid time', () => {
    const bad = [
      pay('A', 500, { recordedBy: 'agent' as 'founder' }),
      pay('B', 500, { evidence: '  ' }),
      pay('C', 0),
      pay('D', -10),
      pay('E', Number.NaN),
      pay(' ', 500),
      pay('F', 500, { t: 'yesterday' }),
    ]
    expect(faceState(bad)).toMatchObject({ stage: 0, verifiedEntries: 0, totalUsd: 0 })
  })

  it('forms by distinct paying customers, not by number of payments', () => {
    expect(faceState([pay('Acme'), pay('acme ', 250)])).toMatchObject({ stage: 1, payers: 1, totalUsd: 750, verifiedEntries: 2 })
    expect(faceState([pay('Acme'), pay('Beta')]).stage).toBe(2)
    const four = faceState([pay('Acme'), pay('Beta'), pay('Gamma', 100.005), pay('Delta')])
    expect(four).toMatchObject({ stage: 3, payers: 4, totalUsd: 1600.01 })
    expect(four.label).toMatch(/complete/)
  })

  it('explains what remains at each stage', () => {
    expect(faceState([pay('Acme')]).label).toMatch(/eyes.*second paying customer/)
    expect(faceState([pay('Acme'), pay('Beta')]).label).toMatch(/third forms the mouth/)
  })
})

describe('faceState and the founder signature', () => {
  const entry = (payer: string, auth?: 'signed' | 'attested') =>
    ({ t: '2026-10-09T10:00:00Z', amountUsd: 1000, payer, evidence: 'INV-1', recordedBy: 'founder' as const, ...(auth ? { auth } : {}) })

  it('counts attested revenue before a key is registered, and says it is unsigned', () => {
    const f = faceState([entry('Acme', 'attested')])
    expect(f).toMatchObject({ stage: 1, unsigned: 1 })
    expect(f.label).toContain("One entry was recorded on trust, not signed with the founder's key.")
  })

  it('once a key is registered, only revenue whose signature was verified forms the face', () => {
    const verified = { ...entry('Gamma', 'signed'), sigVerified: true }
    const f = faceState([entry('Acme', 'attested'), entry('Beta'), verified], { requireSigned: true })
    expect(f).toMatchObject({ stage: 1, payers: 1, verifiedEntries: 1, unsigned: 0, excluded: 2 })
    expect(f.label).toContain('2 entries are not counted: no verified founder signature.')
  })

  it('a row that only says auth "signed" does not count once a key exists', () => {
    const forged = ['A', 'B', 'C'].map(p => entry(p, 'signed'))
    expect(faceState(forged, { requireSigned: true })).toMatchObject({ stage: 0, excluded: 3 })
  })
})
