/**
 * Language models on the Mac, from most private to least: Ollama (local, never pulled automatically), the Anthropic
 * API when ANTHROPIC_API_KEY is set, the `claude` CLI when it is on PATH (headless, read-only tools), and the rules
 * provider, which always answers from the record. route() from the core picks among whatever is actually present.
 */
import { totalmem } from 'node:os'
import { anthropicProvider, claudeCodeProvider, DEFAULT_ROUTES, ollamaProvider, ruleProvider, type CommandRunner, type LLMProvider, type RouteTable } from '../../core/index'
import type { AgentConfig } from './config'
import { runProcess, whichSync, type Runner } from './exec'

const GB = 1024 ** 3

/**
 * The agent's route table: the core defaults, except that a conversation on the Mac can also go to the `claude`
 * CLI (the page-only `sample` provider does not exist here). Local Ollama stays first; 'sensitive' stays local-only
 * (core route() enforces that whatever the table says).
 */
export const AGENT_ROUTES: RouteTable = { ...DEFAULT_ROUTES, conversation: ['ollama', 'anthropic', 'claude-code', 'rules'] }

export interface ModelRecommendation { sizeClass: '7-8B' | '14B' | '32B'; memoryGb: number; suggestions: string[]; reason: string }

/** <=16 GB: a 7-8B model; up to 63 GB: 14B; 64 GB and more: 32B class. A suggestion only; nothing is downloaded. */
export function recommendModel(totalBytes: number = totalmem()): ModelRecommendation {
  const gb = Math.round(totalBytes / GB)
  if (gb <= 16) return { sizeClass: '7-8B', memoryGb: gb, suggestions: ['qwen3:8b', 'llama3.1:8b'], reason: `${gb} GB of memory: a 7-8B model leaves room for everything else` }
  if (gb < 64) return { sizeClass: '14B', memoryGb: gb, suggestions: ['qwen3:14b', 'phi4:14b'], reason: `${gb} GB of memory: a 14B model fits comfortably` }
  return { sizeClass: '32B', memoryGb: gb, suggestions: ['qwen3:32b', 'qwen2.5:32b'], reason: `${gb} GB of memory: a 32B-class model fits` }
}

const CLASS_MAX_B: Record<ModelRecommendation['sizeClass'], number> = { '7-8B': 9, '14B': 15, '32B': 34 }

/** Parameter count in billions from a tag such as "qwen3:14b" or "llama3.1:8b-instruct-q4_K_M". */
export function paramsOf(name: string): number | null {
  const m = name.toLowerCase().match(/[:\-_](\d+(?:\.\d+)?)b\b/)
  return m ? Number(m[1]) : null
}

/**
 * The model to use: the configured one if it is installed; otherwise the largest installed model that fits the
 * recommended class; otherwise the smallest installed model. Undefined when nothing is installed (never pulled).
 */
export function pickOllamaModel(installed: string[], rec: ModelRecommendation, configured?: string): string | undefined {
  if (!installed.length) return undefined
  if (configured) {
    const hit = installed.find(n => n === configured || n === `${configured}:latest`)
    return hit
  }
  const cap = CLASS_MAX_B[rec.sizeClass]
  const sized = installed.map(name => ({ name, b: paramsOf(name) })).filter(x => !/embed/i.test(x.name))
  const fitting = sized.filter(x => x.b !== null && x.b <= cap).sort((a, b) => (b.b as number) - (a.b as number))
  if (fitting.length) return fitting[0].name
  const unknown = sized.find(x => x.b === null)
  if (unknown) return unknown.name
  return sized.sort((a, b) => (a.b as number) - (b.b as number))[0]?.name
}

export interface OllamaStatus { running: boolean; host: string; installed: string[]; error?: string }

