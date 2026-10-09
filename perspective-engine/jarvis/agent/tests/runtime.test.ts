/**
 * Token, configuration, persistence and redaction, plus the real command line (`npm run jarvis`) started as a child
 * process with JARVIS_HOME in a temp dir: start, call the API, stop, the token command, and the host refusal.
 */
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { allowedOrigins, bearerToken, hostAllowed, isAuthorized, loadOrCreateToken, MIN_TOKEN_LENGTH, originAllowed, safeEqual } from '../src/auth'
import { defaultConfig, JARVIS_DIR, jarvisHome, loadConfig, normaliseOllamaHost, paths, PE_REPO_DIR } from '../src/config'
import { percentDecode, redactDeep, redactText } from '../src/redaction'
import { appendJsonl, fileMemoryStore, fileTaskStore, readJson, readJsonl, writeJsonAtomic } from '../src/store'
import { cleanup, offlineFetch, tempDir, testApp } from './helpers'

let dir: string
beforeEach(() => {
  dir = tempDir('rt')
})
afterEach(() => cleanup(dir))

describe('token', () => {
  it('is generated once into the token file with mode 0600 and reused', () => {
    const file = join(dir, 'token')
    const a = loadOrCreateToken(file, {})
    expect(a.source).toBe('created')
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    const b = loadOrCreateToken(file, {})
    expect(b).toEqual({ token: a.token, source: 'file', path: file })
  })

  it('tightens a token file someone loosened', () => {
    const file = join(dir, 'token')
    loadOrCreateToken(file, {})
    chmodSync(file, 0o644)
    loadOrCreateToken(file, {})
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  it('JARVIS_TOKEN wins, and must be long enough', () => {
    const env = { JARVIS_TOKEN: 'e'.repeat(MIN_TOKEN_LENGTH) }
    expect(loadOrCreateToken(join(dir, 'token'), env)).toEqual({ token: env.JARVIS_TOKEN, source: 'env' })
    expect(existsSync(join(dir, 'token'))).toBe(false)
    expect(() => loadOrCreateToken(join(dir, 'token'), { JARVIS_TOKEN: 'short' })).toThrow(/at least/)
  })

  it('compares in constant time and parses only Bearer', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(bearerToken('Bearer xyz')).toBe('xyz')
    expect(bearerToken('bearer   xyz  ')).toBe('xyz')
    expect(bearerToken('Basic xyz')).toBeNull()
    expect(bearerToken(['Bearer a', 'Bearer b'])).toBeNull()
    expect(isAuthorized('Bearer t'.padEnd(40, 'x'), 't'.padEnd(33, 'x'))).toBe(true)
    expect(isAuthorized(undefined, 'secret')).toBe(false)
  })

  it('accepts only loopback Host names on our port and only our own Origin', () => {
    expect(hostAllowed('127.0.0.1:7777', 7777)).toBe(true)
    expect(hostAllowed('LOCALHOST:7777', 7777)).toBe(true)
    for (const h of ['127.0.0.1', '127.0.0.1:7778', 'evil.example:7777', '[::1]:7777', '0.0.0.0:7777', '127.0.0.2:7777', undefined]) expect(hostAllowed(h, 7777), String(h)).toBe(false)
    expect(originAllowed(undefined, 7777)).toBe(true)
    expect(originAllowed('http://localhost:7777', 7777)).toBe(true)
    for (const o of ['null', 'https://127.0.0.1:7777', 'http://127.0.0.1:7778', 'http://evil.example', 'file://', '']) expect(originAllowed(o, 7777), o).toBe(false)
    expect(allowedOrigins(1234)).toEqual(['http://127.0.0.1:1234', 'http://localhost:1234'])
  })
})

describe('configuration', () => {
  it('writes defaults the first time; the PE repository is the default root', () => {
    const cfg = loadConfig(dir, {})
    expect(existsSync(paths(dir).config)).toBe(true)
    expect(cfg.roots).toEqual([PE_REPO_DIR])
    expect(cfg.projectRoots).toEqual([PE_REPO_DIR])
    expect(cfg.port).toBe(7777)
    expect(cfg.peStatePath).toBe(join(PE_REPO_DIR, 'city', 'public', 'state.json'))
    expect(JARVIS_DIR).toBe(join(PE_REPO_DIR, 'jarvis'))
  })

  it('applies environment overrides', () => {
    const cfg = loadConfig(dir, {
      JARVIS_PORT: '7799',
      JARVIS_PE_STATE: join(dir, 'state.json'),
      OLLAMA_HOST: '127.0.0.1:11500',
      JARVIS_OLLAMA_MODEL: 'qwen3:14b',
      JARVIS_LOCAL_ONLY: '1',
      JARVIS_CLAUDE_CODE: '0',
      JARVIS_SAY: '0',
      JARVIS_BROWSER_HEADLESS: '0',
      HOME: '/Users/founder',
    })
    expect(cfg.port).toBe(7799)
    expect(cfg.peStatePath).toBe(join(dir, 'state.json'))
    expect(cfg.models).toMatchObject({ ollamaHost: 'http://127.0.0.1:11500', ollamaModel: 'qwen3:14b', localOnly: true, claudeCode: false })
    expect(cfg.voice.say).toBe(false)
    expect(cfg.browser.headless).toBe(false)
    expect(normaliseOllamaHost('https://box:1')).toBe('https://box:1')
    expect(defaultConfig({ HOME: '/Users/founder' }).browser.downloadDir).toBe('/Users/founder/Downloads/jarvis')
  })

  it('invalid values fall back to safe defaults instead of widening anything', () => {
    writeJsonAtomic(paths(dir).config, {
      roots: ['relative/path', 42, ''],
      projectRoots: 'not-a-list',
      port: 99999,
      voice: { rate: 5000 },
      policy: { preApproved: ['browser.click', 7], denied: ['shell.run'] },
      reminders: { intervalMs: 10 },
      models: { localOnly: 'yes' },
    })
    const cfg = loadConfig(dir, { JARVIS_PORT: 'abc' })
    expect(cfg.roots).toEqual([PE_REPO_DIR])
    expect(cfg.projectRoots).toEqual([PE_REPO_DIR])
    expect(cfg.port).toBe(7777)
    expect(cfg.voice.rate).toBeUndefined()
    expect(cfg.policy).toEqual({ preApproved: ['browser.click'], denied: ['shell.run'] })
    expect(cfg.reminders.intervalMs).toBe(15_000)
    expect(cfg.models.localOnly).toBe(false)
  })

  it('JARVIS_HOME moves the private folder', () => {
    expect(jarvisHome({ JARVIS_HOME: dir })).toBe(dir)
    expect(jarvisHome({}).endsWith('.jarvis')).toBe(true)
  })

  it('policy from config.json reaches the registry: denied tools disappear, pre-approval never covers level 3', async () => {
    const root = join(dir, 'root')
    mkdirSync(root)
    writeFileSync(join(root, 'a.txt'), 'a')
    const base = testApp(join(dir, 'h0'), root)
    const cfg = { ...base.config, policy: { preApproved: ['fs.delete', 'browser.click'], denied: ['shell.run'] } }
    await base.close()
    const { createApp } = await import('../src/app')
    const app = createApp({ home: join(dir, 'h1'), config: cfg, env: {}, fetch: offlineFetch, which: () => null, platform: 'linux' })
    try {
      expect(app.tools().map(t => t.id)).not.toContain('shell.run')
      expect((await app.runTool('shell.run', { program: 'ls' }, false))?.decision).toBe('denied')
      expect((await app.runTool('fs.delete', { path: 'a.txt' }, false))?.decision).toBe('needs_confirmation')
      expect(existsSync(join(root, 'a.txt'))).toBe(true)
    } finally {
      await app.close()
    }
  })
})

describe('persistence', () => {
  it('writes JSON atomically with mode 0600 and keeps a corrupt file aside', () => {
    const file = join(dir, 'x.json')
    writeJsonAtomic(file, { a: 1 })
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(readJson(file, null)).toEqual({ a: 1 })
    expect(readdirSync(dir).filter(f => f.endsWith('.tmp'))).toEqual([])
    writeFileSync(file, '{broken')
    expect(readJson(file, { fallback: true })).toEqual({ fallback: true })
    expect(readdirSync(dir).some(f => f.startsWith('x.json.corrupt-'))).toBe(true)
  })

  it('JSONL: torn lines are skipped, files rotate at the size limit, mode 0600', () => {
    const file = join(dir, 'log.jsonl')
    appendJsonl(file, { n: 1 })
    writeFileSync(file, `${readFileSync(file, 'utf8')}{"n": 2, torn\n`)
    appendJsonl(file, { n: 3 })
    expect(readJsonl<{ n: number }>(file).map(x => x.n)).toEqual([1, 3])
    expect(readJsonl<{ n: number }>(file, 1)).toEqual([{ n: 3 }])
    expect(statSync(file).mode & 0o777).toBe(0o600)
    appendJsonl(file, { n: 4 }, 10) // over 10 bytes: rotated first
    expect(existsSync(`${file}.1`)).toBe(true)
    expect(readJsonl(file)).toEqual([{ n: 4 }])
  })

  it('memory survives a restart, and a removed memory is gone from disk', async () => {
    const file = join(dir, 'memory.jsonl')
    const m1 = fileMemoryStore(file)
    await m1.add({ id: 'm1', kind: 'decision', at: '2026-10-09T00:00:00Z', text: 'keep the city link public' })
    await m1.add({ id: 'm2', kind: 'preference', at: '2026-10-09T00:00:00Z', text: 'short answers' })
    const m2 = fileMemoryStore(file)
    expect((await m2.all()).map(m => m.id)).toEqual(['m1', 'm2'])
    expect((await m2.search('city link'))[0].id).toBe('m1')
    await m2.remove('m1')
    expect(readFileSync(file, 'utf8')).not.toContain('keep the city link public')
    expect((await fileMemoryStore(file).all()).map(m => m.id)).toEqual(['m2'])
  })
})

describe('redaction of everything written to disk', () => {
  it('catches keys hidden by URL encoding, once or twice', () => {
    expect(redactText('q=api_key%3Dsk-ant-abcdefghijklmnopqrstuvwxyz0123')).not.toContain('sk-ant-abcdefghijklmnop')
    expect(redactText('q=x%253Dsk-ant-abcdefghijklmnopqrstuvwxyz0123')).not.toContain('abcdefghijklmnop')
    expect(redactText('token%3Dghp_abcdefghijklmnopqrstuvwxyz0123456789')).not.toContain('ghp_abcdefghijklmnop')
    // Ordinary encoded text is left exactly as it was.
    expect(redactText('q=hello%20world')).toBe('q=hello%20world')
    expect(percentDecode('%E2%9C%93 %zz %')).toBe('✓ %zz %')
  })

  it('redacts nested values, except a parked call input', () => {
    const v = redactDeep({ a: ['Bearer abcdefghijklmnop'], pending: { input: { content: 'password=hunter2' } } }, new Set(['input']))
    expect(v.a[0]).toBe('Bearer [REDACTED]')
    expect(v.pending.input.content).toBe('password=hunter2')
  })

  it('tasks.json never holds a secret from a title, a summary or a result, but a parked call keeps its exact input', () => {
    const file = join(dir, 'tasks.json')
    const store = fileTaskStore(file)
    const t = store.create({ title: 'Search: api_key=sk-ant-abcdefghijklmnopqrstuvwxyz0123', source: 'request' }, new Date())
    const stored = store.put({ ...t, result: { url: 'https://x.test/?k=sk-ant-abcdefghijklmnopqrstuvwxyz0123' }, pending: { tool: 'fs.write', input: { content: 'password=hunter2' }, requestedAt: 'now' } })
    const disk = readFileSync(file, 'utf8')
    expect(disk).not.toContain('sk-ant-abcdefghijklmnop')
    expect(stored.title).toMatch(/REDACTED/)
    expect(disk).toContain('password=hunter2')
    expect(fileTaskStore(file).get(t.id)?.pending?.input).toEqual({ content: 'password=hunter2' })
  })

  it('the audit log written by the app is redacted, including percent-encoded keys in tool errors', async () => {
    const root = join(dir, 'root')
    mkdirSync(root)
    const app = testApp(join(dir, 'home'), root)
    try {
      app.recordAudit({ at: new Date().toISOString(), actor: 'owner', tool: 'test', inputSummary: 'u=https://a.test/?q=key%3Dsk-ant-abcdefghijklmnopqrstuvwxyz0123', resultSummary: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz', risk: 'safe', decision: 'auto', ok: true })
      const text = readFileSync(app.paths.audit, 'utf8')
      expect(text).not.toContain('abcdefghijklmnopqrstuvwxyz')
      expect(text).toContain('REDACTED')
    } finally {
      await app.close()
    }
  })
})

// ---------- the real CLI ----------

const TSX = join(JARVIS_DIR, 'node_modules', '.bin', 'tsx')
const MAIN = join(JARVIS_DIR, 'agent', 'src', 'main.ts')

function cliEnv(home: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, JARVIS_HOME: home, OLLAMA_HOST: '127.0.0.1:9', JARVIS_CLAUDE_CODE: '0', ANTHROPIC_API_KEY: '', JARVIS_SAY: '0', ...extra }
  delete env.JARVIS_TOKEN
  delete env.JARVIS_HOST
  if (extra.JARVIS_TOKEN) env.JARVIS_TOKEN = extra.JARVIS_TOKEN
  if (extra.JARVIS_HOST) env.JARVIS_HOST = extra.JARVIS_HOST
  return env
}

function runCli(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX, [MAIN, ...args], { cwd: JARVIS_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', c => (stdout += c))
    child.stderr.on('data', c => (stderr += c))
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
}

describe('command line (npm run jarvis)', () => {
  it('start: listens on 127.0.0.1, answers with the token, writes a pid file, stops cleanly on SIGTERM', async () => {
    const home = join(dir, 'home')
    const token = 'cli-test-token-'.padEnd(40, 'z')
    const child = spawn(TSX, [MAIN], { cwd: JARVIS_DIR, env: cliEnv(home, { JARVIS_PORT: '0', JARVIS_TOKEN: token }), stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stderr.on('data', c => (err += c))
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no console line; stdout: ${out} stderr: ${err}`)), 30_000)
      child.stdout.on('data', c => {
        out += c
        const m = out.match(/console: (http:\/\/127\.0\.0\.1:\d+)\//)
        if (m) {
          clearTimeout(timer)
          resolve(m[1])
        }
      })
      child.on('exit', code => reject(new Error(`exited early with ${code}: ${err}`)))
    })
    try {
      expect(out).not.toContain(token) // the token is never printed on start
      expect((await fetch(`${url}/api/status`)).status).toBe(401)
      const ok = await fetch(`${url}/api/status`, { headers: { authorization: `Bearer ${token}` } })
      expect(ok.status).toBe(200)
      const body = (await ok.json()) as { agent: { pid: number; home: string } }
      expect(body.agent.home).toBe(home)
      // tsx runs the agent in a child node process, so compare with the pid file rather than the wrapper's pid.
      expect(readFileSync(paths(home).pid, 'utf8').trim()).toBe(String(body.agent.pid))
      expect(statSync(home).mode & 0o777).toBe(0o700)
    } finally {
      const exited = new Promise<number | null>(r => child.on('exit', code => r(code)))
      // `npm run jarvis -- stop` does exactly this: SIGTERM to the pid in the pid file.
      const stop = await runCli(['stop'], cliEnv(home))
      expect(stop.stdout).toMatch(/Sent SIGTERM/)
      expect(await exited).toBe(0)
    }
    expect(existsSync(paths(home).pid)).toBe(false)
    expect((await runCli(['stop'], cliEnv(home))).stdout).toMatch(/No running agent/)
  }, 60_000)

  it('refuses JARVIS_HOST other than 127.0.0.1', async () => {
    const r = await runCli([], cliEnv(join(dir, 'home'), { JARVIS_HOST: '0.0.0.0', JARVIS_PORT: '0' }))
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/JARVIS_HOST=0\.0\.0\.0 refused/)
  }, 60_000)

  it('token prints the token only when asked and creates it with mode 0600', async () => {
    const home = join(dir, 'home')
    const r = await runCli(['token'], cliEnv(home))
    expect(r.code).toBe(0)
    const token = r.stdout.trim()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(readFileSync(paths(home).token, 'utf8').trim()).toBe(token)
    expect(statSync(paths(home).token).mode & 0o777).toBe(0o600)
    expect((await runCli(['bogus'], cliEnv(home))).code).toBe(2)
  }, 60_000)

  it('doctor reports what is present and what is optional, honestly', async () => {
    const r = await runCli(['doctor'], cliEnv(join(dir, 'home')))
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/ok {2}Node 20 or newer/)
    expect(r.stdout).toMatch(/project record readable/)
    expect(r.stdout).toMatch(/NO {2}Ollama: Ollama is not running/)
    expect(r.stdout).toMatch(/recommended local model/)
    expect(r.stdout).toMatch(process.platform === 'darwin' ? /ok {2}macOS/ : /NO {2}macOS/)
  }, 60_000)
})

describe('briefing without a project record', () => {
  it('says the record is unavailable instead of inventing numbers', async () => {
    const root = join(dir, 'root')
    mkdirSync(root)
    const { createApp } = await import('../src/app')
    const base = testApp(join(dir, 'h0'), root)
    const cfg = { ...base.config, peStatePath: join(dir, 'missing-state.json') }
    await base.close()
    const app = createApp({ home: join(dir, 'h1'), config: cfg, env: {}, fetch: offlineFetch, which: () => null, platform: 'linux' })
    try {
      const s = await app.status()
      expect(s.briefing.source.ok).toBe(false)
      expect(s.briefing.online).toMatch(/project record is unavailable: the state file does not exist/)
      const r = await app.ask('where are we')
      expect(r.answer).toMatch(/^I have no project data yet/)
      expect(r.answer).not.toMatch(/\d+ complete/)
    } finally {
      await app.close()
    }
  })
})
