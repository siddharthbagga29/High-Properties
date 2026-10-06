import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
for (const t of [3000, 6000, 10000, 16000]) {
  await p.waitForTimeout(t === 3000 ? 3000 : t - [3000,6000,10000,16000][[3000,6000,10000,16000].indexOf(t)-1])
  console.log(t, await p.evaluate(() => { const l = window.__pe?.live; const s = window.__pe?.store.getState(); return l ? { city: l.city.toFixed(2), asm: l.assemble.toFixed(2), time: l.time.toFixed(1), fps: (l.fps||0).toFixed(1), level: s.level, nudge: s.nudge, focus: s.focus } : 'no scene' }))
}
await p.screenshot({ path: process.argv[2] })
await b.close()
