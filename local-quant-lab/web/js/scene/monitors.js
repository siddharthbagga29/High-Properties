// Desk monitors drawn into canvases (used as textures on the 3D floor). Text only from the desk record.
import { wrap, deskState, HUES } from "./floor-model.js";

const TONE = { ok: "#3ee6a0", warn: "#ffb547", bad: "#ff5d73", muted: "#9592bb", info: "#8fe6ff" };
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function frame(ctx, w, h, hue, title) {
  ctx.fillStyle = "#070519"; ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(43,240,255,0.06)"); g.addColorStop(1, "rgba(139,107,255,0.05)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = hue; ctx.fillRect(0, 0, w, 38);
  ctx.fillStyle = "#07051a"; ctx.font = `700 22px ${MONO}`; ctx.textBaseline = "middle";
  ctx.fillText(title, 14, 20);
  ctx.strokeStyle = hue; ctx.globalAlpha = 0.6; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, w - 3, h - 3); ctx.globalAlpha = 1;
  ctx.textBaseline = "alphabetic";
}
const kicker = (ctx, text, x, y) => { ctx.fillStyle = "#8fe6ff"; ctx.font = `600 16px ${MONO}`; ctx.fillText(text, x, y); };

/** The main screen: task, detail, result, state. */
export function drawMain(ctx, w, h, d) {
  const hue = HUES[d.key] || "#2bf0ff";
  frame(ctx, w, h, hue, `${d.name} · ${d.title}`.slice(0, 40).toUpperCase());
  kicker(ctx, d.active ? "WORKING ON" : d.queued ? "QUEUED" : "TASK", 16, 70);
  ctx.fillStyle = "#efeee8"; ctx.font = `600 26px ${MONO}`;
  wrap(d.task, 34, 2).forEach((l, i) => ctx.fillText(l, 16, 102 + i * 31));
  ctx.fillStyle = "#9592bb"; ctx.font = `400 18px ${MONO}`;
  wrap(d.detail, 48, 2).forEach((l, i) => ctx.fillText(l, 16, 170 + i * 23));
  kicker(ctx, "RESULT", 16, 236);
  ctx.fillStyle = TONE[d.tone] || "#efeee8"; ctx.font = `600 22px ${MONO}`;
  wrap(d.result, 40, 2).forEach((l, i) => ctx.fillText(l, 16, 266 + i * 27));
  ctx.fillStyle = d.active ? "#2bf0ff" : "#9592bb"; ctx.font = `500 17px ${MONO}`;
  ctx.fillText((d.active ? "● " : "○ ") + deskState(d).slice(0, 46), 16, h - 14);
}

/** Left screen: three metrics. */
export function drawMetrics(ctx, w, h, d) {
  const hue = HUES[d.key] || "#2bf0ff";
  frame(ctx, w, h, hue, "METRICS");
  (d.metrics || []).slice(0, 3).forEach(([k, v], i) => {
    const y = 78 + i * 74;
    ctx.fillStyle = "#9592bb"; ctx.font = `500 17px ${MONO}`; ctx.fillText(String(k).toUpperCase(), 16, y);
    ctx.fillStyle = "#efeee8"; ctx.font = `700 36px ${MONO}`; ctx.fillText(String(v).slice(0, 14), 16, y + 40);
  });
}

/** Right screen: the desk's recent audit events, or the paper equity sparkline. */
export function drawLog(ctx, w, h, d, lines, series) {
  const hue = HUES[d.key] || "#2bf0ff";
  frame(ctx, w, h, hue, series ? "EQUITY · SIMULATED" : "ACTIVITY LOG");
  if (series && series.length > 1) {
    const lo = Math.min(...series), hi = Math.max(...series), span = hi - lo || 1;
    ctx.strokeStyle = "#3ee6a0"; ctx.lineWidth = 3; ctx.beginPath();
    series.forEach((v, i) => { const x = 16 + (i / (series.length - 1)) * (w - 32), y = h - 40 - ((v - lo) / span) * (h - 110); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = "#9592bb"; ctx.font = `500 16px ${MONO}`; ctx.fillText(`${Math.round(series[series.length - 1]).toLocaleString("en-US")} · replay of synthetic bars`, 16, h - 12);
    return;
  }
  ctx.font = `400 17px ${MONO}`;
  const rows = lines.slice(-7);
  if (!rows.length) { ctx.fillStyle = "#9592bb"; ctx.fillText("no events for this desk yet", 16, 76); return; }
  rows.forEach((e, i) => {
    const sev = e.severity === "critical" ? "#ff5d73" : e.severity === "warning" ? "#ffb547" : "#8fe6ff";
    ctx.fillStyle = "#9592bb"; ctx.fillText(String(e.t).slice(11, 16), 16, 72 + i * 30);
    ctx.fillStyle = sev; ctx.fillText(String(e.kind).slice(0, 15), 82, 72 + i * 30);
    ctx.fillStyle = "#c2bfdc"; ctx.fillText(String(e.message).slice(0, 20), 250, 72 + i * 30);
  });
}

/** Ticker band on the wall: the real audit stream, not prices. */
export function drawTicker(ctx, w, h, events) {
  ctx.fillStyle = "#05030f"; ctx.fillRect(0, 0, w, h);
  ctx.font = `600 ${Math.round(h * 0.55)}px ${MONO}`; ctx.textBaseline = "middle";
  let x = 20;
  const items = events.length ? events.slice(-14).reverse() : [{ kind: "audit", message: "no events yet", severity: "info" }];
  for (let k = 0; x < w && k < 60; k++) {
    const e = items[k % items.length];
    const sev = e.severity === "critical" ? "#ff5d73" : e.severity === "warning" ? "#ffb547" : "#2bf0ff";
    const head = `◆ ${String(e.t || "").slice(11, 16)} ${e.kind} `, body = `${String(e.message).slice(0, 70)}   `;
    ctx.fillStyle = sev; ctx.fillText(head, x, h / 2); x += ctx.measureText(head).width;
    ctx.fillStyle = "#efeee8"; ctx.fillText(body, x, h / 2); x += ctx.measureText(body).width;
  }
}

/** Small nameplate / sign texture. */
export function drawSign(ctx, w, h, text, hue) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(7,5,26,0.85)"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = hue; ctx.lineWidth = 4; ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.fillStyle = hue; ctx.font = `800 ${Math.round(h * 0.5)}px ${MONO}`; ctx.textBaseline = "middle"; ctx.textAlign = "center";
  ctx.fillText(text, w / 2, h / 2 + 2);
  ctx.textAlign = "start";
}
