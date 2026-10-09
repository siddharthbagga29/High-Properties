let counter = 0

/**
 * A short unique id such as "task-mg1x2k3-9f2c41ab1". Uses crypto.randomUUID where the platform has it
 * (browsers, Node 19+) and falls back to Math.random, which is fine because ids are never secrets.
 */
export function newId(prefix: string, now: Date): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  const random = c?.randomUUID ? c.randomUUID().replace(/-/g, '').slice(0, 8) : Math.random().toString(36).slice(2, 10)
  counter = (counter + 1) % 46_656
  return `${prefix}-${now.getTime().toString(36)}-${random}${counter.toString(36)}`
}
