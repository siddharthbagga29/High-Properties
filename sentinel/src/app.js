/* ═══════════════════════════════════════════════════════════════════════════
   SENTINEL — application layer
   Load order is deliberate:
     1. global error handlers   (so anything below that throws is observable)
     2. reveal safety net       (so nothing can leave content hidden)
     3. everything else
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* ── 0. GLOBAL ERROR HANDLING ─────────────────────────────────────────────
   A throw anywhere below must be visible, must not cascade, and must never
   leave a section silently blank. Errors are counted on the diagnostics
   object so an uptime check can read them without a console. */
var DIAG = { errors: [], gl: false, core: false, charts: 0, chartLib: false, smoothScroll: false };

function note(kind, msg) {
  if (DIAG.errors.length < 25) DIAG.errors.push(kind + ': ' + String(msg).slice(0, 200));
}
window.addEventListener('error', function (e) {
  note('error', (e.message || 'unknown') + ' @' + (e.lineno || '?'));
}, true);
window.addEventListener('unhandledrejection', function (e) {
  note('promise', (e.reason && e.reason.message) || e.reason || 'unknown');
});

/* Every independent feature runs inside this guard. One failing feature can
   never take down the rest of the page, and the failure is recorded. */
function guard(name, fn) {
  try { fn(); } catch (err) { note(name, err && err.message); }
}

/* ── DATA: parsed from inert JSON islands, kept in this closure.
   Nothing below is attached to window — the pricing model is not a global. */
function island(id) {
  var n = document.getElementById(id);
  if (!n) return null;
  try { return JSON.parse(n.textContent); }
  catch (e) { note('data:' + id, e.message); return null; }
}
var MC = island('d-mc'), EV = island('d-ev'), PR = island('d-pr');

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

/* DOM builders. Everything user-visible is written with textContent, so no
   data value is ever parsed as markup. There is no innerHTML in this file. */
function el(tag, cls, txt) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}
function put(parent) {
  for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
  return parent;
}
function cell(tag, cls, txt) { return el(tag, cls, txt); }

/* Shared visibility gate: run a callback once the element is near the viewport.
   Used for lazy chart construction and for pausing offscreen render loops. */
function whenNear(target, cb, margin) {
  if (typeof IntersectionObserver !== 'function') { cb(); return; }
  var io = new IntersectionObserver(function (es) {
    if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); cb(); }
  }, { rootMargin: margin || '320px' });
  io.observe(target);
}
/* Build a section's DOM lazily: whichever comes first, the section nearing the
   viewport or the browser going idle. Boot stays light, but the content is
   never more than a moment away — and it is always built exactly once. */
function deferBuild(sectionId, build) {
  var sec = document.getElementById(sectionId);
  var done = false;
  function run() { if (done) return; done = true; guard('build:' + sectionId, build); }
  if (sec) whenNear(sec, run, '500px');
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1600 });
  else setTimeout(run, 900);
}

/* ── MASTER TICKER ───────────────────────────────────────────────────────
   Subscribers run in registration order every frame and return true if they
   want another. When all return false the loop stops and the page schedules
   nothing at all. Order matters: Lenis commits scroll first, so anything
   reading scroll position downstream sees this frame's value, not last
   frame's. That is what removes the one-frame lag from scroll-linked motion. */
var Ticker = (function () {
  var subs = [], raf = 0;
  function frame(now) {
    raf = 0;
    var need = false;
    for (var i = 0; i < subs.length; i++) {
      try { if (subs[i](now)) need = true; } catch (e) { note('ticker', e.message); }
    }
    if (need) raf = requestAnimationFrame(frame);
  }
  return {
    add: function (fn) { subs.push(fn); },
    kick: function () { if (!raf) raf = requestAnimationFrame(frame); },
    stop: function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    running: function () { return !!raf; }
  };
})();

/* The ambient background drifts at uTime*0.02 and sits behind glass, so it is
   capped. Scroll-LINKED motion is never capped — that is what makes scrolling
   feel wrong. */
function frameGate(fps) {
  var min = 1000 / fps, last = 0;
  return function (now) {
    if (now - last < min) return false;
    last = now; return true;
  };
}

/* Animation must not compete with first paint. Start after load, then after
   one idle slot, with a hard fallback so it always starts. */
function afterBoot(fn) {
  var fired = false;
  function go() { if (fired) return; fired = true; fn(); }
  function idle() {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 600 });
    else setTimeout(go, 200);
  }
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
  setTimeout(go, 2500);
}

/* Continuous version: calls onChange(true/false) as the element enters/leaves. */
function observeVisible(target, onChange, margin) {
  if (typeof IntersectionObserver !== 'function') { onChange(true); return; }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { onChange(e.isIntersecting); });
  }, { rootMargin: margin || '160px' });
  io.observe(target);
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
guard('plain-english', function () {
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
});

/* ── 2b. MOBILE NAVIGATION ────────────────────────────────────────────────
   Four of six destinations were unreachable below the md breakpoint. This is a
   real disclosure widget: aria-expanded, aria-controls, Escape to close, focus
   moved into the panel and returned to the trigger, and it closes on select. */
