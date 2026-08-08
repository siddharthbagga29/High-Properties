/* ═══════════════════════════════════════════════════════════════════════════
   SENTINEL — application layer
   Order matters: the reveal safety net is armed before anything that can throw.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

var MC = window.__MC__, EV = window.__EV__, PR = window.__PR__;
var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

var C = { teal:'#1cc0a8', tealDeep:'#0d6d61', amber:'#ff7a2f', rose:'#ff5470',
          sky:'#7fb4d8', dim:'#9aa7b1', faint:'#7c8894', grid:'rgba(255,255,255,.07)' };

function money(v, dp) {
  var a = Math.abs(v);
  if (a >= 1e9) return '$' + (v/1e9).toFixed(dp==null?1:dp) + 'B';
  if (a >= 1e6) return '$' + (v/1e6).toFixed(dp==null?1:dp) + 'M';
  if (a >= 1e3) return '$' + Math.round(v/1e3) + 'k';
  return '$' + Math.round(v);
}
function usd(v) { return '$' + Math.round(v).toLocaleString('en-US'); }
function pct(v, dp) { return (v*100).toFixed(dp==null?1:dp) + '%'; }
function el(tag, cls, txt) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

/* ── 1. REVEAL ───────────────────────────────────────────────────────────── */
var scanReveal;
(function () {
  var SEL = '.reveal', io = null;
  function showAll() {
    [].slice.call(document.querySelectorAll(SEL))
      .forEach(function (e) { e.classList.add('visible'); });
  }
  setTimeout(showAll, 1500);          // armed FIRST — nothing can skip it
  try {
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
    }
  } catch (e) { io = null; }
  scanReveal = function () {
    if (!io) return showAll();
    [].slice.call(document.querySelectorAll(SEL)).forEach(function (n) {
      if (!n.classList.contains('visible') && !n.__obs) { n.__obs = 1; io.observe(n); }
    });
  };
  scanReveal();
})();

/* ── 2. PLAIN ENGLISH TOGGLE ─────────────────────────────────────────────── */
(function () {
  var btn = document.getElementById('peBtn'), dot = document.getElementById('peDot');
  var root = document.documentElement;
  function set(on) {
    root.classList.toggle('pe-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    dot.style.background = on ? C.teal : '#7c8894';
    dot.style.boxShadow = on ? '0 0 0 3px rgba(28,192,168,.22)' : 'none';
    try { localStorage.setItem('sentinel-pe', on ? '1' : '0'); } catch (e) {}
  }
  var saved = '0'; try { saved = localStorage.getItem('sentinel-pe') || '0'; } catch (e) {}
  set(saved === '1');
  btn.addEventListener('click', function () { set(!root.classList.contains('pe-on')); });
})();

/* ── 3. ANCHOR SCROLL ────────────────────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(function (a) {
  a.addEventListener('click', function (ev) {
    var id = a.getAttribute('href');
    if (id.length < 2) return;
    var t = document.querySelector(id); if (!t) return;
    ev.preventDefault();
    window.scrollTo({ top: t.getBoundingClientRect().top + window.pageYOffset - 60,
                      behavior: RM ? 'auto' : 'smooth' });
    t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true });
  });
});

/* ── 4. BACKGROUND WEBGL — coverage lattice ──────────────────────────────── */
(function () {
  var cv = document.getElementById('gl'); if (!cv) return;
  function bail() { cv.style.display = 'none'; }
  var gl;
  try {
    var o = { alpha:true, antialias:false, depth:false, stencil:false, powerPreference:'low-power' };
    gl = cv.getContext('webgl', o) || cv.getContext('experimental-webgl', o);
  } catch (e) { return bail(); }
  if (!gl) return bail();

  var FS = [
    'precision highp float;',
    'uniform float uTime; uniform vec2 uRes; uniform float uGap; uniform vec2 uMouse;',
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.03;a*=.5;}return v;}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/uRes.xy; vec2 p=uv; p.x*=uRes.x/uRes.y;',
    ' vec2 w=vec2(fbm(p*2.1+uTime*.020),fbm(p*2.1-uTime*.016));',
    ' vec2 q=p+(w-.5)*.30;',
    ' vec2 g=abs(fract(q*13.0)-.5);',
    ' float lat=1.-smoothstep(.0,.055,min(g.x,g.y));',
    ' float field=fbm(q*1.55+vec2(0.,uTime*.012));',
    ' float tear=smoothstep(.52-uGap*.30,.72-uGap*.10,field);',
    ' float probe=smoothstep(.26,0.,distance(uv,uMouse));',
    ' tear*=(1.-probe*.85);',
    ' vec3 c=vec3(.055,.42,.375)*lat*(1.-tear)+vec3(.72,.31,.11)*lat*tear;',
    ' c*=(1.-smoothstep(.45,1.25,length(uv-.5)*1.35))*.26;',
    ' c+=vec3(.010,.014,.019);',
    ' gl_FragColor=vec4(c,1.);}'
  ].join('\n');

  function sh(t, s) { var x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x);
    return gl.getShaderParameter(x, gl.COMPILE_STATUS) ? x : null; }
  var vs = sh(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}');
  var fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return bail();
  var pg = gl.createProgram();
  gl.attachShader(pg, vs); gl.attachShader(pg, fs); gl.linkProgram(pg);
  if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) return bail();
  gl.useProgram(pg);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(pg, 'a');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uT = gl.getUniformLocation(pg,'uTime'), uR = gl.getUniformLocation(pg,'uRes'),
      uG = gl.getUniformLocation(pg,'uGap'), uM = gl.getUniformLocation(pg,'uMouse');
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  function resize() {
    var w = Math.max(1, (window.innerWidth*dpr)|0), h = Math.max(1, (window.innerHeight*dpr)|0);
    cv.width = w; cv.height = h; gl.viewport(0,0,w,h); gl.uniform2f(uR, w, h);
  }
  resize(); window.addEventListener('resize', resize);

  var mx=-9, my=-9;
  window.addEventListener('pointermove', function (e) {
    mx = e.clientX/window.innerWidth; my = 1 - e.clientY/window.innerHeight;
  }, { passive:true });

  var prog = 0;
  function onScroll() {
    var m = Math.max(1, document.body.scrollHeight - window.innerHeight);
    prog = Math.min(1, Math.max(0, window.pageYOffset / m));
  }
  window.addEventListener('scroll', onScroll, { passive:true }); onScroll();

  var gap=0.12, t0=performance.now(), run=true, raf=0;
  function frame() {
    if (!run) return;
    raf = requestAnimationFrame(frame);
    var tgt = prog < 0.55 ? 0.12 + prog*1.15 : Math.max(0.12, 0.75 - (prog-0.55)*1.35);
    gap += (tgt-gap)*0.055;
    gl.uniform1f(uT, RM ? 0 : (performance.now()-t0)/1000);
    gl.uniform1f(uG, gap); gl.uniform2f(uM, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { run=false; cancelAnimationFrame(raf); }
    else { run=true; frame(); }
  });
  cv.addEventListener('webglcontextlost', function (e) {
    e.preventDefault(); run=false; cancelAnimationFrame(raf);
  });
  frame();
  window.__GL_OK__ = true;
})();

