/**
 * Agent scorecards from the public record (state.audit, written by tools/audit.py). Public: visitors see them too.
 * The audit block arrives from the database, so it is validated field by field and read as data.
 */
import type { AuditFinding, Scorecard, ScoreDimension } from '@jarvis/types'

export interface AuditView {
  computedAt: string | null
  notice: string | null
  cards: Scorecard[]
}

const GRADES: Scorecard['grade'][] = ['A', 'B', 'C', 'D', 'F']
const SEVERITY: AuditFinding['severity'][] = ['critical', 'major', 'minor']
const KINDS: AuditFinding['kind'][] = ['hallucination', 'unsupported_claim', 'incomplete', 'error', 'process']
const STATUS: AuditFinding['status'][] = ['open', 'fixed', 'accepted']

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const s = (x: unknown, max = 600) => (typeof x === 'string' ? x.slice(0, max) : '')
const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)

function readFinding(raw: unknown, agent: string, i: number): AuditFinding | null {
  if (!isObj(raw)) return null
  const severity = SEVERITY.includes(raw.severity as AuditFinding['severity']) ? (raw.severity as AuditFinding['severity']) : null
  const claim = s(raw.claim)
  if (!severity || !claim) return null
  const f: AuditFinding = {
    id: s(raw.id, 80) || `${agent}-${i}`,
    agent: s(raw.agent, 40) || agent,
    severity,
    kind: KINDS.includes(raw.kind as AuditFinding['kind']) ? (raw.kind as AuditFinding['kind']) : 'process',
    claim,
    evidence: s(raw.evidence),
    status: STATUS.includes(raw.status as AuditFinding['status']) ? (raw.status as AuditFinding['status']) : 'open',
  }
  if (typeof raw.task === 'string') f.task = raw.task.slice(0, 20)
  return f
}

function readCard(raw: unknown): Scorecard | null {
  if (!isObj(raw)) return null
  const score = n(raw.score)
  const agent = s(raw.agent, 40)
  if (score === null || !agent) return null
  const grade = GRADES.includes(raw.grade as Scorecard['grade']) ? (raw.grade as Scorecard['grade']) : gradeOf(score)
  const dims: ScoreDimension[] = (Array.isArray(raw.dimensions) ? raw.dimensions : [])
    .filter(isObj)
    .map(d => ({ id: s(d.id, 60), label: s(d.label, 120), weight: n(d.weight) ?? 0, score: n(d.score) ?? 0, basis: s(d.basis, 400) }))
    .filter(d => d.id)
  const findings = (Array.isArray(raw.findings) ? raw.findings : []).map((f, i) => readFinding(f, agent, i)).filter((f): f is AuditFinding => f !== null)
  return {
    agent,
    name: s(raw.name, 60) || agent,
    score: Math.round(score * 10) / 10,
    grade,
    meetsInstitutionalBar: raw.meetsInstitutionalBar === true,
    dimensions: dims,
    findings,
    computedAt: s(raw.computedAt, 40),
  }
}

/** Letter grade for a score when the record has none (A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60). */
export function gradeOf(score: number): Scorecard['grade'] {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'
}

/** The audit block of an export. Accepts the object written by audit.py ({scorecards: [...]}) or a bare array. */
export function readAudit(state: unknown): AuditView {
  const audit = isObj(state) ? state.audit : undefined
  const list = Array.isArray(audit) ? audit : isObj(audit) && Array.isArray(audit.scorecards) ? audit.scorecards : []
  const cards = list.map(readCard).filter((c): c is Scorecard => c !== null).sort((a, b) => b.score - a.score)
  return {
    computedAt: isObj(audit) && typeof audit.computedAt === 'string' ? audit.computedAt : cards[0]?.computedAt || null,
    notice: isObj(audit) && typeof audit.notice === 'string' ? audit.notice.slice(0, 400) : null,
    cards,
  }
}

const SEV_RANK: Record<AuditFinding['severity'], number> = { critical: 0, major: 1, minor: 2 }
const KIND_RANK: Record<AuditFinding['kind'], number> = { hallucination: 0, unsupported_claim: 1, error: 2, incomplete: 3, process: 4 }

/** Open findings first, then by severity, then hallucinations before other kinds. */
export function topFindings(card: Scorecard, k = 3): AuditFinding[] {
  const open = (f: AuditFinding) => (f.status === 'open' ? 0 : 1)
  return [...card.findings].sort((a, b) => open(a) - open(b) || SEV_RANK[a.severity] - SEV_RANK[b.severity] || KIND_RANK[a.kind] - KIND_RANK[b.kind]).slice(0, k)
}

export const openFindings = (card: Scorecard) => card.findings.filter(f => f.status === 'open')

/** Finds a card by agent key ("finance"), persona name ("Pacioli") or a word in either. */
export function findCard(view: AuditView, who: string): Scorecard | null {
  const w = who.trim().toLowerCase()
  if (!w) return null
  return view.cards.find(c => c.agent.toLowerCase() === w || c.name.toLowerCase() === w) ?? null
}

const KIND_WORD: Record<AuditFinding['kind'], string> = {
  hallucination: 'possible hallucination',
  unsupported_claim: 'unsupported claim',
  incomplete: 'incomplete work',
  error: 'error',
  process: 'process issue',
}
export const kindWord = (k: AuditFinding['kind']) => KIND_WORD[k]

/** Whole-team summary in two or three sentences, every number counted from the cards. */
export function auditSummary(view: AuditView): string {
  if (!view.cards.length) return 'No scorecards have been published yet.'
  const meet = view.cards.filter(c => c.meetsInstitutionalBar)
  const low = view.cards[view.cards.length - 1]
  const open = view.cards.flatMap(openFindings)
  const halluc = open.filter(f => f.kind === 'hallucination').length
  const critical = open.filter(f => f.severity === 'critical').length
  const top = meet.length ? `: ${meet.map(c => `${c.name} ${Math.round(c.score)} ${c.grade}`).join(', ')}` : ''
  return [
    `${meet.length} of ${view.cards.length} agents meet the institutional bar${top}.`,
    `Lowest: ${low.name} at ${Math.round(low.score)} (${low.grade}).`,
    `${open.length} ${open.length === 1 ? 'finding is' : 'findings are'} open${open.length ? `, ${critical} critical and ${halluc} flagged as ${halluc === 1 ? 'a possible hallucination' : 'possible hallucinations'}` : ''}.`,
  ].join(' ')
}

/** One agent's card in words, with its top findings. */
export function cardSummary(card: Scorecard): string {
  const open = openFindings(card)
  const top = topFindings(card, 2).filter(f => f.status === 'open')
  const lines = [
    `${card.name}: ${Math.round(card.score)} out of 100, grade ${card.grade}; ${card.meetsInstitutionalBar ? 'meets' : 'does not meet'} the institutional bar.`,
    `${open.length} open ${open.length === 1 ? 'finding' : 'findings'}.`,
  ]
  if (top.length) lines.push(`Top: ${top.map(f => `${f.severity} ${kindWord(f.kind)}: ${clipClaim(f.claim)}`).join('; ')}.`)
  return lines.join(' ')
}

export function clipClaim(claim: string, max = 140): string {
  const c = claim.replace(/\s+/g, ' ').trim()
  return c.length <= max ? c : `${c.slice(0, max - 1)}…`
}