export async function detectOllama(host: string, f: typeof fetch = fetch, timeoutMs = 1500): Promise<OllamaStatus> {
  const base = host.replace(/\/+$/, '')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await f(`${base}/api/tags`, { signal: ctl.signal })
    if (!res.ok) return { running: false, host: base, installed: [], error: `HTTP ${res.status}` }
    const body = (await res.json()) as { models?: Array<{ name?: string; model?: string }> }
    return { running: true, host: base, installed: (body.models ?? []).map(m => m.name ?? m.model ?? '').filter(Boolean) }
  } catch (e) {
    return { running: false, host: base, installed: [], error: (e as Error).name === 'AbortError' ? 'not reachable' : (e as Error).message }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Arguments that keep the `claude` CLI a question-answering helper: only the read-only file tools, no MCP servers,
 * no permission prompts (anything else is refused), no saved session. Never --dangerously-skip-permissions.
 */
export const CLAUDE_CODE_ARGS = ['--tools', 'Read,Grep,Glob', '--allowedTools', 'Read,Grep,Glob', '--permission-mode', 'dontAsk', '--strict-mcp-config', '--no-session-persistence']

export function claudeRunner(bin: string, cwd: string, runner: Runner = runProcess, timeoutMs = 180_000): CommandRunner {
  return async (args, stdin, signal) => {
    // The CLI keeps its own login (keychain or ANTHROPIC_API_KEY); only the agent's own token is withheld.
    const { JARVIS_TOKEN: _withheld, ...env } = process.env
    const r = await runner(bin, args, { cwd, input: stdin, signal, timeoutMs, env, maxOutput: 2 * 1024 * 1024 })
    return { code: r.timedOut ? 124 : r.code, stdout: r.stdout }
  }
}

export interface ModelReport {
  memoryGb: number
  recommendation: ModelRecommendation
  ollama: OllamaStatus & { chosen?: string; note: string }
  anthropic: { configured: boolean; model: string }
  claudeCode: { path: string | null; enabled: boolean }
  order: string[]
  localOnly: boolean
}

export interface ModelDeps {
  env?: NodeJS.ProcessEnv
  fetch?: typeof fetch
  totalBytes?: number
  which?: (name: string) => string | null
  runner?: Runner
  cwd: string
  rules: (q: string) => string
}

/** Builds the provider list for route(). Detection is cheap and is repeated by the caller every minute. */
export async function buildProviders(models: AgentConfig['models'], deps: ModelDeps): Promise<{ providers: LLMProvider[]; report: ModelReport }> {
  const env = deps.env ?? process.env
  const f = deps.fetch ?? fetch
  const rec = recommendModel(deps.totalBytes ?? totalmem())
  const providers: LLMProvider[] = []

  const ollama = await detectOllama(models.ollamaHost, f)
  const chosen = pickOllamaModel(ollama.installed, rec, models.ollamaModel)
  let note: string
  if (!ollama.running) note = `Ollama is not running at ${ollama.host}. Optional: install it and run \`ollama pull ${rec.suggestions[0]}\` yourself.`
  else if (!chosen && models.ollamaModel) note = `${models.ollamaModel} is configured but not installed; run \`ollama pull ${models.ollamaModel}\` yourself.`
  else if (!chosen) note = `Ollama is running with no models. For this Mac (${rec.reason}) run \`ollama pull ${rec.suggestions[0]}\` yourself.`
  else note = `Using ${chosen}.${paramsOf(chosen) !== null && (paramsOf(chosen) as number) > CLASS_MAX_B[rec.sizeClass] ? ' It is larger than this Mac\'s recommended class and may be slow.' : ''}`
  if (chosen) providers.push(ollamaProvider({ host: ollama.host, model: chosen, fetch: f }))
  const small = models.ollamaSmallModel && ollama.installed.includes(models.ollamaSmallModel) ? models.ollamaSmallModel : undefined
  if (small) providers.push(ollamaProvider({ host: ollama.host, model: small, fetch: f, id: 'ollama-small' }))

  const apiKey = env.ANTHROPIC_API_KEY?.trim()
  if (apiKey && !models.localOnly) providers.push(anthropicProvider({ apiKey, model: models.anthropicModel, fetch: f }))

  const claudePath = models.claudeCode && !models.localOnly ? (deps.which ?? (n => whichSync(n, env)))('claude') : null
  if (claudePath) providers.push(claudeCodeProvider({ run: claudeRunner(claudePath, deps.cwd, deps.runner), extraArgs: CLAUDE_CODE_ARGS }))

  providers.push(ruleProvider(deps.rules))

  return {
    providers,
    report: {
      memoryGb: rec.memoryGb,
      recommendation: rec,
      ollama: { ...ollama, chosen, note },
      anthropic: { configured: Boolean(apiKey) && !models.localOnly, model: models.anthropicModel },
      claudeCode: { path: claudePath, enabled: models.claudeCode && !models.localOnly },
      order: providers.map(p => p.id),
      localOnly: models.localOnly,
    },
  }
}
