// Unit tests for the console's pure modules. Run: node --test web/tests/ (no dependencies).
import test from "node:test";
import assert from "node:assert/strict";
import * as F from "../js/format.js";
import * as S from "../js/status.js";
import * as G from "../js/graph-model.js";
import * as P from "../js/prefs.js";
import { Limiter, Sound, CUES } from "../js/sound.js";
import * as B from "../js/scene/brain-geometry.js";
import * as M from "../js/scene/floor-model.js";
import * as U from "../js/scene/bust-geometry.js";
import * as R from "../js/research-model.js";
import * as C from "../js/scene/core-state.js";

test("format: undefined and non-finite values are N/A, never a number", () => {
  for (const v of [null, undefined, NaN, Infinity, "x"]) {
    assert.equal(F.pct(v), "N/A"); assert.equal(F.num(v), "N/A"); assert.equal(F.money(v), "N/A");
  }
  assert.equal(F.pct(0.1234), "12.34%");
  assert.equal(F.signed(-0.05, 1), "-5.0%");
  assert.equal(F.money(1234567.8), "1,234,568");
  assert.equal(F.tone(-1), "neg"); assert.equal(F.tone(0), ""); assert.equal(F.tone(2), "pos");
  assert.equal(F.esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
});

test("format: timestamps and durations", () => {
  assert.equal(F.clock("2026-10-21T19:50:48.470267Z"), "19:50:48");
  assert.equal(F.clock("2026-10-21T19:50:48Z", true), "10-21 19:50");
  assert.equal(F.duration(4.2), "4.2s");
  assert.equal(F.duration(185), "3m 05s");
  assert.equal(F.duration(7260), "2h 01m");
  assert.equal(F.ago("2026-10-21T00:00:00Z", Date.parse("2026-10-21T00:00:30Z")), "30s ago");
  assert.equal(F.ago("not a date"), "N/A");
});

test("status: every state has a text label and glyph (colour is never the only signal)", () => {
  for (const m of [S.TASK, S.JOB, S.DATA_CLASS]) for (const v of Object.values(m)) { assert.ok(v.label); assert.ok(v.glyph); assert.ok(v.tone); }
  assert.equal(S.task("needs_human").label, "needs human");
  assert.equal(S.task("weird").label, "weird");
  assert.equal(S.dataClass("provisional").tone, "warn");
  assert.notEqual(S.dataClass("synthetic").tone, "ok");      // synthetic must never look like a green "online"
  assert.equal(S.verdictTone("CANDIDATE"), "ok");
  assert.equal(S.verdictTone("REJECTED"), "bad");
});

test("status: event cues map real events only", () => {
  assert.equal(S.eventCue({ kind: "kill_switch" }), "critical");
  assert.equal(S.eventCue({ kind: "acceptance_regression" }), "critical");
  assert.equal(S.eventCue({ kind: "job_failed" }), "warning");
  assert.equal(S.eventCue({ kind: "job_finished" }), "complete");
  assert.equal(S.eventCue({ kind: "experiment" }), null);
  assert.equal(S.eventCue({ kind: "server_start" }), null);
  assert.equal(S.eventCue(null), null);
});

const N = (id, level, deps = [], dependents = [], status = "done_verified", owner = "engineer") => ({ id, level, deps, dependents, status, owner, goal: id + " goal" });
const chain = [N("A", 0, [], ["B", "C"]), N("B", 1, ["A"], ["D"]), N("C", 1, ["A"], ["D"]), N("D", 2, ["B", "C"], [], "needs_human", "founder")];

test("graph: layered layout is deterministic and respects depth", () => {
  const a = G.layout(chain, { orient: "LR" }), b = G.layout(chain.slice().reverse(), { orient: "LR" });
  assert.deepEqual(a.pos, b.pos);
  assert.ok(a.pos.A.x < a.pos.B.x && a.pos.B.x === a.pos.C.x && a.pos.C.x < a.pos.D.x);
  const t = G.layout(chain, { orient: "TB" });
  assert.ok(t.pos.A.y < t.pos.B.y && t.pos.B.y < t.pos.D.y);
  const deep = Array.from({ length: 8 }, (_, i) => N("N" + i, i, i ? ["N" + (i - 1)] : [], []));
  assert.equal(G.layout(deep).orient, "TB");
  assert.equal(G.layout(chain).orient, "LR");
});

test("graph: upstream/downstream closures, filter and keyboard neighbours", () => {
  assert.deepEqual([...G.upstream(chain, "D")].sort(), ["A", "B", "C"]);
  assert.deepEqual([...G.downstream(chain, "A")].sort(), ["B", "C", "D"]);
  assert.deepEqual(G.filter(chain, { statuses: ["needs_human"] }).map((n) => n.id), ["D"]);
  assert.deepEqual(G.filter(chain, { owner: "founder" }).map((n) => n.id), ["D"]);
  assert.deepEqual(G.filter(chain, { text: "b goal" }).map((n) => n.id), ["B"]);
  assert.equal(G.filter(chain, {}).length, 4);
  const L = G.layout(chain, { orient: "LR" });
  assert.ok(["B", "C"].includes(G.neighbour(chain, L.pos, "A", "right")));
  assert.equal(G.neighbour(chain, L.pos, "A", "left"), null);
  assert.equal(G.neighbour(chain, L.pos, "D", "left") !== null, true);
  assert.match(G.edgePath(L.pos.A, L.pos.B), /^M[\d.]+,[\d.]+ C/);
});

test("graph: dial puts each level on its own ring", () => {
  const { pos, rings } = G.dial(chain, { r0: 50, step: 30 });
  assert.deepEqual(rings, [50, 80, 110]);
  for (const n of chain) assert.ok(Math.abs(Math.hypot(pos[n.id].x, pos[n.id].y) - (50 + 30 * n.level)) < 1e-9);
});

test("prefs: defaults, sanitising and broken storage", () => {
  assert.equal(P.DEFAULTS.sound, false);                   // sound is off until the user turns it on
  const mem = new Map(), store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(P.load(store), { ...P.DEFAULTS });
  P.save(store, { sound: true, volume: 9, motion: "warp", view: "graph", junk: 1 });
  const p = P.load(store);
  assert.equal(p.sound, true); assert.equal(p.volume, 1); assert.equal(p.motion, "system"); assert.equal(p.view, "graph");
  assert.equal("junk" in p, false);
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.deepEqual(P.load(broken), { ...P.DEFAULTS });
  assert.equal(P.save(broken, p), false);
  mem.set("lql.prefs.v1", "{not json");
  assert.deepEqual(P.load(store), { ...P.DEFAULTS });
  assert.equal(P.reducedMotion("system", true), true);
  assert.equal(P.reducedMotion("full", true), false);
  assert.equal(P.reducedMotion("reduced", false), true);
  assert.equal(P.DEFAULTS.neurons, "auto");
  P.save(store, { neurons: "ultra" }); assert.equal(P.load(store).neurons, "ultra");
  P.save(store, { neurons: "9000000" }); assert.equal(P.load(store).neurons, "auto");   // only the presets
});

test("sound: limiter allows one cue per kind per interval and caps bursts", () => {
  let t = 0;
  const L = new Limiter({ perCueMs: 900, burst: 3, windowMs: 6000, now: () => t });
  assert.equal(L.allow("complete"), true);
  assert.equal(L.allow("complete"), false);
  t = 1000; assert.equal(L.allow("complete"), true);
  assert.equal(L.allow("warning"), true);
  assert.equal(L.allow("start"), false);                   // burst of 3 reached
  assert.equal(L.allow("critical"), true);                 // critical is never swallowed by the burst cap
  t = 8000; assert.equal(L.allow("start"), true);
});

function fakeCtx() {
  const node = () => ({ connect(x) { return x; }, start() {}, stop() {}, type: "", frequency: { value: 0 }, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } });
  return { currentTime: 0, state: "running", destination: {}, createOscillator: node, createGain: node, createBiquadFilter: node, resume() {} };
}

