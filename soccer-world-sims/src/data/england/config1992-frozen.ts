import { ENGLAND_DERBIES } from './derbies.ts';
import type { CountryConfig, CupContext, LeagueConfig, PlayoffConfig, SlotRef, Tiebreaker } from '../../engine/types.ts';

// FROZEN 0.6 configuration of the 1992/93 start (92 clubs, rules fixed at 1992/93, no playable Conference).
// Kept unchanged so that worlds saved before 0.7 continue exactly as they were (save migration 5 -> 6 points
// them here). New 1992/93 worlds use config1992.ts (Conference and dated rule changes).
//
// England 1992/93: the first Premier League season. Rules for that era are expressed as data
// (see docs/COMPETITIONS.md, "Historical start: 1992/93"); the engine has no era special cases.
//  - Premier League 22 clubs, bottom 3 relegated.
//  - First Division 24: top 2 promoted + play-offs 3rd-6th (two-legged semis, Wembley final); bottom 3 down.
//  - Second Division 24: top 2 + play-offs 3rd-6th; bottom 4 down.
//  - Third Division 22: top 3 + play-offs 4th-7th. In reality the bottom club was relegated to the
//    Conference; the Conference is not playable, so nobody leaves the Football League (documented).
//  - FA Cup: First Round with Second/Third Division clubs and non-league qualifiers, Third Round with the
//    Premier League and First Division. Replays existed in 1992/93; the engine plays extra time and penalties
//    instead (documented simplification).
//  - League Cup (Coca-Cola Cup): two-legged First and Second Rounds and semi-finals with the away-goals rule.
// The 22-club Premier League was cut to 20 in 1995; this world keeps the 1992/93 rules unchanged.
const sat = (week: number): SlotRef => ({ week, day: 0 });
const tue = (week: number): SlotRef => ({ week, day: 3 });
const wed = (week: number): SlotRef => ({ week, day: 4 });

// Tiebreakers kept as in the 2026/27 configuration (goal difference first). The Football League's
// order in the early 1990s may have differed; not verified, so not changed.
const TIEBREAKERS: Tiebreaker[] = ['points', 'goalDifference', 'goalsFor', 'h2hPoints', 'h2hGoalDifference', 'h2hAwayGoals', 'wins', 'lots'];
// League midweeks avoid the League Cup Tuesdays (weeks 1, 3, 7, 10, 12, 16, 19, 23, 27).
const MIDWEEKS = [2, 5, 9, 11, 14, 18, 21, 24, 26, 28, 30, 33, 34, 37, 38, 39, 35, 31].map(wed);

const po = (id: string, name: string, seeds: number[], semi: SlotRef[], final: SlotRef): PlayoffConfig => ({
  id, name, rounds: [
    { name: 'Semi-final', newSeeds: seeds, legs: 2, venue: 'higher', slots: semi },
    { name: 'Final', newSeeds: [], legs: 1, venue: 'neutral', slots: [final] },
  ],
});

const leagues: LeagueConfig[] = [
  { id: 'ENG1', name: 'Premier League', short: 'PL', tier: 1, size: 22, autoPromotion: 0, relegation: 3, tiebreakers: TIEBREAKERS,
    startWeek: 2, endWeek: 40, reservedWeeks: [22, 25, 29, 32, 36], midweeks: MIDWEEKS, colour: '#8b5cf6' },
  { id: 'ENG2', name: 'First Division', short: 'D1', tier: 2, size: 24, autoPromotion: 2, relegation: 3, tiebreakers: TIEBREAKERS,
    playoff: po('ENG2-PO', 'First Division Play-offs', [3, 4, 5, 6], [{ week: 41, day: 1 }, { week: 41, day: 4 }], { week: 43, day: 2 }),
    startWeek: 2, endWeek: 40, reservedWeeks: [22, 25, 29, 32, 36], midweeks: MIDWEEKS, colour: '#3b82f6' },
  { id: 'ENG3', name: 'Second Division', short: 'D2', tier: 3, size: 24, autoPromotion: 2, relegation: 4, tiebreakers: TIEBREAKERS,
    playoff: po('ENG3-PO', 'Second Division Play-offs', [3, 4, 5, 6], [{ week: 41, day: 2 }, { week: 41, day: 5 }], { week: 43, day: 0 }),
    startWeek: 2, endWeek: 40, reservedWeeks: [13, 17, 22, 25, 29, 32, 36], midweeks: MIDWEEKS, colour: '#10b981' },
  { id: 'ENG4', name: 'Third Division', short: 'D3', tier: 4, size: 22, autoPromotion: 3, relegation: 0, tiebreakers: TIEBREAKERS,
    playoff: po('ENG4-PO', 'Third Division Play-offs', [4, 5, 6, 7], [{ week: 41, day: 3 }, { week: 41, day: 6 }], { week: 43, day: 1 }),
    startWeek: 2, endWeek: 40, reservedWeeks: [13, 17, 22, 25, 29, 32, 36], midweeks: MIDWEEKS, colour: '#f59e0b' },
];

