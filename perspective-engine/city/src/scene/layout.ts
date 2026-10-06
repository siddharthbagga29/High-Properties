/**
 * Pure layout maths shared by the Web Worker (particles) and the main thread (hit targets,
 * workers, arcs). Deterministic: the same graph always produces the same city and cortex.
 */
export const AGENTS = ['science', 'ethics', 'product', 'gtm', 'orchestrator', 'data', 'finance', 'legal', 'brand']
export const BRAIN_C: V3 = [0, 8.5, 0]
export const BRAIN_S = 6.4
export const SPACING = 17
export const PLATE = 6.4
export const LOT = 3.7
export const FOOT = 1.55
export const MAX_TASKS = 48

export type V3 = [number, number, number]
type Lobe = 'frontal' | 'parietal' | 'occipital' | 'temporal' | 'deep'

/** Lobe per agent. Left hemisphere: evidence and money. Right: product and people. City Hall is the corpus callosum. */
export const LOBES: Record<string, [number, Lobe]> = {
  science: [-1, 'frontal'], data: [-1, 'parietal'], finance: [-1, 'occipital'], legal: [-1, 'temporal'],
  product: [1, 'frontal'], ethics: [1, 'parietal'], brand: [1, 'occipital'], gtm: [1, 'temporal'],
  orchestrator: [0, 'deep'],
}

export interface LayoutNode { id: string; agent: string; budget_k: number; used_k: number; phase: number }
export interface Tower { id: string; agent: string; x: number; z: number; h: number; w: number }

export function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function districtCenter(agent: string): [number, number] {
  const i = AGENTS.indexOf(agent)
  return [((i % 3) - 1) * SPACING, (Math.floor(i / 3) - 1) * SPACING]
}

/** Tower height encodes the planned token budget. */
export const towerHeight = (budget: number) => 1.8 + 0.78 * Math.sqrt(Math.max(budget, 4))

export function towers(nodes: LayoutNode[]): Tower[] {
  const seen: Record<string, number> = {}
  return nodes.map(n => {
    const i = (seen[n.agent] = (seen[n.agent] ?? -1) + 1)
    const [cx, cz] = districtCenter(n.agent)
    return { id: n.id, agent: n.agent, x: cx + ((i % 3) - 1) * LOT, z: cz + (Math.floor(i / 3) - 1) * LOT, h: towerHeight(n.budget_k), w: FOOT }
  })
}

const norm = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
function gauss(r: () => number) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2831853 * r()) }
const dir = (r: () => number): V3 => norm([gauss(r), gauss(r), gauss(r)])

function lobeOf(u: V3, side: number): Lobe {
  const lateral = u[0] * side
  if (u[2] < -0.5) return 'occipital'
  if (u[1] < -0.12 && lateral > 0.28 && u[2] < 0.48) return 'temporal'
  if (u[2] > 0.2) return 'frontal'
  return 'parietal'
}

/** A point on one hemisphere's folded surface. rj < 1 sits below the surface (white matter). */
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

