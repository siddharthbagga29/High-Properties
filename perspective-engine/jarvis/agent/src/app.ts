/**
 * The agent's state and behaviour, independent of HTTP: stores in ~/.jarvis, the tool registry with the policy
 * and audit log, model detection, the ask pipeline, reminders and the briefing. server.ts exposes it.
 */
import {
  addAction,
  createAuditLog,
  createReminder,
  DEFAULT_POLICY,
  parseReminder,
  remember,
  createRegistry,
  summarizeInput,
  transition,
  type AuditEntry,
  type JarvisTool,
  type LLMProvider,
  type MemoryItem,
  type MemoryKind,
  type Policy,
  type Registry,
} from '../../core/index'
import { ask as askPipeline, rulesAnswer, type AskResult, type ToolOutcome } from './ask'
import { loadPEState, statusBriefing, type PEStateInfo, type StatusBriefing } from './briefing'
import { ensureHome, PE_REPO_DIR, paths, type AgentConfig, type Paths } from './config'
import type { Runner } from './exec'
import { buildProviders, type ModelReport } from './models'
import type { GuardOptions } from './net'
import { redactEntry } from './redaction'
import { createScheduler, type ChannelResult, type Deliver, type Scheduler } from './scheduler'
import { appendJsonl, fileMemoryStore, fileReminderStore, fileTaskStore, readJsonl, sessionStore, type AgentReminder, type AgentTask } from './store'
import { createBrowserTools, type PlaywrightLike } from './tools/browser'
import { fsTools } from './tools/fs'
import { macTools } from './tools/mac'
import { researchTool } from './tools/research'
import { shellTool } from './tools/shell'

export const AGENT_VERSION = '0.1.0'
const MODEL_REFRESH_MS = 60_000
const TASK_RESULT_MAX = 4000

export interface AppDeps {
  home: string
  config: AgentConfig
  env?: NodeJS.ProcessEnv
  now?: () => Date
  platform?: NodeJS.Platform
  /** Process runner for shell.run and the macOS tools (tests inject a fake). */
  runner?: Runner
  fetch?: typeof fetch
  totalBytes?: number
  which?: (name: string) => string | null
  /** Test hook for the SSRF guard used by research and the browser. Production uses the strict default. */
  netGuard?: GuardOptions
  playwright?: () => Promise<PlaywrightLike | null>
  /** Reminder delivery override (tests). Default: notify + say through the registry. */
  deliver?: Deliver
  tzOffsetMinutes?: () => number
  extraTools?: JarvisTool[]
}

/** A request the app declines, with the HTTP status that describes why. */
export interface Refusal { refused: string; httpStatus: number }

export interface ToolInfo { id: string; name: string; description: string; riskLevel: string; requiresConfirmation: boolean; level: number; schema: JarvisTool['schema'] }

export interface StatusPayload {
  agent: { version: string; startedAt: string; now: string; platform: string; home: string; pid: number }
  briefing: StatusBriefing
  models: ModelReport | null
  tools: number
  reminders: { pending: number; due: number; delivered: number }
  capabilityGaps: string[]
}

export interface App {
  paths: Paths
  config: AgentConfig
  registry: Registry
  scheduler: Scheduler
  status(): Promise<StatusPayload>
  briefing(): StatusBriefing
  tasks(): AgentTask[]
  ask(text: string): Promise<AskResult>
  runTool(id: string, input: unknown, confirmed: boolean, title?: string): Promise<ToolOutcome | null>
  confirmTask(id: string): Promise<ToolOutcome | Refusal>
  cancelTask(id: string): AgentTask | Refusal
  tools(): ToolInfo[]
  audit(limit: number): AuditEntry[]
  recordAudit(e: AuditEntry): void
  memory(q: string, k: number, kind?: MemoryKind): Promise<MemoryItem[]>
  remember(kind: MemoryKind, text: string, reason?: string): Promise<MemoryItem>
  reminders(): AgentReminder[]
  addReminder(text: string, dueAt?: string): { reminder: AgentReminder } | { error: string }
  dismissReminder(id: string): AgentReminder | null
  models(force?: boolean): Promise<{ providers: LLMProvider[]; report: ModelReport }>
  close(): Promise<void>
}

const MEMORY_KINDS: MemoryKind[] = ['episodic', 'decision', 'preference', 'project', 'working']

