# Changelog

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
