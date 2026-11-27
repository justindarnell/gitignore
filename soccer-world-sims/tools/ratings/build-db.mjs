// Builds src/data/england/clubs.json from the fitted strengths and historical tables.
//
//   attack/defence  : RESEARCHED  - opposition-adjusted Poisson fit (tools/ratings/fit.mjs)
//   midfield        : DERIVED     - mean of attack and defence (goal data cannot separate it)
//   overall         : DERIVED     - computed by the engine from attack/midfield/defence
//   reputation      : RESEARCHED  - recency-weighted pyramid level 1996/97-2025/26 + all-time pedigree
//   stability       : MIXED       - pyramid-rank volatility (researched) + documented subjective notes
//   formEstimate    : RESEARCHED  - opposition-adjusted points residual, last 12 league games of 2025/26
//
// Scale: 1 rating point = RATING_LOG log-goal units. The engine uses the same constant, so a
// 10-point attack-vs-defence gap multiplies expected goals by exp(10 * RATING_LOG).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { master } from './master.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fit = JSON.parse(readFileSync(join(root, 'tools/ratings/fit-output.json'), 'utf8'));
export const RATING_LOG = 0.035;
const BASE = 78; // rating of the mean 2025/26 Premier League attack / defence

// ---- subjective estimates (documented) for clubs without usable National League data
const ESTIMATES = {
  hornchurch: { note: 'No 2024-26 National League data; promoted via National League South play-offs. Set to NL mean minus 0.15 log units.', dA: -0.15, dD: -0.15 },
  'kidderminster-harriers': { note: 'Last NL season 2023/24 (not in fit window); promoted via National League North play-offs. NL mean minus 0.12.', dA: -0.12, dD: -0.12 },
  worthing: { note: 'No National League history; National League South champions 2025/26. NL mean minus 0.10.', dA: -0.10, dD: -0.10 },
};
// ---- subjective stability adjustments (documented, deliberately few and small)
const STABILITY_NOTES = {
  'sheffield-wednesday': [-22, 'Ownership/financial crisis and points deduction during 2025/26.'],
  'leicester-city': [-8, 'PSR breach charges and 2025/26 points deduction; relegated twice in three seasons.'],
  reading: [-8, 'Prolonged ownership turmoil and points deductions 2022-2025.'],
  'derby-county': [-4, 'Administration in 2021/22; since stabilised under new ownership.'],
  wrexham: [6, 'Well-funded, stable ownership; three consecutive promotions 2023-2025.'],
  'birmingham-city': [5, 'Significant recent ownership investment (Knighthead).'],
  'oldham-athletic': [-3, 'Long period of instability prior to 2025 return to EFL.'],
};

// ---- historical tables for reputation / stability
const rows = readFileSync(join(root, 'data/history/derived/season-tables.csv'), 'utf8').trim().split('\n').slice(1).map(l => { const [season, tier, div, pos, club, p, w, d, lo, gf, ga, pts] = l.split(','); return { season: +season, tier: +tier, pos: +pos, club }; });
const alias = { 'yeovil': 'yeovil-town', 'accrington': 'accrington-stanley', 'cheltenham': 'cheltenham-town', 'stevenage-borough': 'stevenage', 'leicester': 'leicester-city', 'halifax-town': 'fc-halifax-town', 'fylde': 'afc-fylde' };
for (const r of rows) r.club = alias[r.club] ?? r.club;
// Aldershot Town (founded 1992) is a successor club; earlier 'Aldershot' rows belong to Aldershot FC.
for (const r of rows) if (r.club === 'aldershot' && r.season >= 1992) r.club = 'aldershot-town';
const sizes = {};
for (const r of rows) { sizes[r.season] ??= {}; sizes[r.season][r.tier] = Math.max(sizes[r.season][r.tier] ?? 0, r.pos); }
const rankOf = new Map(); // `${club}|${season}` -> pyramid rank
for (const r of rows) {
  let off = 0;
  for (let t = 1; t < r.tier; t++) off += sizes[r.season][t] ?? 24;
  rankOf.set(`${r.club}|${r.season}`, off + r.pos);
}

// Current (2025/26-based) fitted overall for every club -> "level" curve by pyramid rank.
const fitted = master.map(c => {
  const f = fit.clubs[c.id];
  let A, D, src = 'fit';
  if (f) { A = f.att; D = f.def; }
  else { const e = ESTIMATES[c.id]; A = fit.divisionAttack[4] + e.dA; D = fit.divisionDefence[4] + e.dD; src = 'estimate'; }
  return { c, A, D, src, overall: BASE + (A + D) / 2 / RATING_LOG };
});
const levelCurve = fitted.map(x => x.overall).sort((a, b) => b - a); // index 0 = best club
const level = rank => rank <= levelCurve.length ? levelCurve[rank - 1] : levelCurve.at(-1) - 4;

