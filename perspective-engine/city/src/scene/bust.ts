/**
 * JARVIS's body: a holographic bust around the brain, assembled from verified work. Pure maths, deterministic for a
 * seed, shared by the renderer and the tests. Nothing here is data: scene/Bust.tsx decides what is lit from the record.
 *
 * Local units are brain units (BRAIN_S) from the brain centre. +y is up and +z faces the go-to-market district and the
 * default camera. The bust is drawn as the viewer's mirror: its right arm is on the screen's right (+x), so each arm
 * reaches its own district (right → go-to-market, left → brand) without crossing the chest.
 */
import { BRAIN_C, BRAIN_S, BUST_BASE, districtCenter, mulberry32, type V3 } from './world'

/** Shader order of the parts. Index 8 is the face, which only revenue forms. */
export const BUST_PARTS = ['crown', 'neck', 'heart', 'lungs', 'ribcage', 'shoulders', 'arm_right', 'arm_left', 'face'] as const
export type BustPart = (typeof BUST_PARTS)[number]
export const FACE = 8
export const N_PARTS = BUST_PARTS.length

/** Particle kinds: body tissue, the featureless face mask, eyes (stage 1), brow and nose (stage 2), mouth (stage 3), aura. */
export const KIND = { body: 0, mask: 1, eyes: 2, browNose: 3, mouth: 4, aura: 5 } as const

export interface Ell { c: V3; r: V3 }

export const SHAPE = {
  cranium: { c: [0, 0.06, -0.04], r: [1.16, 0.97, 1.2] } as Ell,
  jaw: { c: [0, -0.64, 0.14], r: [0.8, 0.74, 0.92] } as Ell,
  trap: { c: [0, -1.98, -0.14], r: [1.5, 0.3, 0.52] } as Ell,
  deltR: { c: [1.5, -2.14, -0.06], r: [0.38, 0.4, 0.4] } as Ell,
  deltL: { c: [-1.5, -2.14, -0.06], r: [0.38, 0.4, 0.4] } as Ell,
  chest: { c: [0, -2.5, -0.04], r: [1.22, 0.92, 0.72] } as Ell,
  lungR: { c: [0.5, -2.44, -0.1], r: [0.4, 0.64, 0.45] } as Ell,
  lungL: { c: [-0.5, -2.44, -0.1], r: [0.4, 0.64, 0.45] } as Ell,
  /** Heart on the bust's anatomical left (−x), apex down, to the left and forward. */
  heart: { c: [-0.2, -2.42, 0.22] as V3, size: 0.3 },
  neck: { cz: -0.1, rx: 0.4, rz: 0.36, y0: -1.95, y1: -1.1 },
  /** The face mask: an ellipse on the front of the head, (x/mx)² + ((y − my)/ry)² < 1. */
  mask: { mx: 0.74, my: -0.52, ry: 0.86 },
  base: BUST_BASE,
}

// ---------- small vector helpers ----------

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
const nrm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (e0: number, e1: number, x: number) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t) }
const ZERO: V3 = [0, 0, 0]

export const toWorld = (p: V3): V3 => [BRAIN_C[0] + p[0] * BRAIN_S, BRAIN_C[1] + p[1] * BRAIN_S, BRAIN_C[2] + p[2] * BRAIN_S]

/** Normalised radius of p in an ellipsoid: < 1 inside. */
export const ellR = (p: V3, e: Ell) => Math.hypot((p[0] - e.c[0]) / e.r[0], (p[1] - e.c[1]) / e.r[1], (p[2] - e.c[2]) / e.r[2])
const inEll = (p: V3, e: Ell, k = 1) => ellR(p, e) < k
const inHead = (p: V3, k = 1) => inEll(p, SHAPE.cranium, k) || inEll(p, SHAPE.jaw, k)
const inNeck = (p: V3, k = 1) => p[1] > SHAPE.neck.y0 && p[1] < SHAPE.neck.y1 + 0.3 && Math.hypot(p[0] / SHAPE.neck.rx, (p[2] - SHAPE.neck.cz) / SHAPE.neck.rz) < k
const ellNormal = (p: V3, e: Ell): V3 => nrm([(p[0] - e.c[0]) / e.r[0] ** 2, (p[1] - e.c[1]) / e.r[1] ** 2, (p[2] - e.c[2]) / e.r[2] ** 2])

/** Front of the head at (x, y): the larger z of the cranium and the jaw, with that surface's normal. */
export function frontZ(x: number, y: number): { z: number; n: V3 } | null {
  let best: { z: number; n: V3 } | null = null
  for (const e of [SHAPE.cranium, SHAPE.jaw]) {
    const k = 1 - ((x - e.c[0]) / e.r[0]) ** 2 - ((y - e.c[1]) / e.r[1]) ** 2
    if (k <= 0) continue
    const z = e.c[2] + e.r[2] * Math.sqrt(k)
    if (!best || z > best.z) best = { z, n: ellNormal([x, y, z], e) }
  }
  return best
}

/** Inside the face mask: front-facing and within the mask ellipse. */
export const maskR = (x: number, y: number) => Math.hypot(x / SHAPE.mask.mx, (y - SHAPE.mask.my) / SHAPE.mask.ry)
const inFace = (p: V3, n: V3) => n[2] > 0.25 && p[2] > 0.2 && maskR(p[0], p[1]) < 1

/** World → bust-local units. */
export const toLocal = (p: V3): V3 => [(p[0] - BRAIN_C[0]) / BRAIN_S, (p[1] - BRAIN_C[1]) / BRAIN_S, (p[2] - BRAIN_C[2]) / BRAIN_S]

