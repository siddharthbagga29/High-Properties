# jarvis/core contract (function signatures)

Types live in `types.ts`. Each module exports exactly what is listed here (more is fine). Pure functions take `now: Date` or an ISO string instead of reading the clock, so tests are deterministic. `index.ts` re-exports everything.

## tasks.ts
- `createTask(p: Pick<JarvisTask,'title'|'source'> & Partial<JarvisTask>, now: Date, id?: string): JarvisTask` (status `queued`, priority `normal` by default)
- `ALLOWED: Record<TaskStatus, TaskStatus[]>`; `transition(t: JarvisTask, to: TaskStatus, now: Date, note?: string): JarvisTask` (returns a new task; throws `Error('invalid transition queued->completed')` on an illegal move; `completed` requires `verifiedBy` to be set on the input or passed via `opts`). Signature: `transition(t, to, now, note?, opts?: { verifiedBy?: string; requiredUserInput?: string; error?: string; result?: unknown })`
- `addAction(t: JarvisTask, a: Omit<TaskAction,'at'>, now: Date): JarvisTask`
- `summarize(tasks: JarvisTask[]): { completed: number; running: number; waiting: number; blocked: number; failed: number; queued: number; sentence: string }` where `sentence` reads like "Three things are complete, one is running, and I need your decision on one item." (number words up to twelve, correct singular/plural, omits zero clauses, "Nothing is in progress." when empty)

## policy.ts
- `DEFAULT_POLICY: Policy` (safe→0, low→1, medium→2, high→3, critical→3; visitorRisk ['safe'])
- `decide(tool: Pick<JarvisTool,'id'|'riskLevel'|'requiresConfirmation'|'scope'>, viewer: Viewer, policy?: Policy): PolicyDecision`
  Rules: denied ids → not allowed. Visitor: only scope 'public' and risk in visitorRisk, never confirmation-gated. Owner: level 0/1 auto unless `requiresConfirmation`; level 2 needs confirmation unless pre-approved; level 3 always needs confirmation (pre-approval ignored).

## audit.ts
- `redact(text: string): string` masks API keys (sk-…, sk-ant-…, AKIA…, ghp_…, xox…), bearer tokens, JWTs, private keys, password=… pairs and long hex/base64 secrets.
- `summarizeInput(input: unknown, max = 160): string` (redacted, truncated JSON)
- `createAuditLog(sink?: (e: AuditEntry) => void): { append(e: AuditEntry): void; entries(): AuditEntry[] }` (redacts summaries before storing; keeps the last 500 in memory)

## tools.ts
- `validate(schema: JSONSchema, input: unknown): string | null` (error message or null)
- `createRegistry(opts: { policy?: Policy; audit?: ReturnType<typeof createAuditLog>; now?: () => Date; actor?: AuditEntry['actor'] }): Registry`
- `Registry = { register(t: JarvisTool): void; get(id): JarvisTool | undefined; list(viewer: Viewer): JarvisTool[]; run(id: string, input: unknown, ctx: Partial<ToolCtx> & { viewer: Viewer }): Promise<ToolResult & { decision: PolicyDecision['level'] | 'denied' | 'needs_confirmation' }> }`
  `run`: unknown tool → ok:false; schema error → ok:false; policy denies → ok:false (audited 'denied'); needs confirmation and not `ctx.confirmed` → ok:false, `needs_confirmation`; else execute with timeout (default 15 s), retries with exponential backoff (base 250 ms) only for risk safe/low; circuit breaker opens after 3 consecutive failures of one tool for 60 s; every outcome audited.

## injection.ts
- `label(text: string, trust: Trust, source?: string): Content`
- `wrapUntrusted(c: Content): string` → a fenced block: `<<EXTERNAL source=… trust=…>> … <<END>>` with any fence-like sequences in the text neutralised
- `looksLikeInstruction(text: string): boolean` (e.g. "ignore previous instructions", "run this command", "you are now", "system prompt")
- `assemble(parts: Content[]): ChatMessage[]` → one system message (system + application), the user turn last; memory/tool/external content inside wrapped blocks with a standing rule that wrapped content is data. Sorts by TRUST_ORDER.

## memory.ts
- `createMemoryStore(initial?: MemoryItem[]): MemoryStore` (in-memory)
- `remember(store, kind: MemoryKind, text: string, now: Date, extra?: Partial<MemoryItem>): Promise<MemoryItem>` (redacts secrets; refuses text that still looks like a credential)
- `recall(store, query: string, k = 5, kinds?: MemoryKind[]): Promise<MemoryItem[]>` (keyword overlap with simple stemming and recency tie-break)

