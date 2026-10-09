/**
 * The Jarvis console: greeting and briefing, Currently, Needs you, Next, the owner's reminders and requests,
 * the agents' scorecards and the conversation. Lazy-loaded; styled like the inspector so it reads as part of the city.
 */
import { peProjectState, type PEState } from '@jarvis/adapters/perspective-engine'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { sfx } from '../audio/sound'
import { ago, clock, stalledNow, statusesAt, workingNow } from '../data/model'
import type { GraphState } from '../data/types'
import { focusKey, useStore, type Focus } from '../store'
import { forViewer } from './answers'
import { composeBrief } from './brief'
import { cancelRequest, dismissReminder, say, setQuietHours } from './client'
import { browserTzOffset, quietLabel } from './prefs'
import { sortReminders, whenLabel } from './reminders'
import { requestLabel, requestLine, sortRequests, STATUS_WORD } from './requests'
import { clipClaim, kindWord, openFindings, readAudit, topFindings } from './scorecards'
import { useJarvis } from './state'
import type { ConsoleTab, ThreadMsg } from './types'
import './console.css'

const tz = browserTzOffset()

function useClock(every: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), every); return () => clearInterval(id) }, [every])
  return now
}

const go = (f: Focus) => () => {
  sfx.dive()
  useStore.getState().select(f)
  // On a phone the console covers the city: close it so the flight is visible.
  if (matchMedia('(max-width: 900px)').matches) useStore.getState().set({ jarvisOpen: false })
}

const TABS: Array<{ key: ConsoleTab; label: string }> = [
  { key: 'brief', label: 'Brief' },
  { key: 'talk', label: 'Talk' },
  { key: 'agents', label: 'Agents' },
]

export default function Console() {
  const data = useStore(s => s.data)
  const tab = useJarvis(s => s.tab)
  const status = useJarvis(s => s.status)
  const viewer = useJarvis(s => s.viewer)
  const thread = useJarvis(s => s.thread)
  const box = useRef<HTMLElement>(null)
  useEffect(() => { if (box.current) box.current.scrollTop = 0 }, [tab])
  // Opened from the presence: keyboard focus moves into the console; closed: it goes back to the presence.
  // Opened by typing in the bar: focus stays in the bar.
  useLayoutEffect(() => {
    if (document.activeElement?.classList.contains('jpresence')) document.getElementById(`jtab-${useJarvis.getState().tab}`)?.focus()
    const el = box.current
    return () => {
      if (el && el.contains(document.activeElement)) requestAnimationFrame(() => document.querySelector<HTMLElement>('.jpresence')?.focus())
    }
  }, [])
  const pick = (k: ConsoleTab) => { sfx.click(); useJarvis.getState().set({ tab: k }) }
  const onKeys = (e: KeyboardEvent<HTMLElement>) => {
    const i = TABS.findIndex(t => t.key === tab)
    const j = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : -1
    if (j < 0) return
    e.preventDefault(); e.stopPropagation()
    pick(TABS[j].key)
    document.getElementById(`jtab-${TABS[j].key}`)?.focus()
  }
  const unread = thread.filter(m => m.who === 'jarvis' && m.kind && m.kind !== 'briefing').length
  return (
    <aside ref={box} id="jarvis-console" className="drawer jconsole scrolls" aria-label="Jarvis console">
      <header className="dh jc-head">
        <p className="kicker">Jarvis · {status === 'ready' ? 'Online' : status === 'failed' ? 'Offline' : 'Starting'} · {viewer === 'owner' ? 'Owner mode' : 'Visitor mode'}</p>
        <h2>Jarvis</h2>
        <button className="jc-close" onClick={() => useStore.getState().set({ jarvisOpen: false })} aria-label="Close the Jarvis console">×</button>
      </header>
      <nav className="tabs" role="tablist" aria-label="Jarvis views" onKeyDown={onKeys}>
        {TABS.map(t => (
          <button key={t.key} id={`jtab-${t.key}`} role="tab" aria-selected={tab === t.key} aria-controls="jarvis-panel" tabIndex={tab === t.key ? 0 : -1}
            className={tab === t.key ? 'on' : ''} onClick={() => pick(t.key)}>
            {t.label}{t.key === 'talk' && tab !== 'talk' && unread > 0 ? <span className="jc-count">{unread}</span> : null}
          </button>
        ))}
      </nav>
      <div role="tabpanel" id="jarvis-panel" aria-labelledby={`jtab-${tab}`} className="dpanel">
        {!data ? <p className="muted">Loading the project record…</p>
          : tab === 'brief' ? <BriefTab data={data} />
          : tab === 'agents' ? <AgentsTab data={data} />
          : <TalkTab />}
      </div>
    </aside>
  )
}

