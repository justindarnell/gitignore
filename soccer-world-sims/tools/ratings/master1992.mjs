// Playable clubs for a 1992/93 start: the 92 Football League clubs of 1992/93 (Premier League 22,
// First Division 24, Second Division 24, Third Division 22), read from engsoccerdata's 1992 season.
// Clubs that are also in the 2026 database keep their 2026 ids (so derbies, crests and names line up);
// the others get ids from their historical names.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, clubKey } from '../history/lib.mjs';
import { master } from './master.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// dataset key -> 2026 id where the dataset key differs from the id
const TO_2026 = {
  bournemouth: 'afc-bournemouth', 'brighton-and-hove-albion': 'brighton-and-hove-albion', chester: 'chester-city',
  hartlepool: 'hartlepool-united', scunthorpe: 'scunthorpe-united', southend: 'southend-united', carlisle: 'carlisle-united',
  leicester: 'leicester-city', 'halifax-town': 'fc-halifax-town', yeovil: 'yeovil-town',
};
// Display names for clubs not in the 2026 database (historical names in 1992/93).
const NAMES = {
  wimbledon: ['Wimbledon', 'Wimbledon', 'WIM'], 'chester-city': ['Chester City', 'Chester', 'CHC'], 'hereford-united': ['Hereford United', 'Hereford', 'HER'],
  darlington: ['Darlington', 'Darlington', 'DAR'], scarborough: ['Scarborough', 'Scarborough', 'SCA'], 'torquay-united': ['Torquay United', 'Torquay', 'TOR'],
  bury: ['Bury', 'Bury', 'BUR'], 'fc-halifax-town': ['Halifax Town', 'Halifax', 'HAL'],
};

export function members(season = 1992) {
  const rows = parseCsv(readFileSync(join(root, 'data/history/raw/engsoccerdata/england.csv'), 'utf8')).filter(r => +r.Season === season);
  const tierOf = new Map(), name = new Map();
  for (const r of rows) for (const n of [r.home, r.visitor]) { const k = clubKey(n); tierOf.set(k, +r.tier); name.set(k, n); }
  const byId = new Map(master.flatMap(c => c.keys.map(k => [k, c])));
  return [...tierOf.entries()].map(([k, div]) => {
    const id = TO_2026[k] ?? k;
    const m = byId.get(id);
    const [nm, short, code] = NAMES[id] ?? (m ? [m.name, m.short, m.code] : [name.get(k), name.get(k), name.get(k).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()]);
    return { id, name: nm, short, code, div, keys: [...new Set([id, k, ...(m?.keys ?? [])])], in2026: !!m };
  }).sort((a, b) => a.div - b.div || a.id.localeCompare(b.id));
}
