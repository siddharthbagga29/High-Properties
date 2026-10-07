import { AnimatePresence, MotionConfig } from 'framer-motion'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { hush, sfx } from './audio/sound'
import { startLive } from './data/live'
import { statusesAt, workingNow } from './data/model'
import { labelLayer } from './scene/portal'
import { live } from './scene/shared'
import { RING } from './scene/world'
import { focusKey, parseFocus, persist, useStore } from './store'
import { AskBar, Gate, HintChip, MiniMap, Replay, Toasts, TopBar } from './ui/Chrome'
import { Drawer } from './ui/Drawer'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { Help, Index, IndexMirror, IndexPage, Pilot, Search } from './ui/Panels'

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

/** Keys that drive the city. They never act behind a dialog, or on a control that has its own use for the key. */
const OWN_KEYS = 'input, textarea, select, button, summary, [role="tablist"], [role="dialog"], [role="listbox"]'

function useKeys() {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      live.idle = 0
      const s = useStore.getState()
      // The entrance is a modal dialog with its own keys (Escape enters silently).
      if (s.webgl && !s.introDone) return
      const el = e.target instanceof Element ? e.target : null
      const typing = el?.closest('input, textarea, select')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); s.set({ panel: s.panel === 'search' ? 'none' : 'search' }); return }
      if (e.key === 'Escape') {
        if (s.panel !== 'none') return s.set({ panel: 'none' })
        if (typing) return (el as HTMLElement).blur()
        sfx.dive(); s.back(); return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || s.panel !== 'none' || el?.closest(OWN_KEYS)) return
      if (e.key === 'Home') { e.preventDefault(); sfx.dive(); s.select({ kind: 'world' }) }
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

/** The tab title says who is really working (live, whatever moment is being replayed), so a background tab still shows life. */
function useTitle() {
  useEffect(() => {
    const put = () => {
      const d = useStore.getState().data
      if (!d) return
      const w = workingNow(d, statusesAt(d, null)).length
      const t = w ? `● ${w} agent${w > 1 ? 's' : ''} working · Perspective Engine` : 'Perspective Engine City'
      if (document.title !== t) document.title = t
    }
    put()
    const id = setInterval(put, 30_000)
    const off = useStore.subscribe((s, p) => { if (s.data !== p.data) put() })
    return () => { clearInterval(id); off() }
  }, [])
}

export default function App() {
  useDeepLink()
  useKeys()
  useTitle()
  const webgl = useStore(s => s.webgl)
  const sound = useStore(s => s.sound)
  const introDone = useStore(s => s.introDone)
  const panel = useStore(s => s.panel)
  const focus = useStore(s => s.focus)
  const [showScene, setShowScene] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [rail, setRail] = useState<HTMLElement | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const drawer = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLElement>(null)
  const gate = webgl && !introDone

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
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(null), 8000); return () => clearTimeout(id) }, [notice])
  // Everything below the top bar is placed from its real height, which changes when the status wraps.
  useEffect(() => {
    const el = top.current
    if (!el) return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-h', `${Math.ceil(el.getBoundingClientRect().height)}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Tell the camera how much room the panels take, so the city is centred in what is visible: between the mini-map and the drawer.
  useEffect(() => {
    const el = drawer.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const wide = innerWidth > 900
      live.ui.inspW = wide ? r.width + 24 : 0
      live.ui.railW = wide && rail ? rail.getBoundingClientRect().right + 8 : 0
      live.ui.sheetH = wide ? 0 : r.height
    })
    ro.observe(el)
    if (rail) ro.observe(rail)
    return () => ro.disconnect()
  }, [webgl, rail])

  // One bad focus (a broken record, an odd deep link) must never blank the page: go back to the whole city and say so.
  const recover = (part: string) => () => {
    const s = useStore.getState()
    if (s.focus.kind !== 'world') {
      s.select({ kind: 'world' })
      setNotice(`That view could not be shown, so you are back at the whole city.`)
    } else setNotice(part === 'scene' ? 'The 3D city could not be drawn. Every number is still in the drawer and the Index.' : 'This view could not be shown. The Index has every number as tables.')
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className={`app${webgl ? '' : ' nogl'}${mapOpen ? ' map-open' : ''}`}>
        {/* While the entrance or a panel is open, everything behind it is out of reach for keyboard, pointer and screen reader. */}
        <div className="shell" inert={gate || panel !== 'none'}>
          {webgl && <button className="skip" onClick={() => useStore.getState().set({ panel: 'index' })}>Skip to text version of the city</button>}
          <div className="stage" aria-hidden="true">
            <ErrorBoundary name="scene" resetKey={focusKey(focus)} onError={recover('scene')} fallback={<div className="stage-fallback" />}>
              {webgl && showScene ? <Suspense fallback={null}><Scene /></Suspense> : <div className="stage-fallback" />}
            </ErrorBoundary>
          </div>
          <div className="labels" ref={el => { if (el) labelLayer.current = el }} />
          <TopBar ref={top} />
          {!webgl && <IndexPage />}
          <div ref={drawer} className="drawer-wrap">
            <ErrorBoundary name="drawer" resetKey={focusKey(focus)} onError={recover('drawer')}
              fallback={<aside className="drawer"><p className="muted">This view could not be shown.</p></aside>}>
              <Drawer />
            </ErrorBoundary>
          </div>
          {webgl && <MiniMap ref={setRail} open={mapOpen} onOpen={setMapOpen} />}
          {webgl && <HintChip />}
          <div className="bottom"><Replay /><AskBar /></div>
          <Toasts />
          {notice && <p className="notice" role="status">{notice}<button className="linkish" onClick={() => setNotice(null)}>Dismiss</button></p>}
          {webgl && <IndexMirror />}
        </div>
        <Search />
        <Help />
        <Pilot />
        {webgl && <Index />}
        <AnimatePresence>{gate && <Gate />}</AnimatePresence>
      </div>
    </MotionConfig>
  )
}
