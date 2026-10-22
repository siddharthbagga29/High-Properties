// The research core: an event horizon on the supervisor's podium with an accretion disk and a lensed halo, in the
// semantic palette (cyan incoming data outside, violet transformation, magenta and amber close to the horizon).
// What moves and why: the disk turns slowly while idle (ambient, labelled; stopped under reduced motion); it brightens
// and turns faster only while a real job runs; particles spiral in from the desk whose job is running; queued jobs show
// as amber markers on the rim; a real terminal event sends one green (succeeded) or red (failed) pulse outward.
import { mulberry32 } from "./brain-geometry.js";

const VS = `
uniform float uTime, uSpin, uAct, uPR, uSize;
attribute vec4 aDisk;          // radius, start angle, height, rnd
attribute float aLens;         // 0 disk, 1 lensed halo
varying vec3 vC; varying float vA;
void main() {
  float r = aDisk.x, a0 = aDisk.y, h = aDisk.z, rnd = aDisk.w;
  float omega = 2.4 * pow(15.0 / r, 1.5);                     // Keplerian: inner material turns faster
  float a = a0 + uTime * uSpin * omega * (0.18 + 0.82 * uAct);
  vec3 p = aLens < 0.5 ? vec3(cos(a) * r, 1.9 + h, sin(a) * r)
                       : vec3(cos(a) * r, 1.9 + abs(sin(a)) * r * 0.62 + h, -6.0 - abs(cos(a)) * 2.0);
  float t = clamp((r - 14.6) / 17.0, 0.0, 1.0);
  vec3 hot = vec3(1.0, 0.82, 0.55), mag = vec3(1.0, 0.36, 0.78), vio = vec3(0.55, 0.42, 1.0), cy = vec3(0.17, 0.94, 1.0);
  vec3 c = t < 0.15 ? mix(hot, mag, t / 0.15) : t < 0.5 ? mix(mag, vio, (t - 0.15) / 0.35) : mix(vio, cy, (t - 0.5) / 0.5);
  float base = aLens < 0.5 ? (0.24 + 0.5 * pow(1.0 - t, 2.0)) : 0.12;
  vA = base * (0.55 + 0.75 * uAct) * (0.75 + 0.5 * rnd);
  vC = c;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * (0.7 + rnd) * uPR * (60.0 / -mv.z), 0.0, 6.0 * uPR);
}`;
const FS = `varying vec3 vC; varying float vA;
void main(){ float s = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); if (s < 0.02) discard; gl_FragColor = vec4(vC, s * s * vA); }`;

