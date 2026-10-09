/**
 * Jarvis's UI state, separate from the city's store so the city never depends on it. Small and eager: the bar and
 * the presence read it at first paint; everything that does work (engine.ts) is loaded later.
 * Whether the console is open lives in the city store (`jarvisOpen`), so the scene can open it too.
 */
import { create } from 'zustand'
import type { Reminder, Viewer } from '@jarvis/types'
import type { JarvisPrefs } from './prefs'
import type { JarvisStatus } from './presence'
import type { ConsoleTab, Decision, OwnerRequest, ThreadMsg } from './types'
import type { MicState } from './voice'
import type { Offer } from './visitor'

export interface JarvisState {
  status: JarvisStatus
  viewer: Viewer
  /** Which runtime capabilities this view has (each may be absent). */
  caps: { db: boolean; sample: boolean; user: boolean }
  /** Owner with a usable private store (db + id). */
  privateData: boolean
  /** Why private features are off, in words, when the owner has no private store here. */
  privateNote: string | null
  thread: ThreadMsg[]
  busy: boolean
  speaking: boolean
  mic: MicState
  micNote: string | null
  /** Live transcript while listening. */
  interim: string
  /** The speak toggle: replies and notifications are spoken when on. */
  speak: boolean
  prefs: JarvisPrefs | null
  reminders: Reminder[]
  requests: OwnerRequest[]
  decisions: Decision[]
  /** The owner's previous visit, read before this visit was recorded. */
  sinceIso: string | null
  tab: ConsoleTab
  offer: Offer | null
  /** A short owner notification beside the presence (briefing, a reminder due, a request update). */
  toast: { id: number; text: string; kind: 'briefing' | 'reminder' | 'request' } | null
  /** Reminders that fell due while the page is open. */
  dueNow: Reminder[]
  set: (p: Partial<JarvisState>) => void
}

const readLocal = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const readSession = (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } }

/** The mic is shown only where the browser has a recogniser and it was not refused earlier in this session. */
function initialMic(): MicState {
  const w = typeof window === 'undefined' ? null : (window as unknown as Record<string, unknown>)
  if (!w || !(w.SpeechRecognition || w.webkitSpeechRecognition)) return 'unsupported'
  return readSession('pe.jarvis.mic') === '1' ? 'unavailable' : 'idle'
}

export const useJarvis = create<JarvisState>(set => ({
  status: 'booting',
  viewer: 'visitor',
  caps: { db: false, sample: false, user: false },
  privateData: false,
  privateNote: null,
  thread: [],
  busy: false,
  speaking: false,
  mic: initialMic(),
  micNote: null,
  interim: '',
  // Visitors did not ask for a talking page: speech is off until they turn it on. The owner's choice comes from prefs.
  speak: readLocal('pe.jarvis.speak') === '1',
  prefs: null,
  reminders: [],
  requests: [],
  decisions: [],
  sinceIso: null,
  tab: 'brief',
  offer: null,
  toast: null,
  dueNow: [],
  set: p => set(p),
}))

let seq = 0
export const msgId = () => `m${Date.now().toString(36)}${(++seq).toString(36)}`

/** Appends a message and returns its id. */
export function pushMsg(m: Omit<ThreadMsg, 'id' | 'at'> & { at?: number }): string {
  const id = msgId()
  const thread = [...useJarvis.getState().thread, { ...m, id, at: m.at ?? Date.now() }].slice(-80)
  useJarvis.getState().set({ thread })
  return id
}

export function patchMsg(id: string, p: Partial<ThreadMsg>): void {
  const thread = useJarvis.getState().thread.map(m => (m.id === id ? { ...m, ...p } : m))
  useJarvis.getState().set({ thread })
}
