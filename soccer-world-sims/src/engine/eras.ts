// Eras, dynasties, golden ages and decade rankings, derived from recorded history only
// (season snapshots and rolls of honour). Pure functions: nothing is stored or randomised.
import type { CountryConfig, World } from './types.ts';

export interface Era {
  club: string;
  from: number; to: number;      // first and last title season of the run (starting years)
  titles: number;
  kind: 'dynasty' | 'era';       // dynasty: 5+ titles in the run
  label: string;                 // "The Newcastle Era, 2041–2049"
}

export interface GoldenAge {
  club: string;
  from: number; to: number;
  titles: number; cups: number; promotions: number;
  bestFinish: number;            // best pyramid position
  avgPyramid: number;
  score: number;
}

const season = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
const span = (a: number, b: number) => a === b ? season(a) : `${a}–${b + 1}`;

/**
 * Title eras: clusters of top-flight titles by one club where consecutive titles are at most
 * `maxGap` seasons apart, with at least `minTitles` titles and titles in at least half of the
 * seasons spanned. Five or more titles make a dynasty.
 */
export function titleEras(world: World, minTitles = 3, maxGap = 3): Era[] {
  const H = world.history;
  const champs = H.leagues.map((ls, k) => ({ year: H.snapshots[k].year, club: ls[0].champion }));
  const byClub = new Map<string, number[]>();
  for (const c of champs) { if (!byClub.has(c.club)) byClub.set(c.club, []); byClub.get(c.club)!.push(c.year); }
  const eras: Era[] = [];
  for (const [club, years] of byClub) {
    let run: number[] = [];
    const flush = () => {
      if (run.length >= minTitles && run.length / (run[run.length - 1] - run[0] + 1) >= 0.5) {
        const kind = run.length >= 5 ? 'dynasty' : 'era';
        const nm = world.info[club]?.short ?? club;
        eras.push({ club, from: run[0], to: run[run.length - 1], titles: run.length, kind,
          label: `The ${nm} ${kind === 'dynasty' ? 'Dynasty' : 'Era'}, ${span(run[0], run[run.length - 1])}` });
      }
      run = [];
    };
    for (const y of years) { if (run.length && y - run[run.length - 1] > maxGap) flush(); run.push(y); }
    flush();
  }
  return eras.sort((a, b) => a.from - b.from);
}

/**
 * A club's golden age: the window of 3–12 seasons with the highest success score, where each
 * season scores top-flight title 10, other trophies 4 (FA Cup) / 2.5 (other cups), promotion 1.5,
 * plus up to 2 for a high pyramid finish, minus a per-season baseline so that longer windows must
 * keep earning. Returns null for clubs without a meaningful peak.
 */
export function goldenAge(world: World, country: CountryConfig, id: string): GoldenAge | null {
  const H = world.history;
  const i = world.clubs.findIndex(c => c.id === id);
  if (i < 0 || H.snapshots.length < 3) return null;
  const top = country.leagues[0].id;
  const N = H.snapshots.length;
  const per = H.snapshots.map((s, k) => {
    const title = H.leagues[k][0].champion === id ? 1 : 0;
    const cups = H.cups[k].filter(c => c.winner === id);
    const lowerTitle = H.leagues[k].slice(1).some(l => l.champion === id) ? 1 : 0;
    const promo = H.leagues[k].some(l => l.promoted.includes(id)) ? 1 : 0;
    const pyr = s.pyramid[i];
    const pts = 10 * title + cups.reduce((a, c) => a + (c.cup === country.cups[0]?.id ? 4 : 2.5), 0) + 1.5 * promo + 1 * lowerTitle + Math.max(0, 2 - (pyr - 1) / 10);
    return { year: s.year, pts, title, cups: cups.length, promo, pyr, top: s.league[i] === top };
  });
  const base = 0.8;
  let best: GoldenAge | null = null;
  for (let a = 0; a < N; a++) for (let len = 3; len <= 12 && a + len <= N; len++) {
    const w = per.slice(a, a + len);
    // a golden age starts and ends with a successful season
    if (w[0].pts < 1.5 || w[w.length - 1].pts < 1.5) continue;
    const score = w.reduce((x, p) => x + p.pts - base, 0);
    if (!best || score > best.score) best = {
      club: id, from: w[0].year, to: w[w.length - 1].year, score,
      titles: w.reduce((x, p) => x + p.title, 0), cups: w.reduce((x, p) => x + p.cups, 0), promotions: w.reduce((x, p) => x + p.promo, 0),
      bestFinish: Math.min(...w.map(p => p.pyr)), avgPyramid: w.reduce((x, p) => x + p.pyr, 0) / w.length,
    };
  }
  if (!best || best.score < 4) return null;
  return best;
}

export interface DecadeRanking { decades: number[]; clubs: string[]; ranks: (number | null)[][]; avg: (number | null)[][] }

/**
 * Bump-chart data: for each decade (by season start year, e.g. 2030 = 2030/31–2039/40), the rank of
 * each club by mean pyramid position. Returns the `topN` clubs with the best all-time mean pyramid
 * position among clubs present in every decade's ranking list.
 */
export function decadeRankings(world: World, topN = 8): DecadeRanking {
  const H = world.history.snapshots;
  if (!H.length) return { decades: [], clubs: [], ranks: [], avg: [] };
  const decades = [...new Set(H.map(s => Math.floor(s.year / 10) * 10))];
  const avgBy = decades.map(d => {
    const ss = H.filter(s => Math.floor(s.year / 10) * 10 === d);
    return world.clubs.map((_, i) => ss.reduce((a, s) => a + s.pyramid[i], 0) / ss.length);
  });
  const rankBy = avgBy.map(av => {
    const order = av.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
    const r = new Array(av.length);
    order.forEach(([, i], k) => { r[i] = k + 1; });
    return r as number[];
  });
  const overall = world.clubs.map((_, i) => H.reduce((a, s) => a + s.pyramid[i], 0) / H.length);
  // clubs that were ever in the top `topN` of a decade, ordered by all-time mean position
  const ever = new Set<number>();
  rankBy.forEach(r => r.forEach((x, i) => { if (x <= topN) ever.add(i); }));
  const pick = [...ever].sort((a, b) => overall[a] - overall[b]).slice(0, Math.max(topN, Math.min(12, ever.size)));
  return {
    decades,
    clubs: pick.map(i => world.clubs[i].id),
    ranks: pick.map(i => rankBy.map(r => r[i])),
    avg: pick.map(i => avgBy.map(a => Math.round(a[i] * 10) / 10)),
  };
}
