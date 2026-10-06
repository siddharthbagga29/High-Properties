import { useMemo, useState } from 'react'
import { ago, clock, KIND_LABEL } from '../data/model'
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

/** Exactly what happened, newest first, with UTC times. Every row is a real recorded event. */
export function Timeline({ events, showAgent, showTask, empty }: { events: ActivityEvent[]; showAgent?: boolean; showTask?: boolean; empty?: string }) {
  const [group, setGroup] = useState('all')
  const data = useStore(s => s.data)
  const kinds = GROUPS.find(g => g.key === group)!.kinds
  const rows = useMemo(() => (kinds.length ? events.filter(e => kinds.includes(e.kind)) : events).slice(0, 300), [events, kinds])
  let lastDay = ''
  return (
    <div className="timeline">
      <div className="tl-filters" role="group" aria-label="Filter activity">
        {GROUPS.map(g => (
          <button key={g.key} className={group === g.key ? 'on' : ''} aria-pressed={group === g.key} onClick={() => setGroup(g.key)}>
            {g.label}
            <small>{g.kinds.length ? events.filter(e => g.kinds.includes(e.kind)).length : events.length}</small>
          </button>
        ))}
      </div>
      {!rows.length && <p className="muted">{empty ?? 'Nothing recorded yet.'}</p>}
      <ol className="tl">
        {rows.map((e, i) => {
          const day = e.t.slice(0, 10)
          const head = day !== lastDay
          lastDay = day
          return (
            <li key={`${e.t}${i}`} className={`k-${e.kind} s-${e.src}`}>
              {head && <div className="tl-day">{new Date(e.t).toUTCString().slice(0, 16)}</div>}
              <time dateTime={e.t} title={`${ago(e.t)} · ${SRC_LABEL[e.src]}`}>{clock(e.t)}</time>
              <span className="tl-kind">{KIND_LABEL[e.kind]}</span>
              <span className="tl-text">
                {(showAgent || showTask) && (
                  <button className="tl-who" onClick={() => useStore.getState().select(showTask && !showAgent ? { kind: 'task', id: e.node } : { kind: 'agent', id: e.agent }, 'activity')}>
                    {showAgent ? `${data?.agents[e.agent]?.name ?? e.agent} · ` : ''}{e.node}
                  </button>
                )}
                {e.text}
              </span>
            </li>
          )
        })}
      </ol>
      {events.length > 300 && <p className="muted small">Showing the latest 300 of {events.length} events.</p>}
    </div>
  )
}
