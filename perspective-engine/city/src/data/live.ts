import { useStore } from '../store'
import type { GraphState } from './types'

/**
 * Where the dashboard's truth comes from, in order:
 * 1. the live database document `state/current`, which the orchestrator rewrites on every
 *    agent step (real time, pushed to every open view);
 * 2. the `state.json` snapshot published with the page, re-read every 20 s.
 * The page never invents state: if neither answers, it says so.
 */
interface DocSnap { exists: boolean; data(): Record<string, unknown> | undefined }
interface DbLike { doc(path: string): { onSnapshot(next: (s: DocSnap) => void, err?: (e: { code: string }) => void): () => void } }
interface ClaudeLike { use(name: string): Promise<unknown> }

const isState = (v: unknown): v is GraphState =>
  !!v && typeof v === 'object' && Array.isArray((v as GraphState).nodes) && typeof (v as GraphState).agents === 'object'

const newer = (a: GraphState | null, b: GraphState) =>
  !a || Date.parse(b.generated) >= Date.parse(a.generated) || b.ledger.length !== a.ledger.length

export function startLive(): () => void {
  let stopped = false
  let unsub: (() => void) | null = null
  let gotLive = false

  const loadFile = async () => {
    try {
      const r = await fetch('./state.json', { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      if (stopped || !isState(d)) return
      const cur = useStore.getState().data
      if (!gotLive && newer(cur, d)) useStore.getState().setData(d, 'file')
    } catch {
      if (!useStore.getState().data) useStore.getState().set({ source: 'offline' })
    }
  }
  loadFile()
  const poll = setInterval(() => { if (!gotLive && !document.hidden) loadFile() }, 20_000)

  const claude = (window as unknown as { claude?: ClaudeLike }).claude
  if (claude?.use) {
    claude.use('db').then(raw => {
      const db = raw as DbLike | null
      if (!db || stopped) return
      try {
        unsub = db.doc('state/current').onSnapshot(
          snap => {
            const d = snap.exists ? snap.data() : undefined
            if (!isState(d)) return
            gotLive = true
            useStore.getState().setData(d, 'live')
          },
          () => { gotLive = false },
        )
      } catch { /* db unavailable in this view: keep the file */ }
    }).catch(() => { /* no capability: keep the file */ })
  }
  return () => { stopped = true; clearInterval(poll); unsub?.() }
}
