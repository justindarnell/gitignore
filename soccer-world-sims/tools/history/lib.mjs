// Shared helpers for historical data: CSV parsing, openfootball parsing,
// league-table construction and club-name normalisation.
import { readFileSync } from 'node:fs';

/** Minimal RFC-4180 CSV parser (handles quoted fields with commas). */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

/** Canonical key for a club name so different sources can be joined. */
export function clubKey(name) {
  // AFC Wimbledon (2002-) is a different club from Wimbledon FC (1889-2004); keep its prefix.
  if (/^afc wimbledon$/i.test(name.trim())) return 'afc-wimbledon';
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(a\.?f\.?c\.?|f\.?c\.?)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Parse an openfootball Football.TXT league file. Supports both the
 * "Home v Away 1-2 (0-1)" and "Home  1-2 (0-1)  Away" layouts.
 * Stops at a play-off heading so only regular-season games are returned.
 */
export function parseOpenfootball(path, { includePlayoffs = false } = {}) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const games = [];
  let inPlayoffs = false;
  for (const raw of lines) {
    if (raw.startsWith('▪')) {
      inPlayoffs = /play-?off|final/i.test(raw);
      continue;
    }
    if (inPlayoffs && !includePlayoffs) continue;
    const line = raw.replace(/\s+$/, '');
    let m = line.match(/^\s*(?:\d{1,2}[:.]\d\d\s+)?(.+?)\s+v\s+(.+?)\s{2,}(\d+)-(\d+)/);
    if (m) { games.push({ home: m[1].trim(), away: m[2].trim(), hg: +m[3], ag: +m[4] }); continue; }
    m = line.match(/^\s*(?:\d{1,2}[:.]\d\d\s+)?(\S.*?)\s{2,}(\d+)-(\d+)(?:\s*\([^)]*\))?(?:\s*(?:a\.e\.t\.|pen\.)[^A-Z]*)?\s{2,}(\S.*?)$/);
    if (m && !/^\(/.test(m[1])) games.push({ home: m[1].trim(), away: m[4].trim(), hg: +m[2], ag: +m[3] });
  }
  return games;
}

/** Build a sorted final table (3 points per win; points deductions are NOT applied). */
export function buildTable(games) {
  const t = new Map();
  const row = c => {
    if (!t.has(c)) t.set(c, { club: c, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    return t.get(c);
  };
  for (const g of games) {
    const h = row(g.home), a = row(g.away);
    h.p++; a.p++; h.gf += g.hg; h.ga += g.ag; a.gf += g.ag; a.ga += g.hg;
    if (g.hg > g.ag) { h.w++; a.l++; h.pts += 3; }
    else if (g.hg < g.ag) { a.w++; h.l++; a.pts += 3; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  return [...t.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.club.localeCompare(y.club));
}

export const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
export const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
export function quantile(a, q) {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return NaN;
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
export const round = (x, d = 3) => Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null;
export function summary(a, d = 2) {
  return { n: a.length, mean: round(mean(a), d), sd: round(sd(a), d), p10: round(quantile(a, 0.1), d), p50: round(quantile(a, 0.5), d), p90: round(quantile(a, 0.9), d), min: round(Math.min(...a), d), max: round(Math.max(...a), d) };
}
