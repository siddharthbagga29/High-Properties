import { describe, expect, it } from 'vitest'
import { normalizeUtterance, parseIntent } from '../core/intent'
import type { IntentKind } from '../core/types'

const CASES: Record<Exclude<IntentKind, 'chat'>, string[]> = {
  status: [
    "What's done?",
    'what is done',
    'Where are we?',
    'where do things stand',
    'Status',
    "What's the status of V09?",
    'How is the project going?',
    'How far along are we?',
    'What have you finished?',
    'Give me an update',
    'progress report please',
    'Jarvis, where are we',
  ],
  working_on: [
    'What are you working on?',
    'what are the agents doing',
    "What's running right now?",
    'What is in progress?',
    "Who's working on the LOI?",
    "what's on your plate",
  ],
  next: [
    "What's next?",
    'What comes next',
    'ok what is next',
    'What are the next steps?',
    "What's the plan?",
    'What now?',
    "What's coming up?",
  ],
  needs_me: [
    'What do you need from me?',
    'Do you need anything from me?',
    'What is waiting on me?',
    'Anything that needs my approval?',
    'What should I decide?',
    'my action items',
    'any pending decisions',
    'What can I do to help?',
  ],
  since_last: [
    'What changed since I last checked?',
    'What has changed?',
    "What's new?",
    'What did I miss?',
    'Catch me up',
    'Anything new since yesterday?',
    'what happened while I was away',
  ],
  remind: [
    'Remind me tomorrow at 9 to review batch one',
    'remind me to call Ada in 20 minutes',
    'Can you remind me about the board pack on Friday?',
    'Set a reminder for 5pm',
    "Don't let me forget the SAM.gov registration",
  ],
  do_it: ['Yes, do it', 'yes', 'Go ahead', 'Continue the next task', 'start the next task', 'Sounds good, proceed', 'ok', 'Make it so', 'keep going'],
  navigate: ['Open V09', 'Show me Ada', 'go to the harbor', 'take me to the courthouse', 'Where is the bank?', 'zoom in on Curie', 'pull up F04'],
  explain: ['Explain this', 'What is this?', 'What am I looking at?', 'Tell me about the ICP', 'what does this mean', 'explain the face'],
  audit: [
    'How are the agents doing?',
    'Any hallucinations?',
    'How is Ogilvy performing?',
    'Show me the audit',
    "Who's underperforming?",
    'agent scores',
    'Can I trust the outputs?',
  ],
  decide: [
    'I decide to go with the United States',
    "I've decided we incorporate in Delaware",
    'My decision is option B',
    'Decision: advisors are paid $150 per session',
    "Let's go with the LLC",
    'record a decision: target hospitals first',
  ],
  stop: ['Stop', 'stop talking', 'Cancel that', 'never mind', 'Be quiet', 'no, stop', 'shut up please', 'Jarvis stop'],
}

describe('parseIntent', () => {
  for (const [kind, phrases] of Object.entries(CASES)) {
    it.each(phrases)(`${kind}: %j`, phrase => {
      const intent = parseIntent(phrase)
      expect(intent.kind).toBe(kind)
      expect(intent.confidence).toBeGreaterThanOrEqual(0.8)
      expect(intent.text).toBe(phrase)
    })
  }

  it.each([
    'Write me a haiku about the sea',
    'Tell me a joke',
    'How are you doing today?',
    'What is the capital of France?',
    'Compare two pricing models for hospitals',
    'hmm',
  ])('falls back to chat for %j', phrase => {
    const intent = parseIntent(phrase)
    expect(intent.kind).toBe('chat')
    expect(intent.confidence).toBeLessThan(0.5)
  })

  it('returns chat with zero confidence for empty input', () => {
    expect(parseIntent('   ')).toEqual({ kind: 'chat', text: '   ', args: {}, confidence: 0 })
  })

  it('extracts arguments', () => {
    expect(parseIntent('Open V09').args).toEqual({ target: 'V09', id: 'V09' })
    expect(parseIntent('show me the Ada workshop').args).toEqual({ target: 'Ada workshop' })
    expect(parseIntent('Take me to The Harbor').args).toEqual({ target: 'Harbor' })
    expect(parseIntent('Remind me tomorrow at 9 to review batch one').args).toEqual({ text: 'tomorrow at 9 to review batch one' })
    expect(parseIntent('remind me to call Ada').args).toEqual({ text: 'call Ada' })
    expect(parseIntent('I decide to go with the United States').args).toEqual({ decision: 'go with the United States' })
    expect(parseIntent('How is Ogilvy performing?').args).toEqual({ agent: 'Ogilvy' })
    expect(parseIntent('How are the agents doing?').args).toEqual({})
    expect(parseIntent("what's the status of f04").args).toEqual({ id: 'F04' })
    expect(parseIntent('Tell me about the ICP').args).toEqual({ subject: 'ICP' })
  })

  it('is deterministic and case-insensitive', () => {
    const { text: _a, ...upper } = parseIntent('WHAT IS NEXT')
    const { text: _b, ...lower } = parseIntent('what is next')
    expect(upper).toEqual(lower)
    expect(parseIntent('what’s next')).toMatchObject({ kind: 'next' })
  })

  it('lets a question win over a leading acknowledgement', () => {
    expect(parseIntent('yes, what do you need from me?').kind).toBe('needs_me')
    expect(parseIntent('okay, catch me up').kind).toBe('since_last')
  })
})

describe('normalizeUtterance', () => {
  it('strips the wake word, punctuation and polite tails', () => {
    expect(normalizeUtterance('Hey Jarvis, what’s next, please?')).toBe("what's next")
  })
})
