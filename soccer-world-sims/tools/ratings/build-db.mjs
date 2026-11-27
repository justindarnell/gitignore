// Builds src/data/england/clubs.json from the fitted strengths and historical tables.
//
//   attack/defence  : RESEARCHED  - opposition-adjusted Poisson fit (tools/ratings/fit.mjs)
//   midfield        : DERIVED     - mean of attack and defence (goal data cannot separate it)
//   overall         : DERIVED     - computed by the engine from attack/midfield/defence
//   reputation      : RESEARCHED  - recency-weighted pyramid level 1996/97-2025/26 + all-time pedigree
//   stability       : MIXED       - pyramid-rank volatility (researched) + documented subjective notes
//   formEstimate    : RESEARCHED  - opposition-adjusted points residual, last 12 league games of 2025/26
//   ambition        : DOCUMENTED / NEUTRAL - ownership ambition seeded from documented ownership
//                     changes (OWNERSHIP below); every other club starts neutral (0)
//
// Scale: 1 rating point = RATING_LOG log-goal units. The engine uses the same constant, so a
// 10-point attack-vs-defence gap multiplies expected goals by exp(10 * RATING_LOG).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { master as master2026 } from './master.mjs';
import { members } from './master1992.mjs';

// --start <year> builds a historical start database (src/data/england/clubs-<year>.json) with the same
// method, using only data from before that season.
const ai = process.argv.indexOf('--start');
const START = ai > 0 ? Number(process.argv[ai + 1]) : 2026;
const master = START === 2026 ? master2026 : members(START);

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fit = JSON.parse(readFileSync(join(root, START === 2026 ? 'tools/ratings/fit-output.json' : `tools/ratings/fit-output-${START}.json`), 'utf8'));
export const RATING_LOG = 0.035;
const BASE = 78; // rating of the mean top-flight attack / defence in the season before the start

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

// ---- ownership ambition seeds (-1 asset-stripping ... 0 steady ... +1 wealthy takeover).
// Only clubs with a documented, decisive ownership situation as of 2025/26 get a non-zero seed;
// everyone else starts neutral. Magnitudes are judgements: recent wealthy takeovers +0.6..+0.8,
// long-established wealthy owners +0.5..+0.6, ambitious but smaller-scale owners +0.35..+0.5,
// leveraged or constrained owners -0.2..-0.35, owners in open financial crisis -0.85.
// The engine lets these decay (ambPersist) and adds its own ownership-change events.
export const OWNERSHIP = {
  'newcastle-united': [0.8, 2021, 'PIF-led consortium takeover, October 2021'],
  'manchester-city': [0.6, 2008, 'Abu Dhabi United Group / City Football Group ownership since 2008, sustained investment'],
  chelsea: [0.6, 2022, 'Todd Boehly / Clearlake Capital consortium takeover, May 2022; very high squad spending'],
  'aston-villa': [0.6, 2018, 'Nassef Sawiris / Wes Edens (V Sports) takeover, July 2018; sustained investment'],
  'nottingham-forest': [0.55, 2017, 'Evangelos Marinakis takeover, May 2017; heavy investment since 2022 promotion'],
  'leeds-united': [0.5, 2023, '49ers Enterprises completed takeover, July 2023'],
  everton: [0.45, 2024, 'The Friedkin Group takeover completed December 2024; new stadium 2025'],
  'ipswich-town': [0.6, 2021, 'Gamechanger 20 takeover April 2021; ORG investment 2023; back-to-back promotions 2023-24'],
  'coventry-city': [0.4, 2023, 'Doug King bought the club from Sisu, 2023'],
  'hull-city': [0.4, 2022, 'Acun Ilicali takeover, January 2022'],
  'afc-bournemouth': [0.35, 2022, 'Bill Foley (Black Knight) takeover, December 2022'],
  southampton: [0.4, 2022, 'Sport Republic takeover, January 2022'],
  'sheffield-united': [0.4, 2024, 'COH Sports consortium takeover completed December 2024'],
  'birmingham-city': [0.7, 2023, 'Knighthead Capital takeover, July 2023; major investment'],
  wrexham: [0.8, 2021, 'Ryan Reynolds and Rob McElhenney takeover, February 2021; Allyn family investment 2024; three successive promotions'],
  'stockport-county': [0.5, 2020, 'Mark Stott takeover, January 2020; two promotions since'],
  'milton-keynes-dons': [0.5, 2024, 'Fahad Al Ghanim takeover, 2024; high spending for the division'],
  'manchester-united': [-0.2, 2005, 'Leveraged Glazer ownership since 2005; INEOS minority stake 2024 followed by cost-cutting'],
  'wolverhampton-wanderers': [-0.3, 2016, 'Fosun ownership; net player sales and reduced spending 2023-25'],
  burnley: [-0.25, 2020, 'ALK Capital leveraged takeover, December 2020'],
  'leicester-city': [-0.35, 2010, 'King Power ownership under PSR constraints and charges'],
  'blackburn-rovers': [-0.3, 2010, "Venky's ownership since 2010; prolonged under-investment"],
  'cardiff-city': [-0.25, 2010, 'Vincent Tan ownership; reduced spending in recent seasons'],
  reading: [-0.25, 2025, 'Years of unpaid bills and points deductions under Dai Yongge; sale to Rob Couhig in 2025'],
  'sheffield-wednesday': [-0.85, 2015, 'Dejphon Chansiri: unpaid wages, transfer embargoes and administration during 2025/26'],
};

