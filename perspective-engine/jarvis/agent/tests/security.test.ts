/**
 * The agent's security boundaries, tested directly and through the tools:
 * path traversal and symlink escape, the command allowlist, shell metacharacters (with real processes),
 * the secret-free child environment, and the SSRF guard (addresses, schemes, DNS, redirects, connect-time checks).
 */
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRegistry } from '../../core/index'
import type { App } from '../src/app'
import { childEnv, runProcess } from '../src/exec'
import { PathRefused, resolveInside } from '../src/fsguard'
import { BlockedRequestError, checkUrl, checkUrlSyntax, isBlockedAddress, safeFetch, type Resolver } from '../src/net'
import { checkCommand, shellTool } from '../src/tools/shell'
import { cleanup, fakeRunner, tempDir, testApp } from './helpers'

let root: string
let outside: string
let home: string
let app: App

beforeAll(() => {
  root = tempDir('sec-root')
  outside = tempDir('sec-outside')
  home = tempDir('sec-home')
  mkdirSync(join(root, 'sub'))
  writeFileSync(join(root, 'sub', 'inside.txt'), 'inside\n')
  writeFileSync(join(root, '.env'), 'ANTHROPIC_API_KEY=not-a-real-key\n')
  writeFileSync(join(root, '.env.example'), 'ANTHROPIC_API_KEY=\n')
  writeFileSync(join(root, 'server.pem'), 'pem\n')
  mkdirSync(join(root, '.git'))
  writeFileSync(join(root, '.git', 'config'), '[core]\n')
  writeFileSync(join(outside, 'secret.txt'), 'outside secret MARKER-OUTSIDE\n')
  symlinkSync(outside, join(root, 'escape')) // directory link leading out of the root
  symlinkSync(join(outside, 'secret.txt'), join(root, 'link.txt')) // file link leading out
  symlinkSync(join(root, 'sub'), join(root, 'inner')) // link that stays inside
  symlinkSync(join(root, '.env'), join(root, 'innocent.txt')) // link to a secret inside the root
  symlinkSync(join(root, 'loop2'), join(root, 'loop1'))
  symlinkSync(join(root, 'loop1'), join(root, 'loop2'))
  app = testApp(home, root, { runner: fakeRunner() })
})

afterAll(async () => {
  await app.close()
  cleanup(root, outside, home)
})

function refusedFor(input: string, opts: { mustExist: boolean } = { mustExist: true }): string {
  try {
    resolveInside(input, [root], opts)
  } catch (e) {
    expect(e).toBeInstanceOf(PathRefused)
    return (e as Error).message
  }
  throw new Error(`${input} was not refused`)
}

