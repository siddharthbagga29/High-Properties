/* Inline the model output and the evidence ledger into a single self-contained
   page. No CDN, no external asset, no build-time network access. */
const fs = require('fs');
const path = require('path');
const D = __dirname;

let html = fs.readFileSync(path.join(D, 'src.html'), 'utf8');
const mc = fs.readFileSync(path.join(D, 'mc_v2.json'), 'utf8');
const ev = fs.readFileSync(path.join(D, 'evidence.json'), 'utf8');

// A literal </script> anywhere inside inlined JSON would terminate the tag early.
const safe = s => s.replace(/<\/script/gi, '<\\/script');

html = html.replace('/*__MCDATA__*/null', safe(mc));
html = html.replace('/*__EVIDENCE__*/null', safe(ev));

if (html.includes('__MCDATA__') || html.includes('__EVIDENCE__')) {
  console.error('FATAL: placeholder not substituted'); process.exit(1);
}
const stray = html.slice(html.indexOf('<body')).match(/<\/script/gi) || [];
const opens = html.slice(html.indexOf('<body')).match(/<script/gi) || [];
if (stray.length !== opens.length) {
  console.error(`FATAL: script tag imbalance ${opens.length} open / ${stray.length} close`);
  process.exit(1);
}

const out = path.join(D, 'sentinel-dossier.html');
fs.writeFileSync(out, html);
console.log(`built ${out} — ${(html.length / 1024).toFixed(0)} KB`);
