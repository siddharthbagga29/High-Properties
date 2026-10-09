import { redact } from './audit'
import { stripWrapped } from './injection'
import { clip } from './text'
import type { ChatMessage, ChatOptions, LLMProvider } from './types'

type FetchFn = typeof fetch

/** What a provider's chat resolves with. `provider` says who actually answered when a fallback chain is used. */
export interface ChatResult { text: string; provider?: string; truncated?: boolean }

export class ProviderError extends Error {
  readonly provider: string
  readonly status?: number
  readonly code?: string
  constructor(provider: string, message: string, extra: { status?: number; code?: string } = {}) {
    // Provider errors end up in logs, so anything key-like in a response body is masked here.
    super(`${provider}: ${redact(message)}`)
    this.name = 'ProviderError'
    this.provider = provider
    if (extra.status !== undefined) this.status = extra.status
    if (extra.code !== undefined) this.code = extra.code
  }
}

function resolveFetch(f?: FetchFn): FetchFn | undefined {
  if (f) return f
  const g = (globalThis as { fetch?: FetchFn }).fetch
  return g ? g.bind(globalThis) : undefined
}

function requireFetch(provider: string, f?: FetchFn): FetchFn {
  const resolved = resolveFetch(f)
  if (!resolved) throw new ProviderError(provider, 'no fetch implementation is available')
  return resolved
}

function throwIfAborted(provider: string, signal?: AbortSignal): void {
  if (signal?.aborted) throw new ProviderError(provider, 'cancelled', { code: 'cancelled' })
}

function systemText(messages: ChatMessage[]): string {
  return messages.filter(m => m.role === 'system').map(m => m.content.trim()).filter(Boolean).join('\n\n')
}

/** Non-system turns with consecutive same-role turns merged and leading assistant turns dropped. */
function dialogue(messages: ChatMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const m of messages) {
    if (m.role === 'system' || !m.content.trim()) continue
    const role = m.role
    if (!out.length && role === 'assistant') continue
    const last = out[out.length - 1]
    if (last && last.role === role) last.content = `${last.content}\n\n${m.content}`
    else out.push({ role, content: m.content })
  }
  return out
}

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return stripWrapped(messages[i].content)
  return ''
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

async function isAvailable(p: LLMProvider): Promise<boolean> {
  try {
    return await p.available()
  } catch {
    return false
  }
}

function isCancellation(e: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  const err = e as { code?: string; name?: string } | null
  return err?.code === 'cancelled' || err?.name === 'AbortError'
}

// ---------- rules ----------

/** The floor of every chain: deterministic answers from the record, on the device, always available. */
export function ruleProvider(answer: (q: string) => string): LLMProvider {
  return {
    id: 'rules',
    local: true,
    available: async () => true,
    async chat(messages, opts: ChatOptions = {}) {
      throwIfAborted('rules', opts.signal)
      const text = answer(lastUserText(messages))
      opts.onText?.(text)
      return { text }
    },
  }
}

// ---------- claude.ai artifact `sample` ----------

type SampleTurn = { role: 'user' | 'assistant'; content: string }
type SampleFn = (
  input: string | SampleTurn[],
  opts?: { onText?: (u: { text: string; delta?: string } | string) => void; signal?: AbortSignal; modelTier?: string; cache?: boolean },
) => Promise<{ text: string; truncated?: boolean }>

/** The sample capability has no system role, so standing instructions travel as a leading user turn. */
export function toSampleTurns(messages: ChatMessage[]): SampleTurn[] {
  const system = systemText(messages)
  const turns = dialogue(messages)
  if (system) {
    if (turns[0]?.role === 'user') turns[0] = { role: 'user', content: `${system}\n\n${turns[0].content}` }
    else turns.unshift({ role: 'user', content: system })
  }
  return turns
}

