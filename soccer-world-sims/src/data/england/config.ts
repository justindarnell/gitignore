import { ENGLAND_DERBIES } from './derbies.ts';
import type { CountryConfig, LeagueConfig, PlayoffConfig, SlotRef, Tiebreaker } from '../../engine/types.ts';

// Calendar convention: week 0 = first Saturday on/after 1 August; day 0 = Sat, 1 = Sun,
// 2 = Mon, 3 = Tue, 4 = Wed, 5 = Thu, 6 = Fri. For 2026/27, week 0 = Sat 1 Aug 2026.
const sat = (week: number): SlotRef => ({ week, day: 0 });
const tue = (week: number): SlotRef => ({ week, day: 3 });

// Competition rules for 2026/27 (verified 2026-11-27; see docs/DATA-SOURCES.md):
//  - Premier League: bottom 3 relegated.
//  - Championship: top 2 promoted; NEW six-team play-off (3rd-8th) from 2026/27:
//    one-leg eliminators 5v8 and 6v7 at the higher seed, two-leg semi-finals (3rd vs lowest
//    remaining seed), Wembley final. Bottom 3 relegated.
//  - League One: top 2 + play-offs (3rd-6th); bottom 4 relegated.
//  - League Two: top 3 + play-offs (4th-7th); bottom 2 relegated to the National League.
//  - National League: champions + play-offs (2nd-7th: eliminators 4v7, 5v6; single-leg
//    semi-finals hosted by 2nd and 3rd; final). No relegation in the playable pyramid.
// Tiebreakers: points, goal difference, goals scored, then head-to-head (points, goal
// difference, away goals), then wins, then a drawing of lots (seeded random).
const TIEBREAKERS: Tiebreaker[] = ['points', 'goalDifference', 'goalsFor', 'h2hPoints', 'h2hGoalDifference', 'h2hAwayGoals', 'wins', 'lots'];

const LEAGUE_MIDWEEKS = [2, 5, 9, 11, 15, 18, 21, 24, 26, 28, 31, 34, 37, 38, 35].map(tue);

const championshipPlayoff: PlayoffConfig = {
  id: 'ENG2-PO', name: 'Championship Play-offs',
  rounds: [
    { name: 'Eliminator', newSeeds: [5, 6, 7, 8], legs: 1, venue: 'higher', slots: [{ week: 39, day: 4 }] },
    { name: 'Semi-final', newSeeds: [3, 4], legs: 2, venue: 'higher', slots: [{ week: 40, day: 0 }, { week: 40, day: 4 }] },
    { name: 'Final', newSeeds: [], legs: 1, venue: 'neutral', slots: [{ week: 42, day: 0 }] },
  ],
};
const leagueOnePlayoff: PlayoffConfig = {
  id: 'ENG3-PO', name: 'League One Play-offs',
  rounds: [
    { name: 'Semi-final', newSeeds: [3, 4, 5, 6], legs: 2, venue: 'higher', slots: [{ week: 40, day: 1 }, { week: 40, day: 5 }] },
    { name: 'Final', newSeeds: [], legs: 1, venue: 'neutral', slots: [{ week: 42, day: 1 }] },
  ],
};
const leagueTwoPlayoff: PlayoffConfig = {
  id: 'ENG4-PO', name: 'League Two Play-offs',
  rounds: [
    { name: 'Semi-final', newSeeds: [4, 5, 6, 7], legs: 2, venue: 'higher', slots: [{ week: 40, day: 2 }, { week: 40, day: 6 }] },
    { name: 'Final', newSeeds: [], legs: 1, venue: 'neutral', slots: [{ week: 42, day: 2 }] },
  ],
};
const nationalLeaguePlayoff: PlayoffConfig = {
  id: 'ENG5-PO', name: 'National League Play-offs',
  rounds: [
    { name: 'Eliminator', newSeeds: [4, 5, 6, 7], legs: 1, venue: 'higher', slots: [{ week: 39, day: 3 }] },
    { name: 'Semi-final', newSeeds: [2, 3], legs: 1, venue: 'higher', slots: [{ week: 40, day: 0 }] },
    { name: 'Final', newSeeds: [], legs: 1, venue: 'neutral', slots: [{ week: 41, day: 1 }] },
  ],
};