/** The solid-looking volumes of the bust (head, neck, shoulders, chest) for occlusion checks. */
const OCCLUDERS: Ell[] = [
  SHAPE.cranium, SHAPE.jaw, SHAPE.trap, SHAPE.deltR, SHAPE.deltL, SHAPE.chest,
  { c: [0, -1.52, SHAPE.neck.cz], r: [SHAPE.neck.rx * 1.1, 0.5, SHAPE.neck.rz * 1.1] },
]

/**
 * Does the straight segment from a to b (world units) pass through the bust? Used to dim a label that sits behind
 * the bust, so the figure is never covered by the tag of a district standing behind it.
 */
export function bustOccludes(a: V3, b: V3): boolean {
  const A = toLocal(a), B = toLocal(b)
  for (const e of OCCLUDERS) {
    const p = [0, 1, 2].map(i => (A[i] - e.c[i]) / e.r[i]), d = [0, 1, 2].map(i => (B[i] - A[i]) / e.r[i])
    const qa = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]
    const qb = 2 * (p[0] * d[0] + p[1] * d[1] + p[2] * d[2])
    const qc = p[0] * p[0] + p[1] * p[1] + p[2] * p[2] - 1
    const disc = qb * qb - 4 * qa * qc
    if (qa === 0 || disc < 0) continue
    const s = Math.sqrt(disc), t0 = (-qb - s) / (2 * qa), t1 = (-qb + s) / (2 * qa)
    if (t1 > 0 && t0 < 1) return true
  }
  return false
}

// ---------- arms: each reaches toward its own district ----------

export interface Arm { J: V3; E: V3; W: V3; d: V3; side: 1 | -1; reach: number }

/**
 * Shoulder joint J, elbow E, then the forearm points from the elbow at the agent's district (on the plaza, just above
 * the ground), shortened so the fingertips stop near the district's edge instead of inside it.
 */
function reach(agent: string, J: V3, E: V3, maxR: number): Arm {
  const [dx, dz] = districtCenter(agent)
  const T: V3 = [dx / BRAIN_S, BUST_BASE + 0.2, dz / BRAIN_S]
  const d = nrm(sub(T, E))
  let L = 1.5
  for (let k = 0; k < 40; k++) {
    const F = add(E, mul(d, L))
    if (Math.hypot(F[0], F[2]) <= maxR || L < 0.9) break
    L -= 0.02
  }
  const forearm = L - 0.48
  return { J, E, W: add(E, mul(d, forearm)), d, side: J[0] > 0 ? 1 : -1, reach: L }
}

export const ARMS: Record<'arm_right' | 'arm_left', Arm> = {
  // Elbows forward of the chest, not out to the side, so each forearm visibly points along the plaza at its district.
  arm_right: reach('gtm', [1.5, -2.14, -0.06], [1.66, -2.74, 0.62], 2.45),
  arm_left: reach('brand', [-1.5, -2.14, -0.06], [-1.72, -2.74, 0.55], 2.6),
}

interface Hand { palm: { c: V3; f: V3; s: V3; u: V3 }; fingers: V3[][] }

/** Palm down, fingers spread a little, thumb on the side toward the chest. */
export function handOf(a: Arm): Hand {
  const f = a.d
  let s = nrm(cross(f, [0, 1, 0]))
  if (!Number.isFinite(s[0])) s = [1, 0, 0]
  const u = cross(s, f)
  const c = add(a.W, mul(f, 0.16))
  const fingers: V3[][] = []
  const offs = [-0.1, -0.035, 0.035, 0.1], lens = [0.2, 0.25, 0.24, 0.19]
  offs.forEach((o, i) => {
    const base = add(add(a.W, mul(f, 0.3)), mul(s, o))
    const dir = nrm(add(f, mul(s, o * 1.2)))
    const pts: V3[] = []
    for (let k = 0; k <= 6; k++) {
      const t = k / 6
      pts.push(add(add(base, mul(dir, lens[i] * t)), mul(u, -0.06 * t * t)))
    }
    fingers.push(pts)
  })
  // The thumb: from the heel of the palm, out to the side nearer the body's midline, then forward.
  const inward = s[0] * a.side < 0 ? 1 : -1
  const t0 = add(add(a.W, mul(f, 0.06)), mul(s, inward * 0.11))
  const thumb: V3[] = []
  for (let k = 0; k <= 6; k++) {
    const t = k / 6
    thumb.push(add(add(add(t0, mul(s, inward * 0.1 * t)), mul(f, 0.16 * t)), mul(u, -0.03 * t)))
  }
  fingers.push(thumb)
  return { palm: { c, f, s, u }, fingers }
}

// ---------- the heart ----------

const HEART_TILT = { z: -0.42, x: -0.35 }
function heartLocal(t: number, s: number, side: number): V3 {
  const hx = (16 * Math.sin(t) ** 3) / 17
  const hy = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 + 0.15
  const z = side * 0.6 * Math.sqrt(Math.max(0, 1 - s * s))
  return [s * hx, s * hy, z]
}
function heartPlace(q: V3): V3 {
  const k = SHAPE.heart.size
  // tilt the apex to the bust's left (−x) and forward (+z)
  const cz = Math.cos(HEART_TILT.z), sz = Math.sin(HEART_TILT.z), cx = Math.cos(HEART_TILT.x), sx = Math.sin(HEART_TILT.x)
  let [x, y, z] = q
  ;[x, y] = [x * cz - y * sz, x * sz + y * cz]
  ;[y, z] = [y * cx - z * sx, y * sx + z * cx]
  return add(SHAPE.heart.c, [x * k, y * k, z * k])
}

