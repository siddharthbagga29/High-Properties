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
    let pen = false;   // a gap (null) lifts the pen: the next point starts a new subpath with M
    const d = s.values.map((v, i) => { if (v === null || !Number.isFinite(v)) { pen = false; return ""; } const c = `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; return c; }).join("");
    if (s.fill && d) { const f = s.values.findIndex((v) => v !== null && Number.isFinite(v)); o += `<path d="${d}L${x(n - 1)},${y(opts.zero ? 0 : lo)}L${x(f)},${y(opts.zero ? 0 : lo)}Z" fill="${s.color}" fill-opacity=".12"/>`; }
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

/** Histogram {lo, width, counts} as bars; `mark` draws a labelled vertical line at a value (e.g. the actual result). */
export function bars(svg, h, opts = {}) {
  const W = svg.clientWidth || 600, H = svg.clientHeight || 160, P = { l: 40, r: 10, t: 18, b: 20 };
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  if (!h.counts.length) { svg.innerHTML = `<text x="12" y="24" class="ct">no data</text>`; return; }
  const n = h.counts.length, max = Math.max(...h.counts) || 1, bw = (W - P.l - P.r) / n;
  const x = (v) => P.l + ((v - h.lo) / (h.width * n)) * (W - P.l - P.r), y = (c) => P.t + (1 - c / max) * (H - P.t - P.b);
  const fmt = opts.fmt || ((v) => v.toFixed(2));
  let o = `<line x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}" stroke="${C.grid}"/>`;
  o += `<text class="ct" x="${P.l - 6}" y="${P.t + 3}" text-anchor="end">${max}</text><text class="ct" x="${P.l - 6}" y="${H - P.b}" text-anchor="end">0</text>`;
  h.counts.forEach((c, i) => { o += `<rect x="${(P.l + i * bw + 0.5).toFixed(1)}" y="${y(c).toFixed(1)}" width="${Math.max(0.5, bw - 1).toFixed(1)}" height="${(H - P.b - y(c)).toFixed(1)}" fill="${opts.color || "var(--violet)"}" fill-opacity=".75"><title>${esc(`${fmt(h.lo + i * h.width)} to ${fmt(h.lo + (i + 1) * h.width)}: ${c}`)}</title></rect>`; });
  [0, n / 2, n].forEach((k, j) => { o += `<text class="ct" x="${x(h.lo + k * h.width)}" y="${H - 5}" text-anchor="${["start", "middle", "end"][j]}">${esc(fmt(h.lo + k * h.width))}</text>`; });
  for (const m of opts.marks || []) {
    if (!Number.isFinite(m.value)) continue;
    const xx = Math.max(P.l, Math.min(W - P.r, x(m.value)));
    o += `<line x1="${xx}" x2="${xx}" y1="${P.t}" y2="${H - P.b}" stroke="${m.color || "var(--amber)"}" stroke-dasharray="3 2"/><text class="ct" x="${xx + 3}" y="${P.t + 8}" style="fill:${m.color || "var(--amber)"}">${esc(m.label)}</text>`;
  }
  if (opts.legend) o += `<text class="ct legend" x="${P.l + 4}" y="11">${esc(opts.legend)}</text>`;
  svg.innerHTML = o;
}

/** Monte Carlo fan: percentile bands over path steps, the median, and the actual (normalised) equity. */
export function fan(svg, f, actual, opts = {}) {
  const W = svg.clientWidth || 600, H = svg.clientHeight || 220, P = { l: 48, r: 10, t: 20, b: 20 };
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const steps = f.step, last = steps[steps.length - 1] || 1;
  const all = [...f.p5, ...f.p95, ...actual.map((a) => a[1])].filter(Number.isFinite);
  if (!all.length) { svg.innerHTML = `<text x="12" y="24" class="ct">no data</text>`; return; }
  let lo = Math.min(...all, 1), hi = Math.max(...all, 1);
  if (hi === lo) { hi += 0.1; lo -= 0.1; }
  const x = (s) => P.l + (s / last) * (W - P.l - P.r), y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const path = (vals) => vals.map((v, i) => `${i ? "L" : "M"}${x(steps[i]).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const band = (a, b) => `${path(a)}${b.map((v, i) => `L${x(steps[b.length - 1 - i]).toFixed(1)},${y(b[b.length - 1 - i]).toFixed(1)}`).join("")}Z`;
  let o = "";
  for (let k = 0; k <= 4; k++) { const v = lo + (k / 4) * (hi - lo); o += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}"/><text class="ct" x="${P.l - 6}" y="${y(v) + 3}" text-anchor="end">x${v.toFixed(2)}</text>`; }
  o += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(1)}" y2="${y(1)}" stroke="rgba(255,255,255,.25)" stroke-dasharray="2 3"/>`;
  o += `<path d="${band(f.p5, f.p95)}" fill="var(--violet)" fill-opacity=".14"><title>5th to 95th percentile</title></path>`;
  o += `<path d="${band(f.p25, f.p75)}" fill="var(--violet)" fill-opacity=".28"><title>25th to 75th percentile</title></path>`;
  o += `<path d="${path(f.p50)}" fill="none" stroke="var(--violet-2)" stroke-width="1.6" vector-effect="non-scaling-stroke"><title>median path value</title></path>`;
  if (actual.length) o += `<path d="${actual.map(([s, v], i) => `${i ? "L" : "M"}${x(s).toFixed(1)},${y(v).toFixed(1)}`).join("")}" fill="none" stroke="var(--amber)" stroke-width="1.4" vector-effect="non-scaling-stroke"><title>the backtest itself</title></path>`;
  o += `<text class="ct" x="${P.l}" y="${H - 5}">day 0</text><text class="ct" x="${W - P.r}" y="${H - 5}" text-anchor="end">day ${last}</text>`;
  o += `<text class="ct legend" x="${P.l + 4}" y="12" style="fill:var(--violet-2)">median, 25-75%, 5-95% of ${esc(opts.paths ?? "")} paths</text><text class="ct legend" x="${P.l + 300}" y="12" style="fill:var(--amber)">the backtest</text>`;
  svg.innerHTML = o;
}

/** Heatmap as an accessible table: rowLabels x colLabels, values coloured by `color(v)`, text by `fmt(v)`. */
export function heatmap(rowLabels, colLabels, values, { fmt, color, corner = "" } = {}) {
  return `<div class="scroll"><table class="heat"><thead><tr><th>${esc(corner)}</th>${colLabels.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rowLabels.map((r, i) => `<tr><th>${esc(r)}</th>${values[i].map((v) => `<td style="background:${color(v)}" title="${esc(v == null ? "no data" : fmt(v))}">${v == null ? "" : esc(fmt(v))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
