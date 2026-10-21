// Console shell: routing, polling, notifications, sound, preferences, command palette, confirmations.
// Data flow: the server is the only source of numbers. /api/pulse (every 2.5 s while the tab is visible) carries the
// event count, jobs and status; a change re-loads the current workspace. Animations and sounds are triggered only by
// new audit events or job transitions, never by a timer.
import { api, conn, onConn } from "./api.js";
import { esc, clock } from "./format.js";
import { eventCue, job as jobS } from "./status.js";
import * as prefsMod from "./prefs.js";
import { Sound } from "./sound.js";
import overview from "./views/overview.js";
import graphView from "./views/graph.js";
import dataView from "./views/data.js";
import research from "./views/research.js";
import paper from "./views/paper.js";
import logs from "./views/logs.js";
import system from "./views/system.js";

const $ = (id) => document.getElementById(id);
const VIEWS = { overview, graph: graphView, data: dataView, research, paper, logs, system };
const ORDER = ["overview", "graph", "data", "research", "paper", "logs", "system"];
const store = (() => { try { return window.localStorage; } catch { return null; } })();
const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

const app = {
  view: null,
  prefs: store ? prefsMod.load(store) : { ...prefsMod.DEFAULTS },
  sound: new Sound(),
  sel: {},             // per-view selections (task id, experiment id, dataset key)
  cache: {},           // last loaded data per view
  status: null,
  events: [],
  eventsTotal: 0,
  jobs: [],
  flash: new Map(),    // task id -> expiry (ms): one-shot "completed" animation after a real job finished
  api,
  esc,
};
app.reduced = () => prefsMod.reducedMotion(app.prefs.motion, mq.matches);

// ---------------- preferences ----------------
app.setPref = (k, v) => {
  app.prefs = prefsMod.sanitize({ ...app.prefs, [k]: v });
  if (store) prefsMod.save(store, app.prefs);
  applyPrefs();
};
function applyPrefs() {
  document.body.classList.toggle("reduced", app.reduced());
  app.sound.setVolume(app.prefs.volume);
  const on = app.prefs.sound && app.sound.enabled;
  $("b-sound").setAttribute("aria-pressed", String(on));
  $("sound-lbl").textContent = on ? "Sound on" : "Sound off";
  app.sound.texture(on && app.prefs.texture && app.jobs.some((j) => j.status === "running"));
}
app.enableSound = (on) => {                       // only ever called from a click or key press
  app.setPref("sound", on);
  app.sound.enable(on);
  applyPrefs();
  if (on) app.sound.cue("start");
};

// ---------------- notifications ----------------
app.toast = (text, tone = "info", ms = 5200) => {
  const t = document.createElement("div");
  t.className = "toast " + tone;
  t.textContent = text;
  $("toasts").appendChild(t);
  while ($("toasts").children.length > 4) $("toasts").firstChild.remove();
  setTimeout(() => t.remove(), ms);
};
const announce = (text) => { $("announce").textContent = ""; setTimeout(() => ($("announce").textContent = text), 30); };

// ---------------- confirmation dialog (replaces prompt()) ----------------
app.confirm = ({ title, body, input = null, ok = "Confirm", danger = true }) => new Promise((resolve) => {
  const d = $("dlg-confirm");
  $("confirm-title").textContent = title;
  $("confirm-body").textContent = body;
  $("confirm-ok").textContent = ok;
  $("confirm-ok").className = "btn " + (danger ? "danger" : "primary");
  $("confirm-field").hidden = !input;
  if (input) { $("confirm-label").textContent = input.label; $("confirm-input").value = input.value || ""; }
  d.returnValue = "";
  const done = () => {
    d.removeEventListener("close", done);
    if (d.returnValue !== "ok") return resolve(null);
    if (input) {
      const v = $("confirm-input").value.trim();
      if (input.required && !v) { app.toast(`${input.label} is required; nothing was done.`, "warn"); return resolve(null); }
      return resolve(v);
    }
    resolve(true);
  };
  d.addEventListener("close", done);
  d.showModal();
  (input ? $("confirm-input") : $("confirm-ok")).focus();
});

// ---------------- jobs ----------------
app.submitJob = async (kind, target, params) => {
  try {
    const j = await api("/api/jobs", { kind, target, params });
    app.sound.cue("start");
    app.toast(`${j.id} ${j.status}: ${j.label}`, "info");
    await pulse(true);
    return j;
  } catch (e) {
    app.toast(`Not started: ${e.message}`, "warn");
    return null;
  }
};
app.cancelJob = async (id) => {
  try { const j = await api("/api/jobs/cancel", { id }); app.toast(`${id}: ${j.status}${j.cancel_requested ? " (stopping)" : ""}`, "warn"); }
  catch (e) { app.toast(`Cannot cancel: ${e.message}`, "warn"); }
  pulse(true);
};

