import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { sfx } from '../audio/sound'
import { clock, lastSignal } from '../data/model'
import { useStore } from '../store'
import { labelLayer } from './portal'
import { live, PALETTE, STALLED, STATUS_COLOR } from './shared'
import { MAX_TASKS, type Tower } from './world'

const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
const edges = new THREE.EdgesGeometry(box)

const vertex = /* glsl */ `
varying vec3 vL; varying vec3 vN; varying vec3 vW;
void main(){ vL = position; vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w; }`

const fragment = /* glsl */ `
uniform float uFill, uTime, uHover, uSel, uStatus, uH, uFresh;
uniform vec3 cA, cB, cGlass, cRose;
varying vec3 vL; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);
  float y = vL.y;
  float filled = step(y, uFill);
  float floorsY = fract(y * uH / 0.45);
  float side = abs(vN.y) < 0.5 ? 1.0 : 0.0;
  float u = abs(vN.x) > 0.5 ? vL.z : vL.x;
  float win = step(0.25, floorsY) * step(floorsY, 0.8) * step(0.18, fract((u + 0.5) * 3.0)) * step(fract((u + 0.5) * 3.0), 0.82) * side;
  vec3 glass = cGlass * (0.35 + 0.7 * fres);
  vec3 lit = mix(cA * 0.3, cA * 0.95, win) + cB * fres * 0.45;
  vec3 col = mix(glass, lit, filled);
  float front = (1.0 - smoothstep(0.0, 0.03, abs(y - uFill))) * step(uStatus, 2.5) * step(1.5, uStatus);
  col += vec3(1.0, 0.85, 0.6) * front * (0.9 + 0.5 * sin(uTime * 3.0));
  col += cA * (uHover * 0.35 + uSel * 0.25) + vec3(1.0) * uFresh * 0.8;
  if (uStatus > 4.5 && uStatus < 5.5) col = mix(col, cRose, 0.6);
  // Stalled: half-built like running, but unlit and with no construction front. Nobody is on it.
  if (uStatus > 5.5) col *= 0.55;
  float ghost = uStatus < 0.5 ? 0.14 : (uStatus < 1.5 ? 0.24 : 0.5);
  float alpha = mix(ghost + fres * 0.3, 1.0, filled);
  gl_FragColor = vec4(col, alpha);
}`

/** Every task is a tower. Height = token budget it planned. Fill = how far it has got. */
export function Towers({ towers }: { towers: Tower[] }) {
  return <>{towers.map((t, i) => <TowerMesh key={t.id} t={t} index={i} />)}</>
}

/** Fill per status. Running (and stalled) is drawn half-built: the real record says "in progress", not a percentage. */
const FILL = [0, 0.06, 0.5, 1, 1, 0.12, 0.5]

