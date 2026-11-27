// Systematic calibration driver.
//
//   node tools/calibrate/run.mjs short      grid search of match/season parameters (first seasons)
//   node tools/calibrate/run.mjs long       random (Latin-hypercube) search of evolution parameters
//   node tools/calibrate/run.mjs refine     local search around the best long-phase candidates
//   node tools/calibrate/run.mjs validate   holdout validation of the finalists (unused seeds)
//   node tools/calibrate/run.mjs sensitivity  one-at-a-time sensitivity of the selected model
//
// Screening uses the SAME seeds for every configuration (common random numbers) to reduce
// comparison noise; validation uses a disjoint set of holdout seeds to limit overfitting.
// Results are written to calibration/results/<phase>.json.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, aggregate, means } from './pool.mjs';
import { SHORT, LONG, scoreGroup } from './targets.mjs';
import { DEFAULT_PARAMS } from '../../src/engine/params.ts';
import { Rng } from '../../src/engine/rng.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'calibration', 'results');
mkdirSync(outDir, { recursive: true });
const phase = process.argv[2] ?? 'short';
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? Number(process.argv[i + 1]) : def; };
const pool = new Pool();
const load = f => JSON.parse(readFileSync(join(outDir, f), 'utf8'));
const save = (f, data) => writeFileSync(join(outDir, f), JSON.stringify(data, null, 1));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const sarg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const SCREEN_FIRST = 'screen-first-', SCREEN_LONG = 'screen-long-', HOLDOUT = sarg('holdout', 'holdout-');

async function evalShort(params, n, seedPrefix = SCREEN_FIRST) {
  const res = await pool.run(Array.from({ length: n }, (_, i) => ({ seed: seedPrefix + i, seasons: 1, params })));
  const agg = aggregate(res);
  const m = means(agg);
  m['pl.championPtsSD'] = agg['pl.pts1'].sd;
  return { agg, m, score: scoreGroup(m, SHORT) };
}
async function evalLong(params, runs, seasons, seedPrefix = SCREEN_LONG) {
  const res = await pool.run(Array.from({ length: runs }, (_, i) => ({ seed: seedPrefix + i, seasons, params, keepChampions: true })));
  const agg = aggregate(res);
  return { agg, m: means(agg), score: scoreGroup(means(agg), LONG), champions: res.map(r => r.champions) };
}
const brief = s => s.detail.filter(d => d.z !== null && Math.abs(d.z) > 1).map(d => `${d.m}=${d.v.toFixed(1)}(z${d.z.toFixed(1)})`).join(' ');

// ---------------------------------------------------------------------------------- short
if (phase === 'short') {
  const grid = [];
  for (const strength of [0.95, 1.05, 1.15, 1.25])
    for (const seasonSD of [1.0, 1.6, 2.2])
      for (const matchNoise of [0, 0.1])
        for (const baseGoals of [0.1, 0.14])
          for (const dcRho of [-0.05, -0.1]) grid.push({ strength, seasonSD, matchNoise, baseGoals, dcRho });
  const n = arg('n', 150);
  const results = [];
  for (const [i, g] of grid.entries()) {
    const params = { ...DEFAULT_PARAMS, ...g };
    const r = await evalShort(params, n);
    results.push({ config: g, score: r.score.score, metrics: r.m, detail: r.score.detail });
    log(`short ${i + 1}/${grid.length}`, JSON.stringify(g), 'score', r.score.score.toFixed(3));
  }
  results.sort((a, b) => a.score - b.score);
  save('short.json', { phase, firstSeasonsPerConfig: n, seeds: `${SCREEN_FIRST}0..${n - 1}`, results });
  for (const r of results.slice(0, 8)) log('TOP', r.score.toFixed(3), JSON.stringify(r.config), brief({ detail: r.detail }));
}

// ---------------------------------------------------------------------------------- long
const SPACE = {
  strength: [1.0, 1.25], seasonSD: [0.8, 3.2], seasonPersist: [0, 0.6], matchNoise: [0, 0.12],
  revert: [0.05, 0.25], recoverBoost: [1, 3], stabilityDamping: [0, 1.5], promoEra: [0, 1.5],
  repWeight: [0.3, 0.95], rankEconomics: [0, 1], eraPersist: [0.5, 0.9], eraSD: [0.3, 1.6],
  qualityNoise: [0.3, 1.6], perfEffect: [0, 2.5], promoBoost: [0, 5], relegHit: [0, 5],
  fatigueTitle: [0, 3], fatigueQuality: [0, 2], fatigueStreak: [0, 3], promoVar: [0, 1.5], ceiling: [80, 92], ceilingCost: [0, 0.6],
  repRate: [0.03, 0.15], repDecayFactor: [0.4, 1], eventRate: [0.05, 0.25],
};
function bestShort() {
  if (!existsSync(join(outDir, 'short.json'))) return {};
  return load('short.json').results[0].config;
}
function lhs(n, rng) {
  // Latin hypercube sample over SPACE.
  const keys = Object.keys(SPACE);
  const perms = keys.map(() => rng.shuffle(Array.from({ length: n }, (_, i) => i)));
  return Array.from({ length: n }, (_, i) => Object.fromEntries(keys.map((k, j) => {
    const [lo, hi] = SPACE[k];
    return [k, +(lo + (hi - lo) * (perms[j][i] + rng.next()) / n).toFixed(4)];
  })));
}