/* ── 5. NEURAL CORE ASSEMBLY (scroll-pinned) ─────────────────────────────────
   Particles start scattered and converge into a structured core as the user
   scrolls the pinned section. Five weak-point nodes lock in at fixed scroll
   depths, each firing a card that names the failure mode and its adjudicated
   cost. Assembly progress is derived from the section's own scroll rect, so it
   maps exactly to depth rather than to elapsed time.
   ──────────────────────────────────────────────────────────────────────── */
var WEAK = [
  { at:0.14, label:'Hallucination',        cost:'$5,000 + sanctions',
    case:'Mata v. Avianca (S.D.N.Y. 2023)',
    body:'A model invented six court cases. The filing attorneys were sanctioned under Rule 11 and ordered to write to every real judge whose name had been fabricated.' },
  { at:0.31, label:'Misrepresentation',    cost:'Company held bound',
    case:'Moffatt v. Air Canada (BCCRT 2024)',
    body:'A chatbot invented a refund policy. The tribunal rejected the argument that the bot was a separate legal entity and held the airline to what it said.' },
  { at:0.48, label:'Disparate impact',     cost:'Nationwide collective',
    case:'Mobley v. Workday (N.D. Cal.)',
    body:'A screening tool now faces a certified ADEA collective covering applicants aged 40+ since 2020. The vendor is a defendant, not just the employers.' },
  { at:0.65, label:'Physical control',     cost:'$243,000,000',
    case:'Benavides v. Tesla (S.D. Fla. 2025)',
    body:'A Miami federal jury returned $243M over an automated-driving fatality, $200M of it punitive. The court refused to toss the verdict in February 2026.' },
  { at:0.82, label:'Training data',        cost:'$1,500,000,000',
    case:'Bartz v. Anthropic',
    body:'The first certified copyright class action against an AI company settled for $1.5B — the largest AI-related recovery on record.' }
];

