import { AnimatePresence, motion } from 'framer-motion'
import { sfx } from '../audio/sound'
import { BRIEF } from '../data/brief'
import { agentStats, atomsOf, focusKind, fmtK, fmtTime, ms, STATUS_LABEL, ventureStats } from '../data/model'
import type { GraphState, Status } from '../data/types'
import { useStore } from '../store'
import { BudgetDumbbell, RatioSpark } from './Charts'
import { rise, spring } from './HUD'

const go = (id: string) => () => { sfx.dive(); useStore.getState().dive(id) }

function Pill({ s }: { s: Status }) {
  return <span className={`pill st-${s}`}><i />{STATUS_LABEL[s]}</span>
}

export function Dossier() {
  const data = useStore(s => s.data)
  const focus = useStore(s => s.focus)
  const st = useStore(s => s.st)
  const time = useStore(s => s.time)
  const record = useStore(s => s.record)
  if (!data) return null
  const kind = focusKind(data, focus)
  return (
    <aside className="dossier scrolls" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.div key={focus + (record ?? '')} initial="h" animate="s" exit={{ opacity: 0, transition: { duration: 0.12 } }}
          variants={{ s: { transition: { staggerChildren: 0.045 } }, h: {} }}>
          {record && <Record data={data} st={st} time={time} focus={focus} id={record} />}
          {kind === 'venture' && <Venture data={data} st={st} time={time} />}
          {kind === 'city' && <City data={data} st={st} />}
          {kind === 'agent' && <AgentView data={data} st={st} id={focus} />}
          {kind === 'task' && <TaskView data={data} st={st} id={focus} />}
        </motion.div>
      </AnimatePresence>
    </aside>
  )
}

const M = motion.div

function Venture({ data, st, time }: { data: GraphState; st: Map<string, Status>; time: number | null }) {
  const v = ventureStats(data, st, time)
  const doneAt = new Map(data.ledger.filter(e => e.event === 'done').map(e => [e.node, ms(e.t)]))
  const rows = data.nodes.filter(n => n.run && doneAt.has(n.id) && (time === null || doneAt.get(n.id)! <= time))
    .sort((a, b) => doneAt.get(a.id)! - doneAt.get(b.id)!)
    .map(n => ({ id: n.id, title: n.title, budget: n.budget_k, spent: Math.round(n.run!.used_k) }))
  return (
    <>
      <M variants={rise} className="ds-k">Level 1 · ×1 · the whole venture</M>
      <M variants={rise}><h2>Perspective Engine</h2></M>
      <M variants={rise}><p className="lede">{data.north_star}</p></M>
      <M variants={rise} className="stats">
        <div><b>{v.done}<small>/{v.total}</small></b><span>tasks built</span></div>
        <div><b>{v.running}</b><span>building</span></div>
        <div><b>{v.waiting}</b><span>wait on founder</span></div>
        <div><b>{fmtK(v.usedK)}</b><span>tokens spent</span></div>
      </M>
      <M variants={rise}><h3>How the agents are improving</h3></M>
      <M variants={rise}><BudgetDumbbell rows={rows} /></M>
      <M variants={rise}><p className="note">{BRIEF.lesson}</p></M>
      <M variants={rise}><h3>What the evidence changed</h3></M>
      <M variants={rise}>
        <ul className="evidence">
          {BRIEF.evidence.slice(0, 2).map(e => <li key={e.source}>{e.text} <a href={e.source} target="_blank" rel="noreferrer">Source</a></li>)}
          <li>{BRIEF.claim.text} <a href={BRIEF.claim.source} target="_blank" rel="noreferrer">Source</a></li>
        </ul>
      </M>
      <M variants={rise}><h3>The bet</h3><p className="note">{BRIEF.model}</p></M>
      <M variants={rise}><button className="cta wide" onClick={() => { sfx.click(); useStore.getState().set({ panel: 'pilot' }) }}>Request a pilot</button></M>
    </>
  )
}

