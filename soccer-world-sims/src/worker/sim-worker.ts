/// <reference lib="webworker" />
// Bulk simulation worker. Receives a world and an absolute target, simulates in time-sliced
// chunks (so pause/cancel messages are handled between engine steps, always at a consistent
// point) and posts progress. The same engine `step` function is used as on the main thread,
// so results are identical to step-by-step simulation.
import { step } from '../engine/world.ts';
import { estimateSteps, targetReached, type SimTarget } from '../engine/sim.ts';
import { upgradeWorld } from '../persistence/save.ts';
import type { World } from '../engine/types.ts';

let stopRequested: 'pause' | 'cancel' | null = null;

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === 'pause' || msg.type === 'cancel') { stopRequested = msg.type; return; }
  if (msg.type === 'run') run(upgradeWorld(msg.world), msg.target as SimTarget);
};

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
