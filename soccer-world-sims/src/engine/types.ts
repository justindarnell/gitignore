import type { RuleChange } from './rules.ts';
import type { RngState } from './rng.ts';
import type { EngineParams } from './params.ts';

// =====================================================================================
// Static configuration (code/data, never saved). Countries and competitions are described
// declaratively so new countries/leagues can be added without engine changes.
// =====================================================================================

/** Calendar slot: week index from the season's first Saturday + day offset (0 = Sat ... 6 = Fri). */
export interface SlotRef { week: number; day: number }

export type Tiebreaker = 'points' | 'goalDifference' | 'goalsFor' | 'wins' | 'h2hPoints' | 'h2hGoalDifference' | 'h2hAwayGoals' | 'lots';

export interface PlayoffRoundConfig {
  name: string;
  /** League seeds that enter at this round (in addition to previous-round winners). */
  newSeeds: number[];
  legs: 1 | 2;
  /** 'higher' = higher seed hosts (2nd leg for two-legged ties); 'neutral' = neutral venue. */
  venue: 'higher' | 'neutral';
  slots: SlotRef[];
}

export interface PlayoffConfig {
  id: string;
  name: string;            // e.g. "Championship Play-offs"
  rounds: PlayoffRoundConfig[];
}

export interface LeagueConfig {
  id: string;              // permanent competition id, e.g. ENG1
  name: string;            // Premier League
  short: string;           // PL
  tier: number;            // 1 = top of this country's pyramid
  size: number;
  autoPromotion: number;   // automatic promotion places (to tier-1)
  playoff?: PlayoffConfig; // promotion play-off (to tier-1)
  relegation: number;      // relegation places (to tier+1); 0 at the bottom of the playable pyramid
  tiebreakers: Tiebreaker[];
  startWeek: number;
  endWeek: number;
  /** Saturdays the league does not use (cup weekends). */
  reservedWeeks: number[];
  /** Ordered preference list of midweek slots used when Saturdays are insufficient. */
  midweeks: SlotRef[];
  colour: string;
}

export interface CupContext {
  /** Clubs in a league at the start of this season. */
  leagueClubs(leagueId: string): string[];
  /** Previous season's final ranking in a league (club ids, best first); [] if unknown. */
  previousRanking(leagueId: string): string[];
  /** Clubs that were relegated from a league at the end of the previous season, best-placed first. */
  previouslyRelegatedFrom(leagueId: string): string[];
}

/** Non-playable entrants: `level` places them below the playable pyramid (tier = leagues + level - 1);
 *  `rating` overrides the default strength (35 at level 2, 30 below). */
export interface ExternalEntrantSpec { count: number; label: string; level: number; rating?: number }

export interface CupRoundConfig {
  name: string;
  /** One slot (single match) or two (two-legged tie). */
  slots: SlotRef[];
  /** Clubs entering at this round. */
  entrants?: (ctx: CupContext) => string[];
  /** Non-playable external clubs entering at this round (e.g. FA Cup qualifiers). */
  external?: ExternalEntrantSpec[];
  /** Clubs excluded from this round's entrants because they enter later (byes). */
  neutral?: boolean;
  /** true: extra time then penalties; false: straight to penalties after 90 minutes / aggregate. */
  extraTime: boolean;
  /** Draw split into North/South sections. */
  regional?: boolean;
  /** Squad rotation factor for higher-tier clubs (1 = full strength). Applied as a rating penalty. */
  rotation?: number;
  /** Two-legged ties: level aggregates are decided on away goals before extra time (and after it). */
  awayGoals?: boolean;
}

export interface CupConfig {
  id: string;
  name: string;
  short: string;
  rounds: CupRoundConfig[];
  colour: string;
  prestige: number; // for reputation/news weighting
  /** Plain-language format description shown on the cups page. */
  format?: string;
}

export interface CountryConfig {
  id: string;
  name: string;
  leagues: LeagueConfig[];  // ordered by tier
  cups: CupConfig[];
  /** Month (0-11) and minimum day of the season's first Saturday. */
  seasonStart: { month: number; day: number };
  regions: Record<string, 'N' | 'S'>;
  /** Named derbies/rivalries (tracked when both clubs exist in the world). */
  derbies?: DerbyConfig[];
  /** Dated rule changes (src/engine/rules.ts): patches applied from a season onwards. */
  changes?: RuleChange[];
}

// =====================================================================================
// Mutable, serialisable world state.
// =====================================================================================

export interface ClubInfo {
  id: string; name: string; short: string; code: string; country: string; crest: string;
}

