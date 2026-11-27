import type { World } from '../engine/types.ts';

export interface UIState {
  standingsLeague: string;
  fixturesComp: string;
  fixturesRound: Record<string, number>;
  clubsFilter: { q: string; league: string; sort: string; dir: 1 | -1 };
  historyTab: string;
  historyComp: string;
  historySeason: number | null;
  rankMetric: string;
  rankPeriod: string;
  rankFrom: number | null;
  rankTo: number | null;
  newsKind: string;
  chartRange: string;
  positionDetail: 'season' | 'matchday';
}

export interface Ctx { world: World; args: string[]; state: UIState }
export interface PageResult { title: string; html: string; mount?: (root: HTMLElement) => void | (() => void) }
export type Page = (ctx: Ctx) => PageResult;
