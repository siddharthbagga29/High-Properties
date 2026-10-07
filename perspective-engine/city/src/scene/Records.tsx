import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { sfx } from '../audio/sound'
import { atomsOf, fmtTime } from '../data/model'
import type { AtomRecord } from '../data/types'
import { useStore } from '../store'
import { labelLayer } from './portal'
import { live, PALETTE } from './shared'
import type { Tower } from './world'

const TYPE_COLOR: Record<AtomRecord['level4Type'], THREE.Color> = {
  criterion: PALETTE.violet, output: PALETTE.active, input: PALETTE.mote, ledger: new THREE.Color('#ffffff'), gate: PALETTE.violet,
}
const TYPE_LABEL: Record<AtomRecord['level4Type'], string> = { criterion: 'Criterion', output: 'Output', input: 'Input', ledger: 'Ledger', gate: 'Gate' }

/** When a tower is selected, the records it is made of orbit it: criteria, outputs, inputs, ledger lines, gate. */
export function Records({ towers }: { towers: Tower[] }) {
  const focus = useStore(s => s.focus)
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const time = useStore(s => s.time)
  const record = useStore(s => s.record)
  const group = useRef<THREE.Group>(null!)
  const id = focus.kind === 'task' ? focus.id : null
  const ti = data && id ? data.nodes.findIndex(n => n.id === id) : -1
  const atoms = useMemo(() => (data && id && ti >= 0 ? atomsOf(data, id, st, time).slice(0, 14) : []), [data, id, st, time, ti])
  useFrame(() => { if (group.current) group.current.rotation.y = live.motion ? live.time * 0.04 : 0 })
  const t = towers[ti]
  if (!atoms.length || !t || t.id !== id) return null
  return (
    <group position={[t.x, 0, t.z]}>
      <group ref={group}>
        {atoms.map((a, i) => {
          const ang = (i / atoms.length) * Math.PI * 2
          const R = 3.2 + (i % 2) * 0.8
          const y = 0.8 + (i / Math.max(atoms.length - 1, 1)) * (t.h + 1.4)
          return (
            <group key={a.id} position={[Math.cos(ang) * R, y, Math.sin(ang) * R]}>
              <mesh raycast={() => null}>
                <sphereGeometry args={[a.level4Type === 'ledger' ? 0.09 : 0.13, 12, 12]} />
                <meshBasicMaterial color={TYPE_COLOR[a.level4Type].clone().multiplyScalar(2)} toneMapped={false} />
              </mesh>
              <Html portal={labelLayer} zIndexRange={[40, 0]} style={{ transform: 'translate3d(10px,-50%,0)' }}>
                <button className={`atom atom-${a.level4Type} atom-${a.status}${record === a.id ? ' on' : ''}`} style={{ animationDelay: `${i * 45}ms` }}
                  onClick={() => { sfx.click(); useStore.getState().set({ record: record === a.id ? null : a.id }) }} onPointerEnter={() => sfx.hover()}>
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
