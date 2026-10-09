import { describe, expect, it } from 'vitest'
import { DEFAULT_INTERVENTION, interventionScore, shouldIntervene } from '../core/proactive'
import type { Signals } from '../core/types'

const calm: Signals = { relevance: 0, confusion: 0, repeatedInteraction: 0, dwellSeconds: 0, navigationUncertainty: 0, secondsSinceLastOffer: Infinity, offersDismissed: 0 }
const s = (over: Partial<Signals>): Signals => ({ ...calm, ...over })

describe('interventionScore', () => {
  it('has the documented defaults', () => {
    expect(DEFAULT_INTERVENTION).toEqual({ threshold: 1, cooldownSeconds: 180, maxDismissals: 2 })
  })

  it('adds the positive signals, capping repetition at 4 clicks and dwell at 45 s', () => {
    expect(interventionScore(calm)).toBe(0)
    expect(interventionScore(s({ relevance: 0.5, confusion: 0.25 }))).toBe(0.75)
    expect(interventionScore(s({ repeatedInteraction: 2 }))).toBe(0.5)
    expect(interventionScore(s({ repeatedInteraction: 40 }))).toBe(1)
    expect(interventionScore(s({ dwellSeconds: 90 }))).toBe(1)
    expect(interventionScore(s({ relevance: 1, confusion: 1, repeatedInteraction: 4, dwellSeconds: 45, navigationUncertainty: 1 }))).toBe(5)
  })

  it('subtracts a cooldown penalty that fades and an annoyance penalty per dismissal', () => {
    const busy = { relevance: 1, confusion: 1 }
    expect(interventionScore(s({ ...busy, secondsSinceLastOffer: 0 }))).toBe(0)
    expect(interventionScore(s({ ...busy, secondsSinceLastOffer: 90 }))).toBe(1)
    expect(interventionScore(s({ ...busy, secondsSinceLastOffer: 180 }))).toBe(2)
    expect(interventionScore(s({ ...busy, offersDismissed: 1 }))).toBe(1.25)
  })

  it('clamps nonsense input', () => {
    expect(interventionScore(s({ relevance: 7, confusion: -3, dwellSeconds: Number.NaN }))).toBe(1)
  })
})

describe('shouldIntervene', () => {
  it('offers help above the threshold and names the drivers', () => {
    const r = shouldIntervene(s({ confusion: 0.8, repeatedInteraction: 4 }))
    expect(r.intervene).toBe(true)
    expect(r.reason).toBe('offering help: repeated clicks and signs of confusion')
  })

  it('stays quiet below the threshold', () => {
    expect(shouldIntervene(s({ relevance: 0.4, dwellSeconds: 10 }))).toMatchObject({ intervene: false })
  })

  it('never offers inside the cooldown, however strong the signals', () => {
    const r = shouldIntervene(s({ relevance: 1, confusion: 1, repeatedInteraction: 9, dwellSeconds: 99, navigationUncertainty: 1, secondsSinceLastOffer: 179 }))
    expect(r).toMatchObject({ intervene: false, reason: 'an offer was made recently; cooling down' })
  })

  it('never offers after too many dismissals', () => {
    const r = shouldIntervene(s({ relevance: 1, confusion: 1, repeatedInteraction: 9, dwellSeconds: 99, navigationUncertainty: 1, offersDismissed: 2 }))
    expect(r).toMatchObject({ intervene: false, reason: 'help was dismissed too often; staying quiet' })
  })

  it('respects a custom config', () => {
    expect(shouldIntervene(s({ relevance: 0.6 }), { threshold: 0.5, cooldownSeconds: 10, maxDismissals: 1 }).intervene).toBe(true)
    expect(shouldIntervene(s({ relevance: 0.6, offersDismissed: 1 }), { threshold: 0.5, cooldownSeconds: 10, maxDismissals: 1 }).intervene).toBe(false)
  })
})
