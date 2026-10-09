import type { Intent, IntentKind } from './types'

interface Rule { kind: IntentKind; confidence: number; patterns: RegExp[]; args?: (text: string, m: RegExpMatchArray) => Record<string, string> }

const WAKE = /^(?:(?:hey|hi|hello|ok|okay|yo)\s+)?jarvis\b[\s,:;!.-]*/i
const POLITE_TAIL = /[\s,]*(?:please|thanks|thank you|jarvis)$/i

/** Task-graph style ids such as F04, V09, D01, M05. */
const TASK_ID = /\b([a-z]\d{2,3})\b/i

const STOP: Rule = {
  kind: 'stop',
  confidence: 0.95,
  patterns: [
    /^(stop|cancel|quiet|silence|hush|enough|pause|nevermind|never mind|forget it|shut up|be quiet|that'?s enough|no|nope|don'?t|abort)(\s+(it|that|this|talking|speaking|now|please|for now))*$/,
    /\b(stop|quit) (talking|speaking|reading)\b/,
    /^(no|nope),?\s+(don'?t|stop|cancel)\b/,
    /^cancel (that|this|it|the (reminder|request|task))\b/,
  ],
}

const REMIND: Rule = {
  kind: 'remind',
  confidence: 0.95,
  patterns: [
    /^(?:(?:can|could|would|will) you\s+)?(?:please\s+)?remind me\b(.*)$/,
    /^(?:please\s+)?set (?:a |an )?(?:reminder|alarm)\b(.*)$/,
    /^(?:please\s+)?add (?:a )?reminder\b(.*)$/,
    /^don'?t let me forget\b(.*)$/,
    /^reminder\s*:(.*)$/,
  ],
  args: (_t, m) => ({ text: (m[1] ?? '').replace(/^\s*(to|that|about|:)\s+/i, '').trim() }),
}

const DECIDE: Rule = {
  kind: 'decide',
  confidence: 0.9,
  patterns: [
    /^(?:i(?:'ve| have)? decided?|i(?:'m| am) deciding|we(?:'ve| have)? decided?|my decision is|our decision is|the decision is|decision\s*:|record (?:a |the |my )?decision\s*:?|log (?:a |the |my )?decision\s*:?|i(?:'m| am) going with|we(?:'re| are| will|'ll) go(?:ing)? with|let'?s go with|i choose|i chose|i pick|i(?:'ll| will) go with|go with)(?=[\s:,]|$)\s*(?:that|to|on)?\s*(.*)$/,
  ],
  args: (_t, m) => ({ decision: (m[1] ?? '').replace(/^[:,\s]+/, '').trim() }),
}

