import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, standings, rollover, pyramidRank, SAVE_SCHEMA } from '../src/engine/world.ts';
import { simulate, absoluteTarget } from '../src/engine/sim.ts';
import { runtime } from '../src/engine/runtime.ts';
import { sortTable, emptyRow } from '../src/engine/table.ts';
import { compareBest, compareWorst } from '../src/engine/history.ts';
import { exportWorld, importWorld, cloneWorld } from '../src/persistence/save.ts';
import { ENGLAND } from '../src/data/england/config.ts';
import { ENGLAND_1992 } from '../src/data/england/config1992.ts';
import { Rng } from '../src/engine/rng.ts';
import { shootout } from '../src/engine/match.ts';
import { DEFAULT_PARAMS } from '../src/engine/params.ts';
import { titleEras, goldenAge, decadeRankings } from '../src/engine/eras.ts';
import type { Match, TableRow, World } from '../src/engine/types.ts';
import clubsDb from '../src/data/england/clubs.json' with { type: 'json' };
import clubs1992 from '../src/data/england/clubs-1992.json' with { type: 'json' };
import { applyIntervention, forkWorld, EVENT_EFFECTS } from '../src/engine/sandbox.ts';
import { runExperiment, summarise, clubFan, runSeedLabel } from '../src/engine/experiments.ts';

const SIZES: Record<string, number> = { ENG1: 20, ENG2: 24, ENG3: 24, ENG4: 24, ENG5: 24 };

function playSeason(w: World): void {
  if (w.season.complete) step(w);
  while (!w.season.complete) step(w);
}

const worldAfterOne = (() => { const w = createWorld({ seed: 'test-season' }); playSeason(w); return w; })();

describe('club database', () => {
  test('116 clubs with correct division sizes and unique ids', () => {
    const clubs = clubsDb.clubs;
    assert.equal(clubs.length, 116);
    assert.equal(new Set(clubs.map(c => c.id)).size, 116);
    for (const [d, n] of [[1, 20], [2, 24], [3, 24], [4, 24], [5, 24]]) assert.equal(clubs.filter(c => c.division === d).length, n);
  });
  test('attributes on 0-100 scale and every club has a region and crest', () => {
    for (const c of clubsDb.clubs) {
      for (const k of ['attack', 'midfield', 'defence', 'reputation', 'stability', 'formEstimate'] as const) assert.ok(c[k] >= 0 && c[k] <= 100, `${c.id} ${k}`);
      assert.ok(ENGLAND.regions[c.id], `${c.id} region`);
      assert.ok(c.crest.endsWith('.webp'));
    }
  });
  test('newly promoted clubs are not rated above established elite clubs', () => {
    const q = (id: string) => clubsDb.clubs.find(c => c.id === id)!.squadQuality;
    for (const promoted of ['coventry-city', 'ipswich-town', 'hull-city']) for (const elite of ['arsenal', 'manchester-city', 'liverpool', 'chelsea']) assert.ok(q(promoted) < q(elite) - 5);
  });
});

describe('fixtures and calendar', () => {
  const w = createWorld({ seed: 'fixtures' });
  test('double round robin: correct counts, every ordered pair exactly once', () => {
    for (const l of ENGLAND.leagues) {
      const ms = w.season.matches.filter(m => m.comp === l.id);
      assert.equal(ms.length, l.size * (l.size - 1), l.id);
      const pairs = new Set(ms.map(m => `${m.home}>${m.away}`));
      assert.equal(pairs.size, ms.length, `${l.id} duplicate fixtures`);
      for (const c of w.season.leagueClubs[l.id]) {
        assert.equal(ms.filter(m => m.home === c).length, l.size - 1, `${c} home games`);
        assert.equal(ms.filter(m => m.away === c).length, l.size - 1, `${c} away games`);
      }
    }
    assert.equal(w.season.matches.filter(m => SIZES[m.comp]).length, 2588);
  });
  test('each club plays every league opponent once per round slot at most', () => {
    for (const l of ENGLAND.leagues) {
      const ms = w.season.matches.filter(m => m.comp === l.id);
      const slots = new Set(ms.map(m => m.slot));
      assert.equal(slots.size, 2 * (l.size - 1), `${l.id} rounds`);
    }
  });
  test('no club ever has two matches in the same slot (whole season incl. cups/play-offs)', () => {
    const seen = new Set<string>();
    for (const m of worldAfterOne.season.matches) for (const c of [m.home, m.away]) {
      const k = `${c}@${m.slot}`;
      assert.ok(!seen.has(k), `clash ${k}`);
      seen.add(k);
    }
  });
});

describe('league rules', () => {
  test('table points and goals match played results', () => {
    const w = worldAfterOne;
    for (const l of ENGLAND.leagues) {
      const rows: Record<string, TableRow> = {};
      for (const c of w.season.leagueClubs[l.id]) rows[c] = emptyRow(c);
      for (const m of w.season.matches.filter(x => x.comp === l.id)) {
        assert.ok(m.hg !== undefined, 'all league matches played');
        const h = rows[m.home], a = rows[m.away];
        h.gf += m.hg!; h.ga += m.ag!; a.gf += m.ag!; a.ga += m.hg!;
        if (m.hg! > m.ag!) h.pts += 3; else if (m.hg! < m.ag!) a.pts += 3; else { h.pts++; a.pts++; }
      }
      for (const r of standings(w, l.id)) {
        assert.equal(r.pts, rows[r.club].pts); assert.equal(r.gf, rows[r.club].gf); assert.equal(r.ga, rows[r.club].ga);
        assert.equal(r.pts, 3 * r.w + r.d);
        assert.equal(r.p, 2 * (l.size - 1));
      }
    }
  });
  test('tiebreakers: points, goal difference, goals for, then head-to-head', () => {
    const rows: TableRow[] = [
      { club: 'a', p: 2, w: 1, d: 0, l: 1, gf: 3, ga: 3, pts: 3 },
      { club: 'b', p: 2, w: 1, d: 0, l: 1, gf: 3, ga: 3, pts: 3 },
      { club: 'c', p: 2, w: 1, d: 0, l: 1, gf: 4, ga: 3, pts: 3 },
    ];
    const ms: Match[] = [{ id: 1, comp: 'X', stage: '', slot: 0, home: 'a', away: 'b', hg: 2, ag: 1 }, { id: 2, comp: 'X', stage: '', slot: 0, home: 'b', away: 'a', hg: 2, ag: 1 }];
    const order = sortTable(rows, ['points', 'goalDifference', 'goalsFor', 'h2hPoints', 'h2hGoalDifference', 'h2hAwayGoals', 'lots'], ms, 's');
    assert.equal(order[0].club, 'c');
    // a and b level on h2h points and GD; away goals equal (1 each) -> lots decides deterministically
    const again = sortTable(rows, ['points', 'goalDifference', 'goalsFor', 'h2hPoints', 'h2hGoalDifference', 'h2hAwayGoals', 'lots'], ms, 's');
    assert.deepEqual(order.map(r => r.club), again.map(r => r.club));
    const ms2: Match[] = [{ id: 1, comp: 'X', stage: '', slot: 0, home: 'a', away: 'b', hg: 0, ag: 1 }, { id: 2, comp: 'X', stage: '', slot: 0, home: 'b', away: 'a', hg: 0, ag: 0 }];
    assert.equal(sortTable(rows, ['points', 'goalDifference', 'goalsFor', 'h2hPoints', 'lots'], ms2, 's')[1].club, 'b');
  });
});

