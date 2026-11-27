# Audit of version 0.4.3

This audit reviewed the supplied 0.4.3 build (`index.html`, `database.json`, `calibration-test.js`,
`CALIBRATION.txt`) before the rebuild started. It was used as reference, not as a foundation.

## Engine

| Finding | Effect | Rebuild |
|---|---|---|
| All randomness used unseeded `Math.random` | Runs could not be reproduced; the calibration results cannot be re-run or audited exactly | Single seeded, serialisable PRNG; determinism is tested |
| Each match shared a fixed total of 2.65 expected goals, split by a logistic of the strength gap | Mismatches did not produce more goals in total; the scoreline structure was unrealistic | Independent attack-vs-defence Poisson means with Dixon–Coles correction, fitted to real goals |
| Attack, midfield and defence were averaged into one number for matches | The three attributes had no distinct effect | Attack and defence powers drive each side's goals; midfield contributes to both |
| The "upsets" setting added a random tilt to a share of matches | A crude, non-calibrated randomness knob | Calibrated per-match log-normal noise; the setting scales it |
| Squad strength was weighted 90/10 with an absolute `formEstimate` | Lower-division form inflated strength (Problem I) | Form is relative (50 = as expected), opposition-adjusted, capped at ±1.5 and decaying |
| Two-legged ties: a level aggregate was settled by coin flip, with no extra time | Incorrect rules | Extra time in the second leg, then a simulated shoot-out |
| League tiebreak: points, GD, GF, name | Alphabetical order decided ties | GD, GF, head-to-head, then a seeded drawing of lots |
| Fixtures mapped onto 46 "days" for all divisions | Premier League rounds were squeezed into an EFL-length calendar; cups were interleaved crudely | Real calendar with dated slots; cups and play-offs scheduled; no clashes (tested) |
| Evolution target `base(division)·0.45 + reputation·0.55`, with surprise based on `formEstimate` order | Division economics and reputation dominated; giants were either frozen or collapsed depending on tuning (Problems D–G) | Rank-based economics, slow reputation, stability-damped development cycles, title fatigue; calibrated |

## Data

* 116 clubs with plausible 2026/27 divisions. The rebuild verified every one (see DATA-SOURCES.md);
  all were correct.
* Ratings were "65% estimated quality baseline, 35% standings-rank proxy" with generic lower-tier
  baselines. **Stability was 60 for every club.**
* Form estimates were high for clubs with strong 2025/26 seasons in weaker divisions (e.g. Hull 83,
  Coventry 82 in the Premier League). This was a direct cause of Problems H/I.
* Rule gap: the Championship play-off was still four teams. It is six from 2026/27.
* FA Cup: generic external qualifiers and only part of the National League entered properly.
  EFL Cup: no byes and no regional draw.

## UI and assets

* One 815 KB HTML file holding the engine, UI and base64 crests (7.7 MB before WebP conversion).
* No persistent saves. Refreshing the page lost the world.
* Simulation ran on the main thread with a full re-render.

## Calibration

* Seven combinations were screened. Testing covered 3,710 seasons, with rendering and match logging
  disabled. That was a reasonable start, but the runs used unseeded randomness and were not repeatable.
* The reported problems (initial promoted survival 30.7%, long-term promoted survival 65.5%, 2.8% of
  promoted clubs in the top four, a five-title streak) are all addressed in the rebuild's calibration;
  see CALIBRATION.md for the comparison.
