/**
 * shell.run: a fixed allowlist of programs and argument patterns, executed without a shell. Anything not on the
 * list is refused before a process starts. Adding a command means adding a rule here (and a test), never a string.
 */
import { statSync } from 'node:fs'
import type { JarvisTool } from '../../../core/index'
import { childEnv, runProcess, type Runner } from '../exec'
import { PathRefused, resolveInside } from '../fsguard'

export interface CommandRule {
  id: string
  program: string
  /** Arguments that must come first, exactly. */
  fixed: string[]
  /** Extra arguments allowed after `fixed`, each matching this pattern. */
  flags?: RegExp
  /** Revision arguments allowed (git): HEAD, HEAD~2, a commit hash, or a range of those. */
  revisions?: boolean
  /** Non-flag arguments are paths that must resolve inside the read roots. */
  paths?: boolean
  /** Put '--' before the paths (git), so a path can never be read as an option. */
  dashDashBeforePaths?: boolean
  /** Arguments the agent always adds (after `fixed` for git subcommands, before for global options). */
  prefix?: string[]
  suffix?: string[]
  /** Run in this directory regardless of the requested cwd. */
  cwd?: 'pe-repo'
  maxExtraArgs?: number
  timeoutMs?: number
}

const REV = /^(HEAD(~\d{1,3}|\^{1,3})?|[0-9a-f]{7,40})((\.\.\.?)(HEAD(~\d{1,3}|\^{1,3})?|[0-9a-f]{7,40}))?$/
const SAFE_PATH = /^(?!-)[A-Za-z0-9._/@+ -]{1,240}$/

