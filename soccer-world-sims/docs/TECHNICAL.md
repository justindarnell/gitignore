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
            │ history.ts    snapshots, records, honours, timelines, news                 │
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

### Ownership ambition (0.6, off by default)

`ambition` is a slow latent club trait in [−1, 1] (−1 asset-stripping, 0 steady, +1 wealthy takeover),
seeded from documented ownership situations (`OWNERSHIP` in `tools/ratings/build-db.mjs`, provenance in
`clubs.json`). Each season `A ← ambPersist·A + 0.05·N(0,1)`, and with probability `ownerEventRate` the club
changes hands: a takeover (A = 0.5…1) or a sell-off (A = −0.45…−0.95), with takeovers likelier at big or
run-down clubs and sell-offs likelier after relegation or turmoil. Ambition shifts the structural target
and upkeep ceiling (`ambTarget`·A), scales promotion investment (`1 + ambPromo·A`), skews development shocks
toward the upside without changing their mean (`ambUpside`) and erodes stability when negative. Ownership
changes are written to club timelines (kind `owner`) and the news.

Calibration did **not** adopt the mechanism (CALIBRATION.md), so `DEFAULT_PARAMS` has `ambTarget`,
`ambPromo`, `ambUpside` and `ownerEventRate` at 0. The draws still happen every season, so turning the
mechanism on does not shift the rest of the random stream. The **Ownership dynamics** setting adds
`k ×` the best finalist's values (`OWNERSHIP_EXPERIMENTAL`).

Every channel is bounded and mean-reverting. Success raises reputation and revenue, but fatigue,
ceiling upkeep and reversion stop "winning makes you win forever". Failure lowers them, but recovery
toward reputation and asymmetric reversion stop irreversible collapse.

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

| Level | Stored per season | 100 seasons (measured) |
|---|---|---|
| Essential | final tables, champions, movements, cup winners/finals, club snapshots (ratings, reputation, stability, position), timelines, news | 2.7 MB JSON (0.4 MB gzipped) |
| Standard (default) | + matchday-by-matchday positions, full cup results, best/worst matches, world records | 5.5 MB (0.9 MB gzipped) |
| Full | + every league result | 15.3 MB (2.2 MB gzipped) |

Best/worst matches are ranked as follows. **Biggest wins**: larger margin, then more goals scored,
then away wins ahead of home wins, then the earlier match. **Heaviest defeats**: larger margin, then
more goals conceded, then home defeats ahead of away defeats, then the earlier match.

## Saves

* IndexedDB database `soccer-world-sims`: a `saves` store holds the world as JSON text, and a `meta`
  store holds slot metadata (name, seed, season, date, size). Autosave writes after every simulation.
* Export downloads `.sws.json.gz` (gzip via `CompressionStream`, or plain JSON when that is
  unavailable). Import accepts both.
* Every save has `schema` (currently 2). Migration 1 → 2 (0.6) gives every club neutral ownership
  ambition (`ambition` 0, `ownerSince` null) and the new `ownership` setting at 0.
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

| 100 seasons | 0.5 | 0.6 (goal 1: ownership ambition) |
|---|---|---|
| Essential | 0.78 s · 2.71 MB (0.40 MB gz) | 0.76 s · 2.72 MB (0.41 MB gz) |
| Standard | 1.99 s · 5.51 MB (0.94 MB gz) | 2.07 s · 5.53 MB (0.95 MB gz) |
| Full | 1.93 s · 15.25 MB (2.15 MB gz) | 1.80 s · 15.26 MB (2.15 MB gz) |

Crests are separate cached image files referenced by stable URLs and lazy-loaded. Nothing is embedded
as base64 in the HTML, which was the 0.4.x performance problem. Charts draw to canvas with per-pixel
min/max decimation, so matchday-level histories (~4,600 points per century) render instantly.

## Testing

* `npm test`: 34 engine tests covering database integrity, fixture counts and uniqueness, home/away
  balance, clash-free calendar, scoring, tiebreakers, promotion/relegation counts, play-off brackets
  (including the six-team Championship format), FA Cup and EFL Cup structure, single winners,
  history consistency, graph data, best/worst ranking rules, attribute bounds, determinism,
  save/load equivalence, bulk vs step-by-step equivalence, and pause/resume equivalence.
* `node tools/browser-test.mjs`: 35 end-to-end checks in headless Chromium against `dist/` opened via
  `file://`, with all network requests blocked. Covers navigation, club links, graph hover and tooltips,
  decimal formatting, badge loading, matchday controls, competitions, history pages, settings, saves
  and reload, a 100-season bulk run with pause/resume and cancel, responsiveness, memory, phone-width
  layout and zero console errors.
