/* CTO AUDIT — runtime instrumentation of sentinel/index.html */
const { chromium } = require('playwright-core');
const path = require('path');
// Audits one page at a time. Default is the home page; pass a slug to switch:
//   node audit.js research
const SLUG = process.argv[2] || 'index';
const F = 'file://' + path.join(__dirname, SLUG + '.html');

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox',
           '--js-flags=--expose-gc','--enable-precise-memory-info']
  });

  // Instrument BEFORE any page script runs
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    window.__M = { cls:0, shifts:[], longTasks:[], lcp:0, raf:0, listeners:{},
                   drawArrays:0, chartCtor:0, glCtxLost:0 };
    new PerformanceObserver(l => l.getEntries().forEach(e => {
      if (!e.hadRecentInput) { window.__M.cls += e.value;
        if (e.value > 0.001) window.__M.shifts.push({ v:+e.value.toFixed(4),
          src:(e.sources||[]).map(s=>s.node&&s.node.nodeName+'.'+String(s.node.className||'').slice(0,28)).slice(0,2) }); }
    })).observe({ type:'layout-shift', buffered:true });
    new PerformanceObserver(l => l.getEntries().forEach(e =>
      window.__M.longTasks.push(Math.round(e.duration)))).observe({ type:'longtask', buffered:true });
    new PerformanceObserver(l => { const e=l.getEntries().pop(); if(e) window.__M.lcp=Math.round(e.startTime); })
      .observe({ type:'largest-contentful-paint', buffered:true });

    const rafo = window.requestAnimationFrame;
    window.requestAnimationFrame = function (cb) { window.__M.raf++; return rafo.call(window, cb); };

    const al = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (t, f, o) {
      const k = (this === window ? 'window' : this === document ? 'document'
                 : (this.id ? '#'+this.id : this.nodeName || 'obj')) + ':' + t;
      window.__M.listeners[k] = (window.__M.listeners[k]||0) + 1;
      return al.call(this, t, f, o);
    };

    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, o) {
      const ctx = gc.call(this, t, o);
      if (ctx && /webgl/.test(t) && !ctx.__wrapped) {
        ctx.__wrapped = 1;
        const da = ctx.drawArrays.bind(ctx);
        ctx.drawArrays = function () { window.__M.drawArrays++; return da.apply(null, arguments); };
      }
      return ctx;
    };
  });

  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  const cspViolations = [];
  page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) cspViolations.push(m.text()); });

  const t0 = Date.now();
  await page.goto(F, { waitUntil: 'load' });
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(3500);

  const boot = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] || {};
    return {
      ...window.__M,
      domContentLoaded: Math.round(n.domContentLoadedEventEnd || 0),
      loadEvent: Math.round(n.loadEventEnd || 0),
      firstPaint: Math.round((performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime||0),
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize/1048576).toFixed(1) : null,
      canvases: [...document.querySelectorAll('canvas')].map(c => ({
        id:c.id||c.className.slice(0,18), w:c.width, h:c.height,
        cssW:Math.round(c.getBoundingClientRect().width),
        ratio:+(c.width/Math.max(1,c.getBoundingClientRect().width)).toFixed(2),
        hasAttr: c.hasAttribute('width') })),
      nodes: document.querySelectorAll('*').length,
    };
  });

  /* The background canvas is position:fixed, so "scrolled past" is not a
     meaningful test — it is always in the viewport. The metric that matters is
     whether an IDLE page keeps burning GPU. Scroll to the bottom, wait out any
     idle timer, then sample a clean window with no interaction at all. */
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3000);                       // let it go idle
  await page.evaluate(() => { window.__M.drawArrays = 0; window.__M.raf = 0; });
  await page.waitForTimeout(2000);                       // clean idle sample
  /* There is no #gl element and no runtime WebGL context any more — the hero
     backdrop is baked at build time, so drawArrays staying at zero is expected.
     This reads as a regression guard rather than a metric. */
  const offscreen = await page.evaluate(() => {
    const core = document.getElementById('core');
    return { draws: window.__M.drawArrays, rafs: window.__M.raf,
             coreVisible: core ? core.getBoundingClientRect().bottom > 0 : false,
             glElement: !!document.getElementById('gl') };
  });

  // Listener growth under sustained scroll + resize (leak probe).
  // Warm every lazy section first, so one-time construction is not counted.
  /* Sections live on different pages now, so warm whichever this page has. */
  for (const id of ['core','failures','dashboard','research','pricing','evidence','contact']) {
    await page.evaluate(i => { const e = document.getElementById(i); if (e) e.scrollIntoView(); }, id);
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => JSON.stringify(window.__M.listeners));
  for (let i = 0; i < 6; i++) {
    await page.setViewportSize({ width: 1200 + i*40, height: 800 + i*20 });
    await page.evaluate(y => window.scrollTo(0, y), 2000 + i*900);
    await page.waitForTimeout(160);
  }
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => JSON.stringify(window.__M.listeners));
  const heap2 = await page.evaluate(() => { if (window.gc) window.gc();
    return performance.memory ? +(performance.memory.usedJSHeapSize/1048576).toFixed(1) : null; });

  // Forced-reflow probe: how many layout reads fire per scroll event?
  const reflow = await page.evaluate(() => {
    let reads = 0;
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { reads++; return orig.call(this); };
    const so = performance.now();
    for (let i = 0; i < 20; i++) window.dispatchEvent(new Event('scroll'));
    const dur = performance.now() - so;
    Element.prototype.getBoundingClientRect = orig;
    return { readsPer20Scrolls: reads, ms: +dur.toFixed(1) };
  });

  // reduced-motion behavior
  const rm = await b.newPage({ viewport:{width:1440,height:900}, reducedMotion:'reduce' });
  await rm.addInitScript(() => { window.__R = { raf:0 };
    const o = window.requestAnimationFrame;
    window.requestAnimationFrame = function(cb){ window.__R.raf++; return o.call(window,cb); }; });
  await rm.goto(F, { waitUntil:'load' }); await rm.waitForTimeout(2500);
  const rmRaf = await rm.evaluate(() => window.__R.raf);
  await rm.close();

  // mobile nav reachability
  const mob = await b.newPage({ viewport:{width:390,height:844}, isMobile:true });
  await mob.goto(F, { waitUntil:'load' }); await mob.waitForTimeout(1500);
  // Links behind a disclosure are reachable — open it first, as a user would.
  const navBtnVisible = await mob.evaluate(() => {
    const b = document.getElementById('navBtn');
    return !!b && b.offsetParent !== null;
  });
  if (navBtnVisible) { await mob.click('#navBtn'); await mob.waitForTimeout(250); }
  // Navigation is cross-document now, not in-page anchors.
  const navVis = await mob.evaluate(() =>
    [...document.querySelectorAll('#navMenu a')]
      .filter(a => a.offsetParent !== null).map(a => a.getAttribute('href')));
  const navExpanded = await mob.evaluate(() =>
    document.getElementById('navBtn') &&
    document.getElementById('navBtn').getAttribute('aria-expanded'));
  await mob.close();

  await b.close();

  const R = (k,v) => console.log(('  ' + k).padEnd(42) + v);
  console.log('\n══ ' + SLUG + '.html ══');
  console.log('\n══ BOOT ══');
  R('goto→load wall clock', loadMs + ' ms');
  R('FCP', boot.firstPaint + ' ms');
  R('LCP', boot.lcp + ' ms');
  R('DOMContentLoaded', boot.domContentLoaded + ' ms');
  R('DOM nodes', boot.nodes);
  R('JS heap after boot', boot.heapMB + ' MB');
  console.log('\n══ CLS ══');
  R('cumulative layout shift', boot.cls.toFixed(4) + (boot.cls > 0.1 ? '  ✗ FAIL (>0.1)' : boot.cls > 0.02 ? '  ~ marginal' : '  ✓'));
  boot.shifts.slice(0,6).forEach(s => R('  shift ' + s.v, JSON.stringify(s.src)));
  console.log('\n══ MAIN-THREAD BLOCKING ══');
  R('long tasks (>50ms)', boot.longTasks.length);
  R('total blocking time', boot.longTasks.reduce((a,x)=>a+Math.max(0,x-50),0) + ' ms');
  R('longest task', (Math.max(0,...boot.longTasks)) + ' ms');
  console.log('\n══ CANVAS SIZING ══');
  boot.canvases.forEach(c => R(c.id, `${c.w}×${c.h} backing / ${c.cssW}px css (dpr ${c.ratio}) width-attr:${c.hasAttr}`));
  console.log('\n══ IDLE GPU WORK (no interaction, clean 2s sample) ══');
  R('WebGL drawArrays calls', offscreen.draws + (offscreen.draws > 0 ? '  ✗ burning GPU while idle' : '  ✓ fully quiesced'));
  R('rAF callbacks', offscreen.rafs + (offscreen.rafs > 0 ? '  ✗ loop still scheduled' : '  ✓'));
  R('core section in viewport', offscreen.coreVisible);
  R('legacy #gl backdrop element', offscreen.glElement ? 'PRESENT ✗ (should be baked)' : 'gone ✓');
  console.log('\n══ LEAK PROBE (6 resizes + 6 scrolls) ══');
  R('listener map changed', (before !== after) ? 'YES — see below' : 'no growth ✓');
  if (before !== after) {
    const a = JSON.parse(before), c = JSON.parse(after);
    Object.keys(c).forEach(k => { if (c[k] !== (a[k]||0)) R('  ' + k, `${a[k]||0} → ${c[k]}`); });
  }
  R('heap after churn', heap2 + ' MB (was ' + boot.heapMB + ')');
  console.log('\n══ FORCED REFLOW ══');
  R('getBoundingClientRect / 20 scrolls', reflow.readsPer20Scrolls +
    (reflow.readsPer20Scrolls > 20 ? '  ✗ layout read per scroll event' : '  ✓'));
  console.log('\n══ REDUCED MOTION ══');
  R('rAF callbacks in 2.5s', rmRaf + (rmRaf > 100 ? '  ✗ still animating' : '  ✓ quiesced'));
  console.log('\n══ MOBILE NAV ══');
  R('disclosure button present', navBtnVisible ? 'yes ✓' : 'NO ✗');
  R('aria-expanded after click', navExpanded);
  R('nav links reachable at 390px', navVis.length + (navVis.length >= 6 ? ' ✓  ' : ' ✗  ') + JSON.stringify(navVis));
  console.log('\n══ CSP ══');
  R('violations / warnings', cspViolations.length ? cspViolations.slice(0,3).join(' | ') : 'none ✓');
  console.log('\n══ ERRORS ══');
  R('console/page errors', errs.length ? errs.slice(0,4).join(' | ') : 'none ✓');
})().catch(e => { console.error('HARNESS', e); process.exit(1); });