/** Corpus callosum band and brainstem: where City Hall lives in the cortex. */
function deep(r: () => number, near?: number): V3 {
  if (r() < 0.7) {
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

export interface ParticleInput { nodes: LayoutNode[]; count: number; seed: number }
export interface ParticleOutput {
  count: number
  brain: Float32Array
  city: Float32Array
  scatter: Float32Array
  info: Float32Array
  info2: Float32Array
  lobeCentroids: Float32Array
  taskBrain: Float32Array
}

/**
 * kinds: 0 tower (one task), 1 district ground, 2 street traffic, 3 haze.
 * Tower particle count is proportional to tokens actually spent (or budget if not yet run).
 */
export function buildParticles({ nodes, count, seed }: ParticleInput): ParticleOutput {
  const r = mulberry32(seed)
  const tw = towers(nodes)
  const N = count
  const brain = new Float32Array(N * 3), city = new Float32Array(N * 3), scatter = new Float32Array(N * 3)
  const info = new Float32Array(N * 4), info2 = new Float32Array(N * 2)
  const nT = Math.floor(N * 0.6), nG = Math.floor(N * 0.17), nS = Math.floor(N * 0.1)
  const weights = nodes.map(n => Math.max(n.used_k || n.budget_k, 6))
  const sumW = weights.reduce((a, b) => a + b, 0)
  const taskSum = new Float64Array(nodes.length * 4)
  const lobeSum = new Float64Array(AGENTS.length * 4)
  let p = 0

  const put = (b: V3, c: V3, inf: [number, number, number, number], i2: [number, number]) => {
    brain.set(b, p * 3); city.set(c, p * 3)
    const a = r() * 6.2831853, rr = 30 + r() * 45, yy = (r() - 0.35) * 60
    scatter.set([Math.cos(a) * rr, BRAIN_C[1] + yy, Math.sin(a) * rr], p * 3)
    info.set([inf[0], inf[1], inf[2], r()], p * 4)
    info2.set(i2, p * 2)
    p++
  }

  // Towers
  nodes.forEach((n, ti) => {
    const t = tw[ti]
    const di = AGENTS.indexOf(n.agent)
    const k = ti === nodes.length - 1 ? nT - p : Math.floor((nT * weights[ti]) / sumW)
    const [side, lobe] = LOBES[n.agent]
    const sd: V3 = lobe === 'deep' ? [0, 0, -0.5 + (ti % 5) * 0.25] : lobeDir(r, side, lobe)
    for (let j = 0; j < k && p < nT; j++) {
      const hw = t.w / 2
      let x: number, y: number, z: number, edge = 0
      const roll = r()
      if (roll < 0.3) {
        // the 12 edges
        const e = Math.floor(r() * 12), s = r()
        edge = 1
        if (e < 4) { x = e & 1 ? hw : -hw; z = e & 2 ? hw : -hw; y = s * t.h }
        else { const top = e < 8 ? t.h : 0; const q = e % 4; y = top
          if (q < 2) { x = (s - 0.5) * t.w; z = q ? hw : -hw } else { z = (s - 0.5) * t.w; x = q === 3 ? hw : -hw } }
      } else if (roll < 0.88) {
        // facades with floor bands
        const f = Math.floor(r() * 4), s = (r() - 0.5) * t.w
        y = r() * t.h
        if (r() < 0.55) y = Math.round(y / 0.42) * 0.42
        if (f === 0) { x = s; z = hw } else if (f === 1) { x = s; z = -hw } else if (f === 2) { x = hw; z = s } else { x = -hw; z = s }
      } else {
        x = (r() - 0.5) * t.w; z = (r() - 0.5) * t.w; y = t.h
      }
      const b = brainPoint(r, n.agent, 0.97 + r() * 0.05, sd)
      put(b, [t.x + x, y, t.z + z], [ti, di, 0, 0], [Math.min(y / t.h, 1), edge])
      taskSum[ti * 4] += b[0]; taskSum[ti * 4 + 1] += b[1]; taskSum[ti * 4 + 2] += b[2]; taskSum[ti * 4 + 3]++
    }
  })

  // District ground plates with a survey grid
  for (let j = 0; j < nG; j++) {
    const di = j % AGENTS.length, agent = AGENTS[di]
    const [cx, cz] = districtCenter(agent)
    let x = (r() - 0.5) * PLATE * 2, z = (r() - 0.5) * PLATE * 2
    const g = r()
    if (g < 0.45) x = Math.round(x / 1.6) * 1.6
    else if (g < 0.9) z = Math.round(z / 1.6) * 1.6
    const b = brainPoint(r, agent, 0.84 + r() * 0.1)
    put(b, [cx + x, 0.02, cz + z], [0, di, 1, 0], [0, 0])
    lobeSum[di * 4] += b[0]; lobeSum[di * 4 + 1] += b[1]; lobeSum[di * 4 + 2] += b[2]; lobeSum[di * 4 + 3]++
  }
  const lobeCentroids = new Float32Array(AGENTS.length * 3)
  for (let i = 0; i < AGENTS.length; i++) for (let c = 0; c < 3; c++) lobeCentroids[i * 3 + c] = lobeSum[i * 4 + c] / Math.max(lobeSum[i * 4 + 3], 1)

  // Streets between districts carry traffic; in the cortex they become white-matter tracts.
  const half = SPACING * 1.5
  for (let j = 0; j < nS; j++) {
    const axis = r() < 0.5 ? 0 : 1, line = (r() < 0.5 ? -1 : 1) * SPACING * 0.5 + (r() - 0.5) * 0.9, s = (r() - 0.5) * half * 2
    const c: V3 = axis === 0 ? [s, 0.06, line] : [line, 0.06, s]
    const a = Math.floor(r() * 9), bb = Math.floor(r() * 9), u = r()
    const A = [lobeCentroids[a * 3], lobeCentroids[a * 3 + 1], lobeCentroids[a * 3 + 2]]
    const B = [lobeCentroids[bb * 3], lobeCentroids[bb * 3 + 1], lobeCentroids[bb * 3 + 2]]
    const m = 1 - u
    const b: V3 = [0, 1, 2].map(i => m * m * A[i] + 2 * m * u * (BRAIN_C[i] + (A[i] + B[i] - 2 * BRAIN_C[i]) * 0.15) + u * u * B[i] + gauss(r) * 0.12) as V3
    put(b, c, [0, 9, 2, 0], [0, axis])
  }

  // Haze: an aura around the cortex, a low mist over the city.
  while (p < N) {
    const u = dir(r), rr = 1.12 + Math.pow(r(), 2) * 0.7
    const b: V3 = [BRAIN_C[0] + u[0] * BRAIN_S * rr * 0.75, BRAIN_C[1] + u[1] * BRAIN_S * rr * 0.62, BRAIN_C[2] + u[2] * BRAIN_S * rr]
    const a = r() * 6.2831853, rad = Math.sqrt(r()) * 36
    put(b, [Math.cos(a) * rad, 0.4 + Math.pow(r(), 2.2) * 18, Math.sin(a) * rad], [0, 9, 3, 0], [0, 0])
  }

  const taskBrain = new Float32Array(nodes.length * 3)
  for (let i = 0; i < nodes.length; i++) for (let c = 0; c < 3; c++) taskBrain[i * 3 + c] = taskSum[i * 4 + c] / Math.max(taskSum[i * 4 + 3], 1)
  return { count: N, brain, city, scatter, info, info2, lobeCentroids, taskBrain }
}
