/**
 * Paths and configuration for the local Jarvis agent. Everything private lives in ~/.jarvis (or JARVIS_HOME):
 * the token, config.json, tasks, memory, reminders and the audit log. Secrets come only from the environment.
 */
import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJson, writeJsonAtomic } from './store'

/** perspective-engine/jarvis */
export const JARVIS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
/** perspective-engine/ (the PE repository directory this agent belongs to) */
export const PE_REPO_DIR = resolve(JARVIS_DIR, '..')
export const DEFAULT_PE_STATE = join(PE_REPO_DIR, 'city', 'public', 'state.json')
export const DEFAULT_PORT = 7777
/** The only address the agent may listen on. */
export const LOOPBACK = '127.0.0.1'

export interface ModelConfig {
  ollamaHost: string
  /** Pin a model; otherwise the best installed model for this Mac's memory is chosen. Never pulled automatically. */
  ollamaModel?: string
  /** Optional small model for classification. */
  ollamaSmallModel?: string
  anthropicModel: string
  /** Use the `claude` CLI when it is on PATH. */
  claudeCode: boolean
  /** Route every open question to local providers only (Ollama, rules). */
  localOnly: boolean
}

export interface AgentConfig {
  /** Roots the read tools (fs.list/read/search, ls) may see. */
  roots: string[]
  /** Roots the write tools (fs.write/overwrite/delete) and command working directories may use. */
  projectRoots: string[]
  peStatePath: string
  port: number
  models: ModelConfig
  voice: { say: boolean; voice?: string; rate?: number }
  policy: { preApproved: string[]; denied: string[] }
  browser: { headless: boolean; channel?: string; downloadDir: string }
  reminders: { intervalMs: number }
}

export interface Paths {
  home: string
  token: string
  config: string
  tasks: string
  memory: string
  audit: string
  reminders: string
  session: string
  pid: string
  backups: string
  trash: string
}

export function jarvisHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.JARVIS_HOME?.trim()
  return fromEnv ? resolve(expandHome(fromEnv)) : join(homedir(), '.jarvis')
}

export function paths(home: string): Paths {
  return {
    home,
    token: join(home, 'token'),
    config: join(home, 'config.json'),
    tasks: join(home, 'tasks.json'),
    memory: join(home, 'memory.jsonl'),
    audit: join(home, 'audit.jsonl'),
    reminders: join(home, 'reminders.json'),
    session: join(home, 'session.json'),
    pid: join(home, 'agent.pid'),
    backups: join(home, 'backups'),
    trash: join(home, 'trash'),
  }
}

/** Creates the private directory (0700) if needed and tightens it if it already exists. */
export function ensureHome(home: string): void {
  mkdirSync(home, { recursive: true, mode: 0o700 })
  try {
    chmodSync(home, 0o700)
  } catch {
    // a directory we cannot chmod (e.g. owned by someone else) is reported by `jarvis doctor`
  }
}

export function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

export function defaultConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  return {
    roots: [PE_REPO_DIR],
    projectRoots: [PE_REPO_DIR],
    peStatePath: DEFAULT_PE_STATE,
    port: DEFAULT_PORT,
    models: {
      ollamaHost: 'http://127.0.0.1:11434',
      anthropicModel: 'claude-opus-5-5',
      claudeCode: true,
      localOnly: false,
    },
    voice: { say: true },
    policy: { preApproved: [], denied: [] },
    browser: { headless: true, downloadDir: join(homedirFor(env), 'Downloads', 'jarvis') },
    reminders: { intervalMs: 15_000 },
  }
}

function homedirFor(env: NodeJS.ProcessEnv): string {
  return env.HOME?.trim() || homedir()
}

type Partialish = Partial<Omit<AgentConfig, 'models' | 'voice' | 'policy' | 'browser' | 'reminders'>> & {
  models?: Partial<ModelConfig>
  voice?: Partial<AgentConfig['voice']>
  policy?: Partial<AgentConfig['policy']>
  browser?: Partial<AgentConfig['browser']>
  reminders?: Partial<AgentConfig['reminders']>
}

/**
 * Loads config.json (writing the defaults the first time so the owner has a file to edit), then applies environment
 * overrides. Invalid values fall back to defaults rather than widening anything.
 */
