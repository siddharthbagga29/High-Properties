import { withFallback } from './providers'
import type { LLMProvider, RouteKind, RouteTable } from './types'

/** Ordered provider ids per kind of work. 'rules' is always the floor. */
export const DEFAULT_ROUTES: RouteTable = {
  classify: ['ollama-small', 'rules'],
  conversation: ['ollama', 'sample', 'anthropic', 'rules'],
  tool_planning: ['ollama', 'anthropic', 'claude-code', 'rules'],
  research: ['anthropic', 'claude-code', 'sample', 'ollama', 'rules'],
  sensitive: ['ollama', 'ollama-small', 'rules'],
}

/** The fallback chain for one kind of work, built from the providers this client actually has. */
export function route(kind: RouteKind, providers: LLMProvider[], table: RouteTable = DEFAULT_ROUTES): LLMProvider {
  const ids = table[kind] ?? DEFAULT_ROUTES[kind] ?? DEFAULT_ROUTES.conversation
  const chain: LLMProvider[] = []
  for (const id of ids) {
    const p = providers.find(x => x.id === id)
    if (p && !chain.includes(p)) chain.push(p)
  }
  const rules = providers.find(p => p.id === 'rules')
  if (rules && !chain.includes(rules)) chain.push(rules)
  // Enforced here, not only in the table: a misconfigured table must never send sensitive text off the device.
  const allowed = kind === 'sensitive' ? chain.filter(p => p.local) : chain
  if (!allowed.length) throw new Error(`no provider available for ${kind}`)
  return withFallback(allowed, `route:${kind}`)
}
