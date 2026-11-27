// Systematic calibration driver.
//
//   node tools/calibrate/run.mjs short      grid search of match/season parameters (first seasons)
//   node tools/calibrate/run.mjs long       random (Latin-hypercube) search of evolution parameters
//   node tools/calibrate/run.mjs refine     local search around the best long-phase candidates
//   node tools/calibrate/run.mjs validate   holdout validation of the finalists (unused seeds)
//   node tools/calibrate/run.mjs sensitivity  one-at-a-time sensitivity of the selected model
//   node tools/calibrate/run.mjs amb-refine   (0.6) refine the ownership-ambition parameters from DEFAULT_PARAMS
//   node tools/calibrate/run.mjs amb-validate (0.6) holdout comparison: ambition finalists vs the current model
//   node tools/calibrate/run.mjs own-refine   (0.7) relative ownership: Latin hypercube, then joint refinement
//   node tools/calibrate/run.mjs own-validate (0.7) holdout comparison against the 0.6 model (--holdout holdout4-)
//
// Screening uses the SAME seeds for every configuration (common random numbers) to reduce
// comparison noise; validation uses a disjoint set of holdout seeds to limit overfitting.
// Results are written to calibration/results/<phase>.json.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, aggregate, means } from './pool.mjs';
import { SHORT, LONG, scoreGroup } from './targets.mjs';
import { scoreRuns, scalesFrom } from './real92.mjs';
import { DEFAULT_PARAMS, AMBITION_OFF, MODEL_06 } from '../../src/engine/params.ts';
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

async function evalShort(params, n, seedPrefix = SCREEN_FIRST, settings) {
  const res = await pool.run(Array.from({ length: n }, (_, i) => ({ seed: seedPrefix + i, seasons: 1, params, settings })));
  const agg = aggregate(res);
  const m = means(agg);
  m['pl.championPtsSD'] = agg['pl.pts1'].sd;
  return { agg, m, score: scoreGroup(m, SHORT) };
}
async function evalLong(params, runs, seasons, seedPrefix = SCREEN_LONG, settings) {
  const res = await pool.run(Array.from({ length: runs }, (_, i) => ({ seed: seedPrefix + i, seasons, params, keepChampions: true, settings })));
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
  // 0.6: ownership ambition
  ambPersist: [0.8, 0.97], ambTarget: [0, 8], ambPromo: [0, 1.5], ambUpside: [0, 2], ownerEventRate: [0, 0.06],
  // 0.7: relative ownership (headroom below the elite)
  ambLift: [0, 12], ambDrop: [0, 10], ambRepRef: [65, 100],
};
const AMB_KEYS = ['ambPersist', 'ambTarget', 'ambPromo', 'ambUpside', 'ownerEventRate'];
// Existing long-term parameters re-tuned jointly with ambition (they interact with promotion
// investment and the structural target); everything else stays at DEFAULT_PARAMS.
const AMB_JOINT = [...AMB_KEYS, 'promoBoost', 'relegHit', 'revert', 'eraSD', 'promoEra', 'repWeight', 'rankEconomics', 'ceiling', 'ceilingCost'];
// 0.7 relative ownership: the old structural shift (ambTarget) stays at 0; the effect acts through
// headroom below the elite instead.
const OWN_KEYS = ['ambPersist', 'ambLift', 'ambDrop', 'ambRepRef', 'ambPromo', 'ambUpside', 'ownerEventRate'];
const OWN_JOINT = [...OWN_KEYS, 'promoBoost', 'relegHit', 'revert', 'eraSD', 'promoEra', 'repWeight', 'rankEconomics', 'ceiling', 'ceilingCost'];
// Phase families: amb-* (0.6, rejected) and own-* (0.7). Same procedure, different keys and files.
const FAMILY = phase.startsWith('own-')
  // own-*: searched from the 0.6 shipped model (MODEL_06); amb-*: from the 0.5 defaults (= MODEL_06 with
  // the 0.6 trait switched off). Both bases are explicit so the phases reproduce after later adoptions.
  ? { file: 'own', keys: OWN_KEYS, joint: OWN_JOINT, fixed: { ambTarget: 0 }, lhsSeed: 'own-lhs-1', refineSeed: 'own-refine-', base: MODEL_06, refLabel: '0.6 model (ownership off)' }
  : { file: 'amb', keys: AMB_KEYS, joint: AMB_JOINT, fixed: {}, lhsSeed: 'amb-lhs-1', refineSeed: 'amb-refine-', base: MODEL_06, refLabel: 'current model (ambition off)' };