describe('promotion, relegation and play-offs', () => {
  const w = worldAfterOne;
  const rec = w.history.leagues[0];
  test('correct numbers move between divisions', () => {
    const [pl, ch, l1, l2, nl] = rec;
    assert.equal(pl.relegated.length, 3); assert.equal(pl.promoted.length, 0);
    assert.equal(ch.promoted.length, 3); assert.equal(ch.relegated.length, 3);
    assert.equal(l1.promoted.length, 3); assert.equal(l1.relegated.length, 4);
    assert.equal(l2.promoted.length, 4); assert.equal(l2.relegated.length, 2);
    assert.equal(nl.promoted.length, 2); assert.equal(nl.relegated.length, 0);
    // automatic places are the top of the table; relegated are the bottom
    assert.deepEqual(ch.promoted.slice(0, 2), ch.table.slice(0, 2).map(r => r.club));
    assert.deepEqual(pl.relegated, pl.table.slice(-3).map(r => r.club));
    assert.deepEqual(l1.relegated, l1.table.slice(-4).map(r => r.club));
  });
  test('play-off winners come from the play-off positions', () => {
    const ranges: Record<string, [number, number]> = { ENG2: [3, 8], ENG3: [3, 6], ENG4: [4, 7], ENG5: [2, 7] };
    for (const lr of rec.slice(1)) {
      const pos = lr.table.findIndex(r => r.club === lr.promotedViaPlayoff) + 1;
      const [a, b] = ranges[lr.league];
      assert.ok(pos >= a && pos <= b, `${lr.league} play-off winner from position ${pos}`);
    }
  });
  test('Championship six-team play-off bracket: 5v8, 6v7, then 3 and 4 enter semi-finals', () => {
    const po = w.season.playoffs['ENG2-PO'];
    const table = rec[1].table.map(r => r.club);
    const pos = (c: string) => table.indexOf(c) + 1;
    const elim = po.ties.filter(t => t.roundIndex === 0).map(t => [pos(t.a), pos(t.b)].sort((x, y) => x - y).join('v'));
    assert.deepEqual(elim.sort(), ['5v8', '6v7']);
    const semis = po.ties.filter(t => t.roundIndex === 1);
    assert.equal(semis.length, 2);
    const semiPos = semis.flatMap(t => [pos(t.a), pos(t.b)]);
    assert.ok(semiPos.includes(3) && semiPos.includes(4));
    const s3 = semis.find(t => pos(t.a) === 3 || pos(t.b) === 3)!;
    const other3 = pos(s3.a) === 3 ? pos(s3.b) : pos(s3.a);
    assert.equal(other3, Math.max(...semiPos), '3rd plays the lowest remaining seed');
    for (const t of semis) {
      assert.equal(t.matches.length, 2);
      const [l1m, l2m] = t.matches.map(id => w.season.matches.find(m => m.id === id)!);
      assert.equal(l1m.home, l2m.away);
      assert.ok(pos(l2m.home) < pos(l2m.away), 'higher seed hosts the second leg');
    }
    const final = po.ties.filter(t => t.roundIndex === 2);
    assert.equal(final.length, 1);
    assert.ok(final[0].winner);
  });
  test('National League play-off: 4v7 and 5v6 eliminators, single-leg semis hosted by 2nd and 3rd', () => {
    const po = w.season.playoffs['ENG5-PO'];
    const table = rec[4].table.map(r => r.club);
    const pos = (c: string) => table.indexOf(c) + 1;
    assert.deepEqual(po.ties.filter(t => t.roundIndex === 0).map(t => `${pos(t.a)}v${pos(t.b)}`).sort(), ['4v7', '5v6']);
    for (const t of po.ties.filter(t => t.roundIndex === 1)) assert.ok([2, 3].includes(pos(t.a)), 'semi hosts are 2nd/3rd');
  });
  test('division sizes and 116 clubs preserved across season transitions', () => {
    const v = createWorld({ seed: 'transitions' });
    for (let s = 0; s < 4; s++) {
      playSeason(v);
      rollover(v);
      const counts: Record<string, number> = {};
      for (const c of v.clubs) counts[c.league] = (counts[c.league] ?? 0) + 1;
      assert.deepEqual(counts, SIZES);
      assert.equal(v.clubs.length, 116);
      assert.equal(v.season.year, 2027 + s);
    }
  });
});

