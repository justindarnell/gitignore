import type { Rng } from './rng.ts';
import type { EngineParams } from './params.ts';

/** Strength inputs for one side of a match (rating points). */
export interface Side {
  attack: number; midfield: number; defence: number;
  /** Temporary performance (season offset + form + context), added to both powers. */
  perf: number;
}

export interface ScoreResult { hg: number; ag: number; et?: boolean; pens?: [number, number] }

export function attackPower(s: Side, w: number): number { return (1 - w) * s.attack + w * s.midfield + s.perf; }
export function defencePower(s: Side, w: number): number { return (1 - w) * s.defence + w * s.midfield + s.perf; }

/**
 * Expected goals (Poisson means) for home and away sides.
 * log(lambda_home) = baseGoals + homeAdv + strength * ratingLog * (attH - defA)
 * The rating scale is the one fitted in tools/ratings/fit.mjs, so strength = 1 reproduces
 * the opposition-adjusted goal model fitted to 2022/23-2025/26 English league results.
 */
export function expectedGoals(home: Side, away: Side, p: EngineParams, neutral = false): [number, number] {
  const w = p.midfieldWeight, k = p.strength * p.ratingLog;
  const lh = Math.exp(p.baseGoals + (neutral ? 0 : p.homeAdv) + k * (attackPower(home, w) - defencePower(away, w)));
  const la = Math.exp(p.baseGoals + k * (attackPower(away, w) - defencePower(home, w)));
  return [Math.min(lh, 7), Math.min(la, 7)];
}

/**
 * Sample a 90-minute score. Independent Poisson goals with a per-match multiplicative
 * shock (upset noise) and a Dixon-Coles adjustment for low scores (applied by rejection).
 */
export function sampleScore(lh: number, la: number, p: EngineParams, rng: Rng): [number, number] {
  if (p.matchNoise > 0) {
    lh *= Math.exp(p.matchNoise * rng.normal() - 0.5 * p.matchNoise * p.matchNoise);
    la *= Math.exp(p.matchNoise * rng.normal() - 0.5 * p.matchNoise * p.matchNoise);
  }
  const rho = p.dcRho;
  const t00 = 1 - lh * la * rho, t01 = 1 + lh * rho, t10 = 1 + la * rho, t11 = 1 - rho;
  const tmax = Math.max(1, t00, t01, t10, t11);
  for (let guard = 0; guard < 64; guard++) {
    const x = rng.poisson(lh), y = rng.poisson(la);
    if (x > 1 || y > 1 || rho === 0) return [x, y];
    const t = x === 0 ? (y === 0 ? t00 : t01) : (y === 0 ? t10 : t11);
    if (rng.next() * tmax < Math.max(0, t)) return [x, y];
  }
  return [rng.poisson(lh), rng.poisson(la)];
}

export function sampleExtraTime(lh: number, la: number, p: EngineParams, rng: Rng): [number, number] {
  return [rng.poisson(lh * p.etGoalFactor), rng.poisson(la * p.etGoalFactor)];
}

/** Standard ABAB penalty shoot-out: best of five, then sudden death. */
export function shootout(p: EngineParams, rng: Rng): [number, number] {
  let a = 0, b = 0;
  for (let i = 0; i < 5; i++) {
    if (rng.next() < p.penaltyRate) a++;
    if (b + (5 - i) < a || a + (4 - i) < b) return [a, b];
    if (rng.next() < p.penaltyRate) b++;
    if (a + (4 - i) < b || b + (4 - i) < a) return [a, b];
  }
  for (let r = 0; r < 100; r++) {
    const x = rng.next() < p.penaltyRate ? 1 : 0, y = rng.next() < p.penaltyRate ? 1 : 0;
    a += x; b += y;
    if (x !== y) break;
  }
  if (a === b) a++; // practically unreachable safety net
  return [a, b];
}
