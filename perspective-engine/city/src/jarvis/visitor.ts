/**
 * Visitor intelligence (docs/JARVIS_ARCHITECTURE.md §8): a session-only, in-memory model of how a visitor moves
 * through the city, turned into a small offer of help by the core's shouldIntervene. Signals: dwell on one focus,
 * repeated clicks on the same object, back-and-forth between two objects, opening Help. Nothing is stored or sent:
 * no keystrokes, text, audio or identifiers, and the model is gone when the tab closes.
 */
import { DEFAULT_INTERVENTION, shouldIntervene } from '@jarvis/proactive'
import type { InterventionConfig, Signals } from '@jarvis/types'
import type { Focus } from '../store'
import { focusKey } from '../store'

const CLICK_WINDOW_MS = 30_000
const HELP_WINDOW_MS = 90_000
const HISTORY = 8

export interface Offer { text: string; focus: Focus; key: string; reason: string; score: number }

/** The offer wording for what is in focus. */
export function offerText(focus: Focus): string {
  switch (focus.kind) {
    case 'task': return 'Want a simpler explanation of this task?'
    case 'agent': return 'Want a quick, plain summary of what this agent does?'
    case 'brain': return 'Want me to explain how the plan works?'
    default: return 'Want a 20-second explanation of what you are looking at?'
  }
}

export class VisitorModel {
  private focus: Focus = { kind: 'world' }
  private focusSince: number
  private trail: string[] = []
  private clicks: Array<{ key: string; at: number }> = []
  private helpAt = -Infinity
  private lastOfferAt = -Infinity
  private dismissed = 0
  private offeredFor = new Set<string>()

  constructor(private readonly cfg: InterventionConfig = DEFAULT_INTERVENTION, private readonly clock: () => number = () => Date.now()) {
    this.focusSince = clock()
  }

  /** The visitor moved to something else. */
  onFocus(f: Focus): void {
    const key = focusKey(f)
    if (key === focusKey(this.focus)) return
    this.focus = f
    this.focusSince = this.clock()
    this.trail = [...this.trail, key].slice(-HISTORY)
  }

  /** A click on an object (a tower, a district, a list row). */
  onClick(key: string): void {
    const now = this.clock()
    this.clicks = [...this.clicks.filter(c => now - c.at <= CLICK_WINDOW_MS), { key, at: now }].slice(-20)
  }

  /** Time spent before the visitor could act (the entrance, a closed tab) is not dwell. */
  restart(): void { this.focusSince = this.clock() }
  onHelp(): void { this.helpAt = this.clock() }
  onOffered(): void { this.lastOfferAt = this.clock(); this.offeredFor.add(focusKey(this.focus)) }
  onDismissed(): void { this.dismissed++ }
  /** Accepting is not annoyance; it only starts the normal cooldown (already started by onOffered). */
  onAccepted(): void { /* nothing to record */ }

  /** Alternating between the same two objects (A B A B) in the last moves. */
  backAndForth(): boolean {
    const t = this.trail.slice(-4)
    return t.length === 4 && t[0] === t[2] && t[1] === t[3] && t[0] !== t[1]
  }

  signals(): Signals {
    const now = this.clock()
    const key = focusKey(this.focus)
    const repeats = this.clicks.filter(c => c.key === key && now - c.at <= CLICK_WINDOW_MS).length
    const helpRecent = now - this.helpAt <= HELP_WINDOW_MS
    const pingPong = this.backAndForth()
    return {
      // An explanation is most relevant on a task or agent, where the jargon is.
      relevance: this.focus.kind === 'task' ? 0.5 : this.focus.kind === 'agent' ? 0.4 : 0.2,
      confusion: Math.min(1, (helpRecent ? 0.5 : 0) + (pingPong ? 0.4 : 0)),
      repeatedInteraction: Math.max(0, repeats - 1),
      // Watching the whole city for a while is not confusion; a long look at one task, agent or the plan may be.
      dwellSeconds: this.focus.kind === 'world' ? 0 : Math.max(0, (now - this.focusSince) / 1000),
      navigationUncertainty: pingPong ? 0.8 : 0,
      secondsSinceLastOffer: Number.isFinite(this.lastOfferAt) ? (now - this.lastOfferAt) / 1000 : Infinity,
      offersDismissed: this.dismissed,
    }
  }

  /** An offer when the core says to intervene, at most one per object, never inside the cooldown. */
  evaluate(): Offer | null {
    const key = focusKey(this.focus)
    if (this.offeredFor.has(key)) return null
    const d = shouldIntervene(this.signals(), this.cfg)
    if (!d.intervene) return null
    return { text: offerText(this.focus), focus: this.focus, key, reason: d.reason, score: d.score }
  }
}
