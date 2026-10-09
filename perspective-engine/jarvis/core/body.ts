import type { BodyPartSpec, BodyPartState, FaceState, RevenueEntry } from './types'

/** A task prepared and waiting only on the owner counts this much towards its part. */
export const PREPARED_WEIGHT = 0.6

export function partState(spec: BodyPartSpec, statusOf: (taskId: string) => string | undefined): BodyPartState {
  let done = 0
  let prepared = 0
  for (const id of spec.tasks) {
    const s = statusOf(id)
    if (s === 'done') done++
    else if (s === 'awaiting_human') prepared++
  }
  const total = spec.tasks.length
  const fill = total ? Math.min(1, (done + PREPARED_WEIGHT * prepared) / total) : 0
  return { ...spec, tasks: [...spec.tasks], done, prepared, total, fill: Math.round(fill * 1000) / 1000 }
}

const FACE_LABELS: Record<FaceState['stage'], string> = {
  0: 'No verified revenue yet: the face stays unformed.',
  1: 'One verified paying customer: the eyes have formed. A second paying customer forms the brow and nose.',
  2: 'Two verified paying customers: eyes, brow and nose have formed. A third forms the mouth.',
  3: 'Three or more verified paying customers: the face is complete.',
}

/** Only founder-recorded payments with an amount, a payer, a valid time and evidence count. Nothing else can form the face. */
export function isVerifiedRevenue(e: RevenueEntry): boolean {
  return (
    e?.recordedBy === 'founder' &&
    typeof e.amountUsd === 'number' && Number.isFinite(e.amountUsd) && e.amountUsd > 0 &&
    typeof e.evidence === 'string' && e.evidence.trim() !== '' &&
    typeof e.payer === 'string' && e.payer.trim() !== '' &&
    Number.isFinite(Date.parse(e.t))
  )
}

export function faceState(entries: RevenueEntry[]): FaceState {
  const verified = (entries ?? []).filter(isVerifiedRevenue)
  const payers = new Set(verified.map(e => e.payer.trim().toLowerCase())).size
  const stage = Math.min(3, payers) as FaceState['stage']
  const totalUsd = Math.round(verified.reduce((sum, e) => sum + e.amountUsd, 0) * 100) / 100
  return { stage, payers, totalUsd, label: FACE_LABELS[stage], verifiedEntries: verified.length }
}
