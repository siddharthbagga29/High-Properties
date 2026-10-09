/**
 * Reminder scheduler: every tick, reminders that are due are delivered (macOS notification + `say` on the Mac) and
 * marked delivered only when at least one channel actually worked. A failed delivery stays pending, records the
 * error, and is retried at most three times, a minute apart. The clock and the notifier are injected for tests.
 */
import { due, type AuditEntry } from '../../core/index'
import type { AgentReminder, ReminderStore } from './store'

export interface ChannelResult { channel: string; ok: boolean; detail: string }
export type Deliver = (r: AgentReminder) => Promise<ChannelResult[]>

export const MAX_ATTEMPTS = 3
export const RETRY_AFTER_MS = 60_000

export interface SchedulerDeps {
  store: ReminderStore
  deliver: Deliver
  now: () => Date
  intervalMs?: number
  audit?: { append(e: AuditEntry): void }
  onDelivered?: (r: AgentReminder) => void
}

export interface Scheduler {
  tick(): Promise<AgentReminder[]>
  start(): void
  stop(): void
}

export function createScheduler(deps: SchedulerDeps): Scheduler {
  let timer: NodeJS.Timeout | null = null
  let running: Promise<AgentReminder[]> | null = null

  async function deliverDue(): Promise<AgentReminder[]> {
    const now = deps.now()
    const handled: AgentReminder[] = []
    const ready = (due(deps.store.list(), now) as AgentReminder[]).filter(
      r => (r.attempts ?? 0) < MAX_ATTEMPTS && (!r.nextAttemptAt || Date.parse(r.nextAttemptAt) <= now.getTime()),
    )
    for (const r of ready) {
      const started = deps.now()
      let results: ChannelResult[]
      try {
        results = await deps.deliver(r)
      } catch (e) {
        results = [{ channel: 'all', ok: false, detail: e instanceof Error ? e.message : String(e) }]
      }
      const ok = results.some(c => c.ok)
      const attempts = (r.attempts ?? 0) + 1
      const updated: AgentReminder = ok
        ? { ...r, status: 'delivered', deliveredAt: deps.now().toISOString(), attempts, lastError: undefined, nextAttemptAt: undefined }
        : {
            ...r,
            attempts,
            lastError: results.map(c => `${c.channel}: ${c.detail}`).join('; ') || 'no delivery channel',
            nextAttemptAt: new Date(deps.now().getTime() + RETRY_AFTER_MS).toISOString(),
          }
      deps.store.put(updated)
      deps.audit?.append({
        at: started.toISOString(),
        actor: 'jarvis',
        tool: 'reminder.deliver',
        inputSummary: JSON.stringify({ id: r.id, text: r.text.slice(0, 80) }),
        resultSummary: ok ? `delivered via ${results.filter(c => c.ok).map(c => c.channel).join(', ')}` : `not delivered (attempt ${attempts} of ${MAX_ATTEMPTS}): ${updated.lastError}`,
        risk: 'low',
        decision: 'auto',
        ok,
        durationMs: Math.max(0, deps.now().getTime() - started.getTime()),
      })
      if (ok) deps.onDelivered?.(updated)
      handled.push(updated)
    }
    return handled
  }

  return {
    tick() {
      // Ticks never overlap: a slow `say` must not cause the same reminder to be delivered twice.
      running ??= deliverDue().finally(() => (running = null))
      return running
    },
    start() {
      if (timer) return
      timer = setInterval(() => void this.tick().catch(() => undefined), deps.intervalMs ?? 15_000)
      timer.unref?.()
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
  }
}
