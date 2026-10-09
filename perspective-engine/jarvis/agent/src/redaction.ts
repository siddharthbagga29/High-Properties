/**
 * Redaction for everything the agent writes to disk (audit.jsonl, tasks.json, reminders.json, memory.jsonl).
 * It is core redact() applied twice: to the text as it is, and to its percent-decoded form, because a secret that
 * travelled inside a URL ("q=api_key%3Dsk-ant-…") has no word boundary in front of it and would slip past the
 * key patterns. When decoding reveals a secret, the decoded and redacted text is kept; otherwise the text is
 * left exactly as core redact() returned it.
 */
import { redact, type AuditEntry } from '../../core/index'

/** Decodes runs of %XX escapes; malformed runs are left as they are. */
export function percentDecode(s: string): string {
  return s.replace(/(?:%[0-9A-Fa-f]{2})+/g, m => {
    try {
      return decodeURIComponent(m)
    } catch {
      return m
    }
  })
}

export function redactText(text: string): string {
  const once = redact(String(text ?? ''))
  if (!/%[0-9A-Fa-f]{2}/.test(once)) return once
  const decoded = percentDecode(once)
  // Up to two rounds of decoding (a doubly encoded key is still a key).
  for (const candidate of [decoded, percentDecode(decoded)]) {
    const cleaned = redact(candidate)
    if (cleaned !== candidate) return cleaned
  }
  return once
}

/**
 * Redacts every string inside a JSON-like value. Keys listed in `keep` are copied unchanged (used for a parked
 * tool call, which must run exactly as the owner asked once they confirm it, and is deleted afterwards).
 */
export function redactDeep<T>(value: T, keep: ReadonlySet<string> = new Set(), depth = 0): T {
  if (depth > 32) return value
  if (typeof value === 'string') return redactText(value) as unknown as T
  if (Array.isArray(value)) return value.map(v => redactDeep(v, keep, depth + 1)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = keep.has(k) ? v : redactDeep(v, keep, depth + 1)
    return out as T
  }
  return value
}

/** An audit entry as it may be written to audit.jsonl. */
export function redactEntry(e: AuditEntry): AuditEntry {
  return redactDeep(e)
}
