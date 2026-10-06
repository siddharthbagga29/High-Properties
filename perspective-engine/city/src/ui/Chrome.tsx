import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { sfx } from '../audio/sound'
import { agentStats, ago, clock, feed, KIND_LABEL, ms, newEvents, STATUS_LABEL, timeline, ventureStats, workingNow } from '../data/model'
import type { ActivityEvent, Status } from '../data/types'
import { RING } from '../scene/world'
import { persist, useStore } from '../store'
import { spring } from './Drawer'

export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="12" r="4.2" fill="currentColor" opacity="0.9" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

/** Top bar: what this is, how far it has got, whether it is live, and the main actions. */
export function TopBar() {
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const source = useStore(s => s.source)
  const time = useStore(s => s.time)
  const sound = useStore(s => s.sound)
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 5000); return () => clearInterval(id) }, [])
  const v = data ? ventureStats(data, st, time) : null
  const last = data ? feed(data, null)[0] : null
  const set = useStore.getState().set
  const toggleSound = () => {
    const next = !sound
    set({ sound: next }); persist('pe.sound', next ? '1' : '0')
    if (next) { sfx.enable(); sfx.click() } else sfx.disable()
  }
  return (
    <header className="topbar">
      <button className="brand" onClick={() => { sfx.dive(); useStore.getState().select({ kind: 'world' }) }} aria-label="Perspective Engine: back to the whole city">
        <Mark />
        <span><b>Perspective Engine</b><small>A company being built by 9 AI agents</small></span>
      </button>
      {v && (
        <div className="status" aria-live="polite">
          <span><b>{v.done}</b> of {v.total} tasks built</span>
          <span className={v.running ? 'hot' : ''}><b>{v.running}</b> working now</span>
          <button className="linkish" onClick={() => useStore.getState().select({ kind: 'world' })}><b>{v.waiting}</b> wait on you</button>
          {time !== null
            ? <span className="pill-live replay"><i />Replay · {clock(time)} UTC</span>
            : <span className={`pill-live ${source}`} title={source === 'live' ? 'Pushed from the live project database' : 'Read from the published snapshot every 20 seconds'}>
                <i />{source === 'live' ? 'Live' : source === 'file' ? 'Snapshot' : source === 'offline' ? 'Offline' : 'Connecting'}{last ? ` · last step ${ago(last.t)}` : ''}
              </span>}
        </div>
      )}
      <nav className="actions" aria-label="Actions">
        <button className="chip-btn" onClick={() => set({ panel: 'search' })} aria-label="Find or ask (Command K)"><span>Find</span><kbd>⌘K</kbd></button>
        <button className="chip-btn opt" onClick={() => set({ replayOpen: !useStore.getState().replayOpen })} aria-pressed={useStore.getState().replayOpen}><span>Replay</span></button>
        <button className="chip-btn opt" onClick={() => set({ panel: 'index' })}><span>Index</span></button>
        <button className="chip-btn opt" onClick={() => set({ panel: 'help' })} aria-label="How to use this"><span>?</span></button>
        <button className="chip-btn" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? 'Turn sound off' : 'Turn sound on'}>
          <svg viewBox="0 0 20 20" aria-hidden="true" className="ico"><path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor" />
            {sound ? <path d="M13 7c1.3 1.6 1.3 4.4 0 6M15.5 5c2.4 2.8 2.4 7.2 0 10" fill="none" stroke="currentColor" strokeWidth="1.4" /> : <path d="M13 8l4 4M17 8l-4 4" stroke="currentColor" strokeWidth="1.4" />}</svg>
        </button>
        <button className="cta" onClick={() => { sfx.click(); set({ panel: 'pilot' }) }}>Request a pilot</button>
      </nav>
    </header>
  )
}

const STATE_OF = (s: Status | undefined) => s ?? 'pending'

