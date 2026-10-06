// One desktop pass: world view and an agent view, for fast visual checks.
import { chromium } from 'playwright-core'
const out = process.argv[2]
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()))
await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: /enter silently/i }).click()
await p.waitForFunction(() => (window.__pe?.live.assemble ?? 0) >= 1, null, { timeout: 120000 }).catch(() => {})
await p.waitForTimeout(7000)
await p.screenshot({ path: `${out}/q-world.png` })
await p.locator('.wedge', { hasText: process.argv[3] ?? 'Ada' }).first().click({ force: true })
await p.waitForTimeout(7000)
await p.screenshot({ path: `${out}/q-agent.png` })
console.log(JSON.stringify({ errs }))
await b.close()
