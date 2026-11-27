import { Rng } from './rng.ts';
import { DEFAULT_PARAMS, DEFAULT_SETTINGS, effectiveParams, type EngineParams } from './params.ts';
import { expectedGoals, sampleExtraTime, sampleScore, shootout, type Side } from './match.ts';
import { buildCalendar, doubleRoundRobin, leagueSlots, slotKey } from './schedule.ts';
import { applyResult, emptyRow, sortTable } from './table.ts';
import { addMatch, COUNTRIES, reindexSeason, runtime, syncRng, type Runtime } from './runtime.ts';
import { evolveClubs } from './evolution.ts';
import { recordMatch, recordSeasonEnd, pushNews, clubHistory } from './history.ts';
import type {
  ClubInfo, ClubState, CountryConfig, CupConfig, CupContext, CupState, LeagueConfig, Match, PlayoffState,
  SeasonState, Settings, TableRow, Tie, World,
} from './types.ts';
import clubsDb from '../data/england/clubs.json' with { type: 'json' };
import { ENGLAND_PREVIOUS } from '../data/england/config.ts';

export const ENGINE_VERSION = '0.5.0';
export const SAVE_SCHEMA = 1;

export interface CreateOptions {
  seed?: string;
  name?: string;
  settings?: Partial<Settings>;
  params?: Partial<EngineParams>;
  startYear?: number;
}

// =====================================================================================
// World creation
// =====================================================================================
export function createWorld(opts: CreateOptions = {}): World {
  const seed = opts.seed ?? String(Date.now());
  const rng = Rng.fromSeed(seed);
  const db = clubsDb as unknown as { clubs: DbClub[] };
  const country = COUNTRIES.ENG;
  const info: Record<string, ClubInfo> = {};
  const clubs: ClubState[] = [];
  for (const c of db.clubs) {
    info[c.id] = { id: c.id, name: c.name, short: c.short, code: c.code, country: c.country, crest: c.crest };
    clubs.push({
      id: c.id, league: country.leagues[c.division - 1].id,
      attack: c.attack, midfield: c.midfield, defence: c.defence,
      reputation: c.reputation, stability: c.stability, stabilityAnchor: c.stability,
      era: 0, fatigue: 0, seasonOffset: 0, form: 0, carry: 0,
    });
  }
  const params = { ...DEFAULT_PARAMS, ...opts.params };
  // The fixed economic "level curve": the rating a club at each pyramid rank typically has.
  const levelCurve = clubs.map(overall).sort((a, b) => b - a);
  const world: World = {
    schema: SAVE_SCHEMA, engineVersion: ENGINE_VERSION,
    name: opts.name ?? 'New world', seed, created: new Date().toISOString(), country: 'ENG',
    rng: rng.state(), params, settings: { ...DEFAULT_SETTINGS, ...opts.settings }, settingsLog: [],
    info, clubs, levelCurve,
    season: undefined as unknown as SeasonState,
    history: { snapshots: [], leagues: [], cups: [], clubs: {}, matches: {}, records: { biggestWins: [] } },
    news: [],
    previousRankings: { ...ENGLAND_PREVIOUS.rankings },
    previousRelegated: { ...ENGLAND_PREVIOUS.relegated },
  };
  for (const c of clubs) world.history.clubs[c.id] = { best: [], worst: [], events: [], positions: {} };
  // Initial form from the database estimate (opposition-adjusted, capped; decays in-season).
  const formOf = new Map(db.clubs.map(c => [c.id, c.formEstimate]));
  startSeason(world, opts.startYear ?? 2026, rng, (id) => ((formOf.get(id) ?? 50) - 50) / 30 * params.initialFormWeight);
  return world;
}

interface DbClub {
  id: string; name: string; short: string; code: string; country: string; division: number; crest: string;
  attack: number; midfield: number; defence: number; reputation: number; stability: number; formEstimate: number;
}

export const overall = (c: { attack: number; midfield: number; defence: number }) => (c.attack + c.midfield + c.defence) / 3;