describe('path guard: traversal and symlink escape', () => {
  it('refuses .. traversal and absolute paths outside the roots', () => {
    expect(refusedFor('../../../../etc/passwd')).toMatch(/outside the allowed folders/)
    expect(refusedFor('sub/../../x', { mustExist: false })).toMatch(/outside/)
    expect(refusedFor('/etc/passwd')).toMatch(/outside/)
    expect(refusedFor(outside)).toMatch(/outside/)
    expect(refusedFor('~/.ssh/id_rsa', { mustExist: false })).toMatch(/outside|refused/)
  })

  it('resolves symlinks before the check: a link that leads out is refused', () => {
    expect(refusedFor('escape/secret.txt')).toMatch(/outside/)
    expect(refusedFor('link.txt')).toMatch(/outside/)
    expect(refusedFor('escape')).toMatch(/outside/)
    // A file that does not exist yet, under a linked folder: the parent chain is resolved too.
    expect(refusedFor('escape/new-file.txt', { mustExist: false })).toMatch(/outside/)
    expect(refusedFor('escape/deeper/new.txt', { mustExist: false })).toMatch(/outside/)
  })

  it('allows a link that stays inside, and reports the real path', () => {
    const r = resolveInside('inner/inside.txt', [root])
    expect(r.real).toBe(join(root, 'sub', 'inside.txt'))
    expect(r.relative).toBe(join('sub', 'inside.txt'))
  })

  it('refuses secrets even inside a root, including through an innocent-looking link', () => {
    expect(refusedFor('.env')).toMatch(/secrets/)
    expect(refusedFor('innocent.txt')).toMatch(/secrets/)
    expect(refusedFor('server.pem')).toMatch(/secrets/)
    expect(refusedFor('.git/config')).toMatch(/git/)
    expect(refusedFor('.ssh/new', { mustExist: false })).toMatch(/credentials/)
    expect(resolveInside('.env.example', [root]).relative).toBe('.env.example')
  })

  it('refuses NUL bytes, empty paths, symlink loops and a missing root', () => {
    expect(refusedFor('sub/inside.txt\0.png')).toMatch(/NUL/)
    expect(refusedFor('  ')).toMatch(/required/)
    expect(refusedFor('loop1')).toMatch(/loop|cannot be resolved/)
    expect(() => resolveInside('x', [join(root, 'does-not-exist')])).toThrow(/no allowed roots/)
  })

  it('the file tools refuse the same escapes through the registry', async () => {
    const read = await app.runTool('fs.read', { path: 'escape/secret.txt' }, false)
    expect(read?.ok).toBe(false)
    expect(read?.error).toBe('path_refused')
    expect(JSON.stringify(read?.data ?? '')).not.toContain('MARKER-OUTSIDE')

    const viaLink = await app.runTool('fs.read', { path: 'link.txt' }, false)
    expect(viaLink?.error).toBe('path_refused')

    const write = await app.runTool('fs.write', { path: 'escape/planted.txt', content: 'x' }, false)
    expect(write?.ok).toBe(false)
    expect(existsSync(join(outside, 'planted.txt'))).toBe(false)

    const del = await app.runTool('fs.delete', { path: 'link.txt' }, true)
    expect(del?.ok).toBe(false)
    expect(readFileSync(join(outside, 'secret.txt'), 'utf8')).toContain('MARKER-OUTSIDE')
  })

  it('search never follows links out of the root, and listing hides secrets', async () => {
    const search = await app.runTool('fs.search', { query: 'MARKER-OUTSIDE' }, false)
    expect(search?.ok).toBe(true)
    expect((search?.data as { matches: unknown[] }).matches).toHaveLength(0)
    const list = await app.runTool('fs.list', { path: '.' }, false)
    const names = (list?.data as { entries: Array<{ path: string }> }).entries.map(e => e.path)
    expect(names).toContain('.env.example')
    expect(names).not.toContain('.env')
    expect(names).not.toContain('server.pem')
    expect(names).not.toContain('.git')
  })

  it('fs.write creates only new files and never replaces content', async () => {
    const first = await app.runTool('fs.write', { path: 'sub/new.md', content: 'one\n' }, false)
    expect(first?.ok).toBe(true)
    const again = await app.runTool('fs.write', { path: 'sub/new.md', content: 'two\n' }, false)
    expect(again?.ok).toBe(false)
    expect(again?.error).toBe('exists')
    const append = await app.runTool('fs.write', { path: 'sub/new.md', content: 'two\n', mode: 'append' }, false)
    expect(append?.ok).toBe(true)
    expect(readFileSync(join(root, 'sub', 'new.md'), 'utf8')).toBe('one\ntwo\n')
  })
})

