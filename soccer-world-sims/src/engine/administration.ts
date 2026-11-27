// Administration (insolvency) and points deductions (0.7).
//
// At the start of every season each club may enter administration. The risk is a small base rate, weighted by
// tier (from the historical share of English administrations per club by division, 1992/93-2024/25) and raised
// by the club's situation: asset-stripping owners (negative ownership ambition), low institutional stability and
// a relegation just suffered. A club in administration
//   * has the league's points deduction applied to this season's table (dated configuration:
//     LeagueConfig.adminDeduction; none before 2004/05 in a 1992 world),
//   * sells players (squad quality falls), loses stability and a little reputation, and
//   * passes to new owners (ownership ambition is reset to a cautious-to-hopeful level).
//
// Draws come from a sub-stream derived from the world's random state at that moment (it consumes nothing from
// the main stream), so switching administration off reproduces the earlier model exactly, and every experiment
// run (re-seeded) gets its own draws.
import { Rng } from './rng.ts';
import type { Runtime } from './runtime.ts';
import type { World } from './types.ts';
import { addEvent, pushNews } from './history.ts';

/** Relative administration risk per club by tier (tier 3 = 1). Historical share per club, 1992/93-2024/25
 *  (Wikipedia "Administration (British football)": 2 top-flight, 13 second-tier, 17 third-tier, 12 fourth-tier
 *  and 7 fifth-tier cases), divided by the number of clubs in the tier: data/history/derived/administrations.json
 *  (tools/history/administrations.mjs). */
export const ADMIN_TIER_WEIGHT = [0.14, 0.76, 1, 0.71, 0.41];

export interface AdminOutcome { club: string; deduction: number; squad: number }

/** Administration risk of a club this season (probability), before the setting multiplier. */
export function adminRisk(p: { adminRate: number; adminAmb: number; adminStab: number; adminReleg: number }, tier: number, ambition: number, stability: number, relegated: boolean): number {
  const w = ADMIN_TIER_WEIGHT[Math.min(tier, ADMIN_TIER_WEIGHT.length) - 1] ?? 0.5;
  const r = Math.exp(p.adminAmb * Math.max(0, -ambition) + p.adminStab * (45 - stability) / 20 + (relegated ? p.adminReleg : 0));
  return Math.min(0.4, p.adminRate * w * r);
}

/** Season-start administrations. Called after the new season is set up (tables exist, no match played). */
export function seasonAdministrations(world: World, rt: Runtime, relegatedLastSeason: Set<string>): AdminOutcome[] {
  const p = rt.params;
  if (!(p.adminRate > 0)) return [];
  const sub = Rng.fromSeed(`admin|${world.rng.join(',')}`);
  const out: AdminOutcome[] = [];
  const s = world.season;
  const date = s.calendar[0].date;
  for (const c of world.clubs) {
    const u = sub.next(), v = sub.next(), x = sub.next();
    const l = rt.country.leagues.find(lg => lg.id === c.league)!;
    if (u >= adminRisk(p, l.tier, c.ambition ?? 0, c.stability, relegatedLastSeason.has(c.id))) continue;
    const deduction = l.adminDeduction ?? 0;
    const squad = p.adminSquad * (0.5 + v);
    for (const k of ['attack', 'midfield', 'defence'] as const) c[k] = Math.max(5, c[k] - squad);
    c.stability = Math.max(5, c.stability - p.adminStability);
    c.reputation = Math.max(1, c.reputation - 1);
    c.era -= 0.5;
    c.ambition = -0.1 + 0.4 * x;
    c.ownerSince = s.year;
    if (deduction) { const row = s.tables[l.id][c.id]; row.pts -= deduction; row.ded = (row.ded ?? 0) + deduction; }
    const text = `Entered administration${deduction ? `: ${deduction}-point deduction` : ' (no points deduction under the rules of the time)'}; players sold, new owners`;
    addEvent(world, c.id, text, 'admin', -1);
    pushNews(world, { date, kind: 'admin', clubs: [c.id], importance: l.tier <= 2 || c.reputation >= 70 ? 4 : 3,
      text: `${world.info[c.id].short} enter administration${deduction ? ` and are deducted ${deduction} points` : ''}.` });
    out.push({ club: c.id, deduction, squad });
  }
  return out;
}
