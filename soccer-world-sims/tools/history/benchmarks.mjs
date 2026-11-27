// Computes historical calibration benchmarks for English league football.
//
// Inputs : data/history/raw/** (run `npm run history:fetch` first)
// Outputs: data/history/derived/season-tables.csv   (compact final tables, 1888/89-2025/26)
//          data/history/derived/benchmarks.json      (all calibration targets with date ranges)
//
// Season numbering: `season` = calendar year in which the season starts (2024 = 2024/25).
// Tables are rebuilt from match results with 3 points per win for every era, and points
// deductions are NOT applied. Promotion/relegation is detected from actual divisional
// membership in the following season, so deductions do not distort movement statistics.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, parseOpenfootball, buildTable, clubKey, mean, sd, quantile, round, summary } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const raw = p => join(root, 'data', 'history', 'raw', p);
const out = join(root, 'data', 'history', 'derived');
mkdirSync(out, { recursive: true });

// ---------------------------------------------------------------- load matches
const matches = []; // {season, tier, div, home, away, hg, ag}
for (const r of parseCsv(readFileSync(raw('engsoccerdata/england.csv'), 'utf8'))) {
  matches.push({ season: +r.Season, tier: +r.tier, div: r.division, home: clubKey(r.home), away: clubKey(r.visitor), hg: +r.hgoal, ag: +r.vgoal });
}
const ofSeason = (season, tier, file) => {
  for (const g of parseOpenfootball(raw(file))) matches.push({ season, tier, div: String(tier), home: clubKey(g.home), away: clubKey(g.away), hg: g.hg, ag: g.ag });
};
// engsoccerdata lacks 2022/23 entirely; openfootball has complete files for it.
for (const t of [1, 2, 3, 4]) ofSeason(2022, t, `openfootball/2022-23/${['', '1-premierleague', '2-championship', '3-league1', '4-league2'][t]}.txt`);
// 2025/26: Premier League and Championship are complete in openfootball; League One/Two are not.
ofSeason(2025, 1, 'openfootball/2025-26/1-premierleague.txt');
ofSeason(2025, 2, 'openfootball/2025-26/2-championship.txt');

// Name aliases so the openfootball spellings match engsoccerdata.
const alias = { 'accrington-stanley': 'accrington', 'cheltenham-town': 'cheltenham', 'stevenage': 'stevenage-borough', 'wolverhampton-wanderers': 'wolverhampton-wanderers', 'brighton-and-hove-albion': 'brighton-and-hove-albion', 'bournemouth': 'afc-bournemouth', 'chelsea': 'chelsea', 'tottenham-hotspur': 'tottenham-hotspur', 'hull-city': 'hull-city', 'ipswich-town': 'ipswich-town', 'coventry-city': 'coventry-city', 'swansea-city': 'swansea-city' };
for (const m of matches) { m.home = alias[m.home] ?? m.home; m.away = alias[m.away] ?? m.away; }

// Partial seasons contribute membership only (no tables).
const membershipOnly = { 2025: { 3: 'openfootball/2025-26/3-league1.txt', 4: 'openfootball/2025-26/4-league2.txt' } };

// ---------------------------------------------------------------- season tables
const bySeasonDiv = new Map();
for (const m of matches) {
  const k = `${m.season}|${m.tier}|${m.div}`;
  if (!bySeasonDiv.has(k)) bySeasonDiv.set(k, []);
  bySeasonDiv.get(k).push(m);
}
/** tables[season][tier] = array of rows (tier 3 pre-1958 merges North and South). */
const tables = {};
const csv = ['season,tier,division,pos,club,p,w,d,l,gf,ga,pts'];
for (const [k, games] of [...bySeasonDiv.entries()].sort()) {
  const [season, tier, div] = k.split('|');
  const t = buildTable(games.map(g => ({ home: g.home, away: g.away, hg: g.hg, ag: g.ag })));
  tables[season] ??= {};
  tables[season][tier] ??= [];
  t.forEach((r, i) => { tables[season][tier].push({ ...r, pos: i + 1, div, size: t.length }); csv.push([season, tier, div, i + 1, r.club, r.p, r.w, r.d, r.l, r.gf, r.ga, r.pts].join(',')); });
}
writeFileSync(join(out, 'season-tables.csv'), csv.join('\n') + '\n');

