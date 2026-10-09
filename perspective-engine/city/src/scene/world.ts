/**
 * The world plan: one brain in the middle (the plan and the orchestrator),
 * eight agent districts on a ring around it, joined by spokes. Pure maths,
 * shared by the layout worker and the renderer; deterministic for a given graph.
 */
export type V3 = [number, number, number]

/** Clockwise from the top of the screen in the default view. */
export const RING = ['science', 'data', 'finance', 'legal', 'gtm', 'brand', 'product', 'ethics'] as const
export const CENTER_AGENT = 'orchestrator'
export const ALL_AGENTS = [CENTER_AGENT, ...RING] as string[]
export const MAX_TASKS = 48

/** What each agent does, read first by a visitor: "RESEARCH · Curie". Used by signs, tags and labels alike. */
export const DEPT: Record<string, string> = {
  orchestrator: 'The plan', science: 'Research', data: 'Data', finance: 'Finance', legal: 'Legal',
  gtm: 'Go-to-market', brand: 'Brand', product: 'Product', ethics: 'Ethics',
}
export const agentLabel = (key: string, name: string) => `${DEPT[key] ?? key} · ${name}`

/** One brain unit: the brain's half-width, and the unit the bust around it is drawn in (scene/bust.ts). */
export const BRAIN_S = 8
/** Local height of the bust's base, in brain units below the brain centre. */
export const BUST_BASE = -3.15
/** The brain sits in the bust's head; the bust's base rests just above the plaza. */
export const BRAIN_C: V3 = [0, -BUST_BASE * BRAIN_S + 0.4, 0]
export const R_DISTRICT = 27
export const R_PLAZA = 13.5
export const LOT = 3.5
export const FOOT = 1.6
export const PLATE_R = 7.2

export interface LayoutNode { id: string; agent: string; budget_k: number; used_k: number; phase: number }
export interface Tower { id: string; agent: string; x: number; z: number; h: number; w: number; angle: number }

export const ringIndex = (agent: string) => RING.indexOf(agent as (typeof RING)[number])
export const ringAngle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / RING.length

export function districtCenter(agent: string): [number, number] {
  if (agent === CENTER_AGENT) return [0, 0]
  const a = ringAngle(ringIndex(agent))
  return [Math.cos(a) * R_DISTRICT, Math.sin(a) * R_DISTRICT]
}

/** Tower height encodes the planned token budget. */
export const towerHeight = (budget: number) => 1.8 + 0.78 * Math.sqrt(Math.max(budget, 4))

export function towers(nodes: LayoutNode[]): Tower[] {
  const seen: Record<string, number> = {}
  const centerCount = nodes.filter(n => n.agent === CENTER_AGENT).length
  return nodes.map(n => {
    const i = (seen[n.agent] = (seen[n.agent] ?? -1) + 1)
    const h = towerHeight(n.budget_k)
    if (n.agent === CENTER_AGENT) {
      // City Hall's tasks stand on the plaza behind the brain, so the brain is never hidden from the default view.
      const a = -Math.PI / 2 + (i - (centerCount - 1) / 2) * (Math.PI / 9)
      return { id: n.id, agent: n.agent, x: Math.cos(a) * R_PLAZA, z: Math.sin(a) * R_PLAZA, h, w: FOOT, angle: a }
    }
    const a = ringAngle(ringIndex(n.agent))
    const [cx, cz] = districtCenter(n.agent)
    const ux = Math.cos(a), uz = Math.sin(a), vx = -uz, vz = ux
    const col = (i % 3) - 1, row = Math.floor(i / 3) - 1
    return { id: n.id, agent: n.agent, x: cx + vx * col * LOT + ux * row * LOT, z: cz + vz * col * LOT + uz * row * LOT, h, w: FOOT, angle: a }
  })
}

// ---------- brain particles (kept from the cortex model) ----------

