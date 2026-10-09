/**
 * Model detection and routing on the Mac: the RAM-based recommendation, Ollama detection over /api/tags (never a
 * pull), the Anthropic API when a key is set, the `claude` CLI with restricted tools, local-only mode, and graceful
 * degradation to the rules provider. All model endpoints are fakes: nothing leaves this machine.
 *
 * CAPABILITY GAP: no Ollama server, no Anthropic key and no `claude` CLI exist in this container, so real model
 * calls are untested here; the request shapes are asserted against fakes.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { route } from '../../core/index'
import { createApp } from '../src/app'
import { AGENT_ROUTES, buildProviders, CLAUDE_CODE_ARGS, claudeRunner, detectOllama, paramsOf, pickOllamaModel, recommendModel } from '../src/models'
import type { RunOptions } from '../src/exec'
import { cleanup, offlineFetch, tempDir, testConfig } from './helpers'

const GB = 1024 ** 3

interface Seen { url: string; method: string; headers: Record<string, string>; body?: unknown }

/** A fetch that answers like Ollama (and optionally the Anthropic API) and records every request. */
function fakeModelFetch(opts: { ollamaModels?: string[]; ollamaReply?: string; anthropicReply?: string } = {}) {
  const seen: Seen[] = []
  const f = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]))
    seen.push({ url, method: init.method ?? 'GET', headers, body: init.body ? JSON.parse(String(init.body)) : undefined })
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (url.startsWith('http://127.0.0.1:11434')) {
      if (!opts.ollamaModels) throw new TypeError('fetch failed')
      if (url.endsWith('/api/tags')) return json(200, { models: opts.ollamaModels.map(name => ({ name })) })
      if (url.endsWith('/api/chat')) return json(200, { message: { role: 'assistant', content: opts.ollamaReply ?? 'from ollama' } })
      return json(404, { error: 'not found' })
    }
    if (url === 'https://api.anthropic.com/v1/messages' && opts.anthropicReply) return json(200, { content: [{ type: 'text', text: opts.anthropicReply }], stop_reason: 'end_turn' })
    throw new TypeError('fetch failed')
  }) as typeof fetch
  return { f, seen }
}

describe('model recommendation by memory (a suggestion only)', () => {
  it('picks 7-8B up to 16 GB, 14B up to 63 GB, 32B class from 64 GB', () => {
    expect(recommendModel(8 * GB).sizeClass).toBe('7-8B')
    expect(recommendModel(16 * GB).sizeClass).toBe('7-8B')
    expect(recommendModel(18 * GB).sizeClass).toBe('14B')
    expect(recommendModel(32 * GB).sizeClass).toBe('14B')
    expect(recommendModel(48 * GB).sizeClass).toBe('14B')
    expect(recommendModel(64 * GB).sizeClass).toBe('32B')
    expect(recommendModel(128 * GB).sizeClass).toBe('32B')
    expect(recommendModel(32 * GB).suggestions.every(s => /:14b$/.test(s))).toBe(true)
  })

  it('reads parameter counts from tags and chooses the largest installed model that fits', () => {
    expect(paramsOf('qwen3:14b')).toBe(14)
    expect(paramsOf('llama3.1:8b-instruct-q4_K_M')).toBe(8)
    expect(paramsOf('mistral:latest')).toBeNull()
    const installed = ['llama3.1:8b', 'qwen3:14b', 'qwen3:32b', 'nomic-embed-text:latest']
    expect(pickOllamaModel(installed, recommendModel(16 * GB))).toBe('llama3.1:8b')
    expect(pickOllamaModel(installed, recommendModel(32 * GB))).toBe('qwen3:14b')
    expect(pickOllamaModel(installed, recommendModel(96 * GB))).toBe('qwen3:32b')
    expect(pickOllamaModel(['qwen3:32b'], recommendModel(16 * GB))).toBe('qwen3:32b') // only one: used, with a note
    expect(pickOllamaModel(installed, recommendModel(16 * GB), 'qwen3:14b')).toBe('qwen3:14b')
    expect(pickOllamaModel(installed, recommendModel(16 * GB), 'phi4:14b')).toBeUndefined() // configured but missing
    expect(pickOllamaModel([], recommendModel(16 * GB))).toBeUndefined()
  })
})

