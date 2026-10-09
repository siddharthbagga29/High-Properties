/**
 * The core must stay framework-free: no Node built-ins, no DOM, no runtime dependencies, and it must compile the
 * way the city compiles it (DOM lib, no Node types). It must also export everything CONTRACT.md promises.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import * as core from '../core/index'

const CORE = fileURLToPath(new URL('../core', import.meta.url))
const sources = (readdirSync(CORE, { recursive: true }) as string[])
  .filter(f => f.endsWith('.ts'))
  .map(f => join(CORE, f))

const strip = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('core purity', () => {
  it('imports only other core files', () => {
    for (const file of sources) {
      const specifiers = [...readFileSync(file, 'utf8').matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map(m => m[1] ?? m[2])
      for (const spec of specifiers) expect(spec, relative(CORE, file)).toMatch(/^\.\.?\//)
      for (const spec of specifiers) expect(spec, `${relative(CORE, file)}: extensionless imports`).not.toMatch(/\.(ts|js)$/)
    }
  })

  it('uses no Node or DOM globals', () => {
    const forbidden = /\b(require\(|process\.|Buffer\b|__dirname|document\.|window\.|localStorage|sessionStorage|navigator\.|XMLHttpRequest)/
    for (const file of sources) expect(strip(readFileSync(file, 'utf8')), relative(CORE, file)).not.toMatch(forbidden)
  })

  it('declares no runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string> }
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([])
  })

  it('compiles with the DOM lib and without Node types, as the city builds it', () => {
    const program = ts.createProgram(sources, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      types: [],
      strict: true,
      noEmit: true,
      isolatedModules: true,
      skipLibCheck: true,
    })
    const diagnostics = ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
    expect(diagnostics).toEqual([])
  }, 60_000)
})

describe('contract surface', () => {
  const contract = readFileSync(new URL('../core/CONTRACT.md', import.meta.url), 'utf8')
  const promised = [...new Set(contract.split('\n').filter(l => l.startsWith('- ')).flatMap(l => [...l.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)(?=[(:])/g)].map(m => m[1])))]
    .filter(name => !(name in globalThis)) // e.g. `Error('invalid transition …')` describes a thrown value, not an export

  it('finds the promised names in CONTRACT.md', () => {
    expect(promised.length).toBeGreaterThan(40)
    expect(promised).toContain('createRegistry')
    expect(promised).toContain('peEvents')
  })

  it('exports every promised function and constant from core/index', () => {
    const exported = core as Record<string, unknown>
    const missing = promised.filter(name => exported[name] === undefined)
    expect(missing).toEqual([])
  })
})
