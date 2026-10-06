import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { live, PALETTE } from './shared'
import type { Tower } from './world'

const MAX_EDGES = 128
const SEG = 40
export const edgeOn = new Float32Array(MAX_EDGES)
export const edgeHi = new Float32Array(MAX_EDGES)

/**
 * Collaboration made visible: an arc from every task to each task that consumes its output.
 * Arcs between districts rise over the brain. A pulse travels once the source task is built.
 */
export function Arcs({ towers, links }: { towers: Tower[]; links: [number, number][] }) {
  const { geometry, material } = useMemo(() => {
    const n = Math.min(links.length, MAX_EDGES)
    const pos = new Float32Array(n * SEG * 2 * 3), te = new Float32Array(n * SEG * 2 * 2)
    const P = new THREE.Vector3()
    let v = 0
    for (let e = 0; e < n; e++) {
      const [i, j] = links[e]
      const a = new THREE.Vector3(towers[i].x, towers[i].h, towers[i].z), b = new THREE.Vector3(towers[j].x, towers[j].h, towers[j].z)
      const same = towers[i].agent === towers[j].agent
      const mid = a.clone().add(b).multiplyScalar(0.5)
      const ctrl = same ? mid.add(new THREE.Vector3(0, 2.5, 0)) : mid.multiplyScalar(0.35).add(new THREE.Vector3(0, 9 + a.distanceTo(b) * 0.18, 0))
      for (let s = 0; s < SEG; s++) for (const t of [s / SEG, (s + 1) / SEG]) {
        P.set(0, 0, 0).addScaledVector(a, (1 - t) ** 2).addScaledVector(ctrl, 2 * (1 - t) * t).addScaledVector(b, t * t)
        P.toArray(pos, v * 3)
        te[v * 2] = t; te[v * 2 + 1] = e
        v++
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aTE', new THREE.BufferAttribute(te, 2))
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAssemble: { value: 0 }, uFocusMix: { value: 0 }, uOn: { value: edgeOn }, uHi: { value: edgeHi }, cActive: { value: PALETTE.active }, cViolet: { value: PALETTE.violet } },
      vertexShader: /* glsl */ `
        uniform float uTime, uAssemble, uFocusMix; uniform float uOn[${MAX_EDGES}]; uniform float uHi[${MAX_EDGES}];
        uniform vec3 cActive, cViolet; attribute vec2 aTE; varying float vA; varying vec3 vC;
        void main(){
          int e = int(aTE.y + 0.5); float t = aTE.x; float on = uOn[e], hi = uHi[e];
          float ph = fract(uTime * 0.18 + float(e) * 0.1371);
          float pulse = exp(-pow((t - ph) * 12.0, 2.0)) * on;
          vA = ((0.04 + 0.08 * on) * mix(1.0, 0.3, uFocusMix) + 0.4 * hi + pulse * (0.5 + hi)) * uAssemble;
          vC = mix(mix(cViolet, cActive, on), vec3(1.0), pulse * 0.5);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `varying float vA; varying vec3 vC; void main(){ gl_FragColor = vec4(vC, vA); }`,
    })
    return { geometry: g, material: m }
  }, [towers, links])
  useFrame(() => {
    const u = material.uniforms
    u.uTime.value = live.time * (live.motion || 0.3)
    u.uAssemble.value = Math.max(0, live.assemble * 1.4 - 0.4)
    u.uFocusMix.value = live.focusMix
  })
  return <lineSegments geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
}
