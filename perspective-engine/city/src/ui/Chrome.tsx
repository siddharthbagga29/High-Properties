import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { sfx } from '../audio/sound'
import { BRIEF, reality } from '../data/brief'
import { agentStats, ago, clock, collapseFeed, feed, isVerifier, KIND_LABEL, LIVE_WINDOW_MIN, ms, timeline, ventureStats } from '../data/model'
import type { ActivityEvent, GraphState } from '../data/types'
import { DEPT, RING } from '../scene/world'
import { persist, useStore, type Focus, type Source } from '../store'
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

const hhmm = (t: number | string) => clock(t).slice(0, 5)
const asOf = (d: GraphState | null) => (d && Number.isFinite(ms(d.generated)) ? d.generated : null)
const agentCount = (d: GraphState | null) => (d ? Object.keys(d.agents).length : null)

/** One wording for where the numbers come from: the top bar and the entrance must never disagree. */
export function sourceLabel(source: Source) {
  return source === 'live' ? 'Live' : source === 'file' ? 'Snapshot' : source === 'offline' ? 'Offline' : 'Connecting'
}

/** The same fact as a sentence, for Help. */
export function sourceText(source: Source, d: GraphState) {
  const g = asOf(d)
  const age = g ? ` This data is as of ${hhmm(g)} UTC (${ago(g)}).` : ''
  if (source === 'live') return `This page is live: the project database pushes every change as it is recorded.${age}`
  if (source === 'file') return `This page reads the published snapshot of the project record and re-checks it every 20 seconds.${age}`
  return 'The project record could not be reached, so nothing is shown as current.'
}

/** Liveness is judged against the clock, so re-render now and then even when no new data arrives. */
function useTick(every: number) {
  const [, set] = useState(0)
  useEffect(() => { const id = setInterval(() => set(x => x + 1), every); return () => clearInterval(id) }, [every])
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

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])'
/** Keep Tab inside a dialog: the page behind it is inert, so focus would otherwise fall out to the browser. */
export function trapTab(e: KeyboardEvent<HTMLElement>, root: HTMLElement | null) {
  if (e.key !== 'Tab' || !root) return
  const f = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(x => x.getClientRects().length > 0)
  if (!f.length) { e.preventDefault(); return }
  const a = document.activeElement
  if (e.shiftKey && (a === f[0] || a === root)) { e.preventDefault(); f[f.length - 1].focus() }
  else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
}

const toggleSound = () => {
  const s = useStore.getState(), next = !s.sound
  s.set({ sound: next }); persist('pe.sound', next ? '1' : '0')
  if (next) { sfx.enable(); sfx.click() } else sfx.disable()
}

/** Narrow screens: Replay, Index, Help and sound live behind one "⋯" button instead of disappearing. */
function More({ webgl }: { webgl: boolean }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const replayOpen = useStore(s => s.replayOpen)
  const sound = useStore(s => s.sound)
  useEffect(() => {
    if (!open) return
    const off = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    addEventListener('pointerdown', off)
    return () => removeEventListener('pointerdown', off)
  }, [open])
  const set = useStore.getState().set
  const items = [
    { k: 'replay', label: replayOpen ? 'Close replay' : 'Replay the project', run: () => set({ replayOpen: !useStore.getState().replayOpen }) },
    ...(webgl ? [{ k: 'index', label: 'Index: the city as tables', run: () => set({ panel: 'index' }) }] : []),
    { k: 'help', label: 'How to read the city', run: () => set({ panel: 'help' }) },
    { k: 'sound', label: sound ? 'Turn sound off' : 'Turn sound on', run: toggleSound },
  ]
  return (
    <div className="more" ref={box} onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); btn.current?.focus() } }}>
      <button ref={btn} className="chip-btn" aria-expanded={open} aria-controls="more-menu" aria-label="More: replay, index, help, sound" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 20 20" aria-hidden="true" className="ico"><circle cx="4" cy="10" r="1.7" fill="currentColor" /><circle cx="10" cy="10" r="1.7" fill="currentColor" /><circle cx="16" cy="10" r="1.7" fill="currentColor" /></svg>
      </button>
      {open && (
        <ul id="more-menu" className="more-menu">
          {/* Focus goes back to "⋯" first, so a panel opened from here returns focus to it when it closes. */}
          {items.map(i => <li key={i.k}><button onClick={() => { btn.current?.focus(); setOpen(false); i.run() }}>{i.label}</button></li>)}
        </ul>
      )}
    </div>
  )
}

