#!/usr/bin/env node
// Browser verification of the console against a REAL local server with a throwaway SYNTHETIC demo state.
// Exercises the 3D trading floor (brain, desks, growth after a real job, WebGL fallback), navigation, the graph, a real
// job, the command palette, sound and motion preferences, persistence, disconnection/reconnection and responsive
// layout, and measures timings, frame rate, long tasks and heap. Headless Chromium renders WebGL in software
// (SwiftShader), so its frame rates say nothing about a real GPU.
//
//   node scripts/ui_check.mjs [outDir]          (needs Playwright; uses the preinstalled Chromium if present)
//
// Nothing here touches state/ in the repository: the server runs with --state-dir pointing at a temp directory.
import { createRequire } from "module";
import { execSync, spawn } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2] || join(tmpdir(), "lql-ui-check");
mkdirSync(OUT, { recursive: true });
let chromium;
try { chromium = createRequire(import.meta.url)("playwright").chromium; }
catch { chromium = createRequire(execSync("npm root -g").toString().trim() + "/")("playwright").chromium; }

const STATE = mkdtempSync(join(tmpdir(), "lql-ui-state-"));
copyFileSync(join(ROOT, "state", "current_state.json"), join(STATE, "current_state.json"));
execSync(`python3 -c "from lql.lab import Lab; lab=Lab(state_dir='${STATE}'); lab.experiment('DEMO-ETF-A','sma_trend'); lab.experiment('DEMO-ETF-B','sma_trend'); lab.experiment('DEMO-ETF-A','vol_scaled_trend'); lab.paper_step(120,'DEMO-ETF-A','sma_trend')"`, { cwd: ROOT });
const PORT = 8790 + Math.floor(Math.random() * 100);
const URL = `http://127.0.0.1:${PORT}/`;
let server;
const startServer = async () => {
  server = spawn("python3", ["-m", "lql.server", "--port", String(PORT), "--state-dir", STATE], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(URL + "api/status"); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error("server did not start");
};
const results = { checks: [], perf: {}, errors: [], conditions: {} };
const check = (name, ok, detail = "") => { results.checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };

await startServer();
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
results.conditions = { chromium: browser.version(), viewport: "1440x900", host: `${process.platform} ${process.arch}`, node: process.version, data: "synthetic demo state (temp dir)" };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => results.errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_CONNECTION_REFUSED/.test(m.text())) results.errors.push(m.text()); });
await page.addInitScript(() => {
  try { if (!localStorage.getItem("lql.prefs.v1")) localStorage.setItem("lql.prefs.v1", JSON.stringify({ neurons: "low" })); } catch { /* storage blocked */ }
  window.__long = [];
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: "longtask", buffered: true }); } catch { /* not supported */ }
});

// 1. startup
let t0 = Date.now();
await page.goto(URL);
await page.waitForSelector("#v-overview .role");
results.perf.startup_to_overview_ms = Date.now() - t0;
check("startup renders the overview with 10 role cards", (await page.locator("#v-overview .role").count()) === 10);
check("safety posture visible", /SIMULATED/.test(await page.textContent("#posture")) && /NO BROKER/.test(await page.textContent("#posture")));
check("synthetic banner visible", /SYNTHETIC/.test(await page.textContent("#banner")));
await page.waitForFunction(() => /WORKER UP/.test(document.querySelector("#worker-chip").textContent), null, { timeout: 8000 }).catch(() => {});
check("the worker is reported separately from the server", /SERVER UP/.test(await page.textContent("#conn")) && /WORKER UP/.test(await page.textContent("#worker-chip")));
const nav = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, transfer: n.transferSize }; });
results.perf.navigation = nav;