describe('shell.run: the allowlist', () => {
  const allowed: Array<[string, string[]]> = [
    ['npm', ['test']],
    ['npm', ['run', 'build']],
    ['npm', ['run', 'typecheck']],
    ['git', ['status']],
    ['git', ['status', '--short', '--branch']],
    ['git', ['log', '--oneline', '-n5']],
    ['git', ['log', '--oneline', 'HEAD~3..HEAD', 'city/src']],
    ['git', ['diff', '--stat', 'HEAD~1']],
    ['git', ['diff', '--cached', '--', 'jarvis']],
    ['python3', ['tools/graph.py', 'status']],
    ['python3', ['tools/graph.py', 'ready']],
    ['python3', ['tools/graph.py', 'human']],
    ['python3', ['tools/graph.py', 'export']],
    ['ls', []],
    ['ls', ['-la', 'city']],
  ]
  for (const [program, args] of allowed) {
    it(`allows ${program} ${args.join(' ')}`.trim(), () => {
      const c = checkCommand(program, args)
      expect(c.ok, c.ok ? '' : c.reason).toBe(true)
    })
  }

  const refused: Array<[unknown, unknown]> = [
    ['rm', ['-rf', '/']],
    ['bash', ['-c', 'ls']],
    ['sh', ['-c', 'id']],
    ['zsh', []],
    ['node', ['-e', 'process.exit(0)']],
    ['curl', ['https://example.com']],
    ['osascript', ['-e', 'do shell script "id"']],
    ['/bin/ls', []],
    ['LS', []],
    ['npm', ['install', 'left-pad']],
    ['npm', ['run', 'deploy']],
    ['npm', ['test', '--', '--watch']],
    ['npm', ['test', '; rm -rf ~']],
    ['npm', ['exec', 'evil']],
    ['git', ['push']],
    ['git', ['commit', '-m', 'x']],
    ['git', ['-c', 'core.pager=sh', 'log']],
    ['git', ['log', '--output=/tmp/x']],
    ['git', ['log', '--exec=id']],
    ['git', ['diff', '--ext-diff']],
    ['git', ['diff', '--textconv']],
    ['git', ['log', '$(id)']],
    ['git', ['status', '../../etc']],
    ['python3', ['-c', 'print(1)']],
    ['python3', ['tools/graph.py', 'done', 'F01']],
    ['python3', ['tools/graph.py', 'revenue', 'add']],
    ['python3', ['tools/graph.py', 'status', '--json']],
    ['python3', ['other.py', 'status']],
    ['ls', ['a;b']],
    ['ls', ['`id`']],
    ['ls', ['$(touch pwned)']],
    ['ls', ['x|y']],
    ['ls', ['a && b']],
    ['ls', ['-la;id']],
    ['ls', ['line\nbreak']],
    ['ls', ['../..']],
    ['ls', 'la'],
    [42, []],
  ]
  for (const [program, args] of refused) {
    it(`refuses ${JSON.stringify(program)} ${JSON.stringify(args)}`, () => {
      expect(checkCommand(program, args).ok).toBe(false)
    })
  }

  it('git always runs without a pager, colour, external diff or textconv, and paths come after --', () => {
    const c = checkCommand('git', ['diff', '--stat', 'HEAD~1', 'city'])
    if (!c.ok) throw new Error(c.reason)
    expect(c.argv.slice(0, 3)).toEqual(['--no-pager', '-c', 'color.ui=false'])
    expect(c.argv).toContain('--no-ext-diff')
    expect(c.argv).toContain('--no-textconv')
    expect(c.argv.slice(-2)).toEqual(['--', 'city'])
  })

  it('a refused command never starts a process', async () => {
    const runner = fakeRunner()
    const tool = shellTool({ roots: () => [root], projectRoots: () => [root], peRepoDir: root, runner })
    const reg = createRegistry({ now: () => new Date() })
    reg.register(tool)
    for (const input of [
      { program: 'rm', args: ['-rf', root] },
      { program: 'npm', args: ['install'] },
      { program: 'ls', args: ['/etc'] }, // passes the pattern but is outside the roots
      { program: 'ls', args: ['escape'] }, // a link out of the root
      { program: 'python3', args: ['tools/graph.py', 'status'], cwd: 'sub' }, // graph.py cwd is fixed
      { program: 'npm', args: ['test'], cwd: '/tmp' },
    ]) {
      const r = await reg.run('shell.run', input, { viewer: 'owner' })
      expect(r.ok, JSON.stringify(input)).toBe(false)
    }
    expect(runner.calls).toHaveLength(0)
  })

  it('the agent-level shell tool is denied to visitors', async () => {
    const r = await app.registry.run('shell.run', { program: 'ls' }, { viewer: 'visitor' })
    expect(r.decision).toBe('denied')
  })
})

