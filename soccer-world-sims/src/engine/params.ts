import type { Settings } from './types.ts';

/**
 * Engine parameters. DEFAULT_PARAMS holds the calibrated model selected by the
 * calibration framework (tools/calibrate, docs/CALIBRATION.md): the 0.5 model (finalist 1 of the
 * second holdout validation, calibration/results/validate.json) plus 0.7 relative ownership
 * (finalist 1 of calibration/results/own-validate.json, adopted on the fresh holdout4- seeds, which
 * also re-tuned promoBoost, relegHit, revert, eraSD, promoEra, repWeight, rankEconomics, ceiling and
 * ceilingCost). User settings act as multipliers on top of these values; 1.0 everywhere reproduces
 * the calibrated model.
 */
export interface EngineParams {
  // ---- match model
  ratingLog: number;        // log-goals per rating point (fixed by the club database fit)
  strength: number;         // multiplier on rating differences (1 = fitted spread)
  midfieldWeight: number;   // share of midfield in attack/defence power
  baseGoals: number;        // log expected goals of an away side at equal ratings
  homeAdv: number;          // log home advantage
  dcRho: number;            // Dixon-Coles low-score dependence (negative = more 0-0/1-1)
  lambdaSoft: number;       // expected goals above which returns diminish (score effects)
  lambdaSpan: number;       // extra expected goals possible beyond lambdaSoft (asymptote = soft + span)
  matchNoise: number;       // SD of per-match log-lambda shock (upsets)
  etGoalFactor: number;     // expected goals in 30 min extra time relative to 90 min
  penaltyRate: number;      // shoot-out conversion probability
  rotationPenalty: number;  // rating points a much stronger club loses through cup rotation
  // ---- seasonal performance
  seasonSD: number;         // SD of each club's seasonal offset (rating points)
  seasonPersist: number;    // share of last season's over/under-performance that persists
  formSD: number;           // per-match innovation of in-season form
  formPersist: number;      // AR(1) persistence of form per match
  initialFormWeight: number;// rating points for formEstimate 80 (vs 50) at the start
  // ---- long-term evolution
  revert: number;           // pull toward structural target per season
  recoverBoost: number;     // multiplier on revert when a club is BELOW its target (recovery)
  stabilityDamping: number; // how much stability shrinks development swings (0 = none)
  promoEra: number;         // development momentum gained on promotion / lost on relegation
  repWeight: number;        // weight of reputation (vs division economics) in the target
  rankEconomics: number;    // 0 = revenue by division only, 1 = by finishing rank (merit/parachute)
  eraPersist: number;       // persistence of multi-year development cycles
  eraSD: number;            // innovation SD of development cycles
  qualityNoise: number;     // idiosyncratic yearly squad change
  perfEffect: number;       // rating points per unit of performance-vs-expectation
  promoBoost: number;       // one-off investment on promotion
  relegHit: number;         // one-off loss on relegation (scaled down by stability)
  fatigueTitle: number;     // temporary performance penalty after a title
  fatigueDecay: number;     // yearly decay of accumulated fatigue
  fatigueStreak: number;    // extra fatigue per consecutive title beyond the first (renewal gets harder)
  promoVar: number;         // variability of promotion investment (0 = every club invests equally)
  fatigueQuality: number;   // permanent squad drain after a title (poaching, renewal)
  ceiling: number;          // rating above which upkeep becomes increasingly costly
  ceilingCost: number;
  repRate: number;          // speed at which reputation follows achievement
  repDecayFactor: number;   // relative speed of reputation loss vs gain (<1 = sticky)
  repTitleBonus: number;    // reputation bonus for a league title (top tier)
  stabRate: number;         // reversion speed of stability to its anchor
  eventRate: number;        // probability of a notable event per club-season
  eventScale: number;       // magnitude multiplier for event effects
  // ---- ownership ambition (latent club trait, -1 asset-stripping .. +1 wealthy takeover)
  ambPersist: number;       // yearly persistence of ambition (owners' appetite fades or is renewed)
  ambTarget: number;        // rating points added to the structural target (and upkeep ceiling) at ambition +1
  ambPromo: number;         // relative change of promotion investment per unit of ambition
  ambUpside: number;        // extra upside of positive development shocks at ambition +1
  ownerEventRate: number;   // probability of an ownership change (takeover or sell-off) per club-season
  // ---- 0.7 relative ownership: effects scale with headroom below the elite (giants are shielded)
  ambLift: number;          // rating points a fully ambitious owner adds to the target of a club with full headroom
  ambDrop: number;          // rating points asset-stripping (ambition -1) removes from the target of a club with full headroom
  ambRepRef: number;        // reputation at and above which ownership no longer shifts the target (headroom 0)
  // ---- 0.7 economic path of historical starts (only for worlds with a levelPath, e.g. the 1992/93 start)
  levelPathAmount: number;  // share of the way from the start's economic curve to the target curve reached at the end
  // ---- 0.7 administration (src/engine/administration.ts)
  adminRate: number;        // base probability per club-season (tier 3, average risk): ~1 administration per season at setting 100%
  adminAmb: number;         // log-risk per unit of negative ownership ambition (asset-stripping)
  adminStab: number;        // log-risk per 20 points of stability below 45
  adminReleg: number;       // log-risk added in the season after a relegation
  adminSquad: number;       // mean rating points lost in the fire sale (uniform 0.5x..1.5x)
  adminStability: number;   // stability lost
  levelPathShape: number;   // timing exponent: 1 = linear, >1 = late divergence, <1 = early divergence, 0 = from the first season
}