export function loadConfig(home: string, env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const file = paths(home).config
  const defaults = defaultConfig(env)
  if (!existsSync(file)) writeJsonAtomic(file, defaults)
  const raw = readJson<Partialish>(file, {})
  const cfg: AgentConfig = {
    roots: absoluteList(raw.roots, defaults.roots),
    projectRoots: absoluteList(raw.projectRoots, defaults.projectRoots),
    peStatePath: absolutePath(raw.peStatePath, defaults.peStatePath),
    port: validPort(raw.port) ?? defaults.port,
    models: {
      ollamaHost: str(raw.models?.ollamaHost) ?? defaults.models.ollamaHost,
      ollamaModel: str(raw.models?.ollamaModel),
      ollamaSmallModel: str(raw.models?.ollamaSmallModel),
      anthropicModel: str(raw.models?.anthropicModel) ?? defaults.models.anthropicModel,
      claudeCode: typeof raw.models?.claudeCode === 'boolean' ? raw.models.claudeCode : defaults.models.claudeCode,
      localOnly: raw.models?.localOnly === true,
    },
    voice: {
      say: raw.voice?.say !== false,
      voice: str(raw.voice?.voice),
      rate: typeof raw.voice?.rate === 'number' && raw.voice.rate >= 80 && raw.voice.rate <= 400 ? raw.voice.rate : undefined,
    },
    policy: { preApproved: strList(raw.policy?.preApproved), denied: strList(raw.policy?.denied) },
    browser: {
      headless: raw.browser?.headless !== false,
      channel: str(raw.browser?.channel),
      downloadDir: absolutePath(raw.browser?.downloadDir, defaults.browser.downloadDir),
    },
    reminders: {
      intervalMs: typeof raw.reminders?.intervalMs === 'number' && raw.reminders.intervalMs >= 1000 ? raw.reminders.intervalMs : defaults.reminders.intervalMs,
    },
  }

  // Environment overrides (names in jarvis/.env.example).
  const port = validPort(env.JARVIS_PORT ? Number(env.JARVIS_PORT) : undefined)
  if (port !== undefined) cfg.port = port
  if (env.JARVIS_PE_STATE?.trim()) cfg.peStatePath = resolve(expandHome(env.JARVIS_PE_STATE.trim()))
  if (env.OLLAMA_HOST?.trim()) cfg.models.ollamaHost = normaliseOllamaHost(env.OLLAMA_HOST.trim())
  if (env.JARVIS_OLLAMA_MODEL?.trim()) cfg.models.ollamaModel = env.JARVIS_OLLAMA_MODEL.trim()
  if (env.JARVIS_ANTHROPIC_MODEL?.trim()) cfg.models.anthropicModel = env.JARVIS_ANTHROPIC_MODEL.trim()
  if (env.JARVIS_CLAUDE_CODE === '0') cfg.models.claudeCode = false
  if (env.JARVIS_LOCAL_ONLY === '1') cfg.models.localOnly = true
  if (env.JARVIS_BROWSER_HEADLESS === '0') cfg.browser.headless = false
  if (env.JARVIS_SAY === '0') cfg.voice.say = false
  return cfg
}

/** OLLAMA_HOST is often written without a scheme ("127.0.0.1:11434"). */
export function normaliseOllamaHost(h: string): string {
  return /^https?:\/\//i.test(h) ? h : `http://${h}`
}

function validPort(p: unknown): number | undefined {
  return typeof p === 'number' && Number.isInteger(p) && p >= 0 && p <= 65535 ? p : undefined
}

function str(x: unknown): string | undefined {
  return typeof x === 'string' && x.trim() ? x.trim() : undefined
}

function strList(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim()) : []
}

function absolutePath(x: unknown, fallback: string): string {
  const s = str(x)
  if (!s) return fallback
  const p = expandHome(s)
  return isAbsolute(p) ? resolve(p) : fallback
}

function absoluteList(x: unknown, fallback: string[]): string[] {
  const list = strList(x).map(expandHome).filter(p => isAbsolute(p)).map(p => resolve(p))
  return list.length ? list : fallback
}