(function () {
  var cv = document.getElementById('core-canvas'); if (!cv) return;
  var ctx = cv.getContext('2d'); if (!ctx) return;
  var sec = document.getElementById('core');
  var stack = document.getElementById('wp-stack');
  var bar = document.getElementById('core-bar'), pctEl = document.getElementById('core-pct');

  /* build the weak-point cards up front so no-JS/early paint still has them */
  var cards = WEAK.map(function (w, i) {
    var d = el('div', 'wp-card glass px-3.5 py-2.5 border-l-2 border-l-white/15 opacity-30 transition-all duration-500');
    d.setAttribute('data-wp', i);
    var top = el('div', 'flex items-baseline justify-between gap-3 flex-wrap');
    top.appendChild(el('span', 'font-semibold text-[14.5px] wp-label', w.label));
    top.appendChild(el('span', 'font-mono text-[12px] text-faint wp-cost', w.cost));
    d.appendChild(top);
    d.appendChild(el('p', 'text-[12px] text-faint wp-case', w.case));
    var body = el('p', 'text-[12.5px] text-dim mt-1.5 hidden wp-body', w.body);
    d.appendChild(body);
    stack.appendChild(d);
    return d;
  });

  /* ---- geometry -----------------------------------------------------------
     Explicit topology, not a proximity graph. A proximity graph over a dense
     point cloud renders as a hairball; here every edge is deliberate:
     a nucleus, three concentric rings chained around their own circumference,
     radial spokes tying the rings together, and five shell nodes carrying the
     failure modes. The result reads as a machine rather than as noise.
     ------------------------------------------------------------------------ */
  var NODES = [], EDGES = [];
  (function build() {
    function add(x, y, k, w) { NODES.push({ tx:x, ty:y, k:k, w:(w==null?-1:w) }); return NODES.length-1; }
    var SQUASH = 0.88;

    // nucleus — small, tight, no internal edges
    var nucleus = [];
    for (var i = 0; i < 26; i++) {
      var a1 = i * 2.399963, r1 = Math.sqrt(i / 26) * 0.15;
      nucleus.push(add(Math.cos(a1)*r1, Math.sin(a1)*r1*SQUASH, 1.5));
    }

    // three concentric rings, each chained around its own circumference
    var ringDefs = [ [0.36, 22, 0.00], [0.58, 30, -0.62], [0.80, 38, 0.62] ];
    var rings = ringDefs.map(function (rd) {
      var rad = rd[0], cnt = rd[1], tilt = rd[2], idx = [];
      for (var j = 0; j < cnt; j++) {
        var th = (j / cnt) * Math.PI * 2;
        var x = Math.cos(th) * rad, y = Math.sin(th) * rad * 0.56;
        idx.push(add(x*Math.cos(tilt) - y*Math.sin(tilt),
                     x*Math.sin(tilt) + y*Math.cos(tilt), 1.0));
      }
      for (var m = 0; m < idx.length; m++) EDGES.push([idx[m], idx[(m+1) % idx.length]]);
      return idx;
    });

    // radial spokes: nucleus → ring 1 → ring 2 → ring 3, every third node
    for (var s = 0; s < rings[0].length; s += 3) {
      EDGES.push([nucleus[s % nucleus.length], rings[0][s]]);
    }
    for (var p = 0; p < rings[1].length; p += 2) {
      EDGES.push([rings[0][Math.floor(p * rings[0].length / rings[1].length)], rings[1][p]]);
    }
    for (var q = 0; q < rings[2].length; q += 2) {
      EDGES.push([rings[1][Math.floor(q * rings[1].length / rings[2].length)], rings[2][q]]);
    }

    // five shell nodes — the failure modes — each tied back to the outer ring
    for (var k = 0; k < WEAK.length; k++) {
      // -68deg .. +68deg: the arc that is never covered by the copy panel
      var ang = (-68 + (k / (WEAK.length - 1)) * 136) * Math.PI / 180;
      var wi = add(Math.cos(ang)*1.16, Math.sin(ang)*1.05, 2.8, k);
      var near = rings[2][Math.round((k / WEAK.length) * rings[2].length) % rings[2].length];
      EDGES.push([wi, near]);
      NODES[wi].ring = near;
    }
  })();

  // scatter origins + per-node arrival ordering
  var ARRIVE = 0.30;                       // lerp window, in scroll fraction
  NODES.forEach(function (nd, i) {
    var a = Math.random()*Math.PI*2, r = 1.6 + Math.random()*1.7;
    nd.sx = Math.cos(a)*r; nd.sy = Math.sin(a)*r;
    // structure assembles in waves, finishing by 0.78
    nd.delay = (i / NODES.length) * 0.42 + Math.random()*0.06;
    // each failure node seats itself just before its own card fires
    if (nd.w >= 0) nd.delay = Math.max(0, WEAK[nd.w].at - ARRIVE * 0.75);
  });

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;
  function resize() {
    var r = cv.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = (W*dpr)|0; cv.height = (H*dpr)|0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize(); window.addEventListener('resize', resize);

  var progress = 0, shown = -1, exact = 0;
  function computeProgress() {
    var r = sec.getBoundingClientRect();
    var total = r.height - window.innerHeight;
    if (total <= 0) return 0;
    return Math.min(1, Math.max(0, -r.top / total));
  }
  /* Reported progress is the raw scroll fraction — no easing, no frame
     dependency — so the narrative lands on exactly the depth it claims to.
     Node positions ease toward it separately, purely for visual softness. */
  function report() {
    exact = computeProgress();
    if (bar) bar.style.width = (exact * 100).toFixed(1) + '%';
    if (pctEl) pctEl.textContent = Math.round(exact * 100) + '%';
    setCards(exact);
  }
  window.addEventListener('scroll', report, { passive: true });
  window.addEventListener('resize', report);
  report();

  function setCards(p) {
    var active = -1;
    for (var i = 0; i < WEAK.length; i++) if (p >= WEAK[i].at) active = i;
    if (active === shown) return;
    shown = active;
    cards.forEach(function (c, i) {
      var on = i <= active, cur = i === active;
      c.classList.toggle('opacity-30', !on);
      c.classList.toggle('opacity-100', on);
      c.style.borderLeftColor = cur ? C.rose : (on ? C.teal : 'rgba(255,255,255,.15)');
      c.querySelector('.wp-cost').style.color = on ? (cur ? C.rose : C.amber) : C.faint;
      c.querySelector('.wp-body').classList.toggle('hidden', !cur);
      if (cur) c.classList.add('bg-white/[0.04]'); else c.classList.remove('bg-white/[0.04]');
    });
  }

  var t = 0, raf = 0, running = true;
  function draw() {
    if (!running) return;
    raf = requestAnimationFrame(draw);
    var want = computeProgress();
    progress += (want - progress) * 0.22;
    if (Math.abs(want - progress) < 0.004) progress = want;   // snap, never stall
    t += 0.006;

    var p = progress;
    if (Math.abs(exact - want) > 0.001) report();

    ctx.clearRect(0, 0, W, H);

    // core sits right of center on wide screens, centered on narrow
    var wide = W > 900;
        var scale = Math.min(W, H) * (wide ? 0.36 : 0.32);
    var LABEL_ROOM = 172;                       // px reserved for the callouts
    var cx = wide ? Math.min(W*0.66, W - scale*1.16 - LABEL_ROOM) : W*0.5;
    var cy = H*0.5;

    // resolve node positions
    for (var i = 0; i < NODES.length; i++) {
      var nd = NODES[i];
      var lp = Math.min(1, Math.max(0, (p - nd.delay) / ARRIVE));
      lp = lp*lp*(3-2*lp);                                    // smoothstep
      var jitter = (1-lp) * 0.06;
      var wob = RM ? 0 : Math.sin(t*2 + i)*0.006*lp;
      nd.x = cx + (nd.sx + (nd.tx-nd.sx)*lp + wob) * scale;
      nd.y = cy + (nd.sy + (nd.ty-nd.sy)*lp + jitter) * scale;
      nd.lp = lp;
    }

    // nucleus bloom — gives the core a light source instead of a flat scatter
    if (p > 0.12) {
      var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale*0.62);
      bg.addColorStop(0, 'rgba(28,192,168,' + (0.16*Math.min(1,p*1.4)).toFixed(3) + ')');
      bg.addColorStop(1, 'rgba(28,192,168,0)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(cx, cy, scale*0.62, 0, 6.2832); ctx.fill();
    }

    // edges
    ctx.lineWidth = 1.15;
    for (var e = 0; e < EDGES.length; e++) {
      var A = NODES[EDGES[e][0]], B = NODES[EDGES[e][1]];
      var a = Math.min(A.lp, B.lp);
      if (a < 0.55) continue;
      ctx.strokeStyle = 'rgba(28,192,168,' + ((a-0.55)/0.45*0.62).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }

    // nodes
    for (var j = 0; j < NODES.length; j++) {
      var n2 = NODES[j];
      if (n2.lp <= 0.01) continue;
      var isWeak = n2.w >= 0;
      var live = isWeak && exact >= WEAK[n2.w].at;
      var rad = n2.k * (isWeak ? 3.4 : 1.9) * (0.55 + n2.lp*0.45);
      if (live) {
        var pulse = 1 + Math.sin(t*7 + n2.w)*0.18;
        var g = ctx.createRadialGradient(n2.x, n2.y, 0, n2.x, n2.y, rad*7*pulse);
        g.addColorStop(0, 'rgba(255,84,112,.55)');
        g.addColorStop(1, 'rgba(255,84,112,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(n2.x, n2.y, rad*7*pulse, 0, 6.2832); ctx.fill();
        ctx.fillStyle = C.rose;
      } else {
        ctx.fillStyle = isWeak
          ? 'rgba(255,122,47,' + (0.55*n2.lp).toFixed(3) + ')'
          : 'rgba(57,232,204,' + (0.95*n2.lp).toFixed(3) + ')';
      }
      ctx.beginPath(); ctx.arc(n2.x, n2.y, rad, 0, 6.2832); ctx.fill();
    }

    // labels for live weak points (wide screens only — never overlaps the panel)
    if (wide) {
      ctx.font = '600 11px ui-monospace,Menlo,monospace';
      for (var k = 0; k < NODES.length; k++) {
        var nn = NODES[k];
        if (nn.w < 0 || exact < WEAK[nn.w].at || nn.lp < 0.75) continue;
        var lab = WEAK[nn.w].label.toUpperCase();
        var right = (nn.x + 16 + ctx.measureText(lab).width) < (W - 14);
        ctx.textAlign = right ? 'left' : 'right';
        var lx = nn.x + (right ? 16 : -16);
        ctx.strokeStyle = 'rgba(255,84,112,.45)';
        ctx.beginPath(); ctx.moveTo(nn.x + (right?7:-7), nn.y); ctx.lineTo(lx - (right?4:-4), nn.y); ctx.stroke();
        ctx.fillStyle = 'rgba(255,84,112,.92)';
        ctx.fillText(lab, lx, nn.y + 4);
      }
      ctx.textAlign = 'left';
    }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { running = false; cancelAnimationFrame(raf); }
    else { running = true; draw(); }
  });
  draw();
  window.__CORE_OK__ = true;
})();

/* ── 6. FAILURE DOSSIER (press-ready) ────────────────────────────────────── */
(function () {
  var host = document.getElementById('dossier'); if (!host) return;
  var rows = [
    { n:'01', who:'Moffatt v. Air Canada', ct:'BC Civil Resolution Tribunal · February 2024',
      amt:'$476', raw:476, mode:'Negligent misrepresentation by chatbot',
      hold:'The tribunal rejected Air Canada’s argument that its chatbot was "a separate legal entity responsible for its own actions." The airline was bound by what the bot said.',
      why:'Establishes that a company owns its AI’s statements to customers. The award was trivial; the precedent is not.' },
    { n:'02', who:'Mata v. Avianca, Inc.', ct:'S.D.N.Y., 678 F. Supp. 3d 443 · June 2023',
      amt:'$5,000', raw:5000, mode:'Fabricated citations relied on in a filing',
      hold:'Judge Castel found bad faith — "acts of conscious avoidance and false and misleading statements to the Court" — and ordered corrective letters to every judge named in the invented opinions.',
      why:'Professional-services exposure is not theoretical. Unverified AI output entering a work product is a sanctionable act.' },
    { n:'03', who:'Mobley v. Workday, Inc.', ct:'N.D. Cal., No. 3:23-cv-00770 · notice authorized Feb 2026',
      amt:'Class', raw:5e7, mode:'Algorithmic disparate impact in hiring',
      hold:'Preliminary certification of a nationwide ADEA collective covering applicants aged 40+ rejected via the platform since September 2020. Notice was formally authorized in February 2026.',
      why:'The vendor is a defendant, not merely the employer. AI tooling can aggregate individual claims into a single class-scale exposure.' },
    { n:'04', who:'Benavides v. Tesla', ct:'S.D. Fla. (Miami) · verdict Aug 2025, upheld Feb 2026',
      amt:'$243,000,000', raw:243e6, mode:'Automated driving — bodily injury and death',
      hold:'A federal jury returned roughly $129M compensatory (Tesla apportioned 33%) plus $200M punitive against Tesla alone. The court denied Tesla’s motion to set the verdict aside.',
      why:'The severity tail is real and it is nine figures. Any AI system with physical consequences carries catastrophe exposure.' },
    { n:'05', who:'Bartz v. Anthropic', ct:'First certified copyright class action against an AI company',
      amt:'$1,500,000,000', raw:1.5e9, mode:'Training-data acquisition',
      hold:'Settled for $1.5 billion — the largest AI-related recovery on record.',
      why:'Upstream data decisions create downstream balance-sheet events. Model provenance is an insurable exposure, not a legal footnote.' }
  ];
  var lo = Math.log10(400), hi = Math.log10(2e9);
  rows.forEach(function (r) {
    var w = Math.max(5, ((Math.log10(r.raw)-lo)/(hi-lo))*100);
    var d = el('article', 'glass p-5 sm:p-6 reveal');
    d.innerHTML =
      '<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-1">' +
        '<span class="font-mono text-[11px] text-teal">' + r.n + '</span>' +
        '<h3 class="font-semibold text-[16px]">' + r.who + '</h3>' +
        '<span class="font-mono text-[11.5px] text-faint">' + r.ct + '</span>' +
        '<span class="font-mono text-[15px] text-amber ml-auto">' + r.amt + '</span>' +
      '</div>' +
      '<div class="h-[3px] bg-white/[0.06] rounded-full overflow-hidden my-3">' +
        '<div class="h-full rounded-full ladder-bar" style="width:' + w.toFixed(1) + '%;' +
        'background:linear-gradient(90deg,#0d6d61,#ff7a2f)"></div></div>' +
      '<p class="kicker mb-1.5">Failure mode</p>' +
      '<p class="text-[14px] text-ink mb-3">' + r.mode + '</p>' +
      '<p class="kicker mb-1.5">Holding</p>' +
      '<p class="text-[14px] text-dim mb-3">' + r.hold + '</p>' +
      '<p class="kicker mb-1.5">Underwriting significance</p>' +
      '<p class="text-[14px] text-dim">' + r.why + '</p>';
    host.appendChild(d);
  });
  scanReveal();
})();

/* ── 7. ANIMATED COUNTERS ────────────────────────────────────────────────── */
(function () {
  var nodes = [].slice.call(document.querySelectorAll('[data-count]'));
  if (!nodes.length) return;
  function fmt(n, e) {
    var dp = +(e.dataset.dp || 0);
    return (e.dataset.prefix || '') + n.toFixed(dp) + (e.dataset.suffix || '');
  }
  function run(e) {
    if (e.__done) return; e.__done = 1;
    var target = parseFloat(e.dataset.count), t0 = performance.now(), dur = 1300;
    if (RM) { e.textContent = fmt(target, e); return; }
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur);
      e.textContent = fmt(target * (1 - Math.pow(1 - k, 3)), e);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  nodes.forEach(function (e) { e.textContent = fmt(0, e); });
  try {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (x) { if (x.isIntersecting) { run(x.target); io.unobserve(x.target); } });
    }, { threshold: 0.4 });
    nodes.forEach(function (e) { io.observe(e); });
  } catch (e) { nodes.forEach(run); }
  setTimeout(function () { nodes.forEach(run); }, 2600);   // safety net
})();