// ---------- Brief ----------

function BriefTab({ data }: { data: GraphState }) {
  const viewer = useJarvis(s => s.viewer)
  const sinceIso = useJarvis(s => s.sinceIso)
  const requests = useJarvis(s => s.requests)
  const reminders = useJarvis(s => s.reminders)
  const decisions = useJarvis(s => s.decisions)
  const privateData = useJarvis(s => s.privateData)
  const privateNote = useJarvis(s => s.privateNote)
  const prefs = useJarvis(s => s.prefs)
  const speak = useJarvis(s => s.speak)
  const caps = useJarvis(s => s.caps)
  const now = useClock(30_000)
  const owner = viewer === 'owner'
  const st = useMemo(() => statusesAt(data, null), [data])
  const ps = useMemo(() => peProjectState(data as unknown as PEState, new Date(now)), [data, now])
  const brief = useMemo(() => composeBrief(data, viewer, sinceIso, new Date(now), tz), [data, viewer, sinceIso, now])
  const working = workingNow(data, st, now)
  const stalled = stalledNow(data, st, now)
  const name = (k: string) => data.agents[k]?.name ?? k
  const openReq = sortRequests(requests)
  const waitingReq = requests.filter(r => r.status === 'waiting_for_user')
  const dueNow = reminders.filter(r => (r.status === 'pending' || r.status === 'scheduled') && Date.parse(r.dueAt) <= now)
  const running = requests.filter(r => r.status === 'running')
  return (
    <>
      <p className="lede jc-greet">{brief.greeting} {brief.since.sentence}</p>
      <p className="note">{brief.lines[0]}</p>
      {owner && privateNote && <p className="note jc-warn">{privateNote}</p>}

      <h3>Currently</h3>
      {working.length || running.length ? (
        <ul className="tasks">
          {working.map(w => (
            <li key={w.node.id}><button onClick={go({ kind: 'task', id: w.node.id })}><code>{w.node.id}</code><span>{name(w.agent)} · {w.node.title}</span><span className="pill st-running"><i />{ago(w.last, now)}</span></button></li>
          ))}
          {running.map(r => <li key={r.id} className="jc-line"><span className="pill st-running"><i />Running</span><span>Your request: {requestLabel(r)}</span></li>)}
        </ul>
      ) : <p className="note">Nobody is working right now: agents only work while a session runs them.{stalled.length ? ` Marked running but silent: ${stalled.map(s => s.node.id).join(', ')}.` : ''}</p>}

      <h3>{owner ? 'Needs you' : 'Waiting on the founder'} <span className="jc-n">{ps.waiting_for_user.length + (owner ? waitingReq.length + dueNow.length : 0)}</span></h3>
      {ps.waiting_for_user.length + waitingReq.length + dueNow.length === 0 ? <p className="note">Nothing right now.</p> : (
        <ul className="jc-gates">
          {owner && dueNow.map(r => <li key={r.id} className="due"><b>Reminder due</b><span>{r.text}</span></li>)}
          {owner && waitingReq.map(r => <li key={r.id}><b>Your request</b><span>{requestLabel(r)}</span><small>{requestLine(r)}</small></li>)}
          {ps.waiting_for_user.map(g => (
            <li key={g.id}>
              <button onClick={go({ kind: 'task', id: g.id })}><b><code>{g.id}</code> {g.title}</b>{owner && <small>What to do: {g.detail ?? 'your decision'}</small>}</button>
            </li>
          ))}
        </ul>
      )}

      <h3>Next</h3>
      {ps.next.length ? (
        <ul className="tasks">{ps.next.slice(0, 5).map(n => <li key={n.id}><button onClick={go({ kind: 'task', id: n.id })}><code>{n.id}</code><span>{n.title}</span><small className="jc-detail">{forViewer(n.detail, viewer)}</small></button></li>)}</ul>
      ) : <p className="note">Nothing is ready to start: the remaining work waits on running tasks or on the founder.</p>}

      {owner && (
        <>
          <h3>Reminders</h3>
          {!privateData ? <p className="note">Not available in this view.</p> : !reminders.length ? <p className="note">None. Say “remind me tomorrow at 9 to review batch one”.</p> : (
            <ul className="jc-list">
              {sortReminders(reminders).slice(0, 8).map(r => (
                <li key={r.id} className={r.status === 'dismissed' || r.status === 'delivered' ? 'past' : ''}>
                  <span className="jc-when">{whenLabel(r.dueAt, new Date(now), tz)}</span>
                  <span className="jc-text">{r.text}</span>
                  <span className={`jc-st st-${r.status}`}>{r.status === 'pending' || r.status === 'scheduled' ? 'Sent at the first hourly check after it is due' : r.status === 'delivered' ? 'Delivered' : 'Dismissed'}</span>
                  {(r.status === 'pending' || r.status === 'scheduled') && <button className="linkish" onClick={() => dismissReminder(r.id)}>Dismiss</button>}
                </li>
              ))}
            </ul>
          )}

          <h3>Requests</h3>
          {!privateData ? <p className="note">Not available in this view.</p> : !openReq.length ? <p className="note">None. Ask for build work and say “yes, do it” to queue it for the orchestrator.</p> : (
            <ul className="jc-list">
              {openReq.slice(0, 8).map(r => (
                <li key={r.id} className={r.status === 'completed' || r.status === 'cancelled' ? 'past' : ''}>
                  <span className={`jc-badge rq-${r.status}`}>{STATUS_WORD[r.status]}</span>
                  <span className="jc-text">{requestLabel(r)}</span>
                  <small className="jc-sub">{requestLine(r)} · {ago(r.updatedAt ?? r.createdAt, now)}</small>
                  {r.status === 'queued' && <button className="linkish" onClick={() => cancelRequest(r.id)}>Cancel</button>}
                </li>
              ))}
            </ul>
          )}

          {decisions.length > 0 && (
            <>
              <h3>Your decisions</h3>
              <ul className="jc-list">{decisions.slice(0, 4).map(d => <li key={d.id}><span className={`jc-badge ${d.status === 'applied' ? 'rq-completed' : 'rq-queued'}`}>{d.status === 'applied' ? 'Applied' : 'Recorded'}</span><span className="jc-text">{d.text}</span></li>)}</ul>
            </>
          )}
        </>
      )}

      {owner && privateData && <QuietHoursEditor />}
      <p className="note small jc-foot">
        Voice: {speak ? 'replies are spoken' : 'muted'}{owner && prefs ? ` · quiet hours ${quietLabel(prefs.quietHours)} local` : ''}.
        {' '}{caps.sample ? 'Open questions are answered by Claude from the project record.' : 'Claude is not available in this view; answers come from the project files.'}
        {owner ? ' Reminders reach your phone and email at the first hourly check after they are due; build work runs on the orchestrator’s scheduled run, every six hours.' : ''}
      </p>
    </>
  )
}

