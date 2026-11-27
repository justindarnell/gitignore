// Goal 2 pages: season review (stories), title-race chart, eras & dynasties, rivalries and
// head-to-head records. Read-only views over recorded history.
import type { Page } from '../types.ts';
import { club, clubName, esc, empty, scoreText, f1 } from '../dom.ts';
import { leagues, league, seasonLabel, compLabel, country } from '../data.ts';
import { mountChart, CATEGORICAL } from '../components/chart.ts';
import { leagueTrack } from '../../engine/stories.ts';
import { titleEras, goldenAge, decadeRankings } from '../../engine/eras.ts';
import { pairKey } from '../../engine/runtime.ts';
import type { DerbyConfig, Story, World } from '../../engine/types.ts';

// ---------------------------------------------------------------- title race
export interface Race { clubs: string[]; pts: number[][] }

/** Top-six race for a league: live for the current season, stored (Standard+) for past seasons. */
export function raceData(world: World, lid: string, year: number | null): Race | null {
  const s = world.season;
  if (year === null || (year === s.year && !s.complete) || (year === s.year && s.complete && !world.history.leagues.length)) {
    const tr = leagueTrack(s.matches, lid, s.leagueClubs[lid] ?? []);
    if (!tr.pts.length) return null;
    const order = tr.clubs.map((_, i) => i).sort((a, b) => tr.pos[tr.pos.length - 1][a] - tr.pos[tr.pos.length - 1][b]).slice(0, 6);
    return { clubs: order.map(i => tr.clubs[i]), pts: order.map(i => tr.pts.map(p => p[i])) };
  }
  const k = world.history.snapshots.findIndex(x => x.year === year);
  const rec = world.history.leagues[k]?.find(x => x.league === lid);
  if (!rec?.race) return null;
  return { clubs: rec.race.map(r => r[0]), pts: rec.race.map(r => r.slice(1) as number[]) };
}

export function raceCard(world: World, lid: string, year: number | null, id = 'chart-race'): string {
  const l = league(world, lid);
  const r = raceData(world, lid, year);
  const what = l.tier === 1 ? 'Title race' : 'Title and promotion race';
  if (!r) return `<section class="card"><h2>${what}</h2>${empty(year === null ? 'The race chart appears after the first matchday.' : 'Race charts for past seasons need Standard storage or higher.')}</section>`;
  return `<section class="card race-card span-all"><h2>${what}: points by matchday</h2>
    <div class="chart-legend">${r.clubs.map((c, i) => `<span><i style="background:${CATEGORICAL[i]}"></i>${esc(clubName(world, c))}</span>`).join('')}</div>
    <div id="${id}" data-race="${esc(lid)}" data-year="${year ?? ''}"></div><p class="muted small">Top six ${year === null ? 'at present' : 'finishers'}. Hover for the points after each matchday.</p></section>`;
}

export function mountRace(root: HTMLElement, world: World, lid: string, year: number | null, id = 'chart-race'): (() => void) | undefined {
  const el = root.querySelector<HTMLElement>('#' + id);
  const r = raceData(world, lid, year);
  if (!el || !r) return;
  const n = Math.max(...r.pts.map(p => p.length));
  const max = Math.max(...r.pts.flat(), 3);
  const top = Math.ceil(max / 10) * 10;
  const every = Math.max(1, Math.ceil(n / 10));
  return mountChart(el, {
    ariaLabel: `${league(world, lid).name} points by matchday for the top six`,
    series: r.clubs.map((c, i) => ({ label: clubName(world, c), color: CATEGORICAL[i], values: r.pts[i] })),
    yMin: 0, yMax: top, yTicks: Array.from({ length: top / 10 + 1 }, (_, k) => k * 10).filter((_, k, a) => a.length <= 8 || k % 2 === 0),
    xTicks: Array.from({ length: n }, (_, i) => i).filter(i => i % every === 0 || (i === n - 1 && i % every > every / 2)).map(i => ({ index: i, label: `MD${i + 1}` })),
    height: 240,
    title: i => `Matchday ${i + 1}`,
    rows: i => r.clubs.map((c, k) => ({ c, k, v: r.pts[k][i] })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1)).map(x => ({ label: clubName(world, x.c), value: x.v === undefined ? '—' : `${x.v} pts`, color: CATEGORICAL[x.k] })),
  });
}