test("sound: silent until enabled, rate-limited, texture only when enabled", () => {
  let t = 0;
  const s = new Sound({ makeContext: fakeCtx, limiter: new Limiter({ now: () => t }) });
  assert.equal(s.cue("complete"), false);                  // disabled by default
  assert.equal(s.texture(true), false);
  s.enable(true);
  assert.equal(s.cue("complete"), true);
  assert.equal(s.cue("complete"), false);                  // rate-limited
  assert.equal(s.cue("nonsense"), false);
  assert.equal(s.texture(true), true);
  s.enable(false);
  assert.equal(s.hum, null);                               // turning sound off stops the hum
  assert.equal(s.cue("warning"), false);
  assert.deepEqual(Object.keys(CUES).sort(), ["complete", "critical", "start", "warning"]);
  const bad = new Sound({ makeContext: () => { throw new Error("no audio"); } });
  assert.equal(bad.enable(true), false);                   // no AudioContext: stays off, does not throw
});

test("brain: the cloud is deterministic, every point is placed and region counts follow the shares", () => {
  const a = B.buildBrain(20_000, { seed: 3 }), b = B.buildBrain(20_000, { seed: 3 });
  assert.deepEqual(a.pos, b.pos); assert.deepEqual(a.info, b.info);
  assert.equal(a.pos.length, 60_000); assert.equal(a.info.length, 80_000);
  assert.ok(a.pos.every(Number.isFinite));
  const counts = B.regionCounts(20_000);
  assert.equal(counts.reduce((x, y) => x + y, 0), Math.round(20_000 * B.NEURON_SHARE));
  assert.deepEqual(a.counts, counts);
  // neurons (kind 0) carry their region and an order in [0, 1) that rises inside each region
  const seen = new Array(B.REGIONS.length).fill(0);
  let lastOrder = -1, lastRegion = -1;
  for (let i = 0; i < a.count; i++) {
    const [region, order, kind] = [a.info[i * 4], a.info[i * 4 + 1], a.info[i * 4 + 2]];
    if (kind !== 0) continue;
    assert.ok(order >= 0 && order < 1);
    if (region === lastRegion) assert.ok(order > lastOrder);
    lastRegion = region; lastOrder = order; seen[region]++;
  }
  assert.deepEqual(seen, counts);
  // points sit around the brain's centre, inside its outer shell
  for (let i = 0; i < a.count; i += 97) {
    const d = Math.hypot(a.pos[i * 3] - B.BRAIN_C[0], a.pos[i * 3 + 1] - B.BRAIN_C[1], a.pos[i * 3 + 2] - B.BRAIN_C[2]);
    assert.ok(d < B.BRAIN_S * 2.2, d);
  }
  // shares from the server change the split, and null falls back to the defaults
  const c2 = B.regionCounts(10_000, { ...B.SHARES, edge: 0 });
  assert.equal(c2[B.REGIONS.indexOf("edge")], 0);
  assert.deepEqual(B.regionCounts(10_000, null), B.regionCounts(10_000));
});

