// Pure formatting helpers. Undefined or non-finite values render as "N/A", never as a made-up number.
export const NA = "N/A";
const ok = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const pct = (v, d = 2) => (ok(v) ? (Number(v) * 100).toFixed(d) + "%" : NA);
export const num = (v, d = 2) => (ok(v) ? Number(v).toFixed(d) : NA);
export const int = (v) => (ok(v) ? Math.round(Number(v)).toLocaleString("en-US") : NA);
export const money = (v) => (ok(v) ? Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 }) : NA);
export const signed = (v, d = 2) => (ok(v) ? (v >= 0 ? "+" : "") + (Number(v) * 100).toFixed(d) + "%" : NA);
export const tone = (v) => (!ok(v) ? "" : Number(v) > 0 ? "pos" : Number(v) < 0 ? "neg" : "");
export const hash = (s, n = 12) => String(s ?? "").slice(0, n);
/** ISO timestamp -> "HH:MM:SS" (UTC) or "MM-DD HH:MM" when `withDate`. */
export function clock(iso, withDate = false) {
  if (!iso) return NA;
  const s = String(iso);
  const t = s.slice(11, 19);
  return withDate ? s.slice(5, 10) + " " + s.slice(11, 16) : t;
}
/** Elapsed seconds -> "4.2s", "3m 05s", "2h 01m". */
export function duration(sec) {
  if (!ok(sec)) return NA;
  sec = Number(sec);
  if (sec < 60) return sec.toFixed(sec < 10 ? 1 : 0) + "s";
  if (sec < 3600) return Math.floor(sec / 60) + "m " + String(Math.floor(sec % 60)).padStart(2, "0") + "s";
  return Math.floor(sec / 3600) + "h " + String(Math.floor((sec % 3600) / 60)).padStart(2, "0") + "m";
}
/** Age of an ISO timestamp relative to `now` (ms), e.g. "12s ago". */
export function ago(iso, now = Date.now()) {
  if (!iso) return NA;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return NA;
  return duration(Math.max(0, (now - t) / 1000)) + " ago";
}
