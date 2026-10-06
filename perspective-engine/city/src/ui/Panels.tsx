import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { sfx } from '../audio/sound'
import { BRIEF } from '../data/brief'
import { agentStats, atomsOf, fmtK, STATUS_LABEL, taskFeed, ventureStats } from '../data/model'
import { useStore, type Focus } from '../store'
import { spring } from './Drawer'

function Modal({ id, label, children, wide }: { id: string; label: string; children: React.ReactNode; wide?: boolean }) {
  const panel = useStore(s => s.panel)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (panel === id) ref.current?.querySelector<HTMLElement>('input, button')?.focus() }, [panel, id])
  return (
    <AnimatePresence>
      {panel === id && (
        <motion.div className="modal-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => useStore.getState().set({ panel: 'none' })}>
          <motion.div ref={ref} className={`modal scrolls${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}
            initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 14, opacity: 0 }} transition={spring} onClick={e => e.stopPropagation()}>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** ⌘K: jump to anything, or ask a question about the whole company. */
export function Search() {
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const items = useMemo(() => {
    if (!data) return []
    const all: { f: Focus | null; label: string; sub: string; ask?: string }[] = [
      { f: { kind: 'world' }, label: 'The whole city', sub: 'Overview of the company and its agents' },
      { f: { kind: 'brain' }, label: 'The Brain', sub: 'The plan and Mayor, the orchestrator' },
      ...agentStats(data, st).map(a => ({ f: { kind: 'agent', id: a.key } as Focus, label: `${a.name} · ${a.district}`, sub: `Agent · ${a.done}/${a.tasks.length} built · ${taskFeedCount(a.key)} steps logged` })),
      ...data.nodes.map(n => ({ f: { kind: 'task', id: n.id } as Focus, label: `${n.id} · ${n.title}`, sub: `Task · ${STATUS_LABEL[st.get(n.id)!]} · ${data.agents[n.agent].name}` })),
    ]
    function taskFeedCount(agent: string) { return data!.nodes.filter(n => n.agent === agent).reduce((s, n) => s + taskFeed(data!, n.id, null).length, 0) }
    const t = q.toLowerCase().trim()
    const hits = t ? all.filter(i => (i.label + ' ' + i.sub).toLowerCase().includes(t)) : all
    return t ? [{ f: null, label: `Ask: “${q}”`, sub: 'Answered from the project record', ask: q }, ...hits] : hits
  }, [data, st, q])
  const choose = (i: (typeof items)[number]) => {
    const s = useStore.getState()
    sfx.dive()
    if (i.ask) s.set({ tab: 'ask', pendingAsk: i.ask, panel: 'none' })
    else if (i.f) { s.select(i.f); s.set({ panel: 'none' }) }
    setQ('')
  }
  return (
    <Modal id="search" label="Find or ask">
      <div className="palette">
        <label htmlFor="pal-q" className="sr-only">Find an agent or task, or type a question</label>
        <input id="pal-q" value={q} placeholder="Find an agent or task, or ask a question…" autoComplete="off"
          onChange={e => { setQ(e.target.value); setSel(0) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(i => Math.min(items.length - 1, i + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel(i => Math.max(0, i - 1)) }
            if (e.key === 'Enter' && items[sel]) choose(items[sel])
          }} />
        <ul role="listbox" aria-label="Results">
          {items.slice(0, 40).map((it, i) => (
            <li key={it.label} role="option" aria-selected={i === sel}>
              <button className={i === sel ? 'on' : ''} onMouseEnter={() => setSel(i)} onClick={() => choose(it)}><b>{it.label}</b><span>{it.sub}</span></button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}

export function Help() {
  return (
    <Modal id="help" label="How to use this">
      <p className="kicker">How to use this</p>
      <h2>Reading the city</h2>
      <ul className="legend-list">
        <li><i className="lg brain" /><b>The brain</b> in the middle is the plan (34 tasks) and Mayor, the orchestrator. Click it to see what can start next.</li>
        <li><i className="lg district" /><b>Each district</b> is one AI agent. The rim of its plate is a gauge: one tick per task, lit when built.</li>
        <li><i className="lg tower" /><b>Each tower</b> is a task. Taller means more planned effort. Lit floors mean built. Amber means an agent is working on it now. Violet means it is prepared and waits on you. Ghost outlines are planned.</li>
        <li><i className="lg packet" /><b>Lights</b> fly out from the brain when a task starts and back when it finishes. Arcs show which task feeds which.</li>
      </ul>
      <h3>Controls</h3>
      <table className="keys-table"><tbody>
        <tr><th>Drag</th><td>Orbit around the city</td></tr>
        <tr><th>Scroll or pinch</th><td>Zoom toward the cursor</td></tr>
        <tr><th>Click</th><td>Fly to anything and open its record</td></tr>
        <tr><th>Esc or Home</th><td>Back one level, then to the whole city</td></tr>
        <tr><th>← →</th><td>Previous or next agent</td></tr>
        <tr><th>/ or ⌘K</th><td>Find or ask</td></tr>
      </tbody></table>
      <h3>What is real</h3>
      <p className="note">{BRIEF.data} Agents only work when a session runs them: right now, or on the schedule the founder sets. Between runs the city is honest about being idle.</p>
    </Modal>
  )
}

/** The one action: request a pilot. Honest about what happens next. */
export function Pilot() {
  const [sent, setSent] = useState(false)
  return (
    <Modal id="pilot" label="Request a pilot">
      <p className="kicker">The one action</p>
      <h2>Request a pilot</h2>
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

/** A complete DOM mirror of every level with the same numbers. Always present for assistive tech. */
export function Index({ forceOpen }: { forceOpen?: boolean }) {
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const time = useStore(s => s.time)
  const panel = useStore(s => s.panel)
  if (!data) return null
  const v = ventureStats(data, st, time)
  const body = (
    <div className="mirror">
      <p className="kicker">Index · the whole city as tables</p>
      <h2>Perspective Engine</h2>
      <p>{v.done} of {v.total} tasks built · {v.running} working · {v.waiting} waiting on the founder · {v.blocked} blocked · {fmtK(v.usedK)} tokens used.</p>
      {agentStats(data, st).map(a => (
        <section key={a.key}>
          <h3>{a.district} · {a.name} <small>{a.done}/{a.tasks.length} built</small></h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Task</th><th scope="col">Title</th><th scope="col">Status</th><th scope="col">Plan</th><th scope="col">Used</th><th scope="col">Steps</th><th scope="col">Records</th></tr></thead>
              <tbody>
                {a.tasks.map(n => (
                  <tr key={n.id}>
                    <td><button className="link" onClick={() => { const s = useStore.getState(); s.set({ panel: 'none' }); s.select({ kind: 'task', id: n.id }) }}>{n.id}</button></td>
                    <td>{n.title}</td><td>{STATUS_LABEL[st.get(n.id)!]}</td><td>{n.budget_k}k</td><td>{n.run ? fmtK(n.run.used_k) : '—'}</td>
                    <td>{taskFeed(data, n.id, time).length}</td>
                    <td><details><summary>{atomsOf(data, n.id, st, time).length}</summary><ul>{atomsOf(data, n.id, st, time).map(r => <li key={r.id}>{r.level4Type}: {r.meta.label}</li>)}</ul></details></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
  if (forceOpen) return <div className="mirror-page"><p className="note">3D graphics are off in this browser, so the city is shown as tables with the same numbers.</p>{body}</div>
  return (
    <>
      {panel !== 'index' && <div className="sr-only">{body}</div>}
      <Modal id="index" label="Index of the whole city" wide>{body}</Modal>
    </>
  )
}
