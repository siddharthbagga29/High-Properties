// Plain SVG charts. Geometry only: every value comes from the caller's data.
import { esc } from "./format.js";

const C = { grid: "rgba(143,230,255,.08)", text: "#8f8bb5" };

export function line(svg, dates, series, opts = {}) {
  const W = svg.clientWidth || 600, H = svg.clientHeight || 200, P = { l: opts.left ?? 56, r: 10, t: 20, b: 20 };
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const all = series.flatMap((s) => s.values).filter((v) => v !== null && Number.isFinite(v));
  if (!all.length) { svg.innerHTML = `<text x="12" y="24" class="ct">no data</text>`; return; }
  let lo = Math.min(...all), hi = Math.max(...all);
  if (opts.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (hi === lo) { hi += 1; lo -= 1; }
  const n = dates.length, x = (i) => P.l + (i / Math.max(1, n - 1)) * (W - P.l - P.r), y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  let o = "";
  for (let k = 0; k <= 4; k++) {
    const v = lo + (k / 4) * (hi - lo), yy = y(v);
    o += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" stroke="${C.grid}"/><text class="ct" x="${P.l - 6}" y="${yy + 3}" text-anchor="end">${esc(opts.fmt ? opts.fmt(v) : v.toFixed(2))}</text>`;
  }
  [0, Math.floor(n / 2), n - 1].forEach((i, k) => { if (dates[i]) o += `<text class="ct" x="${x(i)}" y="${H - 5}" text-anchor="${["start", "middle", "end"][k]}">${esc(dates[i])}</text>`; });
  for (const s of series) {
    const d = s.values.map((v, i) => (v === null || !Number.isFinite(v) ? "" : `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join("");
    if (s.fill) o += `<path d="${d}L${x(n - 1)},${y(opts.zero ? 0 : lo)}L${x(0)},${y(opts.zero ? 0 : lo)}Z" fill="${s.color}" fill-opacity=".12"/>`;
    o += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.w || 1.4}" ${s.dash ? 'stroke-dasharray="4 3"' : ""} vector-effect="non-scaling-stroke"><title>${esc(s.name)}</title></path>`;
  }
  for (const m of opts.markers || []) {
    const i = dates.indexOf(m.date); if (i < 0 || !Number.isFinite(m.value)) continue;
    const yy = y(m.value), up = m.side === "BUY";
    o += `<path d="M${x(i)},${yy + (up ? 9 : -9)}l-4,${up ? 6 : -6}h8z" fill="${up ? "var(--ok)" : "var(--bad)"}"><title>${esc(`${m.side} ${m.qty} @ ${m.price.toFixed(2)} on ${m.date}`)}</title></path>`;
  }
  o += series.map((s, k) => `<text class="ct legend" x="${P.l + 4 + k * 160}" y="12" style="fill:${s.color}">${esc(s.name)}</text>`).join("");
  svg.innerHTML = o;
}

export function spark(values, { w = 120, h = 28, color = "var(--cyan)", fill = true } = {}) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const lo = Math.min(...v), hi = Math.max(...v) || lo + 1, span = hi - lo || 1;
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 2 - ((x - lo) / span) * (h - 4)).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${fill ? `<path d="M0,${h} L${pts.join(" L")} L${w},${h} Z" fill="${color}" fill-opacity=".12"/>` : ""}<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="1.3" vector-effect="non-scaling-stroke"/></svg>`;
}

/** Horizontal bars against a limit. rows: [{label, ratio (0..1+ or null), text}] */
export function guards(rows) {
  return rows.map((r) => {
    const w = r.ratio === null || r.ratio === undefined ? 0 : Math.min(1, Math.max(0, r.ratio));
    const t = r.ratio === null || r.ratio === undefined ? "none" : r.ratio >= 0.9 ? "bad" : r.ratio >= 0.6 ? "warn" : "ok";
    return `<div class="guard"><span class="g-l">${esc(r.label)}</span><span class="g-bar ${t}" role="img" aria-label="${esc(r.label)}: ${esc(r.text)}"><i style="width:${(w * 100).toFixed(1)}%"></i></span><span class="g-v num">${esc(r.text)}</span></div>`;
  }).join("");
}

/** Ring gauge (0..1). */
export function ring(ratio, { size = 44, color = "var(--cyan)", label = "" } = {}) {
  const r = size / 2 - 4, c = 2 * Math.PI * r, f = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="rgba(255,255,255,.08)" stroke-width="3" fill="none"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="3" fill="none" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})" stroke-linecap="round"/></svg>`;
}