export const COMMAND_RULES: CommandRule[] = [
  { id: 'npm-test', program: 'npm', fixed: ['test'], timeoutMs: 300_000 },
  { id: 'npm-build', program: 'npm', fixed: ['run', 'build'], timeoutMs: 300_000 },
  { id: 'npm-typecheck', program: 'npm', fixed: ['run', 'typecheck'], timeoutMs: 300_000 },
  {
    id: 'git-status',
    program: 'git',
    prefix: ['--no-pager', '-c', 'color.ui=false'],
    fixed: ['status'],
    flags: /^(--short|-s|--branch|-b|--porcelain(=v[12])?|--untracked-files=(no|normal|all)|--ignored)$/,
    paths: true,
    dashDashBeforePaths: true,
  },
  {
    id: 'git-log',
    program: 'git',
    prefix: ['--no-pager', '-c', 'color.ui=false'],
    fixed: ['log'],
    flags: /^(--oneline|--stat|--shortstat|--name-only|--name-status|--graph|--decorate|--no-merges|-n\d{1,4}|-\d{1,4}|--max-count=\d{1,4}|--since=[\w:.-]{1,32}|--until=[\w:.-]{1,32}|--author=[\w .@+-]{1,64}|--grep=[\w .@+:#-]{1,64}|--format=(oneline|short|medium|full|fuller|reference)|--pretty=(oneline|short|medium|full|fuller|reference))$/,
    revisions: true,
    paths: true,
    dashDashBeforePaths: true,
  },
  {
    id: 'git-diff',
    program: 'git',
    prefix: ['--no-pager', '-c', 'color.ui=false'],
    fixed: ['diff'],
    flags: /^(--stat|--shortstat|--numstat|--name-only|--name-status|--cached|--staged|-U\d{1,2}|--unified=\d{1,2}|--ignore-all-space|-w)$/,
    // External diff drivers and textconv filters could run programs from repository config: always off.
    suffix: ['--no-ext-diff', '--no-textconv'],
    revisions: true,
    paths: true,
    dashDashBeforePaths: true,
  },
  ...(['status', 'ready', 'human', 'export'] as const).map(
    (sub): CommandRule => ({ id: `graph-${sub}`, program: 'python3', fixed: ['tools/graph.py', sub], cwd: 'pe-repo', maxExtraArgs: 0, timeoutMs: 60_000 }),
  ),
  { id: 'ls', program: 'ls', fixed: [], flags: /^-[alhAR1tSrF]{1,8}$/, paths: true },
]

export type CommandCheck =
  | { ok: true; rule: CommandRule; argv: string[]; paths: string[] }
  | { ok: false; reason: string }

/**
 * Pure allowlist check. Returns the argv to execute (with the rule's forced options) or the reason for refusal.
 * Path arguments are returned separately so the caller can prove they are inside the roots.
 */
export function checkCommand(program: unknown, args: unknown, rules: CommandRule[] = COMMAND_RULES): CommandCheck {
  if (typeof program !== 'string' || !/^[a-z0-9]+$/.test(program)) return { ok: false, reason: 'program must be a bare name such as npm, git, python3 or ls' }
  if (!Array.isArray(args) || !args.every(a => typeof a === 'string')) return { ok: false, reason: 'args must be an array of strings' }
  const list = args as string[]
  if (list.length > 24) return { ok: false, reason: 'too many arguments' }
  for (const a of list) {
    if (a.length > 240) return { ok: false, reason: 'an argument is too long' }
    // Control characters (newlines included) have no place in any allowed command.
    if (/[\u0000-\u001f\u007f]/.test(a)) return { ok: false, reason: 'arguments may not contain control characters' }
  }
  const candidates = rules.filter(r => r.program === program)
  if (!candidates.length) return { ok: false, reason: `${program} is not an allowed program` }

  let lastReason = `${program} ${list.join(' ')} is not on the allowlist`
  for (const rule of candidates) {
    if (rule.fixed.length > list.length || !rule.fixed.every((f, i) => list[i] === f)) continue
    const extra = list.slice(rule.fixed.length)
    if (rule.maxExtraArgs !== undefined && extra.length > rule.maxExtraArgs) {
      lastReason = `${rule.id} takes no further arguments`
      continue
    }
    const flags: string[] = []
    const revisions: string[] = []
    const paths: string[] = []
    let failure: string | null = null
    let afterDashDash = false
    for (const a of extra) {
      if (a === '--' && rule.paths && !afterDashDash) {
        afterDashDash = true
        continue
      }
      if (!afterDashDash && rule.flags?.test(a)) flags.push(a)
      else if (!afterDashDash && rule.revisions && REV.test(a)) revisions.push(a)
      else if (rule.paths && SAFE_PATH.test(a) && !a.split('/').includes('..')) paths.push(a)
      else {
        failure = `argument "${a}" is not allowed for ${rule.program} ${rule.fixed.join(' ')}`.trim()
        break
      }
    }
    if (failure) {
      lastReason = failure
      continue
    }
    const argv =
      rule.program === 'git'
        ? [...(rule.prefix ?? []), ...rule.fixed, ...flags, ...(rule.suffix ?? []), ...revisions, ...(paths.length && rule.dashDashBeforePaths ? ['--', ...paths] : paths)]
        : [...(rule.prefix ?? []), ...rule.fixed, ...flags, ...(rule.suffix ?? []), ...revisions, ...paths]
    return { ok: true, rule, argv, paths }
  }
  return { ok: false, reason: lastReason }
}

export interface ShellDeps {
  roots: () => string[]
  projectRoots: () => string[]
  peRepoDir: string
  runner?: Runner
}

export function shellTool(deps: ShellDeps): JarvisTool {
  const runner = deps.runner ?? runProcess
  return {
    id: 'shell.run',
    name: 'Run an allowed command',
    description:
      'Run one allowlisted command without a shell: npm test | npm run build | npm run typecheck, git status|log|diff (read-only), ' +
      'python3 tools/graph.py status|ready|human|export, ls. Everything else is refused.',
    schema: {
      type: 'object',
      properties: {
        program: { type: 'string', description: 'npm, git, python3 or ls' },
        args: { type: 'array', description: 'Arguments as separate strings, e.g. ["run", "build"]' },
        cwd: { type: 'string', description: 'Working folder inside a project root (default: the PE repository).' },
      },
      required: ['program'],
    },
    riskLevel: 'low',
    requiresConfirmation: false,
    scope: 'owner',
    timeoutMs: 320_000,
    async execute(input, ctx) {
      const check = checkCommand(input.program, input.args ?? [])
      if (!check.ok) return { ok: false, summary: `Refused: ${check.reason}`, error: 'not_allowed' }
      let cwd: string
      try {
        if (check.rule.cwd === 'pe-repo') {
          if (input.cwd !== undefined) return { ok: false, summary: 'Refused: graph.py always runs in the PE repository; cwd cannot be changed', error: 'not_allowed' }
          cwd = deps.peRepoDir
        } else {
          cwd = resolveInside((input.cwd as string | undefined) ?? deps.peRepoDir, deps.projectRoots(), { mustExist: true }).real
          if (!statSync(cwd).isDirectory()) return { ok: false, summary: 'Refused: cwd is not a folder', error: 'not_allowed' }
        }
        for (const p of check.paths) resolveInside(p, deps.roots(), { mustExist: false, base: cwd })
      } catch (e) {
        if (e instanceof PathRefused) return { ok: false, summary: `Refused: ${e.message}`, error: 'path_refused' }
        throw e
      }
      const env = childEnv(process.env, { GIT_PAGER: 'cat', PAGER: 'cat', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' })
      const started = Date.now()
      let result
      try {
        result = await runner(check.rule.program, check.argv, { cwd, env, timeoutMs: check.rule.timeoutMs ?? 120_000, signal: ctx.signal })
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code
        return { ok: false, summary: code === 'ENOENT' ? `${check.rule.program} is not installed or not on PATH` : `could not start ${check.rule.program}: ${(e as Error).message}`, error: 'spawn_failed' }
      }
      const command = [check.rule.program, ...check.argv].join(' ')
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      const summary = result.timedOut ? `${command} timed out after ${seconds} s` : `${command} exited with code ${result.code} in ${seconds} s`
      return {
        ok: result.code === 0 && !result.timedOut,
        summary,
        error: result.code === 0 && !result.timedOut ? undefined : result.timedOut ? 'timeout' : 'nonzero_exit',
        data: { command, cwd, code: result.code, stdout: result.stdout, stderr: result.stderr, truncated: result.truncated, trust: 'tool' },
      }
    },
  }
}