const famParams = (F, cfg) => ({ ...DEFAULT_PARAMS, ...F.base, ...cfg });
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
  // --source amb|own: the model adopted by amb-validate / own-validate (written to <source>-sensitivity.json).
  const src = sarg('source', '');
  const amb = src === 'amb' || src === 'own';
  const v = load(amb ? `${src}-validate.json` : 'validate.json');
  const chosen = amb ? v.finalists.find(f => f.rank === v.adopted)?.params ?? v.baseline.params : [...v.finalists].sort((a, b) => a.score - b.score)[0].params;
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
  save(amb ? `${src}-sensitivity.json` : 'sensitivity.json', { phase, chosen, reference: { long: ref.score.score, short: refS.score.score, metrics: ref.m }, rows });
}

// ---------------------------------------------------------------------------------- 0.6: ambition
async function evalJoint(params, runs, seasons) {
  const L = await evalLong(params, runs, seasons, 'screen-refine-');
  const S = await evalShort(params, 100, 'screen-refine-first-');
  return { score: 0.5 * L.score.score + 0.5 * S.score.score, long: L.score.score, short: S.score.score, metrics: { ...S.m, ...prefix(L.m, 'long:') },
    detail: [...S.score.detail.map(d => ({ ...d, g: 'short' })), ...L.score.detail.map(d => ({ ...d, g: 'long' }))] };
}
if (phase === 'amb-refine' || phase === 'own-refine') {
  const F = FAMILY, RF = `${F.file}-refine`;
  const runs = arg('runs', 12), seasons = arg('seasons', 80), per = arg('per', 10), top = arg('top', 5), stepSize = arg('step', 0.1);
  const fresh = process.argv.includes('--from-default') || !existsSync(join(outDir, `${RF}.json`));
  const prev = fresh ? null : load(`${RF}.json`);
  const round = prev ? prev.round + 1 : 1;
  if (prev) save(`${RF}-round${prev.round}.json`, prev);
  const cands = [];
  if (fresh) {
    // Round 1: the current model with ambition off, plus a Latin hypercube over the ambition
    // parameters with every other parameter at DEFAULT_PARAMS.
    cands.push({ ...AMBITION_OFF, label: F.refLabel });
    const n = arg('configs', 60), rng = Rng.fromSeed(F.lhsSeed);
    const perms = F.keys.map(() => rng.shuffle(Array.from({ length: n }, (_, i) => i)));
    for (let i = 0; i < n; i++) cands.push({ ...F.fixed, ...Object.fromEntries(F.keys.map((k, j) => { const [lo, hi] = SPACE[k]; return [k, +(lo + (hi - lo) * (perms[j][i] + rng.next()) / n).toFixed(4)]; })) });
  } else {
    const rng = Rng.fromSeed(F.refineSeed + round);
    for (const r of prev.results.slice(0, top)) {
      cands.push(r.config);
      if (r.config.label) continue; // never perturb the reference model
      for (let k = 0; k < per; k++) {
        const c = { ...r.config };
        for (const key of F.joint) { const [lo, hi] = SPACE[key]; c[key] = +Math.max(lo, Math.min(hi, (r.config[key] ?? famParams(F, {})[key]) + stepSize * (hi - lo) * rng.normal())).toFixed(4); }
        cands.push(c);
      }
    }
    if (!cands.some(c => c.label)) cands.push(prev.results.find(r => r.config.label)?.config ?? { ...AMBITION_OFF, label: F.refLabel });
  }
  const results = [];
  for (const [i, c] of cands.entries()) {
    const { label, ...cfg } = c;
    const r = await evalJoint(famParams(F, cfg), runs, seasons);
    results.push({ config: c, ...r });
    if ((i + 1) % 10 === 0) log(`${RF} r${round} ${i + 1}/${cands.length}`, 'best', Math.min(...results.map(x => x.score)).toFixed(3));
  }
  results.sort((a, b) => a.score - b.score);
  save(`${RF}.json`, { phase, round, runsPerConfig: runs, seasonsPerRun: seasons, step: stepSize, keys: fresh ? F.keys : F.joint, results });
  const ref = results.find(r => r.config.label);
  log('reference (ambition off)', ref.score.toFixed(3), 'L', ref.long.toFixed(3), 'S', ref.short.toFixed(3));
  for (const r of results.slice(0, 6)) log('TOP', r.score.toFixed(3), 'L', r.long.toFixed(3), 'S', r.short.toFixed(3), JSON.stringify(r.config));
}