describe('cups', () => {
  const w = worldAfterOne;
  test('FA Cup round sizes, progression and one winner', () => {
    const st = w.season.cups.FAC;
    const sizes = [32, 40, 20, 32, 16, 8, 4, 2, 1];
    sizes.forEach((n, i) => assert.equal(st.ties.filter(t => t.roundIndex === i).length, n, `FA Cup round ${i}`));
    for (let i = 1; i < sizes.length; i++) {
      const prevWinners = new Set(st.ties.filter(t => t.roundIndex === i - 1).map(t => t.winner));
      const entrants = st.ties.filter(t => t.roundIndex === i).flatMap(t => [t.a, t.b]);
      for (const c of prevWinners) assert.ok(entrants.includes(c!), 'winners progress');
    }
    assert.ok(st.winner);
    assert.equal(w.history.cups[0].filter(c => c.cup === 'FAC').length, 1);
    const ext = st.ties.filter(t => t.roundIndex === 0).flatMap(t => [t.a, t.b]).filter(c => c.startsWith('x-'));
    assert.equal(ext.length, 40, 'non-playable qualifiers are distinct ids');
  });
  test('EFL Cup: 92 clubs, regional early rounds, two-legged semis, no extra time before the final', () => {
    const st = w.season.cups.EFLC;
    [35, 25, 16, 8, 4, 2, 1].forEach((n, i) => assert.equal(st.ties.filter(t => t.roundIndex === i).length, n, `EFL Cup round ${i}`));
    const all = new Set(st.ties.flatMap(t => [t.a, t.b]));
    assert.equal(all.size, 92);
    const sameRegion = st.ties.filter(t => t.roundIndex === 0 && ENGLAND.regions[t.a] === ENGLAND.regions[t.b]).length;
    assert.ok(sameRegion >= 34, 'first round is regionalised');
    for (const t of st.ties.filter(t => t.roundIndex === 5)) assert.equal(t.matches.length, 2);
    const nonFinal = w.season.matches.filter(m => m.comp === 'EFLC' && m.stage !== 'Final');
    assert.ok(nonFinal.every(m => !m.et), 'no extra time before the final');
    assert.ok(st.winner);
  });
  test('every knockout tie has exactly one winner from its two clubs', () => {
    for (const st of [...Object.values(w.season.cups), ...Object.values(w.season.playoffs)]) for (const t of st.ties) {
      assert.ok(t.winner === t.a || t.winner === t.b);
      const ms = t.matches.map(id => w.season.matches.find(m => m.id === id)!);
      const last = ms[ms.length - 1];
      if (t.aggregate && t.aggregate[0] === t.aggregate[1]) assert.ok(last.pens, 'level ties go to penalties');
    }
  });
  test('penalty shoot-outs always produce a winner', () => {
    const r = new Rng([1, 2, 3, 4]);
    for (let i = 0; i < 2000; i++) { const [a, b] = shootout(DEFAULT_PARAMS, r); assert.notEqual(a, b); assert.ok(a <= 30 && b <= 30); }
  });
});

describe('history and records', () => {
  test('one snapshot and one championship record per season; no duplicates', () => {
    const v = createWorld({ seed: 'history' });
    simulate(v, { kind: 'seasons', n: 3 });
    assert.equal(v.history.snapshots.length, 3);
    assert.equal(v.history.leagues.length, 3);
    assert.deepEqual(v.history.snapshots.map(s => s.year), [2026, 2027, 2028]);
    for (const ls of v.history.leagues) assert.equal(ls.length, 5);
    for (const cs of v.history.cups) assert.equal(cs.length, 2);
  });
  test('graph data: pyramid ranks consistent with league and position', () => {
    const w = worldAfterOne;
    const snap = w.history.snapshots[0];
    const seen = new Set<number>();
    w.clubs.forEach((c, i) => {
      assert.equal(snap.pyramid[i], pyramidRank(w, snap.league[i], snap.position[i]));
      seen.add(snap.pyramid[i]);
      const track = w.history.clubs[c.id].positions[2026];
      assert.equal(track[0], snap.league[i]);
      assert.equal(track.length - 1, 2 * (SIZES[snap.league[i]] - 1), 'one position per matchday');
      assert.equal(track[track.length - 1], snap.position[i], 'final tracked position equals final table');
    });
    assert.equal(seen.size, 116);
    assert.ok(Math.min(...seen) === 1 && Math.max(...seen) === 116);
  });
  test('best/worst match records are sorted by the documented rules and are real results', () => {
    const w = worldAfterOne;
    for (const c of w.clubs) {
      const h = w.history.clubs[c.id];
      const best = [...h.best].sort(compareBest(c.id));
      assert.deepEqual(h.best, best);
      assert.deepEqual(h.worst, [...h.worst].sort(compareWorst(c.id)));
      for (const r of h.best) {
        const won = (r.home === c.id && r.hg > r.ag) || (r.away === c.id && r.ag > r.hg);
        assert.ok(won, 'best entries are wins');
        assert.ok(w.season.matches.some(m => m.home === r.home && m.away === r.away && m.hg === r.hg && m.ag === r.ag && m.stage === r.stage));
      }
    }
  });
  test('attributes stay within bounds over a long simulation', () => {
    const v = createWorld({ seed: 'bounds', settings: { storage: 'essential' } });
    simulate(v, { kind: 'seasons', n: 30 });
    for (const c of v.clubs) for (const k of ['attack', 'midfield', 'defence', 'reputation', 'stability'] as const) assert.ok(c[k] >= 0 && c[k] <= 100, `${c.id} ${k}=${c[k]}`);
  });
});

