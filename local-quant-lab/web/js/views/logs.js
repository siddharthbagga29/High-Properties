// Logs: the structured audit stream with severity/kind filters, search, correlation ids and a diagnostics copy.
import { esc, clock } from "../format.js";
import { severityTone } from "../status.js";

const f = { severity: "", kind: "", q: "" };
const corr = (e) => { const d = e.data || {}; return [d.job, d.task, d.experiment, d.order, d.spec_hash].filter(Boolean).join(" "); };

const view = {
  title: "Logs",
  load: (app) => app.api("/api/events"),
  render(app, el, evts) {
    const kinds = [...new Set(evts.map((e) => e.kind))].sort();
    const q = f.q.trim().toLowerCase();
    const rows = evts.filter((e) => (!f.severity || e.severity === f.severity) && (!f.kind || e.kind === f.kind)
      && (!q || (e.message + " " + e.kind + " " + corr(e)).toLowerCase().includes(q))).slice(-400).reverse();
    el.innerHTML = `
    <div class="view-head"><h1>Logs</h1><p>Append-only audit log (state/events.jsonl, secrets redacted at write). Showing ${rows.length} of the last ${evts.length} events.</p></div>
    <section class="panel">
      <div class="form" role="search" style="margin-bottom:8px">
        <label class="field">Severity<select id="l-sev" data-k="l-sev"><option value="">all</option>${["info", "warning", "critical"].map((s) => `<option ${f.severity === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
        <label class="field">Kind<select id="l-kind" data-k="l-kind"><option value="">all</option>${kinds.map((k) => `<option ${f.kind === k ? "selected" : ""}>${esc(k)}</option>`).join("")}</select></label>
        <label class="field">Search<input id="l-q" type="search" value="${esc(f.q)}" data-k="l-q" placeholder="text, job id, task id"></label>
        <button class="btn" id="l-copy" data-k="l-copy">Copy diagnostics</button>
      </div>
      <div class="scroll" style="max-height:calc(100vh - 290px)"><table><thead><tr><th>time (UTC)</th><th>severity</th><th>kind</th><th>correlation</th><th>message</th></tr></thead><tbody>
      ${rows.map((e) => `<tr><td class="mono">${esc(clock(e.t, true))}:${esc(String(e.t).slice(17, 19))}</td><td><span class="tag ${severityTone(e.severity)}">${esc(e.severity)}</span></td><td>${esc(e.kind)}</td><td class="mono">${esc(corr(e))}</td><td style="white-space:normal">${esc(e.message)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No matching events.</td></tr>`}
      </tbody></table></div></section>`;
    el.querySelector("#l-sev").addEventListener("change", (e) => { f.severity = e.target.value; app.rerender(); });
    el.querySelector("#l-kind").addEventListener("change", (e) => { f.kind = e.target.value; app.rerender(); });
    let t;
    el.querySelector("#l-q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; app.rerender(); }, 180); });
    el.querySelector("#l-copy").addEventListener("click", () => view.copyDiagnostics(app, rows.slice(0, 200)));
  },
  async copyDiagnostics(app, rows) {
    const evts = rows || (await app.api("/api/events")).slice(-200);
    const text = JSON.stringify({ generated: new Date().toISOString(), status: app.status, jobs: app.jobs, events: evts }, null, 1);
    try { await navigator.clipboard.writeText(text); app.toast(`Diagnostics copied (${evts.length} events, no credentials: the log is redacted at write).`, "ok"); }
    catch { app.toast("Clipboard not available in this browser context; use the Logs table instead.", "warn"); }
  },
};
export default view;
