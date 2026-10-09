import { joinClauses } from './text'
import type { InterventionConfig, Signals } from './types'

export const DEFAULT_INTERVENTION: InterventionConfig = { threshold: 1, cooldownSeconds: 180, maxDismissals: 2 }

/** Each dismissal costs this much; two dismissals outweigh a fairly confused visitor. */
const ANNOYANCE_PER_DISMISSAL = 0.75
/** Right after an offer the penalty is this large and fades linearly to zero over the cooldown. */
const COOLDOWN_PENALTY_MAX = 2

const unit = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0)
const nonNegative = (x: number) => (Number.isFinite(x) ? Math.max(0, x) : x === Infinity ? Infinity : 0)

function components(s: Signals, cfg: InterventionConfig) {
  const since = nonNegative(s.secondsSinceLastOffer)
  return {
    relevance: unit(s.relevance),
    confusion: unit(s.confusion),
    repetition: unit(nonNegative(s.repeatedInteraction) / 4),
    dwell: unit(nonNegative(s.dwellSeconds) / 45),
    uncertainty: unit(s.navigationUncertainty),
    cooldownPenalty: cfg.cooldownSeconds > 0 ? COOLDOWN_PENALTY_MAX * Math.max(0, 1 - since / cfg.cooldownSeconds) : 0,
    annoyancePenalty: ANNOYANCE_PER_DISMISSAL * nonNegative(s.offersDismissed),
  }
}

/** relevance + confusion + repetition + dwell + navigation uncertainty − cooldown penalty − annoyance penalty. */
export function interventionScore(s: Signals, cfg: InterventionConfig = DEFAULT_INTERVENTION): number {
  const c = components(s, cfg)
  const score = c.relevance + c.confusion + c.repetition + c.dwell + c.uncertainty - c.cooldownPenalty - c.annoyancePenalty
  return Math.round(score * 1000) / 1000
}

const SIGNAL_NAMES: Record<string, string> = {
  relevance: 'relevance',
  confusion: 'signs of confusion',
  repetition: 'repeated clicks',
  dwell: 'a long pause',
  uncertainty: 'back-and-forth navigation',
}

export function shouldIntervene(s: Signals, cfg: InterventionConfig = DEFAULT_INTERVENTION): { intervene: boolean; score: number; reason: string } {
  const score = interventionScore(s, cfg)
  if (nonNegative(s.offersDismissed) >= cfg.maxDismissals) return { intervene: false, score, reason: 'help was dismissed too often; staying quiet' }
  if (nonNegative(s.secondsSinceLastOffer) < cfg.cooldownSeconds) return { intervene: false, score, reason: 'an offer was made recently; cooling down' }
  if (score < cfg.threshold) return { intervene: false, score, reason: `score ${score} is below the threshold ${cfg.threshold}` }
  const c = components(s, cfg)
  const drivers = (Object.keys(SIGNAL_NAMES) as Array<keyof typeof c>)
    .filter(k => c[k] >= 0.5)
    .sort((a, b) => c[b] - c[a])
    .map(k => SIGNAL_NAMES[k])
  return { intervene: true, score, reason: drivers.length ? `offering help: ${joinClauses(drivers)}` : 'offering help' }
}