if (phase === 'amb-validate' || phase === 'own-validate') {
  const F = FAMILY;
  const prev = load(`${F.file}-refine.json`);
  const k = arg('finalists', 4), firsts = arg('firsts', 500), r50 = arg('r50', 12), r100 = arg('r100', 10);
  const evalAll = async (params) => {
    const S = await evalShort(params, firsts, HOLDOUT + 'first-');
    const L50 = await evalLong(params, r50, 50, HOLDOUT + '50-');
    const L100 = await evalLong(params, r100, 100, HOLDOUT + '100-');
    return { score: 0.5 * S.score.score + 0.25 * L50.score.score + 0.25 * L100.score.score, short: S.score.score, long50: L50.score.score, long100: L100.score.score,
      shortAgg: S.agg, long50Agg: L50.agg, long100Agg: L100.agg, shortDetail: S.score.detail, long50Detail: L50.score.detail, long100Detail: L100.score.detail, champions100: L100.champions };
  };
  const baseParams = famParams(F, AMBITION_OFF);
  const baseline = { label: F.refLabel, params: baseParams, ...(await evalAll(baseParams)) };
  log('baseline', baseline.score.toFixed(3), 'S', baseline.short.toFixed(3), 'L50', baseline.long50.toFixed(3), 'L100', baseline.long100.toFixed(3));
  const finalists = [];
  for (const [i, r] of prev.results.filter(r => !r.config.label).slice(0, k).entries()) {
    const params = famParams(F, r.config);
    const f = { rank: i + 1, config: r.config, screen: r.score, params, ...(await evalAll(params)) };
    // Adoption rule (decided before looking at holdout results): the combined holdout score must
    // improve and none of the three groups may get worse than the current model on the same seeds.
    f.adoptable = f.score < baseline.score && f.short <= baseline.short && f.long50 <= baseline.long50 && f.long100 <= baseline.long100;
    finalists.push(f);
    log(`finalist ${i + 1}`, f.score.toFixed(3), 'S', f.short.toFixed(3), 'L50', f.long50.toFixed(3), 'L100', f.long100.toFixed(3), f.adoptable ? 'ADOPTABLE' : 'rejected');
  }
  const ok = finalists.filter(f => f.adoptable).sort((a, b) => a.score - b.score);
  save(`${F.file}-validate.json`, { phase, holdout: HOLDOUT, seeds: { first: `${HOLDOUT}first-0..${firsts - 1}`, l50: `${HOLDOUT}50-0..${r50 - 1}`, l100: `${HOLDOUT}100-0..${r100 - 1}` },
    rule: 'adopt only if combined holdout score improves and no group (short, 50-year, 100-year) is worse than the current model on the same seeds',
    baseline, finalists, adopted: ok[0]?.rank ?? null });
  log(ok.length ? `ADOPT finalist ${ok[0].rank}` : 'NO finalist satisfies the adoption rule');
}

