import { useMemo, useState } from 'react'
import { ago, clock, collapseFeed, isVerifier, KIND_LABEL } from '../data/model'
import type { ActivityEvent } from '../data/types'
import { useStore } from '../store'

const GROUPS: { key: string; label: string; kinds: ActivityEvent['kind'][] }[] = [
  { key: 'all', label: 'All', kinds: [] },
  { key: 'research', label: 'Research', kinds: ['search', 'fetch'] },
  { key: 'files', label: 'Files', kinds: ['read', 'write', 'edit'] },
  { key: 'checks', label: 'Checks', kinds: ['check', 'run'] },
  { key: 'milestones', label: 'Milestones', kinds: ['plan', 'handoff', 'blocked', 'note'] },
]

const SRC_LABEL: Record<ActivityEvent['src'], string> = {
  transcript: 'from the agent’s tool calls',
  self: 'logged by the agent while working',
  ledger: 'graph state change',
}
const BY_VERIFIER = 'logged by the independent verifier'
const short = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s)

/** Exactly what happened, newest first, with UTC times. Every row is a real recorded event. */
export function Timeline({ events, showAgent, showTask, empty }: { events: ActivityEvent[]; showAgent?: boolean; showTask?: boolean; empty?: string }) {
  const [group, setGroup] = useState('all')
  const data = useStore(s => s.data)
  const time = useStore(s => s.time)
  const all = useMemo(() => collapseFeed(events), [events])
  const titles = useMemo(() => new Map(data?.nodes.map(n => [n.id, n.title]) ?? []), [data])
  const kinds = GROUPS.find(g => g.key === group)!.kinds
  const picked = useMemo(() => (kinds.length ? all.filter(e => kinds.includes(e.kind)) : all), [all, kinds])
  const rows = picked.slice(0, 300)
  const now = time ?? Date.now()
  let lastDay = '', lastNode = ''
  return (
    <div className="timeline">
      <div className="tl-filters" role="group" aria-label="Filter activity">
        {GROUPS.map(g => (
          <button key={g.key} className={group === g.key ? 'on' : ''} aria-pressed={group === g.key} onClick={() => setGroup(g.key)}>
            {g.label}
            <small>{g.kinds.length ? all.filter(e => g.kinds.includes(e.kind)).length : all.length}</small>
          </button>
        ))}
      </div>
      {!rows.length && <p className="muted">{empty ?? 'Nothing recorded yet.'}</p>}
      <ol className="tl">
        {rows.map((e, i) => {
          const day = e.t.slice(0, 10)
          const head = day !== lastDay
          // The task's name goes on the first row of each run of rows about the same task.
          const first = head || e.node !== lastNode
          lastDay = day
          lastNode = e.node
          const v = isVerifier(e)
          const title = showTask && first ? titles.get(e.node) : undefined
          const toTask = v || (showTask && !showAgent)
          return (
            <li key={`${e.t}${i}`} className={`k-${e.kind} s-${e.src}${v ? ' is-verifier' : ''}`}>
              {head && <div className="tl-day">{new Date(e.t).toUTCString().slice(0, 16)}</div>}
              <time dateTime={e.t} title={`${ago(e.t, now)} · ${v ? BY_VERIFIER : SRC_LABEL[e.src]}`}>{clock(e.t)}</time>
              <span className="tl-kind">{KIND_LABEL[e.kind]}</span>
              <span className="tl-text">
                {v && <span className="tl-actor" title={BY_VERIFIER}>Verifier</span>}
                {(showAgent || showTask) && (
                  <button className="tl-who" onClick={() => useStore.getState().select(toTask ? { kind: 'task', id: e.node } : { kind: 'agent', id: e.agent }, 'activity')}>
                    {showAgent && !v ? `${data?.agents[e.agent]?.name ?? e.agent} · ` : ''}{e.node}
                    {title && <span className="tl-title"> · {short(title)}</span>}
                  </button>
                )}
                {v ? e.text.replace(/^verifier\b\s*:?\s*/i, '') : e.text}
              </span>
            </li>
          )
        })}
      </ol>
      {picked.length > 300 && <p className="muted small">Showing the latest 300 of {picked.length} rows.</p>}
      {events.length > all.length && <p className="muted small">{events.length - all.length} failed attempt{events.length - all.length > 1 ? 's are' : ' is'} shown merged with the step it belongs to.</p>}
    </div>
  )
}
