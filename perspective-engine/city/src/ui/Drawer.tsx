import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { sfx } from '../audio/sound'
import { ask, type AskResult } from '../data/ask'
import { BRIEF } from '../data/brief'
import { agentFeed, agentStats, ago, atomsOf, clock, feed, fmtK, ms, STATUS_LABEL, taskFeed, ventureStats, workingNow } from '../data/model'
import type { GraphState, Status } from '../data/types'
import { focusKey, useStore, type Focus, type Tab } from '../store'
import { BudgetDumbbell, RatioSpark } from './Charts'
import { Timeline } from './Timeline'

export const spring = { type: 'spring', stiffness: 220, damping: 26 } as const
export const rise = { h: { opacity: 0.35, y: 10 }, s: { opacity: 1, y: 0, transition: spring } }
const M = motion.div
const go = (f: Focus, tab?: Tab) => () => { sfx.dive(); useStore.getState().select(f, tab) }

export function Pill({ s }: { s: Status }) {
  return <span className={`pill st-${s}`}><i />{STATUS_LABEL[s]}</span>
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' }, { key: 'activity', label: 'Activity' }, { key: 'output', label: 'Output' }, { key: 'ask', label: 'Ask' },
]

/** The right-hand drawer: whatever you selected, in plain language, with its exact activity and an Ask box. */
export function Drawer() {
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const time = useStore(s => s.time)
  const focus = useStore(s => s.focus)
  const tab = useStore(s => s.tab)
  const record = useStore(s => s.record)
  if (!data) return <aside className="drawer"><p className="muted">Loading the live plan…</p></aside>
  const tabs = TABS.filter(t => t.key !== 'output' || focus.kind === 'agent' || focus.kind === 'task')
  return (
    <aside className="drawer scrolls" aria-label="Inspector">
      <Header data={data} st={st} focus={focus} />
      <nav className="tabs" role="tablist" aria-label="Views">
        {tabs.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''}
            onClick={() => { sfx.click(); useStore.getState().set({ tab: t.key }) }}>{t.label}</button>
        ))}
      </nav>
      {record && focus.kind === 'task' && <Record data={data} st={st} time={time} id={focus.id} rid={record} />}
      <AnimatePresence initial={false}>
        <M key={focusKey(focus) + tab} initial="h" animate="s" exit={{ opacity: 0, position: 'absolute', transition: { duration: 0.08 } }} variants={{ s: { transition: { staggerChildren: 0.045 } }, h: {} }}>
          {tab === 'ask' ? <AskTab data={data} st={st} focus={focus} time={time} />
            : tab === 'activity' ? <ActivityTab data={data} focus={focus} time={time} />
            : tab === 'output' ? <OutputTab data={data} st={st} focus={focus} />
            : focus.kind === 'world' ? <WorldView data={data} st={st} time={time} />
            : focus.kind === 'brain' ? <BrainView data={data} st={st} time={time} />
            : focus.kind === 'agent' ? <AgentView data={data} st={st} id={focus.id} time={time} />
            : <TaskView data={data} st={st} id={focus.id} />}
        </M>
      </AnimatePresence>
    </aside>
  )
}

function Header({ data, st, focus }: { data: GraphState; st: Map<string, Status>; focus: Focus }) {
  const crumbs: { f: Focus; label: string }[] = [{ f: { kind: 'world' }, label: 'City' }]
  let title = 'Perspective Engine', kicker = 'The whole company'
  if (focus.kind === 'brain') { crumbs.push({ f: focus, label: 'Brain' }); title = 'The Brain'; kicker = 'The plan and its orchestrator, Mayor' }
  if (focus.kind === 'agent') {
    const a = data.agents[focus.id]
    crumbs.push({ f: focus, label: a.district }); title = a.name; kicker = `${a.district} · ${a.role}`
  }
  if (focus.kind === 'task') {
    const n = data.nodes.find(x => x.id === focus.id)!
    crumbs.push({ f: { kind: 'agent', id: n.agent }, label: data.agents[n.agent].district }, { f: focus, label: n.id })
    title = n.title; kicker = `${n.id} · ${data.agents[n.agent].name} · phase ${n.phase} · ${STATUS_LABEL[st.get(n.id)!]}`
  }
  return (
    <header className="dh">
      <nav className="crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i}>{i > 0 && <em aria-hidden="true">›</em>}<button onClick={go(c.f)} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</button></span>
        ))}
      </nav>
      <p className="kicker">{kicker}</p>
      <h2>{title}</h2>
    </header>
  )
}