describe('processes: metacharacters are never interpreted', () => {
  it('passes every argument to the program verbatim (no shell, no globbing, no expansion)', async () => {
    const tricky = ['a; touch PWNED1', '$(touch PWNED2)', '`touch PWNED3`', '| cat', '&& touch PWNED4', '*', '~', '$HOME', "it's", '"quoted"', '> out.txt', '\\n']
    const r = await runProcess(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', ...tricky], { cwd: root })
    expect(r.code).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual(tricky)
    for (const f of ['PWNED1', 'PWNED2', 'PWNED3', 'PWNED4', 'out.txt']) expect(existsSync(join(root, f))).toBe(false)
  })

  it('shell.run with the real process runner treats odd file names as plain text', async () => {
    const dir = join(root, 'odd')
    mkdirSync(dir)
    writeFileSync(join(dir, '; touch pwned'), '')
    writeFileSync(join(dir, 'a b.txt'), '')
    const reg = createRegistry({ now: () => new Date() })
    reg.register(shellTool({ roots: () => [root], projectRoots: () => [root], peRepoDir: root, runner: runProcess }))
    const all = await reg.run('shell.run', { program: 'ls', args: ['-1'], cwd: dir }, { viewer: 'owner' })
    expect(all.ok, all.summary).toBe(true)
    const out = (all.data as { stdout: string }).stdout
    expect(out).toContain('; touch pwned')
    expect(out).toContain('a b.txt')
    // A path with a space is one argument, not two.
    const one = await reg.run('shell.run', { program: 'ls', args: ['-1', 'odd/a b.txt'], cwd: root }, { viewer: 'owner' })
    expect(one.ok, one.summary).toBe(true)
    expect((one.data as { stdout: string }).stdout.trim()).toBe('odd/a b.txt')
    expect(existsSync(join(dir, 'pwned'))).toBe(false)
    expect(existsSync(join(root, 'pwned'))).toBe(false)
  })

  it('child processes never inherit the token or API keys', async () => {
    const env = childEnv({ PATH: '/usr/bin', HOME: '/Users/me', JARVIS_TOKEN: 't', ANTHROPIC_API_KEY: 'k', GITHUB_TOKEN: 'g', MY_SERVICE_TOKEN: 's', DB_PASSWORD: 'p', STRIPE_SECRET: 'x', SSH_PRIVATE_KEY: 'y' })
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/Users/me' })
    const saved = process.env.JARVIS_TOKEN
    process.env.JARVIS_TOKEN = 'leak-check-token-value-123456'
    try {
      const r = await runProcess(process.execPath, ['-e', 'process.stdout.write(String(process.env.JARVIS_TOKEN))'])
      expect(r.stdout).toBe('undefined')
    } finally {
      if (saved === undefined) delete process.env.JARVIS_TOKEN
      else process.env.JARVIS_TOKEN = saved
    }
  })

  it('a runaway process is stopped at its timeout and output is capped', async () => {
    const slow = await runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { timeoutMs: 300 })
    expect(slow.timedOut).toBe(true)
    const loud = await runProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(100000))'], { maxOutput: 1000 })
    expect(loud.stdout.length).toBe(1000)
    expect(loud.truncated).toBe(true)
  })
})

