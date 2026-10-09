/**
 * Jarvis in the page: loaded after first paint. Resolves the runtime capabilities (every one may be null), decides
 * owner or visitor from user.isOwner(), wires the owner's private rows, the conversation, voice, reminders,
 * request updates, the once-per-visit briefing and the visitor's session-only help offers.
 */
import { recall } from '@jarvis/memory'
import { due } from '@jarvis/reminders'
import type { Viewer } from '@jarvis/types'
import { explainSimply } from '../data/guide'
import { statusesAt } from '../data/model'
import { focusKey, useStore } from '../store'
import { composeBrief } from './brief'
import { guideText, pageProviders } from './chat'
import { respond, type ConvEnv } from './conversation'
import { createOwnerData, type DbLike, type OwnerData } from './owner-data'
import { browserTzOffset, DEFAULT_PREFS, maySpeak, type SpeechKind } from './prefs'
import { dueToAnnounce } from './reminders'
import { changeSentence, requestChanges } from './requests'
import { readAudit } from './scorecards'
import { patchMsg, pushMsg, useJarvis } from './state'
import type { Target } from './targets'
import { cityRegistry } from './tools'
import type { OwnerRequest, Proposal } from './types'
import { VisitorModel } from './visitor'
import { createListener, createSpeaker, recognitionFactory, type Listener, type Speaker, type UtteranceLike } from './voice'

interface UserCap { isOwner(): Promise<boolean>; id(): Promise<string | null> }
interface ClaudeLike { use(name: string): Promise<unknown> }

const J = () => useJarvis.getState()
const C = () => useStore.getState()
const tz = browserTzOffset()
const MIC_OFF_KEY = 'pe.jarvis.mic'
const SPEAK_KEY = 'pe.jarvis.speak'
const BRIEFED_KEY = 'pe.jarvis.briefed'

const session = {
  get: (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch { /* storage unavailable */ } },
}
const local = {
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* storage unavailable */ } },
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
}

const rt = {
  started: false,
  viewer: 'visitor' as Viewer,
  sample: null as unknown,
  data: null as OwnerData | null,
  registry: null as ReturnType<typeof cityRegistry>['registry'] | null,
  proposal: null as Proposal | null,
  ctl: null as AbortController | null,
  gen: 0,
  announced: new Set<string>(),
  prevRequests: null as OwnerRequest[] | null,
  prefsLoaded: false,
  briefed: false,
  visitor: null as VisitorModel | null,
  toastSeq: 0,
}

// ---------- voice ----------

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
const speaker: Speaker = createSpeaker(
  synth as unknown as Parameters<typeof createSpeaker>[0],
  typeof SpeechSynthesisUtterance !== 'undefined' ? (t: string) => new SpeechSynthesisUtterance(t) as unknown as UtteranceLike : null,
  speaking => J().set({ speaking }),
)

const listener: Listener = createListener(session.get(MIC_OFF_KEY) === '1' ? null : recognitionFactory(typeof window !== 'undefined' ? window : null), {
  onState: s => J().set({ mic: s, ...(s === 'idle' || s === 'unavailable' ? { interim: '' } : {}) }),
  onInterim: text => J().set({ interim: text }),
  onFinal: text => {
    J().set({ interim: '' })
    void say(text)
  },
  onError: (text, hide) => {
    if (hide) session.set(MIC_OFF_KEY, '1')
    J().set({ micNote: text, ...(hide ? { mic: 'unavailable' as const } : {}) })
  },
})

function speakIf(kind: SpeechKind, text: string): void {
  const j = J()
  if (!speaker.available || j.mic === 'listening' || j.mic === 'starting') return
  if (!maySpeak(kind, j.speak, j.prefs, new Date(), tz).ok) return
  void speaker.speak(text, { rate: j.prefs?.voice.rate ?? 1 })
}

function toast(text: string, kind: 'briefing' | 'reminder' | 'request'): void {
  J().set({ toast: { id: ++rt.toastSeq, text, kind } })
}

