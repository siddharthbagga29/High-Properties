// Reduced motion and no-WebGL checks: both must render a usable page with no console errors.
import { chromium } from 'playwright-core'
const out = process.argv[2] ?? 'shots'
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const res = {}
{
  const b = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const p = await ctx.newPage(); const errs = []
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()))
  await p.goto('http://localhost:4173/#V05.4.live', { waitUntil: 'networkidle' })
  await p.waitForTimeout(9000)
  await p.screenshot({ path: `${out}/reduced-motion-deeplink.png` })
  res.reduced = { errs, asm: await p.evaluate(() => window.__pe?.live.assemble), focus: await p.evaluate(() => window.__pe?.store.getState().focus) }
  await b.close()
}
{
  const b = await chromium.launch({ executablePath: exe, args: ['--disable-3d-apis'] })
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()))
  await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)
  await p.screenshot({ path: `${out}/no-webgl.png` })
  res.noWebgl = { errs, tables: await p.locator('.mirror-page table').count() }
  await b.close()
}
console.log(JSON.stringify(res, null, 1))