const HOW_IS_X = /\bhow (?:are|is|'s) (?:the |my |our )?(?!(?:you|we|i|it|things|life)\b)([a-z]+) (?:doing|performing|getting on)\b/i
const GROUP_WORDS = ['agents', 'agent', 'team', 'everyone', 'everybody', 'they']

const AUDIT: Rule = {
  kind: 'audit',
  confidence: 0.85,
  patterns: [
    HOW_IS_X,
    /\bhallucinat/,
    /\b(audit|audits|auditor|scorecards?|grades?|grading)\b/,
    /\bwho(?:'s| is) (?:performing|underperforming|doing (?:well|badly|best|worst|poorly))\b/,
    /\b(agent|agents'?) (?:scores?|performance|quality|reliability|track record)\b/,
    /\bany (?:errors|mistakes|unsupported claims|made[- ]up|fabricat\w*|false claims)\b/,
    /\bcan i trust (?:the )?(agents?|outputs?|results?|work)\b/,
  ],
  args: (t): Record<string, string> => {
    const who = t.match(HOW_IS_X)?.[1]
    return who && !GROUP_WORDS.includes(who.toLowerCase()) ? { agent: who } : {}
  },
}

const SINCE_LAST: Rule = {
  kind: 'since_last',
  confidence: 0.9,
  patterns: [
    /\bsince (?:i|we) (?:last|was last|were last)\b/,
    /\bsince (?:my|your|our) last (?:visit|check|session|time)\b/,
    /\bsince (?:yesterday|last time|this morning|last night)\b/,
    /\bwhat(?:'s| has| have)? (?:changed|happened)\b/,
    /\bwhat(?:'s| is) new\b/,
    /\bwhat did i miss\b/,
    /\bcatch me up\b/,
    /\bwhile i was (?:away|gone|out|asleep|offline)\b/,
    /\bany(?:thing)? (?:new|updates?|news|changes)\b/,
    /\b(?:recap|what'?s the latest)\b/,
  ],
}

const NEEDS_ME: Rule = {
  kind: 'needs_me',
  confidence: 0.9,
  patterns: [
    /\bwhat do you need\b/,
    /\b(?:do|does) (?:you|anything|anyone|it|jarvis) need (?:me|my|anything from me)\b/,
    /\bneed(?:s|ed)? (?:from )?me\b/,
    /\bwhat(?:'s| is| are)? (?:waiting|blocked|pending) (?:on|for) me\b/,
    /\bwaiting (?:for|on) me\b/,
    /\bneeds? my (?:input|decision|approval|sign[- ]?off|attention|ok|go[- ]ahead)\b/,
    /\bwhat can i (?:do|help with)\b/,
    /\bwhat should i (?:do|decide|approve|look at)\b/,
    /\b(?:my )?(?:action items|to-?dos?)\b/,
    /\b(?:pending|outstanding|open) (?:decisions|approvals|questions)\b/,
    /\bwhat(?:'s| is) on me\b/,
    /\bfounder gates?\b/,
  ],
}

const WORKING_ON: Rule = {
  kind: 'working_on',
  confidence: 0.9,
  patterns: [
    /\bwhat (?:are|r) (?:you|u|the agents|they|we) (?:working on|doing|up to|busy with)\b/,
    /\bwhat(?:'s| is) (?:running|in progress|being worked on|happening(?: now| right now)?|underway)\b/,
    /\bwho(?:'s| is) working on\b/,
    /\bwhat(?:'s| is) on your plate\b/,
    /\b(?:current|active) (?:tasks?|work|jobs?)\b/,
    /\banything running\b/,
  ],
}

const NEXT: Rule = {
  kind: 'next',
  confidence: 0.9,
  patterns: [
    /\bwhat(?:'s| is| comes)? (?:up )?next\b/,
    /\bwhat(?:'s| is) the next (?:task|step|thing|move)\b/,
    /\bnext steps?\b/,
    /\bwhat(?:'s| is) the plan\b/,
    /^what now$/,
    /\bwhat(?:'s| is) coming up\b/,
    /\bwhat should (?:we|you) do next\b/,
    /\bwhat(?:'s| is) after (?:that|this)\b/,
    /\bupcoming\b/,
  ],
}

const STATUS: Rule = {
  kind: 'status',
  confidence: 0.9,
  patterns: [
    /\bwhat(?:'s| is| has been| have you| have we| got| was)? (?:done|finished|completed|built|shipped|verified)\b/,
    /\bwhere (?:are we|do we stand|do things stand|is everything|are things)\b/,
    /\b(?:status|progress|sitrep|state of (?:play|things|the project))\b/,
    /\bhow(?:'s| is| are) (?:it|everything|things|the project|the build|the venture|work) (?:going|looking|coming along)\b/,
    /\bhow far (?:along|are we)\b/,
    /\bwhat have (?:you|we|the agents) (?:done|finished|built|accomplished|achieved)\b/,
    /\b(?:give me|i want|i need) (?:an |a )?(?:update|overview|summary|briefing|brief)\b/,
    /^(?:update|overview|summary|briefing|brief)\??$/,
    /\bhow are things\b/,
  ],
}

const EXPLAIN: Rule = {
  kind: 'explain',
  confidence: 0.85,
  patterns: [
    /^(?:please\s+)?(?:explain|describe|clarify|eli5)\b\s*(.*)$/,
    /^what(?:'s| is) (this|that|it)$/,
    /\bwhat am i (?:looking at|seeing)\b/,
    /\btell me (?:about|more about) (.+)$/,
    /\bwhat does (this|that|it) (?:mean|do|show)\b/,
    /\bhelp me understand\s*(.*)$/,
  ],
  args: (_t, m): Record<string, string> => {
    const subject = (m[1] ?? '').replace(/^(?:the|this|that|it)\b\s*/i, '').trim()
    return subject ? { subject } : {}
  },
}

const NAVIGATE: Rule = {
  kind: 'navigate',
  confidence: 0.85,
  patterns: [/^(?:please\s+)?(?:open|show(?: me)?|go to|goto|take me to|navigate to|jump to|bring up|pull up|display|view|zoom (?:in )?(?:on|to)|focus(?: on)?|find|where(?:'s| is))\s+(.+)$/],
  args: (_t, m) => ({ target: (m[1] ?? '').replace(/^(?:the|a|an)\s+/i, '').trim() }),
}

const DO_IT: Rule = {
  kind: 'do_it',
  confidence: 0.85,
  patterns: [
    /^(?:yes|yeah|yep|yup|sure|ok|okay|alright|right|absolutely|definitely|affirmative|confirmed?|approved?)(?:[\s,!.]+(?:please|go ahead|do it|go for it|proceed|continue|please do|thanks))*$/,
    /^(?:(?:yes|yeah|yep|sure|ok|okay|alright)[\s,!.]+)?(?:please\s+)?(?:go ahead|do it|do that|proceed|continue|carry on|keep going|make it so|go for it|please do|sounds good|let'?s do it|let'?s go|ship it|run it|approve it|confirm it|i approve|i confirm|you have my approval)\b/,
    /^(?:please\s+)?(?:start|run|continue(?: with)?|begin|kick off|resume|do|pick up)\s+(?:the |with the )?next(?: task| one| step| item)?\b/,
    /^next task$/,
  ],
}

/** Order matters: specific commands first, questions before the generic navigate/explain/do-it forms. */
const RULES: Rule[] = [STOP, REMIND, DECIDE, AUDIT, SINCE_LAST, NEEDS_ME, WORKING_ON, NEXT, STATUS, NAVIGATE, DO_IT, EXPLAIN].map(rule => ({
  ...rule,
  // Patterns are written in lower case and matched case-insensitively, so arguments keep the speaker's capitals ("Ada", "V09").
  patterns: rule.patterns.map(p => (p.flags.includes('i') ? p : new RegExp(p.source, `${p.flags}i`))),
}))

export function normalizeUtterance(text: string): string {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(WAKE, '')
    .replace(/[\s?!.,;:]+$/, '')
    .replace(POLITE_TAIL, '')
    .replace(/^(?:so|and|um|uh|well|right),?\s+/i, '')
    .trim()
}

/** Deterministic, case-insensitive intent parsing. No model call; anything unrecognised is 'chat' with low confidence. */
export function parseIntent(text: string): Intent {
  const norm = normalizeUtterance(text)
  if (!norm) return { kind: 'chat', text, args: {}, confidence: 0 }
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const m = norm.match(pattern)
      if (!m) continue
      const args = { ...(rule.args?.(norm, m) ?? {}), ...idArg(text) }
      return { kind: rule.kind, text, args, confidence: rule.confidence }
    }
  }
  return { kind: 'chat', text, args: idArg(text), confidence: 0.3 }
}

function idArg(text: string): Record<string, string> {
  const m = String(text ?? '').match(TASK_ID)
  return m ? { id: m[1].toUpperCase() } : {}
}
