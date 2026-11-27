/// <reference lib="webworker" />
// Bulk simulation worker. Receives a world and an absolute target, simulates in time-sliced
// chunks (so pause/cancel messages are handled between engine steps, always at a consistent
// point) and posts progress. The same engine `step` function is used as on the main thread,
// so results are identical to step-by-step simulation.
import { step } from '../engine/world.ts';
import { estimateSteps, targetReached, type SimTarget } from '../engine/sim.ts';
import { upgradeWorld } from '../persistence/save.ts';
import { runExperiment, type RunOutcome } from '../engine/experiments.ts';
import type { World } from '../engine/types.ts';

let stopRequested: 'pause' | 'cancel' | null = null;

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === 'pause' || msg.type === 'cancel') { stopRequested = msg.type; return; }
  if (msg.type === 'run') run(upgradeWorld(msg.world), msg.target as SimTarget);
  if (msg.type === 'experiment') experiment(upgradeWorld(msg.world), msg.indices as number[], msg.seasons as number);
};

/** Multi-fork experiment: run the given fork indices one per task, so cancel is handled between runs. */
function experiment(base: World, indices: number[], seasons: number): void {
  stopRequested = null;
  const done: RunOutcome[] = [];
  const t0 = performance.now();
  const next = () => {
    if (stopRequested) { (self as unknown as Worker).postMessage({ type: 'exp-result', status: 'cancelled', outcomes: [] }); return; }
    if (done.length === indices.length) {
      const buffers = done.flatMap(o => [o.pyramid.buffer, o.league.buffer, o.moved.buffer, o.champions.buffer, o.cups.buffer]);
      (self as unknown as Worker).postMessage({ type: 'exp-result', status: 'done', outcomes: done, elapsed: performance.now() - t0 }, buffers as ArrayBuffer[]);
      return;
    }
    done.push(runExperiment(base, indices[done.length], seasons));
    (self as unknown as Worker).postMessage({ type: 'exp-progress', done: done.length, total: indices.length });
    setTimeout(next, 0);
  };
  next();
}

function run(world: World, target: SimTarget): void {
  stopRequested = null;
  const reached = targetReached(world, target);
  const total = estimateSteps(world, target);
  const t0 = performance.now();
  let steps = 0, seasonsDone = 0;
  const slice = () => {
    const end = performance.now() + 40;
    while (performance.now() < end) {
      if (reached(world, seasonsDone)) { finish('done'); return; }
      const r = step(world);
      steps++;
      if (r.kind === 'slot' && r.seasonComplete) seasonsDone++;
    }
    if (reached(world, seasonsDone)) { finish('done'); return; }
    (self as unknown as Worker).postMessage({ type: 'progress', steps, total, seasonsDone, year: world.season.year, slot: world.season.slotIndex, elapsed: performance.now() - t0 });
    if (stopRequested) { finish(stopRequested === 'pause' ? 'paused' : 'cancelled'); return; }
    setTimeout(slice, 0);
  };
  const finish = (status: string) => {
    (self as unknown as Worker).postMessage({ type: 'result', status, world: status === 'cancelled' ? null : world, steps, seasonsDone, elapsed: performance.now() - t0 });
  };
  slice();
}
