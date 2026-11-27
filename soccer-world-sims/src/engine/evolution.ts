import type { Runtime } from './runtime.ts';
import type { World } from './types.ts';
import { chooseEvent, type EventContext } from './events.ts';
import { addEvent, pushNews } from './history.ts';

/**
 * End-of-season club development. Squad quality Q (mean of attack/midfield/defence) moves by
 *
 *   dQ = revert * (T - Q)                 pull toward a structural target
 *      + era                              persistent multi-year development cycle (AR(1))
 *      + perfEffect * surprise            limited reward for beating expectations
 *      + qualityNoise * N(0,1)            idiosyncratic squad change
 *      + promotion / relegation shocks    relegation softened by stability
 *      - title drain, - ceiling upkeep    championship renewal costs, diminishing returns at the top
 *      + random events
 *
 * where the target T = repWeight * reputation + (1 - repWeight) * divisionLevel(next league).
 * divisionLevel comes from a FIXED economic level curve (the 2026 rating of each pyramid rank),
 * so money follows the division a club plays in, while reputation provides slowly-changing
 * institutional pull. Success therefore helps (reputation, revenue) but every channel is
 * bounded and mean-reverting: there is no permanent winner-stays-winner feedback loop.
 */
export function evolveClubs(world: World, rt: Runtime): void {
  const p = rt.params, rng = rt.rng, s = world.season;
  const leagues = rt.country.leagues;
  const rec = world.history.leagues[world.history.leagues.length - 1];
  const cups = world.history.cups[world.history.cups.length - 1] ?? [];
  const offset: Record<string, number> = {}, divLevel: Record<string, number> = {}, tierOf: Record<string, number> = {}, size: Record<string, number> = {};
  let off = 0;
  for (const l of leagues) {
    offset[l.id] = off; tierOf[l.id] = l.tier; size[l.id] = l.size;
    let sum = 0;
    for (let r = off; r < off + l.size; r++) sum += world.levelCurve[Math.min(r, world.levelCurve.length - 1)];
    divLevel[l.id] = sum / l.size;
    off += l.size;
  }
  const posIn: Record<string, number> = {};
  for (const lr of rec) lr.table.forEach((r, i) => { posIn[r.club] = i + 1; });
  const championOfTop = rec[0].champion;
  const date = s.calendar[s.calendar.length - 1].date;
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

  for (const c of world.clubs) {
    const oldL = c.league, newL = s.movements![c.id];
    const pos = posIn[c.id], n = size[oldL];
    const exp = s.expected[oldL].indexOf(c.id) + 1;
    const surprise = (exp - pos) / (n - 1);
    const Q = (c.attack + c.midfield + c.defence) / 3;
    const promoted = tierOf[newL] < tierOf[oldL], relegated = tierOf[newL] > tierOf[oldL];

    // ---- Reputation follows achievement slowly (and falls more slowly than it rises).
    let honours = 0;
    if (c.id === championOfTop) honours += p.repTitleBonus;
    for (const cr of cups) if (cr.winner === c.id) honours += 1.5 * (rt.country.cups.find(x => x.id === cr.cup)?.prestige ?? 1);
    const achieved = world.levelCurve[Math.min(offset[oldL] + pos - 1, world.levelCurve.length - 1)] + honours;
    const rate = p.repRate * (achieved >= c.reputation ? 1 : p.repDecayFactor);
    c.reputation = clamp(c.reputation + rate * (achieved - c.reputation), 1, 99);

    // ---- Squad quality
    const T = p.repWeight * c.reputation + (1 - p.repWeight) * divLevel[newL];
    c.era = p.eraPersist * c.era + p.eraSD * rng.normal();
    let dQ = p.revert * (T - Q) + c.era + p.perfEffect * surprise + p.qualityNoise * rng.normal();
    if (promoted) dQ += p.promoBoost;
    if (relegated) dQ -= p.relegHit * clamp(1.25 - c.stability / 100, 0.3, 1.2);
    c.fatigue *= p.fatigueDecay;
    if (c.id === championOfTop) { c.fatigue += p.fatigueTitle; dQ -= p.fatigueQuality; }
    if (Q > p.ceiling) dQ -= p.ceilingCost * (Q - p.ceiling);

    // ---- Random events
    let dStab = 0;
    if (p.eventRate > 0 && rng.next() < p.eventRate * (1 + (50 - c.stability) / 200)) {
      const ctx: EventContext = { tier: tierOf[newL], reputation: c.reputation, stability: c.stability, surprise, declining: c.era < -0.5, relegated, promoted };
      const ev = chooseEvent(ctx, rng.next());
      const scale = p.eventScale * (ev.tone < 0 ? clamp(1.3 - c.stability / 100, 0.4, 1.2) : 1);
      const e = ev.effect;
      dQ += (e.quality ?? 0) * scale;
      c.era += (e.era ?? 0) * scale;
      dStab += (e.stability ?? 0) * scale;
      c.reputation = clamp(c.reputation + (e.reputation ?? 0) * scale, 1, 99);
      c.carry += (e.carry ?? 0) * scale;
      addEvent(world, c.id, ev.text, 'event', ev.tone);
      if (c.reputation >= 70 || tierOf[newL] <= 2) {
        pushNews(world, { date, kind: 'event', clubs: [c.id], importance: c.reputation >= 80 ? 3 : 2, text: `${world.info[c.id].short}: ${ev.text.toLowerCase()}.` });
      }
    }

    // ---- Apply to attributes (style deviations drift and slowly revert to balance)
    for (const k of ['attack', 'midfield', 'defence'] as const) {
      const dev = c[k] - Q;
      c[k] = clamp(Q + dQ + 0.92 * dev + 0.5 * rng.normal(), 5, 99);
    }

    // ---- Stability: slow-moving institutional strength
    c.stability = clamp(c.stability + p.stabRate * (c.stabilityAnchor - c.stability) + 2 * surprise + (promoted ? 1 : 0) - (relegated ? 3 : 0) + rng.normal() + dStab, 5, 95);
    c.stabilityAnchor += 0.03 * (c.stability - c.stabilityAnchor);
  }
}
