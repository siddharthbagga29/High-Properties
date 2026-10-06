import { buildBrain, type BrainInput } from './world'

self.onmessage = (e: MessageEvent<BrainInput>) => {
  const out = buildBrain(e.data)
  ;(self as unknown as Worker).postMessage(out, [out.pos.buffer, out.scatter.buffer, out.info.buffer])
}