const leagues: LeagueConfig[] = [
  { id: 'ENG1', name: 'Premier League', short: 'PL', tier: 1, size: 20, autoPromotion: 0, relegation: 3, tiebreakers: TIEBREAKERS,
    startWeek: 3, endWeek: 42, reservedWeeks: [22, 25, 29, 32, 36, 41], midweeks: [9, 18, 31, 34, 21, 38].map(tue), colour: '#8b5cf6' },
  { id: 'ENG2', name: 'Championship', short: 'CH', tier: 2, size: 24, autoPromotion: 2, playoff: championshipPlayoff, relegation: 3, tiebreakers: TIEBREAKERS,
    startWeek: 1, endWeek: 39, reservedWeeks: [22, 25, 29, 32, 36], midweeks: LEAGUE_MIDWEEKS, colour: '#3b82f6' },
  { id: 'ENG3', name: 'League One', short: 'L1', tier: 3, size: 24, autoPromotion: 2, playoff: leagueOnePlayoff, relegation: 4, tiebreakers: TIEBREAKERS,
    startWeek: 1, endWeek: 39, reservedWeeks: [13, 17, 22, 25, 29, 32, 36], midweeks: LEAGUE_MIDWEEKS, colour: '#10b981' },
  { id: 'ENG4', name: 'League Two', short: 'L2', tier: 4, size: 24, autoPromotion: 3, playoff: leagueTwoPlayoff, relegation: 2, tiebreakers: TIEBREAKERS,
    startWeek: 1, endWeek: 39, reservedWeeks: [13, 17, 22, 25, 29, 32, 36], midweeks: LEAGUE_MIDWEEKS, colour: '#f59e0b' },
  { id: 'ENG5', name: 'National League', short: 'NL', tier: 5, size: 24, autoPromotion: 1, playoff: nationalLeaguePlayoff, relegation: 0, tiebreakers: TIEBREAKERS,
    startWeek: 1, endWeek: 39, reservedWeeks: [10, 13, 17, 22, 25, 29, 32, 36], midweeks: LEAGUE_MIDWEEKS, colour: '#ef4444' },
];

// FA Cup (2026/27 structure, simplified where noted in docs/COMPETITIONS.md):
//  Fourth Qualifying Round: 24 National League clubs + 40 non-playable qualifiers (steps 2-3)
//  First Round: + 48 League One/Two clubs; Third Round: + 44 Premier League/Championship clubs.
//  Replays abolished (since 2024/25): extra time and penalties in every round.
//  Semi-finals and final at a neutral venue (Wembley).
// EFL Cup (Carabao Cup), adapted for a world without European competitions:
//  Round One (regional): 70 EFL clubs; the two best-placed clubs relegated from the Premier
//  League receive byes. Round Two (regional): + byes + 13 Premier League clubs.
//  Round Three: + the previous season's top 7 Premier League clubs (proxy for European
//  entrants, who enter in Round Three in reality). No extra time before the final; two-legged
//  semi-finals; drawn ties go straight to penalties.
const relegatedByes = (ctx: { previouslyRelegatedFrom(l: string): string[] }) => ctx.previouslyRelegatedFrom('ENG1').slice(0, 2);
const plTop7 = (ctx: { previousRanking(l: string): string[]; leagueClubs(l: string): string[] }) => {
  const prev = ctx.previousRanking('ENG1').slice(0, 7);
  return ctx.leagueClubs('ENG1').filter(c => prev.includes(c));
};