// ---------------------------------------------------------------- season review
const KIND_LABEL: Record<string, string> = {
  'final-day': 'Final day', runaway: 'Runaway', 'lead-changes': 'See-saw race', invincible: 'Invincibles', 'unbeaten-run': 'Unbeaten run',
  'losing-run': 'Losing run', 'winning-run': 'Winning run', collapse: 'Collapse', 'great-escape': 'Great escape',
  'record-points': 'Record', 'record-low': 'Record low', 'giant-killing': 'Giant-killing',
};

export function storyList(world: World, stories: Story[]): string {
  return `<ul class="story-list">${stories.map(s => `<li class="imp-${s.importance}"><span class="kind kind-story">${esc(KIND_LABEL[s.kind] ?? s.kind)}</span> ${linkClubs(world, s.text, s.clubs)}</li>`).join('')}</ul>`;
}

export function linkClubs(world: World, text: string, clubs: string[]): string {
  let out = esc(text);
  for (const id of clubs) { const s = world.info[id]?.short; if (s) out = out.replace(esc(s), `<a href="#/club/${id}">${esc(s)}</a>`); }
  return out;
}

export const seasonPage: Page = ({ world, args }) => {
  const H = world.history;
  if (!H.leagues.length) return { title: 'Season review', html: `<div class="page-head"><h1>Season review</h1></div>${empty('Complete a season to see its review.')}` };
  const years = H.snapshots.map(s => s.year);
  const year = args[0] ? Number(args[0]) : years[years.length - 1];
  const k = Math.max(0, years.indexOf(year));
  const ls = H.leagues[k], cs = H.cups[k];
  const stories = H.stories[k] ?? [];
  const pl = leagues(world)[0];
  const html = `<div class="page-head"><h1>${esc(seasonLabel(years[k]))} season review</h1>
    <div class="toolbar"><label>Season <select data-change="season-review">${[...years].reverse().map(y => `<option value="${y}"${y === years[k] ? ' selected' : ''}>${esc(seasonLabel(y))}</option>`).join('')}</select></label></div></div>
  <div class="grid">
    <section class="card span-2"><h2>Story of the season</h2>${stories.length ? storyList(world, stories) : empty(k < H.leagues.length && H.h2hSince > years[k] ? 'Stories were not recorded for seasons before this save was upgraded.' : 'A quiet season: nothing out of the ordinary.')}</section>
    <section class="card"><h2>Honours</h2><ul class="plain">${ls.map(lr => `<li><span class="muted">${esc(league(world, lr.league).name)}:</span> ${club(world, lr.champion, { crest: 'xs', bold: true })} <span class="muted small">${lr.table[0].pts} pts</span></li>`).join('')}
      ${cs.map(c => { const f = c.final, hw = f.home === c.winner; return `<li><span class="muted">${esc(compLabel(world, c.cup))}:</span> ${club(world, c.winner, { crest: 'xs', bold: true })} <span class="muted small">beat ${esc(clubName(world, c.runnerUp))} ${scoreText(hw ? f.hg : f.ag, hw ? f.ag : f.hg, f.et, f.pens ? (hw ? f.pens : [f.pens[1], f.pens[0]]) : undefined)}</span></li>`; }).join('')}</ul>
      <p class="small"><a href="#/standings/${pl.id}/${years[k]}">Final tables →</a></p></section>
    ${raceCard(world, pl.id, years[k], 'chart-race-review')}
  </div>`;
  return { title: `${seasonLabel(years[k])} review`, html, mount: root => mountRace(root, world, pl.id, years[k], 'chart-race-review') };
};

