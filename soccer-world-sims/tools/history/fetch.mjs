// Downloads the raw historical datasets used for calibration and initial ratings.
// Raw files are not committed (see .gitignore); this script makes them reproducible.
//
// Sources (see docs/DATA-SOURCES.md for licensing notes):
//  - engsoccerdata (James Curley et al.): England league results 1888/89-2024/25,
//    FA Cup, League Cup and EFL play-off results. https://github.com/jalapic/engsoccerdata
//  - openfootball/england (public domain): 2025/26 and 2026/27 season files.
//    https://github.com/openfootball/england
//  - English Wikipedia (CC BY-SA 4.0): 1988/89-1992/93 Football Conference and 1988/89-1991/92 feeder
//    league season pages (final tables and full results matrices) for the 1992/93 start's fifth tier.
//    Only the results and membership are used (tools/history/wikitable.mjs).
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rawDir = join(root, 'data', 'history', 'raw');

const ES = 'https://raw.githubusercontent.com/jalapic/engsoccerdata/master/data-raw/';
const OF = 'https://raw.githubusercontent.com/openfootball/england/master/';

const files = [
  [ES + 'england.csv', 'engsoccerdata/england.csv'],
  [ES + 'facup.csv', 'engsoccerdata/facup.csv'],
  [ES + 'leaguecup.csv', 'engsoccerdata/leaguecup.csv'],
  [ES + 'englandplayoffs.csv', 'engsoccerdata/englandplayoffs.csv'],
  [OF + '2022-23/1-premierleague.txt', 'openfootball/2022-23/1-premierleague.txt'],
  [OF + '2022-23/2-championship.txt', 'openfootball/2022-23/2-championship.txt'],
  [OF + '2022-23/3-league1.txt', 'openfootball/2022-23/3-league1.txt'],
  [OF + '2022-23/4-league2.txt', 'openfootball/2022-23/4-league2.txt'],
  [OF + '2025-26/1-premierleague.txt', 'openfootball/2025-26/1-premierleague.txt'],
  [OF + '2025-26/2-championship.txt', 'openfootball/2025-26/2-championship.txt'],
  [OF + '2025-26/3-league1.txt', 'openfootball/2025-26/3-league1.txt'],
  [OF + '2025-26/4-league2.txt', 'openfootball/2025-26/4-league2.txt'],
  [OF + '2025-26/5-nationalleague.txt', 'openfootball/2025-26/5-nationalleague.txt'],
  [OF + '2024-25/5-nationalleague.txt', 'openfootball/2024-25/5-nationalleague.txt'],
  [OF + '2026-27/1-premierleague.txt', 'openfootball/2026-27/1-premierleague.txt'],
  [OF + '2026-27/2-championship.txt', 'openfootball/2026-27/2-championship.txt'],
];

// Wikipedia season pages (titles use an en dash, e.g. "1991–92 Football Conference").
const WP = 'https://en.wikipedia.org/wiki/';
const season = y => `${y}%E2%80%93${String(y + 1).slice(2)}`;
for (const y of [1988, 1989, 1990, 1991, 1992]) files.push([`${WP}${season(y)}_Football_Conference`, `wikipedia/conference-${y}.html`]);
for (const y of [1988, 1989, 1990, 1991]) for (const [lg, slug] of [['isthmian', 'Isthmian_League'], ['southern', 'Southern_Football_League'], ['npl', 'Northern_Premier_League']]) files.push([`${WP}${season(y)}_${slug}`, `wikipedia/${lg}-${y}.html`]);

const force = process.argv.includes('--force');
for (const [url, rel] of files) {
  const out = join(rawDir, rel);
  if (!force) {
    try { await stat(out); console.log('cached', rel); continue; } catch { /* download */ }
  }
  const res = await fetch(url);
  if (!res.ok) { console.warn('FAILED', res.status, url); continue; }
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  console.log('saved', rel);
}