export function sampleProvider(sample: unknown): LLMProvider {
  const fn = typeof sample === 'function' ? (sample as SampleFn) : null
  return {
    id: 'sample',
    local: false,
    available: async () => fn !== null,
    async chat(messages, opts: ChatOptions = {}) {
      if (!fn) throw new ProviderError('sample', 'the sample capability is not available in this view')
      throwIfAborted('sample', opts.signal)
      const turns = toSampleTurns(messages)
      if (!turns.length || turns[turns.length - 1].role !== 'user') throw new ProviderError('sample', 'the conversation must end with a user turn')
      // Only defined options are passed: the runtime rejects option members it cannot use.
      const sampleOpts: NonNullable<Parameters<SampleFn>[1]> = { cache: false }
      if (opts.signal) sampleOpts.signal = opts.signal
      if (opts.tier) sampleOpts.modelTier = opts.tier
      const onText = opts.onText
      if (onText) sampleOpts.onText = u => onText(typeof u === 'string' ? u : u.text)
      try {
        const r = await fn(turns, sampleOpts)
        const result: ChatResult = { text: r.text, truncated: Boolean(r.truncated) }
        return result
      } catch (e) {
        const err = e as { code?: string; message?: string }
        throw new ProviderError('sample', err?.message ?? String(e), { code: err?.code ?? 'upstream_error' })
      }
    },
  }
}

// ---------- Ollama ----------

function isLoopback(host: string): boolean {
  try {
    const h = new URL(host).hostname
    return h === 'localhost' || h === '::1' || h === '[::1]' || /^127\./.test(h)
  } catch {
    return false
  }
}

function sameModel(installed: string, wanted: string): boolean {
  return installed === wanted || installed === `${wanted}:latest` || wanted === `${installed}:latest`
}

const AVAILABILITY_TIMEOUT_MS = 2_000

/** Ollama over HTTP. It is local only when the host is this machine; a remote Ollama is treated like any cloud model. */
export function ollamaProvider(opts: { host?: string; model: string; fetch?: FetchFn; id?: string }): LLMProvider {
  const host = (opts.host ?? 'http://127.0.0.1:11434').replace(/\/+$/, '')
  const id = opts.id ?? 'ollama'
  return {
    id,
    local: isLoopback(host),
    async available() {
      const f = resolveFetch(opts.fetch)
      if (!f) return false
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), AVAILABILITY_TIMEOUT_MS)
      try {
        const res = await f(`${host}/api/tags`, { signal: ctl.signal })
        if (!res.ok) return false
        const body = (await res.json()) as { models?: Array<{ name?: string; model?: string }> }
        return (body.models ?? []).some(m => sameModel(m.name ?? m.model ?? '', opts.model))
      } catch {
        return false
      } finally {
        clearTimeout(timer)
      }
    },
    async chat(messages, o: ChatOptions = {}) {
      const f = requireFetch(id, opts.fetch)
      throwIfAborted(id, o.signal)
      const body: Record<string, unknown> = { model: opts.model, messages: messages.map(m => ({ role: m.role, content: m.content })), stream: false }
      if (o.maxTokens) body.options = { num_predict: o.maxTokens }
      const res = await f(`${host}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: o.signal })
      if (!res.ok) throw new ProviderError(id, `HTTP ${res.status}: ${clip(await safeText(res), 200)}`, { status: res.status })
      const data = (await res.json()) as { message?: { content?: string }; error?: string }
      const text = data.message?.content
      if (typeof text !== 'string') throw new ProviderError(id, data.error ?? 'the response had no message')
      o.onText?.(text)
      return { text }
    },
  }
}

// ---------- Anthropic Messages API ----------

export const ANTHROPIC_VERSION = '2023-06-01'

export function anthropicProvider(opts: { apiKey: string; model: string; fetch?: FetchFn; baseUrl?: string; maxTokens?: number }): LLMProvider {
  const base = (opts.baseUrl ?? 'https://api.anthropic.com').replace(/\/+$/, '')
  return {
    id: 'anthropic',
    local: false,
    available: async () => Boolean(opts.apiKey?.trim()) && Boolean(opts.model) && Boolean(resolveFetch(opts.fetch)),
    async chat(messages, o: ChatOptions = {}) {
      if (!opts.apiKey?.trim()) throw new ProviderError('anthropic', 'no API key configured')
      const f = requireFetch('anthropic', opts.fetch)
      throwIfAborted('anthropic', o.signal)
      const system = systemText(messages)
      const turns = dialogue(messages)
      if (!turns.length) throw new ProviderError('anthropic', 'there is no user message to send')
      const body: Record<string, unknown> = { model: opts.model, max_tokens: o.maxTokens ?? opts.maxTokens ?? 1024, messages: turns }
      if (system) body.system = system
      const res = await f(`${base}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': opts.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
        body: JSON.stringify(body),
        signal: o.signal,
      })
      if (!res.ok) throw new ProviderError('anthropic', `HTTP ${res.status}: ${clip(await errorMessage(res), 300)}`, { status: res.status })
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; stop_reason?: string }
      const text = (data.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('')
      if (!text) throw new ProviderError('anthropic', `empty response (stop_reason ${data.stop_reason ?? 'unknown'})`)
      o.onText?.(text)
      const result: ChatResult = { text, truncated: data.stop_reason === 'max_tokens' }
      return result
    },
  }
}