test("brain: formed neurons follow the formed fractions; nothing is lit without evidence", () => {
  const counts = B.regionCounts(100_000);
  assert.equal(B.formedNeurons(counts, new Array(10).fill(0)), 0);
  assert.equal(B.formedNeurons(counts, new Array(10).fill(1)), counts.reduce((x, y) => x + y, 0));
  assert.equal(B.formedNeurons(counts, [2, -1, NaN]), counts[0]);   // clamped; junk counts as zero
  assert.deepEqual(Object.keys(B.QUALITY), ["low", "medium", "high", "ultra"]);
  assert.equal(B.QUALITY.ultra, 2_000_000);
  assert.equal(B.autoQuality({ mobile: true, cores: 16, memory: 32 }), "low");
  assert.equal(B.autoQuality({ cores: 10, memory: 16 }), "high");
  assert.equal(B.autoQuality({ cores: 4, memory: 4 }), "medium");
  assert.equal(B.autoQuality({ cores: 2, memory: 2 }), "low");
});

test("floor: two banks of desks flank the brain and jobs go to the right desk", () => {
  const L = M.deskLayout();
  assert.deepEqual(L.map((d) => d.key), M.SEATS);
  for (const d of L) assert.ok(Math.abs(Math.hypot(d.x, d.z) - M.R_DESKS) < 1e-9);
  const left = L.filter((d) => d.x < 0), right = L.filter((d) => d.x > 0);
  assert.equal(left.length, 5); assert.equal(right.length, 4);
  for (const d of L) assert.ok(Math.abs(d.x) > 15, d.key);               // nothing stands in front of or behind the brain
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++)
    assert.ok(Math.hypot(L[i].x - L[j].x, L[i].z - L[j].z) > 10, `${L[i].key}/${L[j].key}`);
  const owners = { "M7-security-audit": "reviewer", "H1-hermes-mac": "founder" };
  assert.equal(M.deskForJob({ kind: "recheck", target: "M7-security-audit" }, owners), "reviewer");
  assert.equal(M.deskForJob({ kind: "recheck", target: "unknown" }, owners), "engineer");
  assert.equal(M.deskForJob({ kind: "recheck", target: "H1-hermes-mac" }, owners), null);   // no bot does human work
  assert.equal(M.deskForJob({ kind: "backtest" }, owners), "research");
  assert.equal(M.deskForJob(null), null);
  assert.equal(M.eventDesk({ kind: "job_started", data: { job_kind: "backtest" } }), "research");
  assert.equal(M.eventDesk({ kind: "experiment" }), "critic");
  assert.equal(M.eventDesk({ kind: "risk_rejected" }), "risk");
  assert.equal(M.eventDesk({ kind: "acceptance_regression", data: { task: "M7-security-audit" } }, owners), "reviewer");
  assert.equal(M.eventDesk({ kind: "server_start" }), null);
});

