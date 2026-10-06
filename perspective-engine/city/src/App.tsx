import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { hush, sfx } from './audio/sound'
import { formatLink, parseLink } from './data/deeplink'
import { focusKind } from './data/model'
import type { GraphState } from './data/types'
import { labelLayer } from './scene/portal'
import { useStore } from './store'
import { Dossier } from './ui/Dossier'
import { Guide } from './ui/Guide'
import { HUD, Reticle, Scrubber, ZoomDock } from './ui/HUD'
import { Mirror, Palette, Pilot } from './ui/Panels'
import { Story } from './ui/Story'

const Scene = lazy(() => import('./scene/Scene'))

function hasWebGL() {
  try { return !!document.createElement('canvas').getContext('webgl2') } catch { return false }
}

/** Polls the graph export. The same file the agents update, so the city is live wherever it is hosted. */
function useLiveData() {
  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const r = await fetch('./state.json', { cache: 'no-store' })
        if (!r.ok) return
        const d = (await r.json()) as GraphState
        const cur = useStore.getState().data
        if (!cur || cur.generated !== d.generated || cur.ledger.length !== d.ledger.length) useStore.getState().setData(d)
      } catch { /* offline: keep the last state */ }
    }
    load()
    const id = setInterval(() => { if (!stop && !document.hidden) load() }, 20_000)
    return () => { stop = true; clearInterval(id) }
  }, [])
}

function useDeepLink() {
  const data = useStore(s => s.data)
  const applied = useRef(false)
  useEffect(() => {
    if (!data || applied.current) return
    applied.current = true
    const l = parseLink(location.hash)
    if (!l) return
    const s = useStore.getState()
    if (l.time !== null) s.setTime(l.time)
    s.set({ mode: 'explore', entered: true })
    s.dive(focusKind(data, l.focus) === 'venture' && l.focus !== 'venture' ? 'venture' : l.focus)
  }, [data])
  useEffect(() => useStore.subscribe(s => {
    if (s.mode !== 'explore' || !s.data) return
    const h = formatLink({ focus: s.focus, level: s.level, time: s.time })
    if (location.hash !== h) try { history.replaceState(null, '', h) } catch { /* sandboxed */ }
  }), [])
}

function useControls() {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const s = useStore.getState()
      const typing = (e.target as HTMLElement)?.closest('input, textarea')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); s.set({ panel: s.panel === 'palette' ? 'none' : 'palette' }); return }
      if (e.key === 'Escape') {
        if (s.panel !== 'none') return s.set({ panel: 'none' })
        if (s.record) return s.set({ record: null })
        if (s.mode === 'explore') { sfx.dive(); s.back() }
        return
      }
      if (typing || s.mode !== 'explore') return
      if (e.key === '+' || e.key === '=') { sfx.click(); s.zoomBy(0.6) }
      if (e.key === '-' || e.key === '_') { sfx.click(); s.zoomBy(-0.6) }
    }
    let acc = 0, last = 0
    const wheel = (e: WheelEvent) => {
      const s = useStore.getState()
      if (s.mode !== 'explore' || s.panel !== 'none' || (e.target as HTMLElement).closest('.scrolls')) return
      e.preventDefault()
      const now = performance.now()
      if (now - last > 400) acc = 0
      last = now
      acc += -e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)
      const step = Math.max(-0.3, Math.min(0.3, acc))
      acc -= step
      const before = s.level
      s.zoomBy(step)
      if (useStore.getState().level !== before) { sfx.dive(); acc = 0 }
    }
    let pinch = 0
    const touchMove = (e: TouchEvent) => {
      const s = useStore.getState()
      if (s.mode !== 'explore' || e.touches.length !== 2) return
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
      if (pinch) s.zoomBy((d - pinch) * 0.006)
      pinch = d
    }
    const touchEnd = () => { pinch = 0 }
    window.addEventListener('keydown', key)
    window.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('touchmove', touchMove, { passive: true })
    window.addEventListener('touchend', touchEnd)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('wheel', wheel)
      window.removeEventListener('touchmove', touchMove)
      window.removeEventListener('touchend', touchEnd)
    }
  }, [])
}

export default function App() {
  useLiveData()
  useDeepLink()
  useControls()
  const mode = useStore(s => s.mode)
  const data = useStore(s => s.data)
  const sound = useStore(s => s.sound)
  const webgl = useStore(s => s.webgl)
  const [showScene, setShowScene] = useState(false)

  useEffect(() => {
    const ok = hasWebGL()
    useStore.getState().set({ webgl: ok })
    // Three.js loads after first paint: the headline and primary action never wait for WebGL.
    if (ok) {
      const go = () => setShowScene(true)
      const idle = () => ('requestIdleCallback' in window ? (window as unknown as { requestIdleCallback: (f: () => void, o: object) => void }).requestIdleCallback(go, { timeout: 900 }) : setTimeout(go, 300))
      document.readyState === 'complete' ? idle() : addEventListener('load', idle, { once: true })
    }
  }, [])
  useEffect(() => { if (sound) sfx.enable(); else { sfx.disable(); hush() } }, [sound])
  useEffect(() => { document.documentElement.dataset.mode = mode }, [mode])

  return (
    <div className="app">
      <div className="stage" aria-hidden="true">
        {webgl && showScene ? <Suspense fallback={null}><Scene /></Suspense> : <div className="stage-fallback" />}
      </div>
      {webgl && <Reticle />}
      <div className="labels" ref={el => { if (el) labelLayer.current = el }} />
      <HUD />
      {!webgl ? <Mirror forceOpen /> : mode === 'story' ? <Story /> : (
        <>
          <Dossier />
          <Scrubber />
          <ZoomDock />
        </>
      )}
      {data && <Guide />}
      <Palette />
      <Pilot />
      {webgl && <Mirror />}
    </div>
  )
}
