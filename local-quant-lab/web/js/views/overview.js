// Overview: role cards, orchestration dial (the real task graph on a perspective plane), module panels, human
// decisions, risk guards, decision trace, experiments and the frozen research rules.
import { esc, pct, num, money, clock, int } from "../format.js";
import { task as taskS, dataClass, verdictTone, severityTone } from "../status.js";
import { dial } from "../graph-model.js";
import { spark, guards } from "../charts.js";

const ICON = { supervisor: "◎", engineer: "⚙", reviewer: "⌕", founder: "⚑", critic: "⊘", risk: "⛨", data: "≋", hermes: "✦", research: "∿", paper: "▤" };
const STATUS_COLOR = { done_verified: "var(--ok)", needs_human: "var(--human)", in_progress: "var(--active)", ready: "var(--info)",
  pending: "var(--muted)", failed: "var(--bad)", rejected_by_critic: "var(--bad)", blocked_external: "var(--warn)" };

function roleCard(r) {
  const cls = ["role", r.active ? "active" : "", r.attention ? "attn" : ""].join(" ");
  const bar = r.level === null || r.level === undefined ? "" : `<div class="r-bar" role="img" aria-label="${esc(r.metric_label)} ${esc(r.metric)}"><i style="width:${(r.level * 100).toFixed(0)}%"></i></div>`;
  return `<article class="${cls}" style="--hue:var(--r-${esc(r.key)})" aria-label="${esc(r.name)}: ${esc(r.status)}">
    <div class="r-top"><span class="r-ico" aria-hidden="true">${ICON[r.key] || "•"}</span><div><div class="r-name">${esc(r.name)}</div><div class="r-tag">${esc(r.tagline)}</div></div></div>
    <div class="r-state" title="${esc(r.status)}">${esc(r.status)}</div>
    <div class="r-metric"><span>${esc(r.metric_label)}</span><b>${esc(r.metric)}</b></div>${bar}</article>`;
}

function dialSvg(app, g) {
  const { pos, rings } = dial(g.nodes, { r0: 64, step: 36 });
  const R = (rings[rings.length - 1] || 64) + 34;
  const now = Date.now();
  let o = `<defs><radialGradient id="coreg"><stop offset="0" stop-color="#2bf0ff" stop-opacity=".9"/><stop offset=".55" stop-color="#5b3cff" stop-opacity=".55"/><stop offset="1" stop-color="#07051a" stop-opacity=".2"/></radialGradient></defs>`;
  o += `<circle class="floor" r="${R}" stroke-dasharray="2 6"/><circle class="floor" r="${R + 14}"/>`;
  for (let a = 0; a < 360; a += 15) {
    const t = (a * Math.PI) / 180;
    o += `<line class="floor" x1="${(R * Math.cos(t)).toFixed(1)}" y1="${(R * Math.sin(t)).toFixed(1)}" x2="${((R + 14) * Math.cos(t)).toFixed(1)}" y2="${((R + 14) * Math.sin(t)).toFixed(1)}"/>`;
  }
  rings.forEach((r) => (o += `<circle class="ringline" r="${r}"/>`));
  const lit = (id) => (app.flash.get(id) || 0) > now;
  for (const e of g.edges) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2 * 0.82, my = (a.y + b.y) / 2 * 0.82;
    o += `<path class="edge ${lit(e.from) ? "lit" : ""}" d="M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}"/>`;
  }
  o += `<circle class="core" r="30"/><circle r="40" fill="none" stroke="rgba(43,240,255,.35)" stroke-dasharray="3 5"/>`;
  o += `<circle class="scan" r="48" stroke-dasharray="40 262"/>`;
  for (const n of g.nodes) {
    const p = pos[n.id], s = taskS(n.status);
    const running = n.job && n.job.status === "running";
    const cls = ["node", running ? "running" : "", lit(n.id) ? "pulse" : ""].join(" ");
    const col = running ? "var(--active)" : STATUS_COLOR[n.status] || "var(--muted)";
    const shape = n.owner === "founder"
      ? `<rect class="dot" x="-7" y="-7" width="14" height="14" transform="rotate(45)" fill="${col}"/>`
      : `<circle class="dot" r="7" fill="${col}"/>`;
    o += `<g class="${cls}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})" tabindex="0" role="button" data-task="${esc(n.id)}" data-k="dial-${esc(n.id)}" aria-label="${esc(n.id)}: ${esc(s.label)}${running ? ", job running" : ""}. Open in the agent graph."><title>${esc(n.id)} · ${esc(s.label)} · ${esc(n.owner)}</title><circle class="halo" r="9" stroke="${col}"/>${shape}</g>`;
  }
  return `<svg class="dial-plane" viewBox="${-R - 20} ${-R - 20} ${2 * R + 40} ${2 * R + 40}" aria-label="Orchestration dial: ${g.nodes.length} tasks on rings by dependency depth around the supervisor">${o}</svg>`;
}

