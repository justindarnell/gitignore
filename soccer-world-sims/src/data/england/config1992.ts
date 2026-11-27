import { ENGLAND_DERBIES } from './derbies.ts';
import type { CountryConfig, CupConfig, CupContext, LeagueConfig, PlayoffConfig, SlotRef, Tiebreaker } from '../../engine/types.ts';
import type { RuleChange } from '../../engine/rules.ts';

// England from 1992/93, the first Premier League season. Rules for each era are expressed as data
// (see docs/COMPETITIONS.md, "Historical start: 1992/93"); the engine has no era special cases.
// 0.7: the Football Conference is playable (tier 5) and the rules change over time (`changes` below):
// the 1995 cut to a 20-club Premier League, two-up/two-down with the Conference from 2002/03, the 2004 and
// 2015 renamings, the six-team National League play-off from 2017/18 and the six-team Championship
// play-off from 2026/27. Counts per season were checked against engsoccerdata (tools/history).
//  - Premier League 22 clubs, bottom 3 relegated.
//  - First Division 24: top 2 promoted + play-offs 3rd-6th (two-legged semis, Wembley final); bottom 3 down.
//  - Second Division 24: top 2 + play-offs 3rd-6th; bottom 4 down.
//  - Third Division 22: top 3 + play-offs 4th-7th; bottom club relegated to the Conference (automatic
//    promotion and relegation between the Fourth/Third Division and the Conference began in 1986/87).
//  - Football Conference 22: champions promoted. Ground-grading denials (1993/94-1995/96) are not modelled.
//  - FA Cup: First Round with Second/Third Division and Conference clubs and non-league qualifiers, Third
//    Round with the Premier League and First Division. Replays existed in 1992/93; the engine plays extra time and penalties
//    instead (documented simplification).
//  - League Cup (Coca-Cola Cup): two-legged First and Second Rounds and semi-finals with the away-goals rule.
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
  { id: 'ENG4', name: 'Third Division', short: 'D3', tier: 4, size: 22, autoPromotion: 3, relegation: 1, tiebreakers: TIEBREAKERS,
    playoff: po('ENG4-PO', 'Third Division Play-offs', [4, 5, 6, 7], [{ week: 41, day: 3 }, { week: 41, day: 6 }], { week: 43, day: 1 }),
    startWeek: 2, endWeek: 40, reservedWeeks: [13, 17, 22, 25, 29, 32, 36], midweeks: MIDWEEKS, colour: '#f59e0b' },
  { id: 'ENG5', name: 'Football Conference', short: 'Conf', tier: 5, size: 22, autoPromotion: 1, relegation: 0, tiebreakers: TIEBREAKERS,
    startWeek: 2, endWeek: 40, reservedWeeks: [13, 17, 22, 25, 29, 32, 36], midweeks: MIDWEEKS, colour: '#ef4444' },
];

// Later play-off formats (slots fit the 1992 calendar: league season ends in week 40, FA Cup final Saturday of week 41).
const confPlayoff = (name: string) => po('ENG5-PO', name, [2, 3, 4, 5], [{ week: 41, day: 1 }, { week: 41, day: 4 }], { week: 43, day: 3 });
const nlPlayoff: PlayoffConfig = {
  id: 'ENG5-PO', name: 'National League Play-offs', rounds: [
    { name: 'Eliminator', newSeeds: [4, 5, 6, 7], legs: 1, venue: 'higher', slots: [{ week: 41, day: 1 }] },
    { name: 'Semi-final', newSeeds: [2, 3], legs: 1, venue: 'higher', slots: [{ week: 41, day: 4 }] },
    { name: 'Final', newSeeds: [], legs: 1, venue: 'neutral', slots: [{ week: 43, day: 3 }] },
  ],
};
const championshipPlayoff2026: PlayoffConfig = {
  id: 'ENG2-PO', name: 'Championship Play-offs', rounds: [
    { name: 'Eliminator', newSeeds: [5, 6, 7, 8], legs: 1, venue: 'higher', slots: [{ week: 41, day: 1 }] },
    { name: 'Semi-final', newSeeds: [3, 4], legs: 2, venue: 'higher', slots: [{ week: 41, day: 4 }, { week: 42, day: 1 }] },
    { name: 'Final', newSeeds: [], legs: 1, venue: 'neutral', slots: [{ week: 43, day: 2 }] },
  ],
};

