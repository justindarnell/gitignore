// Multi-fork experiments page: outcome probabilities from many alternative futures of the current world.
import type { Page } from '../types.ts';
import { club, esc, empty } from '../dom.ts';
import { leagues, seasonLabel, compLabel, pyramidSize, nextSlotLabel } from '../data.ts';
import { mountChart, CATEGORICAL } from '../components/chart.ts';
import { clubFan, MAX_RUNS, MAX_SEASONS, type ExperimentSummary, type RunOutcome } from '../../engine/experiments.ts';
import type { World } from '../../engine/types.ts';

export interface ExperimentResult { summary: ExperimentSummary; outcomes: RunOutcome[]; at: string; elapsed: number }
export interface ExperimentState {
  runs: number; seasons: number; club: string;
  running: { done: number; total: number } | null;
  result: ExperimentResult | null;
  /** The previous result from the same starting point (same random streams), for before/after comparison. */
  previous: ExperimentResult | null;
}

const P = (x: number) => x <= 0 ? '—' : x < 0.005 ? '<1%' : `${Math.round(x * 100)}%`;
const D = (x: number) => { const v = Math.round(x * 100); return v === 0 ? '<span class="muted">±0</span>' : `<span class="${v > 0 ? 'up' : 'down'}">${v > 0 ? '+' : ''}${v}</span>`; };

