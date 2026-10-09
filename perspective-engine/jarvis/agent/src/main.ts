/**
 * Entry point: `npm run jarvis` (start), `npm run jarvis -- stop`, `npm run jarvis -- token`, `npm run jarvis -- doctor`.
 * The token is never printed on start; `token` prints it only when you ask.
 */
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createApp } from './app'
import { loadOrCreateToken } from './auth'
import { ensureHome, jarvisHome, LOOPBACK, loadConfig, paths, PE_REPO_DIR } from './config'
import { whichSync } from './exec'
import { buildProviders } from './models'
import { rulesAnswer } from './ask'
import { loadPEState } from './briefing'
import { startServer } from './server'

const log = (line: string) => process.stdout.write(`[jarvis ${new Date().toISOString()}] ${line}\n`)

async function start(): Promise<void> {
  const requestedHost = process.env.JARVIS_HOST?.trim()
  if (requestedHost && requestedHost !== LOOPBACK) throw new Error(`JARVIS_HOST=${requestedHost} refused: the agent listens on ${LOOPBACK} only`)
  const home = jarvisHome()
  ensureHome(home)
  const p = paths(home)
  const config = loadConfig(home)
  const token = loadOrCreateToken(p.token)
  const app = createApp({ home, config })
  const running = await startServer({ app, token: token.token, port: config.port, log })
  writeFileSync(p.pid, `${process.pid}\n`, { mode: 0o600 })
  app.scheduler.start()
  void app.scheduler.tick().catch(() => undefined)

  const report = (await app.models().catch(() => null))?.report
  log(`console: ${running.url}/  (open it in Chrome or Safari on this Mac)`)
  log(token.source === 'env' ? 'token: from JARVIS_TOKEN' : `token: in ${p.token}${token.source === 'created' ? ' (created now)' : ''}; copy it with: npm run jarvis -- token | pbcopy`)
  log(`project record: ${config.peStatePath}`)
  if (report) log(`models: ${report.order.join(' -> ')}. ${report.ollama.note}`)
  if (process.platform !== 'darwin') log(`note: this is ${process.platform}; notify, say and open.url need macOS and will report that.`)

  let stopping = false
  const stop = async (signal: string) => {
    if (stopping) return
    stopping = true
    log(`${signal}: stopping`)
    await app.close()
    await running.close()
    try {
      if (readFileSync(p.pid, 'utf8').trim() === String(process.pid)) unlinkSync(p.pid)
    } catch {
      // already gone
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void stop('SIGINT'))
  process.on('SIGTERM', () => void stop('SIGTERM'))
}

function stopRunning(): void {
  const p = paths(jarvisHome())
  if (!existsSync(p.pid)) {
    console.log('No running agent found (no pid file).')
    return
  }
  const pid = Number(readFileSync(p.pid, 'utf8').trim())
  if (!Number.isInteger(pid) || pid <= 1) {
    console.log('The pid file is not valid; remove it by hand if no agent is running.')
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
    console.log(`Sent SIGTERM to the agent (pid ${pid}).`)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ESRCH') {
      unlinkSync(p.pid)
      console.log('The agent was not running; removed a stale pid file.')
    } else throw e
  }
}

function printToken(): void {
  const home = jarvisHome()
  ensureHome(home)
  process.stdout.write(`${loadOrCreateToken(paths(home).token).token}\n`)
}

async function doctor(): Promise<void> {
  const home = jarvisHome()
  ensureHome(home)
  const p = paths(home)
  const config = loadConfig(home)
  const lines: Array<[string, boolean | null, string]> = []
  const major = Number(process.versions.node.split('.')[0])
  lines.push(['Node 20 or newer', major >= 20, process.versions.node])
  lines.push(['macOS (notify, say, open.url)', process.platform === 'darwin', process.platform])
  lines.push(['~/.jarvis is private (0700)', (statSync(home).mode & 0o077) === 0, home])
  if (existsSync(p.token)) lines.push(['token file is 0600', (statSync(p.token).mode & 0o077) === 0, p.token])
  else lines.push(['token file', null, 'created on first start'])
  const pe = loadPEState(config.peStatePath)
  lines.push(['project record readable', pe.ok, pe.ok ? `${config.peStatePath} (generated ${pe.generated ?? 'unknown'})` : `${config.peStatePath}: ${pe.error}`])
  const { report } = await buildProviders(config.models, { cwd: PE_REPO_DIR, rules: rulesAnswer })
  lines.push(['Ollama', report.ollama.running && Boolean(report.ollama.chosen), report.ollama.note])
  lines.push([`recommended local model (${report.recommendation.reason})`, null, report.recommendation.suggestions.join(' or ')])
  lines.push(['Anthropic API key', report.anthropic.configured, report.anthropic.configured ? `model ${report.anthropic.model}` : 'ANTHROPIC_API_KEY not set (optional)'])
  lines.push(['claude CLI', Boolean(report.claudeCode.path), report.claudeCode.path ?? 'not on PATH (optional)'])
  let playwright = false
  try {
    const specifier = 'playwright-core'
    await import(specifier)
    playwright = true
  } catch {
    playwright = false
  }
  lines.push(['playwright-core (browser tools)', playwright, playwright ? 'installed; run `npx playwright-core install chromium` once if the browser is missing' : 'not installed (optional)'])
  lines.push(['say', whichSync('say') !== null, whichSync('say') ?? 'not found'])
  lines.push(['osascript', whichSync('osascript') !== null, whichSync('osascript') ?? 'not found'])
  for (const [what, ok, detail] of lines) console.log(`${ok === null ? ' - ' : ok ? 'ok ' : 'NO '} ${what}: ${detail}`)
}

const command = process.argv[2] ?? 'start'
const run = { start, stop: async () => stopRunning(), token: async () => printToken(), doctor }[command]
if (!run) {
  console.error(`unknown command ${command}; use start, stop, token or doctor`)
  process.exit(2)
}
run().catch(e => {
  console.error(`jarvis: ${(e as Error).message}`)
  process.exit(1)
})
