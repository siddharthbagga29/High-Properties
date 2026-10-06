/**
 * Deep links use a bare hash token so they survive hosts that drop query strings:
 *   #<focus>.<level>.<time>   e.g. #gtm.3.live, #V05.4.1791290000000, #venture.1.live
 */
export interface Link { focus: string; level: 1 | 2 | 3 | 4; time: number | null }

export function parseLink(hash: string): Link | null {
  const m = /^#?([A-Za-z0-9_-]+)\.([1-4])\.(live|\d+)$/.exec(hash.trim())
  if (!m) return null
  return { focus: m[1], level: Number(m[2]) as Link['level'], time: m[3] === 'live' ? null : Number(m[3]) }
}

export const formatLink = (l: Link) => `#${l.focus}.${l.level}.${l.time === null ? 'live' : Math.round(l.time)}`
