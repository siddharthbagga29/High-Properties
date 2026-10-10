/**
 * JARVIS core contract. Every module in jarvis/core implements against these types, and every client
 * (the Perspective Engine city, the Mac agent and its console, later the portfolio) uses only these.
 * Framework-free: no DOM, no Node built-ins, no runtime dependencies.
 */

// ---------- risk, autonomy, trust ----------

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical'
/** 0 automatic, 1 automatic within configured scope, 2 confirmation required, 3 always explicit confirmation. */
export type AutonomyLevel = 0 | 1 | 2 | 3
export type Viewer = 'owner' | 'visitor'
/** Precedence, highest first. External content can never override anything above it. */
export type Trust = 'system' | 'user' | 'application' | 'memory' | 'tool' | 'external'
export const TRUST_ORDER: Trust[] = ['system', 'user', 'application', 'memory', 'tool', 'external']

export interface Content { trust: Trust; text: string; source?: string }

// ---------- tasks ----------

export type TaskStatus = 'queued' | 'planning' | 'running' | 'waiting_for_user' | 'blocked' | 'completed' | 'failed' | 'cancelled'
export type Priority = 'low' | 'normal' | 'high' | 'critical'

export interface TaskAction {
  at: string // ISO time
  kind: 'note' | 'tool' | 'status' | 'verify' | 'error' | 'handoff'
  summary: string
  tool?: string
  ok?: boolean
}

export interface JarvisTask {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: Priority
  createdAt: string
  startedAt?: string
  completedAt?: string
  parentTaskId?: string
  /** What Jarvis needs from the owner while status is waiting_for_user. */
  requiredUserInput?: string
  actions: TaskAction[]
  result?: unknown
  error?: string
  /** Where the task lives: Jarvis's own queue, a task-graph node, or a request the owner made. */
  source: 'jarvis' | 'graph' | 'request'
  /** Task-graph node id when source is 'graph' (e.g. "F04"). */
  ref?: string
  /** Completion is claimed only after verification: the check that proved it. */
  verifiedBy?: string
}

// ---------- tools ----------

export interface JSONSchema {
  type: 'object'
  properties: Record<string, { type: 'string' | 'number' | 'boolean' | 'array' | 'object'; description?: string; enum?: string[] }>
  required?: string[]
}

export interface ToolResult { ok: boolean; summary: string; data?: unknown; error?: string }

export interface ToolCtx {
  viewer: Viewer
  taskId?: string
  /** True only when the owner explicitly confirmed this exact call. */
  confirmed?: boolean
  signal?: AbortSignal
  now: () => Date
}

export interface JarvisTool<I = Record<string, unknown>> {
  id: string
  name: string
  description: string
  schema: JSONSchema
  riskLevel: RiskLevel
  /** Force a confirmation even if policy would allow it automatically. */
  requiresConfirmation: boolean
  /** 'public' tools may serve visitors; 'owner' tools never do. */
  scope: 'public' | 'owner'
  timeoutMs?: number
  /** Retries for transient failures (default 0). Never retried when riskLevel is medium or above. */
  retries?: number
  execute(input: I, ctx: ToolCtx): Promise<ToolResult>
}

export interface PolicyDecision {
  allowed: boolean
  needsConfirmation: boolean
  level: AutonomyLevel
  reason: string
}

export interface Policy {
  /** Autonomy level for each risk level. */
  levels: Record<RiskLevel, AutonomyLevel>
  /** Tool ids the owner has pre-approved to run without confirmation (never applies to level 3). */
  preApproved: string[]
  /** Tool ids that are never allowed. */
  denied: string[]
  /** Visitors may use only these risk levels, and only public-scope tools. */
  visitorRisk: RiskLevel[]
}

// ---------- audit ----------

export interface AuditEntry {
  at: string
  actor: 'owner' | 'visitor' | 'jarvis' | 'agent'
  task?: string
  tool: string
  inputSummary: string
  resultSummary: string
  risk: RiskLevel
  decision: 'auto' | 'confirmed' | 'needs_confirmation' | 'denied'
  ok: boolean
  durationMs?: number
}

// ---------- memory ----------

export type MemoryKind = 'working' | 'episodic' | 'project' | 'decision' | 'preference'

export interface MemoryItem {
  id: string
  kind: MemoryKind
  at: string
  text: string
  project?: string
  source?: string
  /** Decisions: why. */
  reason?: string
  tags?: string[]
}

export interface MemoryStore {
  add(item: MemoryItem): Promise<void>
  all(kind?: MemoryKind): Promise<MemoryItem[]>
  remove(id: string): Promise<void>
}

// ---------- reminders ----------