/** Current members of a league, ordered by last season's pyramid standing (clubs relegated into the league
 *  first, then the league's own previous order, then promoted clubs; unknown last). */
function byPreviousStanding(ctx: CupContext, lid: string): string[] {
  const order = ['ENG1', 'ENG2', 'ENG3', 'ENG4', 'ENG5'].flatMap(l => ctx.previousRanking(l));
  const rank = (c: string) => { const i = order.indexOf(c); return i < 0 ? 1e6 : i; };
  return [...ctx.leagueClubs(lid)].sort((a, b) => rank(a) - rank(b));
}
// League Cup: 56 clubs in the two-legged Round One (Second and Third Division + the First Division clubs with
// the lowest previous standing: ten in 1992/93, eight once the Third Division has 24 clubs) and 64 in Round
// Two (+ the other First Division clubs + the Premier League). The Conference does not enter.
const LC_ROUND1 = 56;
const lcFirstDivisionInRound1 = (ctx: CupContext) => LC_ROUND1 - ctx.leagueClubs('ENG3').length - ctx.leagueClubs('ENG4').length;
const lcRound1 = (ctx: CupContext) => { const d1 = byPreviousStanding(ctx, 'ENG2'); return [...d1.slice(d1.length - lcFirstDivisionInRound1(ctx)), ...ctx.leagueClubs('ENG3'), ...ctx.leagueClubs('ENG4')]; };
const lcRound2 = (ctx: CupContext) => { const d1 = byPreviousStanding(ctx, 'ENG2'); return [...d1.slice(0, d1.length - lcFirstDivisionInRound1(ctx)), ...ctx.leagueClubs('ENG1')]; };

// FA Cup First Round: Second and Third Division and Conference clubs plus non-playable qualifiers from lower
// leagues, so that 64 clubs reach the Third Round: 72 First Round clubs while the top two divisions have 46
// clubs, 80 once they have 44 (1995/96 on, as in reality). The qualifiers' rating is the fitted level of the
// Conference's feeder leagues (tools/ratings/fit.mjs --start 1992).
const facRounds = (qualifiers: number): CupConfig['rounds'] => [
  { name: 'First Round', slots: [sat(13)], extraTime: true, entrants: ctx => [...ctx.leagueClubs('ENG3'), ...ctx.leagueClubs('ENG4'), ...ctx.leagueClubs('ENG5')],
    external: [{ count: qualifiers, label: 'Non-league', level: 2, rating: 47 }] },
  { name: 'Second Round', slots: [sat(17)], extraTime: true },
  { name: 'Third Round', slots: [sat(22)], extraTime: true, rotation: 0.6, entrants: ctx => [...ctx.leagueClubs('ENG1'), ...ctx.leagueClubs('ENG2')] },
  { name: 'Fourth Round', slots: [sat(25)], extraTime: true, rotation: 0.4 },
  { name: 'Fifth Round', slots: [sat(29)], extraTime: true, rotation: 0.2 },
  { name: 'Quarter-final', slots: [sat(32)], extraTime: true },
  { name: 'Semi-final', slots: [sat(36)], extraTime: true, neutral: true },
  { name: 'Final', slots: [sat(41)], extraTime: true, neutral: true },
];