export function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Lobe = 'frontal' | 'parietal' | 'occipital' | 'temporal' | 'deep'
/** Lobe per agent. Left hemisphere: evidence and money. Right: product and people. The orchestrator is the corpus callosum. */
export const LOBES: Record<string, [number, Lobe]> = {
  science: [-1, 'frontal'], data: [-1, 'parietal'], finance: [-1, 'occipital'], legal: [-1, 'temporal'],
  product: [1, 'frontal'], ethics: [1, 'parietal'], brand: [1, 'occipital'], gtm: [1, 'temporal'],
  orchestrator: [0, 'deep'],
}

const norm = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2831853 * r())
const dir = (r: () => number): V3 => norm([gauss(r), gauss(r), gauss(r)])

function lobeOf(u: V3, side: number): Lobe {
  const lateral = u[0] * side
  if (u[2] < -0.5) return 'occipital'
  if (u[1] < -0.12 && lateral > 0.28 && u[2] < 0.48) return 'temporal'
  if (u[2] > 0.2) return 'frontal'
  return 'parietal'
}

function cortex(u: V3, side: number, rj: number): V3 {
  const gyri = 0.06 * Math.sin(u[0] * 13 + Math.sin(u[2] * 9) * 2.2) * Math.sin(u[1] * 11 + u[2] * 6.5) + 0.028 * Math.sin(u[2] * 23 + u[1] * 17)
  const r = (1 + gyri) * rj
  let x = side * 0.46 + u[0] * 0.56 * r
  let y = u[1] * 0.68 * r
  const z = u[2] * 1.02 * r
  if (u[1] < -0.1 && u[0] * side > 0.2) y -= 0.07
  if (y < -0.44) y = -0.44 + (y + 0.44) * 0.3
  if (side * x < 0.04) x = side * (0.04 + Math.abs(x) * 0.06)
  return [BRAIN_C[0] + x * BRAIN_S, BRAIN_C[1] + y * BRAIN_S, BRAIN_C[2] + z * BRAIN_S]
}

function deep(r: () => number, near?: number): V3 {
  if (r() < 0.72) {
    const z = near !== undefined ? Math.max(-0.58, Math.min(0.62, near + gauss(r) * 0.12)) : -0.58 + r() * 1.2
    const x = (r() - 0.5) * 0.8
    const y = 0.04 + 0.17 * (1 - (z / 0.62) ** 2) + gauss(r) * 0.03
    return [BRAIN_C[0] + x * BRAIN_S, BRAIN_C[1] + y * BRAIN_S, BRAIN_C[2] + z * BRAIN_S]
  }
  const y = -0.3 - r() * 0.75
  const rad = 0.09 * (1 - (y + 0.3) * 0.4)
  const a = r() * 6.2831853
  return [BRAIN_C[0] + Math.cos(a) * rad * BRAIN_S, BRAIN_C[1] + y * BRAIN_S, BRAIN_C[2] + (-0.18 + Math.sin(a) * rad) * BRAIN_S]
}

function lobeDir(r: () => number, side: number, lobe: Lobe, seed?: V3): V3 {
  for (let k = 0; k < 40; k++) {
    const u = seed ? norm([seed[0] + gauss(r) * 0.3, seed[1] + gauss(r) * 0.3, seed[2] + gauss(r) * 0.3]) : dir(r)
    if (lobeOf(u, side) === lobe) return u
  }
  return seed ?? dir(r)
}

function brainPoint(r: () => number, agent: string, rj: number, seed?: V3): V3 {
  const [side, lobe] = LOBES[agent]
  if (lobe === 'deep') return deep(r, seed?.[2])
  return cortex(lobeDir(r, side, lobe, seed), side, rj)
}

export interface BrainInput { nodes: LayoutNode[]; count: number; seed: number }
export interface BrainOutput {
  count: number
  pos: Float32Array      // assembled position
  scatter: Float32Array  // start position
  info: Float32Array     // task index, agent index (ALL_AGENTS), kind, random
  lobeCentroids: Float32Array
  taskCentroids: Float32Array
}

