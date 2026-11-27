# Changelog

## 0.6.0 (in progress)

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
