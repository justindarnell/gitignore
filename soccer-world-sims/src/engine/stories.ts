// "Story of the season": narratives detected automatically from data the engine already
// holds at the end of a season (the season's matches, the final tables and the history so far).
// Pure functions: no randomness is consumed and no simulation state is changed, so detecting
// stories can never alter results.
import type { CountryConfig, Match, Story, TableRow, World } from './types.ts';

export interface Track { clubs: string[]; pts: number[][]; pos: number[][]; results: ('W' | 'D' | 'L')[][] }

/**
 * Matchday-by-matchday points, positions (points, goal difference, goals scored) and results for
 * one league, from the season's played league matches. pts[k][i] = points of clubs[i] after
 * matchday k+1.
 */
export function leagueTrack(matches: Match[], leagueId: string, clubs: string[]): Track {
  const idx = new Map(clubs.map((c, i) => [c, i]));
  const ms = matches.filter(m => m.comp === leagueId && m.hg !== undefined);
  const slots = [...new Set(ms.map(m => m.slot))].sort((a, b) => a - b);
  const bySlot = new Map<number, Match[]>();
  for (const m of ms) { if (!bySlot.has(m.slot)) bySlot.set(m.slot, []); bySlot.get(m.slot)!.push(m); }
  const n = clubs.length;
  const P = new Array(n).fill(0), GD = new Array(n).fill(0), GF = new Array(n).fill(0);
  const res: ('W' | 'D' | 'L')[][] = clubs.map(() => []);
  const pts: number[][] = [], pos: number[][] = [];
  for (const s of slots) {
    for (const m of bySlot.get(s)!) {
      const h = idx.get(m.home)!, a = idx.get(m.away)!;
      GF[h] += m.hg!; GF[a] += m.ag!; GD[h] += m.hg! - m.ag!; GD[a] += m.ag! - m.hg!;
      if (m.hg! > m.ag!) { P[h] += 3; res[h].push('W'); res[a].push('L'); }
      else if (m.hg! < m.ag!) { P[a] += 3; res[a].push('W'); res[h].push('L'); }
      else { P[h]++; P[a]++; res[h].push('D'); res[a].push('D'); }
    }
    const order = clubs.map((_, i) => i).sort((x, y) => P[y] - P[x] || GD[y] - GD[x] || GF[y] - GF[x] || (clubs[x] < clubs[y] ? -1 : 1));
    const p = new Array(n);
    order.forEach((i, r) => { p[i] = r + 1; });
    pts.push([...P]); pos.push(p);
  }
  return { clubs, pts, pos, results: res };
}

