/**
 * Random club events. Each event nudges specific attributes by moderate amounts; negative
 * effects are softened by institutional stability. Probabilities depend on circumstances
 * (e.g. key departures are likelier after over-achievement; rebuilding after decline).
 */
export interface EventContext {
  tier: number;            // tier for next season
  reputation: number;
  stability: number;
  surprise: number;        // performance vs expectation last season (-1..1)
  declining: boolean;      // development momentum negative
  relegated: boolean;
  promoted: boolean;
}

export interface EventEffect {
  quality?: number;        // immediate squad-quality change (rating points)
  era?: number;            // change to development momentum
  stability?: number;
  reputation?: number;
  carry?: number;          // next-season temporary performance shift
}

export interface EventDef {
  id: string;
  tone: 1 | -1;
  text: string;
  weight: (c: EventContext) => number;
  effect: EventEffect;
}

export const EVENTS: EventDef[] = [
  { id: 'youth', tone: 1, text: 'Successful youth intake', weight: () => 1.0, effect: { quality: 0.8, era: 0.5 } },
  { id: 'recruitment', tone: 1, text: 'Recruitment breakthrough', weight: () => 1.0, effect: { quality: 2.0 } },
  { id: 'investment', tone: 1, text: 'New ownership investment', weight: c => (c.reputation < 85 ? 0.9 : 0.3) * (c.tier >= 2 ? 1.2 : 1), effect: { quality: 1.5, era: 0.9, stability: 4 } },
  { id: 'development', tone: 1, text: 'Exceptional development period', weight: () => 0.7, effect: { era: 1.2, quality: 0.5 } },
  { id: 'rebuild', tone: 1, text: 'Successful rebuilding period', weight: c => (c.declining || c.relegated ? 1.4 : 0.2), effect: { era: 1.1, stability: 3 } },
  { id: 'financial', tone: -1, text: 'Financial difficulties', weight: c => (c.relegated ? 1.6 : 0.8) * (1.4 - c.stability / 100), effect: { quality: -2.0, era: -0.5, stability: -6 } },
  { id: 'departures', tone: -1, text: 'Key squad departures', weight: c => 0.8 + Math.max(0, c.surprise) * 1.5, effect: { quality: -2.0 } },
  { id: 'coaching', tone: -1, text: 'Coaching instability', weight: c => 1.0 * (1.3 - c.stability / 100), effect: { carry: -1.2, stability: -4 } },
  { id: 'failed-recruitment', tone: -1, text: 'Failed recruitment strategy', weight: () => 0.8, effect: { quality: -1.5, era: -0.4 } },
  { id: 'crisis', tone: -1, text: 'Institutional crisis', weight: c => 0.25 * (1.5 - c.stability / 100), effect: { quality: -3.0, era: -0.8, stability: -12, reputation: -1.5 } },
];

export function chooseEvent(c: EventContext, u: number): EventDef {
  const ws = EVENTS.map(e => Math.max(0, e.weight(c)));
  let t = u * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < EVENTS.length; i++) { t -= ws[i]; if (t <= 0) return EVENTS[i]; }
  return EVENTS[EVENTS.length - 1];
}
