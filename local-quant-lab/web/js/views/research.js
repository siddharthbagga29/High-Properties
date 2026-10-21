// Research: run a backtest as a background job, browse experiments with the critic verdict, and read the frozen
// walk-forward studies. Walk-forward and the holdout are deliberately CLI-only.
import { esc, pct, num, money, clock, hash } from "../format.js";
import { verdictTone, job as jobS } from "../status.js";
import { line } from "../charts.js";

export default {
  title: "Research",
  async load(app) {
    const r = await app.api("/api/research");
    const eid = app.sel.experiment || (r.experiments[0] && r.experiments[0].id);
    let rec = null;
    if (eid) { try { rec = await app.api(`/api/experiment/${encodeURIComponent(eid)}`); } catch { rec = null; } }
    return { ...r, rec };
  },
  render(app, el, d) {
    const strategies = d.strategies, insts = d.instruments;
    const running = app.jobs.filter((j) => j.kind === "backtest" && (j.status === "queued" || j.status === "running"));
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
          ${running.map((j) => `<span class="tag ${jobS(j.status).tone}">${jobS(j.status).glyph} ${esc(j.id)} ${esc(j.status)}</span>`).join("")}
        </form>
        <p class="muted" style="font-size:var(--fs-xs);margin:6px 0 0">Fast/slow apply to sma_trend only. A snapshot source needs imported files; a provisional snapshot gives a PROVISIONAL result.</p></section>
      <section class="panel"><header><h2>Experiments</h2><span class="src">state/experiments · ${d.experiments.length}</span></header>
        <div class="scroll" style="max-height:220px"><table><thead><tr><th>at</th><th>strategy</th><th>params</th><th>inst</th><th>source</th><th class="r">return</th><th class="r">sharpe</th><th class="r">trips</th><th>critic</th></tr></thead><tbody>${exps || `<tr><td colspan="9" class="empty">No experiment yet.</td></tr>`}</tbody></table></div></section>
      ${rec ? experiment(rec) : ""}
      <section class="panel"><header><h2>Walk-forward studies</h2><span class="src">state/research · frozen before running</span></header>
        ${d.registrations.length ? d.registrations.map(study).join("") : `<p class="empty">No study frozen yet.</p>`}
        <p class="muted" style="font-size:var(--fs-xs)">${esc(d.ui_policy)} Holdouts spent: ${d.holdout_registry.length}.</p></section>
    </div>`;
    if (rec) charts(el, rec);
    el.querySelector("#bt-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const strat = el.querySelector("#bt-strat").value;
      const params = strat === "sma_trend" ? { fast: +el.querySelector("#bt-fast").value, slow: +el.querySelector("#bt-slow").value } : {};
      app.submitJob("backtest", null, { instrument: el.querySelector("#bt-inst").value, strategy: strat, source: el.querySelector("#bt-src").value, params });
    });
    el.querySelectorAll("[data-exp]").forEach((r) => {
      const go = () => { app.sel.experiment = r.dataset.exp; app.reload(); };
      r.addEventListener("click", go);
      r.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
  },
};

function experiment(rec) {
  const n = rec.report.net, b = rec.report.benchmark, cr = rec.critic, src = rec.report.source;
  const k = [["Total return (net)", pct(n.total_return)], ["CAGR", pct(n.cagr)], ["Sharpe", num(n.sharpe)], ["Sortino", num(n.sortino)],
    ["Max drawdown", pct(n.max_drawdown)], ["Ann. vol", pct(n.ann_vol)], ["Round trips", n.round_trips ?? "N/A"], ["Win rate", pct(n.win_rate, 1)],
    ["Costs paid", money(n.costs)], ["Time in market", pct(n.time_in_market, 1)], ["Turnover / yr", num(n.turnover_annual)],
    ["Benchmark return", pct(b.total_return)], ["Benchmark Sharpe", num(b.sharpe)], ["alpha_status", cr.alpha_status]];
  return `<section class="panel"><header><h2>${esc(rec.strategy)} ${esc(JSON.stringify(rec.params))} · ${esc(rec.instrument)}</h2>
      <span><span class="tag ${src.kind === "DEMO_SYNTHETIC" ? "synthetic" : "warn"}">${esc(src.kind)}</span> <span class="tag ${verdictTone(cr.verdict)}">${esc(cr.verdict)}</span>
      <a class="btn small" href="/api/experiment/${esc(rec.id)}.csv" download>CSV</a> <a class="btn small" href="/api/experiment/${esc(rec.id)}.json" download>JSON</a></span></header>
    <div class="kpis">${k.map(([a, v]) => `<div class="kpi"><div class="k">${esc(a)}</div><div class="v">${esc(v)}</div></div>`).join("")}</div>
    <div class="critic"><ul>${cr.blocking.map((x) => `<li class="block">✕ ${esc(x)}</li>`).join("")}${cr.findings.map((x) => `<li>${esc(x)}</li>`).join("")}${rec.report.warnings.map((x) => `<li class="muted">warning: ${esc(x)}</li>`).join("")}</ul>
      <div class="muted mono" style="font-size:var(--fs-xs)">config ${esc(hash(rec.report.config_hash, 16))} · result ${esc(hash(rec.report.result_hash, 16))} · ${esc(rec.report.timing)}</div></div>
    <div class="two" style="margin-top:8px"><div><div class="kicker">Price and fills</div><svg id="r-price" class="c" role="img" aria-label="price and fills"></svg></div>
      <div><div class="kicker">Equity: net · gross · capped buy-and-hold</div><svg id="r-eq" class="c" role="img" aria-label="equity"></svg></div></div>
    <div class="two"><div><div class="kicker">Underwater</div><svg id="r-dd" class="c small" role="img" aria-label="drawdown"></svg></div>
      <div><div class="kicker">Splits (fixed parameters)</div><table><thead><tr><th>window</th><th>dates</th><th class="r">net</th><th class="r">sharpe</th><th class="r">bench sharpe</th></tr></thead><tbody>${Object.keys(rec.report.splits.bounds).map((w) => `<tr><td>${esc(w)}</td><td>${esc(rec.report.splits.bounds[w].join(" → "))}</td><td class="r">${pct(rec.report.splits.net[w]?.total_return)}</td><td class="r">${num(rec.report.splits.net[w]?.sharpe)}</td><td class="r">${num(rec.report.splits.benchmark[w]?.sharpe)}</td></tr>`).join("")}</tbody></table></div></div>
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
function study(r) {
  const x = r.result;
  return `<div style="border-top:1px solid var(--line-2);padding:8px 0">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b class="mono">${esc(r.name)}</b><span class="muted mono">${esc(r.spec_hash)}</span>
      <span class="tag ${r.synthetic ? "synthetic" : r.provisional ? "warn" : "ok"}">${r.synthetic ? "SYNTHETIC" : r.provisional ? "PROVISIONAL" : "VERIFIED DATA"}</span>
      ${x ? `<span class="tag ${verdictTone(x.verdict)}">${esc(x.verdict)}</span><span class="muted">${x.n_folds} folds · OOS sharpe ${num(x.oos.sharpe)} · return ${pct(x.oos.total_return)} · exits ${x.oos.exits ?? "–"}</span>` : `<span class="tag muted">not run</span>`}
      <span class="muted">frozen ${esc(clock(r.frozen_at, true))} · ${r.candidates} candidates · holdout after ${esc(r.pre_holdout_last)}</span></div>
    ${x ? `<div class="checks" style="margin-top:6px">${x.checks.map((c) => `<span class="ck ${c.passed ? "pass" : "fail"}">${c.passed ? "✓" : "✗"} ${esc(c.name)}</span>`).join("")}</div>
      <div class="muted" style="font-size:var(--fs-xs)">holdout: ${esc((x.holdout || {}).status || "NOT_EVALUATED")} · ${esc(x.evidence_label || "")}</div>` : ""}
  </div>`;
}