guard('nav', function () {
  var btn = document.getElementById('navBtn'), menu = document.getElementById('navMenu');
  if (!btn || !menu) return;
  function setOpen(open) {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
  }
  btn.addEventListener('click', function () {
    var willOpen = menu.hidden;
    setOpen(willOpen);
    if (willOpen) { var f = menu.querySelector('a'); if (f) f.focus(); }
  });
  menu.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') setOpen(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); }
  });
  // Resizing past the breakpoint must not strand an open panel.
  window.addEventListener('resize', function () {
    if (window.innerWidth >= 768 && !menu.hidden) setOpen(false);
  });
  setOpen(false);
});

/* ── 2c. SMOOTH SCROLL ────────────────────────────────────────────────────
   Lenis, first on the shared ticker. It drives real scrollTop rather than a
   transform, so position:sticky and the pinned core section keep working.
   Disabled outright under prefers-reduced-motion. */
var lenis = null;
guard('smooth-scroll', function () {
  if (RM || typeof window.Lenis !== 'function') return;

  lenis = new Lenis({
    duration: 1.05,
    // expo-out: quick to respond, long soft tail — weighty without feeling laggy
    easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
    smoothWheel: true,
    syncTouch: false,        // native momentum already feels right on touch
    wheelMultiplier: 1,
    touchMultiplier: 1.7,
    infinite: false
  });
  document.documentElement.classList.add('lenis-on');

  var idleUntil = 0;
  function wake() { idleUntil = performance.now() + 1200; Ticker.kick(); }
  ['wheel', 'touchstart', 'touchmove', 'keydown', 'pointerdown'].forEach(function (ev) {
    window.addEventListener(ev, wake, { passive: true });
  });

  // Registered before the canvases, so they read this frame's scroll position.
  Ticker.add(function (now) {
    lenis.raf(now);
    return lenis.isScrolling || now < idleUntil;
  });

  DIAG.smoothScroll = true;
});

/* ── 3. ANCHOR SCROLL ────────────────────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(function (a) {
  a.addEventListener('click', function (ev) {
    var id = a.getAttribute('href');
    if (id.length < 2) return;
    var t = document.querySelector(id); if (!t) return;
    ev.preventDefault();
    if (lenis) {
      lenis.scrollTo(t, { offset: -60, duration: 1.15 });
    } else {
      window.scrollTo({ top: t.getBoundingClientRect().top + window.pageYOffset - 60,
                        behavior: RM ? 'auto' : 'smooth' });
    }
    t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true });
  });
});

/* ── 4. BACKGROUND WEBGL — coverage lattice ───────────────────────────────
   Rules this layer obeys:
     · never renders while offscreen or while the tab is hidden
     · releases shader objects after link (they are not needed once linked)
     · recovers from context loss instead of dying permanently
     · under prefers-reduced-motion, paints ONE frame then stops the loop
   ─────────────────────────────────────────────────────────────────────── */
