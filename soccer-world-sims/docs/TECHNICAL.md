# Technical documentation

## Architecture

```
            ┌──────────────── src/engine (pure TypeScript, no DOM) ────────────────┐
  clubs.json│ world.ts      create world, season start, slot stepping, cups, play-offs, │
  config.ts │               season finalisation, rollover                               │
            │ match.ts      expected goals, score sampling, extra time, penalties        │
            │ schedule.ts   double round-robin, calendar                                 │
            │ table.ts      standings + tiebreakers                                      │
            │ evolution.ts  end-of-season club development                               │
            │ events.ts     random club events                                           │
            │ history.ts    snapshots, records, honours, timelines, news, head-to-head   │
            │ stories.ts    story-of-the-season detection, matchday tracks (no RNG)      │
            │ eras.ts       eras, dynasties, golden ages, decade rankings (derived)      │
            │ sandbox.ts    what-if interventions, forks (deterministic, no RNG)         │
            │ experiments.ts multi-fork experiments: re-seeded forks, outcome odds      │
            │ rules.ts      dated rule changes: the config in force in a given season   │
            │ administration.ts  insolvency risk, points deductions (optional)          │
            │ sim.ts        simulation targets (matchday … N seasons), bulk loop        │
            │ runtime.ts    non-serialised caches + live RNG                             │
            └───────────────────────────────────────────────────────────────────────────┘
                 ▲ same `step()` used by          ▲                     ▲
   src/ui (main thread: short runs, pages)   src/worker (bulk runs)   tools/calibrate (Node workers)
```

* **Headless engine.** The engine imports no DOM APIs. It runs unchanged in the browser main thread,
  a web worker, Node tests and the Node calibration workers.
* **Data-driven competitions.** A `CountryConfig` (see `src/data/england/config.ts`) declares leagues
  (size, promotion/play-off/relegation rules, tiebreakers, calendar windows), play-off brackets
  (seeds entering per round, legs, venue) and cups (rounds, entrant selectors, external qualifiers,
  extra-time rules, regional draws, rotation). Adding Scotland or a European competition means adding
  config and, where needed, new entrant selectors. Engine code does not assume England.
* **Serialisable world.** `World` is plain JSON: clubs, season state (calendar, matches, tables, ties),
  history, news, settings, calibrated parameters and the RNG state. A non-serialised runtime cache
  (`runtime.ts`) holds lookup maps and the live RNG, and is rebuilt transparently after loading.

## Determinism

* One seeded PRNG (sfc32, `rng.ts`) per world. Its 128-bit state is saved after every engine step.
* Every random draw happens inside `step()` in a fixed order. Display code never consumes randomness:
  the tiebreaker "drawing of lots" uses a hash of seed, season and club.
* `step()` either plays the next calendar slot or performs the season rollover. All simulation
  targets (`sim.ts`) just call `step()` repeatedly, so simulating matchday by matchday, by month,
  by season, in bulk, in a worker, or across save/load produces **identical** worlds. This is covered
  by tests, including pause and resume of a bulk run.

## Match model

For home side *h* and away side *a* (ratings on the 0–100 scale):

```
attackPower  = 0.75·attack  + 0.25·midfield + perf
defencePower = 0.75·defence + 0.25·midfield + perf
perf         = seasonOffset + form (− cup-rotation penalty)
log λ_home   = baseGoals + homeAdv + strength · 0.035 · (attackPower_h − defencePower_a)
log λ_away   = baseGoals           + strength · 0.035 · (attackPower_a − defencePower_h)
```

* `0.035` log-goals per rating point is the scale of the club-rating fit (`tools/ratings/fit.mjs`),
  so `strength = 1` reproduces the fitted, opposition-adjusted goal model; calibration selected 1.10.
* Expected goals above 2.5 saturate smoothly toward 4.5 (`softCap`): in heavy mismatches favourites
  ease off and underdogs defend deep. This keeps record scorelines and cup thrashings at historical
  frequencies without touching typical matches.
* Each λ receives a small log-normal per-match shock (`matchNoise`): this is the upset level.
* Goals are Poisson draws with a Dixon–Coles correction for 0–0, 1–0, 0–1 and 1–1, applied by
  rejection sampling (ρ = −0.10). This restores the realistic draw rate.
