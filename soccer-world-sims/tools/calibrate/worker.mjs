// Worker thread: runs one simulation job and returns its metrics.
import { parentPort } from 'node:worker_threads';
import { createWorld, step } from '../../src/engine/world.ts';
import { newAccumulator, collectSeason, runMetrics } from './metrics.mjs';
import { realMetrics, simSeasons, WINDOWS } from './real92.mjs';

parentPort.on('message', (job) => {
  try {
    const t0 = performance.now();
    const world = createWorld({ seed: job.seed, params: job.params, start: job.start, settings: { storage: 'essential', ...job.settings } });
    if (job.real92) {
      // 0.7 goal 4: a 1992/93 world measured like real 1992-2024 history (tools/calibrate/real92.mjs).
      const ids = world.clubs.map(c => c.id), divs = world.clubs.map(c => Number(c.league.slice(3)));
      let done92 = 0;
      while (done92 < job.seasons) { const r = step(world); if (r.kind === 'slot' && r.seasonComplete) done92++; }
      const metrics = Object.fromEntries(Object.entries(WINDOWS).map(([k, [a, b]]) => [k, realMetrics(simSeasons(world, a, b), ids, divs)]));
      parentPort.postMessage({ id: job.id, ok: true, metrics, ms: performance.now() - t0 });
      return;
    }
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