export interface ClubState {
  id: string;
  league: string;           // current league id
  attack: number; midfield: number; defence: number;
  reputation: number; stability: number;
  /** Long-term development momentum (rating points per season, persistent AR(1)). */
  era: number;
  /** Championship fatigue (rating points removed from next season's performance). */
  fatigue: number;
  /** Temporary seasonal performance offset (rating points) used this season. */
  seasonOffset: number;
  /** Underlying seasonal-performance state (AR(1) across seasons, before fatigue/carry). */
  luck: number;
  /** In-season form (rating points), mean-reverting random walk. */
  form: number;
  /** Slowly moving institutional anchor that stability reverts to. */
  stabilityAnchor: number;
  /** Rating points carried into next season's performance by events (e.g. coaching turmoil). */
  carry: number;
  /** Ownership ambition, a slow latent trait: -1 asset-stripping, 0 steady, +1 wealthy takeover. */
  ambition: number;
  /** Season of the last ownership change (null = before the simulation / unknown). */
  ownerSince: number | null;
}

export interface Match {
  id: number;
  comp: string;             // competition id (league, cup or playoff id)
  stage: string;            // "Matchday 12", "Third Round", "Semi-final", ...
  slot: number;             // index into season calendar
  home: string; away: string;
  hg?: number; ag?: number; // 90-minute (or 120 with ET) goals, set when played
  et?: boolean;             // extra time played
  pens?: [number, number];  // penalty shoot-out score
  neutral?: boolean;
  leg?: 1 | 2;
  tie?: number;             // knockout tie id
}

export interface TableRow {
  club: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number;
}

export interface Tie {
  id: number;
  comp: string; round: string; roundIndex: number;
  a: string; b: string;     // a = first drawn (home in first/only leg)
  matches: number[];        // match ids
  winner?: string;
  aggregate?: [number, number];
}

export interface CupState {
  id: string;
  roundIndex: number;       // next round to draw
  alive: string[];          // clubs still in the competition (incl. external ids)
  ties: Tie[];
  winner?: string;
  runnerUp?: string;
  drawnRounds: number[];
}

export interface PlayoffState {
  id: string;
  league: string;
  seeds: string[];          // seeds[0] = seed with the lowest league position number in play-offs
  seedPositions: number[];  // league position of each seed
  roundIndex: number;
  alive: string[];
  ties: Tie[];
  winner?: string;
}

export interface CalendarSlot { week: number; day: number; date: string; label: string }

export interface SeasonState {
  year: number;                         // starting year (2026 = 2026/27)
  calendar: CalendarSlot[];
  slotIndex: number;                    // next slot to play
  matches: Match[];
  leagueClubs: Record<string, string[]>;
  /** Pre-season expected order per league (for surprise / news). */
  expected: Record<string, string[]>;
  cups: Record<string, CupState>;
  playoffs: Record<string, PlayoffState>;
  /** Per league: positions after each league matchday (club -> positions array). */
  positionTrack: Record<string, Record<string, number[]>>;
  complete: boolean;
  tables: Record<string, Record<string, TableRow>>;
  /** Club -> league for next season (set when the season is finalised). */
  movements?: Record<string, string>;
  /** Matches by slot for quick lookup (rebuilt on load). */
  nextMatchId: number;
  nextTieId: number;
  externals: Record<string, { name: string; level: number; rating: number }>;
}

export interface Settings {
  realism: number;            // 0..2 multiplier on match strength differences (1 = calibrated)
  upsets: number;             // 0..2 multiplier on per-match randomness
  homeAdvantage: number;      // 0..2 multiplier
  seasonalVariability: number;// 0..2
  growth: number;             // 0..2 long-term growth/decline magnitude
  events: number;             // 0..3 random event frequency (0 = disabled)
  relegationImpact: number;   // 0..2
  reputationProtection: number; // 0..2
  championshipFatigue: number;  // 0..2
  /** 0..2 multiplier on every ownership effect (1 = calibrated, 0 = owners never matter). */
  ownership: number;
  storage: 'essential' | 'standard' | 'full';
}

export interface SeasonSnapshot {
  // Parallel arrays indexed like World.clubs (compact for long histories).
  year: number;
  league: string[];
  position: number[];
  pyramid: number[];
  overall: number[];
  attack: number[]; midfield: number[]; defence: number[];
  reputation: number[]; stability: number[];
}

export interface LeagueSeasonRecord {
  league: string;
  table: TableRow[];
  champion: string;
  promoted: string[];
  promotedViaPlayoff?: string;
  relegated: string[];
  playoffFinal?: { home: string; away: string; hg: number; ag: number; pens?: [number, number]; et?: boolean };
  /** Title/promotion race (Standard+): the top six finishers' cumulative points after each matchday. */
  race?: [string, ...number[]][];
}

