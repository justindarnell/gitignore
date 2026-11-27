import type { World } from '../engine/types.ts';
import { SAVE_SCHEMA, ENGINE_VERSION } from '../engine/world.ts';
import { DEFAULT_PARAMS, DEFAULT_SETTINGS, OWNERSHIP_EXPERIMENTAL_06 } from '../engine/params.ts';

/** Metadata shown in save slot lists without loading the full world. */
export interface SaveMeta {
  id: string;
  name: string;
  seed: string;
  schema: number;
  engineVersion: string;
  season: number;
  slotIndex: number;
  date: string;
  savedAt: string;
  seasonsPlayed: number;
  storage: string;
  bytes?: number;
}

export function saveMeta(world: World, id: string): SaveMeta {
  const s = world.season;
  return {
    id, name: world.name, seed: world.seed, schema: world.schema, engineVersion: world.engineVersion,
    season: s.year, slotIndex: s.slotIndex, date: s.calendar[Math.min(s.slotIndex, s.calendar.length - 1)].date,
    savedAt: new Date().toISOString(), seasonsPlayed: world.history.leagues.length, storage: world.settings.storage,
  };
}

/** Schema migrations: each entry upgrades a save from version N to N+1. */
const MIGRATIONS: Record<number, (w: any) => any> = {
  // 1 -> 2 (0.6.0): ownership ambition. Saves from 0.5 have no ownership data, so every club
  // starts neutral (steady owners); the engine's ownership events take over from there.
  1: w => { for (const c of w.clubs) { c.ambition ??= 0; c.ownerSince ??= null; } return w; },
  // 2 -> 3 (0.6.0): stories, head-to-head and derby records. Earlier seasons cannot be re-detected
  // (their matches are not stored at every level), so stories start empty for them and head-to-head
  // counting starts with the current season (recorded in h2hSince and shown in the UI).
  2: w => {
    const h = w.history;
    h.stories ??= h.leagues.map(() => []);
    h.h2h ??= {};
    h.h2hSince ??= w.season.year;
    h.derbyMeetings ??= {};
    return w;
  },
  // 3 -> 4 (0.6.0): start seasons, user interventions and timeline lineage (forks). Earlier saves all
  // started in 2026/27 and have no interventions.
  3: w => {
    w.start ??= '2026';
    w.interventions ??= [];
    w.lineage ??= { id: `root:2026:${w.seed}` };
    return w;
  },
  // 4 -> 5 (0.7.0): relative ownership was adopted, and the `ownership` setting became a multiplier on the
  // world's own ownership parameters (1 = as stored). Earlier saves keep their model: the new parameters
  // are switched off, and the old experimental setting (k x the 0.6 finalist, added on top) is written
  // into the stored parameters so the world simulates exactly as before.
  4: w => {
    const p = w.params, k = w.settings?.ownership ?? 0, E = OWNERSHIP_EXPERIMENTAL_06;
    p.ambLift ??= 0; p.ambDrop ??= 0; p.ambRepRef ??= 90;
    if (k > 0) {
      if (!(p.ownerEventRate > 0)) p.ambPersist = E.ambPersist;
      p.ambTarget += k * E.ambTarget; p.ambPromo += k * E.ambPromo; p.ambUpside += k * E.ambUpside; p.ownerEventRate += k * E.ownerEventRate;
    }
    w.settings = { ...w.settings, ownership: 1 };
    return w;
  },
};

export class SaveError extends Error {}

/** Validate and migrate a parsed save object into a current World. */
export function upgradeWorld(raw: any): World {
  if (!raw || typeof raw !== 'object' || !raw.season || !raw.clubs || !raw.rng) throw new SaveError('Not a Soccer World Sims save file.');
  let w = raw;
  if (typeof w.schema !== 'number') throw new SaveError('Save has no schema version.');
  if (w.schema > SAVE_SCHEMA) throw new SaveError(`Save was created by a newer version (schema ${w.schema}); please update the game.`);
  while (w.schema < SAVE_SCHEMA) {
    const m = MIGRATIONS[w.schema];
    if (!m) throw new SaveError(`No migration from schema ${w.schema}.`);
    w = m(w);
    w.schema++;
  }
  // Fill fields added in later engine versions with defaults.
  w.params = { ...DEFAULT_PARAMS, ...w.params };
  w.settings = { ...DEFAULT_SETTINGS, ...w.settings };
  w.engineVersion = w.engineVersion ?? ENGINE_VERSION;
  for (const c of w.clubs) c.luck ??= c.seasonOffset ?? 0;
  return w as World;
}

/** Serialise a world for export (plain JSON; deterministic key order from object creation). */
export function exportWorld(world: World): string {
  return JSON.stringify({ format: 'soccer-world-sims-save', ...world });
}

export function importWorld(text: string): World {
  let raw: any;
  try { raw = JSON.parse(text); } catch { throw new SaveError('File is not valid JSON.'); }
  if (raw.format && raw.format !== 'soccer-world-sims-save') throw new SaveError('Unrecognised save format.');
  delete raw.format;
  return upgradeWorld(raw);
}

/** Deep clone through JSON (used for save/load round trips and determinism tests). */
export function cloneWorld(world: World): World {
  return importWorld(exportWorld(world));
}
