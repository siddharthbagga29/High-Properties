import { createAuditLog, summarizeInput, type AuditLog } from './audit'
import { DEFAULT_POLICY, decide, RISK_LEVELS } from './policy'
import type { AuditEntry, AutonomyLevel, JarvisTool, JSONSchema, Policy, RiskLevel, ToolCtx, ToolResult, Viewer } from './types'

export const DEFAULT_TIMEOUT_MS = 15_000
export const BACKOFF_BASE_MS = 250
export const BREAKER_THRESHOLD = 3
export const BREAKER_OPEN_MS = 60_000
const MAX_RETRIES = 5
const RETRYABLE_RISK: RiskLevel[] = ['safe', 'low']

// ---------- schema validation ----------

/** Returns an error message, or null when the input matches. Unknown fields are rejected so nothing can ride along. */
export function validate(schema: JSONSchema, input: unknown): string | null {
  if (!isPlainObject(input)) return 'input must be an object'
  for (const key of schema.required ?? []) {
    if (input[key] === undefined) return `missing required field "${key}"`
  }
  for (const [key, value] of Object.entries(input)) {
    const prop = Object.hasOwn(schema.properties, key) ? schema.properties[key] : undefined
    if (!prop) return `unexpected field "${key}"`
    if (value === undefined) continue
    if (!matchesType(prop.type, value)) return `field "${key}" must be of type ${prop.type}`
    if (prop.enum && !(typeof value === 'string' && prop.enum.includes(value))) return `field "${key}" must be one of: ${prop.enum.join(', ')}`
  }
  return null
}

function matchesType(type: JSONSchema['properties'][string]['type'], value: unknown): boolean {
  switch (type) {
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'boolean': return typeof value === 'boolean'
    case 'array': return Array.isArray(value)
    case 'object': return isPlainObject(value)
    default: return false
  }
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

// ---------- registry ----------

export type RunDecision = AutonomyLevel | 'denied' | 'needs_confirmation'
export type RunResult = ToolResult & { decision: RunDecision }
export type RunCtx = Partial<ToolCtx> & { viewer: Viewer }

export interface Registry {
  register(t: JarvisTool): void
  get(id: string): JarvisTool | undefined
  list(viewer: Viewer): JarvisTool[]
  run(id: string, input: unknown, ctx: RunCtx): Promise<RunResult>
}

export interface RegistryOptions {
  policy?: Policy
  /** Anything with append(); defaults to an in-memory log. */
  audit?: Pick<AuditLog, 'append'>
  now?: () => Date
  actor?: AuditEntry['actor']
  /** Injected so tests need not wait for real backoff delays. */
  sleep?: (ms: number) => Promise<void>
}

/** Per-tool circuit state. After the pause one trial call is let through (half-open); others wait for its outcome. */
interface Breaker { failures: number; openUntil: number; probing: boolean }

/** A failure in the tool itself (thrown, timed out, malformed result): retried for safe/low tools and counted by the breaker. */
class ToolFailure extends Error {
  readonly code: 'timeout' | 'cancelled' | 'tool_error' | 'invalid_result'
  constructor(code: ToolFailure['code'], message: string) {
    super(message)
    this.code = code
  }
}

export function createRegistry(opts: RegistryOptions = {}): Registry {
  const policy = opts.policy ?? DEFAULT_POLICY
  const audit = opts.audit ?? createAuditLog()
  const now = opts.now ?? (() => new Date())
  const sleep = opts.sleep ?? defaultSleep
  const tools = new Map<string, JarvisTool>()
  const breakers = new Map<string, Breaker>()

  function record(ctx: RunCtx, tool: string, risk: RiskLevel, input: unknown, decision: AuditEntry['decision'], result: ToolResult, startedMs: number): void {
    const entry: AuditEntry = {
      at: new Date(startedMs).toISOString(),
      // A visitor is always audited as a visitor, whatever actor the registry was created with.
      actor: ctx.viewer === 'owner' ? (opts.actor ?? 'owner') : 'visitor',
      tool,
      inputSummary: summarizeInput(input),
      resultSummary: result.ok ? result.summary : `${result.error ?? 'error'}: ${result.summary}`,
      risk,
      decision,
      ok: result.ok,
      durationMs: Math.max(0, now().getTime() - startedMs),
    }
    if (ctx.taskId) entry.task = ctx.taskId
    audit.append(entry)
  }

  async function run(id: string, input: unknown, ctx: RunCtx): Promise<RunResult> {
    const startedMs = now().getTime()
    const tool = tools.get(id)
    // An unknown tool is audited at the highest risk: whoever asked for it is not using the catalogue.
    if (!tool) return refuse(ctx, id, 'critical', input, startedMs, 'unknown_tool', `Unknown tool: ${id}`)

    const verdict = decide(tool, ctx.viewer, policy)
    if (!verdict.allowed) return refuse(ctx, id, tool.riskLevel, input, startedMs, 'denied', `Not allowed: ${verdict.reason}`)

    const invalid = validate(tool.schema, input)
    if (invalid) return refuse(ctx, id, tool.riskLevel, input, startedMs, 'invalid_input', `Invalid input: ${invalid}`)

    if (verdict.needsConfirmation && ctx.confirmed !== true) {
      const result: ToolResult = { ok: false, summary: `${tool.name} needs your confirmation: ${verdict.reason}`, error: 'needs_confirmation' }
      record(ctx, id, tool.riskLevel, input, 'needs_confirmation', result, startedMs)
      return { ...result, decision: 'needs_confirmation' }
    }

    const breaker = breakers.get(id) ?? { failures: 0, openUntil: 0, probing: false }
    breakers.set(id, breaker)
    if (startedMs < breaker.openUntil || breaker.probing) {
      const seconds = Math.max(1, Math.ceil((breaker.openUntil - startedMs) / 1000))
      return refuse(ctx, id, tool.riskLevel, input, startedMs, 'circuit_open', `${tool.name} failed repeatedly; paused for ${seconds} s`)
    }

    breaker.probing = breaker.failures >= BREAKER_THRESHOLD
    const { result, brokeTool } = await execute(tool, input as Record<string, unknown>, ctx)
    breaker.probing = false
    updateBreaker(breaker, brokeTool)
    record(ctx, id, tool.riskLevel, input, verdict.needsConfirmation ? 'confirmed' : 'auto', result, startedMs)
    return { ...result, decision: verdict.level }
  }

  function refuse(ctx: RunCtx, id: string, risk: RiskLevel, input: unknown, startedMs: number, error: string, summary: string): RunResult {
    const result: ToolResult = { ok: false, summary, error }
    record(ctx, id, risk, input, 'denied', result, startedMs)
    return { ...result, decision: 'denied' }
  }

  function updateBreaker(b: Breaker, brokeTool: boolean): void {
    if (!brokeTool) {
      b.failures = 0
      b.openUntil = 0
      return
    }
    // The count is not reset when the breaker opens, so the first call after the pause re-opens it if it fails again.
    b.failures++
    if (b.failures >= BREAKER_THRESHOLD) b.openUntil = now().getTime() + BREAKER_OPEN_MS
  }

  async function execute(tool: JarvisTool, input: Record<string, unknown>, ctx: RunCtx): Promise<{ result: ToolResult; brokeTool: boolean }> {
    const retries = RETRYABLE_RISK.includes(tool.riskLevel) ? clampRetries(tool.retries) : 0
    const toolCtx: ToolCtx = { viewer: ctx.viewer, taskId: ctx.taskId, confirmed: ctx.confirmed === true, signal: ctx.signal, now: ctx.now ?? now }
    let last: ToolFailure = new ToolFailure('tool_error', 'not run')
    for (let attemptNo = 0; attemptNo <= retries; attemptNo++) {
      if (attemptNo > 0) await sleep(BACKOFF_BASE_MS * 2 ** (attemptNo - 1))
      if (ctx.signal?.aborted) return { result: failure(new ToolFailure('cancelled', 'cancelled before it ran')), brokeTool: false }
      try {
        return { result: await attempt(tool, input, toolCtx, timeoutFor(tool)), brokeTool: false }
      } catch (e) {
        last = asFailure(e)
        if (last.code === 'cancelled') return { result: failure(last), brokeTool: false }
      }
    }
    return { result: failure(last), brokeTool: true }
  }

  return {
    register(t) {
      assertTool(t)
      if (tools.has(t.id)) throw new Error(`tool ${t.id} is already registered`)
      tools.set(t.id, t)
    },
    get: id => tools.get(id),
    list: viewer => [...tools.values()].filter(t => decide(t, viewer, policy).allowed),
    run,
  }
}

/** One execution with its own abort signal, which fires on timeout or when the caller aborts. */
async function attempt(tool: JarvisTool, input: Record<string, unknown>, ctx: ToolCtx, timeoutMs: number): Promise<ToolResult> {
  const ctl = new AbortController()
  const onCallerAbort = () => ctl.abort(new ToolFailure('cancelled', 'cancelled by the caller'))
  ctx.signal?.addEventListener('abort', onCallerAbort, { once: true })
  const timer = setTimeout(() => ctl.abort(new ToolFailure('timeout', `timed out after ${timeoutMs} ms`)), timeoutMs)
  const running = Promise.resolve().then(() => tool.execute(input, { ...ctx, signal: ctl.signal }))
  running.catch(() => undefined) // a late rejection after a timeout must not surface as unhandled
  try {
    return checkResult(await Promise.race([running, rejectOnAbort(ctl.signal)]))
  } finally {
    clearTimeout(timer)
    ctx.signal?.removeEventListener('abort', onCallerAbort)
  }
}

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
}

