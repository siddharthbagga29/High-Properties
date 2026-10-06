import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { sfx } from '../audio/sound'
import { useStore } from '../store'
import { labelLayer } from './portal'
import { AGENTS, BRAIN_C, districtCenter, type Tower } from './layout'
import { live, PALETTE } from './shared'

export const workerPos: Record<string, THREE.Vector3> = Object.fromEntries(AGENTS.map(a => [a, new THREE.Vector3(0, 8, 0)]))

const SPARKS = 14

/** The nine agents as luminous workers: they hover over the tower they are building and patrol when idle. */
export function Workers({ towers, lobes }: { towers: Tower[]; lobes: Float32Array }) {
  return <>{AGENTS.map((a, i) => <Worker key={a} agent={a} index={i} towers={towers} lobes={lobes} />)}</>
}

function Worker({ agent, index, towers, lobes }: { agent: string; index: number; towers: Tower[]; lobes: Float32Array }) {
  const group = useRef<THREE.Group>(null!)
  const core = useRef<THREE.Mesh>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  const tag = useRef<HTMLDivElement>(null!)
  const name = useStore(s => s.data?.agents[agent]?.name ?? agent)
  const brainHome = useMemo(() => {
    const c = new THREE.Vector3().fromArray(lobes, index * 3)
    const bc = new THREE.Vector3(...BRAIN_C)
    return agent === 'orchestrator' ? c.clone().add(new THREE.Vector3(0, 3.2, 0)) : c.clone().add(c.clone().sub(bc).normalize().multiplyScalar(2.4))
  }, [lobes, index, agent])
  const [cx, cz] = districtCenter(agent)
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const target = useMemo(() => new THREE.Vector3(), [])

  const beam = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    const m = new THREE.LineBasicMaterial({ color: PALETTE.active, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    return new THREE.Line(g, m)
  }, [])
  const sparks = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3))
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    return new THREE.Points(g, m)
  }, [])

  useFrame((_, dt) => {
    const { data, st, focus, hover, workerView } = useStore.getState()
    if (!data) return
    const t = live.time
    const mine = towers.map((tw, i) => ({ tw, n: data.nodes[i] })).filter(x => x.n.agent === agent)
    const building = mine.find(x => st.get(x.n.id) === 'running')
    const ready = mine.find(x => st.get(x.n.id) === 'ready')
    const waiting = mine.some(x => st.get(x.n.id) === 'awaiting_human')
    const ph = t * 0.3 + index * 0.7
    if (building) {
      const tw = building.tw
      target.set(tw.x + Math.cos(t * 1.4 + index) * 0.9, tw.h + 1.7 + Math.sin(t * 2.1) * 0.25, tw.z + Math.sin(t * 1.4 + index) * 0.9)
    } else if (ready) {
      target.set(ready.tw.x + Math.cos(ph * 2) * 1.2, 1.6 + Math.sin(t * 1.7 + index) * 0.2, ready.tw.z + Math.sin(ph * 2) * 1.2)
    } else {
      target.set(cx + Math.cos(ph) * 4.8, 2.6 + Math.sin(t * 0.9 + index) * 0.35, cz + Math.sin(ph) * 4.8)
    }
    tmp.copy(brainHome).add(new THREE.Vector3(Math.cos(ph) * 0.4, Math.sin(t + index) * 0.3, Math.sin(ph) * 0.4))
    const want = tmp.lerp(target, live.city)
    const a = Math.max(0, live.assemble * 1.6 - 0.6)
    group.current.position.lerp(want, 1 - Math.exp(-dt * 3))
    group.current.scale.setScalar(a * (hover?.id === agent || (focus === agent && workerView) ? 1.35 : 1))
    workerPos[agent].copy(group.current.position)

    const mat = core.current.material as THREE.MeshBasicMaterial
    mat.color.copy(building ? PALETTE.active : waiting ? PALETTE.violet : PALETTE.mote).multiplyScalar(building ? 2.2 : 1.3)
    ring.current.rotation.set(t * 0.7 + index, t * 0.5, 0)

    const showBeam = building && live.city > 0.5
    const pos = beam.geometry.attributes.position as THREE.BufferAttribute
    if (building) {
      pos.setXYZ(0, group.current.position.x, group.current.position.y, group.current.position.z)
      pos.setXYZ(1, building.tw.x, building.tw.h * 0.6, building.tw.z)
      pos.needsUpdate = true
      const sp = sparks.geometry.attributes.position as THREE.BufferAttribute
      for (let k = 0; k < SPARKS; k++) {
        const f = (t * 0.8 + k / SPARKS) % 1
        sp.setXYZ(k,
          THREE.MathUtils.lerp(group.current.position.x, building.tw.x, f) + Math.sin(k * 7 + t * 3) * 0.12,
          THREE.MathUtils.lerp(group.current.position.y, building.tw.h * 0.6, f),
          THREE.MathUtils.lerp(group.current.position.z, building.tw.z, f) + Math.cos(k * 5 + t * 3) * 0.12)
      }
      sp.needsUpdate = true
    }
    ;(beam.material as THREE.LineBasicMaterial).opacity = showBeam ? 0.55 : 0
    ;(sparks.material as THREE.PointsMaterial).opacity = showBeam ? 0.9 : 0

    if (tag.current) {
      const lvl = useStore.getState().level
      tag.current.style.opacity = String(live.city > 0.6 && lvl >= 2 && a > 0.9 ? 1 : 0)
      tag.current.dataset.state = building ? 'building' : waiting ? 'waiting' : ready ? 'ready' : 'idle'
      const label = building ? `building ${building.n.id}` : waiting ? 'waiting on founder' : ready ? `next ${ready.n.id}` : 'idle'
      if (tag.current.lastChild && tag.current.lastChild.textContent !== label) tag.current.lastChild.textContent = label
    }
  })

  const onOver = (e: { stopPropagation: () => void }) => { e.stopPropagation(); useStore.getState().set({ hover: { kind: 'worker', id: agent } }); sfx.hover(); document.body.style.cursor = 'pointer' }
  const onOut = () => { if (useStore.getState().hover?.id === agent) useStore.getState().set({ hover: null }); document.body.style.cursor = '' }
  const onClick = (e: { stopPropagation: () => void }) => { e.stopPropagation(); sfx.dive(); useStore.getState().dive(agent, { worker: true }) }

  return (
    <>
      <group ref={group}>
        <mesh ref={core}>
          <icosahedronGeometry args={[0.32, 1]} />
          <meshBasicMaterial toneMapped={false} />
        </mesh>
        <mesh ref={ring}>
          <torusGeometry args={[0.62, 0.012, 6, 48]} />
          <meshBasicMaterial color={PALETTE.active} transparent opacity={0.7} toneMapped={false} />
        </mesh>
        <mesh onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
          <sphereGeometry args={[1.1, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
        <Html portal={labelLayer} center position={[0, 1.05, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div ref={tag} className="worker-tag" style={{ opacity: 0 }}>
            <b>{name}</b>
            <span>idle</span>
          </div>
        </Html>
      </group>
      <primitive object={beam} />
      <primitive object={sparks} />
    </>
  )
}
