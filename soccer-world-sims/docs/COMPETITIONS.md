# Competition rules and simplifications

All rules live in `src/data/england/config.ts`.

## Leagues

| Division | Clubs | Games | Promotion | Play-offs | Relegation |
|---|---:|---:|---|---|---|
| Premier League | 20 | 38 | — | — | bottom 3 |
| Championship | 24 | 46 | top 2 | **3rd–8th (new for 2026/27)** | bottom 3 |
| League One | 24 | 46 | top 2 | 3rd–6th | bottom 4 |
| League Two | 24 | 46 | top 3 | 4th–7th | bottom 2 |
| National League | 24 | 46 | champions | 2nd–7th | none (bottom of the playable pyramid) |

* Win 3 points, draw 1. Tiebreakers in order: points, goal difference, goals scored, head-to-head
  points, head-to-head goal difference, head-to-head away goals, wins, then a seeded drawing of lots.
  This approximates the Premier League and EFL handbooks. The real leagues would hold a play-off match
  for a tie affecting the title, promotion or relegation, which is not simulated.
* Points deductions (administration, PSR breaches) are not simulated.

## Play-offs

| League | Format |
|---|---|
| Championship | Eliminators 5v8 and 6v7 (one leg, higher seed at home) → two-legged semi-finals (3rd v lowest remaining seed, 4th v the other; higher seed hosts the second leg) → final at a neutral venue |
| League One | 3v6 and 4v5, two legs → final |
| League Two | 4v7 and 5v6, two legs → final |
| National League | Eliminators 4v7 and 5v6 (one leg) → semi-finals hosted by 2nd and 3rd against the lowest/other remaining seed (one leg) → final |

Level aggregates go to extra time in the second leg, then penalties. Away goals do not count.

## FA Cup

| Round | Entrants |
|---|---|
| Fourth Qualifying Round | 24 National League clubs + 40 **non-playable qualifiers** (24 "Step 2", 16 "Step 3") |
| First Round | 32 winners + 48 League One and Two clubs |
| Second Round | 40 |
| Third Round | 20 winners + 44 Premier League and Championship clubs |
| Fourth, Fifth, Quarter-final | 32, 16, 8 |
| Semi-finals, Final | neutral venue |

* Draws are open and random; the first club drawn is at home.
* Replays were abolished from the First Round in 2024/25. Every round here uses extra time and
  penalties. **Simplification:** the real 4th qualifying round may still allow replays.
* Qualifiers are generic clubs from below the National League, named "Step 2 Qualifier 7" and so on,
  rated around 35 (Step 2) and 30 (Step 3) with small random variation. They are marked **Q** in the
  UI, are not clubs in the world, and are re-created each season. Earlier qualifying rounds are not
  simulated.

## EFL Cup

| Round | Entrants |
|---|---|
| First Round (regional North/South) | the 72 EFL clubs except the two best-placed clubs relegated from the Premier League |
| Second Round (regional) | 35 winners + those 2 byes + 13 Premier League clubs |
| Third Round | 25 winners + the previous season's **top 7** Premier League clubs |
| Fourth, Quarter-final | 16, 8 |
| Semi-finals | two legs |
| Final | neutral venue, extra time and penalties |

* No extra time before the final: drawn ties and level semi-final aggregates go straight to penalties.
* **Simplification:** in reality the clubs playing in Europe enter in Round Three. European
  competitions are not simulated, so the previous season's top seven are used as a stand-in. In season
  one this uses the real 2025/26 final table.
* Regions are approximate (`regions` in the config). An odd-sized section moves one club across.

## Squad rotation in cups

Higher-division clubs field rotated teams against lower-division opponents in early rounds. This is
modelled as a temporary rating penalty, scaled by round (`rotation` per round), by the club's own tier
(largest for Premier League clubs), and by the size of the gap between the two divisions.

## Calendar

The season runs from early August to late May. Week 0 is the first Saturday on or after 1 August.
Cup rounds have fixed weekends or midweeks, and leagues skip cup weekends for the divisions involved.
Play-offs follow the end of the regular season: National League in early May, EFL semi-finals in
mid-May, finals in late May, and the FA Cup final in mid-May.

## Historical start: 1992/93

A world can start from **1992/93**, the first Premier League season (`src/data/england/config1992.ts`,
country id `ENG1992`). The era's rules are configuration, with no engine special cases. Two generic
config options were added for it: `rating` on non-playable qualifiers and `awayGoals` on two-legged
cup rounds.

| Division | Clubs | Games | Promotion | Play-offs | Relegation |
|---|---:|---:|---|---|---|
| Premier League | 22 | 42 | — | — | bottom 3 |
| First Division | 24 | 46 | top 2 | 3rd–6th (two-legged semis, neutral final) | bottom 3 |
| Second Division | 24 | 46 | top 2 | 3rd–6th | bottom 4 |
| Third Division | 22 | 42 | top 3 | 4th–7th | **none** (see below) |

* **FA Cup**: the 46 Second and Third Division clubs enter the First Round with 26 non-playable
  non-league qualifiers (16 "Conference", rated 57; 10 "Non-league", rated 52). The Premier League and
  First Division enter in the Third Round (64 clubs). Qualifier ratings extrapolate the fitted 1992 tier gap
  one and two steps below the Third Division.
* **League Cup (Coca-Cola Cup)**: two-legged First Round (Second and Third Division plus the ten First
  Division clubs with the lowest previous standing: 56 clubs) and Second Round (plus the other 14 First
  Division clubs and the Premier League: 64 clubs); single-leg Third and Fourth Rounds and quarter-finals;
  two-legged semi-finals; neutral final. **Away goals** decide level two-legged ties, before and after
  extra time (away goals in extra time count).
* Cup squad-rotation values are the same as in the 2026/27 configuration.

**Differences from reality (documented simplifications):**
* The Conference is not playable, so the Third Division's bottom club is **not relegated** (in 1992/93
  one club went down to the Conference, and promotion from it depended on ground criteria).
* FA Cup **replays** existed in 1992/93. Here drawn ties go to extra time and penalties. The number of
  non-league clubs in the First Round (26) is chosen to give 64 clubs in the Third Round, because the engine
  does not model the qualifying rounds.
* The League Cup Round One/Two split is approximated by previous standing.
* Tiebreakers are kept as in 2026/27 (goal difference first). The early-1990s Football League order has
  not been verified.
* The rules stay as in 1992/93 for the whole simulation. The Premier League's cut to 20 clubs (1995), the
  later three-up/three-down changes and the six-team Championship play-off are not applied over time.
