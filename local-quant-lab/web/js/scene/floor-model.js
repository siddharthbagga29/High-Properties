// Trading-floor geometry and data mapping. Pure functions (no DOM, no WebGL) so they are unit-tested under node.
import { REGIONS } from "./brain-geometry.js";

/** Bots on the floor in seat order. The supervisor stands at the podium under the brain; the founder's seat is a human. */
export const SEATS = ["engineer", "reviewer", "critic", "research", "data", "risk", "paper", "hermes", "founder"];
export const HUES = {
  supervisor: "#2bf0ff", engineer: "#6ea8ff", reviewer: "#c2adff", founder: "#ffb547", critic: "#ff7a9c",
  research: "#46e0c8", risk: "#ff8a4c", data: "#3ee6a0", hermes: "#b48cff", paper: "#f2d36b", edge: "#ffffff",
};
export const R_DESKS = 38;

/** Two banks of desks flanking the brain (left and right), like the rows of an institutional trading floor, so the
 * brain stays in clear view from the front and nothing stands behind it. Angles in degrees in the x-z plane
 * (x = cos a, z = sin a): 180 is the left bank's middle, 0 the right bank's. */
export function deskLayout(keys = SEATS, { radius = R_DESKS, spread = 104 } = {}) {
  const nL = Math.ceil(keys.length / 2), nR = keys.length - nL;
  const arc = (mid, n) => Array.from({ length: n }, (_, i) => mid + (n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1)));
  // left bank runs back-to-front (so seat order reads clockwise from the viewer), right bank front-to-back
  const angles = [...arc(180, nL).reverse().map((d) => 360 - d), ...arc(0, nR).reverse()];
  return keys.map((key, i) => {
    const a = (angles[i] * Math.PI) / 180;
    return { key, x: Math.cos(a) * radius, z: Math.sin(a) * radius, angle: a };
  });
}

/** Which desk a job is assigned to: a recheck goes to the task owner's desk, a backtest to research. */
export function deskForJob(job, owners = {}) {
  if (!job) return null;
  if (job.kind === "recheck") {
    const o = owners[job.target] || "engineer";
    return o === "founder" ? null : o;
  }
  if (job.kind === "backtest") return "research";
  return null;
}

/** Per-region formed fractions in REGIONS order from the server's brain model. */
export function formedArray(brain) {
  const by = new Map((brain?.regions || []).map((r) => [r.key, r.formed]));
  return REGIONS.map((k) => Math.min(1, Math.max(0, Number(by.get(k)) || 0)));
}
export function sharesOf(brain) {
  const o = {};
  for (const r of brain?.regions || []) o[r.key] = r.share;
  return Object.keys(o).length ? o : null;
}
/** Regions that grew between two formed arrays (index list), ignoring float noise. */
export function grown(prev, next, eps = 1e-6) {
  const out = [];
  for (let i = 0; i < next.length; i++) if ((next[i] || 0) > (prev[i] || 0) + eps) out.push(i);
  return out;
}
/** Short, honest status for a desk label. */
export function deskState(d) {
  if (!d) return "";
  if (d.active) return `working: ${d.task}`;
  if (d.queued) return `queued: ${d.task}`;
  if (d.key === "founder") return d.attention ? "waiting on you" : "clear";
  return d.status || "idle";
}
/** Wrap text into lines of at most `width` characters (monitor rendering). */
export function wrap(text, width, maxLines = 3) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) { if (cur) lines.push(cur); cur = w.length > width ? w.slice(0, width - 1) + "…" : w; }
    else cur = (cur + " " + w).trim();
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) lines[maxLines - 1] = lines[maxLines - 1].replace(/.?$/, "…");
  return lines;
}

/** Which desk an audit event belongs to (for the desk's log monitor and its flashes). */
export function eventDesk(e, owners = {}) {
  const k = e && e.kind, d = (e && e.data) || {};
  if (!k) return null;
  if (k.startsWith("job_")) return deskForJob({ kind: d.job_kind, target: d.target }, owners);
  if (k === "experiment") return "critic";
  if (k.startsWith("research_")) return "research";
  if (k === "task_transition") return "supervisor";
  if (k === "risk_rejected" || k === "kill_switch" || k === "orders_cancelled") return "risk";
  if (k.startsWith("data_") || k === "config_error") return "data";
  if (k.startsWith("order_") || k.startsWith("paper_") || k === "reconciliation_mismatch" || k.startsWith("forward_")) return "paper";
  if (k.startsWith("hermes_") || k === "fallback_used") return "hermes";
  if (k === "acceptance_regression") return owners[d.task] || "engineer";
  return null;
}
