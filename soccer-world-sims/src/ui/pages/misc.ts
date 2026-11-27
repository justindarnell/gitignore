import type { Page } from '../types.ts';
import { esc, tabs, empty, f0 } from '../dom.ts';
import { seasonLabel } from '../data.ts';
import { PRESETS, DEFAULT_SETTINGS } from '../../engine/params.ts';
import type { Settings } from '../../engine/types.ts';
import type { SaveMeta } from '../../persistence/save.ts';
import { STARTS } from '../../data/england/starts.ts';

// ---------------------------------------------------------------- news
export const newsPage: Page = ({ world, args, state }) => {
  const kind = args[0] ?? state.newsKind;
  state.newsKind = kind;
  const kinds = [['all', 'All'], ['title', 'Titles'], ['cup', 'Cups'], ['promotion', 'Promotions'], ['relegation', 'Relegations'], ['event', 'Club events'], ['owner', 'Ownership'], ['story', 'Stories'], ['derby', 'Derbies'], ['intervention', 'Interventions'], ['admin', 'Administrations'], ['rules', 'Rule changes'], ['milestone', 'Milestones']];
  const items = world.news.filter(n => kind === 'all' || n.kind === kind).slice(-400).reverse();
  const bySeason = new Map<number, typeof items>();
  for (const n of items) { if (!bySeason.has(n.season)) bySeason.set(n.season, []); bySeason.get(n.season)!.push(n); }
  const linkify = (text: string, clubs: string[]) => {
    let out = esc(text);
    for (const id of clubs) { const s = world.info[id]?.short; if (s) out = out.replace(esc(s), `<a href="#/club/${id}">${esc(s)}</a>`); }
    return out;
  };
  return {
    title: 'News',
    html: `<div class="page-head"><h1>World news</h1><p class="muted">Titles, cups, movements and club events across the pyramid.</p></div>${tabs(kinds.map(([id, l]) => ({ id, label: l, href: `#/news/${id}` })), kind)}
    ${bySeason.size ? [...bySeason.entries()].map(([y, ns]) => `<section class="card"><h2>${esc(seasonLabel(y))}</h2><ul class="news-list">${ns.map(n => `<li class="imp-${n.importance}"><span class="kind kind-${esc(n.kind)}">${esc(n.kind)}</span> ${linkify(n.text, n.clubs)}</li>`).join('')}</ul></section>`).join('') : empty('No news yet. Simulate to the end of a season.')}`,
  };
};

// ---------------------------------------------------------------- settings
const SETTINGS: { key: keyof Settings; label: string; help: string; max?: number }[] = [
  { key: 'realism', label: 'Realism (strength matters)', help: 'How strongly squad quality decides matches. Lower = more levelling.' },
  { key: 'upsets', label: 'Upset frequency', help: 'Match-to-match randomness on top of the Poisson goal model.' },
  { key: 'homeAdvantage', label: 'Home advantage', help: 'Scale of the home-team goal boost.' },
  { key: 'seasonalVariability', label: 'Seasonal variability', help: 'How much clubs over- or under-perform their squad in a season.' },
  { key: 'growth', label: 'Club growth & decline', help: 'Size of long-term development cycles and squad change.' },
  { key: 'events', label: 'Random event frequency', help: '0% disables random club events entirely.', max: 3 },
  { key: 'relegationImpact', label: 'Relegation impact', help: 'Squad loss on relegation (softened by stability).' },
  { key: 'reputationProtection', label: 'Reputation protection', help: 'How strongly institutional standing pulls clubs back to their level.' },
  { key: 'championshipFatigue', label: 'Championship fatigue', help: 'Difficulty of sustaining title-winning performance.' },
  { key: 'ownership', label: 'Ownership dynamics', help: 'Takeovers, sell-offs and how far owners push a club above or below its standing. Established giants are shielded. 0% = owners never matter; 100% = calibrated.' },
  { key: 'administration', label: 'Financial crises (administration)', help: 'Clubs entering administration: points deductions (rules of the season), a fire sale and new owners. Likelier under asset-strippers, with low stability and after relegation. 100% = the historical frequency (about one club per season); 0% (default) = off, because calibration did not adopt it.', max: 3 },
];

export const settingsPage: Page = ({ world }) => {
  const s = world.settings;
  const isDefault = SETTINGS.every(x => s[x.key] === DEFAULT_SETTINGS[x.key]);
  return {
    title: 'Settings',
    html: `<div class="page-head"><h1>Simulation settings</h1><p class="muted">100% everywhere is the calibrated, historically realistic model. Changes apply from the next match onward; recorded history is never rewritten.</p></div>
    <section class="card"><h2>Presets</h2><div class="preset-row">${Object.entries(PRESETS).map(([k, p]) => `<button class="btn" data-action="preset" data-preset="${k}" title="${esc(p.description)}">${esc(p.label)}</button>`).join('')}
      <button class="btn ghost" data-action="restore-defaults"${isDefault ? ' disabled' : ''}>Restore calibrated defaults</button></div></section>
    <section class="card"><h2>Model</h2><div class="settings-grid">${SETTINGS.map(x => {
      const v = s[x.key] as number;
      return `<label class="setting"><span class="setting-label">${esc(x.label)} <strong>${f0(v * 100)}%</strong></span>
        <input type="range" min="0" max="${(x.max ?? 2) * 100}" step="5" value="${Math.round(v * 100)}" data-change="setting" data-key="${x.key}" aria-label="${esc(x.label)}">
        <span class="muted small">${esc(x.help)}</span></label>`;
    }).join('')}</div></section>
    <section class="card"><h2>Historical storage</h2>
      <select data-change="storage">${(['essential', 'standard', 'full'] as const).map(k => `<option value="${k}"${s.storage === k ? ' selected' : ''}>${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select>
      <ul class="plain small muted"><li><strong>Essential</strong>: final tables, winners, club development and timelines.</li><li><strong>Standard</strong> (default): + matchday position graphs, cup results, best/worst matches, records.</li><li><strong>Full</strong>: + every league result of every season (larger saves).</li></ul></section>
    ${world.settingsLog.length ? `<section class="card"><h2>Settings history</h2><ul class="plain small">${world.settingsLog.slice(-10).reverse().map(l => `<li>${esc(seasonLabel(l.season))}, slot ${l.slot}: ${SETTINGS.filter(x => l.settings[x.key] !== DEFAULT_SETTINGS[x.key]).map(x => `${esc(x.label)} ${f0((l.settings[x.key] as number) * 100)}%`).join(', ') || 'calibrated defaults'} · storage ${esc(l.settings.storage)}</li>`).join('')}</ul></section>` : ''}`,
  };
};

// ---------------------------------------------------------------- saves
export const savesPage = (saves: SaveMeta[] | null, storageError: string | null, autosave: boolean, newStart = '2026'): Page => ({ world }) => ({
  title: 'Saves',
  html: `<div class="page-head"><h1>Saves</h1><p class="muted">Worlds are stored in this browser (IndexedDB). Export files to back up or move between browsers.</p></div>
  ${storageError ? `<div class="notice">${esc(storageError)}</div>` : ''}
  <section class="card"><h2>Current world</h2>
    <div class="toolbar"><input type="text" value="${esc(world.name)}" data-input="world-name" aria-label="World name"><button class="btn primary" data-action="save-new">Save as new slot</button><button class="btn" data-action="export">Export file</button>
      <label class="btn">Import file<input type="file" accept=".json,.gz,application/json" data-change="import" hidden></label>
      <label class="check"><input type="checkbox" data-change="autosave"${autosave ? ' checked' : ''}> Autosave after each simulation</label></div>
    <p class="muted small">${esc(seasonLabel(world.season.year))} · ${world.history.leagues.length} seasons completed · seed <code>${esc(world.seed)}</code> · storage ${esc(world.settings.storage)} · started ${esc(seasonLabel(STARTS[world.start]?.year ?? 2026))}${world.lineage?.parentName ? ` · forked from "${esc(world.lineage.parentName)}" at ${esc(world.lineage.forkedAt?.date ?? '')}` : ''}</p>
    <div class="toolbar"><button class="btn" data-action="fork">Fork this world</button><button class="btn" data-action="fork-switch">Fork and switch to the fork</button><a class="btn" href="#/compare">Compare timelines</a></div>
    <p class="muted small">A fork is an independent copy with the same seed and history up to now: change settings or intervene in one of them and compare how the timelines diverge.</p>
    ${world.interventions.length ? `<h3>User interventions in this world</h3><ul class="plain small">${world.interventions.slice().reverse().slice(0, 20).map(i => `<li>${esc(seasonLabel(i.season))} · ${esc(i.date)} · <a href="#/club/${esc(i.club)}">${esc(world.info[i.club]?.short ?? i.club)}</a>: ${esc(i.text)}</li>`).join('')}</ul>` : ''}</section>
  <section class="card"><h2>Saved worlds</h2>${saves === null ? '<p class="muted">Loading…</p>' : saves.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Season</th><th class="hide-sm">Saved</th><th class="num hide-sm">Size</th><th></th></tr></thead><tbody>${saves.map(m => `<tr><td><strong>${esc(m.name)}</strong>${m.id === 'autosave' ? ' <span class="tag">auto</span>' : ''}<div class="muted small">seed ${esc(m.seed)} · ${m.seasonsPlayed} seasons</div></td><td>${esc(seasonLabel(m.season))}<div class="muted small">${esc(m.date)}</div></td><td class="hide-sm muted small">${esc(new Date(m.savedAt).toLocaleString())}</td><td class="num hide-sm muted small">${m.bytes ? (m.bytes / 1e6).toFixed(1) + ' MB' : ''}</td><td class="actions"><button class="btn small primary" data-action="load" data-id="${esc(m.id)}">Load</button><button class="btn small" data-action="overwrite" data-id="${esc(m.id)}">Overwrite</button><button class="btn small" data-action="rename" data-id="${esc(m.id)}">Rename</button><button class="btn small danger" data-action="delete" data-id="${esc(m.id)}">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No saves yet.</p>'}</section>
  <section class="card"><h2>New world</h2><p class="muted small">Start from a real season: the present day, or the first Premier League season with clubs rated from results before 1992/93 and that era's competition rules. Use the same seed to reproduce a world exactly.</p>
    <div class="toolbar"><select data-change="new-start" aria-label="Start season">${Object.values(STARTS).map(s => `<option value="${s.id}"${s.id === newStart ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select><input type="text" placeholder="Seed (optional)" data-input="new-seed" aria-label="Seed"><button class="btn danger" data-action="new-world">Start new world</button></div></section>`,
});