export function country(world: World): CountryConfig { return COUNTRIES[world.country]; }

// =====================================================================================
// Season start
// =====================================================================================
function startSeason(world: World, year: number, rng: Rng, initialForm?: (id: string) => number): void {
  const ctry = COUNTRIES[world.country];
  const p = runtimeParams(world);
  const leagueClubs: Record<string, string[]> = {};
  for (const l of ctry.leagues) leagueClubs[l.id] = world.clubs.filter(c => c.league === l.id).map(c => c.id);
  for (const l of ctry.leagues) if (leagueClubs[l.id].length !== l.size) throw new Error(`${l.id} has ${leagueClubs[l.id].length} clubs, expected ${l.size}`);

  const calendar = buildCalendar(ctry, year);
  const slotIndexOf = new Map(calendar.map((s, i) => [slotKey(s), i]));
  const season: SeasonState = {
    year, calendar, slotIndex: 0, matches: [], leagueClubs, expected: {}, cups: {}, playoffs: {},
    positionTrack: {}, complete: false, tables: {}, nextMatchId: 1, nextTieId: 1, externals: {},
  };
  world.season = season;

  // Seasonal performance draws: squad quality persists; this season's over/under-performance
  // does not. Championship fatigue and event carry-over shift the mean.
  for (const c of world.clubs) {
    c.seasonOffset = p.seasonSD * rng.normal() - c.fatigue + c.carry;
    c.carry = 0;
    c.form = initialForm ? initialForm(c.id) : 0.3 * c.form;
  }

  const byId = new Map(world.clubs.map(c => [c.id, c]));
  for (const l of ctry.leagues) {
    const ids = leagueClubs[l.id];
    season.tables[l.id] = Object.fromEntries(ids.map(id => [id, emptyRow(id)]));
    // Public expectation = squad quality ranking (hidden seasonal offsets are unknown).
    season.expected[l.id] = [...ids].sort((a, b) => overall(byId.get(b)!) - overall(byId.get(a)!));
    season.positionTrack[l.id] = Object.fromEntries(ids.map(id => [id, []]));
    const rounds = doubleRoundRobin(ids, rng);
    const slots = leagueSlots(l);
    rounds.forEach((round, r) => {
      const slot = slotIndexOf.get(slotKey(slots[r]))!;
      for (const [home, away] of round) season.matches.push({ id: season.nextMatchId++, comp: l.id, stage: `Matchday ${r + 1}`, slot, home, away });
    });
  }
  for (const cup of ctry.cups) season.cups[cup.id] = { id: cup.id, roundIndex: 0, alive: [], ties: [], drawnRounds: [] };
  for (const l of ctry.leagues) if (l.playoff) season.playoffs[l.playoff.id] = { id: l.playoff.id, league: l.id, seeds: [], seedPositions: [], roundIndex: 0, alive: [], ties: [] };
  world.rng = rng.state();
}

function runtimeParams(world: World): EngineParams { return effectiveParams(world.params, world.settings); }

export function club(world: World, id: string): ClubState {
  return runtime(world).clubs.get(id)!;
}

// =====================================================================================
// Stepping
// =====================================================================================
export interface StepResult { kind: 'slot' | 'rollover'; slot?: number; matches?: Match[]; seasonComplete: boolean }

/** Advance the world by one unit: the next calendar slot, or the season rollover. */
export function step(world: World): StepResult {
  if (world.season.complete) {
    rollover(world);
    return { kind: 'rollover', seasonComplete: false };
  }
  const rt = runtime(world);
  const played = playSlot(world, rt);
  syncRng(world);
  return { kind: 'slot', slot: world.season.slotIndex - 1, matches: played, seasonComplete: world.season.complete };
}