/** membership[season] = Map club -> tier */
const membership = {};
for (const [s, tiers] of Object.entries(tables)) {
  membership[s] = new Map();
  for (const [tier, rows] of Object.entries(tiers)) for (const r of rows) membership[s].set(r.club, +tier);
}
for (const [s, tiers] of Object.entries(membershipOnly)) {
  for (const [tier, file] of Object.entries(tiers)) {
    for (const g of parseOpenfootball(raw(file))) for (const c of [g.home, g.away]) {
      const key = alias[clubKey(c)] ?? clubKey(c);
      if (!membership[s].has(key)) membership[s].set(key, +tier);
    }
  }
}
// Consistency check: every club in a season should appear in an adjacent season under the same key.
for (const s of [2022, 2023, 2025]) {
  for (const c of membership[s]?.keys() ?? []) {
    if (membership[s - 1] && !membership[s - 1].has(c) && membership[s + 1] && !membership[s + 1].has(c)) console.warn('name check: unmatched club key', s, c);
    else if (s === 2025 && !membership[2024].has(c)) console.warn('name check: new in 2025', c);
  }
}
const tierOf = (s, c) => membership[s]?.get(c) ?? (membership[s] ? 9 : undefined); // 9 = outside tiers 1-4
const seasons = Object.keys(tables).map(Number).sort((a, b) => a - b);
const lastFull = Math.max(...seasons.filter(s => tables[s][1]));

// ---------------------------------------------------------------- helpers
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const table = (s, tier) => (tables[s]?.[tier] ?? []);
const isSingleDiv = (s, tier) => new Set(table(s, tier).map(r => r.div)).size === 1;
const champion = s => table(s, 1)[0]?.club;

function matchStats(sList, tier) {
  const ms = matches.filter(m => m.tier === tier && sList.includes(m.season));
  const n = ms.length;
  const goals = ms.map(m => m.hg + m.ag);
  const scorelines = {};
  for (const m of ms) { const k = `${Math.max(m.hg, m.ag)}-${Math.min(m.hg, m.ag)}`; scorelines[k] = (scorelines[k] ?? 0) + 1; }
  const top = Object.entries(scorelines).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => [k, round(v / n, 4)]);
  const gdist = {};
  for (const g of goals) gdist[Math.min(g, 8)] = (gdist[Math.min(g, 8)] ?? 0) + 1;
  return {
    matches: n,
    goalsPerMatch: round(mean(goals)),
    homeGoals: round(mean(ms.map(m => m.hg))),
    awayGoals: round(mean(ms.map(m => m.ag))),
    homeWinPct: round(100 * ms.filter(m => m.hg > m.ag).length / n, 2),
    drawPct: round(100 * ms.filter(m => m.hg === m.ag).length / n, 2),
    awayWinPct: round(100 * ms.filter(m => m.hg < m.ag).length / n, 2),
    goalillessPct: round(100 * ms.filter(m => m.hg + m.ag === 0).length / n, 2),
    cleanSheetPctPerTeamMatch: round(100 * (ms.filter(m => m.ag === 0).length + ms.filter(m => m.hg === 0).length) / (2 * n), 2),
    margin3plusPct: round(100 * ms.filter(m => Math.abs(m.hg - m.ag) >= 3).length / n, 2),
    margin4plusPct: round(100 * ms.filter(m => Math.abs(m.hg - m.ag) >= 4).length / n, 3),
    margin5plusPct: round(100 * ms.filter(m => Math.abs(m.hg - m.ag) >= 5).length / n, 3),
    teamScored6plusPct: round(100 * ms.filter(m => m.hg >= 6 || m.ag >= 6).length / n, 3),
    total7plusPct: round(100 * ms.filter(m => m.hg + m.ag >= 7).length / n, 3),
    totalGoalsDistribution: Object.fromEntries(Object.entries(gdist).map(([k, v]) => [k === '8' ? '8+' : k, round(v / n, 4)])),
    commonScorelines: top,
  };
}

function pointsByPosition(sList, tier, positions) {
  const res = {};
  for (const p of positions) res[p] = summary(sList.map(s => table(s, tier)[p - 1]?.pts).filter(x => x !== undefined), 1);
  const within = sList.map(s => sd(table(s, tier).map(r => r.pts)));
  res.withinSeasonPointsSD = summary(within, 2);
  res.goalDifferenceChampion = summary(sList.map(s => { const r = table(s, tier)[0]; return r.gf - r.ga; }), 1);
  res.goalDifferenceLast = summary(sList.map(s => { const t = table(s, tier); const r = t[t.length - 1]; return r.gf - r.ga; }), 1);
  return res;
}