// 1b. the 3D floor: brain, supervisor and desks, all drawn from /api/overview
t0 = Date.now();
await page.waitForFunction(() => window.__lql && window.__lql._floor && window.__lql._floor.stats().neurons > 0, null, { timeout: 30000 }).catch(() => {});
results.perf.floor_ready_ms = Date.now() - t0;
const floorStats = () => page.evaluate(() => (window.__lql._floor ? window.__lql._floor.stats() : null));
const st0 = await floorStats();
results.perf.brain_build_ms_150k = st0 && st0.build_ms;
check("the 3D floor renders a 150k-neuron brain with WebGL", !!st0 && st0.neurons === 150000 && (await page.locator("#floor-stage canvas").count()) === 1, st0 ? `built in ${st0.build_ms} ms (worker)` : "no floor");
check("the supervisor and 9 desks are labelled", (await page.locator(".floor-label[data-desk]").count()) === 10);
let ov = await (await fetch(URL + "api/overview")).json();
const expected = await page.evaluate(async (brain) => {
  const B = await import("/static/js/scene/brain-geometry.js"), M = await import("/static/js/scene/floor-model.js");
  return B.formedNeurons(B.regionCounts(150000, M.sharesOf(brain)), M.formedArray(brain));
}, ov.brain);
await page.waitForFunction((n) => document.querySelector("#floor-hud").textContent.includes(n), expected.toLocaleString("en-US"), { timeout: 5000 }).catch(() => {});
const hud = await page.textContent("#floor-hud");
check("formed neurons = the server's brain model (recorded evidence only)", st0 && st0.formed_neurons === expected && expected > 0 && hud.includes(expected.toLocaleString("en-US")), `${expected} of 150,000`);
check("EDGE core stays dark on synthetic data", /dark: no proven trading edge/i.test(hud) && ov.brain.regions.find((r) => r.key === "edge").formed === 0);
check("the supervisor is a hologram bust whose face stays a blank mask without a proven edge", st0 && st0.bust_points > 0 && st0.face_stage === 0 && /blank mask/i.test(hud));
check("the HUD shows the brain's stage on the path to Ultron", hud.includes(`Stage ${ov.brain.stage.index + 1}/6`) && ov.brain.stage.index < 4, ov.brain.stage.name);
await page.screenshot({ path: join(OUT, "overview-1440.jpg"), type: "jpeg", quality: 82, fullPage: true });
await page.click('.floor-label[data-desk="critic"]');
await page.waitForSelector("#floor-insp:not([hidden])", { timeout: 5000 }).catch(() => {});
const critic = ov.desks.find((x) => x.key === "critic");
const inspText = (await page.textContent("#floor-insp")) || "";
check("clicking a desk shows its real task, metrics and result", inspText.includes(critic.task) && inspText.includes(critic.result) && inspText.includes(critic.metrics[0][1]), critic.task);
await page.waitForTimeout(7000);   // the camera flight runs on scene time, which crawls under software WebGL
await page.screenshot({ path: join(OUT, "floor-desk-1440.jpg"), type: "jpeg", quality: 82 });
await page.keyboard.press("Escape");
check("Esc closes the desk inspector", (await page.locator("#floor-insp[hidden]").count()) === 1);
// a real backtest finishes: the critic and research regions grow, a completion beam and a neuron stream are drawn
const before = (await floorStats()).formed_neurons;
await fetch(URL + "api/jobs", { method: "POST", headers: { "Content-Type": "application/json", "X-LQL-Request": "1" }, body: JSON.stringify({ kind: "backtest", params: { instrument: "DEMO-ETF-B", strategy: "vol_scaled_trend", source: "synthetic" } }) });
let sawBeam = false, sawStream = false, grew = 0;
for (let i = 0; i < 150 && !(grew && sawBeam && sawStream); i++) {
  const st = await floorStats();
  sawBeam ||= st.beams > 0; sawStream ||= st.streams > 0;
  if (st.formed_neurons > before) grew = st.formed_neurons - before;
  await page.waitForTimeout(100);
}
check("a finished backtest grows the brain", grew > 0, `+${grew} neurons`);
check("its completion beam and neuron stream are drawn", sawBeam && sawStream);
ov = await (await fetch(URL + "api/overview")).json();
check("the floor never claims an edge from synthetic work", ov.brain.regions.find((r) => r.key === "edge").formed === 0);

// 2. every workspace by keyboard, with timing and no horizontal scroll
const views = ["overview", "graph", "data", "research", "paper", "logs", "system"];
results.perf.view_switch_ms = {};
for (let i = 0; i < views.length; i++) {
  await page.locator("body").click({ position: { x: 5, y: 300 } }).catch(() => {});
  t0 = Date.now();
  await page.keyboard.press(String(i + 1));
  await page.waitForSelector(`#v-${views[i]}:not([hidden]) .panel`);
  results.perf.view_switch_ms[views[i]] = Date.now() - t0;
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check(`workspace ${views[i]} opens with key ${i + 1}, no horizontal scroll`, !overflow);
  if (["graph", "research", "data", "system"].includes(views[i])) await page.screenshot({ path: join(OUT, `${views[i]}-1440.jpg`), type: "jpeg", quality: 82 });
}

