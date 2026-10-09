/**
 * The city's Jarvis tools, run through the core registry so every call passes the policy engine, schema checks,
 * timeouts and the audit log. Public tools (navigate, explain) may serve visitors; owner tools write the owner's
 * private rows and never run for a visitor (the policy engine denies them before they execute).
 * Each owner tool checks its own postcondition (the row reads back) and records itself as a Jarvis task.
 */
import { createAuditLog } from '@jarvis/audit'
import { createRegistry, type Registry } from '@jarvis/tools'
import { remember } from '@jarvis/memory'
import { createReminder } from '@jarvis/reminders'
import { createTask, transition } from '@jarvis/tasks'
import type { JarvisTool, Reminder, ToolResult } from '@jarvis/types'
import { explainSimply } from '../data/guide'
import { statusesAt } from '../data/model'
import type { GraphState } from '../data/types'
import type { OwnerData, WriteResult } from './owner-data'
import { cancelRequest, createDecision, createRequest, decisionRequest } from './requests'
import { resolveTarget, type Target } from './targets'
import type { Decision, OwnerRequest, RequestKind } from './types'

export interface ToolDeps {
  state(): GraphState | null
  /** Moves the city (or opens a panel / console tab) and returns whether it is now showing the target. */
  go(target: Target): boolean
  /** The owner's private data; null for visitors and when this view has no database or no identity. */
  data: OwnerData | null
  requests(): OwnerRequest[]
  reminders(): Reminder[]
  now(): Date
}

const NO_DATA: ToolResult = {
  ok: false,
  error: 'no_private_data',
  summary: "Your private data isn't available in this view (no database or no identity), so nothing was saved.",
}

const failed = (w: WriteResult, what: string): ToolResult => ({ ok: false, error: 'write_failed', summary: `I couldn't save the ${what}: ${w.error ?? 'unknown error'}.` })

/** Records a finished owner action as a Jarvis task: completed with what verified it, or failed. Best effort. */
async function recordTask(data: OwnerData, title: string, now: Date, result: ToolResult, verifiedBy?: string): Promise<void> {
  try {
    const running = transition(createTask({ title, source: 'jarvis' }, now), 'running', now)
    const done = result.ok && verifiedBy ? transition(running, 'completed', now, result.summary, { verifiedBy }) : transition(running, 'failed', now, result.summary, { error: result.error ?? 'failed' })
    await data.saveTask(done)
  } catch {
    /* the action itself already succeeded or failed; the log row is not worth failing it for */
  }
}