describe('determinism, saves and bulk consistency', () => {
  test('same seed gives identical worlds; different seeds differ', () => {
    const a = createWorld({ seed: 'det' }), b = createWorld({ seed: 'det' }), c = createWorld({ seed: 'det2' });
    simulate(a, { kind: 'seasons', n: 2 }); simulate(b, { kind: 'seasons', n: 2 }); simulate(c, { kind: 'seasons', n: 2 });
    const strip = (w: World) => { const x = JSON.parse(exportWorld(w)); delete x.created; return JSON.stringify(x); };
    assert.equal(strip(a), strip(b));
    assert.notEqual(strip(a), strip(c));
  });
  test('save/load mid-season then continue equals uninterrupted simulation', () => {
    const a = createWorld({ seed: 'saveload' });
    const b = createWorld({ seed: 'saveload' });
    simulate(a, { kind: 'seasons', n: 2 });
    for (let i = 0; i < 40; i++) step(b);
    const b2 = importWorld(exportWorld(b));
    simulate(b2, { kind: 'season' });
    simulate(b2, { kind: 'seasons', n: 1 });
    const strip = (w: World) => { const x = JSON.parse(exportWorld(w)); delete x.created; return JSON.stringify(x); };
    assert.equal(strip(a), strip(b2));
  });
  test('matchday-by-matchday, monthly and bulk simulation produce identical results', () => {
    const bulk = createWorld({ seed: 'bulk' });
    simulate(bulk, { kind: 'seasons', n: 2 });
    const daily = createWorld({ seed: 'bulk' });
    while (daily.history.leagues.length < 2) simulate(daily, { kind: 'matchday' });
    const monthly = createWorld({ seed: 'bulk' });
    while (monthly.history.leagues.length < 2) simulate(monthly, { kind: 'month' });
    const strip = (w: World) => { const x = JSON.parse(exportWorld(w)); delete x.created; delete x.news; return JSON.stringify({ h: x.history, c: x.clubs, r: x.rng }); };
    assert.equal(strip(daily), strip(bulk));
    assert.equal(strip(monthly), strip(bulk));
  });
  test('a bulk run paused mid-way and resumed equals an uninterrupted run (absolute targets)', () => {
    const a = createWorld({ seed: 'pause' }), b = createWorld({ seed: 'pause' });
    simulate(a, absoluteTarget(a, { kind: 'seasons', n: 3 }));
    const target = absoluteTarget(b, { kind: 'seasons', n: 3 });
    let k = 0;
    const r = simulate(b, target, { shouldStop: () => ++k > 120 });
    assert.equal(r.stopped, true);
    const b2 = importWorld(exportWorld(b)); // pause hands the world back through serialisation
    simulate(b2, target);
    const strip = (w: World) => { const x = JSON.parse(exportWorld(w)); delete x.created; return JSON.stringify(x); };
    assert.equal(strip(b2), strip(a));
    assert.equal(a.history.leagues.length, 3);
  });
  test('fixtures are never simulated twice (re-stepping a played slot is a no-op)', () => {
    const v = cloneWorld(worldAfterOne);
    const before = JSON.stringify(v.season.matches);
    // season is complete: matches cannot be replayed; a step rolls over to a new season instead
    assert.equal(v.season.complete, true);
    assert.equal(JSON.stringify(v.season.matches), before);
    for (const m of v.season.matches) assert.ok(m.hg !== undefined);
  });
  test('reset: a new world with the same seed is identical to the original start', () => {
    const a = createWorld({ seed: 'reset' });
    const b = createWorld({ seed: 'reset' });
    assert.deepEqual(a.clubs, b.clubs);
    assert.deepEqual(a.season.matches, b.season.matches);
  });
  test('changing settings does not alter recorded history', () => {
    const v = createWorld({ seed: 'settings' });
    simulate(v, { kind: 'seasons', n: 1 });
    const hist = JSON.stringify(v.history.leagues);
    v.settings.upsets = 2;
    runtime(v);
    assert.equal(JSON.stringify(v.history.leagues), hist);
  });
});

describe('ownership ambition (0.6)', () => {
  test('seeds come from the club database with provenance; everyone else is neutral', () => {
    const w = createWorld({ seed: 'amb-seed' });
    for (const c of clubsDb.clubs as any[]) {
      const st = w.clubs.find(x => x.id === c.id)!;
      assert.equal(st.ambition, c.ambition ?? 0);
      assert.ok(typeof c.provenance.ambition === 'string' && c.provenance.ambition.length > 10, `${c.id} ambition provenance`);
      if (c.ambition) assert.ok(c.provenance.ambition.startsWith('documented:'));
      else assert.ok(c.provenance.ambition.startsWith('neutral default'));
    }
    assert.ok(w.clubs.find(c => c.id === 'newcastle-united')!.ambition >= 0.6);
    assert.ok(w.clubs.find(c => c.id === 'sheffield-wednesday')!.ambition <= -0.6);
  });
  test('ambition stays in [-1, 1]; takeovers and sell-offs appear in timelines and news', () => {
    const w = createWorld({ seed: 'amb-events', params: { ownerEventRate: 0.08 }, settings: { storage: 'essential' } });
    simulate(w, { kind: 'seasons', n: 20 });
    for (const c of w.clubs) assert.ok(c.ambition >= -1 && c.ambition <= 1, `${c.id} ${c.ambition}`);
    const owner = Object.values(w.history.clubs).flatMap(h => h.events.filter(e => e.kind === 'owner'));
    assert.ok(owner.some(e => e.tone === 1) && owner.some(e => e.tone === -1), 'both takeovers and sell-offs occur');
    assert.ok(w.news.some(n => n.kind === 'owner'));
    const changed = w.clubs.filter(c => c.ownerSince !== null && c.ownerSince >= 2027);
    assert.ok(changed.length > 0, 'ownerSince updated on ownership change');
  });
  test('ownership events are switched off with ownerEventRate 0 (and draws stay deterministic)', () => {
    const a = createWorld({ seed: 'amb-off', params: { ownerEventRate: 0 }, settings: { storage: 'essential' } });
    simulate(a, { kind: 'seasons', n: 5 });
    assert.ok(!Object.values(a.history.clubs).some(h => h.events.some(e => e.kind === 'owner')));
    const b = createWorld({ seed: 'amb-off', params: { ownerEventRate: 0 }, settings: { storage: 'essential' } });
    simulate(b, { kind: 'seasons', n: 5 });
    assert.deepEqual(a.clubs, b.clubs);
  });
  test('ambitious promoted clubs receive more promotion investment at world creation', () => {
    const base = createWorld({ seed: 'amb-promo', params: { ambPromo: 0 } });
    const amb = createWorld({ seed: 'amb-promo', params: { ambPromo: 1 } });
    const q = (w: World, id: string) => { const c = w.clubs.find(x => x.id === id)!; return c.attack + c.midfield + c.defence; };
    assert.ok(q(amb, 'ipswich-town') > q(base, 'ipswich-town'), 'Ipswich (wealthy owners) invests more');
    assert.equal(q(amb, 'arsenal'), q(base, 'arsenal'), 'non-promoted clubs unchanged');
  });
  test('ownership changes happen in the calibrated default and the setting scales them (0 = off)', () => {
    const def = createWorld({ seed: 'own-setting', settings: { storage: 'essential' } });
    simulate(def, { kind: 'seasons', n: 10 });
    assert.ok(Object.values(def.history.clubs).some(h => h.events.some(e => e.kind === 'owner')), 'adopted in 0.7: on by default');
    const off = createWorld({ seed: 'own-setting', settings: { storage: 'essential', ownership: 0 } });
    simulate(off, { kind: 'seasons', n: 10 });
    assert.ok(!Object.values(off.history.clubs).some(h => h.events.some(e => e.kind === 'owner')));
  });
  test('schema 1 saves migrate: ambition neutral, schema bumped', () => {
    const w = createWorld({ seed: 'migrate' });
    const raw = JSON.parse(exportWorld(w));
    raw.schema = 1;
    for (const c of raw.clubs) { delete c.ambition; delete c.ownerSince; }
    delete raw.settings.ownership;
    const up = importWorld(JSON.stringify(raw));
    assert.equal(up.schema, SAVE_SCHEMA);
    for (const c of up.clubs) { assert.equal(c.ambition, 0); assert.equal(c.ownerSince, null); }
    assert.equal(up.settings.ownership, 1);
    step(up); // migrated worlds simulate
  });
});

