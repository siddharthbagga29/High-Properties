/**
 * The HTTP surface: node:http on 127.0.0.1 only. Every request must be addressed to 127.0.0.1/localhost on our
 * port (DNS-rebinding defence) and, when a browser sends an Origin, come from the console itself. Every /api route
 * needs the bearer token. No CORS headers are ever sent, so other sites cannot read responses.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import type { MemoryKind } from '../../core/index'
import type { App } from './app'
import { hostAllowed, isAuthorized, originAllowed } from './auth'
import { LOOPBACK } from './config'

export const MAX_BODY_BYTES = 64 * 1024
const CONSOLE_FILE = fileURLToPath(new URL('../console/index.html', import.meta.url))

export interface ServerOptions {
  app: App
  token: string
  port: number
  host?: string
  log?: (line: string) => void
  /** Console HTML override (tests). */
  consoleHtml?: string
}

export interface RunningServer { server: Server; port: number; url: string; close(): Promise<void> }

/** Refuses anything but the IPv4 loopback address. */
export function assertLoopback(host: string): void {
  if (host !== LOOPBACK) throw new Error(`refusing to listen on ${host}: the Jarvis agent listens on ${LOOPBACK} only`)
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const BASE_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'cache-control': 'no-store',
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { ...BASE_HEADERS, 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text), ...headers })
  res.end(text)
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const type = String(req.headers['content-type'] ?? '')
  if (!/^application\/json\b/i.test(type)) throw new HttpError(415, 'unsupported_media_type', 'send JSON with content-type: application/json')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', `request bodies are limited to ${MAX_BODY_BYTES} bytes`)
    chunks.push(chunk)
  }
  if (!size) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'invalid_json', 'the body is not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(400, 'invalid_json', 'the body must be a JSON object')
  return parsed as Record<string, unknown>
}