function TowerMesh({ t, index }: { t: Tower; index: number }) {
  const group = useRef<THREE.Group>(null!)
  const spring = useRef({ y: 1, v: 0 })
  const fill = useRef(0)
  const color = useMemo(() => new THREE.Color(), [])
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vertex, fragmentShader: fragment, transparent: true,
    uniforms: { uFill: { value: 0 }, uTime: { value: 0 }, uHover: { value: 0 }, uSel: { value: 0 }, uStatus: { value: 0 }, uH: { value: t.h }, uFresh: { value: 0 },
      cA: { value: PALETTE.active.clone() }, cB: { value: PALETTE.violet.clone() }, cGlass: { value: PALETTE.glass }, cRose: { value: PALETTE.rose } },
  }), [t.h])
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: PALETTE.active, transparent: true, opacity: 0.6 }), [])
  useEffect(() => () => { material.dispose(); lineMat.dispose() }, [material, lineMat])

  useFrame((_, dt) => {
    const s = useStore.getState()
    const st = index < MAX_TASKS ? live.status[index] : 0
    const u = material.uniforms
    const target = FILL[Math.round(st)] ?? 0
    fill.current += (target - fill.current) * (1 - Math.exp(-dt * 3))
    u.uFill.value = fill.current
    u.uStatus.value = st
    u.uTime.value = live.time
    u.uFresh.value = live.fresh[index]
    color.set(STATUS_COLOR[Math.round(st)] ?? STATUS_COLOR[0])
    ;(u.cA.value as THREE.Color).copy(color)
    const hov = s.hover?.kind === 'task' && s.hover.id === t.id ? 1 : 0
    const sel = s.focus.kind === 'task' && s.focus.id === t.id ? 1 : 0
    u.uHover.value += (hov - u.uHover.value) * (1 - Math.exp(-dt * 10))
    u.uSel.value += (sel - u.uSel.value) * (1 - Math.exp(-dt * 6))
    // spring (stiffness 220, damping 26) on the tower's height scale: a tactile bounce on click and hover
    const goal = (st === 5 ? 0.18 : 1) * (1 + hov * 0.05)
    const sp = spring.current
    sp.v += (220 * (goal - sp.y) - 26 * sp.v) * Math.min(dt, 0.033)
    sp.y += sp.v * Math.min(dt, 0.033)
    group.current.scale.set(t.w, t.h * Math.max(sp.y, 0.05) * Math.min(1, live.assemble * 1.4), t.w)
    lineMat.opacity = (st === 0 ? 0.35 : st === STALLED ? 0.4 : 0.65) * (live.visible[index] ? 1 : 0.15)
    lineMat.color.copy(color)
    material.opacity = live.visible[index] ? 1 : 0.2
    group.current.visible = live.assemble > 0.05
  })

  const st = useStore.getState
  const onOver = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); if (st().hover?.id !== t.id) sfx.hover(); st().set({ hover: { kind: 'task', id: t.id } }); document.body.style.cursor = 'pointer' }
  const onOut = () => { if (st().hover?.id === t.id) st().set({ hover: null }); document.body.style.cursor = '' }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > 25) return
    spring.current.v -= 6
    sfx.pluck(index)
    st().select({ kind: 'task', id: t.id })
  }
  return (
    <group position={[t.x, 0, t.z]} rotation-y={-t.angle}>
      <group ref={group}>
        <mesh geometry={box} material={material} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick} />
        <lineSegments geometry={edges} material={lineMat} raycast={() => null} />
      </group>
    </group>
  )
}

const TAG: Record<string, [string, string]> = {
  done: ['BUILT', '#2bf0ff'], working: ['WORKING', '#ffb547'], stalled: ['STALLED', '#c9bca9'], awaiting_human: ['NEEDS FOUNDER', '#bda6ff'],
  ready: ['READY', '#8fe6ff'], pending: ['PLANNED', '#a7a4c6'], blocked: ['BLOCKED', '#ff4d7a'],
}

/** In an agent's view every tower in its district says which task it is and where it stands. */
export function TowerTags({ towers, run, at }: { towers: Tower[]; run: Map<string, 'working' | 'stalled'>; at: number }) {
  const focus = useStore(s => s.focus)
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  if (!data || focus.kind !== 'agent') return null
  const byId = new Map(data.nodes.map(n => [n.id, n]))
  return (
    <>
      {towers.map(t => {
        const n = byId.get(t.id)
        if (!n || t.agent !== focus.id) return null
        const s = st.get(n.id) ?? 'pending'
        const key = s === 'running' ? run.get(n.id) ?? 'stalled' : s
        const [word, color] = TAG[key] ?? TAG.pending
        const since = key === 'stalled' ? lastSignal(data, n.id, at) : null
        return (
          <group key={t.id} position={[t.x, t.h * (s === 'blocked' ? 0.18 : 1) + 0.5, t.z]}>
            <Html portal={labelLayer} zIndexRange={[20, 0]} style={{ transform: 'translate3d(-50%,-100%,0)' }}>
              <button className="tower-tag" tabIndex={-1} onClick={() => { sfx.click(); useStore.getState().select({ kind: 'task', id: n.id }) }}
                style={{ pointerEvents: 'auto', cursor: 'pointer', display: 'grid', gap: 1, width: 'max-content', maxWidth: 170, padding: '3px 7px', textAlign: 'left',
                  background: 'rgba(10,5,36,0.82)', border: `1px solid ${color}66`, borderRadius: 3, color: '#efeee8', font: '500 11px/1.35 var(--mono)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.id} · {n.title}</span>
                <span style={{ color, fontWeight: 600, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{word}{since ? ` SINCE ${clock(since).slice(0, 5)}` : ''}</span>
              </button>
            </Html>
          </group>
        )
      })}
    </>
  )
}
