// Calibration metrics computed from real engine runs.
// collectSeason() is called after each completed season (before rollover);
// runMetrics() turns a finished run into a flat metrics object.
import { runtime } from '../../src/engine/runtime.ts';

const LEAGUES = ['ENG1', 'ENG2', 'ENG3', 'ENG4', 'ENG5'];

export function newAccumulator(world) {
  const q = c => (c.attack + c.midfield + c.defence) / 3;
  const pl = world.clubs.filter(c => c.league === 'ENG1').sort((a, b) => q(b) - q(a)).map(c => c.id);
  return {
    seasons: [],
    initial: {
      plQualityRank: Object.fromEntries(pl.map((id, i) => [id, i + 1])),
      giants: world.clubs.filter(c => c.reputation >= 88).map(c => c.id),
      lowerClubs: world.clubs.filter(c => ['ENG3', 'ENG4', 'ENG5'].includes(c.league)).map(c => c.id),
      tierOf: Object.fromEntries(world.clubs.map(c => [c.id, LEAGUES.indexOf(c.league) + 1])),
      overallByTier: tierRatings(world),
    },
    ratingsByYear: {},
  };
}

function tierRatings(world) {
  const out = {};
  for (const l of LEAGUES) {
    const v = world.clubs.filter(c => c.league === l).map(c => (c.attack + c.midfield + c.defence) / 3);
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    out[l] = { mean: m, sd: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) };
  }
  return out;
}

/** Per-season statistics from the just-completed season. */
export function collectSeason(world, acc) {
  const rt = runtime(world);
  const s = world.season;
  const st = {};
  for (const l of LEAGUES) {
    const ms = s.matches.filter(m => m.comp === l);
    const n = ms.length;
    let goals = 0, draws = 0, home = 0, m4 = 0, m5 = 0, t6 = 0, tot7 = 0, cs = 0;
    for (const m of ms) {
      const d = m.hg - m.ag;
      goals += m.hg + m.ag;
      if (d === 0) draws++; else if (d > 0) home++;
      const ad = Math.abs(d);
      if (ad >= 4) m4++; if (ad >= 5) m5++;
      if (m.hg >= 6 || m.ag >= 6) t6++;
      if (m.hg + m.ag >= 7) tot7++;
      if (m.hg === 0) cs++; if (m.ag === 0) cs++;
    }
    st[l] = { n, goals, draws, home, m4, m5, t6, tot7, cs };
  }
  // Cross-tier knockout ties (higher-tier progression).
  const cupTiers = {};
  const tierOf = id => s.externals[id] ? 6 : (rt.tierOf.get(id) ?? 9);
  for (const cup of Object.values(s.cups)) for (const t of cup.ties) {
    const ta = tierOf(t.a), tb = tierOf(t.b);
    if (ta === tb || !t.winner) continue;
    const hi = ta < tb ? t.a : t.b;
    const k = `${cup.id}:${Math.min(ta, tb)}v${Math.max(ta, tb)}`;
    cupTiers[k] ??= [0, 0];
    cupTiers[k][0]++;
    if (t.winner === hi) cupTiers[k][1]++;
  }
  acc.seasons.push({ year: s.year, st, cupTiers });
  const idx = world.history.leagues.length - 1;
  if ([0, 24, 49, 99].includes(idx)) acc.ratingsByYear[idx + 1] = tierRatings(world);
}

const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const sum = a => a.reduce((s, x) => s + x, 0);

