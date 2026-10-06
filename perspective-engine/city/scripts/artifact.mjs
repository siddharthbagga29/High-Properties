// Turns dist/index.html into a body-only page for hosts that wrap pages in their own document skeleton.
import { readFileSync, writeFileSync } from 'node:fs'
const html = readFileSync('dist/index.html', 'utf8')
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  // inline event handlers may be blocked by a host CSP: use a plain stylesheet link there
  .replace(/<link rel="preload" as="style"[^>]*>\s*/i, '')
  .replace(/<link rel="stylesheet" ([^>]*?) media="print" onload="[^"]*"\s*\/?>/i, '<link rel="stylesheet" $1 />')
  .replace(/<noscript><link[^>]*><\/noscript>\s*/i, '')
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1]
const title = head.match(/<title>[\s\S]*?<\/title>/)[0]
writeFileSync('dist/artifact.html', `${title}\n${head.replace(title, '')}\n${body}\n`)
console.log('wrote dist/artifact.html')
