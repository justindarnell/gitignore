// Real-history comparison for the 1992/93 start (0.7 goal 4). The same functions measure the real seasons
// (tools/history/real1992.mjs) and simulated 1992 worlds, so both sides are computed identically.
//
// Real history is a single draw, so a model is judged by how typical reality looks among its simulated worlds:
// the continuous ranked probability score (CRPS) of the real value against the ensemble of simulated values.
// CRPS is a proper score: it rewards an ensemble centred on reality and penalises one that is too wide or too
// narrow, so a model cannot improve it just by becoming more random.

/** Windows (inclusive starting years). `A` is used by the search; `B` is never seen by it. */
export const WINDOWS = { A: [1992, 2008], B: [2009, 2024], full: [1992, 2024] };

export const AGG_KEYS = ['uniqueChampions', 'maxTitles', 'titleRetentionPct', 'distinctTopFlight', 'everPresentTopFlight', 'champPts38', 'ptsSD38',
  'top4ShareBest4', 'foundersRelegated', 'lowerReachTopFlight', 'confReachLeague'];

/**
 * seasons: [{ year, tierOf: { id: tier } (absent = 5 or below), table1: [{ id, pts, p }] best first }]
 * ids/divs: the 1992/93 clubs and their 1992/93 divisions.
 */
export function realMetrics(seasons, ids, divs) {
  const S = seasons.length;
  const tier = (s, id) => Math.min(5, s.tierOf[id] ?? 5);
  const champs = seasons.map(s => s.table1[0].id);
  const titles = new Map();
  champs.forEach(c => titles.set(c, (titles.get(c) ?? 0) + 1));
  let kept = 0;
  for (let i = 1; i < S; i++) if (champs[i] === champs[i - 1]) kept++;
  const tf = new Map();
  for (const s of seasons) for (const r of s.table1) tf.set(r.id, (tf.get(r.id) ?? 0) + 1);
  const top4 = new Map();
  for (const s of seasons) for (const r of s.table1.slice(0, 4)) top4.set(r.id, (top4.get(r.id) ?? 0) + 1);
  const best4 = [...top4.values()].sort((a, b) => b - a).slice(0, 4).reduce((a, b) => a + b, 0);
  const scaled = (s, f) => f(s.table1.map(r => r.pts * 38 / r.p));
  const sd = x => { const m = x.reduce((a, b) => a + b, 0) / x.length; return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / x.length); };
  const byDiv = d => ids.filter((_, i) => divs[i] === d || (Array.isArray(d) && d.includes(divs[i])));
  const agg = {
    uniqueChampions: titles.size,
    maxTitles: Math.max(...titles.values()),
    titleRetentionPct: 100 * kept / Math.max(1, S - 1),
    distinctTopFlight: tf.size,
    everPresentTopFlight: [...tf.values()].filter(v => v === S).length,
    champPts38: seasons.reduce((a, s) => a + scaled(s, x => x[0]), 0) / S,
    ptsSD38: seasons.reduce((a, s) => a + scaled(s, sd), 0) / S,
    top4ShareBest4: 100 * best4 / (4 * S),
    foundersRelegated: byDiv(1).filter(id => seasons.some(s => tier(s, id) > 1)).length,
    lowerReachTopFlight: byDiv([3, 4]).filter(id => seasons.some(s => tier(s, id) === 1)).length,
    confReachLeague: byDiv(5).filter(id => seasons.some(s => tier(s, id) <= 4)).length,
  };
  const club = {
    tf: ids.map(id => tf.get(id) ?? 0),
    tier: ids.map(id => seasons.reduce((a, s) => a + tier(s, id), 0) / S),
  };
  return { seasons: S, agg, club };
}

/** The seasons of a simulated world in the same shape as the real ones. */
export function simSeasons(world, from = 1992, to = 9999) {
  const H = world.history, ids = world.clubs.map(c => c.id);
  return H.snapshots.map((snap, k) => ({ snap, k })).filter(({ snap }) => snap.year >= from && snap.year <= to).map(({ snap, k }) => ({
    year: snap.year,
    tierOf: Object.fromEntries(ids.map((id, i) => [id, Number(snap.league[i].slice(3))])),
    table1: H.leagues[k][0].table.map(r => ({ id: r.club, pts: r.pts, p: r.p })),
  }));
}

/** CRPS of observation y against an ensemble (lower is better; same units as y). */
export function crps(ens, y) {
  const n = ens.length;
  if (!n) return NaN;
  let a = 0, b = 0;
  for (const x of ens) a += Math.abs(x - y);
  const s = [...ens].sort((p, q) => p - q);
  // E|X - X'| from the sorted sample in O(n): sum_i (2i - n + 1) x_i * 2 / n^2
  for (let i = 0; i < n; i++) b += (2 * i - n + 1) * s[i];
  return a / n - b / (n * n);
}

const mean = x => x.reduce((a, b) => a + b, 0) / x.length;
const sdOf = x => { const m = mean(x); return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / x.length); };

/**
 * Score simulated runs (array of realMetrics results) against the real metrics for one window.
 * scales: per-aggregate-metric scale (the reference model's run-to-run SD, fixed before comparing models).
 * Returns { agg, club, total, detail } where agg is the mean scaled CRPS over the aggregate metrics and club the
 * mean CRPS over clubs of top-flight seasons (as a share of the window) and mean tier.
 */
export function scoreRuns(runs, real, scales) {
  const detail = {};
  let agg = 0;
  for (const k of AGG_KEYS) {
    const ens = runs.map(r => r.agg[k]);
    const c = crps(ens, real.agg[k]);
    const sc = Math.max(scales[k] ?? sdOf(ens), 1e-6);
    detail[k] = { real: real.agg[k], mean: mean(ens), sd: sdOf(ens), p10: quant(ens, 0.1), p90: quant(ens, 0.9), crps: c, scaled: c / sc, pit: ens.filter(x => x < real.agg[k]).length / ens.length + 0.5 * ens.filter(x => x === real.agg[k]).length / ens.length };
    agg += c / sc;
  }
  agg /= AGG_KEYS.length;
  const S = real.seasons, nC = real.club.tf.length;
  let ctf = 0, ctier = 0, inside = 0;
  for (let i = 0; i < nC; i++) {
    const tfs = runs.map(r => r.club.tf[i]), tiers = runs.map(r => r.club.tier[i]);
    ctf += crps(tfs, real.club.tf[i]) / S;
    ctier += crps(tiers, real.club.tier[i]);
    if (real.club.tier[i] >= quant(tiers, 0.1) - 1e-9 && real.club.tier[i] <= quant(tiers, 0.9) + 1e-9) inside++;
  }
  const club = 0.5 * (ctf / nC) + 0.5 * (ctier / nC) / 4;
  return { agg, club, detail, clubCoverage80: 100 * inside / nC, clubTf: ctf / nC, clubTier: ctier / nC };
}

export function scalesFrom(runs) { return Object.fromEntries(AGG_KEYS.map(k => [k, sdOf(runs.map(r => r.agg[k]))])); }

function quant(x, p) { const s = [...x].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]; }
