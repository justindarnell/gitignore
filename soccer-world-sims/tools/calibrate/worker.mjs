// Worker thread: runs one simulation job and returns its metrics.
import { parentPort } from 'node:worker_threads';
import { createWorld, step } from '../../src/engine/world.ts';
import { newAccumulator, collectSeason, runMetrics } from './metrics.mjs';

parentPort.on('message', (job) => {
  try {
    const t0 = performance.now();
    const world = createWorld({ seed: job.seed, params: job.params, settings: { storage: 'essential', ...job.settings } });
    const acc = newAccumulator(world);
    let done = 0;
    while (done < job.seasons) {
      const r = step(world);
      if (r.kind === 'slot' && r.seasonComplete) { collectSeason(world, acc); done++; }
    }
    const metrics = runMetrics(world, acc);
    const extra = job.keepChampions ? { champions: world.history.leagues.map(s => s[0].champion) } : {};
    parentPort.postMessage({ id: job.id, ok: true, metrics, ms: performance.now() - t0, ...extra });
  } catch (e) {
    parentPort.postMessage({ id: job.id, ok: false, error: String(e && e.stack || e) });
  }
});
