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

## Administration (0.7, optional)

* Off by default: on fresh holdout seeds it improved the combined and 50-year scores but worsened the 100-year group
  (more turnover among each era's giants), which failed the pre-registered rule.
* The frequency target blends eras (about one per season; real: 3.5 per season in the 2000s, 0.7 since 2010). The rate does
  not change over time.
* Risk weights for ownership, stability and relegation are judgements. Deductions apply in the season of administration
  only; CVA sanctions, expulsions, liquidations and profit-and-sustainability deductions are not modelled. The 12-point EFL
  rule's start date (2015/16) is not confirmed by the downloaded source.
* Clubs that were in administration at the 2026/27 start (e.g. Sheffield Wednesday) start without a pending deduction.

## Stories and rivalries

* In-season positions used by stories (lead changes, collapses, great escapes) rank by points, goal difference
  and goals scored only. Final positions use the full tiebreakers.
* Story thresholds (e.g. 6 lead changes, 20-game unbeaten runs in the top flight) are judgements, chosen so a
  typical season produces a handful of stories.
* The derby list is a curated set of well-known pairs, not exhaustive. Head-to-head totals in saves upgraded from
  an earlier version count from the upgrade season only. Individual meetings are listed only where stored
  (derbies and cup ties at Standard, league games at Full).

## Sandbox and the 1992/93 start

* The 1992 world was tested out of sample against real 1992/93–2024/25 outcomes and given its own economic path
  (0.7, CALIBRATION.md "0.7: the 1992/93 start"): it now uses the fitted 2025/26 spread of money by pyramid rank from
  its first season. It is still more open than the Premier League era: about 11 different champions in its first 33
  seasons (real: 7), a weaker dominant club, champion points about 82 per 38 games (real: 87), and 13–17 champions in
  60 seasons (a 2026 world: about 12). Treat it as a calibrated sandbox, not a reconstruction.
* Because the Conference is the bottom of the playable pyramid, almost every 1992 Conference club reaches the Football
  League within 33 seasons (about 18 of 22; real: 6).
* Rules change over time as dated configuration (0.7): the 1995 cut to 20 clubs, Conference relegation, two up/two
  down from 2002/03, renamings and later play-off formats. Not modelled: ground-criteria refusals of Conference
  promotion (1993/94–1995/96), the Conference's growth to 24 and the sixth tier below it, FA Cup replays, and later
  League Cup format changes (COMPETITIONS.md). A 1992 world therefore has 114 clubs in 2026, not 116.
* Conference clubs are rated from 1988/89–1991/92 results and tables on Wikipedia; their starting form is neutral.
* 1992 worlds saved before 0.7 keep the frozen 1992/93 rules (92 clubs) they were created with.
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
  previous top 7; FA Cup qualifiers are generic and earlier qualifying rounds are not simulated; points
  deductions exist only for administration (optional); there are no deciding play-off matches for level points.
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
