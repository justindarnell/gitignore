import type { Page } from '../types.ts';
import { club, esc, tabs, empty, scoreText, f1, signed } from '../dom.ts';
import { leagues, league, seasonLabel, compLabel, titleCounts, country } from '../data.ts';
import { leagueTable } from './standings.ts';
import { erasSection, rivalriesSection } from './stories.ts';
import type { World } from '../../engine/types.ts';

const TABS = [['honours', 'Rolls of honour'], ['totals', 'Trophy totals'], ['tables', 'Historical tables'], ['moves', 'Promotion & relegation'], ['records', 'Records'], ['rankings', 'Rise & fall'], ['eras', 'Eras & dynasties'], ['rivalries', 'Rivalries'], ['seasons', 'Season reviews']];

function competitions(world: World) {
  return [...leagues(world).map(l => ({ id: l.id, name: l.name })), ...country(world).cups.map(c => ({ id: c.id, name: c.name }))];
}

function honours(world: World, comp: string): string {
  const comps = competitions(world);
  const isLeague = leagues(world).some(l => l.id === comp);
  const rows = world.history.snapshots.map((s, k) => {
    if (isLeague) {
      const lr = world.history.leagues[k].find(x => x.league === comp)!;
      const t = lr.table;
      return `<tr><td class="muted nowrap">${esc(seasonLabel(s.year))}</td><td>${club(world, lr.champion, { bold: true })}</td><td class="num">${t[0].pts}</td><td>${club(world, t[1].club)}</td><td class="num muted">${t[1].pts}</td><td class="hide-sm">${lr.promotedViaPlayoff ? `<span class="muted small">Play-offs:</span> ${club(world, lr.promotedViaPlayoff, { crest: 'xs' })}` : ''}</td></tr>`;
    }
    const cr = world.history.cups[k].find(x => x.cup === comp);
    if (!cr) return '';
    const f = cr.final;
    return `<tr><td class="muted nowrap">${esc(seasonLabel(s.year))}</td><td>${club(world, cr.winner, { bold: true })}</td><td class="nowrap">${scoreText(f.hg, f.ag, f.et, f.pens)}</td><td>${club(world, cr.runnerUp)}</td><td></td><td></td></tr>`;
  }).reverse().join('');
  const totals = titleCounts(world, comp).slice(0, 12);
  return `${tabs(comps.map(c => ({ id: c.id, label: c.name, href: `#/history/honours/${c.id}` })), comp, 'sub')}
  <div class="grid-2"><section class="card"><h2>${esc(comps.find(c => c.id === comp)?.name ?? '')}: every season</h2>${rows ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Season</th><th>${isLeague ? 'Champion' : 'Winner'}</th><th class="num">${isLeague ? 'Pts' : 'Final'}</th><th>Runner-up</th><th></th><th class="hide-sm"></th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('No completed seasons yet.')}</section>
  <section class="card"><h2>Most titles</h2>${totals.length ? `<table class="table compact"><tbody>${totals.map(t => `<tr><td>${club(world, t.club)}</td><td class="num strong">${t.count}</td><td class="muted small">last ${esc(seasonLabel(t.last))}</td></tr>`).join('')}</tbody></table>` : empty('—')}</section></div>`;
}

function totals(world: World): string {
  const comps = competitions(world);
  const by = new Map<string, Record<string, number>>();
  for (const c of comps) for (const t of titleCounts(world, c.id)) { const r = by.get(t.club) ?? {}; r[c.id] = t.count; by.set(t.club, r); }
  const majors = [leagues(world)[0].id, ...country(world).cups.map(c => c.id)];
  const rows = [...by.entries()].map(([club, r]) => ({ club, r, major: majors.reduce((a, k) => a + (r[k] ?? 0), 0), all: Object.values(r).reduce((a, b) => a + b, 0) })).sort((a, b) => b.major - a.major || b.all - a.all);
  return rows.length ? `<section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Club</th>${comps.map(c => `<th class="num">${esc(c.name.replace('Premier League', 'PL'))}</th>`).join('')}<th class="num">Major</th></tr></thead><tbody>${rows.map(x => `<tr><td>${club(world, x.club)}</td>${comps.map(c => `<td class="num${x.r[c.id] ? '' : ' muted'}">${x.r[c.id] ?? '·'}</td>`).join('')}<td class="num strong">${x.major}</td></tr>`).join('')}</tbody></table></div><p class="muted small">Major = top-flight titles + FA Cups + EFL Cups.</p></section>` : empty('No completed seasons yet.');
}

function tables(world: World, args: string[]): string {
  const years = world.history.snapshots.map(s => s.year);
  if (!years.length) return empty('No completed seasons yet.');
  const year = args[1] ? Number(args[1]) : years[years.length - 1];
  const lid = args[2] ?? leagues(world)[0].id;
  const k = years.indexOf(year);
  const lr = world.history.leagues[k].find(x => x.league === lid)!;
  return `<div class="toolbar"><label>Season <select data-change="history-season" data-league="${lid}">${[...years].reverse().map(y => `<option value="${y}"${y === year ? ' selected' : ''}>${esc(seasonLabel(y))}</option>`).join('')}</select></label></div>
    ${tabs(leagues(world).map(l => ({ id: l.id, label: l.name, href: `#/history/tables/${year}/${l.id}` })), lid, 'sub')}
    <section class="card">${leagueTable(world, lid, lr.table, false)}${lr.playoffFinal ? `<p class="muted">Play-off final: ${club(world, lr.playoffFinal.home)} ${scoreText(lr.playoffFinal.hg, lr.playoffFinal.ag, lr.playoffFinal.et, lr.playoffFinal.pens)} ${club(world, lr.playoffFinal.away)}</p>` : ''}</section>`;
}

function moves(world: World): string {
  const ls = leagues(world);
  const rows = world.history.leagues.map((s, k) => `<tr><td class="muted nowrap">${esc(seasonLabel(world.history.snapshots[k].year))}</td>${ls.map((l, i) => `<td><div class="mini-list">${s[i].promoted.map(c => `<span class="tag up">↑</span>${club(world, c, { crest: 'xs' })}`).join(' ')}</div><div class="mini-list">${s[i].relegated.map(c => `<span class="tag down">↓</span>${club(world, c, { crest: 'xs' })}`).join(' ')}</div></td>`).join('')}</tr>`).reverse().join('');
  return rows ? `<section class="card"><div class="table-wrap"><table class="table compact moves"><thead><tr><th>Season</th>${ls.map(l => `<th>${esc(l.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>` : empty('No completed seasons yet.');
}

function records(world: World): string {
  const H = world.history;
  if (!H.leagues.length) return empty('Records appear once seasons are completed.');
  const ls = leagues(world);
  // Longest title streak (top flight only: lower-division champions are always promoted)
  // and most titles in every division.
  let best = { club: '', n: 0, end: 0 }, cur = { club: '', n: 0 };
  H.leagues.forEach((s, k) => {
    const c = s[0].champion;
    cur = c === cur.club ? { club: c, n: cur.n + 1 } : { club: c, n: 1 };
    if (cur.n > best.n) best = { ...cur, end: H.snapshots[k].year };
  });
  const streaks = `<tr><td>${esc(ls[0].name)}</td><td>${club(world, best.club)}</td><td class="num strong">${best.n}</td><td class="muted small">${esc(seasonLabel(best.end - best.n + 1))}–${esc(seasonLabel(best.end))}</td></tr>`;
  const mostTitles = ls.map(l => { const t = titleCounts(world, l.id)[0]; return `<tr><td>${esc(l.name)}</td><td>${club(world, t.club)}</td><td class="num strong">${t.count}</td></tr>`; }).join('');
  // Most top-flight seasons
  const plSeasons = world.clubs.map((c, i) => ({ id: c.id, n: H.snapshots.filter(s => s.league[i] === ls[0].id).length })).sort((a, b) => b.n - a.n).slice(0, 10);
  // Highest/lowest points
  const allTop = H.leagues.map((s, k) => ({ year: H.snapshots[k].year, r: s[0].table[0] }));
  const maxPts = [...allTop].sort((a, b) => b.r.pts - a.r.pts)[0];
  const minPts = [...allTop].sort((a, b) => a.r.pts - b.r.pts)[0];
  // Notable achievements: first titles, lower-league cup winners, rises from the bottom tier to the top
  const notable: string[] = [];
  const seenChamp = new Set<string>();
  H.leagues.forEach((s, k) => {
    const y = H.snapshots[k].year, c = s[0].champion;
    if (!seenChamp.has(c)) { seenChamp.add(c); if (k > 0) notable.push(`<li><span class="muted">${esc(seasonLabel(y))}</span> ${club(world, c, { crest: 'xs' })} win their first top-flight title of the simulation era</li>`); }
    for (const cr of H.cups[k]) {
      const tier = ls.findIndex(l => l.id === H.snapshots[k].league[world.clubs.findIndex(x => x.id === cr.winner)]) + 1;
      if (tier >= 3) notable.push(`<li><span class="muted">${esc(seasonLabel(y))}</span> ${club(world, cr.winner, { crest: 'xs' })} win the ${esc(compLabel(world, cr.cup))} as a ${esc(ls[tier - 1].name)} club</li>`);
    }
  });
  world.clubs.forEach((c, i) => {
    const first5 = H.snapshots.findIndex(s => s.league[i] === ls[ls.length - 1].id);
    if (first5 < 0) return;
    const reach = H.snapshots.findIndex((s, k) => k > first5 && s.league[i] === ls[0].id);
    if (reach > 0) notable.push(`<li><span class="muted">${esc(seasonLabel(H.snapshots[reach].year))}</span> ${club(world, c.id, { crest: 'xs' })} reach the ${esc(ls[0].name)} ${reach - first5} seasons after playing in the ${esc(ls[ls.length - 1].name)}</li>`);
  });
  const big = H.records.biggestWins;
  return `<div class="grid">
    <section class="card"><h2>Longest title streak</h2><table class="table compact"><tbody>${streaks}</tbody></table>
      <h2 style="margin-top:14px">Most titles by division</h2><table class="table compact"><tbody>${mostTitles}</tbody></table></section>
    <section class="card"><h2>Most top-flight seasons</h2><table class="table compact"><tbody>${plSeasons.map(p => `<tr><td>${club(world, p.id)}</td><td class="num strong">${p.n}</td></tr>`).join('')}</tbody></table></section>
    <section class="card"><h2>Champions' points</h2><ul class="plain"><li>Most: ${club(world, maxPts.r.club)} <strong>${maxPts.r.pts}</strong> <span class="muted">${esc(seasonLabel(maxPts.year))}</span></li><li>Fewest: ${club(world, minPts.r.club)} <strong>${minPts.r.pts}</strong> <span class="muted">${esc(seasonLabel(minPts.year))}</span></li><li>Average: <strong>${f1(allTop.reduce((a, b) => a + b.r.pts, 0) / allTop.length)}</strong></li></ul></section>
    <section class="card span-2"><h2>Biggest victories</h2>${big.length ? `<ol class="matches">${big.slice(0, 15).map(r => `<li><div>${club(world, r.home, { crest: 'xs' })} <span class="score">${scoreText(r.hg, r.ag, r.et)}</span> ${club(world, r.away, { crest: 'xs' })}</div><div class="muted small">${esc(seasonLabel(r.season))} · ${esc(compLabel(world, r.comp, r.stage))}</div></li>`).join('')}</ol>` : empty('Requires Standard storage or higher.')}</section>
    <section class="card"><h2>Notable achievements</h2>${notable.length ? `<ul class="timeline">${notable.slice(-40).reverse().join('')}</ul>` : empty('Nothing remarkable… yet.')}</section></div>`;
}

function rankings(world: World, args: string[], state: { rankMetric: string; rankPeriod: string; rankFrom: number | null; rankTo: number | null }): string {
  const H = world.history.snapshots;
  if (H.length < 2) return empty('Rankings need at least two completed seasons.');
  const metric = args[1] ?? state.rankMetric, period = args[2] ?? state.rankPeriod;
  state.rankMetric = metric; state.rankPeriod = period;
  const years = H.map(s => s.year);
  let a = 0, b = H.length - 1;
  if (period === '5') a = Math.max(0, b - 5);
  if (period === '10') a = Math.max(0, b - 10);
  if (period === 'custom') { a = Math.max(0, years.indexOf(state.rankFrom ?? years[0])); b = Math.max(a, years.indexOf(state.rankTo ?? years[b])); }
  const get = (k: number, i: number) => metric === 'overall' ? H[k].overall[i] : metric === 'reputation' ? H[k].reputation[i] : metric === 'stability' ? H[k].stability[i] : -H[k].pyramid[i];
  const rows = world.clubs.map((c, i) => ({ id: c.id, from: get(a, i), to: get(b, i), d: get(b, i) - get(a, i) }));
  const up = [...rows].sort((x, y) => y.d - x.d).slice(0, 12), down = [...rows].sort((x, y) => x.d - y.d).slice(0, 12);
  const fmt = (v: number) => metric === 'pyramid' ? `#${-v}` : f1(v);
  const fmtD = (d: number) => metric === 'pyramid' ? signed(d) + ' places' : signed(Math.round(d * 10) / 10);
  const list = (rs: typeof rows) => `<table class="table compact"><thead><tr><th>Club</th><th class="num">${esc(seasonLabel(years[a]))}</th><th class="num">${esc(seasonLabel(years[b]))}</th><th class="num">Change</th></tr></thead><tbody>${rs.map(r => `<tr><td>${club(world, r.id)}</td><td class="num muted">${fmt(r.from)}</td><td class="num">${fmt(r.to)}</td><td class="num strong">${fmtD(r.d)}</td></tr>`).join('')}</tbody></table>`;
  const metrics = [['overall', 'Overall rating'], ['reputation', 'Reputation'], ['pyramid', 'Pyramid position'], ['stability', 'Stability']];
  const periods = [['all', 'All time'], ['5', 'Last 5 seasons'], ['10', 'Last 10 seasons'], ['custom', 'Custom']];
  return `<div class="toolbar">${tabs(metrics.map(([k, l]) => ({ id: k, label: l, href: `#/history/rankings/${k}/${period}` })), metric, 'sub')}
    <div class="seg">${periods.map(([k, l]) => `<a class="seg-btn${period === k ? ' active' : ''}" href="#/history/rankings/${metric}/${k}">${l}</a>`).join('')}</div>
    ${period === 'custom' ? `<label>From <select data-change="rank-from">${years.map(y => `<option value="${y}"${y === years[a] ? ' selected' : ''}>${esc(seasonLabel(y))}</option>`).join('')}</select></label><label>To <select data-change="rank-to">${years.map(y => `<option value="${y}"${y === years[b] ? ' selected' : ''}>${esc(seasonLabel(y))}</option>`).join('')}</select></label>` : ''}</div>
    <div class="grid-2"><section class="card"><h2>Most improved</h2>${list(up)}</section><section class="card"><h2>Most declined</h2>${list(down)}</section></div>
    <p class="muted small">Values are end-of-season snapshots. Pyramid position: 1 = Premier League champions, 116 = bottom of the National League.</p>`;
}

function seasonsList(world: World): string {
  const H = world.history;
  if (!H.leagues.length) return empty('No completed seasons yet.');
  return `<section class="card"><div class="table-wrap"><table class="table compact"><thead><tr><th>Season</th><th>Champions</th><th>Headline</th></tr></thead><tbody>${H.snapshots.map((s, k) => {
    const top = (H.stories[k] ?? [])[0];
    return `<tr><td class="nowrap"><a href="#/season/${s.year}">${esc(seasonLabel(s.year))}</a></td><td>${club(world, H.leagues[k][0].champion, { crest: 'xs' })}</td><td class="small">${top ? esc(top.text) : '<span class="muted">—</span>'}</td></tr>`;
  }).reverse().join('')}</tbody></table></div></section>`;
}

export const historyPage: Page = ({ world, args, state }) => {
  const tab = args[0] ?? state.historyTab;
  state.historyTab = tab;
  let body = '';
  let mount: ((root: HTMLElement) => (() => void) | void | undefined) | undefined;
  if (tab === 'honours') { const comp = args[1] ?? state.historyComp; state.historyComp = comp; body = honours(world, comp); }
  else if (tab === 'totals') body = totals(world);
  else if (tab === 'tables') body = tables(world, args);
  else if (tab === 'moves') body = moves(world);
  else if (tab === 'records') body = records(world);
  else if (tab === 'eras') { const e = erasSection(world); body = e.html; mount = e.mount; }
  else if (tab === 'rivalries') body = rivalriesSection(world);
  else if (tab === 'seasons') body = seasonsList(world);
  else body = rankings(world, args, state);
  void league;
  return { title: 'World history', html: `<div class="page-head"><h1>World history</h1><p class="muted">${world.history.leagues.length} completed season${world.history.leagues.length === 1 ? '' : 's'}</p></div>${tabs(TABS.map(([id, label]) => ({ id, label, href: `#/history/${id}` })), tab)}${body}`, mount: mount as never };
};
