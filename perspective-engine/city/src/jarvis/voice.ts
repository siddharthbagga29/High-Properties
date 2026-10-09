/**
 * Voice in the page. Speech out: the browser's speechSynthesis, interruptible at any moment (barge-in).
 * Speech in: (webkit)SpeechRecognition when the browser has it AND grants the microphone. The claude.ai page has
 * no microphone capability, so it is expected to be refused there; the page then says so and hides the mic.
 * "Listening" is shown only after the recogniser reports that audio capture started: never pretended.
 */

// ---------- speech out ----------

export interface SynthLike {
  speak(u: UtteranceLike): void
  cancel(): void
  getVoices(): Array<{ name: string; lang: string }>
}
export interface UtteranceLike {
  text: string
  rate: number
  pitch: number
  voice?: unknown
  onend: ((ev?: unknown) => void) | null
  onerror: ((ev?: unknown) => void) | null
  onstart?: ((ev?: unknown) => void) | null
}

/** Splits text into sentence-sized chunks: long utterances stall in some browsers. */
export function chunks(text: string, max = 180): string[] {
  const clean = text.replace(/\s+/g, ' ').replace(/[“”]/g, '"').trim()
  if (!clean) return []
  const sentences = clean.match(/[^.!?;]+[.!?;]*\s*/g) ?? [clean]
  const out: string[] = []
  let cur = ''
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      out.push(cur.trim())
      cur = ''
    }
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim())
    } else cur += s
  }
  if (cur.trim()) out.push(cur.trim())
  return out.filter(Boolean)
}

export interface Speaker {
  readonly available: boolean
  /** Speaks after stopping anything already being said. Resolves when finished or interrupted. */
  speak(text: string, opts?: { rate?: number }): Promise<void>
  /** Stops immediately (barge-in). */
  stop(): void
  speaking(): boolean
}

/** Longest a chunk may take before it counts as finished: some browsers never fire `end` (no voices, a stuck engine). */
export const chunkWatchdogMs = (text: string) => 2500 + text.length * 90

export function createSpeaker(synth: SynthLike | null, makeUtterance: ((text: string) => UtteranceLike) | null, onState: (speaking: boolean) => void,
  watchdog: (text: string) => number = chunkWatchdogMs): Speaker {
  let gen = 0
  let active = false
  const set = (v: boolean) => {
    if (active !== v) {
      active = v
      onState(v)
    }
  }
  const pickVoice = () => {
    try {
      const vs = synth?.getVoices() ?? []
      return vs.find(v => /en-(GB|US)/.test(v.lang) && /Google|Natural|Samantha|Daniel|Serena/.test(v.name)) ?? vs.find(v => v.lang?.startsWith('en')) ?? null
    } catch {
      return null
    }
  }
  return {
    available: !!synth && !!makeUtterance,
    speaking: () => active,
    stop() {
      gen++
      try { synth?.cancel() } catch { /* nothing to stop */ }
      set(false)
    },
    async speak(text, opts = {}) {
      if (!synth || !makeUtterance) return
      const mine = ++gen
      try { synth.cancel() } catch { /* nothing playing */ }
      const parts = chunks(text)
      if (!parts.length) return
      set(true)
      const voice = pickVoice()
      for (const part of parts) {
        if (mine !== gen) return
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, watchdog(part))
          const done = () => { clearTimeout(timer); resolve() }
          const u = makeUtterance(part)
          u.rate = opts.rate ?? 1
          u.pitch = 0.95
          if (voice) u.voice = voice
          u.onend = done
          u.onerror = done
          try { synth.speak(u) } catch { done() }
        })
      }
      if (mine === gen) set(false)
    },
  }
}

// ---------- speech in ----------

export type MicState = 'unsupported' | 'idle' | 'starting' | 'listening' | 'unavailable'

export const MIC_UNAVAILABLE = "Voice input isn't available in this view; type instead, or use the local console on your Mac."

/** What to tell the owner for each recogniser error; `hide` hides the mic for the rest of the session. */
export function micError(code: string): { text: string | null; hide: boolean } {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
    case 'audio-capture':
      return { text: MIC_UNAVAILABLE, hide: true }
    case 'no-speech': return { text: "I didn't hear anything. Try again, or type instead.", hide: false }
    case 'network': return { text: "Voice input needs the browser's speech service, which could not be reached. Type instead.", hide: false }
    case 'language-not-supported': return { text: "This browser can't recognise English speech here. Type instead.", hide: true }
    case 'aborted': return { text: null, hide: false }
    default: return { text: 'Voice input stopped unexpectedly. Type instead, or try again.', hide: false }
  }
}

export interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onaudiostart: (() => void) | null
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

export interface Listener {
  readonly supported: boolean
  state(): MicState
  /** Starts listening; `onFinal` gets the final transcript. */
  start(): void
  stop(): void
}

export interface ListenerHooks {
  onState(s: MicState): void
  onInterim(text: string): void
  onFinal(text: string): void
  onError(text: string | null, hide: boolean): void
}

export function createListener(make: (() => RecognitionLike) | null, hooks: ListenerHooks): Listener {
  let st: MicState = make ? 'idle' : 'unsupported'
  let rec: RecognitionLike | null = null
  let heard = ''
  const set = (s: MicState) => {
    st = s
    hooks.onState(s)
  }
  return {
    supported: !!make,
    state: () => st,
    start() {
      if (!make || st === 'unavailable' || st === 'listening' || st === 'starting') return
      heard = ''
      try {
        rec = make()
        rec.lang = 'en-US'
        rec.interimResults = true
        rec.continuous = false
        rec.maxAlternatives = 1
        // Only real audio capture counts as listening.
        rec.onaudiostart = () => set('listening')
        rec.onresult = e => {
          let interim = ''
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i]
            if (r.isFinal) heard += r[0].transcript
            else interim += r[0].transcript
          }
          hooks.onInterim((heard + interim).trim())
        }
        rec.onerror = e => {
          const m = micError(e.error)
          if (m.hide) set('unavailable')
          hooks.onError(m.text, m.hide)
        }
        rec.onend = () => {
          if (st !== 'unavailable') set('idle')
          const final = heard.trim()
          heard = ''
          rec = null
          if (final) hooks.onFinal(final)
        }
        set('starting')
        rec.start()
      } catch {
        set('unavailable')
        hooks.onError(MIC_UNAVAILABLE, true)
      }
    },
    stop() {
      try { rec?.stop() } catch { /* already stopped */ }
    },
  }
}

/** The browser's recogniser constructor, if any. */
export function recognitionFactory(w: unknown): (() => RecognitionLike) | null {
  const g = w as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike } | null
  const Ctor = g?.SpeechRecognition ?? g?.webkitSpeechRecognition
  return Ctor ? () => new Ctor() : null
}