/* ── 8. CHARTS ───────────────────────────────────────────────────────────── */
var CHARTS = {};
(function () {
  if (typeof Chart === 'undefined' || !PR) return;
  Chart.defaults.color = C.dim;
  Chart.defaults.font.family = 'ui-monospace,SF Mono,Menlo,Consolas,monospace';
  Chart.defaults.font.size = 10.5;
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.legend.labels.padding = 14;
  Chart.defaults.maintainAspectRatio = false;
  var GRID = { color: C.grid, drawTicks: false };
  var tip = { backgroundColor:'rgba(5,7,10,.95)', borderColor:'rgba(255,255,255,.14)',
              borderWidth:1, padding:10, titleColor:'#f2f6f8', bodyColor:'#9aa7b1',
              displayColors:true, cornerRadius:2 };

  function mk(id, cfg) {
    var c = document.getElementById(id); if (!c) return null;
    cfg.options = cfg.options || {};
    cfg.options.plugins = Object.assign({ tooltip: tip }, cfg.options.plugins || {});
    CHARTS[id] = new Chart(c.getContext('2d'), cfg);
    return CHARTS[id];
  }

  /* 8a. cyber ceiling test */
  mk('chartCyber', {
    type:'line',
    data:{ labels:['2020','2022','2024','2025','2027e','2030e'],
      datasets:[
        { label:'Global cyber premium (Munich Re)', data:[7.0,11.0,15.3,16.3,29.0,31.0],
          borderColor:C.sky, backgroundColor:'rgba(127,180,216,.10)', fill:true,
          tension:.35, pointRadius:3, borderWidth:2 },
        { label:'Standalone AI liability (our bottom-up estimate)',
          data:[null,null,null,0.18,0.62,1.9],
          borderColor:C.amber, backgroundColor:'rgba(255,122,47,.10)', fill:true,
          borderDash:[5,4], tension:.35, pointRadius:3, borderWidth:2 }
      ]},
    options:{ scales:{ y:{ grid:GRID, ticks:{ callback:function(v){return '$'+v+'B';} } },
                       x:{ grid:{ display:false } } } }
  });

  /* 8b. pool comparison */
  mk('chartPools', {
    type:'bar',
    data:{ labels:['2026','2028e','2030e'],
      datasets:[
        { label:'AI governance software (Gartner)', data:[0.492,0.72,1.05],
          backgroundColor:'rgba(28,192,168,.72)', borderRadius:2, barPercentage:.7 },
        { label:'Standalone AI liability premium', data:[0.18,0.40,1.9*0.55],
          backgroundColor:'rgba(255,122,47,.72)', borderRadius:2, barPercentage:.7 }
      ]},
    options:{ scales:{ y:{ grid:GRID, ticks:{ callback:function(v){return '$'+v.toFixed(1)+'B';} } },
                       x:{ grid:{ display:false } } } }
  });

  /* 8c. sector exposure multipliers */
  var vs = PR.verticals;
  mk('chartVert', {
    type:'bar',
    data:{ labels: vs.map(function(v){return v.vertical;}),
      datasets:[{ label:'Exposure multiplier', data: vs.map(function(v){return v.mult;}),
        backgroundColor: vs.map(function(v){
          return v.mult >= 1.9 ? 'rgba(255,84,112,.80)'
               : v.mult >= 1.5 ? 'rgba(255,122,47,.80)'
               : 'rgba(28,192,168,.72)'; }),
        borderRadius:2 }]},
    options:{ indexAxis:'y', plugins:{ legend:{ display:false } },
      scales:{ x:{ grid:GRID, ticks:{ callback:function(v){return v+'×';} } },
               y:{ grid:{ display:false } } } }
  });

  /* 8d. premium monitored vs unmonitored */
  mk('chartVertPrem', {
    type:'bar',
    data:{ labels: vs.map(function(v){return v.vertical;}),
      datasets:[
        { label:'Unmonitored', data: vs.map(function(v){return v.premium_unmonitored;}),
          backgroundColor:'rgba(255,122,47,.72)', borderRadius:2 },
        { label:'Monitored (Sentinel)', data: vs.map(function(v){return v.premium_monitored;}),
          backgroundColor:'rgba(28,192,168,.80)', borderRadius:2 }
      ]},
    options:{ indexAxis:'y',
      scales:{ x:{ grid:GRID, ticks:{ callback:function(v){return '$'+(v/1000)+'k';} } },
               y:{ grid:{ display:false } } } }
  });
})();