/** Quiet hours: Jarvis starts nothing aloud in this window (replies to you are still spoken if the speaker is on). */
function QuietHoursEditor() {
  const prefs = useJarvis(s => s.prefs)
  const q = prefs?.quietHours ?? { enabled: true, start: '22:00', end: '07:00' }
  const [draft, setDraft] = useState(q)
  useEffect(() => setDraft(q), [q.enabled, q.start, q.end]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = draft.enabled !== q.enabled || draft.start !== q.start || draft.end !== q.end
  return (
    <form className="jc-quiet" onSubmit={e => { e.preventDefault(); setQuietHours(draft) }}>
      <label><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} /> Quiet hours</label>
      <input type="time" aria-label="Quiet from" value={draft.start} disabled={!draft.enabled} onChange={e => setDraft({ ...draft, start: e.target.value || draft.start })} />
      <span>to</span>
      <input type="time" aria-label="Quiet until" value={draft.end} disabled={!draft.enabled} onChange={e => setDraft({ ...draft, end: e.target.value || draft.end })} />
      {dirty && <button type="submit" className="ghost">Save</button>}
    </form>
  )
}

// ---------- Talk ----------

const CHIPS_OWNER = ['What needs me?', 'What changed since I last checked?', "What's next?", 'How are the agents doing?', 'Remind me tomorrow at 9 to review batch one']
const CHIPS_VISITOR = ['What is this?', 'Who is working right now?', 'How are the agents doing?', 'Any hallucinations?', "What's next?"]
const VIA: Record<string, string> = { claude: 'Claude, from the project record', rules: 'From the record', guide: 'From the project files (Claude unavailable)', action: 'Action, checked', system: 'Update' }