export const DEFAULT_PARAMS: EngineParams = {
  ratingLog: 0.035,
  strength: 1.1011,
  midfieldWeight: 0.25,
  baseGoals: 0.14,
  homeAdv: 0.22,
  dcRho: -0.1,
  lambdaSoft: 2.5,
  lambdaSpan: 2.0,
  matchNoise: 0.0373,
  etGoalFactor: 0.3,
  penaltyRate: 0.76,
  rotationPenalty: 6,
  seasonSD: 2.0043,
  seasonPersist: 0.1385,
  formSD: 0.35,
  formPersist: 0.9,
  initialFormWeight: 1,
  revert: 0.1403,
  recoverBoost: 1.0272,
  stabilityDamping: 1.0083,
  promoEra: 0.4541,
  repWeight: 0.59,
  rankEconomics: 0.8724,
  eraPersist: 0.7282,
  eraSD: 0.8346,
  qualityNoise: 0.3804,
  perfEffect: 0.0234,
  promoBoost: 2.0071,
  relegHit: 4.0147,
  fatigueTitle: 0.893,
  fatigueDecay: 0.5,
  fatigueStreak: 1.4665,
  promoVar: 0,
  fatigueQuality: 0.2999,
  ceiling: 91.4192,
  ceilingCost: 0.1829,
  repRate: 0.0388,
  repDecayFactor: 1,
  repTitleBonus: 3,
  stabRate: 0.08,
  eventRate: 0.1589,
  eventScale: 1,
  ambPersist: 0.8309,
  ambTarget: 0,
  ambPromo: 1.1449,
  ambUpside: 1.3909,
  ownerEventRate: 0.0278,
  ambLift: 1.8291,
  ambDrop: 7.515,
  ambRepRef: 81.4162,
  // 0.7 goal 4 (calibration/results/start92-validate.json): 1992/93 worlds take the fitted 2025/26 economic
  // structure from their first season (amount 1, shape 0); the timing could not be identified from 1992-2008.
  levelPathAmount: 1,
  levelPathShape: 0,
  adminRate: 0.0112,
  adminAmb: 1.5,
  adminStab: 1,
  adminReleg: 0.7,
  adminSquad: 3,
  adminStability: 12,
};

