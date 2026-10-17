import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contextParts } from './ask'
import { answer } from './guide'
import { statusesAt } from './model'
import type { ActivityEvent, GraphState } from './types'

const state: GraphState = JSON.parse(readFileSync(new URL('../../public/state.json', import.meta.url), 'utf8'))
const row = (p: Partial<ActivityEvent>): ActivityEvent => ({ t: '2026-10-16T17:49:00Z', node: 'V05', agent: 'gtm', kind: 'note', text: 'x', src: 'self', ...p })
// The verifier fails V05, the builder (without --verifier) logs its fix in the verifier's words, and a later verifier
// run's ingested tool call reads like any other step.
const rows = [
  row({ t: '2026-10-16T17:48:00Z', kind: 'check', actor: 'verifier', text: 'Verifier R3: section 6 says 57 medium rows, targets.csv has 55. VERDICT: FAIL' }),
  row({ t: '2026-10-16T17:49:00Z', kind: 'edit', text: 'Verifier GAP fixed: section 6 recounted against targets.csv (55 medium)' }),
  row({ t: '2026-10-16T17:50:00Z', kind: 'read', src: 'transcript', actor: 'verifier', text: 'Read perspective-engine/gtm/icp.md' }),
]
const s: GraphState = { ...state, activity: { V05: rows } }
const st = statusesAt(s, null)

describe('ask context', () => {
  it('tells the model which rows are the verifier\'s by the actor field, never by their wording', () => {
    // Review 5, ingest-replay #4, left open after round 1: the prompt said rows starting "Verifier" were the verifier's
    // and showed no actor, so the builder's fix read as the verifier's and the verifier's read as the agent's.
    for (const focus of [{ kind: 'task', id: 'V05' } as const, { kind: 'agent', id: 'gtm' } as const]) {
      const p = contextParts(s, st, focus, null)
      expect(p.facts).not.toMatch(/starting "Verifier"/)
      expect(p.facts).toMatch(/tagged \[verifier\]/)
      expect(p.activity.split('\n').slice(1)).toEqual([
        '2026-10-16 17:50 V05 [verifier] read: Read perspective-engine/gtm/icp.md',
        '2026-10-16 17:49 V05 edit: Verifier GAP fixed: section 6 recounted against targets.csv (55 medium)',
        '2026-10-16 17:48 V05 [verifier] check: Verifier R3: section 6 says 57 medium rows, targets.csv has 55. VERDICT: FAIL',
      ])
    }
  })
  it('the answer without Claude says which of an agent\'s latest steps were the verifier\'s', () => {
    const r = answer('What did this agent do today?', s, st, Date.parse('2026-10-16T18:00:00Z'), { kind: 'agent', id: 'gtm' })
    expect(r.text).toMatch(/UTC the independent verifier read: Read perspective-engine\/gtm\/icp\.md/)
    expect(r.text).toMatch(/UTC edited: Verifier GAP fixed/)
  })
})
