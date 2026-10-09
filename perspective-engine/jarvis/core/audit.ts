import { clip } from './text'
import type { AuditEntry } from './types'

type Rule = [RegExp, string | ((match: string, ...groups: string[]) => string)]

/** Values that follow a credential-like key: `password=…`, `"api_key": "…"`, `Authorization: …`. */
const KEY_VALUE =
  /((?:password|passwd|pwd|passphrase|secret|client[_-]?secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|authorization|auth)["']?\s*[:=]\s*["']?)(?!\[REDACTED)([^\s"',;&}]+)/gi

/** Natural language: "my password is hunter2". Passwords may be plain words, so their value is always masked. */
const PASSWORD_PHRASE = /\b((?:password|passcode|passphrase|pin)\s+(?:is|was)\s+)(?!\[REDACTED)(\S+)/gi
/** "the token is ab12…": masked when the value looks key-like (a digit, - or _, or 16+ characters), so "the token is expired" survives. */
const TOKEN_PHRASE = /\b((?:token|api key|secret key|access key)\s+(?:is|was)\s+)(?!\[REDACTED)((?=\S*[\d_-]|\S{16,})\S+)/gi

/** Long base64-ish runs; masked only when they mix upper case, lower case and digits, so paths and words survive. */
const LONG_TOKEN = /(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{40,}={0,2}(?![A-Za-z0-9+/_-])/g

const RULES: Rule[] = [
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g, '[REDACTED PRIVATE KEY]'],
  [/\b(https?:\/\/[^\s:/@]+:)[^\s@/]+@/gi, '$1[REDACTED]@'],
  [/\bBearer\s+[A-Za-z0-9\-._~+/]{8,}=*/gi, 'Bearer [REDACTED]'],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/g, '[REDACTED KEY]'],
  [/\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{16,}/g, '[REDACTED KEY]'],
  [/\b[rs]k_(?:live|test)_[A-Za-z0-9]{10,}/g, '[REDACTED KEY]'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[REDACTED KEY]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[REDACTED TOKEN]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED TOKEN]'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, '[REDACTED TOKEN]'],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, '[REDACTED KEY]'],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, '[REDACTED JWT]'],
  [KEY_VALUE, '$1[REDACTED]'],
  [PASSWORD_PHRASE, '$1[REDACTED]'],
  [TOKEN_PHRASE, '$1[REDACTED]'],
  [/\b[0-9a-f]{32,}\b/gi, '[REDACTED HEX]'],
  [LONG_TOKEN, m => (/[a-z]/.test(m) && /[A-Z]/.test(m) && /\d/.test(m) ? '[REDACTED]' : m)],
]

/** Masks API keys, bearer tokens, JWTs, private keys, password pairs and long random-looking secrets. */
export function redact(text: string): string {
  let out = String(text ?? '')
  for (const [pattern, replacement] of RULES) {
    out = typeof replacement === 'string' ? out.replace(pattern, replacement) : out.replace(pattern, replacement)
  }
  return out
}

const SENSITIVE_KEY = /(pass(word|wd|phrase)?$|secret|token$|api[_-]?key|authorization|cookie|credential|private[_-]?key)/i

/** Redacted, truncated JSON of a tool input. Redaction runs before truncation so a cut can never expose half a key. */
export function summarizeInput(input: unknown, max = 160): string {
  let json: string | undefined
  try {
    json = JSON.stringify(input, safeReplacer())
  } catch {
    json = '[unserializable input]'
  }
  return clip(redact(json ?? String(input)), max)
}

function safeReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>()
  return (key, value) => {
    if (key && SENSITIVE_KEY.test(key) && typeof value === 'string') return '[REDACTED]'
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'function') return '[function]'
    if (value && typeof value === 'object') {
      if (seen.has(value)) return '[circular]'
      seen.add(value)
    }
    return value
  }
}

export const AUDIT_MEMORY_LIMIT = 500
const SUMMARY_MAX = 400

export interface AuditLog {
  append(e: AuditEntry): void
  entries(): AuditEntry[]
  /** How many entries the external sink failed to accept (they are still kept in memory). */
  sinkFailures(): number
}

export function createAuditLog(sink?: (e: AuditEntry) => void): AuditLog {
  const kept: AuditEntry[] = []
  let failures = 0
  return {
    append(e) {
      const clean = sanitizeEntry(e)
      kept.push(clean)
      if (kept.length > AUDIT_MEMORY_LIMIT) kept.splice(0, kept.length - AUDIT_MEMORY_LIMIT)
      try {
        sink?.({ ...clean })
      } catch {
        // A broken sink must not break the action being audited; the in-memory copy remains and the failure is counted.
        failures++
      }
    },
    entries: () => kept.map(e => ({ ...e })),
    sinkFailures: () => failures,
  }
}

function sanitizeEntry(e: AuditEntry): AuditEntry {
  const clean: AuditEntry = {
    ...e,
    tool: clip(redact(e.tool), 120),
    inputSummary: clip(redact(e.inputSummary), SUMMARY_MAX),
    resultSummary: clip(redact(e.resultSummary), SUMMARY_MAX),
  }
  if (e.task !== undefined) clean.task = clip(redact(e.task), 120)
  return clean
}