function Now({ data, st }: { data: GraphState; st: Map<string, Status> }) {
  const working = workingNow(data, st)
  const last = feed(data, null)[0]
  if (!working.length) return (
    <div className="now idle"><b>No agent is working right now.</b><span>{last ? `Last recorded step ${ago(last.t)} (${clock(last.t)} UTC): ${data.agents[last.agent]?.name} on ${last.node}.` : 'Nothing recorded yet.'}</span></div>
  )
  return (
    <div className="now">
      <b>{working.length} agent{working.length > 1 ? 's' : ''} working right now</b>
      <ul>
        {working.map(({ agent, node }) => {
          const step = taskFeed(data, node.id, null)[0]
          return (
            <li key={node.id}>
              <button onClick={go({ kind: 'agent', id: agent }, 'activity')}>
                <span className="who">{data.agents[agent].name}</span>
                <span>{node.id} · {node.title}</span>
                {step && <small>{clock(step.t)} UTC · {step.text}</small>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function WorldView({ data, st, time }: { data: GraphState; st: Map<string, Status>; time: number | null }) {
  const v = ventureStats(data, st, time)
  const gates = data.nodes.filter(n => st.get(n.id) === 'awaiting_human')
  return (
    <>
      <M variants={rise}><p className="lede">{BRIEF.idea}</p></M>
      <M variants={rise}><Now data={data} st={st} /></M>
      <M variants={rise} className="stats">
        <div><b>{v.done}<small>/{v.total}</small></b><span>tasks built</span></div>
        <div><b>{v.running}</b><span>working</span></div>
        <div><b>{v.waiting}</b><span>wait on you</span></div>
        <div><b>{feed(data, time).length}</b><span>steps logged</span></div>
      </M>
      <M variants={rise}>
        <h3>How to read the city</h3>
        <ul className="legend-list">
          <li><i className="lg brain" /><b>The brain</b> is the plan (34 tasks) and Mayor, the orchestrator who hands out work.</li>
          <li><i className="lg district" /><b>Each district</b> is one AI agent's department. Its rim fills as tasks are built.</li>
          <li><i className="lg tower" /><b>Each tower</b> is one task. Height is its planned effort; lit floors mean built; amber means working now; violet waits on you.</li>
          <li><i className="lg packet" /><b>Lights</b> travel when an agent starts (out from the brain) or finishes (back home).</li>
        </ul>
      </M>
      {gates.length > 0 && (
        <M variants={rise}>
          <h3>Waiting on you</h3>
          <ul className="tasks">{gates.map(n => <li key={n.id}><button onClick={go({ kind: 'task', id: n.id })}><code>{n.id}</code><span>{n.gate?.reason}</span></button></li>)}</ul>
        </M>
      )}
      <M variants={rise}>
        <h3>The agents</h3>
        <ul className="agents">
          {agentStats(data, st).map(a => (
            <li key={a.key}>
              <button onClick={go({ kind: 'agent', id: a.key })}>
                <span className="a-name">{a.name}<small>{a.district}</small></span>
                <span className="a-num">{a.done}/{a.tasks.length}</span>
                <span className="bar"><i style={{ width: `${(a.done / a.tasks.length) * 100}%` }} /></span>
                <span className={`a-now${a.running ? ' working' : ''}`}>{a.running ? `Working on ${a.running.id}: ${a.running.title}` : a.waiting ? `${a.waiting} waiting on you` : a.next ? `Next: ${a.next.id} ${a.next.title}` : 'Idle until upstream work lands'}</span>
              </button>
            </li>
          ))}
        </ul>
      </M>
      <M variants={rise}><h3>End goal</h3><p className="note">{data.north_star} {BRIEF.model}</p></M>
    </>
  )
}

function BrainView({ data, st, time }: { data: GraphState; st: Map<string, Status>; time: number | null }) {
  const phases = [0, 1, 2, 3].map(p => {
    const ns = data.nodes.filter(n => n.phase === p)
    return { p, total: ns.length, done: ns.filter(n => st.get(n.id) === 'done').length, ready: ns.filter(n => st.get(n.id) === 'ready').length }
  })
  const ready = data.nodes.filter(n => st.get(n.id) === 'ready')
  const doneAt = new Map(data.ledger.filter(e => e.event === 'done').map(e => [e.node, ms(e.t)]))
  const rows = data.nodes.filter(n => n.run && doneAt.has(n.id) && (time === null || doneAt.get(n.id)! <= time))
    .sort((a, b) => doneAt.get(a.id)! - doneAt.get(b.id)!).map(n => ({ id: n.id, title: n.title, budget: n.budget_k, spent: Math.round(n.run!.used_k) }))
  const NAMES = ['Phase 0 · foundation', 'Phase 1 · validation', 'Phase 2 · MVP and study', 'Phase 3 · pilots']
  return (
    <>
      <M variants={rise}><p className="lede">The brain holds the plan: {data.nodes.length} tasks in a dependency graph. Mayor reads it, starts at most three agents at a time on tasks whose inputs are ready, checks each result against its acceptance criteria, and records every change in the ledger.</p></M>
      <M variants={rise}>
        <h3>Progress by phase</h3>
        <ul className="phases">
          {phases.map(ph => (
            <li key={ph.p}><span>{NAMES[ph.p]}</span><span className="bar"><i style={{ width: `${(ph.done / Math.max(ph.total, 1)) * 100}%` }} /></span><b>{ph.done}/{ph.total}</b></li>
          ))}
        </ul>
      </M>
      <M variants={rise}>
        <h3>Ready to start next</h3>
        <ul className="tasks">{ready.length ? ready.map(n => <li key={n.id}><button onClick={go({ kind: 'task', id: n.id })}><code>{n.id}</code><span>{n.title}</span><Pill s="ready" /></button></li>) : <li className="muted">Nothing is ready: remaining work waits on running tasks or on you.</li>}</ul>
      </M>
      <M variants={rise}><h3>Planned effort vs actual, per finished task</h3><BudgetDumbbell rows={rows} /><p className="note">{BRIEF.lesson}</p></M>
      <M variants={rise}><h3>Evidence that shaped the plan</h3>
        <ul className="evidence">{BRIEF.evidence.slice(0, 2).map(e => <li key={e.source}>{e.text} <a href={e.source} target="_blank" rel="noreferrer">Source</a></li>)}
          <li>{BRIEF.claim.text} <a href={BRIEF.claim.source} target="_blank" rel="noreferrer">Source</a></li></ul>
      </M>
    </>
  )
}

function AgentView({ data, st, id, time }: { data: GraphState; st: Map<string, Status>; id: string; time: number | null }) {
  const a = agentStats(data, st).find(x => x.key === id)!
  const ev = agentFeed(data, id, time)
  const runs = a.tasks.filter(n => n.run)
  return (
    <>
      <M variants={rise}>
        {a.running
          ? <div className="now"><b>Working right now on {a.running.id}</b><span>{a.running.title}</span>{ev[0] && <small>Latest step {clock(ev[0].t)} UTC ({ago(ev[0].t)}): {ev[0].text}</small>}</div>
          : <div className="now idle"><b>{a.waiting ? `${a.waiting} task waiting on you` : 'Not working right now'}</b><span>{ev[0] ? `Last step ${clock(ev[0].t)} UTC (${ago(ev[0].t)}): ${ev[0].text}` : 'No recorded steps yet.'}</span></div>}
      </M>
      <M variants={rise} className="stats">
        <div><b>{a.done}<small>/{a.tasks.length}</small></b><span>built</span></div>
        <div><b>{ev.length}</b><span>steps logged</span></div>
        <div><b>{fmtK(a.used)}</b><span>tokens used</span></div>
        <div><b>{runs.reduce((s, n) => s + n.run!.tools, 0)}</b><span>tool calls</span></div>
      </M>
      <M variants={rise}>
        <h3>Latest steps <button className="link" onClick={() => useStore.getState().set({ tab: 'activity' })}>Full timeline</button></h3>
        <Timeline events={ev.slice(0, 8)} showTask />
      </M>
      <M variants={rise}>
        <h3>Its towers</h3>
        <ul className="tasks">{a.tasks.map(n => <li key={n.id}><button onClick={go({ kind: 'task', id: n.id })}><code>{n.id}</code><span>{n.title}</span><Pill s={st.get(n.id)!} /></button></li>)}</ul>
      </M>
      <M variants={rise}><h3>Effort vs plan</h3><RatioSpark points={a.efficiency} /></M>
      <M variants={rise}>
        <h3>Works with</h3>
        <div className="collab"><span>Reads from</span>{[...a.inbound].map(k => <button key={k} onClick={go({ kind: 'agent', id: k })}>{data.agents[k].name}</button>)}{!a.inbound.size && <em>no one yet</em>}</div>
        <div className="collab"><span>Feeds</span>{[...a.outbound].map(k => <button key={k} onClick={go({ kind: 'agent', id: k })}>{data.agents[k].name}</button>)}{!a.outbound.size && <em>no one yet</em>}</div>
      </M>
    </>
  )
}

function TaskView({ data, st, id }: { data: GraphState; st: Map<string, Status>; id: string }) {
  const n = data.nodes.find(x => x.id === id)!
  const s = st.get(id)!
  const ex = n.outputs.map(o => data.excerpts[o]).find(Boolean)
  const met = s === 'done' || s === 'awaiting_human'
  const ev = taskFeed(data, id, null)
  return (
    <>
      <M variants={rise}><Pill s={s} /></M>
      {ex && <M variants={rise}><blockquote>{ex}</blockquote></M>}
      <M variants={rise} className="stats">
        <div><b>{n.budget_k}k</b><span>planned</span></div>
        <div><b>{n.run ? fmtK(n.run.used_k) : '—'}</b><span>used</span></div>
        <div><b>{n.run?.duration_s ? `${(n.run.duration_s / 60).toFixed(1)}m` : '—'}</b><span>run time</span></div>
        <div><b>{ev.length}</b><span>steps</span></div>
      </M>
      {n.gate && <M variants={rise} className={`gate${n.gate.cleared ? ' cleared' : ''}`}><b>{n.gate.cleared ? 'Gate cleared' : 'Waits on you'}</b><span>{n.gate.reason}</span></M>}
      <M variants={rise}><h3>Done means</h3><ul className="checks">{n.accept.map(a => <li key={a} className={met ? 'on' : ''}>{a}</li>)}</ul></M>
      <M variants={rise}>
        <h3>Needs work from</h3>
        <ul className="tasks">{n.deps.length ? n.deps.map(d => { const dn = data.nodes.find(x => x.id === d)!; return <li key={d}><button onClick={go({ kind: 'task', id: d })}><code>{d}</code><span>{dn.title}</span><Pill s={st.get(d)!} /></button></li> }) : <li className="muted">Nothing: this task starts from scratch.</li>}</ul>
      </M>
      <M variants={rise}><h3>Latest steps</h3><Timeline events={ev.slice(0, 8)} /></M>
    </>
  )
}

function ActivityTab({ data, focus, time }: { data: GraphState; focus: Focus; time: number | null }) {
  const events = focus.kind === 'agent' ? agentFeed(data, focus.id, time)
    : focus.kind === 'task' ? taskFeed(data, focus.id, time)
    : focus.kind === 'brain' ? agentFeed(data, 'orchestrator', time)
    : feed(data, time)
  return (
    <>
      <M variants={rise}><p className="note">Every row is a recorded step with its UTC time: searches, files read and written, checks, and hand-offs. They come from the agents' own tool calls, their live logs, and the task ledger.</p></M>
      <M variants={rise}><Timeline events={events} showAgent={focus.kind === 'world' || focus.kind === 'brain'} showTask={focus.kind !== 'task'} empty="No recorded steps for this yet." /></M>
    </>
  )
}

function OutputTab({ data, st, focus }: { data: GraphState; st: Map<string, Status>; focus: Focus }) {
  const nodes = focus.kind === 'agent' ? data.nodes.filter(n => n.agent === focus.id) : data.nodes.filter(n => focus.kind === 'task' && n.id === focus.id)
  return (
    <>
      <M variants={rise}><p className="note">What the work produced: each file in the repository, with its opening summary.</p></M>
      {nodes.map(n => (
        <M variants={rise} key={n.id}>
          <h3>{n.id} · {n.title} <Pill s={st.get(n.id)!} /></h3>
          <ul className="outputs">
            {n.outputs.map(o => (
              <li key={o}><code>{o.replace('perspective-engine/', '')}</code>{data.excerpts[o] ? <p>{data.excerpts[o]}</p> : <p className="muted">{st.get(n.id) === 'done' || st.get(n.id) === 'awaiting_human' ? 'Code or data file (no prose summary).' : 'Not written yet.'}</p>}</li>
            ))}
          </ul>
        </M>
      ))}
    </>
  )
}

const SUGGEST: Record<Focus['kind'], string[]> = {
  world: ['Who is working right now?', 'What changed in the last hour?', 'What is waiting on me?', 'How close are we to the end goal?'],
  brain: ['What can start next?', 'Why are tasks over their token plan?', 'What did the evidence change?'],
  agent: ['What did this agent do today?', 'What is it working on now?', 'What did it find?', 'What is blocking it?'],
  task: ['What exactly was produced?', 'Did it meet its acceptance criteria?', 'What happens next after this?', 'What did it search for?'],
}

export function AskTab({ data, st, focus, time, preset }: { data: GraphState; st: Map<string, Status>; focus: Focus; time: number | null; preset?: string }) {
  const [q, setQ] = useState(preset ?? '')
  const [out, setOut] = useState<{ q: string; text: string; via?: AskResult['via']; busy: boolean } | null>(null)
  const ctl = useRef<AbortController | null>(null)
  const pending = useStore(s => s.pendingAsk)
  const run = async (question: string) => {
    if (!question.trim()) return
    ctl.current?.abort()
    const c = new AbortController()
    ctl.current = c
    sfx.click()
    setOut({ q: question, text: '', busy: true })
    try {
      const r = await ask(question, data, st, focus, time, text => setOut({ q: question, text, busy: true }), c.signal)
      setOut({ q: question, text: r.text, via: r.via, busy: false })
      if (r.dive && r.via === 'files') {
        const n = data.nodes.find(x => x.id === r.dive)
        if (n) useStore.getState().select({ kind: 'task', id: n.id }, 'ask')
        else if (data.agents[r.dive!]) useStore.getState().select({ kind: 'agent', id: r.dive! }, 'ask')
      }
    } catch (e) {
      if ((e as { code?: string }).code !== 'cancelled') setOut({ q: question, text: 'Something went wrong while answering. Try again.', busy: false })
    }
    setQ('')
  }
  useEffect(() => {
    if (pending) { useStore.getState().set({ pendingAsk: null }); run(pending) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])
  useEffect(() => () => ctl.current?.abort(), [])
  return (
    <>
      <M variants={rise}><p className="note">Ask anything about {focus.kind === 'world' ? 'the company' : focus.kind === 'brain' ? 'the plan' : 'this'}. Answers use only the project record shown here: the plan, outputs and timestamped activity.</p></M>
      <M variants={rise}>
        <form className="askform" onSubmit={e => { e.preventDefault(); run(q) }}>
          <label htmlFor="ask-q" className="sr-only">Your question</label>
          <input id="ask-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Type a question…" autoComplete="off" />
          <button type="submit" className="cta">Ask</button>
        </form>
        <div className="chips">{SUGGEST[focus.kind].map(s => <button key={s} onClick={() => run(s)}>{s}</button>)}</div>
      </M>
      {out && (
        <M variants={rise} className="answer" aria-live="polite">
          <p className="aq">{out.q}</p>
          <p className="at">{out.text || 'Thinking…'}</p>
          {!out.busy && out.via && <p className="muted small">{out.via === 'claude' ? 'Answered by Claude from the project record.' : 'Answered from the project files (Claude is not available in this view).'}</p>}
          {out.busy && <button className="link" onClick={() => ctl.current?.abort()}>Stop</button>}
        </M>
      )}
    </>
  )
}

function Record({ data, st, time, id, rid }: { data: GraphState; st: Map<string, Status>; time: number | null; id: string; rid: string }) {
  const a = atomsOf(data, id, st, time).find(x => x.id === rid)
  if (!a) return null
  return (
    <motion.div className="record" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <p className="kicker">Record · {a.level4Type}{a.timestamp ? ` · ${clock(a.timestamp)} UTC` : ''}</p>
      <p className="rec-v">{a.meta.label}</p>
      {a.meta.detail && <p className="rec-d">{a.meta.detail}</p>}
      {a.meta.source && <code>{a.meta.source}</code>}
      <button className="link" onClick={() => useStore.getState().set({ record: null })}>Close record</button>
    </motion.div>
  )
}
