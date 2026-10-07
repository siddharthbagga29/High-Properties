import { create } from 'zustand'
import { statusesAt } from './data/model'
import type { GraphState, Status } from './data/types'

export type Focus = { kind: 'world' } | { kind: 'brain' } | { kind: 'agent'; id: string } | { kind: 'task'; id: string }
export type Tab = 'overview' | 'activity' | 'output' | 'ask'
export type Panel = 'none' | 'search' | 'help' | 'pilot' | 'index'
export interface Hover { kind: 'agent' | 'task' | 'brain' | 'worker'; id: string }
export type Source = 'loading' | 'live' | 'file' | 'offline'
/** The last Ask answer. Lives in the store so it survives the drawer remounting when the focus changes. */
export interface AskOut { q: string; text: string; via: 'claude' | 'files' | null; busy: boolean; dive?: Focus; error?: string }

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
export const persist = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* storage unavailable */ } }

export const focusKey = (f: Focus) => (f.kind === 'agent' || f.kind === 'task' ? `${f.kind}-${f.id}` : f.kind)
export function parseFocus(key: string, d: GraphState | null): Focus | null {
  if (key === 'world' || key === 'brain') return { kind: key }
  const m = /^(agent|task)-([A-Za-z0-9_]+)$/.exec(key)
  if (!m) return null
  if (d && m[1] === 'agent' && !Object.hasOwn(d.agents, m[2])) return null
  if (d && m[1] === 'task' && !d.nodes.some(n => n.id === m[2])) return null
  return m[1] === 'agent' ? { kind: 'agent', id: m[2] } : { kind: 'task', id: m[2] }
}

interface S {
  data: GraphState | null
  st: Map<string, Status>
  source: Source
  syncedAt: number | null
  time: number | null
  focus: Focus
  tab: Tab
  hover: Hover | null
  record: string | null
  panel: Panel
  sound: boolean
  voice: boolean
  introDone: boolean
  coach: number
  touring: boolean
  webgl: boolean
  bump: number
  enteredAt: number | null
  pendingAsk: string | null
  askOut: AskOut | null
  replayOpen: boolean
  hintsUsed: string[]
  statusFilter: Status[]
  setData: (d: GraphState, source: Source) => void
  select: (f: Focus, tab?: Tab) => void
  back: () => void
  setTime: (t: number | null) => void
  set: (p: Partial<S>) => void
}

export const useStore = create<S>((set, get) => ({
  data: null,
  st: new Map(),
  source: 'loading',
  syncedAt: null,
  time: null,
  focus: { kind: 'world' },
  tab: 'overview',
  hover: null,
  record: null,
  panel: 'none',
  sound: read('pe.sound') === '1',
  voice: read('pe.voice') !== '0',
  introDone: read('pe.intro') === '1',
  coach: -1,
  touring: false,
  webgl: true,
  bump: 0,
  enteredAt: null,
  pendingAsk: null,
  askOut: null,
  replayOpen: false,
  hintsUsed: [],
  statusFilter: [],
  setData: (d, source) => set(s => ({ data: d, source, syncedAt: Date.now(), st: statusesAt(d, s.time) })),
  select: (f, tab) => set(s => ({ focus: f, tab: tab ?? (f.kind === s.focus.kind && focusKey(f) === focusKey(s.focus) ? s.tab : 'overview'), record: null, bump: s.bump + 1 })),
  back: () => {
    const { focus, data, record } = get()
    if (record) return set({ record: null })
    if (focus.kind === 'task' && data) {
      const n = data.nodes.find(x => x.id === focus.id)
      return get().select(n ? { kind: 'agent', id: n.agent } : { kind: 'world' })
    }
    if (focus.kind !== 'world') get().select({ kind: 'world' })
  },
  setTime: t => set(s => ({ time: t, st: s.data ? statusesAt(s.data, t) : s.st })),
  set: p => set(p as S),
}))
