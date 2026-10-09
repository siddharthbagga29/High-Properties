/**
 * The one way the agent starts a process: spawn with an argument vector and shell: false, so `;`, `|`, `$(…)`,
 * quotes and globs are passed through as plain text, never interpreted. Secrets are stripped from the child's env.
 */
import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'

export interface RunOptions {
  cwd?: string
  input?: string
  timeoutMs?: number
  signal?: AbortSignal
  env?: NodeJS.ProcessEnv
  /** Bytes kept from each of stdout and stderr. */
  maxOutput?: number
}

export interface RunResult { code: number; stdout: string; stderr: string; timedOut: boolean; truncated: boolean }
export type Runner = (program: string, args: string[], opts?: RunOptions) => Promise<RunResult>

/** Environment variables a child process never inherits. */
const SECRET_ENV = /^(JARVIS_TOKEN|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|GH_TOKEN|GITHUB_TOKEN|NPM_TOKEN)$|(_TOKEN|_SECRET|_PASSWORD|_API_KEY|_PRIVATE_KEY)$/i

export function childEnv(base: NodeJS.ProcessEnv = process.env, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(base)) if (v !== undefined && !SECRET_ENV.test(k)) env[k] = v
  return { ...env, ...extra }
}

const DEFAULT_MAX_OUTPUT = 256 * 1024

export const runProcess: Runner = (program, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const maxOutput = opts.maxOutput ?? DEFAULT_MAX_OUTPUT
    let child
    try {
      child = spawn(program, args, {
        cwd: opts.cwd,
        env: opts.env ?? childEnv(),
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (e) {
      reject(e)
      return
    }
    const out: Buffer[] = []
    const err: Buffer[] = []
    let outLen = 0
    let errLen = 0
    let truncated = false
    let timedOut = false
    const keep = (chunks: Buffer[], len: number, chunk: Buffer): number => {
      if (len >= maxOutput) {
        truncated = true
        return len
      }
      const part = chunk.subarray(0, maxOutput - len)
      if (part.length < chunk.length) truncated = true
      chunks.push(part)
      return len + part.length
    }
    child.stdout.on('data', (c: Buffer) => (outLen = keep(out, outLen, c)))
    child.stderr.on('data', (c: Buffer) => (errLen = keep(err, errLen, c)))
    const kill = () => {
      if (child.exitCode === null) child.kill('SIGTERM')
      setTimeout(() => child.exitCode === null && child.kill('SIGKILL'), 2000).unref()
    }
    const timer = opts.timeoutMs ? setTimeout(() => ((timedOut = true), kill()), opts.timeoutMs) : undefined
    const onAbort = () => kill()
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    child.on('error', e => {
      if (timer) clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      reject(e)
    })
    child.on('close', code => {
      if (timer) clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      resolve({ code: code ?? -1, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), timedOut, truncated })
    })
    child.stdin.on('error', () => undefined) // a child that exits without reading stdin must not crash us
    child.stdin.end(opts.input ?? '')
  })

/** Full path of an executable found on PATH, or null. */
export function whichSync(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, name)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // keep looking
    }
  }
  return null
}