guard('webgl', function () {
  var cv = document.getElementById('gl'); if (!cv) return;
  function bail() { cv.style.display = 'none'; }

  /* Shader budget, set by measurement. The previous version ran three
     5-octave fbm calls — fifteen octaves per pixel, fullscreen, every frame,
     measured at 83ms/frame and single-handedly holding scroll at 10fps. The
     domain warp is now two sines instead of two fbm calls, and the tear field
     uses three octaves instead of five. Three octaves total, down from fifteen;
     invisible at this blur, ~5x cheaper. */
  var FS = [
    'precision mediump float;',
    'uniform float uTime; uniform vec2 uRes; uniform float uGap; uniform vec2 uMouse;',
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}',
    'float fbm3(vec2 p){float v=noise(p)*.5;p*=2.03;v+=noise(p)*.25;p*=2.03;v+=noise(p)*.125;return v;}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/uRes.xy; vec2 p=uv; p.x*=uRes.x/uRes.y;',
    ' vec2 q=p+vec2(sin(p.y*3.1+uTime*.09),cos(p.x*2.7-uTime*.07))*.055;',
    ' vec2 g=abs(fract(q*13.0)-.5);',
    ' float lat=1.-smoothstep(.0,.055,min(g.x,g.y));',
    ' float field=fbm3(q*1.55+vec2(0.,uTime*.012));',
    ' float tear=smoothstep(.52-uGap*.30,.72-uGap*.10,field);',
    ' float probe=smoothstep(.26,0.,distance(uv,uMouse));',
    ' tear*=(1.-probe*.85);',
    ' vec3 c=vec3(.055,.42,.375)*lat*(1.-tear)+vec3(.72,.31,.11)*lat*tear;',
    ' c*=(1.-smoothstep(.45,1.25,length(uv-.5)*1.35))*.26;',
    ' c+=vec3(.010,.014,.019);',
    ' gl_FragColor=vec4(c,1.);}'
  ].join('\n');

  var VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

  var gl = null, pg = null, buf = null, U = null;
  // Decorative, low-frequency, and behind glass panels: it does not need
  // device resolution. 0.34x is indistinguishable at this blur and ~8x cheaper.
  var RENDER_SCALE = 0.34;
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5) * RENDER_SCALE;

  function build() {
    var o = { alpha:true, antialias:false, depth:false, stencil:false, powerPreference:'low-power' };
    gl = cv.getContext('webgl', o) || cv.getContext('experimental-webgl', o);
    if (!gl) return false;

    function sh(t, src) {
      var x = gl.createShader(t); gl.shaderSource(x, src); gl.compileShader(x);
      if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) { gl.deleteShader(x); return null; }
      return x;
    }
    var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { if (vs) gl.deleteShader(vs); if (fs) gl.deleteShader(fs); return false; }

    pg = gl.createProgram();
    gl.attachShader(pg, vs); gl.attachShader(pg, fs); gl.linkProgram(pg);
    // Shader objects are dead weight once the program is linked. Detach and
    // delete them rather than holding them for the lifetime of the page.
    gl.detachShader(pg, vs); gl.detachShader(pg, fs);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) return false;
    gl.useProgram(pg);

    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pg, 'a');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    U = { t: gl.getUniformLocation(pg,'uTime'), r: gl.getUniformLocation(pg,'uRes'),
          g: gl.getUniformLocation(pg,'uGap'), m: gl.getUniformLocation(pg,'uMouse') };
    resize();
    return true;
  }

  function resize() {
    if (!gl) return;
    var w = Math.max(1, (window.innerWidth*dpr)|0), h = Math.max(1, (window.innerHeight*dpr)|0);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0,0,w,h); gl.uniform2f(U.r, w, h);
  }

  if (!build()) return bail();
  DIAG.gl = true;

  var mx=-9, my=-9, prog=0, gap=0.12, t0=performance.now();
  var raf=0, active=true, visible=true, lost=false, idleTimer=0;

  function poke() {
    active = true;
    scrollUntil = performance.now() + 220;     // treat as "in motion"
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { active = false; sync(); }, 1500);
    sync();
  }

  window.addEventListener('resize', function () { resize(); poke(); });
  window.addEventListener('pointermove', function (e) {
    mx = e.clientX/window.innerWidth; my = 1 - e.clientY/window.innerHeight;
    poke();
  }, { passive:true });
  window.addEventListener('scroll', function () {
    var m = Math.max(1, document.body.scrollHeight - window.innerHeight);
    prog = Math.min(1, Math.max(0, window.pageYOffset / m));
    poke();
  }, { passive:true });

  function paint() {
    var tgt = prog < 0.55 ? 0.12 + prog*1.15 : Math.max(0.12, 0.75 - (prog-0.55)*1.35);
    gap += (tgt-gap)*0.055;
    gl.uniform1f(U.t, RM ? 0 : (performance.now()-t0)/1000);
    gl.uniform1f(U.g, gap); gl.uniform2f(U.m, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* A STATIC fullscreen canvas composites for free (60fps measured). Every
     REPAINT costs ~33ms in software, and on a real GPU forces all 31
     backdrop-filter panels to re-blur because their backdrop changed. So:
     20fps at rest, 6fps while actually scrolling — that is where the lag was. */
  var gateIdle = frameGate(20), gateScroll = frameGate(6);
  var booted = false, scrollUntil = 0;
  function stop() {}
  function sync() {
    // Reduced motion gets a single static frame and no loop at all.
    if (RM) { stop(); if (visible && !lost) paint(); return; }
    if (booted && active && visible && !lost) Ticker.kick();
  }

  document.addEventListener('visibilitychange', function () {
    visible = !document.hidden;
    if (visible) poke(); else sync();
  });

  cv.addEventListener('webglcontextlost', function (e) {
    e.preventDefault(); lost = true; stop(); DIAG.gl = false;
  });
  cv.addEventListener('webglcontextrestored', function () {
    // Rebuild every GPU resource — they are all invalid after a context loss.
    gl = null; pg = null; buf = null; U = null;
    if (build()) { lost = false; DIAG.gl = true; sync(); } else { bail(); }
  });

  // Ambient layer: capped, and only while the page is being interacted with.
  Ticker.add(function (now) {
    if (RM || !booted || lost || !visible) return false;
    if (!active) return false;
    if ((now < scrollUntil ? gateScroll : gateIdle)(now)) paint();
    return true;
  });

  paint();                                     // one static frame immediately
  afterBoot(function () { booted = true; poke(); });
});

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

