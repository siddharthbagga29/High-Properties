import { Billboard } from '@react-three/drei'
import { type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { sfx } from '../audio/sound'
import { useStore } from '../store'
import { districtCenter, R_DISTRICT, RING, ringAngle } from './world'

export interface SignStat {
  agent: string
  /** What the agent does ("Research") and who it is ("Curie"): the one naming used everywhere. */
  dept: string
  name: string
  done: number
  total: number
  /** One entry per task: its status, with running split into working and stalled. */
  cells: string[]
  state: 'working' | 'stalled' | 'waiting' | 'idle' | 'ready'
}

const W = 640, H = 256
/** Plane size in world units, same aspect as the canvas. */
const PW = 7.6, PH = (PW * H) / W
/** Signpost: just inside the plate rim on the outer side of the district, clear of the towers. */
const SIGN_R = 6.6, SIGN_Y = 8
const BORDER = { working: '#ffb547', stalled: '#8a7d6c', waiting: '#a77bff', ready: 'rgba(43,240,255,0.65)', idle: 'rgba(43,240,255,0.45)' }
const CELL: Record<string, string> = {
  done: '#2bf0ff', awaiting_human: '#a77bff', working: '#ffb547', stalled: '#8a7d6c', ready: 'rgba(143,230,255,0.38)', pending: 'rgba(255,255,255,0.16)', blocked: '#ff4d7a',
}
const ORDER = ['done', 'awaiting_human', 'working', 'stalled', 'ready', 'pending', 'blocked']
const fit = (ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number) => {
  let size = max
  ctx.font = `${weight} ${size}px Archivo, "Helvetica Neue", Arial, sans-serif`
  while (ctx.measureText(text).width > W - 52 && size > min) { size -= 2; ctx.font = `${weight} ${size}px Archivo, "Helvetica Neue", Arial, sans-serif` }
}

/** Only what reads from across the city: the department, the agent and a progress bar (one cell per task). */
function draw(ctx: CanvasRenderingContext2D, s: SignStat) {
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(10,5,36,0.9)'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = BORDER[s.state]
  ctx.lineWidth = 6
  ctx.strokeRect(3, 3, W - 6, H - 6)
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#efeee8'
  fit(ctx, s.dept.toUpperCase(), 900, 88, 64)
  ctx.fillText(s.dept.toUpperCase(), 26, 94)
  ctx.fillStyle = '#8fe6ff'
  fit(ctx, s.name.toUpperCase(), 600, 64, 64)
  ctx.fillText(s.name.toUpperCase(), 26, 172)
  const cells = [...s.cells].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
  const cw = (W - 52) / Math.max(cells.length, 1)
  cells.forEach((c, i) => {
    ctx.fillStyle = CELL[c] ?? CELL.pending
    ctx.fillRect(26 + i * cw, 200, cw - 8, 28)
  })
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
  // Redraw (and re-upload the texture) only when what the sign shows changes.
  const key = `${s.dept}|${s.name}|${s.state}|${s.cells.join(',')}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { draw(ctx, s); tex.needsUpdate = true }, [ctx, tex, key, fontsReady])
  useEffect(() => () => tex.dispose(), [tex])
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
          <planeGeometry args={[PW, PH]} />
          <meshBasicMaterial map={tex} transparent toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  )
}

/** In-world signposts: every district says what it does and who works there, readable from any angle. */
export function Signs({ stats }: { stats: SignStat[] }) {
  return (
    <>
      {RING.map((a, i) => {
        const s = stats.find(x => x.agent === a)
        if (!s) return null
        const ang = ringAngle(i), [cx, cz] = districtCenter(a)
        return <Sign key={a} s={s} position={[cx + Math.cos(ang) * SIGN_R, SIGN_Y, cz + Math.sin(ang) * SIGN_R]} />
      })}
    </>
  )
}

export const SIGN_RADIUS = R_DISTRICT + SIGN_R + PW / 2