/** Mini-map and agent picker in one: the brain in the middle, a wedge per agent, coloured by what it is doing. */
export function MiniMap() {
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const focus = useStore(s => s.focus)
  if (!data) return null
  const stats = agentStats(data, st)
  const R = 92, r0 = 34
  const wedge = (i: number) => {
    const a0 = -Math.PI / 2 + ((i - 0.5) * 2 * Math.PI) / 8 + 0.03, a1 = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / 8 - 0.03
    const p = (r: number, a: number) => `${100 + r * Math.cos(a)},${100 + r * Math.sin(a)}`
    return `M${p(r0, a0)} L${p(R, a0)} A${R},${R} 0 0 1 ${p(R, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`
  }
  const focusAgent = focus.kind === 'agent' ? focus.id : focus.kind === 'task' ? data.nodes.find(n => n.id === focus.id)?.agent : null
  return (
    <nav className="minimap" aria-label="Agents map">
      <svg viewBox="0 0 200 200">
        {RING.map((key, i) => {
          const a = stats.find(x => x.key === key)!
          const state = a.running ? 'working' : a.waiting ? 'waiting' : a.done === a.tasks.length ? 'complete' : 'idle'
          const mid = -Math.PI / 2 + (i * 2 * Math.PI) / 8
          return (
            <g key={key} className={`wedge ${state}${focusAgent === key ? ' on' : ''}`} role="button" tabIndex={0} aria-label={`${a.name}, ${a.district}: ${state}, ${a.done} of ${a.tasks.length} built`}
              onClick={() => { sfx.dive(); useStore.getState().select({ kind: 'agent', id: key }) }}
              onKeyDown={e => { if (e.key === 'Enter') useStore.getState().select({ kind: 'agent', id: key }) }}>
              <path d={wedge(i)} />
              <path d={wedge(i)} className="fill" style={{ clipPath: `circle(${r0 + (R - r0) * (a.done / a.tasks.length)}px at 100px 100px)` }} />
              <text x={100 + 64 * Math.cos(mid)} y={100 + 64 * Math.sin(mid) + 3} textAnchor="middle">{a.name}</text>
            </g>
          )
        })}
        <g className={`hub${focus.kind === 'brain' ? ' on' : ''}${stats[0].running ? ' working' : ''}`} role="button" tabIndex={0} aria-label="The brain: the plan and Mayor, the orchestrator"
          onClick={() => { sfx.dive(); useStore.getState().select({ kind: 'brain' }) }} onKeyDown={e => { if (e.key === 'Enter') useStore.getState().select({ kind: 'brain' }) }}>
          <circle cx="100" cy="100" r="28" />
          <text x="100" y="98" textAnchor="middle">Brain</text>
          <text x="100" y="110" textAnchor="middle" className="sub">Mayor</text>
        </g>
      </svg>
      <div className="mm-legend"><span className="working">working</span><span className="waiting">waits on you</span><span className="idle">idle</span></div>
    </nav>
  )
}

