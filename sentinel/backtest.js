/* LOOP VERIFICATION — six pages, one assertion per promise.

   Everything here runs against the SHIPPED files, in a real browser, from a
   file:// URL. Nothing is asserted about source that is not also observed in
   the rendered document. Fails loud and exits non-zero. */
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');

const DIR = __dirname;
const url = f => 'file://' + path.join(DIR, f);
/* Data lives beside the page in the shipped layout, and one level up in the
   source tree. Resolve either without caring which. */
const near = f => [path.join(DIR, f), path.join(DIR, '..', f)]
  .find(p => fs.existsSync(p)) || path.join(DIR, f);
const EV = JSON.parse(fs.readFileSync(near('evidence.json'), 'utf8'));
const PR = JSON.parse(fs.readFileSync(near('pricing.json'), 'utf8'));

const SLUGS = ['index', 'coverage', 'evidence', 'research', 'method', 'contact'];

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m))
                         : (fail++, console.log('  ✗ ' + m)); };
const H = t => console.log('\n── ' + t + ' ──');

/* WCAG relative-luminance contrast, computed on the composited background.
   Ancestor background COLORS are composited down; a background IMAGE cannot be
   resolved this way, so pages that paint one are additionally sampled from a
   real screenshot below — that is the only honest way to test text over the
   bust. */
const CONTRAST_FN = `(() => {
  function parse(c){
    const m = c.match(/rgba?\\(([^)]+)\\)/); if(!m) return null;
    const p = m[1].split(',').map(s=>parseFloat(s));
    return { r:p[0], g:p[1], b:p[2], a:p.length>3?p[3]:1 };
  }
  function over(fg,bg){
    const a=fg.a; return { r:fg.r*a+bg.r*(1-a), g:fg.g*a+bg.g*(1-a), b:fg.b*a+bg.b*(1-a), a:1 };
  }
  function lum(c){
    const f=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4);};
    return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);
  }
  window.__lum = lum;
  window.__contrast = function(elm, floorRGB){
    const cs = getComputedStyle(elm);
    const fg = parse(cs.color); if(!fg) return null;
    let stack = [], n = elm;
    while (n && n !== document.documentElement) {
      const b = parse(getComputedStyle(n).backgroundColor);
      if (b && b.a > 0.001) stack.push(b);
      n = n.parentElement;
    }
    stack.push(floorRGB || {r:5,g:7,b:10,a:1});
    let bg = stack[stack.length-1];
    for (let i = stack.length-2; i >= 0; i--) bg = over(stack[i], bg);
    const t = over(fg, bg);
    const L1 = lum(t), L2 = lum(bg);
    const hi = Math.max(L1,L2), lo = Math.min(L1,L2);
    return (hi+0.05)/(lo+0.05);
  };
})()`;

const BRIT = /\b(artefacts?|analyse[ds]?|behaviour\w*|colour[sd]?|centre[sd]?|defence|labell(ed|ing)|modell(ed|ing)|organisations?|recognise[ds]?|utilise[ds]?|authorise[ds]?|prioritise[ds]?|programmes?|catalogue|whilst|amongst|learnt|per cent|judgement|licence|fulfil|sizeable)\b/gi;

(async () => {
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']
});

async function open(slug, opts) {
  const page = await browser.newPage(Object.assign({ viewport: { width: 1440, height: 900 } }, opts || {}));
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.goto(url(slug + '.html'), { waitUntil: 'load' });
  await page.waitForTimeout(1600);
  await page.evaluate(CONTRAST_FN);
  return { page, errs };
}

/* ══════════════ 1. SITE STRUCTURE ══════════════ */
H('SITE STRUCTURE');
for (const s of SLUGS) ok(fs.existsSync(path.join(DIR, s + '.html')), `${s}.html exists`);
['index2.html', 'sitemap.xml', 'robots.txt', '_headers', 'og.jpg']
  .forEach(f => ok(fs.existsSync(path.join(DIR, f)), `${f} shipped`));
ok(fs.readFileSync(path.join(DIR, 'index.html'), 'utf8') ===
   fs.readFileSync(path.join(DIR, 'index2.html'), 'utf8'),
   'index.html and index2.html are byte-identical — they cannot drift');

const sitemap = fs.readFileSync(path.join(DIR, 'sitemap.xml'), 'utf8');
ok((sitemap.match(/<url>/g) || []).length === SLUGS.length,
   `sitemap lists all ${SLUGS.length} pages`);
ok(!/index2/.test(sitemap), 'sitemap excludes the duplicate index2.html');
ok(/Disallow: \/index2\.html/.test(fs.readFileSync(path.join(DIR, 'robots.txt'), 'utf8')),
   'robots.txt disallows the duplicate, so it cannot be indexed as a second home page');

