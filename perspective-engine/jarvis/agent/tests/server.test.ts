/**
 * The real server on a random port, exercised over HTTP: auth, Host/Origin checks, the briefing from the real
 * Perspective Engine state.json, tools through the policy, confirmation, reminders, memory and the audit trail.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { peProjectState, type PEState } from '../../core/index'
import type { App } from '../src/app'
import { loadOrCreateToken } from '../src/auth'
import { DEFAULT_PE_STATE, paths } from '../src/config'
import { startServer, type RunningServer } from '../src/server'
import { cleanup, fakeRunner, tempDir, testApp } from './helpers'

let home: string
let root: string
let app: App
let srv: RunningServer
let token: string

function raw(path: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: srv.port, path, method: opts.method ?? 'GET', headers: opts.headers }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers }))
    })
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

async function api(path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${srv.url}${path}`, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  return { status: res.status, json: (await res.json()) as Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
}

beforeAll(async () => {
  home = tempDir('home')
  root = tempDir('root')
  writeFileSync(join(root, 'notes.md'), 'hello from the project\n')
  token = loadOrCreateToken(paths(home).token, {}).token
  app = testApp(home, root, { runner: fakeRunner(), platform: 'darwin' })
  srv = await startServer({ app, token, port: 0 })
})

afterAll(async () => {
  await srv?.close()
  await app?.close()
  cleanup(home, root)
})

describe('agent server: who may call it', () => {
  it('listens on 127.0.0.1 only and refuses any other host', async () => {
    expect(srv.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    await expect(startServer({ app, token, port: 0, host: '0.0.0.0' })).rejects.toThrow(/127\.0\.0\.1 only/)
    await expect(startServer({ app, token, port: 0, host: '::' })).rejects.toThrow(/127\.0\.0\.1 only/)
  })

  it('writes the generated token with mode 0600', () => {
    expect(statSync(paths(home).token).mode & 0o777).toBe(0o600)
    expect(token.length).toBeGreaterThanOrEqual(40)
  })

  it('answers 401 without a token or with a wrong one', async () => {
    expect((await fetch(`${srv.url}/api/status`)).status).toBe(401)
    expect((await fetch(`${srv.url}/api/status`, { headers: { authorization: 'Bearer wrong-token-wrong-token-wrong' } })).status).toBe(401)
    expect((await fetch(`${srv.url}/api/status`, { headers: { authorization: `Basic ${token}` } })).status).toBe(401)
    const r = await fetch(`${srv.url}/api/tasks`, { headers: { authorization: `Bearer ${token}x` } })
    expect(r.status).toBe(401)
    expect(r.headers.get('www-authenticate')).toMatch(/Bearer/)
  })

  it('answers 200 with the right token', async () => {
    const r = await api('/api/status')
    expect(r.status).toBe(200)
    expect(r.json.agent.platform).toBe('darwin')
  })

  it('refuses a foreign Host header (DNS rebinding) with 403, even with the token', async () => {
    for (const host of [`evil.example:${srv.port}`, 'evil.example', `127.0.0.1:${srv.port + 1}`, `localhost.evil.example:${srv.port}`, `127.0.0.1.nip.io:${srv.port}`]) {
      const r = await raw('/api/status', { headers: { host, authorization: `Bearer ${token}` } })
      expect(r.status, host).toBe(403)
      expect(JSON.parse(r.body).error).toBe('forbidden_host')
    }
    const page = await raw('/', { headers: { host: `attacker.test:${srv.port}` } })
    expect(page.status).toBe(403)
    expect((await raw('/api/status', { headers: { host: `localhost:${srv.port}`, authorization: `Bearer ${token}` } })).status).toBe(200)
  })

  it('refuses a foreign Origin with 403, even with the token', async () => {
    for (const origin of ['https://evil.example', 'null', `http://127.0.0.1:${srv.port + 1}`, `https://127.0.0.1:${srv.port}`]) {
      const r = await raw('/api/status', { headers: { host: `127.0.0.1:${srv.port}`, origin, authorization: `Bearer ${token}` } })
      expect(r.status, origin).toBe(403)
      expect(JSON.parse(r.body).error).toBe('forbidden_origin')
    }
    const cross = await raw('/api/status', { headers: { host: `127.0.0.1:${srv.port}`, 'sec-fetch-site': 'cross-site', authorization: `Bearer ${token}` } })
    expect(cross.status).toBe(403)
    const own = await raw('/api/status', { headers: { host: `127.0.0.1:${srv.port}`, origin: `http://127.0.0.1:${srv.port}`, authorization: `Bearer ${token}` } })
    expect(own.status).toBe(200)
  })

  it('sends no CORS headers and refuses preflights', async () => {
    const r = await raw('/api/status', { method: 'OPTIONS', headers: { host: `127.0.0.1:${srv.port}` } })
    expect(r.status).toBe(405)
    expect(r.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('accepts only JSON bodies of bounded size', async () => {
    const form = await raw('/api/ask', { method: 'POST', headers: { host: `127.0.0.1:${srv.port}`, authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' }, body: 'text=hi' })
    expect(form.status).toBe(415)
    const big = await raw('/api/ask', { method: 'POST', headers: { host: `127.0.0.1:${srv.port}`, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(70_000) }) })
    expect(big.status).toBe(413)
    const bad = await raw('/api/ask', { method: 'POST', headers: { host: `127.0.0.1:${srv.port}`, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{not json' })
    expect(bad.status).toBe(400)
  })

  it('serves the console with a strict CSP and no secrets in it', async () => {
    const r = await fetch(`${srv.url}/`)
    expect(r.status).toBe(200)
    const csp = r.headers.get('content-security-policy') ?? ''
    expect(csp).toMatch(/default-src 'none'/)
    expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]+'/)
    expect(csp).toMatch(/frame-ancestors 'none'/)
    expect(r.headers.get('permissions-policy')).toMatch(/microphone=\(self\)/)
    const html = await r.text()
    expect(html).not.toContain(token)
    expect(html).not.toContain('__NONCE__')
    expect(html).toContain('sessionStorage')
    expect(html).toMatch(/SpeechRecognition/)
    expect(html).toMatch(/speechSynthesis/)
    expect(html).toContain('#0a0524')
  })
})

describe('agent server: answers from the record', () => {
  it('ask returns the briefing sentence computed from the real PE state.json', async () => {
    const r = await api('/api/ask', { method: 'POST', body: { text: 'where are we?' } })
    expect(r.status).toBe(200)
    const state = JSON.parse(readFileSync(DEFAULT_PE_STATE, 'utf8')) as PEState
    const ps = peProjectState(state, new Date(state.generated))
    const expected = `Project: ${ps.completed.length} complete, ${ps.in_progress.length} in progress, ${ps.waiting_for_user.length} waiting on you, ${ps.blocked.length} blocked.`
    expect(r.json.intent).toBe('status')
    expect(r.json.answer.startsWith(expected)).toBe(true)
    expect(ps.completed.length + ps.waiting_for_user.length).toBeGreaterThan(0) // the real file has content
  })

  it('status carries all five briefing sections', async () => {
    const r = await api('/api/status')
    const b = r.json.briefing
    for (const k of ['currently', 'completed', 'needsYou', 'next']) expect(typeof b[k].text).toBe('string')
    expect(b.online).toMatch(/^Online since/)
    expect(b.source.ok).toBe(true)
  })

  it('what do you need from me lists the founder gates', async () => {
    const state = JSON.parse(readFileSync(DEFAULT_PE_STATE, 'utf8')) as PEState
    const waiting = peProjectState(state, new Date(state.generated)).waiting_for_user
    const r = await api('/api/ask', { method: 'POST', body: { text: 'what do you need from me' } })
    expect(r.json.intent).toBe('needs_me')
    if (waiting.length) expect(r.json.answer).toContain(waiting[0].id)
  })

  it('stop returns a stop signal and no speech', async () => {
    const r = await api('/api/ask', { method: 'POST', body: { text: 'stop' } })
    expect(r.json.stop).toBe(true)
    expect(r.json.spoken).toBe('')
  })

  it('an open question falls back to the rules provider honestly when no model exists', async () => {
    const r = await api('/api/ask', { method: 'POST', body: { text: 'what is the meaning of the attention-load simulator for investors' } })
    expect(r.json.provider).toBe('rules')
    expect(r.json.answer).toMatch(/No language model is available/)
  })

  it('remind me creates a stored reminder and a verified task', async () => {
    const r = await api('/api/ask', { method: 'POST', body: { text: 'remind me in 20 minutes to stretch' } })
    expect(r.json.intent).toBe('remind')
    expect(r.json.reminder.text).toBe('stretch')
    const tasks = (await api('/api/tasks')).json.tasks as Array<{ id: string; status: string; verifiedBy?: string }>
    const task = tasks.find(t => t.id === r.json.taskId)
    expect(task?.status).toBe('completed')
    expect(task?.verifiedBy).toMatch(/read back/)
    const reminders = (await api('/api/reminders')).json.reminders as Array<{ id: string }>
    expect(reminders.some(x => x.id === r.json.reminder.id)).toBe(true)
  })

  it('reminders can be added directly and dismissed', async () => {
    const add = await api('/api/reminders', { method: 'POST', body: { text: 'in 2 hours call the accountant' } })
    expect(add.status).toBe(201)
    const id = add.json.reminder.id
    const dismissed = await api(`/api/reminders/${id}/dismiss`, { method: 'POST', body: {} })
    expect(dismissed.json.reminder.status).toBe('dismissed')
    expect((await api('/api/reminders', { method: 'POST', body: { text: 'no time in here' } })).status).toBe(400)
  })

  it('decisions go to memory and can be searched', async () => {
    const r = await api('/api/ask', { method: 'POST', body: { text: 'I decided to keep the city link public' } })
    expect(r.json.intent).toBe('decide')
    const m = await api('/api/memory?q=city%20link')
    expect(m.json.items.some((i: { kind: string; text: string }) => i.kind === 'decision' && /city link public/.test(i.text))).toBe(true)
    const secret = await api('/api/memory', { method: 'POST', body: { kind: 'episodic', text: 'my password is hunter2' } })
    expect(secret.status).toBe(400)
  })
})

describe('agent server: tools through the registry and policy', () => {
  it('lists owner tools with their risk levels', async () => {
    const tools = (await api('/api/tools')).json.tools as Array<{ id: string; riskLevel: string; level: number }>
    const ids = tools.map(t => t.id)
    for (const id of ['fs.list', 'fs.read', 'fs.search', 'fs.write', 'fs.overwrite', 'fs.delete', 'shell.run', 'open.url', 'notify', 'say', 'research.search', 'browser.open', 'browser.read', 'browser.click', 'browser.type', 'browser.extract', 'browser.download']) {
      expect(ids).toContain(id)
    }
    expect(tools.find(t => t.id === 'fs.delete')?.level).toBe(3)
  })

  it('reads a file inside the root', async () => {
    const r = await api('/api/tools/fs.read', { method: 'POST', body: { input: { path: 'notes.md' } } })
    expect(r.json.ok).toBe(true)
    expect(r.json.data.content).toContain('hello from the project')
    expect(r.json.task.status).toBe('completed')
  })

  it('refuses path traversal over HTTP', async () => {
    const r = await api('/api/tools/fs.read', { method: 'POST', body: { input: { path: '../../../../etc/passwd' } } })
    expect(r.json.ok).toBe(false)
    expect(r.json.error).toBe('path_refused')
    expect(r.json.task.status).toBe('failed')
  })

  it('refuses a command outside the allowlist', async () => {
    const r = await api('/api/tools/shell.run', { method: 'POST', body: { input: { program: 'rm', args: ['-rf', '/'] } } })
    expect(r.json.ok).toBe(false)
    expect(r.json.summary).toMatch(/not an allowed program/)
    const sneaky = await api('/api/tools/shell.run', { method: 'POST', body: { input: { program: 'npm', args: ['install', 'left-pad'] } } })
    expect(sneaky.json.ok).toBe(false)
  })

  it('a high-risk tool returns needs_confirmation, parks the call, and runs only after Confirm', async () => {
    const r = await api('/api/tools/fs.delete', { method: 'POST', body: { input: { path: 'notes.md' } } })
    expect(r.json.ok).toBe(false)
    expect(r.json.decision).toBe('needs_confirmation')
    expect(r.json.task.status).toBe('waiting_for_user')
    expect(statSync(join(root, 'notes.md')).isFile()).toBe(true) // nothing happened yet

    // "confirmed: true" in the request body is not a way around level 3 for a different call: it is the owner's explicit flag.
    const confirmed = await api(`/api/tasks/${r.json.task.id}/confirm`, { method: 'POST', body: {} })
    expect(confirmed.json.ok).toBe(true)
    expect(confirmed.json.task.status).toBe('completed')
    expect(() => statSync(join(root, 'notes.md'))).toThrow()
    const again = await api(`/api/tasks/${r.json.task.id}/confirm`, { method: 'POST', body: {} })
    expect(again.status).toBe(409)
  })

  it('a parked call can be cancelled', async () => {
    writeFileSync(join(root, 'keep.md'), 'keep me\n')
    const r = await api('/api/tools/fs.overwrite', { method: 'POST', body: { input: { path: 'keep.md', content: 'gone' } } })
    expect(r.json.decision).toBe('needs_confirmation')
    const c = await api(`/api/tasks/${r.json.task.id}/cancel`, { method: 'POST', body: {} })
    expect(c.json.task.status).toBe('cancelled')
    expect(readFileSync(join(root, 'keep.md'), 'utf8')).toBe('keep me\n')
  })

  it('unknown tools are 404', async () => {
    expect((await api('/api/tools/shell.exec', { method: 'POST', body: { input: {} } })).status).toBe(404)
  })

  it('the audit log is on disk, redacted, and never contains the token', async () => {
    await api('/api/tools/fs.write', { method: 'POST', body: { input: { path: 'cfg.txt', content: 'x', mode: 'create' } } })
    await api('/api/tools/research.search', { method: 'POST', body: { input: { query: 'api_key=sk-ant-abcdefghijklmnopqrstuvwxyz0123' } } })
    const entries = (await api('/api/audit?limit=200')).json.entries as Array<{ tool: string; inputSummary: string; decision: string }>
    expect(entries.some(e => e.tool === 'fs.delete' && e.decision === 'needs_confirmation')).toBe(true)
    expect(entries.some(e => e.tool === 'fs.delete' && e.decision === 'confirmed')).toBe(true)
    const file = readFileSync(paths(home).audit, 'utf8')
    expect(file).not.toContain('sk-ant-abcdefghijklmnopqrstuvwxyz0123')
    expect(file).not.toContain(token)
    expect(statSync(paths(home).audit).mode & 0o777).toBe(0o600)
  })
})
