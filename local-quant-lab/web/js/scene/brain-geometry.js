// Brain point cloud: pure maths shared by the worker, the renderer and the node tests. Adapted from the Perspective
// Engine city's cortex model (perspective-engine/city/src/scene/world.ts): two hemispheres with gyri, lobes, a deep
// core and white-matter tracts. Deterministic for a given (count, seed).
//
// Every neuron belongs to one REGION (one kind of verified work, see lql/console.py BRAIN_REGIONS) and carries an
// ORDER in [0, 1): the renderer lights a neuron when order < formed(region). Inside a region, low orders sit near the
// region's seed and later ones spread outwards, so a region visibly grows from a nucleus as evidence accumulates.

export const REGIONS = ["supervisor", "engineer", "reviewer", "critic", "research", "data", "risk", "paper", "hermes", "edge"];
/** Fallback shares if the server sends none (must match lql/console.py BRAIN_REGIONS). */
export const SHARES = { supervisor: 0.10, engineer: 0.14, reviewer: 0.05, critic: 0.10, research: 0.10, data: 0.07, risk: 0.09, paper: 0.09, hermes: 0.06, edge: 0.20 };
/** Hemisphere and lobe per region. Left: build and control. Right: research and execution. Deep: the orchestrator. */
export const LOBES = {
  engineer: [-1, "frontal"], data: [-1, "parietal"], risk: [-1, "occipital"], reviewer: [-1, "temporal"],
  research: [1, "frontal"], critic: [1, "parietal"], paper: [1, "occipital"], hermes: [1, "temporal"],
  supervisor: [0, "deep"], edge: [0, "core"],
};
export const BRAIN_S = 10.5;              // one brain unit in world units (the cortex spans about ±1)
export const BRAIN_C = [0, 33.1, 0];      // inside the supervisor's holographic head (bust base on the podium at y 1.6)        // centre of the brain, above the supervisor's podium
export const NEURON_SHARE = 0.86, TRACT_SHARE = 0.08;   // the rest is a faint aura

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2831853 * r());
const dir = (r) => norm([gauss(r), gauss(r), gauss(r)]);

function lobeOf(u, side) {
  const lateral = u[0] * side;
  if (u[2] < -0.5) return "occipital";
  if (u[1] < -0.12 && lateral > 0.28 && u[2] < 0.48) return "temporal";
  if (u[2] > 0.2) return "frontal";
  return "parietal";
}
function cortex(u, side, rj) {
  const gyri = 0.06 * Math.sin(u[0] * 13 + Math.sin(u[2] * 9) * 2.2) * Math.sin(u[1] * 11 + u[2] * 6.5) + 0.028 * Math.sin(u[2] * 23 + u[1] * 17);
  const r = (1 + gyri) * rj;
  let x = side * 0.46 + u[0] * 0.56 * r;
  let y = u[1] * 0.68 * r;
  const z = u[2] * 1.02 * r;
  if (u[1] < -0.1 && u[0] * side > 0.2) y -= 0.07;
  if (y < -0.44) y = -0.44 + (y + 0.44) * 0.3;
  if (side * x < 0.04) x = side * (0.04 + Math.abs(x) * 0.06);
  return [BRAIN_C[0] + x * BRAIN_S, BRAIN_C[1] + y * BRAIN_S, BRAIN_C[2] + z * BRAIN_S];
}
function lobeDir(r, side, lobe, seed, spread) {
  for (let k = 0; k < 24; k++) {
    const u = norm([seed[0] + gauss(r) * spread, seed[1] + gauss(r) * spread, seed[2] + gauss(r) * spread]);
    if (lobeOf(u, side) === lobe) return u;
  }
  return seed;
}
function seedFor(r, side, lobe) {
  for (let k = 0; k < 200; k++) { const u = dir(r); if (lobeOf(u, side) === lobe) return u; }
  return dir(r);
}
/** Deep structures (the orchestrator): thalamus-like ellipsoids either side of the midline and the brain stem;
 * grows from the front of the midline backwards as t increases. */
function deep(r, t) {
  if (r() < 0.8) {
    const side = r() < 0.5 ? -1 : 1;
    const z = 0.3 - 0.6 * t + gauss(r) * 0.09;
    const x = side * (0.09 + Math.abs(gauss(r)) * 0.06);
    const y = 0.02 + gauss(r) * 0.07 + 0.08 * (1 - Math.min(1, Math.abs(z) / 0.6));
    return [BRAIN_C[0] + x * BRAIN_S, BRAIN_C[1] + y * BRAIN_S, BRAIN_C[2] + z * BRAIN_S];
  }
  const y = -0.25 - r() * 0.7 * (0.3 + 0.7 * t);
  const rad = 0.08 * (1 - (y + 0.25) * 0.45) * Math.sqrt(r());
  const a = r() * 6.2831853;
  return [BRAIN_C[0] + Math.cos(a) * rad * BRAIN_S, BRAIN_C[1] + y * BRAIN_S, BRAIN_C[2] + (-0.2 + Math.sin(a) * rad) * BRAIN_S];
}
/** The EDGE core: a dense orb at the centre of the brain that fills from the middle outwards. */
function core(r, t) {
  const u = dir(r), rad = 0.24 * Math.cbrt(Math.max(t, 1e-4)) * (0.75 + 0.25 * r());
  return [BRAIN_C[0] + u[0] * rad * BRAIN_S, BRAIN_C[1] + (0.06 + u[1] * rad * 0.9) * BRAIN_S, BRAIN_C[2] + (0.08 + u[2] * rad) * BRAIN_S];
}