function consolePage(html: string): { body: string; csp: string } {
  const nonce = randomBytes(16).toString('base64')
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}' https://fonts.googleapis.com`,
    'font-src https://fonts.gstatic.com',
    "connect-src 'self'",
    "img-src 'self' data:",
    "media-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
  return { body: html.replaceAll('__NONCE__', nonce), csp }
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const host = opts.host ?? LOOPBACK
  assertLoopback(host)
  const { app, token } = opts
  const log = opts.log ?? (() => undefined)
  const consoleHtml = opts.consoleHtml ?? readFileSync(CONSOLE_FILE, 'utf8')
  let port = opts.port
  let lastAuthAudit = 0

  const server = createServer((req, res) => {
    handle(req, res).catch(e => {
      if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message })
      log(`error: ${(e as Error).stack ?? e}`)
      if (!res.headersSent) send(res, 500, { error: 'internal_error', message: 'something went wrong; see the agent log' })
      else res.end()
    })
  })

  function refuse(res: ServerResponse, status: number, code: string, message: string, req: IncomingMessage) {
    // Refusals are audited, but at most one entry every 10 s so a misbehaving page cannot flood the log.
    const t = Date.now()
    if (t - lastAuthAudit > 10_000) {
      lastAuthAudit = t
      app.recordAudit({
        at: new Date(t).toISOString(),
        actor: 'visitor',
        tool: 'http',
        inputSummary: `${req.method} ${(req.url ?? '').split('?')[0].slice(0, 80)} host=${String(req.headers.host ?? '').slice(0, 60)} origin=${String(req.headers.origin ?? '-').slice(0, 60)}`,
        resultSummary: `${status} ${code}`,
        risk: 'high',
        decision: 'denied',
        ok: false,
      })
    }
    send(res, status, { error: code, message }, status === 401 ? { 'www-authenticate': 'Bearer realm="jarvis"' } : {})
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', `http://${LOOPBACK}:${port}`)
    const path = url.pathname

    if (!hostAllowed(req.headers.host, port)) return refuse(res, 403, 'forbidden_host', 'requests must be addressed to 127.0.0.1 or localhost on the agent port', req)
    if (!originAllowed(req.headers.origin, port) || req.headers['sec-fetch-site'] === 'cross-site') {
      return refuse(res, 403, 'forbidden_origin', 'only the local console may call the agent', req)
    }

    if (path === '/' && method === 'GET') {
      const page = consolePage(consoleHtml)
      res.writeHead(200, {
        ...BASE_HEADERS,
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': page.csp,
        'permissions-policy': 'microphone=(self), camera=(), geolocation=(), payment=(), usb=()',
      })
      res.end(page.body)
      return
    }
    if (path === '/favicon.ico') {
      res.writeHead(204, BASE_HEADERS)
      res.end()
      return
    }
    if (!path.startsWith('/api/')) return send(res, 404, { error: 'not_found' })
    if (method === 'OPTIONS') return send(res, 405, { error: 'method_not_allowed', message: 'no cross-origin access' })
    if (!isAuthorized(req.headers.authorization, token)) return refuse(res, 401, 'unauthorized', 'missing or wrong bearer token', req)

    const parts = path.split('/').filter(Boolean).map(seg => {
      try {
        return decodeURIComponent(seg)
      } catch {
        throw new HttpError(400, 'invalid_path', 'malformed path')
      }
    }) // ['api', resource, id?, action?]
    const [, resource, id, action] = parts

    if (method === 'GET' && resource === 'status' && parts.length === 2) return send(res, 200, await app.status())
    if (method === 'GET' && resource === 'tasks' && parts.length === 2) return send(res, 200, { tasks: app.tasks() })
    if (method === 'POST' && resource === 'tasks' && id && (action === 'confirm' || action === 'cancel') && parts.length === 4) {
      await readBody(req) // the body is ignored, but must still be JSON (no simple-form requests)
      const out = action === 'confirm' ? await app.confirmTask(id) : app.cancelTask(id)
      if ('refused' in out) return send(res, out.httpStatus, { error: out.refused })
      return send(res, 200, action === 'confirm' ? out : { task: out })
    }
    if (method === 'POST' && resource === 'ask' && parts.length === 2) {
      const body = await readBody(req)
      if (typeof body.text !== 'string' || !body.text.trim()) throw new HttpError(400, 'invalid_input', 'text is required')
      return send(res, 200, await app.ask(body.text))
    }
    if (method === 'GET' && resource === 'tools' && parts.length === 2) return send(res, 200, { tools: app.tools() })
    if (method === 'POST' && resource === 'tools' && id && parts.length === 3) {
      const body = await readBody(req)
      const out = await app.runTool(id, body.input ?? {}, body.confirmed === true)
      if (!out) return send(res, 404, { error: 'unknown_tool', message: `no tool ${id}` })
      return send(res, 200, out)
    }
    if (method === 'GET' && resource === 'audit' && parts.length === 2) return send(res, 200, { entries: app.audit(Number(url.searchParams.get('limit') ?? 100) || 100) })
    if (resource === 'memory' && parts.length === 2) {
      if (method === 'GET') {
        const kind = url.searchParams.get('kind') as MemoryKind | null
        return send(res, 200, { items: await app.memory(url.searchParams.get('q') ?? '', Number(url.searchParams.get('k') ?? 10) || 10, kind ?? undefined) })
      }
      if (method === 'POST') {
        const body = await readBody(req)
        try {
          return send(res, 200, { item: await app.remember(String(body.kind ?? 'episodic') as MemoryKind, String(body.text ?? ''), typeof body.reason === 'string' ? body.reason : undefined) })
        } catch (e) {
          throw new HttpError(400, 'refused', (e as Error).message)
        }
      }
    }
    if (resource === 'reminders' && parts.length === 2) {
      if (method === 'GET') return send(res, 200, { reminders: app.reminders() })
      if (method === 'POST') {
        const body = await readBody(req)
        const out = app.addReminder(String(body.text ?? ''), typeof body.dueAt === 'string' ? body.dueAt : undefined)
        if ('error' in out) throw new HttpError(400, 'invalid_input', out.error)
        return send(res, 201, out)
      }
    }
    if (method === 'POST' && resource === 'reminders' && id && action === 'dismiss' && parts.length === 4) {
      await readBody(req)
      const r = app.dismissReminder(id)
      return r ? send(res, 200, { reminder: r }) : send(res, 404, { error: 'not_found' })
    }
    return send(res, 404, { error: 'not_found' })
  }

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.port, host, () => {
      const addr = server.address() as AddressInfo
      if (addr.address !== LOOPBACK) {
        server.close()
        reject(new Error(`bound to ${addr.address}, not ${LOOPBACK}; refusing to serve`))
        return
      }
      port = addr.port
      server.off('error', reject)
      // Header and request timeouts keep a stuck client from holding the socket forever.
      server.headersTimeout = 10_000
      server.requestTimeout = 330_000
      log(`listening on http://${LOOPBACK}:${port}`)
      resolve({
        server,
        port,
        url: `http://${LOOPBACK}:${port}`,
        close: () =>
          new Promise(r => {
            server.close(() => r())
            server.closeAllConnections()
          }),
      })
    })
  })
}
