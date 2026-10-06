import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { sfx } from '../audio/sound'
import { atomsOf, fmtTime } from '../data/model'
import type { AtomRecord } from '../data/types'
import { useStore } from '../store'
import { labelLayer } from './portal'
import type { Tower } from './layout'
import { live, PALETTE } from './shared'

const TYPE_COLOR: Record<AtomRecord['level4Type'], THREE.Color> = {
  criterion: PALETTE.violet, output: PALETTE.active, input: PALETTE.mote, ledger: new THREE.Color('#ffffff'), gate: PALETTE.violet,
}
const TYPE_LABEL: Record<AtomRecord['level4Type'], string> = { criterion: 'Criterion', output: 'Output', input: 'Input', ledger: 'Ledger', gate: 'Gate' }

/** Level 4: the records a tower is made of, orbiting it on a helix. */
export function Atoms({ towers }: { towers: Tower[] }) {
  const focus = useStore(s => s.focus)
  const level = useStore(s => s.level)
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const time = useStore(s => s.time)
  const record = useStore(s => s.record)
  const group = useRef<THREE.Group>(null!)
  const ti = data ? data.nodes.findIndex(n => n.id === focus) : -1
  const atoms = useMemo(() => (data && level === 4 && ti >= 0 ? atomsOf(data, focus, st, time).slice(0, 16) : []), [data, level, focus, st, time, ti])
  useFrame(() => { if (group.current) group.current.rotation.y = live.motion ? live.time * 0.05 : 0 })
  if (!atoms.length || ti < 0) return null
  const t = towers[ti]
  const n = atoms.length
  return (
    <group position={[t.x, 0, t.z]}>
      <group ref={group}>
        {atoms.map((a, i) => {
          const ang = (i / n) * Math.PI * 2
          const R = 3.1 + (i % 2) * 0.7
          const y = 0.7 + (i / Math.max(n - 1, 1)) * (t.h + 1.2)
          const pos: [number, number, number] = [Math.cos(ang) * R, y, Math.sin(ang) * R]
          return (
            <group key={a.id} position={pos}>
              <mesh>
                <sphereGeometry args={[a.level4Type === 'ledger' ? 0.09 : 0.12, 12, 12]} />
                <meshBasicMaterial color={TYPE_COLOR[a.level4Type].clone().multiplyScalar(2)} toneMapped={false} />
              </mesh>
              <Html portal={labelLayer} zIndexRange={[40, 0]} style={{ transform: 'translate3d(10px,-50%,0)' }}>
                <button
                  className={`atom atom-${a.level4Type} atom-${a.status}${record === a.id ? ' on' : ''}`}
                  style={{ animationDelay: `${i * 45}ms` }}
                  onClick={() => { sfx.click(); useStore.getState().set({ record: record === a.id ? null : a.id }) }}
                  onPointerEnter={() => sfx.hover()}
                >
                  <span className="atom-k">{TYPE_LABEL[a.level4Type]}{a.timestamp ? ` · ${fmtTime(a.timestamp)}` : ''}</span>
                  <span className="atom-v">{a.meta.label}</span>
                </button>
              </Html>
            </group>
          )
        })}
      </group>
    </group>
  )
}

interface Comet { from: THREE.Vector3; to: THREE.Vector3; t0: number; agent: number }
export const comets: Comet[] = []

/** New ledger events arrive as white sparks flying in from the edge and settling into their tower. */
export function Incoming() {
  const COUNT = 32
  const { points, trail } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3).fill(-999), 3))
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    const tg = new THREE.BufferGeometry()
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 6).fill(-999), 3))
    const tm = new THREE.LineBasicMaterial({ color: PALETTE.active, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
    return { points: new THREE.Points(g, m), trail: new THREE.LineSegments(tg, tm) }
  }, [])
  const p = useMemo(() => new THREE.Vector3(), [])
  const q = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const pos = points.geometry.attributes.position as THREE.BufferAttribute
    const tr = trail.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < COUNT; i++) {
      const c = comets[i]
      const f = c ? (live.time - c.t0) / 1.6 : 2
      if (!c || f > 1 || f < 0) { pos.setXYZ(i, 0, -999, 0); tr.setXYZ(i * 2, 0, -999, 0); tr.setXYZ(i * 2 + 1, 0, -999, 0); continue }
      const e = 1 - Math.pow(1 - f, 3)
      p.lerpVectors(c.from, c.to, e).y += Math.sin(e * Math.PI) * 6
      q.lerpVectors(c.from, c.to, Math.max(0, e - 0.08)).y += Math.sin(Math.max(0, e - 0.08) * Math.PI) * 6
      pos.setXYZ(i, p.x, p.y, p.z)
      tr.setXYZ(i * 2, p.x, p.y, p.z); tr.setXYZ(i * 2 + 1, q.x, q.y, q.z)
    }
    while (comets.length && live.time - comets[0].t0 > 2) comets.shift()
    pos.needsUpdate = true
    tr.needsUpdate = true
  })
  return <><primitive object={points} /><primitive object={trail} /></>
}