// ---------------- routing ----------------
app.go = (view, sel) => {
  if (!VIEWS[view]) view = "overview";
  if (sel) Object.assign(app.sel, sel);
  if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
  show(view);
};
async function show(view, { quiet = false } = {}) {
  const changed = app.view !== view;
  app.view = view;
  app.setPref("view", view);
  document.querySelectorAll(".rail a").forEach((a) => (a.dataset.view === view ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  document.querySelectorAll(".view").forEach((s) => (s.hidden = s.dataset.view !== view));
  const el = $("v-" + view);
  if (changed) { document.title = `${VIEWS[view].title} · Local Quant Lab`; if (!quiet) $("main").focus({ preventScroll: true }); }
  if (changed && !app.cache[view]) el.innerHTML = `<p class="empty">Loading ${esc(VIEWS[view].title)}…</p>`;
  await reload(view);
}
async function reload(view) {
  const v = VIEWS[view], el = $("v-" + view);
  try {
    app.cache[view] = await v.load(app);
    render(view);
  } catch (e) {
    if (!app.cache[view]) el.innerHTML = `<div class="panel"><b>Could not load ${esc(v.title)}</b><p class="muted">${esc(e.message)}. The server may be stopped: start it with <code>make run</code>.</p></div>`;
  }
}
function render(view) {
  const el = $("v-" + view);
  const focusKey = document.activeElement && el.contains(document.activeElement) ? document.activeElement.dataset.k : null;
  VIEWS[view].render(app, el, app.cache[view]);
  if (focusKey) { const f = el.querySelector(`[data-k="${CSS.escape(focusKey)}"]`); if (f) f.focus({ preventScroll: true }); }
}
app.rerender = () => app.view && app.cache[app.view] && render(app.view);
app.reload = () => app.view && reload(app.view);

// ---------------- shell status ----------------
function measure() {
  document.documentElement.style.setProperty("--ticker-h", document.querySelector(".ticker").offsetHeight + "px");
  document.documentElement.style.setProperty("--banner-h", $("banner").offsetHeight + "px");
}
window.addEventListener("resize", measure);
function posture(s) {
  const short = s.data_mode.replace(/\s*\(.*\)$/, "").replace(/;.*$/, "");
  const p = [
    [s.execution_mode, s.settings_ok ? "ok" : "bad", "Execution mode. There is no live mode in this build."],
    [`DATA: ${short}`, /provisional/i.test(s.data_mode) ? "warn" : /verified/i.test(s.data_mode) ? "ok" : "synthetic", s.data_mode],
    ["NO BROKER · NO LIVE", "muted", "No broker adapter exists; live trading is absent"],
    [s.kill_switch ? "KILL SWITCH ON" : "KILL OFF", s.kill_switch ? "bad" : "ok", "Paper kill switch"],
    [s.reconciled ? "LEDGER OK" : "LEDGER MISMATCH", s.reconciled ? "ok" : "bad", "Paper ledger reconciled against its fill journal"],
    [s.data_lockout ? "FEED LOCKED" : "FEED OK", s.data_lockout ? "bad" : "ok", "Paper replay data validation"],
    [`HERMES: ${s.hermes.available ? "ADVISORY" : "FALLBACK"}`, s.hermes.available ? "info" : "warn", s.hermes.detail],
  ];
  $("posture").innerHTML = p.map(([t, c, title]) => `<span class="chip ${c}" title="${esc(title)}">${esc(t)}</span>`).join("");
  measure();
  $("utc").textContent = clock(s.server_time) + " UTC";
  $("ver").textContent = `v${s.app_version} · engine ${s.engine_version}`;
  const synth = /^synthetic only/i.test(s.data_mode);
  $("banner").className = "banner";
  $("banner").textContent = synth
    ? "DEMO / SYNTHETIC DATA — simulated results only. No live trading exists in this build. Nothing here is a profitability claim."
    : `DATA: ${s.data_mode}. Provisional data has no evidence value. Simulated paper trading only; no live trading exists.`;
  measure();
}
onConn((c) => {
  $("conn").className = "conn " + (c.up ? "up" : "down");
  $("conn").textContent = c.up ? "SERVER UP" : "SERVER DOWN";
  document.body.classList.toggle("offline", !c.up);
  if (!c.up) {
    $("posture").insertAdjacentHTML("afterbegin", `<span class="chip stale">STALE: LAST KNOWN VALUES</span>`);
    $("banner").className = "banner down";
    $("banner").textContent = `Server unreachable (${c.lastError}). Numbers on screen are the last values received; nothing is being updated. Start it with: make run`;
    measure();
    announce("Connection to the local server lost");
  } else if (app.status) { posture(app.status); announce("Connection restored"); }
});

// ---------------- pulse: the only timer ----------------
let pulseBusy = false;
async function pulse(force = false) {
  if (pulseBusy || (document.hidden && !force)) return;
  pulseBusy = true;
  try {
    const p = await api("/api/pulse?since=" + app.eventsTotal, undefined, { timeout: 8000 });
    app.status = p.status;
    posture(p.status);
    const before = JSON.stringify(app.jobs.map((j) => [j.id, j.status]));
    app.jobs = p.jobs;
    const active = p.jobs.filter((j) => j.status === "queued" || j.status === "running");
    $("jobs-chip").textContent = `${active.length} JOB${active.length === 1 ? "" : "S"}`;
    $("jobs-chip").className = "chip " + (active.some((j) => j.status === "running") ? "active" : "");
    const fresh = app.eventsTotal ? p.events : [];
    const first = !app.eventsTotal;
    app.eventsTotal = p.events_total;
    if (fresh.length) onEvents(fresh);
    const jobsChanged = before !== JSON.stringify(app.jobs.map((j) => [j.id, j.status]));
    applyPrefs();
    if ((fresh.length || jobsChanged) && !first) { Object.keys(app.cache).forEach((k) => k !== app.view && delete app.cache[k]); await reload(app.view); }
    renderActivity();
  } catch { /* conn state already updated by api() */ }
  finally { pulseBusy = false; }
}
function onEvents(evts) {
  app.events = app.events.concat(evts).slice(-200);
  let worst = null;
  const rank = { complete: 1, warning: 2, critical: 3 };
  for (const e of evts) {
    const c = eventCue(e);
    if (c && (!worst || rank[c] > rank[worst])) worst = c;
    if (e.kind === "job_finished" || e.kind === "job_failed") {
      const tgt = e.data && e.data.target;
      if (tgt) app.flash.set(String(tgt), Date.now() + 2200);
      app.toast(e.message, e.kind === "job_failed" ? "bad" : "ok");
      announce(e.message);
    } else if (c === "critical") { app.toast(e.message, "bad", 9000); announce(e.message); }
    else if (c === "warning" && e.kind !== "risk_rejected") app.toast(e.message, "warn");
  }
  if (worst) app.sound.cue(worst);                       // one cue per batch, rate-limited inside Sound
  const n = $("act-n"); n.textContent = String(Number(n.textContent || 0) + evts.length);
}

// ---------------- activity drawer ----------------
const NOTABLE = /^(job_|risk_|kill|data_|acceptance|reconciliation|experiment|task_transition|research_|forward_|orders_|order_|paper_|server_start|config)/;
function renderActivity() {
  const d = $("activity");
  if (d.hidden) return;
  const jobs = app.jobs.slice(0, 10).map((j) => {
    const s = jobS(j.status);
    return `<tr><td class="mono">${esc(j.id)}</td><td>${esc(j.label)}</td><td><span class="tag ${s.tone}">${s.glyph} ${esc(s.label)}</span></td><td class="r num">${j.duration_s ?? (j.elapsed_s != null ? j.elapsed_s + "s…" : "–")}</td><td>${j.cancellable && (j.status === "queued" || j.status === "running") ? `<button class="btn small" data-cancel="${esc(j.id)}" data-k="cancel-${esc(j.id)}">Cancel</button>` : ""}</td></tr>`;
  }).join("");
  const ev = app.events.filter((e) => NOTABLE.test(e.kind)).slice(-40).reverse().map((e) =>
    `<div class="tr ${e.severity === "critical" ? "bad" : e.severity === "warning" ? "warn" : ""}"><span>${esc(clock(e.t))}</span><span class="k">${esc(e.kind)}</span><span class="m">${esc(e.message)}</span></div>`).join("");
  d.innerHTML = `<header style="display:flex;justify-content:space-between;align-items:center"><span class="kicker">Activity</span><button class="btn small" id="act-close" data-k="act-close">Close <kbd>Esc</kbd></button></header>
    <section class="panel" style="margin-top:8px"><header><h3>Jobs</h3><span class="src">in-memory runner · 1 worker</span></header>${jobs ? `<table><tbody>${jobs}</tbody></table>` : `<p class="empty">No jobs since the server started.</p>`}</section>
    <section class="panel" style="margin-top:8px"><header><h3>Notable events this session</h3><span class="src">state/events.jsonl</span></header>${ev ? `<div class="trace">${ev}</div>` : `<p class="empty">Nothing new since this page opened.</p>`}</section>`;
  d.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", () => app.cancelJob(b.dataset.cancel)));
  $("act-close").addEventListener("click", () => toggleActivity(false));
}
function toggleActivity(open) {
  const d = $("activity");
  d.hidden = !open;
  $("b-activity").setAttribute("aria-expanded", String(open));
  if (open) { $("act-n").textContent = "0"; renderActivity(); d.querySelector("button")?.focus(); }
  else $("b-activity").focus();
}

// ---------------- command palette ----------------
function commands() {
  const c = ORDER.map((v, i) => ({ label: `Go to ${VIEWS[v].title}`, hint: String(i + 1), run: () => app.go(v) }));
  c.push({ label: "Run a backtest (synthetic)…", hint: "research", run: () => { app.go("research"); setTimeout(() => document.querySelector("#bt-inst")?.focus(), 80); } });
  for (const n of (app.cache.graph || app.cache.overview?.graph || { nodes: [] }).nodes || []) {
    if (n.recheckable) c.push({ label: `Re-run acceptance tests: ${n.id}`, hint: "job", run: () => app.submitJob("recheck", n.id) });
  }
  c.push({ label: "Step paper replay 20 sessions (synthetic)", hint: "paper", run: () => VIEWS.paper.step(app, 20, false) });
  c.push({ label: "Engage kill switch…", hint: "safety", run: () => VIEWS.paper.kill(app) });
  c.push({ label: "Release kill switch…", hint: "safety", run: () => VIEWS.paper.release(app) });
  c.push({ label: app.prefs.sound ? "Turn sound off" : "Turn sound on", hint: "S", run: () => app.enableSound(!app.prefs.sound) });
  c.push({ label: `Motion: ${app.reduced() ? "use full motion" : "reduce motion"}`, hint: "M", run: () => app.setPref("motion", app.reduced() ? "full" : "reduced") });
  c.push({ label: "Open activity", hint: "A", run: () => toggleActivity(true) });
  c.push({ label: "Copy diagnostics (status, jobs, recent events)", hint: "logs", run: () => VIEWS.logs.copyDiagnostics(app) });
  return c;
}
let palItems = [], palIdx = 0;
function openPalette() {
  const d = $("dlg-cmd");
  $("cmd-input").value = "";
  drawPalette();
  d.showModal();
  $("cmd-input").focus();
}
function drawPalette() {
  const q = $("cmd-input").value.trim().toLowerCase();
  palItems = commands().filter((c) => !q || c.label.toLowerCase().includes(q)).slice(0, 40);
  palIdx = Math.min(palIdx, Math.max(0, palItems.length - 1));
  $("cmd-list").innerHTML = palItems.map((c, i) => `<li role="option" id="cmd-${i}" aria-selected="${i === palIdx}" data-i="${i}">${esc(c.label)} <span class="muted">${esc(c.hint)}</span></li>`).join("") || `<li class="muted">No matching command</li>`;
  $("cmd-input").setAttribute("aria-activedescendant", palItems.length ? `cmd-${palIdx}` : "");
}
function runPalette(i) {
  const c = palItems[i];
  $("dlg-cmd").close();
  if (c) c.run();
}
$("cmd-input").addEventListener("input", () => { palIdx = 0; drawPalette(); });
$("cmd-input").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { palIdx = Math.min(palItems.length - 1, palIdx + 1); drawPalette(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { palIdx = Math.max(0, palIdx - 1); drawPalette(); e.preventDefault(); }
  else if (e.key === "Enter") { runPalette(palIdx); e.preventDefault(); }
});
$("cmd-list").addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); if (li) runPalette(Number(li.dataset.i)); });

