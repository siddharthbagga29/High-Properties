import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { BRAIN_C, MAX_TASKS, type ParticleOutput, type Tower } from './layout'
import { live, PALETTE, SNOISE } from './shared'

const vertex = /* glsl */ `
uniform float uTime, uAssemble, uCity, uSize, uPR, uMotion, uFocusTask, uFocusDistrict, uFocusMix, uMouseR, uMouseOn;
uniform vec3 uMouse, uBrainC;
uniform float uStatus[${MAX_TASKS}];
uniform float uProgress[${MAX_TASKS}];
uniform float uVisible[${MAX_TASKS}];
uniform float uFresh[${MAX_TASKS}];
uniform float uH[${MAX_TASKS}];
uniform vec3 cIdle, cActive, cViolet, cRose, cMote;
attribute vec3 aBrain;
attribute vec3 aScatter;
attribute vec4 aInfo;
attribute vec2 aInfo2;
varying vec3 vColor;
varying float vAlpha;
${SNOISE}
void main() {
  float kind = aInfo.z;
  float rnd = aInfo.w;
  int ti = int(aInfo.x + 0.5);
  vec3 city = position;
  vec3 col = cActive;
  float alpha = 1.0;
  float size = 1.0;
  float h = aInfo2.x;
  float edge = aInfo2.y;

  if (kind < 0.5) {
    float st = uStatus[ti];
    float H = uH[ti];
    if (st < 0.5) {                      // planned: only the outline stands
      if (edge < 0.5) city.y = 0.03 + rnd * 0.06;
      col = mix(cIdle, cViolet, 0.5); alpha = edge > 0.5 ? 0.45 : 0.28;
    } else if (st < 1.5) {               // ready: the plot is surveyed
      if (edge < 0.5) city.y = 0.03 + rnd * 0.08;
      col = mix(cIdle, cActive, 0.6); alpha = edge > 0.5 ? 0.75 : 0.32;
    } else if (st < 2.5) {               // building: a construction front climbs
      float p = uProgress[ti];
      if (h > p) {
        float lift = h - p;
        city.y = p * H + lift * H * 0.8 + sin(uTime * 1.4 + rnd * 40.0) * 0.6 * lift;
        col = mix(cViolet, vec3(1.0), 0.12); alpha = 0.3 + 0.35 * rnd;
      } else {
        col = mix(cActive, cViolet, 0.3); alpha = 0.85;
      }
      float front = 1.0 - smoothstep(0.0, 0.045, abs(h - p));
      col = mix(col, vec3(1.0), front); alpha = max(alpha, front); size += front * 1.3;
    } else if (st < 3.5) {               // built
      col = mix(cActive, vec3(1.0), 0.1 + edge * 0.3); alpha = 0.78 + edge * 0.22;
    } else if (st < 4.5) {               // prepared, waiting on the founder: violet beacon
      float pulse = 0.6 + 0.4 * sin(uTime * 2.2);
      col = mix(cViolet, cActive, 0.25 * pulse); alpha = 0.7 + 0.3 * pulse;
      if (rnd > 0.982) { city.y = H + mod(uTime * 1.1 + rnd * 97.0, 7.0); col = mix(cViolet, vec3(1.0), 0.45); alpha = 0.95; }
    } else {                             // blocked: rubble
      city.y = city.y * 0.1 + rnd * 0.25;
      city.x += (rnd - 0.5) * 0.9; city.z += (fract(rnd * 13.0) - 0.5) * 0.9;
      col = cRose * 0.85; alpha = 0.6;
    }
    float fresh = uFresh[ti];
    col = mix(col, vec3(1.0), fresh * 0.85); size += fresh * 1.6;
    alpha *= mix(0.06, 1.0, uVisible[ti]);
    float isF = uFocusTask >= 0.0 ? step(abs(float(ti) - uFocusTask), 0.5)
              : (uFocusDistrict >= 0.0 ? step(abs(aInfo.y - uFocusDistrict), 0.5) : 1.0);
    alpha *= mix(1.0, mix(0.14, 1.0, isF), uFocusMix);
  } else if (kind < 1.5) {               // district ground: a survey grid
    col = mix(cIdle, cActive, 0.24); alpha = 0.3; size = 0.8;
    float isF = uFocusDistrict >= 0.0 ? step(abs(aInfo.y - uFocusDistrict), 0.5) : 1.0;
    alpha *= mix(1.0, mix(0.35, 1.25, isF), uFocusMix);
  } else if (kind < 2.5) {               // streets: information traffic
    float along = aInfo2.y < 0.5 ? city.x : city.z;
    along = mod(along + 25.5 + uTime * (1.2 + rnd * 2.6) * uMotion, 51.0) - 25.5;
    if (aInfo2.y < 0.5) city.x = along; else city.z = along;
    col = mix(cActive, cViolet, step(0.72, rnd)); alpha = 0.32 + 0.38 * uCity; size = 0.9;
  } else {                               // haze
    col = cMote; alpha = 0.1 + 0.1 * rnd; size = 0.7 + rnd;
    city.y += sin(uTime * 0.2 + rnd * 50.0) * 0.4 * uMotion;
  }

  vec3 form = mix(aBrain, city, uCity);
  float a = clamp(uAssemble * 1.5 - rnd * 0.5, 0.0, 1.0);
  a = a * a * (3.0 - 2.0 * a);
  vec3 pos = mix(aScatter, form, a);

  float tn = uTime * 0.06;
  vec3 q = pos * 0.09;
  float amp = uMotion * (0.14 + (1.0 - a) * 1.6) * (kind < 0.5 ? mix(1.0, 0.25, uCity) : 1.0);
  pos += amp * vec3(snoise(q + vec3(tn, 0.0, 0.0)), snoise(q + vec3(0.0, tn + 31.7, 0.0)), snoise(q + vec3(0.0, 0.0, tn + 57.3)));

  pos = mix(pos, uBrainC + (pos - uBrainC) * (1.0 + 0.014 * sin(uTime * 0.9)), (1.0 - uCity) * uMotion);

  vec3 dm = pos - uMouse;
  float dl = length(dm);
  pos += (dl > 0.001 ? dm / dl : vec3(0.0)) * uMouseOn * uMouseR * 0.6 * (1.0 - smoothstep(0.0, uMouseR, dl));

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * size * uPR * (55.0 / -mv.z), 0.0, 14.0 * uPR);
  vColor = col;
  vAlpha = alpha * (0.25 + 0.75 * a);
}`

const fragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float s = smoothstep(0.5, 0.0, d);
  s *= s;
  if (s < 0.01) discard;
  gl_FragColor = vec4(vColor, s * vAlpha);
}`

export function Cortex({ buf, towers }: { buf: ParticleOutput; towers: Tower[] }) {
  const pr = useThree(s => s.viewport.dpr)
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(buf.city, 3))
    g.setAttribute('aBrain', new THREE.BufferAttribute(buf.brain, 3))
    g.setAttribute('aScatter', new THREE.BufferAttribute(buf.scatter, 3))
    g.setAttribute('aInfo', new THREE.BufferAttribute(buf.info, 4))
    g.setAttribute('aInfo2', new THREE.BufferAttribute(buf.info2, 2))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6, 0), 120)
    return g
  }, [buf])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(() => {
    const heights = new Float32Array(MAX_TASKS)
    towers.forEach((t, i) => { if (i < MAX_TASKS) heights[i] = t.h })
    return new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uAssemble: { value: 0 }, uCity: { value: 0 }, uSize: { value: 1.25 }, uPR: { value: 1 },
        uMotion: { value: 1 }, uFocusTask: { value: -1 }, uFocusDistrict: { value: -1 }, uFocusMix: { value: 0 },
        uMouse: { value: live.mouse }, uMouseR: { value: 2 }, uMouseOn: { value: 0 },
        uBrainC: { value: new THREE.Vector3(...BRAIN_C) },
        uStatus: { value: live.status }, uProgress: { value: live.progress }, uVisible: { value: live.visible },
        uFresh: { value: live.fresh }, uH: { value: heights },
        cIdle: { value: PALETTE.idle }, cActive: { value: PALETTE.active }, cViolet: { value: PALETTE.violet },
        cRose: { value: PALETTE.rose }, cMote: { value: PALETTE.mote },
      },
    })
  }, [towers])
  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    const u = material.uniforms
    u.uTime.value = live.time
    u.uAssemble.value = live.assemble
    u.uCity.value = live.city
    u.uPR.value = pr
    u.uMotion.value = live.motion
    u.uFocusTask.value = live.focusTask
    u.uFocusDistrict.value = live.focusDistrict
    u.uFocusMix.value = live.focusMix
    u.uMouseR.value = live.mouseR
    u.uMouseOn.value = live.mouseOn
  })

  return <points geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
}
