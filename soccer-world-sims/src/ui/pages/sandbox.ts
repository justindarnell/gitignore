// Sandbox UI: what-if editing on club profiles, and side-by-side comparison of two timelines.
import type { Page } from '../types.ts';
import { club, esc, empty } from '../dom.ts';
import { leagues, seasonLabel, compLabel, pyramidSize, nextSlotLabel } from '../data.ts';
import { mountChart, CATEGORICAL } from '../components/chart.ts';
import { EVENT_EFFECTS } from '../../engine/sandbox.ts';
import type { World } from '../../engine/types.ts';
import type { SaveMeta } from '../../persistence/save.ts';

/** What-if card for a club profile. */
export function whatIfCard(world: World, id: string, busy: boolean): string {
  const c = world.clubs.find(x => x.id === id)!;
  const mine = world.interventions.filter(i => i.club === id);
  const field = (k: string, label: string, v: number, min: number, max: number, step = 0.1) =>
    `<label class="whatif-field"><span>${label}</span><input type="number" data-whatif="${k}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;
  return `<section class="card whatif"><details${mine.length ? ' open' : ''}><summary><h2>What-if</h2><span class="muted small">Edit this club or inject an event. Every change is recorded in history as a user intervention.</span></summary>
    <div class="whatif-grid">
      ${field('attack', 'Attack', Math.round(c.attack * 10) / 10, 5, 99)}${field('midfield', 'Midfield', Math.round(c.midfield * 10) / 10, 5, 99)}${field('defence', 'Defence', Math.round(c.defence * 10) / 10, 5, 99)}
      ${field('reputation', 'Reputation', Math.round(c.reputation * 10) / 10, 1, 99)}${field('stability', 'Stability', Math.round(c.stability * 10) / 10, 5, 95)}${field('ambition', 'Ownership (−100…100)', Math.round(c.ambition * 100), -100, 100, 1)}
    </div>
    <div class="toolbar"><button class="btn primary" data-action="whatif-edit" data-club="${esc(id)}"${busy ? ' disabled' : ''}>Apply edits</button>
      ${Object.entries(EVENT_EFFECTS).map(([k, e]) => `<button class="btn" data-action="whatif-event" data-kind="${k}" data-club="${esc(id)}"${busy ? ' disabled' : ''} title="${esc(effectText(e))}">${esc(e.label)}</button>`).join('')}</div>
    <p class="muted small">Changes take effect from the next match. Ownership ambition only shapes development when <a href="#/settings">ownership dynamics</a> are switched on; the immediate effects of events always apply.</p>
    ${mine.length ? `<h3>Interventions at this club</h3><ul class="timeline">${mine.slice().reverse().map(i => `<li class="intervention"><span class="muted">${esc(seasonLabel(i.season))} · ${esc(i.date)}</span> ${esc(i.text)}</li>`).join('')}</ul>` : ''}
  </details></section>`;
}

function effectText(e: typeof EVENT_EFFECTS[keyof typeof EVENT_EFFECTS]): string {
  const p: string[] = [];
  if (e.quality) p.push(`squad ${e.quality > 0 ? '+' : ''}${e.quality}`);
  if (e.era) p.push(`development ${e.era > 0 ? '+' : ''}${e.era}`);
  if (e.stability) p.push(`stability ${e.stability > 0 ? '+' : ''}${e.stability}`);
  if (e.reputation) p.push(`reputation ${e.reputation}`);
  if (e.ambition !== undefined) p.push(`ownership ${e.ambition > 0 ? '+' : ''}${Math.round(e.ambition * 100)}`);
  return p.join(', ');
}

// ---------------------------------------------------------------- compare
export interface CompareState { id: string | null; world: World | null; loading: boolean; error: string | null; club: string; year: number | null }

export const comparePage = (saves: SaveMeta[] | null, cmp: CompareState): Page => ({ world: A }) => {
  const options = (saves ?? []).map(m => `<option value="${esc(m.id)}"${m.id === cmp.id ? ' selected' : ''}>${esc(m.name)} · ${esc(seasonLabel(m.season))}${m.id === 'autosave' ? ' (autosave)' : ''}</option>`).join('');
  const head = `<div class="page-head"><h1>Compare timelines</h1><p class="muted">The current world (A) side by side with a saved world (B). Fork a world on the Saves page to explore a different path from the same point.</p></div>
    <div class="toolbar"><label>Timeline B <select data-change="compare-pick"><option value="">Choose a save…</option>${options}</select></label>
    <button class="btn" data-action="fork-compare" title="Save a fork of the current world and compare with it">Fork current world &amp; compare</button></div>`;
  if (cmp.loading) return { title: 'Compare', html: head + empty('Loading timeline B…') };
  if (cmp.error) return { title: 'Compare', html: head + `<div class="notice">${esc(cmp.error)}</div>` };
  const B = cmp.world;
  if (!B) return { title: 'Compare', html: head + empty(saves && !saves.length ? 'No saved worlds yet. Fork or save the current world first.' : 'Choose a saved world to compare with.') };
  if (A.country !== B.country) return { title: 'Compare', html: head + `<div class="notice">These worlds use different start seasons (${esc(A.start)} vs ${esc(B.start)}), so they cannot be compared season by season.</div>` };

  const HA = A.history, HB = B.history;
  const yearsA = HA.snapshots.map(s => s.year), yearsB = HB.snapshots.map(s => s.year);
  const both = yearsA.filter(y => yearsB.includes(y));
  const div = both.find(y => JSON.stringify(HA.leagues[yearsA.indexOf(y)].map(l => l.table)) !== JSON.stringify(HB.leagues[yearsB.indexOf(y)].map(l => l.table)));
  const related = A.seed === B.seed;
  const relation = B.lineage?.parentId === A.lineage?.id ? `B was forked from A at ${esc(B.lineage.forkedAt?.date ?? '')}`
    : A.lineage?.parentId === B.lineage?.id ? `A was forked from B at ${esc(A.lineage.forkedAt?.date ?? '')}`
    : A.lineage?.parentId && A.lineage.parentId === B.lineage?.parentId ? 'A and B are forks of the same timeline' : related ? 'same seed' : 'different seeds (unrelated timelines)';
  const setDiff = (Object.keys(A.settings) as (keyof World['settings'])[]).filter(k => A.settings[k] !== B.settings[k]).map(k => `${k}: ${fmtSetting(A.settings[k])} vs ${fmtSetting(B.settings[k])}`);
  const behind = B.season.year < A.season.year || (B.season.year === A.season.year && B.season.slotIndex < A.season.slotIndex && !B.season.complete);
  const cupIds = (A.history.cups[0] ?? []).map(c => c.cup);

  const champRows = both.map(y => {
    const ka = yearsA.indexOf(y), kb = yearsB.indexOf(y);
    const cells = (H: World['history'], k: number, w: World) => [H.leagues[k][0].champion, ...cupIds.map(cid => H.cups[k].find(c => c.cup === cid)?.winner ?? '')].map(id => id ? club(w, id, { crest: 'xs' }) : '—');
    const ca = cells(HA, ka, A), cb = cells(HB, kb, B);
    const same = HA.leagues[ka][0].champion === HB.leagues[kb][0].champion;
    return `<tr class="${same ? '' : 'diff'}"><td class="muted nowrap">${esc(seasonLabel(y))}</td><td>${ca[0]}</td><td>${cb[0]}</td>${cupIds.map((_, i) => `<td class="hide-sm">${ca[i + 1]}</td><td class="hide-sm">${cb[i + 1]}</td>`).join('')}</tr>`;
  }).reverse().join('');

  const year = cmp.year !== null && both.includes(cmp.year) ? cmp.year : both[both.length - 1];
  const tableCols = (w: World, H: World['history'], k: number) => {
    const t = H.leagues[k][0].table;
    return `<table class="table compact"><thead><tr><th class="num">#</th><th>Club</th><th class="num">Pts</th></tr></thead><tbody>${t.map((r, i) => `<tr><td class="num">${i + 1}</td><td>${club(w, r.club, { crest: 'xs' })}</td><td class="num strong">${r.pts}</td></tr>`).join('')}</tbody></table>`;
  };
  const ids = A.clubs.map(c => c.id).filter(id => B.info[id]).sort((x, y) => A.info[x].name.localeCompare(A.info[y].name));
  const clubId = ids.includes(cmp.club) ? cmp.club : ids[0];
  const ivs = (w: World) => w.interventions.length ? `<ul class="plain small">${w.interventions.slice(-8).reverse().map(i => `<li>${esc(seasonLabel(i.season))}: ${club(w, i.club, { crest: 'xs' })} — ${esc(i.text)}</li>`).join('')}</ul>` : '<p class="muted small">No interventions.</p>';

  const html = `${head}
  <div class="grid">
    <section class="card span-all"><h2>Timelines</h2>
      <div class="compare-heads"><div><div class="eyebrow">A · current</div><strong>${esc(A.name)}</strong><div class="muted small">seed ${esc(A.seed)} · ${esc(nextSlotLabel(A))} · ${HA.leagues.length} seasons</div>${ivs(A)}</div>
      <div><div class="eyebrow">B · saved</div><strong>${esc(B.name)}</strong><div class="muted small">seed ${esc(B.seed)} · ${esc(nextSlotLabel(B))} · ${HB.leagues.length} seasons</div>${ivs(B)}</div></div>
      <p class="small">Relation: <strong>${relation}</strong>. ${div !== undefined ? `Final tables first differ in <strong>${esc(seasonLabel(div))}</strong>.` : both.length ? 'Final tables are identical in every season both have completed.' : ''}
      ${setDiff.length ? `Settings differ: ${esc(setDiff.join('; '))}.` : 'Same settings.'}</p>
      ${behind ? `<div class="toolbar"><button class="btn primary" data-action="compare-catchup">Simulate B to ${esc(nextSlotLabel(A))}</button><span class="muted small">Runs timeline B in the background and saves it back to its slot.</span></div>` : ''}</section>
    <section class="card span-all"><h2>Champions</h2>${both.length ? `<div class="table-wrap"><table class="table compact compare-champs"><thead><tr><th>Season</th><th>${esc(leagues(A)[0].short)} · A</th><th>${esc(leagues(A)[0].short)} · B</th>${cupIds.map(c => `<th class="hide-sm">${esc(compLabel(A, c))} · A</th><th class="hide-sm">${esc(compLabel(A, c))} · B</th>`).join('')}</tr></thead><tbody>${champRows}</tbody></table></div><p class="muted small">Highlighted rows: different champions.</p>` : empty('No season completed in both timelines yet.')}</section>
    ${year !== undefined ? `<section class="card span-all"><div class="card-head"><h2>Final ${esc(leagues(A)[0].name)} tables</h2><label>Season <select data-change="compare-year">${[...both].reverse().map(y => `<option value="${y}"${y === year ? ' selected' : ''}>${esc(seasonLabel(y))}</option>`).join('')}</select></label></div>
      <div class="compare-tables"><div><div class="eyebrow">A</div>${tableCols(A, HA, yearsA.indexOf(year))}</div><div><div class="eyebrow">B</div>${tableCols(B, HB, yearsB.indexOf(year))}</div></div></section>` : ''}
    <section class="card span-all"><div class="card-head"><h2>Club in both timelines</h2><select data-change="compare-club" aria-label="Club">${ids.map(id => `<option value="${id}"${id === clubId ? ' selected' : ''}>${esc(A.info[id].name)}</option>`).join('')}</select></div>
      <div class="chart-legend"><span><i style="background:${CATEGORICAL[0]}"></i>A: ${esc(A.name)}</span><span><i style="background:${CATEGORICAL[1]}"></i>B: ${esc(B.name)}</span></div>
      <div id="chart-compare"></div><p class="muted small">Combined pyramid position by season (1 = top).</p></section>
  </div>`;

  const mount = (root: HTMLElement) => {
    const el = root.querySelector<HTMLElement>('#chart-compare');
    if (!el) return;
    const years = [...new Set([...yearsA, ...yearsB])].sort((a, b) => a - b);
    const ia = A.clubs.findIndex(c => c.id === clubId), ib = B.clubs.findIndex(c => c.id === clubId);
    const val = (H: World['history'], i: number, y: number) => { const s = H.snapshots.find(x => x.year === y); return s && i >= 0 ? s.pyramid[i] : null; };
    const va = years.map(y => val(HA, ia, y)), vb = years.map(y => val(HB, ib, y));
    const every = Math.max(1, Math.ceil(years.length / 8));
    return mountChart(el, {
      ariaLabel: `${A.info[clubId].name} pyramid position in timelines A and B`,
      series: [{ label: 'A', color: CATEGORICAL[0], values: va }, { label: 'B', color: CATEGORICAL[1], values: vb, width: 2 }],
      yMin: 1, yMax: pyramidSize(A), invert: true, yTicks: [1, 20, 44, 68, pyramidSize(A)].filter(t => t <= pyramidSize(A)), height: 240,
      xTicks: years.map((y, i) => ({ index: i, label: seasonLabel(y) })).filter((_, i) => i % every === 0),
      title: i => seasonLabel(years[i]),
      rows: i => [{ label: 'A', value: va[i] === null ? '—' : `#${va[i]}`, color: CATEGORICAL[0] }, { label: 'B', value: vb[i] === null ? '—' : `#${vb[i]}`, color: CATEGORICAL[1] }],
    });
  };
  return { title: 'Compare timelines', html, mount };
};

function fmtSetting(v: unknown): string { return typeof v === 'number' ? `${Math.round(v * 100)}%` : String(v); }
