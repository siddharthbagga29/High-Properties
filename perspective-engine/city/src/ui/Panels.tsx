import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { sfx } from '../audio/sound'
import { BRIEF } from '../data/brief'
import { agentStats, atomsOf, fmtK, STATUS_LABEL, ventureStats } from '../data/model'
import { useStore } from '../store'
import { spring } from './HUD'

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

/** ⌘K: jump to any district, agent or task by name. */
export function Palette() {
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const items = useMemo(() => {
    if (!data) return []
    const all = [
      { id: 'venture', label: 'Perspective Engine', sub: 'Level 1 · the whole venture' },
      { id: 'city', label: 'All districts', sub: 'Level 2 · nine agents' },
      ...agentStats(data, st).map(a => ({ id: a.key, label: `${a.name} · ${a.district}`, sub: `Agent · ${a.done}/${a.tasks.length} built` })),
      ...data.nodes.map(n => ({ id: n.id, label: `${n.id} · ${n.title}`, sub: `Task · ${STATUS_LABEL[st.get(n.id)!]} · ${data.agents[n.agent].name}` })),
    ]
    const t = q.toLowerCase().trim()
    return t ? all.filter(i => (i.label + ' ' + i.sub).toLowerCase().includes(t)) : all
  }, [data, st, q])
  const choose = (id: string) => {
    const s = useStore.getState()
    sfx.dive()
    if (s.mode === 'story') { s.set({ mode: 'explore' }); scrollTo(0, 0) }
    s.dive(id)
    s.set({ panel: 'none' })
    setQ('')
  }
  return (
    <Modal id="palette" label="Find a district, agent or task">
      <div className="palette">
        <label htmlFor="pal-q" className="sr-only">Search</label>
        <input id="pal-q" value={q} placeholder="Find a district, agent or task…" autoComplete="off"
          onChange={e => { setQ(e.target.value); setSel(0) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(i => Math.min(items.length - 1, i + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel(i => Math.max(0, i - 1)) }
            if (e.key === 'Enter' && items[sel]) choose(items[sel].id)
          }} />
        <ul role="listbox" aria-label="Results">
          {items.slice(0, 40).map((it, i) => (
            <li key={it.id} role="option" aria-selected={i === sel}>
              <button className={i === sel ? 'on' : ''} onMouseEnter={() => setSel(i)} onClick={() => choose(it.id)}><b>{it.label}</b><span>{it.sub}</span></button>
            </li>
          ))}
          {!items.length && <li className="muted">Nothing matches “{q}”.</li>}
        </ul>
      </div>
    </Modal>
  )
}

/** The one action: request a pilot. Honest about what happens next. */
export function Pilot() {
  const [sent, setSent] = useState(false)
  return (
    <Modal id="pilot" label="Request a pilot">
      <div className="pilot">
        <p className="ds-k">The one action</p>
        <h2>Request a pilot</h2>
        <p className="lede">{BRIEF.pilot}</p>
        <ul className="evidence">
          <li>Runs in a normal browser. No headsets to buy or manage.</li>
          <li>Success is measured as behavior at day 30: accommodation practices that were verified, not self-reported feelings.</li>
          <li>Results are reported with confidence intervals, including a null result.</li>
        </ul>
        {sent ? (
          <p className="thanks" role="status">Thank you. Sign-ups open once the first advisory review is complete. Nothing was sent from this page yet: the form is not connected to a server until the founder approves where the data goes.</p>
        ) : (
          <form onSubmit={e => { e.preventDefault(); sfx.click(); setSent(true) }}>
            {/* The founder wires this to a form backend later; that is a gated step (privacy notice first). */}
            <label htmlFor="p-name">Name</label>
            <input id="p-name" required autoComplete="name" />
            <label htmlFor="p-email">Work email</label>
            <input id="p-email" type="email" required autoComplete="email" />
            <label htmlFor="p-org">Organization</label>
            <input id="p-org" required autoComplete="organization" />
            <label htmlFor="p-role">Your area</label>
            <select id="p-role" defaultValue="People / L&D">
              <option>People / L&D</option><option>Accommodations / Employee relations</option><option>Higher education</option><option>Other</option>
            </select>
            <button type="submit" className="cta wide">Request a pilot</button>
            <p className="muted small">This form is not connected yet. Nothing you type leaves this page.</p>
          </form>
        )}
      </div>
    </Modal>
  )
}

/** A complete DOM mirror of every level with the same numbers. Always in the DOM for assistive tech. */
export function Mirror({ forceOpen }: { forceOpen?: boolean }) {
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const time = useStore(s => s.time)
  const panel = useStore(s => s.panel)
  if (!data) return null
  const v = ventureStats(data, st, time)
  const body = (
    <div className="mirror">
      <p className="ds-k">Index · every level as tables</p>
      <h2>Perspective Engine</h2>
      <p>{v.done} of {v.total} tasks built · {v.running} building · {v.waiting} waiting on the founder · {v.blocked} blocked · {fmtK(v.usedK)} tokens spent · {v.events} ledger events.</p>
      {agentStats(data, st).map(a => (
        <section key={a.key}>
          <h3>{a.district} · {a.name} <small>{a.done}/{a.tasks.length} built · {fmtK(a.used)} spent of {a.budget}k</small></h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Task</th><th scope="col">Title</th><th scope="col">Status</th><th scope="col">Budget</th><th scope="col">Spent</th><th scope="col">Records</th></tr></thead>
              <tbody>
                {a.tasks.map(n => (
                  <tr key={n.id}>
                    <td><button className="link" onClick={() => { const s = useStore.getState(); s.set({ panel: 'none', mode: 'explore' }); s.dive(n.id) }}>{n.id}</button></td>
                    <td>{n.title}</td>
                    <td>{STATUS_LABEL[st.get(n.id)!]}</td>
                    <td>{n.budget_k}k</td>
                    <td>{n.run ? fmtK(n.run.used_k) : '—'}</td>
                    <td><details><summary>{atomsOf(data, n.id, st, time).length}</summary><ul>{atomsOf(data, n.id, st, time).map(r => <li key={r.id}>{r.level4Type}: {r.meta.label}{r.meta.detail ? ` (${r.meta.detail.slice(0, 120)})` : ''}</li>)}</ul></details></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
  if (forceOpen) return (
    <div className="mirror-page">
      <p className="note">This browser has 3D graphics turned off, so the city is shown as tables. Every number is the same as in the 3D view.</p>
      {body}
    </div>
  )
  return (
    <>
      {panel !== 'index' && <div className="sr-only">{body}</div>}
      <Modal id="index" label="Index of every level" wide>{body}</Modal>
    </>
  )
}
