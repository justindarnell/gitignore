// Calibration targets derived from data/history/derived/benchmarks.json.
// Each target: metric key (tools/calibrate/metrics.mjs), target value, tolerance (one
// "acceptable deviation"), weight, and the documented historical source / reasoning.
// Score contribution = weight * min((value - target) / tol, 3)^2. Lower is better.
//
// Two groups are scored separately and combined with equal weight, so a model cannot win
// by excelling at short-term realism while destroying long-term dynamics (or vice versa).

export const SHORT = [
  // Premier League match level — recent era (2015/16-2025/26) blended with 1995/96-2025/26
  { m: 'pl.goalsPerMatch', t: 2.78, tol: 0.08, w: 2, src: 'PL 2015-25: 2.82; 1995-25: 2.71' },
  { m: 'pl.drawPct', t: 24.5, tol: 1.5, w: 2, src: 'PL 2015-25: 23.7%; 1995-25: 25.2%' },
  { m: 'pl.homeWinPct', t: 45.0, tol: 2.0, w: 1.5, src: 'PL 2015-25: 44.3%; 1995-25: 45.8%' },
  { m: 'pl.margin5plusPct', t: 2.2, tol: 0.6, w: 1.5, src: 'PL 1995-25: 2.1%; 2015-25: 2.3%' },
  { m: 'pl.team6plusPct', t: 1.15, tol: 0.45, w: 1.5, src: 'PL: 1.1-1.2% of matches have a side scoring 6+' },
  { m: 'pl.cleanSheetPct', t: 27.5, tol: 2.0, w: 0.5, src: 'PL 1995-25: 28.3%; 2015-25: 26.8%' },
  // Premier League points structure (first season of a run)
  { m: 'pl.pts1', t: 87.5, tol: 3.0, w: 3, src: 'Champion: 1995-25 mean 87.5 (2015-25: 90.8; 2024/25-2025/26: 84-85)' },
  { m: 'pl.pts2', t: 80.5, tol: 3.5, w: 1.5, src: 'Runner-up: 1995-25 80.5; 2015-25 82.5' },
  { m: 'pl.pts4', t: 69.0, tol: 2.5, w: 1.5, src: '4th: 2015-25 69.5; 1995-25 68.8' },
  { m: 'pl.pts6', t: 62.0, tol: 2.5, w: 1, src: '6th: 2015-25 62.8; 1995-25 61.4' },
  { m: 'pl.pts17', t: 38.0, tol: 2.0, w: 1.5, src: '17th (safety): 2015-25 37.6; 1995-25 38.1' },
  { m: 'pl.pts18', t: 34.0, tol: 2.5, w: 1.5, src: '18th: 2015-25 32.6; 1995-25 34.7' },
  { m: 'pl.pts20', t: 23.0, tol: 4.0, w: 1, src: '20th: 2015-25 20.6; 1995-25 24.9' },
  { m: 'pl.withinSeasonSD', t: 17.0, tol: 1.2, w: 2, src: 'SD of PL points: 2015-25 17.9; 1995-25 16.5' },
  { m: 'pl.championPtsSD', t: 6.0, tol: 2.0, w: 0.5, src: 'Champion points SD 6.0-6.1' },
  // First-season plausibility (2026/27 start)
  { m: 'first.promotedSurvived', t: 40, tol: 15, w: 2, src: 'Promoted survival 2015-25: 46.7%; this trio includes a +7 GD play-off winner, so a wider band below average' },
  { m: 'first.promotedTop4', t: 0, tol: 0.08, w: 2, src: '0 of 89 promoted clubs finished top 4 since 1995/96' },
  { m: 'first.weakTop4', t: 0.3, tol: 0.25, w: 1, src: 'Clubs outside the pre-season top 10 reaching the top 4: ~0.3/season (judgement from 2015-25 cases)' },
  { m: 'first.strongBottom5', t: 0.1, tol: 0.15, w: 1, src: 'Pre-season top-6 clubs finishing 16th+: rare (~0.1/season)' },
  // Lower divisions
  { m: 'ch.pts1', t: 94.6, tol: 4, w: 1, src: 'Championship champion 1995-25: 94.6' },
  { m: 'ch.pts6', t: 73.5, tol: 3, w: 0.75, src: 'Championship 6th: 73.5' },
  { m: 'ch.withinSeasonSD', t: 14.5, tol: 1.3, w: 1, src: 'Championship points SD 14.5' },
  { m: 'ch.drawPct', t: 27.5, tol: 1.5, w: 0.75, src: 'Championship draws 27.5%' },
  { m: 'ch.goalsPerMatch', t: 2.57, tol: 0.1, w: 0.75, src: 'Championship 2.57 goals' },
  { m: 'l1.pts1', t: 94.4, tol: 4.5, w: 0.75, src: 'League One champion 94.4' },
  { m: 'l1.withinSeasonSD', t: 15.0, tol: 1.5, w: 0.75, src: 'League One points SD 15.0' },
  { m: 'l2.pts1', t: 88.5, tol: 5, w: 0.5, src: 'League Two champion 88.5' },
  { m: 'l2.withinSeasonSD', t: 13.3, tol: 1.5, w: 0.75, src: 'League Two points SD 13.3' },
  // Cross-division cup results (FA Cup ties 1995-2018; squads rotate, so modest weights)
  { m: 'cup.FAC:1v2.higherPct', t: 79.3, tol: 6, w: 0.5, src: 'FA Cup PL v Championship ties: 79.3% (n=400)' },
  { m: 'cup.FAC:2v3.higherPct', t: 61.0, tol: 7, w: 0.5, src: 'FA Cup Championship v League One: 61.0% (n=141)' },
  { m: 'cup.FAC:3v4.higherPct', t: 63.9, tol: 6, w: 0.5, src: 'FA Cup League One v League Two: 63.9% (n=335)' },
  { m: 'cup.EFLC:1v2.higherPct', t: 70.6, tol: 7, w: 0.5, src: 'League Cup PL v Championship: 70.6% (n=293)' },
  { m: 'cup.EFLC:2v4.higherPct', t: 76.2, tol: 6, w: 0.5, src: 'League Cup Championship v League Two: 76.2% (n=336)' },
];

