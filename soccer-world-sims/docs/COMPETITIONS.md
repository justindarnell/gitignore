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