// ---------------------------------------------------------------- eras & dynasties
export function erasSection(world: World): { html: string; mount: (root: HTMLElement) => (() => void) | undefined } {
  const H = world.history;
  if (H.leagues.length < 5) return { html: empty('Eras appear after a few seasons of history.'), mount: () => undefined };
  const eras = titleEras(world);
  const ctry = country(world);
  // golden ages of the 12 most successful clubs (by success score)
  const ages = world.clubs.map(c => goldenAge(world, ctry, c.id)).filter((g): g is NonNullable<typeof g> => !!g).sort((a, b) => b.score - a.score).slice(0, 12);
  const d = decadeRankings(world, 8);
  const ord = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] ?? 'th'}`;
  const html = `<div class="grid">
    <section class="card span-all"><h2>Eras and dynasties</h2>${eras.length ? `<ul class="timeline eras">${eras.map(e => `<li class="tone-1"><strong>${linkClubs(world, e.label, [e.club])}</strong> <span class="muted small">${e.titles} titles${e.kind === 'dynasty' ? ' · dynasty' : ''}</span></li>`).join('')}</ul>` : empty('No club has dominated a period yet.')}
      <p class="muted small">An era is a run of at least three top-flight titles no more than three seasons apart, with titles in at least half of the seasons spanned; five or more titles make a dynasty.</p></section>
    <section class="card span-all"><h2>Decades: top clubs by average pyramid position</h2>
      <div class="chart-legend">${d.clubs.map((c, i) => `<span><i style="background:${CATEGORICAL[i % CATEGORICAL.length]}"></i>${esc(clubName(world, c))}</span>`).join('')}</div>
      <div id="chart-bump"></div><p class="muted small">Rank of each club among all clubs by mean pyramid position in each decade (1 = best). Clubs outside the top 20 drop off the chart.</p></section>
    <section class="card span-all"><h2>Golden ages</h2>${ages.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Club</th><th>Golden age</th><th class="num">Titles</th><th class="num">Cups</th><th class="num">Promotions</th><th class="num">Best</th><th class="num">Avg pyramid</th></tr></thead><tbody>${ages.map(g => `<tr><td>${club(world, g.club)}</td><td class="nowrap">${esc(seasonLabel(g.from))}–${esc(seasonLabel(g.to))}</td><td class="num">${g.titles}</td><td class="num">${g.cups}</td><td class="num">${g.promotions}</td><td class="num">#${g.bestFinish}</td><td class="num">${f1(g.avgPyramid)}</td></tr>`).join('')}</tbody></table></div>` : empty('No golden ages yet.')}
      <p class="muted small">Each club's most successful window of 3–12 seasons (titles, cups, promotions and high finishes).</p></section></div>`;
  const mount = (root: HTMLElement) => {
    const el = root.querySelector<HTMLElement>('#chart-bump');
    if (!el || !d.decades.length) return;
    const cap = 20;
    return mountChart(el, {
      ariaLabel: 'Bump chart of top clubs by decade',
      series: d.clubs.map((c, i) => ({ label: clubName(world, c), color: CATEGORICAL[i % CATEGORICAL.length], values: d.ranks[i].map(r => r !== null && r <= cap ? r : null) })),
      yMin: 1, yMax: cap, invert: true, yTicks: [1, 5, 10, 15, 20], height: 260,
      xTicks: d.decades.map((dec, i) => ({ index: i, label: `${dec}s` })),
      title: i => `${d.decades[i]}s`,
      rows: i => d.clubs.map((c, k) => ({ c, k, r: d.ranks[k][i], a: d.avg[k][i] })).sort((x, y) => (x.r ?? 999) - (y.r ?? 999)).map(x => ({ label: clubName(world, x.c), value: x.r === null ? '—' : `${ord(x.r)} (avg #${x.a})`, color: CATEGORICAL[x.k % CATEGORICAL.length] })),
    });
  };
  return { html, mount };
}