function playSlot(world: World, rt: Runtime): Match[] {
  const s = world.season;
  const idx = s.slotIndex;
  if (idx >= s.calendar.length) { finalizeSeason(world, rt); return []; }
  const slot = s.calendar[idx];
  const key = slotKey(slot);
  // Draws for knockout rounds starting in this slot.
  for (const cup of rt.country.cups) {
    const st = s.cups[cup.id];
    const r = cup.rounds[st.roundIndex];
    if (r && slotKey(r.slots[0]) === key) drawCupRound(world, rt, cup, st);
  }
  for (const l of rt.country.leagues) {
    if (!l.playoff) continue;
    const st = s.playoffs[l.playoff.id];
    const r = l.playoff.rounds[st.roundIndex];
    if (r && slotKey(r.slots[0]) === key) drawPlayoffRound(world, rt, l, st);
  }
  const matches = rt.bySlot[idx];
  const leaguesPlayed = new Set<string>();
  for (const m of matches) {
    if (m.hg !== undefined) continue; // never play a fixture twice
    playMatch(world, rt, m);
    if (s.tables[m.comp]) leaguesPlayed.add(m.comp);
  }
  if (world.settings.storage !== 'essential') {
    for (const lid of leaguesPlayed) {
      const order = standings(world, lid);
      order.forEach((r, i) => s.positionTrack[lid][r.club].push(i + 1));
    }
  }
  s.slotIndex++;
  if (s.slotIndex >= s.calendar.length) finalizeSeason(world, rt);
  return matches;
}

// =====================================================================================
// Matches
// =====================================================================================
function sideOf(world: World, rt: Runtime, id: string, opponentTier: number, rotation: number): Side {
  const ext = world.season.externals[id];
  if (ext) return { attack: ext.rating, midfield: ext.rating, defence: ext.rating, perf: 0 };
  const c = rt.clubs.get(id)!;
  let perf = c.seasonOffset + c.form;
  if (rotation > 0) {
    const tier = rt.tierOf.get(id) ?? 9;
    const gap = opponentTier - tier;
    // Stronger clubs rest players against lower-division opposition in early cup rounds.
    if (gap >= 1) perf -= rt.params.rotationPenalty * rotation * (tier === 1 ? 1 : tier === 2 ? 0.6 : 0.35) * Math.min(1, gap / 2);
  }
  return { attack: c.attack, midfield: c.midfield, defence: c.defence, perf };
}

function tierOfAny(world: World, rt: Runtime, id: string): number {
  const ext = world.season.externals[id];
  if (ext) return rt.country.leagues.length + ext.level - 1;
  return rt.tierOf.get(id) ?? 9;
}

function playMatch(world: World, rt: Runtime, m: Match): void {
  const p = rt.params, rng = rt.rng;
  const comp = compInfo(rt, m.comp);
  const rotation = comp.rotation(m.stage);
  const th = tierOfAny(world, rt, m.home), ta = tierOfAny(world, rt, m.away);
  const home = sideOf(world, rt, m.home, ta, rotation), away = sideOf(world, rt, m.away, th, rotation);
  const [lh, la] = expectedGoals(home, away, p, !!m.neutral);
  const [hg, ag] = sampleScore(lh, la, p, rng);
  m.hg = hg; m.ag = ag;
  // In-season form: mean-reverting random walk per match (results do not feed back).
  for (const id of [m.home, m.away]) {
    const c = rt.clubs.get(id);
    if (c) c.form = p.formPersist * c.form + p.formSD * rng.normal();
  }
  const table = world.season.tables[m.comp];
  if (table) applyResult(table, m.home, m.away, hg, ag);
  else resolveKnockout(world, rt, m, lh, la, comp.extraTime(m.stage));
  if (world.settings.storage !== 'essential') recordMatch(world, m);
}

interface CompInfo { rotation(stage: string): number; extraTime(stage: string): boolean }
function compInfo(rt: Runtime, compId: string): CompInfo {
  const cup = rt.country.cups.find(c => c.id === compId);
  if (cup) return {
    rotation: st => cup.rounds.find(r => r.name === st)?.rotation ?? 0,
    extraTime: st => cup.rounds.find(r => r.name === st)?.extraTime ?? true,
  };
  return { rotation: () => 0, extraTime: () => true };
}