export function cityTools(d: ToolDeps): JarvisTool[] {
  const navigate: JarvisTool = {
    id: 'city.navigate',
    name: 'Navigate the city',
    description: 'Fly the city to a task, an agent, the brain or the whole city, or open Help, the Index or a Jarvis tab.',
    schema: { type: 'object', properties: { target: { type: 'string', description: 'A task id, agent name, district, "brain" or "city"' } }, required: ['target'] },
    riskLevel: 'safe',
    requiresConfirmation: false,
    scope: 'public',
    timeoutMs: 3000,
    async execute(input) {
      const target = resolveTarget(String(input.target), d.state())
      if (!target) return { ok: false, error: 'not_found', summary: `I couldn't find “${String(input.target).slice(0, 60)}” in the city.` }
      const ok = d.go(target)
      return ok ? { ok: true, summary: `Showing ${target.label}.`, data: target } : { ok: false, error: 'not_shown', summary: `I tried to open ${target.label}, but the view did not change.` }
    },
  }

  const explain: JarvisTool = {
    id: 'city.explain',
    name: 'Explain',
    description: 'Explain a task, an agent or the city in plain words, from the public record.',
    schema: { type: 'object', properties: { target: { type: 'string' } } },
    riskLevel: 'safe',
    requiresConfirmation: false,
    scope: 'public',
    timeoutMs: 3000,
    async execute(input) {
      const s = d.state()
      if (!s) return { ok: false, error: 'no_data', summary: 'The project record has not loaded yet.' }
      const t = input.target ? resolveTarget(String(input.target), s) : null
      const focus = t?.kind === 'focus' ? t.focus : { kind: 'world' as const }
      return { ok: true, summary: explainSimply(s, statusesAt(s, null), focus) }
    },
  }

  const setReminder: JarvisTool = {
    id: 'jarvis.set_reminder',
    name: 'Set a reminder',
    description: "Save a reminder in the owner's private reminders; the orchestrator schedules the push.",
    schema: { type: 'object', properties: { text: { type: 'string' }, dueAt: { type: 'string' }, id: { type: 'string' } }, required: ['text', 'dueAt'] },
    riskLevel: 'low',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 15_000,
    async execute(input) {
      if (!d.data) return NO_DATA
      const now = d.now()
      const r = createReminder(String(input.text), String(input.dueAt), now, input.id ? String(input.id) : undefined)
      const w = await d.data.saveReminder(r)
      const result: ToolResult = w.ok ? { ok: true, summary: `Reminder saved: ${r.text}`, data: r } : failed(w, 'reminder')
      await recordTask(d.data, `Set reminder: ${r.text}`, now, result, w.verifiedBy)
      return result
    },
  }

  const queueRequest: JarvisTool = {
    id: 'jarvis.queue_request',
    name: 'Queue a request',
    description: "Queue build work for the orchestrator's next scheduled run (every six hours). Nothing runs in the page.",
    schema: { type: 'object', properties: { text: { type: 'string' }, kind: { type: 'string', enum: ['build', 'task', 'decision'] }, ref: { type: 'string' } }, required: ['text'] },
    riskLevel: 'low',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 15_000,
    async execute(input) {
      if (!d.data) return NO_DATA
      const now = d.now()
      const req = createRequest(String(input.text), (input.kind as RequestKind | undefined) ?? 'build', now, input.ref ? { ref: String(input.ref) } : {})
      const w = await d.data.saveRequest(req)
      const result: ToolResult = w.ok ? { ok: true, summary: `Queued: ${req.text}`, data: req } : failed(w, 'request')
      await recordTask(d.data, `Queue request: ${req.text}`, now, result, w.verifiedBy)
      return result
    },
  }

  const recordDecision: JarvisTool = {
    id: 'jarvis.record_decision',
    name: 'Record a founder decision',
    description: "Record the owner's decision and queue a request for the orchestrator to apply it.",
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    riskLevel: 'low',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 20_000,
    async execute(input) {
      if (!d.data) return NO_DATA
      const now = d.now()
      const dec = createDecision(String(input.text), now)
      const req = decisionRequest(dec, now)
      const linked: Decision = { ...dec, requestId: req.id }
      const w1 = await d.data.saveDecision(linked)
      if (!w1.ok) {
        const r = failed(w1, 'decision')
        await recordTask(d.data, `Record decision: ${dec.text}`, now, r)
        return r
      }
      const w2 = await d.data.saveRequest(req)
      // Decision memory for later conversations; a refusal here never undoes the recorded decision.
      await remember(d.data.memory, 'decision', dec.text, now, { id: `mem-${dec.id}`, source: 'founder' }).catch(() => undefined)
      const result: ToolResult = w2.ok
        ? { ok: true, summary: `Decision recorded and queued to apply: ${dec.text}`, data: { decision: linked, request: req } }
        : { ok: false, error: 'write_failed', summary: `I recorded the decision, but couldn't queue the request to apply it: ${w2.error}.`, data: { decision: linked } }
      await recordTask(d.data, `Record decision: ${dec.text}`, now, result, w2.verifiedBy)
      return result
    },
  }

  const cancel: JarvisTool = {
    id: 'jarvis.cancel_request',
    name: 'Cancel a request',
    description: 'Cancel a request the orchestrator has not started.',
    schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    riskLevel: 'low',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 15_000,
    async execute(input) {
      if (!d.data) return NO_DATA
      const r = d.requests().find(x => x.id === input.id)
      if (!r) return { ok: false, error: 'not_found', summary: 'That request is not in your queue.' }
      let next: OwnerRequest
      try {
        next = cancelRequest(r, d.now())
      } catch (e) {
        return { ok: false, error: 'invalid_state', summary: e instanceof Error ? e.message : 'cannot cancel' }
      }
      const w = await d.data.saveRequest(next)
      return w.ok ? { ok: true, summary: `Cancelled: ${r.text}`, data: next } : failed(w, 'cancellation')
    },
  }

  const dismiss: JarvisTool = {
    id: 'jarvis.dismiss_reminder',
    name: 'Dismiss a reminder',
    description: 'Mark a reminder dismissed so it is not pushed again.',
    schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    riskLevel: 'low',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 15_000,
    async execute(input) {
      if (!d.data) return NO_DATA
      const r = d.reminders().find(x => x.id === input.id)
      if (!r) return { ok: false, error: 'not_found', summary: 'That reminder is not in your list.' }
      const w = await d.data.setReminderStatus(r, 'dismissed')
      return w.ok ? { ok: true, summary: `Dismissed: ${r.text}` } : failed(w, 'reminder')
    },
  }

  return [navigate, explain, setReminder, queueRequest, recordDecision, cancel, dismiss]
}

export const PUBLIC_TOOL_IDS = ['city.navigate', 'city.explain']

export function cityRegistry(d: ToolDeps, opts: { now?: () => Date } = {}): { registry: Registry; audit: ReturnType<typeof createAuditLog> } {
  const audit = createAuditLog()
  const registry = createRegistry({ audit, now: opts.now ?? d.now, actor: 'owner' })
  for (const t of cityTools(d)) registry.register(t)
  return { registry, audit }
}
