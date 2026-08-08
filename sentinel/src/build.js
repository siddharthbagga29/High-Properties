/* Build a single self-contained page: Tailwind CSS, Chart.js, app JS and all
   three JSON payloads inlined. No CDN, no external asset, no runtime fetch. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const D = __dirname, MC = path.join(D, '..'), NM = path.join(D, '..', '..', 'node_modules');

// 1. Tailwind — scan both the markup and the JS (class names are emitted there too)
const cssOut = path.join(D, '.tw-out.css');
execFileSync(path.join(NM, '.bin', 'tailwindcss'),
  ['-c', path.join(D, 'tailwind.config.js'),
   '-i', path.join(D, 'tw.css'), '-o', cssOut, '--minify',
   '--content', `${path.join(D, 'src.html')},${path.join(D, 'app.js')}`],
  { stdio: ['ignore', 'ignore', 'pipe'] });
const css = fs.readFileSync(cssOut, 'utf8');

const chartjs = fs.readFileSync(path.join(NM, 'chart.js/dist/chart.umd.min.js'), 'utf8');
const app     = fs.readFileSync(path.join(D, 'app.js'), 'utf8');
const mc      = fs.readFileSync(path.join(MC, 'mc_v2.json'), 'utf8');
const ev      = fs.readFileSync(path.join(MC, 'evidence.json'), 'utf8');
const pr      = fs.readFileSync(path.join(MC, 'pricing.json'), 'utf8');

// A literal </script> inside any inlined payload would close the tag early.
const safe = s => s.replace(/<\/script/gi, '<\\/script');

let html = fs.readFileSync(path.join(D, 'src.html'), 'utf8');
const subs = [
  ['/*__CSS__*/', css],
  ['/*__MCDATA__*/null', safe(mc)],
  ['/*__EVIDENCE__*/null', safe(ev)],
  ['/*__PRICING__*/null', safe(pr)],
  ['/*__CHARTJS__*/', safe(chartjs)],
  ['/*__APP__*/', safe(app)],
];
for (const [k, v] of subs) {
  if (!html.includes(k)) { console.error(`FATAL: missing placeholder ${k}`); process.exit(1); }
  html = html.replace(k, () => v);
}
if (/__CSS__|__MCDATA__|__EVIDENCE__|__PRICING__|__CHARTJS__|__APP__/.test(html)) {
  console.error('FATAL: placeholder survived substitution'); process.exit(1);
}

const body = html.slice(html.indexOf('<body'));
const nOpen = (body.match(/<script/gi) || []).length;
const nClose = (body.match(/<\/script/gi) || []).length;
if (nOpen !== nClose) {
  console.error(`FATAL: script tag imbalance — ${nOpen} open / ${nClose} close`); process.exit(1);
}

fs.unlinkSync(cssOut);
const out = path.join(D, 'index.html');
fs.writeFileSync(out, html);
console.log(`built index.html — ${(html.length / 1024).toFixed(0)} KB ` +
            `(css ${(css.length/1024).toFixed(0)}KB · chart ${(chartjs.length/1024).toFixed(0)}KB · ` +
            `app ${(app.length/1024).toFixed(0)}KB · data ${((mc.length+ev.length+pr.length)/1024).toFixed(0)}KB)`);
