#!/usr/bin/env node
// Frame-rate measurement of the trading floor on this machine's GPU, for the founder's Mac. ui_check.mjs forces
// SwiftShader (software WebGL) so its checks are deterministic; its frame rates say nothing about a real GPU. This
// script launches a visible browser with default GPU settings, records the WebGL renderer the page actually got, and
// labels the result "software: NOT representative of GPU performance" whenever that renderer is a software one.
//
//   node scripts/gpu_fps.mjs [outDir]       (make gpu-fps; needs `npm ci` and `npx playwright install chromium`)
//   LQL_BROWSER_CHANNEL=chrome node scripts/gpu_fps.mjs     (use the installed Google Chrome instead)
//   LQL_QUALITIES=low node scripts/gpu_fps.mjs              (measure only some of low,high,ultra)
//
// Synthetic demo state in a temp directory; nothing touches state/ in the repository. Frame rates are capped by the
// display refresh (requestAnimationFrame), so 60 or 120 means "at the cap", not the GPU's limit.
import { createRequire } from "module";
import { execSync, spawn } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2] || join(tmpdir(), "lql-gpu-fps");
mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(import.meta.url)("playwright");
const SECONDS = 5;
const ALL = { low: 150_000, high: 1_000_000, ultra: 2_000_000 };          // web/js/scene/brain-geometry.js QUALITY
const pick = (process.env.LQL_QUALITIES || "low,high,ultra").split(",").filter((q) => q in ALL);   // e.g. LQL_QUALITIES=low
const QUALITIES = Object.fromEntries(pick.map((q) => [q, ALL[q]]));
if (!pick.length) throw new Error("LQL_QUALITIES must list at least one of: low, high, ultra");
const TOP = pick[pick.length - 1];
const log = (m) => console.error(`[gpu_fps] ${m}`);

const STATE = mkdtempSync(join(tmpdir(), "lql-gpu-state-"));
copyFileSync(join(ROOT, "state", "current_state.json"), join(STATE, "current_state.json"));
execSync(`python3 -c "from lql.lab import Lab; lab=Lab(state_dir='${STATE}'); lab.experiment('DEMO-ETF-A','sma_trend')"`, { cwd: ROOT });
log("synthetic state ready");
const PORT = 8890 + Math.floor(Math.random() * 100);
const URL = `http://127.0.0.1:${PORT}/`;
const server = spawn("python3", ["-m", "lql.server", "--port", String(PORT), "--state-dir", STATE], { cwd: ROOT, stdio: "ignore" });
process.on("exit", () => server.kill("SIGTERM"));
for (let i = 0; ; i++) {
  try { await fetch(URL + "api/status"); break; } catch { if (i > 50) throw new Error("server did not start"); await new Promise((r) => setTimeout(r, 100)); }
}

log("server up");
const browser = await chromium.launch({ headless: false, channel: process.env.LQL_BROWSER_CHANNEL || undefined,
  executablePath: process.env.LQL_CHROMIUM || undefined });                      // same opt-in override as ui_check.mjs
log(`browser ${browser.version()} launched`);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL + "#overview");
await page.waitForSelector("#v-overview #floor-stage canvas", { timeout: 30000 });
const renderer = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const x = gl && gl.getExtension("WEBGL_debug_renderer_info");
  return gl ? (x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : null;
});
log(`renderer: ${renderer}`);
const software = !renderer || /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);

// Frames over SECONDS with per-frame intervals, so a cap and stutter are both visible.
const sample = () => page.evaluate((s) => new Promise((res) => {
  const d = []; let last = performance.now(); const t0 = last;
  const f = (now) => { d.push(now - last); last = now; if (now - t0 < s * 1000) requestAnimationFrame(f); else {
    d.sort((a, b) => a - b); const q = (p) => +d[Math.min(d.length - 1, Math.floor(p * d.length))].toFixed(1);
    res({ fps: +(d.length / ((now - t0) / 1000)).toFixed(1), frame_ms_p50: q(0.5), frame_ms_p95: q(0.95), frame_ms_max: q(1) }); } };
  requestAnimationFrame(f);
}), SECONDS);
const neurons = () => page.evaluate(() => window.__lql._floor ? window.__lql._floor.stats().neurons : 0);

const results = { conditions: { renderer, software, label: software ? "software: NOT representative of GPU performance" : "hardware GPU",
  browser: `${process.env.LQL_BROWSER_CHANNEL || "playwright chromium"} ${browser.version()}`, host: `${process.platform} ${process.arch}`,
  viewport: "1440x900", dpr: await page.evaluate(() => devicePixelRatio), seconds_per_sample: SECONDS, data: "synthetic demo state (temp dir)" }, samples: {} };
for (const [q, n] of Object.entries(QUALITIES)) {
  log(`building ${n.toLocaleString("en-US")} neurons (${q})`);
  await page.selectOption("#fl-quality", q);
  await page.waitForFunction((n) => window.__lql._floor && window.__lql._floor.stats().neurons === n, n, { timeout: 60000 });
  await page.waitForTimeout(1500);                                  // let the rebuild settle before sampling
  results.samples[`idle_${q}`] = { neurons: await neurons(), ...(await sample()) };
}
// While a real job runs (the core, beams and desk animate), at the highest quality measured.
log(`sampling while a job runs (${TOP})`);
await fetch(URL + "api/jobs", { method: "POST", headers: { "Content-Type": "application/json", "X-LQL-Request": "1" },
  body: JSON.stringify({ kind: "montecarlo", params: { experiment: (await (await fetch(URL + "api/experiments")).json())[0]?.id, paths: 20000, block: 20, seed: 7 } }) });
await page.waitForSelector(".floor-label.active", { timeout: 8000 }).catch(() => {});
const running = await page.evaluate(() => /RUNNING/.test(document.querySelector("#floor-core")?.textContent || ""));
results.samples[`job_running_${TOP}`] = { neurons: await neurons(), job_was_running: running, ...(await sample()) };
await browser.close();

writeFileSync(join(OUT, "gpu_fps.json"), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1));
console.log(`\n${results.conditions.label}. results: ${join(OUT, "gpu_fps.json")}`);
server.kill("SIGTERM");
process.exit(0);
