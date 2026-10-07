// Release check: entrance, world, agent, task, brain, replay, a bad deep link and a phone pass.
// Saves screenshots and prints every page error, console error and failed request.
// Usage: node scripts/check.mjs <out-dir> [base-url]
import { chromium } from 'playwright-core'
const out = process.argv[2] ?? '.'
const base = process.argv[3] ?? 'http://localhost:4173/'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const report = {}

async function page(name, viewport) {
  const p = await b.newPage({ viewport })
  const errs = []
  p.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 300)))
  p.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text().slice(0, 300)))
  p.on('requestfailed', r => errs.push('requestfailed: ' + r.url()))
  report[name] = errs
  return p
}
const assembled = p => p.waitForFunction(() => (window.__pe?.live.assemble ?? 0) >= 1, null, { timeout: 120000 }).catch(() => {})
const shot = (p, n) => p.screenshot({ path: `${out}/${n}.png` })

// Desktop walk-through
const d = await page('desktop', { width: 1440, height: 900 })
await d.goto(base, { waitUntil: 'networkidle' })
await d.waitForTimeout(1500)
await shot(d, 'c1-gate')
await d.getByRole('button', { name: /enter silently/i }).click()
await assembled(d)
await d.waitForTimeout(6000)
await shot(d, 'c2-world')
await d.locator('.wedge').first().click({ force: true }).catch(() => {})
await d.locator('.wedge', { hasText: /Ada|Product/ }).first().click({ force: true }).catch(() => {})
await d.waitForTimeout(6000)
await shot(d, 'c3-agent')
await d.getByRole('tab', { name: /activity/i }).click().catch(() => {})
await d.waitForTimeout(2500)
await shot(d, 'c4-activity')
await d.evaluate(() => { location.hash = '#task-V09' })
await d.waitForTimeout(6000)
await shot(d, 'c5-task-V09')
await d.evaluate(() => { location.hash = '#brain' })
await d.waitForTimeout(6000)
await shot(d, 'c6-brain')
report.desktopText = await d.evaluate(() => ({
  title: document.title,
  topbar: document.querySelector('.topbar')?.textContent?.slice(0, 300),
  drawer: document.querySelector('.drawer')?.textContent?.slice(0, 600),
}))
await d.close()

// Replay: open it, scrub to the start, make sure nothing blanks
const r = await page('replay', { width: 1440, height: 900 })
await r.goto(base, { waitUntil: 'networkidle' })
await r.getByRole('button', { name: /enter silently/i }).click().catch(() => {})
await assembled(r)
await r.getByRole('button', { name: /replay/i }).first().click().catch(() => {})
await r.waitForTimeout(1500)
const slider = r.locator('input[type=range]').first()
if (await slider.count()) { await slider.focus(); await r.keyboard.press('Home'); await r.waitForTimeout(3000) }
report.replayRootChildren = await r.evaluate(() => document.getElementById('root')?.childElementCount ?? 0)
await shot(r, 'c7-replay')
await r.close()

// A hostile deep link must not blank the app
const x = await page('badlink', { width: 1280, height: 800 })
await x.goto(base + '#agent-constructor', { waitUntil: 'networkidle' })
await x.waitForTimeout(3000)
report.badlinkRootChildren = await x.evaluate(() => document.getElementById('root')?.childElementCount ?? 0)
await x.close()

// Phone
const m = await page('phone', { width: 390, height: 844, isMobile: true, hasTouch: true })
await m.goto(base, { waitUntil: 'networkidle' })
await m.getByRole('button', { name: /enter silently/i }).click().catch(() => {})
await assembled(m)
await m.waitForTimeout(5000)
await shot(m, 'c8-phone')
await m.close()

console.log(JSON.stringify(report, null, 1))
await b.close()
