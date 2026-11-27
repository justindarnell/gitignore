// Derived, read-only views of the world used by the UI pages.
import { standings, country, seasonLabel, overall } from '../engine/world.ts';
import { competitionLabel } from '../engine/history.ts';
import type { LeagueConfig, Match, TableRow, World } from '../engine/types.ts';

export { seasonLabel, overall, standings, country };

export function leagues(world: World): LeagueConfig[] { return country(world).leagues; }
/** Number of clubs in the playable pyramid (116 for 2026/27, 92 for 1992/93). */
export function pyramidSize(world: World): number { return leagues(world).reduce((a, l) => a + l.size, 0); }
export function pyramidNote(world: World): string { const ls = leagues(world); return `1 = top of the ${ls[0].name}, ${pyramidSize(world)} = bottom of the ${ls[ls.length - 1].name}`; }
export function league(world: World, id: string): LeagueConfig { return leagues(world).find(l => l.id === id)!; }
export function compLabel(world: World, comp: string, stage?: string): string {
  const l = leagues(world).find(x => x.id === comp);
  if (l) return l.name; // league matches: the competition name only ("Premier League")
  return competitionLabel(world.country, comp, stage);
}

export type Zone = 'champion' | 'promoted' | 'playoff' | 'relegated' | '';
export function zoneOf(l: LeagueConfig, pos: number, tier: number): Zone {
  if (tier > 1 && pos <= l.autoPromotion) return 'promoted';
  if (tier === 1 && pos === 1) return 'champion';
  if (l.playoff) {
    const seeds = l.playoff.rounds.flatMap(r => r.newSeeds);
    if (seeds.includes(pos)) return 'playoff';
  }
  if (l.relegation && pos > l.size - l.relegation) return 'relegated';
  return '';
}

/** Last n results (W/D/L) for a club in the current season, most recent last. */
export function form(world: World, id: string, n = 5): ('W' | 'D' | 'L')[] {
  const out: ('W' | 'D' | 'L')[] = [];
  const played = world.season.matches.filter(m => m.hg !== undefined && (m.home === id || m.away === id)).sort((a, b) => a.slot - b.slot);
  for (const m of played.slice(-n)) {
    const gf = m.home === id ? m.hg! : m.ag!, ga = m.home === id ? m.ag! : m.hg!;
    out.push(gf > ga ? 'W' : gf < ga ? 'L' : m.pens ? ((m.home === id ? m.pens[0] > m.pens[1] : m.pens[1] > m.pens[0]) ? 'W' : 'L') : 'D');
  }
  return out;
}

export function clubLeague(world: World, id: string): string {
  return world.clubs.find(c => c.id === id)!.league;
}

export function positionNow(world: World, id: string): { league: string; pos: number; row: TableRow } {
  const l = clubLeague(world, id); // league changes only at rollover, so this is this season's league
  const t = standings(world, l);
  const i = t.findIndex(r => r.club === id);
  return { league: l, pos: i + 1, row: t[i] };
}

export interface Trophy { comp: string; label: string; seasons: number[] }
/** All honours of a club, from the rolls of honour. */
export function trophies(world: World, id: string): Trophy[] {
  const map = new Map<string, Trophy>();
  const add = (comp: string, label: string, year: number) => {
    if (!map.has(comp)) map.set(comp, { comp, label, seasons: [] });
    map.get(comp)!.seasons.push(year);
  };
  world.history.leagues.forEach((ls, k) => {
    const year = world.history.snapshots[k].year;
    for (const lr of ls) {
      if (lr.champion === id) add(lr.league, league(world, lr.league).name, year);
      if (lr.promotedViaPlayoff === id) add(lr.league + '-PO', `${league(world, lr.league).name} Play-off winners`, year);
    }
  });
  world.history.cups.forEach((cs, k) => {
    const year = world.history.snapshots[k].year;
    for (const c of cs) if (c.winner === id) add(c.cup, country(world).cups.find(x => x.id === c.cup)!.name, year);
  });
  const order = [...leagues(world).map(l => l.id), ...country(world).cups.map(c => c.id)];
  return [...map.values()].sort((a, b) => (order.indexOf(a.comp) < 0 ? 99 : order.indexOf(a.comp)) - (order.indexOf(b.comp) < 0 ? 99 : order.indexOf(b.comp)));
}

/** League titles per club for a league (all time), best first. */
export function titleCounts(world: World, comp: string, from = 0, to = Infinity): { club: string; count: number; last: number }[] {
  const cnt = new Map<string, { club: string; count: number; last: number }>();
  const bump = (c: string, y: number) => { const e = cnt.get(c) ?? { club: c, count: 0, last: y }; e.count++; e.last = Math.max(e.last, y); cnt.set(c, e); };
  world.history.snapshots.forEach((s, k) => {
    if (s.year < from || s.year > to) return;
    const lr = world.history.leagues[k].find(x => x.league === comp);
    if (lr) bump(lr.champion, s.year);
    const cr = world.history.cups[k].find(x => x.cup === comp);
    if (cr) bump(cr.winner, s.year);
  });
  return [...cnt.values()].sort((a, b) => b.count - a.count || b.last - a.last);
}

export function seasonIndex(world: World, year: number): number { return world.history.snapshots.findIndex(s => s.year === year); }

export function matchesForSlot(world: World, slot: number): Match[] { return world.season.matches.filter(m => m.slot === slot); }

/** Matchday numbers for a league: [slot index per round]. */
export function leagueRounds(world: World, leagueId: string): number[] {
  const slots = new Set<number>();
  for (const m of world.season.matches) if (m.comp === leagueId) slots.add(m.slot);
  return [...slots].sort((a, b) => a - b);
}

export function currentRound(world: World, leagueId: string): number {
  const rounds = leagueRounds(world, leagueId);
  const i = rounds.findIndex(s => s >= world.season.slotIndex);
  return i < 0 ? rounds.length : i + 1;
}

export function clubIndex(world: World, id: string): number { return world.clubs.findIndex(c => c.id === id); }

export function nextSlotLabel(world: World): string {
  const s = world.season;
  if (s.complete) return `${seasonLabel(s.year)} complete`;
  return s.calendar[s.slotIndex]?.label ?? '';
}