/* ── 9. ROI CALCULATOR ───────────────────────────────────────────────────── */
(function () {
  if (!PR) return;
  var selV = document.getElementById('roiVert'), selB = document.getElementById('roiBand');
  if (!selV || !selB) return;
  PR.verticals.forEach(function (v) { selV.appendChild(new Option(v.vertical, v.vertical)); });
  PR.matrix.forEach(function (m) { selB.appendChild(new Option(m.band, m.band)); });
  selB.value = PR.matrix[1].band;

  var SUB = 58000;   // Telemetry subscription, from the tier table
  var chart = null;

  function calc() {
    var v = PR.verticals.filter(function (x) { return x.vertical === selV.value; })[0];
    var b = PR.matrix.filter(function (x) { return x.band === selB.value; })[0];
    var cell = b.cells[1];                       // $5M xs $100k
    // scale the sector's premium by the band's own monitored/mid ratio
    var midMon = PR.matrix[1].cells[1].monitored;
    var k = cell.monitored / midMon;
    var premMon = v.premium_monitored * k, premRaw = v.premium_unmonitored * k;
    var savedPrem = premRaw - premMon;
    // avoided expected loss: telemetry cuts modeled frequency, so retained loss
    // below the attachment point falls too. Conservatively 0.9x the layer credit.
    var avoidedLoss = savedPrem * 0.9;
    var annualCost = SUB, annualBenefit = savedPrem + avoidedLoss;
    var cum = [], run = 0, payback = null;
    for (var y = 1; y <= 5; y++) {
      run += annualBenefit - annualCost;
      cum.push(Math.round(run));
      if (payback === null && run >= 0) payback = y;
    }
    return { premMon:premMon, premRaw:premRaw, savedPrem:savedPrem, avoidedLoss:avoidedLoss,
             annualCost:annualCost, annualBenefit:annualBenefit, cum:cum,
             payback:payback, net:run };
  }

  function render() {
    var r = calc();
    document.getElementById('roiNet').textContent = money(r.net);
    document.getElementById('roiPayback').textContent =
      r.payback ? ('Year ' + r.payback) : '> 5 yrs';
    document.getElementById('roiNet').style.color = r.net >= 0 ? C.teal : C.rose;

    var labels = ['Y1','Y2','Y3','Y4','Y5'];
    var cost = labels.map(function () { return -r.annualCost; });
    var ben  = labels.map(function () { return r.annualBenefit; });
    if (chart) {
      chart.data.datasets[0].data = ben;
      chart.data.datasets[1].data = cost;
      chart.data.datasets[2].data = r.cum;
      chart.update();
      return;
    }
    var c = document.getElementById('chartRoi'); if (!c || typeof Chart === 'undefined') return;
    chart = new Chart(c.getContext('2d'), {
      type:'bar',
      data:{ labels:labels, datasets:[
        { label:'Annual benefit (premium credit + avoided loss)', data:ben,
          backgroundColor:'rgba(28,192,168,.72)', borderRadius:2, order:2 },
        { label:'Annual cost (Telemetry subscription)', data:cost,
          backgroundColor:'rgba(255,122,47,.65)', borderRadius:2, order:2 },
        { label:'Cumulative net position', data:r.cum, type:'line',
          borderColor:'#f2f6f8', borderWidth:2, pointRadius:3, tension:.3,
          fill:false, order:1 }
      ]},
      options:{ maintainAspectRatio:false,
        plugins:{ tooltip:{ backgroundColor:'rgba(5,7,10,.95)', borderColor:'rgba(255,255,255,.14)',
          borderWidth:1, padding:10, callbacks:{ label:function(x){
            return x.dataset.label + ': ' + usd(x.parsed.y); } } } },
        scales:{ y:{ grid:{ color:C.grid, drawTicks:false },
                     ticks:{ callback:function(v){ return money(v, 0); } } },
                 x:{ grid:{ display:false } } } }
    });
    CHARTS.chartRoi = chart;
  }
  selV.addEventListener('change', render);
  selB.addEventListener('change', render);
  render();
})();

