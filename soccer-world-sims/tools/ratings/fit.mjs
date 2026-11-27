// Fits opposition-adjusted club strengths from recent league results.
//
// Model (per match, weighted):  goals_home ~ Poisson(exp(mu + H + att[h] - def[a]))
//                                goals_away ~ Poisson(exp(mu     + att[a] - def[h]))
// att[c] = divAtt[div(c)] + ea[c], def[c] = divDef[div(c)] + ed[c]
// where div(c) is the club's 2025/26 division and ea/ed are ridge-penalised deviations.
// Divisional levels are identified because clubs move between divisions across seasons
// (promoted/relegated clubs carry their underlying strength), so a club that dominated a
// weaker division is NOT rated like an established top-flight side.
//
// Output: tools/ratings/fit-output.json (2026/27 start) or fit-output-<year>.json with --start <year>
// (historical starts use only the four seasons before that year, from engsoccerdata).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, parseOpenfootball, clubKey } from '../history/lib.mjs';
import { leagueTable, matrixMatches } from '../history/wikitable.mjs';
import { master as master2026 } from './master.mjs';
import { members } from './master1992.mjs';

const ai = process.argv.indexOf('--start');
const START = ai > 0 ? Number(process.argv[ai + 1]) : 2026;
const master = START === 2026 ? master2026 : members(START);

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const raw = p => join(root, 'data', 'history', 'raw', p);
const alias = { 'accrington-stanley': 'accrington', 'cheltenham-town': 'cheltenham', 'stevenage': 'stevenage-borough', 'bournemouth': 'afc-bournemouth', 'fylde': 'fylde', 'barrow': 'barrow' };
const key = n => alias[clubKey(n)] ?? clubKey(n);

// Recency weights by season (starting year). Half-life about one season.
const SEASON_WEIGHT = { [START - 4]: 0.15, [START - 3]: 0.3, [START - 2]: 0.55, [START - 1]: 1.0 };
const matches = [];
for (const r of parseCsv(readFileSync(raw('engsoccerdata/england.csv'), 'utf8'))) {
  const s = +r.Season;
  if (SEASON_WEIGHT[s]) matches.push({ s, tier: +r.tier, h: key(r.home), a: key(r.visitor), hg: +r.hgoal, ag: +r.vgoal });
}
const of = (s, tier, f) => parseOpenfootball(raw(f)).forEach(g => matches.push({ s, tier, h: key(g.home), a: key(g.away), hg: g.hg, ag: g.ag }));
if (START === 2026) {
  // engsoccerdata lacks 2022/23 and 2025/26 and the National League: openfootball fills the gaps.
  ['1-premierleague', '2-championship', '3-league1', '4-league2'].forEach((f, i) => of(2022, i + 1, `openfootball/2022-23/${f}.txt`));
  ['1-premierleague', '2-championship', '3-league1', '4-league2', '5-nationalleague'].forEach((f, i) => of(2025, i + 1, `openfootball/2025-26/${f}.txt`));
  of(2024, 5, 'openfootball/2024-25/5-nationalleague.txt');
}

if (START === 1992) {
  // 0.7: the fifth tier. Football Conference results matrices 1988/89-1991/92 (tier 5) and the top divisions
  // of its three feeder leagues (tier 6): the Northern Premier League has results matrices; the Isthmian and
  // Southern League pages have final tables only, which enter as one season aggregate per club against a
  // virtual league-average opponent ("avg:<league>-<year>"), without home advantage. In a double round robin a
  // club's goals for and against per game carry most of what the individual results would tell the fit. Clubs
  // keep one strength across seasons, so promotions and relegations between these leagues (and between the
  // Conference and the Fourth Division) link the levels, as for the Football League tiers. Matrix games have
  // no dates, so they are excluded from the form estimate.
  const wp = f => join(root, 'data', 'history', 'raw', 'wikipedia', f);
  for (const y of [START - 4, START - 3, START - 2, START - 1]) {
    for (const g of matrixMatches(wp(`conference-${y}.html`))) matches.push({ s: y, tier: 5, h: key(g.home), a: key(g.away), hg: g.hg, ag: g.ag, undated: true });
    for (const g of matrixMatches(wp(`npl-${y}.html`))) matches.push({ s: y, tier: 6, h: key(g.home), a: key(g.away), hg: g.hg, ag: g.ag, undated: true });
    for (const lg of ['isthmian', 'southern']) {
      const avg = `avg:${lg}-${y}`;
      for (const r of leagueTable(wp(`${lg}-${y}.html`))) if (r.P > 0) matches.push({ s: y, tier: 6, h: key(r.team), a: avg, hg: r.GF / r.P, ag: r.GA / r.P, n: r.P, neutral: true, undated: true });
    }
  }
}

