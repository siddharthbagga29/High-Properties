// Data workspace: datasets with their data class, provenance and quality; a price chart for the selected dataset.
import { esc, clock, int } from "../format.js";
import { dataClass } from "../status.js";
import { line } from "../charts.js";

export default {
  title: "Data",
  async load(app) {
    const d = await app.api("/api/data");
    const key = app.sel.dataset || (d.datasets[0] && `${d.datasets[0].source}:${d.datasets[0].instrument}`);
    let series = null, err = null;
    if (key) {
      const [source, instrument] = key.split(":");
      try { series = await app.api(`/api/data/series?source=${encodeURIComponent(source)}&instrument=${encodeURIComponent(instrument)}`); }
      catch (e) { err = e.message; }
    }
    return { ...d, key, series, err };
  },
  render(app, el, d) {
    const rows = d.datasets.map((x) => {
      const k = `${x.source}:${x.instrument}`, c = dataClass(x.data_class);
      const issues = Object.entries(x.issues || {}).map(([a, b]) => `${a}:${b}`).join(" ") || (x.error ? "error" : "none");
      return `<tr tabindex="0" class="${k === d.key ? "sel" : ""}" data-ds="${esc(k)}" data-k="ds-${esc(k)}" aria-selected="${k === d.key}">
        <td><b>${esc(x.instrument)}</b></td><td>${esc(x.source)}</td><td><span class="tag ${c.tone}">${c.glyph} ${esc(c.label)}</span></td>
        <td class="r num">${int(x.rows)}</td><td>${esc(x.first || "–")} → ${esc(x.last || "–")}</td><td>${x.tradable ? "yes" : `<span class="neg">NO</span>`}</td>
        <td>${esc(x.adjusted)}</td><td class="mono">${esc((x.sha256 || "").slice(0, 12))}</td><td>${esc(issues)}</td></tr>`;
    }).join("");
    const x = d.datasets.find((r) => `${r.source}:${r.instrument}` === d.key);
    const c = x ? dataClass(x.data_class) : null;
    el.innerHTML = `
    <div class="view-head"><h1>Data</h1><p>Provenance before prices. No live feed exists; nothing here is described as live.</p></div>
    <div class="grid">
      <section class="panel"><header><h2>Datasets</h2><span class="src">synthetic provider + data/snapshots manifests</span></header>
        <div class="scroll"><table><thead><tr><th>instrument</th><th>source</th><th>class</th><th class="r">rows</th><th>range</th><th>tradable</th><th>adjusted</th><th>sha256</th><th>quality issues</th></tr></thead><tbody>${rows || `<tr><td colspan="9" class="empty">No datasets.</td></tr>`}</tbody></table></div></section>
      ${x ? `<div class="two">
        <section class="panel"><header><h2>${esc(x.instrument)} close</h2><span class="tag ${c.tone}">${c.glyph} ${esc(c.label)}</span></header>
          ${d.series ? `<svg id="d-chart" class="c" role="img" aria-label="${esc(x.instrument)} close, ${esc(c.label)}"></svg><p class="muted" style="font-size:var(--fs-xs)">${esc(c.note)}</p>` : `<p class="empty">${esc(d.err || "No series.")}</p>`}</section>
        <section class="panel"><header><h2>Provenance</h2><span class="src">${esc(x.source)}</span></header>
          <dl class="kv"><dt>provider</dt><dd>${esc(x.provider)}</dd><dt>kind</dt><dd>${esc(x.kind || "–")}</dd><dt>description</dt><dd>${esc(x.description || "–")}</dd>
          <dt>retrieved</dt><dd>${esc(x.retrieved_at || "n/a (generated)")}</dd><dt>adjustment</dt><dd>${esc(x.adjusted)}${x.adjustment_verified ? " (verified)" : x.source === "snapshot" ? " (NOT verified)" : ""}</dd>
          ${x.adjustment_evidence ? `<dt>evidence</dt><dd>${esc(x.adjustment_evidence)}</dd>` : ""}<dt>terms</dt><dd>${esc(x.terms || "–")}</dd><dt>sha256</dt><dd class="mono">${esc(x.sha256 || "–")}</dd>
          ${x.error ? `<dt>error</dt><dd class="neg">${esc(x.error)}</dd>` : ""}</dl>
          ${d.series && d.series.issues.length ? `<div class="kicker" style="margin-top:10px">Flagged bars</div><div class="scroll" style="max-height:140px"><table><tbody>${d.series.issues.map((i) => `<tr><td>${esc(i.date)}</td><td>${esc(i.code)}</td><td>${esc(i.detail)}</td></tr>`).join("")}</tbody></table></div>` : ""}</section></div>` : ""}
      <div class="two">
        <section class="panel"><header><h2>Providers</h2><span class="src">credentials shown as configured / not configured only</span></header>
          <table><tbody>${d.providers.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td><span class="tag ${p.status === "available" ? "ok" : "muted"}">${esc(p.status)}</span></td><td>${esc(p.detail)}</td></tr>`).join("")}</tbody></table></section>
        <section class="panel"><header><h2>Data classes</h2><span class="src">never merged into one "online" light</span></header>
          <table><tbody>${Object.entries(d.classes).map(([k, v]) => { const cc = dataClass(k); return `<tr><td><span class="tag ${cc.tone}">${cc.glyph} ${esc(cc.label)}</span></td><td>${esc(v)}</td></tr>`; }).join("")}</tbody></table></section>
      </div>
    </div>`;
    if (d.series && x) {
      const s = d.series;
      line(el.querySelector("#d-chart"), s.dates, [{ name: `close (${c.label})`, values: s.close, color: x.data_class === "synthetic" ? "var(--synthetic)" : "var(--cyan)" }]);
    }
    el.querySelectorAll("[data-ds]").forEach((r) => {
      const go = () => { app.sel.dataset = r.dataset.ds; app.reload(); };
      r.addEventListener("click", go);
      r.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
    void clock;
  },
};
