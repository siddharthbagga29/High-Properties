// Research: run a backtest or a Monte Carlo check as a background job, browse experiments with the critic verdict,
// and read the frozen walk-forward studies. Walk-forward and the holdout are deliberately CLI-only.
// Every chart is drawn from a persisted artifact (state/experiments, state/montecarlo, state/research) and names its
// units, date range, method and data state.
import { esc, pct, num, money, clock, hash } from "../format.js";
import { verdictTone, job as jobS } from "../status.js";
import { line, bars, fan, heatmap } from "../charts.js";
import * as RM from "../research-model.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default {
  title: "Research",
  async load(app) {
    const [r, runs] = await Promise.all([app.api("/api/research"), app.api("/api/montecarlo")]);
    const eid = app.sel.experiment || (r.experiments[0] && r.experiments[0].id);
    let rec = null, mc = null;
    if (eid) { try { rec = await app.api(`/api/experiment/${encodeURIComponent(eid)}`); } catch { rec = null; } }
    const mine = rec ? runs.filter((m) => m.experiment === rec.id) : [];
    const mid = app.sel.montecarlo && mine.some((m) => m.id === app.sel.montecarlo) ? app.sel.montecarlo : mine[0] && mine[0].id;
    if (mid) { try { mc = await app.api(`/api/montecarlo/${encodeURIComponent(mid)}`); } catch { mc = null; } }
    return { ...r, rec, mc, mcRuns: mine };
  },
  render(app, el, d) {
    const strategies = d.strategies, insts = d.instruments;
    const running = app.jobs.filter((j) => (j.kind === "backtest" || j.kind === "montecarlo") && (j.status === "queued" || j.status === "running"));
    const rec = d.rec;
    const exps = d.experiments.map((e) => `<tr tabindex="0" class="${rec && rec.id === e.id ? "sel" : ""}" data-exp="${esc(e.id)}" data-k="re-${esc(e.id)}"><td>${esc(clock(e.at, true))}</td><td>${esc(e.strategy)}</td><td class="mono">${esc(JSON.stringify(e.params))}</td><td>${esc(e.instrument)}</td><td>${esc(e.source)}</td><td class="r num">${pct(e.total_return)}</td><td class="r num">${num(e.sharpe)}</td><td class="r num">${e.round_trips ?? "–"}</td><td><span class="tag ${verdictTone(e.verdict)}">${esc(e.verdict)}</span></td></tr>`).join("");
    el.innerHTML = `
    <div class="view-head"><h1>Research</h1><p>A backtest is not evidence of future returns. Synthetic results can never pass the critic; provisional data cannot either.</p></div>
    <div class="grid">
      <section class="panel"><header><h2>Run a backtest</h2><span class="src">background job · deterministic · identical runs are reused, never duplicated</span></header>
        <form class="form" id="bt-form">
          <label class="field">Instrument<select id="bt-inst" data-k="bt-inst">${insts.map((i) => `<option ${i === "DEMO-ETF-A" ? "selected" : ""}>${esc(i)}</option>`).join("")}</select></label>
          <label class="field">Strategy<select id="bt-strat" data-k="bt-strat">${strategies.map((s) => `<option value="${esc(s.key)}">${esc(s.name)} ${esc(s.version)}</option>`).join("")}</select></label>
          <label class="field">Source<select id="bt-src" data-k="bt-src"><option value="synthetic">synthetic (DEMO)</option><option value="snapshot">csv snapshot</option></select></label>
          <label class="field">Fast<input id="bt-fast" type="number" min="2" max="400" value="50" data-k="bt-fast"></label>
          <label class="field">Slow<input id="bt-slow" type="number" min="3" max="400" value="200" data-k="bt-slow"></label>
          <button class="btn primary" type="submit" data-k="bt-go">Queue backtest</button>
          ${running.map((j) => `<span class="tag ${jobS(j.status).tone}">${jobS(j.status).glyph} ${esc(j.id)} ${esc(j.kind)} ${esc(j.status)}${j.progress && j.status === "running" ? ` · ${j.progress.done}/${j.progress.total} ${esc(j.progress.unit)}` : ""}</span>`).join("")}
        </form>
        <p class="muted" style="font-size:var(--fs-xs);margin:6px 0 0">Fast/slow apply to sma_trend only. A snapshot source needs imported files; a provisional snapshot gives a PROVISIONAL result.</p></section>
      <section class="panel"><header><h2>Experiments</h2><span class="src">state/experiments · ${d.experiments.length}</span></header>
        <div class="scroll" style="max-height:220px"><table><thead><tr><th>at</th><th>strategy</th><th>params</th><th>inst</th><th>source</th><th class="r">return</th><th class="r">sharpe</th><th class="r">trips</th><th>critic</th></tr></thead><tbody>${exps || `<tr><td colspan="9" class="empty">No experiment yet. Queue a backtest above.</td></tr>`}</tbody></table></div></section>
      ${rec ? experiment(rec) + diagnostics(rec) + montecarlo(rec, d.mc, d.mcRuns) : ""}
      <section class="panel"><header><h2>Walk-forward studies</h2><span class="src">state/research · frozen before running</span></header>
        ${d.registrations.length ? d.registrations.map(study).join("") : `<p class="empty">No study frozen yet. Studies are frozen and run from the CLI: python3 -m lql.cli research run …</p>`}
        <p class="muted" style="font-size:var(--fs-xs)">${esc(d.ui_policy)} Holdouts spent: ${d.holdout_registry.length}.</p></section>
    </div>`;
    if (rec) { charts(el, rec); diagnosticCharts(el, rec); if (d.mc) mcCharts(el, rec, d.mc); }
    d.registrations.forEach((r, i) => studyChart(el, r, i));
    el.querySelector("#bt-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const strat = el.querySelector("#bt-strat").value;
      const params = strat === "sma_trend" ? { fast: +el.querySelector("#bt-fast").value, slow: +el.querySelector("#bt-slow").value } : {};
      app.submitJob("backtest", null, { instrument: el.querySelector("#bt-inst").value, strategy: strat, source: el.querySelector("#bt-src").value, params });
    });
    const mf = el.querySelector("#mc-form");
    if (mf) mf.addEventListener("submit", (e) => {
      e.preventDefault();
      app.submitJob("montecarlo", null, { experiment: rec.id, paths: +el.querySelector("#mc-paths").value, block: +el.querySelector("#mc-block").value, seed: +el.querySelector("#mc-seed").value });
    });
    el.querySelectorAll("[data-mc]").forEach((b) => b.addEventListener("click", () => { app.sel.montecarlo = b.dataset.mc; app.reload(); }));
    el.querySelectorAll("[data-exp]").forEach((r) => {
      const go = () => { app.sel.experiment = r.dataset.exp; app.sel.montecarlo = null; app.reload(); };
      r.addEventListener("click", go);
      r.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
  },
};

