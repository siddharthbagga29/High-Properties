import { buildParticles, type ParticleInput } from './layout'

self.onmessage = (e: MessageEvent<ParticleInput>) => {
  const out = buildParticles(e.data)
  ;(self as unknown as Worker).postMessage(out, [out.brain.buffer, out.city.buffer, out.scatter.buffer, out.info.buffer, out.info2.buffer])
}
