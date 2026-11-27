import { createWorld, changeSettings, seasonLabel } from '../engine/world.ts';
import { simulate, absoluteTarget, type SimTarget } from '../engine/sim.ts';
import { DEFAULT_SETTINGS, PRESETS } from '../engine/params.ts';
import { upgradeWorld } from '../persistence/save.ts';
import type { Settings, World } from '../engine/types.ts';
import type { Page, UIState } from './types.ts';
import { esc, installCrestFallback } from './dom.ts';
import { nextSlotLabel, leagues } from './data.ts';
import { overviewPage } from './pages/overview.ts';
import { standingsPage, fixturesPage } from './pages/standings.ts';
import { cupsPage } from './pages/cups.ts';
import { clubsPage, clubPage } from './pages/clubs.ts';
import { historyPage } from './pages/history.ts';
import { newsPage, settingsPage, savesPage } from './pages/misc.ts';
import { seasonPage, h2hPage } from './pages/stories.ts';
import { comparePage, type CompareState } from './pages/sandbox.ts';
import { applyIntervention, forkWorld, EDITABLE, type InterventionSpec } from '../engine/sandbox.ts';
import { STARTS } from '../data/england/starts.ts';
import * as store from './store.ts';
import type { SaveMeta } from '../persistence/save.ts';

declare const __WORKER_SOURCE__: string;
declare const __APP_VERSION__: string;

// ------------------------------------------------------------------ state
const ls = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const defaultState: UIState = {
  standingsLeague: 'ENG1', fixturesComp: 'ENG1', fixturesRound: {}, clubsFilter: { q: '', league: '', sort: 'ovr', dir: 1 },
  historyTab: 'honours', historyComp: 'ENG1', historySeason: null, rankMetric: 'overall', rankPeriod: 'all', rankFrom: null, rankTo: null,
  newsKind: 'all', chartRange: 'all', positionDetail: 'season',
};
const state: UIState = { ...defaultState, ...ls.get<Partial<UIState>>('sws-ui', {}), fixturesRound: {} };
let world!: World;
let saves: SaveMeta[] | null = null;
let autosave = ls.get('sws-autosave', true);
let busy = false;
let cleanup: (() => void) | void;
let newSeed = '';
let newStart = '2026';
const cmp: CompareState = { id: null, world: null, loading: false, error: null, club: 'liverpool', year: null };

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

// ------------------------------------------------------------------ routing
const PAGES: Record<string, Page> = {
  overview: overviewPage, standings: standingsPage, fixtures: fixturesPage, cups: cupsPage, clubs: clubsPage, club: clubPage,
  history: historyPage, news: newsPage, settings: settingsPage, season: seasonPage, h2h: h2hPage,
};
const NAV = [['overview', 'Overview'], ['standings', 'Standings'], ['fixtures', 'Fixtures'], ['cups', 'Cups'], ['clubs', 'Clubs'], ['history', 'History'], ['compare', 'Compare'], ['news', 'News'], ['settings', 'Settings'], ['saves', 'Saves']];

function route(): { page: string; args: string[] } {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { page: parts[0] ?? 'overview', args: parts.slice(1) };
}

function render(keepScroll = false): void {
  const y = window.scrollY;
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  const r = route();
  if (r.page === 'compare') syncCompare(r.args[0] ?? null);
  const page = r.page === 'saves' ? savesPage(saves, store.storageError, autosave, newStart) : r.page === 'compare' ? comparePage(saves, cmp) : PAGES[r.page] ?? overviewPage;
  const main = $<HTMLElement>('#main');
  let res;
  try { res = page({ world, args: r.args, state }); }
  catch (e) { console.error(e); res = { title: 'Error', html: `<div class="notice">Something went wrong rendering this page: ${esc((e as Error).message)}</div>` }; }
  main.innerHTML = res.html;
  document.title = `${res.title} · Soccer World Sims`;
  cleanup = res.mount?.(main);
  const navKey = r.page === 'club' ? 'clubs' : r.page === 'season' || r.page === 'h2h' ? 'history' : r.page;
  for (const a of document.querySelectorAll<HTMLAnchorElement>('#nav a')) a.classList.toggle('active', a.dataset.page === navKey);
  $('#season-label').textContent = seasonLabel(world.season.year);
  $('#date-label').textContent = nextSlotLabel(world);
  ls.set('sws-ui', { ...state, fixturesRound: undefined });
  if (keepScroll) window.scrollTo(0, y); else if (!r.args.length || r.page !== 'club') window.scrollTo(0, 0);
}

