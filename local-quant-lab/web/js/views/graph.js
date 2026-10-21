// Agent graph: the real task DAG from state/current_state.json, flat for precise work. Select, filter, zoom/pan,
// keyboard navigation, upstream/downstream highlight, an inspector with evidence and history, and the one action the
// backend allows from here: re-running a task's acceptance tests as a job (it never changes the task's status).
import { esc, clock, duration } from "../format.js";
import { task as taskS, job as jobS, TASK } from "../status.js";
import { layout, upstream, downstream, filter, edgePath, neighbour } from "../graph-model.js";

const W = 170, H = 52;
const st = { statuses: [], owner: "", text: "", vb: null };

function inspector(app, d, n) {
  if (!n) return `<p class="empty">Select a task (click, or Tab then Enter). Arrow keys move between tasks.</p>`;
  const s = taskS(n.status);
  const ups = [...upstream(d.nodes, n.id)], downs = [...downstream(d.nodes, n.id)];
  const ev = n.evidence;
  const j = n.job, lj = n.last_job;
  const jobBlock = (x, title) => x ? `<div class="sec"><div class="kicker">${title}</div><dl class="kv"><dt>job</dt><dd>${esc(x.id)} <span class="tag ${jobS(x.status).tone}">${jobS(x.status).glyph} ${esc(jobS(x.status).label)}</span></dd>
      <dt>started</dt><dd>${esc(clock(x.started_at))}</dd><dt>duration</dt><dd>${x.duration_s != null ? duration(x.duration_s) : x.elapsed_s != null ? duration(x.elapsed_s) + " so far" : "–"}</dd>
      <dt>child cpu</dt><dd>${x.cpu_s != null ? x.cpu_s + " s (measured)" : "–"}</dd><dt>result</dt><dd>${esc((x.result || {}).summary || x.error || "–")}</dd></dl></div>
      ${x.log && x.log.length ? `<div class="joblog" aria-label="job output">${esc(x.log.join("\n"))}</div>` : ""}</div>` : "";
  const canRun = n.recheckable && !j;
  return `<div class="kicker">${esc(n.owner)} · level ${n.level}</div>
    <h3>${esc(n.id)}</h3><p class="goal">${esc(n.goal)}</p>
    <span class="tag ${s.tone}">${s.glyph} ${esc(s.label)}</span> <span class="tag muted">retries ${n.retries}/${n.retry_budget}</span>
    ${n.blocker ? `<div class="decision" style="margin-top:8px"><b>⚑ ${esc(n.blocker.kind)}</b><p>${esc(n.blocker.question || n.blocker.signature || "")}</p></div>` : ""}
    <div class="sec"><div class="kicker">Action</div>
      ${canRun ? `<button class="btn primary" data-act="recheck" data-k="act-recheck">Re-run acceptance tests</button>` : j ? `<button class="btn" data-act="cancel" data-job="${esc(j.id)}" data-k="act-cancel" ${j.cancellable ? "" : "disabled"}>Cancel ${esc(j.id)}</button>` : `<button class="btn" disabled>Re-run acceptance tests</button>`}
      <p class="muted" style="font-size:var(--fs-xs)">${n.owner === "founder" ? "Founder task: it runs on the Mac (docs/MAC_NEXT_STEPS.md). The console cannot run or close it." : "Runs the commands below in the background and reports pass/fail. It never changes the task's status; a failure is logged as a regression."}</p></div>
    <div class="sec"><div class="kicker">Acceptance</div><div class="joblog">${esc(n.acceptance.join("\n") || "none")}</div></div>
    <div class="sec"><div class="kicker">Evidence (${n.evidence_count})</div>${ev ? `<dl class="kv"><dt>command</dt><dd>${esc(ev.command)}</dd><dt>exit</dt><dd>${esc(ev.exit_code)}</dd><dt>passed</dt><dd>${esc(ev.passed)}</dd><dt>failed</dt><dd>${esc(ev.failed)}</dd><dt>at</dt><dd>${esc(ev.at)}</dd></dl>` : `<p class="empty">No evidence recorded.</p>`}</div>
    ${jobBlock(j, "Job now")}${jobBlock(lj, "Last job")}
    <div class="sec"><div class="kicker">Upstream (${ups.length})</div><div class="hist">${ups.map((u) => `<a href="#graph" data-pick="${esc(u)}">${esc(u)}</a>`).join(" · ") || "none"}</div></div>
    <div class="sec"><div class="kicker">Downstream (${downs.length})</div><div class="hist">${downs.map((u) => `<a href="#graph" data-pick="${esc(u)}">${esc(u)}</a>`).join(" · ") || "none"}</div></div>
    ${n.failures.length ? `<div class="sec"><div class="kicker">Failures</div><div class="hist">${n.failures.map((f) => `${esc(clock(f.at, true))} ${esc(f.signature)}`).join("<br>")}</div></div>` : ""}
    <div class="sec"><div class="kicker">History</div><div class="hist">${n.history.slice().reverse().map((h) => `${esc(clock(h.at, true))} → <b>${esc(h.to)}</b> by ${esc(h.by)}${h.note ? ` · ${esc(h.note.slice(0, 90))}` : ""}`).join("<br>")}</div></div>`;
}

