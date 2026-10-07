import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import { useEffect, useState, type KeyboardEvent } from 'react'
import { sfx } from '../audio/sound'
import { ask } from '../data/ask'
import { BRIEF, reality } from '../data/brief'
import {
  agentFeed, agentStats, ago, atomsOf, clock, collapseFeed, CRITERION_NOTE, criterionState, feed, fmtK, fmtTime, isVerifier,
  lastSignal, LIVE_WINDOW_MIN, ms, runState, stalledNow, STATUS_LABEL, taskFeed, ventureStats, workingNow,
} from '../data/model'
import type { ActivityEvent, GraphState, Status } from '../data/types'
import { focusKey, useStore, type AskOut, type Focus, type Tab } from '../store'
import { BudgetDumbbell, RatioSpark } from './Charts'
import { Timeline } from './Timeline'
import './drawer.css'

export const spring = { type: 'spring', stiffness: 220, damping: 26 } as const
export const rise = { h: { opacity: 0.35, y: 10 }, s: { opacity: 1, y: 0, transition: spring } }
const M = motion.div
const go = (f: Focus, tab?: Tab) => () => { sfx.dive(); useStore.getState().select(f, tab) }
type St = Map<string, Status>
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
/** Output files and run figures exist only once a task is finished (or prepared for the founder) at the moment shown. */
const finished = (s: Status | undefined) => s === 'done' || s === 'awaiting_human'

export function Pill({ s, stalled }: { s: Status; stalled?: boolean }) {
  return stalled ? <span className="pill st-stalled"><i />Stalled</span> : <span className={`pill st-${s}`}><i />{STATUS_LABEL[s]}</span>
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' }, { key: 'activity', label: 'Activity' }, { key: 'output', label: 'Output' }, { key: 'ask', label: 'Ask' },
]

/** Liveness is judged against the clock, so in live mode re-render now and then even when no new data arrives. */
function useTick(on: boolean, every = 30_000) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => set(x => x + 1), every)
    return () => clearInterval(id)
  }, [on, every])
}

/** The right-hand drawer: whatever you selected, in plain language, with its exact activity and an Ask box. */
export function Drawer() {
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const time = useStore(s => s.time)
  const focus = useStore(s => s.focus)
  const tab = useStore(s => s.tab)
  const record = useStore(s => s.record)
  const askOut = useStore(s => s.askOut)
  useTick(time === null)
  if (!data) return <aside className="drawer"><p className="muted">Loading the live plan…</p></aside>
  const tabs = TABS.filter(t => t.key !== 'output' || focus.kind === 'agent' || focus.kind === 'task')
  const active = tabs.some(t => t.key === tab) ? tab : 'overview'
  const pick = (k: Tab) => { sfx.click(); useStore.getState().set({ tab: k }) }
  const onKeys = (e: KeyboardEvent<HTMLElement>) => {
    const i = tabs.findIndex(t => t.key === active)
    const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
    if (j < 0) return
    // Arrow keys and Home also steer the city globally; inside the tablist they only move between tabs.
    e.preventDefault(); e.stopPropagation()
    pick(tabs[j].key)
    document.getElementById(`dtab-${tabs[j].key}`)?.focus()
  }
  return (
    <MotionConfig reducedMotion="user">
      <aside className="drawer scrolls" aria-label="Inspector">
        <Header data={data} st={st} time={time} focus={focus} />
        <nav className="tabs" role="tablist" aria-label="Views" onKeyDown={onKeys}>
          {tabs.map(t => (
            <button key={t.key} id={`dtab-${t.key}`} role="tab" aria-selected={active === t.key} aria-controls="drawer-panel"
              tabIndex={active === t.key ? 0 : -1} className={active === t.key ? 'on' : ''} onClick={() => pick(t.key)}>{t.label}</button>
          ))}
        </nav>
        {record && focus.kind === 'task' && <Record data={data} st={st} time={time} id={focus.id} rid={record} />}
        <div role="tabpanel" id="drawer-panel" aria-labelledby={`dtab-${active}`} tabIndex={0} className="dpanel">
          <AnimatePresence initial={false}>
            <M key={focusKey(focus) + active} initial="h" animate="s" exit={{ opacity: 0, position: 'absolute', transition: { duration: 0.08 } }} variants={{ s: { transition: { staggerChildren: 0.045 } }, h: {} }}>
              {active === 'ask' ? <AskTab data={data} st={st} focus={focus} time={time} />
                : active === 'activity' ? <ActivityTab data={data} focus={focus} time={time} />
                : active === 'output' ? <OutputTab data={data} st={st} focus={focus} />
                : focus.kind === 'world' ? <WorldView data={data} st={st} time={time} />
                : focus.kind === 'brain' ? <BrainView data={data} st={st} time={time} />
                : focus.kind === 'agent' ? <AgentView data={data} st={st} id={focus.id} time={time} />
                : <TaskView data={data} st={st} id={focus.id} time={time} />}
            </M>
          </AnimatePresence>
        </div>
        {/* One persistent region outside the keyed panel: announces "Thinking…" once, then the whole answer, never each chunk. */}
        <p className="sr-only" role="status">{!askOut ? '' : askOut.busy ? 'Thinking…' : askOut.error === 'Stopped' ? `Stopped. ${askOut.text}` : askOut.error ?? `Answer: ${askOut.text}`}</p>
      </aside>
    </MotionConfig>
  )
}