/** kinds: 0 a task's patch of cortex, 1 lobe tissue (agent), 2 white-matter tract, 3 aura. */
export function buildBrain({ nodes, count, seed }: BrainInput): BrainOutput {
  const r = mulberry32(seed)
  const N = count
  const pos = new Float32Array(N * 3), scatter = new Float32Array(N * 3), info = new Float32Array(N * 4)
  const nT = Math.floor(N * 0.62), nL = Math.floor(N * 0.2), nW = Math.floor(N * 0.08)
  const weights = nodes.map(n => Math.max(n.used_k || n.budget_k, 6))
  const sumW = weights.reduce((a, b) => a + b, 0)
  const taskSum = new Float64Array(nodes.length * 4), lobeSum = new Float64Array(ALL_AGENTS.length * 4)
  let p = 0
  const put = (b: V3, inf: [number, number, number]) => {
    pos.set(b, p * 3)
    const a = r() * 6.2831853, rr = 35 + r() * 45, yy = (r() - 0.3) * 50
    scatter.set([Math.cos(a) * rr, BRAIN_C[1] + yy, Math.sin(a) * rr], p * 3)
    info.set([inf[0], inf[1], inf[2], r()], p * 4)
    p++
  }
  nodes.forEach((n, ti) => {
    const [side, lobe] = LOBES[n.agent]
    const ai = ALL_AGENTS.indexOf(n.agent)
    const sd: V3 = lobe === 'deep' ? [0, 0, -0.5 + (ti % 5) * 0.25] : lobeDir(r, side, lobe)
    const k = ti === nodes.length - 1 ? nT - p : Math.floor((nT * weights[ti]) / sumW)
    for (let j = 0; j < k && p < nT; j++) {
      const b = brainPoint(r, n.agent, 0.97 + r() * 0.05, sd)
      put(b, [ti, ai, 0])
      taskSum[ti * 4] += b[0]; taskSum[ti * 4 + 1] += b[1]; taskSum[ti * 4 + 2] += b[2]; taskSum[ti * 4 + 3]++
    }
  })
  for (let j = 0; j < nL; j++) {
    const ai = j % ALL_AGENTS.length
    const b = brainPoint(r, ALL_AGENTS[ai], 0.84 + r() * 0.12)
    put(b, [0, ai, 1])
    lobeSum[ai * 4] += b[0]; lobeSum[ai * 4 + 1] += b[1]; lobeSum[ai * 4 + 2] += b[2]; lobeSum[ai * 4 + 3]++
  }
  const lobeCentroids = new Float32Array(ALL_AGENTS.length * 3)
  for (let i = 0; i < ALL_AGENTS.length; i++) for (let c = 0; c < 3; c++) lobeCentroids[i * 3 + c] = lobeSum[i * 4 + c] / Math.max(lobeSum[i * 4 + 3], 1)
  for (let j = 0; j < nW; j++) {
    const a = Math.floor(r() * ALL_AGENTS.length), b2 = Math.floor(r() * ALL_AGENTS.length), u = r(), m = 1 - u
    const A = [0, 1, 2].map(c => lobeCentroids[a * 3 + c]), B = [0, 1, 2].map(c => lobeCentroids[b2 * 3 + c])
    const pt = [0, 1, 2].map(c => m * m * A[c] + 2 * m * u * (BRAIN_C[c] + (A[c] + B[c] - 2 * BRAIN_C[c]) * 0.15) + u * u * B[c] + gauss(r) * 0.12) as V3
    put(pt, [0, a, 2])
  }
  while (p < N) {
    const u = dir(r), rr = 1.1 + Math.pow(r(), 2) * 0.6
    put([BRAIN_C[0] + u[0] * BRAIN_S * rr * 0.75, BRAIN_C[1] + u[1] * BRAIN_S * rr * 0.62, BRAIN_C[2] + u[2] * BRAIN_S * rr], [0, 0, 3])
  }
  const taskCentroids = new Float32Array(nodes.length * 3)
  for (let i = 0; i < nodes.length; i++) for (let c = 0; c < 3; c++) taskCentroids[i * 3 + c] = taskSum[i * 4 + c] / Math.max(taskSum[i * 4 + 3], 1)
  return { count: N, pos, scatter, info, lobeCentroids, taskCentroids }
}