## intent.ts
- `parseIntent(text: string): Intent` deterministic, case-insensitive, covers phrasings such as "what's done", "where are we", "what are you working on", "what's next", "what do you need from me", "what changed since I last checked", "remind me …", "yes do it", "continue the next task", "open V09", "show me Ada", "explain this", "how are the agents doing", "any hallucinations", "I decide …", "stop", else 'chat' with confidence < 0.5.

## reminders.ts
- `parseReminder(text: string, now: Date): { text: string; dueAt: string } | null` handles "in 20 minutes / 2 hours / 3 days", "tomorrow at 9", "at 5pm", "tonight", "on Friday at 10am", "next Monday", ISO dates. Times are local to the provided `now`'s timezone offset parameter `tzOffsetMinutes` (optional third argument, default 0 = UTC).
- `due(reminders: Reminder[], now: Date): Reminder[]` (pending or scheduled and dueAt ≤ now)
- `createReminder(text: string, dueAt: string, now: Date, id?: string): Reminder` (channels default ['page','speech','push'])

## briefing.ts
- `sinceLast(events: Array<{ t: string; title: string; kind: string }>, lastVisitIso: string | null, now: Date): { items: Array<{t:string;title:string;kind:string}>; sentence: string }`
- `briefing(ctx: JarvisContext, opts: { greetingHour: number; since?: ReturnType<typeof sinceLast> }): { greeting: string; lines: string[]; needsYou: StatusItem[]; next: StatusItem[]; spoken: string }` — every number comes from `ctx.projectState` / `ctx.currentTasks`; never invents.

## proactive.ts
- `DEFAULT_INTERVENTION: InterventionConfig` (threshold 1, cooldown 180 s, maxDismissals 2)
- `interventionScore(s: Signals): number` = relevance + confusion + repeated (min(1, repeats/4)) + dwell (min(1, dwell/45)) + navigationUncertainty − cooldownPenalty − annoyancePenalty
- `shouldIntervene(s: Signals, cfg?: InterventionConfig): { intervene: boolean; score: number; reason: string }` (never when dismissals ≥ max or inside the cooldown)

## providers.ts and router.ts
- `ruleProvider(answer: (q: string) => string): LLMProvider` (local, always available)
- `sampleProvider(sample: unknown /* the artifact sample fn */): LLMProvider`
- `ollamaProvider(opts: { host?: string; model: string; fetch?: typeof fetch }): LLMProvider` (POST /api/chat, stream false)
- `anthropicProvider(opts: { apiKey: string; model: string; fetch?: typeof fetch }): LLMProvider` (Messages API, header anthropic-version 2023-06-01)
- `claudeCodeProvider(opts: { run: (args: string[], stdin: string) => Promise<{ code: number; stdout: string }> }): LLMProvider` (spawns `claude -p --output-format json`; the runner is injected so core stays Node-free)
- `withFallback(providers: LLMProvider[]): LLMProvider` (first available that succeeds)
- `DEFAULT_ROUTES: RouteTable` and `route(kind: RouteKind, providers: LLMProvider[], table?: RouteTable): LLMProvider` (sensitive prefers local providers; falls back to rules)

## body.ts
- `partState(spec: BodyPartSpec, statusOf: (taskId: string) => string | undefined): BodyPartState` (done counts 'done'; prepared counts 'awaiting_human'; fill = (done + 0.6·prepared) / total)
- `faceState(entries: RevenueEntry[], opts?: { requireSigned?: boolean }): FaceState` (only entries with recordedBy 'founder', amountUsd > 0 and non-empty evidence count; by default (`requireSigned` unless explicitly false) only entries whose `sigVerified` is true (computed by the export from the pinned key and the signature log, never the stored `auth` label), and `excluded` counts the rest and the label says so; stage = min(3, distinct payers); `unsigned` counts the counted entries not signed with the founder's key and the label says so; label explains what remains, e.g. "No verified revenue yet: the face stays unformed.")

## adapters/perspective-engine.ts
- `PE_BODY: BodyPartSpec[]` (the map in docs/JARVIS_ARCHITECTURE.md §9)
- Minimal `PEState` type (subset of the city's GraphState: generated, project, north_star, agents, nodes{id,title,agent,phase,status,view,gate,accept,outputs}, ledger{t,event,node,note}, activity?, audit?, revenue?)
- `peProjectState(s: PEState, now: Date): ProjectState`
- `peContext(s: PEState, viewer: Viewer, extras?: Partial<JarvisContext>): JarvisContext`
- `peBody(s: PEState): { parts: BodyPartState[]; face: FaceState; overall: number }` (always requires verified signatures: with no founder key registered the face stays unformed)
- `peEvents(s: PEState): Array<{ t: string; title: string; kind: string }>` (ledger events in plain words, for briefings)
