import type { Rng } from './rng.ts';
import type { CalendarSlot, CountryConfig, LeagueConfig, SlotRef } from './types.ts';

/**
 * Double round-robin via the circle method. Returns rounds of [home, away] pairs.
 * First half: each pair once; second half: the reverse fixtures in a shuffled round order
 * (never starting with the reverse of the final first-half round).
 */
export function doubleRoundRobin(clubs: string[], rng: Rng): [string, string][][] {
  const teams = rng.shuffle([...clubs]);
  if (teams.length % 2) teams.push('__bye__');
  const n = teams.length;
  const first: [string, string][][] = [];
  const rot = teams.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    const cur = [teams[0], ...rot];
    for (let i = 0; i < n / 2; i++) {
      const a = cur[i], b = cur[n - 1 - i];
      if (a === '__bye__' || b === '__bye__') continue;
      // Alternate venues so each club's home/away pattern is balanced.
      const swap = i === 0 ? r % 2 === 1 : (i + r) % 2 === 1;
      round.push(swap ? [b, a] : [a, b]);
    }
    first.push(round);
    rot.unshift(rot.pop()!);
  }
  const order = rng.shuffle(first.map((_, i) => i));
  if (order[0] === first.length - 1 && order.length > 1) [order[0], order[1]] = [order[1], order[0]];
  const second = order.map(i => first[i].map(([h, a]) => [a, h] as [string, string]));
  return [...first, ...second];
}

const DAY_NAMES = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** First Saturday on or after the configured season start date (UTC). */
export function seasonOrigin(country: CountryConfig, year: number): Date {
  const d = new Date(Date.UTC(year, country.seasonStart.month, country.seasonStart.day));
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export function slotDate(origin: Date, s: SlotRef): Date {
  const d = new Date(origin.getTime());
  d.setUTCDate(d.getUTCDate() + 7 * s.week + s.day);
  return d;
}

export function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

export function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = DAY_NAMES[(d.getUTCDay() + 1) % 7];
  return `${dow} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const slotKey = (s: SlotRef) => s.week * 7 + s.day;

/** Slots used by a league's rounds, in chronological order. */
export function leagueSlots(l: LeagueConfig): SlotRef[] {
  const rounds = 2 * (l.size - 1);
  const sats: SlotRef[] = [];
  for (let w = l.startWeek; w <= l.endWeek; w++) if (!l.reservedWeeks.includes(w)) sats.push({ week: w, day: 0 });
  const need = rounds - sats.length;
  if (need > l.midweeks.length) throw new Error(`${l.id}: not enough calendar slots (${sats.length} Saturdays, ${l.midweeks.length} midweeks, ${rounds} rounds)`);
  const slots = need > 0 ? [...sats, ...l.midweeks.slice(0, need)] : sats.slice(0, rounds);
  return slots.sort((a, b) => slotKey(a) - slotKey(b));
}

/** Build the season calendar: every distinct slot used by any competition. */
export function buildCalendar(country: CountryConfig, year: number): CalendarSlot[] {
  const keys = new Map<number, SlotRef>();
  const add = (s: SlotRef) => keys.set(slotKey(s), s);
  for (const l of country.leagues) {
    leagueSlots(l).forEach(add);
    l.playoff?.rounds.forEach(r => r.slots.forEach(add));
  }
  for (const c of country.cups) c.rounds.forEach(r => r.slots.forEach(add));
  const origin = seasonOrigin(country, year);
  return [...keys.values()].sort((a, b) => slotKey(a) - slotKey(b)).map(s => {
    const date = isoDate(slotDate(origin, s));
    return { week: s.week, day: s.day, date, label: formatDate(date) };
  });
}
