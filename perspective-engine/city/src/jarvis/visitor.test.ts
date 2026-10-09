import { afterEach, describe, expect, it, vi } from 'vitest'
import { offerText, VisitorModel } from './visitor'

function model() {
  let now = 1_000_000
  const m = new VisitorModel(undefined, () => now)
  return { m, tick: (s: number) => { now += s * 1000 } }
}
const task = (id: string) => ({ kind: 'task' as const, id })

describe('visitor intelligence', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('stays quiet for a visitor who is just looking around', () => {
    const { m, tick } = model()
    m.onFocus(task('V09'))
    tick(10)
    expect(m.evaluate()).toBeNull()
  })

  it('offers a simpler explanation after a long dwell on one task', () => {
    const { m, tick } = model()
    m.onFocus(task('V09'))
    tick(40)
    const offer = m.evaluate()
    expect(offer).toMatchObject({ text: 'Want a simpler explanation of this task?', focus: task('V09'), key: 'task-V09' })
    expect(offer!.reason).toContain('a long pause')
  })

  it('does not count watching the whole city, or time before the visitor could act, as dwell', () => {
    const { m, tick } = model()
    tick(120)
    expect(m.signals().dwellSeconds).toBe(0)
    expect(m.evaluate()).toBeNull()
    m.onFocus(task('V09'))
    tick(100)
    m.restart()
    tick(5)
    expect(m.signals().dwellSeconds).toBe(5)
    expect(m.evaluate()).toBeNull()
  })

  it('reads repeated clicks on the same object and back-and-forth between two objects', () => {
    const { m, tick } = model()
    m.onFocus(task('V09'))
    for (let i = 0; i < 5; i++) m.onClick('task-V09')
    expect(m.signals().repeatedInteraction).toBe(4)
    m.onFocus(task('V10')); m.onFocus(task('V09')); m.onFocus(task('V10'))
    expect(m.backAndForth()).toBe(true)
    expect(m.signals()).toMatchObject({ navigationUncertainty: 0.8, confusion: 0.4 })
    tick(5)
    expect(m.evaluate()?.reason).toContain('back-and-forth navigation')
  })

  it('opening Help counts as confusion for a while', () => {
    const { m, tick } = model()
    m.onHelp()
    expect(m.signals().confusion).toBe(0.5)
    tick(91)
    expect(m.signals().confusion).toBe(0)
  })

  it('cools down after an offer, and never offers twice for the same object', () => {
    const { m, tick } = model()
    m.onFocus(task('V09'))
    tick(60)
    expect(m.evaluate()).not.toBeNull()
    m.onOffered()
    // A very confused visitor on another task, but inside the 180 s cooldown: nothing.
    m.onFocus(task('V10'))
    m.onHelp()
    for (let i = 0; i < 6; i++) m.onClick('task-V10')
    tick(60)
    expect(m.evaluate()).toBeNull()
    tick(121)
    expect(m.evaluate()?.focus).toEqual(task('V10'))
    // Back on V09 after the cooldown: already offered there.
    m.onOffered()
    tick(200)
    m.onFocus(task('V09'))
    tick(60)
    expect(m.evaluate()).toBeNull()
  })

  it('gives up after two dismissals', () => {
    const { m, tick } = model()
    m.onDismissed()
    m.onDismissed()
    m.onFocus(task('V09'))
    m.onHelp()
    for (let i = 0; i < 6; i++) m.onClick('task-V09')
    tick(300)
    expect(m.evaluate()).toBeNull()
  })

  it('stores and sends nothing: no storage, no network', () => {
    const touch = vi.fn(() => { throw new Error('touched') })
    vi.stubGlobal('localStorage', { getItem: touch, setItem: touch })
    vi.stubGlobal('sessionStorage', { getItem: touch, setItem: touch })
    vi.stubGlobal('fetch', touch)
    vi.stubGlobal('navigator', { sendBeacon: touch })
    const { m, tick } = model()
    m.onFocus(task('V09')); m.onClick('task-V09'); m.onHelp(); tick(60)
    m.evaluate(); m.onOffered(); m.onDismissed()
    expect(touch).not.toHaveBeenCalled()
  })

  it('words the offer for what is in focus', () => {
    expect(offerText({ kind: 'agent', id: 'gtm' })).toBe('Want a quick, plain summary of what this agent does?')
    expect(offerText({ kind: 'brain' })).toBe('Want me to explain how the plan works?')
    expect(offerText({ kind: 'world' })).toContain('what you are looking at')
  })
})