function modules(app, d) {
  const ds = d.data.datasets;
  const prov = d.data.provisional, snaps = d.data.snapshots;
  const synth = ds.filter((x) => x.data_class === "synthetic");
  const cls = prov ? dataClass("provisional") : snaps ? dataClass("verified") : dataClass("synthetic");
  const exps = d.experiments;
  const p = d.paper;
  const eq = p ? p.equity.map((e) => e.equity) : [];
  const reg = d.research.latest;
  return `
  <section class="panel mod" data-go="data" tabindex="0" data-k="mod-data" aria-label="Data: open the data workspace">
    <header><h3>01 · Data</h3><span class="tag ${cls.tone}">${cls.glyph} ${esc(cls.label)}</span></header>
    <div class="m-row"><span>datasets</span><b class="num">${ds.length}</b></div>
    <div class="m-row"><span>synthetic · snapshot</span><b class="num">${synth.length} · ${snaps}</b></div>
    <div class="m-row"><span>provisional (unverified)</span><b class="num ${prov ? "neg" : ""}">${prov}</b></div>
    <div class="m-row"><span>tradable</span><b class="num">${ds.filter((x) => x.tradable).length}/${ds.length}</b></div>
  </section>
  <section class="panel mod" data-go="research" tabindex="0" data-k="mod-research" aria-label="Research: open the research workspace">
    <header><h3>02 · Research</h3><span class="src">critic verdicts</span></header>
    <div class="m-row"><span>experiments</span><b class="num">${exps.count}</b></div>
    ${["CANDIDATE", "NOT_PROVEN", "REJECTED"].map((v) => `<div class="m-row"><span><span class="tag ${verdictTone(v)}">${v}</span></span><b class="num">${exps.verdicts[v] || 0}</b></div>`).join("")}
    <div class="m-row"><span>walk-forward studies</span><b class="num">${d.research.registrations}</b></div>
    ${reg && reg.result ? `<div class="m-row"><span>latest: ${esc(reg.name)}</span><span class="tag ${verdictTone(reg.result.verdict)}">${esc(reg.result.verdict)}</span></div>` : ""}
    <div class="m-row"><span>holdouts spent</span><b class="num">${d.research.holdouts_spent}</b></div>
  </section>
  <section class="panel mod" data-go="paper" tabindex="0" data-k="mod-paper" aria-label="Paper: open the paper workspace">
    <header><h3>03 · Paper (simulated)</h3><span class="tag synthetic">REPLAY</span></header>
    ${p ? `<div class="m-big num">${money(eq[eq.length - 1])}</div><div class="m-row"><span>${esc(p.strategy)} on ${esc(p.instrument)}</span><span>clock ${esc(p.last_processed || "–")}</span></div>${spark(eq.slice(-200), { color: "var(--ok)" })}<div class="m-row"><span>orders · fills</span><b class="num">${p.orders} · ${p.fills}</b></div>`
      : `<p class="empty">No paper session yet. Step the replay from the Paper workspace.</p>`}
  </section>
  <section class="panel mod" data-go="paper" tabindex="0" data-k="mod-forward" aria-label="Forward logs">
    <header><h3>04 · Forward log</h3><span class="src">CLI-run</span></header>
    ${d.forward.logs ? d.forward.items.map((f) => `<div class="m-row"><span>${esc(f.dir)}</span><span class="tag ${f.evidence_class === "REAL_FORWARD" && !(f.report || {}).provisional ? "ok" : "warn"}">${esc(f.evidence_class || "?")}</span></div>`).join("")
      : `<p class="empty">No forward log. It starts only on verified real data (docs/MAC_NEXT_STEPS.md step 6).</p>`}
  </section>`;
}

