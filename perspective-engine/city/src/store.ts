import { create } from 'zustand'
import { focusKind, levelOf, parentOf, statusesAt } from './data/model'
import type { GraphState, Status } from './data/types'

export type Mode = 'story' | 'explore'
export type Panel = 'none' | 'palette' | 'index' | 'pilot'
export interface Hover { kind: 'agent' | 'task' | 'worker' | 'atom'; id: string }

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
export const persist = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* storage unavailable */ } }

interface S {
  data: GraphState | null
  prev: GraphState | null
  st: Map<string, Status>
  mode: Mode
  focus: string
  level: 1 | 2 | 3 | 4
  nudge: number
  workerView: boolean
  hover: Hover | null
  record: string | null
  time: number | null
  statusFilter: Status[]
  phaseFilter: number[]
  sound: boolean
  voice: boolean
  storyP: number
  storyChapter: number
  panel: Panel
  guideOpen: boolean
  entered: boolean
  webgl: boolean
  setData: (d: GraphState) => void
  dive: (id: string, opts?: { worker?: boolean }) => void
  back: () => void
  zoomBy: (d: number) => void
  setTime: (t: number | null) => void
  set: (p: Partial<S>) => void
}

export const useStore = create<S>((set, get) => ({
  data: null,
  prev: null,
  st: new Map(),
  mode: 'story',
  focus: 'venture',
  level: 1,
  nudge: 0,
  workerView: false,
  hover: null,
  record: null,
  time: null,
  statusFilter: [],
  phaseFilter: [],
  sound: read('pe.sound') === '1',
  voice: read('pe.voice') !== '0',
  storyP: 0,
  storyChapter: 0,
  panel: 'none',
  guideOpen: false,
  entered: false,
  webgl: true,
  setData: d => set(s => ({ prev: s.data, data: d, st: statusesAt(d, s.time) })),
  dive: (id, opts) => {
    const d = get().data
    if (!d) return
    const level = levelOf(focusKind(d, id))
    set({ focus: id, level, nudge: 0, workerView: !!opts?.worker, record: null, hover: null })
  },
  back: () => {
    const { data, focus, level, workerView } = get()
    if (!data || level === 1) return
    if (workerView) return set({ workerView: false })
    const up = parentOf(data, focus)
    set({ focus: up, level: levelOf(focusKind(data, up)), nudge: 0, record: null })
  },
  zoomBy: dz => {
    const { nudge, level, data, focus, hover } = get()
    const n = nudge + dz
    if (n > 0.5 && level < 4 && data) {
      // Zooming in past a level dives into what the cursor is on, or the most relevant child.
      const target = pickChild(data, focus, hover, get().st)
      if (target) return get().dive(target)
    }
    if (n < -0.5 && level > 1) return get().back()
    set({ nudge: Math.max(-0.5, Math.min(0.5, n)) })
  },
  setTime: t => set(s => ({ time: t, st: s.data ? statusesAt(s.data, t) : s.st })),
  set: p => set(p as S),
}))

function pickChild(d: GraphState, focus: string, hover: Hover | null, st: Map<string, Status>): string | null {
  const k = focusKind(d, focus)
  if (hover && (hover.kind === 'agent' || hover.kind === 'worker') && k !== 'agent') return hover.id
  if (hover?.kind === 'task') return hover.id
  if (k === 'venture') return 'city'
  if (k === 'city') {
    const live = d.nodes.find(n => st.get(n.id) === 'running') ?? d.nodes.find(n => st.get(n.id) === 'ready')
    return live?.agent ?? 'orchestrator'
  }
  if (k === 'agent') {
    const mine = d.nodes.filter(n => n.agent === focus)
    return (mine.find(n => st.get(n.id) === 'running') ?? mine.find(n => st.get(n.id) === 'done') ?? mine[0])?.id ?? null
  }
  return null
}
