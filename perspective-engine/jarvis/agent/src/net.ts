/**
 * SSRF guard for every fetch or page load the agent starts on its own (research, downloads, the browser).
 * Only http(s) to public addresses: loopback, private, link-local (including cloud metadata at 169.254.169.254),
 * CGNAT, multicast, reserved and documentation ranges are refused, for IPv4, IPv6 and IPv4-mapped IPv6.
 * safeFetch re-checks the address at connect time (so DNS rebinding between check and connect does not help) and
 * re-checks every redirect hop.
 */
import { lookup as dnsLookup } from 'node:dns'
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP, type LookupFunction } from 'node:net'

export type Resolver = (host: string) => Promise<Array<{ address: string; family: number }>>
export type AddressCheck = (ip: string) => boolean

export interface GuardOptions {
  resolve?: Resolver
  /** Test hook: decides whether an address is blocked. Defaults to isBlockedAddress. */
  isBlocked?: AddressCheck
}

export type GuardResult = { ok: true; url: URL; addresses: string[] } | { ok: false; reason: string }

// ---------- address classification ----------

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
}

const V4_BLOCKED: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
]

function v4Blocked(ip: string): boolean {
  const n = v4ToInt(ip)
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return (n & mask) === (v4ToInt(base) & mask)
  })
}

/** Expands an IPv6 address to eight 16-bit groups (handles "::" and an embedded dotted IPv4 tail). */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0]
  let tail: number[] = []
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    if (isIP(dotted[2]) !== 4) return null
    const n = v4ToInt(dotted[2])
    tail = [n >>> 16, n & 0xffff]
    s = dotted[1].endsWith('::') ? dotted[1] : dotted[1].slice(0, -1)
  }
  const parts = s.split('::')
  if (parts.length > 2) return null
  const parse = (part: string) => (part === '' ? [] : part.split(':').map(h => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN)))
  const head = parse(parts[0])
  const rest = parts.length === 2 ? parse(parts[1]) : []
  const missing = 8 - tail.length - head.length - rest.length
  if (parts.length === 1 ? missing !== 0 : missing < 0) return null
  const groups = [...head, ...new Array<number>(parts.length === 2 ? missing : 0).fill(0), ...rest, ...tail]
  return groups.length === 8 && groups.every(g => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null
}

function v6Blocked(ip: string): boolean {
  const g = v6Groups(ip)
  if (!g) return true // unparseable: fail closed
  const embeddedV4 = () => `${g[6] >>> 8}.${g[6] & 0xff}.${g[7] >>> 8}.${g[7] & 0xff}`
  if (g.every(x => x === 0)) return true // ::
  if (g.slice(0, 7).every(x => x === 0) && g[7] === 1) return true // ::1
  if (g.slice(0, 5).every(x => x === 0) && g[5] === 0xffff) return v4Blocked(embeddedV4()) // ::ffff:a.b.c.d
  if (g.slice(0, 6).every(x => x === 0)) return true // deprecated IPv4-compatible ::a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every(x => x === 0)) return v4Blocked(embeddedV4()) // NAT64
  if (g[0] === 0x2002) return v4Blocked(`${g[1] >>> 8}.${g[1] & 0xff}.${g[2] >>> 8}.${g[2] & 0xff}`) // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique local (includes AWS fd00:ec2::254)
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true // documentation
  if (g[0] === 0x0100 && g.slice(1, 4).every(x => x === 0)) return true // discard-only
  return false
}

/** True for any address an agent-initiated request must never reach. Non-IP strings are blocked (fail closed). */
export function isBlockedAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, '')
  const kind = isIP(bare)
  if (kind === 4) return v4Blocked(bare)
  if (kind === 6) return v6Blocked(bare)
  return true
}

const BLOCKED_HOSTNAMES = /^(localhost|localhost\.localdomain|ip6-localhost|ip6-loopback|metadata|metadata\.google\.internal|instance-data|kubernetes\.default(\.svc)?)\.?$/i
const BLOCKED_SUFFIXES = /\.(localhost|local|internal|intranet|lan|home\.arpa|corp)\.?$/i

// ---------- URL checks ----------

/** Synchronous part of the guard: scheme, credentials, host names and IP literals. */
export function checkUrlSyntax(raw: string, isBlocked: AddressCheck = isBlockedAddress): GuardResult {
  let url: URL
  try {
    url = new URL(String(raw ?? '').trim())
  } catch {
    return { ok: false, reason: 'not a valid URL' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: `scheme ${url.protocol} is not allowed (http and https only)` }
  if (url.username || url.password) return { ok: false, reason: 'URLs with embedded credentials are not allowed' }
  // WHATWG parsing already turned 2130706433, 0x7f.1 and 017700000001 into 127.0.0.1.
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!host) return { ok: false, reason: 'URL has no host' }
  if (isIP(host)) {
    return isBlocked(host) ? { ok: false, reason: `address ${host} is private, loopback, link-local or reserved` } : { ok: true, url, addresses: [host] }
  }
  if (BLOCKED_HOSTNAMES.test(host) || BLOCKED_SUFFIXES.test(host) || !host.includes('.')) {
    return { ok: false, reason: `host ${host} is a local or internal name` }
  }
  return { ok: true, url, addresses: [] }
}

