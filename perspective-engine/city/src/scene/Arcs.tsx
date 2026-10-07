import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { freshEvents } from '../data/model'
import { useStore } from '../store'
import { live, PALETTE } from './shared'
import type { Tower } from './world'

const MAX_EDGES = 128
const SEG = 40
/** Seconds a hand-off pulse takes to travel from the producer to the consumer. */
const TRAVEL = 2.4
export const edgeOn = new Float32Array(MAX_EDGES)
export const edgeHi = new Float32Array(MAX_EDGES)

/**
 * Collaboration made visible: an arc from every task to each task that consumes its output.
 * Arcs between districts rise over the brain. They are static: bright once the source is built.
 * A pulse travels only when a real hand-off is recorded while the page is open
 * (the consumer starts, or the producer is marked done).
 */
export function Arcs({ towers, links }: { towers: Tower[]; links: [number, number][] }) {
  const { geometry, material, from, into } = useMemo(() => {
    const n = Math.min(links.length, MAX_EDGES)
    const pos = new Float32Array(n * SEG * 2 * 3), te = new Float32Array(n * SEG * 2 * 2), pulse = new Float32Array(n * SEG * 2).fill(-1e4)
    const from = new Map<string, number[]>(), into = new Map<string, number[]>()
    const P = new THREE.Vector3()
    let v = 0
    for (let e = 0; e < n; e++) {
      const [i, j] = links[e]
      if (!towers[i] || !towers[j]) { v += SEG * 2; continue }
      from.set(towers[i].id, [...(from.get(towers[i].id) ?? []), e])
      into.set(towers[j].id, [...(into.get(towers[j].id) ?? []), e])
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
    // Pulse start time per vertex (live.time seconds). Written only when a fresh ledger event arrives.
    g.setAttribute('aPulse', new THREE.BufferAttribute(pulse, 1).setUsage(THREE.DynamicDrawUsage))
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uClock: { value: 0 }, uMotion: { value: 1 }, uAssemble: { value: 0 }, uFocusMix: { value: 0 }, uOn: { value: edgeOn }, uHi: { value: edgeHi }, cActive: { value: PALETTE.active }, cViolet: { value: PALETTE.violet } },
      vertexShader: /* glsl */ `
        uniform float uClock, uMotion, uAssemble, uFocusMix; uniform float uOn[${MAX_EDGES}]; uniform float uHi[${MAX_EDGES}];
        uniform vec3 cActive, cViolet; attribute vec2 aTE; attribute float aPulse; varying float vA; varying vec3 vC;
        void main(){
          int e = int(aTE.y + 0.5); float t = aTE.x; float on = uOn[e], hi = uHi[e];
          float age = uClock - aPulse, ph = age / ${TRAVEL.toFixed(1)};
          float pulse = 0.0;
          if (age >= 0.0 && ph < 1.25) {
            // One head with a short tail travels producer → consumer; with reduced motion the arc glows and fades instead.
            float travel = exp(-pow((t - ph) * 10.0, 2.0)) + 0.4 * step(t, ph) * exp(-(ph - t) * 5.0);
            pulse = mix(0.7 * (1.0 - ph / 1.25), travel, uMotion) * (1.0 - smoothstep(1.0, 1.25, ph));
          }
          vA = ((0.04 + 0.08 * on) * mix(1.0, 0.3, uFocusMix) + 0.4 * hi + pulse * (0.6 + hi)) * uAssemble;
          vC = mix(mix(cViolet, cActive, on), vec3(1.0), pulse * 0.5);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `varying float vA; varying vec3 vC; void main(){ gl_FragColor = vec4(vC, vA); }`,
    })
    return { geometry: g, material: m, from, into }
  }, [towers, links])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])

  // A consumer starting, or a producer finishing, while the page is open: one pulse per arc involved.
  useEffect(() => useStore.subscribe((s, p) => {
    if (!s.data || !p.data || s.data === p.data || s.time !== null) return
    const attr = geometry.getAttribute('aPulse') as THREE.BufferAttribute
    let hit = false
    freshEvents(p.data, s.data).forEach((ev, k) => {
      const es = ev.event === 'start' ? into.get(ev.node) : ev.event === 'done' ? from.get(ev.node) : undefined
      es?.forEach(e => {
        const at = live.time + 0.3 + k * 0.4
        for (let v = e * SEG * 2; v < (e + 1) * SEG * 2; v++) attr.array[v] = at
        hit = true
      })
    })
    if (hit) attr.needsUpdate = true
  }), [geometry, from, into])

  useFrame(() => {
    const u = material.uniforms
    u.uClock.value = live.time
    u.uMotion.value = live.motion
    u.uAssemble.value = Math.max(0, live.assemble * 1.4 - 0.4)
    u.uFocusMix.value = live.focusMix
  })
  return <lineSegments geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
}
