import { Rng } from './rng.ts';
import { effectiveParams, type EngineParams } from './params.ts';
import type { ClubState, CountryConfig, Match, World } from './types.ts';
import { ENGLAND } from '../data/england/config.ts';

/** Registry of country configurations (add new countries here). */
export const COUNTRIES: Record<string, CountryConfig> = { ENG: ENGLAND };

/**
 * Non-serialised runtime cache for a world: lookup maps, effective parameters and the live
 * RNG. Rebuilt transparently after loading a save. The RNG state is written back to
 * world.rng at the end of every engine step so saves are always consistent.
 */
export interface Runtime {
  country: CountryConfig;
  clubs: Map<string, ClubState>;
  clubIndex: Map<string, number>;
  params: EngineParams;
  settingsKey: string;
  rng: Rng;
  seasonYear: number;
  bySlot: Match[][];
  byId: Map<number, Match>;
  leagueOf: Map<string, string>;
  tierOf: Map<string, number>;
}

const cache = new WeakMap<World, Runtime>();

export function runtime(world: World): Runtime {
  let rt = cache.get(world);
  const key = JSON.stringify(world.settings);
  if (!rt) {
    const country = COUNTRIES[world.country];
    rt = {
      country,
      clubs: new Map(world.clubs.map(c => [c.id, c])),
      clubIndex: new Map(world.clubs.map((c, i) => [c.id, i])),
      params: effectiveParams(world.params, world.settings),
      settingsKey: key,
      rng: new Rng(world.rng),
      seasonYear: -1,
      bySlot: [], byId: new Map(), leagueOf: new Map(), tierOf: new Map(),
    };
    cache.set(world, rt);
  }
  if (rt.settingsKey !== key) { rt.params = effectiveParams(world.params, world.settings); rt.settingsKey = key; }
  if (rt.seasonYear !== world.season.year) reindexSeason(world, rt);
  return rt;
}

export function reindexSeason(world: World, rt: Runtime): void {
  const s = world.season;
  rt.bySlot = s.calendar.map(() => []);
  rt.byId = new Map();
  for (const m of s.matches) { rt.bySlot[m.slot].push(m); rt.byId.set(m.id, m); }
  rt.leagueOf = new Map();
  rt.tierOf = new Map();
  for (const l of rt.country.leagues) for (const c of s.leagueClubs[l.id] ?? []) { rt.leagueOf.set(c, l.id); rt.tierOf.set(c, l.tier); }
  rt.seasonYear = s.year;
}

export function addMatch(world: World, rt: Runtime, m: Omit<Match, 'id'>): Match {
  const match: Match = { id: world.season.nextMatchId++, ...m };
  world.season.matches.push(match);
  rt.bySlot[match.slot].push(match);
  rt.byId.set(match.id, match);
  return match;
}

/** Invalidate the runtime (e.g. after replacing world.clubs). */
export function resetRuntime(world: World): void { cache.delete(world); }

export function syncRng(world: World): void {
  const rt = cache.get(world);
  if (rt) world.rng = rt.rng.state();
}