// 3. graph: select, inspect, keyboard move, filter, search
await page.keyboard.press("2");
await page.waitForSelector('[data-id="M3-risk-paper"]');
await page.click('[data-id="M3-risk-paper"]');
check("graph node selection opens the inspector", /M3-risk-paper/.test(await page.textContent(".inspector h3")));
check("inspector lists upstream dependencies", /M2-backtest/.test(await page.textContent(".inspector")));
await page.focus('[data-id="M3-risk-paper"]');
await page.keyboard.press("ArrowDown");
const moved = await page.evaluate(() => window.__lql.sel.task);
check("arrow keys move the selection", moved && moved !== "M3-risk-paper", moved);
await page.click('[data-status="needs_human"]');
const dimmed = await page.locator(".gnode.dim").count();
check("status filter dims non-matching tasks", dimmed > 0, `${dimmed} dimmed`);
await page.click("#g-clear");
await page.fill("#g-text", "walkforward");
await page.waitForTimeout(350);
check("search narrows the graph", (await page.locator(".gnode:not(.dim)").count()) <= 2);
await page.click("#g-clear");

// 4. a real, safe action: re-run a task's acceptance tests as a background job
await page.click('[data-id="M0-skeleton"]');
t0 = Date.now();
await page.click('[data-act="recheck"]');
let job = null;
for (let i = 0; i < 120; i++) {
  const jobs = await (await fetch(URL + "api/jobs")).json();
  job = jobs[0];
  if (job && job.status !== "queued" && job.status !== "running") break;
  await page.waitForTimeout(250);
}
results.perf.recheck_job_wall_ms = Date.now() - t0;
check("recheck job finished through the UI", job && job.status === "succeeded", job && JSON.stringify(job.result && job.result.summary));
await page.waitForFunction(() => /succeeded|failed|job_finished/.test(document.querySelector("#toasts").textContent), null, { timeout: 8000 }).catch(() => {});
check("a toast reports the job result", /M0-skeleton|j\d/.test(await page.textContent("#toasts")));
const evs = await (await fetch(URL + "api/events")).json();
check("job transitions are in the audit log", ["job_queued", "job_started", "job_finished"].every((k) => evs.some((e) => e.kind === k)));

// 5. idle vs running frame rate on the overview (bounded, 3 s each)
const fps = async () => page.evaluate(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(f); else res(n / ((performance.now() - t) / 1000)); }; requestAnimationFrame(f); }));
await page.keyboard.press("1");
await page.waitForSelector("#v-overview #floor-stage canvas");
results.perf.fps_idle_overview_swiftshader = Math.round(await fps());
await fetch(URL + "api/jobs", { method: "POST", headers: { "Content-Type": "application/json", "X-LQL-Request": "1" }, body: JSON.stringify({ kind: "recheck", target: "M3-risk-paper" }) });
await page.waitForSelector(".floor-label.active", { timeout: 8000 }).catch(() => {});
const busyDesk = await page.locator(".floor-label.active:not(.sup)").first().getAttribute("data-desk").catch(() => null);
const supBusy = await page.evaluate(() => window.__lql._floor.stats().supervisor_active);
const coreText = await page.textContent("#floor-core");
check("the research core shows the running job with measured progress", /RUNNING/.test(coreText) && /\d+\/\d+ commands/.test(coreText), coreText.replace(/\s+/g, " ").slice(0, 90));
check("only the assigned desk works while a real job runs", (await page.locator(".floor-label.active[data-desk]").count()) === 2 && busyDesk && supBusy && /dispatching/.test(await page.textContent("#floor-foot")), `desk ${busyDesk} + supervisor`);
const activeRole = await page.locator(".role.active").count();
check("the owning role card lights up during the job", activeRole === 1, `${activeRole} active`);
results.perf.fps_overview_job_running_swiftshader = Math.round(await fps());
for (let i = 0; i < 80; i++) { const j = (await (await fetch(URL + "api/jobs")).json())[0]; if (j.status === "succeeded" || j.status === "failed") break; await page.waitForTimeout(250); }
await page.waitForTimeout(3000);
check("the floor returns to idle when no job runs", (await page.locator(".floor-label.active").count()) === 0 && /no job running/.test(await page.textContent("#floor-foot")));