// Map dataset keys -> our club ids.
const idOf = new Map();
for (const c of master) for (const k of c.keys) idOf.set(k, c.id);
idOf.set('leicester', 'leicester-city');
// Clubs outside our 116 still need parameters (they are opponents); give them their own ids.
const clubIds = new Set();
for (const m of matches) { m.h = idOf.get(m.h) ?? (m.h.startsWith('avg:') ? m.h : 'x:' + m.h); m.a = idOf.get(m.a) ?? (m.a.startsWith('avg:') ? m.a : 'x:' + m.a); clubIds.add(m.h); clubIds.add(m.a); }

// Each club's "division" for the prior = the tier of its most recent season in the data.
const lastTier = new Map();
for (const m of [...matches].sort((x, y) => x.s - y.s)) { lastTier.set(m.h, m.tier); lastTier.set(m.a, m.tier); }
const missing = master.filter(c => !clubIds.has(c.id)).map(c => c.id);

const ids = [...clubIds];
const idx = new Map(ids.map((c, i) => [c, i]));
const n = ids.length;
const A = new Float64Array(n), D = new Float64Array(n);
let mu = 0.2, H = 0.25;
const RIDGE = 4; // prior strength toward the tier mean, in weighted-match equivalents
// A season aggregate (n games, goals per game) has the same Poisson score as n games at that rate.
const games = matches.map(m => ({ h: idx.get(m.h), a: idx.get(m.a), hg: m.hg, ag: m.ag, w: SEASON_WEIGHT[m.s] * (m.n ?? 1), hh: m.neutral ? 0 : 1 }));
const tierIdx = ids.map(c => lastTier.get(c));
const att = i => A[i];
const def = i => D[i];
const tierMean = arr => { const s = new Float64Array(8), c = new Float64Array(8); for (let i = 0; i < n; i++) { s[tierIdx[i]] += arr[i]; c[tierIdx[i]]++; } return [...s].map((x, t) => c[t] ? x / c[t] : 0); };

for (let iter = 0; iter < 600; iter++) {
  const gA = new Float64Array(n), hA = new Float64Array(n), gD = new Float64Array(n), hD = new Float64Array(n);
  let gMu = 0, hMu = 0, gH = 0, hH = 0;
  for (const g of games) {
    const lh = Math.exp(mu + g.hh * H + A[g.h] - D[g.a]);
    const la = Math.exp(mu + A[g.a] - D[g.h]);
    const rh = g.w * (g.hg - lh), ra = g.w * (g.ag - la);
    gA[g.h] += rh; hA[g.h] += g.w * lh; gA[g.a] += ra; hA[g.a] += g.w * la;
    gD[g.a] -= rh; hD[g.a] += g.w * lh; gD[g.h] -= ra; hD[g.h] += g.w * la;
    gMu += rh + ra; hMu += g.w * (lh + la); if (g.hh) { gH += rh; hH += g.w * lh; }
  }
  const mA = tierMean(A), mD = tierMean(D);
  const step = 0.5;
  for (let i = 0; i < n; i++) {
    const t = tierIdx[i];
    A[i] += step * (gA[i] - RIDGE * (A[i] - mA[t])) / (hA[i] + RIDGE);
    D[i] += step * (gD[i] - RIDGE * (D[i] - mD[t])) / (hD[i] + RIDGE);
  }
  mu += step * gMu / hMu; H += step * gH / hH;
  // Identifiability: anchor mean tier-1 attack and defence at 0 (mu absorbs the attack shift).
  const t1 = tierMean(A)[1], d1 = tierMean(D)[1];
  for (let i = 0; i < n; i++) { A[i] -= t1; D[i] -= d1; }
  mu += t1 - d1;
  // (att - def) is invariant to a common shift, so also absorb the defence shift via A.
  if (d1 !== 0) { for (let i = 0; i < n; i++) A[i] -= 0; }
}
const divA = tierMean(A), divD = tierMean(D);
const LAMBDA = RIDGE;

