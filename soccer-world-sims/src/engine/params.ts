import type { Settings } from './types.ts';

/**
 * Engine parameters. DEFAULT_PARAMS holds the calibrated model selected by the
 * calibration framework (tools/calibrate, docs/CALIBRATION.md). User settings act as
 * multipliers on top of these values; 1.0 everywhere reproduces the calibrated model.
 */
export interface EngineParams {
  // ---- match model
  ratingLog: number;        // log-goals per rating point (fixed by the club database fit)
  strength: number;         // multiplier on rating differences (1 = fitted spread)
  midfieldWeight: number;   // share of midfield in attack/defence power
  baseGoals: number;        // log expected goals of an away side at equal ratings
  homeAdv: number;          // log home advantage
  dcRho: number;            // Dixon-Coles low-score dependence (negative = more 0-0/1-1)
  matchNoise: number;       // SD of per-match log-lambda shock (upsets)
  etGoalFactor: number;     // expected goals in 30 min extra time relative to 90 min
  penaltyRate: number;      // shoot-out conversion probability
  rotationPenalty: number;  // rating points a much stronger club loses through cup rotation
  // ---- seasonal performance
  seasonSD: number;         // SD of each club's seasonal offset (rating points)
  formSD: number;           // per-match innovation of in-season form
  formPersist: number;      // AR(1) persistence of form per match
  initialFormWeight: number;// rating points for formEstimate 80 (vs 50) at the start
  // ---- long-term evolution
  revert: number;           // pull toward structural target per season
  repWeight: number;        // weight of reputation (vs division economics) in the target
  eraPersist: number;       // persistence of multi-year development cycles
  eraSD: number;            // innovation SD of development cycles
  qualityNoise: number;     // idiosyncratic yearly squad change
  perfEffect: number;       // rating points per unit of performance-vs-expectation
  promoBoost: number;       // one-off investment on promotion
  relegHit: number;         // one-off loss on relegation (scaled down by stability)
  fatigueTitle: number;     // temporary performance penalty after a title
  fatigueDecay: number;     // yearly decay of accumulated fatigue
  fatigueQuality: number;   // permanent squad drain after a title (poaching, renewal)
  ceiling: number;          // rating above which upkeep becomes increasingly costly
  ceilingCost: number;
  repRate: number;          // speed at which reputation follows achievement
  repDecayFactor: number;   // relative speed of reputation loss vs gain (<1 = sticky)
  repTitleBonus: number;    // reputation bonus for a league title (top tier)
  stabRate: number;         // reversion speed of stability to its anchor
  eventRate: number;        // probability of a notable event per club-season
  eventScale: number;       // magnitude multiplier for event effects
}

export const DEFAULT_PARAMS: EngineParams = {
  ratingLog: 0.035,
  strength: 1.0,
  midfieldWeight: 0.25,
  baseGoals: 0.19,
  homeAdv: 0.22,
  dcRho: -0.06,
  matchNoise: 0.08,
  etGoalFactor: 0.3,
  penaltyRate: 0.76,
  rotationPenalty: 6,
  seasonSD: 1.8,
  formSD: 0.35,
  formPersist: 0.9,
  initialFormWeight: 1.0,
  revert: 0.12,
  repWeight: 0.5,
  eraPersist: 0.75,
  eraSD: 0.9,
  qualityNoise: 1.0,
  perfEffect: 1.2,
  promoBoost: 1.0,
  relegHit: 1.5,
  fatigueTitle: 1.5,
  fatigueDecay: 0.5,
  fatigueQuality: 0.5,
  ceiling: 86,
  ceilingCost: 0.15,
  repRate: 0.08,
  repDecayFactor: 0.7,
  repTitleBonus: 3,
  stabRate: 0.08,
  eventRate: 0.12,
  eventScale: 1.0,
};

export const DEFAULT_SETTINGS: Settings = {
  realism: 1, upsets: 1, homeAdvantage: 1, seasonalVariability: 1, growth: 1,
  events: 1, relegationImpact: 1, reputationProtection: 1, championshipFatigue: 1,
  storage: 'standard',
};

/** Combine calibrated parameters with user settings (all settings neutral at 1). */
export function effectiveParams(base: EngineParams, s: Settings): EngineParams {
  return {
    ...base,
    strength: base.strength * (0.6 + 0.4 * s.realism),
    matchNoise: base.matchNoise * s.upsets + (s.upsets > 1 ? 0.06 * (s.upsets - 1) : 0),
    homeAdv: base.homeAdv * s.homeAdvantage,
    seasonSD: base.seasonSD * s.seasonalVariability,
    eraSD: base.eraSD * s.growth,
    qualityNoise: base.qualityNoise * s.growth,
    perfEffect: base.perfEffect * s.growth,
    eventRate: base.eventRate * s.events,
    relegHit: base.relegHit * s.relegationImpact,
    repWeight: Math.min(0.95, base.repWeight * s.reputationProtection),
    repDecayFactor: Math.min(1, base.repDecayFactor / Math.max(0.25, s.reputationProtection)),
    fatigueTitle: base.fatigueTitle * s.championshipFatigue,
    fatigueQuality: base.fatigueQuality * s.championshipFatigue,
  };
}

/** Named presets offered in the UI. */
export const PRESETS: Record<string, { label: string; description: string; settings: Partial<Settings> }> = {
  historical: { label: 'Historical (default)', description: 'Calibrated against English football history.', settings: {} },
  dynamic: { label: 'Dynamic', description: 'More movement: faster rises and falls, more upsets.', settings: { upsets: 1.3, seasonalVariability: 1.25, growth: 1.3, events: 1.5, reputationProtection: 0.8 } },
  chaotic: { label: 'Chaotic', description: 'Anything can happen. Not historically realistic.', settings: { realism: 0.6, upsets: 1.8, seasonalVariability: 1.8, growth: 1.8, events: 2.5, reputationProtection: 0.5, relegationImpact: 1.5 } },
  stable: { label: 'Stable', description: 'Established clubs stay strong for longer.', settings: { growth: 0.7, events: 0.6, reputationProtection: 1.4, seasonalVariability: 0.85 } },
};