/**
 * The 0.6 shipped model, as overrides of DEFAULT_PARAMS: the values 0.7 re-tuned, with ownership off.
 * Saves from before 0.7 keep their stored parameters; this is the baseline of the 0.7 search and validation.
 */
export const MODEL_06: Partial<EngineParams> = {
  revert: 0.1356, promoEra: 0.3686, repWeight: 0.5822, rankEconomics: 0.8695, eraSD: 0.8359, promoBoost: 2.1842, relegHit: 4.0939,
  ceiling: 91.2541, ceilingCost: 0.1973, ambPersist: 0.9, ambTarget: 0, ambPromo: 0, ambUpside: 0, ownerEventRate: 0, ambLift: 0, ambDrop: 0, ambRepRef: 90,
};

/** The ownership-ambition mechanism switched off (the pre-0.6 model, used as a calibration baseline). */
export const AMBITION_OFF: Partial<EngineParams> = { ambTarget: 0, ambPromo: 0, ambUpside: 0, ownerEventRate: 0, ambLift: 0, ambDrop: 0 };

/**
 * The 0.6 experimental ownership dynamics (not adopted, see docs/CALIBRATION.md). Only used to migrate
 * saves from before 0.7, whose `ownership` setting added k x these values on top of their parameters.
 */
export const OWNERSHIP_EXPERIMENTAL_06 = { ambPersist: 0.8797, ambTarget: 6.842, ambPromo: 1.0836, ambUpside: 1.8888, ownerEventRate: 0.0202 };

/** Display bands for the ambition trait. */
export function ambitionLabel(a: number): 'Wealthy & ambitious' | 'Steady' | 'Cautious' | 'Asset-stripping' {
  return a >= 0.4 ? 'Wealthy & ambitious' : a >= -0.15 ? 'Steady' : a >= -0.55 ? 'Cautious' : 'Asset-stripping';
}

export const DEFAULT_SETTINGS: Settings = {
  realism: 1, upsets: 1, homeAdvantage: 1, seasonalVariability: 1, growth: 1,
  events: 1, relegationImpact: 1, reputationProtection: 1, championshipFatigue: 1, ownership: 1, administration: 0,
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
    adminRate: base.adminRate * (s.administration ?? 1),
    ...ownershipParams(base, s.ownership ?? 1),
  };
}

/** The `ownership` setting scales every ownership effect (0 = owners never matter, 1 = calibrated). */
function ownershipParams(base: EngineParams, k: number): Partial<EngineParams> {
  if (k === 1) return {};
  return {
    ambTarget: base.ambTarget * k, ambLift: base.ambLift * k, ambDrop: base.ambDrop * k,
    ambPromo: base.ambPromo * k, ambUpside: base.ambUpside * k, ownerEventRate: base.ownerEventRate * k,
  };
}

/** Named presets offered in the UI. */
export const PRESETS: Record<string, { label: string; description: string; settings: Partial<Settings> }> = {
  historical: { label: 'Historical (default)', description: 'Calibrated against English football history.', settings: {} },
  dynamic: { label: 'Dynamic', description: 'More movement: faster rises and falls, more upsets, and clubs going into administration.', settings: { upsets: 1.3, seasonalVariability: 1.25, growth: 1.3, events: 1.5, reputationProtection: 0.8, administration: 1 } },
  chaotic: { label: 'Chaotic', description: 'Anything can happen. Not historically realistic.', settings: { realism: 0.6, upsets: 1.8, seasonalVariability: 1.8, growth: 1.8, events: 2.5, reputationProtection: 0.5, relegationImpact: 1.5, administration: 2 } },
  stable: { label: 'Stable', description: 'Established clubs stay strong for longer.', settings: { growth: 0.7, events: 0.6, reputationProtection: 1.4, seasonalVariability: 0.85 } },
};