// Ownership seeds for a 1992/93 start (documented takeovers before the season; everyone else neutral).
const OWNERSHIP_1992 = {
  'blackburn-rovers': [0.9, 1991, 'Jack Walker took control in January 1991 and funded record signings'],
  'newcastle-united': [0.6, 1991, 'Sir John Hall won control of the club in 1991-92 and began heavy investment'],
  'derby-county': [0.5, 1991, 'Lionel Pickering became majority owner in 1991 and funded major signings'],
  'wolverhampton-wanderers': [0.5, 1990, 'Sir Jack Hayward bought the club in 1990 and funded stadium and squad investment'],
};
const OWN = START === 2026 ? OWNERSHIP : START === 1992 ? OWNERSHIP_1992 : {};

// ---- historical tables for reputation / stability
const rows = readFileSync(join(root, 'data/history/derived/season-tables.csv'), 'utf8').trim().split('\n').slice(1).map(l => { const [season, tier, div, pos, club, p, w, d, lo, gf, ga, pts] = l.split(','); return { season: +season, tier: +tier, pos: +pos, club }; });
const alias = { chester: 'chester-city', 'yeovil': 'yeovil-town', 'accrington': 'accrington-stanley', 'cheltenham': 'cheltenham-town', 'stevenage-borough': 'stevenage', 'leicester': 'leicester-city', 'halifax-town': 'fc-halifax-town', 'fylde': 'afc-fylde' };
for (const r of rows) r.club = alias[r.club] ?? r.club;
// Aldershot Town (founded 1992) is a successor club; earlier 'Aldershot' rows belong to Aldershot FC.
for (const r of rows) if (r.club === 'aldershot' && r.season >= 1992) r.club = 'aldershot-town';
const sizes = {};
for (const r of rows) { sizes[r.season] ??= {}; sizes[r.season][r.tier] = Math.max(sizes[r.season][r.tier] ?? 0, r.pos); }
const rankOf = new Map(); // `${club}|${season}` -> pyramid rank
const tierAt = new Map(); // `${club}|${season}` -> tier
for (const r of rows) {
  let off = 0;
  for (let t = 1; t < r.tier; t++) off += sizes[r.season][t] ?? 24;
  rankOf.set(`${r.club}|${r.season}`, off + r.pos);
  tierAt.set(`${r.club}|${r.season}`, r.tier);
}

// Current (2025/26-based) fitted overall for every club -> "level" curve by pyramid rank.
const fitted = master.map(c => {
  const f = fit.clubs[c.id];
  let A, D, src = 'fit';
  if (f) { A = f.att; D = f.def; }
  else { const e = ESTIMATES[c.id] ?? { dA: 0, dD: 0, note: 'no data: division mean' }; A = fit.divisionAttack[4] + e.dA; D = fit.divisionDefence[4] + e.dD; src = 'estimate'; }
  return { c, A, D, src, overall: BASE + (A + D) / 2 / RATING_LOG };
});
const levelCurve = fitted.map(x => x.overall).sort((a, b) => b - a); // index 0 = best club
const level = rank => rank <= levelCurve.length ? levelCurve[rank - 1] : levelCurve.at(-1) - 4;

