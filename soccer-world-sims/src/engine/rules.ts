// Dated rule changes. A CountryConfig may list `changes`: patches that take effect from a season
// (its starting year) onwards, e.g. the Premier League's cut from 22 to 20 clubs in 1995/96. The rules
// for any season are the base configuration with every change up to that season applied in order.
// League ids and order never change, so history, snapshots and club ids stay comparable across eras.
import type { CountryConfig, CupConfig, LeagueConfig } from './types.ts';

export interface RuleChange {
  /** First season (starting year) the change applies to. */
  from: number;
  /** Human-readable description (shown in the UI and docs). */
  note: string;
  /** Per-league field overrides (shallow; replace whole objects such as `playoff`). */
  leagues?: Record<string, Partial<Omit<LeagueConfig, 'id' | 'tier'>>>;
  /** Per-cup field overrides. */
  cups?: Record<string, Partial<Omit<CupConfig, 'id'>>>;
}

const memo = new WeakMap<CountryConfig, Map<number, CountryConfig>>();

/** The configuration in force in season `year` (memoised per set of applied changes). */
export function configFor(base: CountryConfig, year: number): CountryConfig {
  const changes = base.changes ?? [];
  if (!changes.length) return base;
  const applied = changes.filter(c => c.from <= year).length;
  let m = memo.get(base);
  if (!m) { m = new Map(); memo.set(base, m); }
  let cfg = m.get(applied);
  if (!cfg) {
    cfg = base;
    for (const ch of changes.slice(0, applied)) {
      cfg = {
        ...cfg,
        leagues: cfg.leagues.map(l => ch.leagues?.[l.id] ? { ...l, ...ch.leagues[l.id] } : l),
        cups: cfg.cups.map(c => ch.cups?.[c.id] ? { ...c, ...ch.cups[c.id] } : c),
      };
    }
    m.set(applied, cfg);
  }
  return cfg;
}

/** Rule changes that have taken effect by season `year`, and the next one still to come. */
export function ruleTimeline(base: CountryConfig, year: number): { past: RuleChange[]; next: RuleChange | null } {
  const changes = base.changes ?? [];
  return { past: changes.filter(c => c.from <= year), next: changes.find(c => c.from > year) ?? null };
}

/**
 * Check that every change keeps the pyramid closed: in each season the clubs moving out of a league
 * and in from its neighbours must leave it at the next season's size. Returns a list of problems.
 */
export function validateChanges(base: CountryConfig, fromYear: number, toYear: number): string[] {
  const errs: string[] = [];
  for (let y = fromYear; y < toYear; y++) {
    const a = configFor(base, y), b = configFor(base, y + 1);
    const up = (l: LeagueConfig) => l.tier === 1 ? 0 : l.autoPromotion + (l.playoff ? 1 : 0);
    a.leagues.forEach((l, i) => {
      const fromAbove = i > 0 ? a.leagues[i - 1].relegation : 0;
      const fromBelow = i < a.leagues.length - 1 ? up(a.leagues[i + 1]) : 0;
      const out = up(l) + (i < a.leagues.length - 1 ? l.relegation : 0);
      const next = l.size - out + fromAbove + fromBelow;
      if (next !== b.leagues[i].size) errs.push(`${y}/${y + 1}: ${l.id} ends with ${next} clubs, the next season expects ${b.leagues[i].size}`);
    });
  }
  return errs;
}