export interface Reminder {
  id: string
  text: string
  dueAt: string
  createdAt: string
  status: 'pending' | 'scheduled' | 'delivered' | 'dismissed'
  channels: Array<'page' | 'speech' | 'push' | 'mac'>
}

// ---------- context ----------

export interface LinkContext { label: string; url: string; kind: 'internal' | 'external' | 'document' }

export interface ArtifactContext {
  id: string
  name: string
  type: string
  description?: string
  url?: string
  relatedArtifacts?: string[]
  documents?: string[]
  tasks?: string[]
  status?: string
}

export interface StatusItem { id: string; title: string; owner?: string; detail?: string; at?: string }

export interface ProjectState {
  completed: StatusItem[]
  in_progress: StatusItem[]
  blocked: StatusItem[]
  waiting_for_user: StatusItem[]
  next: StatusItem[]
  risks: StatusItem[]
}

export interface JarvisContext {
  applicationId: string
  applicationName: string
  environment: 'development' | 'staging' | 'production'
  viewer: Viewer
  currentRoute?: string
  currentArtifact?: ArtifactContext
  currentSection?: string
  relevantLinks?: LinkContext[]
  currentTasks?: JarvisTask[]
  recentActions?: TaskAction[]
  projectState?: ProjectState
  userPreferences?: MemoryItem[]
  availableTools?: Array<Pick<JarvisTool, 'id' | 'name' | 'description' | 'riskLevel'>>
}

export interface ContextProvider { (viewer: Viewer): JarvisContext }

// ---------- intents ----------

export type IntentKind =
  | 'status'        // what has been done / where are we
  | 'working_on'    // what are you working on
  | 'next'          // what's next
  | 'needs_me'      // what do you need from me
  | 'since_last'    // what changed since I last checked
  | 'remind'        // remind me ...
  | 'do_it'         // yes, do it / continue the next task
  | 'navigate'      // open / show / go to <thing>
  | 'explain'       // explain this / what is this
  | 'audit'         // how are the agents doing / any hallucinations
  | 'decide'        // record a founder decision
  | 'stop'          // stop talking / cancel
  | 'chat'          // anything else: goes to a model

export interface Intent { kind: IntentKind; text: string; args: Record<string, string>; confidence: number }

// ---------- models ----------

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface ChatOptions { signal?: AbortSignal; onText?: (text: string) => void; maxTokens?: number; tier?: 'quick' | 'default' | 'complex' }
export interface LLMProvider {
  id: string
  /** Local providers keep data on the device. */
  local: boolean
  available(): Promise<boolean>
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<{ text: string }>
}
export type RouteKind = 'classify' | 'conversation' | 'tool_planning' | 'research' | 'sensitive'
export interface RouteTable { [k: string]: string[] } // RouteKind -> ordered provider ids

// ---------- proactivity ----------

export interface Signals {
  relevance: number          // 0..1 how relevant an offer would be here
  confusion: number          // 0..1 e.g. dead clicks, back-and-forth
  repeatedInteraction: number // count of repeated clicks on one object
  dwellSeconds: number
  navigationUncertainty: number // 0..1
  secondsSinceLastOffer: number
  offersDismissed: number
}
export interface InterventionConfig { threshold: number; cooldownSeconds: number; maxDismissals: number }

// ---------- the evolving body ----------

export interface BodyPartSpec { id: string; label: string; builtBy: string; tasks: string[] }
export interface BodyPartState extends BodyPartSpec { done: number; prepared: number; total: number; fill: number }
/**
 * auth: 'signed' or 'attested' as recorded (a label anyone could write). sigVerified: computed by the export from
 * the founder's pinned key and the signature log, never trusted from the file. Only sigVerified entries count once a key exists.
 */
export interface RevenueEntry { t: string; amountUsd: number; payer: string; evidence: string; recordedBy: 'founder'; auth?: 'signed' | 'attested'; authRef?: string; sigVerified?: boolean }
/** unsigned: counted entries recorded on trust. excluded: entries left out because a key exists and their signature did not verify. */
export interface FaceState { stage: 0 | 1 | 2 | 3; payers: number; totalUsd: number; label: string; verifiedEntries: number; unsigned?: number; excluded?: number }

// ---------- audit scorecards (Jarvis as second line) ----------

export interface ScoreDimension { id: string; label: string; weight: number; score: number; basis: string }
export interface AuditFinding { id: string; agent: string; task?: string; severity: 'critical' | 'major' | 'minor'; kind: 'hallucination' | 'unsupported_claim' | 'incomplete' | 'error' | 'process'; claim: string; evidence: string; status: 'open' | 'fixed' | 'accepted' }
export interface Scorecard { agent: string; name: string; score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F'; meetsInstitutionalBar: boolean; dimensions: ScoreDimension[]; findings: AuditFinding[]; computedAt: string }
