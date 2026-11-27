import type { Runtime } from './runtime.ts';
import type { ClubHistory, CompactMatch, CupSeasonRecord, LeagueSeasonRecord, Match, MatchRecord, NewsItem, TableRow, World } from './types.ts';
import { COUNTRIES } from './runtime.ts';

const MAX_RECORDS = 8;
const MAX_WORLD_RECORDS = 25;
const MAX_NEWS = 6000;

export function clubHistory(world: World, id: string): ClubHistory {
  return world.history.clubs[id] ??= { best: [], worst: [], events: [], positions: {} };
}

/** Human-readable competition + stage, e.g. "FA Cup Semi-final", "Championship Play-off Final". */
export function competitionLabel(countryId: string, comp: string, stage?: string): string {
  const c = COUNTRIES[countryId];
  const league = c.leagues.find(l => l.id === comp);
  if (league) return league.name;
  const cup = c.cups.find(x => x.id === comp);
  if (cup) return stage ? `${cup.name} ${stage}` : cup.name;
  const po = c.leagues.find(l => l.playoff?.id === comp);
  if (po) return stage ? `${po.name} Play-off ${stage}` : `${po.name} Play-offs`;
  return comp;
}

// ---- Ranking rules for best and worst matches (documented in docs/TECHNICAL.md):
// Biggest victories: larger winning margin; then more goals scored; then an away win ranks
// above a home win; then the earlier occurrence ranks higher (records are "set" first).
// Heaviest defeats: larger losing margin; then more goals conceded; then a home defeat ranks
// above an away defeat; then the earlier occurrence ranks higher.
function forClub(r: MatchRecord, id: string) {
  const home = r.home === id;
  const gf = home ? r.hg : r.ag, ga = home ? r.ag : r.hg;
  return { margin: Math.abs(gf - ga), gf, ga, home };
}
export function compareBest(id: string) {
  return (x: MatchRecord, y: MatchRecord) => {
    const a = forClub(x, id), b = forClub(y, id);
    return b.margin - a.margin || b.gf - a.gf || Number(a.home) - Number(b.home) || x.season - y.season || x.date.localeCompare(y.date);
  };
}
export function compareWorst(id: string) {
  return (x: MatchRecord, y: MatchRecord) => {
    const a = forClub(x, id), b = forClub(y, id);
    return b.margin - a.margin || b.ga - a.ga || Number(b.home) - Number(a.home) || x.season - y.season || x.date.localeCompare(y.date);
  };
}
function compareWorld(x: MatchRecord, y: MatchRecord) {
  const mx = Math.abs(x.hg - x.ag), my = Math.abs(y.hg - y.ag);
  return my - mx || Math.max(y.hg, y.ag) - Math.max(x.hg, x.ag) || x.season - y.season || x.date.localeCompare(y.date);
}

function insertRanked(list: MatchRecord[], rec: MatchRecord, cmp: (a: MatchRecord, b: MatchRecord) => number, max: number): void {
  if (list.length >= max && cmp(rec, list[list.length - 1]) >= 0) return;
  list.push(rec);
  list.sort(cmp);
  if (list.length > max) list.length = max;
}

export function recordMatch(world: World, m: Match): void {
  if (m.hg === undefined || m.hg === m.ag!) return;
  const winner = m.hg > m.ag! ? m.home : m.away, loser = winner === m.home ? m.away : m.home;
  const margin = Math.abs(m.hg - m.ag!);
  const rec: MatchRecord = {
    season: world.season.year, date: world.season.calendar[m.slot].date, comp: m.comp, stage: m.stage,
    home: m.home, away: m.away, hg: m.hg, ag: m.ag!, ...(m.et ? { et: true } : {}),
  };
  const hw = world.history.clubs[winner];
  if (hw) insertRanked(hw.best, rec, compareBest(winner), MAX_RECORDS);
  const hl = world.history.clubs[loser];
  if (hl) insertRanked(hl.worst, rec, compareWorst(loser), MAX_RECORDS);
  if (margin >= 4 && (world.history.clubs[winner] || world.history.clubs[loser])) insertRanked(world.history.records.biggestWins, rec, compareWorld, MAX_WORLD_RECORDS);
}