/** Promoted clubs: in `tier` in s, in `tier+1` in s-1. Survival: still in `tier` in s+1. */
function promotedStats(sList, tier) {
  const rows = [];
  for (const s of sList) {
    if (!membership[s - 1] || !membership[s + 1]) continue;
    for (const r of table(s, tier)) {
      if (tierOf(s - 1, r.club) === tier + 1) rows.push({ s, club: r.club, pos: r.pos, size: r.size, survived: tierOf(s + 1, r.club) <= tier });
    }
  }
  return {
    clubSeasons: rows.length,
    survivalPct: round(100 * rows.filter(r => r.survived).length / rows.length, 1),
    meanFinish: round(mean(rows.map(r => r.pos)), 2),
    finishDistribution: summary(rows.map(r => r.pos), 1),
    top4Pct: round(100 * rows.filter(r => r.pos <= 4).length / rows.length, 2),
    top6Pct: round(100 * rows.filter(r => r.pos <= 6).length / rows.length, 2),
    topHalfPct: round(100 * rows.filter(r => r.pos <= r.size / 2).length / rows.length, 2),
    allPromotedRelegatedSeasons: sList.filter(s => { const p = rows.filter(r => r.s === s); return p.length >= 3 && p.every(r => !r.survived); }),
  };
}

/** Relegated from `tier`: in tier in s-1, in tier+1 in s. Return: back in `tier` (or higher) in s+1. */
function relegatedStats(sList, tier) {
  const rows = [];
  for (const s of sList) {
    if (!membership[s - 1]) continue;
    for (const r of table(s, tier + 1)) {
      if (tierOf(s - 1, r.club) === tier) {
        let back = null;
        for (let y = s + 1; y <= lastFull + 1 && membership[y]; y++) if (tierOf(y, r.club) <= tier) { back = y - s; break; }
        rows.push({ s, club: r.club, back, censored: back === null });
      }
    }
  }
  const known = rows.filter(r => r.s + 1 <= lastFull);
  return {
    relegations: rows.length,
    immediateReturnPct: round(100 * known.filter(r => r.back === 1).length / known.length, 1),
    returnWithin3Pct: round(100 * known.filter(r => r.back !== null && r.back <= 3).length / known.length, 1),
    returnWithin10Pct: round(100 * rows.filter(r => r.s + 10 <= lastFull + 1).filter(r => r.back !== null && r.back <= 10).length / rows.filter(r => r.s + 10 <= lastFull + 1).length, 1),
    medianSeasonsAwayAmongReturners: quantile(rows.filter(r => r.back !== null).map(r => r.back), 0.5),
  };
}

function longTerm(sList) {
  const champs = sList.map(champion);
  let retentions = 0;
  for (let i = 1; i < champs.length; i++) if (champs[i] === champs[i - 1]) retentions++;
  const streaks = [];
  let cur = 1;
  for (let i = 1; i <= champs.length; i++) {
    if (i < champs.length && champs[i] === champs[i - 1]) cur++;
    else { streaks.push(cur); cur = 1; }
  }
  const streakDist = {};
  for (const s of streaks) streakDist[s] = (streakDist[s] ?? 0) + 1;
  const turnover = k => {
    const v = [];
    for (let i = 1; i < sList.length; i++) {
      const prev = new Set(table(sList[i - 1], 1).slice(0, k).map(r => r.club));
      v.push(table(sList[i], 1).slice(0, k).filter(r => !prev.has(r.club)).length);
    }
    return summary(v, 2);
  };
  const windowUnique = w => {
    const v = [];
    for (let i = 0; i + w <= champs.length; i++) v.push(new Set(champs.slice(i, i + w)).size);
    return v.length ? summary(v, 2) : null;
  };
  const windowClubs = w => {
    const v = [], ever = [];
    for (let i = 0; i + w <= sList.length; i++) {
      const cnt = new Map();
      for (const s of sList.slice(i, i + w)) for (const r of table(s, 1)) cnt.set(r.club, (cnt.get(r.club) ?? 0) + 1);
      v.push(cnt.size);
      ever.push([...cnt.values()].filter(x => x === w).length);
    }
    return v.length ? { distinctTopFlightClubs: summary(v, 1), everPresentClubs: summary(ever, 1) } : null;
  };
  const top6Share = (() => {
    // share of top-6 places taken by the 6 clubs with most top-6 finishes in the window
    const cnt = new Map();
    for (const s of sList) for (const r of table(s, 1).slice(0, 6)) cnt.set(r.club, (cnt.get(r.club) ?? 0) + 1);
    const best = [...cnt.values()].sort((a, b) => b - a).slice(0, 6).reduce((a, b) => a + b, 0);
    return round(100 * best / (6 * sList.length), 1);
  })();
  return {
    seasons: `${sList[0]}/${String(sList[0] + 1).slice(2)}-${sList.at(-1)}/${String(sList.at(-1) + 1).slice(2)}`,
    uniqueChampions: new Set(champs).size,
    titleRetentionPct: round(100 * retentions / (champs.length - 1), 1),
    longestStreak: Math.max(...streaks),
    streakDistribution: streakDist,
    top4NewEntrantsPerSeason: turnover(4),
    top6NewEntrantsPerSeason: turnover(6),
    uniqueChampionsIn10Years: windowUnique(10),
    uniqueChampionsIn25Years: windowUnique(25),
    topFlight10YearWindows: windowClubs(10),
    topFlight30YearWindows: windowClubs(30),
    top6PlacesHeldByBest6ClubsPct: top6Share,
    championsList: Object.fromEntries(sList.map((s, i) => [s, champs[i]])),
  };
}

