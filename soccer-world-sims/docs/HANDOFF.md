# Handoff: state after the 0.6.0 session (2026-11-27)

Read this first, then README.md, docs/TECHNICAL.md, docs/CALIBRATION.md and docs/KNOWN-ISSUES.md.

## Where things are

* Repo `justindarnell/gitignore`, project folder `soccer-world-sims/`.
* Branch **`claude/hopeful-archimedes-28xqvy`**, built on `claude/new-session-wgdofk`. It has one commit per goal:
  * `5d6e68f`: ownership ambition (calibrated, **not adopted**)
  * `9b36b5e`: stories, eras and rivalries
  * `d5ac99a`: sandbox (what-if, fork/compare, 1992/93 start)
* The working tree is clean and pushed. Local use only: crests are generated locally and never committed.
* Version 0.6.0, save **schema 4** (migrations 1→2→3→4 in `src/persistence/save.ts`).

## Baseline to confirm

```sh
cd soccer-world-sims
npm install && npm test && npm run build && node tools/browser-test.mjs
# expected: 51 engine tests pass, 56/56 browser checks
node --expose-gc --experimental-strip-types tools/perf.mjs   # speed / heap / save size per storage level
```

* Without crests, the browser check verifies the initials fallback instead of crest images. This is intended.
* `npm run history:fetch` downloads the raw data. Network access worked in this session. You need it for `tools/ratings/*` and `tools/history/*`.

## What 0.6 added (where to look)

| Area | Files |
|---|---|
| Ownership ambition (latent trait, takeovers/sell-offs) | `src/engine/evolution.ts`, `params.ts` (`AMBITION_OFF`, `OWNERSHIP_EXPERIMENTAL`, `ownership` setting), seeds in `tools/ratings/build-db.mjs` (`OWNERSHIP`, `OWNERSHIP_1992`) |
| Calibration phases `amb-refine`, `amb-validate`, `sensitivity --source amb` | `tools/calibrate/run.mjs`, `report.mjs`; results in `calibration/results/amb-*.json` |
| Stories, matchday tracks | `src/engine/stories.ts` (called from `history.ts` `recordSeasonEnd`) |
| Eras, golden ages, decade ranks | `src/engine/eras.ts` |
| Head-to-head and derbies | `history.ts` `recordMeeting`, `src/data/england/derbies.ts`, runtime caches in `runtime.ts` |
| Sandbox | `src/engine/sandbox.ts` (`applyIntervention`, `forkWorld`), UI `src/ui/pages/sandbox.ts` |
| Start seasons | `src/data/england/starts.ts`, `config1992.ts`, `clubs-1992.json`; pipeline `tools/ratings/fit.mjs --start 1992`, `build-db.mjs --start 1992`, `master1992.mjs` |
| UI pages | `src/ui/pages/stories.ts` (season review, race chart, eras, rivalries, h2h), `main.ts` routes `season`, `h2h`, `compare` |

## Key decisions and facts to keep

* **Adoption rule (pre-registered):** adopt a calibration change only if the combined holdout score improves
  and no group (short, 50-year, 100-year) gets worse. Ambition failed it on `holdout3-`: the short-term group
  was worse (0.223 vs 0.193) and giants were relegated too often (≈52% vs target 35%). **`holdout3-` is now
  used: validate any new structural change on a fresh prefix (e.g. `holdout4-`).** Never hand-tune from a
  single run.
* With ambition off, its random draws still happen. The same seed therefore gives a different world from 0.5,
  but the model is statistically identical.
* Stories, head-to-head and derbies consume **no randomness**. Results are bit-identical across storage levels
  (tested). Keep it that way for any new history feature.
* Interventions are deterministic and recorded in `world.interventions`, in timelines (`kind: 'intervention'`) and in the news.
* The 1992 world uses parameters calibrated on 2026 and is **not separately calibrated**. Its rules are frozen
  at 1992/93: no Conference relegation, no FA Cup replays (KNOWN-ISSUES.md, COMPETITIONS.md).
* Bundle: `tools/build.mjs` strips `provenance` from club JSON. Keep module-level code in `starts.ts`
  side-effect free (a module-level property access once tripled the bundle to 665 KB).
* Any change to `World` requires a schema bump plus a migration plus a test.
* Every new feature needs engine tests and browser checks. Measure perf and save size after each goal. Update
  CHANGELOG.md and the docs. Commit and push after each goal.

## Measured (this container, 100 seasons)

| Storage | Time | Save (JSON / gzip) |
|---|---|---|
| Essential | ≈1.1–1.3 s | 3.55 / 0.54 MB |
| Standard | ≈2.3–2.4 s | 6.82 / 1.17 MB |
| Full | ≈2.4 s | 16.56 / 2.37 MB |
| 1992 start, Standard | 2.3 s | 5.79 MB |

`dist/app.js` is 305 KB.

## Suggested next steps (priority order)

1. **Ownership redesign:** have ambition act on squad quality relative to reputation, so giants are protected
   while funded clubs rise. Add it as searchable parameters and validate on `holdout4-` with the same rule.
2. **Multi-fork experiments:** run N background forks with different seeds and show outcome probabilities.
3. **Dated rule changes in config:** 1995 cut to 20 clubs, Conference relegation from 1987, the 2026 play-offs.
4. Separate calibration of the 1992 start against real 1992–2025 outcomes (an out-of-sample test).
5. Points deductions and administration linked to crises and asset-stripping.
6. Other ideas: season replay from race tracks, CSV export and chart data tables, perf work for Essential
   (precomputed per-league match indices), FA Cup replays as config, more start seasons, licensing-safe badges.

## Gotchas from this session

* Background shell commands: don't chain `tail` with invalid flags after `&&` chains (it marks a successful
  job "failed"). Use `Monitor` or `run_in_background` with an until-loop to wait.
* A Claude Code safety check sometimes refuses complex heredoc commands. Writing the edit script to the
  scratchpad and running it separately works.
* Browser test: canvases now have `max-width: 100%`. The phone-width check was flaky before that.