describe('relative ownership (0.7)', () => {
  test('the ownership target shift acts only below the elite: giants are shielded', () => {
    // Same seed and stream, an asset-stripping owner (ambition -1): switching the target shift (ambDrop)
    // off changes nothing at a club whose reputation is above ambRepRef, but changes a smaller club.
    // (Negative ownership also erodes stability at every club; that path is the same in both runs.)
    const run = (id: string, ambDrop: number) => {
      const w = createWorld({ seed: 'own-shield', params: { ownerEventRate: 0, ambPersist: 1, ambDrop }, settings: { storage: 'essential' } });
      w.clubs.find(x => x.id === id)!.ambition = -1;
      simulate(w, { kind: 'seasons', n: 1 }); step(w);
      return w.clubs.find(x => x.id === id)!;
    };
    const giant = w0().clubs.filter(c => c.reputation >= DEFAULT_PARAMS.ambRepRef + 1).sort((a, b) => b.reputation - a.reputation)[0];
    assert.ok(giant, 'a club above the elite threshold exists');
    const q = (c: { attack: number; midfield: number; defence: number }) => c.attack + c.midfield + c.defence;
    assert.equal(q(run(giant.id, DEFAULT_PARAMS.ambDrop)), q(run(giant.id, 0)), 'no target shift at an elite club');
    const mid = w0().clubs.find(c => c.league === 'ENG2' && c.reputation < 60)!;
    assert.ok(q(run(mid.id, DEFAULT_PARAMS.ambDrop)) < q(run(mid.id, 0)), 'asset-stripping lowers a smaller club\'s target');
  });
  const w0 = (() => { let w: World | null = null; return () => (w ??= createWorld({ seed: 'own-shield' })); })();

  test('schema 4 saves keep their model: ownership off, old experimental setting folded into the parameters', () => {
    const w = createWorld({ seed: 'mig-07' });
    const raw = JSON.parse(exportWorld(w));
    raw.schema = 4;
    for (const k of ['ambLift', 'ambDrop', 'ambRepRef']) delete raw.params[k];
    Object.assign(raw.params, { ambTarget: 0, ambPromo: 0, ambUpside: 0, ownerEventRate: 0, ambPersist: 0.9 });
    raw.settings.ownership = 0.5;
    const up = importWorld(JSON.stringify(raw));
    assert.equal(up.schema, SAVE_SCHEMA);
    assert.equal(up.params.ambLift, 0); assert.equal(up.params.ambDrop, 0);
    assert.equal(up.settings.ownership, 1);
    assert.ok(Math.abs(up.params.ambTarget - 0.5 * 6.842) < 1e-9 && Math.abs(up.params.ownerEventRate - 0.5 * 0.0202) < 1e-9);
    assert.equal(up.params.ambPersist, 0.8797);
    const plain = JSON.parse(exportWorld(w)); plain.schema = 4; plain.settings.ownership = 0;
    for (const k of ['ambLift', 'ambDrop', 'ambRepRef']) delete plain.params[k];
    const up0 = importWorld(JSON.stringify(plain));
    assert.equal(up0.params.ambLift, 0); assert.equal(up0.params.ambTarget, 0);
    step(up);
  });
});