// ---------------- global wiring ----------------
$("b-cmd").addEventListener("click", openPalette);
$("b-activity").addEventListener("click", () => toggleActivity($("activity").hidden));
$("b-sound").addEventListener("click", () => app.enableSound(!(app.prefs.sound && app.sound.enabled)));
window.addEventListener("hashchange", () => app.go(location.hash.slice(1)));
document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
  if (e.key === "Escape" && !$("activity").hidden) { toggleActivity(false); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
  if (/^[1-7]$/.test(e.key)) { app.go(ORDER[Number(e.key) - 1]); e.preventDefault(); }
  else if (e.key === "/") { e.preventDefault(); openPalette(); }
  else if (e.key.toLowerCase() === "a") toggleActivity($("activity").hidden);
  else if (e.key.toLowerCase() === "s") app.enableSound(!(app.prefs.sound && app.sound.enabled));
  else if (e.key.toLowerCase() === "m") app.setPref("motion", app.reduced() ? "full" : "reduced");
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) pulse(true); });
if (mq.addEventListener) mq.addEventListener("change", applyPrefs);
window.__lql = app;   // for the browser checks in scripts/ui_check.mjs

applyPrefs();
// Sound stays off after a reload until the user clicks again (autoplay rules): show the stored preference honestly.
if (app.prefs.sound) { app.prefs.sound = false; applyPrefs(); }
pulse(true).then(() => app.go(location.hash.slice(1) || app.prefs.view || "overview"));
setInterval(() => pulse(false), 2500);
setInterval(() => { if (!document.hidden && app.view) reload(app.view); }, 20000);
