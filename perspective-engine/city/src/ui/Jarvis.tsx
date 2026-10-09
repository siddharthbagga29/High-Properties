import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { sfx } from '../audio/sound'
import { acceptOffer, dismissOffer, interrupt, onTyping, openJarvis, say, toggleMic, toggleSpeak } from '../jarvis/client'
import { presence } from '../jarvis/presence'
import { useJarvis } from '../jarvis/state'
import { useStore } from '../store'
import { spring } from './Drawer'

/** Re-render now and then: "working now" and "due" are judged against the clock. */
function useClock(every: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), every); return () => clearInterval(id) }, [every])
  return now
}

function useMedia(q: string) {
  const [on, setOn] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches)
  useEffect(() => {
    const m = matchMedia(q)
    const f = () => setOn(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [q])
  return on
}

const MicIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className="ico"><rect x="7" y="2.5" width="6" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v3" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
)
const SpeakIcon = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className="ico"><path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor" />
    {on ? <path d="M13 7c1.3 1.6 1.3 4.4 0 6M15.5 5c2.4 2.8 2.4 7.2 0 10" fill="none" stroke="currentColor" strokeWidth="1.4" /> : <path d="M13 8l4 4M17 8l-4 4" stroke="currentColor" strokeWidth="1.4" />}</svg>
)

/** Speaking: a small live waveform. Listening: a pulsing ring on the mic. Thinking: the orb breathes faster. */
function Orb({ state }: { state: 'idle' | 'thinking' | 'speaking' | 'listening' }) {
  return (
    <span className={`tb-orb ${state}`} aria-hidden="true">
      {state === 'speaking' ? <span className="wave"><i /><i /><i /><i /><i /></span> : <span className="ask-orb" />}
    </span>
  )
}

/**
 * "Talk to Jarvis": the bottom bar. Type or speak; replies appear in the Jarvis console and are spoken when the
 * speaker is on. Typing or pressing the mic stops Jarvis talking at once (barge-in); Stop interrupts anything.
 */
export function TalkBar() {
  const [q, setQ] = useState('')
  const focus = useStore(s => s.focus)
  const data = useStore(s => s.data)
  const busy = useJarvis(s => s.busy)
  const speaking = useJarvis(s => s.speaking)
  const mic = useJarvis(s => s.mic)
  const interim = useJarvis(s => s.interim)
  const micNote = useJarvis(s => s.micNote)
  const speak = useJarvis(s => s.speak)
  const status = useJarvis(s => s.status)
  const last = useJarvis(s => s.thread[s.thread.length - 1])
  const narrow = useMedia('(max-width: 900px)')
  const listening = mic === 'listening'
  const state = listening ? 'listening' : speaking ? 'speaking' : busy ? 'thinking' : 'idle'
  const what = focus.kind === 'world' ? 'the company' : focus.kind === 'brain' ? 'the plan' : focus.kind === 'agent' ? data?.agents[focus.id]?.name ?? 'this agent' : focus.id
  const showMic = mic !== 'unsupported' && mic !== 'unavailable' && status !== 'failed'
  const active = listening || mic === 'starting' || speaking || busy
  useEffect(() => {
    if (!micNote) return
    const id = setTimeout(() => useJarvis.getState().set({ micNote: null }), 9000)
    return () => clearTimeout(id)
  }, [micNote])
  const placeholder = listening ? 'Listening…' : mic === 'starting' ? 'Starting the microphone…' : narrow ? 'Talk to Jarvis…' : `Talk to Jarvis about ${what}… e.g. “what needs me?”`
  return (
    <>
      <form className={`askbar talkbar s-${state}`} aria-label="Talk to Jarvis" onSubmit={e => {
        e.preventDefault()
        if (!q.trim()) return
        const s = useStore.getState()
        s.set({ hintsUsed: [...new Set([...s.hintsUsed, 'ask'])] })
        sfx.click()
        say(q)
        setQ('')
      }}>
        <button type="button" className="tb-open" onClick={() => openJarvis('talk')} aria-label="Open the Jarvis conversation"><Orb state={state} /></button>
        <label htmlFor="askbar-q" className="sr-only">Talk to Jarvis about {what}</label>
        <input id="askbar-q" value={listening || mic === 'starting' ? interim : q} readOnly={listening || mic === 'starting'}
          onChange={e => { onTyping(); setQ(e.target.value) }} placeholder={placeholder} autoComplete="off" enterKeyHint="send" />
        {showMic && (
          <button type="button" className={`tb-btn tb-mic${listening ? ' on' : ''}`} onClick={toggleMic} aria-pressed={listening}
            aria-label={listening ? 'Stop listening' : 'Speak to Jarvis'} title={listening ? 'Stop listening' : 'Speak to Jarvis'}>
            <MicIcon />{listening && <span className="ring" aria-hidden="true" />}
          </button>
        )}
        <button type="button" className={`tb-btn tb-speak${speak ? ' on' : ''}`} onClick={toggleSpeak} aria-pressed={speak}
          aria-label={speak ? 'Jarvis speaks replies: turn off' : 'Jarvis is muted: let it speak replies'} title={speak ? 'Mute Jarvis' : 'Let Jarvis speak'}>
          <SpeakIcon on={speak} />
        </button>
        {active
          ? <button type="button" className="cta tb-stop" onClick={interrupt}>Stop</button>
          : <button type="submit" className="cta">Ask</button>}
      </form>
      {/* One polite announcement per answer (the thread itself is not live, so streaming is never read chunk by chunk). */}
      <p className="sr-only" role="status">{listening ? 'Listening' : busy ? 'Jarvis is thinking' : last && last.who === 'jarvis' && !last.busy ? `Jarvis: ${last.error === 'Stopped' ? 'stopped. ' : ''}${last.text}` : ''}</p>
      {micNote && <p className="tb-note" role="status">{micNote}</p>}
    </>
  )
}