/** Load timeline B for the compare page (async; re-renders when ready). */
function syncCompare(id: string | null): void {
  if (id === cmp.id || cmp.loading) return;
  cmp.id = id; cmp.world = null; cmp.error = null; cmp.year = null;
  if (!id) return;
  cmp.loading = true;
  if (!saves) refreshSaves();
  store.readSave(id).then(w => { if (cmp.id === id) cmp.world = w; }).catch(e => { cmp.error = `Could not load that save: ${e?.message ?? e}`; })
    .finally(() => { cmp.loading = false; if (route().page === 'compare') render(true); });
}

/** Simulate timeline B up to the current world's date in a separate worker and save it back. */
function compareCatchUp(): void {
  if (!cmp.world || !cmp.id || busy) return;
  const target: SimTarget = world.season.complete ? { kind: 'untilComplete', year: world.season.year } : { kind: 'until', year: world.season.year, slot: world.season.slotIndex };
  const w = new Worker(URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: 'text/javascript' })));
  setBusy(true); toast('Simulating timeline B…');
  const id = cmp.id;
  w.onmessage = e => {
    if (e.data.type !== 'result') return;
    w.terminate();
    const B = upgradeWorld(e.data.world);
    store.writeSave(B, id, B.name).then(() => { cmp.world = B; setBusy(false); toast('Timeline B caught up and saved.'); refreshSaves(); render(true); })
      .catch(err => { setBusy(false); toast('Saving timeline B failed: ' + err.message); });
  };
  w.postMessage({ type: 'run', world: cmp.world, target });
}

function go(hash: string) { if (location.hash === hash) render(true); else location.hash = hash; }

// ------------------------------------------------------------------ simulation
function setBusy(b: boolean) {
  busy = b;
  for (const el of document.querySelectorAll<HTMLButtonElement>('[data-sim]')) el.disabled = b;
}

async function runSim(kind: string): Promise<void> {
  if (busy) return;
  const t = kind === 'years' ? { kind: 'seasons', n: Math.max(1, Math.min(500, Number(($('#sim-years') as HTMLInputElement).value) || 1)) } as SimTarget
    : kind === '100' ? { kind: 'seasons', n: 100 } as SimTarget : { kind } as SimTarget;
  if (t.kind === 'matchday' || t.kind === 'month') {
    // Short runs stay on the main thread (milliseconds); same engine path as bulk runs.
    setBusy(true);
    simulate(world, t);
    setBusy(false);
    afterSim();
    return;
  }
  runInWorker(absoluteTarget(world, t), labelFor(t));
}
const labelFor = (t: SimTarget) => t.kind === 'seasons' ? `${t.n} season${t.n > 1 ? 's' : ''}` : t.kind === 'season' ? 'rest of the season' : 'one year';

let worker: Worker | null = null;
function getWorker(): Worker {
  if (!worker) worker = new Worker(URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: 'text/javascript' })));
  return worker;
}

