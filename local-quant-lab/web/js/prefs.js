// Per-viewer preferences in localStorage (sound off by default). Storage may be unavailable (private window): every
// access is guarded and the defaults always work.
export const DEFAULTS = Object.freeze({ sound: false, volume: 0.35, texture: false, motion: "system", view: "overview" });
const KEY = "lql.prefs.v1";
const MOTIONS = ["system", "full", "reduced"];
const VIEWS = ["overview", "graph", "data", "research", "paper", "logs", "system"];

export function sanitize(p) {
  const o = { ...DEFAULTS };
  if (!p || typeof p !== "object") return o;
  if (typeof p.sound === "boolean") o.sound = p.sound;
  if (typeof p.texture === "boolean") o.texture = p.texture;
  if (Number.isFinite(p.volume)) o.volume = Math.min(1, Math.max(0, p.volume));
  if (MOTIONS.includes(p.motion)) o.motion = p.motion;
  if (VIEWS.includes(p.view)) o.view = p.view;
  return o;
}
export function load(storage) {
  try { return sanitize(JSON.parse(storage.getItem(KEY) || "null")); } catch { return { ...DEFAULTS }; }
}
export function save(storage, p) {
  try { storage.setItem(KEY, JSON.stringify(sanitize(p))); return true; } catch { return false; }
}
/** Effective reduced-motion flag from the preference and the OS setting. */
export const reducedMotion = (pref, osReduced) => pref === "reduced" || (pref === "system" && !!osReduced);