if (phase === 'long') {
  const n = arg('configs', 120), runs = arg('runs', 6), seasons = arg('seasons', 60);
  const base = { ...DEFAULT_PARAMS, ...bestShort() };
  const configs = lhs(n, Rng.fromSeed('lhs-1'));
  const results = [];
  for (const [i, c] of configs.entries()) {
    const r = await evalLong({ ...base, ...c }, runs, seasons);
    results.push({ config: c, score: r.score.score, metrics: r.m, detail: r.score.detail });
    if ((i + 1) % 10 === 0) log(`long ${i + 1}/${n}`, 'best so far', Math.min(...results.map(x => x.score)).toFixed(3));
  }
  results.sort((a, b) => a.score - b.score);
  save('long.json', { phase, base: bestShort(), runsPerConfig: runs, seasonsPerRun: seasons, seeds: `${SCREEN_LONG}0..${runs - 1}`, space: SPACE, results });
  for (const r of results.slice(0, 6)) log('TOP', r.score.toFixed(3), JSON.stringify(r.config), '\n   ', brief({ detail: r.detail }));
}

// ---------------------------------------------------------------------------------- refine
if (phase === 'refine') {
  const from = process.argv.includes('--from-refine') ? 'refine.json' : 'long.json';
  const prev = load(from);
  const round = from === 'refine.json' ? (prev.round ?? 1) + 1 : 1;
  if (from === 'refine.json') save(`refine-round${prev.round ?? 1}.json`, prev);
  const runs = arg('runs', 8), seasons = arg('seasons', 80), per = arg('per', 12), top = arg('top', 5), stepSize = arg('step', 0.12);
  const base = { ...DEFAULT_PARAMS, ...prev.base };
  const rng = Rng.fromSeed('refine-' + round);
  const cands = [];
  for (const r of prev.results.slice(0, top)) {
    cands.push(r.config);
    for (let k = 0; k < per; k++) {
      const c = {};
      for (const [key, [lo, hi]] of Object.entries(SPACE)) c[key] = +Math.max(lo, Math.min(hi, (r.config[key] ?? DEFAULT_PARAMS[key]) + stepSize * (hi - lo) * rng.normal())).toFixed(4);
      cands.push(c);
    }
  }
  // Joint refinement: also perturb the short-term parameters slightly for each candidate.
  const results = [];
  for (const [i, c] of cands.entries()) {
    const params = { ...base, ...c };
    const L = await evalLong(params, runs, seasons, 'screen-refine-');
    const S = await evalShort(params, 100, 'screen-refine-first-');
    const score = 0.5 * L.score.score + 0.5 * S.score.score;
    results.push({ config: c, score, long: L.score.score, short: S.score.score, metrics: { ...S.m, ...prefix(L.m, 'long:') }, detail: [...S.score.detail.map(d => ({ ...d, g: 'short' })), ...L.score.detail.map(d => ({ ...d, g: 'long' }))] });
    if ((i + 1) % 10 === 0) log(`refine ${i + 1}/${cands.length}`, 'best', Math.min(...results.map(x => x.score)).toFixed(3));
  }
  results.sort((a, b) => a.score - b.score);
  save('refine.json', { phase, round, from, base: prev.base, runsPerConfig: runs, seasonsPerRun: seasons, results });
  for (const r of results.slice(0, 6)) log('TOP', r.score.toFixed(3), 'L', r.long.toFixed(3), 'S', r.short.toFixed(3), JSON.stringify(r.config));
}