export function createApp(deps: AppDeps): App {
  const cfg = deps.config
  const p = paths(deps.home)
  ensureHome(p.home)
  const now = deps.now ?? (() => new Date())
  const env = deps.env ?? process.env
  const platform = deps.platform ?? process.platform
  const startedAt = now()
  const tzOffset = deps.tzOffsetMinutes ?? (() => -now().getTimezoneOffset())

  const tasks = fileTaskStore(p.tasks)
  const reminderStore = fileReminderStore(p.reminders)
  const memoryStore = fileMemoryStore(p.memory)
  const session = sessionStore(p.session)
  // Core redact() runs inside createAuditLog; redactEntry repeats it on the percent-decoded text before the line hits disk.
  const audit = createAuditLog(e => appendJsonl(p.audit, redactEntry(e)))

  const policy: Policy = { ...DEFAULT_POLICY, preApproved: cfg.policy.preApproved, denied: cfg.policy.denied }
  const registry = createRegistry({ policy, audit, now, actor: 'owner' })
  const browser = createBrowserTools({
    load: deps.playwright,
    guard: deps.netGuard,
    headless: () => cfg.browser.headless,
    channel: () => cfg.browser.channel,
    downloadDir: () => cfg.browser.downloadDir,
  })
  const allTools: JarvisTool[] = [
    ...fsTools({ roots: () => cfg.roots, projectRoots: () => cfg.projectRoots, backupDir: p.backups, trashDir: p.trash, now }),
    shellTool({ roots: () => cfg.roots, projectRoots: () => cfg.projectRoots, peRepoDir: PE_REPO_DIR, runner: deps.runner }),
    ...macTools({ runner: deps.runner, platform, voice: () => ({ voice: cfg.voice.voice, rate: cfg.voice.rate }) }),
    researchTool({ guard: deps.netGuard }),
    ...browser.tools,
    ...(deps.extraTools ?? []),
  ]
  for (const t of allTools) registry.register(t)

  // ---------- models ----------
  let modelCache: { at: number; value: Promise<{ providers: LLMProvider[]; report: ModelReport }> } | null = null
  function models(force = false) {
    if (force || !modelCache || now().getTime() - modelCache.at > MODEL_REFRESH_MS) {
      const value = buildProviders(cfg.models, { env, fetch: deps.fetch, totalBytes: deps.totalBytes, which: deps.which, runner: deps.runner, cwd: PE_REPO_DIR, rules: rulesAnswer })
      modelCache = { at: now().getTime(), value }
      value.catch(() => (modelCache = null))
    }
    return modelCache.value
  }
  let lastReport: ModelReport | null = null

  // ---------- tasks ----------
  const clip = (data: unknown) => {
    if (data === undefined) return undefined
    const json = JSON.stringify(data)
    return json.length > TASK_RESULT_MAX ? { clipped: true, preview: json.slice(0, TASK_RESULT_MAX) } : data
  }

  function completeTask(title: string, verifiedBy: string, result?: unknown): AgentTask {
    const t0 = tasks.create({ title, source: 'request' }, now())
    const running = transition(t0, 'running', now())
    return tasks.put(transition(running, 'completed', now(), undefined, { verifiedBy, result }))
  }

  function failTask(title: string, error: string): AgentTask {
    const t0 = tasks.create({ title, source: 'request' }, now())
    const running = transition(t0, 'running', now())
    return tasks.put(transition(running, 'failed', now(), error.slice(0, 200), { error }))
  }

  async function execute(task: AgentTask, id: string, input: Record<string, unknown>, confirmed: boolean): Promise<ToolOutcome> {
    const tool = registry.get(id)!
    let current: AgentTask = tasks.put(task.status === 'running' ? task : transition(task, 'running', now(), confirmed ? 'confirmed by you' : undefined))
    const r = await registry.run(id, input, { viewer: 'owner', confirmed, taskId: current.id })
    current = addAction(current, { kind: 'tool', tool: id, summary: r.summary, ok: r.ok }, now())
    if (r.decision === 'needs_confirmation') {
      current = transition(current, 'waiting_for_user', now(), 'needs your confirmation', { requiredUserInput: `Confirm ${tool.name}: ${summarizeInput(input, 120)}` })
      current.pending = { tool: id, input, requestedAt: now().toISOString() }
    } else if (r.ok) {
      current = transition(current, 'completed', now(), undefined, { verifiedBy: `${id} reported success: ${r.summary}`.slice(0, 300), result: clip(r.data) })
      delete current.pending
    } else {
      current = transition(current, 'failed', now(), r.summary.slice(0, 200), { error: r.error ? `${r.error}: ${r.summary}` : r.summary })
      delete current.pending
    }
    current = tasks.put(current)
    return { ok: r.ok, decision: r.decision, summary: r.summary, error: r.error, data: r.data, task: current }
  }

  async function runTool(id: string, input: unknown, confirmed: boolean, title?: string): Promise<ToolOutcome | null> {
    const tool = registry.get(id)
    if (!tool) return null
    const safeInput = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
    const task = tasks.create({ title: title ?? `${tool.name}: ${summarizeInput(safeInput, 80)}`, source: 'request' }, now())
    return execute(task, id, safeInput, confirmed)
  }

  // ---------- reminders ----------
  const defaultDeliver: Deliver = async r => {
    const results: ChannelResult[] = []
    const notified = await registry.run('notify', { title: 'Jarvis reminder', message: r.text }, { viewer: 'owner' })
    results.push({ channel: 'mac', ok: notified.ok, detail: notified.summary })
    if (cfg.voice.say) {
      const spoken = await registry.run('say', { text: `Reminder: ${r.text}` }, { viewer: 'owner' })
      results.push({ channel: 'speech', ok: spoken.ok, detail: spoken.summary })
    }
    return results
  }
  const scheduler = createScheduler({ store: reminderStore, deliver: deps.deliver ?? defaultDeliver, now, intervalMs: cfg.reminders.intervalMs, audit })

  const peState = (): PEStateInfo => loadPEState(cfg.peStatePath)
  const briefingNow = (): StatusBriefing =>
    statusBriefing(peState(), tasks.list(), reminderStore.list(), { answering: lastReport?.order ?? ['rules'], local: true }, now(), startedAt)

  function gaps(report: ModelReport | null): string[] {
    const out: string[] = []
    if (platform !== 'darwin') out.push(`This machine is ${platform}: notify, say and open.url need macOS and will report that instead of running.`)
    if (report && !report.ollama.running && !report.anthropic.configured && !report.claudeCode.path) out.push('No language model is available: open questions get a rules-only answer.')
    return out
  }

  return {
    paths: p,
    config: cfg,
    registry,
    scheduler,
    async status() {
      let report: ModelReport | null = null
      try {
        report = (await models()).report
        lastReport = report
      } catch {
        report = null
      }
      const list = reminderStore.list()
      const t = now().getTime()
      return {
        agent: { version: AGENT_VERSION, startedAt: startedAt.toISOString(), now: now().toISOString(), platform, home: p.home, pid: process.pid },
        briefing: briefingNow(),
        models: report,
        tools: registry.list('owner').length,
        reminders: {
          pending: list.filter(r => r.status === 'pending' || r.status === 'scheduled').length,
          due: list.filter(r => (r.status === 'pending' || r.status === 'scheduled') && Date.parse(r.dueAt) <= t).length,
          delivered: list.filter(r => r.status === 'delivered').length,
        },
        capabilityGaps: gaps(report),
      }
    },
    briefing: briefingNow,
    tasks: () => tasks.list().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    async ask(text) {
      return askPipeline(text, {
        peState,
        status: briefingNow,
        tasks,
        reminders: reminderStore,
        memory: memoryStore,
        providers: async () => {
          const m = await models()
          lastReport = m.report
          return m.providers
        },
        localOnly: () => cfg.models.localOnly,
        runTool: async (id, input, opts) => {
          const out = await runTool(id, input, opts.confirmed, opts.title)
          if (!out) throw new Error(`tool ${id} is not registered`)
          return out
        },
        completeTask,
        failTask,
        session,
        now,
        tzOffsetMinutes: tzOffset,
      })
    },
    runTool,
    async confirmTask(id) {
      const task = tasks.get(id)
      if (!task) return { refused: 'no such task', httpStatus: 404 }
      if (task.status !== 'waiting_for_user' || !task.pending) return { refused: `task is ${task.status}; nothing to confirm`, httpStatus: 409 }
      if (!registry.get(task.pending.tool)) return { refused: `tool ${task.pending.tool} is no longer available`, httpStatus: 409 }
      const pending = task.pending
      return execute(task, pending.tool, pending.input, true)
    },
    cancelTask(id) {
      const task = tasks.get(id)
      if (!task) return { refused: 'no such task', httpStatus: 404 }
      if (!['queued', 'planning', 'waiting_for_user', 'blocked'].includes(task.status)) return { refused: `task is ${task.status}; it cannot be cancelled`, httpStatus: 409 }
      const next: AgentTask = transition(task, 'cancelled', now(), 'cancelled by you')
      delete next.pending
      return tasks.put(next)
    },
    tools: () =>
      registry.list('owner').map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        riskLevel: t.riskLevel,
        requiresConfirmation: t.requiresConfirmation,
        level: policy.levels[t.riskLevel],
        schema: t.schema,
      })),
    audit: limit => readJsonl<AuditEntry>(p.audit, Math.max(1, Math.min(1000, limit))).reverse(),
    recordAudit: e => audit.append(e),
    async memory(q, k, kind) {
      return memoryStore.search(q, Math.max(1, Math.min(50, k)), kind ? [kind] : undefined)
    },
    async remember(kind, text, reason) {
      if (!MEMORY_KINDS.includes(kind)) throw new Error(`unknown memory kind ${kind}`)
      return remember(memoryStore, kind, text, now(), { source: 'owner (local console)', ...(reason ? { reason } : {}) })
    },
    reminders: () => reminderStore.list().sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)),
    addReminder(text, dueAt) {
      const n = now()
      let parsed: { text: string; dueAt: string } | null
      if (dueAt) parsed = Number.isFinite(Date.parse(dueAt)) ? { text, dueAt } : null
      else parsed = parseReminder(text, n, tzOffset())
      if (!parsed) return { error: 'no time found; say for example "in 20 minutes stretch" or pass dueAt' }
      if (!parsed.text.trim()) return { error: 'the reminder needs some text' }
      const reminder: AgentReminder = { ...createReminder(parsed.text, parsed.dueAt, n), channels: ['mac', 'speech', 'page'] }
      return { reminder: reminderStore.put(reminder) }
    },
    dismissReminder(id) {
      const r = reminderStore.get(id)
      if (!r) return null
      return reminderStore.put({ ...r, status: 'dismissed' })
    },
    models,
    async close() {
      scheduler.stop()
      await browser.close()
    },
  }
}