/** Top bar: what this is, how far it has got, whether it is live and how old the data is, and the main actions. */
export function TopBar({ ref }: { ref?: Ref<HTMLElement> }) {
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const source = useStore(s => s.source)
  const time = useStore(s => s.time)
  const sound = useStore(s => s.sound)
  const webgl = useStore(s => s.webgl)
  const replayOpen = useStore(s => s.replayOpen)
  useTick(10_000)
  const v = data ? ventureStats(data, st, time) : null
  const g = asOf(data)
  const n = agentCount(data)
  const set = useStore.getState().set
  const when = time === null ? 'now' : `at ${hhmm(time)}`
  return (
    <header className="topbar" ref={ref}>
      <button className="brand" onClick={() => { sfx.dive(); useStore.getState().select({ kind: 'world' }) }} aria-label="Perspective Engine: back to the whole city">
        <Mark />
        <span><b>Perspective Engine</b><small><span className="tag-long">A company being built by {n ?? ''} AI agents</span><span className="tag-short">Built by {n ?? ''} AI agents</span></small></span>
      </button>
      {v && (
        <div className="status">
          <span><b>{v.done}</b> of {v.total}<span className="long"> tasks</span> built</span>
          <span className={v.running ? 'hot' : ''} title={`An agent recorded a step in the last ${LIVE_WINDOW_MIN} minutes`}><b>{v.running}</b> working {when}</span>
          {v.stalled > 0 && <span className="stalled" title={`Marked running, but nothing recorded for ${LIVE_WINDOW_MIN} minutes: no session is on it`}><b>{v.stalled}</b> stalled</span>}
          <button className="linkish" onClick={() => { sfx.dive(); useStore.getState().select({ kind: 'world' }) }}><b>{v.waiting}</b> need{v.waiting === 1 ? 's' : ''} the founder</button>
          {time !== null
            ? <span className="pill-live replay"><i />Replay · {clock(time)} UTC<button className="linkish" onClick={() => useStore.getState().setTime(null)}>Back to live</button></span>
            : <span className={`pill-live ${source}`} title={source === 'live' ? 'Pushed from the live project database' : source === 'file' ? 'Read from the published snapshot every 20 seconds' : undefined}>
                <i />{sourceLabel(source)}{g && <span> · <span className="long">data as of </span>{hhmm(g)} UTC, {ago(g)}</span>}
              </span>}
          {/* Announce only when the counts change, not every time the clock ticks. */}
          <p className="sr-only" role="status">{`${v.running} working ${when}, ${v.stalled} stalled, ${v.waiting} need the founder`}</p>
        </div>
      )}
      <nav className="actions" aria-label="Actions">
        <button className="chip-btn find" onClick={() => set({ panel: 'search' })} aria-label="Find or ask (Command K)">
          <svg viewBox="0 0 20 20" aria-hidden="true" className="ico"><circle cx="8.5" cy="8.5" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12.5 12.5l4.5 4.5" stroke="currentColor" strokeWidth="1.6" /></svg>
          <span>Find</span><kbd>⌘K</kbd>
        </button>
        <button className="chip-btn opt" onClick={() => set({ replayOpen: !replayOpen })} aria-pressed={replayOpen}><span>Replay</span></button>
        {webgl && <button className="chip-btn opt" onClick={() => set({ panel: 'index' })}><span>Index</span></button>}
        <button className="chip-btn opt" onClick={() => set({ panel: 'help' })} aria-label="How to read the city"><span>?</span></button>
        <button className="chip-btn opt" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? 'Turn sound off' : 'Turn sound on'}>
          <svg viewBox="0 0 20 20" aria-hidden="true" className="ico"><path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor" />
            {sound ? <path d="M13 7c1.3 1.6 1.3 4.4 0 6M15.5 5c2.4 2.8 2.4 7.2 0 10" fill="none" stroke="currentColor" strokeWidth="1.4" /> : <path d="M13 8l4 4M17 8l-4 4" stroke="currentColor" strokeWidth="1.4" />}</svg>
        </button>
        <More webgl={webgl} />
        <button className="cta" onClick={() => { sfx.click(); set({ panel: 'pilot' }) }}>Request a pilot</button>
      </nav>
    </header>
  )
}

/**
 * Mini-map and agent picker in one: the brain in the middle, a wedge per agent, coloured by what it is doing.
 * Wide screens: always shown, bottom left. Narrow screens: an "Agents" chip opens it as an overlay.
 */
