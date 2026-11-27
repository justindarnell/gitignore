// Sandbox tools: what-if interventions and timeline forks. Interventions are deterministic (no
// randomness is consumed), are applied between engine steps, and are always recorded: in
// world.interventions, in the club timeline (kind 'intervention') and in the news, so history
// clearly shows where the user changed the world.
import { addEvent, pushNews } from './history.ts';
import { runtime } from './runtime.ts';
import { cloneWorld } from '../persistence/save.ts';
import type { Intervention, World } from './types.ts';

export type EditableAttr = 'attack' | 'midfield' | 'defence' | 'reputation' | 'stability' | 'ambition';
export const EDITABLE: EditableAttr[] = ['attack', 'midfield', 'defence', 'reputation', 'stability', 'ambition'];

export type InterventionSpec =
  | { kind: 'edit'; values: Partial<Record<EditableAttr, number>> }
  | { kind: 'takeover' | 'selloff' | 'crisis' | 'windfall' };

/** Fixed effects of injected events (rating points; ambition on its -1..1 scale). */
export const EVENT_EFFECTS: Record<'takeover' | 'selloff' | 'crisis' | 'windfall', { label: string; quality?: number; era?: number; stability?: number; reputation?: number; ambition?: number; text: string }> = {
  takeover: { label: 'Wealthy takeover', quality: 2, era: 1, stability: -2, ambition: 0.9, text: 'Takeover by wealthy new owners' },
  selloff: { label: 'Sell-off to asset-strippers', quality: -1, era: -0.5, stability: -6, ambition: -0.9, text: 'Sold to asset-stripping owners' },
  crisis: { label: 'Institutional crisis', quality: -4.5, era: -1.2, stability: -18, reputation: -2, text: 'Institutional crisis' },
  windfall: { label: 'Investment windfall', quality: 3, era: 0.8, stability: 3, text: 'Major investment windfall' },
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const BOUNDS: Record<EditableAttr, [number, number]> = { attack: [5, 99], midfield: [5, 99], defence: [5, 99], reputation: [1, 99], stability: [5, 95], ambition: [-1, 1] };

/**
 * Apply a user intervention to a club now (between steps). Returns the recorded intervention.
 * Note: ownership ambition only affects development when ownership dynamics are switched on in the
 * settings; the immediate effects of injected events apply regardless.
 */
export function applyIntervention(world: World, clubId: string, spec: InterventionSpec): Intervention {
  const rt = runtime(world);
  const c = rt.clubs.get(clubId);
  if (!c) throw new Error(`Unknown club ${clubId}`);
  const changes: Record<string, [number, number]> = {};
  const set = (k: EditableAttr, v: number) => {
    const before = c[k] as number;
    const after = clamp(v, ...BOUNDS[k]);
    if (Math.abs(after - before) > 1e-9) { changes[k] = [before, after]; (c[k] as number) = after; }
  };
  let text: string;
  if (spec.kind === 'edit') {
    for (const k of EDITABLE) if (spec.values[k] !== undefined && Number.isFinite(spec.values[k]!)) set(k, spec.values[k]!);
    text = `Attributes edited: ${Object.entries(changes).map(([k, [a, b]]) => `${k} ${fmt(k, a)} → ${fmt(k, b)}`).join(', ') || 'no change'}`;
  } else {
    const e = EVENT_EFFECTS[spec.kind];
    for (const k of ['attack', 'midfield', 'defence'] as const) if (e.quality) set(k, c[k] + e.quality);
    if (e.stability) set('stability', c.stability + e.stability);
    if (e.reputation) set('reputation', c.reputation + e.reputation);
    if (e.ambition !== undefined) set('ambition', e.ambition);
    if (e.era) { changes.era = [c.era, c.era + e.era]; c.era += e.era; }
    if (spec.kind === 'takeover' || spec.kind === 'selloff') c.ownerSince = world.season.year;
    text = e.text;
  }
  const s = world.season;
  const iv: Intervention = {
    id: (world.interventions.at(-1)?.id ?? 0) + 1, season: s.year, slot: s.slotIndex,
    date: s.calendar[Math.min(s.slotIndex, s.calendar.length - 1)].date, club: clubId, kind: spec.kind, changes, text,
  };
  world.interventions.push(iv);
  addEvent(world, clubId, `User intervention: ${text}`, 'intervention', 0);
  pushNews(world, { date: iv.date, kind: 'intervention', clubs: [clubId], importance: 3, text: `User intervention at ${world.info[clubId].short}: ${text.charAt(0).toLowerCase()}${text.slice(1)}.` });
  return iv;
}

function fmt(k: string, v: number): string { return k === 'ambition' ? `${v > 0 ? '+' : ''}${Math.round(v * 100)}` : (Math.round(v * 10) / 10).toFixed(1); }

/**
 * Fork a world: an independent copy that shares the seed, history and random state up to now.
 * The copy records its parent and the fork point; the parent is unchanged.
 */
export function forkWorld(world: World, name?: string): World {
  const f = cloneWorld(world);
  const s = world.season;
  const at = { season: s.year, slot: s.slotIndex, date: s.calendar[Math.min(s.slotIndex, s.calendar.length - 1)].date };
  f.name = name ?? `${world.name} (fork)`;
  f.lineage = { id: `${world.lineage.id}>${at.season}.${at.slot}.${world.interventions.length}.${hash(f.name)}`, parentId: world.lineage.id, parentName: world.name, forkedAt: at };
  return f;
}

function hash(s: string): string { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