/** The compact presence under the brand: Online · Currently · Done · Needs you · Next. Opens the console. */
export function JarvisPresence() {
  const data = useStore(s => s.data)
  const source = useStore(s => s.source)
  const open = useStore(s => s.jarvisOpen)
  const status = useJarvis(s => s.status)
  const viewer = useJarvis(s => s.viewer)
  const sinceIso = useJarvis(s => s.sinceIso)
  const requests = useJarvis(s => s.requests)
  const reminders = useJarvis(s => s.reminders)
  const now = useClock(30_000)
  const p = useMemo(() => presence({ data, source, status, viewer, sinceIso, now, requests, reminders }), [data, source, status, viewer, sinceIso, now, requests, reminders])
  return (
    <button className={`jpresence${open ? ' open' : ''}`} onClick={() => { sfx.click(); open ? useStore.getState().set({ jarvisOpen: false }) : openJarvis('brief') }}
      aria-expanded={open} aria-controls="jarvis-console"
      aria-label={`Jarvis, ${p.onlineLabel}${viewer === 'owner' ? ', owner mode' : ''}. Currently: ${p.currently}. ${p.completed} completed ${p.completedLabel}. ${p.needsLabel}: ${p.needs}. Next: ${p.next ?? 'nothing ready'}. ${open ? 'Close' : 'Open'} the Jarvis console.`}>
      <span className="jp-head" title={p.onlineTitle}>
        <i className={`jp-dot ${p.online}`} /><b>Jarvis</b><span className="jp-on">{p.onlineLabel}</span>
        {viewer === 'owner' && <em>Owner</em>}
      </span>
      <span className="jp-row" aria-hidden="true">
        <span className="jp-cur"><small>Currently</small>{p.currently}</span>
        <span title={`Completed ${p.completedLabel}`}><small>Done</small>{p.completed}</span>
        <span className={p.needs ? 'hot' : ''} data-short={viewer === 'owner' ? 'Needs you' : 'Waiting'}><small>{p.needsLabel}</small>{p.needs}</span>
        <span title={p.nextTitle ?? undefined}><small>Next</small>{p.next ?? '—'}</span>
      </span>
    </button>
  )
}

/** A small card beside the presence: the visitor's offer of help, or the owner's briefing / reminder / request update. */
export function JarvisBubble() {
  const offer = useJarvis(s => s.offer)
  const toast = useJarvis(s => s.toast)
  const open = useStore(s => s.jarvisOpen)
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => { if (useJarvis.getState().toast?.id === toast.id) useJarvis.getState().set({ toast: null }) }, 14_000)
    return () => clearTimeout(id)
  }, [toast])
  useEffect(() => { if (open && toast) useJarvis.getState().set({ toast: null }) }, [open, toast])
  const show = offer ? 'offer' : toast && !open ? 'toast' : null
  return (
    <div className="jbubble-wrap" aria-live="polite">
      <AnimatePresence>
        {show === 'offer' && offer && (
          <motion.div key={`o-${offer.key}`} className="jbubble offer" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring}>
            <p><b>Jarvis</b>{offer.text}</p>
            <div className="jb-actions">
              <button className="cta" onClick={acceptOffer}>Yes, explain</button>
              <button className="linkish" onClick={dismissOffer}>No thanks</button>
            </div>
          </motion.div>
        )}
        {show === 'toast' && toast && (
          <motion.div key={`t-${toast.id}`} className={`jbubble ${toast.kind}`} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring}>
            <p><b>Jarvis</b>{toast.text}</p>
            <div className="jb-actions">
              <button className="ghost" onClick={() => { useJarvis.getState().set({ toast: null }); openJarvis(toast.kind === 'briefing' ? 'brief' : 'talk') }}>Open</button>
              <button className="linkish" onClick={() => useJarvis.getState().set({ toast: null })} aria-label="Dismiss">Dismiss</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
