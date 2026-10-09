import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, type AppDeps } from '../src/app'
import { defaultConfig, DEFAULT_PE_STATE, type AgentConfig } from '../src/config'
import type { Runner, RunResult } from '../src/exec'

export function tempDir(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `jarvis-${prefix}-`)))
}

export function cleanup(...dirs: string[]): void {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
}

/** A config that touches nothing real: temp roots, no model hosts, the real PE state for briefings. */
export function testConfig(root: string, overrides: Partial<AgentConfig> = {}): AgentConfig {
  const base = defaultConfig({})
  return {
    ...base,
    roots: [root],
    projectRoots: [root],
    peStatePath: DEFAULT_PE_STATE,
    port: 0,
    models: { ...base.models, ollamaHost: 'http://127.0.0.1:9', claudeCode: false },
    browser: { ...base.browser, downloadDir: join(root, 'downloads') },
    ...overrides,
  }
}

export interface RecordedCall { program: string; args: string[]; input?: string; cwd?: string }

/** A runner that records calls and answers with a fixed result: macOS tools are tested by their arguments. */
export function fakeRunner(result: Partial<RunResult> = {}): Runner & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const run = (async (program: string, args: string[], opts?: { input?: string; cwd?: string }) => {
    calls.push({ program, args, input: opts?.input, cwd: opts?.cwd })
    return { code: 0, stdout: '', stderr: '', timedOut: false, truncated: false, ...result }
  }) as Runner & { calls: RecordedCall[] }
  run.calls = calls
  return run
}

/** fetch that fails like a closed port, so model detection finds nothing. */
export const offlineFetch = (async () => {
  throw new TypeError('fetch failed')
}) as unknown as typeof fetch

export function testApp(home: string, root: string, extra: Partial<AppDeps> = {}) {
  return createApp({
    home,
    config: testConfig(root),
    env: {},
    fetch: offlineFetch,
    which: () => null,
    platform: 'linux',
    ...extra,
  })
}
