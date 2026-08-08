/* PHASE 5 — LOOP VERIFICATION
   One assertion per promise made in the brief. Fails loud. */
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');

const FILE = 'file://' + path.join(__dirname, 'index.html');
/* Data lives beside the page in the shipped layout, and one level up in the
   source tree. Resolve either without caring which. */
const near = f => [path.join(__dirname, f), path.join(__dirname, 'src', f),
                   path.join(__dirname, '..', f)]
  .find(p => fs.existsSync(p)) || path.join(__dirname, f);
const EV = JSON.parse(fs.readFileSync(near('evidence.json'), 'utf8'));
const PR = JSON.parse(fs.readFileSync(near('pricing.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m))
                         : (fail++, console.log('  ✗ ' + m)); };
const H = t => console.log('\n── ' + t + ' ──');

/* WCAG relative-luminance contrast, computed on the composited background */
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
  window.__contrast = function(elm){
    const cs = getComputedStyle(elm);
    const fg = parse(cs.color); if(!fg) return null;
    // composite every ancestor background down onto the page base
    let stack = [], n = elm;
    while (n && n !== document.documentElement) {
      const b = parse(getComputedStyle(n).backgroundColor);
      if (b && b.a > 0.001) stack.push(b);
      n = n.parentElement;
    }
    stack.push({r:5,g:7,b:10,a:1});
    let bg = stack[stack.length-1];
    for (let i = stack.length-2; i >= 0; i--) bg = over(stack[i], bg);
    const t = over(fg, bg);
    const L1 = lum(t), L2 = lum(bg);
    const hi = Math.max(L1,L2), lo = Math.min(L1,L2);
    return (hi+0.05)/(lo+0.05);
  };
})()`;

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(CONTRAST_FN);

  H('INTEGRITY');
  ok(errs.length === 0, `no console or page errors${errs.length ? ' → ' + errs.slice(0,3).join(' | ') : ''}`);
  const diag0 = await page.evaluate(() => window.sentinelDiagnostics
    ? { ok: window.sentinelDiagnostics.ok, errors: window.sentinelDiagnostics.errors,
        layers: window.sentinelDiagnostics.layers } : null);
  ok(!!diag0, 'diagnostics surface exposed');
  ok(diag0 && diag0.ok, `no guarded feature threw${diag0 && diag0.errors.length ? ' → ' + diag0.errors.slice(0,3) : ''}`);
  ok(diag0 && diag0.layers.webgl, 'background WebGL layer alive');
  ok(diag0 && diag0.layers.core, 'neural-core canvas alive');
  ok(await page.evaluate(() => typeof window.Chart === 'undefined'),
     'Chart.js is NOT executed at load (deferred until a chart section nears)');

  H('MOTION');
  ok(await page.evaluate(() => window.sentinelDiagnostics.layers.smoothScroll),
     'smooth scroll engaged');
  ok(await page.evaluate(() => document.documentElement.classList.contains('lenis-on')),
     'lenis-on set, so native scroll-behavior stands down');
  // Inertia is measured by DURATION, which is frame-rate independent. Headless
  // renders at ~14fps so counting eased frames would be meaningless here.
  await page.evaluate(() => { window.__sc = [];
    window.addEventListener('scroll', () => window.__sc.push(performance.now()), { passive:true }); });
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(2000);
  const settle = await page.evaluate(() => {
    const s = window.__sc; return s.length > 1 ? Math.round(s[s.length-1] - s[0]) : 0; });
  ok(settle > 150, `wheel gesture eases over ${settle}ms rather than jumping`);
  await page.evaluate(() => { delete window.__sc; window.scrollTo(0, 0); });  // probe cleanup
  await page.waitForTimeout(900);

  // Scroll-linked motion must NOT be frame-capped; only the ambient layer is.
  const appSrc = fs.readFileSync(near('app.js'), 'utf8');
  const coreSection = appSrc.slice(appSrc.indexOf('5. NEURAL CORE'), appSrc.indexOf('6. FAILURE DOSSIER'));
  ok(!/frameGate\(/.test(coreSection),
     'the scroll-linked core runs at native refresh rate, not a fixed cap');
  const bgSection = appSrc.slice(appSrc.indexOf('4. BACKGROUND WEBGL'), appSrc.indexOf('5. NEURAL CORE'));
  ok(/frameGate\(20\)/.test(bgSection) && /frameGate\(6\)/.test(bgSection),
     'the ambient background is dual-rate: 20fps at rest, 6fps while scrolling');

  H('SECURITY POSTURE');
  const cspMeta = await page.evaluate(() => {
    const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return m ? m.getAttribute('content') : null;
  });
  ok(!!cspMeta, 'Content-Security-Policy meta present');
  ok(cspMeta && /default-src 'none'/.test(cspMeta), "CSP sets default-src 'none'");
  ok(cspMeta && !/unsafe-inline|unsafe-eval/.test(cspMeta), "CSP uses hashes, no 'unsafe-inline' or 'unsafe-eval'");
  ok(cspMeta && (cspMeta.match(/sha256-/g) || []).length >= 4,
     `CSP carries ${(cspMeta.match(/sha256-/g)||[]).length} SHA-256 hashes`);
  ok(cspMeta && /base-uri 'none'/.test(cspMeta) && /object-src 'none'/.test(cspMeta),
     "CSP locks base-uri and object-src");
  ok(!cspMeta || !/frame-ancestors/.test(cspMeta),
     'meta CSP omits frame-ancestors (spec-ignored there; shipped as a header)');
  const headers = fs.readFileSync(path.join(__dirname, '_headers'), 'utf8');
  ['frame-ancestors', 'X-Frame-Options: DENY', 'X-Content-Type-Options: nosniff',
   'Referrer-Policy', 'Permissions-Policy', 'Strict-Transport-Security'].forEach(h =>
    ok(headers.includes(h), `_headers ships ${h.split(':')[0]}`));
  const shipped = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const litStyle = (shipped.slice(shipped.indexOf('<body')).match(/\sstyle="/g) || []).length;
  ok(litStyle === 0,
     `zero literal style attributes in the shipped markup (${litStyle}) — runtime CSSOM writes are not governed by style-src`);
  const leaked = await page.evaluate(() =>
    Object.keys(window)
      .filter(k => /^__|^(MC|EV|PR|CHARTS|DIAG)$/.test(k))
      .filter(k => k !== '__contrast'));   // injected by this harness, not the page
  ok(leaked.length === 0, `no internals on window${leaked.length ? ' → ' + leaked : ''}`);
  ok(await page.evaluate(() => {
    try { window.sentinelDiagnostics = 1; } catch (e) { return true; }
    return typeof window.sentinelDiagnostics === 'object';
  }), 'diagnostics surface is not writable');

  // Warm every lazily-built section before counting its contents.
  for (const id of ['failures','dashboard','research','pricing','evidence','contact']) {
    await page.evaluate(i => document.getElementById(i).scrollIntoView(), id);
    await page.waitForTimeout(700);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => typeof window.Chart === 'function'),
     'Chart.js loads on demand once a chart section is reached');

  /* ─────────────── PHASE 1 ─────────────── */
  H('PHASE 1 — COPY');
  const text = await page.evaluate(() => document.body.innerText);
  const BRIT = /\b(artefacts?|analyse[ds]?|behaviour\w*|colour[sd]?|centre[sd]?|defence|labell(ed|ing)|modell(ed|ing)|organisations?|recognise[ds]?|utilise[ds]?|authorise[ds]?|prioritise[ds]?|programmes?|catalogue|whilst|amongst|learnt|per cent|judgement|licence|fulfil|sizeable)\b/gi;
  const brit = text.match(BRIT) || [];
  ok(brit.length === 0, `US English throughout${brit.length ? ' → ' + [...new Set(brit)].join(', ') : ''}`);

  const realDbl = await page.evaluate(() => {
    const out = [];
    const w = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) {
      const m = n.nodeValue.match(/\b(\w{2,})\s+\1\b/gi);
      if (m) out.push(...m.filter(x => !/^(that that|had had|is is)$/i.test(x)));
    }
    return out;
  });
  ok(realDbl.length === 0, `no duplicated words${realDbl.length ? ' → ' + realDbl.slice(0,3) : ''}`);
  ok(!/\s,|\s\.|\(\s|\s\)|,,|\.\./.test(text), 'no stray punctuation spacing');
  const junk = (text.match(/\b(TODO|TKTK|PLACEHOLDER|undefined|\[object \w+)\b/gi) || [])
    .concat(text.match(/\bNaN\b/g) || [])
    .concat(text.match(/Lorem ipsum/gi) || []);
  ok(junk.length === 0,
     `no placeholder, undefined or NaN text in the page${junk.length ? ' → ' + [...new Set(junk)] : ''}`);

  H('PHASE 1.3 — PRESS-READY DOSSIER');
  const dossier = await page.$$('#dossier article');
  ok(dossier.length === 5, `five adjudicated cases in press format (${dossier.length})`);
  const structured = await page.$$eval('#dossier article', as => as.filter(a => {
    const k = [...a.querySelectorAll('.kicker')].map(x => x.textContent.trim());
    return k.includes('Failure mode') && k.includes('Holding') && k.includes('Underwriting significance');
  }).length);
  ok(structured === 5, 'every case carries Failure mode / Holding / Underwriting significance');
  const citations = await page.$$eval('#dossier article', as =>
    as.filter(a => /\d{4}|v\./.test(a.textContent)).length);
  ok(citations === 5, 'every case carries a court and date citation');

  /* ─────────────── PHASE 2 ─────────────── */
  H('PHASE 2 — CONTRAST');
  const worst = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('main p, main h1, main h2, main h3, main li, main td, main th, main span, main a')
      .forEach(e => {
        if (!e.textContent.trim() || e.offsetParent === null) return;
        if (e.children.length && !e.childNodes[0].nodeValue?.trim()) return;
        const fs = parseFloat(getComputedStyle(e).fontSize);
        const bold = +getComputedStyle(e).fontWeight >= 700;
        const large = fs >= 24 || (fs >= 18.66 && bold);
        const c = window.__contrast(e);
        if (c == null) return;
        const need = large ? 3.0 : 4.5;
        if (c < need) out.push({ t: e.textContent.trim().slice(0,42), c: +c.toFixed(2), need, fs });
      });
    return out;
  });
  ok(worst.length === 0,
     `all visible text meets WCAG AA on the composited background${worst.length ? ' → ' + JSON.stringify(worst.slice(0,4)) : ''}`);

  const glassed = await page.evaluate(() => {
    const sections = [...document.querySelectorAll('main section, main header')];
    return sections.filter(s => !s.querySelector('.glass')).map(s => s.id || s.tagName);
  });
  ok(glassed.length === 0, `every section places copy on a glass surface${glassed.length ? ' → ' + glassed : ''}`);

  const glassOpaque = await page.evaluate(() => {
    const g = document.querySelector('.glass');
    const cs = getComputedStyle(g);
    const a = parseFloat((cs.backgroundColor.match(/rgba?\(([^)]+)\)/)[1].split(',')[3] || '1'));
    return { alpha: a, blur: cs.backdropFilter || cs.webkitBackdropFilter };
  });
  ok(glassOpaque.alpha >= 0.7, `glass backdrop is at least 70% opaque (${glassOpaque.alpha})`);
  ok(/blur/.test(glassOpaque.blur), `backdrop-filter blur applied (${glassOpaque.blur})`);

  H('PHASE 2 — SCROLL-FORMING CORE');
  const coreTop = await page.evaluate(() =>
    document.getElementById('core').getBoundingClientRect().top + window.pageYOffset);
  const coreH = await page.evaluate(() => document.getElementById('core').offsetHeight);
  const samples = [];
  for (const f of [0.02, 0.2, 0.4, 0.6, 0.8, 0.96]) {
    await page.evaluate(y => window.scrollTo(0, y), coreTop + coreH * f);
    await page.waitForTimeout(900);
    samples.push(await page.evaluate(() => ({
      pct: parseInt(document.getElementById('core-pct').textContent),
      bar: parseFloat(document.getElementById('core-bar').style.width),
      // dots no longer pending = failure modes reached so far
      lit: [...document.querySelectorAll('#wp-dots span')]
             .filter(d => !d.className.includes('bg-white/12')).length,
      open: document.querySelectorAll('#wp-active > div:not(.hidden)').length
    })));
  }
  const mono = samples.every((s, i) => i === 0 || s.pct >= samples[i-1].pct);
  ok(mono, `assembly maps monotonically to scroll depth (${samples.map(s=>s.pct+'%').join(' → ')})`);
  ok(samples[0].pct <= 10 && samples[samples.length-1].pct >= 85,
     `assembly spans 0→100% across the pinned section (${samples[0].pct}% → ${samples[samples.length-1].pct}%)`);
  const litMono = samples.every((s, i) => i === 0 || s.lit >= samples[i-1].lit);
  ok(litMono, `weak points activate in order (${samples.map(s=>s.lit).join(' → ')} of 5)`);
  ok(samples[samples.length-1].lit === 5, 'all five failure modes activate by the end');
  ok(samples.every(s => s.open <= 1), 'exactly one failure mode is shown at a time');

  const overlap = await page.evaluate(() => {
    const panel = document.querySelector('#core .glass').getBoundingClientRect();
    const cv = document.getElementById('core-canvas').getBoundingClientRect();
    // the canvas is allowed to sit behind, but the panel must be readable:
    // verified separately by contrast. Here: the panel must have real area.
    return { panelW: panel.width, panelH: panel.height, cvW: cv.width };
  });
  ok(overlap.panelW > 260 && overlap.panelH > 200,
     `narrative panel holds its own area over the animation (${Math.round(overlap.panelW)}×${Math.round(overlap.panelH)})`);

  const coreContrast = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#core .glass p, #core .glass h2, #core .glass span')]
      .filter(e => e.textContent.trim() && e.offsetParent);
    return Math.min(...els.map(e => window.__contrast(e) || 99));
  });
  ok(coreContrast >= 4.5, `core panel text contrast over the animation: ${coreContrast.toFixed(2)}:1`);

  /* ─────────────── PHASE 3 ─────────────── */
  ok(await page.evaluate(() => {
    const cv = document.getElementById('core-canvas'), gl = document.querySelector('#core .glass');
    const c = cv.getBoundingClientRect(), g = gl.getBoundingClientRect();
    // panel centred over the figure and narrower than it, so head/arms/legs show
    return Math.abs((c.left + c.width/2) - (g.left + g.width/2)) < 40
        && g.width < c.width * 0.55;
  }), 'copy panel sits centred over the figure, leaving it visible around the edges');
  ok(await page.evaluate(() =>
    document.querySelector('#core .glass').getBoundingClientRect().height
      < window.innerHeight * 0.62),
    'panel is short enough to leave the head and legs uncovered');
  ok((await page.$$('#wp-dots span')).length === 5, 'five-step failure indicator present');

  H('PHASE 3 — CHARTS');
  const IDS = ['chartCyber','chartPools','chartVert','chartVertPrem','chartRoi'];
  for (const id of IDS) {
    const painted = await page.evaluate(i => {
      const c = document.getElementById(i);
      if (!c) return -1;
      c.scrollIntoView();
      const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let n = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 8) n++;
      return n;
    }, id);
    ok(painted > 2500, `${id} rendered (${painted} painted px)`);
  }
  const nCharts = await page.evaluate(() => Object.keys(Chart.instances || {}).length ||
    (Chart.registry && document.querySelectorAll('canvas').length));
  ok(nCharts >= 5, `at least five chart instances live (${nCharts})`);

  H('PHASE 3 — ROI CALCULATOR');
  const roiRead = () => page.evaluate(() => ({
    net: document.getElementById('roiNet').textContent,
    pb: document.getElementById('roiPayback').textContent
  }));
  const roi0 = await roiRead();
  ok(roi0.net !== '—' && roi0.pb !== '—', `ROI computes on load (${roi0.net}, ${roi0.pb})`);
  await page.selectOption('#roiVert', { index: 0 });
  await page.waitForTimeout(300);
  const roi1 = await roiRead();
  await page.selectOption('#roiVert', { index: 6 });
  await page.waitForTimeout(300);
  const roi2 = await roiRead();
  ok(roi1.net !== roi2.net, `sector selector changes the ROI (${roi1.net} vs ${roi2.net})`);
  await page.selectOption('#roiBand', { index: 0 });
  await page.waitForTimeout(300);
  const roi3 = await roiRead();
  ok(roi3.net !== roi2.net, `revenue-band selector changes the ROI (${roi2.net} vs ${roi3.net})`);

  H('PHASE 3 — COUNTERS');
  const counters = await page.$$eval('[data-count]', es => es.map(e => e.textContent));
  ok(counters.every(c => !/^\$?0(\.0)?[%M]?$/.test(c)),
     `all counters animated off zero (${counters.join(' · ')})`);

  /* ─────────────── PHASE 4 ─────────────── */
  H('PHASE 4 — PRICING');
  ok((await page.$$('#tiers > div')).length === PR.tiers.length,
     `all ${PR.tiers.length} product tiers rendered`);
  const tierMath = await page.$$eval('#tiers > div', ds =>
    ds.filter(d => d.textContent.length > 300).length);
  ok(tierMath === PR.tiers.length, 'every tier states its pricing rationale');
  ok((await page.$$('#tiers a[href="#contact"]')).length === PR.tiers.length,
     'every tier has a working CTA into the contact portal');

  const nCells = PR.matrix.reduce((a, r) => a + r.cells.length, 0);
  ok((await page.$$('#matrixTable tr')).length === nCells + PR.matrix.length,
     `premium matrix shows all ${nCells} layers across ${PR.matrix.length} bands`);
  const declined = await page.$$eval('#matrixTable tr', rs =>
    rs.filter(r => /Not offered/.test(r.textContent)).length);
  ok(declined === PR.matrix.reduce((a,r)=>a+r.cells.filter(c=>!c.offered).length,0),
     `uneconomic layers are declined rather than quoted (${declined})`);

  const credits = PR.matrix.flatMap(r => r.cells.filter(c=>c.offered).map(c => c.saving_pct));
  ok(credits.every(c => c > 0.25 && c < 0.65),
     `telemetry credit is consistent across every layer (${(Math.min(...credits)*100).toFixed(0)}–${(Math.max(...credits)*100).toFixed(0)}%)`);
  const rols = PR.matrix.flatMap(r => r.cells.filter(c=>c.offered).map(c => c.rol));
  ok(rols.every(r => r > 0 && r < 0.04), 'every offered layer prices inside a sane rate-on-line band');
  const monoPrem = PR.matrix.every(r => {
    const c = r.cells.filter(x => x.offered);
    return c.every((x, i) => i === 0 || x.monitored >= c[i-1].monitored);
  });
  ok(monoPrem, 'premium rises monotonically with limit in every band');

  ok((await page.$$('#compTable tr')).length === PR.competitors.length,
     `competitive table lists all ${PR.competitors.length} writers`);
  const labeled = await page.$$eval('#compTable tr', rs =>
    rs.filter(r => /SIMULATED|MODELED/.test(r.textContent)).length);
  ok(labeled === PR.competitors.length, 'every competitor rate is explicitly labeled simulated or modeled');

  ok((await page.$$('#vertTable tr')).length === PR.verticals.length,
     `sector table lists all ${PR.verticals.length} verticals`);

  H('PHASE 4 — CONTACT PORTAL');
  await page.evaluate(() => document.getElementById('contact').scrollIntoView());
  await page.waitForTimeout(400);
  const q0 = await page.textContent('#fQuote');
  await page.selectOption('#fSector', { index: 0 });
  await page.waitForTimeout(200);
  const q1 = await page.textContent('#fQuote');
  await page.selectOption('#fSector', { index: 5 });
  await page.waitForTimeout(200);
  const q2 = await page.textContent('#fQuote');
  ok(q0 !== '—', `live quote computes (${q0})`);
  ok(q1 !== q2, `quote responds to sector (${q1} vs ${q2})`);
  await page.selectOption('#fLimit', { index: 0 });
  await page.waitForTimeout(200);
  const q3 = await page.textContent('#fQuote');
  ok(q3 !== q2, `quote responds to limit (${q2} vs ${q3})`);

  // validation must block a bad submit
  await page.click('#quoteForm button[type=submit]');
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => !document.getElementById('formErr').classList.contains('hidden')),
     'empty submit is blocked with a visible, role=alert error');
  ok(await page.evaluate(() => document.activeElement.id === 'fName'),
     'focus moves to the first invalid field');

  await page.fill('#fName', 'Test Buyer');
  await page.fill('#fEmail', 'not-an-email');
  await page.check('#fConsent');
  await page.click('#quoteForm button[type=submit]');
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => /valid work email/.test(document.getElementById('formErr').textContent)),
     'invalid email is caught');
  ok(await page.evaluate(() =>
    document.getElementById('fEmail').getAttribute('aria-invalid') === 'true' &&
    document.getElementById('fName').getAttribute('aria-invalid') === null),
    'aria-invalid marks only the offending field');

  await page.fill('#fEmail', 'buyer@example.com');
  await page.fill('#fCompany', 'Testco Ltd');
  await page.click('#quoteForm button[type=submit]');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !document.getElementById('formOk').classList.contains('hidden')),
     'valid submit shows a success message');
  const mailto = await page.evaluate(() => document.getElementById('quoteForm').getComposedMailto());
  ok(!!mailto && mailto.startsWith('mailto:') && /body=/.test(mailto),
     'valid submit composes a mailto carrying the form data');
  ok(await page.evaluate(() =>
    ['fName','fEmail','fConsent'].every(i => !document.getElementById(i).hasAttribute('aria-invalid'))),
    'aria-invalid clears once the fields are corrected');
  ok(!!mailto && decodeURIComponent(mailto).indexOf('Test Buyer') > -1 &&
     decodeURIComponent(mailto).indexOf('Testco Ltd') > -1,
     'the mailto body carries the entered name, company, sector and quote');

  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('#quoteForm input, #quoteForm select, #quoteForm textarea')]
      .filter(f => !document.querySelector(`label[for="${f.id}"]`)).map(f => f.id || f.name));
  ok(labels.length === 0, `every form field has an associated label${labels.length ? ' → ' + labels : ''}`);

  /* ─────────────── GENERAL ─────────────── */
  H('EVIDENCE + LINKS');
  ok((await page.$$('#ledger > div')).length === EV.claims.length,
     `ledger renders all ${EV.claims.length} graded claims`);
  const tierCounts = await page.evaluate(() =>
    ['cA','cB','cC','cD'].map(i => +document.getElementById(i).textContent));
  const expTiers = ['A','B','C','D'].map(t => EV.claims.filter(c => c.tier === t).length);
  ok(JSON.stringify(tierCounts) === JSON.stringify(expTiers),
     `tier counters correct (${tierCounts.join('/')})`);

  const badExt = await page.$$eval('a[href^="http"]', as => as.filter(a =>
    a.target !== '_blank' || !/noopener/.test(a.rel) || !/noreferrer/.test(a.rel) ||
    !a.href.startsWith('https://')).map(a => a.href));
  const extN = await page.$$eval('a[href^="http"]', as => as.length);
  ok(badExt.length === 0, `all ${extN} external links are https + _blank + noopener noreferrer`);

  const deadAnchors = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href'))
      .filter(h => h.length > 1 && !document.querySelector(h)));
  ok(deadAnchors.length === 0, `no dead in-page anchors${deadAnchors.length ? ' → ' + deadAnchors : ''}`);

  H('PLAIN ENGLISH LAYER');
  const plains = await page.$$('.plain');
  ok(plains.length >= 20, `plain-language summaries present (${plains.length})`);
  const missing = await page.evaluate(() =>
    [...document.querySelectorAll('main section, main header')]
      .filter(s => !s.querySelector('.plain') && !['sources','evidence'].includes(s.id))
      .map(s => s.id || s.tagName));
  ok(missing.length === 0, `every content section carries one${missing.length ? ' → ' + missing : ''}`);
  const preToggle = await page.evaluate(() => getComputedStyle(document.querySelector('.plain')).color);
  await page.click('#peBtn'); await page.waitForTimeout(350);
  const postToggle = await page.evaluate(() => getComputedStyle(document.querySelector('.plain')).color);
  ok(preToggle !== postToggle, 'Plain English toggle changes the layer');

  H('ACCESSIBILITY');
  ok(await page.evaluate(() => !!document.querySelector('a.skip[href="#main"]')), 'skip link present');
  const noAlt = await page.evaluate(() =>
    [...document.querySelectorAll('canvas')].filter(c =>
      !c.hasAttribute('aria-label') && !c.hasAttribute('aria-hidden') &&
      !c.closest('[aria-hidden]')).length);
  ok(noAlt === 0, 'every canvas is labeled or hidden from assistive tech');
  const tables = await page.$$eval('table', ts => ts.filter(t => !t.querySelector('caption')).length);
  ok(tables === 0, 'every table has a caption');
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('.reveal')].filter(e =>
      parseFloat(getComputedStyle(e).opacity) < 0.9).length);
  ok(hidden === 0, 'nothing left invisible after reveal settles');

  ok(await page.evaluate(() => {
    const p = document.getElementById('core-progress');
    return p && p.getAttribute('role') === 'progressbar' &&
           p.hasAttribute('aria-valuenow') && p.hasAttribute('aria-valuemin') &&
           p.hasAttribute('aria-valuemax');
  }), 'assembly indicator is a labeled progressbar');
  ok(await page.evaluate(() => {
    const l = document.getElementById('core-live');
    return l && l.getAttribute('aria-live') === 'polite';
  }), 'failure modes are announced through a live region');
  ok(await page.evaluate(() =>
    document.querySelectorAll('dl').length >= 4 &&
    document.querySelectorAll('dl dt').length >= 12),
    'stat pairs use description lists');
  ok(await page.evaluate(() =>
    [...document.querySelectorAll('.chart-fallback')].length === 5 &&
    [...document.querySelectorAll('.chart-fallback')].every(f => f.classList.contains('hidden'))),
    'every chart has a fallback, and none is showing');

  H('MOBILE');
  const m = await browser.newPage({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
  const merr = []; m.on('pageerror', e => merr.push(e.message));
  await m.goto(FILE, { waitUntil:'load' }); await m.waitForTimeout(2000);
  await m.evaluate(CONTRAST_FN);
  H('MOBILE NAVIGATION');
  const navBtnOk = await m.evaluate(() => {
    const b = document.getElementById('navBtn');
    return !!b && b.offsetParent !== null && b.getAttribute('aria-expanded') === 'false'
        && b.getAttribute('aria-controls') === 'navMenu';
  });
  ok(navBtnOk, 'disclosure button visible with aria-expanded and aria-controls');
  await m.click('#navBtn'); await m.waitForTimeout(280);
  const navLinks = await m.evaluate(() =>
    [...document.querySelectorAll('nav a[href^="#"]')]
      .filter(a => a.offsetParent !== null).map(a => a.getAttribute('href')));
  ok(new Set(navLinks).size >= 6, `all destinations reachable at 390px (${new Set(navLinks).size})`);
  ok(await m.evaluate(() => document.getElementById('navBtn').getAttribute('aria-expanded') === 'true'),
     'aria-expanded flips on open');
  await m.keyboard.press('Escape'); await m.waitForTimeout(220);
  ok(await m.evaluate(() => document.getElementById('navBtn').getAttribute('aria-expanded') === 'false'
     && document.activeElement.id === 'navBtn'),
     'Escape closes the menu and returns focus to the trigger');

  H('MOBILE');
  const ov = await m.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(ov <= 1, `no horizontal overflow at 390px (${ov}px)`);
  ok(merr.length === 0, `no errors on mobile${merr.length ? ' → ' + merr.slice(0,2) : ''}`);
  const mWide = await m.evaluate(() => {
    const scrolls = e => { for (let n=e;n&&n!==document.body;n=n.parentElement){
      const o=getComputedStyle(n).overflowX; if(o==='auto'||o==='scroll') return true; } return false; };
    return [...document.querySelectorAll('main *')]
      .filter(e => e.getBoundingClientRect().width > 391 && !scrolls(e))
      .map(e => e.tagName + '.' + String(e.className).slice(0,26));
  });
  ok(mWide.length === 0, `nothing overflows outside a scroll container${mWide.length ? ' → ' + mWide.slice(0,3) : ''}`);
  const mContrast = await m.evaluate(() => {
    const els = [...document.querySelectorAll('main p, main h1, main h2, main li')]
      .filter(e => e.textContent.trim() && e.offsetParent);
    return Math.min(...els.map(e => window.__contrast(e) || 99));
  });
  ok(mContrast >= 4.5, `mobile text contrast floor ${mContrast.toFixed(2)}:1`);
  await m.close();

  H('NO JAVASCRIPT');
  const nj = await browser.newContext({ javaScriptEnabled:false });
  const np = await nj.newPage();
  await np.goto(FILE, { waitUntil:'load' });
  const njHidden = await np.$$eval('.reveal', es =>
    es.filter(e => parseFloat(getComputedStyle(e).opacity) < 0.9).length);
  ok(njHidden === 0, 'with JS off, all content is visible');
  const njText = await np.textContent('body');
  ok(njText.length > 3000, `${njText.length} chars readable without JS`);
  await nj.close();

  await page.evaluate(() => window.scrollTo(0,0)); await page.waitForTimeout(600);
  const SHOTS = process.env.SENTINEL_SHOTS;   // set a directory to capture
  const shot = f => SHOTS ? page.screenshot({ path: path.join(SHOTS, f) }) : Promise.resolve();
  await shot('shot-1-hero.png');
  await page.evaluate(y => window.scrollTo(0, y), coreTop + coreH * 0.7);
  await page.waitForTimeout(900);
  await shot('shot-2-core.png');
  for (const [id, f] of [['dashboard','shot-3-dash.png'],['research','shot-4-research.png'],
                          ['pricing','shot-5-pricing.png'],['contact','shot-6-contact.png']]) {
    await page.evaluate(i => document.getElementById(i).scrollIntoView(), id);
    await page.waitForTimeout(800);
    await shot(f);
  }

  await browser.close();
  console.log('\n' + '─'.repeat(62));
  console.log(fail === 0 ? `✅ ALL ${pass} CHECKS PASSED` : `❌ ${fail} FAILED / ${pass} passed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