export function MiniMap({ ref, open, onOpen }: { ref?: Ref<HTMLElement>; open: boolean; onOpen: (v: boolean) => void }) {
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const time = useStore(s => s.time)
  const focus = useStore(s => s.focus)
  useTick(30_000)
  if (!data) return null
  const stats = agentStats(data, st, time ?? Date.now())
  const working = stats.filter(a => a.running).length
  const anyStalled = stats.some(a => a.stalled && !a.running)
  const R = 92, r0 = 34
  const wedge = (i: number) => {
    const a0 = -Math.PI / 2 + ((i - 0.5) * 2 * Math.PI) / 8 + 0.03, a1 = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / 8 - 0.03
    const p = (r: number, a: number) => `${100 + r * Math.cos(a)},${100 + r * Math.sin(a)}`
    return `M${p(r0, a0)} L${p(R, a0)} A${R},${R} 0 0 1 ${p(R, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`
  }
  const focusAgent = focus.kind === 'agent' ? focus.id : focus.kind === 'task' ? data.nodes.find(n => n.id === focus.id)?.agent : null
  const pick = (f: Focus) => { sfx.dive(); useStore.getState().select(f); onOpen(false) }
  const keys = (f: Focus) => (e: KeyboardEvent<SVGGElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(f) } }
  return (
    <>
      <button className="mm-chip chip-btn" aria-expanded={open} aria-controls="minimap" onClick={() => onOpen(!open)}>
        <span>Agents</span>{working > 0 && <em>{working} working</em>}
      </button>
      <nav id="minimap" ref={ref} className={`minimap${open ? ' open' : ''}`} aria-label="Agents map"
        onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); onOpen(false) } }}>
        <svg viewBox="0 0 200 200">
          {RING.map((key, i) => {
            const a = stats.find(x => x.key === key)
            if (!a) return null
            const state = a.running ? 'working' : a.stalled ? 'stalled' : a.waiting ? 'waiting' : a.done === a.tasks.length ? 'complete' : 'idle'
            const said = state === 'working' ? 'working now' : state === 'stalled' ? 'stalled, no session running' : state === 'waiting' ? `${a.waiting} ${a.waiting === 1 ? 'needs' : 'need'} the founder` : state
            const mid = -Math.PI / 2 + (i * 2 * Math.PI) / 8
            const x = 100 + 64 * Math.cos(mid), y = 100 + 64 * Math.sin(mid)
            return (
              <g key={key} className={`wedge ${state}${focusAgent === key ? ' on' : ''}`} role="button" tabIndex={0}
                aria-label={`${DEPT[key] ?? a.district}, ${a.name}: ${said}, ${a.done} of ${a.tasks.length} built`}
                onClick={() => pick({ kind: 'agent', id: key })} onKeyDown={keys({ kind: 'agent', id: key })}>
                <path d={wedge(i)} />
                <path d={wedge(i)} className="fill" style={{ clipPath: `circle(${r0 + (R - r0) * (a.done / Math.max(a.tasks.length, 1))}px at 100px 100px)` }} />
                <text x={x} y={y} textAnchor="middle" className="dept">{DEPT[key] ?? a.district}</text>
                <text x={x} y={y + 9} textAnchor="middle" className="who">{a.name}</text>
              </g>
            )
          })}
          <g className={`hub${focus.kind === 'brain' ? ' on' : ''}${stats[0]?.running ? ' working' : ''}`} role="button" tabIndex={0}
            aria-label={`The brain: the plan and ${data.agents.orchestrator?.name ?? 'Mayor'}, the orchestrator`}
            onClick={() => pick({ kind: 'brain' })} onKeyDown={keys({ kind: 'brain' })}>
            <circle cx="100" cy="100" r="28" />
            <text x="100" y="98" textAnchor="middle">Brain</text>
            <text x="100" y="110" textAnchor="middle" className="sub">{data.agents.orchestrator?.name ?? 'Mayor'}</text>
          </g>
        </svg>
        <div className="mm-legend">
          <span className="working">working</span>
          {anyStalled && <span className="stalled">stalled</span>}
          <span className="waiting">needs founder</span>
          <span className="idle">idle</span>
        </div>
      </nav>
    </>
  )
}

/** Only rows recorded in the last few minutes are news; anything older is history and stays in the timeline. */
const TOAST_AGE_MS = 180_000