function findTie(world: World, m: Match): Tie | undefined {
  const s = world.season;
  if (m.tie === undefined) return undefined;
  for (const c of Object.values(s.cups)) { const t = c.ties.find(x => x.id === m.tie); if (t) return t; }
  for (const p of Object.values(s.playoffs)) { const t = p.ties.find(x => x.id === m.tie); if (t) return t; }
  return undefined;
}

function resolveKnockout(world: World, rt: Runtime, m: Match, lh: number, la: number, extraTime: boolean): void {
  const tie = findTie(world, m);
  if (!tie) return;
  const p = rt.params, rng = rt.rng;
  if (m.leg === 1) return;
  let aggA: number, aggB: number;
  if (m.leg === 2) {
    const first = rt.byId.get(tie.matches[0])!;
    // First leg: a at home. Second leg: b at home.
    aggA = first.hg! + m.ag!; aggB = first.ag! + m.hg!;
  } else { aggA = m.hg!; aggB = m.ag!; }
  if (aggA === aggB && extraTime) {
    const [eh, ea] = sampleExtraTime(lh, la, p, rng);
    m.hg! += eh; m.ag! += ea; m.et = true;
    if (m.leg === 2) { aggA += ea; aggB += eh; } else { aggA += eh; aggB += ea; }
  }
  if (aggA === aggB) {
    const pens = shootout(p, rng);
    m.pens = pens;
    // pens are recorded home-first for this match
    const homeWins = pens[0] > pens[1];
    tie.winner = homeWins ? m.home : m.away;
  } else {
    tie.winner = aggA > aggB ? tie.a : tie.b;
  }
  tie.aggregate = [aggA, aggB];
}

// =====================================================================================
// Standings
// =====================================================================================
export function standings(world: World, leagueId: string): TableRow[] {
  const rt = runtime(world);
  const l = rt.country.leagues.find(x => x.id === leagueId)!;
  const rows = Object.values(world.season.tables[leagueId]);
  const tiedNeedsH2H = l.tiebreakers.some(t => t.startsWith('h2h'));
  const matches = tiedNeedsH2H ? world.season.matches.filter(m => m.comp === leagueId) : [];
  return sortTable(rows, l.tiebreakers, matches, `${world.seed}|${world.season.year}|${leagueId}`);
}

/** Combined pyramid rank (1 = top of tier 1) for a club at a league position. */
export function pyramidRank(world: World, leagueId: string, position: number): number {
  let off = 0;
  for (const l of COUNTRIES[world.country].leagues) {
    if (l.id === leagueId) return off + position;
    off += l.size;
  }
  return off + position;
}

// =====================================================================================
// Cups
// =====================================================================================
function cupContext(world: World): CupContext {
  return {
    leagueClubs: l => world.season.leagueClubs[l] ?? [],
    previousRanking: l => world.previousRankings[l] ?? [],
    previouslyRelegatedFrom: l => world.previousRelegated[l] ?? [],
  };
}

function slotIndex(world: World, ref: { week: number; day: number }): number {
  const k = slotKey(ref);
  return world.season.calendar.findIndex(s => slotKey(s) === k);
}

