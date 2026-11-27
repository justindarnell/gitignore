import type { Page } from '../types.ts';
import { club, esc, tabs, scoreText, empty, signed } from '../dom.ts';
import { leagues, leaguesAt, rulesTimeline, standings, seasonLabel, zoneOf, form, leagueRounds, currentRound, country, compLabel } from '../data.ts';
import type { Match, TableRow, World } from '../../engine/types.ts';
import { raceCard, mountRace } from './stories.ts';

const ZONE_LABEL = { champion: 'Champions', promoted: 'Automatic promotion', playoff: 'Play-offs', relegated: 'Relegation' } as const;

export function leagueTable(world: World, lid: string, rows: TableRow[], showForm: boolean, year = world.season.year): string {
  // Zones follow the rules of the season shown (e.g. four relegated from a 22-club Premier League in 1994/95).
  const l = leaguesAt(world, year).find(x => x.id === lid)!;
  const zones = new Set(rows.map((_, i) => zoneOf(l, i + 1, l.tier)).filter(Boolean));
  return `<div class="table-wrap"><table class="table standings">
    <thead><tr><th class="num">Pos</th><th>Club</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GF</th><th class="num">GA</th><th class="num">GD</th><th class="num">Pts</th>${showForm ? '<th class="hide-sm">Form</th>' : ''}</tr></thead>
    <tbody>${rows.map((r, i) => {
      const z = zoneOf(l, i + 1, l.tier);
      const next = zoneOf(l, i + 2, l.tier);
      return `<tr class="zone-row-${z}${z !== next && i < rows.length - 1 ? ' zone-break' : ''}"><td class="num"><span class="pos zone-${z}">${i + 1}</span></td><td>${club(world, r.club, { crest: 'sm' })}</td><td class="num">${r.p}</td><td class="num">${r.w}</td><td class="num">${r.d}</td><td class="num">${r.l}</td><td class="num">${r.gf}</td><td class="num">${r.ga}</td><td class="num">${signed(r.gf - r.ga)}</td><td class="num strong">${r.pts}${r.ded ? ` <span class="ded" title="${r.ded} points deducted (administration)">−${r.ded}</span>` : ''}</td>${showForm ? `<td class="hide-sm">${form(world, r.club).map(x => `<span class="form form-${x}">${x}</span>`).join('')}</td>` : ''}</tr>`;
    }).join('')}</tbody></table></div>
    <div class="legend">${[...zones].map(z => `<span><span class="pos zone-${z}"> </span>${ZONE_LABEL[z as keyof typeof ZONE_LABEL]}</span>`).join('')}<span class="muted small">Tiebreakers: points, goal difference, goals scored, head-to-head.${rows.some(r => r.ded) ? ' <span class="ded">−n</span>: points deducted (administration), already taken off Pts.' : ''}</span></div>`;
}

