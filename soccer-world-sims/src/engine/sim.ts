import { step } from './world.ts';
import { runtime } from './runtime.ts';
import type { World } from './types.ts';

export type SimTarget =
  | { kind: 'matchday' }          // next calendar slot that contains matches
  | { kind: 'month' }             // until the calendar month changes
  | { kind: 'season' }            // remainder of the current season
  | { kind: 'year' }              // same point in the calendar one season later
  | { kind: 'seasons'; n: number };// n complete seasons (finishing at a season end)

export interface SimProgress { steps: number; seasonsDone: number; target: number; year: number; slot: number; slots: number }

const month = (w: World) => w.season.calendar[Math.min(w.season.slotIndex, w.season.calendar.length - 1)].date.slice(0, 7);

/**
 * Build a predicate that becomes true when the target is reached. Bulk and step-by-step
 * simulation both call `step`, so results are identical for the same starting state.
 */
export function targetReached(world: World, target: SimTarget): (w: World, seasonsDone: number) => boolean {
  const startYear = world.season.year, startSlot = world.season.slotIndex, startMonth = month(world);
  const startComplete = world.season.complete;
  switch (target.kind) {
    case 'matchday': {
      let playedSomething = false;
      return (w) => {
        if (w.season.slotIndex > 0) {
          const rt = runtime(w);
          const prev = rt.bySlot[w.season.slotIndex - 1];
          if (prev?.some(m => m.hg !== undefined)) playedSomething = true;
        }
        return playedSomething && (w.season.year !== startYear || w.season.slotIndex !== startSlot || w.season.complete !== startComplete);
      };
    }
    case 'month':
      return (w) => (w.season.complete && !startComplete) || (w.season.year !== startYear || month(w) !== startMonth) && w.season.slotIndex > 0;
    case 'season':
      return (w, done) => done >= 1;
    case 'year':
      return (w) => w.season.year === startYear + 1 && (w.season.slotIndex >= startSlot || w.season.complete);
    case 'seasons':
      return (w, done) => done >= target.n;
  }
}

export interface SimOptions {
  onProgress?: (p: SimProgress) => void;
  progressEvery?: number;
  shouldStop?: () => boolean;
}

/** Run until the target is reached (or stopped between steps, which is always consistent). */
export function simulate(world: World, target: SimTarget, opts: SimOptions = {}): { steps: number; seasonsDone: number; stopped: boolean } {
  const reached = targetReached(world, target);
  let steps = 0, seasonsDone = 0;
  const total = target.kind === 'seasons' ? target.n : 1;
  // A completed season counts as a season end; continuing starts the next one.
  for (;;) {
    if (opts.shouldStop?.()) return { steps, seasonsDone, stopped: true };
    const r = step(world);
    steps++;
    if (r.kind === 'slot' && r.seasonComplete) seasonsDone++;
    if (opts.onProgress && steps % (opts.progressEvery ?? 25) === 0) {
      opts.onProgress({ steps, seasonsDone, target: total, year: world.season.year, slot: world.season.slotIndex, slots: world.season.calendar.length });
    }
    if (reached(world, seasonsDone)) return { steps, seasonsDone, stopped: false };
    if (steps > 1e7) throw new Error('simulate: runaway loop');
  }
}