/* ── 10. PRICING: tiers, matrix, competitors, sector table ───────────────── */
(function () {
  if (!PR) return;

  var th = document.getElementById('tiers');
  if (th) PR.tiers.forEach(function (t, i) {
    var featured = t.key === 'covered';
    var d = el('div', 'glass p-6 reveal flex flex-col ' +
      (featured ? 'border-teal/45 bg-teal/[0.045]' : ''));
    var inc = t.includes.map(function (x) {
      return '<li class="flex gap-2 text-[13px] text-dim"><span class="text-teal shrink-0">✓</span><span>' + x + '</span></li>';
    }).join('');
    d.innerHTML =
      (featured ? '<div class="kicker text-teal mb-2">◆ Most value</div>'
                : '<div class="kicker mb-2">Tier 0' + (i+1) + '</div>') +
      '<h3 class="font-semibold text-lg">' + t.name + '</h3>' +
      '<div class="font-mono text-[1.9rem] tracking-tight mt-2 ' +
        (featured ? 'text-teal' : 'text-ink') + '">' + t.price + '</div>' +
      '<div class="kicker mb-3">' + t.cadence + '</div>' +
      '<p class="text-[13.5px] text-ink mb-2">' + t.lead + '</p>' +
      '<p class="text-[13px] text-dim mb-4">' + t.value + '</p>' +
      '<ul class="space-y-1.5 mb-4">' + inc + '</ul>' +
      '<p class="text-[11.5px] text-faint mt-auto pt-3 border-t border-white/[0.08]">' + t.math + '</p>' +
      '<a href="#contact" class="btn ' + (featured ? 'btn-primary ' : '') +
        'no-underline text-center mt-4">Request quote</a>';
    th.appendChild(d);
  });

  var mt = document.getElementById('matrixTable');
  if (mt) PR.matrix.forEach(function (row) {
    var hr = el('tr', 'bg-white/[0.02]');
    hr.innerHTML = '<td colspan="5" class="px-4 py-2.5 font-mono text-[10.5px] tracking-[0.16em] uppercase text-teal">' +
      row.band + '</td>';
    mt.appendChild(hr);
    row.cells.forEach(function (c) {
      var tr = el('tr', 'border-b border-white/[0.05]');
      if (!c.offered) {
        tr.innerHTML =
          '<td class="px-4 py-3 text-ink">' + money(c.limit,0) + ' xs ' + money(c.attach,0) + '</td>' +
          '<td colspan="4" class="px-4 py-3 text-right text-rose text-[12.5px]">Not offered — layer burns too frequently to be a genuine risk transfer</td>';
      } else {
        tr.innerHTML =
          '<td class="px-4 py-3 text-ink">' + money(c.limit,0) + ' xs ' + money(c.attach,0) + '</td>' +
          '<td class="px-4 py-3 text-right font-mono text-amber">' + usd(c.unmonitored) + '</td>' +
          '<td class="px-4 py-3 text-right font-mono text-teal">' + usd(c.monitored) + '</td>' +
          '<td class="px-4 py-3 text-right font-mono text-ink">' + pct(c.saving_pct, 0) + '</td>' +
          '<td class="px-4 py-3 text-right font-mono text-dim">' + pct(c.rol, 2) + '</td>';
      }
      mt.appendChild(tr);
    });
  });

  var ct = document.getElementById('compTable');
  if (ct) PR.competitors.forEach(function (c) {
    var us = c.name === 'Sentinel';
    var tr = el('tr', 'border-b border-white/[0.05] ' + (us ? 'bg-teal/[0.06]' : ''));
    tr.innerHTML =
      '<td class="px-4 py-3 ' + (us ? 'text-teal font-semibold' : 'text-ink') + '">' + c.name + '</td>' +
      '<td class="px-4 py-3">' + c.paper + '</td>' +
      '<td class="px-4 py-3 font-mono">' + c.limit + '</td>' +
      '<td class="px-4 py-3 ' + (/^Yes/.test(c.telemetry) ? 'text-teal' : 'text-faint') + '">' + c.telemetry + '</td>' +
      '<td class="px-4 py-3 text-[12.5px] ' + (us ? 'text-teal' : 'text-amber') + '">' + c.rate_note + '</td>';
    ct.appendChild(tr);
  });

  var vt = document.getElementById('vertTable');
  if (vt) PR.verticals.forEach(function (v) {
    var save = v.premium_unmonitored - v.premium_monitored;
    var tr = el('tr', 'border-b border-white/[0.05]');
    tr.innerHTML =
      '<td class="px-4 py-3 text-ink">' + v.vertical + '</td>' +
      '<td class="px-4 py-3 font-mono ' + (v.mult >= 1.9 ? 'text-rose' : v.mult >= 1.5 ? 'text-amber' : 'text-teal') + '">' +
        v.mult.toFixed(2) + '×</td>' +
      '<td class="px-4 py-3 text-[13px]">' + v.anchor + '</td>' +
      '<td class="px-4 py-3 text-right font-mono text-amber">' + usd(v.premium_unmonitored) + '</td>' +
      '<td class="px-4 py-3 text-right font-mono text-teal">' + usd(v.premium_monitored) + '</td>' +
      '<td class="px-4 py-3 text-right font-mono text-ink">' + usd(save) + '</td>';
    vt.appendChild(tr);
  });

  scanReveal();
})();

