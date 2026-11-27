// Historical frequency of English clubs entering administration, 1992/93-2024/25, from the table of English clubs
// on Wikipedia's "Administration (British football)" page (downloaded by fetch.mjs). Used to set the engine's
// administration rate (src/engine/administration.ts, params adminRate) and its tier weights.
//
//   node tools/history/administrations.mjs  ->  data/history/derived/administrations.json
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wikitables } from './wikitable.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const t = wikitables(join(root, 'data/history/raw/wikipedia/administration-british-football.html'))[0];
if (!/^Club$/.test(t[0][0])) throw new Error('unexpected table layout');
// Division named in the table -> tier, by era (the First Division was tier 2 from 1992/93).
const tierOf = (lg, y) => /Premier League/.test(lg) ? 1 : /Championship/.test(lg) ? 2 : /League One/.test(lg) ? 3 : /League Two/.test(lg) ? 4
  : /First Division/.test(lg) ? (y >= 1992 ? 2 : 1) : /Second Division/.test(lg) ? (y >= 1992 ? 3 : 2) : /Third Division/.test(lg) ? (y >= 1992 ? 4 : 3)
  : /Fourth Division/.test(lg) ? 4 : /Conference National|Football Conference|^National League$/.test(lg) ? 5 : 0;
const events = [];
for (const r of t.slice(1)) {
  const m = r[1].match(/(19|20)\d\d/);
  if (!m) continue;
  const y = +m[0];
  // An entry between January and July belongs to the season that started the previous year.
  const season = /January|February|March|April|May|June|July/.test(r[1]) ? y - 1 : y;
  events.push({ club: r[0], season, tier: tierOf(r[3], season), league: r[3], deduction: r[4] });
}
const win = events.filter(e => e.season >= 1992 && e.season <= 2024);
const known = win.filter(e => e.tier >= 1 && e.tier <= 5);
const byTier = [1, 2, 3, 4, 5].map(k => known.filter(e => e.tier === k).length);
const per = (a, b) => known.filter(e => e.season >= a && e.season <= b).length / (b - a + 1);
const out = {
  source: 'en.wikipedia.org/wiki/Administration_(British_football), table of English clubs (CC BY-SA 4.0)',
  seasons: '1992/93-2024/25', events: win.length, knownTier: known.length, byTier,
  perSeason: { '1992-2024': per(1992, 2024), '1992-1999': per(1992, 1999), '2000-2009': per(2000, 2009), '2010-2024': per(2010, 2024) },
  // Relative risk per club by tier (tier 3 = 1): share of cases divided by clubs per tier (20, 24, 24, 24, 24).
  tierWeight: byTier.map((n, i) => n / [20, 24, 24, 24, 24][i]).map((x, _, a) => +(x / a[2]).toFixed(2)),
  list: win,
};
writeFileSync(join(root, 'data/history/derived/administrations.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, list: undefined }));
