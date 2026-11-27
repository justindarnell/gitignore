import clubs2026 from './clubs.json' with { type: 'json' };
import clubs1992 from './clubs-1992.json' with { type: 'json' };
import { ENGLAND_PREVIOUS } from './config.ts';

/** Start seasons a world can be created from. Each has its own club database (fitted with only the
 *  data available before that season, tools/ratings) and its own competition configuration. */
export interface StartDef {
  id: string;
  label: string;
  year: number;
  country: string;          // key into COUNTRIES
  db: { clubs: any[] };
  /** Final rankings of the season before the start (a function, so bundlers can drop unused data). */
  previous: () => { rankings: Record<string, string[]>; relegated: Record<string, string[]> };
}

export const STARTS: Record<string, StartDef> = {
  '2026': { id: '2026', label: '2026/27 (present day, 116 clubs, five divisions)', year: 2026, country: 'ENG', db: clubs2026 as any, previous: () => ENGLAND_PREVIOUS },
  '1992': {
    id: '1992', label: '1992/93 (first Premier League season, 92 clubs, four divisions)', year: 1992, country: 'ENG1992', db: clubs1992 as any,
    previous: () => ({ rankings: (clubs1992 as any).previousRankings, relegated: {} }),
  },
};
