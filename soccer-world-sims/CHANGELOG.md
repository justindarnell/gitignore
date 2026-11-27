# Changelog

## 0.7.0 (2026-11-27)

### Goal 1: relative ownership (adopted)
* Redesigned ownership: owners now shift a club's structural target **relative to its standing**. The shift
  scales with headroom below the elite (`ambRepRef`), so established giants are shielded from asset-strippers,
  while funded smaller clubs can rise well above what their reputation supports (`ambLift`, `ambDrop`).
  Promotion investment and development upside from 0.6 remain.
* Calibration: 4 rounds (289 candidate evaluations) from the 0.6 model, then validation on new `holdout4-` seeds
  under the same pre-registered rule. **Adopted:** combined holdout score 0.284 vs 0.325, with no group worse
  (short 0.203 vs 0.211, 50-year 0.320 vs 0.438, 100-year 0.411 vs 0.441). Lower-league risers and champion
  points moved toward history; promoted-club top-half finishes did not; era giants are relegated less over
  50 years but more over 100. Report: docs/CALIBRATION.md, "0.7: relative ownership". Sensitivity re-run.
* New defaults: ownership on, and re-tuned promoBoost, relegHit, revert, eraSD, promoEra, repWeight,
  rankEconomics, ceiling and ceilingCost. The **Ownership dynamics** setting now scales every ownership
  effect (100% = calibrated, 0% = off) instead of adding the 0.6 experimental finalist.
* Save schema 5. The migration keeps old saves on their own model (new ownership parameters off, the old
  experimental setting folded into the stored parameters).
* Calibration phases `own-refine`, `own-validate`, `sensitivity --source own`. Search bases are explicit
  (`MODEL_06`), so the 0.6 and 0.7 phases reproduce after adoption.

### Goal 2: multi-fork experiments
* New **Experiments** page: run 2–500 alternative futures of the current world (1–100 seasons) in parallel
  background workers, then see title, top-four, cup, promotion and relegation odds, final-position ranges, the
  likeliest champions per season and a fan chart for any club. The world itself is untouched.
* Runs are re-seeded forks whose streams do not depend on interventions, so rerunning after a what-if change
  compares like with like (Δ columns against the previous experiment from the same point).
* Engine module `experiments.ts` (`runExperiment`, `summarise`, `clubFan`); 4 engine tests and 5 browser checks.
* The embedded worker source is now referenced once: `dist/app.js` shrinks from 306 KB to 271 KB (esbuild
  inlined it at every use).
* Toasts no longer exceed the viewport at phone width; experiment tables scroll inside their cards.

## 0.6.0 (2026-11-27)

### Goal 1: ownership ambition (realism experiment, not adopted)
* New latent club trait **ownership ambition** (−1 asset-stripping … +1 wealthy takeover) with slow drift,
  takeovers and sell-offs (club timelines, news filter "Ownership"), effects on the structural target,
  promotion investment and upside of development. 25 clubs are seeded from documented ownership situations
  (provenance in `clubs.json`); the rest start neutral.
* Calibration: 4 refinement rounds (228 candidate evaluations) from the 0.5 defaults, then validation on new `holdout3-`
  seeds. **Not adopted:** the best finalist improved the combined score (0.270 vs 0.282) but worsened the
  short-term group and over-relegated giants. Defaults keep it off; the opt-in **Ownership dynamics
  (experimental)** setting uses the best finalist. Report: docs/CALIBRATION.md, "0.6: ownership ambition".
* The ambition draws are made every season, so the random stream differs from 0.5 at the same seed. The model
  is statistically unchanged.
* Club profiles show ownership (badge, −100…+100 meter, owners since); the clubs directory adds an OWN column.
* The "New ownership investment" random event is renamed "Commercial investment boost" (same effect).
* Save schema 2 (migration: neutral ambition for every club).
* Builds without locally generated crests no longer request missing images (initials badges, no console
  errors); the browser check verifies the fallback instead of failing.
* `tools/perf.mjs` measures speed, heap and save size per storage level.