export const experimentsPage = (exp: ExperimentState): Page => ({ world }) => {
  const head = `<div class="page-head"><h1>Experiments</h1><p class="muted">Run many alternative futures from this exact point, each with its own luck, and see how often each outcome happens.
    The current world is not changed. Run again after a <a href="#/clubs">what-if</a> change to see its effect: the runs reuse the same random streams, so the difference comes from your change, not from different luck.</p></div>`;
  const busy = !!exp.running;
  const form = `<section class="card"><div class="exp-form">
      <label>Runs <input type="number" data-change="exp-runs" min="2" max="${MAX_RUNS}" value="${exp.runs}"></label>
      <label>Seasons <input type="number" data-change="exp-seasons" min="1" max="${MAX_SEASONS}" value="${exp.seasons}"></label>
      <button class="btn primary" data-action="exp-run"${busy ? ' disabled' : ''}>Run experiment</button>
      ${busy ? `<button class="btn danger" data-action="exp-cancel">Cancel</button>` : ''}
    </div>
    ${busy ? `<div class="progress-bar exp-progress"><span id="exp-fill" style="width:${(100 * exp.running!.done / exp.running!.total).toFixed(1)}%"></span></div><div id="exp-text" class="muted small">${exp.running!.done} of ${exp.running!.total} runs</div>` : ''}
    <p class="muted small">Starts from ${esc(nextSlotLabel(world))}${world.season.complete ? '' : ` (the rest of ${esc(seasonLabel(world.season.year))} counts as the first season)`}. Runs simulate in background workers at the Essential storage level. Results stay until you reload the page; they are not saved with the world.</p></section>`;
  const r = exp.result;
  if (!r) return { title: 'Experiments', html: head + form + (busy ? '' : empty('No experiment yet. Choose the number of runs and seasons, then run it.')) };

  const S = r.summary;
  if (S.clubs.some(c => !world.info[c.id]) || S.clubs.length !== world.clubs.length) {
    return { title: 'Experiments', html: head + form + `<div class="notice">The last experiment was run on a different world. Run it again for this one.</div>` };
  }
  const stale = r.at !== positionKey(world);
  const prev = exp.previous && exp.previous.summary.key === S.key ? exp.previous.summary : null;
  const pmap = new Map(prev?.clubs.map(c => [c.id, c]) ?? []);
  const L = leagues(world);
  const top = L[0];
  const cups = S.cups;
  const byTitle = [...S.clubs].filter(c => c.title > 0 || c.top4 > 0.05).sort((a, b) => b.title - a.title || b.top4 - a.top4).slice(0, 14);
  const range = `${seasonLabel(S.years[0])}–${seasonLabel(S.years[S.years.length - 1])}`;
  const note = `<p class="muted small">${S.runs} runs × ${S.seasons} season${S.seasons === 1 ? '' : 's'} (${esc(range)}) in ${(r.elapsed / 1000).toFixed(1)} s.
    ${prev ? `Δ columns compare with the previous experiment from the same point (${prev.interventions} intervention${prev.interventions === 1 ? '' : 's'} then, ${S.interventions} now), in percentage points.` : ''}</p>`;

  const titleRows = byTitle.map(c => `<tr><td>${club(world, c.id, { crest: 'xs' })}</td><td class="num strong">${P(c.title)}</td>${prev ? `<td class="num">${D(c.title - (pmap.get(c.id)?.title ?? 0))}</td>` : ''}
    <td class="num">${(Math.round(c.titlesMean * 10) / 10).toFixed(1)}</td><td class="num">${P(c.top4)}</td>${cups.map(k => `<td class="num hide-sm">${P(c.cup[k])}</td>`).join('')}<td class="num">${c.endP50}</td></tr>`).join('');

  const topIds = new Set(world.clubs.filter(c => c.league === top.id).map(c => c.id));
  const relRows = S.clubs.filter(c => topIds.has(c.id)).sort((a, b) => b.relegated - a.relegated).slice(0, 10)
    .map(c => `<tr><td>${club(world, c.id, { crest: 'xs' })}</td><td class="num strong">${P(c.relegated)}</td>${prev ? `<td class="num">${D(c.relegated - (pmap.get(c.id)?.relegated ?? 0))}</td>` : ''}<td class="num">${P(c.endLeague[0])}</td></tr>`).join('');
  const riseRows = S.clubs.filter(c => !topIds.has(c.id)).sort((a, b) => b.endLeague[0] - a.endLeague[0] || b.promoted - a.promoted).slice(0, 10)
    .map(c => `<tr><td>${club(world, c.id, { crest: 'xs' })}</td><td class="muted small">${esc(L.find(l => l.id === world.clubs.find(x => x.id === c.id)?.league)?.short ?? '')}</td><td class="num strong">${P(c.endLeague[0])}</td>${prev ? `<td class="num">${D(c.endLeague[0] - (pmap.get(c.id)?.endLeague[0] ?? 0))}</td>` : ''}<td class="num">${P(c.promoted)}</td></tr>`).join('');

  const champRows = S.champions.map(s => `<tr><td class="muted nowrap">${esc(seasonLabel(s.year))}</td><td>${s.top.slice(0, 3).map(t => `${club(world, t.id, { crest: 'xs' })} <span class="muted small">${P(t.p)}</span>`).join(' · ')}</td></tr>`).join('');

  const ids = world.clubs.map(c => c.id).sort((a, b) => world.info[a].name.localeCompare(world.info[b].name));
  const focus = ids.includes(exp.club) ? exp.club : byTitle[0]?.id ?? ids[0];
  const fc = S.clubs.find(c => c.id === focus)!;
  const fp = pmap.get(focus);
  const endDist = L.map((l, i) => fc.endLeague[i] > 0 ? `${esc(l.short)} ${P(fc.endLeague[i])}` : '').filter(Boolean).join(' · ');
  const stat = (label: string, v: number, pv?: number) => `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${P(v)}</div>${pv !== undefined ? `<div class="small">${D(v - pv)}</div>` : ''}</div>`;

  const html = `${head}${form}
  ${stale ? `<div class="notice">These results were computed from an earlier point (${esc(r.at.split('|')[1] ?? '')}). The world has changed since; run the experiment again for current odds.</div>` : ''}
  <div class="grid">
    <section class="card span-all"><h2>${esc(top.name)} title odds</h2>${note}
      <div class="table-wrap"><table class="table compact"><thead><tr><th>Club</th><th class="num" title="Share of runs with at least one title">Title</th>${prev ? '<th class="num">Δ</th>' : ''}<th class="num" title="Mean number of titles per run">Titles</th><th class="num" title="Share of runs with at least one top-four finish">Top 4</th>${cups.map(k => `<th class="num hide-sm">${esc(compLabel(world, k))}</th>`).join('')}<th class="num" title="Median combined pyramid position at the end">End #</th></tr></thead><tbody>${titleRows}</tbody></table></div></section>
    <section class="card"><h2>Relegation risk</h2><p class="muted small">Current ${esc(top.short)} clubs: share of runs with at least one relegation, and share still in the ${esc(top.short)} after the horizon.</p>
      <div class="table-wrap"><table class="table compact"><thead><tr><th>Club</th><th class="num">Relegated</th>${prev ? '<th class="num">Δ</th>' : ''}<th class="num">In ${esc(top.short)}</th></tr></thead><tbody>${relRows}</tbody></table></div></section>
    <section class="card"><h2>Likeliest risers</h2><p class="muted small">Clubs outside the ${esc(top.short)} now: share of runs that end with them in it, and share with at least one promotion.</p>
      <div class="table-wrap"><table class="table compact"><thead><tr><th>Club</th><th>Now</th><th class="num">In ${esc(top.short)}</th>${prev ? '<th class="num">Δ</th>' : ''}<th class="num">Promoted</th></tr></thead><tbody>${riseRows}</tbody></table></div></section>
    <section class="card span-all"><div class="card-head"><h2>Club outlook</h2><select data-change="exp-club" aria-label="Club">${ids.map(id => `<option value="${id}"${id === focus ? ' selected' : ''}>${esc(world.info[id].name)}</option>`).join('')}</select></div>
      <div class="stats">${stat('Title', fc.title, fp?.title)}${stat('Top 4', fc.top4, fp?.top4)}${stat('Promoted', fc.promoted, fp?.promoted)}${stat('Relegated', fc.relegated, fp?.relegated)}</div>
      <p class="small">After the horizon: ${endDist || '—'}. Median end position #${fc.endP50} (80% of runs between #${fc.endP10} and #${fc.endP90}).</p>
      <div class="chart-legend"><span><i style="background:${CATEGORICAL[0]}"></i>Median</span><span><i style="background:${CATEGORICAL[3]}"></i>Middle 50% of runs</span><span><i style="background:${CATEGORICAL[9]}"></i>Middle 80% of runs</span></div>
      <div id="chart-exp"></div><p class="muted small">Combined pyramid position at the end of each season across runs (1 = top).</p></section>
    <section class="card span-all"><h2>Likeliest champions by season</h2><div class="table-wrap"><table class="table compact"><thead><tr><th>Season</th><th>Champion (share of runs)</th></tr></thead><tbody>${champRows}</tbody></table></div></section>
  </div>`;

  const mount = (root: HTMLElement) => {
    const el = root.querySelector<HTMLElement>('#chart-exp');
    if (!el) return;
    const fan = clubFan(world, r.outcomes, focus);
    const v = (k: 'p10' | 'p25' | 'p50' | 'p75' | 'p90') => fan.map(f => f[k]);
    const every = Math.max(1, Math.ceil(fan.length / 8));
    const N = pyramidSize(world);
    return mountChart(el, {
      ariaLabel: `${world.info[focus].name}: pyramid position percentiles across experiment runs`,
      series: [
        { label: '10th pct', color: CATEGORICAL[9], values: v('p10'), width: 1 }, { label: '90th pct', color: CATEGORICAL[9], values: v('p90'), width: 1 },
        { label: '25th pct', color: CATEGORICAL[3], values: v('p25'), width: 1.5 }, { label: '75th pct', color: CATEGORICAL[3], values: v('p75'), width: 1.5 },
        { label: 'Median', color: CATEGORICAL[0], values: v('p50'), width: 2.5 },
      ],
      yMin: 1, yMax: N, invert: true, yTicks: [1, ...L.slice(0, -1).map((_, i) => L.slice(0, i + 1).reduce((a, l) => a + l.size, 0))].filter(t => t <= N), height: 240,
      xTicks: fan.map((f, i) => ({ index: i, label: seasonLabel(f.year) })).filter((_, i) => i % every === 0),
      title: i => seasonLabel(fan[i].year),
      rows: i => [{ label: 'Median', value: `#${fan[i].p50}`, color: CATEGORICAL[0] }, { label: 'Middle 50%', value: `#${fan[i].p25}–#${fan[i].p75}`, color: CATEGORICAL[3] }, { label: 'Middle 80%', value: `#${fan[i].p10}–#${fan[i].p90}`, color: CATEGORICAL[9] }],
    });
  };
  return { title: 'Experiments', html, mount };
};

/** Identifies the world state an experiment started from (lineage, calendar position, interventions). */
export function positionKey(w: World): string {
  return `${w.lineage?.id ?? ''}.${w.season.year}.${w.season.slotIndex}.${w.season.complete ? 1 : 0}.${w.interventions.length}|${nextSlotLabel(w)}`;
}
