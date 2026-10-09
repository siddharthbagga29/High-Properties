/**
 * Path checks for the file tools. A path is resolved against the first root, every symlink is resolved with
 * realpath (for a file that does not exist yet, the nearest existing parent is resolved), and only then is the
 * real path compared with the real roots. `..`, absolute paths and symlinks that lead outside are all refused.
 * Secret-bearing files are refused even inside a root.
 */
import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { expandHome } from './config'

export class PathRefused extends Error {
  readonly code = 'path_refused'
}

/** Files that hold secrets or would let a write escalate. Matched on every segment of the real path. */
const SECRET_NAMES = [
  /^\.env(\..+)?$/i, // .env, .env.local … (but see the .env.example exception)
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /\.(pem|key|p12|pfx|keychain|keychain-db|kdbx)$/i,
  /^\.(npmrc|netrc|pypirc|git-credentials)$/i,
  /^credentials(\.json)?$/i,
]
const SECRET_DIRS = new Set(['.ssh', '.aws', '.gnupg', '.config/gcloud', '.docker', '.kube', '.jarvis'])
const ENV_EXAMPLE = /^\.env\.example$/i

/** Directories the file tools never enter: version-control internals are reached through `git` commands instead. */
const HIDDEN_INTERNALS = new Set(['.git'])

function within(child: string, root: string): boolean {
  const rel = relative(root, child)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

function realRoots(roots: string[]): string[] {
  const out: string[] = []
  for (const r of roots) {
    try {
      out.push(realpathSync(r))
    } catch {
      // a configured root that does not exist simply grants nothing
    }
  }
  return out
}

/** realpath of the path, or of its nearest existing ancestor with the missing remainder appended. */
function realOrNearest(abs: string): string {
  let probe = abs
  const missing: string[] = []
  while (!existsSync(probe)) {
    const parent = dirname(probe)
    if (parent === probe) break
    missing.unshift(basename(probe))
    probe = parent
  }
  return join(realpathSync(probe), ...missing)
}

export function secretReason(realPath: string, root: string): string | null {
  const rel = relative(root, realPath)
  const segments = rel.split(sep).filter(Boolean)
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (SECRET_DIRS.has(seg) || SECRET_DIRS.has(segments.slice(i, i + 2).join('/'))) return `${seg} holds credentials`
    if (HIDDEN_INTERNALS.has(seg)) return `${seg} internals are not exposed to file tools (use the git commands)`
    if (!ENV_EXAMPLE.test(seg) && SECRET_NAMES.some(p => p.test(seg))) return `${seg} may contain secrets`
  }
  return null
}

export interface ResolvedPath { real: string; root: string; relative: string }

/**
 * Resolves `input` and proves it is inside one of `roots`. Throws PathRefused otherwise.
 * `mustExist: false` is for writes of new files; the parent chain is still resolved through symlinks.
 */
export function resolveInside(input: unknown, roots: string[], opts: { mustExist: boolean; base?: string } = { mustExist: true }): ResolvedPath {
  if (typeof input !== 'string' || !input.trim()) throw new PathRefused('a path is required')
  if (input.includes('\0')) throw new PathRefused('path contains a NUL byte')
  const real = realRoots(roots)
  if (!real.length) throw new PathRefused('no allowed roots are configured')
  const base = opts.base ?? real[0]
  const abs = resolve(base, expandHome(input.trim()))

  let target: string
  try {
    target = opts.mustExist ? realpathSync(abs) : realOrNearest(abs)
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new PathRefused(`${input} does not exist`)
    if (code === 'ELOOP') throw new PathRefused(`${input} is a symlink loop`)
    throw new PathRefused(`${input} cannot be resolved (${code ?? 'error'})`)
  }
  const root = real.find(r => within(target, r))
  if (!root) throw new PathRefused(`${input} is outside the allowed folders`)
  const secret = secretReason(target, root)
  if (secret) throw new PathRefused(`${input} is refused: ${secret}`)
  return { real: target, root, relative: relative(root, target) || '.' }
}
