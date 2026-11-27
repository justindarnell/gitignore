// Playable clubs for a 1992/93 start: the 92 Football League clubs of 1992/93 (Premier League 22,
// First Division 24, Second Division 24, Third Division 22), read from engsoccerdata's 1992 season, plus
// (0.7) the 22 clubs of the 1992/93 Football Conference, read from its Wikipedia season page (names only:
// the final table is future information and is not used for ratings).
// Clubs that are also in the 2026 database keep their 2026 ids (so derbies, crests and names line up);
// the others get ids from their historical names.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, clubKey } from '../history/lib.mjs';
import { leagueTable } from '../history/wikitable.mjs';
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
  // 1992/93 Football Conference clubs that are not in the 2026 database
  'bath-city': ['Bath City', 'Bath', 'BAT'], 'bromsgrove-rovers': ['Bromsgrove Rovers', 'Bromsgrove', 'BRR'],
  'dagenham-and-redbridge': ['Dagenham & Redbridge', 'Dagenham & R', 'DAG'], 'farnborough-town': ['Farnborough Town', 'Farnborough', 'FAR'],
  'kettering-town': ['Kettering Town', 'Kettering', 'KET'], 'macclesfield-town': ['Macclesfield Town', 'Macclesfield', 'MAC'],
  'merthyr-tydfil': ['Merthyr Tydfil', 'Merthyr', 'MER'], 'northwich-victoria': ['Northwich Victoria', 'Northwich', 'NOR'],
  runcorn: ['Runcorn', 'Runcorn', 'RUN'], 'slough-town': ['Slough Town', 'Slough', 'SLO'], 'stafford-rangers': ['Stafford Rangers', 'Stafford', 'STA'],
  'stalybridge-celtic': ['Stalybridge Celtic', 'Stalybridge', 'STY'], 'telford-united': ['Telford United', 'Telford', 'TEL'],
  'welling-united': ['Welling United', 'Welling', 'WEL'], 'witton-albion': ['Witton Albion', 'Witton', 'WIT'],
};
// Dagenham & Redbridge took Redbridge Forest's Conference place in 1992 (merger with Dagenham FC):
// its pre-1992 record is Redbridge Forest's.
const EXTRA_KEYS = { 'dagenham-and-redbridge': ['redbridge-forest'] };

export function members(season = 1992) {
  const rows = parseCsv(readFileSync(join(root, 'data/history/raw/engsoccerdata/england.csv'), 'utf8')).filter(r => +r.Season === season);
  const tierOf = new Map(), name = new Map();
  for (const r of rows) for (const n of [r.home, r.visitor]) { const k = clubKey(n); tierOf.set(k, +r.tier); name.set(k, n); }
  const byId = new Map(master.flatMap(c => c.keys.map(k => [k, c])));
  if (season === 1992) {
    // The Conference (tier 5): names from the 1992/93 season page.
    for (const r of leagueTable(join(root, 'data/history/raw/wikipedia/conference-1992.html'))) { const k = clubKey(r.team); tierOf.set(k, 5); name.set(k, r.team); }
  }
  return [...tierOf.entries()].map(([k, div]) => {
    const id = TO_2026[k] ?? k;
    const m = byId.get(id);
    const [nm, short, code] = NAMES[id] ?? (m ? [m.name, m.short, m.code] : [name.get(k), name.get(k), name.get(k).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()]);
    return { id, name: nm, short, code, div, keys: [...new Set([id, k, ...(m?.keys ?? []), ...(EXTRA_KEYS[id] ?? [])])], in2026: !!m };
  }).sort((a, b) => a.div - b.div || a.id.localeCompare(b.id));
}