// ---------- navigation for the navigate tool ----------

const narrow = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 900px)').matches

function go(t: Target): boolean {
  const s = C()
  // On a phone the console covers the city: step aside so the flight (or the panel) is visible.
  if (t.kind !== 'console' && narrow()) s.set({ jarvisOpen: false })
  if (t.kind === 'focus') {
    s.select(t.focus)
    return focusKey(C().focus) === focusKey(t.focus)
  }
  if (t.kind === 'panel') {
    s.set({ panel: t.panel })
    return C().panel === t.panel
  }
  if (t.kind === 'console') {
    J().set({ tab: t.tab })
    s.set({ jarvisOpen: true })
    return true
  }
  s.set({ replayOpen: true })
  return C().replayOpen
}

// ---------- boot ----------

async function capability(claude: ClaudeLike | undefined, name: string): Promise<unknown> {
  if (!claude?.use) return null
  try {
    return (await claude.use(name)) ?? null
  } catch {
    return null
  }
}

export async function boot(): Promise<void> {
  if (rt.started) return
  rt.started = true
  const claude = (window as unknown as { claude?: ClaudeLike }).claude
  const [user, db, sample] = (await Promise.all([capability(claude, 'user'), capability(claude, 'db'), capability(claude, 'sample')])) as [UserCap | null, DbLike | null, unknown]
  rt.sample = typeof sample === 'function' ? sample : null

  let owner = false
  try { owner = !!user && (await user.isOwner()) === true } catch { owner = false }
  rt.viewer = owner ? 'owner' : 'visitor'
  let uid: string | null = null
  if (owner && user) {
    try { uid = await user.id() } catch { uid = null }
  }
  if (owner && db && uid) {
    try { rt.data = createOwnerData(db, uid) } catch { rt.data = null }
  }
  const privateNote = !owner ? null : rt.data ? null : !db ? 'The database is not available in this view, so reminders, requests and decisions cannot be saved here.' : 'This view has no identity for you, so your private rows cannot be reached here.'

  rt.registry = cityRegistry({
    state: () => C().data,
    go,
    data: rt.data,
    requests: () => J().requests,
    reminders: () => J().reminders,
    now: () => new Date(),
  }).registry

  J().set({
    status: 'ready',
    viewer: rt.viewer,
    caps: { db: !!db, sample: !!rt.sample, user: !!user },
    privateData: !!rt.data,
    privateNote,
    mic: listener.supported ? (session.get(MIC_OFF_KEY) === '1' ? 'unavailable' : 'idle') : 'unsupported',
    // The owner hears Jarvis unless they muted it; their choice is saved in prefs once those load.
    speak: owner ? local.get(SPEAK_KEY) !== '0' : J().speak,
  })

  if (rt.data) watchOwner(rt.data)
  else rt.prefsLoaded = true
  if (!owner) startVisitorModel()

  setInterval(checkDue, 15_000)
  // The briefing waits for the record and for the entrance to be dismissed.
  useStore.subscribe(() => maybeBrief())
  maybeBrief()
}

function watchOwner(data: OwnerData): void {
  data.watch(
    patch => {
      const next: Partial<ReturnType<typeof J>> = {}
      if (patch.prefsLoaded) rt.prefsLoaded = true
      if ('prefs' in patch) {
        next.prefs = patch.prefs ?? null
        if (patch.prefs) next.speak = patch.prefs.voice.speak
        // Read once, before this visit is recorded: that is what "since your last visit" means.
        if (!rt.briefed && J().sinceIso === null) next.sinceIso = patch.prefs?.lastVisit ?? null
      }
      if (patch.reminders) next.reminders = patch.reminders
      if (patch.decisions) next.decisions = patch.decisions
      if (patch.requests) {
        next.requests = patch.requests
        for (const ch of requestChanges(rt.prevRequests, patch.requests)) {
          const text = changeSentence(ch.r)
          pushMsg({ who: 'jarvis', text, via: 'system', kind: 'request' })
          toast(text, 'request')
          speakIf('notification', text)
        }
        rt.prevRequests = patch.requests
      }
      J().set(next)
      if (patch.reminders) checkDue()
      maybeBrief()
    },
    text => J().set({ privateNote: `Your private Jarvis data could not be read: ${text}.` }),
  )
}

