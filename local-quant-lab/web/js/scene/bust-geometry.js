// The supervisor's holographic bust, after the Perspective Engine city's Jarvis body (perspective-engine/city/src/scene/
// bust.ts): head, jaw, neck, shoulders and chest sampled as surface points, with the brain inside the cranium. Pure
// maths, deterministic for a seed, shared by the renderer and the node tests.
//
// The body is the supervisor's form, drawn as an outline: it is not data. The FACE is data: it stays a featureless mask
// until a trading edge is proven (the brain's EDGE region), then gains eyes, brow and nose, and a mouth (faceStage).
import { BRAIN_C, BRAIN_S, mulberry32 } from "./brain-geometry.js";

/** Local units are brain units from the brain centre; +y up, +z towards the default camera. */
export const SHAPE = {
  cranium: { c: [0, 0.06, -0.04], r: [1.16, 0.97, 1.2] },
  jaw: { c: [0, -0.64, 0.14], r: [0.8, 0.74, 0.92] },
  trap: { c: [0, -1.98, -0.14], r: [1.5, 0.3, 0.52] },
  deltR: { c: [1.5, -2.14, -0.06], r: [0.38, 0.4, 0.4] },
  deltL: { c: [-1.5, -2.14, -0.06], r: [0.38, 0.4, 0.4] },
  chest: { c: [0, -2.5, -0.04], r: [1.22, 0.92, 0.72] },
  neck: { cz: -0.1, rx: 0.4, rz: 0.36, y0: -1.95, y1: -1.1 },
  mask: { mx: 0.74, my: -0.52, ry: 0.86 },
};
/** The bust stands on the podium: its base is BASE brain units below the brain centre. */
export const BASE = -3.0;
/** Point kinds. Features (2..4) light one face stage each. */
export const KIND = { body: 0, mask: 1, eyes: 2, browNose: 3, mouth: 4 };
/** Where the supervisor's dispatch core sits (chest, local units). */
export const CORE = [0, -2.38, 0.62];

const HULL = ["cranium", "jaw", "trap", "deltR", "deltL", "chest"];
const AREA = { cranium: 0.27, jaw: 0.09, neck: 0.07, trap: 0.15, deltR: 0.05, deltL: 0.05, chest: 0.32 };
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2831853 * r());
const ellR = (p, e) => Math.hypot((p[0] - e.c[0]) / e.r[0], (p[1] - e.c[1]) / e.r[1], (p[2] - e.c[2]) / e.r[2]);
const ellN = (p, e) => nrm([(p[0] - e.c[0]) / e.r[0] ** 2, (p[1] - e.c[1]) / e.r[1] ** 2, (p[2] - e.c[2]) / e.r[2] ** 2]);
const inNeck = (p, k = 1) => p[1] > SHAPE.neck.y0 && p[1] < SHAPE.neck.y1 + 0.3 && Math.hypot(p[0] / SHAPE.neck.rx, (p[2] - SHAPE.neck.cz) / SHAPE.neck.rz) < k;
/** Inside another part of the hull (so internal surfaces are not drawn). */
const buried = (p, self) => HULL.some((k) => k !== self && ellR(p, SHAPE[k]) < 0.985) || (self !== "neck" && inNeck(p, 0.97));
export const maskR = (x, y) => Math.hypot(x / SHAPE.mask.mx, (y - SHAPE.mask.my) / SHAPE.mask.ry);

/** Front surface of the head at (x, y): the larger z of the cranium and the jaw, with its normal. */
export function frontZ(x, y) {
  let best = null;
  for (const e of [SHAPE.cranium, SHAPE.jaw]) {
    const k = 1 - ((x - e.c[0]) / e.r[0]) ** 2 - ((y - e.c[1]) / e.r[1]) ** 2;
    if (k <= 0) continue;
    const z = e.c[2] + e.r[2] * Math.sqrt(k);
    if (!best || z > best.z) best = { z, n: ellN([x, y, z], e) };
  }
  return best;
}

/** Face features as polylines in (x, y) on the front of the head, one list per stage. */
function featureCurves() {
  const arc = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
  const eyes = [-1, 1].map((s) => arc(40, (t) => [s * 0.3 + 0.14 * Math.cos(t * 6.2832), -0.42 + 0.055 * Math.sin(t * 6.2832)]));
  const pupils = [-1, 1].map((s) => arc(14, (t) => [s * 0.3 + 0.03 * Math.cos(t * 6.2832), -0.42 + 0.03 * Math.sin(t * 6.2832)]));
  const brows = [-1, 1].map((s) => arc(24, (t) => [s * (0.12 + 0.36 * t), -0.27 + 0.05 * Math.sin(t * 3.1416) - 0.02 * t]));
  const nose = [arc(20, (t) => [0.012 * Math.sin(t * 3.1416), -0.36 - 0.36 * t]), arc(16, (t) => [-0.09 + 0.18 * t, -0.74 + 0.025 * Math.sin(t * 3.1416)])];
  const mouth = [arc(30, (t) => [-0.23 + 0.46 * t, -0.97 + 0.03 * ((t - 0.5) * 2) ** 2]), arc(24, (t) => [-0.16 + 0.32 * t, -1.03 - 0.025 * Math.sin(t * 3.1416)])];
  return { [KIND.eyes]: [...eyes, ...pupils], [KIND.browNose]: [...brows, ...nose], [KIND.mouth]: mouth };
}

