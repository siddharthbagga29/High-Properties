// Builds the neuron cloud off the main thread (1–2 million points would otherwise block the page for a few hundred ms).
import { buildBrain } from "./brain-geometry.js";

self.onmessage = (e) => {
  const { total, seed, shares } = e.data;
  const t0 = performance.now();
  const b = buildBrain(total, { seed, shares: shares || undefined });
  self.postMessage({ ...b, ms: performance.now() - t0 }, [b.pos.buffer, b.info.buffer, b.centroids.buffer]);
};