/** Once per visit, for the owner: a short written briefing in the thread and beside the presence, spoken if allowed. */
function maybeBrief(): void {
  if (rt.briefed || rt.viewer !== 'owner' || !rt.prefsLoaded) return
  const c = C()
  if (!c.data || (c.webgl && !c.introDone)) return
  rt.briefed = true
  const now = new Date()
  const b = composeBrief(c.data, 'owner', J().sinceIso, now, tz)
  pushMsg({ who: 'jarvis', text: b.text, via: 'rules', kind: 'briefing' })
  const already = session.get(BRIEFED_KEY) === '1'
  session.set(BRIEFED_KEY, '1')
  if (!already) {
    toast(`${b.greeting} ${b.since.sentence}`, 'briefing')
    speakIf('briefing', b.spoken)
  }
  if (rt.data) {
    const prefs = J().prefs ?? DEFAULT_PREFS
    void rt.data.savePrefs({ ...prefs, lastVisit: now.toISOString(), updatedAt: now.toISOString() })
  }
}

function checkDue(): void {
  if (rt.viewer !== 'owner') return
  const now = new Date()
  const list = J().reminders
  for (const r of dueToAnnounce(list, rt.announced, now)) {
    rt.announced.add(r.id)
    const text = `Reminder: ${r.text}`
    pushMsg({ who: 'jarvis', text, via: 'system', kind: 'reminder' })
    toast(text, 'reminder')
    speakIf('notification', text)
  }
  J().set({ dueNow: due(list, now) })
}

// ---------- visitor intelligence (session-only, in memory) ----------

function startVisitorModel(): void {
  const model = new VisitorModel()
  rt.visitor = model
  model.onFocus(C().focus)
  useStore.subscribe((s, p) => {
    if (focusKey(s.focus) !== focusKey(p.focus)) model.onFocus(s.focus)
    if (s.bump !== p.bump) model.onClick(focusKey(s.focus))
    if (s.panel === 'help' && p.panel !== 'help') model.onHelp()
    if (s.introDone && !p.introDone) model.restart()
  })
  setInterval(() => {
    const c = C(), j = J()
    if (document.hidden || c.jarvisOpen || c.panel !== 'none' || (c.webgl && !c.introDone) || j.offer || j.busy) return
    const offer = model.evaluate()
    if (offer) {
      model.onOffered()
      j.set({ offer })
    }
  }, 4000)
}

export function acceptOffer(): void {
  const offer = J().offer
  rt.visitor?.onAccepted()
  J().set({ offer: null, tab: 'talk' })
  const data = C().data
  if (!offer || !data) return
  C().set({ jarvisOpen: true })
  const text = explainSimply(data, statusesAt(data, null), offer.focus)
  pushMsg({ who: 'jarvis', text, via: 'rules', kind: 'offer' })
  speakIf('reply', text)
}

export function dismissOffer(): void {
  rt.visitor?.onDismissed()
  J().set({ offer: null })
}

// ---------- the conversation ----------

export function interrupt(): void {
  speaker.stop()
  rt.gen++
  rt.ctl?.abort()
  rt.ctl = null
  if (J().busy) J().set({ busy: false })
  listener.stop()
}

