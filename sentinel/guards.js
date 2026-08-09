/* THE FAILURE-AUDIT LAYER
   ────────────────────────────────────────────────────────────────────────────
   failures.json records every defect that reached a built artifact on this
   project, its root cause, and why the tests in place at the time did not catch
   it. This file makes that ledger executable.

   For each entry with a guard, it does two things:

     1. HOLDS      — run the guard against a clean build. It must pass.
     2. FIRES      — reintroduce the original defect into the SOURCE, rebuild,
                     and run the same guard again. It must now fail.

   Step 2 is the point of the whole file. A regression test that has never been
   observed to fail is not evidence of anything: it may be asserting something
   that cannot go wrong, matching a substring that is always present, or — as
   happened twice on this project — measuring the thing it is supposed to be
   measuring against. Three of the incidents in failures.json are exactly that
   failure mode, so every guard here is required to prove it can fail before it
   is allowed to claim it passes.

   The other half of the request this file answers — fixes that repair the
   defect WITHOUT introducing new ones — is enforced by construction:

     · Mutations are applied to source, the site is rebuilt, and the artifact is
       thrown away. The shipped tree is never left mutated: every mutation is
       restored in a finally block, and the run ends by verifying that every
       source file is byte-identical to how it started.
     · A guard is scoped to one incident. It is not allowed to pass by virtue of
       some other guard's fix, because it is run against a build where only its
       own defect is present.
     · Containment is delegated: after any fix, backtest.js's full suite must
       still pass. This file proves a guard is real; that one proves the fix did
       not cost anything elsewhere. Neither is sufficient alone.

   Usage:
     node guards.js            all guards; mutation-verified where possible
     node guards.js --fast     skip the three that re-render the bust (minutes)
     node guards.js --list     print the ledger without running anything
   ──────────────────────────────────────────────────────────────────────────── */
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');

const DIR = __dirname;
const LEDGER = JSON.parse(fs.readFileSync(path.join(DIR, 'failures.json'), 'utf8'));
const FAST = process.argv.includes('--fast');
const CHROME = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

/* ── source mutation, with restoration guaranteed ───────────────────────── */

const SOURCES = ['src/app.js', 'src/tw.css', 'src/pages.js', 'src/build.js',
                 'src/frag.glsl', 'src/bake.js'];
/* The baked renders are committed artifacts, not sources. A shader mutation has
   to re-render them, and afterwards they are restored by writing these bytes
   back rather than by baking again: re-baking to undo would double an already
   slow step and would only be byte-exact if the encoder is perfectly
   deterministic, which is not a property worth betting the working tree on. */
const ARTIFACTS = ['src/bust.datauri', 'src/reel.datauri', 'src/reel.json', 'src/og.jpg'];
const ORIGINAL = Object.fromEntries(
  SOURCES.map(f => [f, fs.readFileSync(path.join(DIR, f), 'utf8')]));
const ORIGINAL_BIN = Object.fromEntries(
  ARTIFACTS.filter(f => fs.existsSync(path.join(DIR, f)))
           .map(f => [f, fs.readFileSync(path.join(DIR, f))]));

/* Some defects only reappear when more than one protection is removed, which is
   itself informative: it means the fix is defence in depth rather than a single
   load-bearing line. Mutations are therefore a list of edits applied together. */
function applyMutation(mut) {
  for (const m of [].concat(mut)) {
    const file = path.join(DIR, m.file);
    const before = fs.readFileSync(file, 'utf8');
    const hits = before.split(m.find).length - 1;
    if (hits < 1 || (m.count && hits !== m.count)) {
      throw new Error(`anchor for ${m.file} matched ${hits} times` +
        (m.count ? `, expected ${m.count}` : '') +
        ' — the code it reverts has moved, so this guard no longer verifies what it claims');
    }
    fs.writeFileSync(file, before.split(m.find).join(m.replace));
  }
}

function restoreAll() {
  for (const f of SOURCES) fs.writeFileSync(path.join(DIR, f), ORIGINAL[f]);
  for (const f of Object.keys(ORIGINAL_BIN)) fs.writeFileSync(path.join(DIR, f), ORIGINAL_BIN[f]);
}

function build(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync('node', [path.join(DIR, 'src', 'build.js')],
    { env: Object.assign({}, process.env, { OUT: outDir }), stdio: ['ignore', 'ignore', 'pipe'] });
  return outDir;
}

/* mode 'hero' renders the still and the social card in seconds; 'full' also
   renders the eleven-view turntable and takes minutes. Only the guard whose
   defect lives in the turntable pays for the second one. */
