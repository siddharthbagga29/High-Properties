/**
 * "open V09", "show me Ada", "take me to finance": where a spoken or typed target points in the city.
 * Only things that exist in the record resolve; anything else is null, never a guess.
 */
import type { GraphState } from '../data/types'
import { DEPT } from '../scene/world'
import type { Focus, Panel } from '../store'
import type { ConsoleTab } from './types'

export type Target =
  | { kind: 'focus'; focus: Focus; label: string }
  | { kind: 'panel'; panel: Exclude<Panel, 'none'>; label: string }
  | { kind: 'console'; tab: ConsoleTab; label: string }
  | { kind: 'replay'; label: string }

const FILLER = /\b(?:the|a|an|please|now|for me|page|panel|view|screen|section|tab)\b/g

function clean(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[’']s\b/g, '')
    .replace(/[^a-z0-9 -]+/g, ' ')
    .replace(FILLER, ' ')
    .replace(/\b(?:district|tower|agent|department|dept)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const word = (text: string, w: string) => new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(text)

export function resolveTarget(raw: string, state: GraphState | null): Target | null {
  const t = clean(raw)
  if (!t) return null
  const id = /\b([a-z]\d{2,3})\b/.exec(t)?.[1]?.toUpperCase()
  if (id && state) {
    const n = state.nodes.find(x => x.id === id)
    if (n) return { kind: 'focus', focus: { kind: 'task', id: n.id }, label: `${n.id} · ${n.title}` }
  }
  if (/^(?:city|home|world|overview|whole city|everything|start|map|company)$/.test(t)) return { kind: 'focus', focus: { kind: 'world' }, label: 'the whole city' }
  if (/\b(?:brain|plan|mayor|orchestrator|city hall)\b/.test(t)) return { kind: 'focus', focus: { kind: 'brain' }, label: 'the Brain' }
  if (/\b(?:scorecards?|audit|grades?|auditor)\b/.test(t)) return { kind: 'console', tab: 'agents', label: 'the agent scorecards' }
  if (/\b(?:reminders?|requests?|briefing|brief|needs you|my queue|queue)\b/.test(t)) return { kind: 'console', tab: 'brief', label: 'your briefing' }
  if (/\b(?:conversation|chat|thread)\b/.test(t)) return { kind: 'console', tab: 'talk', label: 'the conversation' }
  if (/^(?:help|how to read|legend|controls)$/.test(t)) return { kind: 'panel', panel: 'help', label: 'Help' }
  if (/^(?:index|tables?|text version)$/.test(t)) return { kind: 'panel', panel: 'index', label: 'the Index' }
  if (/^(?:pilot|request a pilot|pilot form)$/.test(t)) return { kind: 'panel', panel: 'pilot', label: 'the pilot request' }
  if (/^(?:replay|timeline|history)$/.test(t)) return { kind: 'replay', label: 'the replay' }
  if (state) {
    for (const [key, a] of Object.entries(state.agents)) {
      if (key === 'orchestrator') continue
      const names = [a.name, a.district, DEPT[key], key].filter(Boolean).map(s => s.toLowerCase())
      // The agent key alone ("data", "legal") only counts when it is the whole target: they are ordinary words.
      if (names.slice(0, 3).some(n => word(t, n)) || t === key) return { kind: 'focus', focus: { kind: 'agent', id: key }, label: `${a.name}'s ${a.district}` }
    }
  }
  return null
}