describe('SSRF guard', () => {
  const blocked = [
    '127.0.0.1', '127.1.2.3', '0.0.0.0', '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '169.254.0.1', '100.64.0.1', '192.0.2.1', '198.18.0.1', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd00:ec2::254', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254',
    '::ffff:10.0.0.1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::', 'ff02::1', '2001:db8::1', 'fec0::1', '[::1]', 'not-an-ip', '',
  ]
  const publicAddrs = ['1.1.1.1', '8.8.8.8', '93.184.215.14', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']
  it('blocks loopback, private, link-local, metadata, reserved and mapped addresses', () => {
    for (const ip of blocked) expect(isBlockedAddress(ip), ip).toBe(true)
  })
  it('allows public addresses', () => {
    for (const ip of publicAddrs) expect(isBlockedAddress(ip), ip).toBe(false)
  })

  it('refuses non-http(s) schemes, credentials, local names and encoded loopback', () => {
    for (const url of [
      'file:///etc/passwd', 'ftp://example.com/x', 'javascript:alert(1)', 'data:text/html,hi', 'gopher://example.com', 'chrome://settings',
      'http://user:pass@example.com/', 'http://localhost:7777/api/status', 'http://LOCALHOST./', 'http://printer.local/', 'http://metadata.google.internal/',
      'http://intranet/', 'http://2130706433/', 'http://0x7f.1/', 'http://017700000001/', 'http://[::1]:7777/', 'http://[::ffff:169.254.169.254]/',
      'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/', 'not a url',
    ]) {
      expect(checkUrlSyntax(url).ok, url).toBe(false)
    }
    expect(checkUrlSyntax('https://example.com/page?q=1').ok).toBe(true)
  })

  it('refuses a public-looking name that resolves to a private address', async () => {
    const resolveTo = (addrs: string[]): Resolver => async () => addrs.map(address => ({ address, family: address.includes(':') ? 6 : 4 }))
    expect((await checkUrl('https://rebind.example/', { resolve: resolveTo(['10.0.0.7']) })).ok).toBe(false)
    expect((await checkUrl('https://mixed.example/', { resolve: resolveTo(['93.184.215.14', '127.0.0.1']) })).ok).toBe(false)
    expect((await checkUrl('https://meta.example/', { resolve: resolveTo(['169.254.169.254']) })).ok).toBe(false)
    expect((await checkUrl('https://v6.example/', { resolve: resolveTo(['::ffff:192.168.0.1']) })).ok).toBe(false)
    expect((await checkUrl('https://good.example/', { resolve: resolveTo(['93.184.215.14']) })).ok).toBe(true)
    expect((await checkUrl('https://nx.example/', { resolve: async () => Promise.reject(new Error('ENOTFOUND')) })).ok).toBe(false)
  })

  describe('safeFetch against a real local server', () => {
    let server: Server
    let port: number
    const hits: string[] = []
    beforeAll(async () => {
      server = createServer((req, res) => {
        hits.push(req.url ?? '')
        if (req.url === '/to-private') {
          res.writeHead(302, { location: `http://internal.test:${port}/secret` })
          return res.end()
        }
        if (req.url === '/to-metadata') {
          res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' })
          return res.end()
        }
        if (req.url === '/to-file') {
          res.writeHead(302, { location: 'file:///etc/passwd' })
          return res.end()
        }
        if (req.url === '/hop') {
          res.writeHead(301, { location: '/ok' })
          return res.end()
        }
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end(req.url === '/big' ? 'y'.repeat(10_000) : 'public content')
      })
      await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
      port = (server.address() as AddressInfo).port
    })
    afterAll(() => new Promise<void>(r => server.close(() => r())))

    // In this test the local server stands in for "the public internet": only 127.0.0.1 is treated as public,
    // and every name resolves through a fixed table.
    const table: Record<string, string> = { 'public.test': '127.0.0.1', 'internal.test': '10.1.2.3' }
    const guard = {
      resolve: (async host => (table[host] ? [{ address: table[host], family: 4 }] : Promise.reject(new Error(`ENOTFOUND ${host}`)))) as Resolver,
      isBlocked: (ip: string) => ip !== '127.0.0.1' && isBlockedAddress(ip),
    }

    it('never connects to a loopback address with the default guard', async () => {
      const before = hits.length
      await expect(safeFetch(`http://127.0.0.1:${port}/ok`)).rejects.toBeInstanceOf(BlockedRequestError)
      await expect(safeFetch(`http://localhost:${port}/ok`)).rejects.toThrow(/local or internal/)
      expect(hits.length).toBe(before)
    })

    it('follows a public redirect and re-checks every hop', async () => {
      const r = await safeFetch(`http://public.test:${port}/hop`, guard)
      expect(r.status).toBe(200)
      expect(r.body.toString()).toBe('public content')
      expect(r.redirects).toHaveLength(1)
    })

    it('refuses a redirect to a private name, the metadata address or a file URL, without following it', async () => {
      for (const path of ['/to-private', '/to-metadata', '/to-file']) {
        const before = hits.length
        await expect(safeFetch(`http://public.test:${port}${path}`, guard), path).rejects.toThrow(/refused redirect/)
        expect(hits.length).toBe(before + 1) // only the first hop reached the server
      }
      expect(hits).not.toContain('/secret')
    })

    it('re-checks the address at connect time (DNS rebinding between check and connect)', async () => {
      let calls = 0
      const rebinding: Resolver = async () => (calls++ === 0 ? [{ address: '93.184.215.14', family: 4 }] : [{ address: '127.0.0.1', family: 4 }])
      const before = hits.length
      await expect(safeFetch(`http://rebind.test:${port}/ok`, { resolve: rebinding })).rejects.toThrow(/refused|127\.0\.0\.1/)
      expect(calls).toBeGreaterThanOrEqual(2)
      expect(hits.length).toBe(before)
    })

    it('caps the body size', async () => {
      const r = await safeFetch(`http://public.test:${port}/big`, { ...guard, maxBytes: 100 })
      expect(r.body.length).toBe(100)
      expect(r.truncated).toBe(true)
    })
  })

  it('agent tools refuse private targets through the guard', async () => {
    for (const url of ['http://127.0.0.1:7777/api/status', 'http://169.254.169.254/latest/meta-data/', 'file:///etc/passwd', 'http://192.168.1.1/admin']) {
      const open = await app.runTool('browser.open', { url }, false)
      expect(open?.ok, url).toBe(false)
      expect(open?.error).toBe('ssrf_blocked')
      const dl = await app.runTool('browser.download', { url }, false)
      expect(dl?.ok, url).toBe(false)
      expect(dl?.error).toBe('ssrf_blocked')
    }
    const opened = await app.runTool('open.url', { url: 'file:///etc/passwd' }, false)
    expect(opened?.ok).toBe(false)
    expect(opened?.summary).toMatch(/only http and https/)
  })
})