export const standingsPage: Page = ({ world, args, state }) => {
  const lid = args[0] ?? state.standingsLeague;
  state.standingsLeague = lid;
  const yearArg = args[1] ? Number(args[1]) : null;
  const current = yearArg === null || yearArg === world.season.year && !world.season.complete;
  const shownYear = current ? world.season.year : yearArg!;
  const ls = leaguesAt(world, shownYear);
  const l = ls.find(x => x.id === lid) ?? ls[0];
  const years = world.history.snapshots.map(s => s.year);
  let rows: TableRow[];
  let note = '';
  if (current) rows = standings(world, l.id);
  else {
    const k = world.history.snapshots.findIndex(s => s.year === yearArg);
    rows = k >= 0 ? world.history.leagues[k].find(x => x.league === l.id)!.table : standings(world, l.id);
    const rec = world.history.leagues[k]?.find(x => x.league === l.id);
    if (rec?.playoffFinal) { const f = rec.playoffFinal; note = `<p class="muted">Play-off final: ${club(world, f.home)} ${scoreText(f.hg, f.ag, f.et, f.pens)} ${club(world, f.away)}</p>`; }
  }
  const seasonOpts = [`<option value="">${esc(seasonLabel(world.season.year))} (current)</option>`, ...[...years].reverse().filter(y => y !== world.season.year || world.season.complete).map(y => `<option value="${y}"${y === yearArg ? ' selected' : ''}>${esc(seasonLabel(y))}</option>`)];
  const html = `<div class="page-head"><h1>Standings</h1>
    <div class="toolbar"><label>Season <select data-change="standings-season" data-league="${l.id}">${seasonOpts.join('')}</select></label></div></div>
    ${tabs(ls.map(x => ({ id: x.id, label: x.name, href: `#/standings/${x.id}${yearArg !== null ? '/' + yearArg : ''}` })), l.id)}
    <section class="card">${leagueTable(world, l.id, rows, current, shownYear)}${note}${rulesNote(world, l.id, shownYear)}</section>
    ${raceCard(world, l.id, current ? null : yearArg)}`;
  return { title: `${l.name} standings`, html, mount: root => mountRace(root, world, l.id, current ? null : yearArg) };
};

/** This league's promotion/relegation rules in the season shown, plus rule changes (dated config). */
function rulesNote(world: World, lid: string, year: number): string {
  const l = leaguesAt(world, year).find(x => x.id === lid)!;
  const ls = leaguesAt(world, year);
  const up = l.tier > 1 ? l.autoPromotion + (l.playoff ? 1 : 0) : 0;
  const down = l.tier < ls.length ? l.relegation : 0;
  const po = l.playoff ? `, play-offs ${l.playoff.rounds[0].newSeeds.length + l.playoff.rounds.slice(1).reduce((a, r) => a + r.newSeeds.length, 0)} clubs` : '';
  const parts = [`${l.size} clubs`, up ? `${up} promoted (${l.autoPromotion} automatic${po})` : '', down ? `${down} relegated` : l.tier === ls.length ? 'no relegation (bottom of the playable pyramid)' : 'no relegation'].filter(Boolean);
  const { past, next } = rulesTimeline(world);
  const changes = past.filter(c => c.leagues?.[lid] || c.cups);
  const list = changes.length || next ? `<details class="small"><summary>Rule changes in this world</summary><ul class="plain">${changes.map(c => `<li><strong>${esc(seasonLabel(c.from))}</strong>: ${esc(c.note)}</li>`).join('')}${next ? `<li class="muted">Next: <strong>${esc(seasonLabel(next.from))}</strong>: ${esc(next.note)}</li>` : ''}</ul></details>` : '';
  return `<p class="muted small">${esc(seasonLabel(year))} rules: ${esc(parts.join(', '))}.</p>${list}`;
}

function matchRow(world: World, m: Match, showComp = false): string {
  const played = m.hg !== undefined;
  return `<div class="fixture${played ? '' : ' upcoming'}">${club(world, m.home)}<span class="score">${played ? scoreText(m.hg!, m.ag!, m.et, m.pens) : 'v'}</span>${club(world, m.away)}${showComp ? `<span class="muted small comp">${esc(compLabel(world, m.comp, m.stage))}</span>` : ''}${m.neutral ? '<span class="tag">N</span>' : ''}</div>`;
}

export const fixturesPage: Page = ({ world, args, state }) => {
  const s = world.season;
  const ls = leagues(world);
  const comp = args[0] ?? state.fixturesComp;
  state.fixturesComp = comp;
  const items = [...ls.map(l => ({ id: l.id, label: l.short === 'CH' ? 'Championship' : l.name, href: `#/fixtures/${l.id}` })), { id: 'cups', label: 'Cups & play-offs', href: '#/fixtures/cups' }, { id: 'all', label: 'All by date', href: '#/fixtures/all' }];
  let body = '';
  if (ls.some(l => l.id === comp)) {
    const rounds = leagueRounds(world, comp);
    const cur = Math.min(rounds.length, Math.max(1, currentRound(world, comp) - (s.complete ? 0 : 1) || 1));
    const r = Math.max(1, Math.min(rounds.length, args[1] ? Number(args[1]) : state.fixturesRound[comp] ?? cur));
    state.fixturesRound[comp] = r;
    const slot = rounds[r - 1];
    const ms = s.matches.filter(m => m.comp === comp && m.slot === slot);
    body = `<div class="round-nav">
      <a class="btn small${r <= 1 ? ' disabled' : ''}" href="#/fixtures/${comp}/${r - 1}" aria-label="Previous matchday">‹</a>
      <select data-change="fixtures-round" data-comp="${comp}">${rounds.map((_, i) => `<option value="${i + 1}"${i + 1 === r ? ' selected' : ''}>Matchday ${i + 1}${rounds[i] < s.slotIndex ? '' : ' (upcoming)'}</option>`).join('')}</select>
      <a class="btn small${r >= rounds.length ? ' disabled' : ''}" href="#/fixtures/${comp}/${r + 1}" aria-label="Next matchday">›</a>
      <span class="muted">${esc(s.calendar[slot].label)}</span></div>
      <section class="card fixtures">${ms.map(m => matchRow(world, m)).join('')}</section>`;
  } else if (comp === 'cups') {
    const ko = s.matches.filter(m => !s.tables[m.comp]).sort((a, b) => b.slot - a.slot || a.id - b.id);
    const bySlot = new Map<number, Match[]>();
    for (const m of ko) { if (!bySlot.has(m.slot)) bySlot.set(m.slot, []); bySlot.get(m.slot)!.push(m); }
    body = bySlot.size ? [...bySlot.entries()].map(([slot, ms]) => `<section class="card fixtures"><div class="eyebrow">${esc(s.calendar[slot].label)}</div>${ms.map(m => matchRow(world, m, true)).join('')}</section>`).join('') : empty('No cup or play-off ties have been drawn yet this season.');
  } else {
    // All competitions around the current date
    const from = Math.max(0, s.slotIndex - 2), to = Math.min(s.calendar.length - 1, s.slotIndex + 2);
    const parts: string[] = [];
    for (let k = from; k <= to; k++) {
      const ms = s.matches.filter(m => m.slot === k);
      if (!ms.length) continue;
      parts.push(`<section class="card fixtures"><div class="eyebrow">${esc(s.calendar[k].label)}${k === s.slotIndex ? ' · next' : ''}</div>${ms.map(m => matchRow(world, m, true)).join('')}</section>`);
    }
    body = parts.join('') || empty('No matches around this date.');
  }
  void country;
  return { title: 'Fixtures & results', html: `<div class="page-head"><h1>Fixtures & results</h1></div>${tabs(items, comp)}${body}` };
};