function City({ data, st }: { data: GraphState; st: Map<string, Status> }) {
  const stats = agentStats(data, st)
  const cross = data.nodes.reduce((s, n) => s + n.deps.filter(d => data.nodes.find(x => x.id === d)?.agent !== n.agent).length, 0)
  return (
    <>
      <M variants={rise} className="ds-k">Level 2 · ×12 · nine districts</M>
      <M variants={rise}><h2>Nine agents</h2></M>
      <M variants={rise}><p className="lede">Each district is one agent's responsibility. {cross} dependencies cross district lines. That is where the agents hand work to each other, and the arcs light up when they do.</p></M>
      <M variants={rise}>
        <ul className="agents">
          {stats.map(a => (
            <li key={a.key}>
              <button onClick={go(a.key)} onMouseEnter={() => { sfx.hover(); useStore.getState().set({ hover: { kind: 'agent', id: a.key } }) }} onMouseLeave={() => useStore.getState().set({ hover: null })}>
                <span className="a-name">{a.name}<small>{a.district}</small></span>
                <span className="a-num">{a.done}/{a.tasks.length}</span>
                <span className="bar"><i style={{ width: `${(a.done / a.tasks.length) * 100}%` }} /></span>
                <span className="a-now">{a.running ? `Building ${a.running.id}` : a.waiting ? `${a.waiting} waiting on founder` : a.next ? `Next: ${a.next.id} ${a.next.title}` : 'Idle until upstream work lands'}</span>
              </button>
            </li>
          ))}
        </ul>
      </M>
    </>
  )
}

function AgentView({ data, st, id }: { data: GraphState; st: Map<string, Status>; id: string }) {
  const a = agentStats(data, st).find(x => x.key === id)!
  const active = a.running ?? [...a.tasks].reverse().find(n => st.get(n.id) === 'done' || st.get(n.id) === 'awaiting_human') ?? a.next
  const ev = active ? data.ledger.filter(e => e.node === active.id) : []
  const started = ev.find(e => e.event === 'start'), finished = ev.find(e => e.event === 'done')
  const steps = active ? [
    { k: 'Brief', d: `graph.py brief ${active.id}`, on: !!started },
    { k: 'Read inputs', d: active.deps.length ? active.deps.join(', ') : 'none', on: !!started },
    { k: 'Write outputs', d: active.outputs.map(o => o.split('/').pop()).join(', '), on: !!finished },
    { k: 'Acceptance check', d: `${active.accept.length} criteria`, on: !!finished },
    { k: active.gate ? 'Founder gate' : 'Done', d: active.gate ? active.gate.reason : finished ? fmtTime(ms(finished.t)) : 'pending', on: st.get(active.id) === 'done' },
  ] : []
  const runs = a.tasks.filter(n => n.run)
  const avgMin = runs.filter(n => n.run!.duration_s).reduce((s, n, _, arr) => s + n.run!.duration_s! / 60 / arr.length, 0)
  const trend = a.efficiency.length > 1 ? (a.efficiency.at(-1)!.ratio < a.efficiency[0].ratio ? 'Overrun is shrinking.' : 'Overrun is not shrinking yet.') : ''
  return (
    <>
      <M variants={rise} className="ds-k">Level 3 · ×140 · {a.district}</M>
      <M variants={rise}><h2>{a.name}</h2></M>
      <M variants={rise}><p className="lede">{a.role}</p></M>
      <M variants={rise} className="stats">
        <div><b>{a.done}<small>/{a.tasks.length}</small></b><span>built</span></div>
        <div><b>{fmtK(a.used)}</b><span>spent of {a.budget}k</span></div>
        <div><b>{avgMin ? `${avgMin.toFixed(1)}m` : '—'}</b><span>avg run</span></div>
        <div><b>{runs.reduce((s, n) => s + n.run!.tools, 0)}</b><span>tool calls</span></div>
      </M>
      {active && (
        <M variants={rise}>
          <h3>{a.running ? 'Executing now' : 'Last execution'} · {active.id}</h3>
          <ol className="trace">
            {steps.map(s => <li key={s.k} className={s.on ? 'on' : ''}><b>{s.k}</b><span>{s.d}</span></li>)}
          </ol>
        </M>
      )}
      <M variants={rise}><h3>Budget discipline</h3><RatioSpark points={a.efficiency} /><p className="note">{trend} Ratios above 1× mostly reflect fixed context: even 8k-budget runs processed about 73k tokens.</p></M>
      <M variants={rise}>
        <h3>Collaborates with</h3>
        <div className="collab">
          <span>Reads from</span>{[...a.inbound].map(k => <button key={k} onClick={go(k)}>{data.agents[k].name}</button>)}{!a.inbound.size && <em>no one yet</em>}
        </div>
        <div className="collab">
          <span>Feeds</span>{[...a.outbound].map(k => <button key={k} onClick={go(k)}>{data.agents[k].name}</button>)}{!a.outbound.size && <em>no one yet</em>}
        </div>
      </M>
      <M variants={rise}>
        <h3>Towers</h3>
        <ul className="tasks">
          {a.tasks.map(n => <li key={n.id}><button onClick={go(n.id)}><code>{n.id}</code><span>{n.title}</span><Pill s={st.get(n.id)!} /></button></li>)}
        </ul>
      </M>
    </>
  )
}

