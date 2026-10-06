/**
 * Generative sound, no samples. A low instrument drone that opens up with magnification,
 * a focus-ratchet tick on hover, a filtered sweep on dive and a bell for each new ledger event.
 * Nothing plays until the visitor chooses sound (a user gesture).
 */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19]

class Sound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private noise: AudioBuffer | null = null
  private lastHover = 0
  enabled = false

  enable() {
    try {
      if (!this.ctx) this.build()
      this.ctx!.resume()
      this.enabled = true
      this.master!.gain.cancelScheduledValues(this.ctx!.currentTime)
      this.master!.gain.setTargetAtTime(0.55, this.ctx!.currentTime, 0.8)
    } catch { this.enabled = false }
  }

  disable() {
    this.enabled = false
    if (!this.ctx || !this.master) return
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25)
  }

  private build() {
    const ctx = new AudioContext()
    this.ctx = ctx
    const comp = ctx.createDynamicsCompressor()
    comp.connect(ctx.destination)
    const master = ctx.createGain()
    master.gain.value = 0
    master.connect(comp)
    this.master = master

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 320
    filter.Q.value = 0.8
    const droneGain = ctx.createGain()
    droneGain.gain.value = 0.09
    filter.connect(droneGain).connect(master)
    this.filter = filter
    ;[[55, 'sine', 1], [82.41, 'sine', 0.7], [164.8, 'triangle', 0.18], [110.3, 'sine', 0.35]].forEach(([f, type, g]) => {
      const o = ctx.createOscillator()
      o.type = type as OscillatorType
      o.frequency.value = f as number
      o.detune.value = (Math.random() - 0.5) * 8
      const gn = ctx.createGain()
      gn.gain.value = g as number
      o.connect(gn).connect(filter)
      o.start()
    })
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.045
    const lfoAmt = ctx.createGain()
    lfoAmt.gain.value = 110
    lfo.connect(lfoAmt).connect(filter.frequency)
    lfo.start()

    // brown noise bed: the hum of a lab at night
    const len = ctx.sampleRate * 4
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2 }
    this.noise = buf
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 520
    bp.Q.value = 0.6
    const ng = ctx.createGain()
    ng.gain.value = 0.05
    src.connect(bp).connect(ng).connect(master)
    src.start()
  }

  /** Magnification opens the filter: deeper levels sound brighter and closer. */
  level(l: number) {
    if (!this.ctx || !this.filter) return
    this.filter.frequency.setTargetAtTime(260 * Math.pow(1.55, l - 1), this.ctx.currentTime, 0.6)
  }

  private blip(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', at = 0) {
    if (!this.enabled || !this.ctx || !this.master) return
    const t = this.ctx.currentTime + at
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  hover() {
    const now = performance.now()
    if (now - this.lastHover < 70) return
    this.lastHover = now
    this.blip(2400, 0.035, 0.035, 'sine')
  }

  click() {
    this.blip(1800, 0.03, 0.05, 'square')
    this.blip(2600, 0.03, 0.04, 'square', 0.045)
  }

  dive() {
    if (!this.enabled || !this.ctx || !this.master || !this.noise) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 3
    bp.frequency.setValueAtTime(220, t)
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.9)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.35, t + 0.25)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15)
    src.connect(bp).connect(g).connect(this.master)
    src.start(t)
    src.stop(t + 1.2)
    this.blip(110, 0.5, 0.12, 'sine', 0.05)
  }

  /** One bell per agent, pitched on a pentatonic scale so simultaneous events stay consonant. */
  ping(agentIndex: number) {
    const f = 440 * Math.pow(2, PENTA[agentIndex % PENTA.length] / 12)
    this.blip(f, 1.4, 0.06, 'sine')
    this.blip(f * 2.01, 0.9, 0.02, 'sine')
  }
}

export const sfx = new Sound()

let voice: SpeechSynthesisVoice | null = null
function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices()
    voice = vs.find(v => /en-(GB|US)/.test(v.lang) && /Google|Natural|Samantha|Daniel/.test(v.name)) ?? vs.find(v => v.lang.startsWith('en')) ?? null
  } catch { voice = null }
}
try { speechSynthesis.onvoiceschanged = pickVoice; pickVoice() } catch { /* no speech synthesis */ }

export function speak(text: string) {
  try {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    if (voice) u.voice = voice
    u.rate = 1.02
    u.pitch = 0.95
    speechSynthesis.speak(u)
  } catch { /* speech unavailable */ }
}
export function hush() { try { speechSynthesis.cancel() } catch { /* noop */ } }