/** Face stage from the EDGE region's formed fraction: 0 mask, 1 eyes, 2 brow and nose, 3 mouth. */
export function faceStage(edgeFormed) {
  const e = Number(edgeFormed) || 0;
  return e >= 0.9 ? 3 : e >= 0.5 ? 2 : e > 0 ? 1 : 0;
}

/**
 * Build the bust: { count, pos: Float32Array(3n) world, normal: Float32Array(3n), info: Float32Array(2n) [kind, rnd],
 * perKind }. About 7% of the points draw the face features.
 */
export function buildBust(count, { seed = 11 } = {}) {
  const r = mulberry32(seed);
  const pos = new Float32Array(count * 3), normal = new Float32Array(count * 3), info = new Float32Array(count * 2);
  const perKind = [0, 0, 0, 0, 0];
  let p = 0;
  const put = (q, n, kind) => {
    pos[p * 3] = BRAIN_C[0] + q[0] * BRAIN_S; pos[p * 3 + 1] = BRAIN_C[1] + q[1] * BRAIN_S; pos[p * 3 + 2] = BRAIN_C[2] + q[2] * BRAIN_S;
    normal[p * 3] = n[0]; normal[p * 3 + 1] = n[1]; normal[p * 3 + 2] = n[2];
    info[p * 2] = kind; info[p * 2 + 1] = r(); perKind[kind]++; p++;
  };
  // face features
  const curves = featureCurves();
  const nFeat = Math.round(count * 0.07), share = { [KIND.eyes]: 0.4, [KIND.browNose]: 0.35, [KIND.mouth]: 0.25 };
  for (const kind of [KIND.eyes, KIND.browNose, KIND.mouth]) {
    const lines = curves[kind], n = Math.round(nFeat * share[kind]);
    for (let i = 0; i < n; i++) {
      const line = lines[Math.floor(r() * lines.length)], t = r() * (line.length - 1), j = Math.floor(t), f = t - j;
      const a = line[j], b = line[Math.min(j + 1, line.length - 1)];
      const x = a[0] + (b[0] - a[0]) * f + gauss(r) * 0.006, y = a[1] + (b[1] - a[1]) * f + gauss(r) * 0.006;
      const fz = frontZ(x, y);
      if (fz) put([x + fz.n[0] * 0.012, y + fz.n[1] * 0.012, fz.z + fz.n[2] * 0.012], fz.n, kind);
    }
  }
  // the hull: surface points of each part, minus what is buried inside another part or below the base
  const parts = Object.keys(AREA), cum = [];
  parts.reduce((a, k) => { cum.push(a + AREA[k]); return a + AREA[k]; }, 0);
  let guard = 0;
  while (p < count && guard++ < count * 40) {
    const x = r() * cum[cum.length - 1];
    const part = parts[cum.findIndex((c) => x <= c)];
    let q, n;
    if (part === "neck") {
      const a = r() * 6.2831853, y = SHAPE.neck.y0 + r() * (SHAPE.neck.y1 + 0.3 - SHAPE.neck.y0);
      q = [Math.cos(a) * SHAPE.neck.rx, y, SHAPE.neck.cz + Math.sin(a) * SHAPE.neck.rz]; n = nrm([Math.cos(a), 0, Math.sin(a)]);
    } else {
      const e = SHAPE[part], u = nrm([gauss(r), gauss(r), gauss(r)]);
      q = [e.c[0] + e.r[0] * u[0], e.c[1] + e.r[1] * u[1], e.c[2] + e.r[2] * u[2]]; n = ellN(q, e);
    }
    if (q[1] < BASE || buried(q, part)) continue;
    const face = (part === "cranium" || part === "jaw") && n[2] > 0.25 && q[2] > 0.2 && maskR(q[0], q[1]) < 1;
    put(q, n, face ? KIND.mask : KIND.body);
  }
  while (p < count) put([0, BASE, 0], [0, 1, 0], KIND.body);   // only if sampling ran dry (never at sane counts)
  return { count, pos, normal, info, perKind };
}

/** World-space anchors used by the renderer (labels, beams, hit volumes). */
export const toWorld = (q) => [BRAIN_C[0] + q[0] * BRAIN_S, BRAIN_C[1] + q[1] * BRAIN_S, BRAIN_C[2] + q[2] * BRAIN_S];
export const BUST_TOP = toWorld([0, SHAPE.cranium.c[1] + SHAPE.cranium.r[1], 0])[1];
export const BUST_HALF_WIDTH = (SHAPE.deltR.c[0] + SHAPE.deltR.r[0]) * BRAIN_S;
