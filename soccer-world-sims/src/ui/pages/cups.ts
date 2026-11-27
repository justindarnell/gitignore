import type { Page } from '../types.ts';
import { club, esc, tabs, scoreText, empty } from '../dom.ts';
import { leagues, seasonLabel, country } from '../data.ts';
import type { Tie, World } from '../../engine/types.ts';

function tieRow(world: World, t: Tie): string {
  const ms = t.matches.map(id => world.season.matches.find(m => m.id === id)!);
  const played = ms.every(m => m.hg !== undefined);
  const winA = t.winner === t.a, winB = t.winner === t.b;
  const legs = ms.length === 2
    ? `<span class="muted small">${ms.map(m => m.hg !== undefined ? `${m.hg}–${m.ag}${m.et ? ' aet' : ''}${m.pens ? ` (${m.pens[0]}–${m.pens[1]} p)` : ''}` : 'tbp').join(', ')}${t.aggregate ? ` · agg ${t.aggregate[0]}–${t.aggregate[1]}` : ''}</span>`
    : '';
  const m = ms[0];
  const score = ms.length === 1 ? (m.hg !== undefined ? scoreText(m.hg, m.ag!, m.et, m.pens) : 'v') : (t.aggregate ? `${t.aggregate[0]}–${t.aggregate[1]}` : 'v');
  return `<div class="tie${played ? '' : ' upcoming'}"><span class="${winA ? 'winner' : winB ? 'loser' : ''}">${club(world, t.a)}</span><span class="score">${score}</span><span class="${winB ? 'winner' : winA ? 'loser' : ''}">${club(world, t.b)}</span>${legs}${m.neutral ? '<span class="tag" title="Neutral venue">N</span>' : ''}</div>`;
}

export const cupsPage: Page = ({ world, args }) => {
  const s = world.season;
  const cups = country(world).cups;
  const pos = leagues(world).filter(l => l.playoff);
  const id = args[0] ?? cups[0].id;
  const items = [...cups.map(c => ({ id: c.id, label: c.name, href: `#/cups/${c.id}` })), { id: 'playoffs', label: 'Play-offs', href: '#/cups/playoffs' }];
  let body = '';
  const cup = cups.find(c => c.id === id);
  if (cup) {
    const st = s.cups[cup.id];
    const rounds = cup.rounds.map((r, i) => {
      const ties = st.ties.filter(t => t.roundIndex === i);
      const slot = s.calendar.findIndex(x => x.week === r.slots[0].week && x.day === r.slots[0].day);
      const info = `${esc(s.calendar[slot]?.label ?? '')}${r.slots.length === 2 ? ' (two legs)' : ''}${r.neutral ? ' · neutral venue' : ''}${r.extraTime ? '' : ' · no extra time'}`;
      return `<details class="card round"${ties.length && (i === st.roundIndex - 1 || ties.some(t => !t.winner)) ? ' open' : ''}><summary><span class="strong">${esc(r.name)}</span> <span class="muted small">${info} · ${ties.length ? `${ties.length} tie${ties.length > 1 ? 's' : ''}` : 'not yet drawn'}</span></summary>${ties.length ? `<div class="ties">${ties.map(t => tieRow(world, t)).join('')}</div>` : ''}</details>`;
    }).reverse().join('');
    const past = world.history.cups.map((cs, k) => ({ year: world.history.snapshots[k].year, rec: cs.find(c => c.cup === cup.id) })).filter(x => x.rec).reverse().slice(0, 10);
    body = `<div class="grid-2"><div>${st.winner ? `<section class="card highlight"><div class="eyebrow">${esc(seasonLabel(s.year))} winners</div><div class="big-club">${club(world, st.winner, { crest: 'md', bold: true })}</div></section>` : ''}${rounds}</div>
      <aside><section class="card"><div class="card-head"><h2>Recent winners</h2><a class="link" href="#/history/honours/${cup.id}">Roll of honour →</a></div>${past.length ? `<table class="table compact"><tbody>${past.map(p => `<tr><td class="muted">${esc(seasonLabel(p.year))}</td><td>${club(world, p.rec!.winner)}</td><td class="muted small">${scoreText(p.rec!.final.hg, p.rec!.final.ag, p.rec!.final.et, p.rec!.final.pens)} v ${esc(world.info[p.rec!.runnerUp]?.short ?? '')}</td></tr>`).join('')}</tbody></table>` : empty('No completed editions yet.')}</section>
      <section class="card"><h2>Format</h2><p class="muted small">${cup.id === 'FAC' ? 'Fourth qualifying round: 24 National League clubs plus 40 non-playable qualifiers (marked Q). League One and Two enter in the First Round; Premier League and Championship clubs in the Third Round. Random draws, no replays: extra time and penalties. Semi-finals and final at a neutral venue.' : 'Regional First and Second Rounds. The two best-placed clubs relegated from the Premier League get byes to Round Two; the previous season\'s top seven Premier League clubs (a stand-in for European entrants, as European competitions are not simulated) enter in Round Three. No extra time before the final; two-legged semi-finals.'}</p></section></aside></div>`;
  } else {
    body = pos.map(l => {
      const st = s.playoffs[l.playoff!.id];
      const rounds = l.playoff!.rounds.map((r, i) => {
        const ties = st.ties.filter(t => t.roundIndex === i);
        return `<div class="po-round"><div class="eyebrow">${esc(r.name)}${r.legs === 2 ? ' · two legs' : ''}</div>${ties.length ? ties.map(t => tieRow(world, t)).join('') : `<div class="muted small">Seeds ${r.newSeeds.length ? r.newSeeds.join(', ') : '—'} · ${s.calendar.find(x => x.week === r.slots[0].week && x.day === r.slots[0].day)?.label ?? ''}</div>`}</div>`;
      }).join('');
      return `<section class="card"><div class="card-head"><h2>${esc(l.playoff!.name)}</h2>${st.ties.length && st.ties.at(-1)!.winner && st.ties.at(-1)!.roundIndex === l.playoff!.rounds.length - 1 ? `<span>Promoted: ${club(world, st.ties.at(-1)!.winner!)}</span>` : ''}</div><div class="po-bracket">${rounds}</div></section>`;
    }).join('');
  }
  return { title: 'Cups', html: `<div class="page-head"><h1>Cups & play-offs</h1><p class="muted">${esc(seasonLabel(s.year))}</p></div>${tabs(items, id)}${body}` };
};