// ---------------------------------------------------------------------------------- validate
if (phase === 'validate') {
  const prev = load(process.argv.includes('--from-long') ? 'long.json' : 'refine.json');
  const k = arg('finalists', 3);
  const firsts = arg('firsts', 500), r50 = arg('r50', 12), r100 = arg('r100', 8);
  const base = { ...DEFAULT_PARAMS, ...prev.base };
  const finalists = [];
  for (const [i, r] of prev.results.slice(0, k).entries()) {
    const params = { ...base, ...r.config };
    const S = await evalShort(params, firsts, HOLDOUT + 'first-');
    const L50 = await evalLong(params, r50, 50, HOLDOUT + '50-');
    const L100 = await evalLong(params, r100, 100, HOLDOUT + '100-');
    const score = 0.5 * S.score.score + 0.25 * L50.score.score + 0.25 * L100.score.score;
    finalists.push({ rank: i + 1, config: r.config, params, score, short: S.score.score, long50: L50.score.score, long100: L100.score.score,
      shortAgg: S.agg, long50Agg: L50.agg, long100Agg: L100.agg, shortDetail: S.score.detail, long50Detail: L50.score.detail, long100Detail: L100.score.detail,
      champions100: L100.champions });
    log(`finalist ${i + 1}`, 'holdout score', score.toFixed(3), 'S', S.score.score.toFixed(3), 'L50', L50.score.score.toFixed(3), 'L100', L100.score.score.toFixed(3));
  }
  // Baseline: the uncalibrated starting parameters, on the same holdout seeds.
  const S0 = await evalShort(DEFAULT_PARAMS, firsts, HOLDOUT + 'first-');
  const L0 = await evalLong(DEFAULT_PARAMS, r100, 100, HOLDOUT + '100-');
  save('validate.json', { phase, seeds: { first: `${HOLDOUT}first-0..${firsts - 1}`, l50: `${HOLDOUT}50-0..${r50 - 1}`, l100: `${HOLDOUT}100-0..${r100 - 1}` }, finalists,
    baseline: { params: DEFAULT_PARAMS, short: S0.score.score, long100: L0.score.score, shortAgg: S0.agg, long100Agg: L0.agg } });
}

// ---------------------------------------------------------------------------------- check
// Evaluate the current DEFAULT_PARAMS on a holdout seed set (used after model changes).
if (phase === 'check') {
  const firsts = arg('firsts', 500), r100 = arg('r100', 10);
  const S = await evalShort(DEFAULT_PARAMS, firsts, HOLDOUT + 'first-');
  const L = await evalLong(DEFAULT_PARAMS, r100, 100, HOLDOUT + '100-');
  log('check short', S.score.score.toFixed(3), 'long100', L.score.score.toFixed(3));
  for (const d of [...S.score.detail, ...L.score.detail]) if (d.z !== null && Math.abs(d.z) > 0.6) log('  ', d.m, d.v.toFixed(2), 'target', d.t, 'z', d.z.toFixed(2));
  save(`check-${HOLDOUT.replace(/-$/, '')}.json`, { params: DEFAULT_PARAMS, short: S.score.score, long100: L.score.score, shortAgg: S.agg, long100Agg: L.agg, shortDetail: S.score.detail, long100Detail: L.score.detail });
}

// ---------------------------------------------------------------------------------- sensitivity
if (phase === 'sensitivity') {
  const v = load('validate.json');
  const chosen = [...v.finalists].sort((a, b) => a.score - b.score)[0].params;
  const keys = [...new Set(['strength', 'seasonSD', 'matchNoise', ...Object.keys(SPACE)])];
  const runs = arg('runs', 8), seasons = arg('seasons', 60);
  const ref = await evalLong(chosen, runs, seasons, 'sens-');
  const refS = await evalShort(chosen, 100, 'sens-first-');
  const rows = [];
  for (const key of keys) {
    for (const f of [0.75, 1.25]) {
      const params = { ...chosen, [key]: chosen[key] * f };
      const L = await evalLong(params, runs, seasons, 'sens-');
      const S = await evalShort(params, 100, 'sens-first-');
      rows.push({ key, factor: f, long: L.score.score, short: S.score.score,
        effects: Object.fromEntries(['lt.titleRetentionPct', 'lt.uniqueChampionsIn25', 'lt.top6NewEntrants', 'lt.promotedSurvivalPct', 'lt.giants30RelegatedPct', 'lt.initialGiantsTier3Before50Pct', 'lt.lowerReachPL50Pct', 'pl.pts1', 'pl.withinSeasonSD'].map(m => [m, (L.m[m] ?? NaN) - (ref.m[m] ?? NaN)])) });
      log('sens', key, f, 'long', L.score.score.toFixed(3), 'short', S.score.score.toFixed(3));
    }
  }
  save('sensitivity.json', { phase, chosen, reference: { long: ref.score.score, short: refS.score.score, metrics: ref.m }, rows });
}

function prefix(o, p) { return Object.fromEntries(Object.entries(o).map(([k, v]) => [p + k, v])); }
await pool.close();
