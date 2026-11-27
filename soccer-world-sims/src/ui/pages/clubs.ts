import type { Page } from '../types.ts';
import { club, crest, esc, f1, f0, bar, tabs, empty, scoreText } from '../dom.ts';
import { leagues, league, standings, seasonLabel, compLabel, form, trophies, positionNow, overall, zoneOf, clubIndex } from '../data.ts';
import { mountChart, type Band } from '../components/chart.ts';
import { pyramidRank } from '../../engine/world.ts';
import { ambitionLabel } from '../../engine/params.ts';
import type { MatchRecord, World } from '../../engine/types.ts';

// ---------------------------------------------------------------- directory
export const clubsPage: Page = ({ world, state }) => {
  const f = state.clubsFilter;
  const ls = leagues(world);
  const rows = world.clubs.map(c => {
    const p = positionNow(world, c.id);
    return { c, info: world.info[c.id], league: c.league, tier: ls.findIndex(l => l.id === c.league), pos: p.pos, pts: p.row.pts, ovr: overall(c) };
  }).filter(r => (!f.q || r.info.name.toLowerCase().includes(f.q.toLowerCase())) && (!f.league || r.league === f.league));
  const key: Record<string, (r: typeof rows[number]) => number | string> = {
    ovr: r => r.ovr, att: r => r.c.attack, mid: r => r.c.midfield, def: r => r.c.defence, rep: r => r.c.reputation, sta: r => r.c.stability,
    name: r => r.info.name, pos: r => r.tier * 100 + r.pos, own: r => r.c.ambition,
  };
  const k = key[f.sort] ?? key.ovr;
  rows.sort((a, b) => { const x = k(a), y = k(b); return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * (f.sort === 'name' || f.sort === 'pos' ? 1 : -1) * f.dir; });
  const th = (id: string, label: string, cls = 'num') => `<th class="${cls} sortable${f.sort === id ? ' sorted' : ''}"><button data-action="sort-clubs" data-key="${id}">${label}${f.sort === id ? (f.dir === 1 ? ' ▾' : ' ▴') : ''}</button></th>`;
  const html = `<div class="page-head"><h1>Clubs</h1><p class="muted">${world.clubs.length} playable clubs · ratings 0–100 · overall is the mean of attack, midfield and defence · OWN = ownership ambition (−100 to +100)</p></div>
    <div class="toolbar"><input type="search" placeholder="Search clubs" value="${esc(f.q)}" data-input="clubs-q" aria-label="Search clubs">
      <select data-change="clubs-league" aria-label="Division"><option value="">All divisions</option>${ls.map(l => `<option value="${l.id}"${f.league === l.id ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
      <span class="muted small">${rows.length} shown</span></div>
    <section class="card"><div class="table-wrap"><table class="table">
      <thead><tr>${th('name', 'Club', '')}${th('pos', 'Division', '')}${th('ovr', 'OVR')}${th('att', 'ATT')}${th('mid', 'MID')}${th('def', 'DEF')}${th('rep', 'REP')}${th('sta', 'STA')}${th('own', 'OWN')}<th class="hide-sm">Form</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${club(world, r.c.id, { short: false })}</td><td class="nowrap"><span class="pos zone-${zoneOf(league(world, r.league), r.pos, r.tier + 1)}">${r.pos}</span> ${esc(league(world, r.league).name)}</td><td class="num strong">${f0(r.ovr)}</td><td class="num">${f0(r.c.attack)}</td><td class="num">${f0(r.c.midfield)}</td><td class="num">${f0(r.c.defence)}</td><td class="num">${f1(r.c.reputation)}</td><td class="num">${f1(r.c.stability)}</td><td class="num" title="${esc(ambitionLabel(r.c.ambition))}">${r.c.ambition > 0.005 ? '+' : ''}${Math.round(r.c.ambition * 100)}</td><td class="hide-sm">${form(world, r.c.id).map(x => `<span class="form form-${x}">${x}</span>`).join('')}</td></tr>`).join('')}</tbody></table></div></section>`;
  return { title: 'Clubs', html };
};

// ---------------------------------------------------------------- profile
function matchLine(world: World, r: MatchRecord): string {
  return `<li><div>${club(world, r.home, { crest: 'xs' })} <span class="score">${scoreText(r.hg, r.ag, r.et)}</span> ${club(world, r.away, { crest: 'xs' })}</div><div class="muted small">${esc(seasonLabel(r.season))} · ${esc(compLabel(world, r.comp, r.stage))}${world.season.tables[r.comp] || leagues(world).some(l => l.id === r.comp) ? ` · ${esc(r.stage)}` : ''}</div></li>`;
}

export const clubPage: Page = ({ world, args, state }) => {
  const id = args[0];
  const info = world.info[id];
  if (!info) return { title: 'Club', html: empty('Unknown club') };
  const c = world.clubs.find(x => x.id === id)!;
  const ci = clubIndex(world, id);
  const ls = leagues(world);
  const now = positionNow(world, id);
  const l = league(world, now.league);
  const h = world.history.clubs[id];
  const snaps = world.history.snapshots;
  const tr = trophies(world, id);
  // Season-level career
  const career = snaps.map(s => ({ year: s.year, league: s.league[ci], pos: s.position[ci], pyr: s.pyramid[ci], ovr: s.overall[ci], rep: s.reputation[ci], sta: s.stability[ci] }));
  const moves: { year: number; text: string; up: boolean }[] = [];
  for (let k = 1; k < career.length; k++) if (career[k].league !== career[k - 1].league) {
    const up = ls.findIndex(x => x.id === career[k].league) < ls.findIndex(x => x.id === career[k - 1].league);
    moves.push({ year: career[k].year, up, text: `${up ? 'Promoted to' : 'Relegated to'} ${league(world, career[k].league).name}` });
  }
  if (!world.season.complete && career.length && career.at(-1)!.league !== c.league) {
    const up = ls.findIndex(x => x.id === c.league) < ls.findIndex(x => x.id === career.at(-1)!.league);
    moves.push({ year: world.season.year, up, text: `${up ? 'Promoted to' : 'Relegated to'} ${league(world, c.league).name}` });
  }
  const best = career.length ? career.reduce((a, b) => (b.pyr < a.pyr ? b : a)) : null;
  const seasonsBy = ls.map(x => ({ l: x, n: career.filter(k => k.league === x.id).length })).filter(x => x.n);
  // Current season, all competitions
  const ms = world.season.matches.filter(m => m.hg !== undefined && (m.home === id || m.away === id));
  const all = ms.reduce((a, m) => { const gf = m.home === id ? m.hg! : m.ag!, ga = m.home === id ? m.ag! : m.hg!; a.p++; a.gf += gf; a.ga += ga; if (gf > ga) a.w++; else if (gf < ga) a.l++; else a.d++; return a; }, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
  const cupStatus = Object.values(world.season.cups).map(st => {
    const ties = st.ties.filter(t => t.a === id || t.b === id);
    if (!ties.length) return '';
    const last = ties[ties.length - 1];
    const name = compLabel(world, st.id);
    const txt = st.winner === id ? 'Winners' : last.winner && last.winner !== id ? `Out in the ${last.round}` : `In the ${last.round}`;
    return `<li><span class="muted">${esc(name)}:</span> ${esc(txt)}</li>`;
  }).join('');
  const ranges = [['all', 'All'], ['50', '50 seasons'], ['25', '25 seasons'], ['10', '10 seasons']];
  const events = [...h.events].reverse().slice(0, 60);
  const html = `
  <div class="profile-head card">
    ${crest(world, id, 'xl')}
    <div class="profile-title"><h1>${esc(info.name)}</h1>
      <div class="muted"><a href="#/standings/${l.id}">${esc(l.name)}</a> · ${now.pos}${ordinalSuffix(now.pos)} · ${now.row.pts} pts after ${now.row.p} games · pyramid #${pyramidRank(world, l.id, now.pos)}</div>
      <div class="form-line">${form(world, id, 8).map(x => `<span class="form form-${x}">${x}</span>`).join('')}</div></div>
    <div class="ovr-box"><div class="eyebrow">Overall</div><div class="ovr">${f0(overall(c))}</div></div>
  </div>
  <div class="grid">
    <section class="card"><h2>Attributes</h2><dl class="attrs">
      <dt>Attack</dt><dd>${bar(c.attack)}<span>${f1(c.attack)}</span></dd>
      <dt>Midfield</dt><dd>${bar(c.midfield)}<span>${f1(c.midfield)}</span></dd>
      <dt>Defence</dt><dd>${bar(c.defence)}<span>${f1(c.defence)}</span></dd>
      <dt>Reputation</dt><dd>${bar(c.reputation, 100, 'alt')}<span>${f1(c.reputation)}</span></dd>
      <dt>Stability</dt><dd>${bar(c.stability, 100, 'alt2')}<span>${f1(c.stability)}</span></dd></dl>
      ${ownerLine(c.ambition, c.ownerSince)}
      <p class="muted small">Reputation: long-term standing and pull. Stability: resilience to disruption. Ownership ambition (−100 asset-stripping … +100 wealthy takeover) drives investment and changes with takeovers and sell-offs. All change slowly; season form is temporary.</p></section>
    <section class="card"><h2>${esc(seasonLabel(world.season.year))} season</h2>
      <table class="table compact"><thead><tr><th></th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GF</th><th class="num">GA</th><th class="num">Pts</th></tr></thead><tbody>
      <tr><td>${esc(l.short)}</td><td class="num">${now.row.p}</td><td class="num">${now.row.w}</td><td class="num">${now.row.d}</td><td class="num">${now.row.l}</td><td class="num">${now.row.gf}</td><td class="num">${now.row.ga}</td><td class="num strong">${now.row.pts}</td></tr>
      <tr><td>All</td><td class="num">${all.p}</td><td class="num">${all.w}</td><td class="num">${all.d}</td><td class="num">${all.l}</td><td class="num">${all.gf}</td><td class="num">${all.ga}</td><td></td></tr></tbody></table>
      ${cupStatus ? `<ul class="plain">${cupStatus}</ul>` : ''}</section>
    <section class="card"><h2>Honours</h2>${tr.length ? `<ul class="honours">${tr.map(t => `<li><span class="count">${t.seasons.length}</span><div><div class="strong">${esc(t.label)}</div><div class="muted small">${t.seasons.map(seasonLabel).join(', ')}</div></div></li>`).join('')}</ul>` : empty('No trophies yet in this world.')}</section>
    <section class="card span-2"><div class="card-head"><h2>History</h2>
      <div class="seg">${ranges.map(([k, lbl]) => `<button class="seg-btn${state.chartRange === k ? ' active' : ''}" data-action="chart-range" data-range="${k}">${lbl}</button>`).join('')}</div></div>
      <div class="chart-title">Overall rating, reputation and stability</div>
      <div class="chart-legend"><span><i style="background:var(--series-1)"></i>Overall</span><span><i style="background:var(--series-2)"></i>Reputation</span><span><i style="background:var(--series-3)"></i>Stability</span></div>
      <div id="chart-ratings"></div>
      <div class="chart-title row">Combined pyramid position <span class="muted small">(1 = top of the Premier League, 116 = bottom of the National League)</span>
        <span class="seg">${(['season', 'matchday'] as const).map(k => `<button class="seg-btn${state.positionDetail === k ? ' active' : ''}" data-action="position-detail" data-detail="${k}">${k === 'season' ? 'By season' : 'By matchday'}</button>`).join('')}</span></div>
      <div id="chart-position"></div>
      ${!snaps.length ? '<p class="muted small">Graphs fill in as seasons are completed (the current season is shown live).</p>' : ''}
    </section>
    <section class="card"><h2>Achievements</h2><ul class="plain">
      ${best ? `<li>Best finish: <strong>${best.pos}${best.pos === 1 ? 'st' : ''} in the ${esc(league(world, best.league).name)}</strong> (${esc(seasonLabel(best.year))})</li>` : '<li class="muted">Complete a season to build a record.</li>'}
      ${seasonsBy.map(x => `<li>${x.n} season${x.n > 1 ? 's' : ''} in the ${esc(x.l.name)}</li>`).join('')}
      <li>${moves.filter(m => m.up).length} promotions · ${moves.filter(m => !m.up).length} relegations</li></ul></section>
    <section class="card"><h2>Promotions & relegations</h2>${moves.length ? `<ul class="timeline">${[...moves].reverse().map(m => `<li class="${m.up ? 'up' : 'down'}"><span class="muted">${esc(seasonLabel(m.year))}</span> ${esc(m.text)}</li>`).join('')}</ul>` : empty('No divisional changes yet.')}</section>
    <section class="card"><h2>Biggest wins</h2>${h.best.length ? `<ol class="matches">${h.best.map(r => matchLine(world, r)).join('')}</ol>` : empty('No wins recorded yet.')}<p class="muted small">Ranked by margin, then goals scored, then away wins, then earliest.</p></section>
    <section class="card"><h2>Heaviest defeats</h2>${h.worst.length ? `<ol class="matches">${h.worst.map(r => matchLine(world, r)).join('')}</ol>` : empty('No defeats recorded yet.')}<p class="muted small">Ranked by margin, then goals conceded, then home defeats, then earliest.</p></section>
    <section class="card span-2"><h2>Timeline</h2>${events.length ? `<ul class="timeline">${events.map(e => `<li class="tone-${e.tone}"><span class="muted">${esc(seasonLabel(e.season))}</span> ${esc(e.text)}</li>`).join('')}</ul>` : empty('Honours, moves and club events appear here.')}</section>
  </div>`;

  const mount = (root: HTMLElement) => {
    const cleanups: (() => void)[] = [];
    // Points: completed seasons + the live current season.
    const pts = [...career];
    if (!world.season.complete) pts.push({ year: world.season.year, league: c.league, pos: now.pos, pyr: pyramidRank(world, c.league, now.pos), ovr: Math.round(overall(c) * 10) / 10, rep: Math.round(c.reputation * 10) / 10, sta: Math.round(c.stability * 10) / 10 });
    const lim = state.chartRange === 'all' ? Infinity : Number(state.chartRange);
    const view = pts.slice(Math.max(0, pts.length - lim));
    const xTicks = (labels: number[]) => { const n = labels.length; const every = Math.max(1, Math.ceil(n / 8)); return labels.map((y, i) => ({ index: i, label: seasonLabel(y) })).filter((_, i) => i % every === 0 || i === n - 1); };
    const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const rEl = root.querySelector<HTMLElement>('#chart-ratings')!;
    cleanups.push(mountChart(rEl, {
      ariaLabel: `${info.name} overall rating, reputation and stability by season`,
      series: [{ label: 'Overall', color: css('--series-1'), values: view.map(p => p.ovr) }, { label: 'Reputation', color: css('--series-2'), values: view.map(p => p.rep) }, { label: 'Stability', color: css('--series-3'), values: view.map(p => p.sta) }],
      yMin: 0, yMax: 100, yTicks: [0, 25, 50, 75, 100], xTicks: xTicks(view.map(p => p.year)), height: 220,
      title: i => `${seasonLabel(view[i].year)}${i === view.length - 1 && !world.season.complete ? ' (in progress)' : ''}`,
      rows: i => [
        { label: 'overall', value: f1(view[i].ovr), color: css('--series-1') },
        { label: 'reputation', value: f1(view[i].rep), color: css('--series-2') },
        { label: 'stability', value: f1(view[i].sta), color: css('--series-3') },
        { label: league(world, view[i].league).name, value: `${view[i].pos}${ordinalSuffix(view[i].pos)}` },
      ],
    }));
    // Position chart
    let offs = 0;
    const bands: Band[] = ls.map(x => { const b = { from: offs + 0.5, to: offs + x.size + 0.5, label: x.short }; offs += x.size; return b; });
    const pEl = root.querySelector<HTMLElement>('#chart-position')!;
    type P = { year: number; md: number | null; league: string; pos: number; pyr: number };
    let pp: P[] = [];
    if (state.positionDetail === 'matchday') {
      const years = view.map(v => v.year);
      for (const y of years) {
        const track = y === world.season.year && !world.season.complete ? [c.league, ...(world.season.positionTrack[c.league]?.[id] ?? [])] : h.positions[y];
        if (!track) { const v = view.find(x => x.year === y)!; pp.push({ year: y, md: null, league: v.league, pos: v.pos, pyr: v.pyr }); continue; }
        const [lg, ...arr] = track as [string, ...number[]];
        arr.forEach((pos, k) => pp.push({ year: y, md: k + 1, league: lg, pos, pyr: pyramidRank(world, lg, pos) }));
      }
    } else pp = view.map(v => ({ year: v.year, md: null, league: v.league, pos: v.pos, pyr: v.pyr }));
    const firstIdx = new Map<number, number>();
    pp.forEach((p, i) => { if (!firstIdx.has(p.year)) firstIdx.set(p.year, i); });
    const years = [...firstIdx.keys()];
    const every = Math.max(1, Math.ceil(years.length / 8));
    cleanups.push(mountChart(pEl, {
      ariaLabel: `${info.name} combined pyramid position by ${state.positionDetail}`,
      series: [{ label: 'Pyramid position', color: css('--series-1'), values: pp.map(p => p.pyr) }],
      yMin: 1, yMax: 116, invert: true, bands, yTicks: [1, 20, 44, 68, 92, 116], height: 240,
      xTicks: years.filter((_, k) => k % every === 0).map(y => ({ index: firstIdx.get(y)!, label: seasonLabel(y) })),
      title: i => `${seasonLabel(pp[i].year)}${pp[i].md ? ` · matchday ${pp[i].md}` : ''}`,
      rows: i => {
        const v = view.find(x => x.year === pp[i].year);
        return [
          { label: league(world, pp[i].league).name, value: `${pp[i].pos}${ordinalSuffix(pp[i].pos)}`, color: css('--series-1') },
          { label: 'pyramid position', value: `#${pp[i].pyr}` },
          ...(v ? [{ label: 'overall', value: f1(v.ovr) }, { label: 'reputation', value: f1(v.rep) }, { label: 'stability', value: f1(v.sta) }] : []),
        ];
      },
    }));
    return () => cleanups.forEach(f => f());
  };
  return { title: info.name, html, mount };
};

/** Ownership ambition: label badge plus a diverging meter (display scale -100..+100). */
export function ownerLine(ambition: number, since: number | null): string {
  const a = Math.round((ambition ?? 0) * 100);
  const label = ambitionLabel(ambition ?? 0);
  const cls = label === 'Wealthy & ambitious' ? 'pos' : label === 'Steady' ? 'neu' : label === 'Cautious' ? 'warn' : 'neg';
  const left = a < 0 ? 50 + a / 2 : 50, width = Math.abs(a) / 2;
  return `<div class="owner-line"><span class="dt">Ownership</span><span class="owner-badge owner-${cls}">${esc(label)}</span>
    <span class="meter diverging" role="img" aria-label="Ownership ambition ${a}"><span style="left:${left}%;width:${width}%"></span></span><span class="strong num">${a > 0 ? '+' : ''}${a}</span>
    ${since !== null && since !== undefined ? `<span class="muted small">owners since ${since}</span>` : ''}</div>`;
}

export function ordinalSuffix(n: number): string { const v = n % 100; return v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'; }
void standings; void tabs;