// ---------- sampling ----------

type R = () => number
const gauss = (r: R) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2831853 * r())
const dir = (r: R): V3 => nrm([gauss(r), gauss(r), gauss(r)])
const onEll = (r: R, e: Ell) => { const u = dir(r); const p: V3 = [e.c[0] + e.r[0] * u[0], e.c[1] + e.r[1] * u[1], e.c[2] + e.r[2] * u[2]]; return { p, n: ellNormal(p, e) } }
const jitter = (r: R, p: V3, k: number): V3 => [p[0] + gauss(r) * k, p[1] + gauss(r) * k, p[2] + gauss(r) * k]

interface Sample { p: V3; n: V3; g: number; kind: number; part: number; rank?: number }
interface Poly { part: number; pts: V3[]; g: number[] }

/** A point along a polyline by arc length fraction t. */
function along(pts: V3[], t: number): V3 {
  const seg: number[] = []
  let total = 0
  for (let i = 1; i < pts.length; i++) { const l = len(sub(pts[i], pts[i - 1])); seg.push(l); total += l }
  let d = t * total
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) return lerp(pts[i], pts[i + 1], seg[i] ? Math.min(1, d / seg[i]) : 0)
    d -= seg[i]
  }
  return pts[pts.length - 1]
}

const curve = (n: number, f: (t: number) => V3): V3[] => Array.from({ length: n + 1 }, (_, i) => f(i / n))

/** Smooth a few control points into a polyline (Catmull-Rom). */
function spline(ctrl: V3[], per = 8): V3[] {
  const out: V3[] = []
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)]
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t
      out.push([0, 1, 2].map(c => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)) as V3)
    }
  }
  out.push(ctrl[ctrl.length - 1])
  return out
}

/** Growth coordinate per part: the order in which a part assembles as its tasks are verified. */
const G = {
  crown: (p: V3) => clamp01((p[1] + 1.36) / 2.4),               // from the jaw up to the crown
  neck: (p: V3) => clamp01((p[1] - SHAPE.neck.y0) / (SHAPE.neck.y1 - SHAPE.neck.y0)), // from the shoulders up
  lungs: (p: V3) => clamp01((p[1] + 3.1) / 1.6),                 // a breath, filling from the diaphragm up
  spine: (p: V3) => 0.4 * clamp01((p[1] - BUST_BASE) / (-1.9 - BUST_BASE)), // spine base first
  shoulder: (p: V3) => 0.4 + 0.6 * clamp01((Math.abs(p[0]) - 0.3) / 1.6), // then out from the neck
  chest: (p: V3) => clamp01((-1.8 - p[1]) / (-1.8 - BUST_BASE)), // top down, rib by rib
}

const RIBS = 9
function ribPoint(k: number, side: number, u: number): V3 {
  const y0 = -1.98 - k * 0.12
  const y = y0 - 0.18 * u
  const e = SHAPE.chest
  const q = Math.sqrt(Math.max(0.05, 1 - ((y - e.c[1]) / e.r[1]) ** 2))
  const a = 0.9 * e.r[0] * q, b = 0.88 * e.r[2] * q
  const end = Math.acos(Math.min(0.95, 0.18 / a))
  const th = -Math.PI / 2 + u * (end + Math.PI / 2)
  return [side * a * Math.cos(th), y, e.c[2] + b * Math.sin(th)]
}

function spinePoint(y: number): V3 {
  const e = SHAPE.chest
  const q = Math.sqrt(Math.max(0, 1 - ((y - e.c[1]) / e.r[1]) ** 2))
  return [0, y, e.c[2] - 0.8 * e.r[2] * q]
}

function clavicle(side: number, t: number): V3 {
  const a: V3 = [side * 0.1, -1.97, 0.5], b: V3 = [side * 1.38, -2.0, 0.02]
  const p = lerp(a, b, t)
  return [p[0], p[1] + 0.05 * Math.sin(Math.PI * t), p[2] + 0.1 * Math.sin(Math.PI * t * 0.8)]
}

const BRONCHI: V3[][] = [
  [[0, -1.55, 0.06], [0, -1.85, 0.04], [0, -2.1, 0.0]],
  ...[1, -1].flatMap(s => [
    [[0, -2.1, 0], [s * 0.2, -2.2, -0.03], [s * 0.42, -2.3, -0.06]],
    [[s * 0.42, -2.3, -0.06], [s * 0.5, -2.1, -0.08], [s * 0.56, -1.92, -0.1]],
    [[s * 0.42, -2.3, -0.06], [s * 0.6, -2.45, 0.02], [s * 0.72, -2.55, 0.06]],
    [[s * 0.42, -2.3, -0.06], [s * 0.5, -2.6, -0.1], [s * 0.52, -2.88, -0.14]],
  ] as V3[][]),
]

const VESSELS: V3[][] = [
  // aorta: up from the heart, arching back over to the spine
  [[-0.16, -2.2, 0.2], [-0.1, -2.0, 0.18], [0.02, -1.94, 0.02], [0.06, -2.04, -0.24], [0.06, -2.3, -0.36]],
  // pulmonary trunk
  [[-0.24, -2.22, 0.3], [-0.2, -2.06, 0.22], [-0.38, -2.08, 0.04]],
  [[-0.2, -2.06, 0.22], [0.1, -2.1, 0.06], [0.34, -2.16, -0.02]],
]