describe('stories, eras, races and rivalries (0.6)', () => {
  const w = createWorld({ seed: 'stories-test', settings: { storage: 'standard' } });
  simulate(w, { kind: 'seasons', n: 25 });
  const tierIn = (k: number, id: string) => { const i = w.clubs.findIndex(c => c.id === id); return i < 0 ? 9 : ['ENG1', 'ENG2', 'ENG3', 'ENG4', 'ENG5'].indexOf(w.history.snapshots[k].league[i]) + 1; };
  test('stories are recorded every season and are consistent with the recorded tables', () => {
    assert.equal(w.history.stories.length, 25);
    assert.ok(w.history.stories.flat().length > 25);
    w.history.stories.forEach((ss, k) => {
      const ls = w.history.leagues[k];
      for (const s of ss) {
        assert.ok(s.importance >= 1 && s.importance <= 5 && s.text.length > 10);
        const lr = ls.find(x => x.league === s.league);
        if (s.kind === 'collapse') assert.ok(lr!.relegated.includes(s.clubs[0]));
        if (s.kind === 'great-escape') assert.ok(!lr!.relegated.includes(s.clubs[0]));
        if (s.kind === 'runaway') assert.ok(lr!.table[0].pts - lr!.table[1].pts >= 15);
        if (s.kind === 'final-day') assert.equal(s.clubs[0], lr!.champion);
        if (s.kind === 'record-points') {
          const li = ls.indexOf(lr!);
          for (let j = 0; j < k; j++) assert.ok(w.history.leagues[j][li].table[0].pts < lr!.table[0].pts);
        }
        if (s.kind === 'giant-killing') assert.ok(tierIn(k, s.clubs[0]) - tierIn(k, s.clubs[1]) >= 2);
      }
    });
  });
  test('detecting stories and keeping head-to-head records consume no randomness (identical results at every storage level)', () => {
    const key = (x: World) => JSON.stringify({ c: x.clubs, r: x.rng, t: x.history.leagues.map(l => l.map(y => y.table)) });
    const e = createWorld({ seed: 'storage-eq', settings: { storage: 'essential' } }), f = createWorld({ seed: 'storage-eq', settings: { storage: 'full' } });
    simulate(e, { kind: 'seasons', n: 3 }); simulate(f, { kind: 'seasons', n: 3 });
    assert.equal(key(e), key(f));
    assert.deepEqual(e.history.stories, f.history.stories);
    assert.deepEqual(e.history.h2h, f.history.h2h);
    assert.equal(e.history.leagues[0][0].race, undefined, 'race tracks are Standard+');
    assert.deepEqual(e.history.derbyMeetings, {}, 'derby meeting lists are Standard+');
  });
  test('race tracks: top six finishers, one value per matchday, ending at final points', () => {
    for (const lr of w.history.leagues.at(-1)!) {
      assert.equal(lr.race!.length, 6);
      const size = lr.table.length;
      lr.race!.forEach((r, i) => {
        assert.equal(r[0], lr.table[i].club);
        assert.equal(r.length - 1, 2 * (size - 1));
        assert.equal(r[r.length - 1], lr.table[i].pts);
        for (let k = 2; k < r.length; k++) assert.ok((r[k] as number) >= (r[k - 1] as number));
      });
    }
  });
  test('head-to-head counts every match between playable clubs exactly once', () => {
    const v = createWorld({ seed: 'h2h-count' });
    simulate(v, { kind: 'season' });
    const played = v.season.matches.filter(m => m.hg !== undefined && v.info[m.home] && v.info[m.away]);
    const tot = Object.values(v.history.h2h).reduce((a, r) => a + r[0], 0);
    assert.equal(tot, played.length);
    for (const r of Object.values(v.history.h2h)) { assert.equal(r[0], r[1] + r[2] + r[3]); }
    const [a, b] = ['arsenal', 'tottenham-hotspur'];
    const ms = played.filter(m => (m.home === a && m.away === b) || (m.home === b && m.away === a));
    const rec = v.history.h2h['arsenal|tottenham-hotspur'];
    assert.equal(rec[0], ms.length);
    assert.equal(rec[4], ms.reduce((s, m) => s + (m.home === a ? m.hg! : m.ag!), 0), 'goals for the alphabetically first club');
  });
  test('derby meetings are bounded, between the derby clubs, and reported in the news', () => {
    for (const [id, list] of Object.entries(w.history.derbyMeetings)) {
      const d = ENGLAND.derbies!.find(x => x.id === id)!;
      assert.ok(list.length <= 10);
      for (const m of list) assert.ok(d.clubs.includes(m[3]) && d.clubs.includes(m[4]));
    }
    assert.ok(Object.keys(w.history.derbyMeetings).length >= 5);
    assert.ok(w.news.some(n => n.kind === 'derby'));
  });
  test('eras: title clusters, dynasties at five titles; golden ages and decade rankings are well-formed', () => {
    const fake = { info: { a: { short: 'Alpha' }, b: { short: 'Beta' } }, history: {
      snapshots: [2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040].map(year => ({ year })),
      leagues: ['a', 'a', 'b', 'a', 'a', 'a', 'b', 'b', 'a', 'b', 'b'].map(c => [{ champion: c }]),
    } } as unknown as World;
    const eras = titleEras(fake);
    assert.deepEqual(eras.map(e => [e.club, e.from, e.to, e.titles, e.kind]), [['a', 2030, 2038, 6, 'dynasty'], ['b', 2036, 2040, 4, 'era']]);
    assert.equal(eras[0].label, 'The Alpha Dynasty, 2030–2039');
    for (const c of w.clubs.slice(0, 30)) {
      const g = goldenAge(w, ENGLAND, c.id);
      if (g) { assert.ok(g.to - g.from >= 2 && g.to - g.from <= 11); assert.ok(g.bestFinish >= 1 && g.bestFinish <= 116); }
    }
    const d = decadeRankings(w, 8);
    assert.deepEqual(d.decades, [2020, 2030, 2040, 2050]);
    assert.ok(d.clubs.length >= 8);
    for (const r of d.ranks) assert.equal(r.length, 4);
  });
  test('schema 2 saves migrate to schema 3 with empty stories and head-to-head from the current season', () => {
    const raw = JSON.parse(exportWorld(w));
    raw.schema = 2;
    delete raw.history.stories; delete raw.history.h2h; delete raw.history.h2hSince; delete raw.history.derbyMeetings;
    const up = importWorld(JSON.stringify(raw));
    assert.equal(up.history.stories.length, up.history.leagues.length);
    assert.equal(up.history.h2hSince, up.season.year);
    simulate(up, { kind: 'seasons', n: 1 });
    assert.equal(up.history.stories.length, up.history.leagues.length);
  });
});

