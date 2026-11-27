// Parse English Wikipedia season pages (downloaded by fetch.mjs): final league tables and results
// matrices ("Home \ Away" grids). Used for the 1992/93 start's fifth tier (Football Conference) and for
// the feeder leagues of the clubs promoted into it. Only facts are taken: club names, games, goals.
import { readFileSync } from 'node:fs';

const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** All `wikitable` tables of a page as arrays of rows of cell texts (footnote markers removed). */
export function wikitables(path) {
  const html = readFileSync(path, 'utf8');
  const out = [];
  const re = /<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/g;
  for (const m of html.matchAll(re)) {
    const rows = [];
    for (const tr of m[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => decode(c[1]
        .replace(/<sup[\s\S]*?<\/sup>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim());
      if (cells.length) rows.push(cells);
    }
    out.push(rows);
  }
  return out;
}

/** Club name without the table's qualifiers, e.g. "Colchester United (C, P)" -> "Colchester United". */
export const cleanName = s => s.replace(/\s*\([^)]*\)\s*$/g, '').replace(/\s*\[[^\]]*\]\s*$/g, '').trim();

/** The first final league table on the page (the top division of the season page). */
export function leagueTable(path) {
  const t = wikitables(path).find(rows => rows[0]?.[0] === 'Pos' && rows[0].includes('Pld') && rows[0].includes('GF'));
  if (!t) throw new Error(`no league table in ${path}`);
  const h = t[0], col = k => h.indexOf(k);
  return t.slice(1).filter(r => /^\d+$/.test(r[0])).map(r => ({
    pos: +r[0], team: cleanName(r[col('Team')]), P: +r[col('Pld')], W: +r[col('W')], D: +r[col('D')], L: +r[col('L')],
    GF: +r[col('GF')], GA: +r[col('GA')], Pts: +r[col('Pts')], note: r[col('Pts') + 1] ?? '',
  }));
}

/**
 * Matches from the page's results matrix. Columns are abbreviations in the same order as the rows
 * (checked: the diagonal must be empty). Returns [] if the page has no matrix.
 */
export function matrixMatches(path) {
  const t = wikitables(path).find(rows => /^Home\s*\\\s*Away$/.test(rows[0]?.[0] ?? ''));
  if (!t) return [];
  const clubs = t.slice(1).map(r => cleanName(r[0]));
  const n = clubs.length;
  if (t[0].length - 1 !== n) throw new Error(`${path}: ${n} rows but ${t[0].length - 1} columns`);
  const games = [];
  t.slice(1).forEach((r, i) => {
    for (let j = 0; j < n; j++) {
      const cell = r[j + 1] ?? '';
      if (i === j) { if (/\d/.test(cell)) throw new Error(`${path}: diagonal cell ${clubs[i]} not empty`); continue; }
      const m = cell.match(/^(\d+)\s*[–-]\s*(\d+)/);
      if (m) games.push({ home: clubs[i], away: clubs[j], hg: +m[1], ag: +m[2] });
    }
  });
  return games;
}
