// System: services, credentials (status only), resources, execution mode, limits, preferences and the motion
// policy ("what moves and why").
import { esc, money, pct, duration } from "../format.js";

const tone = (st) => (/^(up|available|ok|busy)/.test(st) ? "ok" : /^(down|failed|full|disabled|degraded)/.test(st) ? "bad" : "warn");
function health(h) {
  if (!h) return `<p class="empty">No health report.</p>`;
  const rows = [
    ["web server", h.http.state, h.http.detail], ["API", h.api.state, h.api.detail],
    ["job worker", h.worker.state, `thread ${h.worker.thread_alive ? "alive" : "not running"} · heartbeat ${h.worker.heartbeat_age_s ?? "–"}s ago${h.worker.running_job ? ` · running ${h.worker.running_job}` : ""}`],
    ["queue", h.queue.state, `${h.queue.depth}/${h.queue.max} waiting · persisted in ${h.queue.persisted_in}`],
    ["research engine", h.research_engine.state, `engine ${h.research_engine.engine_version} · monte carlo ${h.research_engine.montecarlo_method} · walk-forward ${h.research_engine.walk_forward}`],
    ["data: synthetic", h.data_sources.synthetic.state, h.data_sources.synthetic.class],
    ["data: snapshots", h.data_sources.snapshots.state, "all datasets by state: " + (Object.entries(h.data_sources.snapshots.states || {}).map(([k, v]) => `${k} ${v}`).join(" · ") || "none")],
    ...Object.entries(h.data_sources.external).map(([k, v]) => [k, v.startsWith("key") ? "configured" : "not configured", v]),
    ["model: hermes", h.model_provider.hermes, "optional advisory layer"], ["model: ollama", h.model_provider.ollama, "optional local model"],
    ["last successful job", h.last_successful_job ? "ok" : "none yet", h.last_successful_job ? `${h.last_successful_job.id} ${h.last_successful_job.label} · ${h.last_successful_job.finished_at}` : "no job has succeeded on this state directory"],
    ["last research run", h.last_research_run ? "ok" : "none yet", h.last_research_run ? `${h.last_research_run.strategy} ${h.last_research_run.instrument} (${h.last_research_run.source}) · ${h.last_research_run.verdict} · ${h.last_research_run.at}` : "no experiment recorded"],
  ];
  return `<table><tbody>${rows.map(([n, st, det]) => `<tr><td><b>${esc(n)}</b></td><td><span class="tag ${tone(String(st))}">${esc(String(st))}</span></td><td>${esc(det || "")}</td></tr>`).join("")}</tbody></table>`;
}

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
        <section class="panel"><header><h2>Health</h2><span class="src">/api/health · separate states: the server answering says nothing about the worker, data or models</span></header>
          ${health(s.health)}</section>
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
          <tr><td>Floor: a bot typing, its desk edge and monitors lit, the supervisor's dispatch beam to it, its brain region glowing</td><td>a job assigned to that desk is running (recheck → the task owner's desk, backtest → research); the podium rings turn while any job is queued or running</td><td>/api/jobs (job runner)</td></tr>
          <tr><td>Floor: a beam rising from a desk (green done, rose failed)</td><td>once, when that desk's job ended</td><td>/api/jobs</td></tr>
          <tr><td>Floor: particles flying from a desk into the brain, new neurons flashing as they form</td><td>once, when the brain model grew: more recorded, verified work</td><td>/api/overview → brain (task file, experiments, research registry, ledger, datasets, audit log)</td></tr>
          <tr><td>Floor: desk monitors and the wall ticker change text</td><td>the record behind them changed / a new audit event</td><td>/api/overview → desks, events</td></tr>
          <tr><td>Flat dial (no WebGL), graph node glow, role card glow</td><td>a job is running for that task or role</td><td>/api/jobs (job runner)</td></tr>
          <tr><td>Edge sweep from a task to its dependents</td><td>once, when a job for that task finished</td><td>job_finished / job_failed events</td></tr>
          <tr><td>New rows flash in the decision trace</td><td>a new audit event arrived</td><td>state/events.jsonl</td></tr>
          <tr><td>Workspace fade-in, camera flights on the floor</td><td>navigation, a click on a desk or the brain</td><td>your input</td></tr>
          <tr><td>Floor: the supervisor hologram's chest core and body brighten</td><td>any job is queued or running</td><td>/api/jobs</td></tr>
          <tr><td>Floor: the hologram's face gains eyes, then brow and nose, then a mouth</td><td>the brain's EDGE region forms (a proven edge); a blank mask until then</td><td>/api/overview → brain (EDGE region)</td></tr>
          <tr><td>Research core: the accretion disk brightens and turns faster; particles spiral in from a desk</td><td>a job assigned to that desk is running (state RUNNING, with its measured progress or "PROGRESS NOT MEASURED")</td><td>/api/jobs (persisted in state/jobs)</td></tr>
          <tr><td>Research core: amber markers on the rim</td><td>one per persisted queued job (QUEUED)</td><td>/api/jobs</td></tr>
          <tr><td>Research core: one green or red ring pulse; the photon ring turns green or red for 12 s</td><td>a real terminal event: SUCCEEDED (with a link to its artifact) or FAILED (with its error)</td><td>/api/jobs</td></tr>
          <tr><td>Ambient, not data: the neurons' slow shimmer and drift, the hologram's scanlines, the accretion disk's slow idle turn, the wall ticker scrolling</td><td>always while the floor is visible; stopped under reduced motion</td><td>decoration</td></tr>
          <tr><td>Nothing else</td><td>idle bots sit still; the EDGE core stays dark until a proven edge exists</td><td>—</td></tr>
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