// 5b. a Monte Carlo run through the research form: persisted artifact, rendered, still there after a page refresh
await page.keyboard.press("4");
await page.waitForSelector("#mc-form", { timeout: 10000 }).catch(() => {});
await page.fill("#mc-paths", "500");
await page.click('[data-k="mc-go"]');
let mcJob = null;
for (let i = 0; i < 160; i++) {
  mcJob = (await (await fetch(URL + "api/jobs")).json()).find((j) => j.kind === "montecarlo");
  if (mcJob && (mcJob.status === "succeeded" || mcJob.status === "failed")) break;
  await page.waitForTimeout(250);
}
check("a Monte Carlo job runs in the worker and persists its artifact", mcJob && mcJob.status === "succeeded" && mcJob.artifacts[0].kind === "montecarlo", mcJob && mcJob.result && mcJob.result.summary);
await page.waitForFunction(() => document.querySelector("#mc-fan path"), null, { timeout: 10000 }).catch(() => {});
check("the Monte Carlo fan and distribution are drawn from the artifact", (await page.locator("#mc-fan path").count()) > 2 && (await page.locator("#mc-hist rect").count()) > 5);
await page.reload();
await page.waitForSelector("#v-overview .role, #v-research .panel", { timeout: 15000 }).catch(() => {});
await page.keyboard.press("4");
await page.waitForSelector("#mc-fan path", { timeout: 15000 }).catch(() => {});
const rText = (await page.textContent("#v-research")) || "", fanPaths = await page.locator("#mc-fan path").count();
check("results are still there after a browser refresh", fanPaths > 2 && /500 paths/.test(rText), `${fanPaths} fan paths; runs listed: ${(rText.match(/\d+ paths · block \d+/g) || []).join(", ")}; view ${await page.evaluate(() => window.__lql.view)}`);
await page.keyboard.press("1");

// 6. command palette
await page.keyboard.press("Control+k");
await page.fill("#cmd-input", "go to logs");
await page.keyboard.press("Enter");
await page.waitForSelector("#v-logs:not([hidden]) table");
check("command palette navigates", await page.isVisible("#v-logs"));

// 7. sound: off by default, enabled only by a click, rate-limited
check("sound is off by default", (await page.getAttribute("#b-sound", "aria-pressed")) === "false");
await page.click("#b-sound");
check("sound turns on from a click", (await page.getAttribute("#b-sound", "aria-pressed")) === "true");
const played = await page.evaluate(() => window.__lql.sound.played.slice());
check("enabling sound plays one start cue", played.includes("start"), played.join(","));
await page.click("#b-sound");
check("sound turns off", (await page.getAttribute("#b-sound", "aria-pressed")) === "false");

// 8. reduced motion: OS setting and in-app preference, persisted across reload
await page.emulateMedia({ reducedMotion: "reduce" });
await page.waitForFunction(() => document.body.classList.contains("reduced"), null, { timeout: 5000 }).catch(() => {});   // software WebGL can delay the media-query event
check("OS reduced-motion is honoured", await page.evaluate(() => document.body.classList.contains("reduced")));
await page.emulateMedia({ reducedMotion: "no-preference" });
await page.keyboard.press("7");
await page.waitForSelector("#pf-motion");
await page.selectOption("#pf-motion", "reduced");
await page.reload();
await page.waitForSelector("#v-system:not([hidden]) #pf-motion");
check("motion preference and last workspace persist after reload", (await page.inputValue("#pf-motion")) === "reduced" && await page.evaluate(() => document.body.classList.contains("reduced")));
await page.selectOption("#pf-motion", "system");

// 9. keyboard focus is visible and reaches the rail
await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
const focusOk = await page.evaluate(() => !!document.activeElement && document.activeElement !== document.body);
check("Tab moves focus to interactive elements", focusOk);

// 10. disconnection and reconnection
server.kill("SIGTERM");
await page.waitForFunction(() => /SERVER DOWN/.test(document.querySelector("#conn").textContent), null, { timeout: 10000 }).catch(() => {});
check("a stopped server is shown as down, never healthy", /SERVER DOWN/.test(await page.textContent("#conn")) && /unreachable/i.test(await page.textContent("#banner"))
  && /STALE/.test(await page.textContent("#posture")) && await page.evaluate(() => document.body.classList.contains("offline")));
await page.screenshot({ path: join(OUT, "disconnected-1440.jpg"), type: "jpeg", quality: 80 });
await startServer();
await page.waitForFunction(() => /SERVER UP/.test(document.querySelector("#conn").textContent), null, { timeout: 10000 }).catch(() => {});
check("reconnects automatically", /SERVER UP/.test(await page.textContent("#conn")) && !(await page.evaluate(() => document.body.classList.contains("offline"))));
const afterRestart = await (await fetch(URL + "api/jobs")).json();
check("job history and artifacts survive a server restart", mcJob && afterRestart.some((j) => j.id === mcJob.id && j.status === "succeeded")
  && (await fetch(URL + "api/montecarlo/" + mcJob.artifacts[0].id)).ok, `${afterRestart.length} jobs reloaded from state/jobs`);