/** Pyramid rank (1 = top of tier 1) where divisions are single tables. */
function pyramidRank(s, club) {
  let offset = 0;
  for (let tier = 1; tier <= 4; tier++) {
    const t = table(s, tier);
    if (!t.length) return null;
    if (!isSingleDiv(s, tier)) return null;
    const r = t.find(x => x.club === club);
    if (r) return offset + r.pos;
    offset += t.length;
  }
  return offset + 1;
}

/** How quickly do established giants fall, and how often? */
function giants(baseYears, horizon, topN = 5) {
  const out = [];
  for (const Y of baseYears) {
    const window = range(Y - 9, Y);
    const avg = new Map();
    for (const s of window) for (const r of table(s, 1)) avg.set(r.club, [...(avg.get(r.club) ?? []), r.pos]);
    const ranked = [...avg.entries()].filter(([, v]) => v.length >= 8).map(([c, v]) => [c, mean(v)]).sort((a, b) => a[1] - b[1]).slice(0, topN);
    for (const [club] of ranked) {
      let firstRelegation = null, firstTier3 = null, seasonsOutsideTop = 0;
      for (let y = Y + 1; y <= Math.min(Y + horizon, lastFull + 1); y++) {
        const t = tierOf(y, club);
        if (t === undefined) continue;
        if (t >= 2) { seasonsOutsideTop++; firstRelegation ??= y - Y; }
        if (t >= 3) firstTier3 ??= y - Y;
      }
      out.push({ base: Y, club, firstRelegation, firstTier3, seasonsOutsideTop });
    }
  }
  const n = out.length;
  return {
    definition: `Top ${topN} clubs by mean top-flight finish over the 10 seasons up to each base year; followed for ${horizon} seasons.`,
    baseYears: `${baseYears[0]}-${baseYears.at(-1)}`,
    clubCohorts: n,
    relegatedWithinHorizonPct: round(100 * out.filter(r => r.firstRelegation !== null).length / n, 1),
    relegatedWithin10Pct: round(100 * out.filter(r => r.firstRelegation !== null && r.firstRelegation <= 10).length / n, 1),
    relegatedWithin20Pct: round(100 * out.filter(r => r.firstRelegation !== null && r.firstRelegation <= 20).length / n, 1),
    reachedTier3WithinHorizonPct: round(100 * out.filter(r => r.firstTier3 !== null).length / n, 1),
    reachedTier3Within40Pct: round(100 * out.filter(r => r.firstTier3 !== null && r.firstTier3 <= 40).length / n, 1),
    medianYearsToFirstRelegation: quantile(out.filter(r => r.firstRelegation !== null).map(r => r.firstRelegation), 0.5),
    meanSeasonsOutsideTopFlight: round(mean(out.map(r => r.seasonsOutsideTop)), 2),
    examples: out.filter(r => r.firstTier3 !== null).map(r => `${r.club} (top-${topN} in ${r.base}; tier 3 after ${r.firstTier3} seasons)`).filter((v, i, a) => a.indexOf(v) === i).slice(0, 25),
  };
}