### Goal 2: stories, eras, title races and rivalries
* **Story of the season**: final-day title races, runaways, see-saw races, invincibles, unbeaten, winning and
  losing runs, collapses into relegation, great escapes, points records and cup giant-killings. Detected from
  data the engine already holds, with no randomness consumed (results are bit-identical to Goal 1). Stories are
  shown on a new **season review** page, on the overview, in the season list and in the news.
* **Eras and dynasties**, club **golden ages** and a **decades bump chart** (History → Eras & dynasties).
* **Title-race chart** on the standings page (live this season; stored at Standard for past seasons).
* **Rivalries**: 33 configured derbies, head-to-head aggregates for every pair of clubs, a head-to-head
  page, derby records on club profiles and derby news.
* Storage: stories and head-to-head at every level; race tracks and the last 10 derby meetings at Standard+.
  100-season saves: Essential 3.6 MB, Standard 6.8 MB, Full 16.6 MB. Save schema 3 with migration.
* Charts never overflow their card at phone width, and chart legends wrap.

### Goal 3: sandbox tools
* **What-if editing** on club profiles: attribute edits and injected events (takeover, sell-off, crisis,
  windfall). They are deterministic and recorded as user interventions (timeline ✎, news, Saves page).
* **Fork and compare**: fork a world (keep or switch), compare two timelines (champions, tables, a club's
  path, settings and interventions, first divergence), and catch up a timeline that is behind in a worker.
* **Historical start 1992/93**: 92 clubs from engsoccerdata, rated with the same pipeline using only
  1988/89–1991/92 data (`fit.mjs`/`build-db.mjs --start 1992`). Divisions are verified by tests. The era rules are
  config (`config1992.ts`) with two new generic options: qualifier ratings and away goals in two-legged rounds.
* UI no longer assumes 116 clubs or 2026 competition names; cup format texts come from config.
* Save schema 4 (start season, interventions, lineage). 51 engine tests, 56 browser checks.
* Bundle: club data is included once and without provenance strings (305 KB `app.js`).

## 0.5.0 (2026-11-27): complete rebuild

### Data
* Verified all 116 club divisions for 2026/27 (sources in docs/DATA-SOURCES.md).
* New club database: opposition-adjusted rating fit over 2022/23–2025/26 for all five tiers;
  reputation from 30 seasons of pyramid history plus pedigree; stability from rank volatility plus
  documented adjustments; relative, capped form estimates; provenance recorded for each club.
* Historical benchmark dataset (1888/89–2025/26) with explicit date ranges.
* Crests converted to 96/192 px WebP as separate cached files (git-ignored in this public repository).

### Rules
* Six-team Championship play-off (new for 2026/27).
* Full tiebreakers including head-to-head.
* FA Cup from the Fourth Qualifying Round, with marked non-playable qualifiers; no replays.
* EFL Cup with byes, regional early rounds, a European-entrant stand-in, no extra time before the
  final, and two-legged semi-finals.
* Extra time and penalties replace coin flips.

### Engine
* Deterministic seeded engine, independent of the UI, with a serialisable world.
* New match model: attack/defence Poisson, Dixon–Coles, per-match noise, cup rotation.
* New evolution model: rank-based economics, slow reputation, stability, development cycles,
  asymmetric recovery, promotion momentum, consecutive-title fatigue, ten event types.

### Calibration
* Automated framework with documented targets, two-group scoring, common-random-number screening,
  Latin-hypercube and local search, two independent holdout validations, and sensitivity analysis.
  About 1.1M simulated seasons in total. Report: docs/CALIBRATION.md.

### Interface
* New dark dashboard: Overview, Standings, Fixtures, Cups, Clubs, club profiles, History, News,
  Settings, Saves.
* Interactive canvas graphs with crosshair and tooltips (rating, reputation, stability, combined
  pyramid position by season or matchday).
* Bulk simulation in a web worker with progress, pause/resume and cancel.
* IndexedDB saves, autosave, gzip export/import, schema versioning, three storage levels.

### Quality
* 28 engine tests and 34 end-to-end browser checks (offline, `file://`).

## 0.1.0–0.4.3
Prototype versions developed earlier; see docs/AUDIT-0.4.3.md.
