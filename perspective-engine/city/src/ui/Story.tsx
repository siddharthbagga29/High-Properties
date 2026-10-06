import { motion } from 'framer-motion'
import Lenis from 'lenis'
import { useEffect, useMemo, useRef } from 'react'
import { sfx } from '../audio/sound'
import { BRIEF } from '../data/brief'
import { agentStats, fmtK, ms, ventureStats } from '../data/model'
import { persist, useStore } from '../store'
import { rise } from './HUD'

const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Scrolling flies forward through the structure: five chapters, one per magnification, then free exploration. */
export function Story() {
  const data = useStore(s => s.data)
  const st = useStore(s => s.st)
  const lenis = useRef<Lenis | null>(null)
  const chapter = useRef(-1)

  const plan = useMemo(() => {
    if (!data) return null
    const stats = agentStats(data, st)
    const top = [...stats].sort((a, b) => b.done - a.done || b.used - a.used)[0]
    const lastDone = [...data.ledger].reverse().find(e => e.event === 'done' && data.nodes.find(n => n.id === e.node)?.run)
    const task = data.nodes.find(n => n.id === lastDone?.node) ?? data.nodes[0]
    return { top, task, v: ventureStats(data, st, null), focus: ['venture', 'city', top.key, task.id, 'city'] }
  }, [data, st])

  useEffect(() => {
    if (!reduce) lenis.current = new Lenis({ autoRaf: true, lerp: 0.09 })
    const onScroll = () => {
      const s = useStore.getState()
      if (!plan || s.mode !== 'story') return
      const max = document.documentElement.scrollHeight - innerHeight
      const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0
      const i = Math.min(4, Math.floor(p * 5))
      const f = p * 5 - i
      if (i !== chapter.current) {
        if (chapter.current !== -1) sfx.dive()
        chapter.current = i
        s.dive(plan.focus[i])
        s.set({ storyChapter: i })
      }
      useStore.setState({ nudge: i === 4 ? -0.35 : -0.3 + f * 0.6, storyP: p })
    }
    onScroll()
    addEventListener('scroll', onScroll, { passive: true })
    return () => { removeEventListener('scroll', onScroll); lenis.current?.destroy() }
  }, [plan])

  if (!data || !plan) return null
  const { top, task, v } = plan
  const begin = (withSound: boolean) => {
    const s = useStore.getState()
    s.set({ entered: true, sound: withSound })
    persist('pe.sound', withSound ? '1' : '0')
    if (withSound) sfx.enable()
    const next = innerHeight * 1.0
    lenis.current ? lenis.current.scrollTo(next, { duration: 2.2 }) : scrollTo({ top: next })
  }
  const explore = () => { sfx.dive(); useStore.getState().set({ mode: 'explore' }); scrollTo(0, 0); useStore.getState().dive('city') }
  const excerpt = task.outputs.map(o => data.excerpts[o]).find(Boolean)

  const Cap = ({ i, children }: { i: number; children: React.ReactNode }) => (
    <section className={`chapter ch-${i}`} aria-labelledby={`ch${i}`}>
      <motion.div className="cap" initial={i === 0 ? 's' : 'h'} whileInView="s" viewport={{ amount: 0.4 }} variants={{ s: { transition: { staggerChildren: 0.045 } }, h: {} }}>
        {children}
      </motion.div>
    </section>
  )

  return (
    <div className="story">
      <Cap i={0}>
        <motion.p variants={rise} className="eyebrow">Specimen 001 · a venture assembling itself · ×1</motion.p>
        <motion.h1 variants={rise} id="ch0" className="mega">Perspective<br />Engine</motion.h1>
        <motion.p variants={rise} className="lede">A program that lets managers feel some of the attention load ADHD colleagues describe, then checks what those managers actually change 30 days later. Nine AI agents are building it right now. Every light you see is a record of their work.</motion.p>
        <motion.div variants={rise} className="actions">
          <button className="cta" onClick={() => begin(true)}>Begin with sound</button>
          <button className="ghost" onClick={() => begin(false)}>Begin silently</button>
          <button className="link" onClick={explore}>Skip to the city</button>
        </motion.div>
        <motion.p variants={rise} className="fig"><i>Fig. 1.</i> The whole venture at ×1: {v.total} tasks in nine lobes, {data.ledger.length} ledger events. Bright regions are built; dim ones are planned.</motion.p>
      </Cap>
      <Cap i={1}>
        <motion.p variants={rise} className="eyebrow">02 · ×12 · districts</motion.p>
        <motion.h2 variants={rise} id="ch1">Nine minds,<br />one city</motion.h2>
        <motion.p variants={rise} className="lede">Magnify and the cortex comes apart into districts, one per agent. Curie works the Research Lab, Ogilvy the Harbor, Pacioli the Bank. In the Commons, Milton guards the rule that paid ADHD advisors can veto any content.</motion.p>
        <motion.p variants={rise} className="fig"><i>Fig. 2.</i> Arcs are dependencies. Light travels along an arc once its source task is built: that is the agents handing work to each other. {v.done} of {v.total} towers stand.</motion.p>
      </Cap>
      <Cap i={2}>
        <motion.p variants={rise} className="eyebrow">03 · ×140 · {top.district}</motion.p>
        <motion.h2 variants={rise} id="ch2">An agent<br />at work</motion.h2>
        <motion.p variants={rise} className="lede">{top.name} has built {top.done} of {top.tasks.length} towers. A tower's height is the token budget it planned; its density is what it actually spent: {fmtK(top.used)} against {top.budget}k.</motion.p>
        <motion.p variants={rise} className="fig"><i>Fig. 3.</i> {BRIEF.lesson}</motion.p>
      </Cap>
      <Cap i={3}>
        <motion.p variants={rise} className="eyebrow">04 · ×2000 · records</motion.p>
        <motion.h2 variants={rise} id="ch3">Every point<br />is a record</motion.h2>
        <motion.p variants={rise} className="lede">{task.id}, {task.title}. Orbiting it: the criteria it had to meet, the files it wrote, the inputs it read, and the ledger lines that prove when.</motion.p>
        {excerpt && <motion.blockquote variants={rise}>{excerpt.slice(0, 260)}{excerpt.length > 260 ? '…' : ''}</motion.blockquote>}
      </Cap>
      <Cap i={4}>
        <motion.p variants={rise} className="eyebrow">05 · the experiment</motion.p>
        <motion.h2 variants={rise} id="ch4">One question<br />decides it</motion.h2>
        <motion.p variants={rise} className="lede">Do managers who go through it actually do more for ADHD colleagues 30 days later? The agents’ own model says a $50M outcome by month 48 is about a 0.6% shot today. A pilot that answers that question changes the number, in either direction, and we publish the result either way.</motion.p>
        <motion.div variants={rise} className="actions">
          <button className="cta" onClick={() => { sfx.click(); useStore.getState().set({ panel: 'pilot' }) }}>Request a pilot</button>
          <button className="ghost" onClick={explore}>Explore the city freely</button>
        </motion.div>
      </Cap>
      <div className="scroll-hint" aria-hidden="true"><span>Scroll to magnify</span><i /></div>
    </div>
  )
}