const stateOf = (rec) => (rec.dataset && rec.dataset.data_state) || (rec.report.source.kind === "DEMO_SYNTHETIC" ? "SYNTHETIC" : "PROVISIONAL");
const range = (rec) => `${rec.report.series.dates[0]} → ${rec.report.series.dates[rec.report.series.dates.length - 1]}`;
const label = (rec) => `${rec.strategy} on ${rec.instrument} · ${range(rec)} · ${stateOf(rec)}`;

function experiment(rec) {
  const n = rec.report.net, b = rec.report.benchmark, rel = rec.report.relative || {}, cr = rec.critic, src = rec.report.source;
  const k = [["Total return (net)", pct(n.total_return)], ["CAGR", pct(n.cagr)], ["Sharpe", num(n.sharpe)], ["Sortino", num(n.sortino)],
    ["Max drawdown", pct(n.max_drawdown)], ["Calmar", num(n.calmar)], ["Ann. vol", pct(n.ann_vol)], ["Round trips", n.round_trips ?? "N/A"], ["Win rate", pct(n.win_rate, 1)],
    ["Avg win / loss", n.avg_win == null || n.avg_loss == null ? "N/A" : `${money(n.avg_win)} / ${money(n.avg_loss)}`],
    ["Costs paid", money(n.costs)], ["Time in market", pct(n.time_in_market, 1)], ["Turnover / yr", num(n.turnover_annual)],
    ["Benchmark return", pct(b.total_return)], ["Benchmark Sharpe", num(b.sharpe)], ["Excess return", pct(rel.excess_total_return)],
    ["Information ratio", num(rel.information_ratio)], ["Data state", stateOf(rec)], ["alpha_status", cr.alpha_status]];
  return `<section class="panel"><header><h2>${esc(rec.strategy)} ${esc(JSON.stringify(rec.params))} · ${esc(rec.instrument)}</h2>
      <span><span class="tag ${src.kind === "DEMO_SYNTHETIC" ? "synthetic" : "warn"}">${esc(src.kind)}</span> <span class="tag ${verdictTone(cr.verdict)}">${esc(cr.verdict)}</span>
      <a class="btn small" href="/api/experiment/${esc(rec.id)}.csv" download>CSV</a> <a class="btn small" href="/api/experiment/${esc(rec.id)}.json" download>JSON</a></span></header>
    <div class="kpis">${k.map(([a, v]) => `<div class="kpi"><div class="k">${esc(a)}</div><div class="v">${esc(v)}</div></div>`).join("")}</div>
    <div class="critic"><ul>${cr.blocking.map((x) => `<li class="block">✕ ${esc(x)}</li>`).join("")}${cr.findings.map((x) => `<li>${esc(x)}</li>`).join("")}${rec.report.warnings.map((x) => `<li class="muted">warning: ${esc(x)}</li>`).join("")}</ul>
      <div class="muted mono" style="font-size:var(--fs-xs)">config ${esc(hash(rec.report.config_hash, 16))} · result ${esc(hash(rec.report.result_hash, 16))} · data ${esc(hash((rec.dataset || {}).sha256 || rec.report.config.data_sha256 || "", 16))} · ${esc(rec.report.timing)}</div></div>
    <div class="two" style="margin-top:8px"><div><div class="kicker">Price and fills</div><div class="chart-note">close, USD · ${esc(range(rec))} · ${esc(stateOf(rec))}</div><svg id="r-price" class="c" role="img" aria-label="price and fills"></svg></div>
      <div><div class="kicker">Equity: net · gross · capped buy-and-hold</div><div class="chart-note">USD · same costs and caps for the benchmark · ${esc(stateOf(rec))}</div><svg id="r-eq" class="c" role="img" aria-label="equity"></svg></div></div>
    <div class="two"><div><div class="kicker">Underwater</div><div class="chart-note">drawdown from running peak, % · net equity</div><svg id="r-dd" class="c small" role="img" aria-label="drawdown"></svg></div>
      <div><div class="kicker">Splits (fixed parameters)</div><table><thead><tr><th>window</th><th>dates</th><th class="r">net</th><th class="r">sharpe</th><th class="r">bench sharpe</th></tr></thead><tbody>${Object.keys(rec.report.splits.bounds).map((w) => `<tr><td>${esc(w)}</td><td>${esc(rec.report.splits.bounds[w].join(" → "))}</td><td class="r">${pct(rec.report.splits.net[w]?.total_return)}</td><td class="r">${num(rec.report.splits.net[w]?.sharpe)}</td><td class="r">${num(rec.report.splits.benchmark[w]?.sharpe)}</td></tr>`).join("")}</tbody></table></div></div>
  </section>`;
}

