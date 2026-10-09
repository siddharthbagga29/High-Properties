import { describe, expect, it, vi } from 'vitest'
import { createAuditLog } from '../core/audit'
import { DEFAULT_POLICY } from '../core/policy'
import { BACKOFF_BASE_MS, BREAKER_OPEN_MS, createRegistry, validate } from '../core/tools'
import type { JarvisTool, JSONSchema, RiskLevel, ToolResult } from '../core/types'

const schema: JSONSchema = {
  type: 'object',
  properties: { q: { type: 'string' }, n: { type: 'number' }, mode: { type: 'string', enum: ['fast', 'deep'] }, tags: { type: 'array' }, opts: { type: 'object' }, flag: { type: 'boolean' } },
  required: ['q'],
}

function makeTool(over: Partial<JarvisTool> & { run?: JarvisTool['execute'] } = {}): JarvisTool {
  const { run, ...rest } = over
  return {
    id: 'search',
    name: 'Search',
    description: 'search the record',
    schema,
    riskLevel: 'safe',
    requiresConfirmation: false,
    scope: 'public',
    execute: run ?? (async input => ({ ok: true, summary: `found ${String(input.q)}` })),
    ...rest,
  }
}

function setup(over: Parameters<typeof makeTool>[0] = {}, clock = { t: Date.parse('2026-10-08T12:00:00Z') }) {
  const audit = createAuditLog()
  const sleeps: number[] = []
  const registry = createRegistry({ audit, now: () => new Date(clock.t), sleep: async ms => void sleeps.push(ms) })
  const tool = makeTool(over)
  registry.register(tool)
  return { registry, audit, sleeps, clock, tool }
}

describe('validate', () => {
  it('accepts matching input', () => {
    expect(validate(schema, { q: 'x', n: 2, mode: 'deep', tags: [], opts: {}, flag: true })).toBeNull()
  })

  it.each([
    [null, 'input must be an object'],
    [['q'], 'input must be an object'],
    [{}, 'missing required field "q"'],
    [{ q: 1 }, 'field "q" must be of type string'],
    [{ q: 'x', n: Number.NaN }, 'field "n" must be of type number'],
    [{ q: 'x', mode: 'slow' }, 'field "mode" must be one of: fast, deep'],
    [{ q: 'x', tags: 'a' }, 'field "tags" must be of type array'],
    [{ q: 'x', opts: [] }, 'field "opts" must be of type object'],
    [{ q: 'x', extra: 1 }, 'unexpected field "extra"'],
    [JSON.parse('{"q":"x","__proto__":{"admin":true}}'), 'unexpected field "__proto__"'],
  ])('%j -> %s', (input, message) => {
    expect(validate(schema, input)).toBe(message)
  })
})

describe('registry basics', () => {
  it('rejects duplicate and malformed tools', () => {
    const { registry } = setup()
    expect(() => registry.register(makeTool())).toThrow(/already registered/)
    expect(() => registry.register(makeTool({ id: 'bad', riskLevel: 'extreme' as RiskLevel }))).toThrow(/risk/)
    expect(() => registry.register({ ...makeTool({ id: 'bad2' }), schema: { type: 'array' } as unknown as JSONSchema })).toThrow(/schema/)
  })

  it('lists only what a viewer may use', () => {
    const { registry } = setup()
    registry.register(makeTool({ id: 'send', scope: 'owner', riskLevel: 'high' }))
    registry.register(makeTool({ id: 'public-low', scope: 'public', riskLevel: 'low' }))
    expect(registry.list('visitor').map(t => t.id)).toEqual(['search'])
    expect(registry.list('owner').map(t => t.id)).toEqual(['search', 'send', 'public-low'])
  })

  it('runs an allowed tool and audits it', async () => {
    const { registry, audit } = setup()
    const r = await registry.run('search', { q: 'gates' }, { viewer: 'owner', taskId: 'T1' })
    expect(r).toMatchObject({ ok: true, summary: 'found gates', decision: 0 })
    expect(audit.entries()).toEqual([expect.objectContaining({ tool: 'search', decision: 'auto', ok: true, actor: 'owner', task: 'T1', risk: 'safe', inputSummary: '{"q":"gates"}' })])
  })

  it('refuses unknown tools and invalid input, auditing both', async () => {
    const { registry, audit } = setup()
    expect(await registry.run('nope', {}, { viewer: 'owner' })).toMatchObject({ ok: false, error: 'unknown_tool', decision: 'denied' })
    expect(await registry.run('search', { q: 3 }, { viewer: 'owner' })).toMatchObject({ ok: false, error: 'invalid_input', decision: 'denied' })
    expect(audit.entries().map(e => [e.tool, e.decision, e.ok])).toEqual([['nope', 'denied', false], ['search', 'denied', false]])
  })

  it('treats a malformed tool result as a failure', async () => {
    const { registry } = setup({ run: async () => 'done' as unknown as ToolResult })
    expect(await registry.run('search', { q: 'x' }, { viewer: 'owner' })).toMatchObject({ ok: false, error: 'invalid_result' })
  })

  it('passes the viewer, task, confirmation and clock to the tool', async () => {
    const seen = vi.fn(async () => ({ ok: true, summary: 'ok' }))
    const { registry } = setup({ run: seen })
    await registry.run('search', { q: 'x' }, { viewer: 'owner', taskId: 'T9' })
    expect(seen).toHaveBeenCalledWith({ q: 'x' }, expect.objectContaining({ viewer: 'owner', taskId: 'T9', confirmed: false, signal: expect.any(AbortSignal), now: expect.any(Function) }))
  })
})