/** Live toasts for new, recent, real events. Click one to fly there. */
export function Toasts() {
  const [items, setItems] = useState<(ActivityEvent & { id: number })[]>([])
  const seq = useRef(0)
  useEffect(() => useStore.subscribe((s, p) => {
    if (!s.data || !p.data || s.data === p.data) return
    const now = Date.now()
    const key = (e: ActivityEvent) => e.t + e.node + e.text
    const before = new Set(Object.values(p.data.activity ?? {}).flat().map(key))
    const fresh = collapseFeed(feed(s.data, null).filter(e => !before.has(key(e)) && now - ms(e.t) <= TOAST_AGE_MS)).slice(0, 3).reverse()
    if (!fresh.length) return
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
        {items.map(e => {
          const name = data?.agents[e.agent]?.name ?? e.agent
          return (
            <motion.button key={e.id} className={`toast k-${e.kind}`} initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring}
              onClick={() => { sfx.dive(); useStore.getState().select(data?.nodes.some(n => n.id === e.node) ? { kind: 'task', id: e.node } : { kind: 'agent', id: e.agent }, 'activity') }}>
              <b>{isVerifier(e) ? `Verifier, checking ${name}` : name} · {KIND_LABEL[e.kind]}</b>
              <span>{e.node} · {e.text}</span>
              <time>{clock(e.t)} UTC</time>
            </motion.button>
          )
        })}
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
  const narrow = useMedia('(max-width: 900px)')
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
      <input id="askbar-q" value={q} onChange={e => setQ(e.target.value)} placeholder={narrow ? `Ask about ${what}…` : `Ask about ${what}… e.g. "what did it do in the last hour?"`} autoComplete="off" />
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
  // Closing the panel ends the replay: no hidden playback, and the city never stays frozen in the past.
  useEffect(() => {
    if (open) return
    setPlaying(false)
    if (useStore.getState().time !== null) useStore.getState().setTime(null)
  }, [open])
  useEffect(() => {
    if (!playing || !open) return
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
  }, [playing, open, start, end])
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

/** The entrance: what this is, what it is aiming for and where it stands, how to read it, then sound choice. A real modal dialog. */
export function Gate() {
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const source = useStore(s => s.source)
  const card = useRef<HTMLDivElement>(null)
  const quiet = useRef<HTMLButtonElement>(null)
  useEffect(() => { quiet.current?.focus() }, [])
  const v = data ? ventureStats(data, st, null) : null
  const g = asOf(data)
  const n = agentCount(data)
  const goal = /^(Goal[^:]*):\s*(.+)$/.exec(BRIEF.goal)
  const enter = (sound: boolean) => {
    const s = useStore.getState()
    s.set({ introDone: true, sound, enteredAt: Date.now() })
    persist('pe.intro', '1'); persist('pe.sound', sound ? '1' : '0')
    if (sound) { sfx.enable(); sfx.dive() }
  }
  return (
    <motion.div className="gate-overlay" role="dialog" aria-modal="true" aria-labelledby="gate-title" aria-describedby="gate-lede"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); enter(false) } else trapTab(e, card.current) }}>
      <div className="gate-card" ref={card}>
        <p className="kicker">
          {sourceLabel(source)}{g ? ` · data as of ${hhmm(g)} UTC, ${ago(g)}` : ''}
          {v ? ` · ${v.done} of ${v.total} tasks built · ${v.running} working now${v.stalled ? ` · ${v.stalled} stalled` : ''}` : source === 'offline' ? '' : ' · loading the plan…'}
        </p>
        <h1 id="gate-title">Perspective Engine</h1>
        <p className="lede" id="gate-lede">A company being built by {n ?? ''} AI agents. This city is drawn from the record of their work.</p>
        <p className="idea">{BRIEF.idea}</p>
        <p className="goal">{goal ? <><b>{goal[1]}:</b> {goal[2]}</> : BRIEF.goal}</p>
        {data && <p className="reality"><b>Where it stands</b> {reality(data, st)}</p>}
        <ul className="gate-legend">
          <li><i className="lg brain" /><span><b>The brain</b> in the middle is the plan. {data?.agents.orchestrator?.name ?? 'Mayor'}, the orchestrator, hands out tasks.</span></li>
          <li><i className="lg district" /><span><b>{RING.length} districts</b> around it are the specialist agents, named by what they do: Research, Data, Finance…</span></li>
          <li><i className="lg tower" /><span><b>Towers</b> are tasks. They light up as they are built; amber means an agent recorded a step in the last {LIVE_WINDOW_MIN} minutes.</span></li>
          <li><i className="lg packet" /><span><b>Lights</b> fly only when the ledger records a task starting or finishing. The brain’s breathing and the drifting motes are ambience, not data.</span></li>
        </ul>
        <p className="controls"><b>Drag</b> to orbit · <b>Scroll</b> to zoom · <b>Click</b> anything to see exactly what it did · <b>Ask</b> any question at the bottom</p>
        <div className="actions">
          <button className="cta" onClick={() => enter(true)}>Enter with sound</button>
          <button ref={quiet} className="ghost" onClick={() => enter(false)}>Enter silently</button>
        </div>
      </div>
    </motion.div>
  )
}