function rules(d) {
  const r = d.research.latest;
  const acc = r ? r.acceptance : null;
  const checks = r && r.result ? r.result.checks : [];
  const line = (k, v, ok) => `<div class="rl"><span>${esc(k)}</span><span class="v">${esc(v)}</span><span aria-label="${ok === null ? "not evaluated" : ok ? "passed" : "failed"}">${ok === null ? "·" : ok ? "✓" : "✗"}</span></div>`;
  if (!acc) return `<p class="empty">No walk-forward study is frozen yet.</p>`;
  const passed = (n) => { const c = checks.find((x) => x.name === n); return c ? c.passed : null; };
  return `<div class="rules">
    <div class="sec"># HARD · frozen in ${esc(r.spec_hash)} (${esc(r.name)})</div>
    ${line("min_folds", acc.min_folds, passed("enough_folds"))}
    ${line("min_oos_days", acc.min_oos_days, passed("enough_oos_days"))}
    ${line("min_oos_exits", acc.min_oos_exits, passed("enough_oos_exits"))}
    ${line("oos_net_sharpe >", acc.min_oos_net_sharpe, passed("oos_net_sharpe_positive"))}
    ${line("sharpe_ci_lower >", acc.min_sharpe_ci_lower, passed("oos_sharpe_ci_lower_positive"))}
    ${line("oos/is sharpe ≥", acc.min_oos_to_is_sharpe_ratio, passed("oos_vs_in_sample_sharpe"))}
    ${line("selection_stability ≥", acc.min_selection_stability, passed("selection_stable"))}
    <div class="sec"># GATES · data and holdout</div>
    ${line("not_synthetic", "required", passed("not_synthetic"))}
    ${line("price_adjustment_verified", "required", passed("price_adjustment_verified"))}
    ${line("holdout single-use", "registry", passed("holdout_uncontaminated"))}
    ${line("suspicious_sharpe >", acc.suspicious_sharpe, null)}
  </div>`;
}

const FLOOR = { inst: null, loading: false, error: null, sel: null };

function brainTable(d) {
  const b = d.brain;
  return `<table class="nowrap"><thead><tr><th>region</th><th class="r">evidence</th><th class="r">formed</th></tr></thead><tbody>${b.regions.map((r) => `<tr title="${esc(r.unit)}"><td><span class="dot" style="background:var(--r-${esc(r.key)}, #fff)"></span>${esc(r.label)}</td><td class="r num">${esc(r.units)}</td><td class="r num ${r.key === "edge" && !r.formed ? "neg" : ""}">${(r.formed * 100).toFixed(1)}%</td></tr>`).join("")}</tbody></table>
    <p class="muted" style="font-size:var(--fs-xs);margin:6px 0 0">${esc(b.formula)}. ${esc(b.meaning)}</p>`;
}

