"use strict";
// Control room client. Every number shown comes from /api/dashboard; nothing is computed or invented here except
// chart geometry. Undefined metrics show as N/A.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NA = "N/A";
const pct = (v, d = 2) => (v === null || v === undefined ? NA : (v * 100).toFixed(d) + "%");
const num = (v, d = 2) => (v === null || v === undefined ? NA : Number(v).toFixed(d));
const money = (v) => (v === null || v === undefined ? NA : Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }));
const sign = (v) => (v === null || v === undefined ? "" : v >= 0 ? "pos" : "neg");
let state = null;
let current = null;

async function api(path, body) {
  const opt = body ? { method: "POST", headers: { "Content-Type": "application/json", "X-LQL-Request": "1" }, body: JSON.stringify(body) } : {};
  const r = await fetch(path, opt);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
const msg = (t) => { $("msg").textContent = t; };

function chip(id, text, cls) { const e = $(id); e.textContent = text; e.className = "chip " + (cls || ""); }

function renderStatus(s) {
  chip("s-mode", "MODE " + s.execution_mode, s.settings_ok ? "ok" : "bad");
  chip("s-data", s.data_mode, "warn");
  chip("s-broker", "BROKER " + s.broker, "");
  chip("s-clock", "PAPER CLOCK " + (s.paper_clock || "not started"), "dim");
  chip("s-kill", s.kill_switch ? "KILL SWITCH ENGAGED" : "KILL SWITCH OFF", s.kill_switch ? "bad" : "ok");
  chip("s-lock", s.data_lockout ? "FEED LOCKED OUT" : "FEED VALID", s.data_lockout ? "bad" : "ok");
  chip("s-recon", s.reconciled ? "LEDGER RECONCILED" : "LEDGER MISMATCH", s.reconciled ? "ok" : "bad");
  chip("s-hermes", "HERMES " + (s.hermes.available ? "ADVISORY" : "OFF · FALLBACK"), s.hermes.available ? "ok" : "warn");
  $("s-hermes").title = s.hermes.detail;
  chip("s-time", s.server_time.slice(0, 19).replace("T", " ") + " UTC", "dim");
  $("ver").textContent = s.app_version + " · engine " + s.engine_version;
}

function fillSelect(sel, items, val) {
  const prev = sel.value;
  sel.innerHTML = items.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
  sel.value = val ?? prev ?? (items[0] && items[0][0]);
  if (!sel.value && items[0]) sel.value = items[0][0];
}

function kpis(rec) {
  const g = $("kpi-grid"), c = $("critic");
  if (!rec) { g.innerHTML = `<p class="dim">No experiment yet. Run a backtest.</p>`; c.innerHTML = ""; return; }
  const n = rec.report.net, b = rec.report.benchmark;
  $("kpi-sub").textContent = `${rec.strategy} ${JSON.stringify(rec.params)} · ${rec.instrument} · ${rec.report.source.kind} · ${rec.report.config.first} → ${rec.report.config.last}`;
  const cards = [
    ["Total return (net)", pct(n.total_return), sign(n.total_return)], ["CAGR", pct(n.cagr), sign(n.cagr)],
    ["Sharpe", num(n.sharpe), sign(n.sharpe)], ["Sortino", num(n.sortino), sign(n.sortino)],
    ["Max drawdown", pct(n.max_drawdown), "neg"], ["Ann. volatility", pct(n.ann_vol)],
    ["Round trips", n.round_trips ?? NA], ["Win rate", pct(n.win_rate, 1)], ["Profit factor", num(n.profit_factor)],
    ["Costs paid", money(n.costs)], ["Time in market", pct(n.time_in_market, 1)], ["Turnover / yr", num(n.turnover_annual)],
    ["Benchmark return", pct(b.total_return), sign(b.total_return)], ["Benchmark Sharpe", num(b.sharpe), sign(b.sharpe)],
    ["VaR 95% (day)", pct(n.var_95_daily)], ["alpha_status", rec.critic.alpha_status],
  ];
  g.innerHTML = cards.map(([k, v, cl]) => `<div class="kpi"><div class="k">${esc(k)}</div><div class="v ${cl || ""}">${esc(v)}</div></div>`).join("");
  const cr = rec.critic;
  c.innerHTML = `Critic: <span class="tag ${esc(cr.verdict)}">${esc(cr.verdict)}</span> <span class="dim">${esc(cr.note)}</span>
    <ul>${cr.blocking.map((x) => `<li class="neg">${esc(x)}</li>`).join("")}${cr.findings.map((x) => `<li>${esc(x)}</li>`).join("")}
    ${rec.report.warnings.map((x) => `<li class="dim">warning: ${esc(x)}</li>`).join("")}</ul>
    <div class="dim">config ${esc(rec.report.config_hash)} · result ${esc(rec.report.result_hash)} · ${esc(rec.report.timing)}</div>`;
}

// ---- charts (plain SVG) -------------------------------------------------------------------------------------
function lineChart(svg, dates, series, opts = {}) {
  const W = svg.clientWidth || 800, H = svg.clientHeight || 220, P = { l: 56, r: 10, t: 10, b: 20 };
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const all = series.flatMap((s) => s.values).filter((v) => v !== null && Number.isFinite(v));
  if (!all.length) { svg.innerHTML = `<text x="10" y="20">no data</text>`; return; }
  let lo = Math.min(...all), hi = Math.max(...all);
  if (opts.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (hi === lo) { hi += 1; lo -= 1; }
  const n = dates.length, x = (i) => P.l + (i / Math.max(1, n - 1)) * (W - P.l - P.r), y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  let out = "";
  for (let k = 0; k <= 4; k++) {
    const v = lo + (k / 4) * (hi - lo), yy = y(v);
    out += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" stroke="#14203a"/><text x="4" y="${yy + 3}">${esc(opts.fmt ? opts.fmt(v) : v.toFixed(2))}</text>`;
  }
  [0, Math.floor(n / 2), n - 1].forEach((i) => { if (dates[i]) out += `<text x="${Math.min(x(i), W - 70)}" y="${H - 4}">${esc(dates[i])}</text>`; });
  for (const s of series) {
    const d = s.values.map((v, i) => (v === null ? "" : `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join("");
    if (s.fill) out += `<path d="${d}L${x(n - 1)},${y(opts.zero ? 0 : lo)}L${x(0)},${y(opts.zero ? 0 : lo)}Z" fill="${s.color}" fill-opacity=".15"/>`;
    out += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.w || 1.3}" ${s.dash ? 'stroke-dasharray="4 3"' : ""}><title>${esc(s.name)}</title></path>`;
  }
  for (const m of opts.markers || []) {
    const i = dates.indexOf(m.date); if (i < 0) continue;
    const yy = y(m.value), up = m.side === "BUY";
    out += `<path d="M${x(i)},${yy + (up ? 9 : -9)}l-4,${up ? 6 : -6}h8z" fill="${up ? "#36e39a" : "#ff5370"}"><title>${esc(m.side + " " + m.qty + " @ " + m.price.toFixed(2) + " on " + m.date)}</title></path>`;
  }
  out += `<rect x="${P.l + 2}" y="${P.t}" width="${series.length * 150}" height="14" fill="#0c1324" fill-opacity=".85"/>` + series.map((s, k) => `<text x="${P.l + 6 + k * 150}" y="${P.t + 10}" style="fill:${s.color}">${esc(s.name)}</text>`).join("");
  svg.innerHTML = out;
}

function charts(rec) {
  if (!rec) { ["c-price", "c-eq", "c-dd", "c-exp"].forEach((id) => ($(id).innerHTML = "")); return; }
  const s = rec.report.series;
  const markers = rec.report.fills.map((f) => ({ date: f.date, side: f.side, qty: f.qty, price: f.price, value: s.close[s.dates.indexOf(f.date)] }));
  lineChart($("c-price"), s.dates, [{ name: "close (" + rec.report.source.kind + ")", values: s.close, color: "#4fc3ff" }], { markers });
  lineChart($("c-eq"), s.dates, [
    { name: "net", values: s.equity, color: "#36e39a", w: 1.8 }, { name: "gross (no costs)", values: s.gross_equity, color: "#a78bfa", dash: true },
    { name: "capped buy-and-hold", values: s.benchmark_equity, color: "#7d8db3" }], { fmt: (v) => Math.round(v).toLocaleString() });
  lineChart($("c-dd"), s.dates, [{ name: "drawdown", values: s.underwater, color: "#ff5370", fill: true }], { zero: true, fmt: (v) => (v * 100).toFixed(0) + "%" });
  lineChart($("c-exp"), s.dates, [{ name: "exposure", values: s.exposure, color: "#ffb547", fill: true }], { zero: true, fmt: (v) => (v * 100).toFixed(0) + "%" });
}

function table(cols, rows) {
  return `<table><thead><tr>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function robustness(rec) {
  if (!rec) { $("sens").innerHTML = ""; return; }
  const r = rec.report, sp = r.splits;
  let h = `<div class="dim">Splits (fixed parameters, evaluation windows)</div>` + table(["window", "dates", "net return", "net Sharpe", "bench Sharpe"],
    Object.keys(sp.bounds).map((k) => [k, sp.bounds[k].join(" → "), pct(sp.net[k]?.total_return), num(sp.net[k]?.sharpe), num(sp.benchmark[k]?.sharpe)]));
  h += `<div class="dim">Cost sensitivity</div>` + table(["cost ×", "return", "Sharpe", "max DD"], (r.cost_sensitivity || []).map((c) => [c.cost_multiplier, pct(c.total_return), num(c.sharpe), pct(c.max_drawdown)]));
  if (r.param_sensitivity) h += `<div class="dim">Parameter grid (${esc(r.param_sensitivity.window)})</div>` + table(["fast", "slow", "Sharpe", "return"], r.param_sensitivity.grid.map((g) => [g.fast, g.slow, num(g.sharpe), pct(g.total_return)]));
  $("sens").innerHTML = h;
}

function quality(rec) {
  if (!rec) { $("quality").innerHTML = ""; return; }
  const q = rec.quality, src = rec.report.source;
  $("quality").innerHTML = table(["field", "value"], [
    ["provider", src.provider], ["kind", src.kind], ["description", src.description], ["adjusted", src.adjusted], ["terms", src.terms],
    ["rows", q.rows], ["range", q.first + " → " + q.last], ["tradable", q.tradable ? "yes" : "NO"],
    ["issues", Object.entries(q.counts).map(([k, v]) => k + ":" + v).join(", ") || "none"], ["data sha256", r16(rec.report.config.data_sha256)]]);
}
const r16 = (s) => (s || "").slice(0, 16);

function paper(p) {
  if (!p) { $("paper").innerHTML = `<p class="dim">No paper session yet. Press “Step paper”.</p>`; $("c-paper").innerHTML = ""; return; }
  const last = p.equity.length ? p.equity[p.equity.length - 1].equity : null;
  $("paper").innerHTML = `<div class="row"><span class="tag">${esc(p.strategy)} on ${esc(p.instrument)}</span><span>equity ${money(last)}</span><span>cash ${money(p.cash)}</span>
    <span>positions ${esc(JSON.stringify(p.positions))}</span><span class="${p.kill_switch ? "neg" : ""}">kill switch ${p.kill_switch ? "ENGAGED: " + esc(p.kill_reason) : "off"}</span></div>` +
    `<div class="scroll">` + table(["decided", "id", "side", "qty", "type", "status", "reasons"], p.orders.slice().reverse().map((o) => [o.decision_date, o.id, o.side, o.qty, o.order_type, o.status, (o.reasons || []).join("; ")])) + `</div>`;
  lineChart($("c-paper"), p.equity.map((e) => e.date), [{ name: "paper equity (replay)", values: p.equity.map((e) => e.equity), color: "#36e39a" }], { fmt: (v) => Math.round(v).toLocaleString() });
}

function fills(rec) {
  if (!rec) { $("fills").innerHTML = ""; return; }
  const rows = rec.report.fills.map((f) => [f.date, f.decision_date, f.side, f.qty, num(f.price, 4), num(f.commission), num(f.spread_slippage)]);
  const rej = rec.report.rejected.map((r) => [r.date, "", "REJECTED " + r.side, r.qty, "", "", r.reasons.join("; ")]);
  $("fills").innerHTML = table(["fill", "decided", "side", "qty", "price", "comm", "spread+slip / reason"], rows.concat(rej));
}

function events(evts) {
  $("events").innerHTML = `<table><thead><tr><th>time</th><th>kind</th><th>message</th></tr></thead><tbody>` +
    evts.slice().reverse().map((e) => `<tr class="sev-${esc(e.severity)}"><td>${esc(e.t.slice(5, 19).replace("T", " "))}</td><td>${esc(e.kind)}</td><td style="text-align:left;white-space:normal">${esc(e.message)}</td></tr>`).join("") + `</tbody></table>`;
}

function tasks(t) {
  $("tasks").innerHTML = `<div class="dim">${esc(Object.entries(t.counts).map(([k, v]) => k + ": " + v).join(" · ") || "no tasks seeded (python3 -m lql.cli seed-tasks)")}</div>` +
    table(["id", "goal", "owner", "status", "retries", "blocker"], t.tasks.map((x) => [x.id, x.goal, x.owner, x.status, x.retries, x.blocker ? x.blocker.kind + (x.blocker.question ? ": " + x.blocker.question : "") : ""]));
}

function flow(d) {
  const s = d.status, ev = d.events, count = (k) => ev.filter((e) => e.kind === k).length;
  const p = d.paper;
  const nodes = [
    ["Data", "synthetic", "ok"], ["Validate", s.data_lockout ? "LOCKED OUT" : "valid", s.data_lockout ? "bad" : "ok"],
    ["Strategy", d.experiment ? d.experiment.strategy : "–", "ok"], ["Sizing", "caps from limits", "ok"],
    ["Risk gate", s.kill_switch ? "KILL SWITCH" : count("risk_rejected") + " rejected", s.kill_switch ? "bad" : count("risk_rejected") ? "warn" : "ok"],
    ["Simulator", p ? p.orders.filter((o) => o.status === "SUBMITTED").length + " open" : "idle", "ok"],
    ["Ledger", p ? p.fills.length + " fills" : "empty", "ok"], ["Reconcile", s.reconciled ? "matched" : "MISMATCH", s.reconciled ? "ok" : "bad"],
    ["Dashboard", "this page", "ok"]];
  const col = { ok: "#36e39a", warn: "#ffb547", bad: "#ff5370" };
  let o = `<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" fill="#4fc3ff"/></marker></defs>`;
  nodes.forEach(([name, sub, st], i) => {
    const x = 10 + i * 99, y = 40;
    if (i) o += `<line x1="${x - 13}" y1="${y + 25}" x2="${x - 2}" y2="${y + 25}" stroke="#4fc3ff" marker-end="url(#ar)"/>`;
    o += `<g><rect class="flow-node" x="${x}" y="${y}" width="86" height="50" rx="4" fill="#0a1328" stroke="${col[st]}"/><text x="${x + 6}" y="${y + 18}" style="fill:${col[st]};font-size:11px">${esc(name)}</text><text x="${x + 6}" y="${y + 36}">${esc(sub)}</text></g>`;
  });
  const hx = 300;
  o += `<rect x="${hx}" y="150" width="300" height="56" rx="4" fill="#0f0a24" stroke="#a78bfa" stroke-dasharray="4 3"/>
    <text x="${hx + 8}" y="170" style="fill:#a78bfa;font-size:11px">Hermes / research plane (advisory, async)</text>
    <text x="${hx + 8}" y="186">${esc(s.hermes.available ? "available: schema-checked advice only" : "unavailable: deterministic fallback")}</text>
    <text x="${hx + 8}" y="200">no route to orders · cannot change limits</text>
    <line x1="${hx + 150}" y1="150" x2="${hx - 80}" y2="95" stroke="#a78bfa" stroke-dasharray="3 3" marker-end="url(#ar)"/>
    <text x="${hx - 70}" y="130" style="font-size:9px">proposals → critic</text>`;
  $("flow").innerHTML = o;
}

function render(d) {
  state = d;
  renderStatus(d.status);
  fillSelect($("f-inst"), d.instruments.map((i) => [i, i]), $("f-inst").value || "DEMO-ETF-A");
  fillSelect($("f-strat"), d.strategies.map((s) => [s.key, s.name + " " + s.version]), $("f-strat").value || "sma_trend");
  fillSelect($("f-exp"), d.experiments.map((e) => [e.id, `${e.at.slice(0, 16)} ${e.strategy} ${JSON.stringify(e.params)} ${e.instrument} ${e.verdict}`]), d.experiment ? d.experiment.id : undefined);
  current = d.experiment;
  if (current) { $("dl-csv").href = `/api/experiment/${current.id}.csv`; $("dl-json").href = `/api/experiment/${current.id}.json`; }
  kpis(current); charts(current); robustness(current); quality(current); fills(current);
  paper(d.paper); events(d.events); tasks(d.tasks); flow(d);
}

async function refresh(eid) {
  try { render(await api("/api/dashboard" + (eid ? "?experiment=" + encodeURIComponent(eid) : ""))); }
  catch (e) { msg("Could not load dashboard: " + e.message); }
}

$("bt-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const strat = $("f-strat").value;
  const params = strat === "sma_trend" ? { fast: +$("f-fast").value, slow: +$("f-slow").value } : {};
  msg("Running backtest…");
  try {
    const r = await api("/api/backtest", { instrument: $("f-inst").value, strategy: strat, params, source: $("f-src").value });
    msg(r.cached ? "Identical experiment already exists; showing the stored result (no duplicate run)." : "Backtest complete: critic " + r.critic.verdict);
    await refresh(r.id);
  } catch (e) { msg("Backtest failed: " + e.message); }
});
$("f-exp").addEventListener("change", () => refresh($("f-exp").value));
async function step(corrupt) {
  msg("Stepping paper sessions…");
  try { const r = await api("/api/paper/step", { steps: corrupt ? 3 : +$("f-steps").value, instrument: "DEMO-ETF-A", strategy: "sma_trend", corrupt_next: corrupt }); msg(`Processed ${r.processed} sessions; ${r.remaining} remaining in the replay.`); }
  catch (e) { msg("Paper step failed: " + e.message); }
  refresh(current && current.id);
}
$("b-step").addEventListener("click", () => step(false));
$("b-corrupt").addEventListener("click", () => step(true));
$("b-kill").addEventListener("click", async () => {
  const reason = prompt("Reason for engaging the kill switch:", "operator stop");
  if (!reason) return;
  try { const r = await api("/api/kill", { reason }); msg(`Kill switch engaged; ${r.cancelled.length} open orders cancelled.`); } catch (e) { msg(e.message); }
  refresh(current && current.id);
});
$("b-release").addEventListener("click", async () => {
  const by = prompt("Your name (human operator releasing the kill switch):", "");
  if (!by) return;
  try { await api("/api/release", { by }); msg("Kill switch released by " + by); } catch (e) { msg(e.message); }
  refresh(current && current.id);
});
refresh();
setInterval(() => { if (!document.hidden) api("/api/status").then(renderStatus).catch(() => {}); }, 10000);
