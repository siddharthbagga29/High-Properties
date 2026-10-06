import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { BRAIN_C, type Tower } from './layout'
import { live, PALETTE } from './shared'

const MAX_EDGES = 128
const SEG = 36

export const edgeOn = new Float32Array(MAX_EDGES)
export const edgeHi = new Float32Array(MAX_EDGES)

/**
 * Dependencies as light. In the city they arc between rooftops; in the cortex they dive
 * through the middle like white-matter tracts. A pulse travels once the source task is built.
 */
export function Arcs({ towers, taskBrain, links }: { towers: Tower[]; taskBrain: Float32Array; links: [number, number][] }) {
  const { geometry, material } = useMemo(() => {
    const n = Math.min(links.length, MAX_EDGES)
    const pos = new Float32Array(n * SEG * 2 * 3), brain = new Float32Array(n * SEG * 2 * 3), te = new Float32Array(n * SEG * 2 * 2)
    const C = new THREE.Vector3(), B = new THREE.Vector3()
    const qb = (a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3) =>
      out.set(0, 0, 0).addScaledVector(a, (1 - t) ** 2).addScaledVector(c, 2 * (1 - t) * t).addScaledVector(b, t * t)
    let v = 0
    for (let e = 0; e < n; e++) {
      const [i, j] = links[e]
      const a = new THREE.Vector3(towers[i].x, towers[i].h, towers[i].z), b = new THREE.Vector3(towers[j].x, towers[j].h, towers[j].z)
      const ctrl = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 3 + a.distanceTo(b) * 0.24, 0))
      const ab = new THREE.Vector3().fromArray(taskBrain, i * 3), bb = new THREE.Vector3().fromArray(taskBrain, j * 3)
      const bc = ab.clone().add(bb).multiplyScalar(0.5).lerp(new THREE.Vector3(...BRAIN_C), 0.65)
      for (let s = 0; s < SEG; s++) for (const t of [s / SEG, (s + 1) / SEG]) {
        qb(a, ctrl, b, t, C).toArray(pos, v * 3)
        qb(ab, bc, bb, t, B).toArray(brain, v * 3)
        te[v * 2] = t; te[v * 2 + 1] = e
        v++
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aBrain', new THREE.BufferAttribute(brain, 3))
    g.setAttribute('aTE', new THREE.BufferAttribute(te, 2))
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uCity: { value: 0 }, uTime: { value: 0 }, uAssemble: { value: 0 }, uOn: { value: edgeOn }, uHi: { value: edgeHi }, uFocusMix: { value: 0 },
        cActive: { value: PALETTE.active }, cViolet: { value: PALETTE.violet },
      },
      vertexShader: /* glsl */ `
        uniform float uCity, uTime, uAssemble, uFocusMix; uniform float uOn[${MAX_EDGES}]; uniform float uHi[${MAX_EDGES}];
        uniform vec3 cActive, cViolet; attribute vec3 aBrain; attribute vec2 aTE; varying float vA; varying vec3 vC;
        void main(){
          int e = int(aTE.y + 0.5); float t = aTE.x;
          float on = uOn[e], hi = uHi[e];
          float ph = fract(uTime * 0.2 + float(e) * 0.1371);
          float pulse = exp(-pow((t - ph) * 13.0, 2.0)) * on;
          float base = (0.05 + 0.12 * on) * mix(1.0, 0.35, uFocusMix) + 0.3 * hi;
          vA = (base + pulse * (0.75 + hi)) * uAssemble;
          vC = mix(mix(cViolet, cActive, on), vec3(1.0), pulse * 0.55);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(mix(aBrain, position, uCity), 1.0);
        }`,
      fragmentShader: /* glsl */ `varying float vA; varying vec3 vC; void main(){ gl_FragColor = vec4(vC, vA); }`,
    })
    return { geometry: g, material: m }
  }, [towers, taskBrain, links])
  useFrame(() => {
    const u = material.uniforms
    u.uCity.value = live.city
    u.uTime.value = live.time
    u.uAssemble.value = Math.max(0, live.assemble * 1.4 - 0.4)
    u.uFocusMix.value = live.focusMix
  })
  return <lineSegments geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
}
