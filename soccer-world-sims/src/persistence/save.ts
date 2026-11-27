import type { World } from '../engine/types.ts';
import { SAVE_SCHEMA, ENGINE_VERSION } from '../engine/world.ts';
import { DEFAULT_PARAMS, DEFAULT_SETTINGS } from '../engine/params.ts';

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
  // 1 -> 2: (example for future versions)
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
