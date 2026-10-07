import { useState } from 'react'

const C_SPENT = '#14a6be'
const C_BUDGET = '#9b6bff'

export interface Row { id: string; title: string; budget: number; spent: number }

/** Budget vs tokens actually processed per finished task, in completion order. One axis, two marks per row.
 * Only finished tasks carry a measured run, so unfinished and failed rounds are absent by construction. */
export function BudgetDumbbell({ rows }: { rows: Row[] }) {
  const [hi, setHi] = useState<Row | null>(null)
  if (!rows.length) return <p className="muted">No finished task has a measured run at this point.</p>
  const W = 320, rowH = 15, top = 22, left = 34, right = 10
  const max = Math.ceil(Math.max(...rows.map(r => Math.max(r.budget, r.spent))) / 20) * 20
  const x = (v: number) => left + (v / max) * (W - left - right)
  const H = top + rows.length * rowH + 18
  const ticks = [0, max / 2, max]
  return (
    <figure className="chart">
      <div className="legend"><span><i style={{ background: C_BUDGET }} />Budget</span><span><i style={{ background: C_SPENT }} />Used</span><span className="unit">k tokens · finished tasks only</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Token budget versus tokens used for each finished task">
        {ticks.map(t => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top - 6} y2={H - 16} className="grid" />
            <text x={x(t)} y={H - 4} className="axis" textAnchor="middle">{t}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = top + i * rowH
          const on = hi?.id === r.id
          return (
            <g key={r.id} onMouseEnter={() => setHi(r)} onMouseLeave={() => setHi(null)} onFocus={() => setHi(r)} onBlur={() => setHi(null)} tabIndex={0} className={on ? 'row on' : 'row'}>
              <rect x={0} y={y - rowH / 2} width={W} height={rowH} fill="transparent" />
              <text x={left - 6} y={y + 3.5} className="axis" textAnchor="end">{r.id}</text>
              <line x1={x(Math.min(r.budget, r.spent))} x2={x(Math.max(r.budget, r.spent))} y1={y} y2={y} className="connector" />
              <circle cx={x(r.budget)} cy={y} r={on ? 5 : 4} fill={C_BUDGET} className="dot" />
              <circle cx={x(r.spent)} cy={y} r={on ? 5 : 4} fill={C_SPENT} className="dot" />
            </g>
          )
        })}
      </svg>
      <figcaption>{hi ? <><b>{hi.id}</b> {hi.title}: {hi.spent}k used against a {hi.budget}k budget ({(hi.spent / Math.max(hi.budget, 1)).toFixed(1)}×).</> : 'Hover or focus a row for its numbers.'}</figcaption>
    </figure>
  )
}

/** One agent's overrun ratio (spent / budget) per finished task, oldest to newest. */
export function RatioSpark({ points }: { points: { id: string; ratio: number }[] }) {
  const [hi, setHi] = useState<number | null>(null)
  if (points.length < 1) return <p className="muted">No finished, measured runs yet, so no trend.</p>
  const W = 300, H = 86, pad = 14
  const max = Math.max(2, ...points.map(p => p.ratio)) * 1.1
  const x = (i: number) => (points.length === 1 ? W / 2 : pad + (i / (points.length - 1)) * (W - pad * 2))
  const y = (v: number) => H - 14 - (v / max) * (H - 28)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.ratio)}`).join(' ')
  const area = `${line} L${x(points.length - 1)},${H - 14} L${x(0)},${H - 14} Z`
  const last = points.length - 1
  const shown = hi ?? last
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tokens used divided by budget for each finished task">
        <line x1={pad} x2={W - pad} y1={y(1)} y2={y(1)} className="grid ref" />
        <text x={W - pad} y={y(1) - 4} className="axis" textAnchor="end">on budget (1×)</text>
        <path d={area} fill={C_SPENT} opacity={0.14} />
        <path d={line} fill="none" stroke={C_SPENT} strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.id} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} onFocus={() => setHi(i)} onBlur={() => setHi(null)} tabIndex={0}>
            <rect x={x(i) - 14} y={0} width={28} height={H} fill="transparent" />
            <circle cx={x(i)} cy={y(p.ratio)} r={i === shown ? 5 : 3} fill={C_SPENT} stroke="#120a30" strokeWidth={2} />
          </g>
        ))}
      </svg>
      <figcaption><b>{points[shown].id}</b>: {points[shown].ratio.toFixed(1)}× its budget</figcaption>
    </figure>
  )
}