const lastSeason = START - 1;
const NL_RANK = START === 2026 ? 104 : 100; // approximate pyramid rank for a season just below the playable pyramid
function reputation(id) {
  let wsum = 0, lsum = 0, tfSeasons = 0, titles = 0;
  for (let s = 1888; s <= lastSeason; s++) {
    const r = rankOf.get(`${id}|${s}`);
    if (r !== undefined && r <= (sizes[s]?.[1] ?? 0)) { tfSeasons++; if (r === 1) titles++; }
  }
  for (let s = START - 30; s <= lastSeason; s++) {
    const w = Math.pow(0.5, (lastSeason - s) / 8);
    let r = rankOf.get(`${id}|${s}`);
    // 2025/26 League One/Two/NL tables are incomplete: use the 2026/27 division as a proxy level.
    if (r === undefined && START === 2026 && s === 2025) {
      const c = master.find(x => x.id === id);
      r = c.div === 1 ? 10 : c.div === 2 ? 32 : c.div === 3 ? 56 : c.div === 4 ? 80 : NL_RANK;
    }
    if (r === undefined) r = START !== 2026 || s >= 1996 ? NL_RANK + 8 : NL_RANK; // outside tiers 1-4: non-league
    wsum += w; lsum += w * level(r);
  }
  const pedigree = Math.min(6, 0.04 * tfSeasons + 0.4 * titles);
  return { rep: lsum / wsum + pedigree, tfSeasons, titles, pedigree };
}
function stabilityOf(id) {
  const ranks = [];
  // Only seasons inside tiers 1-4 are observable; non-league seasons are treated as unknown.
  const tiersSeen = [];
  for (let s = START - 14; s <= START - 2; s++) { ranks.push(rankOf.get(`${id}|${s}`)); tiersSeen.push(tierAt.get(`${id}|${s}`) ?? 5); }
  const moves = [], tiers = [];
  for (let i = 1; i < ranks.length; i++) if (ranks[i] !== undefined && ranks[i - 1] !== undefined) moves.push(Math.abs(ranks[i] - ranks[i - 1]));
  for (let i = 1; i < ranks.length; i++) tiers.push(tiersSeen[i] !== tiersSeen[i - 1] ? 1 : 0);
  const divChanges = tiers.reduce((a, b) => a + b, 0);
  // With little observable data, fall back to a neutral 7 ranks/yr (typical lower-league churn).
  const vol = moves.length >= 6 ? moves.reduce((a, b) => a + b, 0) / moves.length : 7;
  let st = 68 - 1.1 * vol - 2.0 * divChanges;
  const note = START === 2026 ? STABILITY_NOTES[id] : undefined;
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
  const own = OWN[x.c.id];
  out.push({
    id: x.c.id, name: x.c.name, short: x.c.short, code: x.c.code, country: 'ENG', division: x.c.div,
    // Division in 2025/26 (6 = below the National League). Used to apply the engine's normal
    // promotion/relegation summer adjustment at world creation, consistently with later seasons.
    previousDivision: START === 2026 ? (f ? f.dataTier : 6) : (tierAt.get(`${x.c.id}|${START - 1}`) ?? 6),
    crest: `${x.c.id}.webp`,
    attack: +attack.toFixed(2), midfield: +midfield.toFixed(2), defence: +defence.toFixed(2),
    reputation: +Math.max(20, Math.min(97, rep.rep)).toFixed(2),
    stability: +st.stability.toFixed(2),
    squadQuality: +((attack + midfield + defence) / 3).toFixed(2),
    formEstimate: +form.toFixed(1),
    ambition: own ? own[0] : 0,
    ownerSince: own ? own[1] : null,
    provenance: {
      ratings: x.src === 'fit' ? `fit: ${f.weightedMatches} weighted league matches ${START - 4}/${String(START - 3).slice(2)}-${START - 1}/${String(START).slice(2)}` : `estimate: ${(ESTIMATES[x.c.id] ?? { note: 'no data: division mean' }).note}`,
      reputation: `researched: weighted pyramid level ${START - 30}-${START - 1} + pedigree ${rep.pedigree.toFixed(1)} (${rep.tfSeasons} top-flight seasons, ${rep.titles} titles)`,
      stability: `volatility ${st.volatility.toFixed(1)} ranks/yr, ${st.divChanges} division changes ${START - 14}-${START - 2}` + (st.note ? `; subjective: ${st.note}` : ''),
      ambition: own ? `documented: ${own[2]} (judgement: seed ${own[0] > 0 ? '+' : ''}${own[0].toFixed(2)})` : 'neutral default: no decisive documented ownership change',
      form: f ? `researched: ${resid >= 0 ? '+' : ''}${resid.toFixed(2)} pts/game vs expectation over last ${f.formMatches} league games` : 'no data: neutral',
    },
  });
}
mkdirSync(join(root, 'src/data/england'), { recursive: true });
// Final rankings of the season before a historical start (for cup entry rules that use them).
const previous = START === 2026 ? undefined : Object.fromEntries([1, 2, 3, 4].map(t => [`ENG${t}`, rows.filter(r => r.season === START - 1 && r.tier === t).sort((x, y) => x.pos - y.pos).map(r => r.club)]));
writeFileSync(join(root, START === 2026 ? 'src/data/england/clubs.json' : `src/data/england/clubs-${START}.json`), JSON.stringify({ schema: 1, season: `${START}/${String(START + 1).slice(2)}`, ratingLog: RATING_LOG, midfieldWeight: W, generated: new Date().toISOString().slice(0, 10), ...(previous ? { previousRankings: previous } : {}), clubs: out }, null, 1));
for (const d of [1, 2, 3, 4, 5]) {
  console.log('--- tier', d);
  for (const c of out.filter(c => c.division === d).sort((a, b) => b.squadQuality - a.squadQuality)) console.log(c.short.padEnd(15), 'A', c.attack.toFixed(1), 'M', c.midfield.toFixed(1), 'D', c.defence.toFixed(1), 'Q', c.squadQuality.toFixed(1), 'Rep', c.reputation.toFixed(1), 'St', c.stability.toFixed(1), 'F', c.formEstimate, 'Amb', c.ambition);
}