describe('sandbox: interventions and forks (0.6)', () => {
  const strip = (w: World) => { const x = JSON.parse(exportWorld(w)); delete x.created; delete x.name; delete x.lineage; return JSON.stringify({ c: x.clubs, h: x.history, r: x.rng, s: x.season }); };
  test('edits are clamped, recorded in history (interventions, timeline, news) and consume no randomness', () => {
    const w = createWorld({ seed: 'iv-edit' });
    simulate(w, { kind: 'month' });
    const rng = JSON.stringify(w.rng);
    const iv = applyIntervention(w, 'everton', { kind: 'edit', values: { attack: 150, stability: 3, ambition: 0.5 } });
    assert.equal(JSON.stringify(w.rng), rng);
    const c = w.clubs.find(x => x.id === 'everton')!;
    assert.equal(c.attack, 99); assert.equal(c.stability, 5); assert.equal(c.ambition, 0.5);
    assert.deepEqual(Object.keys(iv.changes).sort(), ['ambition', 'attack', 'stability']);
    assert.equal(w.interventions.length, 1);
    assert.ok(w.history.clubs.everton.events.some(e => e.kind === 'intervention' && e.text.startsWith('User intervention')));
    assert.ok(w.news.some(n => n.kind === 'intervention'));
  });
  test('injected events have their documented effects', () => {
    const w = createWorld({ seed: 'iv-event' });
    const before = { ...w.clubs.find(x => x.id === 'reading')! };
    applyIntervention(w, 'reading', { kind: 'takeover' });
    const c = w.clubs.find(x => x.id === 'reading')!;
    assert.equal(c.attack, before.attack + EVENT_EFFECTS.takeover.quality!);
    assert.equal(c.ambition, 0.9);
    assert.equal(c.ownerSince, 2026);
    applyIntervention(w, 'arsenal', { kind: 'crisis' });
    assert.ok(w.clubs.find(x => x.id === 'arsenal')!.stability < 66.53 - 17);
  });
  test('the same intervention at the same point reproduces exactly: stepwise, bulk and across save/load', () => {
    const run = (mode: 'bulk' | 'step' | 'save') => {
      let w = createWorld({ seed: 'iv-repro' });
      for (let i = 0; i < 30; i++) step(w);
      applyIntervention(w, 'sunderland', { kind: 'windfall' });
      if (mode === 'save') w = importWorld(exportWorld(w));
      if (mode === 'step') { while (w.history.leagues.length < 2) step(w); }
      else simulate(w, absoluteTarget(w, { kind: 'seasons', n: 2 }));
      return strip(w);
    };
    const a = run('bulk');
    assert.equal(run('step'), a);
    assert.equal(run('save'), a);
  });
  test('a fork continues identically to its parent until something differs, and records its lineage', () => {
    const p = createWorld({ seed: 'fork' });
    simulate(p, { kind: 'seasons', n: 1 });
    const f = forkWorld(p, 'Fork');
    assert.equal(f.lineage.parentId, p.lineage.id);
    assert.equal(f.lineage.forkedAt!.season, p.season.year);
    assert.notEqual(f.lineage.id, p.lineage.id);
    simulate(p, { kind: 'seasons', n: 2 }); simulate(f, { kind: 'seasons', n: 2 });
    assert.equal(strip(f), strip(p), 'same seed and state: identical continuation');
    const g = forkWorld(p, 'Changed');
    applyIntervention(g, 'manchester-city', { kind: 'crisis' });
    simulate(p, { kind: 'seasons', n: 2 }); simulate(g, { kind: 'seasons', n: 2 });
    assert.notEqual(strip(g), strip(p), 'an intervention makes the timelines diverge');
    assert.deepEqual(g.history.leagues.slice(0, 3), p.history.leagues.slice(0, 3), 'shared history before the fork is untouched');
  });
  test('schema 3 saves migrate to schema 4 (start 2026, no interventions, root lineage)', () => {
    const w = createWorld({ seed: 'mig4' });
    const raw = JSON.parse(exportWorld(w));
    raw.schema = 3; delete raw.start; delete raw.interventions; delete raw.lineage;
    const up = importWorld(JSON.stringify(raw));
    assert.equal(up.start, '2026'); assert.deepEqual(up.interventions, []); assert.equal(up.lineage.id, 'root:2026:mig4');
  });
});

describe('historical start: 1992/93 (0.6)', () => {
  const w = createWorld({ seed: 'start-1992', start: '1992' });
  simulate(w, { kind: 'seasons', n: 1 });
  const rec = w.history.leagues[0];
  test('database: 92 clubs in verified 1992/93 divisions, rated only from data before the season', () => {
    const db = clubs1992.clubs as any[];
    assert.equal(db.length, 92);
    assert.deepEqual([1, 2, 3, 4].map(d => db.filter(c => c.division === d).length), [22, 24, 24, 22]);
    const pl = db.filter(c => c.division === 1).map(c => c.id).sort();
    assert.deepEqual(pl, ['arsenal', 'aston-villa', 'blackburn-rovers', 'chelsea', 'coventry-city', 'crystal-palace', 'everton', 'ipswich-town', 'leeds-united', 'liverpool',
      'manchester-city', 'manchester-united', 'middlesbrough', 'norwich-city', 'nottingham-forest', 'oldham-athletic', 'queens-park-rangers', 'sheffield-united',
      'sheffield-wednesday', 'southampton', 'tottenham-hotspur', 'wimbledon'].sort(), 'the 22 founder members of the Premier League');
    assert.equal(db.find(c => c.id === 'colchester-united').division, 4, 'Colchester promoted from the Conference in 1992');
    assert.equal(db.find(c => c.id === 'colchester-united').previousDivision, 6);
    assert.ok(!db.some(c => c.id.startsWith('aldershot') || c.id.startsWith('maidstone')), 'Aldershot and Maidstone folded in 1992');
    for (const c of db) {
      assert.match(c.provenance.ratings, /1988\/89-1991\/92|no data/);
      assert.match(c.provenance.reputation, /1962-1991/);
    }
    assert.ok(db.find(c => c.id === 'blackburn-rovers').provenance.ambition.includes('Jack Walker'));
  });
  test('era rules from config: 22-club Premier League, promotion and relegation counts, play-offs', () => {
    assert.equal(w.country, 'ENG1992');
    const [pl, d1, d2, d3] = rec;
    assert.equal(pl.table.length, 22); assert.equal(pl.table[0].p, 42);
    assert.equal(pl.relegated.length, 3);
    assert.equal(d1.promoted.length, 3); assert.equal(d1.relegated.length, 3);
    assert.equal(d2.promoted.length, 3); assert.equal(d2.relegated.length, 4);
    assert.equal(d3.promoted.length, 4); assert.equal(d3.relegated.length, 0, 'no playable Conference');
    for (const [lr, a, b] of [[d1, 3, 6], [d2, 3, 6], [d3, 4, 7]] as const) {
      const pos = lr.table.findIndex(r => r.club === lr.promotedViaPlayoff) + 1;
      assert.ok(pos >= a && pos <= b);
    }
    const v = createWorld({ seed: 'start-1992b', start: '1992', settings: { storage: 'essential' } });
    simulate(v, { kind: 'seasons', n: 4 });
    const counts: Record<string, number> = {};
    for (const c of v.clubs) counts[c.league] = (counts[c.league] ?? 0) + 1;
    assert.deepEqual(counts, { ENG1: 22, ENG2: 24, ENG3: 24, ENG4: 22 });
  });
  test('cups: FA Cup with non-league qualifiers, League Cup two-legged rounds with away goals', () => {
    const fa = w.season.cups.FAC, lc = w.season.cups.LC;
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(i => fa.ties.filter(t => t.roundIndex === i).length), [36, 18, 32, 16, 8, 4, 2, 1]);
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(i => lc.ties.filter(t => t.roundIndex === i).length), [28, 32, 16, 8, 4, 2, 1]);
    assert.equal(new Set(lc.ties.flatMap(t => [t.a, t.b])).size, 92);
    // away goals: every two-legged tie level on aggregate after 90 minutes of the second leg with
    // different away goals is decided by them, without extra time.
    let decided = 0;
    for (const v of [w, ...['ag1', 'ag2', 'ag3'].map(sd => { const x = createWorld({ seed: sd, start: '1992', settings: { storage: 'essential' } }); simulate(x, { kind: 'season' }); return x; })]) {
      for (const t of v.season.cups.LC.ties.filter(t => t.matches.length === 2)) {
        const [m1, m2] = t.matches.map(id => v.season.matches.find(m => m.id === id)!);
        if (m2.et) continue;
        const aggA = m1.hg! + m2.ag!, aggB = m1.ag! + m2.hg!;
        if (aggA === aggB && m2.ag !== m1.ag) { decided++; assert.equal(t.winner, m2.ag! > m1.ag! ? t.a : t.b); assert.ok(!m2.pens); }
      }
    }
    assert.ok(decided > 0, 'away goals decided some ties');
  });
  test('1992/93 calendar: double round robin and no club ever has two matches in one slot', () => {
    for (const l of ENGLAND_1992.leagues) assert.equal(w.season.matches.filter(m => m.comp === l.id).length, l.size * (l.size - 1));
    const seen = new Set<string>();
    for (const m of w.season.matches) for (const c of [m.home, m.away]) { const k = `${c}@${m.slot}`; assert.ok(!seen.has(k), `clash ${k}`); seen.add(k); }
  });
  test('a 1992 world is deterministic and survives save/load', () => {
    const a = createWorld({ seed: 'd92', start: '1992' }), b = createWorld({ seed: 'd92', start: '1992' });
    simulate(a, { kind: 'seasons', n: 2 });
    for (let i = 0; i < 50; i++) step(b);
    const b2 = importWorld(exportWorld(b));
    simulate(b2, absoluteTarget(b2, { kind: 'seasons', n: 2 }));
    const strip = (x: World) => { const o = JSON.parse(exportWorld(x)); delete o.created; return JSON.stringify(o); };
    assert.equal(strip(b2), strip(a));
  });
});