test("floor: growth is detected only when a region's formed fraction rises", () => {
  const brain = { regions: [{ key: "engineer", formed: 0.5, share: 0.14 }, { key: "edge", formed: 0, share: 0.2 }] };
  const f = M.formedArray(brain);
  assert.equal(f.length, B.REGIONS.length);
  assert.equal(f[B.REGIONS.indexOf("engineer")], 0.5);
  assert.equal(f[B.REGIONS.indexOf("edge")], 0);
  assert.deepEqual(M.formedArray(null), new Array(B.REGIONS.length).fill(0));
  assert.deepEqual(M.sharesOf(brain), { engineer: 0.14, edge: 0.2 });
  assert.equal(M.sharesOf({}), null);
  assert.deepEqual(M.grown([0.1, 0.2], [0.1, 0.2]), []);
  assert.deepEqual(M.grown([0.1, 0.2], [0.1 + 1e-9, 0.3]), [1]);
  assert.deepEqual(M.grown([0.5], [0.4]), []);                           // nothing ever "grows" downwards
  assert.equal(M.deskState({ key: "critic", active: true, task: "backtest x" }), "working: backtest x");
  assert.equal(M.deskState({ key: "founder", attention: true }), "waiting on you");
  assert.equal(M.deskState({ key: "risk", status: "kill switch off" }), "kill switch off");
  const w = M.wrap("alpha beta gamma delta epsilon", 11, 2);
  assert.equal(w.length, 2); assert.ok(w.every((l) => l.length <= 11)); assert.ok(w[1].endsWith("…"));
  assert.deepEqual(M.wrap("", 10), []);
});

