import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { sfx } from '../audio/sound'
import { focusKind, fmtTime, LEVEL_MAG, LEVEL_NAME, ms, parentOf, STATUS_LABEL, timeline } from '../data/model'
import type { Status } from '../data/types'
import { persist, useStore } from '../store'

export const spring = { type: 'spring', stiffness: 220, damping: 26 } as const

export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M12 0v5M12 19v5M0 12h5M19 12h5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function SoundToggle() {
  const sound = useStore(s => s.sound)
  const toggle = () => {
    const next = !sound
    useStore.getState().set({ sound: next, entered: true })
    persist('pe.sound', next ? '1' : '0')
    if (next) { sfx.enable(); sfx.click() }
  }
  return (
    <button className="chip-btn" onClick={toggle} aria-pressed={sound} aria-label={sound ? 'Turn sound off' : 'Turn sound on'}>
      <svg viewBox="0 0 20 20" aria-hidden="true" className="ico">
        <path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor" />
        {sound ? <path d="M13 7c1.3 1.6 1.3 4.4 0 6M15.5 5c2.4 2.8 2.4 7.2 0 10" fill="none" stroke="currentColor" strokeWidth="1.4" /> : <path d="M13 8l4 4M17 8l-4 4" stroke="currentColor" strokeWidth="1.4" />}
      </svg>
      <span className="sound-label">{sound ? 'Sound on' : 'Sound off'}</span>
    </button>
  )
}

function Badge() {
  const data = useStore(s => s.data)
  const time = useStore(s => s.time)
  if (!data) return <span className="badge">Loading graph…</span>
  return time === null
    ? <span className="badge live" title="Read from graph.json and ledger.jsonl, refreshed every 20 seconds"><i />Live · graph export {fmtTime(ms(data.generated))}</span>
    : <span className="badge replay"><i />Replay · {fmtTime(time)}</span>
}

export function Crumbs() {
  const data = useStore(s => s.data)
  const focus = useStore(s => s.focus)
  const record = useStore(s => s.record)
  if (!data) return null
  const chain: { id: string; label: string }[] = []
  let cur = focus
  for (let i = 0; i < 4; i++) {
    const k = focusKind(data, cur)
    const label = k === 'venture' ? 'Perspective Engine' : k === 'city' ? 'Districts' : k === 'agent' ? `${data.agents[cur].district}` : cur
    chain.unshift({ id: cur, label })
    if (k === 'venture') break
    cur = parentOf(data, cur)
  }
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {chain.map((c, i) => (
        <span key={c.id}>
          {i > 0 && <em aria-hidden="true">›</em>}
          <button onClick={() => { sfx.dive(); useStore.getState().dive(c.id) }} aria-current={i === chain.length - 1 && !record ? 'page' : undefined}>{c.label}</button>
        </span>
      ))}
      {record && <span><em aria-hidden="true">›</em><button aria-current="page">Record</button></span>}
    </nav>
  )
}

export function HUD() {
  const mode = useStore(s => s.mode)
  const set = useStore(s => s.set)
  const enterCity = () => { sfx.dive(); set({ mode: 'explore', entered: true }); window.scrollTo(0, 0); useStore.getState().dive('city') }
  return (
    <header className="hud">
      <div className="hud-l">
        <button className="brand" onClick={() => { sfx.dive(); useStore.getState().dive('venture') }} aria-label="Perspective Engine, back to the whole venture">
          <Mark /><span>Perspective Engine</span>
        </button>
        {mode === 'explore' && <Crumbs />}
      </div>
      <div className="hud-r">
        {mode === 'explore' && <Badge />}
        <SoundToggle />
        {mode === 'explore' ? (
          <>
            <button className="chip-btn" onClick={() => set({ panel: 'palette' })} aria-label="Search (Command K)"><span>Find</span><kbd>⌘K</kbd></button>
            <button className="chip-btn" onClick={() => set({ panel: 'index' })}><span>Index</span></button>
          </>
        ) : (
          <button className="chip-btn" onClick={enterCity}><span>Skip to the city</span></button>
        )}
        <button className="cta" onClick={() => { sfx.click(); set({ panel: 'pilot' }) }}>Request a pilot</button>
      </div>
    </header>
  )
}

