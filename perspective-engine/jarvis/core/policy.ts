import type { AutonomyLevel, JarvisTool, Policy, PolicyDecision, RiskLevel, Viewer } from './types'

export const RISK_LEVELS: RiskLevel[] = ['safe', 'low', 'medium', 'high', 'critical']

export const DEFAULT_POLICY: Policy = {
  levels: { safe: 0, low: 1, medium: 2, high: 3, critical: 3 },
  preApproved: [],
  denied: [],
  visitorRisk: ['safe'],
}

/**
 * Levels no configuration can lower. A typo in a policy must never make a high-risk tool automatic
 * or a critical one pre-approvable.
 */
const LEVEL_FLOOR: Record<RiskLevel, AutonomyLevel> = { safe: 0, low: 0, medium: 0, high: 2, critical: 3 }

export type PolicyTool = Pick<JarvisTool, 'id' | 'riskLevel' | 'requiresConfirmation' | 'scope'>

export function autonomyLevel(risk: RiskLevel, policy: Policy = DEFAULT_POLICY): AutonomyLevel {
  if (!RISK_LEVELS.includes(risk)) return 3 // unknown risk: fail closed
  const configured = policy.levels?.[risk]
  const level = isLevel(configured) ? configured : DEFAULT_POLICY.levels[risk]
  return Math.max(level, LEVEL_FLOOR[risk]) as AutonomyLevel
}

export function decide(tool: PolicyTool, viewer: Viewer, policy: Policy = DEFAULT_POLICY): PolicyDecision {
  const level = autonomyLevel(tool.riskLevel, policy)
  if (policy.denied?.includes(tool.id)) return deny(level, `${tool.id} is on the denied list`)
  // Anything that is not exactly 'owner' is treated as a visitor, so a malformed viewer value fails closed.
  if (viewer !== 'owner') return decideForVisitor(tool, level, policy)
  if (level === 3) return confirm(level, 'level 3: always needs your explicit confirmation; it cannot be pre-approved')
  if (tool.requiresConfirmation) return confirm(level, `${tool.id} always asks before it runs`)
  if (level === 2) {
    return policy.preApproved?.includes(tool.id) ? allow(level, 'level 2, pre-approved by you') : confirm(level, 'level 2: needs your confirmation')
  }
  return allow(level, level === 0 ? 'level 0: automatic' : 'level 1: automatic within scope')
}

function decideForVisitor(tool: PolicyTool, level: AutonomyLevel, policy: Policy): PolicyDecision {
  if (tool.scope !== 'public') return deny(level, 'visitors cannot use owner tools')
  // Hard ceiling at 'safe' whatever visitorRisk says: a misconfigured policy must not open riskier tools to the public.
  if (tool.riskLevel !== 'safe' || !policy.visitorRisk?.includes('safe')) return deny(level, 'visitors may only use safe tools')
  // A visitor cannot confirm anything, so a tool that would ask is simply unavailable to them.
  if (tool.requiresConfirmation || level >= 2) return deny(level, 'visitors cannot confirm actions')
  return allow(level, 'safe public tool')
}

function isLevel(x: unknown): x is AutonomyLevel {
  return x === 0 || x === 1 || x === 2 || x === 3
}

const allow = (level: AutonomyLevel, reason: string): PolicyDecision => ({ allowed: true, needsConfirmation: false, level, reason })
const confirm = (level: AutonomyLevel, reason: string): PolicyDecision => ({ allowed: true, needsConfirmation: true, level, reason })
const deny = (level: AutonomyLevel, reason: string): PolicyDecision => ({ allowed: false, needsConfirmation: false, level, reason })
