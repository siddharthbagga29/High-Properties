/**
 * macOS tools: open a URL in the default browser (`open`), show a notification (`osascript`) and speak (`say`).
 * Each runs one fixed program with an argument vector. The notification text is passed to AppleScript as run-handler
 * arguments, so quotes or `do shell script` in the text are never parsed as AppleScript; `say` reads its text from
 * stdin, so the text can never become an option. On any other platform these tools say so instead of pretending.
 */
import type { JarvisTool, ToolResult } from '../../../core/index'
import { runProcess, type Runner } from '../exec'

export interface MacDeps {
  runner?: Runner
  platform?: NodeJS.Platform
  voice?: () => { voice?: string; rate?: number }
}

/** Removes control characters, collapses whitespace, clips, and keeps a leading '-' from reading as an option. */
export function cleanText(text: unknown, max: number): string {
  const s = String(text ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const clipped = s.length > max ? `${s.slice(0, max - 1)}…` : s
  return clipped.replace(/^-+/, m => '–'.repeat(m.length))
}

const NOTIFY_SCRIPT = ['on run argv', 'display notification (item 1 of argv) with title (item 2 of argv)', 'end run']

/** osascript argv: the script is constant; the message and title travel as data. */
export function notifyArgs(message: string, title: string): string[] {
  return [...NOTIFY_SCRIPT.flatMap(line => ['-e', line]), cleanText(message, 240) || 'Jarvis', cleanText(title, 80) || 'Jarvis']
}

export function sayArgs(opts: { voice?: string; rate?: number }): string[] {
  const args: string[] = []
  if (opts.voice && /^[A-Za-z][A-Za-z0-9 ()._-]{0,40}$/.test(opts.voice)) args.push('-v', opts.voice)
  if (typeof opts.rate === 'number' && opts.rate >= 80 && opts.rate <= 400) args.push('-r', String(Math.round(opts.rate)))
  return args
}

export function checkOpenUrl(raw: unknown): { ok: true; url: string } | { ok: false; reason: string } {
  let url: URL
  try {
    url = new URL(String(raw ?? '').trim())
  } catch {
    return { ok: false, reason: 'not a valid URL' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: `only http and https URLs can be opened (got ${url.protocol})` }
  if (url.username || url.password) return { ok: false, reason: 'URLs with embedded credentials are refused' }
  return { ok: true, url: url.toString() }
}

function unsupported(tool: string, program: string, platform: string): ToolResult {
  return { ok: false, summary: `${tool} needs macOS (${program}); this machine is ${platform}`, error: 'unsupported_platform' }
}

export function macTools(deps: MacDeps = {}): JarvisTool[] {
  const runner = deps.runner ?? runProcess
  const platform = deps.platform ?? process.platform

  const open: JarvisTool = {
    id: 'open.url',
    name: 'Open a link',
    description: 'Open an http(s) link in your default browser on the Mac.',
    schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    riskLevel: 'low',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 10_000,
    async execute(input, ctx) {
      const check = checkOpenUrl(input.url)
      if (!check.ok) return { ok: false, summary: `Refused: ${check.reason}`, error: 'invalid_url' }
      if (platform !== 'darwin') return unsupported('open.url', 'open', platform)
      const r = await runner('open', [check.url], { timeoutMs: 10_000, signal: ctx.signal })
      return r.code === 0 ? { ok: true, summary: `opened ${check.url}` } : { ok: false, summary: `open exited with ${r.code}: ${r.stderr.trim().slice(0, 200)}`, error: 'nonzero_exit' }
    },
  }

  const notify: JarvisTool = {
    id: 'notify',
    name: 'Show a notification',
    description: 'Show a macOS notification.',
    schema: { type: 'object', properties: { message: { type: 'string' }, title: { type: 'string' } }, required: ['message'] },
    riskLevel: 'low',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 10_000,
    async execute(input, ctx) {
      if (platform !== 'darwin') return unsupported('notify', 'osascript', platform)
      const r = await runner('osascript', notifyArgs(String(input.message), String(input.title ?? 'Jarvis')), { timeoutMs: 10_000, signal: ctx.signal })
      return r.code === 0 ? { ok: true, summary: 'notification shown' } : { ok: false, summary: `osascript exited with ${r.code}: ${r.stderr.trim().slice(0, 200)}`, error: 'nonzero_exit' }
    },
  }

  const say: JarvisTool = {
    id: 'say',
    name: 'Speak aloud',
    description: 'Speak a sentence through the Mac speakers with macOS `say`.',
    schema: { type: 'object', properties: { text: { type: 'string' }, voice: { type: 'string' } }, required: ['text'] },
    riskLevel: 'low',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 60_000,
    async execute(input, ctx) {
      const text = cleanText(input.text, 1000)
      if (!text) return { ok: false, summary: 'nothing to say', error: 'empty' }
      if (platform !== 'darwin') return unsupported('say', 'say', platform)
      const configured = deps.voice?.() ?? {}
      const args = sayArgs({ ...configured, voice: typeof input.voice === 'string' ? input.voice : configured.voice })
      const r = await runner('say', args, { input: text, timeoutMs: 60_000, signal: ctx.signal })
      return r.code === 0 ? { ok: true, summary: `spoke ${text.length} characters` } : { ok: false, summary: `say exited with ${r.code}: ${r.stderr.trim().slice(0, 200)}`, error: 'nonzero_exit' }
    },
  }

  return [open, notify, say]
}