function checkResult(r: unknown): ToolResult {
  if (!isPlainObject(r) || typeof r.ok !== 'boolean') throw new ToolFailure('invalid_result', 'the tool returned no valid result')
  const result: ToolResult = { ok: r.ok, summary: typeof r.summary === 'string' ? r.summary : r.ok ? 'done' : 'failed' }
  if (r.data !== undefined) result.data = r.data
  if (typeof r.error === 'string') result.error = r.error
  return result
}

function asFailure(e: unknown): ToolFailure {
  if (e instanceof ToolFailure) return e
  return new ToolFailure('tool_error', e instanceof Error ? e.message : String(e))
}

function failure(f: ToolFailure): ToolResult {
  return { ok: false, summary: f.message, error: f.code }
}

function timeoutFor(tool: JarvisTool): number {
  const t = tool.timeoutMs
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : DEFAULT_TIMEOUT_MS
}

function clampRetries(n: number | undefined): number {
  return Number.isInteger(n) && (n as number) > 0 ? Math.min(n as number, MAX_RETRIES) : 0
}

function assertTool(t: JarvisTool): void {
  if (!t || typeof t.id !== 'string' || !t.id) throw new Error('a tool needs an id')
  if (typeof t.execute !== 'function') throw new Error(`tool ${t.id} has no execute function`)
  if (!t.schema || t.schema.type !== 'object' || !isPlainObject(t.schema.properties)) throw new Error(`tool ${t.id} needs an object schema`)
  if (!RISK_LEVELS.includes(t.riskLevel)) throw new Error(`tool ${t.id} has an unknown risk level`)
  if (t.scope !== 'public' && t.scope !== 'owner') throw new Error(`tool ${t.id} has an unknown scope`)
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