function diagnostics(rec) {
  const g = RM.monthlyGrid(rec.report.monthly || {});
  const lim = Math.max(0.01, ...g.rows.flat().filter((v) => v != null).map(Math.abs));
  const cs = rec.report.cost_sensitivity || [];
  const ps = (rec.report.param_sensitivity || {}).grid || [];
  const pm = RM.paramMatrix(ps);
  const plim = Math.max(0.1, ...pm.values.flat().filter((v) => v != null).map(Math.abs));
  return `<section class="panel"><header><h2>Diagnostics</h2><span class="src">${esc(label(rec))}</span></header>
    <div class="two"><div><div class="kicker">Monthly returns</div><div class="chart-note">net strategy return per calendar month, % · ${esc(stateOf(rec))}</div>
      ${g.years.length ? heatmap(g.years, MONTHS, g.rows, { fmt: (v) => (v * 100).toFixed(1), color: (v) => RM.diverging(v, lim), corner: "year" }) : `<p class="empty">No monthly data.</p>`}</div>
      <div><div class="kicker">Daily return distribution</div><div class="chart-note">net daily simple returns, % · count per bin · ${rec.report.series.equity.length - 1} days</div><svg id="r-hist" class="c small" role="img" aria-label="daily return histogram"></svg></div></div>
    <div class="two"><div><div class="kicker">Rolling volatility and Sharpe</div><div class="chart-note">63-day annualised volatility (%) and 126-day annualised Sharpe (rf 0); blank until the window fills</div><svg id="r-roll" class="c small" role="img" aria-label="rolling volatility"></svg><svg id="r-rsh" class="c small" role="img" aria-label="rolling sharpe"></svg></div>
      <div><div class="kicker">Exposure</div><div class="chart-note">position value / equity at each close, %</div><svg id="r-exp" class="c small" role="img" aria-label="exposure"></svg></div></div>
    <div class="two"><div><div class="kicker">Transaction-cost sensitivity</div><div class="chart-note">commission, spread and slippage scaled together; full sample</div>
      ${cs.length ? `<table><thead><tr><th>cost multiplier</th><th class="r">total return</th><th class="r">sharpe</th><th class="r">max drawdown</th></tr></thead><tbody>${cs.map((c) => `<tr><td>${c.cost_multiplier}x</td><td class="r num">${pct(c.total_return)}</td><td class="r num">${num(c.sharpe)}</td><td class="r num">${pct(c.max_drawdown)}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">Not computed for this experiment.</p>`}</div>
      <div><div class="kicker">Parameter sensitivity</div><div class="chart-note">Sharpe by fast (rows) × slow (columns) SMA · ${esc((rec.report.param_sensitivity || {}).window || "")}; in-sample, optimistic by construction</div>
      ${pm.rows.length ? heatmap(pm.rows, pm.cols, pm.values, { fmt: (v) => v.toFixed(2), color: (v) => RM.diverging(v, plim), corner: "fast \\ slow" }) : `<p class="empty">Only computed for sma_trend.</p>`}</div></div>
  </section>`;
}

function montecarlo(rec, mc, runs) {
  const form = `<form class="mc-form" id="mc-form">
      <label class="field">Paths<input id="mc-paths" type="number" min="100" max="20000" step="100" value="1000" data-k="mc-paths"></label>
      <label class="field">Block (days)<input id="mc-block" type="number" min="1" max="120" value="20" data-k="mc-block"></label>
      <label class="field">Seed<input id="mc-seed" type="number" min="0" value="7" data-k="mc-seed"></label>
      <button class="btn" type="submit" data-k="mc-go">Queue Monte Carlo</button></form>`;
  const list = runs.length ? `<div class="checks" style="margin:6px 0">${runs.map((r) => `<button class="btn small ${mc && mc.id === r.id ? "primary" : "ghost"}" data-mc="${esc(r.id)}" data-k="mc-${esc(r.id)}">${r.paths} paths · block ${r.block_days} · seed ${r.seed}</button>`).join("")}</div>` : "";
  if (!mc) return `<section class="panel"><header><h2>Monte Carlo</h2><span class="src">block bootstrap of this experiment's net daily returns · runs as a background job</span></header>${form}${list}<p class="empty">No Monte Carlo run for this experiment yet. Nothing is drawn until one finishes.</p></section>`;
  const e = mc.ending, dd = mc.drawdown, a = mc.actual;
  const k = [["Paths", mc.paths.toLocaleString("en-US")], ["Seed", mc.seed], ["Block", `${mc.block_days} days`], ["Horizon", `${mc.horizon_days} days`],
    ["Ending x (5 / 50 / 95%)", `${e.p5.toFixed(3)} / ${e.p50.toFixed(3)} / ${e.p95.toFixed(3)}`], ["P(ending < start)", pct(e.prob_loss, 1)],
    ["P(max DD > 10%)", pct(dd.prob_gt_10pct, 1)], ["P(max DD > 20%)", pct(dd.prob_gt_20pct, 1)], ["P(max DD > 30%)", pct(dd.prob_gt_30pct, 1)],
    ["Backtest ending rank", pct(a.ending_rank_pct, 0)], ["Computed in", `${mc.elapsed_s}s`], ["Input state", mc.input.data_state]];
  return `<section class="panel"><header><h2>Monte Carlo</h2><span class="src">${esc(mc.method)} · ${esc(mc.method_version)} · state/montecarlo/${esc(mc.id)}.json</span></header>
    ${form}${list}
    <div class="kpis" style="margin-top:6px">${k.map(([x, v]) => `<div class="kpi"><div class="k">${esc(x)}</div><div class="v">${esc(String(v))}</div></div>`).join("")}</div>
    <div class="two" style="margin-top:8px"><div><div class="kicker">Path fan</div><div class="chart-note">equity multiple (start = 1) by trading day · ${esc(mc.input.first)} → ${esc(mc.input.last)} history · not a forecast</div><svg id="mc-fan" class="c" role="img" aria-label="monte carlo fan"></svg></div>
      <div><div class="kicker">Ending value distribution</div><div class="chart-note">ending equity multiple · count of paths per bin · amber: the backtest</div><svg id="mc-hist" class="c" role="img" aria-label="ending value histogram"></svg></div></div>
    <ul class="muted" style="font-size:var(--fs-xs);margin:6px 0 0">${mc.assumptions.map((x) => `<li>${esc(x)}</li>`).join("")}<li>costs: ${esc(mc.costs)}</li></ul>
  </section>`;
}

function charts(el, rec) {
  const s = rec.report.series;
  const idx = new Map(s.dates.map((d, i) => [d, i]));
  const markers = rec.report.fills.map((f) => ({ date: f.date, side: f.side, qty: f.qty, price: f.price, value: s.close[idx.get(f.date)] }));
  line(el.querySelector("#r-price"), s.dates, [{ name: `close (${rec.report.source.kind})`, values: s.close, color: "var(--cyan-2)" }], { markers });
  line(el.querySelector("#r-eq"), s.dates, [{ name: "net", values: s.equity, color: "var(--ok)", w: 1.8 }, { name: "gross", values: s.gross_equity, color: "var(--violet-2)", dash: true },
    { name: "capped buy-and-hold", values: s.benchmark_equity, color: "var(--text-3)" }], { fmt: (v) => Math.round(v).toLocaleString("en-US") });
  line(el.querySelector("#r-dd"), s.dates, [{ name: "drawdown", values: s.underwater, color: "var(--bad)", fill: true }], { zero: true, fmt: (v) => (v * 100).toFixed(0) + "%" });
}

function diagnosticCharts(el, rec) {
  const s = rec.report.series, rets = RM.returns(s.equity), d1 = s.dates.slice(1);
  bars(el.querySelector("#r-hist"), RM.histogram(rets, 40), { fmt: (v) => (v * 100).toFixed(1) + "%", color: "var(--cyan)" });
  line(el.querySelector("#r-roll"), d1, [{ name: "63-day vol", values: RM.rollingVol(rets, 63), color: "var(--amber)" }], { fmt: (v) => (v * 100).toFixed(0) + "%" });
  line(el.querySelector("#r-rsh"), d1, [{ name: "126-day Sharpe", values: RM.rollingSharpe(rets, 126), color: "var(--violet-2)" }], { zero: true, fmt: (v) => v.toFixed(1) });
  line(el.querySelector("#r-exp"), s.dates, [{ name: "exposure", values: s.exposure, color: "var(--cyan-2)", fill: true }], { zero: true, fmt: (v) => (v * 100).toFixed(0) + "%" });
}

function mcCharts(el, rec, mc) {
  const eq = RM.normalise(rec.report.series.equity);
  const actual = mc.fan.step.map((st) => [st, eq[Math.min(st, eq.length - 1)]]);
  fan(el.querySelector("#mc-fan"), mc.fan, [[0, 1], ...actual], { paths: mc.paths.toLocaleString("en-US") });
  bars(el.querySelector("#mc-hist"), mc.histogram, { fmt: (v) => "x" + v.toFixed(2), marks: [{ value: mc.actual.ending, label: "backtest" }, { value: 1, label: "start", color: "var(--text-3)" }] });
}

function study(r, i) {
  const x = r.result;
  return `<div style="border-top:1px solid var(--line-2);padding:8px 0">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b class="mono">${esc(r.name)}</b><span class="muted mono">${esc(r.spec_hash)}</span>
      <span class="tag ${r.synthetic ? "synthetic" : r.provisional ? "warn" : "ok"}">${r.synthetic ? "SYNTHETIC" : r.provisional ? "PROVISIONAL" : "VERIFIED DATA"}</span>
      ${x ? `<span class="tag ${verdictTone(x.verdict)}">${esc(x.verdict)}</span><span class="muted">${x.n_folds} folds · OOS sharpe ${num(x.oos.sharpe)} · return ${pct(x.oos.total_return)} · exits ${x.oos.exits ?? "–"}</span>` : `<span class="tag muted">not run</span>`}
      <span class="muted">frozen ${esc(clock(r.frozen_at, true))} · ${r.candidates} candidates · holdout after ${esc(r.pre_holdout_last)}</span></div>
    ${x ? `<div class="checks" style="margin-top:6px">${x.checks.map((c) => `<span class="ck ${c.passed ? "pass" : "fail"}">${c.passed ? "✓" : "✗"} ${esc(c.name)}</span>`).join("")}</div>
      <div class="muted" style="font-size:var(--fs-xs)">holdout: ${esc((x.holdout || {}).status || "NOT_EVALUATED")} · ${esc(x.evidence_label || "")}</div>
      ${x.folds && x.folds.length ? `<div class="two" style="margin-top:6px"><div><div class="kicker">Folds: selected candidate, in-sample vs out-of-sample Sharpe</div><div class="chart-note">${esc(x.in_sample_note || "")}</div>
        <table><thead><tr><th>fold</th><th>test window</th><th>selected</th><th class="r">IS sharpe</th><th class="r">OOS sharpe</th><th class="r">OOS return</th><th class="r">OOS max DD</th></tr></thead><tbody>${x.folds.map((f) => `<tr><td>${f.fold}</td><td>${esc(f.test.join(" → "))}</td><td class="mono" style="font-size:var(--fs-xs)">${esc(f.selected)}</td><td class="r num">${num(f.is_sharpe)}</td><td class="r num ${f.oos_sharpe < 0 ? "neg" : ""}">${num(f.oos_sharpe)}</td><td class="r num">${pct(f.oos_return)}</td><td class="r num">${pct(f.oos_max_drawdown)}</td></tr>`).join("")}</tbody></table></div>
        <div><div class="kicker">Out-of-sample equity (stitched folds) vs benchmark</div><div class="chart-note">USD · ${r.synthetic ? "SYNTHETIC" : r.provisional ? "PROVISIONAL" : "verified"} · ${esc(r.first)} → ${esc(r.last)}</div><svg id="wf-${i}" class="c small" role="img" aria-label="walk-forward out-of-sample equity"></svg></div></div>` : ""}` : ""}
  </div>`;
}

function studyChart(el, r, i) {
  const s = r.result && r.result.oos_series, svg = el.querySelector(`#wf-${i}`);
  if (!s || !svg) return;
  line(svg, s.dates, [{ name: "out-of-sample", values: s.equity, color: "var(--ok)", w: 1.6 }, { name: "benchmark", values: s.benchmark_equity, color: "var(--text-3)" }], { fmt: (v) => Math.round(v).toLocaleString("en-US") });
}
