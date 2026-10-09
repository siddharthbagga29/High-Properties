import { redact } from './audit'
import { newId } from './ids'
import { timeOf } from './text'
import type { MemoryItem, MemoryKind, MemoryStore } from './types'

export function createMemoryStore(initial: MemoryItem[] = []): MemoryStore {
  const items = new Map<string, MemoryItem>(initial.map(i => [i.id, { ...i }]))
  return {
    async add(item) {
      items.set(item.id, { ...item })
    },
    async all(kind) {
      return [...items.values()].filter(i => !kind || i.kind === kind).map(i => ({ ...i }))
    },
    async remove(id) {
      items.delete(id)
    },
  }
}

// ---------- credential detection ----------

/** Values that are secret whatever they look like: announcing one is enough. */
const SECRET_ANNOUNCED =
  /\b(password|passwd|passcode|passphrase|pin|otp|one[- ]time code|2fa code|verification code|security code|cvv|cvc)\b\s*(is|was|=|:)\s*\S/i
/** Keys and tokens: only when the value was redacted or looks key-like, so "the token is expired" can still be remembered. */
const KEY_ANNOUNCED = /\b(api[ _-]?key|secret[ _-]?key|private[ _-]?key|access[ _-]?key|token|secret)\b\s*(is|was|=|:)\s*(\[REDACTED|\S*[\d_-]|\S{16,})/i
const SEED_PHRASE = /\b(seed|recovery|mnemonic|backup) (phrase|words)\b/i
const SSN = /\b\d{3}-\d{2}-\d{4}\b/
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g
const REDACTION_MARK = /\[REDACTED[^\]]*\]/g

/**
 * True for text that would still be a credential after redaction: an announced secret, a card number, an SSN,
 * a random-looking token, or text that was nothing but secrets.
 */
export function looksLikeCredential(text: string): boolean {
  if (!text.replace(REDACTION_MARK, '').trim()) return true
  if (SECRET_ANNOUNCED.test(text) || KEY_ANNOUNCED.test(text) || SEED_PHRASE.test(text) || SSN.test(text)) return true
  if ((text.match(CARD_CANDIDATE) ?? []).some(m => luhn(m.replace(/\D/g, '')))) return true
  return text.split(/\s+/).some(isRandomToken)
}

function luhn(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

/** 12+ characters mixing at least three of lower, upper, digits and symbols, and not a URL, path or e-mail address. */
function isRandomToken(word: string): boolean {
  const w = word.replace(/^[("'[]+|[)"'\],.;:!?]+$/g, '')
  if (w.length < 12 || /^(https?:\/\/|www\.|\/|\.{1,2}\/|~\/)/i.test(w) || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(w) || w.includes('[REDACTED')) return false
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(w)).length
  return classes >= 3 && !/^[A-Za-z]+[-_/][A-Za-z]+([-_/][A-Za-z]+)*$/.test(w)
}

// ---------- write and read ----------

/** Stores a redacted memory. Throws rather than store something that still looks like a credential. */
export async function remember(store: MemoryStore, kind: MemoryKind, text: string, now: Date, extra: Partial<MemoryItem> = {}): Promise<MemoryItem> {
  const clean = redact(String(text ?? '').trim())
  if (!clean) throw new Error('refusing to store an empty memory')
  if (looksLikeCredential(clean)) throw new Error('refusing to store credential-like text in memory')
  const item: MemoryItem = { ...extra, id: extra.id ?? newId('mem', now), kind, at: extra.at ?? now.toISOString(), text: clean }
  // Every free-text field gets the same treatment as the text itself.
  for (const field of ['reason', 'project', 'source'] as const) {
    const value = extra[field]
    if (value !== undefined) item[field] = checked(value)
  }
  if (extra.tags) item.tags = extra.tags.map(checked)
  await store.add(item)
  return item
}

function checked(value: string): string {
  const clean = redact(String(value))
  if (clean.trim() && looksLikeCredential(clean)) throw new Error('refusing to store credential-like text in memory')
  return clean
}

/** The k items sharing the most keywords with the query, newest first among equals. An empty query returns the newest items. */
export async function recall(store: MemoryStore, query: string, k = 5, kinds?: MemoryKind[]): Promise<MemoryItem[]> {
  const items = (await store.all()).filter(i => !kinds || kinds.includes(i.kind))
  const terms = new Set(keywords(query))
  const newestFirst = (a: MemoryItem, b: MemoryItem) => timeOf(b.at) - timeOf(a.at)
  if (terms.size === 0) return items.sort(newestFirst).slice(0, k)
  return items
    .map(item => ({ item, score: overlap(terms, item) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || newestFirst(a.item, b.item))
    .slice(0, k)
    .map(x => x.item)
}

function overlap(terms: Set<string>, item: MemoryItem): number {
  const words = new Set(keywords([item.text, item.reason, item.project, ...(item.tags ?? [])].filter(Boolean).join(' ')))
  let n = 0
  for (const t of terms) if (words.has(t)) n++
  return n
}

const STOPWORDS = new Set(
  ('a an and are as at be by did do does for from had has have how i in is it its me my of on or our so that the their them then there ' +
    'these they this to was we were what when where which who why will with you your about can could should would just also into than ' +
    'any all some more most other such only own same too very s t don now tell show know').split(' '),
)

export function keywords(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length > 1 && !STOPWORDS.has(w))
    .map(stem)
}

const SUFFIXES: Array<[string, string]> = [['ies', 'y'], ['ied', 'y'], ['ing', ''], ['ed', ''], ['es', ''], ['s', ''], ['ly', '']]

/** Deliberately simple stemming: enough for "decided", "decides" and "deciding" to meet "decide", or "batches" to meet "batch". */
export function stem(word: string): string {
  let w = word
  if (w.length > 4) {
    for (const [suffix, replacement] of SUFFIXES) {
      if (!w.endsWith(suffix) || w.length - suffix.length < 3) continue
      if (suffix === 's' && /(ss|us|is)$/.test(w)) break
      w = w.slice(0, -suffix.length) + replacement
      if ((suffix === 'ing' || suffix === 'ed') && /([b-df-hj-np-tv-z])\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1)
      break
    }
  }
  return w.length > 4 && w.endsWith('e') ? w.slice(0, -1) : w
}