function drawCupRound(world: World, rt: Runtime, cup: CupConfig, st: CupState): void {
  const r = cup.rounds[st.roundIndex];
  const rng = rt.rng;
  const prev = st.ties.filter(t => t.roundIndex === st.roundIndex - 1);
  if (prev.some(t => !t.winner)) throw new Error(`${cup.id}: previous round unresolved before ${r.name}`);
  const entrants = prev.map(t => t.winner!);
  if (r.entrants) entrants.push(...r.entrants(cupContext(world)));
  for (const ext of r.external ?? []) {
    for (let i = 0; i < ext.count; i++) {
      const id = `x-${cup.id}-${ext.level}-${i + 1}`;
      // Non-playable qualifiers: step 2 ~ rating 35, step 3 ~ 30 (below the National League).
      const rating = (ext.level === 2 ? 35 : 30) + 2 * rng.normal();
      world.season.externals[id] = { name: `${ext.label} Qualifier ${i + 1}`, level: ext.level, rating };
      entrants.push(id);
    }
  }
  if (entrants.length % 2 !== 0) throw new Error(`${cup.id} ${r.name}: odd number of entrants (${entrants.length})`);
  let pairs: [string, string][];
  if (r.regional) {
    const north = rng.shuffle(entrants.filter(c => (rt.country.regions[c] ?? 'N') === 'N'));
    const south = rng.shuffle(entrants.filter(c => (rt.country.regions[c] ?? 'N') === 'S'));
    // Balance odd sections by moving one club across (as the EFL does).
    if (north.length % 2) south.push(north.pop()!);
    pairs = [...pairUp(north), ...pairUp(south)];
  } else pairs = pairUp(rng.shuffle(entrants));
  const legSlots = r.slots.map(sref => slotIndex(world, sref));
  for (const [a, b] of pairs) {
    const tie: Tie = { id: world.season.nextTieId++, comp: cup.id, round: r.name, roundIndex: st.roundIndex, a, b, matches: [] };
    if (legSlots.length === 2) {
      tie.matches.push(addMatch(world, rt, { comp: cup.id, stage: r.name, slot: legSlots[0], home: a, away: b, leg: 1, tie: tie.id }).id);
      tie.matches.push(addMatch(world, rt, { comp: cup.id, stage: r.name, slot: legSlots[1], home: b, away: a, leg: 2, tie: tie.id }).id);
    } else {
      tie.matches.push(addMatch(world, rt, { comp: cup.id, stage: r.name, slot: legSlots[0], home: a, away: b, neutral: r.neutral, tie: tie.id }).id);
    }
    st.ties.push(tie);
  }
  st.drawnRounds.push(st.roundIndex);
  st.alive = []; // refilled with winners as ties are decided
  st.roundIndex++;
}

function pairUp(list: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < list.length; i += 2) out.push([list[i], list[i + 1]]);
  return out;
}

// =====================================================================================
// Play-offs
// =====================================================================================
function drawPlayoffRound(world: World, rt: Runtime, l: LeagueConfig, st: PlayoffState): void {
  const cfg = l.playoff!;
  const r = cfg.rounds[st.roundIndex];
  if (st.roundIndex === 0) {
    const table = standings(world, l.id);
    const seeds = [...new Set(cfg.rounds.flatMap(x => x.newSeeds))].sort((a, b) => a - b);
    st.seedPositions = seeds;
    st.seeds = seeds.map(pos => table[pos - 1].club);
  } else {
    // Winners of previous round
    st.alive = st.ties.filter(t => t.roundIndex === st.roundIndex - 1).map(t => t.winner!);
  }
  const posOf = (c: string) => st.seedPositions[st.seeds.indexOf(c)];
  const entrants = [...st.alive, ...r.newSeeds.map(pos => st.seeds[st.seedPositions.indexOf(pos)])].sort((a, b) => posOf(a) - posOf(b));
  const legSlots = r.slots.map(sref => slotIndex(world, sref));
  const n = entrants.length;
  for (let i = 0; i < n / 2; i++) {
    const hi = entrants[i], lo = entrants[n - 1 - i];
    const tie: Tie = { id: world.season.nextTieId++, comp: cfg.id, round: r.name, roundIndex: st.roundIndex, a: hi, b: lo, matches: [] };
    if (r.legs === 2) {
      // Lower seed hosts the first leg; higher seed hosts the second.
      tie.a = lo; tie.b = hi;
      tie.matches.push(addMatch(world, rt, { comp: cfg.id, stage: r.name, slot: legSlots[0], home: lo, away: hi, leg: 1, tie: tie.id }).id);
      tie.matches.push(addMatch(world, rt, { comp: cfg.id, stage: r.name, slot: legSlots[1], home: hi, away: lo, leg: 2, tie: tie.id }).id);
    } else {
      tie.matches.push(addMatch(world, rt, { comp: cfg.id, stage: r.name, slot: legSlots[0], home: hi, away: lo, neutral: r.venue === 'neutral', tie: tie.id }).id);
    }
    st.ties.push(tie);
  }
  st.roundIndex++;
}

