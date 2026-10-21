// Unit tests for the console's pure modules. Run: node --test web/tests/ (no dependencies).
import test from "node:test";
import assert from "node:assert/strict";
import * as F from "../js/format.js";
import * as S from "../js/status.js";
import * as G from "../js/graph-model.js";
import * as P from "../js/prefs.js";
import { Limiter, Sound, CUES } from "../js/sound.js";

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