// ---------------------------------------------------------------------------------- 0.7: the 1992/93 start
// Out-of-sample test and start-specific calibration against real 1992/93-2024/25 outcomes
// (data/history/derived/real-1992.json from tools/history/real1992.mjs; scoring in real92.mjs).
//   start92-grid      grid over the economic path (levelPathAmount x levelPathShape), scored on window A
//                     (1992-2008) only; the reference model (fixed curve) sets the CRPS scales
//   start92-validate  the best grid configurations and the reference on holdout seeds, all windows
// Score per window = 0.5 * agg / agg(reference) + 0.5 * club / club(reference): 1 = the reference model.
const REAL92 = existsSync(join(root, 'data/history/derived/real-1992.json')) ? JSON.parse(readFileSync(join(root, 'data/history/derived/real-1992.json'), 'utf8')) : null;
async function eval92(params, runs, seedPrefix) {
  const res = await pool.run(Array.from({ length: runs }, (_, i) => ({ seed: seedPrefix + i, seasons: 33, params, start: '1992', real92: true })));
  return Object.fromEntries(Object.keys(REAL92.metrics).map(w => [w, res.map(r => r.metrics[w])]));
}
const score92 = (runs, ref, scales) => Object.fromEntries(Object.keys(REAL92.metrics).map(w => {
  const s = scoreRuns(runs[w], REAL92.metrics[w], scales[w]);
  const r = ref?.[w];
  return [w, { ...s, total: r ? 0.5 * s.agg / r.agg + 0.5 * s.club / r.club : 1 }];
}));
if (phase === 'start92-grid') {
  const runs = arg('runs', 24);
  const refRuns = await eval92({ ...DEFAULT_PARAMS, levelPathAmount: 0 }, runs, 'screen92-');
  const scales = Object.fromEntries(Object.keys(refRuns).map(w => [w, scalesFrom(refRuns[w])]));
  const ref = score92(refRuns, null, scales);
  const results = [{ config: { levelPathAmount: 0, levelPathShape: 1, label: 'reference: fixed 1992 curve' }, score: score92(refRuns, ref, scales) }];
  // --amounts / --shapes: comma lists (round 2 refines round 1; the previous file is kept as start92-grid-round<n>.json).
  const list = (k, d) => (sarg(k, d)).split(',').map(Number);
  const prevGrid = existsSync(join(outDir, 'start92-grid.json')) ? load('start92-grid.json') : null;
  if (prevGrid) save(`start92-grid-round${prevGrid.round ?? 1}.json`, prevGrid);
  const round = prevGrid ? (prevGrid.round ?? 1) + 1 : 1;
  for (const amount of list('amounts', '0.25,0.5,0.75,1,1.25')) for (const shape of list('shapes', '0.35,0.6,1,1.6,2.5')) {
    const cfg = { levelPathAmount: amount, levelPathShape: shape };
    const r = await eval92({ ...DEFAULT_PARAMS, ...cfg }, runs, 'screen92-');
    results.push({ config: cfg, score: score92(r, ref, scales) });
    log('start92-grid', JSON.stringify(cfg), 'A', results.at(-1).score.A.total.toFixed(3), '(agg', (results.at(-1).score.A.agg / ref.A.agg).toFixed(3), 'club', (results.at(-1).score.A.club / ref.A.club).toFixed(3) + ')');
  }
  results.sort((a, b) => a.score.A.total - b.score.A.total);
  save('start92-grid.json', { phase, round, runsPerConfig: runs, seasonsPerRun: 33, seeds: `screen92-0..${runs - 1}`, searchWindow: 'A', windows: WINDOWS92(), scales, results });
  for (const r of results.slice(0, 5)) log('TOP', JSON.stringify(r.config), 'A', r.score.A.total.toFixed(3), 'B', r.score.B.total.toFixed(3), 'full', r.score.full.total.toFixed(3));
}
if (phase === 'start92-validate') {
  const prev = load('start92-grid.json');
  const k = arg('finalists', 3), runs = arg('runs', 60), H92 = sarg('holdout', 'holdout92-');
  const refRuns = await eval92({ ...DEFAULT_PARAMS, levelPathAmount: 0 }, runs, H92);
  const scales = Object.fromEntries(Object.keys(refRuns).map(w => [w, scalesFrom(refRuns[w])]));
  const ref = score92(refRuns, null, scales);
  const baseline = { config: { levelPathAmount: 0, levelPathShape: 1 }, score: score92(refRuns, ref, scales) };
  const finalists = [];
  for (const [i, r] of prev.results.filter(r => !r.config.label).slice(0, k).entries()) {
    const runsF = await eval92({ ...DEFAULT_PARAMS, ...r.config }, runs, H92);
    const sc = score92(runsF, ref, scales);
    // Adoption rule (fixed before validation): on the holdout seeds the score must improve over the reference
    // (fixed 1992 curve) for the full period AND for the later window B (2009-2024, never used by the search),
    // and club-level skill over the full period must not get worse.
    const adoptable = sc.full.total < 1 && sc.B.total < 1 && sc.full.club <= ref.full.club;
    finalists.push({ rank: i + 1, config: r.config, screen: r.score.A.total, score: sc, adoptable });
    log(`finalist ${i + 1}`, JSON.stringify(r.config), 'full', sc.full.total.toFixed(3), 'B', sc.B.total.toFixed(3), 'A', sc.A.total.toFixed(3), adoptable ? 'ADOPTABLE' : 'rejected');
  }
  const ok = finalists.filter(f => f.adoptable).sort((a, b) => a.score.full.total - b.score.full.total);
  save('start92-validate.json', { phase, holdout: H92, runs, seeds: `${H92}0..${runs - 1}`, windows: WINDOWS92(),
    rule: 'adopt only if, on holdout seeds, the score improves over the fixed-curve reference for the full period 1992-2024 and for the unseen window 2009-2024, and club-level skill over the full period is not worse',
    baseline, finalists, adopted: ok[0]?.rank ?? null });
  log(ok.length ? `ADOPT finalist ${ok[0].rank}` : 'NO finalist satisfies the adoption rule');
}
function WINDOWS92() { return REAL92?.windows; }