/** The Atelier frame as a microscope eyepiece: a scrim with one circular window and a graduated reticle. */
export function Reticle() {
  const level = useStore(s => s.level)
  const ticks = useMemo(() => Array.from({ length: 120 }, (_, i) => {
    const a = (i / 120) * Math.PI * 2, major = i % 10 === 0, r0 = major ? 1.035 : 1.012
    return { x1: Math.cos(a), y1: Math.sin(a), x2: Math.cos(a) * r0 * (major ? 1.03 : 1.015), y2: Math.sin(a) * r0 * (major ? 1.03 : 1.015), major }
  }), [])
  return (
    <div className="reticle" aria-hidden="true">
      <div className="scrim" />
      <div className="ring" />
      <svg className="ticks" viewBox="-1.12 -1.12 2.24 2.24">
        {ticks.map((t, i) => <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className={t.major ? 'maj' : ''} vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div className="mag"><b>{LEVEL_MAG[level]}</b> {LEVEL_NAME[level]}</div>
    </div>
  )
}

export function ZoomDock() {
  const level = useStore(s => s.level)
  const data = useStore(s => s.data)
  const focus = useStore(s => s.focus)
  const go = (l: number) => {
    const s = useStore.getState()
    if (!data) return
    sfx.dive()
    if (l === 1) return s.dive('venture')
    if (l === 2) return s.dive('city')
    const k = focusKind(data, focus)
    const agent = k === 'agent' ? focus : k === 'task' ? data.nodes.find(n => n.id === focus)!.agent : 'gtm'
    if (l === 3) return s.dive(agent)
    const mine = data.nodes.filter(n => n.agent === agent)
    s.dive(k === 'task' ? focus : (mine.find(n => s.st.get(n.id) === 'done') ?? mine[0]).id)
  }
  return (
    <div className="zoom-dock" role="group" aria-label="Magnification">
      <button onClick={() => { sfx.click(); useStore.getState().zoomBy(0.6) }} aria-label="Zoom in">+</button>
      <ol>
        {[1, 2, 3, 4].map(l => (
          <li key={l}><button className={l === level ? 'on' : ''} onClick={() => go(l)} aria-label={`${LEVEL_NAME[l]} at ${LEVEL_MAG[l]}`}>{LEVEL_MAG[l]}</button></li>
        ))}
      </ol>
      <button onClick={() => { sfx.click(); useStore.getState().zoomBy(-0.6) }} aria-label="Zoom out">−</button>
    </div>
  )
}

const FILTERS: Status[] = ['done', 'running', 'ready', 'awaiting_human', 'blocked', 'pending']

export function Scrubber() {
  const data = useStore(s => s.data)
  const time = useStore(s => s.time)
  const statusFilter = useStore(s => s.statusFilter)
  const phaseFilter = useStore(s => s.phaseFilter)
  const [playing, setPlaying] = useState(false)
  const raf = useRef(0)
  const [start, end] = data ? timeline(data) : [0, 1]
  const cur = time ?? end

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const step = (now: number) => {
      const s = useStore.getState()
      const t = (s.time ?? start) + ((now - last) / 18000) * (end - start)
      last = now
      if (t >= end) { s.setTime(null); setPlaying(false); return }
      s.setTime(t)
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, start, end])

  if (!data) return null
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])
  return (
    <div className="scrubber">
      <div className="filters" role="group" aria-label="Filter towers">
        {FILTERS.map(f => (
          <button key={f} className={`fchip st-${f}${statusFilter.includes(f) ? ' on' : ''}`} aria-pressed={statusFilter.includes(f)}
            onClick={() => { sfx.click(); useStore.getState().set({ statusFilter: toggle(statusFilter, f) }) }}>
            <i />{STATUS_LABEL[f]}
          </button>
        ))}
        <span className="sep" aria-hidden="true" />
        {[0, 1, 2, 3].map(p => (
          <button key={p} className={`fchip${phaseFilter.includes(p) ? ' on' : ''}`} aria-pressed={phaseFilter.includes(p)}
            onClick={() => { sfx.click(); useStore.getState().set({ phaseFilter: toggle(phaseFilter, p) }) }}>Phase {p}</button>
        ))}
      </div>
      <div className="track-row">
        <button className="play" onClick={() => { sfx.click(); if (!playing && time === null) useStore.getState().setTime(start); setPlaying(!playing) }} aria-label={playing ? 'Pause replay' : 'Replay the project timeline'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="track">
          <div className="ticks-ev" aria-hidden="true">
            {data.ledger.map((e, i) => <i key={i} className={`ev ev-${e.event}`} style={{ left: `${((ms(e.t) - start) / (end - start)) * 100}%` }} />)}
          </div>
          <input type="range" min={start} max={end} step={1000} value={cur} aria-label="Project timeline"
            aria-valuetext={time === null ? 'Live' : fmtTime(cur)}
            onChange={e => { setPlaying(false); const v = Number(e.target.value); useStore.getState().setTime(v >= end - 1000 ? null : v) }} />
        </div>
        <span className="tlabel">{fmtTime(start)}</span>
        <button className={`livepill${time === null ? ' on' : ''}`} onClick={() => { setPlaying(false); useStore.getState().setTime(null); sfx.click() }}>Live</button>
      </div>
    </div>
  )
}

export function Cascade({ children, k }: { children: React.ReactNode; k: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div key={k} initial="h" animate="s" exit="h" variants={{ s: { transition: { staggerChildren: 0.045 } }, h: {} }}>
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export const rise = { h: { opacity: 0, y: 14 }, s: { opacity: 1, y: 0, transition: spring } }