/** Integer neuron counts per region, summing exactly to round(total * NEURON_SHARE). */
export function regionCounts(total, shares) {
  shares = shares || SHARES;
  const nN = Math.round(total * NEURON_SHARE);
  const sum = REGIONS.reduce((a, k) => a + (shares[k] ?? 0), 0) || 1;
  const counts = REGIONS.map((k) => Math.floor((nN * (shares[k] ?? 0)) / sum));
  let rest = nN - counts.reduce((a, b) => a + b, 0);
  for (let i = 0; rest > 0; i = (i + 1) % counts.length, rest--) counts[i]++;
  return counts;
}

/**
 * Build the cloud. Returns { count, pos: Float32Array(3n), info: Float32Array(4n) [region, order, kind, rnd],
 * counts, centroids: Float32Array(3 * regions) }. kind: 0 neuron, 1 white-matter tract (info[1] = second region), 2 aura.
 */
export function buildBrain(total, { seed = 7, shares } = {}) {
  shares = shares || SHARES;
  const r = mulberry32(seed);
  const pos = new Float32Array(total * 3), info = new Float32Array(total * 4);
  const counts = regionCounts(total, shares);
  const sums = new Float64Array(REGIONS.length * 4);
  let p = 0;
  const put = (b, region, order, kind) => {
    pos[p * 3] = b[0]; pos[p * 3 + 1] = b[1]; pos[p * 3 + 2] = b[2];
    info[p * 4] = region; info[p * 4 + 1] = order; info[p * 4 + 2] = kind; info[p * 4 + 3] = r();
    p++;
  };
  REGIONS.forEach((key, ri) => {
    const [side, lobe] = LOBES[key];
    const n = counts[ri];
    const sd = lobe === "deep" || lobe === "core" ? null : seedFor(r, side, lobe);
    for (let j = 0; j < n; j++) {
      const t = j / n;
      let b;
      if (lobe === "deep") b = deep(r, t);
      else if (lobe === "core") b = core(r, t);
      else b = cortex(lobeDir(r, side, lobe, sd, 0.06 + 0.75 * t), side, 0.95 + r() * 0.06);
      put(b, ri, t, 0);
      sums[ri * 4] += b[0]; sums[ri * 4 + 1] += b[1]; sums[ri * 4 + 2] += b[2]; sums[ri * 4 + 3]++;
    }
  });
  const centroids = new Float32Array(REGIONS.length * 3);
  for (let i = 0; i < REGIONS.length; i++) for (let c = 0; c < 3; c++) centroids[i * 3 + c] = sums[i * 4 + 3] ? sums[i * 4 + c] / sums[i * 4 + 3] : BRAIN_C[c];
  const nT = Math.round(total * TRACT_SHARE);
  for (let j = 0; j < nT && p < total; j++) {
    const a = Math.floor(r() * REGIONS.length), b2 = Math.floor(r() * REGIONS.length), u = r(), m = 1 - u;
    const A = [0, 1, 2].map((c) => centroids[a * 3 + c]), B = [0, 1, 2].map((c) => centroids[b2 * 3 + c]);
    const pt = [0, 1, 2].map((c) => m * m * A[c] + 2 * m * u * (BRAIN_C[c] + (A[c] + B[c] - 2 * BRAIN_C[c]) * 0.15) + u * u * B[c] + gauss(r) * 0.1);
    put(pt, a, b2, 1);                         // tracts: info = [region A, region B, 1, rnd]
  }
  while (p < total) {
    const u = dir(r), rr = 1.08 + Math.pow(r(), 2) * 0.55;
    put([BRAIN_C[0] + u[0] * BRAIN_S * rr * 0.78, BRAIN_C[1] + u[1] * BRAIN_S * rr * 0.62, BRAIN_C[2] + u[2] * BRAIN_S * rr * 1.02], 0, 0, 2);
  }
  return { count: total, pos, info, counts, centroids };
}

/** Neurons formed for given per-region fractions (what the HUD reports). */
export function formedNeurons(counts, formed) {
  return counts.reduce((a, c, i) => a + Math.floor(c * Math.min(1, Math.max(0, formed[i] || 0))), 0);
}

/** Quality presets (neurons). "auto" picks from the device; Safari reports no deviceMemory. */
export const QUALITY = { low: 150_000, medium: 400_000, high: 1_000_000, ultra: 2_000_000 };
export function autoQuality({ cores = 4, memory = null, mobile = false } = {}) {
  if (mobile) return "low";
  const mem = memory ?? (cores >= 8 ? 8 : 4);
  if (cores >= 8 && mem >= 8) return "high";
  if (cores >= 4 && mem >= 4) return "medium";
  return "low";
}
