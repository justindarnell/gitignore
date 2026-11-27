import type { Page } from '../types.ts';
import { club, esc, scoreText, empty } from '../dom.ts';
import { leagues, standings, seasonLabel, compLabel, zoneOf, form, currentRound, country } from '../data.ts';
import type { World } from '../../engine/types.ts';
import { cupAlive } from '../../engine/world.ts';

function miniTable(world: World, lid: string, rows = 6): string {
  const l = leagues(world).find(x => x.id === lid)!;
  const t = standings(world, lid);
  const show = [...t.slice(0, rows), ...(l.relegation ? t.slice(t.length - l.relegation) : [])];
  return `<table class="table compact"><thead><tr><th class="num">#</th><th>Club</th><th class="num">P</th><th class="num">GD</th><th class="num">Pts</th></tr></thead><tbody>${show.map(r => {
    const pos = t.indexOf(r) + 1;
    const gap = pos === t.length - l.relegation + 1 && rows < t.length - l.relegation ? ' class="gap-above"' : '';
    return `<tr${gap}><td class="num"><span class="pos zone-${zoneOf(l, pos, l.tier)}">${pos}</span></td><td>${club(world, r.club)}</td><td class="num">${r.p}</td><td class="num">${r.gf - r.ga}</td><td class="num strong">${r.pts}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function seasonSummary(world: World): string {
  const k = world.history.leagues.length - 1;
  const ls = world.history.leagues[k], cs = world.history.cups[k];
  return `<section class="card span-2"><h2>${esc(seasonLabel(world.season.year))} season review</h2>
    <div class="summary-grid">${ls.map(lr => `<div class="summary-item"><div class="eyebrow">${esc(compLabel(world, lr.league))}</div>
      <div class="summary-champ">${club(world, lr.champion, { crest: 'md', bold: true })} <span class="muted">${lr.table[0].pts} pts</span></div>
      ${lr.promoted.length ? `<div class="mini-list"><span class="tag up">Up</span> ${lr.promoted.map(c => club(world, c, { crest: 'xs' })).join(' ')}</div>` : ''}
      ${lr.relegated.length ? `<div class="mini-list"><span class="tag down">Down</span> ${lr.relegated.map(c => club(world, c, { crest: 'xs' })).join(' ')}</div>` : ''}</div>`).join('')}
      ${cs.map(c => `<div class="summary-item"><div class="eyebrow">${esc(compLabel(world, c.cup))}</div><div class="summary-champ">${club(world, c.winner, { crest: 'md', bold: true })}</div><div class="muted small">Final: ${esc(world.info[c.final.home]?.short ?? '')} ${scoreText(c.final.hg, c.final.ag, c.final.et, c.final.pens)} ${esc(world.info[c.final.away]?.short ?? '')}</div></div>`).join('')}
    </div><p class="muted small">Advance once more to apply club development and start ${esc(seasonLabel(world.season.year + 1))}.</p></section>`;
}

export const overviewPage: Page = ({ world }) => {
  const s = world.season;
  const pl = leagues(world)[0];
  // Latest results and next fixtures in the top flight.
  const plMatches = s.matches.filter(m => m.comp === pl.id);
  const played = plMatches.filter(m => m.hg !== undefined);
  const lastSlot = played.length ? Math.max(...played.map(m => m.slot)) : -1;
  const upcoming = plMatches.filter(m => m.hg === undefined);
  const nextSlot = upcoming.length ? Math.min(...upcoming.map(m => m.slot)) : -1;
  const list = (ms: typeof plMatches) => ms.map(m => `<div class="fixture">${club(world, m.home)}<span class="score">${m.hg !== undefined ? scoreText(m.hg, m.ag!) : 'v'}</span>${club(world, m.away)}</div>`).join('');
  const news = world.news.slice(-8).reverse();
  const cups = country(world).cups.map(c => {
    const st = s.cups[c.id];
    const status = st.winner ? `Winners: ${club(world, st.winner)}` : st.roundIndex === 0 ? `Starts ${esc(s.calendar.find(x => x.week === c.rounds[0].slots[0].week && x.day === c.rounds[0].slots[0].day)?.label ?? '')}` : `${esc(c.rounds[st.roundIndex - 1].name)} · ${cupAlive(st).length || st.ties.filter(t => t.roundIndex === st.roundIndex - 1).length * 2} clubs`;
    return `<div class="cup-status"><a href="#/cups/${c.id}" class="eyebrow">${esc(c.name)}</a><div>${status}</div></div>`;
  }).join('');
  const html = `
  <div class="page-head"><h1>${esc(seasonLabel(s.year))}</h1><p class="muted">${esc(world.name)} · seed <code>${esc(world.seed)}</code> · ${world.history.leagues.length} completed season${world.history.leagues.length === 1 ? '' : 's'}</p></div>
  <div class="grid">
    ${s.complete ? seasonSummary(world) : ''}
    <section class="card"><div class="card-head"><h2>${esc(pl.name)}</h2><a href="#/standings/${pl.id}" class="link">Full table →</a></div>${miniTable(world, pl.id)}</section>
    <section class="card"><div class="card-head"><h2>Top-flight fixtures</h2><a href="#/fixtures/${pl.id}" class="link">All fixtures →</a></div>
      ${lastSlot >= 0 ? `<div class="eyebrow">Latest · Matchday ${currentRound(world, pl.id) - 1 || ''} · ${esc(s.calendar[lastSlot].label)}</div>${list(played.filter(m => m.slot === lastSlot))}` : ''}
      ${nextSlot >= 0 ? `<div class="eyebrow">Next · ${esc(s.calendar[nextSlot].label)}</div>${list(upcoming.filter(m => m.slot === nextSlot))}` : ''}
      ${lastSlot < 0 && nextSlot < 0 ? empty('No fixtures') : ''}</section>
    <section class="card"><h2>Divisions</h2>${leagues(world).slice(1).map(l => {
      const t = standings(world, l.id);
      return `<div class="division-row"><a href="#/standings/${l.id}" class="eyebrow">${esc(l.name)}</a><div class="division-leaders">${t.slice(0, 3).map((r, i) => `<span class="leader"><span class="pos zone-${zoneOf(l, i + 1, l.tier)}">${i + 1}</span>${club(world, r.club, { crest: 'xs' })}<span class="muted">${r.pts}</span></span>`).join('')}</div></div>`;
    }).join('')}</section>
    <section class="card"><h2>Cups</h2>${cups}</section>
    <section class="card"><div class="card-head"><h2>Latest news</h2><a href="#/news" class="link">All news →</a></div>
      ${news.length ? `<ul class="news-list">${news.map(n => `<li><span class="muted small">${esc(seasonLabel(n.season))}</span> ${esc(n.text)}</li>`).join('')}</ul>` : empty('News appears as the season unfolds.')}</section>
    <section class="card"><h2>Form guide</h2><table class="table compact"><tbody>${standings(world, pl.id).slice(0, 8).map(r => `<tr><td>${club(world, r.club)}</td><td class="right">${form(world, r.club).map(x => `<span class="form form-${x}">${x}</span>`).join('')}</td></tr>`).join('')}</tbody></table></section>
  </div>`;
  return { title: 'Overview', html };
};
