export type Status = 'pending' | 'ready' | 'running' | 'done' | 'blocked' | 'awaiting_human'

export interface Gate { type: string; reason: string; cleared?: string }
export interface Run { used_k: number; duration_s: number | null; tools: number }

export interface TaskNode {
  id: string
  phase: number
  agent: string
  title: string
  deps: string[]
  outputs: string[]
  accept: string[]
  gate: Gate | null
  budget_k: number
  status: Status
  view: Status
  run?: Run
}

export interface Agent { name: string; district: string; role: string }
export interface LedgerEvent { t: string; event: string; node: string; note: string }

export interface GraphState {
  generated: string
  project: string
  north_star: string
  agents: Record<string, Agent>
  nodes: TaskNode[]
  ledger: LedgerEvent[]
  excerpts: Record<string, string | null>
}

/** The one normalized record shape every level-4 atom is expressed in. */
export interface AtomRecord {
  id: string
  level4Type: 'ledger' | 'criterion' | 'output' | 'input' | 'gate'
  parentIds: [string, string, string]
  timestamp: number | null
  value: number | null
  category: string
  status: 'met' | 'open' | 'event' | 'waiting'
  meta: { label: string; detail?: string; source?: string }
}

export type FocusKind = 'venture' | 'city' | 'agent' | 'task'
