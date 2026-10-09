import { describe, expect, it, vi } from 'vitest'
import { chunks, createListener, createSpeaker, MIC_UNAVAILABLE, micError, recognitionFactory, type RecognitionLike, type UtteranceLike } from './voice'

function fakeSynth() {
  const spoken: UtteranceLike[] = []
  let current: UtteranceLike | null = null
  const synth = {
    cancelled: 0,
    speak: (u: UtteranceLike) => { spoken.push(u); current = u },
    cancel: () => { synth.cancelled++; const c = current; current = null; c?.onend?.() },
    getVoices: () => [{ name: 'Google UK English Male', lang: 'en-GB' }],
    finish: () => { const c = current; current = null; c?.onend?.() },
  }
  const make = (text: string): UtteranceLike => ({ text, rate: 1, pitch: 1, onend: null, onerror: null })
  return { synth, make, spoken }
}
const tick = () => new Promise(r => setTimeout(r, 0))

describe('speech out', () => {
  it('splits long text into sentence-sized chunks', () => {
    expect(chunks('One. Two? Three!')).toEqual(['One. Two? Three!'])
    const long = Array.from({ length: 10 }, (_, i) => `Sentence number ${i} is here.`).join(' ')
    const parts = chunks(long, 60)
    expect(parts.length).toBeGreaterThan(3)
    expect(parts.every(p => p.length <= 60)).toBe(true)
    expect(parts.join(' ')).toBe(long)
    expect(chunks('   ')).toEqual([])
  })

  it('reports speaking while it speaks and stops the moment it is interrupted (barge-in)', async () => {
    const { synth, make, spoken } = fakeSynth()
    const states: boolean[] = []
    const sp = createSpeaker(synth, make, s => states.push(s))
    const done = sp.speak('First sentence. Second sentence.', { rate: 1.1 })
    await tick()
    expect(sp.speaking()).toBe(true)
    expect(spoken[0].rate).toBe(1.1)
    sp.stop()
    await done
    expect(sp.speaking()).toBe(false)
    expect(states).toEqual([true, false])
    expect(spoken).toHaveLength(1)
  })

  it('a new reply cancels the old one before it starts', async () => {
    const { synth, make, spoken } = fakeSynth()
    const sp = createSpeaker(synth, make, () => undefined)
    void sp.speak('old reply')
    await tick()
    void sp.speak('new reply')
    await tick()
    expect(synth.cancelled).toBeGreaterThanOrEqual(2)
    expect(spoken.map(u => u.text)).toEqual(['old reply', 'new reply'])
    synth.finish()
    await tick()
    expect(sp.speaking()).toBe(false)
  })

  it('never stays "speaking" forever when the browser never reports the end', async () => {
    const synth = { speak: () => undefined, cancel: () => undefined, getVoices: () => [] }
    const states: boolean[] = []
    const sp = createSpeaker(synth, t => ({ text: t, rate: 1, pitch: 1, onend: null, onerror: null }), s => states.push(s), () => 20)
    await sp.speak('A reply that never ends.')
    expect(sp.speaking()).toBe(false)
    expect(states).toEqual([true, false])
  })

  it('does nothing, and claims nothing, without speech synthesis', async () => {
    const onState = vi.fn()
    const sp = createSpeaker(null, null, onState)
    expect(sp.available).toBe(false)
    await sp.speak('hello')
    expect(onState).not.toHaveBeenCalled()
  })
})

function fakeRecognition() {
  const r: RecognitionLike & { started: number; stopped: number } = {
    lang: '', interimResults: false, continuous: true, maxAlternatives: 3, started: 0, stopped: 0,
    start() { r.started++ }, stop() { r.stopped++; r.onend?.() }, abort() { r.onend?.() },
    onaudiostart: null, onresult: null, onerror: null, onend: null,
  }
  return r
}
const result = (text: string, isFinal: boolean) => Object.assign([{ transcript: text }], { isFinal })

describe('speech in', () => {
  it('never shows "listening" until audio capture really starts', () => {
    const rec = fakeRecognition()
    const states: string[] = []
    const finals: string[] = []
    const l = createListener(() => rec, { onState: s => states.push(s), onInterim: () => undefined, onFinal: t => finals.push(t), onError: () => undefined })
    l.start()
    expect(l.state()).toBe('starting')
    expect(rec).toMatchObject({ lang: 'en-US', interimResults: true, continuous: false })
    rec.onaudiostart!()
    expect(l.state()).toBe('listening')
    rec.onresult!({ resultIndex: 0, results: [result('what is next', true)] })
    rec.onend!()
    expect(states).toEqual(['starting', 'listening', 'idle'])
    expect(finals).toEqual(['what is next'])
  })

  it('a refused microphone says so plainly and hides the mic for good', () => {
    const rec = fakeRecognition()
    const errors: Array<[string | null, boolean]> = []
    const l = createListener(() => rec, { onState: () => undefined, onInterim: () => undefined, onFinal: () => undefined, onError: (t, h) => errors.push([t, h]) })
    l.start()
    rec.onerror!({ error: 'not-allowed' })
    rec.onend!()
    expect(l.state()).toBe('unavailable')
    expect(errors).toEqual([[MIC_UNAVAILABLE, true]])
    expect(MIC_UNAVAILABLE).toBe("Voice input isn't available in this view; type instead, or use the local console on your Mac.")
    l.start()
    expect(rec.started).toBe(1)
  })

  it('maps every recogniser error to honest words', () => {
    for (const code of ['not-allowed', 'service-not-allowed', 'audio-capture']) expect(micError(code)).toEqual({ text: MIC_UNAVAILABLE, hide: true })
    expect(micError('no-speech')).toEqual({ text: "I didn't hear anything. Try again, or type instead.", hide: false })
    expect(micError('aborted').text).toBeNull()
    expect(micError('network').hide).toBe(false)
  })

  it('has no mic at all where the browser has no recogniser', () => {
    expect(recognitionFactory({})).toBeNull()
    expect(recognitionFactory(null)).toBeNull()
    const l = createListener(null, { onState: () => undefined, onInterim: () => undefined, onFinal: () => undefined, onError: () => undefined })
    expect(l.supported).toBe(false)
    expect(l.state()).toBe('unsupported')
    class Webkit { }
    expect(recognitionFactory({ webkitSpeechRecognition: Webkit })).not.toBeNull()
  })

  it('a recogniser that throws on start is reported as unavailable, not as listening', () => {
    const errors: Array<string | null> = []
    const l = createListener(() => { throw new Error('blocked by permissions policy') }, { onState: () => undefined, onInterim: () => undefined, onFinal: () => undefined, onError: t => errors.push(t) })
    l.start()
    expect(l.state()).toBe('unavailable')
    expect(errors).toEqual([MIC_UNAVAILABLE])
  })
})
