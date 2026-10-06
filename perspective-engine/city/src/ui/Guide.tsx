import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { hush, sfx, speak } from '../audio/sound'
import { BRIEF } from '../data/brief'
import { answer, narrate, STARTER_CHIPS, type GuideReply } from '../data/guide'
import { persist, useStore } from '../store'
import { spring } from './HUD'

interface Msg { who: 'guide' | 'you'; text: string; source?: string }

/** The guide: narrates the focus, answers from the project files, and can fly the camera. */
export function Guide() {
  const data = useStore(s => s.data)!
  const open = useStore(s => s.guideOpen)
  const voice = useStore(s => s.voice)
  const mode = useStore(s => s.mode)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [chips, setChips] = useState<string[]>(STARTER_CHIPS)
  const [caption, setCaption] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const log = useRef<HTMLDivElement>(null)

  const say = (text: string, source?: string, spoken = true) => {
    setMsgs(m => [...m.slice(-30), { who: 'guide', text, source }])
    setCaption(text)
    const s = useStore.getState()
    if (spoken && s.sound && s.voice && s.entered) speak(text)
  }

  // Greet once the cortex has assembled.
  useEffect(() => {
    const t = setTimeout(() => say(`${BRIEF.hook} Scroll to magnify, or ask me anything.`, undefined, false), 3600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Narrate every new focus in explore mode.
  useEffect(() => useStore.subscribe((s, p) => {
    if (s.mode !== 'explore' || !s.data) return
    if (s.focus !== p.focus || s.workerView !== p.workerView) say(narrate(s.data, s.st, s.focus, s.time))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  useEffect(() => { if (!caption) return; const t = setTimeout(() => setCaption(null), 9000); return () => clearTimeout(t) }, [caption])
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }) }, [msgs, open])

  const ask = (text: string) => {
    if (!text.trim()) return
    const s = useStore.getState()
    setMsgs(m => [...m, { who: 'you', text }])
    const r: GuideReply = answer(text, data, s.st, s.time)
    setChips(r.chips ?? STARTER_CHIPS.filter(c => c.toLowerCase() !== text.toLowerCase()).slice(0, 4))
    if (r.dive) { if (s.mode === 'story') { s.set({ mode: 'explore' }); scrollTo(0, 0) } sfx.dive(); s.dive(r.dive) }
    if (r.panel) s.set({ panel: r.panel })
    // Narration of the new focus would duplicate the answer; say the answer instead.
    setTimeout(() => say(r.text, r.source), r.dive ? 30 : 0)
    setQ('')
  }

  return (
    <div className={`guide${open ? ' open' : ''}${mode === 'story' ? ' in-story' : ''}`}>
      <AnimatePresence>
        {open && (
          <motion.section className="guide-panel" role="dialog" aria-label="Guide" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }} transition={spring}>
            <header>
              <b>Guide</b>
              <span className="muted">Answers come from the project files only.</span>
              <button className="chip-btn" aria-pressed={voice} onClick={() => { const v = !voice; useStore.getState().set({ voice: v }); persist('pe.voice', v ? '1' : '0'); if (!v) hush() }}>{voice ? 'Voice on' : 'Voice off'}</button>
            </header>
            <div className="guide-log scrolls" ref={log} aria-live="polite">
              {msgs.map((m, i) => (
                <p key={i} className={m.who}>{m.text}{m.source && <> <a href={m.source} target="_blank" rel="noreferrer">Source</a></>}</p>
              ))}
            </div>
            <div className="guide-chips">{chips.map(c => <button key={c} onClick={() => ask(c)}>{c}</button>)}</div>
            <form onSubmit={e => { e.preventDefault(); ask(q) }}>
              <label htmlFor="guide-q" className="sr-only">Ask the guide</label>
              <input id="guide-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Ask: what changed recently? show Ogilvy" autoComplete="off" />
              <button type="submit" className="cta">Ask</button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!open && caption && (
          <motion.p className="caption" role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>{caption}</motion.p>
        )}
      </AnimatePresence>
      <button className="orb" onClick={() => { sfx.click(); useStore.getState().set({ guideOpen: !open }) }} aria-expanded={open} aria-label={open ? 'Close the guide' : 'Open the guide'}>
        <span className="orb-core" /><span className="orb-ring" /><span className="orb-ring r2" />
        <em>{open ? 'Close' : 'Guide'}</em>
      </button>
    </div>
  )
}
