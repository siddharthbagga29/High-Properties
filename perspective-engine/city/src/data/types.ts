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

/** One real, timestamped step an agent took: a search, a file read or written, a check, a handoff. */
export interface ActivityEvent {
  t: string
  node: string
  agent: string
  kind: 'plan' | 'read' | 'search' | 'fetch' | 'write' | 'edit' | 'run' | 'check' | 'note' | 'blocked' | 'handoff'
  text: string
  /** transcript = extracted from the agent's tool calls; self = logged by the agent while working; ledger = a state change */
  src: 'transcript' | 'self' | 'ledger'
  /** Who took the step. Absent means the owning agent; 'verifier' is the independent checker. */
  actor?: 'agent' | 'verifier'
  /** The tool call a transcript row came from (transcript + tool_use id): one call credited to several tasks shares it. */
  call?: string
  /** How the call named this task: 'check' it logged the task's verifier check through graph.py (marked in every
   * ingested transcript: the auditor's separation evidence); 'id' it named the task's ID, or 'path' only one of its
   * output paths (set when the row was credited from a transcript that covered several tasks). */
  related?: 'check' | 'id' | 'path'
}

/** Each task's replayed state at the point where the export had to cut the ledger (graph.py ledger_base). */
export interface LedgerBase {
  /** Time of the last event before the cut: the replay cannot go earlier. */
  t: string
  /** Ledger events before the cut, not in this export. */
  events: number
  status: Record<string, Status>
  /** Tasks whose founder gate was cleared at the cut. */
  cleared: string[]
}

export interface GraphState {
  generated: string
  project: string
  north_star: string
  agents: Record<string, Agent>
  nodes: TaskNode[]
  ledger: LedgerEvent[]
  /** Present only when the export had to cut the ledger to fit its size cap: the replay starts from it. */
  ledgerBase?: LedgerBase
  excerpts: Record<string, string | null>
  activity?: Record<string, ActivityEvent[]>
}

/** The one normalized record shape every level-4 atom is expressed in. */
export interface AtomRecord {
  id: string
  level4Type: 'ledger' | 'criterion' | 'output' | 'input' | 'gate'
  parentIds: [string, string, string]
  timestamp: number | null
  value: number | null
  category: string
  status: 'met' | 'prepared' | 'open' | 'event' | 'waiting'
  meta: { label: string; detail?: string; source?: string }
}