function runInWorker(target: SimTarget, label: string): void {
  setBusy(true);
  const before = world;
  const startYear = world.season.year;
  const overlay = $('#progress');
  overlay.hidden = false;
  overlay.innerHTML = `<div class="progress-box" role="dialog" aria-modal="true" aria-labelledby="progress-title"><h2 id="progress-title">Simulating ${esc(label)}</h2>
    <div class="progress-bar"><span id="progress-fill"></span></div><div id="progress-text" class="muted">Starting…</div>
    <div class="progress-actions"><button class="btn" data-action="sim-pause">Pause</button><button class="btn danger" data-action="sim-cancel">Cancel</button></div>
    <p class="muted small">Pause stops at the next consistent point and keeps progress. Cancel discards this run.</p></div>`;
  const w = getWorker();
  w.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') {
      const frac = Math.min(1, m.steps / m.total);
      $('#progress-fill').style.width = (frac * 100).toFixed(1) + '%';
      const eta = frac > 0.02 ? (m.elapsed / frac - m.elapsed) / 1000 : NaN;
      $('#progress-text').textContent = `${seasonLabel(m.year)} · ${m.seasonsDone} season${m.seasonsDone === 1 ? '' : 's'} completed · ${(m.elapsed / 1000).toFixed(1)} s${Number.isFinite(eta) ? ` · about ${Math.ceil(eta)} s left` : ''}`;
      return;
    }
    if (m.type === 'result') {
      if (m.status === 'cancelled') { world = before; overlay.hidden = true; setBusy(false); render(true); toast('Simulation cancelled; the world is unchanged.'); return; }
      world = upgradeWorld(m.world);
      if (m.status === 'paused') {
        overlay.innerHTML = `<div class="progress-box" role="dialog" aria-modal="true"><h2>Paused</h2><p>Stopped at ${esc(nextSlotLabel(world))} (${esc(seasonLabel(world.season.year))}). ${world.season.year - startYear} season(s) advanced.</p>
          <div class="progress-actions"><button class="btn primary" data-action="sim-resume">Resume</button><button class="btn" data-action="sim-keep">Stop here</button></div></div>`;
        pendingTarget = { target, label };
        render(true);
        return;
      }
      overlay.hidden = true; setBusy(false);
      toast(`Simulated ${label} in ${(m.elapsed / 1000).toFixed(1)} s.`);
      afterSim();
    }
  };
  w.postMessage({ type: 'run', world, target });
}
let pendingTarget: { target: SimTarget; label: string } | null = null;

let autosaveTimer: number | undefined;
function afterSim(): void {
  render(true);
  if (autosave) {
    clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => store.writeSave(world, 'autosave', `${world.name} (autosave)`).then(() => { if (route().page === 'saves') refreshSaves(); }).catch(e => console.warn('autosave failed', e)), 400);
  }
}

function toast(msg: string): void {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout((t as any)._h); (t as any)._h = setTimeout(() => { t.hidden = true; }, 3500);
}

async function refreshSaves(): Promise<void> {
  try { saves = await store.listSaves(); } catch { saves = []; }
  if (route().page === 'saves') render(true);
}

// ------------------------------------------------------------------ events
function applySettings(patch: Partial<Settings>) { changeSettings(world, patch); render(true); }