/** Current members of a league, ordered by last season's pyramid standing (clubs relegated into the league
 *  first, then the league's own previous order, then promoted clubs; unknown last). */
function byPreviousStanding(ctx: CupContext, lid: string): string[] {
  const order = ['ENG1', 'ENG2', 'ENG3', 'ENG4'].flatMap(l => ctx.previousRanking(l));
  const rank = (c: string) => { const i = order.indexOf(c); return i < 0 ? 1e6 : i; };
  return [...ctx.leagueClubs(lid)].sort((a, b) => rank(a) - rank(b));
}
// League Cup: 56 clubs in Round One (Second and Third Division + the ten First Division clubs with the
// lowest previous standing), 64 in Round Two (+ the other 14 First Division clubs + the Premier League).
const lcRound1 = (ctx: CupContext) => [...byPreviousStanding(ctx, 'ENG2').slice(14), ...ctx.leagueClubs('ENG3'), ...ctx.leagueClubs('ENG4')];
const lcRound2 = (ctx: CupContext) => [...byPreviousStanding(ctx, 'ENG2').slice(0, 14), ...ctx.leagueClubs('ENG1')];

export const ENGLAND_1992_FROZEN: CountryConfig = {
  id: 'ENG1992-0.6',
  name: 'England (1992/93 start, 0.6 rules)',
  seasonStart: { month: 7, day: 1 },
  derbies: ENGLAND_DERBIES,
  leagues,
  cups: [
    {
      id: 'FAC', name: 'FA Cup', short: 'FAC', colour: '#e11d48', prestige: 1,
      format: '1992/93 format: Second and Third Division clubs enter the First Round with 26 non-playable non-league qualifiers (marked Q); Premier League and First Division clubs enter in the Third Round. Replays are not simulated: drawn ties go to extra time and penalties. Semi-finals and final at a neutral venue.',
      rounds: [
        // 46 Second/Third Division clubs + 26 non-league qualifiers (Conference level ~ one tier below the
        // Third Division, from the fitted tier gap; lower non-league one step further). Cup rotation values
        // are the same as in the 2026/27 configuration.
        { name: 'First Round', slots: [sat(13)], extraTime: true, entrants: ctx => [...ctx.leagueClubs('ENG3'), ...ctx.leagueClubs('ENG4')],
          external: [{ count: 16, label: 'Conference', level: 2, rating: 57 }, { count: 10, label: 'Non-league', level: 3, rating: 52 }] },
        { name: 'Second Round', slots: [sat(17)], extraTime: true },
        { name: 'Third Round', slots: [sat(22)], extraTime: true, rotation: 0.6, entrants: ctx => [...ctx.leagueClubs('ENG1'), ...ctx.leagueClubs('ENG2')] },
        { name: 'Fourth Round', slots: [sat(25)], extraTime: true, rotation: 0.4 },
        { name: 'Fifth Round', slots: [sat(29)], extraTime: true, rotation: 0.2 },
        { name: 'Quarter-final', slots: [sat(32)], extraTime: true },
        { name: 'Semi-final', slots: [sat(36)], extraTime: true, neutral: true },
        { name: 'Final', slots: [sat(41)], extraTime: true, neutral: true },
      ],
    },
    {
      id: 'LC', name: 'League Cup', short: 'LC', colour: '#16a34a', prestige: 0.6,
      format: '1992/93 format: two-legged First Round (Second and Third Division clubs and the ten lowest-ranked First Division clubs) and Second Round (with the other First Division clubs and the Premier League), single-leg rounds to the quarter-finals, two-legged semi-finals. Away goals count in two-legged ties; extra time and penalties otherwise.',
      rounds: [
        { name: 'First Round', slots: [tue(1), tue(3)], extraTime: true, awayGoals: true, rotation: 0.8, entrants: lcRound1 },
        { name: 'Second Round', slots: [tue(7), tue(10)], extraTime: true, awayGoals: true, rotation: 1, entrants: lcRound2 },
        { name: 'Third Round', slots: [tue(12)], extraTime: true, rotation: 1 },
        { name: 'Fourth Round', slots: [tue(16)], extraTime: true, rotation: 0.8 },
        { name: 'Quarter-final', slots: [tue(19)], extraTime: true, rotation: 0.4 },
        { name: 'Semi-final', slots: [tue(23), tue(27)], extraTime: true, awayGoals: true },
        { name: 'Final', slots: [{ week: 35, day: 1 }], extraTime: true, neutral: true },
      ],
    },
  ],
  regions: {},
};
