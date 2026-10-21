// Overview: role cards, orchestration dial (the real task graph on a perspective plane), module panels, human
// decisions, risk guards, decision trace, experiments and the frozen research rules.
import { esc, pct, num, money, clock, int } from "../format.js";
import { task as taskS, dataClass, verdictTone, severityTone } from "../status.js";
import { dial } from "../graph-model.js";
import { spark, guards } from "../charts.js";

const ICON = { supervisor: "◎", engineer: "⚙", reviewer: "⌕", founder: "⚑", critic: "⊘", risk: "⛨", data: "≋", hermes: "✦" };
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

export default {
  title: "Overview",
  load: (app) => app.api("/api/overview"),
  render(app, el, d) {
    const g = d.graph;
    const busy = d.jobs.some((j) => j.status === "running");
    const verified = d.task_counts.done_verified || 0;
    const running = d.jobs.find((j) => j.status === "running");
    const decisions = d.decisions.length ? d.decisions.map((x) => `<div class="decision ${x.severity === "critical" ? "bad" : x.severity === "info" ? "info" : ""}"><b>${x.severity === "critical" ? "✕" : "⚑"} ${esc(x.title)}</b><p>${esc(x.detail)}</p></div>`).join("")
      : `<p class="empty">No open decisions.</p>`;
    const gr = d.risk_guards.map((r) => ({ label: r.name, ratio: r.ratio,
      text: r.value === null ? `limit ${r.unit === "pct" ? pct(r.limit, 0) : int(r.limit)}` : `${r.unit === "pct" ? pct(r.value, 1) : money(r.value)} / ${r.unit === "pct" ? pct(r.limit, 0) : money(r.limit)}` }));
    const evts = d.events.slice(-22).reverse();
    const lastSeen = app._lastTrace || 0;
    const trace = evts.map((e, i) => `<div class="tr ${severityTone(e.severity)} ${Date.parse(e.t) > lastSeen && lastSeen ? "new" : ""}"><span>${esc(clock(e.t))}</span><span class="k">${esc(e.kind)}</span><span class="m">${esc(e.message)}</span></div>`).join("");
    app._lastTrace = evts.length ? Date.parse(evts[0].t) : lastSeen;
    const exps = d.experiments.latest.map((e) => `<tr tabindex="0" data-exp="${esc(e.id)}" data-k="exp-${esc(e.id)}"><td title="${esc(e.at)}">${esc(e.strategy)}</td><td>${esc(e.instrument)}</td><td><span class="tag ${verdictTone(e.verdict)}">${esc(e.verdict)}</span></td></tr>`).join("");
    el.innerHTML = `
    <div class="view-head"><h1>Command deck</h1><p>Every figure below is read from local records. Motion means a real job or state change.</p></div>
    <div class="roles">${d.roles.map(roleCard).join("")}</div>
    <div class="ov-mid">
      <div class="ov-col">${modules(app, d)}</div>
      <section class="panel hero ${busy ? "busy" : ""}" aria-label="Orchestration dial">
        <header><h2>Orchestration dial</h2><span class="src">${esc(g.source)} · ${g.nodes.length} tasks · ${g.edges.length} dependencies</span></header>
        <div class="hero-core" aria-hidden="true"><b class="num">${verified}<span style="font-size:18px;color:var(--text-3)">/${g.nodes.length}</span></b><span>supervisor · tasks verified with evidence</span></div>
        <div class="shadow"></div>
        <div class="dial-stage">${dialSvg(app, g)}</div>
        <div class="dial-labels" aria-hidden="true"></div>
        <div class="hero-foot">
          ${Object.entries(d.task_counts).map(([s, n]) => { const t = taskS(s); return `<span class="chip ${t.tone}">${t.glyph} ${esc(t.label)} ${n}</span>`; }).join("")}
          <span class="chip ${busy ? "active" : "muted"}">${busy ? `◉ ${esc(running.label)} · ${running.elapsed_s ?? 0}s` : "○ no job running · dial is still"}</span>
        </div>
      </section>
      <div class="ov-col">
        <section class="panel ${d.decisions.length ? "attn" : ""}"><header><h3>Waiting on a human</h3><span class="src">${d.decisions.length} open</span></header>${decisions}</section>
        <section class="panel"><header><h3>Risk guards</h3><span class="src">config/settings.json</span></header>${guards(gr)}
          <p class="muted" style="font-size:var(--fs-xs);margin:6px 0 0">Bars show the simulated paper ledger against each hard limit. Limits are read-only here; only a human edits the file.</p></section>
      </div>
    </div>
    <div class="ov-bot">
      <section class="panel"><header><h3>Decision trace</h3><span class="src">state/events.jsonl · last ${evts.length}</span></header><div class="trace">${trace || `<p class="empty">No events yet.</p>`}</div></section>
      <section class="panel"><header><h3>Experiments</h3><span class="src">${d.experiments.count} recorded</span></header>${exps ? `<div class="scroll"><table class="nowrap"><thead><tr><th>strategy</th><th>inst</th><th>critic</th></tr></thead><tbody>${exps}</tbody></table></div>` : `<p class="empty">No experiment yet. Run a backtest from Research.</p>`}</section>
      <section class="panel"><header><h3>research_protocol.py</h3><span class="src">every number the critic believes</span></header>${rules(d)}</section>
    </div>`;
    el.querySelectorAll("[data-go]").forEach((m) => {
      const go = () => app.go(m.dataset.go);
      m.addEventListener("click", go);
      m.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    el.querySelectorAll("[data-task]").forEach((n) => {
      const go = () => app.go("graph", { task: n.dataset.task });
      n.addEventListener("click", go);
      n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    el.querySelectorAll("[data-exp]").forEach((r) => {
      const go = () => app.go("research", { experiment: r.dataset.exp });
      r.addEventListener("click", go);
      r.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
    if ([...app.flash.values()].some((t) => t > Date.now())) setTimeout(() => app.rerender(), 2300);
    placeLabels(el, g);
  },
};

// Flat, readable labels for nodes on the tilted plane: the plane is 3D-transformed, the text is not.
function placeLabels(el, g) {
  const box = el.querySelector(".dial-labels"), hero = el.querySelector(".hero");
  if (!box || !hero) return;
  requestAnimationFrame(() => {
    const hr = hero.getBoundingClientRect();
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    box.innerHTML = [...el.querySelectorAll(".dial-plane .node")].map((node) => {
      const r = node.getBoundingClientRect(), n = byId.get(node.dataset.task);
      const cls = n.job && n.job.status === "running" ? "active" : n.status === "needs_human" ? "human" : "";
      return `<span class="${cls}" style="left:${(r.left + r.width / 2 - hr.left).toFixed(0)}px;top:${(r.top - hr.top).toFixed(0)}px">${esc(n.id.replace(/-.*/, ""))}</span>`;
    }).join("");
  });
}
