// Screenshots + FPS + console errors at desktop and phone sizes, driving the UI like a visitor.
// Usage: npm run build && npx vite preview --port 4173 & node scripts/shots.mjs [outDir]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const out = process.argv[2] ?? 'shots'
const base = process.env.URL ?? 'http://localhost:4173/'
const wait = Number(process.env.WAIT ?? 4000)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

const report = []
for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${out}/${name}-1-gate.png` })
  await page.getByRole('button', { name: /enter silently/i }).click()
  // wait for the brain to assemble (software rendering is slow; real GPUs take ~3.5 s)
  await page.waitForFunction(() => (window.__pe?.live.assemble ?? 0) >= 1, null, { timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(wait)
  await page.screenshot({ path: `${out}/${name}-2-world.png` })
  const fpsWorld = await page.evaluate(() => window.__fps ?? null)
  await page.locator('.wedge', { hasText: 'Ogilvy' }).first().click({ force: true })
  await page.waitForTimeout(wait)
  await page.screenshot({ path: `${out}/${name}-3-agent.png` })
  await page.getByRole('tab', { name: 'Activity' }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${out}/${name}-4-agent-activity.png` })
  await page.keyboard.press('Control+k')
  await page.keyboard.type('V05')
  await page.waitForTimeout(300)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(wait)
  await page.screenshot({ path: `${out}/${name}-5-task.png` })
  await page.locator('.hub').first().click({ force: true })
  await page.waitForTimeout(wait)
  await page.screenshot({ path: `${out}/${name}-6-brain.png` })
  const fpsEnd = await page.evaluate(() => window.__fps ?? null)
  report.push({ name, fpsWorld, fpsEnd, errors: errors.slice(0, 8) })
  await page.close()
}
await browser.close()
console.log(JSON.stringify(report, null, 2))