export const LONG = [
  // Titles and the top of the table (blend of Premier League era and post-war top flight)
  { m: 'lt.titleRetentionPct', t: 27, tol: 7, w: 3, src: 'Title retention: PL era 33.3%, post-war 22.8%' },
  { m: 'lt.streaks3plusPerCentury', t: 6, tol: 3.5, w: 2, src: 'Runs of 3+ titles: post-war 4 in 80 seasons (5/century); PL era 3 in 34' },
  { m: 'lt.streaks5plusPerCentury', t: 0, tol: 0.5, w: 2, src: 'No 5-title run in English top-flight history (record: 4)' },
  { m: 'lt.uniqueChampionsIn10', t: 4.3, tol: 0.8, w: 2.5, src: 'Unique champions per 10 years: PL era 3.6, post-war 5.1' },
  { m: 'lt.uniqueChampionsIn25', t: 7.5, tol: 1.6, w: 2, src: 'Per 25 years: PL era 6.0, post-war 9.0' },
  { m: 'lt.top4NewEntrants', t: 1.4, tol: 0.3, w: 2, src: 'New top-4 clubs per season: PL era 1.12, post-war 1.73' },
  { m: 'lt.top6NewEntrants', t: 1.85, tol: 0.4, w: 2, src: 'New top-6 clubs per season: PL era 1.45, post-war 2.25' },
  { m: 'lt.top6ShareBest6_30y', t: 64, tol: 8, w: 1.5, src: 'Share of top-6 places held by the 6 most frequent clubs: PL era 72.5%, post-war 55.2%' },
  { m: 'pl.pts1', t: 88.0, tol: 3.0, w: 2, src: 'Long-run champion points: 1995-25 87.5; 2015-25 90.8' },
  { m: 'pl.withinSeasonSD', t: 16.8, tol: 1.3, w: 1.5, src: 'Long-run PL points SD 16.5-17.9' },
  { m: 'pl.pts18', t: 34.5, tol: 2.5, w: 1, src: 'Relegation threshold (18th) 1995-25: 34.7' },
  // Membership and movement
  { m: 'lt.distinctPL10y', t: 35, tol: 2.5, w: 2, src: 'Distinct top-flight clubs per 10 years: 35 (both eras)' },
  { m: 'lt.distinctPL30y', t: 49, tol: 4, w: 1.5, src: 'Per 30 years: 49 (PL era), 48 (post-war)' },
  { m: 'lt.everPresentPL30y', t: 4.8, tol: 1.8, w: 1.5, src: 'Ever-present clubs over 30 years: PL era 6, post-war 3.6' },
  { m: 'lt.promotedSurvivalPct', t: 52, tol: 6, w: 2.5, src: 'Promoted-club PL survival 1995-25: 52.8%; 2001-24: 54.2%' },
  { m: 'lt.promotedTop4Pct', t: 0.8, tol: 1.0, w: 1.5, src: '0/89 since 1995; rare earlier (e.g. Forest 1977/78 champions)' },
  { m: 'lt.promotedTopHalfPct', t: 19, tol: 6, w: 1, src: 'Promoted clubs finishing top half: 19.1%' },
  { m: 'lt.relegatedImmediateReturnPct', t: 29.7, tol: 7, w: 1.5, src: 'Relegated PL clubs returning next season: 29.7%' },
  { m: 'lt.relegatedReturnWithin3Pct', t: 45, tol: 8, w: 1, src: 'Returning within 3 seasons: 45.1%' },
  { m: 'lt.relegatedReturnWithin10Pct', t: 70, tol: 10, w: 1, src: 'Returning within 10 seasons: 70.1%' },
  { m: 'lt.chPromotedSurvivalPct', t: 82, tol: 7, w: 1, src: 'Clubs promoted to the Championship surviving: 82.0%' },
  { m: 'lt.l1PromotedSurvivalPct', t: 81, tol: 7, w: 0.75, src: 'Clubs promoted to League One surviving: 81.1%' },
  // Rises and falls
  { m: 'lt.giants30RelegatedPct', t: 35, tol: 12, w: 2, src: 'Top-5 clubs (trailing 10y) relegated within 30y: post-war 52%; modern giants sturdier (judgement)' },
  { m: 'lt.giants30Tier3Pct', t: 12, tol: 8, w: 1.5, src: 'Reaching tier 3 within 30y: post-war 26%; modern era lower (judgement)' },
  { m: 'lt.initialGiantsTier3Before50Pct', t: 8, tol: 7, w: 2.5, src: 'Brief: a Liverpool/Arsenal/Man Utd in League One within 40-50 seasons should be unusual, not impossible' },
  { m: 'lt.initialGiantsRelegatedBefore30Pct', t: 30, tol: 15, w: 1, src: 'Post-war: half of giants relegated within 30y; modern giants sturdier (judgement)' },
  { m: 'lt.lowerReachPL25Pct', t: 19.6, tol: 6, w: 1.5, src: 'Tier 3-4 clubs reaching the top flight within 25y: 19.6% (1960-95 cohorts)' },
  { m: 'lt.lowerReachPL50Pct', t: 27.7, tol: 7, w: 1, src: 'Within 50y: 27.7% (1960-75 cohorts)' },
  { m: 'lt.lowerWinTitle50Pct', t: 0.8, tol: 0.8, w: 0.75, src: 'Tier 3-4 clubs winning the title within 50y: 0.78%' },
  // Structural sanity: the pyramid should not drift
  { m: 'lt.plMeanRatingDrift', t: 0, tol: 2.0, w: 1.5, src: 'Mean PL rating should not inflate/deflate over a century' },
];

export function scoreGroup(metrics, targets) {
  let tot = 0, wsum = 0;
  const detail = [];
  for (const g of targets) {
    const v = metrics[g.m];
    if (v === undefined || Number.isNaN(v)) { detail.push({ ...g, v: null, z: null }); continue; }
    const z = (v - g.t) / g.tol;
    const c = Math.min(z * z, 9);
    tot += g.w * c; wsum += g.w;
    detail.push({ m: g.m, t: g.t, tol: g.tol, w: g.w, v, z });
  }
  return { score: wsum ? tot / wsum : NaN, detail };
}
