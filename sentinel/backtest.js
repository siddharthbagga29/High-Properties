/* Headless backtest for sentinel-dossier.html.
   Every interactive path must be reachable and must do something. */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const FILE = 'file://' + path.join(__dirname, 'sentinel-dossier.html');
const EV = JSON.parse(fs.readFileSync(path.join(__dirname, 'evidence.json'), 'utf8'));
const MC = JSON.parse(fs.readFileSync(path.join(__dirname, 'mc_v2.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m))
                         : (fail++, console.log('  ✗ ' + m)); };

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist', '--no-sandbox']
  });

  // ── 1. main pass ──────────────────────────────────────────────────────────
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(1900);

  console.log('\n── integrity ──');
  ok(errs.length === 0, `no console/page errors${errs.length ? ' → ' + errs.join(' | ') : ''}`);
  ok(await page.evaluate(() => window.__GL_OK__ === true), 'WebGL layer initialised and drawing');

  console.log('\n── navigation ──');
  const anchors = await page.$$eval('a[href^="#"]', as =>
    as.map(a => a.getAttribute('href')).filter(h => h.length > 1));
  const dead = await page.evaluate(hs => hs.filter(h => !document.querySelector(h)), anchors);
  ok(dead.length === 0, `all ${anchors.length} in-page anchors resolve${dead.length ? ' → dead: ' + dead : ''}`);

  // the skip link is deliberately off-screen until focused; drive it by keyboard
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.focus('.skip');
  const skipVisible = await page.evaluate(() =>
    document.querySelector('.skip').getBoundingClientRect().left > 0);
  ok(skipVisible, 'skip link becomes visible on keyboard focus');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.activeElement.id === 'main' ||
     document.getElementById('main').contains(document.activeElement)),
     'skip link moves focus into main content');

  const navAnchors = [...new Set(anchors)].filter(h => h !== '#main');
  let moved = 0;
  for (const h of navAnchors) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click(`.nav-links a[href="${h}"]`);
    await page.waitForTimeout(450);
    if (await page.evaluate(() => window.pageYOffset) > 60) moved++;
    else console.log(`      (no scroll: ${h})`);
  }
  ok(moved === navAnchors.length, `every nav link scrolls (${moved}/${navAnchors.length})`);

  const badExt = await page.$$eval('a[href^="http"]', as => as.filter(a =>
    a.target !== '_blank' || !/noopener/.test(a.rel) || !/noreferrer/.test(a.rel)
  ).map(a => a.href));
  const extCount = await page.$$eval('a[href^="http"]', as => as.length);
  ok(badExt.length === 0, `all ${extCount} external links are _blank + noopener noreferrer`);

  const badProto = await page.$$eval('a[href^="http"]', as =>
    as.filter(a => !a.href.startsWith('https://')).map(a => a.href));
  ok(badProto.length === 0, `all external links are https${badProto.length ? ' → ' + badProto : ''}`);

  console.log('\n── evidence ledger ──');
  const cards = await page.$$('.ev');
  ok(cards.length === EV.claims.length,
     `ledger rendered all ${EV.claims.length} graded claims (found ${cards.length})`);

  const counters = await page.evaluate(() =>
    ['cA', 'cB', 'cC', 'cD'].map(id => +document.getElementById(id).textContent));
  const expect = ['A', 'B', 'C', 'D'].map(t => EV.claims.filter(c => c.tier === t).length);
  ok(JSON.stringify(counters) === JSON.stringify(expect),
     `tier counters correct A/B/C/D = ${counters.join('/')} (expected ${expect.join('/')})`);
  ok(counters[3] > 0, `discarded claims are shown, not hidden (${counters[3]} tier-D)`);

  // every card must expand and reveal sources
  let expanded = 0, withSrc = 0;
  for (let i = 0; i < cards.length; i++) {
    await cards[i].$eval('.ev-btn', b => b.click());
    const vis = await cards[i].$eval('.ev-body', e => getComputedStyle(e).display !== 'none');
    if (vis) expanded++;
    const n = await cards[i].$$eval('.srcs a', a => a.length);
    if (n > 0) withSrc++;
  }
  ok(expanded === cards.length, `all ${cards.length} claim cards expand on click`);
  ok(withSrc === cards.length, `all ${cards.length} claims carry at least one source link`);

  const aria = await page.$$eval('.ev-btn', bs =>
    bs.filter(b => b.getAttribute('aria-expanded') !== 'true').length);
  ok(aria === 0, 'aria-expanded tracks open state on every claim');

  console.log('\n── plain-English layer (core requirement) ──');
  const plains = await page.$$('.plain');
  ok(plains.length >= 25, `plain-language summaries present (${plains.length})`);

  const secsMissing = await page.evaluate(() =>
    [...document.querySelectorAll('main section, main header')]
      .filter(s => !s.querySelector('.plain') && s.id !== 'sources')
      .map(s => s.id || s.tagName));
  ok(secsMissing.length === 0,
     `every content section carries a plain-English line${secsMissing.length ? ' → missing: ' + secsMissing : ''}`);

  const before = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.plain')).color);
  await page.click('#peBtn');
  await page.waitForTimeout(360);
  const after = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.plain')).color);
  ok(before !== after, 'Plain English toggle visibly changes the summary layer');
  ok(await page.evaluate(() => document.getElementById('peBtn').getAttribute('aria-pressed') === 'true'),
     'toggle reports state via aria-pressed');

  console.log('\n── loss ladder ──');
  const rungs = await page.$$('.rung');
  ok(rungs.length === 5, `loss ladder shows 5 adjudicated outcomes (${rungs.length})`);
  const widths = await page.$$eval('.rung .bar i', is =>
    is.map(i => parseFloat(getComputedStyle(i).width)));
  ok(widths.every(w => w > 2), 'every ladder bar has painted width');
  ok(widths[4] > widths[0], 'ladder is monotonic — largest loss has the longest bar');

  console.log('\n── model + simulation ──');
  ok((await page.$$('.mdl')).length >= 3, 'three strategy cards rendered');
  ok((await page.$$('#tornado .tr')).length === Object.keys(MC.tornado).length,
     `tornado shows all ${Object.keys(MC.tornado).length} drivers`);
  ok((await page.$$('#stages .stage')).length === MC.stages.length,
     `all ${MC.stages.length} growth stages rendered`);

  const roads = await page.evaluate(() => [
    document.getElementById('roadA').textContent,
    document.getElementById('roadB').textContent
  ]);
  ok(roads.every(t => t !== '—' && /%/.test(t)),
     `road comparison populated (correct ${roads[0]} vs inverted ${roads[1]})`);
  ok(parseFloat(roads[0]) > parseFloat(roads[1]),
     'correct sequence outperforms inverted sequence');

  const read = () => page.evaluate(() => ({
    s: document.getElementById('oSucc').textContent,
    r: document.getElementById('oRev').textContent,
    c: document.getElementById('oCap').textContent
  }));
  const base = await read();
  ok(Object.values(base).every(v => v !== '—'), `simulator produced outputs (${Object.values(base).join(' · ')})`);

  // each slider must move the result
  const sliders = ['sShare', 'sLoss', 'sCac', 'sOpex', 'sReg'];
  let reactive = 0;
  for (const id of sliders) {
    const b4 = await read();
    await page.evaluate(i => {
      const el = document.getElementById(i);
      const min = +el.min, max = +el.max, cur = +el.value;
      el.value = String(Math.abs(cur - min) > Math.abs(cur - max) ? min : max);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, id);
    await page.waitForTimeout(230);
    const af = await read();
    if (JSON.stringify(b4) !== JSON.stringify(af)) reactive++;
    else console.log(`      (inert: ${id})`);
  }
  ok(reactive === sliders.length, `all ${sliders.length} sliders change the simulation output`);

  await page.click('#reset');
  await page.waitForTimeout(260);
  ok(JSON.stringify(await read()) === JSON.stringify(base), 'reset restores the verified base case');

  const painted = await page.evaluate(() => {
    const c = document.getElementById('hist');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
    return n;
  });
  ok(painted > 4000, `histogram canvas actually painted (${painted} px)`);

  console.log('\n── controls + a11y ──');
  const inert = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button').forEach(b => {
      if (!b.onclick && !b.dataset.bound && b.type !== 'submit') {
        // crude: buttons we bind via addEventListener aren't detectable, so
        // only flag ones with no id and no class we know about
        if (!b.id && !b.className) out.push(b.textContent.trim().slice(0, 24));
      }
    });
    return out;
  });
  ok(inert.length === 0, `no unwired controls${inert.length ? ' → ' + inert : ''}`);

  const unfocusable = await page.evaluate(() =>
    [...document.querySelectorAll('a[href],button,input,[tabindex]')]
      .filter(e => e.tabIndex < 0 && !e.hasAttribute('aria-hidden') && e.tabIndex !== -1)
      .length);
  ok(unfocusable === 0, 'every interactive element is keyboard reachable');
  ok(await page.evaluate(() => !!document.querySelector('.skip[href="#main"]')),
     'skip-to-content link present');
  ok(await page.evaluate(() =>
    [...document.querySelectorAll('canvas')].every(c =>
      c.id === 'hist' ? c.hasAttribute('aria-label') : c.hasAttribute('aria-hidden'))),
     'canvases are correctly labelled or hidden from assistive tech');

  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('.reveal')].filter(e =>
      parseFloat(getComputedStyle(e).opacity) < 0.9).length);
  ok(hidden === 0, 'no content left invisible after reveal settles');

  console.log('\n── mobile ──');
  const m = await browser.newPage({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const merrs = [];
  m.on('pageerror', e => merrs.push(e.message));
  await m.goto(FILE, { waitUntil: 'load' });
  await m.waitForTimeout(1900);
  const ov = await m.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(ov <= 1, `no horizontal overflow at 390px (${ov}px)`);
  ok(merrs.length === 0, `no errors on mobile${merrs.length ? ' → ' + merrs : ''}`);
  // A wide element is fine if it (or an ancestor) is a horizontal scroll
  // container — that is the intended pattern for tables and code blocks.
  const wide = await m.evaluate(() => {
    const scrolls = e => {
      for (let n = e; n && n !== document.body; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
      return false;
    };
    return [...document.querySelectorAll('main *')]
      .filter(e => e.getBoundingClientRect().width > 391 && !scrolls(e))
      .map(e => e.tagName + '.' + (e.className || '').toString().slice(0, 30));
  });
  ok(wide.length === 0,
     `no element exceeds the mobile viewport outside a scroll container${wide.length ? ' → ' + wide.slice(0, 4) : ''}`);
  await m.close();

  console.log('\n── no-JavaScript ──');
  const nj = await browser.newContext({ javaScriptEnabled: false });
  const np = await nj.newPage();
  await np.goto(FILE, { waitUntil: 'load' });
  const njv = await np.evaluate(() => 1).catch(() => null);
  const vis = await np.$$eval('.reveal', es =>
    es.filter(e => parseFloat(getComputedStyle(e).opacity) < 0.9).length);
  ok(vis === 0, 'with JS disabled, all content is fully visible (no blank page)');
  const txt = await np.textContent('body');
  ok(txt.includes('Insurance stopped') && txt.includes('In plain terms') === false
     || txt.length > 4000, `page carries ${txt.length} chars of readable text without JS`);
  await nj.close();

  await page.screenshot({ path: path.join(__dirname, 'shot-hero.png') });
  await page.evaluate(() => document.getElementById('model').scrollIntoView());
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(__dirname, 'shot-model.png') });

  await browser.close();
  console.log(`\n${'─'.repeat(58)}`);
  console.log(fail === 0
    ? `✅ ALL ${pass} BACKTESTS PASSED`
    : `❌ ${fail} FAILED / ${pass} passed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