// Dated rule changes (each applies from the season starting in `from`). Promotion/relegation counts per season
// were checked against engsoccerdata's league tables (1994/95: 4 down from the Premier League, 2 up/4 down in the
// First Division, 2 up/5 down in the Second, 3 up from the Third; 2002/03: two clubs down to the Conference).
const CHANGES: RuleChange[] = [
  { from: 1994, note: 'Transition to a 20-club Premier League: four clubs relegated from the Premier League and two promoted (champions and play-off winners, play-offs 2nd–5th) from the First and Second Divisions; five relegated from the Second Division; the Third Division grows to 24.',
    leagues: {
      ENG1: { relegation: 4 },
      ENG2: { autoPromotion: 1, relegation: 4, playoff: po('ENG2-PO', 'First Division Play-offs', [2, 3, 4, 5], [{ week: 41, day: 1 }, { week: 41, day: 4 }], { week: 43, day: 2 }) },
      ENG3: { autoPromotion: 1, relegation: 5, playoff: po('ENG3-PO', 'Second Division Play-offs', [2, 3, 4, 5], [{ week: 41, day: 2 }, { week: 41, day: 5 }], { week: 43, day: 0 }) },
      ENG4: { autoPromotion: 2, playoff: po('ENG4-PO', 'Third Division Play-offs', [3, 4, 5, 6], [{ week: 41, day: 3 }, { week: 41, day: 6 }], { week: 43, day: 1 }) },
    } },
  { from: 1995, note: '20-club Premier League (three relegated); First Division three up and three down; Second Division four down; Third Division of 24 with three automatic promotions; FA Cup First Round of 80 clubs.',
    leagues: {
      ENG1: { size: 20, relegation: 3 },
      ENG2: { autoPromotion: 2, relegation: 3, playoff: leagues[1].playoff },
      ENG3: { autoPromotion: 2, relegation: 4, playoff: leagues[2].playoff },
      ENG4: { size: 24, autoPromotion: 3, playoff: leagues[3].playoff },
    },
    cups: { FAC: { rounds: facRounds(10), format: '1995/96 format: Second and Third Division and Conference clubs enter the First Round (80 clubs, with 10 non-playable qualifiers marked Q); Premier League and First Division clubs enter in the Third Round. Replays are not simulated: drawn ties go to extra time and penalties. Semi-finals and final at a neutral venue.' } } },
  { from: 2002, note: 'Two up, two down between the Third Division and the Conference: Conference champions plus play-off winners (2nd–5th).',
    leagues: { ENG4: { relegation: 2 }, ENG5: { playoff: confPlayoff('Conference Play-offs') } } },
  { from: 2004, note: 'Football League divisions renamed Championship, League One and League Two; the Conference top division becomes the Conference National.',
    leagues: {
      ENG2: { name: 'Championship', short: 'CH', playoff: { ...leagues[1].playoff!, name: 'Championship Play-offs' } },
      ENG3: { name: 'League One', short: 'L1', playoff: { ...leagues[2].playoff!, name: 'League One Play-offs' } },
      ENG4: { name: 'League Two', short: 'L2', playoff: { ...leagues[3].playoff!, name: 'League Two Play-offs' } },
      ENG5: { name: 'Conference National', short: 'CN', playoff: confPlayoff('Conference National Play-offs') },
    } },
  { from: 2015, note: 'The Conference National is renamed the National League.', leagues: { ENG5: { name: 'National League', short: 'NL', playoff: confPlayoff('National League Play-offs') } } },
  { from: 2017, note: 'Six-team National League play-off (2nd–7th: eliminators 4v7 and 5v6, semi-finals hosted by 2nd and 3rd).', leagues: { ENG5: { playoff: nlPlayoff } } },
  { from: 2026, note: 'Six-team Championship play-off (3rd–8th: eliminators 5v8 and 6v7, two-legged semi-finals).', leagues: { ENG2: { playoff: championshipPlayoff2026 } } },
];

export const ENGLAND_1992: CountryConfig = {
  id: 'ENG1992',
  name: 'England (1992/93 start)',
  seasonStart: { month: 7, day: 1 },
  derbies: ENGLAND_DERBIES,
  leagues,
  cups: [
    {
      id: 'FAC', name: 'FA Cup', short: 'FAC', colour: '#e11d48', prestige: 1,
      format: '1992/93 format: Second and Third Division and Conference clubs enter the First Round with 4 non-playable non-league qualifiers (marked Q); Premier League and First Division clubs enter in the Third Round. Replays are not simulated: drawn ties go to extra time and penalties. Semi-finals and final at a neutral venue.',
      rounds: facRounds(4),
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
  changes: CHANGES,
};
