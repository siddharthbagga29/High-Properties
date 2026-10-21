// Locally synthesised sound cues (WebAudio oscillators; no files, no network). Disabled until the user enables it
// from a click, which also satisfies browser autoplay rules. Cues are rate-limited so bursts of events never turn
// into a stream of beeps. Sound is never the only signal: every cue accompanies a visible change.
export const CUES = {
  start: { notes: [[660, 0.06]], type: "sine", gain: 0.5 },
  complete: { notes: [[523, 0.07], [784, 0.11]], type: "sine", gain: 0.55 },
  warning: { notes: [[392, 0.12], [330, 0.14]], type: "triangle", gain: 0.6 },
  critical: { notes: [[220, 0.16], [185, 0.16], [220, 0.22]], type: "square", gain: 0.35 },
};

/** Rate limiter: at most one cue of a kind per `perCueMs`, at most `burst` cues per `windowMs`. */
export class Limiter {
  constructor({ perCueMs = 900, burst = 4, windowMs = 6000, now = () => Date.now() } = {}) {
    Object.assign(this, { perCueMs, burst, windowMs, now });
    this.last = new Map();
    this.recent = [];
  }
  allow(kind) {
    const t = this.now();
    this.recent = this.recent.filter((x) => t - x < this.windowMs);
    if (t - (this.last.get(kind) ?? -Infinity) < this.perCueMs) return false;
    if (this.recent.length >= this.burst && kind !== "critical") return false;
    this.last.set(kind, t);
    this.recent.push(t);
    return true;
  }
}

export class Sound {
  constructor({ makeContext, limiter } = {}) {
    this.makeContext = makeContext || (() => new (globalThis.AudioContext || globalThis.webkitAudioContext)());
    this.limiter = limiter || new Limiter();
    this.enabled = false;
    this.volume = 0.35;
    this.ctx = null;
    this.hum = null;
    this.played = [];
  }
  /** Must be called from a user gesture the first time. */
  enable(on) {
    this.enabled = !!on;
    if (this.enabled && !this.ctx) {
      try { this.ctx = this.makeContext(); } catch { this.enabled = false; }
    }
    if (this.ctx && this.ctx.state === "suspended" && this.enabled) this.ctx.resume?.();
    if (!this.enabled) this.texture(false);
    return this.enabled;
  }
  setVolume(v) { this.volume = Math.min(1, Math.max(0, Number(v) || 0)); if (this.hum) this.hum.g.gain.value = 0.03 * this.volume; }
  cue(kind) {
    if (!this.enabled || !this.ctx || !CUES[kind] || !this.limiter.allow(kind)) return false;
    const c = CUES[kind], ctx = this.ctx;
    let t = ctx.currentTime + 0.01;
    for (const [freq, dur] of c.notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = c.type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.25 * c.gain * this.volume), t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
      t += dur * 0.9;
    }
    this.played.push(kind);
    return true;
  }
  /** Low, quiet drone while a real job runs (separate opt-in). */
  texture(on) {
    if (!on || !this.enabled || !this.ctx) {
      if (this.hum) { try { this.hum.o.stop(); } catch { /* already stopped */ } this.hum = null; }
      return false;
    }
    if (this.hum) return true;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.value = 55; f.type = "lowpass"; f.frequency.value = 180;
    g.gain.value = 0.03 * this.volume;
    o.connect(f).connect(g).connect(this.ctx.destination);
    o.start();
    this.hum = { o, g };
    return true;
  }
}
