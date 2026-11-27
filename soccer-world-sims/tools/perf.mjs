// Measures engine speed, retained heap and save size per storage level (100 seasons).
// Usage: node --expose-gc --experimental-strip-types tools/perf.mjs [seasons]
import { gzipSync } from 'node:zlib';
import { createWorld } from '../src/engine/world.ts';
import { simulate } from '../src/engine/sim.ts';
import { exportWorld } from '../src/persistence/save.ts';
const N = Number(process.argv[2] ?? 100);
for (const storage of ['essential', 'standard', 'full']) {
  globalThis.gc?.();
  const h0 = process.memoryUsage().heapUsed;
  const w = createWorld({ seed: 'perf', settings: { storage } });
  const t0 = performance.now();
  simulate(w, { kind: 'seasons', n: N });
  const ms = performance.now() - t0;
  globalThis.gc?.();
  const heap = (process.memoryUsage().heapUsed - h0) / 1e6;
  const json = exportWorld(w);
  console.log(`${storage.padEnd(9)} ${N} seasons ${(ms / 1000).toFixed(2)} s (${(ms / N).toFixed(1)} ms/season) · heap ${heap.toFixed(0)} MB · save ${(json.length / 1e6).toFixed(2)} MB JSON, ${(gzipSync(json).length / 1e6).toFixed(2)} MB gzipped`);
}
