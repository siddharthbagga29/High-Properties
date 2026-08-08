/* Build a single self-contained page with a hash-based CSP.
   No CDN, no external asset, no runtime fetch, no 'unsafe-inline'. */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const D = __dirname, MC = path.join(D, '..'), NM = path.join(D, '..', '..', 'node_modules');

const sha256 = s => "'sha256-" + crypto.createHash('sha256').update(s, 'utf8').digest('base64') + "'";

// 1. Tailwind — scan markup and JS, since class names are emitted from both.
const cssOut = path.join(D, '.tw-out.css');
execFileSync(path.join(NM, '.bin', 'tailwindcss'),
  ['-c', path.join(D, 'tailwind.config.js'),
   '-i', path.join(D, 'tw.css'), '-o', cssOut, '--minify',
   '--content', `${path.join(D, 'src.html')},${path.join(D, 'app.js')}`],
  { stdio: ['ignore', 'ignore', 'pipe'] });
const css = fs.readFileSync(cssOut, 'utf8');
fs.unlinkSync(cssOut);

const chartjs = fs.readFileSync(path.join(NM, 'chart.js/dist/chart.umd.min.js'), 'utf8');
const app     = fs.readFileSync(path.join(D, 'app.js'), 'utf8');
const mc      = fs.readFileSync(path.join(MC, 'mc_v2.json'), 'utf8');
const ev      = fs.readFileSync(path.join(MC, 'evidence.json'), 'utf8');
const pr      = fs.readFileSync(path.join(MC, 'pricing.json'), 'utf8');

// A literal </script> inside any inlined payload would close the tag early.
const safe = s => s.replace(/<\/script/gi, '<\\/script');
const chartjsSafe = safe(chartjs);
const appSafe     = safe(app);

const bootstrap = "document.documentElement.classList.add('js-ready');";

let html = fs.readFileSync(path.join(D, 'src.html'), 'utf8');
for (const [k, v] of [
  ['/*__CSS__*/', css],
  ['/*__MCDATA__*/', safe(mc)],
  ['/*__EVIDENCE__*/', safe(ev)],
  ['/*__PRICING__*/', safe(pr)],
  ['/*__CHARTJS__*/', chartjsSafe],
  ['/*__APP__*/', appSafe],
]) {
  if (!html.includes(k)) { console.error(`FATAL: missing placeholder ${k}`); process.exit(1); }
  html = html.replace(k, () => v);
}

/* CSP.
   script-src carries a hash per executable inline script. The Chart.js hash
   covers the text that app.js re-injects at runtime — the injected script is
   byte-identical to the inert source, so the same hash validates it.
   frame-ancestors / sandbox are ignored inside <meta> per spec; they ship as
   real headers in _headers. */
const scriptHashes = [sha256(bootstrap), sha256(appSafe), sha256(chartjsSafe)];
const metaOnlyDrop = new Set(['frame-ancestors']);
const csp = [
  "default-src 'none'",
  `script-src ${scriptHashes.join(' ')}`,
  `style-src ${sha256(css)}`,
  "img-src 'self' data:",
  "font-src 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ');

/* The <meta> form must omit directives the spec ignores there, otherwise the
   browser logs a warning on every load. They still ship in _headers. */
const metaCsp = csp.split('; ')
  .filter(d => !metaOnlyDrop.has(d.split(' ')[0]))
  .join('; ');
html = html.replace('<!--__CSP__-->',
  `<meta http-equiv="Content-Security-Policy" content="${metaCsp}">`);

// Verify the bootstrap script we hashed is the one actually in the document.
if (!html.includes(`<script>${bootstrap}</script>`)) {
  console.error('FATAL: bootstrap script text drifted from the hashed value'); process.exit(1);
}
if (/__CSS__|__MCDATA__|__EVIDENCE__|__PRICING__|__CHARTJS__|__APP__|__CSP__/.test(html)) {
  console.error('FATAL: placeholder survived substitution'); process.exit(1);
}
/* Tag-balance check.
   Counting "<script" in the built file is meaningless: Chart.js and app.js both
   contain that substring inside string literals. What actually matters is that
   no payload smuggled in an unescaped "</script", which would terminate a tag
   early. safe() escapes those, so the number of "</script>" in the output must
   equal the number of script elements declared in the template. */
const tmpl = fs.readFileSync(path.join(D, 'src.html'), 'utf8');
const expectedScripts = (tmpl.match(/<script[\s>]/gi) || []).length;
const actualCloses = (html.match(/<\/script>/gi) || []).length;
if (actualCloses !== expectedScripts) {
  console.error(`FATAL: expected ${expectedScripts} script elements, found ${actualCloses} closers`);
  process.exit(1);
}
const body = html.slice(html.indexOf('<body'));
// Inline style attributes would need style-src-attr; the CSP above allows none.
const inlineStyle = body.match(/\sstyle="/g) || [];
if (inlineStyle.length) {
  console.error(`FATAL: ${inlineStyle.length} inline style attribute(s) — CSP forbids them`);
  process.exit(1);
}

/* Two identical outputs, written from the same bytes.
   index.html  — what every static host serves at the root.
   index2.html — the name already in circulation locally.
   They can never diverge because both are written here, in one step. */
fs.writeFileSync(path.join(D, 'index.html'), html);
fs.writeFileSync(path.join(D, 'index2.html'), html);

/* Real HTTP headers. Netlify and Cloudflare Pages both read _headers.
   frame-ancestors only works as a header, which is why it is repeated here. */
fs.writeFileSync(path.join(D, '_headers'), `/*
  Content-Security-Policy: ${csp}
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  Cache-Control: public, max-age=0, must-revalidate
`);

console.log(`built index.html + index2.html (identical) — ${(html.length / 1024).toFixed(0)} KB each`);
console.log(`  css ${(css.length/1024).toFixed(0)}KB · chart ${(chartjs.length/1024).toFixed(0)}KB (inert) · ` +
            `app ${(app.length/1024).toFixed(0)}KB · data ${((mc.length+ev.length+pr.length)/1024).toFixed(0)}KB`);
console.log(`  CSP: ${scriptHashes.length} script hashes, 1 style hash, no 'unsafe-inline'`);
console.log('  _headers written');