/** Live toasts for new real events. Click one to fly there. */
export function Toasts() {
  const [items, setItems] = useState<(ActivityEvent & { id: number })[]>([])
  const seq = useRef(0)
  useEffect(() => useStore.subscribe((s, p) => {
    if (!s.data || !p.data || s.data === p.data) return
    const before = new Set(Object.values(p.data.activity ?? {}).flat().map(e => e.t + e.text))
    const fresh = feed(s.data, null).filter(e => !before.has(e.t + e.text)).slice(0, 3).reverse()
    if (!fresh.length && !newEvents(p.data, s.data).length) return
    fresh.forEach(e => {
      const id = ++seq.current
      setItems(x => [...x.slice(-3), { ...e, id }])
      setTimeout(() => setItems(x => x.filter(i => i.id !== id)), 6000)
    })
    if (s.sound) sfx.click()
  }), [])
  const data = useStore(s => s.data)
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {items.map(e => (
          <motion.button key={e.id} className={`toast k-${e.kind}`} initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring}
            onClick={() => useStore.getState().select({ kind: 'agent', id: e.agent }, 'activity')}>
            <b>{data?.agents[e.agent]?.name ?? e.agent} · {KIND_LABEL[e.kind]}</b>
            <span>{e.text}</span>
            <time>{clock(e.t)} UTC</time>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  )
}

const HINTS = [
  { k: 'drag', label: 'Drag to orbit' },
  { k: 'scroll', label: 'Scroll to zoom' },
  { k: 'click', label: 'Click anything' },
  { k: 'ask', label: 'Ask a question below' },
]

/** Persistent control hints that tick off as you use them. */
export function HintChip() {
  const used = useStore(s => s.hintsUsed)
  const all = HINTS.every(h => used.includes(h.k))
  return (
    <div className={`hintchip${all ? ' done' : ''}`} aria-label="Controls">
      {HINTS.map(h => <span key={h.k} className={used.includes(h.k) ? 'used' : ''}>{h.label}</span>)}
      <span className="keys">Esc back · ← → agents · / ask</span>
    </div>
  )
}

/** The bottom Ask bar: one place to question whatever is selected. Answers open in the drawer's Ask tab. */
export function AskBar() {
  const [q, setQ] = useState('')
  const focus = useStore(s => s.focus)
  const data = useStore(s => s.data)
  const what = focus.kind === 'world' ? 'the company' : focus.kind === 'brain' ? 'the plan' : focus.kind === 'agent' ? data?.agents[focus.id]?.name ?? 'this agent' : focus.id
  return (
    <form className="askbar" onSubmit={e => {
      e.preventDefault()
      if (!q.trim()) return
      const s = useStore.getState()
      s.set({ tab: 'ask', pendingAsk: q, hintsUsed: [...new Set([...s.hintsUsed, 'ask'])] })
      setQ('')
    }}>
      <label htmlFor="askbar-q" className="sr-only">Ask about {what}</label>
      <span className="ask-orb" aria-hidden="true" />
      <input id="askbar-q" value={q} onChange={e => setQ(e.target.value)} placeholder={`Ask about ${what}… e.g. "what did it do in the last hour?"`} autoComplete="off" />
      <button type="submit" className="cta">Ask</button>
    </form>
  )
}

/** Replay the project from the ledger: towers rebuild exactly as the agents built them. */
export function Replay() {
  const data = useStore(s => s.data)
  const time = useStore(s => s.time)
  const open = useStore(s => s.replayOpen)
  const [playing, setPlaying] = useState(false)
  const raf = useRef(0)
  const [start, end] = data ? timeline(data) : [0, 1]
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const step = (now: number) => {
      const s = useStore.getState()
      const t = (s.time ?? start) + ((now - last) / 20000) * (end - start)
      last = now
      if (t >= end) { s.setTime(null); setPlaying(false); return }
      s.setTime(t)
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, start, end])
  if (!data || !open) return null
  return (
    <motion.div className="replay" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <button className="play" onClick={() => { sfx.click(); if (!playing && time === null) useStore.getState().setTime(start); setPlaying(!playing) }} aria-label={playing ? 'Pause' : 'Play the project from the start'}>{playing ? '❚❚' : '▶'}</button>
      <div className="track">
        <div className="ticks-ev" aria-hidden="true">{data.ledger.map((e, i) => <i key={i} className={`ev ev-${e.event}`} style={{ left: `${((ms(e.t) - start) / (end - start)) * 100}%` }} />)}</div>
        <input type="range" min={start} max={end} step={1000} value={time ?? end} aria-label="Project timeline" aria-valuetext={time === null ? 'Live' : `${clock(time)} UTC`}
          onChange={e => { setPlaying(false); const v = Number(e.target.value); useStore.getState().setTime(v >= end - 1000 ? null : v) }} />
      </div>
      <span className="tlabel">{time === null ? 'Live' : `${clock(time)} UTC`}</span>
      <button className={`livepill${time === null ? ' on' : ''}`} onClick={() => { setPlaying(false); useStore.getState().setTime(null) }}>Live</button>
    </motion.div>
  )
}

/** The entrance: plain-language explanation first, then sound choice, then the world. */
export function Gate() {
  const introDone = useStore(s => s.introDone)
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  if (introDone) return null
  const v = data ? ventureStats(data, st, null) : null
  const working = data ? workingNow(data, st) : []
  const enter = (sound: boolean) => {
    const s = useStore.getState()
    s.set({ introDone: true, sound, enteredAt: Date.now() })
    persist('pe.intro', '1'); persist('pe.sound', sound ? '1' : '0')
    if (sound) { sfx.enable(); sfx.dive() }
  }
  return (
    <motion.div className="gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="gate-card">
        <p className="kicker">Live · {v ? `${v.done} of ${v.total} tasks built · ${working.length} agent${working.length === 1 ? '' : 's'} working now` : 'loading the live plan…'}</p>
        <h1>Perspective Engine</h1>
        <p className="lede">Nine AI agents are building a company. Its product helps managers understand how colleagues with ADHD experience attention at work, and checks what those managers actually change 30 days later.</p>
        <ul className="gate-legend">
          <li><i className="lg brain" /><span><b>The brain</b> in the middle is the plan. Mayor, the orchestrator, hands out tasks.</span></li>
          <li><i className="lg district" /><span><b>Eight districts</b> around it are the specialist agents.</span></li>
          <li><i className="lg tower" /><span><b>Towers</b> are tasks. They light up as they are built; amber is being worked on now.</span></li>
          <li><i className="lg packet" /><span><b>Lights</b> fly when an agent starts or finishes work. Nothing moves without a real recorded event.</span></li>
        </ul>
        <p className="controls"><b>Drag</b> to orbit · <b>Scroll</b> to zoom · <b>Click</b> anything to see exactly what it did · <b>Ask</b> any question at the bottom</p>
        <div className="actions">
          <button className="cta" onClick={() => enter(true)}>Enter with sound</button>
          <button className="ghost" onClick={() => enter(false)}>Enter silently</button>
        </div>
      </div>
    </motion.div>
  )
}

export const statusOf = STATE_OF
export const STATUS = STATUS_LABEL
