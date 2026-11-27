import type { Match, TableRow, Tiebreaker } from './types.ts';

export function emptyRow(club: string): TableRow { return { club, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; }

export function applyResult(rows: Record<string, TableRow>, home: string, away: string, hg: number, ag: number): void {
  const h = rows[home], a = rows[away];
  h.p++; a.p++; h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
  if (hg > ag) { h.w++; a.l++; h.pts += 3; }
  else if (hg < ag) { a.w++; h.l++; a.pts += 3; }
  else { h.d++; a.d++; h.pts++; a.pts++; }
}

/** Deterministic "drawing of lots": a hash of season, league and club (consumes no RNG). */
function lots(seed: string, club: string): number {
  let h = 2166136261;
  const s = seed + '|' + club;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Sort a league table using competition tiebreakers. Head-to-head criteria are evaluated
 * within each group of clubs still level after the preceding criteria.
 */
export function sortTable(rows: TableRow[], tiebreakers: Tiebreaker[], matches: Match[], lotsSeed: string): TableRow[] {
  const sorted = [...rows];
  const resolve = (group: TableRow[], from: number): TableRow[] => {
    if (group.length <= 1 || from >= tiebreakers.length) return group;
    const t = tiebreakers[from];
    let keyOf: (r: TableRow) => number;
    if (t === 'h2hPoints' || t === 'h2hGoalDifference' || t === 'h2hAwayGoals') {
      const ids = new Set(group.map(r => r.club));
      const mini: Record<string, { pts: number; gd: number; away: number }> = {};
      for (const r of group) mini[r.club] = { pts: 0, gd: 0, away: 0 };
      for (const m of matches) {
        if (m.hg === undefined || !ids.has(m.home) || !ids.has(m.away)) continue;
        const h = mini[m.home], a = mini[m.away];
        h.gd += m.hg - m.ag!; a.gd += m.ag! - m.hg; a.away += m.ag!;
        if (m.hg > m.ag!) h.pts += 3; else if (m.hg < m.ag!) a.pts += 3; else { h.pts++; a.pts++; }
      }
      keyOf = t === 'h2hPoints' ? r => mini[r.club].pts : t === 'h2hGoalDifference' ? r => mini[r.club].gd : r => mini[r.club].away;
    } else if (t === 'lots') {
      keyOf = r => lots(lotsSeed, r.club);
    } else {
      keyOf = t === 'points' ? r => r.pts : t === 'goalDifference' ? r => r.gf - r.ga : t === 'goalsFor' ? r => r.gf : r => r.w;
    }
    const g = [...group].sort((x, y) => keyOf(y) - keyOf(x));
    const out: TableRow[] = [];
    for (let i = 0; i < g.length;) {
      let j = i + 1;
      while (j < g.length && keyOf(g[j]) === keyOf(g[i])) j++;
      out.push(...resolve(g.slice(i, j), from + 1));
      i = j;
    }
    return out;
  };
  return resolve(sorted, 0);
}