// ---------------------------------------------------------------------------------- 0.7: administration
// The administration rate is set from history (about 1 per season, tools/calibrate report), not searched. Rule,
// fixed before running: administration is on by default only if, on fresh holdout seeds, the combined score with
// it is not worse than without it and no group (short, 50-year, 100-year) is worse by more than 0.02.
if (phase === 'admin-check') {
  const firsts = arg('firsts', 500), r50 = arg('r50', 12), r100 = arg('r100', 10);
  // The setting multiplies adminRate (default 0%), so both runs set it explicitly.
  const evalAll = async (params, settings) => {
    const S = await evalShort(params, firsts, HOLDOUT + 'first-', settings);
    const L50 = await evalLong(params, r50, 50, HOLDOUT + '50-', settings);
    const L100 = await evalLong(params, r100, 100, HOLDOUT + '100-', settings);
    return { score: 0.5 * S.score.score + 0.25 * L50.score.score + 0.25 * L100.score.score, short: S.score.score, long50: L50.score.score, long100: L100.score.score,
      shortAgg: S.agg, long50Agg: L50.agg, long100Agg: L100.agg };
  };
  const off = await evalAll({ ...DEFAULT_PARAMS }, { administration: 0 });
  const on = await evalAll({ ...DEFAULT_PARAMS }, { administration: 1 });
  const keep = on.score <= off.score && on.short <= off.short + 0.02 && on.long50 <= off.long50 + 0.02 && on.long100 <= off.long100 + 0.02;
  save('admin-check.json', { phase, holdout: HOLDOUT, seeds: { first: `${HOLDOUT}first-0..${firsts - 1}`, l50: `${HOLDOUT}50-0..${r50 - 1}`, l100: `${HOLDOUT}100-0..${r100 - 1}` },
    rule: 'on by default only if the combined holdout score is not worse than without administration and no group is worse by more than 0.02', adminRate: DEFAULT_PARAMS.adminRate, off, on, keep });
  log('without', off.score.toFixed(3), 'S', off.short.toFixed(3), 'L50', off.long50.toFixed(3), 'L100', off.long100.toFixed(3));
  log('with   ', on.score.toFixed(3), 'S', on.short.toFixed(3), 'L50', on.long50.toFixed(3), 'L100', on.long100.toFixed(3), keep ? 'KEEP ON' : 'switch OFF by default');
}

function prefix(o, p) { return Object.fromEntries(Object.entries(o).map(([k, v]) => [p + k, v])); }
await pool.close();