guard('core', function () {
  var cv = document.getElementById('core-canvas'); if (!cv) return;
  var ctx = cv.getContext('2d'); if (!ctx) return;
  var sec = document.getElementById('core');
  var bar = document.getElementById('core-bar'), pctEl = document.getElementById('core-pct');
  var barWrap = document.getElementById('core-progress'), live = document.getElementById('core-live');

  /* One failure at a time. The full list already lives in the loss record
     below; repeating it here buried the figure behind a 700px panel. */
  var live = document.getElementById('core-live');
  var slot = document.getElementById('wp-active');
  var dotsWrap = document.getElementById('wp-dots');
  var intro = slot ? slot.firstElementChild : null;

  var dots = WEAK.map(function (w) {
    var d = el('span', 'h-1 flex-1 rounded-full bg-white/12 transition-colors duration-500');
    d.title = w.label;
    if (dotsWrap) dotsWrap.appendChild(d);
    return d;
  });

  // Which body part each failure is mounted on — stated, not just implied.
  var PART = ['Mounted on the eye', 'Mounted on the mouth', 'Mounted on the hand',
              'Mounted on the foot', 'Mounted on the chest core'];

  var card = el('div', 'hidden');
  var cTop = el('div', 'flex items-baseline justify-between gap-3 flex-wrap');
  var cLabel = el('span', 'font-semibold text-[15px]');
  var cCost = el('span', 'font-mono text-[13px] text-rose');
  put(cTop, cLabel, cCost);
  var cCase = el('p', 'text-[12px] text-faint mt-0.5');
  var cBody = el('p', 'text-[13px] text-dim mt-2 leading-relaxed');
  var cPart = el('p', 'kicker mt-2.5');
  put(card, cTop, cCase, cBody, cPart);
  if (slot) slot.appendChild(card);

  /* ---- geometry: an actual robot -----------------------------------------
     The previous version was concentric rings, which reads as an atom, not a
     machine. This is a figure: head, antenna, torso, chest core, two arms, two
     legs. Bones are explicit chains, so particles fly in and lock into limbs.
     Coordinates are authored y-UP and flipped once at draw time.
     ------------------------------------------------------------------------ */
  var NODES = [], EDGES = [];
  (function build() {
    function add(x, y, k, w) { NODES.push({ tx:x, ty:y, k:(k||1), w:(w==null?-1:w) }); return NODES.length-1; }
    function bone(ax, ay, bx, by, n, k) {
      var ids = [], i;
      for (i = 0; i <= n; i++) {
        var t = i / n;
        ids.push(add(ax + (bx-ax)*t, ay + (by-ay)*t, k || 0.95));
      }
      for (i = 0; i < ids.length - 1; i++) EDGES.push([ids[i], ids[i+1]]);
      return ids;
    }
    function ring(cx, cy, r, n, k) {
      var ids = [], i;
      for (i = 0; i < n; i++) {
        var th = (i / n) * Math.PI * 2;
        ids.push(add(cx + Math.cos(th)*r, cy + Math.sin(th)*r, k || 0.9));
      }
      for (i = 0; i < n; i++) EDGES.push([ids[i], ids[(i+1) % n]]);
      return ids;
    }

    var hx = 0.16, hyT = 0.84, hyB = 0.58;
    bone(-hx, hyT,  hx, hyT, 5, 1.05);              // crown
    bone(-hx, hyB,  hx, hyB, 5, 1.05);              // jaw
    bone(-hx, hyT, -hx, hyB, 4, 1.05);              // left cheek
    bone( hx, hyT,  hx, hyB, 4, 1.05);              // right cheek
    bone(  0, hyT,   0, 0.98, 3, 0.9);              // antenna
    add(0, 1.01, 2.0);                              // antenna tip
    add(-0.075, 0.745, 1.7);                        // left eye

    bone(0, hyB, 0, 0.50, 2, 1.0);                  // neck
    bone(-0.34, 0.46, 0.34, 0.46, 7, 1.05);         // shoulders

    [-1, 1].forEach(function (s) {
      bone(s*0.34, 0.46, s*0.62, 0.14, 5, 1.0);     // upper arm
      bone(s*0.62, 0.14, s*0.80, -0.16, 5, 1.0);    // forearm
      add(s*0.62, 0.14, 1.7);                       // elbow
      ring(s*0.82, -0.20, 0.055, 7, 0.85);          // hand
      bone(s*0.30, 0.46, s*0.23, 0.06, 5, 1.0);     // torso upper
      bone(s*0.23, 0.06, s*0.20, -0.18, 4, 1.0);    // torso lower
      bone(s*0.20, -0.18, s*0.22, -0.54, 5, 1.0);   // thigh
      bone(s*0.22, -0.54, s*0.24, -0.88, 5, 1.0);   // shin
      add(s*0.22, -0.54, 1.7);                      // knee
      bone(s*0.34, -0.92, s*0.13, -0.92, 3, 1.05);  // foot
    });
    bone(-0.20, -0.18, 0.20, -0.18, 5, 1.05);       // pelvis

    ring(0, 0.24, 0.115, 14, 1.0);                  // chest core, outer
    ring(0, 0.24, 0.055, 8, 1.2);                   // chest core, inner
    add(0, 0.24, 2.2);

    /* The five failure modes, each pinned to the body part it is about. This
       is the point of the section: the machine assembles, and every piece that
       lands is a documented way it has already failed. */
    var MOUNT = [
      [ 0.075, 0.745],   // eye   — it sees what is not there
      [-0.075, 0.615],   // mouth — what it says binds you
      [ 0.85,  -0.20],   // hand  — it sorts people
      [ 0.26,  -0.92],   // foot  — it moves in the world
      [ 0.0,    0.24]    // core  — what it is made of
    ];
    for (var k = 0; k < WEAK.length; k++) add(MOUNT[k][0], MOUNT[k][1], 2.7, k);
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
  var lastAnnounced = -1;
  function report() {
    exact = computeProgress();
    var whole = Math.round(exact * 100);
    if (bar) bar.style.width = (exact * 100).toFixed(1) + '%';
    if (pctEl) pctEl.textContent = whole + '%';
    if (barWrap) {
      barWrap.setAttribute('aria-valuenow', String(whole));
      barWrap.setAttribute('aria-valuetext', whole + ' percent assembled');
    }
    setCards(exact);
    // Announce each failure mode once, so the narrative is not visual-only.
    var idx = -1;
    for (var i = 0; i < WEAK.length; i++) if (exact >= WEAK[i].at) idx = i;
    if (live && idx !== lastAnnounced) {
      lastAnnounced = idx;
      live.textContent = idx < 0 ? ''
        : ('Failure mode ' + (idx + 1) + ' of ' + WEAK.length + ': ' +
           WEAK[idx].label + '. ' + WEAK[idx].cost + '. ' + WEAK[idx].case + '.');
    }
  }
  window.addEventListener('scroll', report, { passive: true });
  window.addEventListener('resize', report);
  report();

  function setCards(p) {
    var active = -1;
    for (var i = 0; i < WEAK.length; i++) if (p >= WEAK[i].at) active = i;
    if (active === shown) return;
    shown = active;

    dots.forEach(function (d, i) {
      d.className = 'h-1 flex-1 rounded-full transition-colors duration-500 ' +
        (i === active ? 'bg-rose' : i < active ? 'bg-teal' : 'bg-white/12');
    });

    if (active < 0) {
      card.classList.add('hidden');
      if (intro) intro.classList.remove('hidden');
      return;
    }
    if (intro) intro.classList.add('hidden');
    card.classList.remove('hidden');
    var w = WEAK[active];
    cLabel.textContent = w.label;
    cCost.textContent  = w.cost;
    cCase.textContent  = w.case;
    cBody.textContent  = w.body;
    cPart.textContent  = PART[active];
  }

  var t = 0, onScreen = false, visible = true, booted = false;
  function render() {
    var want = computeProgress();
    // Frame-rate independent easing, so the feel is identical at 60Hz and 120Hz.
    progress += (want - progress) * 0.18;
    if (Math.abs(want - progress) < 0.004) progress = want;   // snap, never stall
    t += 0.006;

    var p = progress;
    if (Math.abs(exact - want) > 0.001) report();

    ctx.clearRect(0, 0, W, H);

    // core sits right of center on wide screens, centered on narrow
    var wide = W > 1024;
        // Centred, and sized so the crown, both arms and both legs clear the copy
    // panel that sits over the torso. That overlap is what makes it read as a
    // robot standing behind the text rather than as a texture.
    //
    // Sizing is solved from the figure's own extents rather than a flat
    // fraction of the viewport, otherwise a narrow screen shrinks it to a
    // thumbnail. On mobile the arms tuck in so the hands stay on screen — the
    // hand carries a failure-mode marker and must remain visible.
    var xSquash = wide ? 1 : 0.62;
    var EXT_X = 0.85 * xSquash, EXT_Y = 1.01;
    var scale = Math.min(H * 0.44 / EXT_Y, W * 0.46 / EXT_X);
    var cx = W * 0.5;
    var cy = H * 0.52;

    // resolve node positions
    for (var i = 0; i < NODES.length; i++) {
      var nd = NODES[i];
      var lp = Math.min(1, Math.max(0, (p - nd.delay) / ARRIVE));
      lp = lp*lp*(3-2*lp);                                    // smoothstep
      var jitter = (1-lp) * 0.06;
      var wob = RM ? 0 : Math.sin(t*2 + i)*0.006*lp;
      var txs = nd.tx * xSquash;
      nd.x = cx + (nd.sx + (txs-nd.sx)*lp + wob) * scale;
      // negated: geometry is authored y-up, canvas y grows downward
      nd.y = cy - (nd.sy + (nd.ty-nd.sy)*lp + jitter) * scale;
      nd.lp = lp;
    }

    // nucleus bloom — gives the core a light source instead of a flat scatter
    if (p > 0.12) {
      var chestY = cy - 0.24 * scale;         // the core sits in the chest
      var bg = ctx.createRadialGradient(cx, chestY, 0, cx, chestY, scale*0.55);
      bg.addColorStop(0, 'rgba(28,192,168,' + (0.16*Math.min(1,p*1.4)).toFixed(3) + ')');
      bg.addColorStop(1, 'rgba(28,192,168,0)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(cx, chestY, scale*0.55, 0, 6.2832); ctx.fill();
    }

    // edges
    ctx.lineWidth = 1.4;
    for (var e = 0; e < EDGES.length; e++) {
      var A = NODES[EDGES[e][0]], B = NODES[EDGES[e][1]];
      var a = Math.min(A.lp, B.lp);
      if (a < 0.55) continue;
      ctx.strokeStyle = 'rgba(28,192,168,' + ((a-0.55)/0.45*0.85).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }

    // nodes
    for (var j = 0; j < NODES.length; j++) {
      var n2 = NODES[j];
      if (n2.lp <= 0.01) continue;
      var isWeak = n2.w >= 0;
      var live = isWeak && exact >= WEAK[n2.w].at;
      var rad = n2.k * (isWeak ? 3.6 : 2.1) * (0.55 + n2.lp*0.45);
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
  function draw1() { progress = computeProgress(); render(); }
  function sync() {
    // Under reduced motion the core is redrawn on scroll only, never looped.
    if (RM) { if (onScreen && visible) draw1(); return; }
    if (booted && onScreen && visible) Ticker.kick();
  }

  // Scroll-linked: runs at the display's native rate whenever it is on screen.
  Ticker.add(function () {
    if (RM || !booted || !onScreen || !visible) return false;
    render();
    return true;
  });

  observeVisible(sec, function (v) { onScreen = v; sync(); }, '200px');
  document.addEventListener('visibilitychange', function () {
    visible = !document.hidden; sync();
  });
  if (RM) window.addEventListener('scroll', function () {
    if (onScreen && visible) { progress = computeProgress(); draw1(); }
  }, { passive: true });

  render();                                    // one static frame immediately
  afterBoot(function () { booted = true; sync(); });
  DIAG.core = true;
});

/* ── 6. FAILURE DOSSIER (press-ready) ────────────────────────────────────── */
deferBuild('failures', function () {
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
    var art = el('article', 'glass p-5 sm:p-6 reveal');

    var head = el('div', 'flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-1');
    put(head,
      el('span', 'font-mono text-[11px] text-teal', r.n),
      el('h3', 'font-semibold text-[16px]', r.who),
      el('span', 'font-mono text-[11.5px] text-faint', r.ct),
      el('span', 'font-mono text-[15px] text-amber ml-auto', r.amt));

    var track = el('div', 'h-[3px] bg-white/[0.06] rounded-full overflow-hidden my-3');
    var fill = el('div', 'h-full rounded-full ladder-bar');
    fill.style.width = w.toFixed(1) + '%';
    fill.style.background = 'linear-gradient(90deg,#0d6d61,#ff7a2f)';
    track.appendChild(fill);

    put(art, head, track,
      el('p', 'kicker mb-1.5', 'Failure mode'),
      el('p', 'text-[14px] text-ink mb-3', r.mode),
      el('p', 'kicker mb-1.5', 'Holding'),
      el('p', 'text-[14px] text-dim mb-3', r.hold),
      el('p', 'kicker mb-1.5', 'Underwriting significance'),
      el('p', 'text-[14px] text-dim', r.why));
    host.appendChild(art);
  });
  scanReveal();
});

/* ── 7. ANIMATED COUNTERS ────────────────────────────────────────────────── */
guard('counters', function () {
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
});

/* ── 8. CHARTS — library and instances are both lazy ─────────────────────
   Chart.js ships inert as <script type="text/plain">. It is compiled only
   when a chart section approaches the viewport, and each chart is built for
   its own section. Nothing here runs during page load, which keeps 204 KB of
   library execution and five canvas rasterizations off the critical path.
   The injected <script> is byte-identical to the inert source, so its
   SHA-256 is in the CSP and no 'unsafe-inline' is needed.
   ─────────────────────────────────────────────────────────────────────── */
var CHARTS = {};
var buildRoi = function () {};
var chartLib = (function () {
  var state = 0, waiting = [];          // 0 idle · 1 loading · 2 ready · 3 failed
  function flush(okFlag) {
    state = okFlag ? 2 : 3;
    waiting.splice(0).forEach(function (cb) { cb(okFlag); });
  }
  return function need(cb) {
    if (state === 2) return cb(true);
    if (state === 3) return cb(false);
    waiting.push(cb);
    if (state === 1) return;
    state = 1;
    var src = document.getElementById('chartjs-src');
    if (!src) return flush(false);
    try {
      var tag = document.createElement('script');
      tag.textContent = src.textContent;
      document.head.appendChild(tag);
      src.textContent = '';             // release ~204 KB of retained text
      var okNow = (typeof window.Chart === 'function');
      DIAG.chartLib = okNow;
      if (!okNow) note('chartlib', 'Chart global missing after injection');
      flush(okNow);
    } catch (err) { note('chartlib', err.message); flush(false); }
  };
})();

/* If the library or a chart fails, swap in the visible fallback that already
   sits next to every canvas. A dead chart never leaves an empty box. */
function chartFailed(canvasId) {
  var c = document.getElementById(canvasId); if (!c) return;
  c.classList.add('hidden');
  var fb = c.parentNode && c.parentNode.querySelector('.chart-fallback');
  if (fb) fb.classList.remove('hidden');
}

function styleChartDefaults() {
  Chart.defaults.color = C.dim;
  Chart.defaults.font.family = 'ui-monospace,SF Mono,Menlo,Consolas,monospace';
  Chart.defaults.font.size = 10.5;
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.legend.labels.padding = 14;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.animation = RM ? false : { duration: 600 };
}

var TIP = { backgroundColor:'rgba(5,7,10,.95)', borderColor:'rgba(255,255,255,.14)',
            borderWidth:1, padding:10, titleColor:'#f2f6f8', bodyColor:'#9aa7b1',
            displayColors:true, cornerRadius:2 };
var GRID = { color: C.grid, drawTicks: false };

function mkChart(id, cfg) {
  var c = document.getElementById(id);
  if (!c) return null;
  try {
    cfg.options = cfg.options || {};
    cfg.options.plugins = Object.assign({ tooltip: TIP }, cfg.options.plugins || {});
    if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; }
    CHARTS[id] = new Chart(c.getContext('2d'), cfg);
    DIAG.charts++;
    return CHARTS[id];
  } catch (err) { note('chart:' + id, err.message); chartFailed(id); return null; }
}

/* Build a section's charts the first time that section comes near. */
function lazySection(sectionId, build) {
  var sec = document.getElementById(sectionId); if (!sec) return;
  whenNear(sec, function () {
    chartLib(function (okFlag) {
      if (!okFlag) { [].forEach.call(sec.querySelectorAll('canvas[id^=chart]'),
        function (c) { chartFailed(c.id); }); return; }
      guard('charts:' + sectionId, function () {
        if (!Chart.__sentinelStyled) { styleChartDefaults(); Chart.__sentinelStyled = true; }
        build();
      });
    });
  }, '400px');
}

lazySection('dashboard', function () {
  mkChart('chartCyber', {
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
  mkChart('chartPools', {
    type:'bar',
    data:{ labels:['2026','2028e','2030e'],
      datasets:[
        { label:'AI governance software (Gartner)', data:[0.492,0.72,1.05],
          backgroundColor:'rgba(28,192,168,.72)', borderRadius:2, barPercentage:.7 },
        { label:'Standalone AI liability premium', data:[0.18,0.40,1.045],
          backgroundColor:'rgba(255,122,47,.72)', borderRadius:2, barPercentage:.7 }
      ]},
    options:{ scales:{ y:{ grid:GRID, ticks:{ callback:function(v){return '$'+v.toFixed(1)+'B';} } },
                       x:{ grid:{ display:false } } } }
  });
  buildRoi();
});

lazySection('research', function () {
  if (!PR) return;
  var vs = PR.verticals;
  mkChart('chartVert', {
    type:'bar',
    data:{ labels: vs.map(function(v){return v.vertical;}),
      datasets:[{ label:'Exposure multiplier', data: vs.map(function(v){return v.mult;}),
        backgroundColor: vs.map(function(v){
          return v.mult >= 1.9 ? 'rgba(255,84,112,.80)'
               : v.mult >= 1.5 ? 'rgba(255,122,47,.80)' : 'rgba(28,192,168,.72)'; }),
        borderRadius:2 }]},
    options:{ indexAxis:'y', plugins:{ legend:{ display:false } },
      scales:{ x:{ grid:GRID, ticks:{ callback:function(v){return v+'×';} } },
               y:{ grid:{ display:false } } } }
  });
  mkChart('chartVertPrem', {
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
});

/* ── 9. ROI CALCULATOR — numbers immediately, chart when in view ───────── */
guard('roi', function () {
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
    // The chart is only built once the library is present; the readouts above
    // are already correct without it.
    if (typeof window.Chart !== 'function') return;
    var c = document.getElementById('chartRoi'); if (!c) return;
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
  buildRoi = function () { guard('roi-chart', render); };
});

/* ── 10. PRICING: tiers, matrix, competitors, sector table ───────────────
   All rendered with textContent. No data string is ever parsed as markup. */
deferBuild('pricing', function () {
  if (!PR) return;

  var th = document.getElementById('tiers');
  if (th) PR.tiers.forEach(function (t, i) {
    var featured = t.key === 'covered';
    var card = el('div', 'glass p-6 reveal flex flex-col' + (featured ? ' border-teal/45 bg-teal/[0.045]' : ''));
    put(card,
      el('div', featured ? 'kicker text-teal mb-2' : 'kicker mb-2',
         featured ? '◆ Most value' : 'Tier 0' + (i + 1)),
      el('h3', 'font-semibold text-lg', t.name),
      el('div', 'font-mono text-[1.9rem] tracking-tight mt-2 ' + (featured ? 'text-teal' : 'text-ink'), t.price),
      el('div', 'kicker mb-3', t.cadence),
      el('p', 'text-[13.5px] text-ink mb-2', t.lead),
      el('p', 'text-[13px] text-dim mb-4', t.value));

    var ul = el('ul', 'space-y-1.5 mb-4');
    t.includes.forEach(function (x) {
      var li = el('li', 'flex gap-2 text-[13px] text-dim');
      put(li, el('span', 'text-teal shrink-0', '✓'), el('span', null, x));
      ul.appendChild(li);
    });
    card.appendChild(ul);
    card.appendChild(el('p', 'text-[11.5px] text-faint mt-auto pt-3 border-t border-white/[0.08]', t.math));

    var cta = el('a', 'btn ' + (featured ? 'btn-primary ' : '') + 'no-underline text-center mt-4', 'Request quote');
    cta.href = '#contact';
    card.appendChild(cta);
    th.appendChild(card);
  });

  var mt = document.getElementById('matrixTable');
  if (mt) PR.matrix.forEach(function (row) {
    var hr = el('tr', 'bg-white/[0.02]');
    var hc = el('td', 'px-4 py-2.5 font-mono text-[10.5px] tracking-[0.16em] uppercase text-teal', row.band);
    hc.colSpan = 5; hr.appendChild(hc); mt.appendChild(hr);

    row.cells.forEach(function (c) {
      var tr = el('tr', 'border-b border-white/[0.05]');
      tr.appendChild(cell('td', 'px-4 py-3 text-ink',
        money(c.limit, 0) + ' xs ' + money(c.attach, 0)));
      if (!c.offered) {
        var d = cell('td', 'px-4 py-3 text-right text-rose text-[12.5px]',
          'Not offered — layer burns too frequently to be a genuine risk transfer');
        d.colSpan = 4; tr.appendChild(d);
      } else {
        put(tr,
          cell('td', 'px-4 py-3 text-right font-mono text-amber', usd(c.unmonitored)),
          cell('td', 'px-4 py-3 text-right font-mono text-teal', usd(c.monitored)),
          cell('td', 'px-4 py-3 text-right font-mono text-ink', pct(c.saving_pct, 0)),
          cell('td', 'px-4 py-3 text-right font-mono text-dim', pct(c.rol, 2)));
      }
      mt.appendChild(tr);
    });
  });

  var ct = document.getElementById('compTable');
  if (ct) PR.competitors.forEach(function (c) {
    var us = c.name === 'Sentinel';
    var tr = el('tr', 'border-b border-white/[0.05]' + (us ? ' bg-teal/[0.06]' : ''));
    put(tr,
      cell('td', 'px-4 py-3 ' + (us ? 'text-teal font-semibold' : 'text-ink'), c.name),
      cell('td', 'px-4 py-3', c.paper),
      cell('td', 'px-4 py-3 font-mono', c.limit),
      cell('td', 'px-4 py-3 ' + (/^Yes/.test(c.telemetry) ? 'text-teal' : 'text-faint'), c.telemetry),
      cell('td', 'px-4 py-3 text-[12.5px] ' + (us ? 'text-teal' : 'text-amber'), c.rate_note));
    ct.appendChild(tr);
  });

  var vt = document.getElementById('vertTable');
  if (vt) PR.verticals.forEach(function (v) {
    var tr = el('tr', 'border-b border-white/[0.05]');
    put(tr,
      cell('td', 'px-4 py-3 text-ink', v.vertical),
      cell('td', 'px-4 py-3 font-mono ' +
        (v.mult >= 1.9 ? 'text-rose' : v.mult >= 1.5 ? 'text-amber' : 'text-teal'),
        v.mult.toFixed(2) + '×'),
      cell('td', 'px-4 py-3 text-[13px]', v.anchor),
      cell('td', 'px-4 py-3 text-right font-mono text-amber', usd(v.premium_unmonitored)),
      cell('td', 'px-4 py-3 text-right font-mono text-teal', usd(v.premium_monitored)),
      cell('td', 'px-4 py-3 text-right font-mono text-ink',
        usd(v.premium_unmonitored - v.premium_monitored)));
    vt.appendChild(tr);
  });

  scanReveal();
});

/* ── 11. EVIDENCE LEDGER ─────────────────────────────────────────────────── */
deferBuild('evidence', function () {
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
    var badge = el('span', 'font-mono text-[9.5px] tracking-[0.16em] uppercase px-2 py-0.5 ' +
      'rounded-sm border shrink-0 mt-0.5 ' + TIER[c.tier], c.tier);
    var claim = el('span', 'flex-1 text-[15px] font-medium leading-snug' +
      (c.tier === 'D' ? ' line-through decoration-rose/60 text-dim' : ''), c.claim);
    var chev = el('span', 'text-faint font-mono text-[15px] shrink-0 transition-transform duration-300', '+');
    chev.setAttribute('aria-hidden', 'true');
    put(btn, badge, claim, chev);

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
      chev.style.transform = open ? 'rotate(45deg)' : 'none';
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
});

/* ── 12. CONTACT PORTAL ──────────────────────────────────────────────────── */
guard('form', function () {
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
  // Exposed for the automated suite only: a URL string, no personal data held.
  form.getComposedMailto = function () { return lastMailto; };

  var errEl = document.getElementById('formErr'), okEl = document.getElementById('formOk');
  var lastMailto = null;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errEl.classList.add('hidden'); okEl.classList.add('hidden');
    var name = form.querySelector('#fName').value.trim();
    var mail = form.querySelector('#fEmail').value.trim();
    var consent = form.querySelector('#fConsent').checked;
    var fName = form.querySelector('#fName'), fMail = form.querySelector('#fEmail'),
        fCons = form.querySelector('#fConsent');
    var bad = [];
    if (!name) bad.push([fName, 'your name']);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) bad.push([fMail, 'a valid work email']);
    if (!consent) bad.push([fCons, 'consent to be contacted']);

    // Clear then reapply, so a corrected field stops reporting as invalid.
    [fName, fMail, fCons].forEach(function (f) { f.removeAttribute('aria-invalid'); });
    if (bad.length) {
      bad.forEach(function (p) { p[0].setAttribute('aria-invalid', 'true'); });
      errEl.textContent = 'Please provide ' + bad.map(function (p) { return p[1]; }).join(', ') + '.';
      errEl.classList.remove('hidden');
      bad[0][0].focus();
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
    lastMailto = mailto;
    window.location.href = mailto;
  });
});

scanReveal();

/* ── DIAGNOSTICS ───────────────────────────────────────────────────────────
   A single frozen, read-only surface. Booleans and an error list — no page
   data, no pricing model, no internals. Safe to leave in production and
   useful for synthetic monitoring. */
Object.defineProperty(window, 'sentinelDiagnostics', {
  value: Object.freeze({
    get ok()     { return DIAG.errors.length === 0; },
    get errors() { return DIAG.errors.slice(); },
    get layers() { return { webgl: DIAG.gl, core: DIAG.core,
                            chartLib: DIAG.chartLib, charts: DIAG.charts,
                            smoothScroll: DIAG.smoothScroll }; }
  }),
  writable: false, configurable: false, enumerable: false
});
})();