const actions: Record<string, (el: HTMLElement) => void | Promise<void>> = {
  'sim': el => runSim(el.dataset.sim!),
  'sim-pause': () => worker?.postMessage({ type: 'pause' }),
  'sim-cancel': () => worker?.postMessage({ type: 'cancel' }),
  'sim-resume': () => { const p = pendingTarget; pendingTarget = null; if (p) runInWorker(p.target, p.label); },
  'sim-keep': () => { pendingTarget = null; $('#progress').hidden = true; setBusy(false); afterSim(); },
  'sort-clubs': el => { const k = el.dataset.key!; state.clubsFilter.dir = state.clubsFilter.sort === k ? (state.clubsFilter.dir === 1 ? -1 : 1) : 1; state.clubsFilter.sort = k; render(true); },
  'chart-range': el => { state.chartRange = el.dataset.range!; render(true); },
  'position-detail': el => { state.positionDetail = el.dataset.detail as 'season' | 'matchday'; render(true); },
  'preset': el => applySettings({ ...DEFAULT_SETTINGS, storage: world.settings.storage, ...PRESETS[el.dataset.preset!].settings }),
  'restore-defaults': () => applySettings({ ...DEFAULT_SETTINGS, storage: world.settings.storage }),
  'save-new': async () => { const id = 'slot-' + Date.now(); await store.writeSave(world, id, world.name); toast('Saved.'); refreshSaves(); },
  'overwrite': async el => { if (!confirm('Overwrite this save with the current world?')) return; await store.writeSave(world, el.dataset.id!, world.name); toast('Saved.'); refreshSaves(); },
  'load': async el => { if (busy) return; world = await store.readSave(el.dataset.id!); toast(`Loaded "${world.name}".`); go('#/overview'); },
  'rename': async el => { const m = saves?.find(s => s.id === el.dataset.id); const n = prompt('Save name', m?.name ?? ''); if (n) { await store.renameSave(el.dataset.id!, n); refreshSaves(); } },
  'delete': async el => { if (!confirm('Delete this save permanently?')) return; await store.deleteSave(el.dataset.id!); refreshSaves(); },
  'export': () => store.downloadWorld(world),
  'whatif-edit': el => {
    if (busy) return;
    const values: Record<string, number> = {};
    for (const k of EDITABLE) {
      const inp = document.querySelector<HTMLInputElement>(`[data-whatif="${k}"]`);
      // Only fields the user changed: the form shows rounded values, which must not overwrite exact ones.
      if (inp && inp.value !== '' && inp.value !== inp.defaultValue) values[k] = k === 'ambition' ? Number(inp.value) / 100 : Number(inp.value);
    }
    const iv = applyIntervention(world, el.dataset.club!, { kind: 'edit', values });
    toast(Object.keys(iv.changes).length ? 'Intervention recorded.' : 'Nothing changed.');
    afterSim();
  },
  'whatif-event': el => {
    if (busy) return;
    applyIntervention(world, el.dataset.club!, { kind: el.dataset.kind } as InterventionSpec);
    toast('Event injected and recorded as a user intervention.');
    afterSim();
  },
  'fork': async () => {
    if (busy) return;
    const f = forkWorld(world);
    const id = 'slot-' + Date.now();
    await store.writeSave(f, id, f.name);
    toast(`Fork saved as "${f.name}". You are still in the original; load the fork from the list or compare the two.`);
    refreshSaves();
  },
  'fork-switch': async () => {
    if (busy) return;
    const original = world;
    const oid = 'slot-' + Date.now();
    await store.writeSave(original, oid, original.name);
    world = forkWorld(original);
    toast(`Saved the original as a slot and switched to the fork "${world.name}".`);
    afterSim(); refreshSaves();
  },
  'fork-compare': async () => {
    if (busy) return;
    const f = forkWorld(world);
    const id = 'slot-' + Date.now();
    await store.writeSave(f, id, f.name);
    await refreshSaves();
    go(`#/compare/${id}`);
  },
  'compare-catchup': () => compareCatchUp(),
  'new-world': () => { if (busy || !confirm(`Start a new world from ${seasonLabel(STARTS[newStart].year)}? Unsaved progress in the current world will be lost (the autosave is replaced).`)) return; world = createWorld({ seed: newSeed || String(Date.now()), start: newStart, name: 'New world', settings: { storage: world.settings.storage } }); afterSim(); go('#/overview'); },
};

document.addEventListener('click', e => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action], [data-sim]');
  if (!el) return;
  if (el.dataset.sim) { e.preventDefault(); runSim(el.dataset.sim); return; }
  const fn = actions[el.dataset.action!];
  if (fn) { e.preventDefault(); Promise.resolve(fn(el)).catch(err => toast(String(err?.message ?? err))); }
});