function longestRun(rs: ('W' | 'D' | 'L')[], ok: (r: 'W' | 'D' | 'L') => boolean): { len: number; end: number } {
  let best = { len: 0, end: -1 }, cur = 0;
  rs.forEach((r, i) => { cur = ok(r) ? cur + 1 : 0; if (cur > best.len) best = { len: cur, end: i }; });
  return best;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * Detect the season's stories. `previous` is the history before this season (for records).
 * Returns stories sorted by importance (5 = headline), at most `max`.
 */
export function detectStories(world: World, country: CountryConfig, tables: Record<string, TableRow[]>, relegated: Record<string, string[]>, tracks: Record<string, Track>, max = 10): Story[] {
  const s = world.season;
  const name = (id: string) => world.info[id]?.short ?? s.externals[id]?.name ?? id;
  const out: Story[] = [];
  const add = (st: Story) => out.push(st);
  const H = world.history;

  country.leagues.forEach((l, li) => {
    const table = tables[l.id];
    const tr = tracks[l.id];
    const K = tr.pts.length;
    if (K < 4) return;
    const at = (id: string) => tr.clubs.indexOf(id);
    const champ = table[0].club, second = table[1].club;
    const top = li === 0;
    const lname = l.name;
    const imp = (base: number) => Math.max(1, Math.min(5, base - li));

    // ---- Title race decided on the final day (champion could still be caught going into it).
    const before = K - 2;
    const gapBefore = tr.pts[before][at(champ)] - Math.max(...tr.clubs.filter(c => c !== champ).map(c => tr.pts[before][at(c)]));
    const leaderBefore = tr.clubs[tr.pos[before].indexOf(1)];
    const finalGap = table[0].pts - table[1].pts;
    if (gapBefore <= 3) {
      const snatched = leaderBefore !== champ;
      add({ kind: 'final-day', league: l.id, clubs: [champ, snatched ? leaderBefore : second], importance: imp(5),
        text: snatched
          ? `${lname} title snatched on the final day: ${name(champ)} overtake ${name(leaderBefore)} at the last${finalGap === 0 ? ' on goal difference' : ''}.`
          : `${lname} title decided on the final day: ${name(champ)} hold on to finish ${finalGap === 0 ? 'level on points with' : `${plural(finalGap, 'point')} ahead of`} ${name(second)}.` });
    } else if (finalGap >= (top ? 15 : 18)) {
      add({ kind: 'runaway', league: l.id, clubs: [champ], importance: imp(3), text: `${name(champ)} run away with the ${lname}, ${finalGap} points clear.` });
    }

    // ---- Lead changes (from a quarter of the way through the season).
    let changes = 0, prev = '';
    const leaders = new Set<string>();
    for (let k = Math.floor(K / 4); k < K; k++) {
      const lead = tr.clubs[tr.pos[k].indexOf(1)];
      if (prev && lead !== prev) changes++;
      prev = lead; leaders.add(lead);
    }
    if (changes >= 6) add({ kind: 'lead-changes', league: l.id, clubs: [...leaders].slice(0, 4), importance: imp(4),
      text: `A see-saw ${lname} race: the lead changed hands ${changes} times between ${plural(leaders.size, 'club')}.` });

    // ---- Unbeaten and losing runs.
    tr.clubs.forEach((c, i) => {
      const losses = tr.results[i].filter(r => r === 'L').length;
      if (losses === 0) { add({ kind: 'invincible', league: l.id, clubs: [c], importance: imp(5), text: `Invincibles: ${name(c)} go the whole ${lname} season unbeaten.` }); return; }
      const ub = longestRun(tr.results[i], r => r !== 'L');
      if (ub.len >= (top ? 20 : 24)) add({ kind: 'unbeaten-run', league: l.id, clubs: [c], importance: imp(4), text: `${name(c)} go ${ub.len} ${lname} games unbeaten.` });
      const lr = longestRun(tr.results[i], r => r === 'L');
      if (lr.len >= (top ? 9 : 10)) add({ kind: 'losing-run', league: l.id, clubs: [c], importance: imp(3), text: `${name(c)} lose ${lr.len} ${lname} games in a row.` });
      const wr = longestRun(tr.results[i], r => r === 'W');
      if (wr.len >= (top ? 13 : 15)) add({ kind: 'winning-run', league: l.id, clubs: [c], importance: imp(4), text: `${name(c)} win ${wr.len} consecutive ${lname} games.` });
    });

    // ---- Collapses: in the top four (top flight) or the automatic promotion places (lower
    // divisions) after a third of the season, then relegated.
    const highZone = top ? 4 : l.autoPromotion;
    if (highZone > 0) for (const c of relegated[l.id] ?? []) {
      const i = at(c);
      let peak = -1;
      for (let k = Math.floor(K / 3); k < K; k++) if (tr.pos[k][i] <= highZone) peak = k;
      if (peak >= 0) add({ kind: 'collapse', league: l.id, clubs: [c], importance: imp(top ? 5 : 4),
        text: `Collapse of the season: ${name(c)} were ${top ? 'in the top four' : 'in the automatic promotion places'} after matchday ${peak + 1} but finished in the ${lname} relegation zone.` });
    }
    // ---- Great escapes: bottom with a fifth of the season left, then survived.
    if (l.relegation > 0) {
      const down = new Set(relegated[l.id] ?? []);
      const n = tr.clubs.length;
      for (let i = 0; i < n; i++) {
        const c = tr.clubs[i];
        if (down.has(c)) continue;
        const k0 = Math.floor(K * 0.8);
        if (tr.pos[k0][i] === n) add({ kind: 'great-escape', league: l.id, clubs: [c], importance: imp(4),
          text: `Great escape: ${name(c)} were bottom of the ${lname} with ${K - k0 - 1} games left and survived.` });
      }
    }

    // ---- Points records (from the second season on, against this world's history).
    if (H.leagues.length > 0) {
      const prevBest = Math.max(...H.leagues.map(ls => ls[li]?.table[0].pts ?? 0));
      if (table[0].pts > prevBest) add({ kind: 'record-points', league: l.id, clubs: [champ], importance: imp(top ? 5 : 3),
        text: `Record points: ${name(champ)}'s ${table[0].pts} is the highest ${lname} total in this world (previous best ${prevBest}).` });
      const last = table[table.length - 1];
      const prevLow = Math.min(...H.leagues.map(ls => ls[li]?.table.at(-1)!.pts ?? 999));
      if (li <= 1 && last.pts < prevLow) add({ kind: 'record-low', league: l.id, clubs: [last.club], importance: imp(3),
        text: `Record low: ${name(last.club)} finish with ${plural(last.pts, 'point')}, the fewest in ${lname} history here.` });
    }
  });

  // ---- Cup giant-killings: winners at least two levels below the losers (biggest gaps first).
  const tierOf = (id: string): number => {
    const ext = s.externals[id];
    if (ext) return country.leagues.length + ext.level - 1;
    const li = country.leagues.findIndex(l => s.leagueClubs[l.id]?.includes(id));
    return li < 0 ? 9 : li + 1;
  };
  const kills: { gap: number; tie: { cup: string; round: string; w: string; l: string }; roundIndex: number }[] = [];
  for (const cup of country.cups) for (const t of s.cups[cup.id]?.ties ?? []) {
    if (!t.winner) continue;
    const loser = t.winner === t.a ? t.b : t.a;
    const gap = tierOf(t.winner) - tierOf(loser);
    if (gap >= 2 && world.info[loser]) kills.push({ gap, roundIndex: t.roundIndex, tie: { cup: cup.name, round: t.round, w: t.winner, l: loser } });
  }
  kills.sort((a, b) => b.gap - a.gap || b.roundIndex - a.roundIndex);
  const lvl = (id: string) => { const t = tierOf(id); return t <= country.leagues.length ? country.leagues[t - 1].name : 'non-league'; };
  for (const k of kills.slice(0, 2)) add({ kind: 'giant-killing', clubs: [k.tie.w, k.tie.l], importance: Math.min(5, 1 + k.gap),
    text: `Giant-killing: ${lvl(k.tie.w)} ${name(k.tie.w)} knock ${lvl(k.tie.l)} ${name(k.tie.l)} out of the ${k.tie.cup} (${k.tie.round}).` });

  out.sort((a, b) => b.importance - a.importance);
  return out.slice(0, max);
}
