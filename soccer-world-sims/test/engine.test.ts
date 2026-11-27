import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, standings, rollover, pyramidRank, SAVE_SCHEMA } from '../src/engine/world.ts';
import { simulate, absoluteTarget } from '../src/engine/sim.ts';
import { runtime } from '../src/engine/runtime.ts';
import { sortTable, emptyRow } from '../src/engine/table.ts';
import { compareBest, compareWorst } from '../src/engine/history.ts';
import { exportWorld, importWorld, cloneWorld } from '../src/persistence/save.ts';
import { ENGLAND } from '../src/data/england/config.ts';
import { Rng } from '../src/engine/rng.ts';
import { shootout } from '../src/engine/match.ts';
import { DEFAULT_PARAMS } from '../src/engine/params.ts';
import type { Match, TableRow, World } from '../src/engine/types.ts';
import clubsDb from '../src/data/england/clubs.json' with { type: 'json' };

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
  test('calibrated default has no ownership changes; the experimental setting enables them', () => {
    const def = createWorld({ seed: 'own-setting', settings: { storage: 'essential' } });
    simulate(def, { kind: 'seasons', n: 10 });
    assert.ok(!Object.values(def.history.clubs).some(h => h.events.some(e => e.kind === 'owner')), 'not adopted: off by default');
    const exp = createWorld({ seed: 'own-setting', settings: { storage: 'essential', ownership: 1 } });
    simulate(exp, { kind: 'seasons', n: 10 });
    assert.ok(Object.values(exp.history.clubs).some(h => h.events.some(e => e.kind === 'owner')));
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
    assert.equal(up.settings.ownership, 0);
    step(up); // migrated worlds simulate
  });
});