// ---------------------------------------------------------------- rivalries & head-to-head
export function activeDerbies(world: World): DerbyConfig[] {
  return (country(world).derbies ?? []).filter(d => world.info[d.clubs[0]] && world.info[d.clubs[1]]);
}

/** Head-to-head from a's point of view: { p, w, d, l, gf, ga }. */
export function h2hFor(world: World, a: string, b: string) {
  const r = world.history.h2h?.[pairKey(a, b)] ?? [0, 0, 0, 0, 0, 0];
  const aFirst = a < b;
  return { p: r[0], w: aFirst ? r[1] : r[3], d: r[2], l: aFirst ? r[3] : r[1], gf: aFirst ? r[4] : r[5], ga: aFirst ? r[5] : r[4] };
}

export function rivalriesSection(world: World): string {
  const ds = activeDerbies(world);
  const rows = ds.map(d => {
    const [a, b] = d.clubs;
    const r = h2hFor(world, a, b);
    const last = world.history.derbyMeetings?.[d.id]?.at(-1);
    return `<tr><td><a href="#/h2h/${a}/${b}">${esc(d.name)}</a></td><td>${club(world, a, { crest: 'xs' })}</td><td class="num">${r.w}</td><td class="num muted">${r.d}</td><td class="num">${r.l}</td><td>${club(world, b, { crest: 'xs' })}</td><td class="num">${r.p}</td><td class="hide-sm muted small">${last ? `${esc(seasonLabel(last[0]))}: ${esc(clubName(world, last[3]))} ${scoreText(last[5], last[6], !!(last[7]! & 1), last[7]! & 2 ? [last[8]!, last[9]!] : undefined)} ${esc(clubName(world, last[4]))}` : ''}</td></tr>`;
  }).join('');
  return `<section class="card"><h2>Derbies</h2>${ds.length ? `<div class="table-wrap"><table class="table compact rivalries"><thead><tr><th>Derby</th><th>Club</th><th class="num">W</th><th class="num">D</th><th class="num">W</th><th>Club</th><th class="num">P</th><th class="hide-sm">Last meeting</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('No derbies configured for this world.')}
    <p class="muted small">All competitive meetings since ${esc(seasonLabel(world.history.h2hSince ?? world.history.snapshots[0]?.year ?? world.season.year))}. Pick any two clubs on the <a href="#/h2h">head-to-head</a> page.</p></section>`;
}

export function clubRivalries(world: World, id: string): string {
  const ds = activeDerbies(world).filter(d => d.clubs.includes(id));
  if (!ds.length) return '';
  return `<section class="card"><h2>Rivalries</h2><ul class="plain">${ds.map(d => {
    const other = d.clubs[0] === id ? d.clubs[1] : d.clubs[0];
    const r = h2hFor(world, id, other);
    return `<li><a href="#/h2h/${id}/${other}">${esc(d.name)}</a> v ${club(world, other, { crest: 'xs' })} <span class="muted small">P${r.p} W${r.w} D${r.d} L${r.l}</span></li>`;
  }).join('')}</ul></section>`;
}

type Meeting = { season: number; comp: string; stage: string; home: string; away: string; hg: number; ag: number; et?: boolean; pens?: [number, number] };

/** All stored meetings between two clubs: derby list (Standard+), cup rounds (Standard+), league results (Full). */
export function meetings(world: World, a: string, b: string): Meeting[] {
  const H = world.history, out: Meeting[] = [], seen = new Set<string>();
  const push = (m: Meeting) => { const k = `${m.season}|${m.comp}|${m.stage}|${m.home}|${m.away}`; if (!seen.has(k)) { seen.add(k); out.push(m); } };
  const both = (h: string, w: string) => (h === a && w === b) || (h === b && w === a);
  const derby = activeDerbies(world).find(d => both(d.clubs[0], d.clubs[1]));
  for (const x of (derby && H.derbyMeetings?.[derby.id]) || []) push({ season: x[0], comp: x[1], stage: x[2], home: x[3], away: x[4], hg: x[5], ag: x[6], et: !!((x[7] ?? 0) & 1), pens: (x[7] ?? 0) & 2 ? [x[8]!, x[9]!] : undefined });
  H.cups.forEach((cs, k) => { for (const c of cs) for (const r of c.rounds ?? []) for (const m of r.matches) if (both(m[0], m[1])) push({ season: H.snapshots[k].year, comp: c.cup, stage: r.name, home: m[0], away: m[1], hg: m[2], ag: m[3], et: !!((m[4] ?? 0) & 1), pens: (m[4] ?? 0) & 2 ? [m[5]!, m[6]!] : undefined }); });
  for (const [y, ms] of Object.entries(H.matches ?? {})) for (const m of ms) if (both(m[0], m[1])) {
    const lg = H.snapshots.find(s => s.year === Number(y))?.league[world.clubs.findIndex(c => c.id === m[0])] ?? '';
    push({ season: Number(y), comp: lg, stage: 'League', home: m[0], away: m[1], hg: m[2], ag: m[3] });
  }
  return out.sort((x, y) => y.season - x.season);
}

export const h2hPage: Page = ({ world, args }) => {
  const ids = [...world.clubs.map(c => c.id)].sort((x, y) => world.info[x].name.localeCompare(world.info[y].name));
  const a = world.info[args[0]] ? args[0] : activeDerbies(world)[0]?.clubs[0] ?? ids[0];
  const b = world.info[args[1]] && args[1] !== a ? args[1] : activeDerbies(world).find(d => d.clubs.includes(a))?.clubs.find(c => c !== a) ?? ids.find(x => x !== a)!;
  const sel = (side: 'a' | 'b', v: string) => `<select data-change="h2h-${side}" aria-label="Club ${side.toUpperCase()}">${ids.map(id => `<option value="${id}"${id === v ? ' selected' : ''}>${esc(world.info[id].name)}</option>`).join('')}</select>`;
  const r = h2hFor(world, a, b);
  const derby = activeDerbies(world).find(d => d.clubs.includes(a) && d.clubs.includes(b));
  const ms = meetings(world, a, b);
  const since = world.history.h2hSince ?? world.history.snapshots[0]?.year ?? world.season.year;
  const html = `<div class="page-head"><h1>Head-to-head</h1><p class="muted">${derby ? `${esc(derby.name)} · ` : ''}every competitive meeting since ${esc(seasonLabel(since))}</p></div>
  <div class="toolbar h2h-pick">${sel('a', a)} <span class="muted">v</span> ${sel('b', b)}</div>
  <div class="grid">
    <section class="card span-all h2h-summary"><div class="h2h-side">${club(world, a, { crest: 'md', bold: true })}<div class="big">${r.w}</div><div class="muted small">wins</div></div>
      <div class="h2h-side"><div class="muted">${r.p} meetings</div><div class="big muted">${r.d}</div><div class="muted small">draws · goals ${r.gf}–${r.ga}</div></div>
      <div class="h2h-side">${club(world, b, { crest: 'md', bold: true })}<div class="big">${r.l}</div><div class="muted small">wins</div></div></section>
    <section class="card span-all"><h2>Meetings on record</h2>${ms.length ? `<ol class="matches">${ms.slice(0, 40).map(m => `<li><div>${club(world, m.home, { crest: 'xs' })} <span class="score">${scoreText(m.hg, m.ag, m.et, m.pens)}</span> ${club(world, m.away, { crest: 'xs' })}</div><div class="muted small">${esc(seasonLabel(m.season))} · ${esc(compLabel(world, m.comp, leagues(world).some(l => l.id === m.comp) ? undefined : m.stage))}</div></li>`).join('')}</ol>` : empty(r.p ? 'Individual results are kept for derbies and cup ties (Standard storage) and league games (Full storage); the totals above count every meeting.' : 'These clubs have not met yet.')}</section>
  </div>`;
  return { title: 'Head-to-head', html };
};