test("bust: deterministic hologram around the brain; the face is drawn only as data", () => {
  const a = U.buildBust(30_000), b = U.buildBust(30_000);
  assert.deepEqual(a.pos, b.pos); assert.deepEqual(a.info, b.info);
  assert.equal(a.perKind.reduce((x, y) => x + y, 0), 30_000);
  for (const k of [U.KIND.body, U.KIND.mask, U.KIND.eyes, U.KIND.browNose, U.KIND.mouth]) assert.ok(a.perKind[k] > 300, `kind ${k}`);
  const floorY = B.BRAIN_C[1] + U.BASE * B.BRAIN_S - 1e-6;
  let eyeY = 0, mouthY = 0, ne = 0, nm = 0;
  for (let i = 0; i < a.count; i++) {
    const y = a.pos[i * 3 + 1], kind = a.info[i * 2];
    assert.ok(y >= floorY && Number.isFinite(a.pos[i * 3]));                          // stands on the podium
    if (kind >= U.KIND.eyes) {                                                          // features sit on the front of the face
      const lx = (a.pos[i * 3] - B.BRAIN_C[0]) / B.BRAIN_S, ly = (y - B.BRAIN_C[1]) / B.BRAIN_S, lz = (a.pos[i * 3 + 2] - B.BRAIN_C[2]) / B.BRAIN_S;
      assert.ok(lz > 0.6 && U.maskR(lx, ly) < 1.05, `${lx},${ly},${lz}`);
      if (kind === U.KIND.eyes) { eyeY += ly; ne++; } if (kind === U.KIND.mouth) { mouthY += ly; nm++; }
    }
  }
  assert.ok(eyeY / ne > mouthY / nm + 0.4);
  assert.ok(U.BUST_TOP > B.BRAIN_C[1] + 0.9 * B.BRAIN_S);                              // the cranium encloses the brain
  assert.deepEqual([0, -0.1, 1e-9, 0.49, 0.5, 0.89, 0.9, 1].map(U.faceStage), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(U.faceStage(undefined), 0);
});

test("research model: rolling windows, histogram, monthly grid and parameter matrix use only the given data", () => {
  const eq = [100, 110, 99, 120, 120];
  const r = R.returns(eq);
  assert.equal(r.length, 4); assert.ok(Math.abs(r[0] - 0.1) < 1e-12); assert.equal(r[3], 0);
  const v = R.rollingVol(r, 3);
  assert.deepEqual(v.slice(0, 2), [null, null]);
  const w = r.slice(0, 3), m = w.reduce((a, b) => a + b) / 3, sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / 2);
  assert.ok(Math.abs(v[2] - sd * Math.sqrt(252)) < 1e-12);
  assert.equal(R.rollingSharpe([0, 0, 0], 3)[2], null);                         // zero volatility: undefined, not 0
  const h = R.histogram([0, 1, 2, 3, 4, NaN], 4);
  assert.equal(h.counts.reduce((a, b) => a + b), 5); assert.equal(h.lo, 0); assert.equal(h.width, 1);
  assert.deepEqual(R.histogram([], 5).counts, []);
  const g = R.monthlyGrid({ "2024-01": 0.01, "2024-03": -0.02, "2025-12": 0.03 });
  assert.deepEqual(g.years, ["2024", "2025"]);
  assert.deepEqual([g.rows[0][0], g.rows[0][1], g.rows[0][2], g.rows[1][11]], [0.01, null, -0.02, 0.03]);
  const pm = R.paramMatrix([{ fast: 20, slow: 100, sharpe: 0.1 }, { fast: 50, slow: 100, sharpe: -0.2 }, { fast: 20, slow: 200, sharpe: 0.3 }]);
  assert.deepEqual(pm.rows, [20, 50]); assert.deepEqual(pm.cols, [100, 200]);
  assert.deepEqual(pm.values, [[0.1, 0.3], [-0.2, null]]);
  assert.equal(R.diverging(null, 1), "transparent");
  assert.ok(R.diverging(0.5, 1).startsWith("rgba(62")); assert.ok(R.diverging(-0.5, 1).startsWith("rgba(255"));
  assert.deepEqual(R.normalise([50, 100]), [1, 2]);
});

test("research core: state comes only from persisted jobs and never invents progress", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  assert.equal(C.coreState([], now).state, "IDLE");
  assert.equal(C.coreState([], now).line, "NO ACTIVE JOBS");
  const q = { id: "j3", kind: "backtest", status: "queued", stage: "waiting for the worker" };
  const s1 = C.coreState([q, { ...q, id: "j2" }], now);
  assert.equal(s1.state, "QUEUED"); assert.equal(s1.queued, 2); assert.equal(s1.job.id, "j2");   // oldest runs next
  const run = { id: "j4", kind: "montecarlo", status: "running", stage: "simulating paths", progress: { done: 300, total: 1000, unit: "paths" } };
  assert.ok(C.coreState([run, q], now).line.includes("300/1000 paths"));
  assert.equal(C.progressText({ id: "x", status: "running" }), "PROGRESS NOT MEASURED");
  assert.equal(C.progressText({ progress: { done: 0, total: 0, unit: "x" } }), "PROGRESS NOT MEASURED");
  const ok = { id: "j5", kind: "backtest", status: "succeeded", finished_at: "2026-10-22T11:59:55Z", artifacts: [{ kind: "experiment", id: "abc" }] };
  const s2 = C.coreState([ok], now);
  assert.equal(s2.state, "SUCCEEDED"); assert.equal(s2.artifact.id, "abc");
  assert.equal(C.coreState([ok], now + C.RECENT_MS + 1).state, "IDLE");          // a success is shown once, then idle
  const bad = { id: "j6", kind: "backtest", status: "failed", finished_at: "2026-10-22T11:59:58Z", error: "boom" };
  assert.equal(C.coreState([bad, ok], now).state, "FAILED");
  assert.equal(C.coreState([{ ...bad, finished_at: null }], now).state, "IDLE");
  assert.equal(M.deskForJob({ kind: "montecarlo" }), "research");
});
