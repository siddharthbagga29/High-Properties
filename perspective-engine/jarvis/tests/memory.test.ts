import { describe, expect, it } from 'vitest'
import { createMemoryStore, keywords, looksLikeCredential, recall, remember, stem } from '../core/memory'
import type { MemoryItem } from '../core/types'

const NOW = new Date('2026-10-08T12:00:00Z')
const at = (day: number) => new Date(Date.UTC(2026, 9, day, 12))
const fakeKey = 'sk-ant-' + 'api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123'

describe('memory store', () => {
  it('adds, lists by kind, replaces by id and removes', async () => {
    const store = createMemoryStore([{ id: 'a', kind: 'decision', at: NOW.toISOString(), text: 'United States' }])
    await store.add({ id: 'b', kind: 'preference', at: NOW.toISOString(), text: 'short answers' })
    await store.add({ id: 'a', kind: 'decision', at: NOW.toISOString(), text: 'United States (confirmed)' })
    expect((await store.all()).map(i => i.id)).toEqual(['a', 'b'])
    expect((await store.all('preference')).map(i => i.id)).toEqual(['b'])
    expect((await store.all('decision'))[0].text).toBe('United States (confirmed)')
    await store.remove('a')
    expect((await store.all()).map(i => i.id)).toEqual(['b'])
  })

  it('hands out copies', async () => {
    const store = createMemoryStore()
    await store.add({ id: 'a', kind: 'episodic', at: NOW.toISOString(), text: 'x' })
    ;(await store.all())[0].text = 'changed'
    expect((await store.all())[0].text).toBe('x')
  })
})

describe('remember', () => {
  it('stores a memory with id, kind and time', async () => {
    const store = createMemoryStore()
    const item = await remember(store, 'decision', '  Founder chose the United States.  ', NOW, { reason: 'US grant eligibility', project: 'perspective-engine', id: 'd1' })
    expect(item).toEqual({ id: 'd1', kind: 'decision', at: NOW.toISOString(), text: 'Founder chose the United States.', reason: 'US grant eligibility', project: 'perspective-engine' })
    expect(await store.all()).toEqual([item])
  })

  it('redacts secrets embedded in otherwise useful text', async () => {
    const store = createMemoryStore()
    const item = await remember(store, 'episodic', `Deploy failed because ${fakeKey} was revoked`, NOW)
    expect(item.text).toBe('Deploy failed because [REDACTED KEY] was revoked')
    expect(JSON.stringify(await store.all())).not.toContain(fakeKey)
  })

  it.each([
    'my password is hunter2',
    'PIN: 4821',
    'the api key is sk-live-abc',
    fakeKey,
    'card 4111 1111 1111 1111 expires 09/29',
    'SSN 123-45-6789',
    'seed phrase: apple banana cherry',
    'use Xk9#mP2$vL8@qR5! to log in',
    'the verification code is 552901',
  ])('refuses credential-like text %j', async text => {
    const store = createMemoryStore()
    await expect(remember(store, 'preference', text, NOW)).rejects.toThrow(/credential/)
    expect(await store.all()).toEqual([])
  })

  it('refuses a credential smuggled in the reason, source, project or tags', async () => {
    await expect(remember(createMemoryStore(), 'decision', 'rotate keys', NOW, { reason: 'password is tulips' })).rejects.toThrow(/credential/)
    await expect(remember(createMemoryStore(), 'episodic', 'login', NOW, { tags: ['ops', 'pin: 4821'] })).rejects.toThrow(/credential/)
    const item = await remember(createMemoryStore(), 'episodic', 'deploy', NOW, { source: `log line ${fakeKey} end`, tags: ['ops'] })
    expect(item.source).toBe('log line [REDACTED KEY] end')
  })

  it('refuses empty text', async () => {
    await expect(remember(createMemoryStore(), 'episodic', '   ', NOW)).rejects.toThrow(/empty/)
  })

  it.each([
    'The GitHub token is expired; ask the founder to renew it.',
    'Founder prefers answers under 50 words.',
    'See https://github.com/siddharthbagga29/High-Properties for the code.',
    'Order 4111 is not a card number.',
  ])('keeps ordinary text %j', text => {
    expect(looksLikeCredential(text)).toBe(false)
  })
})

describe('recall', () => {
  const items: MemoryItem[] = [
    { id: 'old-us', kind: 'decision', at: at(1).toISOString(), text: 'Founder decided the company is based in the United States', reason: 'grant eligibility' },
    { id: 'new-us', kind: 'decision', at: at(5).toISOString(), text: 'United States entity: Delaware C-corp' },
    { id: 'voice', kind: 'preference', at: at(3).toISOString(), text: 'Voice replies off during quiet hours', tags: ['voice'] },
    { id: 'batch', kind: 'episodic', at: at(4).toISOString(), text: 'Reviewed outreach batch one with the founder' },
  ]

  it('ranks by keyword overlap, then recency', async () => {
    const store = createMemoryStore(items)
    expect((await recall(store, 'what did we decide about the united states?')).map(i => i.id)).toEqual(['old-us', 'new-us'])
    expect((await recall(store, 'united states')).map(i => i.id)).toEqual(['new-us', 'old-us'])
  })

  it('stems so different word forms meet', async () => {
    const store = createMemoryStore(items)
    expect((await recall(store, 'reviewing batches')).map(i => i.id)).toEqual(['batch'])
    expect((await recall(store, 'decisions about grants')).map(i => i.id)).toEqual(['old-us'])
  })

  it('matches tags and filters by kind and k', async () => {
    const store = createMemoryStore(items)
    expect((await recall(store, 'voice')).map(i => i.id)).toEqual(['voice'])
    expect((await recall(store, 'united states', 5, ['episodic']))).toEqual([])
    expect((await recall(store, 'united states', 1)).map(i => i.id)).toEqual(['new-us'])
  })

  it('returns nothing for unrelated queries and the newest items for an empty one', async () => {
    const store = createMemoryStore(items)
    expect(await recall(store, 'quantum chromodynamics')).toEqual([])
    expect((await recall(store, '', 2)).map(i => i.id)).toEqual(['new-us', 'batch'])
  })
})

describe('keywords and stem', () => {
  it('drops stop words and stems', () => {
    expect(keywords('What are the next steps for V09?')).toEqual(['next', 'step', 'v09'])
    expect(['decide', 'decided', 'decides', 'deciding'].map(stem)).toEqual(['decid', 'decid', 'decid', 'decid'])
    expect(['running', 'stopped', 'class', 'status'].map(stem)).toEqual(['run', 'stop', 'class', 'status'])
  })
})