describe('policy and confirmation', () => {
  it('denies a visitor an owner tool and audits the denial as the visitor', async () => {
    const run = vi.fn(async () => ({ ok: true, summary: 'sent' }))
    const { registry, audit } = setup({ id: 'send', scope: 'owner', riskLevel: 'high', run })
    const r = await registry.run('send', { q: 'x' }, { viewer: 'visitor', confirmed: true })
    expect(r).toMatchObject({ ok: false, error: 'denied', decision: 'denied' })
    expect(run).not.toHaveBeenCalled()
    expect(audit.entries()[0]).toMatchObject({ actor: 'visitor', decision: 'denied', ok: false })
  })

  it('returns needs_confirmation for a gated tool, then runs once confirmed', async () => {
    const run = vi.fn(async () => ({ ok: true, summary: 'posted' }))
    const { registry, audit } = setup({ id: 'post', scope: 'owner', riskLevel: 'medium', run })
    const first = await registry.run('post', { q: 'x' }, { viewer: 'owner' })
    expect(first).toMatchObject({ ok: false, error: 'needs_confirmation', decision: 'needs_confirmation' })
    expect(run).not.toHaveBeenCalled()
    const second = await registry.run('post', { q: 'x' }, { viewer: 'owner', confirmed: true })
    expect(second).toMatchObject({ ok: true, decision: 2 })
    expect(audit.entries().map(e => e.decision)).toEqual(['needs_confirmation', 'confirmed'])
  })

  it('needs confirmation for level 3 even when pre-approved', async () => {
    const audit = createAuditLog()
    const registry = createRegistry({ audit, policy: { ...DEFAULT_POLICY, preApproved: ['pay'] } })
    registry.register(makeTool({ id: 'pay', scope: 'owner', riskLevel: 'critical' }))
    expect((await registry.run('pay', { q: 'x' }, { viewer: 'owner' })).decision).toBe('needs_confirmation')
  })

  it('uses the registry actor for the owner side', async () => {
    const audit = createAuditLog()
    const registry = createRegistry({ audit, actor: 'jarvis' })
    registry.register(makeTool())
    await registry.run('search', { q: 'x' }, { viewer: 'owner' })
    await registry.run('search', { q: 'x' }, { viewer: 'visitor' })
    expect(audit.entries().map(e => e.actor)).toEqual(['jarvis', 'visitor'])
  })
})

describe('timeouts and retries', () => {
  it('times out a slow tool and aborts its signal', async () => {
    let aborted = false
    const { registry } = setup({
      timeoutMs: 20,
      run: (_i, ctx) => new Promise(resolve => {
        ctx.signal?.addEventListener('abort', () => (aborted = true))
        setTimeout(() => resolve({ ok: true, summary: 'late' }), 200)
      }),
    })
    const r = await registry.run('search', { q: 'x' }, { viewer: 'owner' })
    expect(r).toMatchObject({ ok: false, error: 'timeout' })
    expect(aborted).toBe(true)
  })

  it('retries safe and low tools with exponential backoff', async () => {
    let calls = 0
    const { registry, sleeps } = setup({
      retries: 3,
      run: async () => {
        calls++
        if (calls < 4) throw new Error('flaky')
        return { ok: true, summary: 'ok' }
      },
    })
    expect((await registry.run('search', { q: 'x' }, { viewer: 'owner' })).ok).toBe(true)
    expect(calls).toBe(4)
    expect(sleeps).toEqual([BACKOFF_BASE_MS, BACKOFF_BASE_MS * 2, BACKOFF_BASE_MS * 4])
  })

  it.each(['medium', 'high', 'critical'] as RiskLevel[])('never retries a %s tool', async risk => {
    let calls = 0
    const { registry, sleeps } = setup({ scope: 'owner', riskLevel: risk, retries: 3, run: async () => { calls++; throw new Error('boom') } })
    const r = await registry.run('search', { q: 'x' }, { viewer: 'owner', confirmed: true })
    expect(r).toMatchObject({ ok: false, error: 'tool_error' })
    expect(calls).toBe(1)
    expect(sleeps).toEqual([])
  })

  it('does not retry a tool that answered ok:false', async () => {
    let calls = 0
    const { registry } = setup({ retries: 3, run: async () => { calls++; return { ok: false, summary: 'not found', error: 'not_found' } } })
    expect(await registry.run('search', { q: 'x' }, { viewer: 'owner' })).toMatchObject({ ok: false, error: 'not_found' })
    expect(calls).toBe(1)
  })

  it('stops at once when the caller cancels', async () => {
    const ctl = new AbortController()
    const { registry } = setup({ retries: 3, run: () => new Promise(() => ctl.abort()) })
    expect(await registry.run('search', { q: 'x' }, { viewer: 'owner', signal: ctl.signal })).toMatchObject({ ok: false, error: 'cancelled' })
    expect(await registry.run('search', { q: 'x' }, { viewer: 'owner', signal: ctl.signal })).toMatchObject({ ok: false, error: 'cancelled' })
  })
})

