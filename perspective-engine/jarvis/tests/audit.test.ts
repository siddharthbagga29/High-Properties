import { describe, expect, it } from 'vitest'
import { AUDIT_MEMORY_LIMIT, createAuditLog, redact, summarizeInput } from '../core/audit'
import type { AuditEntry } from '../core/types'

// Test fixtures are assembled at runtime so no secret-shaped literal sits in the repository.
const fake = (prefix: string, body: string) => prefix + body
const ANTHROPIC = fake('sk-ant-', 'api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789')
const OPENAI = fake('sk-', 'proj-AbCdEfGhIjKlMnOpQrSt1234')
const AWS = fake('AKIA', 'IOSFODNN7EXAMPLE')
const GITHUB = fake('ghp_', 'abcdefghijklmnopqrstuvwxyz0123456789')
const SLACK = fake('xoxb-', '1234567890-abcdefghij')
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
const PEM = ['-----BEGIN RSA PRIVATE KEY-----', 'MIIEowIBAAKCAQEAx1y2...', '-----END RSA PRIVATE KEY-----'].join('\n')

describe('redact', () => {
  it.each([
    ['anthropic key', `key ${ANTHROPIC} here`],
    ['openai key', `using ${OPENAI}`],
    ['aws key', `aws ${AWS}`],
    ['github token', `token ${GITHUB}`],
    ['slack token', `slack ${SLACK}`],
    ['jwt', `session ${JWT}`],
  ])('masks a %s', (_name, text) => {
    const out = redact(text)
    expect(out).toContain('[REDACTED')
    for (const secret of [ANTHROPIC, OPENAI, AWS, GITHUB, SLACK, JWT]) expect(out).not.toContain(secret)
  })

  it('masks bearer tokens, private keys and password pairs', () => {
    expect(redact('Authorization: Bearer abcdef0123456789xyz')).not.toContain('abcdef0123456789xyz')
    expect(redact(`key:\n${PEM}\nend`)).toBe('key:\n[REDACTED PRIVATE KEY]\nend')
    expect(redact('password=hunter2&user=sid')).toBe('password=[REDACTED]&user=sid')
    expect(redact('{"api_key":"abc123secret","q":"hi"}')).toBe('{"api_key":"[REDACTED]","q":"hi"}')
    expect(redact('my password is correcthorse')).toBe('my password is [REDACTED]')
    expect(redact('https://sid:s3cret@example.com/x')).toBe('https://sid:[REDACTED]@example.com/x')
  })

  it('masks long hex and mixed base64 secrets', () => {
    expect(redact('hex 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08')).toBe('hex [REDACTED HEX]')
    expect(redact('b64 QWxhZGRpbjpvcGVuIHNlc2FtZQ0aB1c2D3e4F5g6H7i8')).toBe('b64 [REDACTED]')
  })

  it('leaves ordinary text, ids and paths alone', () => {
    const plain = 'Ada finished F04 (Browser MVP); see perspective-engine/research/evidence-dossier.md. The token is expired. 19/34 tasks done.'
    expect(redact(plain)).toBe(plain)
  })
})

describe('summarizeInput', () => {
  it('redacts before truncating so a cut never exposes part of a key', () => {
    const out = summarizeInput({ note: `use ${ANTHROPIC}` }, 30)
    expect(out.length).toBeLessThanOrEqual(30)
    expect(out).not.toMatch(/sk-ant-api03-Ab/)
  })

  it('masks values under sensitive keys whatever they look like', () => {
    expect(summarizeInput({ password: 'tulip', accessToken: 'x', tokens: 5 })).toBe('{"password":"[REDACTED]","accessToken":"[REDACTED]","tokens":5}')
  })

  it('handles circular, bigint and undefined inputs', () => {
    const a: Record<string, unknown> = { n: 1n }
    a.self = a
    expect(summarizeInput(a)).toBe('{"n":"1","self":"[circular]"}')
    expect(summarizeInput(undefined)).toBe('undefined')
  })
})

describe('createAuditLog', () => {
  const entry = (i: number, over: Partial<AuditEntry> = {}): AuditEntry => ({
    at: '2026-10-08T12:00:00.000Z', actor: 'owner', tool: 'search', inputSummary: `q${i}`, resultSummary: 'ok', risk: 'safe', decision: 'auto', ok: true, ...over,
  })

  it('redacts summaries before storing and before the sink sees them', () => {
    const sunk: AuditEntry[] = []
    const log = createAuditLog(e => sunk.push(e))
    log.append(entry(1, { inputSummary: `{"key":"${GITHUB}"}`, resultSummary: `got ${ANTHROPIC}` }))
    for (const e of [...log.entries(), ...sunk]) {
      expect(JSON.stringify(e)).not.toContain(GITHUB)
      expect(JSON.stringify(e)).not.toContain(ANTHROPIC)
    }
  })

  it('keeps only the most recent entries in memory', () => {
    const log = createAuditLog()
    for (let i = 0; i < AUDIT_MEMORY_LIMIT + 25; i++) log.append(entry(i))
    const kept = log.entries()
    expect(kept).toHaveLength(AUDIT_MEMORY_LIMIT)
    expect(kept[0].inputSummary).toBe('q25')
  })

  it('survives a failing sink and counts the failures', () => {
    const log = createAuditLog(() => {
      throw new Error('disk full')
    })
    expect(() => log.append(entry(1))).not.toThrow()
    expect(log.entries()).toHaveLength(1)
    expect(log.sinkFailures()).toBe(1)
  })

  it('returns copies, so callers cannot rewrite history', () => {
    const log = createAuditLog()
    log.append(entry(1))
    log.entries()[0].ok = false
    expect(log.entries()[0].ok).toBe(true)
  })
})
