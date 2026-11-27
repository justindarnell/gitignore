// Real outcomes of English football from 1992/93 to 2024/25, measured the same way as tools/calibrate/real92.mjs
// measures simulated 1992 worlds, for the out-of-sample test and calibration of the 1992/93 start.
//
//   node tools/history/real1992.mjs   ->  data/history/derived/real-1992.json
//
// Sources: data/history/derived/season-tables.csv (engsoccerdata + openfootball, tiers 1-4) for league positions,
// and the 1992/93 club list (tools/ratings/master1992.mjs). A club outside tiers 1-4 in a season counts as tier 5
// ("Conference or below": the 1992 world's bottom tier).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { members } from '../ratings/master1992.mjs';
import { realMetrics, WINDOWS } from '../calibrate/real92.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const clubs = members(1992);
const idOf = new Map();
for (const c of clubs) for (const k of c.keys) idOf.set(k, c.id);
const alias = { chester: 'chester-city', yeovil: 'yeovil-town', 'halifax-town': 'fc-halifax-town', leicester: 'leicester-city' };

const rows = readFileSync(join(root, 'data/history/derived/season-tables.csv'), 'utf8').trim().split('\n').slice(1).map(l => {
  const [season, tier, , pos, club, p, , , , , , pts] = l.split(',');
  return { season: +season, tier: +tier, pos: +pos, club, p: +p, pts: +pts };
});
const FIRST = 1992, LAST = 2024;
// seasons[s] = { tierOf: id -> tier (1-4; missing = 5), table1: [{ id, pts, p }] best first }
const seasons = [];
for (let y = FIRST; y <= LAST; y++) {
  const tierOf = {}, table1 = [];
  for (const r of rows.filter(x => x.season === y)) {
    const id = idOf.get(alias[r.club] ?? r.club) ?? idOf.get(r.club) ?? 'x:' + r.club;
    tierOf[id] = r.tier;
    if (r.tier === 1) table1.push({ id, pts: r.pts, p: r.p, pos: r.pos });
  }
  table1.sort((a, b) => a.pos - b.pos);
  seasons.push({ year: y, tierOf, table1 });
}
const n = seasons.map(s => s.table1.length);
if (n[0] !== 22 || n[3] !== 20) throw new Error(`unexpected Premier League sizes ${n.slice(0, 4)}`);

const out = { generated: new Date().toISOString().slice(0, 10), first: FIRST, last: LAST, windows: WINDOWS, clubs: clubs.map(c => c.id), metrics: {} };
for (const [name, [a, b]] of Object.entries(WINDOWS)) out.metrics[name] = realMetrics(seasons.filter(s => s.year >= a && s.year <= b), clubs.map(c => c.id), clubs.map(c => c.div));
writeFileSync(join(root, 'data/history/derived/real-1992.json'), JSON.stringify(out, null, 1));
for (const [name, m] of Object.entries(out.metrics)) console.log(name, JSON.stringify(m.agg));
