// Multi-fork experiments: run many independent continuations of the same world, each with its own
// random stream, and summarise how often each outcome happens (title, relegation, final position...).
//
// Every run is a fork of the base world (same clubs, history, settings and interventions) whose RNG is
// re-seeded from a label that depends on the base world's seed, lineage and calendar position and on the
// run number, but NOT on interventions. Running the same experiment again after a what-if change
// therefore uses the same random streams for each run (common random numbers): differences between the
// two summaries come from the change, not from different luck. The base world itself is never changed.
import { Rng } from './rng.ts';
import { resetRuntime, COUNTRIES } from './runtime.ts';
import { simulate, absoluteTarget } from './sim.ts';
import { cloneWorld } from '../persistence/save.ts';
import type { World } from './types.ts';

export interface ExperimentSpec { runs: number; seasons: number }

/** Compact result of one run. Arrays are season-major: value for season s, club i at [s * nClubs + i]. */
export interface RunOutcome {
  index: number;
  years: number[];
  /** Combined pyramid position (1 = top) at the end of each season. */
  pyramid: Int16Array;
  /** League index (in country league order) each club played in during each season. */
  league: Int8Array;
  /** +1 promoted, -1 relegated, 0 stayed, at the end of each season. */
  moved: Int8Array;
  /** Club index of each league's champion per season ([s * nLeagues + l]). */
  champions: Int16Array;
  /** Club index of each cup's winner per season ([s * nCups + k], -1 = not a playable club). */
  cups: Int16Array;
}

export const MAX_RUNS = 500, MAX_SEASONS = 100;

/** Label of the random stream of run `index` (independent of interventions; see module comment). */
export function runSeedLabel(base: World, index: number): string {
  return `${base.seed}|${base.lineage?.id ?? ''}|${base.season.year}.${base.season.slotIndex}.${base.season.complete ? 1 : 0}|exp${index}`;
}

/** First season whose end is recorded by an experiment started from `base`. */
export const firstExperimentYear = (base: World) => base.season.complete ? base.season.year + 1 : base.season.year;

/** Run one experiment fork. Deterministic for a given base world, index and horizon. */
export function runExperiment(base: World, index: number, seasons: number): RunOutcome {
  const w = cloneWorld(base);
  w.rng = Rng.fromSeed(runSeedLabel(base, index)).state();
  // Storage level only changes what history keeps, never the simulation itself (tested), so runs use the
  // cheapest level.
  w.settings = { ...w.settings, storage: 'essential' };
  resetRuntime(w);
  simulate(w, absoluteTarget(w, { kind: 'seasons', n: seasons }));
  const country = COUNTRIES[w.country];
  const first = firstExperimentYear(base);
  const nC = w.clubs.length, nL = country.leagues.length, cupIds = country.cups.map(c => c.id), nK = cupIds.length;
  const leagueIdx = new Map(country.leagues.map((l, i) => [l.id, i]));
  const clubIdx = new Map(w.clubs.map((c, i) => [c.id, i]));
  const H = w.history;
  const ks = H.snapshots.map((s, k) => [s.year, k] as const).filter(([y]) => y >= first).map(([, k]) => k);
  const out: RunOutcome = {
    index, years: ks.map(k => H.snapshots[k].year),
    pyramid: new Int16Array(ks.length * nC), league: new Int8Array(ks.length * nC), moved: new Int8Array(ks.length * nC),
    champions: new Int16Array(ks.length * nL).fill(-1), cups: new Int16Array(ks.length * nK).fill(-1),
  };
  ks.forEach((k, s) => {
    const snap = H.snapshots[k];
    for (let i = 0; i < nC; i++) { out.pyramid[s * nC + i] = snap.pyramid[i]; out.league[s * nC + i] = leagueIdx.get(snap.league[i]) ?? -1; }
    for (const lr of H.leagues[k]) {
      const l = leagueIdx.get(lr.league);
      if (l !== undefined) out.champions[s * nL + l] = clubIdx.get(lr.champion) ?? -1;
      for (const id of lr.promoted) { const i = clubIdx.get(id); if (i !== undefined) out.moved[s * nC + i] = 1; }
      for (const id of lr.relegated) { const i = clubIdx.get(id); if (i !== undefined) out.moved[s * nC + i] = -1; }
    }
    for (const cr of H.cups[k] ?? []) { const j = cupIds.indexOf(cr.cup); if (j >= 0) out.cups[s * nK + j] = clubIdx.get(cr.winner) ?? -1; }
  });
  return out;
}

