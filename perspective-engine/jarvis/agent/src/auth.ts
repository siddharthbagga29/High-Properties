/**
 * Who may talk to the agent: a request from this machine, addressed to 127.0.0.1/localhost on our port (so a DNS
 * rebinding page cannot reach us through another host name), from no browser origin or our own console's origin,
 * carrying the bearer token. The token is compared in constant time.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, closeSync, openSync, readFileSync, statSync, writeSync } from 'node:fs'

export const MIN_TOKEN_LENGTH = 24

export interface TokenInfo { token: string; source: 'env' | 'file' | 'created'; path?: string }

/**
 * JARVIS_TOKEN wins when set (it must be long enough to be a secret). Otherwise the token is read from `file`, or
 * generated once (32 random bytes, base64url) and written there with mode 0600.
 */
export function loadOrCreateToken(file: string, env: NodeJS.ProcessEnv = process.env): TokenInfo {
  const fromEnv = env.JARVIS_TOKEN?.trim()
  if (fromEnv) {
    if (fromEnv.length < MIN_TOKEN_LENGTH) throw new Error(`JARVIS_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters`)
    return { token: fromEnv, source: 'env' }
  }
  try {
    const existing = readFileSync(file, 'utf8').trim()
    if (existing.length >= MIN_TOKEN_LENGTH) {
      if ((statSync(file).mode & 0o077) !== 0) chmodSync(file, 0o600) // someone loosened it: tighten again
      return { token: existing, source: 'file', path: file }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  const token = randomBytes(32).toString('base64url')
  // 'wx' fails if another process created the file in the meantime, instead of overwriting its token.
  const fd = openSync(file, 'wx', 0o600)
  try {
    writeSync(fd, `${token}\n`)
  } finally {
    closeSync(fd)
  }
  chmodSync(file, 0o600)
  return { token, source: 'created', path: file }
}

/** Constant-time comparison. Hashing first makes the comparison length-independent too. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest()
  const hb = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(ha, hb) && a.length === b.length
}

export function bearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') return null
  const m = header.match(/^Bearer\s+(\S+)\s*$/i)
  return m ? m[1] : null
}

export function isAuthorized(header: string | string[] | undefined, token: string): boolean {
  const presented = bearerToken(header)
  return presented !== null && safeEqual(presented, token)
}

/** Host header values we answer to. Anything else (e.g. evil.example resolving to 127.0.0.1) is a rebinding attempt. */
export function allowedHosts(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`]
}

export function hostAllowed(host: string | string[] | undefined, port: number): boolean {
  return typeof host === 'string' && allowedHosts(port).includes(host.trim().toLowerCase())
}

export function allowedOrigins(port: number): string[] {
  return allowedHosts(port).map(h => `http://${h}`)
}

/**
 * No Origin header (curl, same-origin GET navigations) is fine: the token still guards the API. A present Origin
 * must be the console's own; "null" (sandboxed frames, file://) is refused.
 */
export function originAllowed(origin: string | string[] | undefined, port: number): boolean {
  if (origin === undefined) return true
  return typeof origin === 'string' && allowedOrigins(port).includes(origin.trim().toLowerCase())
}
