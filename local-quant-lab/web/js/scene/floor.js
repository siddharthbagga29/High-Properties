// The trading floor: a 3D scene in the style of the Perspective Engine city. The supervisor is a holographic bust on
// the central podium with the brain inside its head; bots work at two banks of trading desks around it; the supervisor's
// chest core dispatches real jobs to desks; finished work flows into the brain as neurons. Built on three.js (vendored,
// see web/vendor/three/VENDOR.md), loaded only for the Overview.
//
// What is data (all from /api/overview): which neurons are formed (brain.regions[].formed), the bust's face (formed only
// by a proven edge: brain EDGE region), each desk's task, metrics, result and log, dispatch beams and the core's glow
// (jobs queued/running), typing bots (job running), completion beams and neuron streams (a job finished / a region
// grew), the wall ticker (audit events).
// What is ambient decoration: neuron shimmer and drift, the hologram's scanlines, the ticker's scroll. Reduced motion
// stops all of it and snaps animations to their end state.
import * as THREE from "../../vendor/three/three.module.min.js";
import { OrbitControls } from "../../vendor/three/OrbitControls.js";
import { REGIONS, BRAIN_C, BRAIN_S, QUALITY, formedNeurons } from "./brain-geometry.js";
import { buildBust, faceStage, toWorld, CORE, BUST_HALF_WIDTH } from "./bust-geometry.js";
import { createCore } from "./blackhole.js";
import { coreState } from "./core-state.js";
import { SEATS, HUES, deskLayout, deskForJob, formedArray, sharesOf, grown, eventDesk } from "./floor-model.js";
import { drawMain, drawMetrics, drawLog, drawTicker, drawSign } from "./monitors.js";

const SNOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;
const NR = REGIONS.length;
const NEURON_VS = `
uniform float uTime, uMotion, uPR, uSize, uFlash, uDensity, uFlow;
uniform float uFormed[${NR}];
uniform float uPrev[${NR}];
uniform float uGlow[${NR}];
uniform vec3 uCol[${NR}];
uniform vec3 cGhost, cTract, cAura, cDark;
attribute vec4 aInfo;
varying vec3 vColor;
varying float vAlpha;
${SNOISE}
void main() {
  int ri = int(aInfo.x + 0.5);
  float order = aInfo.y, kind = aInfo.z, rnd = aInfo.w;
  vec3 col = cGhost; float alpha = 0.12; float size = 0.75;
  vec3 pos = position;
  if (kind < 0.5) {
    float f = uFormed[ri];
    if (order < f) {
      float fresh = order >= uPrev[ri] ? uFlash : 0.0;
      float glow = uGlow[ri];
      col = mix(uCol[ri], vec3(1.0), 0.12 + 0.7 * fresh + 0.25 * glow);
      float tw = 1.0 - 0.22 * uMotion * (0.5 + 0.5 * sin(uTime * 2.3 + rnd * 60.0));
      alpha = (0.8 + 0.4 * glow + 1.2 * fresh) * tw;
      size = 1.0 + 1.8 * fresh + 0.35 * glow;
    } else if (ri == ${NR - 1}) {
      col = cDark; alpha = 0.32; size = 0.8;           // the EDGE core: dark until real evidence exists
    } else {
      col = cGhost; alpha = 0.3; size = 1.0;           // not yet formed: the outline of the brain still to build
    }
  } else if (kind < 1.5) {
    int rb = int(order + 0.5);
    float on = smoothstep(0.0, 0.35, min(uFormed[ri], uFormed[rb]));
    float flow = mix(1.0, 0.5 + 0.5 * sin(uTime * 3.0 - rnd * 40.0), uFlow * uMotion);
    col = mix(cGhost, cTract, on); alpha = 0.04 + 0.35 * on * flow; size = 0.75;
  } else {
    col = cAura; alpha = 0.04 + 0.05 * rnd; size = 0.6 + rnd;
  }
  if (uMotion > 0.0) {
    vec3 q = pos * 0.11; float tn = uTime * 0.05;
    pos += uMotion * 0.09 * vec3(snoise(q + vec3(tn, 0.0, 0.0)), snoise(q + vec3(0.0, tn + 31.7, 0.0)), snoise(q + vec3(0.0, 0.0, tn + 57.3)));
  }
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * size * uPR * (60.0 / -mv.z), 0.0, 10.0 * uPR);
  vColor = col;
  vAlpha = alpha * uDensity;
}`;
const NEURON_FS = `
varying vec3 vColor; varying float vAlpha;
void main() {
  float s = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); s *= s;
  if (s < 0.02) discard;
  gl_FragColor = vec4(vColor, s * vAlpha);
}`;
const BUST_VS = `
uniform float uTime, uMotion, uPR, uSize, uActive, uFace, uDensity;
uniform vec3 cBody, cMask, cFace;
attribute vec2 aB;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float kind = aB.x, rnd = aB.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  float rim = 1.0 - abs(dot(n, normalize(-mv.xyz)));
  float scan = 0.72 + 0.28 * sin(position.y * 1.7 - uTime * 1.3 * uMotion + rnd * 0.4);
  vec3 col = cBody; float a = (0.16 + 0.9 * pow(rim, 1.6)) * scan; float size = 1.0;
  if (kind > 0.5 && kind < 1.5) { col = cMask; a = (0.12 + 0.5 * pow(rim, 1.6)) * scan; }   // the face: a blank mask
  else if (kind > 1.5) { float on = step(kind - 1.5, uFace); col = cFace; a = 0.95 * on; size = 1.25; }   // features: proven edge only
  a *= 0.8 + 0.6 * uActive;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * size * uPR * (60.0 / -mv.z), 0.0, 8.0 * uPR);
  vColor = col;
  vAlpha = a * uDensity;
}`;
const FLOOR_FS = `
varying vec3 vW;
uniform float uR[5];
void main() {
  float d = length(vW.xz);
  vec2 g = abs(fract(vW.xz / 4.0 - 0.5) - 0.5) / fwidth(vW.xz / 4.0);
  float grid = 1.0 - min(min(g.x, g.y), 1.0);
  float rings = 0.0;
  for (int i = 0; i < 5; i++) rings += 1.0 - smoothstep(0.0, 0.18, abs(d - uR[i]));
  vec3 base = mix(vec3(0.045, 0.03, 0.16), vec3(0.02, 0.015, 0.07), smoothstep(0.0, 70.0, d));
  vec3 col = base + vec3(0.17, 0.94, 1.0) * (0.05 * grid * (1.0 - smoothstep(20.0, 70.0, d)) + 0.55 * rings * (1.0 - smoothstep(30.0, 75.0, d)));
  col += vec3(0.35, 0.2, 1.0) * 0.12 * (1.0 - smoothstep(0.0, 22.0, d));
  gl_FragColor = vec4(col, 1.0);
}`;
const FLOOR_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOW_VS = `attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const FLOW_FS = `uniform float uTime, uOn; uniform vec3 uCol; varying float vT;
void main(){ float dash = 0.5 + 0.5 * sin((vT * 18.0 - uTime * 4.0) * 3.14159); float a = mix(0.25, 0.25 + 0.75 * pow(dash, 3.0), uOn); gl_FragColor = vec4(uCol, a); }`;

const hue = (k) => new THREE.Color(HUES[k] || "#2bf0ff");
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

export function webglAvailable() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

export async function createFloor(host, { quality = "high", reduced = false, onSelect = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "floor-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#06041a");
  scene.fog = new THREE.FogExp2("#06041a", 0.0085);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 700);
  const HOME = { pos: new THREE.Vector3(0, 50, 104), target: new THREE.Vector3(0, 21, -2) };
  // a narrow (portrait) stage widens the lens so the brain and the inner desks stay in frame (stepping back instead
  // would put the camera inside the skyline); the outer desks are an orbit away
  const lensFov = (aspect) => 40 + (1.3 - Math.min(1.3, Math.max(0.45, aspect || 1.3))) * 18;
  camera.position.copy(HOME.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME.target);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 10; controls.maxDistance = 190; controls.maxPolarAngle = 1.48;
  controls.update();

  scene.add(new THREE.HemisphereLight("#7a8cff", "#120a30", 1.4));
  const key = new THREE.DirectionalLight("#cfe8ff", 1.3); key.position.set(20, 40, 30); scene.add(key);
  const cyan = new THREE.PointLight("#2bf0ff", 300, 60, 2); cyan.position.set(0, BRAIN_C[1], 0); scene.add(cyan);

  // -------- floor, glass wall, skyline (decor) --------
  const floor = new THREE.Mesh(new THREE.CircleGeometry(90, 128), new THREE.ShaderMaterial({
    vertexShader: FLOOR_VS, fragmentShader: FLOOR_FS, uniforms: { uR: { value: [8.2, 15, 25, 41, 55] } },
  }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(66, 66, 52, 96, 1, true),
    new THREE.MeshBasicMaterial({ color: "#3b2fd0", transparent: true, opacity: 0.05, side: THREE.BackSide, depthWrite: false }));
  glass.position.y = 26; scene.add(glass);
  // mullions only on the far side: the near wall is cut away so the camera looks into the room
  const mullA = Array.from({ length: 64 }, (_, i) => (i / 64) * Math.PI * 2).filter((a) => Math.sin(a) < 0.25);
  const mull = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 52, 0.25), new THREE.MeshBasicMaterial({ color: "#1e1a5a" }), mullA.length);
  const m4 = new THREE.Matrix4();
  mullA.forEach((a, i) => { m4.makeTranslation(Math.cos(a) * 66, 26, Math.sin(a) * 66); mull.setMatrixAt(i, m4); });
  scene.add(mull);
  const winTex = windowsTexture();
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: winTex, color: "#8a7dff" }), 140);
  const rnd = (() => { let a = 99; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  for (let i = 0; i < 140; i++) {
    const a = rnd() * Math.PI * 2, r = 92 + rnd() * 80, h = 12 + Math.pow(rnd(), 1.6) * 70, w = 5 + rnd() * 8;
    m4.compose(new THREE.Vector3(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 3, 0)), new THREE.Vector3(w, h, w));
    city.setMatrixAt(i, m4);
  }
  scene.add(city);

  // -------- ticker band on the glass: real audit events --------
  const tickCanvas = document.createElement("canvas"); tickCanvas.width = 4096; tickCanvas.height = 64;
  // seen from inside the room, so the texture runs right to left (repeat < 0) or the text would read mirrored
  const tickTex = new THREE.CanvasTexture(tickCanvas); tickTex.wrapS = THREE.RepeatWrapping; tickTex.repeat.x = -2; tickTex.colorSpace = THREE.SRGBColorSpace;
  const ticker = new THREE.Mesh(new THREE.CylinderGeometry(65.5, 65.5, 2.4, 128, 1, true), new THREE.MeshBasicMaterial({ map: tickTex, side: THREE.BackSide, transparent: true, opacity: 0.95 }));
  ticker.position.y = 47; scene.add(ticker);

  // -------- the supervisor: a holographic bust on the podium, the brain inside its head --------
  const podium = new THREE.Group(); scene.add(podium);
  podium.add(mesh(new THREE.CylinderGeometry(13.2, 14.4, 1.6, 96), dark("#120e3a"), 0, 0.8, 0));
  const podRing = mesh(new THREE.TorusGeometry(13.6, 0.14, 8, 128), glow(HUES.supervisor, 1.4), 0, 1.65, 0); podRing.rotation.x = Math.PI / 2; podium.add(podRing);
  const bustData = buildBust(quality === "low" ? 60_000 : 110_000);
  const bustGeo = new THREE.BufferGeometry();
  bustGeo.setAttribute("position", new THREE.BufferAttribute(bustData.pos, 3));
  bustGeo.setAttribute("normal", new THREE.BufferAttribute(bustData.normal, 3));
  bustGeo.setAttribute("aB", new THREE.BufferAttribute(bustData.info, 2));
  const bustMat = new THREE.ShaderMaterial({
    vertexShader: BUST_VS, fragmentShader: NEURON_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uMotion: { value: reduced ? 0 : 1 }, uPR: { value: renderer.getPixelRatio() }, uSize: { value: quality === "low" ? 1.7 : 1.35 },
      uActive: { value: 0 }, uFace: { value: 0 }, uDensity: { value: 1 },
      cBody: { value: new THREE.Color("#58b8ff") }, cMask: { value: new THREE.Color("#7a6bff") }, cFace: { value: new THREE.Color("#e8fbff") } },
  });
  const bust = new THREE.Points(bustGeo, bustMat); bust.frustumCulled = false; scene.add(bust);
  const coreW = new THREE.Vector3(...toWorld(CORE));
  const core = mesh(new THREE.IcosahedronGeometry(0.95, 2), glow(HUES.supervisor, 1.2), coreW.x, coreW.y, coreW.z); scene.add(core);
  const coreHalo = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.07, 6, 64), new THREE.MeshBasicMaterial({ color: HUES.supervisor, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  coreHalo.position.copy(coreW); scene.add(coreHalo);
  const gyro = new THREE.Group(); gyro.position.set(...BRAIN_C); scene.add(gyro);
  // the research core: event horizon on the podium, accretion disk around it (see blackhole.js for what moves and why)
  const rcore = createCore(THREE, scene, { reduced, count: quality === "low" ? 16000 : 30000, pr: renderer.getPixelRatio() });
  let lastCore = coreState([]);
  [[BRAIN_S * 1.5, 1.25, 0.25], [BRAIN_S * 1.62, 1.85, -0.35]].forEach(([r, rx, rz]) => { const t = mesh(new THREE.TorusGeometry(r, 0.05, 6, 180), glow("#8b6bff", 0.9), 0, 0, 0); t.rotation.set(rx, 0, rz); gyro.add(t); });

  // -------- desks and bots --------
  const layout = deskLayout(SEATS);
  const desks = new Map();
  const deskHits = [];
  for (const L of layout) {
    const g = new THREE.Group(); g.position.set(L.x, 0, L.z); g.lookAt(HOME.pos.x * 0.4, 0, HOME.pos.z * 0.4); g.scale.setScalar(1.25); scene.add(g);   // screens turn toward the viewer
    const col = HUES[L.key];
    g.add(mesh(new THREE.BoxGeometry(8.2, 0.3, 3.0), dark("#16123f"), 0, 2.45, -0.4));
    const edge = mesh(new THREE.BoxGeometry(8.2, 0.08, 0.08), glow(col, 1.6), 0, 2.62, 1.12); g.add(edge);
    for (const sx of [-3.8, 3.8]) g.add(mesh(new THREE.BoxGeometry(0.25, 2.4, 2.6), dark("#0e0b2c"), sx, 1.2, -0.4));
    g.add(mesh(new THREE.BoxGeometry(0.18, 5.2, 0.18), dark("#1a1650"), 0, 5.0, -1.55));
    // trading-desk furniture: floor pod, privacy glass between seats, keyboard, a nameplate on the front edge
    const pod = mesh(new THREE.BoxGeometry(10.4, 0.06, 7.6), dark("#0b0926"), 0, 0.03, 0.6); g.add(pod);
    const podEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(10.4, 0.06, 7.6)), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.35 }));
    podEdge.position.set(0, 0.03, 0.6); g.add(podEdge);
    for (const sx of [-4.25, 4.25]) {
      g.add(mesh(new THREE.BoxGeometry(0.06, 2.1, 3.0), new THREE.MeshBasicMaterial({ color: "#6d5bff", transparent: true, opacity: 0.1, depthWrite: false }), sx, 3.65, -0.4));
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.06, 3.0), glow(col, 0.9), sx, 4.72, -0.4));
    }
    g.add(mesh(new THREE.BoxGeometry(2.3, 0.07, 0.75), dark("#0c0a24"), 0, 2.64, 0.35));
    g.add(mesh(new THREE.BoxGeometry(2.1, 0.02, 0.6), glow(col, 0.35), 0, 2.69, 0.35));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.62), signMaterial(L.key.toUpperCase(), col)); plate.position.set(0, 2.2, 1.56); g.add(plate);
    const screens = {};
    const mk = (name, w, h, cw, ch, x, y, yaw) => {
      const c = document.createElement("canvas"); c.width = cw; c.height = ch;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      s.position.set(x, y, -1.45); s.rotation.y = yaw; g.add(s);
      const bezel = mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.12), dark("#05040f"), x, y, -1.53); bezel.rotation.y = yaw; g.add(bezel);
      screens[name] = { c, ctx: c.getContext("2d"), tex };
    };
    mk("main", 4.6, 2.85, 640, 396, 0, 7.1, 0);
    mk("metrics", 3.0, 2.85, 420, 396, -3.95, 7.1, 0.38);
    mk("log", 3.0, 2.85, 420, 396, 3.95, 7.1, -0.38);
    let bot = null;
    if (L.key === "founder") {
      g.add(chair(1.9));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), signMaterial("⚑ HUMAN", HUES.founder)); flag.position.set(0, 4.6, 3.3); g.add(flag);
    } else {
      bot = makeBot(L.key); bot.group.position.set(0, 0, 1.9); g.add(bot.group);   // faces -z: its monitors
    }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(9, 9.5, 5.5), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 4.7, 0); hit.userData.desk = L.key; g.add(hit); deskHits.push(hit);
    desks.set(L.key, { L, group: g, screens, bot, edge, hash: "", beam: null, column: null, labelPos: new THREE.Vector3(L.x, 9.5, L.z) });
  }
  const brainHit = new THREE.Mesh(new THREE.SphereGeometry(BRAIN_S * 1.2, 16, 12), new THREE.MeshBasicMaterial({ visible: false }));
  brainHit.position.set(...BRAIN_C); brainHit.userData.brain = true; scene.add(brainHit);
  const bodyH = BRAIN_C[1] - BRAIN_S * 1.1 - 1.6;      // podium to the chin: the supervisor's body
  const podHit = new THREE.Mesh(new THREE.CylinderGeometry(BUST_HALF_WIDTH * 0.8, 13, bodyH, 16), new THREE.MeshBasicMaterial({ visible: false }));
  podHit.position.set(0, 1.6 + bodyH / 2, 0); podHit.userData.desk = "supervisor"; scene.add(podHit);

  // -------- the brain --------
  const formed = new Float32Array(NR), prev = new Float32Array(NR), glowU = new Float32Array(NR);
  const target = new Float32Array(NR), from = new Float32Array(NR);
  const neuronMat = new THREE.ShaderMaterial({
    vertexShader: NEURON_VS, fragmentShader: NEURON_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uMotion: { value: reduced ? 0 : 1 }, uPR: { value: renderer.getPixelRatio() }, uSize: { value: 1.6 },
      uFlash: { value: 0 }, uDensity: { value: 1 }, uFlow: { value: 0 },
      uFormed: { value: formed }, uPrev: { value: prev }, uGlow: { value: glowU },
      uCol: { value: REGIONS.map((k) => hue(k)) },
      cGhost: { value: new THREE.Color("#5b4bd6") }, cTract: { value: new THREE.Color("#8b6bff") }, cAura: { value: new THREE.Color("#8fe6ff") }, cDark: { value: new THREE.Color("#3a1430") },
    },
  });
  let brain = null, brainInfo = { count: 0, counts: REGIONS.map(() => 0), centroids: null, ms: 0, quality };
  async function buildBrain(q, shares) {
    const total = QUALITY[q] || QUALITY.medium;
    const res = await new Promise((resolve, reject) => {
      let w;
      try { w = new Worker(new URL("./brain-worker.js", import.meta.url), { type: "module" }); } catch (e) { reject(e); return; }
      w.onmessage = (e) => { resolve(e.data); w.terminate(); };
      w.onerror = (e) => { reject(new Error(e.message || "worker failed")); w.terminate(); };
      w.postMessage({ total, seed: 7, shares });
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(res.pos, 3));
    geo.setAttribute("aInfo", new THREE.BufferAttribute(res.info, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(...BRAIN_C), BRAIN_S * 2);
    if (brain) { scene.remove(brain); brain.geometry.dispose(); }
    brain = new THREE.Points(geo, neuronMat);
    brain.frustumCulled = false;
    scene.add(brain);
    neuronMat.uniforms.uDensity.value = Math.min(1, Math.sqrt(150000 / total));
    neuronMat.uniforms.uSize.value = 1.15 + 1.25 * Math.sqrt(Math.min(1, 150000 / total));
    brainInfo = { count: total, counts: res.counts, centroids: res.centroids, ms: Math.round(res.ms), quality: q };
    dirty = true;
  }

  // -------- streams (finished work flying into the brain) and beams --------
  const streams = [];
  function stream(fromKey, region, col) {
    const d = desks.get(fromKey);
    const a = d ? new THREE.Vector3(d.L.x, 10, d.L.z) : new THREE.Vector3(0, 3, 0);
    const c = brainInfo.centroids ? new THREE.Vector3(brainInfo.centroids[region * 3], brainInfo.centroids[region * 3 + 1], brainInfo.centroids[region * 3 + 2]) : new THREE.Vector3(...BRAIN_C);
    const mid = a.clone().lerp(c, 0.5).add(new THREE.Vector3(0, 9, 0));
    const curve = new THREE.QuadraticBezierCurve3(a, mid, c);
    const n = 240, geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), off = new Float32Array(n);
    for (let i = 0; i < n; i++) off[i] = Math.random() * 0.35;
    geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: col, size: 0.35, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false; scene.add(pts);
    streams.push({ pts, curve, off, t0: clock, dur: 1.6 });
  }
  function beamUp(key, ok) {
    const d = desks.get(key);
    if (!d) return;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: ok ? "#3ee6a0" : "#ff5d73", transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(d.L.x, 30, d.L.z); scene.add(m);
    beams.push({ m, t0: clock, dur: 3.5 });
  }
  const beams = [];
  function setDispatch(key, job) {
    const d = desks.get(key);
    if (!d) return;
    if (!job) { if (d.beam) { scene.remove(d.beam); d.beam.geometry.dispose(); d.beam = null; } return; }
    if (!d.beam) {
      const a = coreW.clone(), b = new THREE.Vector3(d.L.x * 0.95, 11.5, d.L.z * 0.95);    // from the chest core to the desk
      const curve = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 6, 0)), b);
      const geo = new THREE.TubeGeometry(curve, 64, 0.12, 6, false);
      const t = new Float32Array(geo.attributes.position.count);
      for (let i = 0; i < t.length; i++) t[i] = Math.floor(i / 7) / 64;
      geo.setAttribute("aT", new THREE.BufferAttribute(t, 1));
      d.beam = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: FLOW_VS, fragmentShader: FLOW_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uOn: { value: 1 }, uCol: { value: hue(key) } } }));
      scene.add(d.beam);
    }
    d.beam.material.uniforms.uOn.value = job.status === "running" ? 1 : 0;
  }

  // -------- labels (flat HTML over the canvas) --------
  const labels = document.createElement("div"); labels.className = "floor-labels"; host.appendChild(labels);
  const labelEls = new Map();
  for (const [k, d] of desks) {
    const b = document.createElement("button"); b.type = "button"; b.className = "floor-label"; b.dataset.desk = k; b.dataset.k = "fl-" + k;
    b.style.setProperty("--hue", HUES[k]);
    b.addEventListener("click", () => onSelect({ kind: "desk", key: k }));
    labels.appendChild(b); labelEls.set(k, { el: b, pos: d.labelPos });
  }
  const supLabel = document.createElement("button"); supLabel.type = "button"; supLabel.className = "floor-label sup"; supLabel.dataset.desk = "supervisor"; supLabel.dataset.k = "fl-supervisor";
  supLabel.style.setProperty("--hue", HUES.supervisor); supLabel.addEventListener("click", () => onSelect({ kind: "desk", key: "supervisor" }));
  labels.appendChild(supLabel); labelEls.set("supervisor", { el: supLabel, pos: new THREE.Vector3(0, 1.7, 14.6), sup: true });   // drawn below its anchor, under the bust
  // leader lines: an inline SVG built by the HTML parser (which supplies the SVG namespace)
  labels.insertAdjacentHTML("afterbegin", `<svg class="floor-leaders">${[...labelEls.keys()].map(() => "<line></line>").join("")}</svg>`);
  [...labelEls.values()].forEach((L, i) => { L.line = labels.firstElementChild.children[i]; L.line.style.stroke = L.el.style.getPropertyValue("--hue"); });
  // Labels avoid the hologram (head and torso, projected) and each other; a leader line joins a moved label to its desk.
  const zone = [[-1.3, 1.3, -1.45, 1.05], [-BUST_HALF_WIDTH / BRAIN_S, BUST_HALF_WIDTH / BRAIN_S, (1.6 - BRAIN_C[1]) / BRAIN_S, -1.45]]
    .map(([x0, x1, y0, y1]) => [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => new THREE.Vector3(BRAIN_C[0] + x * BRAIN_S, BRAIN_C[1] + y * BRAIN_S, 0)));
  const v3 = new THREE.Vector3();
  function placeLabels() {
    const w = host.clientWidth, h = host.clientHeight;
    const hud = host.querySelector(".floor-hud"), hudBottom = hud ? hud.offsetTop + hud.offsetHeight + 6 : 12;
    const coreBox = host.querySelector(".floor-core"), coreBottom = coreBox ? coreBox.offsetTop + coreBox.offsetHeight + 6 : 12;
    const toPx = (p) => { v3.copy(p).project(camera); return [((v3.x + 1) / 2) * w, ((1 - v3.y) / 2) * h, v3.z]; };
    const rects = zone.map((pts) => { const q = pts.map(toPx); return { x0: Math.min(...q.map((a) => a[0])), x1: Math.max(...q.map((a) => a[0])), y0: Math.min(...q.map((a) => a[1])), y1: Math.max(...q.map((a) => a[1])) }; });
    const cx = toPx(new THREE.Vector3(...BRAIN_C))[0];
    const items = [];
    for (const L of labelEls.values()) {
      const [ax, ay, z] = toPx(L.pos);
      const vis = z < 1 && ax > -0.15 * w && ax < 1.15 * w && ay > -0.15 * h && ay < 1.15 * h;
      L.el.style.display = vis ? "" : "none"; L.line.style.display = "none";
      if (!vis) continue;
      if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
      items.push({ L, ax, ay, x: ax - L.w / 2, y: L.sup ? ay + 6 : ay - L.h - 6, w: L.w, h: L.h });
    }
    const hit = (a, b) => a.x < b.x1 && b.x0 < a.x + a.w && a.y < b.y1 && b.y0 < a.y + a.h;
    if (w >= 760) {
      // wide stage: callout columns at the edges (left bank left, right bank right), in anchor order, so the floor stays clear
      for (const side of [-1, 1]) {
        const col = items.filter((it) => !it.L.sup && (it.ax < cx ? -1 : 1) === side).sort((a, b) => a.ay - b.ay);
        const top = side < 0 ? hudBottom : coreBottom;     // the HUD sits top-left, the core status top-right
        let y = top;
        for (const it of col) { it.x = side < 0 ? 12 : w - it.w - 12; it.y = Math.max(y, it.ay - it.h / 2); y = it.y + it.h + 6; }
        const over = y - 6 - (h - 8);
        if (over > 0) for (const it of col) it.y = Math.max(top, it.y - over);
        for (let i = 1; i < col.length; i++) if (col[i].y < col[i - 1].y + col[i - 1].h + 6) col[i].y = col[i - 1].y + col[i - 1].h + 6;
      }
    } else {
      for (const it of items) {
        if (it.L.sup) continue;
        for (const r of rects) if (hit(it, r)) it.x = it.ax < cx ? r.x0 - it.w - 8 : r.x1 + 8;
      }
      items.sort((a, b) => a.y - b.y);
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h + 3 && b.y < a.y + a.h + 3) b.y = a.y + a.h + 4;
        }
      }
    }
    for (const it of items) {
      it.x = Math.max(4, Math.min(w - it.w - 4, it.x)); it.y = Math.max(4, Math.min(h - it.h - 4, it.y));
      it.L.el.style.transform = `translate(${it.x}px, ${it.y}px)`;
      const ex = Math.max(it.x, Math.min(it.x + it.w, it.ax)), ey = Math.max(it.y + 4, Math.min(it.y + it.h - 4, it.ay));
      if (Math.hypot(ex - it.ax, ey - it.ay) > 14) {
        const l = it.L.line; l.style.display = "";
        l.setAttribute("x1", ex); l.setAttribute("y1", ey); l.setAttribute("x2", it.ax); l.setAttribute("y2", it.ay);
      }
    }
  }

  // -------- interaction --------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([...deskHits, podHit, brainHit], false)[0];
    if (!hit) return;
    if (hit.object.userData.brain) onSelect({ kind: "brain" }); else onSelect({ kind: "desk", key: hit.object.userData.desk });
  });
  let fly = null;
  function focus(key) {
    labels.classList.toggle("focused", !!key);    // close up, the inspector carries the record: hide callouts and leaders
    let pos, tgt;
    if (!key) { pos = HOME.pos.clone(); tgt = HOME.target.clone(); }
    else if (key === "brain") { pos = new THREE.Vector3(0, BRAIN_C[1] + 8, BRAIN_S * 3.6); tgt = new THREE.Vector3(...BRAIN_C); }
    else if (key === "supervisor") { pos = new THREE.Vector3(-12, BRAIN_C[1] - 2, 82); tgt = new THREE.Vector3(9, BRAIN_C[1] - 13, 0); }
    else {
      const d = desks.get(key); if (!d) return;
      const toC = new THREE.Vector3(HOME.pos.x * 0.4 - d.L.x, 0, HOME.pos.z * 0.4 - d.L.z).normalize();
      // stand behind the bot, eye level with the monitors; shift right so the desk sits left of the inspector panel
      const right = new THREE.Vector3().crossVectors(toC, new THREE.Vector3(0, 1, 0)).multiplyScalar(-4.2);
      tgt = new THREE.Vector3(d.L.x, 8.6, d.L.z).addScaledVector(toC, 1.6).add(right);
      pos = tgt.clone().addScaledVector(toC, 15).add(new THREE.Vector3(0, 2.0, 0));
    }
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt, start: clock, dur: reducedNow ? 0.01 : 1.3 };
    dirty = true;
  }

  // -------- data updates --------
  let last = null, owners = {}, firstData = true, growAnim = null, beamed = new Set(), tickerHash = "";
  function update(d) {
    owners = Object.fromEntries((d.graph?.nodes || []).map((n) => [n.id, n.owner]));
    const deskMap = new Map((d.desks || []).map((x) => [x.key, x]));
    const evts = d.events || [];
    // monitors: redraw only what changed
    for (const [k, desk] of desks) {
      const rec = deskMap.get(k);
      if (!rec) continue;
      const lines = evts.filter((e) => eventDesk(e, owners) === k);
      const series = k === "paper" && d.paper ? d.paper.equity.map((e) => e.equity).slice(-180) : null;
      const h = JSON.stringify([rec, lines.slice(-7).map((e) => e.t), series && series.length]);
      if (h !== desk.hash) {
        desk.hash = h;
        drawMain(desk.screens.main.ctx, 640, 396, rec); desk.screens.main.tex.needsUpdate = true;
        drawMetrics(desk.screens.metrics.ctx, 420, 396, rec); desk.screens.metrics.tex.needsUpdate = true;
        drawLog(desk.screens.log.ctx, 420, 396, rec, lines, series); desk.screens.log.tex.needsUpdate = true;
      }
      setLabel(labelEls.get(k), rec, "floor-label" + (rec.active ? " active" : "") + (rec.queued ? " queued" : "") + (rec.attention ? " attn" : ""),
        rec.active ? `working: ${rec.task}` : rec.queued ? `queued: ${rec.task}` : rec.task);
      desk.edge.material.emissiveIntensity = rec.active ? 3 : 1.2;
      setDispatch(k, rec.job);
      if (desk.bot) desk.bot.active = !!rec.active;
    }
    const sup = deskMap.get("supervisor");
    if (sup) setLabel(labelEls.get("supervisor"), sup, "floor-label sup" + (d.active_jobs ? " active" : ""),
      d.active_jobs ? `dispatching ${d.active_jobs} job${d.active_jobs > 1 ? "s" : ""}` : "assigns work · closes tasks on evidence");
    supActive = !!d.active_jobs;
    bustMat.uniforms.uActive.value = supActive ? 1 : 0;
    core.material.emissiveIntensity = supActive ? 3.4 : 1.2;
    coreHalo.material.opacity = supActive ? 0.9 : 0.4;
    const edgeRegion = (d.brain?.regions || []).find((r) => r.key === "edge");
    face = faceStage(edgeRegion && edgeRegion.formed);
    bustMat.uniforms.uFace.value = face;
    // completion beams: once per job that finished after the floor opened (a job can start and finish between polls)
    const ended = (j) => j.status === "succeeded" || j.status === "failed";
    for (const j of d.jobs || []) {
      if (!ended(j) || beamed.has(j.id)) continue;
      beamed.add(j.id);
      if (firstData) continue;
      rcore.pulse(j.status === "succeeded", clock);
      const k = deskForJob(j, owners);
      if (k) beamUp(k, j.status === "succeeded");
    }
    // brain growth
    const next = formedArray(d.brain);
    if (firstData) {
      firstData = false;
      for (let i = 0; i < NR; i++) { from[i] = 0; target[i] = next[i]; prev[i] = 0; }
      growAnim = { start: clock, dur: reducedNow ? 0.01 : 3.2, flash: 0.35 };
    } else {
      const g = grown(target, next);
      if (g.length) {
        for (let i = 0; i < NR; i++) { from[i] = formed[i]; prev[i] = formed[i]; target[i] = next[i]; }
        growAnim = { start: clock + (reducedNow ? 0 : 1.4), dur: reducedNow ? 0.01 : 2.4, flash: 1 };
        for (const i of g) stream(regionDesk(REGIONS[i]), i, hue(REGIONS[i]));
      } else for (let i = 0; i < NR; i++) { target[i] = next[i]; if (!growAnim) formed[i] = next[i]; }
    }
    // region glow: a desk with a running job lights its region; the supervisor glows while anything is queued or running
    for (let i = 0; i < NR; i++) glowU[i] = 0;
    for (const rec of d.desks || []) if (rec.active) { const ri = REGIONS.indexOf(rec.key); if (ri >= 0) glowU[ri] = 1; }
    if (d.active_jobs) glowU[0] = 1;
    neuronMat.uniforms.uFlow.value = d.active_jobs ? 1 : 0;
    lastCore = coreState(d.jobs || [], Date.now());
    rcore.set(lastCore);
    // wall ticker
    const th = evts.slice(-14).map((e) => e.t).join();
    if (th !== tickerHash) { tickerHash = th; drawTicker(tickCanvas.getContext("2d"), 4096, 64, evts); tickTex.needsUpdate = true; }
    last = d;
    dirty = true;
  }
  const regionDesk = (k) => (k === "edge" || k === "supervisor" ? "supervisor" : k);
  let supActive = false, face = 0;
  /** A desk label: name, current task, two metrics, last result (tone-coloured). Re-measured only when it changes. */
  function setLabel(L, rec, cls, task) {
    const m = (rec.metrics || []).slice(0, 2).map(([a, b]) => `${esc(a)} <i>${esc(b)}</i>`).join(" · ");
    const html = `<b>${esc(rec.name)}</b><span class="t">${esc(task)}</span><span class="m">${m}</span><span class="r ${esc(rec.tone)}">${esc(rec.result)}</span>`;
    if (L.el.className !== cls) { L.el.className = cls; L.w = 0; }
    if (L.html !== html) { L.html = html; L.el.innerHTML = html; L.w = 0; }
    L.el.setAttribute("aria-label", `${rec.name}: ${task}. ${(rec.metrics || []).map(([a, b]) => `${a} ${b}`).join(", ")}. Result: ${rec.result}. Open desk.`);
  }

  // -------- loop --------
  let clock = 0, running = true, raf = 0, dirty = true, reducedNow = reduced, frames = 0, fpsT = performance.now(), fps = 0;
  const ro = new ResizeObserver(() => resize()); ro.observe(host);
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
    camera.aspect = w / h; camera.fov = lensFov(camera.aspect); camera.updateProjectionMatrix(); dirty = true;
  }
  resize();
  controls.addEventListener("change", () => { dirty = true; });
  let lastT = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (!running) return;
    clock += dt;
    let animating = !reducedNow;
    if (fly) {
      const t = ease((clock - fly.start) / fly.dur);
      camera.position.lerpVectors(fly.p0, fly.p1, t); controls.target.lerpVectors(fly.t0, fly.t1, t);
      if (t >= 1) fly = null; animating = true;
    }
    if (growAnim) {
      const t = ease((clock - growAnim.start) / growAnim.dur);
      if (clock >= growAnim.start) for (let i = 0; i < NR; i++) formed[i] = from[i] + (target[i] - from[i]) * t;
      neuronMat.uniforms.uFlash.value = clock < growAnim.start ? 0 : growAnim.flash * (1 - ease((clock - growAnim.start) / (growAnim.dur + 1.2)));
      if (clock > growAnim.start + growAnim.dur + 1.2) { growAnim = null; neuronMat.uniforms.uFlash.value = 0; for (let i = 0; i < NR; i++) prev[i] = formed[i] = target[i]; }
      animating = true;
    }
    for (let i = streams.length - 1; i >= 0; i--) {
      const s = streams[i], p = s.pts.geometry.attributes.position;
      const t = (clock - s.t0) / s.dur;
      for (let k = 0; k < s.off.length; k++) { const u = Math.min(1, Math.max(0, t * 1.35 - s.off[k])); const q = s.curve.getPoint(u); p.setXYZ(k, q.x, q.y, q.z); }
      p.needsUpdate = true; s.pts.material.opacity = t > 1 ? Math.max(0, 1 - (t - 1) * 3) : 0.95;
      if (t > 1.4) { scene.remove(s.pts); s.pts.geometry.dispose(); streams.splice(i, 1); }
      animating = true;
    }
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i], t = (clock - b.t0) / b.dur;
      b.m.material.opacity = 0.6 * (1 - t); b.m.scale.x = b.m.scale.z = 1 + t * 0.6;
      if (t >= 1) { scene.remove(b.m); b.m.geometry.dispose(); beams.splice(i, 1); }
      animating = true;
    }
    const anyActive = [...desks.values()].some((d) => d.bot && d.bot.active) || supActive;
    for (const d of desks.values()) if (d.bot) d.bot.tick(clock, reducedNow);
    bustMat.uniforms.uTime.value = clock;
    if (supActive && !reducedNow) coreHalo.rotation.set(clock * 1.1, clock * 0.7, 0);
    for (const d of desks.values()) if (d.beam) d.beam.material.uniforms.uTime.value = clock;
    if (anyActive && !reducedNow) { gyro.rotation.y += dt * 0.35; animating = true; }
    for (const [k, dk] of desks) if (dk.bot && dk.bot.active && !reducedNow) rcore.feed(new THREE.Vector3(dk.L.x, 0, dk.L.z), hue(k), clock);
    if (rcore.tick(clock, dt, reducedNow)) animating = true;
    neuronMat.uniforms.uTime.value = clock;
    if (!reducedNow) tickTex.offset.x = (clock * 0.006) % 1;
    controls.update();
    if (!animating && !dirty) return;
    dirty = false;
    renderer.render(scene, camera);
    placeLabels();
    frames++;
    if (now - fpsT > 1000) { fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; }
  }
  raf = requestAnimationFrame(frame);

  await buildBrain(quality, null);
  return {
    update,
    focus,
    async setQuality(q, brainModel) { await buildBrain(q, sharesOf(brainModel)); if (last) { firstData = false; for (let i = 0; i < NR; i++) prev[i] = formed[i]; } },
    setReduced(r) { reducedNow = r; neuronMat.uniforms.uMotion.value = bustMat.uniforms.uMotion.value = r ? 0 : 1; dirty = true; },
    pause() { running = false; },
    resume() { running = true; lastT = performance.now(); dirty = true; resize(); },
    stats: () => ({ neurons: brainInfo.count, quality: brainInfo.quality, build_ms: brainInfo.ms, fps: Math.round(fps), formed: Array.from(formed), streams: streams.length, beams: beams.length,
      formed_neurons: formedNeurons(brainInfo.counts, Array.from(target)), bust_points: bustData.count, face_stage: face, supervisor_active: supActive,
      core: { state: lastCore.state, line: lastCore.line, ...rcore.stats() } }),
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); scene.traverse((o) => { o.geometry?.dispose?.(); }); renderer.domElement.remove(); labels.remove(); },
  };

  // ---------------- builders ----------------
  function mesh(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }
  function dark(c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.35 }); }
  function glow(c, i) { return new THREE.MeshStandardMaterial({ color: "#0a0820", emissive: c, emissiveIntensity: i, roughness: 0.4 }); }
  function chair(z) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.3, 24), dark("#1d1850"), 0, 1.7, z));
    g.add(mesh(new THREE.BoxGeometry(2.0, 2.2, 0.25), dark("#1d1850"), 0, 2.9, z + 0.95));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.5, 8), dark("#0e0b2c"), 0, 0.85, z));
    return g;
  }
  function makeBot(key) {
    const g = new THREE.Group();
    const c = HUES[key];
    g.add(chair(0));
    const y0 = 2.0;
    const shell = new THREE.MeshStandardMaterial({ color: "#d9dcf5", roughness: 0.3, metalness: 0.5 });
    const body = mesh(new THREE.CapsuleGeometry(0.75, 1.1, 6, 16), shell, 0, y0 + 0.9, 0); g.add(body);
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.12, 0.05), glow(c, 2.2), 0, y0 + 1.2, -0.74));
    const head = new THREE.Group(); head.position.set(0, y0 + 2.55, 0); g.add(head);
    head.add(mesh(new THREE.SphereGeometry(0.78, 24, 16), shell, 0, 0, 0));
    const visor = mesh(new THREE.BoxGeometry(1.05, 0.32, 0.4), glow(c, 2.6), 0, 0.05, -0.6); head.add(visor);
    head.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), dark("#9aa0c8"), 0, 1.0, 0));
    const tip = mesh(new THREE.SphereGeometry(0.13, 10, 8), glow(c, 1.0), 0, 1.35, 0); head.add(tip);
    const arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(s * 0.95, y0 + 1.45, 0); g.add(arm);
      const a = mesh(new THREE.CapsuleGeometry(0.2, 1.1, 4, 8), shell, 0, -0.55, -0.35); a.rotation.x = 1.1; arm.add(a);
      arms.push(arm);
    }
    const bot = {
      group: g, active: false,
      tick(t, still) {
        const on = bot.active && !still;
        arms[0].rotation.x = on ? Math.sin(t * 14) * 0.18 : 0;
        arms[1].rotation.x = on ? Math.sin(t * 14 + 1.7) * 0.18 : 0;
        head.rotation.x = on ? 0.08 + Math.sin(t * 3) * 0.04 : 0;
        tip.material.emissiveIntensity = bot.active ? (still ? 3 : 1.5 + 1.5 * (0.5 + 0.5 * Math.sin(t * 9))) : 0.6;
        visor.material.emissiveIntensity = bot.active ? 3.2 : 1.6;
      },
    };
    return bot;
  }
  function signMaterial(text, col) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 128;
    drawSign(c.getContext("2d"), 256, 128, text, col);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  }
  function windowsTexture() {
    const c = document.createElement("canvas"); c.width = 64; c.height = 128;
    const x = c.getContext("2d"); x.fillStyle = "#0a0826"; x.fillRect(0, 0, 64, 128);
    let s = 7;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 8; i++) for (let j = 0; j < 22; j++) if (r() < 0.32) { x.fillStyle = r() < 0.7 ? "#7fe8ff" : "#ffd27a"; x.fillRect(3 + i * 7.5, 3 + j * 5.6, 4, 2.6); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
    return t;
  }
}

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
