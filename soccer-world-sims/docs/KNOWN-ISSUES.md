# Known issues and limitations

## Statistical (from the holdout validation; see CALIBRATION.md)

* Promoted Premier League clubs finish in the top half about 10% of the time (history: 19%). Their
  survival rate (≈52%) is right, but promoted clubs are too uniform.
* Lower-league clubs reach the top flight within 25 years less often than in 1960–95 history
  (≈11% vs 19.6%). That historical cohort was unusually mobile, so the modern-era target is uncertain.
* Long-run champions average ≈85 points (1995–2025 average: 87.5; the last two real seasons: 84–85).
* **Relative ownership (0.7, adopted)** improved the overall holdout score (0.284 vs 0.325) and moved
  lower-league risers (25 years: 10.3% → 12.1%) and champion points (84.2 → 85.1) toward history, but promoted
  clubs still finish in the top half about 10% of the time. Over 100 years, the top five of each era are
  relegated within 30 years in about 51% of cases (target 35%), worse than 0.6 on the same seeds (44%); over
  50 years it is better (46% vs 54%). The initial giants are unaffected (their reputation is above the
  ownership threshold).
* **Ownership ambition (0.6) did not fix these.** The new latent ownership trait was searched and
  validated on fresh `holdout3-` seeds. Every finalist improved lower-league mobility (25-year risers 10.6% →
  13.6%) and title streaks, but none moved promoted top-half finishes much (10.5% → 11.4%) or champion points
  (85.3 → 85.8). Every finalist also pushed the relegation of each era's giants well past the target (40% → 52%).
  The best one also lowered first-season table spread. Under the pre-registered adoption rule it was rejected and is
  was off by default in 0.6. 0.7 implemented the suggested redesign (above): ownership acting relative to
  the club's standing, so established giants are shielded.
* Top-5 clubs are relegated within 30 years in ≈51% of cases over a century (target 35%, post-war history 52%).
* Five-goal margins are slightly more common than in history (≈2.35% vs 2.1–2.3%), and 9+-goal margins remain about twice as common as in 1995–2024 (still extremely rare: under 1 per 10,000 league games).
* Ownership seeds are judgements from documented takeovers and crises (25 clubs). All other clubs start
  neutral, and saves from 0.5 start every club neutral.
* Initial ratings are fitted from results only. Summer transfers, wages and injuries are invisible to
  the model. Midfield is derived (mean of attack and defence) because goal data cannot identify it.
* Several modern-era targets are explicit judgements (documented in `tools/calibrate/targets.mjs`).

## Stories and rivalries

* In-season positions used by stories (lead changes, collapses, great escapes) rank by points, goal difference
  and goals scored only. Final positions use the full tiebreakers.
* Story thresholds (e.g. 6 lead changes, 20-game unbeaten runs in the top flight) are judgements, chosen so a
  typical season produces a handful of stories.
* The derby list is a curated set of well-known pairs, not exhaustive. Head-to-head totals in saves upgraded from
  an earlier version count from the upgrade season only. Individual meetings are listed only where stored
  (derbies and cup ties at Standard, league games at Full).

## Sandbox and the 1992/93 start

* The engine parameters were calibrated on the 2026/27 pyramid. The 1992 world has not been calibrated
  separately. Its fitted divisions are much closer in strength, so it is more open than 2026 worlds (17–21
  different champions in 60 seasons in three test worlds, and mid-sized clubs can build long title runs).
  Treat it as a sandbox, not a validated reconstruction.
* Rules are frozen at 1992/93: 22 Premier League clubs forever, no Conference relegation, no FA Cup replays
  (COMPETITIONS.md).
* Ownership ambition edited through *What-if* shapes development from the next season end. It has no
  structural effect at clubs whose reputation is above the elite threshold (81). Injected events always
  apply their immediate effects.
* Experiment results are not saved with the world; they last until the page is reloaded. The common random
  numbers that make before/after comparisons fair only stay aligned while a change keeps the number of random
  draws the same (cup draws involving the changed club eventually decorrelate the runs).
* Comparing needs timeline B stored in this browser (IndexedDB). Worlds from different start seasons cannot
  be compared.

## Rules

* Simplifications are documented in COMPETITIONS.md: European entrants are approximated as the
  previous top 7; FA Cup qualifiers are generic and earlier qualifying rounds are not simulated; there
  are no points deductions and no deciding play-off matches for level points.
* The six-team Championship play-off format follows reporting from before its final ratification.
* Regions for the EFL Cup regional draw are approximate.

## Technical

* `file://` storage: Chromium keeps IndexedDB for local files. Some browsers or privacy modes block
  it; the Saves page then shows a notice, and export/import still works.
* Pausing a bulk run shows a modal; the rest of the interface is available after choosing
  Resume or Stop here.
* Save files from Full storage over very long simulations can reach tens of MB uncompressed (exports
  are gzipped).
* Adding clubs to an existing world (future expansions) will need a save migration, because history
  snapshots are stored as arrays parallel to the club list.
* Crest images are not in the repository for licensing reasons (see README).
* The UI is designed desktop-first. It works at phone width, but dense tables scroll horizontally
  inside their cards.