export function createCore(THREE, scene, { reduced = false, count = 26000, pr = 1 } = {}) {
  const R0 = 14.8, R1 = 31.5, rng = mulberry32(21);
  const n = count, lensN = Math.round(count * 0.18);
  const disk = new Float32Array((n + lensN) * 4), lens = new Float32Array(n + lensN);
  for (let i = 0; i < n + lensN; i++) {
    const isLens = i >= n;
    const u = rng();
    const r = isLens ? 17 + rng() * 6 : R0 + (R1 - R0) * Math.pow(u, 1.7);   // denser towards the horizon
    disk.set([r, rng() * Math.PI * 2, (rng() - 0.5) * (isLens ? 0.5 : 0.35 + (r - R0) * 0.02), rng()], i * 4);
    lens[i] = isLens ? 1 : 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((n + lensN) * 3), 3));
  geo.setAttribute("aDisk", new THREE.BufferAttribute(disk, 4));
  geo.setAttribute("aLens", new THREE.BufferAttribute(lens, 1));
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSpin: { value: reduced ? 0 : 1 }, uAct: { value: 0 }, uPR: { value: pr }, uSize: { value: 1.5 } } });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  // the event horizon: a black disc on the podium, a hot photon ring and a soft glow
  const horizon = new THREE.Mesh(new THREE.CircleGeometry(12.6, 96), new THREE.MeshBasicMaterial({ color: "#000000" }));
  horizon.rotation.x = -Math.PI / 2; horizon.position.y = 1.74; scene.add(horizon);
  const photon = new THREE.Mesh(new THREE.TorusGeometry(12.9, 0.22, 10, 160), new THREE.MeshBasicMaterial({ color: "#ffd9a0", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  photon.rotation.x = Math.PI / 2; photon.position.y = 1.8; scene.add(photon);
  const halo = new THREE.Mesh(new THREE.RingGeometry(12.9, 16.5, 128), new THREE.MeshBasicMaterial({ color: "#ff5cc8", transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 1.78; scene.add(halo);
  // queued markers (one per persisted queued job, up to 8)
  const markers = Array.from({ length: 8 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshBasicMaterial({ color: "#ffb547" }));
    const a = Math.PI * 0.5 + (i - 3.5) * 0.12;
    m.position.set(Math.cos(a) * (R1 + 1.2), 2.4, Math.sin(a) * (R1 + 1.2)); m.visible = false; scene.add(m); return m;
  });
  const inflows = [], pulses = [];
  let act = 0, actTarget = 0, lastSpawn = -1e9;
  return {
    /** s: coreState(...) */
    set(s) {
      actTarget = s.state === "RUNNING" ? 1 : s.state === "QUEUED" ? 0.35 : 0;
      markers.forEach((m, i) => { m.visible = i < Math.min(8, s.queued || 0); });
      photon.material.color.set(s.state === "FAILED" ? "#ff5d73" : s.state === "SUCCEEDED" ? "#3ee6a0" : "#ffd9a0");
    },
    /** one green/red ring pulse outward from the horizon: a real terminal event */
    pulse(ok, clock) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(13, 0.18, 8, 160), new THREE.MeshBasicMaterial({ color: ok ? "#3ee6a0" : "#ff5d73", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = Math.PI / 2; m.position.y = 2.0; scene.add(m); pulses.push({ m, t0: clock });
    },
    /** particles spiralling from a desk into the disk while that desk's job runs (throttled) */
    feed(from, color, clock) {
      if (clock - lastSpawn < 0.9 || inflows.length > 6) return;
      lastSpawn = clock;
      const a0 = Math.atan2(from.z, from.x), r0 = Math.hypot(from.x, from.z);
      const ptsArr = [];
      for (let k = 0; k <= 24; k++) { const t = k / 24, r = r0 + (R0 + 0.5 - r0) * t, a = a0 + t * 2.2; ptsArr.push(new THREE.Vector3(Math.cos(a) * r, 9 * (1 - t) + 2 * t, Math.sin(a) * r)); }
      const curve = new THREE.CatmullRomCurve3(ptsArr);
      const g = new THREE.BufferGeometry(), N = 90, off = new Float32Array(N);
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      for (let i = 0; i < N; i++) off[i] = Math.random() * 0.4;
      const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.32, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      p.frustumCulled = false; scene.add(p); inflows.push({ p, curve, off, t0: clock, dur: 2.2 });
    },
    tick(clock, dt, reducedNow) {
      act += (actTarget - act) * Math.min(1, dt * 2.5);
      mat.uniforms.uTime.value = clock; mat.uniforms.uAct.value = act; mat.uniforms.uSpin.value = reducedNow ? 0 : 1;
      halo.material.opacity = 0.08 + 0.12 * act;
      let busy = inflows.length > 0 || pulses.length > 0 || Math.abs(act - actTarget) > 1e-3;
      for (let i = inflows.length - 1; i >= 0; i--) {
        const s = inflows[i], t = (clock - s.t0) / s.dur, pos = s.p.geometry.attributes.position;
        for (let k = 0; k < s.off.length; k++) { const q = s.curve.getPoint(Math.min(1, Math.max(0, t * 1.4 - s.off[k]))); pos.setXYZ(k, q.x, q.y, q.z); }
        pos.needsUpdate = true; s.p.material.opacity = t > 1 ? Math.max(0, 1 - (t - 1) * 3) : 0.9;
        if (t > 1.35) { scene.remove(s.p); s.p.geometry.dispose(); inflows.splice(i, 1); }
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const s = pulses[i], t = (clock - s.t0) / 1.6;
        s.m.scale.setScalar(1 + t * 1.4); s.m.material.opacity = 0.9 * (1 - t);
        if (t >= 1) { scene.remove(s.m); s.m.geometry.dispose(); pulses.splice(i, 1); }
      }
      return busy;
    },
    stats: () => ({ particles: n + lensN, activity: +act.toFixed(3), inflows: inflows.length, pulses: pulses.length, queued_markers: markers.filter((m) => m.visible).length }),
    setDensity(k) { mat.uniforms.uSize.value = 1.5 * k; },
  };
}