/* ── 11. EVIDENCE LEDGER ─────────────────────────────────────────────────── */
(function () {
  if (!EV) return;
  var host = document.getElementById('ledger'); if (!host) return;
  var TIER = { A:'text-teal border-teal/45 bg-teal/[0.07]',
               B:'text-sky border-sky/40 bg-sky/[0.06]',
               C:'text-amber border-amber/45 bg-amber/[0.07]',
               D:'text-rose border-rose/45 bg-rose/[0.07]' };
  var counts = { A:0, B:0, C:0, D:0 };

  EV.claims.forEach(function (c, i) {
    counts[c.tier]++;
    var wrap = el('div', 'glass overflow-hidden reveal' + (c.tier === 'D' ? ' border-rose/25' : ''));
    var btn = el('button', 'w-full text-left px-5 py-4 flex gap-4 items-start hover:bg-white/[0.03] transition-colors');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'evb-' + i);
    btn.innerHTML =
      '<span class="font-mono text-[9.5px] tracking-[0.16em] uppercase px-2 py-0.5 rounded-sm border shrink-0 mt-0.5 ' +
        TIER[c.tier] + '">' + c.tier + '</span>' +
      '<span class="flex-1 text-[15px] font-medium leading-snug ' +
        (c.tier === 'D' ? 'line-through decoration-rose/60 text-dim' : '') + '">' + c.claim + '</span>' +
      '<span class="text-faint font-mono text-[15px] shrink-0 transition-transform duration-300" aria-hidden="true">+</span>';

    var body = el('div', 'hidden px-5 pb-5 border-t border-white/[0.07]');
    body.id = 'evb-' + i;
    body.appendChild(el('p', 'text-[14px] text-dim mt-4 leading-relaxed', c.detail));
    if (c.layman) body.appendChild(el('p', 'plain', c.layman));
    var v = el('p', 'font-mono text-[10.5px] tracking-[0.13em] uppercase mt-4 ' +
      (c.tier === 'D' ? 'text-rose' : 'text-teal'), c.verdict);
    body.appendChild(v);
    if (c.sources && c.sources.length) {
      var s = el('div', 'mt-4 space-y-1.5');
      c.sources.forEach(function (u) {
        var a = el('a', 'block font-mono text-[11px] text-faint hover:text-teal hover:underline break-all no-underline',
          '↗ ' + u.replace(/^https?:\/\//, '').slice(0, 92));
        a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer';
        s.appendChild(a);
      });
      body.appendChild(s);
    }
    btn.addEventListener('click', function () {
      var open = body.classList.toggle('hidden') === false;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.lastChild.style.transform = open ? 'rotate(45deg)' : 'none';
    });
    wrap.appendChild(btn); wrap.appendChild(body); host.appendChild(wrap);
  });

  ['A','B','C','D'].forEach(function (k) {
    var n = document.getElementById('c' + k); if (n) n.textContent = counts[k];
  });

  var sl = document.getElementById('srcList'), seen = {};
  if (sl) EV.claims.forEach(function (c) {
    (c.sources || []).forEach(function (u) {
      if (seen[u]) return; seen[u] = 1;
      var a = el('a', 'block font-mono text-[11px] text-faint hover:text-teal py-1 break-all no-underline hover:underline',
        u.replace(/^https?:\/\//, ''));
      a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer';
      sl.appendChild(a);
    });
  });
  scanReveal();
})();

/* ── 12. CONTACT PORTAL ──────────────────────────────────────────────────── */
(function () {
  var form = document.getElementById('quoteForm'); if (!form || !PR) return;
  var sec = document.getElementById('fSector'), lim = document.getElementById('fLimit');
  PR.verticals.forEach(function (v) { sec.appendChild(new Option(v.vertical, v.vertical)); });
  PR.matrix[1].cells.forEach(function (c, i) {
    if (c.offered) lim.appendChild(new Option(money(c.limit,0) + ' xs ' + money(c.attach,0), String(i)));
  });
  lim.value = '1';

  function quote() {
    var v = PR.verticals.filter(function (x) { return x.vertical === sec.value; })[0];
    var cell = PR.matrix[1].cells[+lim.value];
    var k = cell.monitored / PR.matrix[1].cells[1].monitored;
    document.getElementById('fQuote').textContent = usd(v.premium_monitored * k);
    document.getElementById('fQuoteRaw').textContent = usd(v.premium_unmonitored * k);
  }
  sec.addEventListener('change', quote); lim.addEventListener('change', quote); quote();

  var errEl = document.getElementById('formErr'), okEl = document.getElementById('formOk');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errEl.classList.add('hidden'); okEl.classList.add('hidden');
    var name = form.querySelector('#fName').value.trim();
    var mail = form.querySelector('#fEmail').value.trim();
    var consent = form.querySelector('#fConsent').checked;
    var problems = [];
    if (!name) problems.push('your name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) problems.push('a valid work email');
    if (!consent) problems.push('consent to be contacted');
    if (problems.length) {
      errEl.textContent = 'Please provide ' + problems.join(', ') + '.';
      errEl.classList.remove('hidden');
      (problems[0] === 'your name' ? form.querySelector('#fName')
        : problems[0].indexOf('email') > -1 ? form.querySelector('#fEmail')
        : form.querySelector('#fConsent')).focus();
      return;
    }
    var body = [
      'Name: ' + name,
      'Email: ' + mail,
      'Company: ' + form.querySelector('#fCompany').value.trim(),
      'Role: ' + form.querySelector('#fRole').value,
      'Sector: ' + sec.value,
      'Limit: ' + lim.options[lim.selectedIndex].text,
      'Indicative monitored premium: ' + document.getElementById('fQuote').textContent,
      '',
      form.querySelector('#fMsg').value.trim()
    ].join('\n');
    okEl.textContent = 'Opening your email client with the details filled in. If nothing happens, ' +
      'email hello@sentinel.example with the same information.';
    okEl.classList.remove('hidden');
    var mailto = 'mailto:hello@sentinel.example' +
      '?subject=' + encodeURIComponent('Sentinel quote request — ' + (form.querySelector('#fCompany').value.trim() || name)) +
      '&body=' + encodeURIComponent(body);
    window.__LAST_MAILTO__ = mailto;
    window.__FORM_SUBMITTED__ = true;
    window.location.href = mailto;
  });
})();

scanReveal();
})();
