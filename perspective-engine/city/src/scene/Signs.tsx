import { Billboard } from '@react-three/drei'
import { type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { sfx } from '../audio/sound'
import { useStore } from '../store'
import { districtCenter, PLATE_R, R_DISTRICT, RING, ringAngle } from './world'

export interface SignStat { agent: string; name: string; district: string; role: string; done: number; total: number; line: string; state: 'working' | 'waiting' | 'idle' | 'ready' }

const W = 640, H = 300

function draw(ctx: CanvasRenderingContext2D, s: SignStat) {
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(10,5,36,0.88)'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = s.state === 'working' ? '#ffffff' : s.state === 'waiting' ? '#a77bff' : 'rgba(43,240,255,0.65)'
  ctx.lineWidth = 4
  ctx.strokeRect(2, 2, W - 4, H - 4)
  ctx.fillStyle = '#2bf0ff'
  ctx.font = '500 22px "IBM Plex Mono", monospace'
  ctx.fillText(s.name.toUpperCase() + '  ·  ' + s.role.split(',')[0].slice(0, 30).toUpperCase(), 28, 50)
  ctx.fillStyle = '#efeee8'
  let size = 84
  ctx.font = `900 ${size}px Archivo, "Helvetica Neue", Arial, sans-serif`
  while (ctx.measureText(s.district.toUpperCase()).width > W - 56 && size > 40) { size -= 4; ctx.font = `900 ${size}px Archivo, "Helvetica Neue", Arial, sans-serif` }
  ctx.fillText(s.district.toUpperCase(), 26, 140)
  // progress bar: one cell per task
  const cw = (W - 56) / Math.max(s.total, 1)
  for (let i = 0; i < s.total; i++) {
    ctx.fillStyle = i < s.done ? '#2bf0ff' : 'rgba(255,255,255,0.14)'
    ctx.fillRect(28 + i * cw, 170, cw - 6, 16)
  }
  ctx.fillStyle = '#a7a4c6'
  ctx.font = '500 22px "IBM Plex Mono", monospace'
  ctx.fillText(`${s.done}/${s.total} TASKS BUILT`, 28, 222)
  ctx.fillStyle = s.state === 'working' ? '#ffffff' : s.state === 'waiting' ? '#bda6ff' : '#a7a4c6'
  ctx.font = '600 26px Archivo, "Helvetica Neue", Arial, sans-serif'
  const dot = s.state === 'working' ? '● ' : ''
  ctx.fillText((dot + s.line).slice(0, 44), 28, 266)
}

function Sign({ s, position }: { s: SignStat; position: [number, number, number] }) {
  const [fontsReady, setFontsReady] = useState(0)
  useEffect(() => { document.fonts?.ready.then(() => setFontsReady(1)).catch(() => undefined) }, [])
  const { tex, ctx } = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return { tex: t, ctx: c.getContext('2d')! }
  }, [])
  useEffect(() => { draw(ctx, s); tex.needsUpdate = true }, [ctx, tex, s, fontsReady])
  const st = useStore.getState
  const onOver = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); if (st().hover?.id !== s.agent) sfx.hover(); st().set({ hover: { kind: 'agent', id: s.agent } }); document.body.style.cursor = 'pointer' }
  const onOut = () => { if (st().hover?.id === s.agent) st().set({ hover: null }); document.body.style.cursor = '' }
  const onClick = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta > 25) return; sfx.dive(); st().select({ kind: 'agent', id: s.agent }) }
  return (
    <group position={position}>
      <mesh position={[0, -position[1] / 2, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.06, 0.06, position[1], 6]} />
        <meshBasicMaterial color="#2bf0ff" transparent opacity={0.35} />
      </mesh>
      <Billboard>
        <mesh onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
          <planeGeometry args={[8.5, 4]} />
          <meshBasicMaterial map={tex} transparent toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  )
}

/** In-world signposts: every district says who works there and what they are doing, readable from any angle. */
export function Signs({ stats }: { stats: SignStat[] }) {
  return (
    <>
      {RING.map((a, i) => {
        const s = stats.find(x => x.agent === a)
        if (!s) return null
        const ang = ringAngle(i), [cx, cz] = districtCenter(a), r = PLATE_R + 1.4
        return <Sign key={a} s={s} position={[cx + Math.cos(ang) * r, 8.5, cz + Math.sin(ang) * r]} />
      })}
    </>
  )
}

export const SIGN_RADIUS = R_DISTRICT + PLATE_R + 1.6