function inspector(app, d, sel) {
  if (!sel) return "";
  if (sel.kind === "brain") {
    const b = d.brain;
    const st = FLOOR.inst ? FLOOR.inst.stats() : null;
    return `<header><span class="kicker">The brain</span><button class="btn small" data-fl="close" data-k="fl-close">Close <kbd>Esc</kbd></button></header>
      <h3>${st ? st.formed_neurons.toLocaleString("en-US") : "–"} <span class="muted">of ${st ? st.neurons.toLocaleString("en-US") : "–"} neurons formed</span></h3>
      <p class="muted">Each region grows only from one kind of recorded, verified work. Rendering quality changes how many neurons are drawn, not the evidence.</p>
      <div class="kicker" style="margin-top:8px">Path to Ultron · stage ${b.stage.index + 1} of ${b.stage.of}</div>
      <ol class="ladder">${b.stage.stages.map((x, i) => `<li class="${x.met ? "met" : ""} ${i === b.stage.index ? "now" : ""}"><b>${esc(x.name)}</b><span>${esc(x.rule)}</span></li>`).join("")}</ol>
      <p class="muted" style="font-size:var(--fs-xs)">The supervisor's face is data too: ${esc(b.stage.face)}. Work regions formed: ${(b.stage.work_formed * 100).toFixed(1)}%.</p>
      ${brainTable(d)}
      <div class="kicker" style="margin-top:10px">Recent growth</div>
      <div class="trace" style="max-height:160px">${b.growth.slice().reverse().map((g) => `<div class="tr"><span>${esc(clock(g.t))}</span><span class="k">${esc(g.region)}${g.strengthen ? " ↺" : ""}</span><span class="m">${esc(g.message)}</span></div>`).join("") || `<p class="empty">No growth events yet.</p>`}</div>`;
  }
  const x = (d.desks || []).find((k) => k.key === sel.key);
  if (!x) return "";
  const act = x.key === "research" ? `<button class="btn primary" data-fl="go-research" data-k="fl-research">Queue a backtest…</button>`
    : (x.key === "engineer" || x.key === "reviewer") ? `<button class="btn" data-fl="go-graph" data-k="fl-graph">Open tasks in the agent graph</button>`
    : x.key === "paper" ? `<button class="btn" data-fl="go-paper" data-k="fl-paper">Open the paper ledger</button>`
    : x.key === "data" ? `<button class="btn" data-fl="go-data" data-k="fl-data">Open datasets</button>`
    : x.key === "founder" ? `<button class="btn" data-fl="go-graph-h1" data-k="fl-h1">Open the human gate</button>` : "";
  return `<header><span class="kicker" style="color:var(--r-${esc(x.key)})">${esc(x.name)} · ${esc(x.title)}</span><button class="btn small" data-fl="close" data-k="fl-close">Close <kbd>Esc</kbd></button></header>
    <div class="kicker" style="margin-top:6px">${x.active ? "Working on" : x.queued ? "Queued" : "Task"}</div><h3>${esc(x.task)}</h3><p class="muted">${esc(x.detail)}</p>
    <div class="kpis">${x.metrics.map(([k, v]) => `<div class="kpi"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join("")}</div>
    <div class="kicker" style="margin-top:10px">Result</div><p class="${x.tone === "bad" ? "neg" : x.tone === "ok" ? "pos" : ""}">${esc(x.result)}</p>
    ${x.job ? `<p class="mono" style="font-size:var(--fs-s)">${esc(x.job.id)} · ${esc(x.job.status)} · ${esc(x.job.label)}</p>` : ""}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${act}<button class="btn ghost" data-fl="home" data-k="fl-home">Back to the floor</button></div>`;
}

async function mountFloor(app, el, d) {
  const stage = el.querySelector("#floor-stage");
  if (FLOOR.inst || FLOOR.loading) return;
  const fail = (why) => {
    FLOOR.error = why;
    stage.innerHTML = `<div class="floor-fallback"><p class="muted">3D floor unavailable here (${esc(why)}). Showing the flat task dial instead.</p><div class="dial-stage">${dialSvg(app, d.graph)}</div></div>`;
  };
  FLOOR.loading = true;
  try {
    const mod = await import("../scene/floor.js");
    if (!mod.webglAvailable()) { fail("WebGL is not available"); return; }
    const geo = await import("../scene/brain-geometry.js");
    const q = app.prefs.neurons === "auto" ? geo.autoQuality({ cores: navigator.hardwareConcurrency || 4, memory: navigator.deviceMemory ?? null, mobile: matchMedia("(max-width: 700px)").matches }) : app.prefs.neurons;
    FLOOR.inst = await mod.createFloor(stage, { quality: q, reduced: app.reduced(), onSelect: (s) => select(app, s) });
    if (app.view !== "overview") FLOOR.inst.pause();
    if (app.cache.overview) FLOOR.inst.update(app.cache.overview);
    app._floor = FLOOR.inst;
    paintHud(app, el, app.cache.overview || d);
  } catch (e) {
    fail(e.message || String(e));
  } finally {
    FLOOR.loading = false;
  }
}

function select(app, s) {
  FLOOR.sel = s;
  if (FLOOR.inst) FLOOR.inst.focus(s ? (s.kind === "brain" ? "brain" : s.key) : null);
  app.rerender();
  // keyboard users land in the inspector (the callout they clicked is hidden while a desk is in focus)
  if (s) setTimeout(() => document.querySelector('#floor-insp [data-fl="close"]')?.focus({ preventScroll: true }), 0);
}

function paintHud(app, el, d) {
  const hud = el.querySelector("#floor-hud");
  if (!hud) return;
  const st = FLOOR.inst ? FLOOR.inst.stats() : null;
  const edge = d.brain.regions.find((r) => r.key === "edge");
  const sg = d.brain.stage;
  hud.innerHTML = `<div class="hud-big num">${st ? st.formed_neurons.toLocaleString("en-US") : "–"}</div>
    <div class="hud-sub">neurons formed of ${st ? st.neurons.toLocaleString("en-US") : "–"} · ${(d.brain.formed * 100).toFixed(1)}% of the brain</div>
    <div class="hud-stage" title="${esc(sg.stages.map((x) => `${x.met ? "✓" : "·"} ${x.name}: ${x.rule}`).join("\n"))}">
      <span class="segs">${sg.stages.map((x, i) => `<i class="${i <= sg.index ? "on" : ""} ${i >= 4 ? "edge" : ""}"></i>`).join("")}</span>
      <b>Stage ${sg.index + 1}/${sg.of} · ${esc(sg.name)}</b></div>
    ${sg.next ? `<div class="hud-sub">next: ${esc(sg.next.name)}: ${esc(sg.next.needs)}</div>` : ""}
    <div class="hud-sub ${edge && edge.formed ? "pos" : "neg"}">EDGE core ${edge && edge.formed ? (edge.formed * 100).toFixed(1) + "% formed" : "dark: no proven trading edge · face: blank mask"}</div>`;
}

export default {
  title: "Overview",
  load: (app) => app.api("/api/overview"),
  enter() { if (FLOOR.inst) FLOOR.inst.resume(); },
  leave() { if (FLOOR.inst) FLOOR.inst.pause(); },
  render(app, el, d) {
    const busy = d.jobs.some((j) => j.status === "running");
    const running = d.jobs.find((j) => j.status === "running");
    const decisions = d.decisions.length ? d.decisions.map((x) => `<div class="decision ${x.severity === "critical" ? "bad" : x.severity === "info" ? "info" : ""}"><b>${x.severity === "critical" ? "✕" : "⚑"} ${esc(x.title)}</b><p>${esc(x.detail)}</p></div>`).join("")
      : `<p class="empty">No open decisions.</p>`;
    const gr = d.risk_guards.map((r) => ({ label: r.name, ratio: r.ratio,
      text: r.value === null ? `limit ${r.unit === "pct" ? pct(r.limit, 0) : int(r.limit)}` : `${r.unit === "pct" ? pct(r.value, 1) : money(r.value)} / ${r.unit === "pct" ? pct(r.limit, 0) : money(r.limit)}` }));
    const evts = d.events.slice(-22).reverse();
    const lastSeen = app._lastTrace || 0;
    const trace = evts.map((e) => `<div class="tr ${severityTone(e.severity)} ${Date.parse(e.t) > lastSeen && lastSeen ? "new" : ""}"><span>${esc(clock(e.t))}</span><span class="k">${esc(e.kind)}</span><span class="m">${esc(e.message)}</span></div>`).join("");
    app._lastTrace = evts.length ? Date.parse(evts[0].t) : lastSeen;
    const exps = d.experiments.latest.map((e) => `<tr tabindex="0" data-exp="${esc(e.id)}" data-k="exp-${esc(e.id)}"><td title="${esc(e.at)}">${esc(e.strategy)}</td><td>${esc(e.instrument)}</td><td><span class="tag ${verdictTone(e.verdict)}">${esc(e.verdict)}</span></td></tr>`).join("");
    if (!el.querySelector("#floor-stage")) {
      el.innerHTML = `
      <div class="view-head"><h1>Command deck</h1><p>Every figure below is read from local records. Motion means a real job or state change; ambient shimmer is labelled.</p></div>
      <section class="panel floor" aria-label="Trading floor: the brain, the supervisor and the bots">
        <header><h2>The floor</h2><span class="src" id="floor-src"></span>
          <span class="floor-tools"><label class="field" style="text-transform:none">Neurons <select id="fl-quality" data-k="fl-quality" aria-label="Neurons drawn">${["auto", "low", "medium", "high", "ultra"].map((q) => `<option value="${q}" ${app.prefs.neurons === q ? "selected" : ""}>${{ auto: "auto", low: "150k", medium: "400k", high: "1M", ultra: "2M" }[q]}</option>`).join("")}</select></label>
          <button class="btn small" data-fl="home" data-k="fl-home-top">Reset view</button></span></header>
        <div class="floor-stage" id="floor-stage"><div class="floor-hud" id="floor-hud" aria-live="polite"></div><aside class="floor-insp" id="floor-insp" hidden aria-label="Selection details"></aside></div>
        <div class="floor-foot" id="floor-foot"></div>
      </section>
      <div class="roles" id="ov-roles"></div>
      <div class="ov-mods" id="ov-mods"></div>
      <div class="ov-mid2">
        <section class="panel" id="ov-brain"></section>
        <section class="panel" id="ov-decisions"></section>
        <section class="panel" id="ov-guards"></section>
      </div>
      <div class="ov-bot">
        <section class="panel" id="ov-trace"></section>
        <section class="panel" id="ov-exps"></section>
        <section class="panel" id="ov-rules"></section>
      </div>`;
      el.querySelector("#fl-quality").addEventListener("change", async (e) => {
        app.setPref("neurons", e.target.value);
        if (FLOOR.inst) {
          const geo = await import("../scene/brain-geometry.js");
          const q = e.target.value === "auto" ? geo.autoQuality({ cores: navigator.hardwareConcurrency || 4, memory: navigator.deviceMemory ?? null }) : e.target.value;
          await FLOOR.inst.setQuality(q, app.cache.overview.brain);
          FLOOR.inst.update(app.cache.overview);
          paintHud(app, el, app.cache.overview);
        }
      });
      el.addEventListener("click", (e) => {
        const b = e.target.closest("[data-fl]");
        if (!b) return;
        const a = b.dataset.fl;
        if (a === "close" || a === "home") select(app, null);
        else if (a === "go-research") app.go("research");
        else if (a === "go-graph") app.go("graph");
        else if (a === "go-graph-h1") app.go("graph", { task: "H1-hermes-mac" });
        else if (a === "go-paper") app.go("paper");
        else if (a === "go-data") app.go("data");
      });
      el.addEventListener("keydown", (e) => { if (e.key === "Escape" && FLOOR.sel) { select(app, null); e.stopPropagation(); } });
      if (FLOOR.inst) { FLOOR.inst.dispose(); FLOOR.inst = null; }
      mountFloor(app, el, d);
    }
    el.querySelector("#ov-roles").innerHTML = d.roles.map(roleCard).join("");
    el.querySelector("#floor-src").textContent = `${d.graph.nodes.length} tasks · ${d.desks.length} desks · ${d.active_jobs} job${d.active_jobs === 1 ? "" : "s"} active`;
    el.querySelector("#floor-foot").innerHTML = `<span class="chip ${busy ? "active" : "muted"}">${busy ? `◉ dispatching: ${esc(running.label)} · ${running.elapsed_s ?? 0}s` : "○ no job running · bots idle"}</span>
      <span class="chip muted">neurons = verified work, not trading skill</span><span class="chip muted">beams = real jobs · green done · rose failed</span>
      <span class="chip muted">drag to orbit · wheel to zoom · click a desk or the brain</span>`;
    const insp = el.querySelector("#floor-insp");
    insp.hidden = !FLOOR.sel;
    insp.innerHTML = inspector(app, d, FLOOR.sel);
    el.querySelector("#ov-mods").innerHTML = modules(app, d);
    el.querySelector("#ov-brain").innerHTML = `<header><h3>Brain composition</h3><span class="src">verified evidence per region</span></header>${brainTable(d)}`;
    el.querySelector("#ov-decisions").className = "panel " + (d.decisions.length ? "attn" : "");
    el.querySelector("#ov-decisions").innerHTML = `<header><h3>Waiting on a human</h3><span class="src">${d.decisions.length} open</span></header>${decisions}`;
    el.querySelector("#ov-guards").innerHTML = `<header><h3>Risk guards</h3><span class="src">config/settings.json</span></header>${guards(gr)}
      <p class="muted" style="font-size:var(--fs-xs);margin:6px 0 0">Bars show the simulated paper ledger against each hard limit. Limits are read-only here; only a human edits the file.</p>`;
    el.querySelector("#ov-trace").innerHTML = `<header><h3>Decision trace</h3><span class="src">state/events.jsonl · last ${evts.length}</span></header><div class="trace">${trace || `<p class="empty">No events yet.</p>`}</div>`;
    el.querySelector("#ov-exps").innerHTML = `<header><h3>Experiments</h3><span class="src">${d.experiments.count} recorded</span></header>${exps ? `<div class="scroll"><table class="nowrap"><thead><tr><th>strategy</th><th>inst</th><th>critic</th></tr></thead><tbody>${exps}</tbody></table></div>` : `<p class="empty">No experiment yet. Run a backtest from Research.</p>`}`;
    el.querySelector("#ov-rules").innerHTML = `<header><h3>research_protocol.py</h3><span class="src">every number the critic believes</span></header>${rules(d)}`;
    el.querySelectorAll("#ov-mods [data-go]").forEach((m) => {
      const go = () => app.go(m.dataset.go);
      m.addEventListener("click", go);
      m.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    el.querySelectorAll("[data-exp]").forEach((r) => {
      const go = () => app.go("research", { experiment: r.dataset.exp });
      r.addEventListener("click", go);
      r.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
    if (FLOOR.inst) { FLOOR.inst.update(d); FLOOR.inst.setReduced(app.reduced()); paintHud(app, el, d); }
    else if (FLOOR.error) { const fb = el.querySelector(".floor-fallback .dial-stage"); if (fb) fb.innerHTML = dialSvg(app, d.graph); }
  },
};