export const systemResolver: Resolver = host =>
  new Promise((resolve, reject) => {
    dnsLookup(host, { all: true, verbatim: true }, (err, addresses) => (err ? reject(err) : resolve(addresses)))
  })

/** Full guard: the syntax checks plus DNS resolution; every resolved address must be public. */
export async function checkUrl(raw: string, opts: GuardOptions = {}): Promise<GuardResult> {
  const isBlocked = opts.isBlocked ?? isBlockedAddress
  const first = checkUrlSyntax(raw, isBlocked)
  if (!first.ok || first.addresses.length) return first
  let addresses: Array<{ address: string }>
  try {
    addresses = await (opts.resolve ?? systemResolver)(first.url.hostname)
  } catch (e) {
    return { ok: false, reason: `could not resolve ${first.url.hostname}: ${(e as Error).message}` }
  }
  if (!addresses.length) return { ok: false, reason: `${first.url.hostname} did not resolve` }
  const bad = addresses.find(a => isBlocked(a.address))
  if (bad) return { ok: false, reason: `${first.url.hostname} resolves to ${bad.address}, a private, loopback, link-local or reserved address` }
  return { ok: true, url: first.url, addresses: addresses.map(a => a.address) }
}

export class BlockedRequestError extends Error {
  readonly code = 'ssrf_blocked'
}

/** A lookup for http(s).request that refuses blocked addresses at connect time. */
export function guardedLookup(resolve: Resolver, isBlocked: AddressCheck): LookupFunction {
  return ((hostname: string, options: { all?: boolean } | number | undefined, callback: (...args: unknown[]) => void) => {
    const all = typeof options === 'object' && options !== null && options.all === true
    resolve(hostname).then(
      addresses => {
        const bad = addresses.find(a => isBlocked(a.address))
        if (!addresses.length) return callback(new Error(`${hostname} did not resolve`))
        if (bad) return callback(new BlockedRequestError(`refused: ${hostname} resolves to ${bad.address}`))
        if (all) return callback(null, addresses)
        return callback(null, addresses[0].address, addresses[0].family)
      },
      err => callback(err),
    )
  }) as unknown as LookupFunction
}

// ---------- fetch ----------

export interface SafeFetchOptions extends GuardOptions {
  method?: 'GET' | 'HEAD'
  headers?: Record<string, string>
  maxRedirects?: number
  maxBytes?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export interface SafeResponse { status: number; url: string; headers: IncomingHttpHeaders; body: Buffer; truncated: boolean; redirects: string[] }

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024

/**
 * GET (or HEAD) with the guard applied to the first URL, every redirect and the actual connection.
 * Never sends cookies or credentials. Bodies over maxBytes are cut and flagged as truncated.
 */
export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const isBlocked = opts.isBlocked ?? isBlockedAddress
  const resolve = opts.resolve ?? systemResolver
  const maxRedirects = opts.maxRedirects ?? 5
  const redirects: string[] = []
  let current = raw
  for (let hop = 0; ; hop++) {
    const verdict = await checkUrl(current, { resolve, isBlocked })
    if (!verdict.ok) throw new BlockedRequestError(`refused ${hop ? 'redirect to ' : ''}${current}: ${verdict.reason}`)
    const res = await requestOnce(verdict.url, opts, resolve, isBlocked)
    const location = res.headers.location
    if (res.status >= 300 && res.status < 400 && typeof location === 'string') {
      if (hop >= maxRedirects) throw new Error(`too many redirects (more than ${maxRedirects})`)
      current = new URL(location, verdict.url).toString()
      redirects.push(current)
      continue
    }
    return { ...res, url: verdict.url.toString(), redirects }
  }
}

function requestOnce(url: URL, opts: SafeFetchOptions, resolve: Resolver, isBlocked: AddressCheck): Promise<Omit<SafeResponse, 'url' | 'redirects'>> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise((resolvePromise, reject) => {
    const req = send(
      url,
      {
        method: opts.method ?? 'GET',
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; JarvisLocalAgent/0.1)', accept: '*/*', ...opts.headers },
        lookup: guardedLookup(resolve, isBlocked),
        timeout: opts.timeoutMs ?? 15_000,
        signal: opts.signal,
      },
      res => {
        const chunks: Buffer[] = []
        let size = 0
        let truncated = false
        res.on('data', (chunk: Buffer) => {
          if (truncated) return
          if (size + chunk.length > maxBytes) {
            chunks.push(chunk.subarray(0, maxBytes - size))
            size = maxBytes
            truncated = true
            res.destroy()
            resolvePromise({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks), truncated })
            return
          }
          chunks.push(chunk)
          size += chunk.length
        })
        res.on('end', () => resolvePromise({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks), truncated }))
        res.on('error', err => {
          if (!truncated) reject(err)
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error(`timed out after ${opts.timeoutMs ?? 15_000} ms`)))
    req.on('error', reject)
    req.end()
  })
}
