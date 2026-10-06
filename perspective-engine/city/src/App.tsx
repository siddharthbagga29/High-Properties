import { AnimatePresence } from 'framer-motion'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { hush, sfx } from './audio/sound'
import { startLive } from './data/live'
import { workingNow } from './data/model'
import { labelLayer } from './scene/portal'
import { live } from './scene/shared'
import { RING } from './scene/world'
import { focusKey, parseFocus, persist, useStore } from './store'
import { AskBar, Gate, HintChip, MiniMap, Replay, Toasts, TopBar } from './ui/Chrome'
import { Drawer } from './ui/Drawer'
import { Help, Index, Pilot, Search } from './ui/Panels'

const Scene = lazy(() => import('./scene/Scene'))

function hasWebGL() {
  try { return !!document.createElement('canvas').getContext('webgl2') } catch { return false }
}

const useHint = (k: string) => {
  const s = useStore.getState()
  if (!s.hintsUsed.includes(k)) s.set({ hintsUsed: [...s.hintsUsed, k] })
}

function useDeepLink() {
  const data = useStore(s => s.data)
  const applied = useRef(false)
  useEffect(() => {
    if (!data || applied.current) return
    applied.current = true
    const f = parseFocus(location.hash.replace(/^#/, ''), data)
    if (f) { useStore.getState().set({ introDone: true }); useStore.getState().select(f) }
  }, [data])
  useEffect(() => useStore.subscribe((s, p) => {
    if (focusKey(s.focus) === focusKey(p.focus)) return
    const h = '#' + focusKey(s.focus)
    if (location.hash !== h) try { history.replaceState(null, '', h) } catch { /* sandboxed */ }
  }), [])
}

function useKeys() {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      live.idle = 0
      const s = useStore.getState()
      const typing = (e.target as HTMLElement)?.closest('input, textarea, select')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); s.set({ panel: s.panel === 'search' ? 'none' : 'search' }); return }
      if (e.key === 'Escape') {
        if (s.panel !== 'none') return s.set({ panel: 'none' })
        if (typing) return (e.target as HTMLElement).blur()
        sfx.dive(); s.back(); return
      }
      if (typing) return
      if (e.key === 'Home') { sfx.dive(); s.select({ kind: 'world' }) }
      if (e.key === '/') { e.preventDefault(); document.getElementById('askbar-q')?.focus() }
      if (e.key === '?') s.set({ panel: 'help' })
      if (e.key.toLowerCase() === 'l') { const next = !s.sound; s.set({ sound: next }); persist('pe.sound', next ? '1' : '0') }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const cur = s.focus.kind === 'agent' ? RING.indexOf(s.focus.id as (typeof RING)[number]) : -1
        const n = (cur + (e.key === 'ArrowRight' ? 1 : RING.length - 1) + (cur < 0 && e.key === 'ArrowLeft' ? 1 : 0)) % RING.length
        sfx.dive(); s.select({ kind: 'agent', id: RING[n] })
      }
    }
    const wake = () => { live.idle = 0 }
    const wheel = () => { live.idle = 0; useHint('scroll') }
    let down: { x: number; y: number } | null = null
    const pd = (e: PointerEvent) => { live.idle = 0; down = { x: e.clientX, y: e.clientY } }
    const pm = (e: PointerEvent) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 30 && (e.target as HTMLElement).tagName === 'CANVAS') useHint('drag') }
    const pu = () => { down = null }
    window.addEventListener('keydown', key)
    window.addEventListener('wheel', wheel, { passive: true })
    window.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)
    window.addEventListener('pointermove', wake, { passive: true })
    return () => {
      window.removeEventListener('keydown', key); window.removeEventListener('wheel', wheel)
      window.removeEventListener('pointerdown', pd); window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu)
      window.removeEventListener('pointermove', wake)
    }
  }, [])
}

export default function App() {
  useDeepLink()
  useKeys()
  const webgl = useStore(s => s.webgl)
  const sound = useStore(s => s.sound)
  const introDone = useStore(s => s.introDone)
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const [showScene, setShowScene] = useState(false)
  const drawer = useRef<HTMLDivElement>(null)

  useEffect(() => startLive(), [])
  useEffect(() => {
    const ok = hasWebGL()
    useStore.getState().set({ webgl: ok })
    if (ok) {
      // Three.js loads after first paint: the headline and the explanation never wait for WebGL.
      const go = () => setShowScene(true)
      const idle = () => ('requestIdleCallback' in window ? (window as unknown as { requestIdleCallback: (f: () => void, o: object) => void }).requestIdleCallback(go, { timeout: 900 }) : setTimeout(go, 300))
      document.readyState === 'complete' ? idle() : addEventListener('load', idle, { once: true })
    }
  }, [])
  useEffect(() => { if (sound && introDone) sfx.enable(); else { sfx.disable(); hush() } }, [sound, introDone])
  useEffect(() => useStore.subscribe((s, p) => { if (s.bump !== p.bump) useHint('click') }), [])
  // The tab title says who is working, so a background tab still shows life.
  useEffect(() => {
    if (!data) return
    const w = workingNow(data, st).length
    document.title = w ? `● ${w} agent${w > 1 ? 's' : ''} working · Perspective Engine` : 'Perspective Engine City'
  }, [data, st])
  // Tell the camera how much room the panels take, so the subject stays centred in what is visible.
  useEffect(() => {
    const el = drawer.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const wide = innerWidth > 900
      live.ui.inspW = wide ? r.width + 24 : 0
      live.ui.railW = 0
      live.ui.sheetH = wide ? 0 : r.height
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [webgl])

  return (
    <div className="app">
      <div className="stage" aria-hidden="true">
        {webgl && showScene ? <Suspense fallback={null}><Scene /></Suspense> : <div className="stage-fallback" />}
      </div>
      <div className="labels" ref={el => { if (el) labelLayer.current = el }} />
      <TopBar />
      {webgl ? (
        <>
          <div ref={drawer} className="drawer-wrap"><Drawer /></div>
          <MiniMap />
          <HintChip />
          <div className="bottom"><Replay /><AskBar /></div>
          <Toasts />
          <Index />
        </>
      ) : <Index forceOpen />}
      <Search />
      <Help />
      <Pilot />
      <AnimatePresence>{webgl && !introDone && <Gate />}</AnimatePresence>
    </div>
  )
}