function env(history: ReturnType<typeof J>['thread']): ConvEnv {
  return {
    viewer: rt.viewer,
    now: () => new Date(),
    tz,
    state: () => C().data,
    focus: () => C().focus,
    audit: () => readAudit(C().data),
    sinceIso: () => J().sinceIso,
    owner: () => (rt.data ? { reminders: J().reminders, requests: J().requests, decisions: J().decisions } : null),
    registry: rt.registry!,
    proposal: { get: () => rt.proposal, set: p => { rt.proposal = p } },
    chat: (messages, opts) => {
      const c = C()
      const st = c.data ? statusesAt(c.data, null) : new Map()
      return pageProviders(rt.sample, c.data ? guideText(c.data, st, c.focus) : () => 'The project record has not loaded yet.').chat(messages, opts) as Promise<{ text: string; provider?: string }>
    },
    history: () => history,
    recall: rt.data ? q => recall(rt.data!.memory, q, 5, ['decision', 'preference']) : undefined,
  }
}

export async function say(text: string): Promise<void> {
  const t = text.trim()
  if (!t) return
  if (!rt.started) await boot()
  // Barge-in: anything new stops what Jarvis was saying or thinking.
  speaker.stop()
  rt.ctl?.abort()
  const history = J().thread.filter(m => !m.busy)
  C().set({ jarvisOpen: true })
  J().set({ tab: 'talk', offer: null })
  pushMsg({ who: 'you', text: t })
  const id = pushMsg({ who: 'jarvis', text: '', busy: true })
  const gen = ++rt.gen
  const ctl = new AbortController()
  rt.ctl = ctl
  J().set({ busy: true })
  try {
    const r = await respond(t, env(history), { onText: txt => { if (!ctl.signal.aborted) patchMsg(id, { text: txt }) }, signal: ctl.signal })
    // Even when superseded, a finished answer is shown: an action that ran must never be hidden.
    patchMsg(id, { text: r.text, busy: false, via: r.via, dive: r.dive })
    if (gen === rt.gen && !r.silent) speakIf('reply', r.spoken ?? r.text)
  } catch (e) {
    const stopped = ctl.signal.aborted || (e as { code?: string })?.code === 'cancelled'
    patchMsg(id, { busy: false, error: stopped ? 'Stopped' : 'Something went wrong while answering. Try again.' })
  } finally {
    if (gen === rt.gen) {
      rt.ctl = null
      J().set({ busy: false })
    }
  }
}

export function toggleMic(): void {
  const j = J()
  if (!listener.supported || j.mic === 'unavailable' || j.mic === 'unsupported') return
  if (j.mic === 'listening' || j.mic === 'starting') {
    listener.stop()
    return
  }
  // Pressing the mic interrupts Jarvis at once.
  speaker.stop()
  J().set({ micNote: null })
  listener.start()
}

export function toggleSpeak(): void {
  const next = !J().speak
  J().set({ speak: next })
  if (!next) speaker.stop()
  local.set(SPEAK_KEY, next ? '1' : '0')
  if (rt.data) {
    const prefs = J().prefs ?? DEFAULT_PREFS
    void rt.data.savePrefs({ ...prefs, voice: { ...prefs.voice, speak: next }, updatedAt: new Date().toISOString() })
  }
}

/** The owner's quiet hours (local time), saved in prefs. */
export async function setQuietHours(q: { enabled: boolean; start: string; end: string }): Promise<void> {
  if (!rt.data) return
  const prefs = J().prefs ?? DEFAULT_PREFS
  const r = await rt.data.savePrefs({ ...prefs, quietHours: q, updatedAt: new Date().toISOString() })
  if (!r.ok) pushMsg({ who: 'jarvis', text: `I couldn't save your quiet hours: ${r.error}.`, via: 'system' })
}

async function runOwnerTool(tool: string, input: Record<string, unknown>): Promise<void> {
  if (!rt.registry) return
  const r = await rt.registry.run(tool, input, { viewer: rt.viewer, confirmed: rt.viewer === 'owner' })
  pushMsg({ who: 'jarvis', text: r.summary, via: 'action' })
}

export function cancelRequest(id: string): void { void runOwnerTool('jarvis.cancel_request', { id }) }
export function dismissReminder(id: string): void { void runOwnerTool('jarvis.dismiss_reminder', { id }) }