export default {
  title: "Agent graph",
  load: (app) => app.api("/api/graph"),
  render(app, el, d) {
    const L = layout(d.nodes, { w: W, h: H });
    const firstFit = !st.vb;
    if (!st.vb) st.vb = [0, 0, L.width, L.height];
    const sel = app.sel.task && d.nodes.find((n) => n.id === app.sel.task) ? app.sel.task : null;
    const shown = new Set(filter(d.nodes, st).map((n) => n.id));
    const ups = sel ? upstream(d.nodes, sel) : new Set(), downs = sel ? downstream(d.nodes, sel) : new Set();
    const now = Date.now();
    let svg = "";
    for (const e of d.edges) {
      const a = L.pos[e.from], b = L.pos[e.to];
      let cls = "gedge";
      if (sel) {
        const isUp = ups.has(e.from) && (e.to === sel || ups.has(e.to));
        const isDown = downs.has(e.to) && (e.from === sel || downs.has(e.from));
        cls += isUp ? " up" : isDown ? " down" : " dim";
      }
      if (!shown.has(e.from) || !shown.has(e.to)) cls += " dim";
      if ((app.flash.get(e.from) || 0) > now) cls += " lit";
      svg += `<path class="${cls}" d="${edgePath(a, b, W, H, L.orient)}" marker-end="url(#arr)"/>`;
    }
    for (const n of d.nodes) {
      const p = L.pos[n.id], s = taskS(n.status);
      const running = n.job && n.job.status === "running";
      const dim = !shown.has(n.id) || (sel && n.id !== sel && !ups.has(n.id) && !downs.has(n.id));
      const col = `var(--${running ? "active" : s.tone})`;
      svg += `<g class="gnode ${n.id === sel ? "sel" : ""} ${dim ? "dim" : ""} ${running ? "running" : ""}" transform="translate(${p.x},${p.y})" tabindex="0" role="button" data-id="${esc(n.id)}" data-k="node-${esc(n.id)}" aria-pressed="${n.id === sel}" aria-label="${esc(n.id)}, ${esc(n.owner)}, ${esc(s.label)}${running ? ", job running" : ""}">
        <rect class="box" width="${W}" height="${H}"/><rect class="bar" x="0" y="0" width="4" height="${H}" fill="var(--r-${esc(n.owner)}, var(--muted))"/>
        <text x="12" y="20">${esc(n.id.length > 19 ? n.id.slice(0, 18) + "…" : n.id)}</text>
        <text class="sub" x="12" y="38" style="fill:${col}">${s.glyph} ${esc(running ? "job running" : s.label)}</text>
        <text class="sub" x="${W - 8}" y="38" text-anchor="end">${esc(n.owner)}</text></g>`;
    }
    const statuses = Object.keys(TASK).filter((k) => d.nodes.some((n) => n.status === k));
    const owners = [...new Set(d.nodes.map((n) => n.owner))];
    el.innerHTML = `
    <div class="view-head"><h1>Agent graph</h1><p>${d.nodes.length} tasks · ${d.edges.length} dependencies · ${L.orient === "TB" ? "top to bottom" : "left to right"} by dependency depth · source ${esc(d.source)} · last checkpoint ${esc(clock((d.last_checkpoint || {}).at, true))}</p></div>
    <div class="gw">
      <section class="panel"><div class="toolbar" role="toolbar" aria-label="Graph filters">
        ${statuses.map((s) => { const t = taskS(s); const on = !st.statuses.length || st.statuses.includes(s); return `<button class="chip ${t.tone} filter-chip" aria-pressed="${on}" data-status="${s}" data-k="f-${s}">${t.glyph} ${esc(t.label)}</button>`; }).join("")}
        <select id="g-owner" aria-label="Filter by owner" data-k="g-owner"><option value="">all owners</option>${owners.map((o) => `<option ${st.owner === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
        <input id="g-text" type="search" placeholder="search id or goal" value="${esc(st.text)}" aria-label="Search tasks" data-k="g-text">
        <button class="btn small" id="g-clear" data-k="g-clear">Clear</button>
      </div>
      <div class="canvas" id="g-canvas"><svg id="g-svg" viewBox="${st.vb.join(" ")}" role="group" aria-label="Task dependency graph, columns by dependency depth">
        <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" fill="rgba(143,230,255,.5)"/></marker></defs>${svg}</svg>
        <div class="zoom"><button class="btn small" data-z="in" aria-label="Zoom in" data-k="z-in">+</button><button class="btn small" data-z="out" aria-label="Zoom out" data-k="z-out">−</button><button class="btn small" data-z="fit" data-k="z-fit">Fit</button></div></div>
      <p class="muted" style="font-size:var(--fs-xs);margin:6px 0 0">Drag to pan, wheel or +/− to zoom. Colour bar = owner; text = state. Violet edges lead into the selection, cyan edges lead out of it.</p></section>
      <section class="panel inspector" aria-live="polite" aria-label="Task inspector">${inspector(app, d, d.nodes.find((n) => n.id === sel))}</section>
    </div>`;
    wire(app, el, d, L);
    if (firstFit) { st.vb = fit(L, el); el.querySelector("#g-svg").setAttribute("viewBox", st.vb.join(" ")); }
  },
};

/** viewBox that shows the whole graph with the canvas's aspect ratio (no distortion, centred). */
function fit(L, el) {
  const c = el.querySelector("#g-canvas");
  const cw = (c && c.clientWidth) || 900, ch = (c && c.clientHeight) || 620, ar = cw / ch;
  let w = L.width, h = L.height;
  if (w / h > ar) h = w / ar; else w = h * ar;
  return [(L.width - w) / 2, (L.height - h) / 2, w, h];
}

function wire(app, el, d, L) {
  const svg = el.querySelector("#g-svg"), canvas = el.querySelector("#g-canvas");
  const pick = (id) => { app.sel.task = id; app.rerender(); const n = el.querySelector(`[data-id="${CSS.escape(id)}"]`); n && n.focus({ preventScroll: true }); };
  el.querySelectorAll(".gnode").forEach((g) => {
    g.addEventListener("click", (e) => { e.stopPropagation(); pick(g.dataset.id); });
    g.addEventListener("keydown", (e) => {
      const dir = { ArrowRight: "right", ArrowLeft: "left", ArrowUp: "up", ArrowDown: "down" }[e.key];
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(g.dataset.id); }
      else if (dir) { e.preventDefault(); const nb = neighbour(d.nodes, L.pos, g.dataset.id, dir); if (nb) pick(nb); }
      else if (e.key === "Escape") { app.sel.task = null; app.rerender(); }
    });
  });
  el.querySelectorAll("[data-pick]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); pick(a.dataset.pick); }));
  el.querySelectorAll("[data-status]").forEach((b) => b.addEventListener("click", () => {
    const s = b.dataset.status, all = Object.keys(TASK).filter((k) => d.nodes.some((n) => n.status === k));
    let cur = st.statuses.length ? st.statuses.slice() : all.slice();
    cur = cur.includes(s) ? cur.filter((x) => x !== s) : cur.concat(s);
    st.statuses = cur.length === all.length ? [] : cur;
    app.rerender();
  }));
  el.querySelector("#g-owner").addEventListener("change", (e) => { st.owner = e.target.value; app.rerender(); });
  let tt;
  el.querySelector("#g-text").addEventListener("input", (e) => { clearTimeout(tt); tt = setTimeout(() => { st.text = e.target.value; app.rerender(); }, 160); });
  el.querySelector("#g-clear").addEventListener("click", () => { st.statuses = []; st.owner = ""; st.text = ""; app.sel.task = null; app.rerender(); });
  const act = el.querySelector("[data-act]");
  if (act) act.addEventListener("click", () => (act.dataset.act === "recheck" ? app.submitJob("recheck", app.sel.task) : app.cancelJob(act.dataset.job)));
  // zoom & pan on the viewBox (no re-layout, no physics)
  const setVb = () => svg.setAttribute("viewBox", st.vb.join(" "));
  const zoom = (f, cx = st.vb[0] + st.vb[2] / 2, cy = st.vb[1] + st.vb[3] / 2) => {
    const w = Math.min(4000, Math.max(200, st.vb[2] * f)), h = st.vb[3] * (w / st.vb[2]);
    st.vb = [cx - (cx - st.vb[0]) * (w / st.vb[2]), cy - (cy - st.vb[1]) * (h / st.vb[3]), w, h];
    setVb();
  };
  el.querySelectorAll("[data-z]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.z === "fit") { st.vb = fit(L, el); setVb(); } else zoom(b.dataset.z === "in" ? 0.8 : 1.25);
  }));
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoom(e.deltaY > 0 ? 1.12 : 0.89, st.vb[0] + ((e.clientX - r.left) / r.width) * st.vb[2], st.vb[1] + ((e.clientY - r.top) / r.height) * st.vb[3]);
  }, { passive: false });
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => { if (e.target.closest(".gnode, button")) return; drag = { x: e.clientX, y: e.clientY, vb: st.vb.slice() }; canvas.setPointerCapture(e.pointerId); canvas.classList.add("dragging"); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = svg.getBoundingClientRect(), k = st.vb[2] / r.width;
    st.vb = [drag.vb[0] - (e.clientX - drag.x) * k, drag.vb[1] - (e.clientY - drag.y) * k, st.vb[2], st.vb[3]];
    setVb();
  });
  const end = () => { drag = null; canvas.classList.remove("dragging"); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
}