/** Tube along J→E→W (upper arm and forearm): position, normal and arc length at parameter t along segment i. */
function armTube(a: Arm, t: number, phi: number) {
  const segs: [V3, V3, number, number][] = [[a.J, a.E, 0.27, 0.21], [a.E, a.W, 0.2, 0.13]]
  const l0 = len(sub(a.E, a.J)), l1 = len(sub(a.W, a.E))
  const total = l0 + l1
  const d = t * total
  const [A, B, r0, r1] = d <= l0 ? segs[0] : segs[1]
  const k = d <= l0 ? d / l0 : (d - l0) / l1
  const ax = nrm(sub(B, A))
  let u = nrm(cross(ax, [0, 1, 0]))
  if (!Number.isFinite(u[0])) u = [1, 0, 0]
  const v = cross(ax, u)
  const n = add(mul(u, Math.cos(phi)), mul(v, Math.sin(phi)))
  const rad = r0 + (r1 - r0) * k
  return { p: add(lerp(A, B, k), mul(n, rad)), n, s: d }
}
const armLength = (a: Arm) => len(sub(a.E, a.J)) + len(sub(a.W, a.E)) + 0.5

/**
 * The opening fly-in: each particle leaves its scatter position once the scene's assemble clock (0..1, it stops at 1)
 * passes start + spread * rnd, and lands dur later. Every particle must have landed by assemble = 1. The shader in
 * Bust.tsx is written from these numbers; flyIn mirrors it for the tests.
 */
export const FLY = { start: 0.3, spread: 0.4, dur: 0.28 } as const
export const flyIn = (assemble: number, rnd: number) => Math.min(1, Math.max(0, (assemble - FLY.start - rnd * FLY.spread) / FLY.dur))

export interface BustInput { count: number; seed: number }
export interface BustOutput {
  count: number
  /** World positions (assembled), start positions, per-particle (part, rank, kind, random), surface normals (0 for curves). */
  pos: Float32Array
  scatter: Float32Array
  info: Float32Array
  nrm: Float32Array
  /** Wireframe ghost: segment endpoints (world) and per-vertex (part, rank). */
  lines: Float32Array
  lineInfo: Float32Array
  /** Per part: where a stream lands and where a label anchors (world). */
  anchors: Float32Array
  /** Particles per part (body tissue only), for tests. */
  perPart: number[]
}

/** Share of the particle budget per kind of tissue. The rest is a faint aura inside the bust. */
const SHARE = {
  crown: 0.2, mask: 0.05, eyes: 0.014, browNose: 0.012, mouth: 0.01, neck: 0.05, shoulders: 0.12, ribcage: 0.15,
  lungs: 0.12, heart: 0.07, arm: 0.085,
}