function TaskView({ data, st, id }: { data: GraphState; st: Map<string, Status>; id: string }) {
  const n = data.nodes.find(x => x.id === id)!
  const s = st.get(id)!
  const ex = n.outputs.map(o => data.excerpts[o]).find(Boolean)
  const ev = data.ledger.filter(e => e.node === id)
  const met = s === 'done' || s === 'awaiting_human'
  return (
    <>
      <M variants={rise} className="ds-k">Level 4 · ×2000 · {data.agents[n.agent].name} · phase {n.phase}</M>
      <M variants={rise}><h2 className="task-h"><code>{n.id}</code>{n.title}</h2></M>
      <M variants={rise}><Pill s={s} /></M>
      {ex && <M variants={rise}><blockquote>{ex}</blockquote></M>}
      <M variants={rise} className="stats">
        <div><b>{n.budget_k}k</b><span>budget</span></div>
        <div><b>{n.run ? fmtK(n.run.used_k) : '—'}</b><span>spent</span></div>
        <div><b>{n.run?.duration_s ? `${(n.run.duration_s / 60).toFixed(1)}m` : '—'}</b><span>run time</span></div>
        <div><b>{n.run?.tools ?? '—'}</b><span>tool calls</span></div>
      </M>
      <M variants={rise}>
        <h3>Acceptance</h3>
        <ul className="checks">{n.accept.map(a => <li key={a} className={met ? 'on' : ''}>{a}</li>)}</ul>
      </M>
      {n.gate && <M variants={rise} className={`gate${n.gate.cleared ? ' cleared' : ''}`}><b>Founder gate</b><span>{n.gate.reason}</span></M>}
      <M variants={rise}>
        <h3>Inputs</h3>
        <ul className="tasks">{n.deps.length ? n.deps.map(d => { const dn = data.nodes.find(x => x.id === d)!; return <li key={d}><button onClick={go(d)}><code>{d}</code><span>{dn.title}</span><Pill s={st.get(d)!} /></button></li> }) : <li className="muted">None. This task starts from scratch.</li>}</ul>
      </M>
      <M variants={rise}>
        <h3>Outputs</h3>
        <ul className="files">{n.outputs.map(o => <li key={o}><code>{o.replace('perspective-engine/', '')}</code></li>)}</ul>
      </M>
      <M variants={rise}>
        <h3>Ledger</h3>
        <ol className="ledger">{ev.length ? ev.map((e, i) => <li key={i}><time>{fmtTime(ms(e.t))}</time><b>{e.event}</b><span>{e.note}</span></li>) : <li className="muted">No events yet.</li>}</ol>
      </M>
    </>
  )
}

function Record({ data, st, time, focus, id }: { data: GraphState; st: Map<string, Status>; time: number | null; focus: string; id: string }) {
  const a = atomsOf(data, focus, st, time).find(x => x.id === id)
  if (!a) return null
  return (
    <motion.div className="record" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div className="ds-k">Record · {a.level4Type}{a.timestamp ? ` · ${fmtTime(a.timestamp)}` : ''}</div>
      <p className="rec-v">{a.meta.label}</p>
      {a.meta.detail && <p className="rec-d">{a.meta.detail}</p>}
      {a.meta.source && <code>{a.meta.source}</code>}
      <button className="link" onClick={() => useStore.getState().set({ record: null })}>Close record</button>
    </motion.div>
  )
}