function TalkTab() {
  const thread = useJarvis(s => s.thread)
  const viewer = useJarvis(s => s.viewer)
  const focus = useStore(s => s.focus)
  const end = useRef<HTMLDivElement>(null)
  const last = thread[thread.length - 1]
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [thread.length, last?.text])
  const chips = viewer === 'owner' ? CHIPS_OWNER : CHIPS_VISITOR
  return (
    <>
      {!thread.length && <p className="note">Ask anything about the project, by typing below{useJarvis.getState().mic !== 'unsupported' && useJarvis.getState().mic !== 'unavailable' ? ' or with the mic' : ''}. Jarvis answers from the record and says when something isn't in it.</p>}
      <div className="jc-thread" role="log" aria-live="off" aria-label="Conversation with Jarvis">
        {thread.map(m => <Msg key={m.id} m={m} focusKey={focusKey(focus)} />)}
        <div ref={end} className="jc-end" />
      </div>
      <div className="chips">{chips.map(c => <button key={c} onClick={() => say(c)}>{c}</button>)}</div>
    </>
  )
}

function Msg({ m, focusKey: fk }: { m: ThreadMsg; focusKey: string }) {
  if (m.who === 'you') return <p className="jm you"><span>{m.text}</span></p>
  const dive = m.dive && focusKey(m.dive) !== fk ? m.dive : null
  return (
    <div className={`jm jarvis${m.kind ? ` k-${m.kind}` : ''}`} aria-busy={m.busy}>
      {(m.text || m.busy) && <p className="jm-text">{m.text || 'Thinking…'}</p>}
      {m.error === 'Stopped' ? <p className="muted small">{m.text ? 'Stopped. The answer above is incomplete.' : 'Stopped.'}</p>
        : m.error ? <p className="muted small">{m.error}</p>
        : !m.busy && m.via && <p className="jm-via">{VIA[m.via] ?? ''} · {clock(m.at).slice(0, 5)} UTC</p>}
      {dive && <button className="ghost fly" onClick={go(dive)}>Show me →</button>}
    </div>
  )
}

// ---------- Agents ----------

function AgentsTab({ data }: { data: GraphState }) {
  const view = useMemo(() => readAudit(data), [data])
  if (!view.cards.length) return <p className="note">No scorecards have been published yet.</p>
  const meet = view.cards.filter(c => c.meetsInstitutionalBar).length
  return (
    <>
      <p className="lede">Jarvis audits every agent as a second line: scores from the record plus independent re-checks of their claims. {meet} of {view.cards.length} meet the institutional bar.</p>
      {view.notice && <p className="note small">{view.notice}{view.computedAt ? ` Computed ${clock(view.computedAt).slice(0, 5)} UTC, ${view.computedAt.slice(0, 10)}.` : ''}</p>}
      <ul className="jc-cards">
        {view.cards.map(c => {
          const open = openFindings(c)
          const top = topFindings(c, 3).filter(f => f.status === 'open')
          const district = data.agents[c.agent]?.district
          return (
            <li key={c.agent}>
              <button className="jc-card-h" onClick={go({ kind: 'agent', id: c.agent })} aria-label={`${c.name}: ${Math.round(c.score)}, grade ${c.grade}. Open in the city.`}>
                <span className="jc-name">{c.name}{district && <small>{district}</small>}</span>
                <span className={`jc-grade g-${c.grade}`}>{c.grade}</span>
                <span className="jc-score">{Math.round(c.score)}</span>
                <span className="bar"><i style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }} /><b className="bar-mark" aria-hidden="true" title="The institutional bar: 80, with no open critical finding" /></span>
              </button>
              <p className="jc-bar">{c.meetsInstitutionalBar ? 'Meets the institutional bar' : 'Below the institutional bar'} · {open.length} open {open.length === 1 ? 'finding' : 'findings'}</p>
              {top.length > 0 && (
                <ul className="jc-findings">
                  {top.map(f => <li key={f.id} className={`sev-${f.severity}`}><b>{f.severity} · {kindWord(f.kind)}</b>{clipClaim(f.claim, 180)}</li>)}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