export interface ClubOdds {
  id: string;
  /** Share of runs in which the club wins at least one top-flight title / each cup. */
  title: number; titlesMean: number; cup: Record<string, number>;
  /** Share of runs in which the club is relegated / promoted at least once. */
  relegated: number; promoted: number;
  /** Share of runs in which the club plays in each league (league order) in the season after the horizon. */
  endLeague: number[];
  /** Final pyramid position: mean and 10th/50th/90th percentiles across runs. */
  endMean: number; endP10: number; endP50: number; endP90: number;
  /** Share of runs with at least one top-four finish in the top flight. */
  top4: number;
}

export interface ExperimentSummary {
  runs: number; seasons: number; years: number[];
  firstYear: number; leagues: string[]; cups: string[];
  /** Interventions in the base world when the experiment was run (for before/after comparisons). */
  interventions: number;
  /** Where the experiment starts and its random-stream key (two summaries with the same key share streams). */
  key: string;
  clubs: ClubOdds[];
  /** Most frequent top-flight champions per season. */
  champions: { year: number; top: { id: string; p: number }[] }[];
}

/** Summarise run outcomes (in any order) for a base world. */
export function summarise(base: World, outcomes: RunOutcome[]): ExperimentSummary {
  const country = COUNTRIES[base.country];
  const nC = base.clubs.length, nL = country.leagues.length, cupIds = country.cups.map(c => c.id), nK = cupIds.length;
  const R = outcomes.length;
  const S = Math.min(...outcomes.map(o => o.years.length));
  const years = outcomes[0]?.years.slice(0, S) ?? [];
  const clubs: ClubOdds[] = base.clubs.map((c, i) => {
    let title = 0, titles = 0, rel = 0, pro = 0, top4 = 0;
    const cup = new Array(nK).fill(0), endL = new Array(nL).fill(0), ends: number[] = [];
    for (const o of outcomes) {
      let t = 0, r = false, p = false, f4 = false;
      const won = new Array(nK).fill(false);
      for (let s = 0; s < S; s++) {
        if (o.champions[s * nL] === i) t++;
        for (let k = 0; k < nK; k++) if (o.cups[s * nK + k] === i) won[k] = true;
        if (o.league[s * nC + i] === 0 && o.pyramid[s * nC + i] <= 4) f4 = true;
        const m = o.moved[s * nC + i];
        if (m < 0) r = true; else if (m > 0) p = true;
      }
      if (t) title++;
      titles += t; if (r) rel++; if (p) pro++; if (f4) top4++;
      won.forEach((w, k) => { if (w) cup[k]++; });
      // League for the season after the horizon (after the final promotions and relegations).
      endL[Math.max(0, Math.min(nL - 1, o.league[(S - 1) * nC + i] - o.moved[(S - 1) * nC + i]))]++;
      ends.push(o.pyramid[(S - 1) * nC + i]);
    }
    ends.sort((a, b) => a - b);
    const q = (p: number) => ends.length ? ends[Math.min(ends.length - 1, Math.max(0, Math.round((ends.length - 1) * p)))] : NaN;
    return {
      id: c.id, title: title / R, titlesMean: titles / R, cup: Object.fromEntries(cupIds.map((id, k) => [id, cup[k] / R])),
      relegated: rel / R, promoted: pro / R, endLeague: endL.map(x => x / R),
      endMean: ends.reduce((a, b) => a + b, 0) / Math.max(1, ends.length), endP10: q(0.1), endP50: q(0.5), endP90: q(0.9), top4: top4 / R,
    };
  });
  const champions = years.map((year, s) => {
    const n = new Map<number, number>();
    for (const o of outcomes) { const c = o.champions[s * nL]; if (c >= 0) n.set(c, (n.get(c) ?? 0) + 1); }
    return { year, top: [...n].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, k]) => ({ id: base.clubs[c].id, p: k / R })) };
  });
  return {
    runs: R, seasons: S, years, firstYear: firstExperimentYear(base), leagues: country.leagues.map(l => l.id), cups: cupIds,
    interventions: base.interventions.length, key: runSeedLabel(base, 0).replace(/\|exp0$/, ''), clubs, champions,
  };
}

/** Pyramid-position percentiles of one club per season (for fan charts). */
export function clubFan(base: World, outcomes: RunOutcome[], clubId: string): { year: number; p10: number; p25: number; p50: number; p75: number; p90: number }[] {
  const i = base.clubs.findIndex(c => c.id === clubId), nC = base.clubs.length;
  const S = Math.min(...outcomes.map(o => o.years.length));
  if (i < 0 || !outcomes.length) return [];
  return outcomes[0].years.slice(0, S).map((year, s) => {
    const v = outcomes.map(o => o.pyramid[s * nC + i]).sort((a, b) => a - b);
    const q = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * p)))];
    return { year, p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9) };
  });
}
