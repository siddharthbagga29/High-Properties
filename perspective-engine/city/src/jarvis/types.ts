/**
 * City-side Jarvis types. The shared contract lives in jarvis/core/types.ts (imported as '@jarvis/types');
 * these are the page's own records: what the owner's private database holds, and what the conversation shows.
 */
import type { Viewer } from '@jarvis/types'
import type { Focus } from '../store'

/** Life of an owner request. The page creates `queued`; only the orchestrator moves it on. */
export type RequestStatus = 'queued' | 'running' | 'completed' | 'waiting_for_user' | 'failed' | 'cancelled'
/** build: work for the agents; decision: apply a founder decision; task: continue a graph task. */
export type RequestKind = 'build' | 'decision' | 'task'

export interface OwnerRequest {
  id: string
  text: string
  status: RequestStatus
  createdAt: string
  kind: RequestKind
  /** Graph task id when the request is about one ("continue the next task"). */
  ref?: string
  /** The decision this request applies (kind 'decision'). */
  decisionId?: string
  updatedAt?: string
  /** One line written by the orchestrator when it finishes. */
  result?: string
  /** What verified a completed request (the orchestrator's check). */
  verifiedBy?: string
  /** Why it waits on the founder or failed. */
  reason?: string
}

export interface Decision {
  id: string
  text: string
  createdAt: string
  /** recorded by the page; applied by the orchestrator. */
  status: 'recorded' | 'applied'
  requestId?: string
  appliedAt?: string
  note?: string
}

/** A page action Jarvis offered and is waiting for "yes, do it" on. */
export interface Proposal {
  tool: string
  input: Record<string, unknown>
  /** What will happen, in words: "queue V05 for the orchestrator". */
  say: string
  at: number
}

export type Via = 'rules' | 'claude' | 'guide' | 'action' | 'system'

/** One answer from the conversation engine. */
export interface Reply {
  text: string
  /** Shorter wording for speech; defaults to `text`. */
  spoken?: string
  via: Via
  /** Where the answer points; the console offers a "Show me" button. */
  dive?: Focus
  /** A page action Jarvis offers to run on "yes, do it". */
  proposal?: Proposal | null
  /** True for "stop": nothing is said back aloud. */
  silent?: boolean
  /** For actions: whether the action ran and was checked. */
  ok?: boolean
}

export interface ThreadMsg {
  id: string
  who: 'you' | 'jarvis'
  text: string
  at: number
  via?: Via
  busy?: boolean
  error?: string
  dive?: Focus
  /** Proactive messages (briefing, reminders, request updates) are tagged so the thread can style them. */
  kind?: 'briefing' | 'reminder' | 'request' | 'offer' | 'notice'
}

export type ConsoleTab = 'brief' | 'talk' | 'agents'
export type { Viewer }