/** Clubs in tier >= 3 at Y: how many reach tier 1 / win the title within `horizon`. */
function risers(baseYears, horizon) {
  const res = [];
  for (const Y of baseYears) {
    const low = [...membership[Y].entries()].filter(([, t]) => t >= 3 && t <= 4).map(([c]) => c);
    let reached = 0, won = 0;
    for (const c of low) {
      let r = false, w = false;
      for (let y = Y + 1; y <= Math.min(Y + horizon, lastFull); y++) { if (tierOf(y, c) === 1) r = true; if (champion(y) === c) w = true; }
      if (r) reached++; if (w) won++;
    }
    res.push({ Y, n: low.length, reached, won });
  }
  return {
    definition: `Clubs in tiers 3-4 at base year; share reaching tier 1 / winning the title within ${horizon} seasons.`,
    baseYears: `${baseYears[0]}-${baseYears.at(-1)}`,
    reachTopFlightPct: round(100 * mean(res.map(r => r.reached / r.n)), 1),
    winTitlePct: round(100 * mean(res.map(r => r.won / r.n)), 2),
    meanClubsReachingTopFlight: round(mean(res.map(r => r.reached)), 1),
  };
}

function titleDefenceDetail(sList) {
  // Points drop of champions in their defence season.
  const d = [];
  for (let i = 1; i < sList.length; i++) {
    const c = champion(sList[i - 1]);
    const prev = table(sList[i - 1], 1)[0].pts;
    const r = table(sList[i], 1).find(x => x.club === c);
    if (r) d.push({ drop: prev - r.pts, pos: r.pos });
  }
  return { championPointsChangeNextSeason: summary(d.map(x => -x.drop), 1), defenderFinish: summary(d.map(x => x.pos), 1), defenderTop4Pct: round(100 * d.filter(x => x.pos <= 4).length / d.length, 1) };
}

/**
 * Cross-division cup ties: how often does the higher-tier club progress?
 * This is the only direct evidence for the size of the strength gap between divisions.
 * Tier 9 = club outside tiers 1-4 (non-league). Home/away is taken from the first match.
 */
function cupTiers(file, sList, label) {
  const rows = parseCsv(readFileSync(raw(file), 'utf8')).filter(r => sList.includes(+r.Season));
  const ties = new Map();
  for (const r of rows) {
    const h = alias[clubKey(r.home)] ?? clubKey(r.home), v = alias[clubKey(r.visitor)] ?? clubKey(r.visitor);
    const key = `${r.Season}|${r.round}|${[h, v].sort().join('|')}`;
    if (!ties.has(key)) ties.set(key, []);
    ties.get(key).push({ ...r, h, v });
  }
  const agg = {};
  for (const games of ties.values()) {
    const first = games[0], last = games[games.length - 1];
    const s = +first.Season;
    const th = tierOf(s, first.h), tv = tierOf(s, first.v);
    if (th === undefined || tv === undefined || th === tv) continue;
    let winner;
    if (games.length === 2 && (first.leg === '1' || last.leg === '2')) {
      const a = (+first.hgoal) + (+last.vgoal), b = (+first.vgoal) + (+last.hgoal);
      winner = a > b ? first.h : a < b ? first.v : null;
    } else {
      const hg = +last.hgoal, vg = +last.vgoal;
      winner = hg > vg ? last.h : hg < vg ? last.v : null;
    }
    if (winner === null) {
      const hp = +last.hp, vp = +last.vp;
      if (Number.isFinite(hp) && Number.isFinite(vp) && hp !== vp) winner = hp > vp ? last.h : last.v;
      else continue;
    }
    const hi = th < tv ? first.h : first.v;
    const hiHome = th < tv;
    const k = `${Math.min(th, tv)}v${Math.max(th, tv)}`;
    agg[k] ??= { ties: 0, higherProgressed: 0, higherAtHome: 0, higherAtHomeProgressed: 0 };
    const a = agg[k];
    a.ties++; if (winner === hi) a.higherProgressed++;
    if (hiHome) { a.higherAtHome++; if (winner === hi) a.higherAtHomeProgressed++; }
  }
  const res = { source: label, seasons: `${sList[0]}-${sList.at(-1)}` };
  for (const [k, a] of Object.entries(agg).sort()) {
    if (a.ties < 15) continue;
    res[k] = { ties: a.ties, higherTierProgressedPct: round(100 * a.higherProgressed / a.ties, 1), higherTierHomeProgressedPct: a.higherAtHome ? round(100 * a.higherAtHomeProgressed / a.higherAtHome, 1) : null, higherTierAwayProgressedPct: a.ties - a.higherAtHome ? round(100 * (a.higherProgressed - a.higherAtHomeProgressed) / (a.ties - a.higherAtHome), 1) : null };
  }
  return res;
}