describe('provider detection', () => {
  const deps = (over: Partial<Parameters<typeof buildProviders>[1]> = {}) => ({ env: {}, which: () => null, cwd: '/tmp', rules: () => 'rules answer', totalBytes: 32 * GB, ...over })
  const models = (over: Partial<ReturnType<typeof testConfig>['models']> = {}) => ({ ...testConfig('/tmp').models, ollamaHost: 'http://127.0.0.1:11434', claudeCode: true, ...over })

  it('with nothing installed: rules only, and a note that says what to pull yourself', async () => {
    const { f, seen } = fakeModelFetch()
    const { providers, report } = await buildProviders(models(), deps({ fetch: f }))
    expect(providers.map(p => p.id)).toEqual(['rules'])
    expect(report.ollama.running).toBe(false)
    expect(report.ollama.note).toMatch(/ollama pull qwen3:14b` yourself/)
    expect(seen.every(s => !s.url.includes('/api/pull'))).toBe(true)
  })

  it('Ollama running without models: still never pulls', async () => {
    const { f, seen } = fakeModelFetch({ ollamaModels: [] })
    const { report } = await buildProviders(models(), deps({ fetch: f }))
    expect(report.ollama.running).toBe(true)
    expect(report.ollama.chosen).toBeUndefined()
    expect(report.ollama.note).toMatch(/no models/)
    expect(seen.map(s => s.url)).toEqual(['http://127.0.0.1:11434/api/tags'])
  })

  it('detects Ollama models over /api/tags and puts the local model first', async () => {
    const { f } = fakeModelFetch({ ollamaModels: ['llama3.1:8b', 'qwen3:14b'] })
    expect((await detectOllama('http://127.0.0.1:11434/', f)).installed).toEqual(['llama3.1:8b', 'qwen3:14b'])
    const { providers, report } = await buildProviders(models(), deps({ fetch: f, env: { ANTHROPIC_API_KEY: 'sk-ant-test-key-0000000000' }, which: () => '/usr/local/bin/claude' }))
    expect(report.ollama.chosen).toBe('qwen3:14b')
    expect(providers.map(p => p.id)).toEqual(['ollama', 'anthropic', 'claude-code', 'rules'])
    expect(providers[0].local).toBe(true)
  })

  it('local-only mode drops every cloud provider', async () => {
    const { f } = fakeModelFetch({ ollamaModels: ['qwen3:8b'] })
    const { providers, report } = await buildProviders(models({ localOnly: true }), deps({ fetch: f, env: { ANTHROPIC_API_KEY: 'sk-ant-test-key-0000000000' }, which: () => '/usr/local/bin/claude' }))
    expect(providers.map(p => p.id)).toEqual(['ollama', 'rules'])
    expect(report.anthropic.configured).toBe(false)
    expect(report.claudeCode.path).toBeNull()
  })

  it('the sensitive route never leaves the device, whatever is configured', () => {
    const fake = (id: string, local: boolean) => ({ id, local, available: async () => true, chat: async () => ({ text: id }) })
    expect(route('sensitive', [fake('anthropic', false), fake('claude-code', false), fake('rules', true)], AGENT_ROUTES).local).toBe(true)
    expect(AGENT_ROUTES.conversation).toEqual(['ollama', 'anthropic', 'claude-code', 'rules'])
  })

  it('the claude CLI is restricted: read-only tools, no prompts, no MCP, never --dangerously-skip-permissions, no agent token', async () => {
    expect(CLAUDE_CODE_ARGS).toEqual(['--tools', 'Read,Grep,Glob', '--allowedTools', 'Read,Grep,Glob', '--permission-mode', 'dontAsk', '--strict-mcp-config', '--no-session-persistence'])
    expect(CLAUDE_CODE_ARGS.join(' ')).not.toMatch(/dangerously|bypassPermissions|Bash|Write|Edit/)
    const seen: Array<{ program: string; args: string[]; opts?: RunOptions }> = []
    const saved = process.env.JARVIS_TOKEN
    process.env.JARVIS_TOKEN = 'agent-token-that-must-not-leak-000000'
    try {
      const run = claudeRunner('/usr/local/bin/claude', '/repo', async (program, args, opts) => {
        seen.push({ program, args, opts })
        return { code: 0, stdout: '{"result":"ok"}', stderr: '', timedOut: false, truncated: false }
      })
      await run(['-p'], 'question')
    } finally {
      if (saved === undefined) delete process.env.JARVIS_TOKEN
      else process.env.JARVIS_TOKEN = saved
    }
    expect(seen[0].program).toBe('/usr/local/bin/claude')
    expect(seen[0].opts?.cwd).toBe('/repo')
    expect(seen[0].opts?.input).toBe('question')
    expect(seen[0].opts?.env?.JARVIS_TOKEN).toBeUndefined()
  })
})

describe('open questions through the agent', () => {
  let home: string
  let root: string
  beforeEach(() => {
    home = tempDir('models-home')
    root = tempDir('models-root')
  })
  afterEach(() => cleanup(home, root))

  it('goes to local Ollama first, with project status and memory passed as wrapped data', async () => {
    const { f, seen } = fakeModelFetch({ ollamaModels: ['qwen3:8b'], ollamaReply: 'Ollama says the plan is sound.' })
    const app = createApp({ home, config: testConfig(root, { models: { ...testConfig(root).models, ollamaHost: 'http://127.0.0.1:11434' } }), env: {}, fetch: f, which: () => null, totalBytes: 16 * GB, platform: 'linux' })
    try {
      await app.remember('preference', 'I prefer short answers about the pitch deck')
      const r = await app.ask('give me your view on the pitch deck structure')
      expect(r.provider).toBe('ollama')
      expect(r.answer).toBe('Ollama says the plan is sound.')
      const chat = seen.find(s => s.url.endsWith('/api/chat'))!
      const body = chat.body as { model: string; stream: boolean; messages: Array<{ role: string; content: string }> }
      expect(body.model).toBe('qwen3:8b')
      expect(body.stream).toBe(false)
      expect(body.messages[0].role).toBe('system')
      expect(body.messages[0].content).toMatch(/You are Jarvis/)
      const all = body.messages.map(m => m.content).join('\n')
      expect(all).toMatch(/<<EXTERNAL source="perspective-engine state\.json" trust="tool">>/)
      expect(all).toMatch(/trust="memory">>\npreference \(\d{4}-\d\d-\d\d\): I prefer short answers/)
      // One user turn: the wrapped data blocks first, the owner's request last.
      expect(body.messages).toHaveLength(2)
      expect(body.messages[1].role).toBe('user')
      expect(body.messages[1].content.endsWith('Request:\ngive me your view on the pitch deck structure')).toBe(true)
      expect(seen.some(s => s.url.includes('/api/pull'))).toBe(false)
      const task = app.tasks().find(t => t.id === r.taskId)
      expect(task?.status).toBe('completed')
      expect(task?.verifiedBy).toBe('answer returned by ollama')
    } finally {
      await app.close()
    }
  })

  it('uses the Anthropic API when only a key is set, and the key never reaches disk', async () => {
    const key = 'sk-ant-api03-thisisnotarealkeybutlookslikeone0000'
    const { f, seen } = fakeModelFetch({ anthropicReply: 'Claude answers.' })
    const app = createApp({ home, config: testConfig(root), env: { ANTHROPIC_API_KEY: key }, fetch: f, which: () => null, platform: 'linux' })
    try {
      const r = await app.ask('what should the investor memo emphasise')
      expect(r.provider).toBe('anthropic')
      expect(r.answer).toBe('Claude answers.')
      const call = seen.find(s => s.url === 'https://api.anthropic.com/v1/messages')!
      expect(call.headers['x-api-key']).toBe(key)
      expect(call.headers['anthropic-version']).toBe('2023-06-01')
      for (const file of [app.paths.audit, app.paths.tasks]) {
        let text = ''
        try {
          text = readFileSync(file, 'utf8')
        } catch {
          text = ''
        }
        expect(text).not.toContain(key)
      }
    } finally {
      await app.close()
    }
  })

  it('uses the claude CLI when it is on PATH, with the restricted arguments', async () => {
    const calls: Array<{ program: string; args: string[] }> = []
    const runner = async (program: string, args: string[]) => {
      calls.push({ program, args })
      return { code: 0, stdout: args.includes('--version') ? '2.0.0 (Claude Code)' : JSON.stringify({ type: 'result', result: 'From Claude Code.' }), stderr: '', timedOut: false, truncated: false }
    }
    const cfg = testConfig(root)
    const app = createApp({ home, config: { ...cfg, models: { ...cfg.models, claudeCode: true } }, env: {}, fetch: offlineFetch, which: n => (n === 'claude' ? '/opt/bin/claude' : null), runner, platform: 'linux' })
    try {
      const r = await app.ask('summarise the go-to-market risks')
      expect(r.provider).toBe('claude-code')
      expect(r.answer).toBe('From Claude Code.')
      const chat = calls.find(c => c.args.includes('-p'))!
      expect(chat.program).toBe('/opt/bin/claude')
      expect(chat.args.slice(0, 3)).toEqual(['-p', '--output-format', 'json'])
      expect(chat.args).toEqual(expect.arrayContaining(CLAUDE_CODE_ARGS))
      expect(chat.args.join(' ')).not.toMatch(/dangerously/)
    } finally {
      await app.close()
    }
  })

  it('local-only mode answers from the record rather than send the question to the cloud', async () => {
    const { f, seen } = fakeModelFetch({ anthropicReply: 'should not be used' })
    const cfg = testConfig(root)
    const app = createApp({ home, config: { ...cfg, models: { ...cfg.models, localOnly: true } }, env: { ANTHROPIC_API_KEY: 'sk-ant-test-key-0000000000' }, fetch: f, which: () => '/opt/bin/claude', platform: 'linux' })
    try {
      const r = await app.ask('draft a note about our pricing')
      expect(r.provider).toBe('rules')
      expect(seen.some(s => s.url.startsWith('https://api.anthropic.com'))).toBe(false)
    } finally {
      await app.close()
    }
  })

  it('when the only model fails, the answer degrades to the rules provider and the status says so', async () => {
    const failing = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: 'qwen3:8b' }] }), { status: 200 })
      return new Response('model crashed', { status: 500 })
    }) as typeof fetch
    const app = createApp({ home, config: testConfig(root, { models: { ...testConfig(root).models, ollamaHost: 'http://127.0.0.1:11434' } }), env: {}, fetch: failing, which: () => null, platform: 'linux' })
    try {
      const r = await app.ask('what do you think about the brand colours')
      expect(r.provider).toBe('rules')
      expect(r.answer).toMatch(/No language model is available/)
      const status = await app.status()
      expect(status.models?.order).toEqual(['ollama', 'rules'])
    } finally {
      await app.close()
    }
    const none = createApp({ home: join(home, 'n'), config: testConfig(root), env: {}, fetch: offlineFetch, which: () => null, platform: 'linux' })
    try {
      const s = await none.status()
      expect(s.capabilityGaps.join(' ')).toMatch(/No language model is available/)
      expect(s.briefing.online).toMatch(/answer from the record only/)
    } finally {
      await none.close()
    }
  })
})
