// Paper workspace: the SIMULATED replay ledger (step, inject a corrupt bar, kill switch, release) and the CLI-run
// forward logs (read-only). Every action goes through the same backend checks as the CLI.
import { esc, money, clock } from "../format.js";
import { line } from "../charts.js";

const view = {
  title: "Paper",
  async load(app) {
    const [p, f] = await Promise.all([app.api("/api/paper"), app.api("/api/forward")]);
    return { paper: p, forward: f };
  },
  render(app, el, d) {
    const p = d.paper;
    const last = p && p.equity.length ? p.equity[p.equity.length - 1].equity : null;
    const orders = p ? p.orders.slice().reverse().slice(0, 120).map((o) => `<tr><td>${esc(o.decision_date)}</td><td class="mono">${esc(o.id.slice(0, 10))}</td><td>${esc(o.side)}</td><td class="r num">${o.qty}</td><td>${esc(o.order_type)}</td><td><span class="tag ${o.status === "RISK_REJECTED" || o.status === "REJECTED" ? "bad" : o.status === "CANCELLED" ? "muted" : "ok"}">${esc(o.status)}</span></td><td>${esc((o.reasons || []).join("; "))}</td></tr>`).join("") : "";
    el.innerHTML = `
    <div class="view-head"><h1>Paper</h1><p>SIMULATED replay of synthetic bars through the same risk engine and fill model as the backtest. No broker exists.</p></div>
    <div class="grid">
      <section class="panel ${p && p.kill_switch ? "attn" : ""}"><header><h2>Paper ledger (simulated)</h2><span class="tag synthetic">REPLAY · DEMO_SYNTHETIC</span></header>
        ${p ? `<div class="kpis"><div class="kpi"><div class="k">equity</div><div class="v">${money(last)}</div></div><div class="kpi"><div class="k">cash</div><div class="v">${money(p.cash)}</div></div>
          <div class="kpi"><div class="k">positions</div><div class="v mono" style="font-size:var(--fs-s)">${esc(JSON.stringify(p.positions))}</div></div><div class="kpi"><div class="k">paper clock</div><div class="v" style="font-size:var(--fs-m)">${esc(p.last_processed || "–")}</div></div>
          <div class="kpi"><div class="k">kill switch</div><div class="v ${p.kill_switch ? "neg" : ""}" style="font-size:var(--fs-m)">${p.kill_switch ? "ENGAGED" : "off"}</div></div><div class="kpi"><div class="k">ledger</div><div class="v" style="font-size:var(--fs-m)">${p.reconciled ? "reconciled" : "MISMATCH"}</div></div></div>
          ${p.kill_switch ? `<p class="neg">Kill switch: ${esc(p.kill_reason)}</p>` : ""}
          <svg id="p-eq" class="c small" role="img" aria-label="paper equity, simulated replay"></svg>` : `<p class="empty">No paper session yet. Step the replay to start one (it creates state/paper.db, git-ignored).</p>`}
        <div class="form" style="margin-top:8px">
          <label class="field">Sessions<input id="p-steps" type="number" min="1" max="1300" value="20" data-k="p-steps"></label>
          <button class="btn primary" id="p-step" data-k="p-step">Step paper</button>
          <button class="btn" id="p-corrupt" data-k="p-corrupt" title="Feeds one deliberately corrupt bar to show the data lockout">Inject corrupt bar</button>
          <button class="btn danger" id="p-kill" data-k="p-kill">Kill switch…</button>
          <button class="btn" id="p-release" data-k="p-release" ${p && p.kill_switch ? "" : "disabled"}>Release…</button>
        </div></section>
      ${p ? `<section class="panel"><header><h2>Orders</h2><span class="src">state/paper.db · newest first</span></header><div class="scroll"><table><thead><tr><th>decided</th><th>id</th><th>side</th><th class="r">qty</th><th>type</th><th>status</th><th>reasons</th></tr></thead><tbody>${orders || `<tr><td colspan="7" class="empty">No orders.</td></tr>`}</tbody></table></div></section>` : ""}
      <section class="panel"><header><h2>Forward paper logs</h2><span class="src">state/forward · read-only here</span></header>
        ${d.forward.logs.length ? `<table><thead><tr><th>log</th><th>class</th><th>status</th><th>last session</th><th class="r">sessions</th><th class="r">fills</th><th>evidence</th></tr></thead><tbody>${d.forward.logs.map((f) => `<tr><td class="mono">${esc(f.dir)}</td><td><span class="tag ${f.evidence_class === "REAL_FORWARD" && !(f.report || {}).provisional ? "ok" : "warn"}">${esc(f.evidence_class)}</span></td><td>${esc(f.status)}</td><td>${esc(f.last_processed || "–")}</td><td class="r">${(f.report || {}).sessions ?? "–"}</td><td class="r">${(f.report || {}).fills ?? "–"}</td><td>${esc(((f.report || {}).paper_evidence || {}).statement || f.error || "")}</td></tr>`).join("")}</tbody></table>`
          : `<p class="empty">No forward log exists. It is started from the CLI, and only after the data adjustment is verified (docs/MAC_NEXT_STEPS.md step 6).</p>`}
        <p class="muted" style="font-size:var(--fs-xs)">${esc(d.forward.ui_policy)}</p></section>
    </div>`;
    if (p && p.equity.length) line(el.querySelector("#p-eq"), p.equity.map((e) => e.date), [{ name: "paper equity (simulated replay)", values: p.equity.map((e) => e.equity), color: "var(--ok)" }], { fmt: (v) => Math.round(v).toLocaleString("en-US") });
    el.querySelector("#p-step").addEventListener("click", () => view.step(app, +el.querySelector("#p-steps").value, false));
    el.querySelector("#p-corrupt").addEventListener("click", () => view.step(app, 3, true));
    el.querySelector("#p-kill").addEventListener("click", () => view.kill(app));
    el.querySelector("#p-release").addEventListener("click", () => view.release(app));
    void clock;
  },
  async step(app, steps, corrupt) {
    app.sound.cue("start");
    try {
      const r = await app.api("/api/paper/step", { steps: corrupt ? 3 : steps, instrument: "DEMO-ETF-A", strategy: "sma_trend", corrupt_next: corrupt }, { timeout: 60000 });
      app.toast(`Processed ${r.processed} simulated sessions; ${r.remaining} remaining in the replay.`, "ok");
    } catch (e) { app.toast(`Paper step refused: ${e.message}`, "warn"); }
    app.reload();
  },
  async kill(app) {
    const reason = await app.confirm({ title: "Engage the kill switch?", body: "Cancels every open simulated order and blocks new ones until a named person releases it.", input: { label: "Reason", value: "operator stop", required: true }, ok: "Engage kill switch" });
    if (!reason) return;
    try { const r = await app.api("/api/kill", { reason }); app.toast(`Kill switch engaged; ${r.cancelled.length} open orders cancelled.`, "bad"); }
    catch (e) { app.toast(e.message, "warn"); }
    app.reload();
  },
  async release(app) {
    const by = await app.confirm({ title: "Release the kill switch?", body: "Only a named human operator can release it. The release is recorded in the audit log.", input: { label: "Your name", required: true }, ok: "Release", danger: false });
    if (!by) return;
    try { await app.api("/api/release", { by }); app.toast(`Kill switch released by ${by}.`, "ok"); }
    catch (e) { app.toast(e.message, "warn"); }
    app.reload();
  },
};
export default view;