// Form: residual points per game over each club's last 12 league matches of 2025/26
// (expected points computed from the fitted model, so this is opposition-adjusted).
function pois(l, k) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }
function expPts(lh, la) {
  let w = 0, d = 0;
  for (let x = 0; x <= 10; x++) for (let y = 0; y <= 10; y++) { const p = pois(lh, x) * pois(la, y); if (x > y) w += p; else if (x === y) d += p; }
  return [3 * w + d, 3 * (1 - w - d) + d];
}
const recent = new Map();
const m2025 = matches.map((m, i) => ({ ...m, gi: i })).filter(m => m.s === START - 1 && !m.undated);
for (const m of m2025) {
  const g = games[m.gi];
  const lh = Math.exp(mu + H + att(g.h) - def(g.a)), la = Math.exp(mu + att(g.a) - def(g.h));
  const [eh, ev] = expPts(lh, la);
  const ph = m.hg > m.ag ? 3 : m.hg === m.ag ? 1 : 0, pa = m.hg < m.ag ? 3 : m.hg === m.ag ? 1 : 0;
  for (const [c, r] of [[m.h, ph - eh], [m.a, pa - ev]]) { if (!recent.has(c)) recent.set(c, []); recent.get(c).push(r); }
}

const out = { generated: new Date().toISOString().slice(0, 10), mu, homeAdvantage: H, divisionAttack: [...divA].slice(1), divisionDefence: [...divD].slice(1), ridge: LAMBDA, seasonWeights: SEASON_WEIGHT, matchesUsed: matches.length, missing, clubs: {} };
for (const c of master) {
  const i = idx.get(c.id);
  if (i === undefined) continue;
  const r = recent.get(c.id) ?? [];
  const last = r.slice(-12);
  const weighted = games.filter(g => g.h === i || g.a === i).reduce((s, g) => s + g.w, 0);
  out.clubs[c.id] = { att: att(i), def: def(i), dataTier: tierIdx[i], weightedMatches: Math.round(weighted * 10) / 10, formResidualPpg: last.length ? last.reduce((s, x) => s + x, 0) / last.length : 0, formMatches: last.length };
}
writeFileSync(join(root, 'tools', 'ratings', START === 2026 ? 'fit-output.json' : `fit-output-${START}.json`), JSON.stringify({ start: START, ...out }, null, 1));
console.log('mu', mu.toFixed(3), 'H', H.toFixed(3), 'divA', out.divisionAttack.map(x => x.toFixed(3)), 'divD', out.divisionDefence.map(x => x.toFixed(3)), 'missing', missing);
const rows = master.filter(c => out.clubs[c.id]).map(c => ({ c, ...out.clubs[c.id], s: out.clubs[c.id].att + out.clubs[c.id].def })).sort((a, b) => b.s - a.s);
for (const r of rows) console.log(String(r.c.div), r.c.short.padEnd(16), (r.att).toFixed(3), (r.def).toFixed(3), 'sum', r.s.toFixed(3), 'form', r.formResidualPpg.toFixed(2), 'w', r.weightedMatches);