export function buildBust({ count, seed }: BustInput): BustOutput {
  const r = mulberry32(seed)
  const N = count
  const samples: Sample[] = []
  const P = (name: BustPart) => BUST_PARTS.indexOf(name)
  const want = (share: number) => Math.max(8, Math.floor(N * share))
  const push = (part: number, p: V3, n: V3, g: number, kind: number = KIND.body) => samples.push({ p, n, g, kind, part })

  /** Rejection sampler with a hard cap so a bad shape never loops forever. */
  const fill = (n: number, gen: () => boolean) => { let made = 0; for (let k = 0; made < n && k < n * 40; k++) if (gen()) made++ }

  // crown and skull: the head's shell outside the face mask and the neck
  fill(want(SHARE.crown), () => {
    const useCran = r() < 0.78
    const e = useCran ? SHAPE.cranium : SHAPE.jaw
    const { p, n } = onEll(r, e)
    if (inEll(p, useCran ? SHAPE.jaw : SHAPE.cranium, 0.995) || inFace(p, n) || inNeck(p, 0.95)) return false
    push(P('crown'), p, n, G.crown(p))
    return true
  })

  // the face mask: featureless and translucent; its edge (stored in rank) fades out
  fill(want(SHARE.mask), () => {
    const x = (r() * 2 - 1) * SHAPE.mask.mx, y = SHAPE.mask.my + (r() * 2 - 1) * SHAPE.mask.ry
    const m = maskR(x, y)
    if (m >= 1) return false
    const f = frontZ(x, y)
    if (!f) return false
    push(FACE, [x, y, f.z + 0.01], f.n, m, KIND.mask)
    return true
  })

  // face features, drawn only as revenue arrives (rank = position along the stroke, for a drawing-in reveal)
  const onFace = (x: number, y: number, lift = 0.014): V3 => { const f = frontZ(x, y); return [x, y, (f?.z ?? 1) + lift] }
  const eyeCurves: V3[][] = [], browNose: V3[][] = [], mouth: V3[][] = []
  for (const s of [1, -1]) {
    const cx = s * 0.34, cy = -0.5
    eyeCurves.push(curve(28, t => onFace(cx + 0.18 * Math.cos(Math.PI * t), cy + 0.075 * Math.sin(Math.PI * t))))
    eyeCurves.push(curve(28, t => onFace(cx + 0.18 * Math.cos(Math.PI * t), cy - 0.05 * Math.sin(Math.PI * t))))
    eyeCurves.push(curve(20, t => onFace(cx + 0.05 * Math.cos(2 * Math.PI * t), cy + 0.05 * Math.sin(2 * Math.PI * t), 0.02)))
    browNose.push(curve(24, t => { const x = s * (0.14 + 0.44 * t); return onFace(x, -0.3 + 0.055 * Math.sin(Math.PI * Math.min(1, t * 1.15)) - 0.03 * t, 0.03) }))
    browNose.push(curve(14, t => { const a = Math.PI * (0.5 + 1.15 * t); return onFace(s * (0.075 + 0.05 * Math.cos(a) * s), -0.88 + 0.045 * Math.sin(a), 0.07) }))
  }
  browNose.push(curve(24, t => { const y = -0.4 - 0.46 * t; const p = onFace(0, y); return [0, y, p[2] + 0.13 * t * t + 0.01] }))
  mouth.push(curve(30, t => { const x = -0.3 + 0.6 * t; return onFace(x, -1.08 + 0.022 * (1 - (x / 0.3) ** 2) - 0.014 * Math.exp(-((x / 0.05) ** 2)), 0.02) }))
  mouth.push(curve(30, t => { const x = -0.3 + 0.6 * t; return onFace(x, -1.1 - 0.012 * (1 - (x / 0.3) ** 2), 0.02) }))
  mouth.push(curve(30, t => { const x = -0.26 + 0.52 * t; return onFace(x, -1.12 - 0.065 * (1 - (x / 0.26) ** 2), 0.02) }))
  const strokes = (list: V3[][], n: number, kind: number, pupil = false) => {
    for (let i = 0; i < n; i++) {
      const c = list[i % list.length], t = r()
      push(FACE, jitter(r, along(c, t), 0.006), ZERO, t, kind)
    }
    if (pupil) for (const s of [1, -1]) for (let i = 0; i < Math.max(6, n / 10); i++) push(FACE, jitter(r, onFace(s * 0.34, -0.5, 0.025), 0.012), ZERO, 0.5, kind)
  }
  // The face is the smallest, most important detail: a floor keeps its strokes legible on a phone's small budget.
  strokes(eyeCurves, Math.max(360, want(SHARE.eyes)), KIND.eyes, true)
  strokes(browNose, Math.max(300, want(SHARE.browNose)), KIND.browNose)
  strokes(mouth, Math.max(260, want(SHARE.mouth)), KIND.mouth)

  // neck: a column from the shoulders up under the skull
  fill(want(SHARE.neck), () => {
    const nk = SHAPE.neck
    const y = nk.y0 + r() * (nk.y1 - nk.y0), th = r() * 6.2831853
    const flare = 1 + 0.35 * smooth(-1.62, -1.95, y)
    const rx = nk.rx * flare, rz = nk.rz * flare
    const p: V3 = [rx * Math.cos(th), y, nk.cz + rz * Math.sin(th)]
    if (inHead(p, 0.99) || inEll(p, SHAPE.trap, 0.98)) return false
    push(P('neck'), p, nrm([Math.cos(th) / rx, 0, Math.sin(th) / rz]), G.neck(p))
    return true
  })

  // shoulders and spine base: trapezius, deltoids, clavicles, and the spine from the base up
  const sh = P('shoulders'), nSh = want(SHARE.shoulders)
  fill(Math.floor(nSh * 0.42), () => {
    const { p, n } = onEll(r, SHAPE.trap)
    if (n[1] < -0.25 || inEll(p, SHAPE.chest, 0.995) || inNeck(p, 0.98) || inEll(p, SHAPE.deltR, 0.98) || inEll(p, SHAPE.deltL, 0.98)) return false
    push(sh, p, n, G.shoulder(p))
    return true
  })
  fill(Math.floor(nSh * 0.28), () => {
    const e = r() < 0.5 ? SHAPE.deltR : SHAPE.deltL
    const { p, n } = onEll(r, e)
    if (inEll(p, SHAPE.chest, 0.99) || inEll(p, SHAPE.trap, 0.99)) return false
    push(sh, p, n, G.shoulder(p))
    return true
  })
  for (let i = 0; i < Math.floor(nSh * 0.1); i++) {
    const s = r() < 0.5 ? 1 : -1, p = jitter(r, clavicle(s, r()), 0.018)
    push(sh, p, ZERO, G.shoulder(p))
  }
  const VERT = 13
  for (let i = 0; i < Math.floor(nSh * 0.2); i++) {
    const k = Math.floor(r() * VERT), y = BUST_BASE + 0.06 + (k / (VERT - 1)) * (-1.9 - BUST_BASE - 0.06)
    const c = spinePoint(y), th = r() * 6.2831853
    const p: V3 = r() < 0.75 ? [c[0] + 0.075 * Math.cos(th), y + gauss(r) * 0.012, c[2] + 0.06 * Math.sin(th)] : [gauss(r) * 0.012, y - r() * 0.05, c[2] - 0.07 - r() * 0.08]
    push(sh, p, ZERO, G.spine(p))
  }

  // ribcage: nine ribs each side, the sternum, and a sparse chest skin, filling top down
  const rc = P('ribcage'), nRc = want(SHARE.ribcage)
  for (let i = 0; i < Math.floor(nRc * 0.58); i++) {
    const k = Math.floor(r() * RIBS), s = r() < 0.5 ? 1 : -1, u = r()
    push(rc, jitter(r, ribPoint(k, s, u), 0.014), ZERO, (k + u * 0.6) / RIBS)
  }
  for (let i = 0; i < Math.floor(nRc * 0.07); i++) {
    const y = -1.98 - r() * 0.86
    const e = SHAPE.chest, q = Math.sqrt(Math.max(0, 1 - ((y - e.c[1]) / e.r[1]) ** 2))
    const p: V3 = [gauss(r) * 0.03, y, e.c[2] + 0.88 * e.r[2] * q]
    push(rc, p, ZERO, G.chest(p))
  }
  fill(nRc - Math.floor(nRc * 0.58) - Math.floor(nRc * 0.07), () => {
    const { p, n } = onEll(r, SHAPE.chest)
    if (p[1] < BUST_BASE || inEll(p, SHAPE.trap, 0.99) || inEll(p, SHAPE.deltR) || inEll(p, SHAPE.deltL) || inNeck(p)) return false
    push(rc, p, n, G.chest(p))
    return true
  })

  // lungs: two lobes (medial sides flattened, a notch for the heart) and the bronchial tree, filling bottom up
  const lu = P('lungs'), nLu = want(SHARE.lungs)
  const lobe = (p: V3, e: Ell): V3 => {
    const s = Math.sign(e.c[0])
    const q: V3 = [...p]
    if (s * (q[0] - e.c[0]) < 0) q[0] = e.c[0] + (q[0] - e.c[0]) * 0.62
    return q
  }
  const nearHeart = (p: V3) => len(sub(p, SHAPE.heart.c)) < SHAPE.heart.size * 1.25
  fill(Math.floor(nLu * 0.62), () => {
    const e = r() < 0.5 ? SHAPE.lungR : SHAPE.lungL
    const { p: raw, n } = onEll(r, e)
    const p = lobe(raw, e)
    if (nearHeart(p)) return false
    push(lu, p, n, G.lungs(p))
    return true
  })
  fill(Math.floor(nLu * 0.2), () => {
    const e = r() < 0.5 ? SHAPE.lungR : SHAPE.lungL
    const u = dir(r), k = Math.cbrt(r()) * 0.88
    const p = lobe([e.c[0] + e.r[0] * u[0] * k, e.c[1] + e.r[1] * u[1] * k, e.c[2] + e.r[2] * u[2] * k], e)
    if (nearHeart(p)) return false
    push(lu, p, ZERO, G.lungs(p))
    return true
  })
  const bronchi = BRONCHI.map(c => spline(c, 6))
  for (let i = 0; i < nLu - Math.floor(nLu * 0.62) - Math.floor(nLu * 0.2); i++) {
    const p = jitter(r, along(bronchi[Math.floor(r() * bronchi.length)], r()), 0.016)
    push(lu, p, ZERO, G.lungs(p))
  }

  // heart: grows from its centre outward; the great vessels come last
  const he = P('heart'), nHe = want(SHARE.heart)
  for (let i = 0; i < Math.floor(nHe * 0.72); i++) {
    const t = r() * 6.2831853, s = Math.sqrt(r()), side = r() < 0.5 ? 1 : -1
    const q = heartLocal(t, s, side)
    push(he, heartPlace(q), nrm(sub(heartPlace(mul(q, 1.1)), heartPlace(q))), s * 0.85)
  }
  for (let i = 0; i < Math.floor(nHe * 0.12); i++) {
    const t = r() * 6.2831853, s = Math.sqrt(r()) * 0.8, side = r() < 0.5 ? 1 : -1
    const q = mul(heartLocal(t, s, side), r())
    push(he, heartPlace(q), ZERO, s * 0.85)
  }
  const vessels = VESSELS.map(c => spline(c, 6))
  for (let i = 0; i < nHe - Math.floor(nHe * 0.72) - Math.floor(nHe * 0.12); i++) {
    const t = r()
    push(he, jitter(r, along(vessels[Math.floor(r() * vessels.length)], t), 0.02), ZERO, 0.85 + 0.15 * t)
  }

  // arms: shoulder to fingertips
  for (const name of ['arm_right', 'arm_left'] as const) {
    const a = ARMS[name], part = P(name), nA = want(SHARE.arm), total = armLength(a), hand = handOf(a)
    const tubeLen = total - 0.5
    for (let i = 0; i < Math.floor(nA * 0.66); i++) {
      const { p, n, s } = armTube(a, r(), r() * 6.2831853)
      push(part, p, n, s / total)
    }
    for (let i = 0; i < Math.floor(nA * 0.12); i++) {
      const { c, f, s, u } = hand.palm, w = dir(r)
      const p = add(add(add(c, mul(f, 0.17 * w[0])), mul(s, 0.14 * w[1])), mul(u, 0.05 * w[2]))
      push(part, p, nrm(add(add(mul(f, w[0] / 0.17), mul(s, w[1] / 0.14)), mul(u, w[2] / 0.05))), (tubeLen + 0.16 + 0.17 * w[0]) / total)
    }
    for (let i = 0; i < nA - Math.floor(nA * 0.66) - Math.floor(nA * 0.12); i++) {
      const fi = Math.floor(r() * hand.fingers.length), t = r()
      push(part, jitter(r, along(hand.fingers[fi], t), 0.022), ZERO, Math.min(1, (tubeLen + 0.3 + 0.2 * t) / total))
    }
  }

  // aura: a few faint motes inside the bust's volume
  while (samples.length < N) {
    const a = r() * 6.2831853, rad = Math.sqrt(r()) * 1.7, y = BUST_BASE + r() * 4.2
    push(0, [Math.cos(a) * rad, y, Math.sin(a) * rad * 0.8], ZERO, r(), KIND.aura)
  }
  samples.length = N

  // ---------- ranks: a part's built share is exactly its share of particles (sorted by growth coordinate) ----------
  const gSorted: number[][] = BUST_PARTS.map(() => [])
  const perPart = BUST_PARTS.map(() => 0)
  for (const s of samples) if (s.kind === KIND.body) { gSorted[s.part].push(s.g); perPart[s.part]++ }
  gSorted.forEach(list => list.sort((a, b) => a - b))
  const rankOf = (part: number, g: number) => {
    const list = gSorted[part]
    if (!list.length) return clamp01(g)
    let lo = 0, hi = list.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m] < g) lo = m + 1; else hi = m }
    return Math.min(0.9999, lo / list.length)
  }

  const pos = new Float32Array(N * 3), scatter = new Float32Array(N * 3), info = new Float32Array(N * 4), nrmA = new Float32Array(N * 3)
  const anchorSum = new Float64Array(N_PARTS * 4)
  samples.forEach((s, i) => {
    const w = toWorld(s.p)
    pos.set(w, i * 3)
    nrmA.set(s.n, i * 3)
    const a = r() * 6.2831853, rr = 30 + r() * 45
    scatter.set([Math.cos(a) * rr, BRAIN_C[1] * 0.5 + (r() - 0.3) * 50, Math.sin(a) * rr], i * 3)
    const rank = s.kind === KIND.body ? rankOf(s.part, s.g + (r() - 0.5) * 0.01) : s.g
    info.set([s.part, rank, s.kind, r()], i * 4)
    if (s.kind === KIND.body || s.kind === KIND.mask) {
      anchorSum[s.part * 4] += w[0]; anchorSum[s.part * 4 + 1] += w[1]; anchorSum[s.part * 4 + 2] += w[2]; anchorSum[s.part * 4 + 3]++
    }
  })
  const anchors = new Float32Array(N_PARTS * 3)
  for (let i = 0; i < N_PARTS; i++) for (let c = 0; c < 3; c++) anchors[i * 3 + c] = anchorSum[i * 4 + c] / Math.max(1, anchorSum[i * 4 + 3])

  // ---------- the wireframe ghost ----------
  const polys: Poly[] = []
  const poly = (part: number, pts: V3[], g: (p: V3, t: number) => number) => {
    if (pts.length > 1) polys.push({ part, pts, g: pts.map((p, i) => g(p, i / (pts.length - 1))) })
  }
  /** Split a closed or open ring wherever a predicate drops points, keeping each visible run as its own polyline. */
  const runs = (part: number, pts: V3[], keep: (p: V3) => boolean, g: (p: V3, t: number) => number) => {
    let run: V3[] = []
    for (const p of pts) { if (keep(p)) run.push(p); else { poly(part, run, g); run = [] } }
    poly(part, run, g)
  }
  const ring = (c: V3, rx: number, rz: number, y: number, n = 64): V3[] => curve(n, t => [c[0] + rx * Math.cos(t * 6.2831853), y, c[2] + rz * Math.sin(t * 6.2831853)])
  const ellRing = (e: Ell, y: number, n = 64) => { const q = Math.sqrt(Math.max(0, 1 - ((y - e.c[1]) / e.r[1]) ** 2)); return ring(e.c, e.r[0] * q, e.r[2] * q, y, n) }
  const crownG = (p: V3) => G.crown(p)
  const notFace = (p: V3) => !(p[2] > 0.2 && maskR(p[0], p[1]) < 1.04)

  // crown: latitude rings and meridians of the skull, broken around the face
  for (const y of [0.92, 0.75, 0.52, 0.26, 0.0, -0.28]) runs(P('crown'), ellRing(SHAPE.cranium, y, 72), p => notFace(p) && !inEll(p, SHAPE.jaw, 0.99), crownG)
  for (const y of [-0.6, -0.95]) runs(P('crown'), ellRing(SHAPE.jaw, y, 56), p => notFace(p) && !inEll(p, SHAPE.cranium, 0.99), crownG)
  for (let m = 0; m < 12; m++) {
    const phi = (m / 12) * 6.2831853, e = SHAPE.cranium
    const pts = curve(30, t => { const psi = Math.PI / 2 - t * (Math.PI / 2 + 0.55); return [e.c[0] + e.r[0] * Math.cos(psi) * Math.cos(phi), e.c[1] + e.r[1] * Math.sin(psi), e.c[2] + e.r[2] * Math.cos(psi) * Math.sin(phi)] })
    runs(P('crown'), pts, notFace, crownG)
  }
  // face: the mask's outline only (featureless)
  poly(FACE, curve(64, t => { const a = t * 6.2831853; const x = SHAPE.mask.mx * Math.cos(a) * 0.985, y = SHAPE.mask.my + SHAPE.mask.ry * Math.sin(a) * 0.985; return onFace(x, y, 0.01) }), () => 1)
  // neck
  for (const y of [-1.9, -1.72, -1.54, -1.36, -1.18]) {
    const flare = 1 + 0.35 * smooth(-1.62, -1.95, y)
    runs(P('neck'), ring([0, 0, SHAPE.neck.cz], SHAPE.neck.rx * flare, SHAPE.neck.rz * flare, y, 40), p => !inHead(p, 0.99), p => G.neck(p))
  }
  for (let m = 0; m < 8; m++) {
    const th = (m / 8) * 6.2831853
    runs(P('neck'), curve(12, t => { const y = SHAPE.neck.y0 + t * (SHAPE.neck.y1 - SHAPE.neck.y0); const f = 1 + 0.35 * smooth(-1.62, -1.95, y); return [SHAPE.neck.rx * f * Math.cos(th), y, SHAPE.neck.cz + SHAPE.neck.rz * f * Math.sin(th)] }), p => !inHead(p, 0.99), p => G.neck(p))
  }
  // shoulders: the trapezius ridge, deltoid caps, clavicles, the spine
  const trapRidge = curve(48, t => { const x = -1.5 + 3 * t; const e = SHAPE.trap; const q = Math.sqrt(Math.max(0, 1 - (x / e.r[0]) ** 2)); return [x, e.c[1] + e.r[1] * q * 0.96, e.c[2]] })
  runs(sh, trapRidge, p => !inNeck(p, 1.02), p => G.shoulder(p))
  for (const z of [0.25, -0.45]) runs(sh, curve(48, t => { const x = -1.45 + 2.9 * t; const e = SHAPE.trap; const q = Math.max(0, 1 - (x / e.r[0]) ** 2 - ((z) / e.r[2]) ** 2); return [x, e.c[1] + e.r[1] * Math.sqrt(q), e.c[2] + z] }), p => !inNeck(p, 1.02) && !inEll(p, SHAPE.chest, 0.99), p => G.shoulder(p))
  for (const e of [SHAPE.deltR, SHAPE.deltL]) for (const y of [-1.92, -2.08, -2.24]) runs(sh, ellRing(e, y, 36), p => !inEll(p, SHAPE.chest, 0.99) && !inEll(p, SHAPE.trap, 0.99), p => G.shoulder(p))
  for (const s of [1, -1]) poly(sh, curve(20, t => clavicle(s, t)), p => G.shoulder(p))
  poly(sh, curve(24, t => spinePoint(BUST_BASE + 0.02 + t * (-1.9 - BUST_BASE))), p => G.spine(p))
  for (let k = 0; k < VERT; k++) { const y = BUST_BASE + 0.06 + (k / (VERT - 1)) * (-1.9 - BUST_BASE - 0.06); const c = spinePoint(y); poly(sh, ring(c, 0.075, 0.06, y, 12), p => G.spine(p)) }
  // ribcage: every rib, the sternum, the base of the bust
  for (let k = 0; k < RIBS; k++) for (const s of [1, -1]) poly(rc, curve(28, t => ribPoint(k, s, t)), (_, t) => (k + t * 0.6) / RIBS)
  poly(rc, curve(12, t => { const y = -1.98 - t * 0.86; const e = SHAPE.chest; const q = Math.sqrt(Math.max(0, 1 - ((y - e.c[1]) / e.r[1]) ** 2)); return [0, y, e.c[2] + 0.88 * e.r[2] * q] }), p => G.chest(p))
  for (const y of [BUST_BASE + 0.005, -2.55, -2.05]) runs(rc, ellRing(SHAPE.chest, y, 72), p => !inEll(p, SHAPE.deltR) && !inEll(p, SHAPE.deltL) && !inEll(p, SHAPE.trap, 0.99), p => G.chest(p))
  // lungs: contours of each lobe and the bronchial tree
  for (const e of [SHAPE.lungR, SHAPE.lungL]) {
    for (const y of [-2.85, -2.55, -2.25, -1.98]) runs(lu, ellRing(e, y, 40).map(p => lobe(p, e)), p => !nearHeart(p), p => G.lungs(p))
    for (let m = 0; m < 4; m++) {
      const phi = (m / 4) * Math.PI
      runs(lu, curve(40, t => { const a = t * 6.2831853; return lobe([e.c[0] + e.r[0] * Math.sin(a) * Math.cos(phi), e.c[1] + e.r[1] * Math.cos(a), e.c[2] + e.r[2] * Math.sin(a) * Math.sin(phi)], e) }), p => !nearHeart(p), p => G.lungs(p))
    }
  }
  bronchi.forEach(b => poly(lu, b, p => G.lungs(p)))
  // heart: three nested outlines and the great vessels
  for (const [s, side] of [[1, 1], [0.7, 1], [0.7, -1], [0.4, 1]] as const) poly(he, curve(64, t => heartPlace(heartLocal(t * 6.2831853, s, side))), () => s * 0.85)
  vessels.forEach(v => poly(he, v, (_, t) => 0.85 + 0.15 * t))
  // arms: rings along the tube, four seams, the hand
  for (const name of ['arm_right', 'arm_left'] as const) {
    const a = ARMS[name], part = P(name), total = armLength(a), hand = handOf(a)
    const tubeLen = total - 0.5
    for (let k = 0; k <= 14; k++) poly(part, curve(20, t => armTube(a, k / 14, t * 6.2831853).p), () => ((k / 14) * tubeLen) / total)
    for (let m = 0; m < 4; m++) poly(part, curve(28, t => armTube(a, t, (m / 4) * 6.2831853 + 0.4).p), (_, t) => (t * tubeLen) / total)
    hand.fingers.forEach(f => poly(part, f, (_, t) => Math.min(1, (tubeLen + 0.3 + 0.2 * t) / total)))
    const { c, f, s } = hand.palm
    poly(part, curve(24, t => { const q = t * 6.2831853; return add(add(c, mul(f, 0.17 * Math.cos(q))), mul(s, 0.14 * Math.sin(q))) }), () => (tubeLen + 0.16) / total)
  }

  let nSeg = 0
  for (const pl of polys) nSeg += pl.pts.length - 1
  const lines = new Float32Array(nSeg * 6), lineInfo = new Float32Array(nSeg * 4)
  let v = 0
  for (const pl of polys) {
    for (let i = 1; i < pl.pts.length; i++) {
      for (const j of [i - 1, i]) {
        lines.set(toWorld(pl.pts[j]), v * 3)
        lineInfo.set([pl.part, pl.part === FACE ? 0.999 : rankOf(pl.part, pl.g[j])], v * 2)
        v++
      }
    }
  }

  return { count: N, pos, scatter, info, nrm: nrmA, lines, lineInfo, anchors, perPart }
}
