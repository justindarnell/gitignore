import type { Runtime } from './runtime.ts';
import type { World } from './types.ts';
import { chooseEvent, type EventContext } from './events.ts';
import { addEvent, pushNews } from './history.ts';

const AMBITION_NOISE = 0.05;
/** Reputation span over which the relative ownership effect fades out below ambRepRef. */
const AMB_HEAD_SPAN = 35;
/** Takeover/sell-off text by tone (shown in timelines and news). */
const TAKEOVER_TEXT = 'Takeover: new owners arrive with major investment plans';
const SELLOFF_TEXT = 'Sold to new owners who strip assets and cut spending';

/**
 * End-of-season club development. Squad quality Q (mean of attack/midfield/defence) moves by
 *
 *   dQ = revert * (T - Q)                 pull toward a structural target (faster when below it)
 *      + era                              persistent multi-year development cycle (AR(1))
 *      + perfEffect * surprise            limited reward for beating expectations
 *      + qualityNoise * N(0,1)            idiosyncratic squad change
 *      + promotion / relegation shocks    relegation softened by stability
 *      - title drain, - ceiling upkeep    championship renewal costs, diminishing returns at the top
 *      + random events
 *
 * Ownership ambition A (-1 asset-stripping .. +1 wealthy takeover) is a slow latent trait:
 *   A' = ambPersist * A + small noise, with occasional ownership changes (takeovers set A high,
 *   sell-offs to asset-strippers set it low). It shifts the structural target and the upkeep
 *   ceiling by ambTarget * A, scales promotion investment by (1 + ambPromo * A), and widens
 *   only the UPSIDE of development shocks for ambitious owners (ambUpside). Negative ambition
 *   also erodes stability.
 *
 * where the target T = repWeight * reputation + (1 - repWeight) * economics, and economics
 * blends the next division's average level with the level of the club's own finishing rank.
 * Both come from a FIXED economic level curve (the 2026 rating of each pyramid rank),
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
    // Revenue level for next season: blend of the division average and the club's own rank
    // (promoted clubs arrive at the bottom of the new division, relegated clubs at the top
    // of the lower one, i.e. with parachute money).
    const newRank = newL === oldL ? offset[oldL] + pos : promoted ? offset[newL] + size[newL] : offset[newL] + 1;
    const rankLevel = world.levelCurve[Math.min(newRank - 1, world.levelCurve.length - 1)];
    const econ = (1 - p.rankEconomics) * divLevel[newL] + p.rankEconomics * rankLevel;
    // ---- Ownership ambition: slow drift plus occasional ownership changes. The draws are made
    // for every club every season, so the random stream does not depend on the parameters.
    c.ambition = clamp(p.ambPersist * (c.ambition ?? 0) + AMBITION_NOISE * rng.normal(), -1, 1);
    const uOwner = rng.next(), uKind = rng.next(), uSize = rng.next();
    let ownerChange: 1 | -1 | 0 = 0;
    if (uOwner < p.ownerEventRate) {
      // Buyers favour clubs whose standing exceeds their current level (fallen big clubs) and
      // rescue clubs run down by previous owners; relegation and turmoil invite asset-strippers.
      const attract = clamp((c.reputation - achieved) / 10, -1, 1);
      // Big clubs attract wealthy buyers; asset-strippers mostly target smaller clubs.
      const size = clamp((c.reputation - 55) / 35, -0.5, 1);
      const pTake = clamp(0.5 + 0.2 * attract + 0.25 * size + (c.ambition < -0.3 ? 0.2 : 0) - (relegated ? 0.15 : 0) - (c.stability < 30 ? 0.1 : 0), 0.15, 0.92);
      ownerChange = uKind < pTake ? 1 : -1;
      c.ambition = ownerChange > 0 ? 0.5 + 0.5 * uSize : -0.45 - 0.5 * uSize;
      c.ownerSince = s.year + 1;
    }
    const amb = c.ambition;
    // 0.7 relative ownership: owners decide how far the squad sits from what the club's standing
    // supports. The effect scales with the club's headroom below the elite (reputation
    // ambRepRef and above: none), so established giants are shielded both from sell-offs and
    // from takeovers changing much, while funded smaller clubs can rise far above their level.
    const head = clamp((p.ambRepRef - c.reputation) / AMB_HEAD_SPAN, 0, 1);
    const own = head * (p.ambLift * Math.max(0, amb) + p.ambDrop * Math.min(0, amb));
    const T = p.repWeight * c.reputation + (1 - p.repWeight) * econ + p.ambTarget * amb + own;
    // Development cycles: stable institutions swing less; promotion brings momentum; ambitious
    // owners skew the shock toward the upside (a big spending spree can transform a club) while
    // keeping its mean: z + u * (max(z, 0) - E[max(z, 0)]), E[max(z, 0)] = 1/sqrt(2 pi).
    const damp = clamp(1 + p.stabilityDamping * (0.5 - c.stability / 100), 0.3, 1.7);
    const z0 = rng.normal();
    const z = z0 + p.ambUpside * Math.max(0, amb) * (Math.max(0, z0) - 0.3989);
    c.era = p.eraPersist * c.era + p.eraSD * damp * z + (promoted ? p.promoEra : relegated ? -p.promoEra : 0);
    // Clubs below their structural level recover faster than over-achievers regress.
    const pull = p.revert * (Q < T ? p.recoverBoost : 1);
    let dQ = pull * (T - Q) + c.era + p.perfEffect * surprise + p.qualityNoise * rng.normal();
    // Promotion investment varies by club: ambitious owners spend, cautious ones bank the money.
    if (promoted) dQ += p.promoBoost * Math.max(0, 1 + p.promoVar * rng.normal() + p.ambPromo * amb);
    if (relegated) dQ -= p.relegHit * clamp(1.25 - c.stability / 100, 0.3, 1.2);
    c.fatigue *= p.fatigueDecay;
    if (c.id === championOfTop) {
      // Consecutive titles make renewal progressively harder (no hard cap on streaks).
      let streak = 0;
      for (let k = world.history.leagues.length - 1; k >= 0 && world.history.leagues[k][0].champion === c.id; k--) streak++;
      c.fatigue += p.fatigueTitle + p.fatigueStreak * Math.max(0, streak - 1);
      dQ -= p.fatigueQuality;
    }
    const ceiling = p.ceiling + p.ambTarget * Math.max(0, amb) + Math.max(0, own);
    if (Q > ceiling) dQ -= p.ceilingCost * (Q - ceiling);

    // ---- Ownership changes are reported; asset-stripping erodes institutional stability.
    let dStab = 2.5 * Math.min(0, amb) + (ownerChange > 0 ? -2 : ownerChange < 0 ? -6 : 0);
    if (ownerChange) {
      addEvent(world, c.id, ownerChange > 0 ? TAKEOVER_TEXT : SELLOFF_TEXT, 'owner', ownerChange);
      if (c.reputation >= 60 || tierOf[newL] <= 3) {
        const nm = world.info[c.id].short;
        pushNews(world, { date, kind: 'owner', clubs: [c.id], importance: c.reputation >= 80 ? 4 : tierOf[newL] <= 2 ? 3 : 2,
          text: ownerChange > 0 ? `${nm} taken over: new owners promise major investment.` : `${nm} sold to owners intent on cutting costs; supporters fear asset-stripping.` });
      }
    }

    // ---- Random events
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