export const ENGLAND: CountryConfig = {
  id: 'ENG',
  name: 'England',
  seasonStart: { month: 7, day: 1 },
  derbies: ENGLAND_DERBIES,
  leagues,
  cups: [
    {
      id: 'FAC', name: 'FA Cup', short: 'FAC', colour: '#e11d48', prestige: 1,
      format: 'Fourth qualifying round: 24 National League clubs plus 40 non-playable qualifiers (marked Q). League One and Two enter in the First Round; Premier League and Championship clubs in the Third Round. Random draws, no replays: extra time and penalties. Semi-finals and final at a neutral venue.',
      rounds: [
        { name: 'Fourth Qualifying Round', slots: [sat(10)], extraTime: true,
          entrants: ctx => ctx.leagueClubs('ENG5'),
          external: [{ count: 24, label: 'Step 2', level: 2 }, { count: 16, label: 'Step 3', level: 3 }] },
        { name: 'First Round', slots: [sat(13)], extraTime: true, entrants: ctx => [...ctx.leagueClubs('ENG3'), ...ctx.leagueClubs('ENG4')] },
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
      id: 'EFLC', name: 'EFL Cup', short: 'EFL', colour: '#16a34a', prestige: 0.6,
      format: "Regional First and Second Rounds. The two best-placed clubs relegated from the Premier League get byes to Round Two; the previous season's top seven Premier League clubs (a stand-in for European entrants, as European competitions are not simulated) enter in Round Three. No extra time before the final; two-legged semi-finals.",
      rounds: [
        { name: 'First Round', slots: [tue(1)], extraTime: false, regional: true, rotation: 0.8,
          entrants: ctx => {
            const byes = relegatedByes(ctx);
            return [...ctx.leagueClubs('ENG2'), ...ctx.leagueClubs('ENG3'), ...ctx.leagueClubs('ENG4')].filter(c => !byes.includes(c));
          } },
        { name: 'Second Round', slots: [tue(3)], extraTime: false, regional: true, rotation: 1,
          entrants: ctx => {
            const top = plTop7(ctx);
            return [...relegatedByes(ctx).filter(c => ctx.leagueClubs('ENG2').includes(c)), ...ctx.leagueClubs('ENG1').filter(c => !top.includes(c))];
          } },
        { name: 'Third Round', slots: [tue(7)], extraTime: false, rotation: 1, entrants: ctx => plTop7(ctx) },
        { name: 'Fourth Round', slots: [tue(12)], extraTime: false, rotation: 0.8 },
        { name: 'Quarter-final', slots: [tue(19)], extraTime: false, rotation: 0.4 },
        { name: 'Semi-final', slots: [tue(23), tue(27)], extraTime: false },
        { name: 'Final', slots: [{ week: 31, day: 1 }], extraTime: true, neutral: true },
      ],
    },
  ],
  regions: {
    // Premier League
    'afc-bournemouth': 'S', arsenal: 'S', 'aston-villa': 'N', brentford: 'S', 'brighton-and-hove-albion': 'S', chelsea: 'S', 'coventry-city': 'N', 'crystal-palace': 'S', everton: 'N', fulham: 'S', 'hull-city': 'N', 'ipswich-town': 'S', 'leeds-united': 'N', liverpool: 'N', 'manchester-city': 'N', 'manchester-united': 'N', 'newcastle-united': 'N', 'nottingham-forest': 'N', sunderland: 'N', 'tottenham-hotspur': 'S',
    // Championship
    'birmingham-city': 'N', 'blackburn-rovers': 'N', 'bolton-wanderers': 'N', 'bristol-city': 'S', burnley: 'N', 'cardiff-city': 'S', 'charlton-athletic': 'S', 'derby-county': 'N', 'lincoln-city': 'N', middlesbrough: 'N', millwall: 'S', 'norwich-city': 'S', portsmouth: 'S', 'preston-north-end': 'N', 'queens-park-rangers': 'S', 'sheffield-united': 'N', southampton: 'S', 'stoke-city': 'N', 'swansea-city': 'S', watford: 'S', 'west-bromwich-albion': 'N', 'west-ham-united': 'S', 'wolverhampton-wanderers': 'N', wrexham: 'N',
    // League One
    'afc-wimbledon': 'S', barnsley: 'N', blackpool: 'N', 'bradford-city': 'N', bromley: 'S', 'burton-albion': 'N', 'cambridge-united': 'S', 'doncaster-rovers': 'N', 'huddersfield-town': 'N', 'leicester-city': 'N', 'leyton-orient': 'S', 'luton-town': 'S', 'mansfield-town': 'N', 'milton-keynes-dons': 'S', 'notts-county': 'N', 'oxford-united': 'S', 'peterborough-united': 'S', 'plymouth-argyle': 'S', reading: 'S', 'sheffield-wednesday': 'N', stevenage: 'S', 'stockport-county': 'N', 'wigan-athletic': 'N', 'wycombe-wanderers': 'S',
    // League Two
    'accrington-stanley': 'N', barnet: 'S', 'bristol-rovers': 'S', 'cheltenham-town': 'S', chesterfield: 'N', 'colchester-united': 'S', 'crawley-town': 'S', 'crewe-alexandra': 'N', 'exeter-city': 'S', 'fleetwood-town': 'N', gillingham: 'S', 'grimsby-town': 'N', 'newport-county': 'S', 'northampton-town': 'S', 'oldham-athletic': 'N', 'port-vale': 'N', rochdale: 'N', 'rotherham-united': 'N', 'salford-city': 'N', 'shrewsbury-town': 'N', 'swindon-town': 'S', 'tranmere-rovers': 'N', walsall: 'N', 'york-city': 'N',
    // National League
    'afc-fylde': 'N', 'aldershot-town': 'S', altrincham: 'N', barrow: 'N', 'boreham-wood': 'S', 'boston-united': 'N', 'carlisle-united': 'N', eastleigh: 'S', 'fc-halifax-town': 'N', 'forest-green-rovers': 'S', gateshead: 'N', 'harrogate-town': 'N', 'hartlepool-united': 'N', hornchurch: 'S', 'kidderminster-harriers': 'N', 'scunthorpe-united': 'N', 'solihull-moors': 'N', 'southend-united': 'S', 'sutton-united': 'S', tamworth: 'N', wealdstone: 'S', woking: 'S', worthing: 'S', 'yeovil-town': 'S',
  },
};

/** Real 2025/26 outcomes used to seed rules that depend on the previous season. */
export const ENGLAND_PREVIOUS = {
  rankings: {
    ENG1: ['arsenal', 'manchester-city', 'manchester-united', 'aston-villa', 'liverpool', 'afc-bournemouth', 'sunderland', 'brighton-and-hove-albion', 'brentford', 'chelsea', 'fulham', 'newcastle-united', 'everton', 'leeds-united', 'crystal-palace', 'nottingham-forest', 'tottenham-hotspur', 'west-ham-united', 'burnley', 'wolverhampton-wanderers'],
  } as Record<string, string[]>,
  relegated: { ENG1: ['west-ham-united', 'burnley', 'wolverhampton-wanderers'] } as Record<string, string[]>,
};