async function errorMessage(res: Response): Promise<string> {
  const raw = await safeText(res)
  try {
    const parsed = JSON.parse(raw) as { error?: { type?: string; message?: string } }
    return [parsed.error?.type, parsed.error?.message].filter(Boolean).join(': ') || raw
  } catch {
    return raw
  }
}

// ---------- Claude Code CLI ----------

export type CommandRunner = (args: string[], stdin: string, signal?: AbortSignal) => Promise<{ code: number; stdout: string }>

/**
 * `claude -p --output-format json`, run by an injected runner so the core never touches child_process.
 * Not local: Claude Code sends the prompt to Anthropic.
 */
export function claudeCodeProvider(opts: { run: CommandRunner; model?: string; extraArgs?: string[] }): LLMProvider {
  let availability: Promise<boolean> | null = null
  return {
    id: 'claude-code',
    local: false,
    available() {
      availability ??= opts
        .run(['--version'], '')
        .then(r => r.code === 0)
        .catch(() => false)
      return availability
    },
    async chat(messages, o: ChatOptions = {}) {
      throwIfAborted('claude-code', o.signal)
      const system = systemText(messages)
      const args = ['-p', '--output-format', 'json']
      if (opts.model) args.push('--model', opts.model)
      if (system) args.push('--append-system-prompt', system)
      args.push(...(opts.extraArgs ?? []))
      const { code, stdout } = await opts.run(args, transcript(messages), o.signal)
      const parsed = parseClaudeJson(stdout)
      if (code !== 0 || !parsed || parsed.is_error || typeof parsed.result !== 'string') {
        throw new ProviderError('claude-code', `exit ${code}: ${clip(parsed?.result ?? stdout, 300)}`, { code: parsed?.subtype ?? 'error' })
      }
      o.onText?.(parsed.result)
      return { text: parsed.result }
    },
  }
}

function transcript(messages: ChatMessage[]): string {
  const turns = dialogue(messages)
  if (turns.length === 1) return turns[0].content
  return turns.map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`).join('\n\n')
}

function parseClaudeJson(stdout: string): { result?: string; is_error?: boolean; subtype?: string } | null {
  const candidates = [stdout.trim(), ...stdout.trim().split('\n').reverse()]
  for (const c of candidates) {
    try {
      const v = JSON.parse(c) as unknown
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as { result?: string; is_error?: boolean; subtype?: string }
    } catch {
      // try the next candidate: some versions print warnings before the JSON line
    }
  }
  return null
}

// ---------- fallback ----------

/** Tries each provider in order and returns the first that is available and answers. Cancellation stops the chain. */
export function withFallback(providers: LLMProvider[], id?: string): LLMProvider {
  const chainId = id ?? `fallback(${providers.map(p => p.id).join(',')})`
  return {
    id: chainId,
    local: providers.length > 0 && providers.every(p => p.local),
    async available() {
      for (const p of providers) if (await isAvailable(p)) return true
      return false
    },
    async chat(messages, opts: ChatOptions = {}) {
      const failures: string[] = []
      for (const p of providers) {
        throwIfAborted(chainId, opts.signal)
        if (!(await isAvailable(p))) {
          failures.push(`${p.id} unavailable`)
          continue
        }
        try {
          const r = await p.chat(messages, opts)
          const result: ChatResult = { ...r, provider: (r as ChatResult).provider ?? p.id }
          return result
        } catch (e) {
          if (isCancellation(e, opts.signal)) throw e
          failures.push(e instanceof ProviderError ? e.message : `${p.id}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      throw new ProviderError(chainId, `no provider answered (${failures.join('; ') || 'no providers'})`)
    },
  }
}