* Extra time uses 30% of the 90-minute λ. Shoot-outs are ABAB best-of-five then sudden death (76% per kick).
* Neutral venues remove home advantage. In early cup rounds a club from a higher tier fields a
  rotated side (`rotationPenalty` scaled by round and by how high the club's tier is). This matches
  the historical cross-division cup results better than full-strength squads.

### Seasonal performance and form

* `seasonOffset` is drawn at the start of each season: `luck_t = 0.14·luck_{t−1} + √(1−0.14²)·σ·N(0,1)`
  with σ = 2.0 rating points. Championship fatigue and event carry-over are then subtracted or added.
* `form` is a per-match mean-reverting random walk (AR 0.9, innovation 0.35). Results do **not** feed
  back into form, so no hot-streak snowballing.
* Season one starts from the database's `formEstimate`, which is opposition-adjusted and capped. It is
  worth at most ±1.5 rating points and decays within weeks. This fixes the 0.4.3 "misleading initial
  form" problem.

## Club evolution (end of every season)

Squad quality `Q` is the mean of attack, midfield and defence:

```
T     = repWeight·reputation + (1−repWeight)·economics
econ  = (1−r)·divisionLevel(next division) + r·level(club's own pyramid rank)   (r = rankEconomics)
era   = eraPersist·era + eraSD·damp(stability)·N + promotion momentum
ΔQ    = revert·(T − Q)·(recoverBoost if Q<T) + era + perfEffect·surprise + qualityNoise·N
        + promotion investment − relegation loss·(1.25 − stability/100)
        − title drain − ceilingCost·max(0, Q − ceiling) + events
```

* `level(rank)` is a **fixed** curve: the 2026 rating of the club at each pyramid rank. It represents
  the revenue structure of the pyramid, which does not inflate over time. Promoted clubs are placed at
  the bottom of their new division (they earn bottom-of-division money), and relegated clubs at the
  top of the lower one (parachute payments).
* **Reputation** moves toward `level(final rank) + honours` at `repRate` per season, so it changes
  slowly. It is the institutional pull that protects giants statistically and gives them better
  recovery prospects, without any immunity rule.
* **Stability** reverts slowly to a moving institutional anchor. Over- and under-achievement,
  promotion, relegation and events nudge it. It softens relegation losses and negative events, and
  damps development swings.
* **Title fatigue:** each title adds temporary fatigue (`fatigueTitle + fatigueStreak·(streak−1)`,
  decaying by half each year) plus a small permanent squad drain. There is no cap on consecutive
  titles; they just get harder to sustain.
* **Events:** ten event types (`events.ts`) with context-dependent probabilities. For example, key
  departures are likelier after over-achievement, and successful rebuilds likelier after decline.
  Negative effects are scaled by stability. Users can change event frequency or set it to 0.
* Style deviations (attack vs defence) drift slowly and revert toward balance.

### Ownership ambition (0.6) and relative ownership (0.7, calibrated default)

`ambition` is a slow latent club trait in [−1, 1] (−1 asset-stripping, 0 steady, +1 wealthy takeover),
seeded from documented ownership situations (`OWNERSHIP` in `tools/ratings/build-db.mjs`, provenance in
`clubs.json`). Each season `A ← ambPersist·A + 0.05·N(0,1)`, and with probability `ownerEventRate` the club
changes hands: a takeover (A = 0.5…1) or a sell-off (A = −0.45…−0.95), with takeovers likelier at big or
run-down clubs and sell-offs likelier after relegation or turmoil. Ambition shifts the structural target
and upkeep ceiling (`ambTarget`·A), scales promotion investment (`1 + ambPromo·A`), skews development shocks
toward the upside without changing their mean (`ambUpside`) and erodes stability when negative. Ownership
changes are written to club timelines (kind `owner`) and the news.

Calibration did **not** adopt the 0.6 version. **0.7 relative ownership** replaces the structural shift
(`ambTarget` = 0) with one that depends on the club's standing:

```
head = clamp((ambRepRef − reputation) / 35, 0, 1)        headroom below the elite
T   += head · (ambLift · max(A, 0) + ambDrop · min(A, 0))  (the upkeep ceiling rises with a positive shift)
```

A club whose reputation is at or above `ambRepRef` (81.4) gets no target shift from its owners, so
asset-strippers cannot sink an established giant and a takeover adds nothing structural there. A smaller
club can be pushed far above what its standing supports (`ambLift` 1.8 points) or run far below it
(`ambDrop` 7.5 points). As a funded club succeeds, its reputation rises and the push fades. Promotion
investment (`ambPromo`) and development upside (`ambUpside`) remain. This was adopted on fresh `holdout4-`
seeds under the pre-registered rule (CALIBRATION.md, "0.7: relative ownership"), so ownership changes
(about 2.8% of clubs per season) are part of the default model. The **Ownership dynamics** setting
multiplies every ownership effect (`ambTarget`, `ambLift`, `ambDrop`, `ambPromo`, `ambUpside`,
`ownerEventRate`): 100% is the calibrated model and 0% means owners never matter. The draws happen every
season either way, so the setting does not shift the rest of the random stream.

Every channel is bounded and mean-reverting. Success raises reputation and revenue, but fatigue,
ceiling upkeep and reversion stop "winning makes you win forever". Failure lowers them, but recovery
toward reputation and asymmetric reversion stop irreversible collapse.

## Sandbox (0.6)

* **Start seasons** (`src/data/england/starts.ts`): `createWorld({ start: '1992' })` selects a club
  database and a `CountryConfig` (`ENG` for 2026/27, `ENG1992` for 1992/93). The engine and UI read league
  sizes and names from the config in force (dated changes applied); the pyramid size (116 or 114) is derived.
* **Interventions** (`applyIntervention`): attribute edits (clamped to valid ranges) and injected events
  (wealthy takeover, sell-off to asset-strippers, institutional crisis, investment windfall) with fixed
  effects. They are applied between steps, consume no randomness and are recorded in `world.interventions`,
  the club timeline (kind `intervention`, shown with ✎) and the news. Applying the same intervention at
  the same point reproduces exactly, stepwise, in bulk and across save/load (tested).
* **Forks** (`forkWorld`): a deep copy that keeps the seed, history and random state, with
  `lineage = { id, parentId, parentName, forkedAt }`. Without changes a fork continues identically to its
  parent (tested), so differences come only from settings or interventions.
* **Compare** (`#/compare/<slot>`): the current world against any saved world with the same start, covering
  champions per season, final tables, a club's pyramid position in both timelines, settings differences,
  interventions and the first season where the final tables differ. If the saved timeline is behind, it can be
  simulated to the same date in a separate worker and saved back to its slot.

## Dated rule changes (0.7)

A `CountryConfig` may list `changes`: `{ from, note, leagues?, cups? }` patches (`src/engine/rules.ts`). The rules
for a season are the base configuration with every change up to that season applied in order (`configFor`,
memoised). League ids and their order never change, so history, snapshots, head-to-head and club ids stay comparable
across eras; sizes, promotion and relegation counts, play-off formats, names and cup rounds can change.

* The runtime holds the config of the current season (`rt.country`, refreshed with the season), so the season's
  calendar, fixtures, play-offs, cups, end-of-season movements and club evolution all use the rules in force. A
  change takes effect at the rollover into its season, and is announced in the news (kind `rules`; no randomness).
* `validateChanges(config, from, to)` checks that the pyramid stays closed: in every season, the clubs leaving and
  entering each league leave it at the next season's size. A test runs it for both configurations to 2040, and
  `startSeason` still throws if a league's membership does not match its size.
* The 1992/93 configuration uses it for the 1994/95 transition, the 20-club Premier League, two-up/two-down with the
  Conference, renamings and the later play-off formats (COMPETITIONS.md). The 2026/27 configuration has no changes.
* The UI shows past tables with their own season's zones and lists the changes on the standings page.

## Administration and points deductions (0.7, off by default)

`src/engine/administration.ts`. At each season start (after the rollover, before any match) every club may enter
administration with probability

```
p = min(0.4, adminRate · setting · tierWeight[tier] · exp(adminAmb · max(0, −A) + adminStab · (45 − stability)/20 + adminReleg · relegatedLastSeason))
```

Tier weights (top flight 0.14, second tier 0.76, third 1, fourth 0.71, fifth 0.41) are the historical shares of English
administrations per club, 1992/93–2024/25. `adminRate` (0.0112) gives about one administration per season at 100%.
Asset-stripping owners (A = −1: ×4.5), low stability (20 points below 45: ×2.7) and a relegation just suffered (×2)
raise the risk; these risk weights are judgements. A club in administration:

* has the league's `adminDeduction` subtracted from this season's points (`TableRow.ded` records it; tables and history
  show it). This is dated configuration: 2026/27 has 9 in the Premier League, 12 in the EFL and 10 in the National
  League. A 1992 world has none until 2004/05, then 9 and 10, 10 in the Conference from 2008/09 and 12 in the Football
  League from 2015/16;
* sells players (squad −`adminSquad` × U(0.5, 1.5) rating points), loses `adminStability` (12) stability, a point of
  reputation and some development momentum, and passes to new owners (ambition reset to −0.1…+0.3);
* gets a timeline entry (kind `admin`) and a news item (filter "Administrations").

The draws come from a sub-stream seeded from the world's random state at that moment, so the main stream is never
consumed: at 0% the model is bit-identical to the model without the mechanism (tested), and experiment runs get their own
draws. The check against the calibration targets did not adopt it as the default (CALIBRATION.md), so the setting
*Financial crises (administration)* defaults to 0%.

## Economic path of historical starts (0.7)

The economic level curve (rating level by pyramid rank) drives clubs' structural targets. A start can declare a
`levelPath` (`starts.ts`): the curve moves from the start's fitted curve toward another start's fitted curve, mapped by
quantile onto this pyramid's ranks, with weight `levelPathAmount · t^levelPathShape`, t = (season − from) / (to − from),
clamped to [0, 1] (`levelCurveAt` in `evolution.ts`). The 1992/93 start's path targets the 2025/26 curve over
1992–2025. Calibration against real 1992–2024 outcomes chose amount 1, shape 0: the 2025/26 structure from the first
season. Worlds without a path, including every 2026/27 world, keep a fixed curve. Saves store the path (`levelPath`,
schema 7; earlier saves migrate to none).

## Experiments (0.7)

`src/engine/experiments.ts` runs many alternative futures of one world and summarises them.

* **Run i** is a copy of the base world (clubs, history, settings, interventions) whose RNG is re-seeded from
  `seed | lineage | year.slot.complete | exp<i>`. The label does **not** include interventions, so running the
  same experiment again after a what-if change gives every run the same random stream as before (common random
  numbers): the difference between the two summaries comes from the change, not from different luck. Streams
  stay aligned as long as the change does not alter the number of draws. Rating edits do not; anything that
  changes who meets whom in a cup gradually decorrelates them.
* Runs simulate at the Essential storage level (storage never changes results, tested) and return compact typed
  arrays per season: combined pyramid position, league, promotion/relegation flag, league champions and cup
  winners. `summarise` turns them into per-club odds (at least one title, mean titles, top-four finish, each cup,
  promoted, relegated, league after the horizon, final position percentiles), the likeliest champions per season,
  and pyramid-position percentiles per season for fan charts (`clubFan`).
* A run is exactly `forkWorld` + re-seed + `simulate(n seasons)` (tested). The base world is never changed (tested).
* The UI (`#/experiments`) splits the run indices over up to four web workers (hardware threads − 1) and merges
  the results. A 10-season run takes about 0.1 s from a new world and 0.16 s after a century of history (the copy
  of the world costs most of the difference), so 40 runs × 10 seasons take about 1.5–2 s.
* Results are kept in memory for the session (current and previous experiment), not in the save.

## Club database pipeline

See [DATA-SOURCES.md](DATA-SOURCES.md). In short, `fit.mjs` fits a recency-weighted, ridge-regularised
Poisson attack/defence model to 2022/23–2025/26 league results across all five tiers, with clubs that
moved between divisions linking the tier levels. `build-db.mjs` then converts the fit to the 0–100
scale and derives reputation, stability and form.

## Calendar

Week 0 is the first Saturday on or after 1 August. Leagues use their Saturdays between configured
start and end weeks, minus weekends reserved for cup rounds, plus midweeks as needed. Cup and play-off
rounds have fixed slots. A test asserts that no club ever has two matches in one slot.

## History and storage levels

| Level | Stored per season | 100 seasons (measured, 0.6) |
|---|---|---|
| Essential | final tables, champions, movements, cup winners/finals, club snapshots (ratings, reputation, stability, position), timelines, news, **stories of the season**, **head-to-head aggregates** | 3.6 MB JSON (0.5 MB gzipped) |
| Standard (default) | + matchday-by-matchday positions, full cup results, best/worst matches, world records, **title/promotion race tracks** (top six's points by matchday, every league), **last 10 meetings of each derby** | 6.8 MB (1.2 MB gzipped) |
| Full | + every league result | 16.6 MB (2.4 MB gzipped) |

### Stories, eras and rivalries (0.6)

None of these consume randomness or change simulation state. A test checks that results are identical at every storage level and that 0.6 Goal-2 code reproduces the Goal-1 results bit for bit.

* **Stories** (`stories.ts`) are detected in `recordSeasonEnd` from the season's matches, which are still in memory
  at every storage level. A matchday track (points, and positions by points, goal difference and goals scored)
  is rebuilt per league. The detected kinds are: title decided on the final day (the champion could still be
  caught going into it) or snatched; runaway titles; see-saw races (6+ lead changes after a quarter of the
  season); invincibles; long unbeaten, winning and losing runs; collapses from the top four (or the automatic
  promotion places) after a third of the season into relegation; great escapes (bottom with a fifth of the
  season left); record high and low points against the world's history (top two tiers for lows); and the two
  biggest cup giant-killings (winner at least two levels below). At most 10 are kept per season (by
  importance), and those with importance 4–5 also go to the news.
* **Race tracks**: the top six finishers' cumulative points per matchday in `LeagueSeasonRecord.race`
  (Standard+). The current season's race is computed live from its matches.
* **Eras** (`eras.ts`, computed on demand): runs of 3+ top-flight titles no more than 3 seasons apart, with titles
  in at least half the seasons spanned; 5+ titles make a *dynasty*. A **golden age** is a club's highest-scoring
  window of 3–12 seasons (title 10, FA Cup 4, other cups 2.5, promotion 1.5, lower-division title 1, up to 2 for a high
  pyramid finish, minus 0.8 per season). The **decades bump chart** ranks clubs by mean pyramid position per decade.
* **Rivalries**: derbies are country configuration (`src/data/england/derbies.ts`, 33 pairs). `history.h2h`
  aggregates every competitive meeting between two playable clubs (`[P, W_a, D, W_b, GF_a, GF_b]`, key `a|b`
  with a < b). Its size is bounded by the number of pairs (~0.3 MB after a century). Derby meetings
  (Standard+) keep the last 10 per derby. Derby news covers top-two-tier derbies, cup derbies and derby wins
  by 3+ goals. The head-to-head page lists the individual meetings that are stored: derbies, cup ties
  (Standard+) and league games (Full).

Best/worst matches are ranked as follows. **Biggest wins**: larger margin, then more goals scored,
then away wins ahead of home wins, then the earlier match. **Heaviest defeats**: larger margin, then
more goals conceded, then home defeats ahead of away defeats, then the earlier match.

## Saves

* IndexedDB database `soccer-world-sims`: a `saves` store holds the world as JSON text, and a `meta`
  store holds slot metadata (name, seed, season, date, size). Autosave writes after every simulation.
* Export downloads `.sws.json.gz` (gzip via `CompressionStream`, or plain JSON when that is
  unavailable). Import accepts both.
* Every save has `schema` (currently 8). Migration 7 → 8 (0.7) sets `adminRate` 0 and the administration setting to 0%
  for earlier saves. Migration 6 → 7 (0.7) adds `levelPath: null` (a fixed economic curve). Migration 5 → 6 (0.7) points 1992 worlds saved before the playable Conference
  (92 clubs) at the frozen 1992/93 configuration (`ENG1992-0.6`, `config1992-frozen.ts`), so they continue exactly as
  before. Migration 4 → 5 (0.7) keeps a save's model: it sets the new
  relative-ownership parameters to 0 and writes the old experimental *Ownership dynamics* setting (k × the 0.6
  finalist, added on top) into the stored parameters, then sets the setting to 100%. Migration 3 → 4 (0.6)
  sets `start` '2026', no interventions and a root lineage.
* Earlier migrations: Migration 1 → 2 (0.6) gives every club neutral ownership
  ambition (`ambition` 0, `ownerSince` null) and the new `ownership` setting at 0. Migration 2 → 3 (0.6)
  adds empty stories for past seasons (they cannot be re-detected), an empty head-to-head table counted
  from the current season (`h2hSince`, shown in the UI) and empty derby lists.
* Every save has `schema`. `upgradeWorld` runs registered migrations (`MIGRATIONS[n]: n → n+1`) and
  fills defaults for new fields. Saves from a newer schema are rejected with a clear message.
* Browsers that block storage for `file://` pages get an on-screen message pointing to export/import.

## Performance (measured)

Measured in this container (Node 22, headless Chromium):

| Scenario | Result |
|---|---|
| Engine, 100 seasons, Essential | 0.53 s (5.3 ms/season), retained heap 5 MB |
| Engine, 100 seasons, Standard | 1.39 s (13.9 ms/season), retained heap 12 MB |
| Engine, 100 seasons, Full | 1.33 s, retained heap 23 MB |
| Browser, 100 seasons in worker (Standard) | about 2.5 s including transfer |
| Browser main-thread worst timer delay during bulk run | 21–25 ms (20 ms requested) |
| Browser JS heap after 101 seasons | 37–68 MB (varies with garbage-collection timing) |
| Initial page load from `file://` | about 0.1 s |
| `dist/app.js` | 197 KB minified (engine + UI + embedded worker) |
| Crests | 116 × 96 px WebP = 568 KB (plus 192 px copies for profile headers) |

Re-measured for 0.6 with `node --expose-gc --experimental-strip-types tools/perf.mjs` on a slower
container. 0.5 and 0.6 were measured on the same machine so they are directly comparable:

| 100 seasons | 0.5 | 0.6 goal 1 (ownership) | 0.6 goal 2 (stories, rivalries) |
|---|---|---|---|
| Essential | 0.78 s · 2.71 MB (0.40 MB gz) | 0.76 s · 2.72 MB (0.41 MB gz) | 1.1–1.3 s · 3.55 MB (0.54 MB gz) |
| Standard | 1.99 s · 5.51 MB (0.94 MB gz) | 2.07 s · 5.53 MB (0.95 MB gz) | 2.27 s · 6.82 MB (1.17 MB gz) |
| Full | 1.93 s · 15.25 MB (2.15 MB gz) | 1.80 s · 15.26 MB (2.15 MB gz) | 2.40 s · 16.56 MB (2.37 MB gz) |

0.7 goal 3: a 1992/93 world (114 clubs, through every rule change) simulates 100 seasons in 1.07 s at Essential
(3.59 MB) and 2.04 s at Standard (6.91 MB). `dist/app.js` is 295 KB (the larger 1992 database and the frozen 0.6
configuration).

0.7 relative ownership (goal 1) measured 0.75 s · 3.64 MB (0.55 MB gz) at Essential, 1.83 s · 6.91 MB (1.18 MB gz) at
Standard and 1.94 s · 16.66 MB (2.38 MB gz) at Full: no measurable cost; the saves are about 0.1 MB larger (more
ownership news).

Goal 3 adds no per-step cost; a 1992/93 world simulates 100 seasons in 2.3 s (Standard, 5.8 MB).
`dist/app.js` is 271 KB in 0.7 (305 KB in 0.6; both club databases once, without the provenance strings). Before the build
change, the 1992 database pushed it to 665 KB because a module-level property access kept a second
and third copy of the data in the worker bundle.

Goal 2 adds about 3–4 ms per season. Profiling showed head-to-head bookkeeping and the end-of-season matchday
tracks as the main costs; head-to-head now uses a numeric-key runtime cache. The extra save size is mostly derby
news (~0.25 MB per century), the head-to-head table (~0.3 MB, bounded) and, at Standard, race tracks
(~0.4 MB).

Crests are separate cached image files referenced by stable URLs and lazy-loaded. Nothing is embedded
as base64 in the HTML, which was the 0.4.x performance problem. Charts draw to canvas with per-pixel
min/max decimation, so matchday-level histories (~4,600 points per century) render instantly.

## Testing

* `npm test`: 71 engine tests covering database integrity, fixture counts and uniqueness, home/away
  balance, clash-free calendar, scoring, tiebreakers, promotion/relegation counts, play-off brackets
  (including the six-team Championship format), FA Cup and EFL Cup structure, single winners,
  history consistency, graph data, best/worst ranking rules, attribute bounds, determinism,
  save/load equivalence, bulk vs step-by-step equivalence, and pause/resume equivalence.
* `node tools/browser-test.mjs`: 65 end-to-end checks in headless Chromium against `dist/` opened via
  `file://`, with all network requests blocked. Covers navigation, club links, graph hover and tooltips,
  decimal formatting, badge loading, matchday controls, competitions, history pages, settings, saves
  and reload, a 100-season bulk run with pause/resume and cancel, responsiveness, memory, phone-width
  layout and zero console errors.