export function pushNews(world: World, item: Omit<NewsItem, 'season'> & { season?: number }): void {
  world.news.push({ season: world.season.year, ...item });
  if (world.news.length > MAX_NEWS) world.news.splice(0, world.news.length - MAX_NEWS);
}

function addEvent(world: World, id: string, text: string, kind: 'event' | 'honour' | 'move' | 'milestone', tone: 1 | 0 | -1): void {
  const h = world.history.clubs[id];
  if (h) h.events.push({ season: world.season.year, text, kind, tone });
}

const compact = (m: Match): CompactMatch => {
  const flags = (m.et ? 1 : 0) | (m.pens ? 2 : 0);
  return flags ? [m.home, m.away, m.hg!, m.ag!, flags, m.pens?.[0] ?? 0, m.pens?.[1] ?? 0] : [m.home, m.away, m.hg!, m.ag!];
};

export function recordSeasonEnd(
  world: World, rt: Runtime, tables: Record<string, TableRow[]>,
  promoted: Record<string, string[]>, relegated: Record<string, string[]>, playoffWinner: Record<string, string | undefined>,
): void {
  const s = world.season, year = s.year;
  const country = rt.country;
  const date = s.calendar[s.calendar.length - 1].date;
  const name = (id: string) => world.info[id]?.short ?? s.externals[id]?.name ?? id;
  const storage = world.settings.storage;

  // ---- League records
  const leagueRecords: LeagueSeasonRecord[] = country.leagues.map(l => {
    const rec: LeagueSeasonRecord = { league: l.id, table: tables[l.id].map(r => ({ ...r })), champion: tables[l.id][0].club, promoted: promoted[l.id], relegated: relegated[l.id] };
    if (l.playoff) {
      const st = s.playoffs[l.playoff.id];
      const final = st.ties.find(t => t.roundIndex === l.playoff!.rounds.length - 1);
      const fm = final && rt.byId.get(final.matches[0]);
      if (fm && fm.hg !== undefined) {
        rec.playoffFinal = { home: fm.home, away: fm.away, hg: fm.hg, ag: fm.ag!, ...(fm.pens ? { pens: fm.pens } : {}), ...(fm.et ? { et: true } : {}) };
        rec.promotedViaPlayoff = playoffWinner[l.id];
      }
    }
    return rec;
  });
  world.history.leagues.push(leagueRecords);

  // ---- Cup records
  const cupRecords: CupSeasonRecord[] = [];
  for (const cup of country.cups) {
    const st = s.cups[cup.id];
    const final = st.ties.find(t => t.roundIndex === cup.rounds.length - 1);
    if (!final?.winner) continue;
    const fm = rt.byId.get(final.matches[0])!;
    const rec: CupSeasonRecord = {
      cup: cup.id, winner: st.winner!, runnerUp: st.runnerUp!,
      final: { home: fm.home, away: fm.away, hg: fm.hg!, ag: fm.ag!, ...(fm.pens ? { pens: fm.pens } : {}), ...(fm.et ? { et: true } : {}) },
    };
    if (storage !== 'essential') {
      rec.rounds = cup.rounds.map((r, ri) => ({ name: r.name, matches: s.matches.filter(m => m.comp === cup.id && st.ties.find(t => t.id === m.tie)?.roundIndex === ri).map(compact) }));
    }
    cupRecords.push(rec);
  }
  world.history.cups.push(cupRecords);

  // ---- Snapshot (parallel arrays)
  const posOf = new Map<string, [string, number]>();
  for (const l of country.leagues) tables[l.id].forEach((r, i) => posOf.set(r.club, [l.id, i + 1]));
  const snap = { year, league: [] as string[], position: [] as number[], pyramid: [] as number[], overall: [] as number[], attack: [] as number[], midfield: [] as number[], defence: [] as number[], reputation: [] as number[], stability: [] as number[] };
  const r1 = (x: number) => Math.round(x * 10) / 10;
  let off = 0;
  const offsets: Record<string, number> = {};
  for (const l of country.leagues) { offsets[l.id] = off; off += l.size; }
  for (const c of world.clubs) {
    const [lid, pos] = posOf.get(c.id)!;
    snap.league.push(lid); snap.position.push(pos); snap.pyramid.push(offsets[lid] + pos);
    snap.overall.push(r1((c.attack + c.midfield + c.defence) / 3)); snap.attack.push(r1(c.attack)); snap.midfield.push(r1(c.midfield)); snap.defence.push(r1(c.defence));
    snap.reputation.push(r1(c.reputation)); snap.stability.push(r1(c.stability));
  }
  world.history.snapshots.push(snap);

  // ---- Matchday position tracks
  if (storage !== 'essential') {
    for (const l of country.leagues) for (const [id, track] of Object.entries(s.positionTrack[l.id])) {
      const h = world.history.clubs[id];
      if (h) h.positions[year] = [l.id, ...track];
    }
  }
  if (storage === 'full') {
    world.history.matches[year] = s.matches.filter(m => s.tables[m.comp] && m.hg !== undefined).map(compact);
  }

  // ---- Honours, movements, timeline events and news
  const leagueName = (id: string) => country.leagues.find(l => l.id === id)!.name;
  country.leagues.forEach((l, i) => {
    const t = tables[l.id];
    const champ = t[0];
    addEvent(world, champ.club, `${leagueName(l.id)} champions (${champ.pts} pts)`, 'honour', 1);
    // Title streak check
    let streak = 1;
    for (let k = world.history.leagues.length - 2; k >= 0; k--) { if (world.history.leagues[k][i]?.champion === champ.club) streak++; else break; }
    const streakTxt = streak >= 2 ? ` — ${ordinal(streak)} consecutive title` : '';
    pushNews(world, { date, kind: 'title', clubs: [champ.club], importance: 5 - i, text: `${name(champ.club)} are ${leagueName(l.id)} champions with ${champ.pts} points${streakTxt}.` });
    if (i === 0) {
      const titles = world.history.leagues.filter(ls => ls[0].champion === champ.club).length;
      if (titles === 1) pushNews(world, { date, kind: 'milestone', clubs: [champ.club], importance: 5, text: `First top-flight title in the simulation for ${name(champ.club)}.` });
    }
    for (const c of promoted[l.id]) {
      if (i === 0) continue;
      const via = playoffWinner[l.id] === c ? ' via the play-offs' : '';
      addEvent(world, c, `Promoted to the ${leagueName(country.leagues[i - 1].id)}${via}`, 'move', 1);
      if (i === 1) {
        const before = world.history.snapshots.slice(0, -1).some(sn => sn.league[rt.clubIndex.get(c)!] === country.leagues[0].id);
        pushNews(world, { date, kind: 'promotion', clubs: [c], importance: before ? 3 : 4, text: `${name(c)} promoted to the ${leagueName(country.leagues[0].id)}${via}${before ? '' : ' — their first top-flight season of the simulation era'}.` });
      }
    }
    for (const c of relegated[l.id]) {
      addEvent(world, c, `Relegated to ${leagueName(country.leagues[i + 1].id)}`, 'move', -1);
      const rep = rt.clubs.get(c)!.reputation;
      if (i === 0 || rep >= 75) pushNews(world, { date, kind: 'relegation', clubs: [c], importance: rep >= 80 ? 5 : i === 0 ? 3 : 2, text: `${name(c)} relegated from the ${leagueName(l.id)}${rep >= 80 ? ' — a historic fall for one of the giants' : ''}.` });
    }
  });
  for (const rec of cupRecords) {
    const cup = country.cups.find(c => c.id === rec.cup)!;
    if (world.info[rec.winner]) addEvent(world, rec.winner, `${cup.name} winners`, 'honour', 1);
    const f = rec.final;
    const score = `${f.hg}–${f.ag}${f.et ? ' a.e.t.' : ''}${f.pens ? ` (${f.pens[0]}–${f.pens[1]} pens)` : ''}`;
    pushNews(world, { date, kind: 'cup', clubs: [rec.winner, rec.runnerUp], importance: cup.prestige >= 1 ? 4 : 3, text: `${name(rec.winner)} win the ${cup.name}: ${name(f.home)} ${score} ${name(f.away)}.` });
    const wt = rt.tierOf.get(rec.winner);
    if (wt && wt >= 3) pushNews(world, { date, kind: 'milestone', clubs: [rec.winner], importance: 5, text: `Giant-killing complete: ${leagueName(country.leagues[wt - 1].id)} side ${name(rec.winner)} lift the ${cup.name}.` });
  }
}

function ordinal(n: number): string { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

export { addEvent };
