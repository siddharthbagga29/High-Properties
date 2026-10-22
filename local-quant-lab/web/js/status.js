// Semantic status vocabulary shared by every view. Each state has a text label, a tone (colour) and a glyph so that
// colour is never the only signal.
export const TASK = {
  pending: { label: "pending", tone: "muted", glyph: "○" },
  ready: { label: "ready", tone: "info", glyph: "◇" },
  in_progress: { label: "running", tone: "active", glyph: "◉" },
  done_verified: { label: "verified", tone: "ok", glyph: "✓" },
  needs_human: { label: "needs human", tone: "human", glyph: "⚑" },
  failed: { label: "failed", tone: "bad", glyph: "✕" },
  rejected_by_critic: { label: "rejected by critic", tone: "bad", glyph: "⊘" },
  blocked_external: { label: "blocked", tone: "warn", glyph: "■" },
};
export const JOB = {
  queued: { label: "queued", tone: "info", glyph: "◇" },
  running: { label: "running", tone: "active", glyph: "◉" },
  succeeded: { label: "succeeded", tone: "ok", glyph: "✓" },
  failed: { label: "failed", tone: "bad", glyph: "✕" },
  cancelled: { label: "cancelled", tone: "muted", glyph: "⊘" },
};
export const DATA_CLASS = {
  synthetic: { label: "SYNTHETIC", tone: "synthetic", glyph: "◌", note: "generated fixture, not market data" },
  provisional: { label: "PROVISIONAL", tone: "warn", glyph: "△", note: "real data, adjustment unverified: no evidence value" },
  verified: { label: "VERIFIED HISTORICAL", tone: "ok", glyph: "◆", note: "adjustment verified; historical, not live" },
  invalid: { label: "INVALID", tone: "bad", glyph: "✕", note: "failed its hash or validation check" },
  live: { label: "LIVE", tone: "bad", glyph: "●", note: "not supported in this build" },
};
export const VERDICT = {
  CANDIDATE: { tone: "ok" }, NOT_PROVEN: { tone: "warn" }, REJECTED: { tone: "bad" },
  INSUFFICIENT: { tone: "muted" }, SUSPICIOUS: { tone: "bad" },
};
export const SEVERITY = { info: "info", warning: "warn", critical: "bad" };
const FALLBACK = { label: "unknown", tone: "muted", glyph: "?" };
export const task = (s) => TASK[s] || { ...FALLBACK, label: String(s) };
export const job = (s) => JOB[s] || { ...FALLBACK, label: String(s) };
export const dataClass = (s) => DATA_CLASS[s] || { ...FALLBACK, label: String(s).toUpperCase(), note: "" };
export const verdictTone = (v) => (VERDICT[v] || { tone: "muted" }).tone;
export const severityTone = (s) => SEVERITY[s] || "info";

/** Map an audit event to a sound/notification class, or null when it should stay silent. */
export function eventCue(e) {
  const k = e && e.kind;
  if (["kill_switch", "acceptance_regression", "reconciliation_mismatch", "config_error", "forward_error"].includes(k)) return "critical";
  if (["job_failed", "data_lockout", "risk_rejected", "data_stale", "order_rejected"].includes(k)) return "warning";
  if (k === "job_finished") return "complete";
  return null;
}