// ---------------------------------------------------------------- windows
const PL20 =range(1995, lastFull);        // 20-club Premier League (1995/96 onwards)
const PL_RECENT = range(2015, lastFull);   // last 11 seasons
const PL_ERA = range(1992, lastFull);
const POSTWAR = range(1946, lastFull);
const TIER24 = t => range(1995, t === 2 ? lastFull : 2024).filter(s => table(s, t).length === 24);

const benchmarks = {
  generated: new Date().toISOString().slice(0, 10),
  notes: [
    'season = starting year (2024 = 2024/25).',
    'Tables rebuilt from results with 3 points per win; points deductions not applied.',
    'Promotion/relegation derived from the following season\'s divisional membership.',
    `Data: engsoccerdata 1888/89-2024/25 (tiers 1-4); openfootball 2025/26 (PL and Championship complete; League One/Two used for membership only).`,
  ],
  lastCompleteSeason: lastFull,
  premierLeague: {
    matchStats20Club: { seasons: '1995/96-' + lastFull, ...matchStats(PL20, 1) },
    matchStatsRecent: { seasons: '2015/16-' + lastFull, ...matchStats(PL_RECENT, 1) },
    points20Club: pointsByPosition(PL20, 1, [1, 2, 3, 4, 5, 6, 10, 17, 18, 20]),
    pointsRecent: pointsByPosition(PL_RECENT, 1, [1, 2, 4, 6, 17, 18, 20]),
    promoted20Club: promotedStats(range(1995, lastFull - 1).filter(s => table(s, 1).length === 20), 1),
    promotedRecent: promotedStats(range(2015, lastFull - 1), 1),
    promoted2001to2024: promotedStats(range(2001, 2024), 1),
    relegatedFromPL: relegatedStats(range(1995, lastFull), 1),
    longTermPLEra: longTerm(PL_ERA),
    titleDefencePLEra: titleDefenceDetail(PL_ERA),
  },
  topFlightPostwar: {
    longTerm: longTerm(POSTWAR),
    titleDefence: titleDefenceDetail(POSTWAR),
    giants50y: giants(range(1955, 1975), 50),
    giants30y: giants(range(1955, 1995), 30),
    risers25y: risers(range(1960, 1995), 25),
    risers50y: risers(range(1960, 1975), 50),
  },
  championship: {
    matchStats: matchStats(TIER24(2), 2),
    points: pointsByPosition(TIER24(2), 2, [1, 2, 3, 6, 7, 8, 21, 22, 24]),
    promoted: promotedStats(TIER24(2).filter(s => s < lastFull), 2),
    relegated: relegatedStats(TIER24(2), 2),
  },
  leagueOne: {
    matchStats: matchStats(TIER24(3), 3),
    points: pointsByPosition(TIER24(3), 3, [1, 2, 3, 6, 7, 20, 21, 24]),
    promoted: promotedStats(TIER24(3).filter(s => s < 2024), 3),
  },
  leagueTwo: {
    matchStats: matchStats(TIER24(4), 4),
    points: pointsByPosition(TIER24(4), 4, [1, 3, 4, 7, 8, 22, 23, 24]),
  },
  cups: {
    faCup: cupTiers('engsoccerdata/facup.csv', range(1995, 2018), 'FA Cup (engsoccerdata)'),
    leagueCup: cupTiers('engsoccerdata/leaguecup.csv', range(1995, 2018), 'League Cup (engsoccerdata)'),
  },
  pyramidRankExample: { 'manchester-city-2025': pyramidRank(2025, 'manchester-city'), 'manchester-city-1998': pyramidRank(1998, 'manchester-city') },
};

writeFileSync(join(out, 'benchmarks.json'), JSON.stringify(benchmarks, null, 1));
console.log(JSON.stringify(benchmarks, (k, v) => (k === 'championsList' || k === 'commonScorelines' || k === 'examples' || k === 'totalGoalsDistribution') ? undefined : v, 1));