function Header({ data, st, time, focus }: { data: GraphState; st: St; time: number | null; focus: Focus }) {
  const crumbs: { f: Focus; label: string }[] = [{ f: { kind: 'world' }, label: 'City' }]
  let title = 'Perspective Engine', kicker = 'The whole company'
  if (focus.kind === 'brain') { crumbs.push({ f: focus, label: 'Brain' }); title = 'The Brain'; kicker = `The plan and its orchestrator, ${data.agents.orchestrator?.name ?? 'Mayor'}` }
  if (focus.kind === 'agent') {
    const a = data.agents[focus.id]
    crumbs.push({ f: focus, label: a.district }); title = a.name; kicker = `${a.district} · ${a.role}`
  }
  if (focus.kind === 'task') {
    const n = data.nodes.find(x => x.id === focus.id)!
    const stalled = runState(data, st, time ?? Date.now()).get(n.id) === 'stalled'
    crumbs.push({ f: { kind: 'agent', id: n.agent }, label: data.agents[n.agent].district }, { f: focus, label: n.id })
    title = n.title; kicker = `${n.id} · ${data.agents[n.agent].name} · phase ${n.phase} · ${stalled ? 'Stalled' : STATUS_LABEL[st.get(n.id)!]}`
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

/** Who is really working at the moment shown: live tasks first, then tasks that say running but have gone silent. */
function Now({ data, st, time }: { data: GraphState; st: St; time: number | null }) {
  const at = time ?? Date.now()
  const working = workingNow(data, st, at)
  const stalled = stalledNow(data, st, at)
  const last = feed(data, time)[0]
  const name = (k: string) => data.agents[k]?.name ?? k
  const who = (e: ActivityEvent) => (isVerifier(e) ? 'the independent verifier' : name(e.agent))
  return (
    <div className={`now${working.length ? '' : ' idle'}`}>
      {working.length ? (
        <>
          <b>{plural(working.length, 'agent', 'agents')} working {time === null ? 'right now' : `at ${fmtTime(time)}`}</b>
          <ul>
            {working.map(({ agent, node }) => {
              const step = collapseFeed(taskFeed(data, node.id, time))[0]
              const checking = step && isVerifier(step)
              return (
                <li key={node.id}>
                  <button onClick={go({ kind: 'agent', id: agent }, 'activity')}>
                    <span className="who">{checking ? `Verifier, checking ${name(agent)}’s work` : name(agent)}</span>
                    <span>{node.id} · {node.title}</span>
                    {step && <small>{clock(step.t)} UTC ({ago(step.t, at)}) · {step.text}</small>}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <>
          <b>{time === null ? 'No agent is working right now.' : `No agent was working at ${fmtTime(time)}.`}</b>
          <span>{last ? `Last recorded step ${ago(last.t, at)} (${clock(last.t)} UTC): ${who(last)} on ${last.node}.` : 'Nothing recorded yet.'}</span>
        </>
      )}
      {stalled.length > 0 && (
        <ul className="stalled">
          {stalled.map(x => (
            <li key={x.node.id}>
              <button onClick={go({ kind: 'task', id: x.node.id })}>
                <span className="who">{name(x.agent)} · {x.node.id} · {x.node.title}</span>
                <span>{x.last ? `Stalled since ${fmtTime(x.last)}` : 'Stalled'}: marked running, but no session is working on it.</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** "Browser MVP: built, in verification (F04). Advisors: …" → one row per clause, so the status reads at a glance. */
function Reality({ text }: { text: string }) {
  const parts = text.split(/(?<=\.)\s+(?=[A-Z])/).filter(Boolean).map(p => /^([^:]{2,30}):\s*(.*)$/s.exec(p))
  if (parts.some(p => !p)) return <p className="goal-r">{text}</p>
  return <dl>{parts.map(p => <div key={p![1]}><dt>{p![1]}</dt><dd>{p![2].replace(/\.$/, '')}</dd></div>)}</dl>
}

function Goal({ data, st, time }: { data: GraphState; st: St; time: number | null }) {
  const m = /^([^:]{3,40}):\s*(.+)$/.exec(BRIEF.goal)
  return (
    <section className="goal" aria-label="End goal">
      <p className="goal-h">{m ? <><b>{m[1]}</b>{m[2][0].toUpperCase() + m[2].slice(1)}</> : BRIEF.goal}</p>
      <p className="goal-k">Where it really stands{time === null ? '' : ` at ${fmtTime(time)}`}</p>
      <Reality text={reality(data, st)} />
    </section>
  )
}

function WorldView({ data, st, time }: { data: GraphState; st: St; time: number | null }) {
  const at = time ?? Date.now()
  const v = ventureStats(data, st, time)
  const gates = data.nodes.filter(n => st.get(n.id) === 'awaiting_human')
  const mayor = data.agents.orchestrator?.name ?? 'Mayor'
  return (
    <>
      <M variants={rise}><p className="lede">{BRIEF.idea}</p></M>
      <M variants={rise}><Goal data={data} st={st} time={time} /></M>
      <M variants={rise}><Now data={data} st={st} time={time} /></M>
      <M variants={rise} className="stats">
        <div><b>{v.done}<small>/{v.total}</small></b><span>tasks built</span></div>
        <div><b>{v.running}</b><span>{time === null ? 'working now' : 'working then'}</span></div>
        <div><b>{v.waiting}</b><span>need the founder</span></div>
        <div><b>{v.steps}</b><span>steps logged</span></div>
      </M>
      <M variants={rise}>
        <h3>How to read the city</h3>
        <ul className="legend-list">
          <li><i className="lg brain" /><span><b>The brain</b> is the plan ({data.nodes.length} tasks) and {mayor}, the orchestrator who hands out work.</span></li>
          <li><i className="lg district" /><span><b>Each district</b> is one AI agent’s department. Its rim fills as tasks are built.</span></li>
          <li><i className="lg tower" /><span><b>Each tower</b> is one task. Height is its planned effort; lit floors mean built; amber means an agent is working on it now; violet means it needs the founder.</span></li>
          <li><i className="lg packet" /><span><b>Lights</b> travel when an agent starts (out from the brain) or finishes (back home).</span></li>
        </ul>
      </M>
      {gates.length > 0 && (
        <M variants={rise}>
          <h3>Needs the founder</h3>
          <ul className="tasks">{gates.map(n => <li key={n.id}><button onClick={go({ kind: 'task', id: n.id })}><code>{n.id}</code><span>{n.gate?.reason ?? n.title}</span></button></li>)}</ul>
        </M>
      )}
      <M variants={rise}>
        <h3>The agents</h3>
        <ul className="agents">
          {agentStats(data, st, at).map(a => (
            <li key={a.key}>
              <button onClick={go({ kind: 'agent', id: a.key })}>
                <span className="a-name">{a.name}<small>{a.district}</small></span>
                <span className="a-num">{a.done}/{a.tasks.length}</span>
                <span className="bar"><i style={{ width: `${(a.done / Math.max(a.tasks.length, 1)) * 100}%` }} /></span>
                <span className={`a-now${a.running ? ' working' : a.stalled ? ' stalled' : ''}`}>
                  {a.running ? `Working on ${a.running.id}: ${a.running.title}`
                    : a.stalled ? `${a.stalled.id} stalled: marked running, no session on it`
                    : a.waiting ? `${plural(a.waiting, 'task needs', 'tasks need')} the founder`
                    : a.next ? `Next: ${a.next.id} ${a.next.title}` : 'Idle until upstream work lands'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </M>
      <M variants={rise}>
        <details className="forecast">
          <summary>Forecast</summary>
          <p className="note">{BRIEF.model}</p>
        </details>
      </M>
    </>
  )
}

function BrainView({ data, st, time }: { data: GraphState; st: St; time: number | null }) {
  const phases = [0, 1, 2, 3].map(p => {
    const ns = data.nodes.filter(n => n.phase === p)
    return { p, total: ns.length, done: ns.filter(n => st.get(n.id) === 'done').length }
  })
  const ready = data.nodes.filter(n => st.get(n.id) === 'ready')
  const doneAt = new Map(data.ledger.filter(e => e.event === 'done').map(e => [e.node, ms(e.t)]))
  const rows = data.nodes.filter(n => n.run && doneAt.has(n.id) && (time === null || doneAt.get(n.id)! <= time))
    .sort((a, b) => doneAt.get(a.id)! - doneAt.get(b.id)!).map(n => ({ id: n.id, title: n.title, budget: n.budget_k, spent: Math.round(n.run!.used_k) }))
  const unmeasured = agentStats(data, st, time ?? Date.now()).reduce((s, a) => s + a.unmeasured, 0)
  const NAMES = ['Phase 0 · foundation', 'Phase 1 · validation', 'Phase 2 · MVP and study', 'Phase 3 · pilots']
  const mayor = data.agents.orchestrator?.name ?? 'Mayor'
  return (
    <>
      <M variants={rise}><p className="lede">The brain holds the plan: {data.nodes.length} tasks in a dependency graph. {mayor} reads it, starts at most three agents at a time on tasks whose inputs are ready, has an independent verifier check each result against its acceptance criteria, and records every change in the ledger.</p></M>
      <M variants={rise}><Goal data={data} st={st} time={time} /></M>
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
        <ul className="tasks">{ready.length ? ready.map(n => <li key={n.id}><button onClick={go({ kind: 'task', id: n.id })}><code>{n.id}</code><span>{n.title}</span><Pill s="ready" /></button></li>) : <li className="muted">Nothing is ready: remaining work waits on running tasks or on the founder.</li>}</ul>
      </M>
      <M variants={rise}>
        <h3>Planned effort vs actual, per finished task</h3>
        <BudgetDumbbell rows={rows} />
        <p className="note">Token use is measured on finished tasks only{unmeasured ? `; ${plural(unmeasured, 'task', 'tasks')} worked on so far ${unmeasured === 1 ? 'is' : 'are'} not measured yet (running, waiting on the founder, or failed rounds), so the true total is higher` : ''}. {BRIEF.lesson}</p>
      </M>
      <M variants={rise}><h3>Evidence that shaped the plan</h3>
        <ul className="evidence">{BRIEF.evidence.slice(0, 2).map(e => <li key={e.source}>{e.text} <a href={e.source} target="_blank" rel="noreferrer">Source</a></li>)}
          <li>{BRIEF.claim.text} <a href={BRIEF.claim.source} target="_blank" rel="noreferrer">Source</a></li></ul>
      </M>
    </>
  )
}

function AgentView({ data, st, id, time }: { data: GraphState; st: St; id: string; time: number | null }) {
  const at = time ?? Date.now()
  const a = agentStats(data, st, at).find(x => x.key === id)!
  const rs = runState(data, st, at)
  const ev = collapseFeed(agentFeed(data, id, time))
  const own = ev.find(e => !isVerifier(e) && e.src !== 'ledger')
  const stalledAt = a.stalled ? lastSignal(data, a.stalled.id, at) : null
  const stalledLine = a.stalled && `${a.stalled.id} ${stalledAt ? `stalled since ${fmtTime(stalledAt)}` : 'stalled'}: marked running, but no session is working on it.`
  return (
    <>
      <M variants={rise}>
        {a.running
          ? <div className="now"><b>Working {time === null ? 'right now' : `at ${fmtTime(time)}`} on {a.running.id}</b><span>{a.running.title}</span>
              {own && <small>Latest step {clock(own.t)} UTC ({ago(own.t, at)}): {own.text}</small>}
              {stalledLine && <small>{stalledLine}</small>}</div>
          : a.stalled
            ? <div className="now stalled"><b>{stalledAt ? `Stalled since ${fmtTime(stalledAt)}` : 'Stalled'}: no session running</b>
                <span>{a.stalled.id} · {a.stalled.title} is marked running, but nothing has been recorded for it in the last {LIVE_WINDOW_MIN} minutes.</span>
                {own && <small>Own last step {clock(own.t)} UTC ({ago(own.t, at)}): {own.text}</small>}</div>
            : <div className="now idle"><b>{a.waiting ? `Not working; ${plural(a.waiting, 'task needs', 'tasks need')} the founder` : `Not working ${time === null ? 'right now' : `at ${fmtTime(time)}`}`}</b>
                <span>{own ? `Last step ${clock(own.t)} UTC (${ago(own.t, at)}): ${own.text}` : 'No recorded steps yet.'}</span></div>}
      </M>
      <M variants={rise} className="stats">
        <div><b>{a.done}<small>/{a.tasks.length}</small></b><span>built</span></div>
        <div><b>{agentFeed(data, id, time).length}</b><span>steps logged</span></div>
        <div><b>{a.used ? fmtK(a.used) : '—'}</b><span>tokens, finished tasks</span></div>
        <div><b>{a.toolCalls}</b><span>tool calls</span></div>
      </M>
      {a.unmeasured > 0 && <M variants={rise}><p className="note small unmeasured">Tokens are measured on finished tasks only. {plural(a.unmeasured, 'task', 'tasks')} {a.name} worked on {a.unmeasured === 1 ? 'is' : 'are'} not measured yet, so real use is higher.</p></M>}
      <M variants={rise}>
        <h3>Latest steps <button className="link" onClick={() => useStore.getState().set({ tab: 'activity' })}>Full timeline</button></h3>
        <Timeline events={ev.slice(0, 8)} showTask />
      </M>
      <M variants={rise}>
        <h3>Its towers</h3>
        <ul className="tasks">{a.tasks.map(n => <li key={n.id}><button onClick={go({ kind: 'task', id: n.id })}><code>{n.id}</code><span>{n.title}</span><Pill s={st.get(n.id)!} stalled={rs.get(n.id) === 'stalled'} /></button></li>)}</ul>
      </M>
      <M variants={rise}><h3>Effort vs plan, finished tasks</h3><RatioSpark points={a.efficiency} /></M>
      <M variants={rise}>
        <h3>Works with</h3>
        <div className="collab"><span>Reads from</span>{[...a.inbound].map(k => <button key={k} onClick={go({ kind: 'agent', id: k })}>{data.agents[k].name}</button>)}{!a.inbound.size && <em>no one yet</em>}</div>
        <div className="collab"><span>Feeds</span>{[...a.outbound].map(k => <button key={k} onClick={go({ kind: 'agent', id: k })}>{data.agents[k].name}</button>)}{!a.outbound.size && <em>no one yet</em>}</div>
      </M>
    </>
  )
}

const C_TAG = { met: '✓ Met', prepared: 'Prepared · awaits founder', open: 'Not yet checked' } as const

function TaskView({ data, st, id, time }: { data: GraphState; st: St; id: string; time: number | null }) {
  const at = time ?? Date.now()
  const n = data.nodes.find(x => x.id === id)!
  const s = st.get(id)!
  const shown = finished(s)
  const ex = shown ? n.outputs.map(o => data.excerpts[o]).find(Boolean) : null
  const cs = criterionState(s)
  const raw = taskFeed(data, id, time)
  const ev = collapseFeed(raw)
  const rs = runState(data, st, at)
  const live = rs.get(id)
  const lastT = live === 'stalled' ? lastSignal(data, id, at) : null
  const run = shown ? n.run : undefined
  const gate = !n.gate ? null : s === 'done' ? 'cleared' : s === 'awaiting_human' ? 'now' : 'later'
  return (
    <>
      <M variants={rise}><Pill s={s} stalled={live === 'stalled'} /></M>
      {live === 'working' && (
        <M variants={rise}><div className="now"><b>Being worked on {time === null ? 'right now' : `at ${fmtTime(time)}`}</b>{ev[0] && <small>Latest step {clock(ev[0].t)} UTC ({ago(ev[0].t, at)}): {ev[0].text}</small>}</div></M>
      )}
      {live === 'stalled' && (
        <M variants={rise}><div className="now stalled"><b>{lastT ? `Stalled since ${fmtTime(lastT)}` : 'Stalled'}: no session running</b><span>Marked running, but nothing has been recorded for it in the last {LIVE_WINDOW_MIN} minutes.</span></div></M>
      )}
      {ex && <M variants={rise}><blockquote>{ex}</blockquote></M>}
      <M variants={rise} className="stats">
        <div><b>{n.budget_k}k</b><span>tokens planned</span></div>
        <div><b>{run ? fmtK(run.used_k) : '—'}</b><span>{run ? `used${run.duration_s ? ` in ${(run.duration_s / 60).toFixed(1)}m` : ''}` : 'not yet measured'}</span></div>
        <div><b>{raw.filter(e => e.src === 'transcript').length}</b><span>tool calls</span></div>
        <div><b>{raw.length}</b><span>steps logged</span></div>
      </M>
      {n.gate && gate && (
        <M variants={rise} className={`gate-note ${gate}`}>
          <b>{gate === 'cleared' ? 'Founder step done' : gate === 'now' ? 'Needs the founder' : 'Will need the founder'}</b>
          <span>{n.gate.reason}</span>
        </M>
      )}
      <M variants={rise}>
        <h3>Done means</h3>
        <ul className="checks">{n.accept.map(a => <li key={a} className={`c-${cs}`}>{a}<span className="c-tag">{C_TAG[cs]}</span></li>)}</ul>
        <p className="note small">{CRITERION_NOTE[cs]}.</p>
      </M>
      <M variants={rise}>
        <h3>Needs work from</h3>
        <ul className="tasks">{n.deps.length ? n.deps.map(d => { const dn = data.nodes.find(x => x.id === d)!; return <li key={d}><button onClick={go({ kind: 'task', id: d })}><code>{d}</code><span>{dn.title}</span><Pill s={st.get(d)!} stalled={rs.get(d) === 'stalled'} /></button></li> }) : <li className="muted">Nothing: this task starts from scratch.</li>}</ul>
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
      <M variants={rise}><p className="note">Every row is a recorded step with its UTC time: searches, files read and written, checks, and hand-offs. They come from the agents’ own tool calls, their live logs, and the task ledger. Rows tagged Verifier were logged by the independent verifier, not by the agent.</p></M>
      <M variants={rise}><Timeline events={events} showAgent={focus.kind === 'world' || focus.kind === 'brain'} showTask={focus.kind !== 'task'} empty="No recorded steps for this yet." /></M>
    </>
  )
}

function OutputTab({ data, st, focus }: { data: GraphState; st: St; focus: Focus }) {
  const nodes = focus.kind === 'agent' ? data.nodes.filter(n => n.agent === focus.id) : data.nodes.filter(n => focus.kind === 'task' && n.id === focus.id)
  return (
    <>
      <M variants={rise}><p className="note">What the work produced: each file in the repository, with its opening summary. Files appear once their task is finished or prepared for the founder.</p></M>
      {nodes.map(n => {
        const s = st.get(n.id)!
        return (
          <M variants={rise} key={n.id}>
            <h3>{n.id} · {n.title} <Pill s={s} /></h3>
            <ul className="outputs">
              {n.outputs.map(o => (
                <li key={o}><code>{o.replace('perspective-engine/', '')}</code>
                  {finished(s) && data.excerpts[o] ? <p>{data.excerpts[o]}</p>
                    : <p className="muted">{finished(s) ? 'Code or data file (no prose summary).' : s === 'running' ? 'Being worked on: shown once the task is finished.' : 'Not written yet.'}</p>}
                </li>
              ))}
            </ul>
          </M>
        )
      })}
    </>
  )
}

const SUGGEST: Record<Focus['kind'], string[]> = {
  world: ['Who is working right now?', 'What changed in the last hour?', 'What needs the founder?', 'How close are we to the end goal?'],
  brain: ['What can start next?', 'Why are tasks over their token plan?', 'What did the evidence change?'],
  agent: ['What did this agent do today?', 'What is it working on now?', 'What did it find?', 'What is blocking it?'],
  task: ['What exactly was produced?', 'Did it meet its acceptance criteria?', 'What happens next after this?', 'What did it search for?'],
}

/**
 * One Ask run at a time, shared by every AskTab instance: the drawer remounts the tab on every focus change,
 * and the answer (in the store) and its run must outlive that. `gen` lets a newer question silence an older run.
 */
const runs = { gen: 0, ctl: null as AbortController | null }
const putAsk = (o: AskOut) => useStore.getState().set({ askOut: o })
const patchAsk = (p: Partial<AskOut>) => { const o = useStore.getState().askOut; if (o) putAsk({ ...o, ...p }) }

function stopAsk() {
  runs.ctl?.abort()
  runs.ctl = null
  if (useStore.getState().askOut?.busy) patchAsk({ busy: false, error: 'Stopped' })
}

async function startAsk(question: string, data: GraphState, st: St, focus: Focus, time: number | null) {
  const gen = ++runs.gen
  runs.ctl?.abort()
  const c = new AbortController()
  runs.ctl = c
  const mine = () => runs.gen === gen && !c.signal.aborted
  putAsk({ q: question, text: '', via: null, busy: true })
  try {
    const r = await ask(question, data, st, focus, time, text => { if (mine()) patchAsk({ text }) }, c.signal)
    if (mine()) putAsk({ q: question, text: r.text, via: r.via, busy: false, dive: r.dive })
  } catch (e) {
    if (runs.gen !== gen) return
    const stopped = c.signal.aborted || (e as { code?: string }).code === 'cancelled'
    patchAsk({ busy: false, error: stopped ? 'Stopped' : 'Something went wrong while answering. Try again.' })
  } finally {
    if (runs.gen === gen) runs.ctl = null
  }
}

/** Where a "Fly there" button goes, in words; null if the target is not in the record. */
function diveLabel(data: GraphState, f: Focus): string | null {
  if (f.kind === 'world') return 'the whole city'
  if (f.kind === 'brain') return 'the Brain'
  if (f.kind === 'agent') return Object.hasOwn(data.agents, f.id) ? `${data.agents[f.id].name}’s ${data.agents[f.id].district}` : null
  const n = data.nodes.find(x => x.id === f.id)
  return n ? `${n.id} · ${n.title}` : null
}

export function AskTab({ data, st, focus, time, preset }: { data: GraphState; st: St; focus: Focus; time: number | null; preset?: string }) {
  const [q, setQ] = useState(preset ?? '')
  const out = useStore(s => s.askOut)
  const pending = useStore(s => s.pendingAsk)
  const submit = (question: string) => {
    if (!question.trim()) return
    sfx.click()
    setQ('')
    void startAsk(question, data, st, focus, time)
  }
  useEffect(() => {
    if (pending) { useStore.getState().set({ pendingAsk: null }); submit(pending) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])
  const dive = out && !out.busy && out.dive && focusKey(out.dive) !== focusKey(focus) ? out.dive : null
  const where = dive && diveLabel(data, dive)
  return (
    <>
      <M variants={rise}><p className="note">Ask anything about {focus.kind === 'world' ? 'the company' : focus.kind === 'brain' ? 'the plan' : 'this'}. Answers use only the project record shown here: the plan, outputs and timestamped activity.</p></M>
      <M variants={rise}>
        <form className="askform" onSubmit={e => { e.preventDefault(); submit(q) }}>
          <label htmlFor="ask-q" className="sr-only">Your question</label>
          <input id="ask-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Type a question…" autoComplete="off" />
          <button type="submit" className="cta">Ask</button>
        </form>
        <div className="chips">{SUGGEST[focus.kind].map(s => <button key={s} onClick={() => submit(s)}>{s}</button>)}</div>
      </M>
      {out && (
        <M variants={rise} className="answer" aria-busy={out.busy}>
          <p className="aq">{out.q}</p>
          {(out.text || out.busy) && <p className="at">{out.text || 'Thinking…'}</p>}
          {out.error === 'Stopped' ? <p className="muted small">{out.text ? 'Stopped. The answer above is incomplete.' : 'Stopped before an answer arrived.'}</p>
            : out.error ? <p className="muted small">{out.error}</p>
            : !out.busy && out.via && <p className="muted small">{out.via === 'claude' ? 'Answered by Claude from the project record.' : 'Answered from the project files (Claude is not available in this view).'}</p>}
          {dive && where && <button className="ghost fly" onClick={go(dive)}>Fly there → {where}</button>}
          {out.busy && <button className="link" onClick={stopAsk}>Stop</button>}
        </M>
      )}
    </>
  )
}

function Record({ data, st, time, id, rid }: { data: GraphState; st: St; time: number | null; id: string; rid: string }) {
  const a = atomsOf(data, id, st, time).find(x => x.id === rid)
  if (!a) return null
  return (
    <motion.div className="record" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <p className="kicker">Record · {a.level4Type}{a.status === 'prepared' ? ' · prepared, awaits founder' : ''}{a.timestamp ? ` · ${clock(a.timestamp)} UTC` : ''}</p>
      <p className="rec-v">{a.meta.label}</p>
      {a.meta.detail && <p className="rec-d">{a.meta.detail}</p>}
      {a.meta.source && <code>{a.meta.source}</code>}
      <button className="link" onClick={() => useStore.getState().set({ record: null })}>Close record</button>
    </motion.div>
  )
}
