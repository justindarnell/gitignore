# Soccer World Sims

A long-term football world simulation sandbox. Start from the real 2026/27 English pyramid
(116 clubs, five divisions, FA Cup and EFL Cup) and watch football history unfold over decades,
without managing a team. Clubs rise, dynasties form and fade, giants stumble and underdogs win
trophies, all driven by a statistically calibrated engine rather than scripted outcomes.

Version **0.7.0**. 0.5 was a clean rebuild of the 0.1–0.4.3 prototypes.

## Play

1. Open `dist/index.html` in a modern desktop browser (Chrome, Edge, Firefox, Safari).
   It works offline, straight from disk. No server, install or network is needed.
2. Use the simulation bar: **Next matchday**, **Month**, **Rest of season**, **One year**,
   **N seasons**, or **100 seasons**. Long runs execute in a background worker with a progress bar,
   and you can **Pause** (keep progress) or **Cancel** (discard the run).
3. Click any club name or crest to open its profile, with interactive history graphs.

Club crests are **not** included in this repository (see [Licensing](#licensing)). Without them
the game shows initials badges. To add crests from your own FootyLogos pack:

```sh
npm install
npm run crests -- /path/to/extracted/pack   # folders: premier-league, efl-championship, ...
npm run build                                # copies crests into dist/crests
```

See [docs/USER-GUIDE.md](docs/USER-GUIDE.md) for the full guide.

## What is in the box

| Area | Highlights |
|---|---|
| World | 116 real clubs in verified 2026/27 divisions, or a 1992/93 start (92 clubs, era rules); data-driven country/competition config |
| Sandbox | What-if editing and injected events (recorded as interventions), fork a world, compare two timelines side by side |
| Match engine | Poisson goals from attack/midfield/defence powers, home advantage, Dixon–Coles low-score correction, per-match upset noise, seasonal form, cup squad rotation, extra time, penalties |
| Competitions | Double round-robin leagues with full tiebreakers; the new six-team Championship play-off; League One/Two/National League play-offs; FA Cup (incl. 4th qualifying round with non-playable qualifiers) and EFL Cup (regional rounds, two-legged semis) |
| Club evolution | Reputation, stability, development cycles, rank-based economics, promotion/relegation effects, title fatigue, ten kinds of random events, ownership (takeovers and sell-offs that shift smaller clubs; established giants shielded) |
| History | Rolls of honour, trophy totals, historical tables, movements, records, most improved/declined, best/worst matches, timelines, news |
| Stories | Story of the season (final-day races, collapses, great escapes, runs, records, giant-killings), eras and dynasties, golden ages, decades bump chart, title-race charts, derbies and head-to-head records |
| Saves | IndexedDB slots, autosave, export/import (gzip), schema versioning, three storage levels |
| Calibration | ~1.1M simulated seasons across grid, Latin-hypercube and local searches, holdout validation and sensitivity analysis — [report](docs/CALIBRATION.md) |
| Tests | 53 engine tests (`npm test`) + 56 end-to-end browser checks from `file://` |

## Develop

Requires Node.js 22+.

```sh
npm install
npm test                      # engine correctness tests (node:test, runs TypeScript directly)
npm run typecheck
npm run build                 # -> dist/
node tools/browser-test.mjs   # end-to-end checks in headless Chromium (needs Playwright)
npm run history:fetch         # download raw historical data (not committed)
npm run history:benchmarks    # -> data/history/derived/
node tools/ratings/fit.mjs && node tools/ratings/build-db.mjs   # rebuild the club database
node tools/ratings/fit.mjs --start 1992 && node tools/ratings/build-db.mjs --start 1992   # 1992/93 start database
node --expose-gc --experimental-strip-types tools/perf.mjs     # speed, heap and save size per storage level
node tools/calibrate/run.mjs <phase>                             # see docs/CALIBRATION.md
```

```
src/engine/       headless simulation engine (no DOM): world, match, schedule, table, evolution, events, history, sim
src/data/england/ country config (leagues, play-offs, cups, calendar, regions) and clubs.json
src/persistence/  save serialisation, schema versioning and migration
src/worker/       bulk-simulation web worker
src/ui/           dashboard: pages, chart component, IndexedDB store, styles
tools/            history acquisition, rating fit, crest conversion, calibration, build, browser tests
data/history/     derived historical tables and calibration benchmarks
calibration/      raw calibration results (JSON)
docs/             technical, data, competitions, calibration, user guide, known issues, roadmap
dist/             playable offline build
```

## Documentation

* [Technical documentation](docs/TECHNICAL.md): architecture, models, determinism and performance
* [Calibration report](docs/CALIBRATION.md): methods, results, why this model, weaknesses
* [Data sources and licensing](docs/DATA-SOURCES.md): club database, ratings, verification
* [Competition rules](docs/COMPETITIONS.md): formats and documented simplifications
* [Audit of 0.4.3](docs/AUDIT-0.4.3.md): what was wrong in the previous build
* [User guide](docs/USER-GUIDE.md) · [Known issues](docs/KNOWN-ISSUES.md) · [Roadmap](docs/ROADMAP.md) · [Changelog](CHANGELOG.md)

## Licensing

The code in this folder is yours to license as you choose. Third-party material has its own terms:

* **Club crests** are trademarks of their clubs. They were supplied via FootyLogos.com for a private
  prototype; that does **not** grant permission to redistribute them publicly. They are therefore
  excluded from git (this repository is public) and must be generated locally. Before any public
  release, obtain permission or ship without crests (the initials fallback is built in).
* **Historical data**: see [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) (openfootball is public domain;
  engsoccerdata terms apply to its data).