describe('multi-fork experiments (0.7)', () => {
  const base = createWorld({ seed: 'exp-test', settings: { storage: 'essential' } });
  simulate(base, { kind: 'matchday' });
  const before = exportWorld(base);
  const outs = [0, 1, 2, 3, 4, 5].map(i => runExperiment(base, i, 3));

  test('runs are deterministic, independent, and never change the base world', () => {
    assert.equal(exportWorld(base), before, 'base world unchanged');
    const again = runExperiment(base, 2, 3);
    assert.deepEqual([...again.pyramid], [...outs[2].pyramid]);
    assert.deepEqual([...again.champions], [...outs[2].champions]);
    assert.notDeepEqual([...outs[0].pyramid], [...outs[1].pyramid], 'different runs have different luck');
    // A run is exactly a fork of the base world with a re-seeded random stream, simulated n seasons.
    const manual = forkWorld(base);
    manual.rng = Rng.fromSeed(runSeedLabel(base, 4)).state();
    simulate(manual, absoluteTarget(manual, { kind: 'seasons', n: 3 }));
    assert.deepEqual(manual.history.snapshots.map(s => s.pyramid), [0, 1, 2].map(s => [...outs[4].pyramid.slice(s * base.clubs.length, (s + 1) * base.clubs.length)]));
  });

  test('a mid-season start counts the current season as the first of the horizon', () => {
    assert.deepEqual(outs[0].years, [base.season.year, base.season.year + 1, base.season.year + 2]);
  });

  test('summary probabilities are consistent', () => {
    const S = summarise(base, outs);
    assert.equal(S.runs, 6); assert.equal(S.seasons, 3);
    for (const c of S.clubs) {
      for (const v of [c.title, c.top4, c.relegated, c.promoted, ...Object.values(c.cup)]) assert.ok(v >= 0 && v <= 1);
      assert.ok(Math.abs(c.endLeague.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'each run ends in exactly one league');
      assert.ok(c.endP10 <= c.endP50 && c.endP50 <= c.endP90);
    }
    // Exactly one champion per season and run.
    const total = S.clubs.reduce((a, c) => a + c.titlesMean, 0);
    assert.ok(Math.abs(total - 3) < 1e-9);
    for (const s of S.champions) assert.ok(s.top.reduce((a, t) => a + t.p, 0) <= 1 + 1e-9);
    // Relegations and promotions balance across the pyramid in every run (closed pyramid).
    const rel = S.clubs.reduce((a, c) => a + c.relegated, 0), pro = S.clubs.reduce((a, c) => a + c.promoted, 0);
    assert.ok(rel > 0 && pro > 0);
    const fan = clubFan(base, outs, 'arsenal');
    assert.equal(fan.length, 3);
    for (const f of fan) assert.ok(f.p10 <= f.p25 && f.p25 <= f.p50 && f.p50 <= f.p75 && f.p75 <= f.p90);
  });

  test('an intervention keeps the random streams (common random numbers), so summaries compare', () => {
    const w = cloneWorld(base);
    const keyBefore = summarise(w, outs).key;
    applyIntervention(w, 'arsenal', { kind: 'crisis' });
    assert.equal(runSeedLabel(w, 0), runSeedLabel(base, 0));
    const after = [0, 1, 2, 3, 4, 5].map(i => runExperiment(w, i, 3));
    const S = summarise(w, after);
    assert.equal(S.key, keyBefore);
    assert.equal(S.interventions, 1);
    const arsenalEnd = (o: typeof outs) => o.reduce((a, r) => a + r.pyramid[2 * base.clubs.length + base.clubs.findIndex(c => c.id === 'arsenal')], 0);
    assert.ok(arsenalEnd(after) > arsenalEnd(outs), 'a crisis lowers the expected final position');
  });
});
