import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { sfx } from '../audio/sound'
import { BRIEF } from '../data/brief'
import { agentFeed, agentStats, atomsOf, clock, fmtK, LIVE_WINDOW_MIN, runState, STATUS_LABEL, taskFeed, ventureStats } from '../data/model'
import type { GraphState, Status } from '../data/types'
import { DEPT, RING } from '../scene/world'
import { useStore, type Focus } from '../store'
import { sourceText, trapTab } from './Chrome'
import { spring } from './Drawer'

/** Whatever had focus when a panel opened gets it back when the panel closes. Captured on the store change itself, before the page behind goes inert. */
let opener: HTMLElement | null = null
useStore.subscribe((s, p) => { if (s.panel !== 'none' && p.panel === 'none') opener = document.activeElement as HTMLElement | null })

function Modal({ id, label, labelledBy, initialFocus, children, wide }: { id: string; label: string; labelledBy?: string; initialFocus?: string; children: ReactNode; wide?: boolean }) {
  const open = useStore(s => s.panel === id)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const back = opener
    const el = ref.current
    ;(initialFocus ? el?.querySelector<HTMLElement>(initialFocus) ?? el : el)?.focus()
    return () => { requestAnimationFrame(() => { if (useStore.getState().panel === 'none' && back?.isConnected) back.focus() }) }
  }, [open, initialFocus])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => useStore.getState().set({ panel: 'none' })}>
          <motion.div ref={ref} className={`modal scrolls${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label}
            tabIndex={-1} onKeyDown={e => trapTab(e, ref.current)}
            initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 14, opacity: 0 }} transition={spring} onClick={e => e.stopPropagation()}>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const statusWord = (s: Status | undefined, stalled: boolean) => (stalled ? 'Stalled' : STATUS_LABEL[s ?? 'pending'])

/** ⌘K: jump to anything, or ask a question about the whole company. */
export function Search() {
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const time = useStore(s => s.time)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const items = useMemo(() => {
    if (!data) return []
    const at = time ?? Date.now()
    const rs = runState(data, st, at)
    const all: { f: Focus | null; label: string; sub: string; ask?: string }[] = [
      { f: { kind: 'world' }, label: 'The whole city', sub: 'Overview of the company and its agents' },
      { f: { kind: 'brain' }, label: 'The Brain', sub: `The plan and ${data.agents.orchestrator?.name ?? 'Mayor'}, the orchestrator` },
      ...agentStats(data, st, at).map(a => ({
        f: { kind: 'agent', id: a.key } as Focus, label: `${DEPT[a.key] ?? a.district} · ${a.name}`,
        sub: `Agent · ${a.district} · ${a.done}/${a.tasks.length} built · ${agentFeed(data, a.key, time).length} steps logged`,
      })),
      ...data.nodes.map(n => ({ f: { kind: 'task', id: n.id } as Focus, label: `${n.id} · ${n.title}`, sub: `Task · ${statusWord(st.get(n.id), rs.get(n.id) === 'stalled')} · ${data.agents[n.agent]?.name ?? n.agent}` })),
    ]
    const t = q.toLowerCase().trim()
    const hits = t ? all.filter(i => (i.label + ' ' + i.sub).toLowerCase().includes(t)) : all
    return (t ? [{ f: null, label: `Ask: “${q}”`, sub: 'Answered from the project record', ask: q }, ...hits] : hits).slice(0, 40)
  }, [data, st, time, q])
  useEffect(() => { document.getElementById(`pal-opt-${sel}`)?.scrollIntoView({ block: 'nearest' }) }, [sel])
  const choose = (i: (typeof items)[number]) => {
    const s = useStore.getState()
    sfx.dive()
    if (i.ask) s.set({ tab: 'ask', pendingAsk: i.ask, panel: 'none' })
    else if (i.f) { s.select(i.f); s.set({ panel: 'none' }) }
    setQ('')
  }
  return (
    <Modal id="search" label="Find or ask" initialFocus="#pal-q">
      <div className="palette">
        <label htmlFor="pal-q" className="sr-only">Find an agent or task, or type a question</label>
        <input id="pal-q" value={q} placeholder="Find an agent or task, or ask a question…" autoComplete="off"
          role="combobox" aria-expanded={items.length > 0} aria-controls="pal-list" aria-autocomplete="list"
          aria-activedescendant={items[sel] ? `pal-opt-${sel}` : undefined}
          onChange={e => { setQ(e.target.value); setSel(0) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(i => Math.min(items.length - 1, i + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel(i => Math.max(0, i - 1)) }
            if (e.key === 'Enter' && items[sel]) choose(items[sel])
          }} />
        <ul role="listbox" id="pal-list" aria-label="Results">
          {items.map((it, i) => (
            <li key={it.label} id={`pal-opt-${i}`} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''}
              onMouseEnter={() => setSel(i)} onClick={() => choose(it)}><b>{it.label}</b><span>{it.sub}</span></li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}

export function Help() {
  const data = useStore(s => s.data)
  const source = useStore(s => s.source)
  const tasks = data ? `${data.nodes.length} tasks` : 'every task'
  const mayor = data?.agents.orchestrator?.name ?? 'Mayor'
  return (
    <Modal id="help" label="How to use this" labelledBy="help-title">
      <p className="kicker">How to use this</p>
      <h2 id="help-title">Reading the city</h2>
      <ul className="legend-list">
        <li><i className="lg brain" /><span><b>The brain</b> in the middle is the plan ({tasks}) and {mayor}, the orchestrator. Click it to see what can start next.</span></li>
        <li><i className="lg district" /><span><b>Each of the {RING.length} districts</b> around it is one AI agent, named by what it does (Research, Data, Finance…) and then by its persona. The rim of its plate is a gauge: one tick per task, lit when built.</span></li>
        <li><i className="lg tower" /><span><b>Each tower</b> is a task. Taller means more planned effort. Lit floors mean built. Amber means its agent recorded a step in the last {LIVE_WINDOW_MIN} minutes; a task marked running with nothing recorded for longer is shown as stalled, never as work. Violet means it is prepared and needs the founder. Ghost outlines are planned.</span></li>
        <li><i className="lg packet" /><span><b>Lights</b> fly out from the brain when the ledger records a task starting, and back when it finishes. Arcs show which task feeds which.</span></li>
      </ul>
      <h3>Controls</h3>
      <table className="keys-table"><tbody>
        <tr><th>Drag</th><td>Orbit around the city</td></tr>
        <tr><th>Scroll or pinch</th><td>Zoom toward the cursor</td></tr>
        <tr><th>Click, Enter or Space</th><td>Fly to anything and open its record</td></tr>
        <tr><th>Esc</th><td>Close the Jarvis console, then back one level, then to the whole city</td></tr>
        <tr><th>Home</th><td>Straight back to the whole city</td></tr>
        <tr><th>← →</th><td>Previous or next agent</td></tr>
        <tr><th>/ or ⌘K</th><td>Talk to Jarvis, or find anything</td></tr>
      </tbody></table>
      <h3>Jarvis</h3>
      <p className="note">Talk to Jarvis in the bar at the bottom, by typing or with the mic where your browser allows it. It answers from the project record, says when something isn’t in it, and speaks replies when the speaker button is on. The panel at the top left opens its briefing, the agents’ scorecards and the conversation.</p>
      <p className="note"><b>Privacy:</b> to offer help, Jarvis notices only, in this tab’s memory, how long you stay on one thing and repeated clicks or back-and-forth; nothing is stored or sent, and it is gone when you close the tab.</p>
      <h3>What is real</h3>
      <p className="note">{BRIEF.data}</p>
      <p className="note">{data ? sourceText(source, data) : 'The project record has not loaded yet.'} Agents only work while a session runs them, started by the founder or on a schedule. Between runs, nothing is shown as working.</p>
    </Modal>
  )
}

/** The one action: request a pilot. Honest about what happens next. */
export function Pilot() {
  const [sent, setSent] = useState(false)
  return (
    <Modal id="pilot" label="Request a pilot" labelledBy="pilot-title">
      <p className="kicker">The one action</p>
      <h2 id="pilot-title">Request a pilot</h2>
      <p className="lede">{BRIEF.pilot}</p>
      {sent ? (
        <p className="thanks" role="status">Thank you. Sign-ups open once the first advisory review is complete. Nothing was sent from this page: the form is not connected to a server until the founder approves where the data goes.</p>
      ) : (
        <form className="pilot" onSubmit={e => { e.preventDefault(); sfx.click(); setSent(true) }}>
          {/* The founder wires this to a form backend later; that is a gated step (privacy notice first). */}
          <label htmlFor="p-name">Name</label><input id="p-name" required autoComplete="name" />
          <label htmlFor="p-email">Work email</label><input id="p-email" type="email" required autoComplete="email" />
          <label htmlFor="p-org">Organization</label><input id="p-org" required autoComplete="organization" />
          <button type="submit" className="cta wide">Request a pilot</button>
          <p className="muted small">This form is not connected yet. Nothing you type leaves this page.</p>
        </form>
      )}
    </Modal>
  )
}

/** Run figures and outputs exist only once a task is finished, or prepared for the founder, at the moment shown. */
const finished = (s: Status | undefined) => s === 'done' || s === 'awaiting_human'

/**
 * The whole city as tables, with the same numbers as the 3D view.
 * 'sr' is the always-present copy for assistive tech: plain text only, so it adds nothing to the Tab order.
 */
function IndexBody({ data, st, time, mode }: { data: GraphState; st: Map<string, Status>; time: number | null; mode: 'modal' | 'page' | 'sr' }) {
  const v = ventureStats(data, st, time)
  const at = time ?? Date.now()
  const rs = runState(data, st, at)
  const open = (id: string) => () => {
    const s = useStore.getState()
    sfx.dive()
    if (mode === 'modal') s.set({ panel: 'none' })
    s.select({ kind: 'task', id })
  }
  const when = time === null ? 'now' : `at ${clock(time).slice(0, 5)} UTC`
  return (
    <div className="mirror">
      <p className="kicker">Index · the whole city as tables{time === null ? '' : ` · replay at ${clock(time)} UTC`}</p>
      <h2>Perspective Engine</h2>
      <p>{BRIEF.goal}</p>
      <p>{v.done} of {v.total} tasks built · {v.running} being worked on {when}{v.stalled ? ` · ${v.stalled} stalled (marked running, no session)` : ''} · {v.waiting} need the founder · {v.blocked} blocked · {fmtK(v.usedK)} tokens measured on finished tasks.</p>
      {agentStats(data, st, at).map(a => (
        <section key={a.key}>
          <h3>{DEPT[a.key] ?? a.district} · {a.name} <small>{a.district} · {a.done}/{a.tasks.length} built</small></h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Task</th><th scope="col">Title</th><th scope="col">Status</th><th scope="col">Plan</th><th scope="col">Used</th><th scope="col">Steps</th><th scope="col">Records</th></tr></thead>
              <tbody>
                {a.tasks.map(n => {
                  const s = st.get(n.id)
                  const recs = atomsOf(data, n.id, st, time)
                  const list = <ul>{recs.map(r => <li key={r.id}>{r.level4Type}: {r.meta.label}</li>)}</ul>
                  return (
                    <tr key={n.id}>
                      <td>{mode === 'sr' ? n.id : <button className="link" onClick={open(n.id)} aria-label={`${n.id}: open in the inspector`}>{n.id}</button>}</td>
                      <td>{n.title}</td><td>{statusWord(s, rs.get(n.id) === 'stalled')}</td><td>{n.budget_k}k</td><td>{n.run && finished(s) ? fmtK(n.run.used_k) : '—'}</td>
                      <td>{taskFeed(data, n.id, time).length}</td>
                      <td>{mode === 'sr' ? <>{recs.length} records{list}</> : <details><summary>{recs.length}</summary>{list}</details>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

function useIndexData() {
  return { data: useStore(s => s.data), st: useStore(s => s.st), time: useStore(s => s.time) }
}

/** The Index as a dialog (top bar, ⋯ menu, skip link). */
export function Index() {
  const { data, st, time } = useIndexData()
  const open = useStore(s => s.panel === 'index')
  return <Modal id="index" label="Index of the whole city" wide>{data && open && <IndexBody data={data} st={st} time={time} mode="modal" />}</Modal>
}

/** The same tables, always in the page for screen readers, with no focusable elements. */
export function IndexMirror() {
  const { data, st, time } = useIndexData()
  const open = useStore(s => s.panel === 'index')
  if (!data || open) return null
  return <div className="sr-only"><IndexBody data={data} st={st} time={time} mode="sr" /></div>
}

/** No WebGL: the tables are the page. It scrolls on its own, and task links open the inspector beside it. */
export function IndexPage() {
  const { data, st, time } = useIndexData()
  return (
    <main className="mirror-page" aria-label="The city as tables">
      <p className="note">3D graphics are off in this browser, so the city is shown as tables with the same numbers. Select a task to open its full record in the inspector.</p>
      {data ? <IndexBody data={data} st={st} time={time} mode="page" /> : <p className="muted">Loading the live plan…</p>}
    </main>
  )
}
