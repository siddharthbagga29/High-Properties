/**
 * The eager face of Jarvis: tiny functions the bar, the presence and the scene can call at any time. The engine
 * that does the work is a separate chunk, loaded after first paint; if it fails to load, Jarvis says so and the
 * city carries on (the bar falls back to the drawer's Ask tab).
 */
import { useStore } from '../store'
import { useJarvis } from './state'

type Engine = typeof import('./engine')
let loading: Promise<Engine> | null = null

function engine(): Promise<Engine> {
  loading ??= import('./engine').catch(e => {
    console.error('[jarvis] engine failed to load', e)
    useJarvis.getState().set({ status: 'failed' })
    loading = null
    throw e
  })
  return loading
}

/** Starts Jarvis: capabilities, viewer mode, the owner's rows, briefing. Safe to call more than once. */
export function bootJarvis(): void {
  engine().then(m => m.boot()).catch(() => useJarvis.getState().set({ status: 'failed' }))
}

/** Something to say to Jarvis. When Jarvis is down, the question goes to the drawer's Ask tab instead. */
export function say(text: string): void {
  const t = text.trim()
  if (!t) return
  if (useJarvis.getState().status === 'failed') {
    useStore.getState().set({ tab: 'ask', pendingAsk: t })
    return
  }
  engine().then(m => m.say(t)).catch(() => useStore.getState().set({ tab: 'ask', pendingAsk: t }))
}

const call = (f: (m: Engine) => void) => () => { engine().then(f).catch(() => undefined) }

/** Stops speech, thinking and listening at once (the interruption control). */
export const interrupt = call(m => m.interrupt())
export const toggleMic = call(m => m.toggleMic())
export const toggleSpeak = call(m => m.toggleSpeak())
export const acceptOffer = call(m => m.acceptOffer())
export const dismissOffer = call(m => m.dismissOffer())
/** Barge-in while typing: speech stops the moment the owner starts typing. */
export function onTyping(): void {
  if (useJarvis.getState().speaking) interrupt()
}
export function setQuietHours(q: { enabled: boolean; start: string; end: string }): void { engine().then(m => m.setQuietHours(q)).catch(() => undefined) }
export function cancelRequest(id: string): void { engine().then(m => m.cancelRequest(id)).catch(() => undefined) }
export function dismissReminder(id: string): void { engine().then(m => m.dismissReminder(id)).catch(() => undefined) }

/** Opens the console on a tab (the presence, the brain and the bust call this). */
export function openJarvis(tab?: 'brief' | 'talk' | 'agents'): void {
  if (tab) useJarvis.getState().set({ tab })
  useStore.getState().set({ jarvisOpen: true })
}