/** Flat metrics for one run (any length). */
export function runMetrics(world, acc) {
  const H = world.history;
  const N = H.leagues.length;
  const M = {};
  const idx = new Map(world.clubs.map((c, i) => [c.id, i]));
  const leagueAt = (y, id) => H.snapshots[y].league[idx.get(id)];
  const tierAt = (y, id) => LEAGUES.indexOf(leagueAt(y, id)) + 1;

  // ---------------- match statistics (all seasons)
  for (const [l, key] of [['ENG1', 'pl'], ['ENG2', 'ch'], ['ENG3', 'l1'], ['ENG4', 'l2'], ['ENG5', 'nl']]) {
    const a = acc.seasons.map(x => x.st[l]);
    const n = sum(a.map(x => x.n));
    M[`${key}.goalsPerMatch`] = sum(a.map(x => x.goals)) / n;
    M[`${key}.drawPct`] = 100 * sum(a.map(x => x.draws)) / n;
    M[`${key}.homeWinPct`] = 100 * sum(a.map(x => x.home)) / n;
    if (key === 'pl') {
      M['pl.awayWinPct'] = 100 - M['pl.drawPct'] - M['pl.homeWinPct'];
      M['pl.margin4plusPct'] = 100 * sum(a.map(x => x.m4)) / n;
      M['pl.margin5plusPct'] = 100 * sum(a.map(x => x.m5)) / n;
      M['pl.team6plusPct'] = 100 * sum(a.map(x => x.t6)) / n;
      M['pl.total7plusPct'] = 100 * sum(a.map(x => x.tot7)) / n;
      M['pl.cleanSheetPct'] = 100 * sum(a.map(x => x.cs)) / (2 * n);
    }
  }
  // ---------------- points by position
  const pts = (l, pos) => H.leagues.map(s => s[LEAGUES.indexOf(l)].table[pos - 1].pts);
  for (const p of [1, 2, 4, 6, 17, 18, 20]) M[`pl.pts${p}`] = mean(pts('ENG1', p));
  M['pl.championPtsSD'] = sd(pts('ENG1', 1));
  M['pl.withinSeasonSD'] = mean(H.leagues.map(s => sd(s[0].table.map(r => r.pts))));
  for (const [l, key, ps] of [['ENG2', 'ch', [1, 3, 6, 8, 21, 22]], ['ENG3', 'l1', [1, 6, 20, 21]], ['ENG4', 'l2', [1, 7, 22, 23]], ['ENG5', 'nl', [1, 7]]]) {
    for (const p of ps) M[`${key}.pts${p}`] = mean(pts(l, p));
    M[`${key}.withinSeasonSD`] = mean(H.leagues.map(s => sd(s[LEAGUES.indexOf(l)].table.map(r => r.pts))));
  }
  // ---------------- first-season specific
  const plT = H.leagues[0][0].table.map(r => r.club);
  M['first.weakTop4'] = plT.slice(0, 4).filter(c => (acc.initial.plQualityRank[c] ?? 99) >= 11).length;
  M['first.strongBottom5'] = plT.slice(15).filter(c => (acc.initial.plQualityRank[c] ?? 99) <= 6).length;
  M['first.promotedTop4'] = plT.slice(0, 4).filter(c => acc.initial.tierOf[c] === 2 || ['coventry-city', 'ipswich-town', 'hull-city'].includes(c)).length;
  const firstPromoted = ['coventry-city', 'ipswich-town', 'hull-city'];
  M['first.promotedSurvived'] = firstPromoted.filter(c => !H.leagues[0][0].relegated.includes(c)).length / 3 * 100;
  M['first.championPts'] = H.leagues[0][0].table[0].pts;
  M['first.top6Overlap'] = plT.slice(0, 6).filter(c => acc.initial.plQualityRank[c] <= 6).length;

  // ---------------- cups
  const cupAgg = {};
  for (const s of acc.seasons) for (const [k, [n, w]] of Object.entries(s.cupTiers)) { cupAgg[k] ??= [0, 0]; cupAgg[k][0] += n; cupAgg[k][1] += w; }
  for (const [k, [n, w]] of Object.entries(cupAgg)) { M[`cup.${k}.higherPct`] = 100 * w / n; M[`cup.${k}.n`] = n; }

  if (N < 2) return M;

  // ---------------- long-term: titles
  const champs = H.leagues.map(s => s[0].champion);
  let ret = 0; for (let i = 1; i < N; i++) if (champs[i] === champs[i - 1]) ret++;
  M['lt.titleRetentionPct'] = 100 * ret / (N - 1);
  const streaks = []; let cur = 1;
  for (let i = 1; i <= N; i++) { if (i < N && champs[i] === champs[i - 1]) cur++; else { streaks.push(cur); cur = 1; } }
  M['lt.longestStreak'] = Math.max(...streaks);
  M['lt.streaks3plusPerCentury'] = streaks.filter(x => x >= 3).length * 100 / N;
  M['lt.streaks4plusPerCentury'] = streaks.filter(x => x >= 4).length * 100 / N;
  M['lt.streaks5plusPerCentury'] = streaks.filter(x => x >= 5).length * 100 / N;
  for (const w of [10, 25, 50, 100]) if (N >= w) M[`lt.uniqueChampionsFirst${w}`] = new Set(champs.slice(0, w)).size;
  const win = (w, f) => { const v = []; for (let i = 0; i + w <= N; i++) v.push(f(i, w)); return v; };
  if (N >= 10) M['lt.uniqueChampionsIn10'] = mean(win(10, (i, w) => new Set(champs.slice(i, i + w)).size));
  if (N >= 25) M['lt.uniqueChampionsIn25'] = mean(win(25, (i, w) => new Set(champs.slice(i, i + w)).size));
  const topK = (y, k) => H.leagues[y][0].table.slice(0, k).map(r => r.club);
  for (const k of [4, 6]) {
    const v = [];
    for (let y = 1; y < N; y++) { const prev = new Set(topK(y - 1, k)); v.push(topK(y, k).filter(c => !prev.has(c)).length); }
    M[`lt.top${k}NewEntrants`] = mean(v);
  }
  // share of top-6 places held by the 6 most frequent top-6 clubs over the first 30 seasons
  if (N >= 30) {
    const cnt = new Map();
    for (let y = 0; y < 30; y++) for (const c of topK(y, 6)) cnt.set(c, (cnt.get(c) ?? 0) + 1);
    M['lt.top6ShareBest6_30y'] = 100 * [...cnt.values()].sort((a, b) => b - a).slice(0, 6).reduce((a, b) => a + b, 0) / 180;
  }
  M['lt.championPts'] = mean(pts('ENG1', 1));
  // ---------------- membership windows
  const plSet = y => world.clubs.filter((c, i) => H.snapshots[y].league[i] === 'ENG1').map(c => c.id);
  for (const w of [10, 30]) {
    if (N < w) continue;
    const distinct = [], ever = [];
    for (let i = 0; i + w <= N; i += (w === 30 ? 5 : 1)) {
      const cnt = new Map();
      for (let y = i; y < i + w; y++) for (const c of plSet(y)) cnt.set(c, (cnt.get(c) ?? 0) + 1);
      distinct.push(cnt.size); ever.push([...cnt.values()].filter(x => x === w).length);
    }
    M[`lt.distinctPL${w}y`] = mean(distinct); M[`lt.everPresentPL${w}y`] = mean(ever);
  }
  M['lt.uniquePLClubsTotal'] = new Set(Array.from({ length: N }, (_, y) => plSet(y)).flat()).size;
  // ---------------- promoted clubs (all divisions) and relegation recovery
  const promo = (tier) => {
    let n = 0, surv = 0, top4 = 0, topHalf = 0, finish = 0;
    for (let y = 1; y < N - 1; y++) for (let i = 0; i < world.clubs.length; i++) {
      const l = H.snapshots[y].league[i];
      if (LEAGUES.indexOf(l) + 1 !== tier || LEAGUES.indexOf(H.snapshots[y - 1].league[i]) + 1 !== tier + 1) continue;
      n++;
      const pos = H.snapshots[y].position[i];
      finish += pos;
      if (pos <= 4) top4++;
      if (pos <= (tier === 1 ? 10 : 12)) topHalf++;
      if (LEAGUES.indexOf(H.snapshots[y + 1].league[i]) + 1 <= tier) surv++;
    }
    return { n, surv: 100 * surv / n, top4: 100 * top4 / n, topHalf: 100 * topHalf / n, finish: finish / n };
  };
  const p1 = promo(1);
  M['lt.promotedSurvivalPct'] = p1.surv; M['lt.promotedTop4Pct'] = p1.top4; M['lt.promotedTopHalfPct'] = p1.topHalf; M['lt.promotedMeanFinish'] = p1.finish;
  M['lt.chPromotedSurvivalPct'] = promo(2).surv;
  M['lt.l1PromotedSurvivalPct'] = promo(3).surv;
  // relegated from PL: return times
  const back = [];
  for (let y = 1; y < N; y++) for (let i = 0; i < world.clubs.length; i++) {
    if (H.snapshots[y - 1].league[i] !== 'ENG1' || H.snapshots[y].league[i] === 'ENG1') continue;
    let b = null;
    for (let z = y + 1; z < N; z++) if (H.snapshots[z].league[i] === 'ENG1') { b = z - y; break; }
    back.push({ y, b });
  }
  const known = back.filter(r => r.y + 1 < N);
  M['lt.relegatedImmediateReturnPct'] = 100 * known.filter(r => r.b === 1).length / known.length;
  M['lt.relegatedReturnWithin3Pct'] = 100 * back.filter(r => r.y + 3 < N).filter(r => r.b !== null && r.b <= 3).length / back.filter(r => r.y + 3 < N).length;
  M['lt.relegatedReturnWithin10Pct'] = 100 * back.filter(r => r.y + 10 < N).filter(r => r.b !== null && r.b <= 10).length / Math.max(1, back.filter(r => r.y + 10 < N).length);
  // yo-yo clubs: clubs with 3+ Premier League relegations within any 15-season span
  const relegYears = new Map();
  for (let y = 1; y < N; y++) for (let i = 0; i < world.clubs.length; i++) if (H.snapshots[y - 1].league[i] === 'ENG1' && H.snapshots[y].league[i] !== 'ENG1') relegYears.set(i, [...(relegYears.get(i) ?? []), y]);
  M['lt.yoyoClubs'] = [...relegYears.values()].filter(ys => ys.some((y, k) => k + 2 < ys.length && ys[k + 2] - y < 15)).length * 100 / N;
  // ---------------- giants (top-5 by trailing 10-year mean finish, followed 30 years)
  if (N >= 45) {
    const cohorts = [];
    for (let Y = 10; Y + 30 <= N; Y += 5) {
      const avg = new Map();
      for (let y = Y - 10; y < Y; y++) H.leagues[y][0].table.forEach((r, p) => avg.set(r.club, [...(avg.get(r.club) ?? []), p + 1]));
      const top = [...avg.entries()].filter(([, v]) => v.length >= 8).map(([c, v]) => [c, mean(v)]).sort((a, b) => a[1] - b[1]).slice(0, 5).map(x => x[0]);
      for (const c of top) {
        let rel = null, t3 = null;
        for (let y = Y; y < Y + 30; y++) { const t = tierAt(y, c); if (t >= 2 && rel === null) rel = y - Y + 1; if (t >= 3 && t3 === null) t3 = y - Y + 1; }
        cohorts.push({ rel, t3 });
      }
    }
    M['lt.giants30RelegatedPct'] = 100 * cohorts.filter(c => c.rel !== null).length / cohorts.length;
    M['lt.giants30Tier3Pct'] = 100 * cohorts.filter(c => c.t3 !== null).length / cohorts.length;
  }
  // initial historic giants (reputation >= 88 at start)
  const G = acc.initial.giants;
  const horizon = Math.min(50, N);
  M['lt.initialGiantsTier3Before50Pct'] = 100 * G.filter(c => { for (let y = 0; y < horizon; y++) if (tierAt(y, c) >= 3) return true; return false; }).length / G.length;
  M['lt.initialGiantsRelegatedBefore30Pct'] = 100 * G.filter(c => { for (let y = 0; y < Math.min(30, N); y++) if (tierAt(y, c) >= 2) return true; return false; }).length / G.length;
  M['lt.initialGiantsSeasonsOutsidePL50'] = mean(G.map(c => { let k = 0; for (let y = 0; y < horizon; y++) if (tierAt(y, c) >= 2) k++; return k; }));
  M['lt.initialGiantsTier3Seasons50'] = sum(G.map(c => { let k = 0; for (let y = 0; y < horizon; y++) if (tierAt(y, c) >= 3) k++; return k; }));
  M['lt.initialGiantsTitlesShare'] = 100 * champs.filter(c => G.includes(c)).length / N;
  M['lt.initialGiantsTitlesShareLast25'] = N >= 50 ? 100 * champs.slice(N - 25).filter(c => G.includes(c)).length / 25 : NaN;
  // ---------------- risers from tiers 3-5
  const L = acc.initial.lowerClubs;
  for (const h of [25, 50]) if (N >= h) M[`lt.lowerReachPL${h}Pct`] = 100 * L.filter(c => { for (let y = 0; y < h; y++) if (tierAt(y, c) === 1) return true; return false; }).length / L.length;
  if (N >= 50) {
    M['lt.lowerWinTitle50Pct'] = 100 * L.filter(c => champs.slice(0, 50).includes(c)).length / L.length;
    const cupWinners = H.cups.slice(0, 50).flat().map(c => c.winner);
    M['lt.lowerWinMajor50Pct'] = 100 * L.filter(c => champs.slice(0, 50).includes(c) || cupWinners.includes(c)).length / L.length;
  }
  // ---------------- rating distribution drift by tier
  for (const [yr, r] of Object.entries(acc.ratingsByYear)) for (const l of LEAGUES) {
    M[`ratings.y${yr}.${l}.mean`] = r[l].mean; M[`ratings.y${yr}.${l}.sd`] = r[l].sd;
  }
  for (const l of LEAGUES) M[`ratings.y0.${l}.mean`] = acc.initial.overallByTier[l].mean;
  const last = acc.ratingsByYear[100] ?? acc.ratingsByYear[50];
  if (last) M['lt.plMeanRatingDrift'] = last.ENG1.mean - acc.initial.overallByTier.ENG1.mean;
  // reputation: number of clubs with rep >= 85 at the end
  M['lt.reputation85Count'] = world.clubs.filter(c => c.reputation >= 85).length;
  M['lt.stabilityMean'] = mean(world.clubs.map(c => c.stability));
  return M;
}

function sd(a) { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); }