document.addEventListener('change', e => {
  const el = e.target as HTMLInputElement;
  const k = el.dataset.change;
  if (!k) return;
  if (k === 'standings-season') go(`#/standings/${el.dataset.league}${el.value ? '/' + el.value : ''}`);
  else if (k === 'fixtures-round') go(`#/fixtures/${el.dataset.comp}/${el.value}`);
  else if (k === 'clubs-league') { state.clubsFilter.league = el.value; render(true); }
  else if (k === 'compare-pick') go(el.value ? `#/compare/${el.value}` : '#/compare');
  else if (k === 'compare-year') { cmp.year = Number(el.value); render(true); }
  else if (k === 'compare-club') { cmp.club = el.value; render(true); }
  else if (k === 'new-start') { newStart = el.value; }
  else if (k === 'season-review') go(`#/season/${el.value}`);
  else if (k === 'h2h-a' || k === 'h2h-b') { const r = route(); const ids = [r.args[0] ?? '', r.args[1] ?? '']; const sel = [...document.querySelectorAll<HTMLSelectElement>('.h2h-pick select')].map(x => x.value); go(`#/h2h/${sel[0] ?? ids[0]}/${sel[1] ?? ids[1]}`); }
  else if (k === 'history-season') go(`#/history/tables/${el.value}/${el.dataset.league}`);
  else if (k === 'rank-from') { state.rankFrom = Number(el.value); render(true); }
  else if (k === 'rank-to') { state.rankTo = Number(el.value); render(true); }
  else if (k === 'setting') applySettings({ [el.dataset.key!]: Number(el.value) / 100 });
  else if (k === 'storage') applySettings({ storage: el.value as Settings['storage'] });
  else if (k === 'autosave') { autosave = el.checked; ls.set('sws-autosave', autosave); }
  else if (k === 'import' && el.files?.[0]) store.readWorldFile(el.files[0]).then(w => { world = w; toast(`Imported "${w.name}".`); afterSim(); go('#/overview'); }).catch(err => toast('Import failed: ' + err.message));
});

let inputTimer: number | undefined;
document.addEventListener('input', e => {
  const el = e.target as HTMLInputElement;
  const k = el.dataset.input;
  if (k === 'world-name') world.name = el.value;
  if (k === 'new-seed') newSeed = el.value.trim();
  if (k === 'clubs-q') {
    clearTimeout(inputTimer);
    inputTimer = window.setTimeout(() => {
      state.clubsFilter.q = el.value; render(true);
      const inp = document.querySelector<HTMLInputElement>('[data-input="clubs-q"]');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }, 150);
  }
});

window.addEventListener('hashchange', () => { render(); if (route().page === 'saves') refreshSaves(); });

// ------------------------------------------------------------------ boot
function shell(): void {
  document.body.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="logo" aria-hidden="true">◆</span><div><div class="brand-name">Soccer World Sims</div><div class="brand-sub">v${esc(__APP_VERSION__)}</div></div></div>
    <nav id="nav" class="nav">${NAV.map(([k, l]) => `<a href="#/${k}" data-page="${k}">${l}</a>`).join('')}</nav>
    <div class="when"><div id="season-label" class="season"></div><div id="date-label" class="muted small"></div></div>
  </header>
  <div class="simbar" role="toolbar" aria-label="Simulation controls">
    <span class="muted small">Simulate</span>
    <button class="btn primary" data-sim="matchday" title="Play the next matchday">Next matchday</button>
    <button class="btn" data-sim="month">Month</button>
    <button class="btn" data-sim="season">Rest of season</button>
    <button class="btn" data-sim="year">One year</button>
    <span class="years"><input id="sim-years" type="number" min="1" max="500" value="10" aria-label="Number of seasons"><button class="btn" data-sim="years">Seasons</button></span>
    <button class="btn" data-sim="100">100 seasons</button>
  </div>
  <main id="main" class="main" tabindex="-1"><div class="empty">Loading world…</div></main>
  <div id="progress" class="overlay" hidden></div>
  <div id="toast" class="toast" role="status" hidden></div>
  <footer class="footer muted small">Offline football world simulation · club data and calibration notes in the docs folder · crests via FootyLogos.com (club marks belong to their owners)</footer>`;
}

async function boot(): Promise<void> {
  shell();
  installCrestFallback();
  try { world = await store.readSave('autosave'); }
  catch { world = createWorld({ seed: String(Date.now()), name: 'My football world' }); }
  void leagues;
  render();
  refreshSaves();
}

boot();