// =====================================================================================
// Season end
// =====================================================================================
function cupWinners(world: World, rt: Runtime): void {
  for (const cup of rt.country.cups) {
    const st = world.season.cups[cup.id];
    const final = st.ties.find(t => t.roundIndex === cup.rounds.length - 1);
    if (final?.winner) { st.winner = final.winner; st.runnerUp = final.winner === final.a ? final.b : final.a; }
  }
}

/** Keep cup `alive` lists current (used by the UI) — winners of the latest round. */
export function cupAlive(st: CupState): string[] {
  const last = Math.max(-1, ...st.ties.map(t => t.roundIndex));
  return st.ties.filter(t => t.roundIndex === last && t.winner).map(t => t.winner!);
}

function finalizeSeason(world: World, rt: Runtime): void {
  const s = world.season;
  if (s.complete) return;
  // Refill cup alive lists for completeness and determine winners.
  for (const st of Object.values(s.cups)) st.alive = cupAlive(st);
  cupWinners(world, rt);
  const leagues = rt.country.leagues;
  const tables: Record<string, TableRow[]> = {};
  for (const l of leagues) tables[l.id] = standings(world, l.id);
  const movements: Record<string, string> = {};
  for (const l of leagues) for (const r of tables[l.id]) movements[r.club] = l.id;
  const promotedBy: Record<string, string[]> = {}, relegatedBy: Record<string, string[]> = {}, playoffWinner: Record<string, string | undefined> = {};
  leagues.forEach((l, i) => {
    const t = tables[l.id];
    const up: string[] = [];
    if (i > 0) {
      up.push(...t.slice(0, l.autoPromotion).map(r => r.club));
      if (l.playoff) {
        const w = s.playoffs[l.playoff.id].ties.find(x => x.roundIndex === l.playoff!.rounds.length - 1)?.winner;
        if (w) { up.push(w); playoffWinner[l.id] = w; }
      }
      for (const c of up) movements[c] = leagues[i - 1].id;
    }
    promotedBy[l.id] = up;
    const down = l.relegation > 0 && i < leagues.length - 1 ? t.slice(t.length - l.relegation).map(r => r.club) : [];
    for (const c of down) movements[c] = leagues[i + 1].id;
    relegatedBy[l.id] = down;
  });
  s.movements = movements;
  s.complete = true;
  recordSeasonEnd(world, rt, tables, promotedBy, relegatedBy, playoffWinner);
  world.previousRankings = Object.fromEntries(leagues.map(l => [l.id, tables[l.id].map(r => r.club)]));
  world.previousRelegated = Object.fromEntries(leagues.map(l => [l.id, relegatedBy[l.id]]));
}

/** Apply club evolution and start the next season. */
export function rollover(world: World): void {
  const rt = runtime(world);
  if (!world.season.complete) throw new Error('Season not complete');
  evolveClubs(world, rt);
  for (const c of world.clubs) c.league = world.season.movements![c.id];
  startSeason(world, world.season.year + 1, rt.rng);
  reindexSeason(world, rt);
  syncRng(world);
}

// =====================================================================================
// Public helpers
// =====================================================================================
export function seasonLabel(year: number): string { return `${year}/${String((year + 1) % 100).padStart(2, '0')}`; }

export function changeSettings(world: World, settings: Partial<Settings>): void {
  world.settings = { ...world.settings, ...settings };
  world.settingsLog.push({ season: world.season.year, slot: world.season.slotIndex, settings: { ...world.settings } });
}

export { pushNews, clubHistory };
