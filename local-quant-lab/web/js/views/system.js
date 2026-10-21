// System: services, credentials (status only), resources, execution mode, limits, preferences and the motion
// policy ("what moves and why").
import { esc, money, pct, duration } from "../format.js";

export default {
  title: "System",
  load: (app) => app.api("/api/system"),
  render(app, el, s) {
    const P = app.prefs;
    const L = s.risk_limits || {};
    el.innerHTML = `
    <div class="view-head"><h1>System</h1><p>Local services and safety settings. Credentials are never shown, only whether they are configured.</p></div>
    <div class="grid">
      <div class="two">
        <section class="panel"><header><h2>Services</h2><span class="src">probed by the server</span></header>
          <table><tbody>${s.services.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td><span class="tag ${/^(up|available|reachable)/.test(x.status) ? "ok" : x.status === "none" ? "muted" : "warn"}">${esc(x.status)}</span></td><td>${esc(x.detail)}</td></tr>`).join("")}</tbody></table>
          <p class="muted" style="font-size:var(--fs-xs)">Hermes and Ollama are optional. The intended HP host for local models is not configured from here; nothing listens beyond 127.0.0.1.</p></section>
        <section class="panel"><header><h2>Resources</h2><span class="src">this server process</span></header>
          <dl class="kv"><dt>python</dt><dd>${esc(s.python)} · ${esc(s.platform)} ${esc(s.machine)}</dd><dt>cpus</dt><dd>${esc(s.cpus)}</dd>
          <dt>load avg</dt><dd>${s.load_avg ? s.load_avg.map((x) => x.toFixed(2)).join(" · ") : "n/a"}</dd><dt>uptime</dt><dd>${duration(s.server_uptime_s)}</dd>
          <dt>peak RSS</dt><dd>${esc(s.server_peak_rss_mb)} MB</dd><dt>state disk free</dt><dd>${esc(s.state_disk_free_gb)} GB</dd><dt>events log</dt><dd>${esc(s.events_log_kb)} KB</dd></dl></section>
      </div>
      <div class="two">
        <section class="panel"><header><h2>Safety</h2><span class="src">config/settings.json · edited by a human only</span></header>
          <dl class="kv"><dt>execution mode</dt><dd>${esc(s.execution_mode)}</dd><dt>live trading</dt><dd>absent from this build</dd><dt>broker</dt><dd>none (no adapter)</dd>
          ${Object.entries(s.credentials).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}
          <dt>allowed instruments</dt><dd>${esc((L.allowed_instruments || []).join(", "))}</dd><dt>max order notional</dt><dd>${money(L.max_order_notional)}</dd>
          <dt>max position notional</dt><dd>${money(L.max_position_notional)}</dd><dt>max gross exposure</dt><dd>${money(L.max_gross_exposure)}</dd>
          <dt>max concentration</dt><dd>${pct(L.max_concentration, 0)}</dd><dt>max daily loss</dt><dd>${money(L.max_daily_loss)}</dd><dt>max drawdown</dt><dd>${pct(L.max_drawdown, 0)}</dd>
          <dt>data age limit</dt><dd>${duration(L.max_data_age_seconds)}</dd><dt>short selling</dt><dd>${L.allow_short ? "on" : "disabled"}</dd></dl></section>
        <section class="panel prefs"><header><h2>Preferences</h2><span class="src">this browser only</span></header>
          <div class="row"><button class="btn" id="pf-sound" aria-pressed="${P.sound && app.sound.enabled}" data-k="pf-sound">${P.sound && app.sound.enabled ? "Sound on" : "Sound off"}</button>
            <label class="field" style="text-transform:none">Volume <input type="range" id="pf-vol" min="0" max="1" step="0.05" value="${P.volume}" data-k="pf-vol" aria-label="Volume"></label></div>
          <div class="row"><label><input type="checkbox" id="pf-tex" ${P.texture ? "checked" : ""} data-k="pf-tex"> Low activity hum while a job runs (needs sound on)</label></div>
          <div class="row">${["start", "complete", "warning", "critical"].map((c) => `<button class="btn small" data-cue="${c}" data-k="cue-${c}">Test ${c}</button>`).join("")}</div>
          <div class="row"><label class="field" style="text-transform:none">Motion <select id="pf-motion" data-k="pf-motion">${["system", "full", "reduced"].map((m) => `<option ${P.motion === m ? "selected" : ""} value="${m}">${m === "system" ? "follow the OS setting" : m}</option>`).join("")}</select></label>
            <span class="muted">effective: ${app.reduced() ? "reduced" : "full"}</span></div>
          <div class="kicker" style="margin-top:10px">Keyboard</div>
          <div class="hist">1–7 workspaces · ⌘K / Ctrl+K or / command palette · A activity · S sound · M motion · arrows move between graph tasks · Enter selects · Esc closes</div></section>
      </div>
      <section class="panel"><header><h2>What moves and why</h2><span class="src">motion policy</span></header>
        <table><thead><tr><th>on screen</th><th>trigger</th><th>source</th></tr></thead><tbody>
          <tr><td>Dial node halo, graph node glow, role card glow</td><td>a job is running for that task or role</td><td>/api/jobs (job runner)</td></tr>
          <tr><td>Scan arc around the dial core</td><td>any job is running; stops when none is</td><td>/api/jobs</td></tr>
          <tr><td>Edge sweep from a task to its dependents</td><td>once, when a job for that task finished</td><td>job_finished / job_failed events</td></tr>
          <tr><td>New rows flash in the decision trace</td><td>a new audit event arrived</td><td>state/events.jsonl</td></tr>
          <tr><td>Workspace fade-in</td><td>navigation</td><td>your input</td></tr>
          <tr><td>Nothing else</td><td>an idle system is drawn still</td><td>—</td></tr>
        </tbody></table></section>
    </div>`;
    el.querySelector("#pf-sound").addEventListener("click", () => { app.enableSound(!(app.prefs.sound && app.sound.enabled)); app.rerender(); });
    el.querySelector("#pf-vol").addEventListener("change", (e) => app.setPref("volume", Number(e.target.value)));
    el.querySelector("#pf-tex").addEventListener("change", (e) => app.setPref("texture", e.target.checked));
    el.querySelector("#pf-motion").addEventListener("change", (e) => { app.setPref("motion", e.target.value); app.rerender(); });
    el.querySelectorAll("[data-cue]").forEach((b) => b.addEventListener("click", () => {
      if (!app.sound.enabled) { app.toast("Turn sound on first.", "warn"); return; }
      app.sound.limiter.last.delete(b.dataset.cue);
      app.sound.cue(b.dataset.cue);
    }));
  },
};