// 11. repeated navigation: heap growth (Chromium only)
const heap = async () => page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : null));
await page.keyboard.press("1");
await page.waitForTimeout(500);
const h0 = await heap();
for (let i = 0; i < 4; i++) for (let k = 1; k <= 7; k++) { await page.keyboard.press(String(k)); await page.waitForTimeout(120); }
await page.keyboard.press("1");
await page.waitForTimeout(800);
const h1 = await heap();
results.perf.heap_mb_before_after_28_navigations = h0 && h1 ? [+(h0 / 1048576).toFixed(1), +(h1 / 1048576).toFixed(1)] : null;

// 12. graph stress fixture (SYNTHETIC, in-page only): layout + SVG render of 300 tasks
results.perf.graph_stress_300 = await page.evaluate(async () => {
  const G = await import("/static/js/graph-model.js");
  const view = (await import("/static/js/views/graph.js")).default;
  const nodes = Array.from({ length: 300 }, (_, i) => ({ id: "S" + i, goal: "stress fixture", owner: "engineer", status: i % 7 ? "done_verified" : "needs_human", level: Math.floor(i / 20), deps: i >= 20 ? ["S" + (i - 20), "S" + (i - 19 - (i % 3))].filter((x, k, a) => a.indexOf(x) === k && +x.slice(1) >= 0 && +x.slice(1) < i && Math.floor(+x.slice(1) / 20) < Math.floor(i / 20)) : [], dependents: [], retries: 0, retry_budget: 3, acceptance: [], evidence: null, evidence_count: 0, failures: [], history: [], recheckable: false, blocker: null }));
  for (const n of nodes) for (const d of n.deps) nodes[+d.slice(1)].dependents.push(n.id);
  const edges = nodes.flatMap((n) => n.deps.map((d) => ({ from: d, to: n.id })));
  let t = performance.now(); G.layout(nodes); const layoutMs = performance.now() - t;
  const el = document.createElement("section"); el.style.cssText = "position:absolute;left:-99999px;width:1200px"; document.body.appendChild(el);
  t = performance.now(); view.render(window.__lql, el, { nodes, edges, source: "stress fixture", last_checkpoint: null }); const renderMs = performance.now() - t;
  el.remove();
  return { nodes: nodes.length, edges: edges.length, layout_ms: +layoutMs.toFixed(1), render_ms: +renderMs.toFixed(1) };
});
results.perf.long_tasks = await page.evaluate(() => ({ count: window.__long.length, max_ms: window.__long.length ? Math.max(...window.__long) : 0 }));

// 13. phone layout
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
phone.on("pageerror", (e) => results.errors.push("phone: " + e));
await phone.goto(URL + "#overview");
await phone.waitForSelector("#v-overview .role");
for (const v of ["overview", "graph", "research"]) {
  await phone.goto(URL + "#" + v);
  await phone.waitForSelector(`#v-${v}:not([hidden]) .panel`);
  const over = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`phone 390 px: ${v} has no horizontal page scroll`, over <= 1, `${over}px`);
}
await phone.goto(URL + "#overview"); await phone.waitForSelector("#v-overview .role");
await phone.screenshot({ path: join(OUT, "overview-390.jpg"), type: "jpeg", quality: 80, fullPage: true });

check("phone 390 px: the floor fits the screen", await phone.evaluate(() => { const r = document.querySelector("#floor-stage").getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth + 1; }));

// 14. no WebGL: the overview falls back to the flat task dial, everything else still works
const fb = await browser.newPage({ viewport: { width: 1280, height: 800 } });
fb.on("pageerror", (e) => results.errors.push("no-webgl: " + e));
await fb.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; });
await fb.goto(URL + "#overview");
await fb.waitForSelector(".floor-fallback .dial-plane", { timeout: 10000 }).catch(() => {});
check("without WebGL the overview falls back to the flat task dial", (await fb.locator(".floor-fallback .dial-plane").count()) === 1 && (await fb.locator("#v-overview .role").count()) === 10);

check("no page or console errors", results.errors.length === 0, results.errors.slice(0, 3).join(" | "));
await browser.close();
server.kill("SIGTERM");
writeFileSync(join(OUT, "ui_check.json"), JSON.stringify(results, null, 1));
const failed = results.checks.filter((c) => !c.ok).length;
console.log(`\n${results.checks.length - failed}/${results.checks.length} checks passed. perf: ${JSON.stringify(results.perf)}`);
console.log(`results: ${join(OUT, "ui_check.json")}`);
process.exit(failed ? 1 : 0);