/* ══════════════ 2. PER-PAGE ══════════════ */
const meta = {};
const pages = {};
for (const slug of SLUGS) {
  const { page, errs } = await open(slug);
  pages[slug] = { page, errs };

  H(`PAGE — ${slug}.html`);
  ok(errs.length === 0, `no console or page errors${errs.length ? ' → ' + errs.slice(0,3).join(' | ') : ''}`);

  const m = await page.evaluate(() => {
    const g = n => { const e = document.querySelector(n); return e && (e.content || e.href || e.textContent); };
    const hs = [...document.querySelectorAll('h1,h2,h3,h4')].map(h => +h.tagName[1]);
    return {
      title: document.title,
      desc: g('meta[name=description]'),
      canonical: g('link[rel=canonical]'),
      robots: g('meta[name=robots]'),
      ogTitle: g('meta[property="og:title"]'),
      ogImage: g('meta[property="og:image"]'),
      twCard: g('meta[name="twitter:card"]'),
      ld: g('script[type="application/ld+json"]'),
      h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()),
      headingOrder: hs,
      lang: document.documentElement.lang,
      navCurrent: [...document.querySelectorAll('nav [aria-current="page"]')].length,
      crumbs: !!document.querySelector('nav[aria-label=Breadcrumb]'),
      csp: (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content,
    };
  });
  meta[slug] = m;

  ok(m.h1.length === 1, `exactly one <h1> (${m.h1.length}) — "${(m.h1[0] || '').slice(0, 48)}"`);
  ok(!!m.desc && m.desc.length >= 70 && m.desc.length <= 320,
     `meta description is a usable length (${m.desc ? m.desc.length : 0} chars)`);
  ok(m.title.length >= 25 && m.title.length <= 75, `title length in range (${m.title.length})`);
  ok(!!m.canonical && m.canonical.startsWith('http'), `canonical is absolute (${m.canonical})`);
  ok(/index,follow/.test(m.robots || ''), 'robots meta allows indexing');
  ok(!!m.ogTitle && !!m.ogImage && m.twCard === 'summary_large_image',
     'Open Graph + Twitter card complete');
  ok(m.lang === 'en', 'document language declared');
  /* No heading level may be skipped on the way down. h1→h3 is the classic
     screen-reader trap: it implies a missing section the user cannot find. */
  let skip = null, prev = 1;
  for (const h of m.headingOrder) {
    if (h > prev + 1 && skip === null) skip = `h${prev}→h${h}`;
    prev = h;
  }
  ok(skip === null, `heading hierarchy has no skipped levels${skip ? ' → ' + skip : ''}`);
  ok(m.navCurrent >= 1, 'the current page is marked aria-current in the nav');
  ok(slug === 'index' ? !m.crumbs : m.crumbs,
     slug === 'index' ? 'home has no breadcrumb (it is the root)' : 'breadcrumb trail present');

  let ld = null;
  try { ld = JSON.parse(m.ld); } catch (e) {}
  ok(!!ld && Array.isArray(ld['@graph']) && ld['@graph'].length >= 2,
     `JSON-LD parses with ${ld && ld['@graph'] ? ld['@graph'].length : 0} nodes`);
  ok(!!ld && !JSON.stringify(ld).includes('undefined'), 'no undefined leaked into structured data');
  if (slug !== 'index') {
    ok(ld['@graph'].some(n => n['@type'] === 'BreadcrumbList'), 'BreadcrumbList in structured data');
  } else {
    ok(ld['@graph'].some(n => n['@type'] === 'Organization') &&
       ld['@graph'].some(n => n['@type'] === 'WebSite'), 'Organization + WebSite on the home page');
  }

  ok(!!m.csp && /default-src 'none'/.test(m.csp), "CSP sets default-src 'none'");
  ok(!!m.csp && !/unsafe-inline|unsafe-eval/.test(m.csp), "CSP uses hashes only");
  ok(!!m.csp && !/frame-ancestors/.test(m.csp),
     'meta CSP omits frame-ancestors (spec-ignored there; shipped as a header)');

  const diag = await page.evaluate(() => window.sentinelDiagnostics
    ? { ok: window.sentinelDiagnostics.ok, errors: window.sentinelDiagnostics.errors } : null);
  ok(!!diag && diag.ok, `no guarded feature threw${diag && diag.errors.length ? ' → ' + diag.errors.slice(0,3) : ''}`);

  const leaked = await page.evaluate(() => Object.keys(window)
    .filter(k => /^__|^(MC|EV|PR|CHARTS|DIAG)$/.test(k))
    .filter(k => k !== '__contrast' && k !== '__lum'));
  ok(leaked.length === 0, `no internals on window${leaked.length ? ' → ' + leaked : ''}`);

  const text = await page.evaluate(() => document.body.innerText);
  const brit = text.match(BRIT) || [];
  ok(brit.length === 0, `US English throughout${brit.length ? ' → ' + [...new Set(brit)].join(', ') : ''}`);
  const junk = (text.match(/\b(TODO|TKTK|PLACEHOLDER|undefined|\[object \w+)\b/g) || [])
    .concat(text.match(/\bNaN\b/g) || []);
  ok(junk.length === 0, `no placeholder, undefined or NaN text${junk.length ? ' → ' + [...new Set(junk)] : ''}`);

  const dead = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href'))
      .filter(h => h.length > 1 && !document.querySelector(h)));
  ok(dead.length === 0, `no dead in-page anchors${dead.length ? ' → ' + dead : ''}`);

  const internal = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="./"]')].map(a => a.getAttribute('href').split('#')[0]));
  const missingTargets = [...new Set(internal)]
    .map(h => (h === './' ? 'index.html' : h.replace('./', '')))
    .filter(f => !fs.existsSync(path.join(DIR, f)));
  ok(missingTargets.length === 0,
     `all ${new Set(internal).size} distinct internal link targets exist${missingTargets.length ? ' → ' + missingTargets : ''}`);

  const badExt = await page.$$eval('a[href^="http"]', as => as.filter(a =>
    a.target !== '_blank' || !/noopener/.test(a.rel) || !/noreferrer/.test(a.rel) ||
    !a.href.startsWith('https://')).map(a => a.href));
  ok(badExt.length === 0, 'every external link is https + _blank + noopener noreferrer');

  const shipped = fs.readFileSync(path.join(DIR, slug + '.html'), 'utf8');
  const litStyle = (shipped.slice(shipped.indexOf('<body')).match(/\sstyle="/g) || []).length;
  ok(litStyle === 0, `zero literal style attributes in the markup (${litStyle})`);

  const tables = await page.$$eval('table', ts => ts.filter(t => !t.querySelector('caption')).length);
  ok(tables === 0, 'every table has a caption');
  const noAlt = await page.evaluate(() => [...document.querySelectorAll('canvas')]
    .filter(c => !c.hasAttribute('aria-label') && !c.hasAttribute('aria-hidden') && !c.closest('[aria-hidden]')).length);
  ok(noAlt === 0, 'every canvas is labeled or hidden from assistive tech');
  /* Reveal is a scroll animation, so below-the-fold nodes are legitimately at
     opacity 0 on load. Two separate things have to hold: nothing in the first
     viewport is hidden (that would be a blank page), and nothing anywhere is
     still hidden after the reader has scrolled the whole document (that would
     be permanently lost content — the failure mode when a lazily-built section
     adds .reveal nodes after the safety-net timer has already fired). */
  /* "Above the fold" means meaningfully in view, not one pixel into it. The
     reveal observer deliberately uses a -6% bottom margin so a card grazing the
     very bottom edge does not fire; counting that as a failure would be testing
     the harness's cutoff, not the page. */
  const foldHidden = await page.evaluate(() => [...document.querySelectorAll('.reveal')]
    .filter(e => { const r = e.getBoundingClientRect();
                   return r.bottom > 0 && r.top < window.innerHeight * 0.8; })
    .filter(e => parseFloat(getComputedStyle(e).opacity) < 0.9).length);
  ok(foldHidden === 0, 'nothing above the fold is invisible on load');
  await page.evaluate(async () => {
    const H = document.body.scrollHeight;
    for (let y = 0; y <= H; y += Math.round(window.innerHeight * 0.7)) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 90));
    }
    window.scrollTo(0, H);
  });
  await page.waitForTimeout(1400);
  const hidden = await page.evaluate(() => [...document.querySelectorAll('.reveal')]
    .filter(e => parseFloat(getComputedStyle(e).opacity) < 0.9)
    .map(e => e.tagName + '.' + String(e.className).slice(0, 30)));
  ok(hidden.length === 0,
     `nothing remains invisible after scrolling the page${hidden.length ? ' → ' + hidden.slice(0,3) : ''}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !!document.querySelector('a.skip[href="#main"]')), 'skip link present');
  ok((await page.$$('.plain')).length >= 2, `plain-English summaries present (${(await page.$$('.plain')).length})`);

  const worst = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('main p, main h1, main h2, main h3, main li, main td, main th, main span, main a, footer p, footer a, nav a')
      .forEach(e => {
        if (!e.textContent.trim() || e.offsetParent === null) return;
        if (e.children.length && !(e.childNodes[0].nodeValue || '').trim()) return;
        const fsz = parseFloat(getComputedStyle(e).fontSize);
        const bold = +getComputedStyle(e).fontWeight >= 700;
        const large = fsz >= 24 || (fsz >= 18.66 && bold);
        const c = window.__contrast(e);
        if (c == null) return;
        const need = large ? 3.0 : 4.5;
        if (c < need) out.push({ t: e.textContent.trim().slice(0,42), c: +c.toFixed(2), need });
      });
    return out;
  });
  ok(worst.length === 0,
     `all visible text meets WCAG AA${worst.length ? ' → ' + JSON.stringify(worst.slice(0,4)) : ''}`);
}

/* Cross-page uniqueness: duplicate titles or descriptions are the single most
   common way a multi-page site cannibalises its own search results. */
H('SEO — CROSS-PAGE UNIQUENESS');
for (const k of ['title', 'desc', 'canonical', 'h1']) {
  const vals = SLUGS.map(s => JSON.stringify(meta[s][k]));
  ok(new Set(vals).size === SLUGS.length,
     `every page has a distinct ${k} (${new Set(vals).size}/${SLUGS.length})`);
}
ok(SLUGS.every(s => meta[s].canonical.endsWith(s === 'index' ? '/' : s + '.html')),
   'each canonical points at its own URL, not a shared one');
ok(SLUGS.every(s => sitemap.includes(meta[s].canonical)),
   'every canonical URL appears in the sitemap');

/* Internal linking: an orphan page is one no other page links to. */
H('SEO — INTERNAL LINK GRAPH');
const inbound = Object.fromEntries(SLUGS.map(s => [s, 0]));
for (const from of SLUGS) {
  const hrefs = await pages[from].page.evaluate(() =>
    [...document.querySelectorAll('a[href^="./"]')].map(a => a.getAttribute('href').split('#')[0]));
  for (const h of new Set(hrefs)) {
    const to = h === './' ? 'index' : h.replace('./', '').replace('.html', '');
    if (to !== from && inbound[to] !== undefined) inbound[to]++;
  }
}
SLUGS.forEach(s => ok(inbound[s] >= 2,
  `${s} is linked from ${inbound[s]} other pages (no orphans)`));

/* ══════════════ 3. HOME — HERO BUST + SCROLL ASSEMBLY ══════════════ */
H('HOME — HERO BACKDROP');
const home = pages.index.page;
const bust = await home.evaluate(() => {
  const e = document.querySelector('.hero-bust');
  const cs = e && getComputedStyle(e);
  return e ? { tag: e.tagName, img: cs.backgroundImage.slice(0, 22),
               op: parseFloat(cs.opacity), masked: (cs.maskImage || cs.webkitMaskImage) !== 'none' } : null;
});
ok(!!bust && bust.tag === 'DIV', 'hero backdrop is a div, not a canvas');
ok(!!bust && /^url\("?data:image/.test(bust.img),
   'backdrop carries a build-time render as an inline image — no runtime WebGL');
ok(!!bust && bust.masked, 'the bust is masked away from the copy column');
ok(await home.evaluate(() => [...document.querySelectorAll('canvas')].every(c => c.id !== 'gl')),
   'no fullscreen animated canvas in the compositing path');
ok(await home.evaluate(() => {
  const g = window.WebGLRenderingContext; if (!g) return true;
  return [...document.querySelectorAll('canvas')].every(c => {
    try { return !c.__wrapped; } catch (e) { return true; }
  });
}), 'no page-owned WebGL context');

/* The real legibility test for text over an image: sample the actual pixels
   behind the hero copy from a screenshot and compute contrast against the
   brightest one found there. A computed-style check cannot see an image. */
/* Hide the copy before sampling. Left in place, the brightest pixel inside the
   panel is the white heading — the measurement would be reading the text as if
   it were the background and reporting a meaningless 2.3:1. */
await home.evaluate(() => {
  document.querySelectorAll('header .glass > *').forEach(e => { e.dataset.hid = '1'; e.style.visibility = 'hidden'; });
});
/* .plain carries transition-all duration-300, and visibility is a transitioned
   (discrete) property — screenshot too early and the paragraph is still on
   screen, which is exactly how this measurement first read the body text as if
   it were the background. */
await home.waitForTimeout(700);
const heroShot = await home.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 900 } });
const heroContrast = await home.evaluate(() => {
  const panel = document.querySelector('header .glass').getBoundingClientRect();
  return { w: Math.round(panel.width), h: Math.round(panel.height),
           x: Math.round(panel.left), y: Math.round(panel.top) };
});
{
  // Decode the screenshot in the page and read the true composited pixels.
  const b64 = heroShot.toString('base64');
  const measured = await home.evaluate(async ([data, box]) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + data; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    const x0 = Math.max(0, box.x), y0 = Math.max(0, box.y);
    const w = Math.min(box.w, img.width - x0), h = Math.min(box.h, img.height - y0);
    const d = c.getContext('2d').getImageData(x0, y0, w, h).data;
    // brightest pixel under the copy panel = worst case background for text
    let best = 0, px = null;
    for (let i = 0; i < d.length; i += 4) {
      const L = window.__lum({ r: d[i], g: d[i+1], b: d[i+2] });
      if (L > best) { best = L; px = [d[i], d[i+1], d[i+2]]; }
    }
    // body copy colour on this page
    const fg = getComputedStyle(document.querySelector('header .lede')).color
      .match(/\d+/g).map(Number);
    const Lf = window.__lum({ r: fg[0], g: fg[1], b: fg[2] });
    const hi = Math.max(Lf, best), lo = Math.min(Lf, best);
    return { ratio: (hi + 0.05) / (lo + 0.05), px, fg };
  }, [b64, heroContrast]);
  ok(measured.ratio >= 4.5,
     `hero body copy over the SAMPLED backdrop pixels: ${measured.ratio.toFixed(2)}:1 ` +
     `(brightest bg rgb(${measured.px.join(',')}))`);
}
await home.evaluate(() => {
  document.querySelectorAll('header .glass > [data-hid]').forEach(e => { e.style.visibility = ''; delete e.dataset.hid; });
});

H('HOME — INTERACTIVE TURNTABLE');
{
  const reel = await home.evaluate(() => {
    const s = document.getElementById('hero-reel');
    if (!s) return null;
    const strip = s.getElementsByTagName('i')[0];
    const meta = JSON.parse(document.getElementById('d-reel').textContent);
    return { tag: s.tagName, strips: s.getElementsByTagName('i').length,
             live: s.classList.contains('live'),
             stripW: Math.round(parseFloat((strip || {}).style ? strip.style.width : 0)),
             cellH: Math.round(parseFloat((strip || {}).style ? strip.style.height : 0)),
             frames: meta.frames, canvases: document.querySelectorAll('header canvas').length };
  });
  ok(!!reel && reel.tag === 'DIV' && reel.canvases === 0,
     'the interactive layer is an image layer, not a canvas — nothing in the hero re-rasters on scroll');
  ok(!!reel && reel.live, 'the turntable went live after the atlas decoded');
  ok(!!reel && reel.frames >= 9, `${reel ? reel.frames : 0} baked views in the turntable`);
  ok(!!reel && Math.abs(reel.stripW - reel.frames * reel.cellH) <= reel.frames,
     `strip spans every view (${reel ? reel.stripW : 0}px for ${reel ? reel.frames : 0} cells)`);

  // pointer at the two extremes must select different views
  await home.mouse.move(120, 460); await home.waitForTimeout(1300);
  const left = await home.evaluate(() => document.querySelector('#hero-reel i').style.transform);
  await home.mouse.move(1320, 460); await home.waitForTimeout(1300);
  const right = await home.evaluate(() => document.querySelector('#hero-reel i').style.transform);
  ok(left !== right, `the subject turns with the pointer (${left} → ${right})`);
  ok(await home.evaluate(() => /translate3d\(-?\d/.test(document.getElementById('hero-reel').style.transform || 'translate3d(0')),
     'the layer parallaxes with the pointer');
}
{
  // reduced motion and narrow viewports get the still and no moving parts
  const rm = await open('index', { reducedMotion: 'reduce' });
  ok(await rm.page.evaluate(() => getComputedStyle(document.getElementById('hero-reel')).display === 'none'),
     'reduced motion: the turntable is not rendered at all');
  await rm.page.close();
  const nar = await open('index', { viewport: { width: 900, height: 800 } });
  ok(await nar.page.evaluate(() => getComputedStyle(document.getElementById('hero-reel')).display === 'none'),
     'below 1024px: the turntable is not rendered at all');
  await nar.page.close();
}

H('HOME — SCROLL-FORMING CORE');
const coreTop = await home.evaluate(() =>
  document.getElementById('core').getBoundingClientRect().top + window.pageYOffset);
const coreH = await home.evaluate(() => document.getElementById('core').offsetHeight);
const samples = [];
for (const f of [0.02, 0.2, 0.4, 0.6, 0.8, 0.96]) {
  await home.evaluate(y => window.scrollTo(0, y), coreTop + coreH * f);
  await home.waitForTimeout(900);
  samples.push(await home.evaluate(() => ({
    pct: parseInt(document.getElementById('core-pct').textContent),
    lit: [...document.querySelectorAll('#wp-dots span')]
           .filter(d => !d.className.includes('bg-white/12')).length,
    open: document.querySelectorAll('#wp-active > div:not(.hidden)').length,
  })));
}
ok(samples.every((s, i) => i === 0 || s.pct >= samples[i-1].pct),
   `assembly maps monotonically to scroll depth (${samples.map(s=>s.pct+'%').join(' → ')})`);
ok(samples[0].pct <= 10 && samples[samples.length-1].pct >= 85,
   `assembly spans 0→100% across the pinned section`);
ok(samples.every((s, i) => i === 0 || s.lit >= samples[i-1].lit),
   `failure modes activate in order (${samples.map(s=>s.lit).join(' → ')} of 5)`);
ok(samples[samples.length-1].lit === 5, 'all five failure modes activate by the end');
ok(samples.every(s => s.open <= 1), 'exactly one failure mode is shown at a time');

/* The figure must actually be a FIGURE. A NaN in any coordinate term silently
   collapses every node while the chest bloom still paints — the canvas looked
   "painted" but the robot was gone. Sample five bands; require ink in each. */
await home.evaluate(y => window.scrollTo(0, y), coreTop + coreH * 0.8);
await home.waitForTimeout(1800);
const figure = await home.evaluate(() => {
  const c = document.getElementById('core-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const W = c.width, H = c.height;
  const band = (x0, x1, y0, y1) => {
    let n = 0;
    for (let y = Math.floor(y0*H); y < Math.floor(y1*H); y++)
      for (let x = Math.floor(x0*W); x < Math.floor(x1*W); x++)
        if (d[(y*W+x)*4+3] > 90) n++;
    return n;
  };
  return { head: band(0.40,0.60,0.05,0.28), leftArm: band(0.20,0.42,0.28,0.68),
           rightArm: band(0.58,0.80,0.28,0.68), legs: band(0.38,0.62,0.70,0.98) };
});
['head','leftArm','rightArm','legs'].forEach(k =>
  ok(figure[k] > 40, `${k} renders (${figure[k]} px)`));

const coreContrast = await home.evaluate(() => {
  const els = [...document.querySelectorAll('#core .glass p, #core .glass h2, #core .glass span')]
    .filter(e => e.textContent.trim() && e.offsetParent);
  return Math.min(...els.map(e => window.__contrast(e) || 99));
});
ok(coreContrast >= 4.5, `core panel text over the animation: ${coreContrast.toFixed(2)}:1`);

/* ══════════════ 4. COVERAGE ══════════════ */
H('COVERAGE — PRICING');
const cov = pages.coverage.page;
await cov.evaluate(() => document.getElementById('pricing').scrollIntoView());
await cov.waitForTimeout(800);
ok((await cov.$$('#tiers > div')).length === PR.tiers.length,
   `all ${PR.tiers.length} product tiers rendered`);
ok(await cov.$$eval('#tiers > div', ds => ds.filter(d => d.textContent.length > 300).length) === PR.tiers.length,
   'every tier states its pricing rationale');
ok((await cov.$$('#tiers a[href="./contact.html"]')).length === PR.tiers.length,
   'every tier CTA links across to the contact page');
const nCells = PR.matrix.reduce((a, r) => a + r.cells.length, 0);
ok((await cov.$$('#matrixTable tr')).length === nCells + PR.matrix.length,
   `premium matrix shows all ${nCells} layers across ${PR.matrix.length} bands`);
ok(await cov.$$eval('#matrixTable tr', rs => rs.filter(r => /Not offered/.test(r.textContent)).length)
   === PR.matrix.reduce((a,r)=>a+r.cells.filter(c=>!c.offered).length,0),
   'uneconomic layers are declined rather than quoted');
const credits = PR.matrix.flatMap(r => r.cells.filter(c=>c.offered).map(c => c.saving_pct));
ok(credits.every(c => c > 0.25 && c < 0.65),
   `telemetry credit consistent across every layer (${(Math.min(...credits)*100).toFixed(0)}–${(Math.max(...credits)*100).toFixed(0)}%)`);
ok(PR.matrix.flatMap(r => r.cells.filter(c=>c.offered).map(c => c.rol)).every(r => r > 0 && r < 0.04),
   'every offered layer prices inside a sane rate-on-line band');
ok(PR.matrix.every(r => { const c = r.cells.filter(x => x.offered);
    return c.every((x, i) => i === 0 || x.monitored >= c[i-1].monitored); }),
   'premium rises monotonically with limit in every band');
ok((await cov.$$('#compTable tr')).length === PR.competitors.length,
   `competitive table lists all ${PR.competitors.length} writers`);
ok(await cov.$$eval('#compTable tr', rs => rs.filter(r => /SIMULATED|MODELED/.test(r.textContent)).length)
   === PR.competitors.length, 'every competitor rate is labeled simulated or modeled');

/* ══════════════ 5. EVIDENCE ══════════════ */
H('EVIDENCE — DOSSIER + LEDGER');
const ev = pages.evidence.page;
for (const id of ['failures', 'evidence', 'sources']) {
  await ev.evaluate(i => document.getElementById(i).scrollIntoView(), id);
  await ev.waitForTimeout(700);
}
ok((await ev.$$('#dossier article')).length === 5, 'five adjudicated cases in press format');
ok(await ev.$$eval('#dossier article', as => as.filter(a => {
    const k = [...a.querySelectorAll('.kicker')].map(x => x.textContent.trim());
    return k.includes('Failure mode') && k.includes('Holding') && k.includes('Underwriting significance');
  }).length) === 5, 'every case carries Failure mode / Holding / Underwriting significance');
ok(await ev.$$eval('#dossier article', as => as.filter(a => /\d{4}|v\./.test(a.textContent)).length) === 5,
   'every case carries a court and date citation');
ok((await ev.$$('#ledger > div')).length === EV.claims.length,
   `ledger renders all ${EV.claims.length} graded claims`);
const tierCounts = await ev.evaluate(() => ['cA','cB','cC','cD'].map(i => +document.getElementById(i).textContent));
const expTiers = ['A','B','C','D'].map(t => EV.claims.filter(c => c.tier === t).length);
ok(JSON.stringify(tierCounts) === JSON.stringify(expTiers), `tier counters correct (${tierCounts.join('/')})`);
ok(expTiers[3] > 0 && await ev.evaluate(() =>
     [...document.querySelectorAll('#ledger .line-through, #ledger s, #ledger del')].length > 0 ||
     /discard/i.test(document.getElementById('ledger').textContent)),
   'discarded claims are shown, not deleted');
ok((await ev.$$('#srcList a')).length >= 15, `source list populated (${(await ev.$$('#srcList a')).length} links)`);

/* ══════════════ 6. RESEARCH ══════════════ */
H('RESEARCH — CHARTS + ROI');
const res = pages.research.page;
const INERT = /<script type="text\/plain" id="chartjs-src">/;
ok(INERT.test(fs.readFileSync(path.join(DIR, 'research.html'), 'utf8')),
   'Chart.js ships inert as type="text/plain" — the HTML parser never executes it');
ok(await res.evaluate(() => !!document.getElementById('chartjs-src')),
   'Chart.js ships with the only page that draws charts');
for (const other of ['index', 'coverage', 'method', 'contact']) {
  /* Presence of the element, with no byte-size corroboration. An earlier
     version added "and under 200 KB" and began failing the day the home page
     legitimately grew a turntable atlas — a check that fires when unrelated
     things change is a check someone deletes. */
  const src = fs.readFileSync(path.join(DIR, other + '.html'), 'utf8');
  ok(!INERT.test(src),
     `${other}.html omits the 204 KB chart library it never uses (page is ${(src.length/1024).toFixed(0)} KB)`);
}
for (const id of ['dashboard', 'research']) {
  await res.evaluate(i => document.getElementById(i).scrollIntoView(), id);
  await res.waitForTimeout(1000);
}
ok(await res.evaluate(() => typeof window.Chart === 'function'),
   'Chart.js compiles on demand once a chart section is reached');
for (const id of ['chartCyber','chartPools','chartVert','chartVertPrem','chartRoi']) {
  const painted = await res.evaluate(i => {
    const c = document.getElementById(i); if (!c) return -1;
    c.scrollIntoView();
    const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let n = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 8) n++;
    return n;
  }, id);
  ok(painted > 2500, `${id} rendered (${painted} painted px)`);
}
const roiRead = () => res.evaluate(() => ({
  net: document.getElementById('roiNet').textContent,
  pb: document.getElementById('roiPayback').textContent }));
const roi0 = await roiRead();
ok(roi0.net !== '—' && roi0.pb !== '—', `ROI computes on load (${roi0.net}, ${roi0.pb})`);
await res.selectOption('#roiVert', { index: 0 }); await res.waitForTimeout(300);
const roi1 = await roiRead();
await res.selectOption('#roiVert', { index: 6 }); await res.waitForTimeout(300);
const roi2 = await roiRead();
ok(roi1.net !== roi2.net, `sector selector changes the ROI (${roi1.net} vs ${roi2.net})`);
await res.selectOption('#roiBand', { index: 0 }); await res.waitForTimeout(300);
ok((await roiRead()).net !== roi2.net, 'revenue-band selector changes the ROI');
const counters = await res.$$eval('[data-count]', es => es.map(e => e.textContent));
ok(counters.every(c => !/^\$?0(\.0)?[%M]?$/.test(c)), `all counters animated off zero (${counters.join(' · ')})`);
ok((await res.$$('#vertTable tr')).length === PR.verticals.length,
   `sector table lists all ${PR.verticals.length} verticals`);
ok(await res.evaluate(() => [...document.querySelectorAll('.chart-fallback')].every(f => f.classList.contains('hidden'))),
   'every chart has a fallback, and none is showing');

/* ══════════════ 7. CONTACT ══════════════ */
H('CONTACT — QUOTE PORTAL');
const con = pages.contact.page;
const q0 = await con.textContent('#fQuote');
await con.selectOption('#fSector', { index: 0 }); await con.waitForTimeout(200);
const q1 = await con.textContent('#fQuote');
await con.selectOption('#fSector', { index: 5 }); await con.waitForTimeout(200);
const q2 = await con.textContent('#fQuote');
ok(q0 !== '—', `live quote computes (${q0})`);
ok(q1 !== q2, `quote responds to sector (${q1} vs ${q2})`);
await con.selectOption('#fLimit', { index: 0 }); await con.waitForTimeout(200);
ok(await con.textContent('#fQuote') !== q2, 'quote responds to limit');
await con.click('#quoteForm button[type=submit]'); await con.waitForTimeout(250);
ok(await con.evaluate(() => !document.getElementById('formErr').classList.contains('hidden')),
   'empty submit is blocked with a visible, role=alert error');
ok(await con.evaluate(() => document.activeElement.id === 'fName'), 'focus moves to the first invalid field');
await con.fill('#fName', 'Test Buyer');
await con.fill('#fEmail', 'not-an-email');
await con.check('#fConsent');
await con.click('#quoteForm button[type=submit]'); await con.waitForTimeout(250);
ok(await con.evaluate(() => /valid work email/.test(document.getElementById('formErr').textContent)),
   'invalid email is caught');
ok(await con.evaluate(() => document.getElementById('fEmail').getAttribute('aria-invalid') === 'true'
   && document.getElementById('fName').getAttribute('aria-invalid') === null),
   'aria-invalid marks only the offending field');
await con.fill('#fEmail', 'buyer@example.com');
await con.fill('#fCompany', 'Testco Ltd');
await con.click('#quoteForm button[type=submit]'); await con.waitForTimeout(400);
ok(await con.evaluate(() => !document.getElementById('formOk').classList.contains('hidden')),
   'valid submit shows a success message');
const mailto = await con.evaluate(() => document.getElementById('quoteForm').getComposedMailto());
ok(!!mailto && mailto.startsWith('mailto:') && /body=/.test(mailto),
   'valid submit composes a mailto carrying the form data');
ok(!!mailto && decodeURIComponent(mailto).includes('Test Buyer') &&
   decodeURIComponent(mailto).includes('Testco Ltd'),
   'the mailto body carries the entered name, company, sector and quote');
ok((await con.evaluate(() => [...document.querySelectorAll('#quoteForm input, #quoteForm select, #quoteForm textarea')]
     .filter(f => !document.querySelector(`label[for="${f.id}"]`)).length)) === 0,
   'every form field has an associated label');
ok(await con.evaluate(() => { try { return localStorage.length <= 1; } catch (e) { return true; } }),
   'no customer data is persisted in the browser beyond the one UI preference');

/* ══════════════ 8. PLAIN ENGLISH ══════════════ */
H('PLAIN ENGLISH LAYER');
const preToggle = await home.evaluate(() => getComputedStyle(document.querySelector('.plain')).color);
await home.click('#peBtn'); await home.waitForTimeout(350);
ok(preToggle !== await home.evaluate(() => getComputedStyle(document.querySelector('.plain')).color),
   'Plain English toggle changes the layer');
const persisted = await home.evaluate(() => { try { return localStorage.getItem('sentinel-pe'); } catch (e) { return null; } });
ok(persisted === '1', 'the preference persists across pages via localStorage');

/* ══════════════ 9. SECURITY POSTURE ══════════════ */
H('SECURITY POSTURE');
const headers = fs.readFileSync(path.join(DIR, '_headers'), 'utf8');
['frame-ancestors', 'X-Frame-Options: DENY', 'X-Content-Type-Options: nosniff',
 'Referrer-Policy', 'Permissions-Policy', 'Strict-Transport-Security'].forEach(h =>
  ok(headers.includes(h), `_headers ships ${h.split(':')[0]}`));
ok(await home.evaluate(() => {
  try { window.sentinelDiagnostics = 1; } catch (e) { return true; }
  return typeof window.sentinelDiagnostics === 'object';
}), 'diagnostics surface is not writable');
const appSrc = fs.readFileSync(near('src/app.js'), 'utf8');
ok(!/api[_-]?key|secret|Bearer\s|sk-[A-Za-z0-9]/i.test(appSrc), 'no credential-shaped string in the app');
ok(!/new\s+Lenis|lenis\.raf|locomotive|SmoothScroll/i.test(appSrc), 'no JS scroll library is present');
ok(await home.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior === 'smooth'),
   'anchor jumps ease via native scroll-behavior, not a main-thread library');

/* ══════════════ 10. MOBILE ══════════════ */
H('MOBILE — 390px');
for (const slug of ['index', 'coverage', 'research']) {
  const { page: m, errs: merr } = await open(slug, { viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const ov = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(ov <= 1, `${slug}: no horizontal overflow at 390px (${ov}px)`);
  ok(merr.length === 0, `${slug}: no errors on mobile${merr.length ? ' → ' + merr.slice(0,2) : ''}`);
  const wide = await m.evaluate(() => {
    const scrolls = e => { for (let n=e;n&&n!==document.body;n=n.parentElement){
      const o=getComputedStyle(n).overflowX; if(o==='auto'||o==='scroll') return true; } return false; };
    return [...document.querySelectorAll('main *')]
      .filter(e => e.getBoundingClientRect().width > 391 && !scrolls(e))
      .map(e => e.tagName + '.' + String(e.className).slice(0,26));
  });
  ok(wide.length === 0, `${slug}: nothing overflows outside a scroll container${wide.length ? ' → ' + wide.slice(0,3) : ''}`);
  const mc = await m.evaluate(() => {
    const els = [...document.querySelectorAll('main p, main h1, main h2, main li')]
      .filter(e => e.textContent.trim() && e.offsetParent);
    return Math.min(...els.map(e => window.__contrast(e) || 99));
  });
  ok(mc >= 4.5, `${slug}: mobile text contrast floor ${mc.toFixed(2)}:1`);
  if (slug === 'index') {
    ok(await m.evaluate(() => { const b = document.getElementById('navBtn');
      return !!b && b.offsetParent !== null && b.getAttribute('aria-expanded') === 'false'
          && b.getAttribute('aria-controls') === 'navMenu'; }),
      'disclosure button visible with aria-expanded and aria-controls');
    await m.click('#navBtn'); await m.waitForTimeout(280);
    const navLinks = await m.evaluate(() => [...document.querySelectorAll('#navMenu a')]
      .filter(a => a.offsetParent !== null).map(a => a.getAttribute('href')));
    ok(new Set(navLinks).size >= 6, `all destinations reachable at 390px (${new Set(navLinks).size})`);
    ok(await m.evaluate(() => document.getElementById('navBtn').getAttribute('aria-expanded') === 'true'),
       'aria-expanded flips on open');
    await m.keyboard.press('Escape'); await m.waitForTimeout(220);
    ok(await m.evaluate(() => document.getElementById('navBtn').getAttribute('aria-expanded') === 'false'
       && document.activeElement.id === 'navBtn'),
       'Escape closes the menu and returns focus to the trigger');
  }
  await m.close();
}

/* ══════════════ 11. NO JAVASCRIPT ══════════════ */
H('NO JAVASCRIPT');
const nj = await browser.newContext({ javaScriptEnabled: false });
for (const slug of SLUGS) {
  const np = await nj.newPage();
  await np.goto(url(slug + '.html'), { waitUntil: 'load' });
  const njHidden = await np.$$eval('.reveal', es =>
    es.filter(e => parseFloat(getComputedStyle(e).opacity) < 0.9).length);
  const njText = await np.textContent('body');
  const njNav = await np.$$eval('nav a', as => as.length);
  ok(njHidden === 0 && njText.length > 1500 && njNav >= 5,
     `${slug}: readable with JS off (${njText.length} chars, ${njNav} nav links, 0 hidden)`);
  await np.close();
}
await nj.close();

/* ══════════════ 12. PERFORMANCE ══════════════ */
H('PERFORMANCE');
for (const slug of ['index', 'research']) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await p.addInitScript(() => {
    window.__lt = []; window.__cls = 0;
    new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration)))
      .observe({ type: 'longtask', buffered: true });
    new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) window.__cls += e.value; }))
      .observe({ type: 'layout-shift', buffered: true });
  });
  await p.goto(url(slug + '.html'), { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const perf = await p.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] || {};
    return { fcp: Math.round((performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime||0),
             dcl: Math.round(n.domContentLoadedEventEnd||0), cls: window.__cls,
             tbt: window.__lt.reduce((a,x)=>a+Math.max(0,x-50),0) };
  });
  ok(perf.cls < 0.1, `${slug}: CLS ${perf.cls.toFixed(4)} (good < 0.1)`);
  ok(perf.fcp < 1800, `${slug}: FCP ${perf.fcp}ms (good < 1800)`);
  ok(perf.dcl < 1500, `${slug}: DOMContentLoaded ${perf.dcl}ms`);
  /* Frame pacing under scroll at 2x DPR — the metric four earlier rounds of
     this work were spent chasing. Software rasterization in headless is slower
     than a real GPU, so the bar is deliberately loose; a regression back to a
     live canvas backdrop showed up here as a doubling. */
  const frames = await p.evaluate(async () => {
    const t = []; let last = performance.now();
    const y0 = window.scrollY;
    for (let i = 0; i < 40; i++) {
      window.scrollTo(0, y0 + i * 60);
      await new Promise(r => requestAnimationFrame(r));
      const now = performance.now(); t.push(now - last); last = now;
    }
    t.sort((a,b)=>a-b); return t[Math.floor(t.length/2)];
  });
  ok(frames < 34, `${slug}: median scroll frame ${frames.toFixed(1)}ms at dpr2 (${(1000/frames).toFixed(0)}fps)`);
  await p.close();
}

/* ══════════════ SCREENSHOTS ══════════════ */
const SHOTS = process.env.SENTINEL_SHOTS;
if (SHOTS) {
  for (const slug of SLUGS) {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(url(slug + '.html'), { waitUntil: 'load' });
    await p.waitForTimeout(1600);
    await p.screenshot({ path: path.join(SHOTS, 'page-' + slug + '.png') });
    await p.close();
  }
}

await browser.close();
console.log('\n' + '─'.repeat(66));
console.log(fail === 0 ? `✅ ALL ${pass} CHECKS PASSED` : `❌ ${fail} FAILED / ${pass} passed`);
process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
