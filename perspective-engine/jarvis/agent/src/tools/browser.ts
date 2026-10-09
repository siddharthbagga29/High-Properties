/**
 * Browser tools (Phase 4) on playwright-core, loaded only when used. One clean browser (no profile, no saved
 * logins), one tab. All browser traffic goes through the guard proxy (proxy.ts), which checks the address of every
 * connection, so redirects, sub-requests and DNS rebinding cannot reach private, loopback, link-local or metadata
 * addresses; request interception adds an early check with a clearer message. Page text comes back as an
 * accessibility snapshot labelled external and wrapped as data. Clicking and typing can submit things, so they are
 * medium risk (level 2: confirmation unless you pre-approve them). Downloads land in ~/Downloads/jarvis.
 */
import { closeSync, constants, mkdirSync, openSync, writeSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { label, wrapUntrusted, type JarvisTool, type ToolResult } from '../../../core/index'
import { checkUrl, safeFetch, type GuardOptions, type GuardResult } from '../net'
import { BLOCK_HEADER, startGuardProxy, type GuardProxy } from '../proxy'

// Minimal structural types for what we use from playwright-core, so the agent compiles without it installed.
interface PWLocator {
  first(): PWLocator
  click(o?: { timeout?: number }): Promise<void>
  fill(v: string, o?: { timeout?: number }): Promise<void>
  press(k: string, o?: { timeout?: number }): Promise<void>
  ariaSnapshot(o?: { timeout?: number }): Promise<string>
  count(): Promise<number>
}
interface PWRoute { request(): { url(): string }; continue(): Promise<void>; abort(code?: string): Promise<void> }
interface PWPage {
  goto(url: string, o?: { waitUntil?: string; timeout?: number }): Promise<{ status(): number; headers?(): Record<string, string> } | null>
  title(): Promise<string>
  url(): string
  locator(sel: string): PWLocator
  getByRole(role: string, o?: { name?: string; exact?: boolean }): PWLocator
  getByText(text: string, o?: { exact?: boolean }): PWLocator
  getByLabel(text: string, o?: { exact?: boolean }): PWLocator
  getByPlaceholder(text: string, o?: { exact?: boolean }): PWLocator
  waitForLoadState(state?: string, o?: { timeout?: number }): Promise<void>
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>
  innerText(sel: string): Promise<string>
}
interface PWContext { newPage(): Promise<PWPage>; route(pattern: string, handler: (route: PWRoute) => Promise<void>): Promise<void>; close(): Promise<void> }
interface PWBrowser { newContext(o?: Record<string, unknown>): Promise<PWContext>; close(): Promise<void> }
export interface LaunchOptions { headless?: boolean; channel?: string; proxy?: { server: string; bypass?: string }; args?: string[] }
export interface PlaywrightLike { chromium: { launch(o?: LaunchOptions): Promise<PWBrowser> } }

export interface BrowserDeps {
  load?: () => Promise<PlaywrightLike | null>
  guard?: GuardOptions
  headless?: () => boolean
  channel?: () => string | undefined
  downloadDir: () => string
  /** Starts the guard proxy the browser is launched behind (tests may inject one). */
  startProxy?: (guard: GuardOptions, onBlocked: (target: string) => void) => Promise<GuardProxy>
}

/** Chromium switches that keep traffic on the proxy: no WebRTC UDP around it, no DNS prefetching outside it. */
export const BROWSER_ARGS = ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--dns-prefetch-disable']

export const SNAPSHOT_MAX = 20_000
const ACTION_TIMEOUT = 10_000
const NAV_TIMEOUT = 30_000
const MAX_DOWNLOAD = 100 * 1024 * 1024

async function defaultLoad(): Promise<PlaywrightLike | null> {
  try {
    // A variable specifier keeps playwright-core optional: nothing resolves it until a browser tool is used.
    const specifier = 'playwright-core'
    const mod = (await import(specifier)) as PlaywrightLike & { default?: PlaywrightLike }
    return mod.chromium ? mod : (mod.default ?? null)
  } catch {
    return null
  }
}

const INSTALL_HINT = 'playwright-core is not installed. Run `npm install` in perspective-engine/jarvis, then `npx playwright-core install chromium` (see docs/JARVIS_SETUP.md).'

/** Turns a URL path into a safe file name inside the download folder. */
export function safeFileName(raw: string, fallback = 'download'): string {
  const base = basename(String(raw ?? '').split(/[?#]/)[0] || '')
  const clean = decodeURIComponentSafe(base)
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120)
  return clean || fallback
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function createBrowserTools(deps: BrowserDeps): { tools: JarvisTool[]; close(): Promise<void> } {
  const load = deps.load ?? defaultLoad
  const startProxy = deps.startProxy ?? startGuardProxy
  let session: Promise<{ browser: PWBrowser; context: PWContext; page: PWPage; proxy: GuardProxy }> | null = null
  const verdicts = new Map<string, { at: number; ok: boolean }>()
  /** Every request refused by either layer (request interception or the proxy), most recent last. */
  let blockedTotal = 0
  let lastBlocked: string | undefined
  const onBlocked = (target: string) => {
    blockedTotal++
    lastBlocked = target
  }

  async function guardUrl(url: string): Promise<GuardResult> {
    return checkUrl(url, deps.guard ?? {})
  }

  /** Cached per origin for a minute so a page with many sub-requests does not resolve DNS for each one. */
  async function allowSubrequest(url: string): Promise<boolean> {
    if (/^(data|blob|about):/i.test(url)) return true
    let origin: string
    try {
      origin = new URL(url).origin
    } catch {
      return false
    }
    const cached = verdicts.get(origin)
    if (cached && Date.now() - cached.at < 60_000) return cached.ok
    const ok = (await guardUrl(url)).ok
    verdicts.set(origin, { at: Date.now(), ok })
    return ok
  }

  async function open(): Promise<{ browser: PWBrowser; context: PWContext; page: PWPage; proxy: GuardProxy }> {
    if (!session) {
      session = (async () => {
        const pw = await load()
        if (!pw) throw new Error(INSTALL_HINT)
        const proxy = await startProxy(deps.guard ?? {}, onBlocked)
        try {
          // Playwright also sends loopback through the proxy (it adds <-loopback> to the bypass list itself).
          const launchOpts: LaunchOptions = { headless: deps.headless?.() ?? true, proxy: { server: proxy.url }, args: BROWSER_ARGS }
          const channel = deps.channel?.()
          if (channel) launchOpts.channel = channel
          const browser = await pw.chromium.launch(launchOpts)
          const context = await browser.newContext({ acceptDownloads: false, javaScriptEnabled: true, serviceWorkers: 'block', bypassCSP: false })
          await context.route('**/*', async route => {
            const url = route.request().url()
            if (await allowSubrequest(url)) await route.continue()
            else {
              onBlocked(url)
              await route.abort('blockedbyclient')
            }
          })
          const page = await context.newPage()
          return { browser, context, page, proxy }
        } catch (e) {
          await proxy.close()
          throw e
        }
      })()
      session.catch(() => (session = null))
    }
    return session
  }

  /** How many requests were refused since `mark` (a value of blockedTotal), and the latest one. */
  function blockedSince(mark: number): { count: number; last?: string } {
    const count = Math.max(0, blockedTotal - mark)
    return { count, last: count ? lastBlocked : undefined }
  }
  const blockNote = (b: { count: number }) => (b.count ? ` (${b.count} request${b.count === 1 ? '' : 's'} blocked by the network guard)` : '')

  async function snapshot(page: PWPage): Promise<{ title: string; url: string; text: string; truncated: boolean }> {
    let text: string
    try {
      text = await page.locator('body').ariaSnapshot({ timeout: ACTION_TIMEOUT })
    } catch {
      text = await page.innerText('body').catch(() => '')
    }
    const truncated = text.length > SNAPSHOT_MAX
    return { title: await page.title().catch(() => ''), url: page.url(), text: truncated ? `${text.slice(0, SNAPSHOT_MAX)}\n…` : text, truncated }
  }

  function pageResult(summary: string, snap: Awaited<ReturnType<typeof snapshot>>): ToolResult {
    return {
      ok: true,
      summary,
      data: {
        title: snap.title,
        url: snap.url,
        trust: 'external',
        truncated: snap.truncated,
        snapshot: wrapUntrusted(label(snap.text, 'external', snap.url)),
      },
    }
  }

  const failed = (e: unknown, what: string): ToolResult => {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === INSTALL_HINT) return { ok: false, summary: INSTALL_HINT, error: 'unavailable' }
    if (/ERR_BLOCKED_BY_CLIENT|blockedbyclient/i.test(msg)) return { ok: false, summary: `${what} was blocked by the network guard (a private or local address)`, error: 'ssrf_blocked' }
    return { ok: false, summary: `${what} failed: ${msg.split('\n')[0].slice(0, 300)}`, error: 'browser_error' }
  }

  function locate(page: PWPage, input: Record<string, unknown>): PWLocator | null {
    const exact = input.exact === true
    if (typeof input.role === 'string' && input.role) return page.getByRole(input.role, typeof input.name === 'string' ? { name: input.name, exact } : {}).first()
    if (typeof input.label === 'string' && input.label) return page.getByLabel(input.label, { exact }).first()
    if (typeof input.placeholder === 'string' && input.placeholder) return page.getByPlaceholder(input.placeholder, { exact }).first()
    if (typeof input.text === 'string' && input.text) return page.getByText(input.text, { exact }).first()
    if (typeof input.selector === 'string' && input.selector) return page.locator(input.selector).first()
    return null
  }

  const targetProps = {
    role: { type: 'string' as const, description: 'ARIA role from the snapshot, e.g. link, button, textbox' },
    name: { type: 'string' as const, description: 'Accessible name shown in the snapshot' },
    text: { type: 'string' as const, description: 'Visible text' },
    label: { type: 'string' as const, description: 'Form label' },
    placeholder: { type: 'string' as const },
    selector: { type: 'string' as const, description: 'CSS selector (last resort)' },
    exact: { type: 'boolean' as const },
  }

  const openTool: JarvisTool = {
    id: 'browser.open',
    name: 'Open a page',
    description: 'Load a public http(s) page in the agent browser and return its accessibility snapshot (external content).',
    schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    riskLevel: 'safe',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 45_000,
    async execute(input) {
      const verdict = await guardUrl(String(input.url))
      if (!verdict.ok) return { ok: false, summary: `Refused: ${verdict.reason}`, error: 'ssrf_blocked' }
      let s: Awaited<ReturnType<typeof open>> | null = null
      let mark = 0
      try {
        s = await open()
        mark = blockedTotal
        const res = await s.page.goto(verdict.url.toString(), { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })
        if (res?.headers?.()[BLOCK_HEADER]) {
          // The page itself, or a redirect from it, leads somewhere private: report that, never the content.
          const b = blockedSince(mark)
          await s.page.goto('about:blank').catch(() => undefined)
          return { ok: false, summary: `Refused: ${String(input.url)} leads to a blocked address${b.last ? ` (${b.last})` : ''}`, error: 'ssrf_blocked' }
        }
        const snap = await snapshot(s.page)
        return pageResult(`opened ${snap.url}${res ? ` (HTTP ${res.status()})` : ''}: ${snap.title || 'untitled'}${blockNote(blockedSince(mark))}`, snap)
      } catch (e) {
        // An HTTPS tunnel the proxy refused surfaces as a tunnel error; only then is the failure a block.
        const b = s ? blockedSince(mark) : { count: 0 }
        if (b.count && /ERR_TUNNEL_CONNECTION_FAILED|ERR_BLOCKED_BY_CLIENT|blockedbyclient/i.test(String((e as Error)?.message ?? e))) {
          return { ok: false, summary: `Refused: ${String(input.url)} leads to a blocked address (${b.last})`, error: 'ssrf_blocked' }
        }
        return failed(e, 'opening the page')
      }
    },
  }

  const readTool: JarvisTool = {
    id: 'browser.read',
    name: 'Read the page',
    description: 'Return the accessibility snapshot of the page that is open now (external content).',
    schema: { type: 'object', properties: {} },
    riskLevel: 'safe',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 20_000,
    async execute() {
      if (!session) return { ok: false, summary: 'no page is open; use browser.open first', error: 'no_page' }
      try {
        const s = await session
        return pageResult(`read ${s.page.url()}`, await snapshot(s.page))
      } catch (e) {
        return failed(e, 'reading the page')
      }
    },
  }

  const clickTool: JarvisTool = {
    id: 'browser.click',
    name: 'Click on the page',
    description: 'Click an element by role and name, label, text or selector. Clicking can submit forms, so it asks first.',
    schema: { type: 'object', properties: targetProps },
    riskLevel: 'medium',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 45_000,
    async execute(input) {
      if (!session) return { ok: false, summary: 'no page is open; use browser.open first', error: 'no_page' }
      try {
        const s = await session
        const target = locate(s.page, input)
        if (!target) return { ok: false, summary: 'say what to click: role and name, label, text or selector', error: 'invalid_input' }
        if ((await target.count()) === 0) return { ok: false, summary: 'nothing on the page matches that description', error: 'not_found' }
        const mark = blockedTotal
        await target.click({ timeout: ACTION_TIMEOUT })
        await s.page.waitForLoadState('domcontentloaded', { timeout: NAV_TIMEOUT }).catch(() => undefined)
        return pageResult(`clicked; now on ${s.page.url()}${blockNote(blockedSince(mark))}`, await snapshot(s.page))
      } catch (e) {
        return failed(e, 'clicking')
      }
    },
  }

  const typeTool: JarvisTool = {
    id: 'browser.type',
    name: 'Type into the page',
    description: 'Fill a field (by label, placeholder, role and name, or selector), optionally pressing Enter. Asks first.',
    schema: { type: 'object', properties: { ...targetProps, value: { type: 'string', description: 'Text to type' }, submit: { type: 'boolean', description: 'Press Enter afterwards' } }, required: ['value'] },
    riskLevel: 'medium',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 45_000,
    async execute(input) {
      if (!session) return { ok: false, summary: 'no page is open; use browser.open first', error: 'no_page' }
      try {
        const s = await session
        const target = locate(s.page, input)
        if (!target) return { ok: false, summary: 'say which field: label, placeholder, role and name, or selector', error: 'invalid_input' }
        if ((await target.count()) === 0) return { ok: false, summary: 'no field on the page matches that description', error: 'not_found' }
        const mark = blockedTotal
        await target.fill(String(input.value), { timeout: ACTION_TIMEOUT })
        if (input.submit === true) {
          await target.press('Enter', { timeout: ACTION_TIMEOUT })
          await s.page.waitForLoadState('domcontentloaded', { timeout: NAV_TIMEOUT }).catch(() => undefined)
        }
        return pageResult(`typed ${String(input.value).length} characters${input.submit === true ? ' and pressed Enter' : ''}${blockNote(blockedSince(mark))}`, await snapshot(s.page))
      } catch (e) {
        return failed(e, 'typing')
      }
    },
  }

  const extractTool: JarvisTool = {
    id: 'browser.extract',
    name: 'Extract from the page',
    description: 'Extract structured data from the open page: links, headings, tables or text (optionally inside a CSS selector).',
    schema: { type: 'object', properties: { kind: { type: 'string', enum: ['links', 'headings', 'tables', 'text'] }, selector: { type: 'string' } }, required: ['kind'] },
    riskLevel: 'safe',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 20_000,
    async execute(input) {
      if (!session) return { ok: false, summary: 'no page is open; use browser.open first', error: 'no_page' }
      try {
        const s = await session
        const kind = String(input.kind)
        const selector = typeof input.selector === 'string' && input.selector ? input.selector : 'body'
        const items = await s.page.evaluate(
          ({ kind: k, selector: sel }) => {
            const scopeEl = document.querySelector(sel)
            if (!scopeEl) return null
            const clean = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim()
            if (k === 'links') return Array.from(scopeEl.querySelectorAll('a[href]')).slice(0, 300).map(a => ({ text: clean(a.textContent), href: (a as HTMLAnchorElement).href }))
            if (k === 'headings') return Array.from(scopeEl.querySelectorAll('h1,h2,h3,h4,h5,h6')).slice(0, 300).map(h => ({ level: Number(h.tagName.slice(1)), text: clean(h.textContent) }))
            if (k === 'tables')
              return Array.from(scopeEl.querySelectorAll('table')).slice(0, 20).map(t => Array.from(t.querySelectorAll('tr')).slice(0, 200).map(r => Array.from(r.querySelectorAll('th,td')).map(c => clean(c.textContent))))
            return clean((scopeEl as HTMLElement).innerText ?? scopeEl.textContent).slice(0, 20000)
          },
          { kind, selector },
        )
        if (items === null) return { ok: false, summary: `nothing matches ${selector}`, error: 'not_found' }
        const count = Array.isArray(items) ? items.length : String(items).length
        return { ok: true, summary: `extracted ${count} ${kind === 'text' ? 'characters' : kind} from ${s.page.url()} (external content)`, data: { url: s.page.url(), kind, trust: 'external', items } }
      } catch (e) {
        return failed(e, 'extracting')
      }
    },
  }

  const downloadTool: JarvisTool = {
    id: 'browser.download',
    name: 'Download a file',
    description: 'Download a public http(s) file into ~/Downloads/jarvis (never overwrites; at most 100 MB). The file is not opened.',
    schema: { type: 'object', properties: { url: { type: 'string' }, filename: { type: 'string' } }, required: ['url'] },
    riskLevel: 'low',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 300_000,
    async execute(input, ctx) {
      const verdict = await guardUrl(String(input.url))
      if (!verdict.ok) return { ok: false, summary: `Refused: ${verdict.reason}`, error: 'ssrf_blocked' }
      let res
      try {
        res = await safeFetch(verdict.url.toString(), { ...deps.guard, maxBytes: MAX_DOWNLOAD + 1, timeoutMs: 280_000, signal: ctx.signal })
      } catch (e) {
        return { ok: false, summary: `download failed: ${(e as Error).message}`, error: (e as { code?: string }).code === 'ssrf_blocked' ? 'ssrf_blocked' : 'download_failed' }
      }
      if (res.status < 200 || res.status >= 300) return { ok: false, summary: `the server answered HTTP ${res.status}`, error: 'upstream_error' }
      if (res.body.length > MAX_DOWNLOAD) return { ok: false, summary: 'the file is larger than 100 MB; not saved', error: 'too_large' }
      const dir = deps.downloadDir()
      mkdirSync(dir, { recursive: true })
      const wanted = safeFileName(typeof input.filename === 'string' && input.filename ? input.filename : new URL(res.url).pathname)
      const stem = wanted.slice(0, wanted.length - extname(wanted).length) || 'download'
      const ext = extname(wanted)
      for (let i = 0; i < 1000; i++) {
        const file = join(dir, i ? `${stem} (${i})${ext}` : `${stem}${ext}`)
        let fd: number
        try {
          fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o644)
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue
          throw e
        }
        try {
          writeSync(fd, res.body)
        } finally {
          closeSync(fd)
        }
        return { ok: true, summary: `saved ${res.body.length} bytes to ${file}`, data: { file, bytes: res.body.length, url: res.url, contentType: res.headers['content-type'] ?? null, trust: 'external' } }
      }
      return { ok: false, summary: 'could not find a free file name', error: 'exists' }
    },
  }

  const closeTool: JarvisTool = {
    id: 'browser.close',
    name: 'Close the browser',
    description: 'Close the agent browser.',
    schema: { type: 'object', properties: {} },
    riskLevel: 'safe',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 15_000,
    async execute() {
      const was = session !== null
      await close()
      return { ok: true, summary: was ? 'browser closed' : 'the browser was not open' }
    },
  }

  async function close(): Promise<void> {
    const s = session
    session = null
    verdicts.clear()
    if (!s) return
    try {
      const { browser, proxy } = await s
      await browser.close().catch(() => undefined)
      await proxy.close()
    } catch {
      // a session that never started has nothing to close
    }
  }

  return { tools: [openTool, readTool, clickTool, typeTool, extractTool, downloadTool, closeTool], close }
}