describe('circuit breaker', () => {
  it('opens after three consecutive failures for 60 s, then lets one trial through', async () => {
    let calls = 0
    let healthy = false
    const { registry, clock, audit } = setup({
      run: async () => {
        calls++
        if (!healthy) throw new Error('down')
        return { ok: true, summary: 'up' }
      },
    })
    for (let i = 0; i < 3; i++) await registry.run('search', { q: 'x' }, { viewer: 'owner' })
    expect(calls).toBe(3)
    const blocked = await registry.run('search', { q: 'x' }, { viewer: 'owner' })
    expect(blocked).toMatchObject({ ok: false, error: 'circuit_open', decision: 'denied' })
    expect(calls).toBe(3)
    expect(audit.entries().at(-1)).toMatchObject({ decision: 'denied', ok: false })

    clock.t += BREAKER_OPEN_MS - 1
    expect((await registry.run('search', { q: 'x' }, { viewer: 'owner' })).error).toBe('circuit_open')

    clock.t += 1
    await registry.run('search', { q: 'x' }, { viewer: 'owner' }) // trial fails: re-opens at once
    expect(calls).toBe(4)
    expect((await registry.run('search', { q: 'x' }, { viewer: 'owner' })).error).toBe('circuit_open')

    clock.t += BREAKER_OPEN_MS
    healthy = true
    expect((await registry.run('search', { q: 'x' }, { viewer: 'owner' })).ok).toBe(true)
    healthy = false
    await registry.run('search', { q: 'x' }, { viewer: 'owner' })
    expect((await registry.run('search', { q: 'x' }, { viewer: 'owner' })).error).toBe('tool_error') // count restarted after the success
  })

  it('lets only one trial through while half-open', async () => {
    let release: (r: ToolResult) => void = () => undefined
    let calls = 0
    let mode: 'fail' | 'hang' | 'ok' = 'fail'
    const { registry, clock } = setup({
      run: () => {
        calls++
        if (mode === 'fail') return Promise.reject(new Error('down'))
        if (mode === 'ok') return Promise.resolve({ ok: true, summary: 'up' })
        return new Promise<ToolResult>(resolve => (release = resolve))
      },
    })
    for (let i = 0; i < 3; i++) await registry.run('search', { q: 'x' }, { viewer: 'owner' })
    clock.t += BREAKER_OPEN_MS
    mode = 'hang'
    const trial = registry.run('search', { q: 'x' }, { viewer: 'owner' })
    expect((await registry.run('search', { q: 'x' }, { viewer: 'owner' })).error).toBe('circuit_open')
    release({ ok: true, summary: 'recovered' })
    expect((await trial).ok).toBe(true)
    expect(calls).toBe(4)
    mode = 'ok'
    expect((await registry.run('search', { q: 'x' }, { viewer: 'owner' })).ok).toBe(true)
  })

  it('falls back to the default timeout for a nonsensical timeoutMs', async () => {
    const { registry } = setup({ timeoutMs: -5, run: async () => ({ ok: true, summary: 'ok' }) })
    expect((await registry.run('search', { q: 'x' }, { viewer: 'owner' })).ok).toBe(true)
  })

  it('keeps breakers per tool', async () => {
    const { registry } = setup({ run: async () => { throw new Error('down') } })
    registry.register(makeTool({ id: 'other' }))
    for (let i = 0; i < 3; i++) await registry.run('search', { q: 'x' }, { viewer: 'owner' })
    expect((await registry.run('search', { q: 'x' }, { viewer: 'owner' })).error).toBe('circuit_open')
    expect((await registry.run('other', { q: 'x' }, { viewer: 'owner' })).ok).toBe(true)
  })
})