const lastSeason = 2025;
const NL_RANK = 104; // approximate pyramid rank for an average National League season
function reputation(id) {
  let wsum = 0, lsum = 0, tfSeasons = 0, titles = 0;
  for (let s = 1888; s <= lastSeason; s++) {
    const r = rankOf.get(`${id}|${s}`);
    if (r !== undefined && r <= (sizes[s]?.[1] ?? 0)) { tfSeasons++; if (r === 1) titles++; }
  }
  for (let s = 1996; s <= lastSeason; s++) {
    const w = Math.pow(0.5, (lastSeason - s) / 8);
    let r = rankOf.get(`${id}|${s}`);
    // 2025/26 League One/Two/NL tables are incomplete: use the 2026/27 division as a proxy level.
    if (r === undefined && s === 2025) {
      const c = master.find(x => x.id === id);
      r = c.div === 1 ? 10 : c.div === 2 ? 32 : c.div === 3 ? 56 : c.div === 4 ? 80 : NL_RANK;
    }
    if (r === undefined) r = s >= 1996 ? NL_RANK + 8 : NL_RANK; // outside tiers 1-4: National League or below
    wsum += w; lsum += w * level(r);
  }
  const pedigree = Math.min(6, 0.04 * tfSeasons + 0.4 * titles);
  return { rep: lsum / wsum + pedigree, tfSeasons, titles, pedigree };
}
function stabilityOf(id) {
  const ranks = [];
  // Only seasons inside tiers 1-4 are observable; non-league seasons are treated as unknown.
  for (let s = 2012; s <= 2024; s++) ranks.push(rankOf.get(`${id}|${s}`));
  const moves = [], tiers = [];
  for (let i = 1; i < ranks.length; i++) if (ranks[i] !== undefined && ranks[i - 1] !== undefined) moves.push(Math.abs(ranks[i] - ranks[i - 1]));
  for (let i = 1; i < ranks.length; i++) {
    const t = r => r === undefined ? 5 : r <= 20 ? 1 : r <= 44 ? 2 : r <= 68 ? 3 : 4;
    tiers.push(t(ranks[i]) !== t(ranks[i - 1]) ? 1 : 0);
  }
  const divChanges = tiers.reduce((a, b) => a + b, 0);
  // With little observable data, fall back to a neutral 7 ranks/yr (typical lower-league churn).
  const vol = moves.length >= 6 ? moves.reduce((a, b) => a + b, 0) / moves.length : 7;
  let st = 68 - 1.1 * vol - 2.0 * divChanges;
  const note = STABILITY_NOTES[id];
  if (note) st += note[0];
  return { stability: Math.max(15, Math.min(90, st)), volatility: vol, divChanges, note: note?.[1] };
}

const STYLE_SHRINK = 0.7; // shrink attack-vs-defence asymmetry: goal-based splits are noisy
const W = 0.25; // midfield weight inside attack/defence power (must match engine)
const out = [];
for (const x of fitted) {
  const mid = (x.A + x.D) / 2, half = STYLE_SHRINK * (x.A - x.D) / 2;
  const aP = BASE + (mid + half) / RATING_LOG, dP = BASE + (mid - half) / RATING_LOG;
  // Engine: attackPower = (1-W)*attack + W*midfield, midfield = (attack+defence)/2.
  const attack = ((1 - W / 2) * aP - (W / 2) * dP) / (1 - W);
  const defence = ((1 - W / 2) * dP - (W / 2) * aP) / (1 - W);
  const midfield = (attack + defence) / 2;
  const f = fit.clubs[x.c.id];
  const resid = f?.formResidualPpg ?? 0;
  const form = 50 + 20 * Math.max(-1.5, Math.min(1.5, resid / 0.75));
  const rep = reputation(x.c.id);
  const st = stabilityOf(x.c.id);
  out.push({
    id: x.c.id, name: x.c.name, short: x.c.short, code: x.c.code, country: 'ENG', division: x.c.div,
    crest: `${x.c.id}.webp`,
    attack: +attack.toFixed(2), midfield: +midfield.toFixed(2), defence: +defence.toFixed(2),
    reputation: +Math.max(20, Math.min(97, rep.rep)).toFixed(2),
    stability: +st.stability.toFixed(2),
    squadQuality: +((attack + midfield + defence) / 3).toFixed(2),
    formEstimate: +form.toFixed(1),
    provenance: {
      ratings: x.src === 'fit' ? `fit: ${f.weightedMatches} weighted league matches 2022/23-2025/26` : `estimate: ${ESTIMATES[x.c.id].note}`,
      reputation: `researched: weighted pyramid level 1996-2025 + pedigree ${rep.pedigree.toFixed(1)} (${rep.tfSeasons} top-flight seasons, ${rep.titles} titles)`,
      stability: `volatility ${st.volatility.toFixed(1)} ranks/yr, ${st.divChanges} division changes 2012-2024` + (st.note ? `; subjective: ${st.note}` : ''),
      form: f ? `researched: ${resid >= 0 ? '+' : ''}${resid.toFixed(2)} pts/game vs expectation over last ${f.formMatches} league games` : 'no data: neutral',
    },
  });
}
mkdirSync(join(root, 'src/data/england'), { recursive: true });
writeFileSync(join(root, 'src/data/england/clubs.json'), JSON.stringify({ schema: 1, season: '2026/27', ratingLog: RATING_LOG, midfieldWeight: W, generated: new Date().toISOString().slice(0, 10), clubs: out }, null, 1));
for (const d of [1, 2, 3, 4, 5]) {
  console.log('--- tier', d);
  for (const c of out.filter(c => c.division === d).sort((a, b) => b.squadQuality - a.squadQuality)) console.log(c.short.padEnd(15), 'A', c.attack.toFixed(1), 'M', c.midfield.toFixed(1), 'D', c.defence.toFixed(1), 'Q', c.squadQuality.toFixed(1), 'Rep', c.reputation.toFixed(1), 'St', c.stability.toFixed(1), 'F', c.formEstimate);
}