function bake(mode) {
  execFileSync('node', [path.join(DIR, 'src', 'bake.js')],
    { env: Object.assign({}, process.env, mode === 'full' ? {} : { BAKE_ONLY: 'hero' }),
      stdio: ['ignore', 'ignore', 'pipe'], timeout: 15 * 60 * 1000 });
}

/* ── shared browser helpers ─────────────────────────────────────────────── */

let browser = null;
const load = async (dir, page_, opts) => {
  const p = await browser.newPage(Object.assign({ viewport: { width: 1440, height: 900 } }, opts || {}));
  await p.goto('file://' + path.join(dir, (page_ || 'index') + '.html'), { waitUntil: 'load' });
  await p.waitForTimeout(2200);
  return p;
};

/* Decode an image that is inlined in the build and hand back its pixels. Used
   by the shader guards, which have to look at the render — every one of the
   shading defects on the ledger was invisible in source and obvious in output. */
async function pixelsOf(dir, dataUriExtractor, opts) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const uri = dataUriExtractor(html);
  if (!uri) return null;
  const p = await browser.newPage();
  await p.setContent('<body></body>');
  const out = await p.evaluate(async ([src, o]) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = src; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    return { w: c.width, h: c.height, data: Array.from(d.data), opts: o };
  }, [uri, opts || {}]);
  await p.close();
  return out;
}
const bustUri = html => (html.match(/--bust:url\("(data:image\/jpeg;base64,[^"]+)"\)/) || [])[1];
/* The atlas moved from a JSON island into a CSS custom property when the layer
   stopped being a canvas — the stylesheet paints it now, so shipping the base64
   in both places would have put 150 KB on the page twice. */
const reelUri = html => (html.match(/--reel:url\("(data:image\/jpeg;base64,[^"]+)"\)/) || [])[1];
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/* ── the guards ─────────────────────────────────────────────────────────── */
/* Each: what it asserts, and the exact source edit that reintroduces the
   original defect. If `mutate` is absent the guard is static-only and is
   reported as unverified rather than quietly counted as proven. */

const GUARDS = {

  'rim-is-an-edge': {
    slow: true,
    describe: 'the teal rim light covers a silhouette, not whole surfaces',
    /* Restores the original mistake: a diffuse lobe called a rim light. */
    /* Replace the whole term, not just the fresnel factor. Swapping the
       fresnel alone leaves the dot(n,rl) gate and the shadow trace in place,
       which between them keep the spill under the limit — the mutation moved
       the number from 8.1% to 12.2% and the guard, at a 14% limit, sat there
       looking passed. The original defect had no fresnel and no gate at all. */
    mutate: { file: 'src/frag.glsl',
      find: 'float rim  = fre * smoothstep(0.05, 0.75, dot(n,rl)) * shadow(p,rl);',
      replace: 'float rim  = pow(max(dot(n,rl),0.), 2.0);' },
    rebake: true,
    async run(dir) {
      const px = await pixelsOf(dir, bustUri);
      if (!px) return { ok: false, detail: 'no baked bust in the build' };
      let subject = 0, teal = 0;
      for (let i = 0; i < px.data.length; i += 4) {
        const r = px.data[i], g = px.data[i + 1], b = px.data[i + 2];
        if (lum(r, g, b) < 26) continue;                 // background, not subject
        subject++;
        if ((g + b) / 2 - r > 24) teal++;                // strongly teal-dominant
      }
      const frac = subject ? teal / subject : 0;
      return { ok: frac < 0.12,
               detail: `${(frac * 100).toFixed(1)}% of lit surface is teal-dominant (limit 12%)` };
    }
  },

  'hero-image-has-no-frame-seam': {
    slow: true,
    describe: "the render's outer edge matches the page background, so its bounding box is invisible",
    mutate: { file: 'src/bake.js', find: '        if (k <= 0) continue;', replace: '        continue;' },
    rebake: true,
    async run(dir) {
      const px = await pixelsOf(dir, bustUri);
      if (!px) return { ok: false, detail: 'no baked bust in the build' };
      const { w, h, data } = px;
      let sum = 0, n = 0;
      const ring = Math.max(2, Math.round(Math.min(w, h) * 0.01));
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
          const i = (y * w + x) * 4;
          sum += lum(data[i], data[i + 1], data[i + 2]); n++;
        }
      const edge = sum / n, page = lum(5, 7, 10);
      return { ok: Math.abs(edge - page) < 3.0,
               detail: `edge luminance ${edge.toFixed(2)} vs page ${page.toFixed(2)} (limit 3.0)` };
    }
  },

  'reel-turn-is-visible': {
    slow: true,
    describe: 'the two extremes of the turntable differ enough for a reader to see the turn',
    mutate: { file: 'src/bake.js',
      find: 'const REEL_N = 11, REEL_PX = 460, REEL_ARC = 0.40;',
      replace: 'const REEL_N = 11, REEL_PX = 460, REEL_ARC = 0.02;' },
    rebake: 'full',
    async run(dir) {
      const px = await pixelsOf(dir, reelUri);
      if (!px) return { ok: false, detail: 'no turntable atlas in the build' };
      const { w, h, data } = px;
      const cell = h, n = Math.round(w / cell);
      let diff = 0, count = 0;
      for (let y = 0; y < h; y += 2)
        for (let x = 0; x < cell; x += 2) {
          const a = ((y * w) + x) * 4;
          const b = ((y * w) + (n - 1) * cell + x) * 4;
          const la = lum(data[a], data[a + 1], data[a + 2]);
          const lb = lum(data[b], data[b + 1], data[b + 2]);
          if (la < 18 && lb < 18) continue;              // both background
          diff += Math.abs(la - lb); count++;
        }
      const mad = count ? diff / count : 0;
      return { ok: mad > 6.0,
               detail: `mean |Δluma| between first and last view ${mad.toFixed(2)} (needs > 6.0)` };
    }
  },

  'figure-has-limbs': {
    describe: 'the assembled figure is a right-way-up humanoid, not ink in four boxes',
    /* Removes the y-flip. Geometry is authored y-up, the canvas is y-down: the
       figure renders inverted and the leg band goes empty. */
    mutate: { file: 'src/app.js', find: 'nd.y = cy - ', replace: 'nd.y = cy + ', count: null },
    async run(dir) {
      const p = await load(dir);
      const bands = await p.evaluate(async () => {
        const c = document.getElementById('core');
        window.scrollTo(0, c.getBoundingClientRect().top + window.pageYOffset + c.offsetHeight * 0.8);
        await new Promise(r => setTimeout(r, 1800));
        const cv = document.getElementById('core-canvas');
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        const W = cv.width, H = cv.height;
        const band = (x0, x1, y0, y1) => { let k = 0;
          for (let y = Math.floor(y0*H); y < Math.floor(y1*H); y++)
            for (let x = Math.floor(x0*W); x < Math.floor(x1*W); x++)
              if (d[(y*W+x)*4+3] > 90) k++;
          return k; };
        /* Ink in four boxes is not enough: an upside-down figure puts ink in
           all four of them too, which is how the original inversion survived
           the first version of this check. Orientation needs an asymmetric
           invariant. A humanoid crossed near the crown is ONE run of ink; the
           same figure crossed near the feet is TWO, because the legs are
           separate. Counting horizontal runs top versus bottom is therefore a
           direct test of which way up it is. */
        const runs = row => {
          let n = 0, on = false, gap = 0;
          const y = Math.floor(row * H);
          for (let x = 0; x < W; x++) {
            const ink = d[(y*W+x)*4+3] > 70;
            if (ink && !on) { n++; on = true; gap = 0; }
            else if (!ink && on) { if (++gap > W * 0.02) on = false; }
          }
          return n;
        };
        const avg = rs => rs.reduce((a,r) => a + runs(r), 0) / rs.length;
        return { head: band(0.40,0.60,0.05,0.28), leftArm: band(0.20,0.42,0.28,0.68),
                 rightArm: band(0.58,0.80,0.28,0.68), legs: band(0.38,0.62,0.70,0.98),
                 topRuns: +avg([0.10,0.14,0.18]).toFixed(2),
                 botRuns: +avg([0.84,0.88,0.92]).toFixed(2) };
      });
      await p.close();
      const empty = ['head','leftArm','rightArm','legs'].filter(k => bands[k] <= 40);
      const upright = bands.botRuns > bands.topRuns;
      const ok = empty.length === 0 && upright;
      return { ok, detail: empty.length ? `empty: ${empty.join(', ')}`
        : `runs top ${bands.topRuns} vs bottom ${bands.botRuns} — ${upright ? 'upright' : 'INVERTED'}` };
    }
  },

  'figure-complete-at-full-depth': {
    describe: 'the figure is still a linked skeleton at 100% assembly, not a dot cloud',
    /* The half-open bucket becomes closed again: edges whose progress has
       reached exactly 1 match no bucket and stop being drawn. */
    /* Two edits, because reverting the fix alone no longer reproduces the bug.
       frac is (av - 0.55) / 0.45; with av exactly 1 that evaluates to
       0.9999999999999999, not 1, so the closed-interval test misses it by one
       ulp and every edge survives. The original defect is therefore currently
       masked by a floating-point accident — worth knowing, because any refactor
       that makes the arithmetic exact reintroduces it silently. The mutation
       restores both halves: exact arithmetic and the closed bucket. */
    mutate: [
      { file: 'src/app.js', find: 'var frac = (av - 0.55) / 0.45;',
        replace: 'var frac = Math.round(((av - 0.55) / 0.45) * 1e6) / 1e6;' },
      { file: 'src/app.js', find: '(frac >= hi && hi < 1)', replace: '(frac >= hi)' },
    ],
    async run(dir) {
      const p = await load(dir);
      /* Total ink is the wrong measure here and the first version of this guard
         used it: the bones are hairlines and the 247 node sprites dominate the
         pixel count, so losing every edge moved the total by less than the
         frame-to-frame noise. What the defect actually destroys is CONNECTEDNESS
         — without bones the figure stops being a linked skeleton and becomes a
         cloud of separate dots. Counting connected components measures exactly
         that, and it is insensitive to how bright anything is. */
      const comps = await p.evaluate(async () => {
        /* Scroll to where assembly progress is exactly 1, not to 99% of the
           section. The defect only bites when frac reaches 1.0 precisely — at
           99% the easing leaves it at 0.998, which still lands inside the last
           bucket and the mutation changes nothing. Progress saturates one
           viewport before the section ends, because that is where the sticky
           child stops moving. */
        const c = document.getElementById('core');
        const top = c.getBoundingClientRect().top + window.pageYOffset;
        window.scrollTo(0, top + c.offsetHeight - window.innerHeight);
        await new Promise(r => setTimeout(r, 1700));
        const cv = document.getElementById('core-canvas');
        /* Downsample by taking the MAX over each block, not by sampling one
           pixel of it. The bones are hairlines; point-sampling a 3x3 block
           drops most of them, which is how the first attempt at this guard
           reported the intact figure as 109 disconnected pieces. */
        const S = 3;
        const W = Math.floor(cv.width / S), H = Math.floor(cv.height / S);
        const src = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        const on = new Uint8Array(W * H);
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            let m = 0;
            for (let dy = 0; dy < S; dy++)
              for (let dx = 0; dx < S; dx++)
                m = Math.max(m, src[((y*S+dy)*cv.width + (x*S+dx))*4 + 3]);
            on[y*W+x] = m > 45 ? 1 : 0;
          }
        let n = 0, biggest = 0;
        const seen = new Uint8Array(W * H), stack = [];
        for (let i = 0; i < on.length; i++) {
          if (!on[i] || seen[i]) continue;
          let size = 0; stack.push(i); seen[i] = 1;
          while (stack.length) {
            const k = stack.pop(); size++;
            const kx = k % W, ky = (k / W) | 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const nx = kx + dx, ny = ky + dy;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
              const j = ny*W + nx;
              if (on[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
            }
          }
          if (size > 2) { n++; biggest = Math.max(biggest, size); }
        }
        return { n, biggest, lit: on.reduce((a,v) => a+v, 0) };
      });
      await p.close();
      const share = comps.lit ? comps.biggest / comps.lit : 0;
      return { ok: comps.n <= 25 && share > 0.40,
               detail: `${comps.n} connected components, largest holds ${(share*100).toFixed(0)}% of the ink` };
    }
  },

  'reel-canvas-fills-hero': {
    describe: 'the interactive layer covers the hero and its strip spans every view',
    /* The original defect was a canvas collapsing to its intrinsic 300x150
       because inset:0 does not stretch a replaced element. That exact code path
       no longer exists — the layer is a div and an image strip now, for
       compositing reasons recorded elsewhere in this ledger — but the family
       does: a layer that is present, reports success, and is the wrong size.
       The mutation shrinks the strip to a single cell, so the module runs, the
       diagnostics flag goes true, and only one of the eleven views can ever be
       reached. */
    mutate: { file: 'src/app.js', find: "A.style.width = (N * h) + 'px';",
              replace: "A.style.width = h + 'px';" },
    async run(dir) {
      const p = await load(dir);
      await p.waitForTimeout(1800);
      const r = await p.evaluate(() => {
        const s = document.getElementById('hero-reel');
        if (!s) return null;
        const strip = s.getElementsByTagName('i')[0];
        if (!strip) return { noStrip: true };
        const b = s.getBoundingClientRect(), h = s.closest('header').getBoundingClientRect();
        const meta = JSON.parse(document.getElementById('d-reel').textContent);
        return { boxW: Math.round(b.width), boxH: Math.round(b.height),
                 heroW: Math.round(h.width), heroH: Math.round(h.height),
                 stripW: Math.round(parseFloat(strip.style.width || 0)),
                 cellH: Math.round(parseFloat(strip.style.height || 0)),
                 frames: meta.frames, live: s.classList.contains('live') };
      });
      await p.close();
      if (!r) return { ok: false, detail: 'no hero-reel element' };
      if (r.noStrip) return { ok: false, detail: 'hero-reel has no strip child' };
      const covers = r.boxW >= r.heroW * 0.9 && r.boxH >= r.heroH * 0.9;
      const spans = r.cellH > 0 && Math.abs(r.stripW - r.frames * r.cellH) <= r.frames;
      return { ok: r.live && covers && spans,
               detail: `${r.boxW}x${r.boxH} box in a ${r.heroW}x${r.heroH} hero, ` +
                       `strip ${r.stripW}px for ${r.frames} cells of ${r.cellH}px` };
    }
  },

  'chart-library-is-page-scoped': {
    describe: 'Chart.js ships inert, and only with the page that draws charts',
    /* Mutating the script list directly also breaks the build's own
       script-closer count, so the build would refuse and the guard would never
       get to run. Flipping the DETECTION instead ships the library everywhere
       through the normal path, which is the defect as it would really occur. */
    mutate: { file: 'src/build.js',
      find: "    charts:   /<canvas id=\"chart/.test(b),",
      replace: '    charts:   true,' },
    async run(dir) {
      const TAG = /<script type="text\/plain" id="chartjs-src">/;
      const research = fs.readFileSync(path.join(dir, 'research.html'), 'utf8');
      if (!TAG.test(research)) return { ok: false, detail: 'research.html is missing the inert tag' };
      /* No byte-size bound. An earlier version corroborated with "under 320 KB"
         and started failing the moment the home page legitimately grew a
         turntable atlas — a guard that fails when unrelated things change is a
         guard people delete. Presence of the element is the actual property. */
      const bad = ['index', 'coverage', 'method', 'contact']
        .filter(s => TAG.test(fs.readFileSync(path.join(dir, s + '.html'), 'utf8')));
      return { ok: bad.length === 0, detail: bad.length ? `also carries it: ${bad.join(', ')}` : 'research only' };
    }
  },

  'no-dead-anchors': {
    describe: 'no in-page anchor points at an id that is not on that page',
    mutate: { file: 'src/app.js', find: "cta.href = './contact.html';", replace: "cta.href = '#contact';" },
    async run(dir) {
      const bad = [];
      for (const s of ['index', 'coverage', 'evidence', 'research', 'method', 'contact']) {
        const p = await load(dir, s);
        await p.evaluate(() => document.querySelectorAll('[id^="tier"], #pricing').forEach(e => e.scrollIntoView()));
        await p.waitForTimeout(700);
        const dead = await p.evaluate(() =>
          [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href'))
            .filter(h => h.length > 1 && !document.querySelector(h)));
        if (dead.length) bad.push(`${s}: ${[...new Set(dead)].join(',')}`);
        await p.close();
      }
      return { ok: bad.length === 0, detail: bad.length ? bad.join(' | ') : 'all anchors resolve' };
    }
  },

  'no-mobile-overflow': {
    describe: 'no page scrolls horizontally at 390px',
    /* A canvas width attribute sizes the backing store AND, unconstrained,
       drives layout. Removing the cap lays the chart canvases out at 1084px. */
    /* Two things stand between a 1084px backing store and a broken mobile
       layout: the utility classes on the element and the global cap. Removing
       either alone is harmless, which is the point — this is defence in depth,
       and the mutation has to remove both to reproduce the original overflow. */
    mutate: [
      { file: 'src/tw.css', find: '  canvas { max-width: 100%; }', replace: '' },
      { file: 'src/pages.js', find: 'class="block w-full h-full"', replace: 'class="block"' },
    ],
    async run(dir) {
      const bad = [];
      for (const s of ['index', 'research', 'coverage']) {
        const p = await load(dir, s, { viewport: { width: 390, height: 844 }, isMobile: true });
        const ov = await p.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (ov > 1) bad.push(`${s} +${ov}px`);
        await p.close();
      }
      return { ok: bad.length === 0, detail: bad.length ? bad.join(', ') : 'no overflow at 390px' };
    }
  },

  'hero-contrast-samples-background': {
    describe: 'hero copy clears WCAG AA against the pixels actually behind it',
    /* Removes the scrim. The bust then sits directly under the copy and the
       measured ratio collapses — which also proves the probe is looking at the
       backdrop and not, as it once was, at the text. */
    /* Removing the scrim moved the measurement by 0.06 — worth knowing, and
       not a useful mutation. The panel's own backing is what actually carries
       hero legibility, so that is what gets removed. */
    /* Three things were tried here before one of them moved the number, and
       that is itself the finding: hero legibility is not carried by the scrim
       (removing it cost 0.06) nor by the panel's own fill (0.31). It is carried
       by the MASK that deletes the bust from the copy column entirely. That is
       the load-bearing protection, so that is what the mutation removes — along
       with the panel fill, so nothing else can quietly cover for it. */
    mutate: [
      { file: 'src/tw.css',
        find: '  .glass-strong { background-color: rgba(5, 7, 10, 0.88); }',
        replace: '  .glass-strong { background-color: rgba(5, 7, 10, 0.02); }' },
      { file: 'src/tw.css',
        find: '    -webkit-mask-image: linear-gradient(to right, transparent 0%, transparent 54%, rgba(0,0,0,.45) 64%, #000 78%);\n            mask-image: linear-gradient(to right, transparent 0%, transparent 54%, rgba(0,0,0,.45) 64%, #000 78%);',
        replace: '    -webkit-mask-image: none;\n            mask-image: none;' },
    ],
    async run(dir) {
      const p = await load(dir);
      await p.evaluate(() => {
        window.__L = c => { const f = v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
          return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2]); };
        document.querySelectorAll('header .glass > *').forEach(e => { e.style.visibility = 'hidden'; });
      });
      // Poll rather than sleep: .plain transitions visibility over 300ms, and a
      // fixed wait is how this measurement once ended up sampling the type.
      for (let i = 0; i < 40; i++) {
        const settled = await p.evaluate(() => [...document.querySelectorAll('header .glass > *')]
          .every(e => getComputedStyle(e).visibility === 'hidden'));
        if (settled) break;
        await p.waitForTimeout(50);
      }
      const box = await p.evaluate(() => { const r = document.querySelector('header .glass').getBoundingClientRect();
        return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
      const shot = (await p.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 900 } })).toString('base64');
      const m = await p.evaluate(async ([b64, box]) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        const x0 = Math.max(0, box.x), y0 = Math.max(0, box.y);
        const w = Math.min(box.w, img.width - x0), h = Math.min(box.h, img.height - y0);
        const d = c.getContext('2d').getImageData(x0, y0, w, h).data;
        const fg = getComputedStyle(document.querySelector('header .lede')).color.match(/\d+/g).map(Number);
        let best = 0, typeHits = 0;
        for (let i = 0; i < d.length; i += 4) {
          const L = window.__L([d[i], d[i+1], d[i+2]]);
          if (L > best) best = L;
          // self-check: if the copy colour is still in frame we are measuring type
          if (Math.abs(d[i]-fg[0]) < 6 && Math.abs(d[i+1]-fg[1]) < 6 && Math.abs(d[i+2]-fg[2]) < 6) typeHits++;
        }
        const Lf = window.__L(fg);
        const hi = Math.max(Lf, best), lo = Math.min(Lf, best);
        return { ratio: (hi + 0.05) / (lo + 0.05), typeHits };
      }, [shot, box]);
      await p.close();
      if (m.typeHits > 40) return { ok: false, detail: `probe is sampling type (${m.typeHits} body-colour pixels in frame)` };
      return { ok: m.ratio >= 4.5, detail: `${m.ratio.toFixed(2)}:1 against the sampled backdrop` };
    }
  },

  'reveal-survives-without-observer': {
    describe: 'content still appears when IntersectionObserver is unavailable',
    /* Two nets have to go. When IntersectionObserver is absent, scanReveal
       calls showAll() synchronously, so disabling only the timer proves
       nothing — which is what the first version of this mutation did. */
    mutate: [
      { file: 'src/app.js', find: 'setTimeout(showAll, 1500);', replace: 'setTimeout(showAll, 900000);' },
      { file: 'src/app.js', find: 'if (!io) return showAll();', replace: 'if (!io) return;' },
    ],
    async run(dir) {
      const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      // The safety net exists for exactly this environment; delete the observer
      // so the net is the only thing that can un-hide the page.
      await p.addInitScript(() => { delete window.IntersectionObserver; });
      await p.goto('file://' + path.join(dir, 'index.html'), { waitUntil: 'load' });
      await p.waitForTimeout(2600);
      const hidden = await p.$$eval('.reveal', es =>
        es.filter(e => parseFloat(getComputedStyle(e).opacity) < 0.9).length);
      await p.close();
      return { ok: hidden === 0, detail: `${hidden} elements still hidden with no IntersectionObserver` };
    }
  },

  'no-scroll-library': {
    describe: 'no JS smooth-scroll library is present in the shipped bundle',
    mutate: { file: 'src/app.js', find: 'var RM = window.matchMedia',
      replace: "var __scrollLib = 'new Lenis(';\nvar RM = window.matchMedia" },
    async run(dir) {
      const src = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
      const hit = /new\s+Lenis\(|lenis\.raf|locomotive-scroll|new\s+SmoothScroll\(/i.exec(src);
      return { ok: !hit, detail: hit ? `found ${hit[0]}` : 'native scrolling only' };
    }
  },

  'scroll-motion-uncapped': {
    describe: 'scroll-linked motion runs at native refresh rate, not a fixed cap',
    mutate: { file: 'src/app.js', find: '  function sync() {', replace: '  var __cap = frameGate(30);\n  function sync() {' },
    async run(dir) {
      // The built page is the artifact; read the core section out of it.
      const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
      const a = html.indexOf('5. NEURAL CORE'), b = html.indexOf('6. FAILURE DOSSIER');
      if (a < 0 || b < 0) return { ok: false, detail: 'could not locate the core section in the bundle' };
      const section = html.slice(a, b);
      const capped = /frameGate\s*\(/.test(section);
      return { ok: !capped, detail: capped ? 'the core section installs a frame gate' : 'uncapped' };
    }
  },

  'no-fullscreen-canvas-backdrop': {
    describe: 'no canvas is pinned across the viewport for the whole scroll',
    /* Pin the core canvas across the viewport: a canvas that never leaves the
       compositing path is the exact shape of the original 30fps defect. The
       mutation used to pin the hero layer instead, which stopped reproducing
       anything the moment that layer became a div — a guard scoped to canvases
       cannot be exercised by mutating something that is no longer one. */
    mutate: { file: 'src/pages.js',
      find: '<canvas id="core-canvas" width="1440" height="900" class="absolute inset-0 w-full h-full"',
      replace: '<canvas id="core-canvas" width="1440" height="900" class="fixed inset-0 w-full h-full"' },
    async run(dir) {
      const p = await load(dir);
      const pinned = await p.evaluate(() => [...document.querySelectorAll('canvas')]
        .filter(c => { const s = getComputedStyle(c); const r = c.getBoundingClientRect();
          return s.position === 'fixed' && r.width > innerWidth * 0.8 && r.height > innerHeight * 0.8; })
        .map(c => c.id || c.className));
      await p.close();
      return { ok: pinned.length === 0, detail: pinned.length ? `pinned: ${pinned.join(', ')}` : 'none pinned' };
    }
  },

  'single-diagnostics-surface': {
    describe: 'exactly one frozen diagnostics object is defined',
    mutate: { file: 'src/app.js', find: "Object.defineProperty(window, 'sentinelDiagnostics', {",
      replace: "Object.defineProperty(window, 'sentinelDiagnosticsCopy', {\n  value: 1, writable: false });\nObject.defineProperty(window, 'sentinelDiagnostics', {" },
    async run(dir) {
      const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
      const n = (html.match(/Object\.defineProperty\(window, 'sentinelDiagnostic/g) || []).length;
      return { ok: n === 1, detail: `${n} diagnostics definitions in the bundle` };
    }
  },

  'no-window-globals': {
    describe: 'no page internals are reachable on window',
    mutate: { file: 'src/app.js', find: 'var RM = window.matchMedia', replace: 'window.__leak = 1;\nvar RM = window.matchMedia' },
    async run(dir) {
      const p = await load(dir);
      const leaked = await p.evaluate(() => Object.keys(window)
        .filter(k => /^__|^(MC|EV|PR|CHARTS|DIAG)$/.test(k)));
      await p.close();
      return { ok: leaked.length === 0, detail: leaked.length ? leaked.join(', ') : 'clean' };
    }
  },

  'build-fails-on-missing-marker': {
    describe: 'the build refuses to emit a page that violates its own invariants',
    /* The original class: a programmatic edit whose anchor did not match, so it
       changed nothing and said nothing. The build is the backstop — it must
       exit non-zero rather than write a structurally broken page. */
    mutate: { file: 'src/pages.js', find: '<h1 class="font-semibold leading-[0.98]', replace: '<h2 class="font-semibold leading-[0.98]' },
    buildMustFail: true,
    async run(dir) {
      const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
      const n = (html.match(/<h1[\s>]/g) || []).length;
      return { ok: n === 1, detail: `${n} h1 elements on the home page` };
    }
  },
};

/* ── runner ─────────────────────────────────────────────────────────────── */

if (process.argv.includes('--list')) {
  console.log(`\nFAILURE LEDGER — ${LEDGER.incidents.length} incidents in ${Object.keys(LEDGER.classes).length} classes\n`);
  for (const [k, v] of Object.entries(LEDGER.classes)) {
    const n = LEDGER.incidents.filter(i => i.class === k).length;
    console.log(`  ${k.padEnd(28)} ${String(n).padStart(2)}  ${v}`);
  }
  console.log();
  for (const i of LEDGER.incidents) console.log(`  ${(i.guard || '—').padEnd(34)} ${i.id}`);
  process.exit(0);
}

(async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-guards-'));
  let pass = 0, fail = 0, unproven = 0;
  const rows = [];

  browser = await chromium.launch({ executablePath: CHROME,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });

  try {
    console.log('\nbuilding a clean reference…');
    const CLEAN = build(path.join(TMP, 'clean'));

    const ids = Object.keys(GUARDS).filter(id => !(FAST && GUARDS[id].slow));
    const skipped = Object.keys(GUARDS).filter(id => FAST && GUARDS[id].slow);

    for (const id of ids) {
      const g = GUARDS[id];
      const incident = LEDGER.incidents.find(i => i.guard === id);
      const row = { id, describe: g.describe, incident: incident ? incident.id : '(no ledger entry)' };

      // 1. HOLDS
      const clean = await g.run(CLEAN);
      row.holds = clean.ok; row.holdsDetail = clean.detail;

      // 2. FIRES
      if (!g.mutate) { row.fires = null; unproven++; }
      else {
        let mutDir = null, buildFailed = false;
        try {
          applyMutation(g.mutate);
          if (g.rebake) bake(g.rebake);
          try { mutDir = build(path.join(TMP, 'mut-' + id)); }
          catch (e) { buildFailed = true; }
          if (buildFailed) {
            // A build that refuses to emit the broken artifact IS the guard firing.
            row.fires = !!g.buildMustFail;
            row.firesDetail = g.buildMustFail ? 'build exited non-zero, as designed'
                                              : 'build failed for an unrelated reason';
          } else {
            const mut = await g.run(mutDir);
            row.fires = !mut.ok;
            row.firesDetail = mut.detail;
          }
        } catch (e) {
          row.fires = false; row.firesDetail = 'mutation could not be applied: ' + e.message;
        } finally {
          restoreAll();                 // sources AND baked artifacts, byte-exact
        }
      }

      const verdict = row.holds && (row.fires === true) ? 'PROVEN'
                    : row.holds && row.fires === null   ? 'unproven'
                    : row.holds                          ? 'VACUOUS'
                    : 'FAILING';
      row.verdict = verdict;
      if (verdict === 'PROVEN' || verdict === 'unproven') pass++; else fail++;
      rows.push(row);

      const mark = verdict === 'PROVEN' ? '✓' : verdict === 'unproven' ? '·' : '✗';
      console.log(`  ${mark} ${id.padEnd(36)} ${verdict}`);
      console.log(`      clean:   ${row.holds ? 'holds' : 'FAILS'} — ${row.holdsDetail}`);
      if (row.fires !== null)
        console.log(`      mutated: ${row.fires ? 'fires' : 'DOES NOT FIRE'} — ${row.firesDetail}`);
    }

    // 3. the tree must be exactly as we found it
    const drifted = SOURCES.filter(f => fs.readFileSync(path.join(DIR, f), 'utf8') !== ORIGINAL[f]);

    console.log('\n' + '─'.repeat(74));
    console.log(`  guards proven non-vacuous : ${rows.filter(r => r.verdict === 'PROVEN').length}`);
    console.log(`  guards that cannot fail   : ${rows.filter(r => r.verdict === 'VACUOUS').length}`);
    console.log(`  guards failing on clean   : ${rows.filter(r => r.verdict === 'FAILING').length}`);
    console.log(`  static, not mutation-run  : ${rows.filter(r => r.verdict === 'unproven').length}`);
    if (skipped.length) console.log(`  skipped (--fast)          : ${skipped.join(', ')}`);
    console.log(`  sources restored          : ${drifted.length === 0 ? 'yes' : 'NO → ' + drifted.join(', ')}`);

    const covered = LEDGER.incidents.filter(i => i.guard).length;
    console.log(`  ledger coverage           : ${covered}/${LEDGER.incidents.length} incidents carry a guard`);
    const orphan = LEDGER.incidents.filter(i => i.guard && !GUARDS[i.guard]).map(i => i.guard);
    if (orphan.length) { console.log(`  ledger references missing guards: ${[...new Set(orphan)].join(', ')}`); fail++; }
    if (drifted.length) fail++;

    console.log(fail === 0 ? `\n✅ FAILURE-AUDIT LAYER CLEAN — ${pass} guards`
                           : `\n❌ ${fail} PROBLEM(S) IN THE GUARD LAYER`);
    await browser.close();
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(fail === 0 ? 0 : 1);
  } catch (e) {
    restoreAll();
    if (browser) await browser.close();
    console.error('HARNESS ERROR', e);
    process.exit(1);
  }
})();
