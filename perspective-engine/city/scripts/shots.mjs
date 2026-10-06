// Screenshots + FPS + console errors at desktop and phone sizes.
// Usage: npm run build && npx vite preview --port 4173 & node scripts/shots.mjs [outDir]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const out = process.argv[2] ?? 'shots'
const base = process.env.URL ?? 'http://localhost:4173/'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
})

const report = []
for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForTimeout(Number(process.env.HERO_WAIT ?? 14000))
  await page.screenshot({ path: `${out}/${name}-1-hero.png` })
  const fpsHero = await page.evaluate(() => window.__fps ?? null)
  for (const [i, label] of [[1, 'districts'], [2, 'agent'], [3, 'records']]) {
    await page.evaluate(k => scrollTo(0, innerHeight * 1.5 * k + innerHeight * 0.3), i)
    await page.waitForTimeout(3500)
    await page.screenshot({ path: `${out}/${name}-${i + 1}-story-${label}.png` })
  }
  // Free exploration through the UI, like a visitor.
  await page.evaluate(() => scrollTo(0, 0))
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: /skip to the city/i }).first().click()
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${out}/${name}-5-explore-city.png` })
  for (const [q, label] of [['Ogilvy', 'agent'], ['V05', 'task']]) {
    await page.keyboard.press('Control+k')
    await page.keyboard.type(q)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(3500)
    await page.screenshot({ path: `${out}/${name}-6-explore-${label}.png` })
  }
  const fpsExplore = await page.evaluate(() => window.__fps ?? null)
  report.push({ name, fpsHero, fpsExplore, errors: errors.slice(0, 8) })
  await page.close()
}
await browser.close()
console.log(JSON.stringify(report, null, 2))
