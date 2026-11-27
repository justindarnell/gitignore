# Handoff: state after the 0.7.0 session (2026-11-27)

Read this first, then README.md, docs/TECHNICAL.md, docs/CALIBRATION.md and docs/KNOWN-ISSUES.md.

## Where things are

* Repo `justindarnell/gitignore`, project folder `soccer-world-sims/`.
* Branch **`claude/hopeful-fermat-hbku3z`**, built on the 0.6.0 branch `claude/hopeful-archimedes-28xqvy`. One commit per goal:
  * `7e738c2`: relative ownership (calibrated, **adopted**)
  * `9945260`: multi-fork experiments
  * `cbaa716`: dated rule changes; the 1992 start gains the Football Conference
  * `e551b31`: the 1992/93 start against real history (economic path, **adopted** for 1992 worlds)
  * `810d065`: administration and points deductions (**not adopted** as default; setting at 0%)
* Version 0.7.0, save **schema 8** (migrations 1→…→8 in `src/persistence/save.ts`; every 0.7 migration keeps old saves
  on the model they were created with).

## Baseline to confirm

```sh
cd soccer-world-sims
npm install && npm test && npm run build && node tools/browser-test.mjs
# expected: 71 engine tests pass, 65/65 browser checks
node --expose-gc --experimental-strip-types tools/perf.mjs
```

* `npm run history:fetch` downloads engsoccerdata, openfootball and (0.7) Wikipedia pages. Node's fetch only uses the
  sandbox proxy with `NODE_USE_ENV_PROXY=1`. Wikipedia needs `en.wikipedia.org` on the network allowlist: this session
  used a personal environment named "gitignore" that allows it.

## What 0.7 added (where to look)

| Area | Files |
|---|---|
| Relative ownership: target shift scaled by headroom below `ambRepRef` | `src/engine/evolution.ts`, `params.ts` (`ambLift`, `ambDrop`, `ambRepRef`, `MODEL_06`) |
| Calibration `own-refine`, `own-validate` (holdout4-), `sensitivity --source own` | `tools/calibrate/run.mjs`, results `calibration/results/own-*.json` |
| Experiments page and engine | `src/engine/experiments.ts`, `src/ui/pages/experiments.ts`, worker message `experiment` |
| Dated rule changes | `src/engine/rules.ts` (`configFor`, `validateChanges`), `CountryConfig.changes`, `src/data/england/config1992.ts` |
| 1992 Conference data | `tools/history/wikitable.mjs`, `fit.mjs` / `build-db.mjs` / `master1992.mjs` (`--start 1992`) |
| Frozen 0.6 1992 rules for old saves | `src/data/england/config1992-frozen.ts` (country `ENG1992-0.6`) |
| Real 1992–2024 outcomes and CRPS scoring | `tools/history/real1992.mjs`, `tools/calibrate/real92.mjs`, phases `start92-grid`, `start92-validate` |
| Economic path of historical starts | `levelCurveAt` in `evolution.ts`, `StartDef.levelPath`, `World.levelPath`, params `levelPathAmount/Shape` |
| Administration | `src/engine/administration.ts`, `LeagueConfig.adminDeduction`, `tools/history/administrations.mjs`, phase `admin-check` |

## Key decisions and facts to keep

* **Adoption rules are pre-registered** and written into the phase code before it runs. Used holdout prefixes:
  `holdout-`, `holdout2-`, `holdout3-`, `holdout4-` (ownership), `holdout5-` (administration), `holdout92-` (1992 start).
  **Use a fresh prefix (e.g. `holdout6-`) for the next structural change.** Never hand-tune from a single run.
* Search bases are explicit (`MODEL_06`, `{ ...DEFAULT_PARAMS, levelPathAmount: 0 }`), so old phases reproduce after
  adoption. Keep that when adopting anything new.
* Administration draws use a sub-stream seeded from the world's RNG state, so the main stream is untouched (at 0% the model
  is bit-identical, tested). Experiments re-seed the RNG with labels that ignore interventions (common random numbers).
  Stories, head-to-head, rule-change news and interventions consume no randomness. Keep it that way.
* The 1992 search restricted `levelPathAmount` ≤ 1 for a stated reason (beyond 1, 1992 worlds would be more stratified
  after 2025 than the validated 2026 model). The adopted path (amount 1, shape 0) means "2025/26 economic structure from
  the first season"; the timing was not identifiable.
* League ids and order must never change between eras (history and snapshots rely on it). `startSeason` throws if a
  league's membership does not match the config size; `validateChanges` is tested to 2040.
* esbuild inlines `define` values at every use: the worker source is referenced once (`WORKER_URL` in `main.ts`).
* Any change to `World` requires a schema bump plus a migration plus a test. Every feature needs engine tests and browser
  checks. Measure perf and save size after each goal. Update CHANGELOG.md and the docs. Commit and push after each goal.

## Measured (this container, 100 seasons)

| Storage | Time | Save (JSON / gzip) |
|---|---|---|
| Essential | ≈0.75–1.0 s | 3.64 / 0.55 MB |
| Standard | ≈1.8–2.2 s | 6.91 / 1.18 MB |
| Full | ≈1.9 s | 16.66 / 2.38 MB |
| 1992 start, Standard | ≈2.0 s | 6.91 MB |

`dist/app.js` is 300 KB. An experiment of 40 runs × 10 seasons takes about 1.5–2 s in the browser.

## Suggested next steps (priority order)

1. **Promoted-club variety** (top-half finishes ≈10% vs 19%) is still the biggest unaddressed weakness after ownership.
   Look at what makes real promoted sides vary: parachute money, squad-building in the summer.
2. **Era giants over 100 years** (≈51% relegated within 30 years vs 35%), which also blocked administration as a default.
   A mechanism that makes elite status stickier at the very top might let administration be adopted.
3. **A playable sixth tier** (Conference North/South or a generic pool): it would fix the 1992 Conference artefact (≈18 of
   22 clubs reach the League vs 6) and allow the Conference to grow to 24 in 2006.
4. Time-varying administration rate (the 2000s wave) and profit-and-sustainability deductions.
5. Save experiment results with the world (they are memory-only), and CSV export of experiment and history tables.
6. Other ideas from 0.6 still open: season replay from race tracks, chart data tables, Essential perf, FA Cup replays as
   config, more start seasons (the dated-rules mechanism makes each one a config plus a database), licensing-safe badges.

## Gotchas from this session

* Don't `git stash` while a calibration is running in the background: new phases import `src/` at start.
* The browser test's world seed comes from the clock, and hash navigation keeps in-memory UI state (experiment results),
  so layout checks can be flaky with content. The phone-width checks now report the offending elements.
* Wikipedia's API is rate-limited for anonymous clients; plain `/wiki/` pages with a generic User-Agent worked.
* Settings multiply parameters: when measuring an optional mechanism, set the setting explicitly (the administration
  check first ran with the old default and had to be redone).
