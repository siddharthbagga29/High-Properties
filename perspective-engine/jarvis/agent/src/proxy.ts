/**
 * The network guard as an HTTP proxy, for the agent's browser.
 *
 * Playwright's request interception sees only the first request of a redirect chain, and Chromium resolves host
 * names itself, so checking a URL and then letting Chromium fetch it is not enough: a public page can redirect to
 * 169.254.169.254, and a host name can resolve to a public address for the check and a private one for the
 * connection. Every browser connection therefore goes through this proxy, which resolves the name itself and
 * refuses private, loopback, link-local, metadata and reserved addresses at connect time, for plain HTTP requests,
 * HTTPS tunnels (CONNECT) and each redirect hop alike. It listens on 127.0.0.1 only, on a random port, for the
 * lifetime of the browser.
 */
import { createServer, request as httpRequest, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http'
import { connect, type AddressInfo, type Socket } from 'node:net'
import { LOOPBACK } from './config'
import { checkUrl, guardedLookup, isBlockedAddress, systemResolver, type GuardOptions } from './net'

export const BLOCK_HEADER = 'x-jarvis-blocked'
const UPSTREAM_TIMEOUT_MS = 30_000

/** Hop-by-hop headers are never forwarded (RFC 9110 §7.6.1), nor is anything addressed to the proxy. */
const HOP_BY_HOP = new Set(['connection', 'proxy-connection', 'keep-alive', 'proxy-authorization', 'proxy-authenticate', 'te', 'trailer', 'transfer-encoding', 'upgrade'])

function forwardable(headers: IncomingHttpHeaders): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  const listed = String(headers.connection ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined || HOP_BY_HOP.has(k) || listed.includes(k)) continue
    out[k] = v
  }
  return out
}

export interface GuardProxy {
  url: string
  port: number
  /** Targets refused so far (most recent last, at most 100), for the tool's report and for tests. */
  blocked: string[]
  close(): Promise<void>
}

export async function startGuardProxy(guard: GuardOptions = {}, onBlocked?: (target: string) => void): Promise<GuardProxy> {
  const resolve = guard.resolve ?? systemResolver
  const isBlocked = guard.isBlocked ?? isBlockedAddress
  const lookup = guardedLookup(resolve, isBlocked)
  const blocked: string[] = []
  const sockets = new Set<Socket>()
  const note = (target: string) => {
    blocked.push(target)
    if (blocked.length > 100) blocked.shift()
    onBlocked?.(target)
  }

  function refuse(res: ServerResponse, status: number, target: string, reason: string) {
    note(target)
    const body = `Blocked by the Jarvis network guard: ${reason}`
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'content-length': Buffer.byteLength(body), [BLOCK_HEADER]: '1', 'cache-control': 'no-store' })
    res.end(body)
  }

  async function onRequest(req: IncomingMessage, res: ServerResponse) {
    const target = req.url ?? ''
    let url: URL
    try {
      url = new URL(target)
    } catch {
      return refuse(res, 400, target, 'only absolute http:// URLs can be proxied')
    }
    if (url.protocol !== 'http:') return refuse(res, 400, target, `scheme ${url.protocol} is not proxied`)
    const verdict = await checkUrl(target, { resolve, isBlocked })
    if (!verdict.ok) return refuse(res, 403, target, verdict.reason)
    const upstream = httpRequest(url, { method: req.method, headers: forwardable(req.headers), lookup, timeout: UPSTREAM_TIMEOUT_MS }, up => {
      res.writeHead(up.statusCode ?? 502, forwardable(up.headers))
      up.pipe(res)
    })
    upstream.on('timeout', () => upstream.destroy(new Error('upstream timed out')))
    upstream.on('error', e => {
      if (res.headersSent) return void res.destroy()
      // A refusal at connect time (DNS rebinding) is a block, not an outage.
      if ((e as { code?: string }).code === 'ssrf_blocked') return refuse(res, 403, target, e.message)
      const body = `Upstream error: ${e.message}`
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8', 'content-length': Buffer.byteLength(body) })
      res.end(body)
    })
    req.pipe(upstream)
  }

  async function onConnect(req: IncomingMessage, client: Socket, head: Buffer) {
    const target = req.url ?? ''
    client.on('error', () => undefined)
    const deny = (status: string, reason: string) => {
      note(`https://${target}`)
      client.end(`HTTP/1.1 ${status}\r\n${BLOCK_HEADER}: 1\r\ncontent-type: text/plain\r\nconnection: close\r\n\r\nBlocked by the Jarvis network guard: ${reason}`)
    }
    let url: URL
    try {
      url = new URL(`https://${target}/`)
    } catch {
      return deny('400 Bad Request', 'malformed CONNECT target')
    }
    if (!/^[^/?#@]+:\d{1,5}$/.test(target)) return deny('400 Bad Request', 'CONNECT needs host:port')
    const verdict = await checkUrl(url.toString(), { resolve, isBlocked })
    if (!verdict.ok) return deny('403 Forbidden', verdict.reason)
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const port = Number(url.port || 443)
    const upstream = connect({ host, port, lookup, timeout: UPSTREAM_TIMEOUT_MS })
    sockets.add(upstream)
    upstream.on('close', () => sockets.delete(upstream))
    upstream.once('connect', () => {
      upstream.setTimeout(0)
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) upstream.write(head)
      upstream.pipe(client)
      client.pipe(upstream)
    })
    upstream.on('timeout', () => upstream.destroy(new Error('upstream timed out')))
    upstream.on('error', e => {
      if (!client.writable) return
      if ((e as { code?: string }).code === 'ssrf_blocked') deny('403 Forbidden', e.message)
      else client.end(`HTTP/1.1 502 Bad Gateway\r\nconnection: close\r\n\r\n`)
    })
  }

  const server = createServer((req, res) => {
    onRequest(req, res).catch(e => {
      if (!res.headersSent) refuse(res, 500, req.url ?? '', (e as Error).message)
      else res.destroy()
    })
  })
  server.on('connect', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    onConnect(req, socket, head).catch(() => socket.destroy())
  })
  // Plain-HTTP WebSocket upgrades are refused outright; secure ones arrive as CONNECT and are checked there.
  server.on('upgrade', (req: IncomingMessage, socket: Socket) => {
    note(req.url ?? '')
    socket.end(`HTTP/1.1 403 Forbidden\r\n${BLOCK_HEADER}: 1\r\nconnection: close\r\n\r\n`)
  })
  server.on('connection', s => {
    sockets.add(s)
    s.on('close', () => sockets.delete(s))
  })

  await new Promise<void>((ok, fail) => {
    server.once('error', fail)
    server.listen(0, LOOPBACK, () => ok())
  })
  const port = (server.address() as AddressInfo).port
  return {
    url: `http://${LOOPBACK}:${port}`,
    port,
    blocked,
    close: () =>
      new Promise<void>(done => {
        for (const s of sockets) s.destroy()
        server.close(() => done())
      }),
  }
}