export interface CupSeasonRecord {
  cup: string;
  winner: string;
  runnerUp: string;
  final: { home: string; away: string; hg: number; ag: number; pens?: [number, number]; et?: boolean };
  /** Full round-by-round results (Standard storage and above). */
  rounds?: { name: string; matches: CompactMatch[] }[];
}

/** [home, away, hg, ag, flags(bit0 et, bit1 pens), penH, penA] */
export type CompactMatch = [string, string, number, number, number?, number?, number?];

export interface MatchRecord {
  season: number; date: string; comp: string; stage: string;
  home: string; away: string; hg: number; ag: number; et?: boolean; pens?: [number, number];
}

export type TimelineKind = 'event' | 'honour' | 'move' | 'milestone' | 'owner' | 'intervention';

export interface ClubHistory {
  best: MatchRecord[];   // biggest wins, ranked
  worst: MatchRecord[];  // heaviest defeats, ranked
  events: { season: number; text: string; kind: TimelineKind; tone: 1 | 0 | -1 }[];
  /** Matchday-level positions per season: season -> [leagueId, positions...] (Standard+). */
  positions: Record<number, [string, ...number[]]>;
}

/** An automatically detected narrative of a season (see stories.ts). */
export interface Story {
  kind: string;            // 'final-day', 'collapse', 'giant-killing', 'record-points', ...
  league?: string;
  text: string;
  clubs: string[];
  importance: number;      // 1..5 (5 = headline)
}

/** A derby / rivalry between two clubs (country configuration). */
export interface DerbyConfig { id: string; name: string; clubs: [string, string] }

/** Head-to-head aggregate between two clubs (key "a|b" with a < b):
 *  [played, wins a, draws, wins b, goals a, goals b]. Counts every competitive match. */
export type H2H = [number, number, number, number, number, number];

export interface NewsItem { season: number; date: string; text: string; clubs: string[]; kind: string; importance: number }

export interface History {
  snapshots: SeasonSnapshot[];
  leagues: LeagueSeasonRecord[][];  // per season, per league
  cups: CupSeasonRecord[][];        // per season
  clubs: Record<string, ClubHistory>;
  /** League match results per season (Full storage): season -> compact matches. */
  matches: Record<number, CompactMatch[]>;
  records: { biggestWins: MatchRecord[] };
  /** Detected stories per season (all storage levels). */
  stories: Story[][];
  /** Head-to-head aggregates between playable clubs, key "a|b" (a < b), all competitions (all levels). */
  h2h: Record<string, H2H>;
  /** First season counted in h2h (later than the world's start for saves upgraded from schema 2). */
  h2hSince: number;
  /** Most recent derby meetings per derby id (Standard+), newest last. */
  derbyMeetings: Record<string, DerbyMeeting[]>;
}

/** [season, comp, stage, home, away, hg, ag, flags(bit0 et, bit1 pens), penH, penA] */
export type DerbyMeeting = [number, string, string, string, string, number, number, number?, number?, number?];

export interface World {
  schema: number;
  engineVersion: string;
  name: string;
  seed: string;
  created: string;
  country: string;
  rng: RngState;
  /** Calibrated base parameters this world was created with (settings apply on top). */
  params: EngineParams;
  settings: Settings;
  settingsLog: { season: number; slot: number; settings: Settings }[];
  info: Record<string, ClubInfo>;
  clubs: ClubState[];
  /** Economic level curve at the start: rating level by pyramid rank (index 0 = rank 1). */
  levelCurve: number[];
  /**
   * (0.7) Optional path of the economic curve: from `levelCurve` toward `target` between seasons `from` and `to`
   * (amount and shape are the parameters levelPathAmount / levelPathShape). Null: the curve is fixed.
   */
  levelPath: { target: number[]; from: number; to: number } | null;
  season: SeasonState;
  history: History;
  news: NewsItem[];
  /** Ranking of each league at the end of the previous season (for cup entry rules). */
  previousRankings: Record<string, string[]>;
  previousRelegated: Record<string, string[]>;
  /** Start season id (see src/data/england/starts.ts). */
  start: string;
  /** User interventions (what-if edits and injected events), in the order applied. */
  interventions: Intervention[];
  /** Identity and ancestry of this timeline (forks share a seed and history up to the fork point). */
  lineage: Lineage;
}

export interface Intervention {
  id: number;
  season: number;
  slot: number;
  date: string;
  club: string;
  kind: 'edit' | 'takeover' | 'selloff' | 'crisis' | 'windfall';
  /** attribute -> [before, after] */
  changes: Record<string, [number, number]>;
  text: string;
}

export interface Lineage {
  id: string;
  parentId?: string;
  parentName?: string;
  /** Point at which this timeline was forked from its parent. */
  forkedAt?: { season: number; slot: number; date: string };
}
