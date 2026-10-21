// Task-graph geometry and queries. Pure functions: no DOM, so they are unit-tested under node.

/** Layered layout. Layer = dependency depth (from the backend); order within a layer by the mean position of a
 * node's dependencies (barycentre) to reduce crossings. orient "LR" puts layers in columns, "TB" in rows; "auto"
 * picks the orientation that keeps a deep chain readable. Deterministic for the same input. */
export function layout(nodes, { gap = 230, step = 74, padX = 30, padY = 30, orient = "auto", w = 170, h = 52 } = {}) {
  const byLevel = new Map();
  for (const n of nodes) {
    if (!byLevel.has(n.level)) byLevel.set(n.level, []);
    byLevel.get(n.level).push(n);
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  const idx = new Map();
  for (const lv of levels) {
    const col = byLevel.get(lv);
    const key = (n) => {
      const r = n.deps.filter((d) => idx.has(d)).map((d) => idx.get(d));
      return r.length ? r.reduce((a, b) => a + b, 0) / r.length : -1;
    };
    col.sort((a, b) => key(a) - key(b) || a.id.localeCompare(b.id));
    col.forEach((n, i) => idx.set(n.id, i));
  }
  const breadth = Math.max(1, ...levels.map((lv) => byLevel.get(lv).length));
  const o = orient === "auto" ? (levels.length > breadth * 2 ? "TB" : "LR") : orient;
  const pos = {};
  for (const lv of levels) {
    const col = byLevel.get(lv);
    if (o === "LR") {
      const off = ((breadth - col.length) * step) / 2;
      col.forEach((n, i) => (pos[n.id] = { x: padX + lv * gap, y: padY + off + i * step }));
    } else {
      const colGap = w + 40, off = ((breadth - col.length) * colGap) / 2;
      col.forEach((n, i) => (pos[n.id] = { x: padX + off + i * colGap, y: padY + lv * (h + 30) }));
    }
  }
  const width = o === "LR" ? padX * 2 + Math.max(0, levels.length - 1) * gap + w : padX * 2 + breadth * (w + 40) - 40;
  const height = o === "LR" ? padY * 2 + breadth * step : padY * 2 + levels.length * (h + 30) - 30;
  return { pos, width, height, levels: levels.length, orient: o };
}

/** Polar layout for the overview dial: one ring per dependency level around the supervisor core. */
export function dial(nodes, { cx = 0, cy = 0, r0 = 70, step = 52 } = {}) {
  const byLevel = new Map();
  for (const n of nodes) {
    if (!byLevel.has(n.level)) byLevel.set(n.level, []);
    byLevel.get(n.level).push(n);
  }
  const pos = {};
  const rings = [];
  for (const [lv, col] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const r = r0 + lv * step;
    rings.push(r);
    col.slice().sort((a, b) => a.id.localeCompare(b.id)).forEach((n, i) => {
      // golden-angle offset per ring so single-task levels spiral instead of stacking on one radius
      const a = -Math.PI / 2 + lv * 2.39996 + i * ((2 * Math.PI) / col.length);
      pos[n.id] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), r, a };
    });
  }
  return { pos, rings };
}

function walk(start, next) {
  const seen = new Set();
  const stack = [...next(start)];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...next(id));
  }
  return seen;
}
export function upstream(nodes, id) {
  const m = new Map(nodes.map((n) => [n.id, n]));
  return walk(id, (x) => (m.get(x) ? m.get(x).deps : []));
}
export function downstream(nodes, id) {
  const m = new Map(nodes.map((n) => [n.id, n]));
  return walk(id, (x) => (m.get(x) ? m.get(x).dependents : []));
}
/** Filter by status set, owner and free text (id or goal). Empty filters match everything. */
export function filter(nodes, { statuses = [], owner = "", text = "" } = {}) {
  const t = text.trim().toLowerCase();
  return nodes.filter((n) => (!statuses.length || statuses.includes(n.status)) && (!owner || n.owner === owner)
    && (!t || n.id.toLowerCase().includes(t) || n.goal.toLowerCase().includes(t)));
}
/** Smooth edge path between two node boxes, along the layout's orientation. */
export function edgePath(a, b, w = 170, h = 52, orient = "LR") {
  if (orient === "TB") {
    const x1 = a.x + w / 2, y1 = a.y + h, x2 = b.x + w / 2, y2 = b.y, my = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
  }
  const x1 = a.x + w, y1 = a.y + h / 2, x2 = b.x, y2 = b.y + h / 2, mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}
/** Nearest node in a direction (left/right/up/down) for keyboard navigation. */
export function neighbour(nodes, pos, id, dir) {
  const p = pos[id];
  if (!p) return null;
  const horiz = dir === "left" || dir === "right", sign = dir === "right" || dir === "down" ? 1 : -1;
  let best = null, bestD = Infinity;
  for (const n of nodes) {
    if (n.id === id || !pos[n.id]) continue;
    const q = pos[n.id], main = (horiz ? q.x - p.x : q.y - p.y) * sign, side = Math.abs(horiz ? q.y - p.y : q.x - p.x);
    if (main <= 0) continue;
    const d = main + side * 2;
    if (d < bestD) { bestD = d; best = n.id; }
  }
  return best;
}
